import { eq } from "drizzle-orm";
import { recordEvent } from "@/lib/admin/events";
import { users, type Db, type Store, type Tx } from "@/lib/db";
import { can } from "@/lib/staff/roles";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

declare const emailBrand: unique symbol;
export type Email = string & { readonly [emailBrand]: "Email" };

declare const userIdBrand: unique symbol;
export type UserId = string & { readonly [userIdBrand]: "UserId" };

function isEmail(value: string): value is Email {
  return EMAIL.test(value) && value.length <= 200;
}

export function parseEmail(raw: string): Email | null {
  const email = raw.trim().toLowerCase();
  return isEmail(email) ? email : null;
}

export function isUserId(value: string): value is UserId {
  return UUID.test(value);
}

export function parseUserId(raw: string): UserId | null {
  return isUserId(raw) ? raw : null;
}

export function adminAllowlist(raw = process.env.ADMIN_EMAILS ?? ""): ReadonlySet<string> {
  const emails = raw.split(",").flatMap((part) => {
    const email = parseEmail(part);
    return email ? [email] : [];
  });
  return new Set(emails);
}

// The allowlist only creates an admin. It never promotes, demotes, or
// re-enables. Enabling a disabled account is a separate staff action.
function isTransaction(db: Db | Tx): db is Tx {
  return "nestedIndex" in db;
}

async function bootstrapAdmin(tx: Tx, email: string): Promise<{ id: string } | null> {
  const [row] = await tx
    .insert(users)
    .values({ email, role: "admin" })
    .onConflictDoNothing({ target: users.email })
    .returning({ id: users.id });
  if (!row || !isUserId(row.id)) return null;
  await recordEvent(tx, null, { kind: "staff.bootstrap", subject: row.id, email });
  return { id: row.id };
}

export async function resolveSignIn(
  db: Db | Tx,
  email: string,
  allowlist: ReadonlySet<string> = adminAllowlist(),
): Promise<{ id: string } | null> {
  const existing = await findUser(db, email);
  if (existing) return existing.disabledAt || !can(existing.role, "dashboard.read") ? null : { id: existing.id };
  if (!allowlist.has(email)) return null;
  const inserted = isTransaction(db) ? await bootstrapAdmin(db, email) : await db.transaction((tx) => bootstrapAdmin(tx, email));
  if (inserted) return inserted;
  const again = await findUser(db, email);
  if (!again || again.disabledAt || !can(again.role, "dashboard.read")) return null;
  return { id: again.id };
}

async function findUser(db: Store, email: string) {
  const [row] = await db
    .select({ id: users.id, role: users.role, disabledAt: users.disabledAt })
    .from(users)
    .where(eq(users.email, email));
  return row;
}
