import Link from "next/link";
import type { ReactNode } from "react";
import { AdminFrame, Wordmark, quiet } from "@/components/admin/marks";
import { requireStaff } from "@/lib/staff/gate";
import { can, type Capability } from "@/lib/staff/roles";
import { signOut } from "./actions";

const NAV: readonly { readonly href: string; readonly label: string; readonly capability: Capability }[] = [
  { href: "/admin", label: "Dashboard", capability: "dashboard.read" },
  { href: "/admin/records", label: "Records", capability: "dashboard.read" },
  { href: "/admin/copy", label: "Copy", capability: "copy.edit" },
  { href: "/admin/staff", label: "Staff", capability: "users.manage" },
  { href: "/admin/activity", label: "Activity", capability: "activity.read" },
];

export default async function ConsoleLayout({ children }: { children: ReactNode }) {
  const staff = await requireStaff("dashboard.read");
  return (
    <AdminFrame>
      <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <Wordmark />
          <p className="mt-1 text-sm text-black/60">{staff.email}</p>
        </div>
        <nav className="flex flex-wrap items-center gap-2">
          {NAV.filter((item) => can(staff.role, item.capability)).map((item) => (
            <Link key={item.href} className={quiet} href={item.href}>{item.label}</Link>
          ))}
          <form action={signOut}>
            <button className={quiet} type="submit">Sign out</button>
          </form>
        </nav>
      </header>
      {children}
    </AdminFrame>
  );
}
