import { randomUUID } from "crypto";
import { and, asc, eq, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { getDb, jobs, type Db, type Store, type JobPayload } from "@/lib/db";

// Durable background work. A job is inserted in the same transaction as the
// record it belongs to (an applicant and its confirmation email commit together
// or not at all) and is then attempted by the cron worker until it succeeds,
// with exponential backoff, or until it is parked as `failed` for the team.
export type JobKind = "email" | "identity_session" | "webhook" | "identity_documents" | "videoask_media";
export type Job = typeof jobs.$inferSelect;

export type EmailJobPayload = { to: string; subject: string; html: string; template: string };
export type IdentitySessionJobPayload = { applicantId: string };
export type WebhookJobPayload = { eventId: string };
export type IdentityDocumentsJobPayload = { applicantId: string; sessionId: string | null };
export type VideoaskMediaJobPayload = { applicantId: string; questionId: string };

export type JobOutcome =
  | { status: "done"; providerId?: string | null; deliveryStatus?: string | null }
  | { status: "retry"; error: string }
  | { status: "failed"; error: string };

export type JobHandler = (job: Job, db: Db) => Promise<JobOutcome>;

export const MAX_ATTEMPTS = 8;
export const LOCK_SECONDS = 120;

// 30s, 1m, 2m, 4m, ... capped at an hour. Attempt counts start at 1.
export function backoffSeconds(attempts: number): number {
  return Math.min(3600, 30 * 2 ** Math.max(0, attempts - 1));
}

export type EnqueueInput = {
  kind: JobKind;
  dedupeKey: string;
  payload: JobPayload;
  applicantId?: string | null;
  availableAt?: Date;
};

// Idempotent: the dedupe key is unique, so re-running the same business step
// (a retried webhook, a repeated decision poll) never queues a second email.
export async function enqueue(tx: Store, input: EnqueueInput): Promise<boolean> {
  const inserted = await tx
    .insert(jobs)
    .values({
      kind: input.kind,
      dedupeKey: input.dedupeKey,
      payload: input.payload,
      applicantId: input.applicantId ?? null,
      availableAt: input.availableAt ?? new Date(),
    })
    .onConflictDoNothing({ target: jobs.dedupeKey })
    .returning({ id: jobs.id });
  return inserted.length > 0;
}

export async function enqueueEmail(
  tx: Store,
  dedupeKey: string,
  email: { to: string; subject: string; html: string },
  template: string,
  applicantId?: string | null,
): Promise<boolean> {
  const payload: EmailJobPayload = { ...email, template };
  return enqueue(tx, { kind: "email", dedupeKey, payload, applicantId });
}

// Claims up to `limit` due jobs with SKIP LOCKED so overlapping cron runs or
// several instances never take the same job. The lock expires on its own, so a
// worker that dies mid-job releases it without manual cleanup.
export async function claimJobs(db: Db, limit: number): Promise<Job[]> {
  const token = randomUUID();
  const now = new Date();
  const lockedUntil = new Date(now.getTime() + LOCK_SECONDS * 1000);
  return db.transaction(async (tx) => {
    const due = await tx
      .select({ id: jobs.id })
      .from(jobs)
      .where(and(
        inArray(jobs.status, ["pending", "running"]),
        lte(jobs.availableAt, now),
        or(isNull(jobs.lockedUntil), lte(jobs.lockedUntil, now)),
      ))
      .orderBy(asc(jobs.availableAt))
      .limit(limit)
      .for("update", { skipLocked: true });
    if (due.length === 0) return [];
    return tx
      .update(jobs)
      .set({
        status: "running",
        lockToken: token,
        lockedUntil,
        attempts: sql`${jobs.attempts} + 1`,
        firstAttemptAt: sql`coalesce(${jobs.firstAttemptAt}, now())`,
      })
      .where(inArray(jobs.id, due.map((j) => j.id)))
      .returning();
  });
}

// Writes the outcome back, but only while this worker still holds the lock; a
// slow worker whose lock expired must not clobber the retry that replaced it.
export async function settle(db: Store, job: Job, outcome: JobOutcome): Promise<void> {
  const owned = and(eq(jobs.id, job.id), eq(jobs.lockToken, job.lockToken as string));
  if (outcome.status === "done") {
    await db.update(jobs).set({
      status: "done",
      lockedUntil: null,
      lastError: null,
      providerId: outcome.providerId ?? null,
      deliveryStatus: outcome.deliveryStatus ?? null,
    }).where(owned);
    return;
  }
  const exhausted = outcome.status === "failed" || job.attempts >= MAX_ATTEMPTS;
  await db.update(jobs).set({
    status: exhausted ? "failed" : "pending",
    lockedUntil: null,
    lastError: outcome.error.slice(0, 2000),
    availableAt: exhausted ? job.availableAt : new Date(Date.now() + backoffSeconds(job.attempts) * 1000),
  }).where(owned);
}

export async function runClaimedJob(job: Job, handlers: Partial<Record<JobKind, JobHandler>>, db: Db): Promise<JobOutcome> {
  if (job.attempts > MAX_ATTEMPTS) return { status: "failed", error: "worker lease expired after final attempt" };
  if (job.kind === "email" && job.firstAttemptAt && Date.now() - job.firstAttemptAt.getTime() >= 23 * 3600_000) {
    return { status: "failed", error: "email delivery uncertain; reconcile with provider before sending again" };
  }
  const handler = handlers[job.kind as JobKind];
  if (!handler) return { status: "failed", error: `no handler for job kind ${job.kind}` };
  try {
    return await handler(job, db);
  } catch (err) {
    return { status: "retry", error: err instanceof Error ? err.message : String(err) };
  }
}

export type RunSummary = { claimed: number; done: number; retried: number; failed: number };

export async function runDueJobs(handlers: Partial<Record<JobKind, JobHandler>>, limit = 25, db = getDb()): Promise<RunSummary> {
  const summary: RunSummary = { claimed: 0, done: 0, retried: 0, failed: 0 };
  for (let i = 0; i < limit; i++) {
    // Start the lease only when this worker is ready to execute the job.
    const [job] = await claimJobs(db, 1);
    if (!job) break;
    summary.claimed++;
    const outcome = await runClaimedJob(job, handlers, db);
    await settle(db, job, outcome);
    if (outcome.status === "done") summary.done++;
    else if (outcome.status === "failed" || job.attempts >= MAX_ATTEMPTS) summary.failed++;
    else summary.retried++;
  }
  return summary;
}

// Ops action: put a parked job back in the queue with a fresh attempt budget.
export async function retryJob(db: Store, jobId: string): Promise<boolean> {
  const rows = await db
    .update(jobs)
    .set({ status: "pending", attempts: 0, availableAt: new Date(), lockedUntil: null, lockToken: null })
    .where(and(eq(jobs.id, jobId), inArray(jobs.status, ["failed", "pending", "running"])))
    .returning({ id: jobs.id });
  return rows.length > 0;
}
