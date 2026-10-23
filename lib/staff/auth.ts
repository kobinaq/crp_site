import { randomBytes } from "crypto";
import { and, eq, gt, isNull, lt } from "drizzle-orm";
import { hashToken } from "@/lib/access";
import { signInTokens, userSessions, users, type Db, type Store, type Tx } from "@/lib/db";
import { staffSignInEmail } from "@/lib/emails";
import { can, isUserRole, type UserRole } from "@/lib/staff/roles";
import { isUserId, parseEmail, resolveSignIn, type UserId } from "@/lib/staff/users";

export const STAFF_COOKIE = "crp_staff";
export const SIGN_IN_TTL_MS = 15 * 60 * 1000;
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

export type Staff = {
  id: UserId;
  email: string;
  role: UserRole;
  name: string | null;
};

declare const staffProof: unique symbol;
export type StaffGrant<C extends string> = Staff & { readonly [staffProof]: C };

export function staffCookieOptions(secure: boolean) {
  return {
    httpOnly: true as const,
    sameSite: "lax" as const,
    secure,
    path: "/admin",
    maxAge: SESSION_TTL_MS / 1000,
  };
}

export function staffLinkHtml(link: string, role: UserRole | null): string {
  return staffSignInEmail(link, role).html;
}

export async function issueSignInLink(db: Db | Tx, email: string): Promise<{ raw: string; hash: string } | null> {
  const user = await resolveSignIn(db, email);
  if (!user) return null;
  const raw = randomBytes(32).toString("base64url");
  const hash = hashToken(raw);
  await db.insert(signInTokens).values({
    hash,
    email,
    expiresAt: new Date(Date.now() + SIGN_IN_TTL_MS),
  });
  return { raw, hash };
}

// Spends the link with one conditional update. A second POST finds the row
// already used and gets nothing. Opening the mail does not call this.
export async function redeemSignInLink(db: Store, raw: string): Promise<{ session: string; userId: string } | null> {
  if (!raw || raw.length > 200) return null;
  const [spent] = await db
    .update(signInTokens)
    .set({ usedAt: new Date() })
    .where(and(eq(signInTokens.hash, hashToken(raw)), isNull(signInTokens.usedAt), gt(signInTokens.expiresAt, new Date())))
    .returning({ email: signInTokens.email });
  if (!spent) return null;
  const email = parseEmail(spent.email);
  if (!email) return null;
  const [user] = await db
    .select({ id: users.id, role: users.role, disabledAt: users.disabledAt })
    .from(users)
    .where(eq(users.email, email));
  if (!user || user.disabledAt || !can(user.role, "dashboard.read")) return null;
  const session = randomBytes(32).toString("base64url");
  await db.insert(userSessions).values({
    hash: hashToken(session),
    userId: user.id,
    expiresAt: new Date(Date.now() + SESSION_TTL_MS),
  });
  await db.update(users).set({ lastSignInAt: new Date() }).where(eq(users.id, user.id));
  return { session, userId: user.id };
}

// disabled_at is read here, not copied onto the session, so a disable takes
// effect on the next request.
export async function readStaff(db: Store, raw: string | undefined | null): Promise<Staff | null> {
  if (!raw || raw.length > 200) return null;
  const [row] = await db
    .select({
      id: users.id,
      email: users.email,
      role: users.role,
      name: users.name,
      disabledAt: users.disabledAt,
    })
    .from(userSessions)
    .innerJoin(users, eq(users.id, userSessions.userId))
    .where(and(eq(userSessions.hash, hashToken(raw)), gt(userSessions.expiresAt, new Date())));
  if (!row || row.disabledAt || !isUserRole(row.role) || !can(row.role, "dashboard.read") || !isUserId(row.id)) return null;
  return { id: row.id, email: row.email, role: row.role, name: row.name };
}

export async function revokeSession(db: Store, raw: string | undefined | null): Promise<void> {
  if (!raw) return;
  await db.delete(userSessions).where(eq(userSessions.hash, hashToken(raw)));
}

export async function purgeExpiredSignIns(db: Store): Promise<void> {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  await db.delete(signInTokens).where(lt(signInTokens.expiresAt, cutoff));
  await db.delete(userSessions).where(lt(userSessions.expiresAt, cutoff));
}
