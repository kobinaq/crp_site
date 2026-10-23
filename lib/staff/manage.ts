import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { recordEvent, type AdminEvent } from "@/lib/admin/events";
import { appUrl } from "@/lib/config";
import { signInTokens, userSessions, users, type Db, type Tx } from "@/lib/db";
import { deliverEmail } from "@/lib/email";
import { rateLimit } from "@/lib/rate-limit";
import { staffSignInEmail } from "@/lib/emails";
import { issueSignInLink, type StaffGrant } from "@/lib/staff/auth";
import { can, isUserRole, type UserRole } from "@/lib/staff/roles";
import { isUserId, type Email, type UserId } from "@/lib/staff/users";
import { staffSignInLink } from "@/lib/staff/link";

export type StaffStatus = "invited" | "active" | "disabled";

export type StaffMember = {
  readonly id: UserId;
  readonly email: string;
  readonly role: UserRole | null;
  readonly storedRole: string;
  readonly status: StaffStatus;
  readonly createdAt: Date;
  readonly lastSignInAt: Date | null;
};

export async function listStaff(db: Db): Promise<readonly StaffMember[]> {
  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      role: users.role,
      disabledAt: users.disabledAt,
      createdAt: users.createdAt,
      lastSignInAt: users.lastSignInAt,
    })
    .from(users)
    .orderBy(asc(users.email));
  return rows.flatMap((row) => {
    if (!isUserId(row.id)) return [];
    const status: StaffStatus = row.disabledAt ? "disabled" : row.lastSignInAt ? "active" : "invited";
    return [{
      id: row.id,
      email: row.email,
      role: isUserRole(row.role) ? row.role : null,
      storedRole: row.role,
      status,
      createdAt: row.createdAt,
      lastSignInAt: row.lastSignInAt,
    }];
  })
    .sort((a, b) => Number(a.status === "disabled") - Number(b.status === "disabled") || a.email.localeCompare(b.email));
}

export type InviteMail =
  | { readonly kind: "sent" }
  | { readonly kind: "failed" }
  | { readonly kind: "skipped"; readonly devLink: string | null };

export type InviteOutcome =
  | { readonly kind: "invited"; readonly mail: InviteMail }
  | { readonly kind: "resent"; readonly mail: InviteMail }
  | { readonly kind: "refused"; readonly reason: "disabled" | "already-staff" | "rate-limited" }
  | { readonly kind: "refused"; readonly reason: "role-differs"; readonly role: string };

export async function inviteStaff(db: Db, actor: StaffGrant<"users.manage">, input: { readonly email: Email; readonly role: UserRole }): Promise<InviteOutcome> {
  const allowed = (await rateLimit("staff-invite:actor", actor.id, 30, 3600)) && (await rateLimit("staff-signin:email", input.email, 5, 3600));
  if (!allowed) return { kind: "refused", reason: "rate-limited" };
  const issued = await db.transaction((tx) => issueInvite(tx, actor.id, input));
  if (issued.kind === "refused") return issued;
  const link = staffSignInLink(appUrl(), issued.raw);
  const sent = await deliverEmail(
    { to: input.email, ...staffSignInEmail(link, input.role) },
    issued.hash,
  );
  const mail: InviteMail = !sent.ok
    ? { kind: "failed" }
    : sent.skipped
      ? { kind: "skipped", devLink: process.env.NODE_ENV === "production" ? null : link }
      : { kind: "sent" };
  return issued.kind === "fresh" ? { kind: "invited", mail } : { kind: "resent", mail };
}

type InviteIssue =
  | { readonly kind: "fresh" | "resent"; readonly raw: string; readonly hash: string }
  | { readonly kind: "refused"; readonly reason: "disabled" | "already-staff" }
  | { readonly kind: "refused"; readonly reason: "role-differs"; readonly role: string };

async function issueInvite(tx: Tx, actorId: UserId, input: { readonly email: Email; readonly role: UserRole }): Promise<InviteIssue> {
  const [inserted] = await tx
    .insert(users)
    .values({ email: input.email, role: input.role })
    .onConflictDoNothing({ target: users.email })
    .returning({ id: users.id });
  if (inserted) {
    await recordEvent(tx, actorId, { kind: "staff.invited", subject: inserted.id, email: input.email, role: input.role });
    const link = await issueSignInLink(tx, input.email);
    return link ? { kind: "fresh", raw: link.raw, hash: link.hash } : { kind: "refused", reason: "disabled" };
  }
  const [row] = await tx
    .select({ id: users.id, role: users.role, disabledAt: users.disabledAt, lastSignInAt: users.lastSignInAt })
    .from(users)
    .where(eq(users.email, input.email))
    .for("update");
  if (!row || row.disabledAt) return { kind: "refused", reason: "disabled" };
  if (row.role !== input.role) return { kind: "refused", reason: "role-differs", role: row.role };
  if (row.lastSignInAt) return { kind: "refused", reason: "already-staff" };
  const link = await issueSignInLink(tx, input.email);
  return link ? { kind: "resent", raw: link.raw, hash: link.hash } : { kind: "refused", reason: "disabled" };
}

