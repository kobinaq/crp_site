import { createHash, createHmac, timingSafeEqual } from "crypto";
import { and, eq, isNull, lt, or } from "drizzle-orm";
import { applicants, jobs, webhookEvents, type Db, type JobPayload } from "@/lib/db";
import { decisionEmail, receivedEmail } from "@/lib/emails";
import { getIdentityProvider, type IdentityDecision } from "@/lib/identity";
import { enqueue, enqueueEmail } from "@/lib/jobs";
import { lockApplicant, transition, updateApplicant } from "@/lib/lifecycle";
import { applyVideoaskCompletion, scheduleIdentitySession } from "@/lib/application";
import { reconcileIdentity } from "@/lib/application-status";
import { issueAccessToken } from "@/lib/access";
import { appUrl } from "@/lib/config";
import { calendlyLink, parseCalendlyReference } from "@/lib/calendly";
import { isAllowedVideoaskForm } from "@/lib/videoask";

// Every verified webhook is written down before anything acts on it. The
// (provider, event key) pair is unique, so a redelivery is recognised and
// answered without a second processing run; a delivery whose processing fails
// stays on record and is retried by the worker.
export type WebhookProvider = "videoask" | "identity" | "resend" | "calendly";
export type WebhookEvent = typeof webhookEvents.$inferSelect;

