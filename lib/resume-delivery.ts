import { and, eq, isNull } from "drizzle-orm";
import { accessTokens, jobs, type Db } from "@/lib/db";
import { issueAccessToken, RESUME_TOKEN_TTL_SECONDS } from "@/lib/access";
import { appUrl } from "@/lib/config";
import { loadEmailSources } from "@/lib/copy/read";
import { applicationEmail, resumeEmail } from "@/lib/emails";
import type { EmailJobPayload, Job } from "@/lib/jobs";

// Persist the rendered email before sending so every retry uses identical bytes
// and the same provider idempotency key. Start/refresh its lifetime at delivery.
export async function prepareResumeEmail(db: Db, job: Job): Promise<EmailJobPayload | null> {
  const sources = await loadEmailSources();
  return db.transaction(async (tx) => {
    const [current] = await tx.select().from(jobs).where(and(eq(jobs.id, job.id), eq(jobs.lockToken, job.lockToken!))).for("update");
    if (!current || !current.applicantId) return null;
    let payload = current.payload;
    let tokenHash = typeof payload.tokenHash === "string" ? payload.tokenHash : null;
    if (!payload.html) {
      const token = await issueAccessToken(tx, current.applicantId, "resume", RESUME_TOKEN_TTL_SECONDS);
      tokenHash = token.hash;
      const link = `${appUrl()}/api/apply/resume?token=${encodeURIComponent(token.raw)}&lang=${payload.language === "fr" ? "fr" : payload.language === "es" ? "es" : "en"}`;
      const render = payload.template === "application" ? applicationEmail : resumeEmail;
      payload = { ...payload, ...render(String(payload.name), link, payload.language === "fr" ? "fr" : payload.language === "es" ? "es" : "en", sources), tokenHash };
      await tx.update(jobs).set({ payload }).where(eq(jobs.id, current.id));
    }
    // Compatibility with recovery emails queued before this change.
    tokenHash ??= current.dedupeKey.slice("email:resume:".length);
    const renewed = await tx.update(accessTokens)
      .set({ expiresAt: new Date(Date.now() + RESUME_TOKEN_TTL_SECONDS * 1000) })
      .where(and(eq(accessTokens.hash, tokenHash), eq(accessTokens.applicantId, current.applicantId), isNull(accessTokens.usedAt)))
      .returning({ hash: accessTokens.hash });
    return renewed.length ? payload as EmailJobPayload : null;
  });
}