export type StaffChange =
  | { readonly kind: "role"; readonly role: UserRole }
  | { readonly kind: "disable" }
  | { readonly kind: "enable" };

export type ChangeOutcome =
  | { readonly ok: true; readonly changed: boolean }
  | { readonly ok: false; readonly reason: "self" | "missing" | "forbidden" | "last-admin" };

type Locked = { readonly id: string; readonly email: string; readonly role: string; readonly disabledAt: Date | null };

export async function changeStaff(db: Db, actor: StaffGrant<"users.manage">, target: UserId, change: StaffChange): Promise<ChangeOutcome> {
  const now = new Date();
  return db.transaction(async (tx) => {
    const admins = await tx
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.role, "admin"), isNull(users.disabledAt)))
      .orderBy(asc(users.id))
      .for("update");
    const adminIds = admins.map((row) => row.id);
    const extra = [actor.id, target].filter((id) => !adminIds.includes(id)).sort();
    if (extra.length > 0) {
      await tx.select({ id: users.id }).from(users).where(inArray(users.id, extra)).orderBy(asc(users.id)).for("update");
    }
    const rows = await tx
      .select({ id: users.id, email: users.email, role: users.role, disabledAt: users.disabledAt })
      .from(users)
      .where(inArray(users.id, [actor.id, target]));
    const plan = planChange({
      actor: rows.find((row) => row.id === actor.id),
      target: rows.find((row) => row.id === target),
      enabledAdminIds: adminIds,
      change,
      now,
    });
    if (plan.kind === "refuse") return { ok: false, reason: plan.reason };
    if (plan.kind === "noop") return { ok: true, changed: false };
    await tx.update(users).set(plan.set).where(eq(users.id, target));
    if (plan.revoke && plan.email) {
      await tx.delete(userSessions).where(eq(userSessions.userId, target));
      await tx.update(signInTokens).set({ usedAt: now }).where(and(eq(signInTokens.email, plan.email), isNull(signInTokens.usedAt)));
    }
    await recordEvent(tx, actor.id, plan.event);
    return { ok: true, changed: true };
  });
}

type Plan =
  | { readonly kind: "refuse"; readonly reason: "self" | "missing" | "forbidden" | "last-admin" }
  | { readonly kind: "noop" }
  | { readonly kind: "apply"; readonly set: { role: UserRole } | { disabledAt: Date | null }; readonly revoke: boolean; readonly email: string; readonly event: AdminEvent };

function planChange(input: {
  actor: Locked | undefined;
  target: Locked | undefined;
  enabledAdminIds: readonly string[];
  change: StaffChange;
  now: Date;
}): Plan {
  const { actor, target, change, now } = input;
  if (!actor || actor.disabledAt || !can(actor.role, "users.manage")) return { kind: "refuse", reason: "forbidden" };
  if (!target) return { kind: "refuse", reason: "missing" };
  if (removesLastAdmin(target, input.enabledAdminIds, change)) return { kind: "refuse", reason: "last-admin" };
  if (actor.id === target.id) return { kind: "refuse", reason: "self" };
  if (change.kind === "role") {
    if (target.role === change.role) return { kind: "noop" };
    return {
      kind: "apply",
      set: { role: change.role },
      revoke: false,
      email: target.email,
      event: { kind: "staff.role", subject: target.id, email: target.email, from: target.role, to: change.role },
    };
  }
  if (change.kind === "disable") {
    if (target.disabledAt) return { kind: "noop" };
    return {
      kind: "apply",
      set: { disabledAt: now },
      revoke: true,
      email: target.email,
      event: { kind: "staff.disabled", subject: target.id, email: target.email },
    };
  }
  if (!target.disabledAt) return { kind: "noop" };
  return {
    kind: "apply",
    set: { disabledAt: null },
    revoke: false,
    email: target.email,
    event: { kind: "staff.enabled", subject: target.id, email: target.email },
  };
}

function removesLastAdmin(target: Locked, enabledAdminIds: readonly string[], change: StaffChange): boolean {
  if (target.disabledAt || target.role !== "admin") return false;
  const demote = change.kind === "disable" || (change.kind === "role" && change.role !== "admin");
  if (!demote) return false;
  return enabledAdminIds.filter((id) => id !== target.id).length === 0;
}
