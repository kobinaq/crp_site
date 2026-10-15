import { and, eq, gt, isNull, lt } from "drizzle-orm";
import { captureTokens, waitlist, interest, type Db, type Store } from "@/lib/db";
import { hashToken } from "@/lib/access";
import { waitlistEmail, interestEmail } from "@/lib/emails";
import { waitlistInput, interestInput, type WaitlistInput, type InterestInput } from "@/lib/capture";
import { enqueueEmail } from "@/lib/jobs";
import { recordChange } from "@/lib/sync-log";

// Waitlist and interest sign-ups are saved as final the moment they are
// submitted: no confirmation email, no token. A repeat submission of an
// address that is already on file changes nothing (so nobody can overwrite or
// resubscribe someone else's entry) and is not re-mailed.



async function insertWaitlist(tx: Store, input: WaitlistInput): Promise<boolean> {
  const { locale, ...fields } = input;
  const [row] = await tx.insert(waitlist).values(fields).onConflictDoNothing({ target: waitlist.email }).returning();
  if (!row) return false;
  await recordChange(tx, "waitlist", row.id, "insert", row);
  await enqueueEmail(tx, `email:waitlist:${row.id}`, { to: row.email, ...waitlistEmail(locale) }, "waitlist");
  return true;
}

async function insertInterest(tx: Store, input: InterestInput): Promise<boolean> {
  const { locale, ...fields } = input;
  const [row] = await tx.insert(interest).values(fields).onConflictDoNothing({ target: interest.email }).returning();
  if (!row) return false;
  await recordChange(tx, "interest", row.id, "insert", row);
  await enqueueEmail(tx, `email:interest:${row.id}`, { to: row.email, ...interestEmail(locale, row.name) }, "interest");
  return true;
}

// Returns true when a new entry was created, false when the address was already on file.
export function saveWaitlist(db: Db, input: WaitlistInput): Promise<boolean> {
  return db.transaction((tx) => insertWaitlist(tx, input));
}
export function saveInterest(db: Db, input: InterestInput): Promise<boolean> {
  return db.transaction((tx) => insertInterest(tx, input));
}

// Sign-ups made before confirmations were dropped may still be queued as a
// "capture_confirmation" email job. The worker saves them directly instead of
// mailing a link.
export async function saveQueuedCapture(db: Db, kind: unknown, input: unknown): Promise<boolean> {
  if (kind === "waitlist") return saveWaitlist(db, waitlistInput.parse(input));
  if (kind === "interest") return saveInterest(db, interestInput.parse(input));
  throw new Error("unknown capture kind");
}

// Links already sitting in inboxes from before the change: opening one saves
// the sign-up straight away (no interstitial). Returns false for an unknown,
// expired or already used link.
export async function confirmCapture(db: Db, raw: string): Promise<boolean> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(raw)) return false;
  return db.transaction(async (tx) => {
    const [token] = await tx.update(captureTokens).set({ usedAt: new Date() })
      .where(and(eq(captureTokens.hash, hashToken(raw)), isNull(captureTokens.usedAt), gt(captureTokens.expiresAt, new Date())))
      .returning();
    if (!token) return false;
    if (token.kind === "waitlist") await insertWaitlist(tx, waitlistInput.parse(token.payload));
    else if (token.kind === "interest") await insertInterest(tx, interestInput.parse(token.payload));
    else throw new Error("unknown capture kind");
    return true;
  });
}

export async function purgeCaptureTokens(db: Store) {
  await db.delete(captureTokens).where(lt(captureTokens.expiresAt, new Date(Date.now() - 24 * 3600_000)));
}
