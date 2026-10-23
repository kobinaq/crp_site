import { cookies, headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { readStaff, revokeSession, STAFF_COOKIE, staffCookieOptions, type Staff, type StaffGrant } from "@/lib/staff/auth";
import { staffSameOrigin } from "@/lib/staff/origin";
import { can, type Capability } from "@/lib/staff/roles";

export async function currentStaff(): Promise<Staff | null> {
  const jar = await cookies();
  return readStaff(getDb(), jar.get(STAFF_COOKIE)?.value);
}

export async function requireStaff<C extends Capability>(capability: C): Promise<StaffGrant<C>> {
  const staff = await currentStaff();
  if (!staff) redirect("/admin/sign-in");
  // A page a role cannot use does not exist for that role.
  if (!can(staff.role, capability)) notFound();
  return staff as StaffGrant<C>;
}

export async function setStaffCookie(raw: string): Promise<void> {
  const jar = await cookies();
  jar.set(STAFF_COOKIE, raw, staffCookieOptions(process.env.NODE_ENV === "production"));
}

export async function clearStaffCookie(): Promise<void> {
  const jar = await cookies();
  const raw = jar.get(STAFF_COOKIE)?.value;
  if (raw) await revokeSession(getDb(), raw);
  jar.delete({ name: STAFF_COOKIE, path: "/admin" });
}

export async function assertStaffAction<C extends Capability>(capability: C): Promise<StaffGrant<C> | null> {
  if (!staffSameOrigin(await headers())) return null;
  const staff = await currentStaff();
  if (!staff || !can(staff.role, capability)) return null;
  return staff as StaffGrant<C>;
}
