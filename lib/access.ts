import { createHash, randomBytes } from "crypto";
import { and, eq, gt, isNull, lt, sql } from "drizzle-orm";
import { accessTokens, type Store } from "@/lib/db";

export type TokenPurpose = "resume" | "switch_online";

export const RESUME_TOKEN_TTL_SECONDS = 60 * 30;

export function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

// The access-token table stores only a hash. The private email outbox holds the
// rendered link so delivery retries can reuse the same message.
export async function issueAccessToken(
  tx: Store,
  applicantId: string,
  purpose: TokenPurpose,
  ttlSeconds: number,
): Promise<{ raw: string; hash: string; expiresAt: Date }> {
  const raw = randomBytes(32).toString("base64url");
  const hash = hashToken(raw);
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
  await tx.insert(accessTokens).values({ hash, applicantId, purpose, expiresAt });
  return { raw, hash, expiresAt };
}

// Marks the token used and returns its applicant, or null if it is unknown,
// expired, for another purpose, or already spent. The conditional update is
// atomic, so two clicks on the same link cannot both succeed.
export async function consumeAccessToken(tx: Store, raw: string, purpose: TokenPurpose): Promise<string | null> {
  if (!raw || raw.length > 200) return null;
  const [row] = await tx
    .update(accessTokens)
    .set({ usedAt: new Date() })
    .where(and(
      eq(accessTokens.hash, hashToken(raw)),
      eq(accessTokens.purpose, purpose),
      isNull(accessTokens.usedAt),
      gt(accessTokens.expiresAt, new Date()),
    ))
    .returning({ applicantId: accessTokens.applicantId });
  return row?.applicantId ?? null;
}

// For sign-in links (the application email's button). Mail scanners often
// open links before the person does, so a genuine link keeps working until it
// expires: the first open stamps used_at, a reopen within the lifetime
// redeems it again (and the caller rotates the session, so only the latest
// opener stays signed in). Unknown, expired, or other-purpose tokens give null.
export async function redeemAccessToken(tx: Store, raw: string, purpose: TokenPurpose): Promise<string | null> {
  if (!raw || raw.length > 200) return null;
  const [row] = await tx
    .update(accessTokens)
    .set({ usedAt: sql`coalesce(${accessTokens.usedAt}, now())` })
    .where(and(
      eq(accessTokens.hash, hashToken(raw)),
      eq(accessTokens.purpose, purpose),
      gt(accessTokens.expiresAt, new Date()),
    ))
    .returning({ applicantId: accessTokens.applicantId });
  return row?.applicantId ?? null;
}

export async function purgeExpiredTokens(db: Store): Promise<void> {
  await db.delete(accessTokens).where(lt(accessTokens.expiresAt, new Date(Date.now() - 24 * 3600 * 1000)));
}