export function bodyHash(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export async function recordWebhookEvent(
  db: Db,
  provider: WebhookProvider,
  eventKey: string,
  payload: JobPayload,
): Promise<{ id: string; duplicate: boolean }> {
  const [inserted] = await db
    .insert(webhookEvents)
    .values({ provider, eventKey, payload })
    .onConflictDoNothing({ target: [webhookEvents.provider, webhookEvents.eventKey] })
    .returning({ id: webhookEvents.id });
  if (inserted) return { id: inserted.id, duplicate: false };
  const [existing] = await db
    .select({ id: webhookEvents.id })
    .from(webhookEvents)
    .where(and(eq(webhookEvents.provider, provider), eq(webhookEvents.eventKey, eventKey)));
  return { id: existing.id, duplicate: true };
}

export type ProcessOutcome = { outcome: string; advanced?: boolean; status?: string };

// Runs the provider-specific handler in one transaction and stamps the event.
// Throws on infrastructure failure so the caller can queue a retry; a business
// refusal (unknown applicant, stale event) is a recorded outcome, not an error.
export async function processWebhookEvent(db: Db, eventId: string): Promise<ProcessOutcome> {
  return db.transaction(async (tx) => {
    const [event] = await tx.select().from(webhookEvents).where(eq(webhookEvents.id, eventId)).for("update");
    if (!event) return { outcome: "missing" };
    if (event.processedAt) return { outcome: event.outcome ?? "processed" };

    const result = await dispatch(tx, event);
    await tx.update(webhookEvents).set({ processedAt: new Date(), outcome: result.outcome }).where(eq(webhookEvents.id, eventId));
    return result;
  });
}

// Records the event, processes it, and on failure queues a retry so the HTTP
// answer is 202 and the provider does not need to redeliver.
export async function ingestWebhook(
  db: Db,
  provider: WebhookProvider,
  eventKey: string,
  payload: JobPayload,
): Promise<{ eventId: string; duplicate: boolean; result: ProcessOutcome | null; queued: boolean }> {
  const { id, duplicate } = await recordWebhookEvent(db, provider, eventKey, payload);
  if (duplicate) {
    const [row] = await db.select({ outcome: webhookEvents.outcome }).from(webhookEvents).where(eq(webhookEvents.id, id));
    return { eventId: id, duplicate: true, result: row?.outcome ? { outcome: row.outcome } : null, queued: false };
  }
  try {
    const result = await processWebhookEvent(db, id);
    return { eventId: id, duplicate: false, result, queued: false };
  } catch (err) {
    console.error(`[webhook:${provider}] processing failed; queued for retry`, err);
    await enqueue(db, { kind: "webhook", dedupeKey: `webhook:${id}`, payload: { eventId: id } });
    return { eventId: id, duplicate: false, result: null, queued: true };
  }
}

// Sweep for events that were recorded but never processed and have no retry
// job (e.g. the process died between the insert and the enqueue).
export async function requeueUnprocessedWebhooks(db: Db, olderThanMs = 5 * 60_000): Promise<number> {
  const stale = await db
    .select({ id: webhookEvents.id })
    .from(webhookEvents)
    .where(and(isNull(webhookEvents.processedAt), lt(webhookEvents.createdAt, new Date(Date.now() - olderThanMs))))
    .limit(100);
  let queued = 0;
  for (const { id } of stale) {
    if (await enqueue(db, { kind: "webhook", dedupeKey: `webhook:${id}`, payload: { eventId: id } })) queued++;
  }
  return queued;
}

type Tx = Parameters<typeof transition>[0];

async function dispatch(tx: Tx, event: WebhookEvent): Promise<ProcessOutcome> {
  switch (event.provider) {
    case "videoask":
      return processVideoask(tx, event.payload as VideoaskPayload);
    case "identity":
      return processIdentity(tx, event.payload as IdentityPayload);
    case "resend":
      return processResend(tx, event.payload as ResendPayload);
    case "calendly":
      return processCalendly(tx, event.payload as CalendlyPayload);
    default:
      return { outcome: `unknown provider ${event.provider}` };
  }
}

// --- VideoAsk -----------------------------------------------------------------

export type VideoaskPayload = { applicantId: string; formId: string; eventId: string };

async function processVideoask(tx: Tx, payload: VideoaskPayload): Promise<ProcessOutcome> {
  if (!isAllowedVideoaskForm(payload.formId)) return { outcome: "invalid form" };
  return applyVideoaskCompletion(tx, payload.applicantId);
}

// --- Identity provider --------------------------------------------------------

export type IdentityPayload = { body: unknown; headers: Record<string, string> };

const IDENTITY_STATUS: Record<IdentityDecision, "verified" | "failed" | "review" | "pending"> = {
  approved: "verified",
  declined: "failed",
  review: "review",
  pending: "pending",
};

async function processIdentity(tx: Tx, payload: IdentityPayload): Promise<ProcessOutcome> {
  const event = getIdentityProvider().parse(payload.body, new Headers(payload.headers));
  if (!event.reference && !event.sessionId) return { outcome: "missing reference" };

  let current = event.reference ? await lockApplicant(tx, event.reference) : undefined;
  if (!current && event.sessionId) {
    const [bySession] = await tx.select({ id: applicants.id }).from(applicants).where(eq(applicants.identitySessionId, event.sessionId));
    if (bySession) current = await lockApplicant(tx, bySession.id);
  }
  if (!current) return { outcome: "unknown applicant" };

  // After id_failed we clear the session so a retry can mint a new Didit link.
  // Ignore provider callbacks until that new session exists; otherwise a
  // redelivery of the dead session would write another decision.
  if (current.status === "id_failed" && !current.identitySessionId) {
    return { outcome: "no active session", status: current.status };
  }
  // A result for a session we did not issue (or an old, replaced session) is
  // not this applicant's result. Only the active session may write a decision.
  if (event.sessionId && current.identitySessionId && event.sessionId !== current.identitySessionId) {
    return { outcome: "session mismatch", status: current.status };
  }
  // Providers redeliver out of order. Never let an older event overwrite a newer one.
  if (event.occurredAt && current.identityEventAt && event.occurredAt < current.identityEventAt) {
    return { outcome: "stale", status: current.status };
  }

  await updateApplicant(tx, current.id, {
    identityStatus: IDENTITY_STATUS[event.decision],
    identityCheckedAt: new Date(),
    identityEventAt: event.occurredAt ?? new Date(),
    identitySessionId: current.identitySessionId ?? event.sessionId ?? undefined,
  });
  const advanced = await reconcileIdentity(tx, current.id);
  const [after] = await tx.select().from(applicants).where(eq(applicants.id, current.id));
  if (advanced && after.status === "under_review") {
    await enqueueEmail(tx, `email:received:${after.id}:${after.reviewCycle}`, {
      to: after.email,
      ...receivedEmail(after.fullName, after.language),
    }, "received", after.id);
    if (after.identitySessionId) {
      await enqueue(tx, {
        kind: "identity_documents",
        dedupeKey: `identity_documents:${after.id}:${after.identitySessionId}`,
        applicantId: after.id,
        payload: { applicantId: after.id, sessionId: after.identitySessionId },
      });
    }
  } else if (advanced && after.status === "id_failed") {
    await scheduleIdentitySession(tx, after.id, after.version);
  }
  return { outcome: `identity ${IDENTITY_STATUS[event.decision]}`, advanced, status: after.status };
}

// --- Resend delivery events ---------------------------------------------------

// Resend's payload: { type: "email.delivered", created_at, data: { email_id,
// from, to: [...], subject, created_at, ... } }. data.email_id is the id the
// send call returned, stored on the job as provider_id.
export type ResendPayload = { type?: unknown; created_at?: unknown; data?: { email_id?: unknown } };

async function processResend(tx: Tx, payload: ResendPayload): Promise<ProcessOutcome> {
  const emailId = typeof payload.data?.email_id === "string" ? payload.data.email_id : null;
  const type = typeof payload.type === "string" ? payload.type : "";
  if (!emailId || !type.startsWith("email.")) return { outcome: "ignored" };
  // The event's own created_at orders events; data.created_at is when the email
  // was created, shared by every event of that email, so it cannot order them.
  const parsed = typeof payload.created_at === "string" ? new Date(payload.created_at) : null;
  const at = parsed && !Number.isNaN(parsed.getTime()) ? parsed : new Date();
  const status = type.slice("email.".length);
  const rows = await tx
    .update(jobs)
    .set({ deliveryStatus: status, deliveryEventAt: at })
    .where(and(
      eq(jobs.providerId, emailId),
      or(isNull(jobs.deliveryEventAt), lt(jobs.deliveryEventAt, at)),
    ))
    .returning({ id: jobs.id });
  return { outcome: rows.length ? `delivery ${status}` : "no matching email" };
}

// --- Calendly ---------------------------------------------------------------

export type CalendlyPayload = { raw: string; signature: string | null };

function calendlySignatureOk(raw: string, header: string | null): boolean {
  const secret = process.env.CALENDLY_WEBHOOK_SIGNING_KEY;
  if (!secret || !header) return false;
  const parts = Object.fromEntries(header.split(",").map((part) => part.split("=", 2)));
  const timestamp = parts.t;
  const provided = parts.v1;
  if (!timestamp || !provided || Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;
  const expected = Buffer.from(createHmac("sha256", secret).update(`${timestamp}.${raw}`).digest("hex"));
  const given = Buffer.from(provided);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

async function processCalendly(tx: Tx, payload: CalendlyPayload): Promise<ProcessOutcome> {
  if (!calendlySignatureOk(payload.raw, payload.signature)) return { outcome: "invalid signature" };
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(payload.raw) as Record<string, unknown>;
  } catch {
    return { outcome: "invalid json" };
  }
  const data = body.payload as Record<string, unknown> | undefined;
  const tracking = data?.tracking as Record<string, unknown> | undefined;
  const email = typeof data?.email === "string" ? data.email.toLowerCase() : null;
  const applicantId = parseCalendlyReference(tracking?.utm_content);
  let current = applicantId ? await lockApplicant(tx, applicantId) : undefined;
  if (!current && email) {
    const [byEmail] = await tx.select({ id: applicants.id }).from(applicants).where(eq(applicants.email, email));
    if (byEmail) current = await lockApplicant(tx, byEmail.id);
  }
  if (!current) return { outcome: "unknown applicant" };
  if (body.event === "invitee.canceled") {
    await updateApplicant(tx, current.id, { interviewAt: null });
    return { outcome: "interview canceled", status: current.status };
  }
  if (body.event !== "invitee.created") return { outcome: "ignored", status: current.status };
  const event = data?.scheduled_event as Record<string, unknown> | undefined;
  const start = typeof event?.start_time === "string" ? new Date(event.start_time) : null;
  if (!start || Number.isNaN(start.getTime())) return { outcome: "missing interview time", status: current.status };
  await updateApplicant(tx, current.id, { interviewAt: start });
  return { outcome: "interview booked", status: current.status };
}

// --- Decision emails ----------------------------------------------------------
// Queued by the review-sheet endpoint on the transition into a status, keyed by
// applicant + status + version so a repeated poll never queues a repeat.

export async function queueDecisionEmail(
  tx: Tx,
  applicant: { id: string; email: string; language: "en" | "fr" | "es" },
  status: string,
  version: number,
): Promise<void> {
  let mail = null;
  switch (status) {
    case "rejected":
      mail = decisionEmail(status, null, applicant.language);
      break;
    case "online_offered": {
      const token = await issueAccessToken(tx, applicant.id, "switch_online", 7 * 24 * 3600);
      mail = decisionEmail(status, `${appUrl()}/api/apply/switch-online?token=${encodeURIComponent(token.raw)}&lang=${applicant.language}`, applicant.language);
      break;
    }
    case "accepted": {
      const [full] = await tx.select().from(applicants).where(eq(applicants.id, applicant.id));
      mail = decisionEmail(status, full ? calendlyLink(full) : null, applicant.language);
      break;
    }
    case "interview_yes": {
      mail = decisionEmail(status, null, applicant.language);
      break;
    }
  }
  if (!mail) return;
  await enqueueEmail(tx, `email:decision:${applicant.id}:${status}:${version}`, { to: applicant.email, ...mail }, `decision:${status}`, applicant.id);
}
