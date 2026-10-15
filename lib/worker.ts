import { eq } from "drizzle-orm";
import { applicants, getDb, identityDocuments } from "@/lib/db";
import { put } from "@vercel/blob";
import { deliverEmail } from "@/lib/email";
import { provisionIdentitySession } from "@/lib/application";
import { purgeExpiredTokens } from "@/lib/access";
import { purgeExpiredRateLimits } from "@/lib/rate-limit";
import { purgeCaptureTokens, saveQueuedCapture } from "@/lib/capture-confirmation";
import { prepareResumeEmail } from "@/lib/resume-delivery";
import {
  runDueJobs,
  type EmailJobPayload,
  type IdentitySessionJobPayload,
  type IdentityDocumentsJobPayload,
  type JobHandler,
  type JobKind,
  type WebhookJobPayload,
} from "@/lib/jobs";
import { processWebhookEvent, requeueUnprocessedWebhooks } from "@/lib/webhooks";
import { fetchDiditDocuments } from "@/lib/identity";
import { recordChange } from "@/lib/sync-log";
import { applicantSyncRowWithDocuments } from "@/lib/sync";

// One handler per job kind. Handlers must be idempotent: the worker may run a
// job again after a crash or an expired lock, and dedupe keys only stop the same
// job being queued twice, not being attempted twice.
export const handlers: Record<JobKind, JobHandler> = {
  async email(job, db) {
    // Legacy: sign-ups queued for a confirmation email before confirmations
    // were dropped are saved directly (with their acknowledgement) instead.
    if (job.payload.template === "capture_confirmation") {
      const created = await saveQueuedCapture(db, job.payload.kind, job.payload.input);
      return { status: "done", providerId: null, deliveryStatus: created ? "saved without confirmation" : "already on file" };
    }
    const payload = ["resume", "application"].includes(String(job.payload.template)) ? await prepareResumeEmail(db, job) : job.payload as EmailJobPayload;
    if (!payload) return { status: "failed", error: "confirmation token unavailable or already used; request a new link" };
    const { to, subject, html } = payload;
    const result = await deliverEmail({ to, subject, html }, job.dedupeKey);
    if (result.ok) return { status: "done", providerId: result.id, deliveryStatus: result.skipped ? "skipped" : "accepted" };
    return { status: result.retryable ? "retry" : "failed", error: result.error };
  },

  async identity_session(job, db) {
    const { applicantId } = job.payload as IdentitySessionJobPayload;
    const result = await provisionIdentitySession(db, applicantId);
    if (result.url) return { status: "done", providerId: null, deliveryStatus: result.created ? "created" : "existing" };
    return { status: "retry", error: "identity provider did not return a session" };
  },

  async identity_documents(job, db) {
    const { applicantId, sessionId } = job.payload as IdentityDocumentsJobPayload;
    if (!sessionId) return { status: "failed", error: "identity session is missing" };
    const sources = await fetchDiditDocuments(sessionId);
    if (!sources.length) return { status: "retry", error: "Didit returned no identity documents" };
    for (const [index, source] of sources.entries()) {
      const response = await fetch(source.url);
      if (!response.ok) return { status: "retry", error: `identity document download failed: ${response.status}` };
      const body = Buffer.from(await response.arrayBuffer());
      const contentType = response.headers.get("content-type")?.split(";")[0] || "application/octet-stream";
      const extension = contentType.split("/")[1]?.replace(/[^a-z0-9]+/gi, "") || "bin";
      const pathname = `identity/${applicantId}/${source.kind}-${index}.${extension}`;
      await put(pathname, body, { access: "private", contentType, allowOverwrite: true });
      await db.insert(identityDocuments).values({
        applicantId,
        kind: source.kind,
        pathname,
        contentType,
        size: body.byteLength,
      }).onConflictDoUpdate({
        target: identityDocuments.pathname,
        set: { contentType, size: body.byteLength, fetchedAt: new Date() },
      });
    }
    const [applicant] = await db.select().from(applicants).where(eq(applicants.id, applicantId));
    const documents = await db.select({ id: identityDocuments.id }).from(identityDocuments)
      .where(eq(identityDocuments.applicantId, applicantId));
    if (applicant) {
      await recordChange(db, "applicants", applicantId, "update", applicantSyncRowWithDocuments(applicant, documents.map((document) => document.id)));
    }
    return { status: "done", deliveryStatus: `${sources.length} documents stored` };
  },

  async webhook(job, db) {
    const { eventId } = job.payload as WebhookJobPayload;
    const result = await processWebhookEvent(db, eventId);
    return { status: "done", deliveryStatus: result.outcome };
  },
};

// One cron tick: retry anything due, sweep for orphaned webhook events, and
// drop expired housekeeping rows.
export async function tick(limit = 25) {
  const db = getDb();
  const requeued = await requeueUnprocessedWebhooks(db);
  const jobs = await runDueJobs(handlers, limit, db);
  await purgeExpiredTokens(db);
  await purgeCaptureTokens(db);
  await purgeExpiredRateLimits(db);
  return { ...jobs, requeuedWebhooks: requeued };
}
