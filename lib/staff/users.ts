import { eq } from "drizzle-orm";
import { users, type Store } from "@/lib/db";
import { can } from "@/lib/staff/roles";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function parseEmail(raw: string): string | null {
  const email = raw.trim().toLowerCase();
  if (!EMAIL.test(email) || email.length > 200) return null;
  return email;
}

export function adminAllowlist(raw = process.env.ADMIN_EMAILS ?? ""): ReadonlySet<string> {
  const emails = raw.split(",").flatMap((part) => {
    const email = parseEmail(part);
    return email ? [email] : [];
  });
  return new Set(emails);
}

// The allowlist only creates an admin. It never promotes, demotes, or
// re-enables. A disabled account stays disabled until someone clears the
// column in SQL.
export async function resolveSignIn(
  db: Store,
  email: string,
  allowlist: ReadonlySet<string> = adminAllowlist(),
): Promise<{ id: string } | null> {
  const existing = await findUser(db, email);
  if (existing) return existing.disabledAt || !can(existing.role, "dashboard.read") ? null : { id: existing.id };
  if (!allowlist.has(email)) return null;
  const [inserted] = await db
    .insert(users)
    .values({ email, role: "admin" })
    .onConflictDoNothing({ target: users.email })
    .returning({ id: users.id });
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
