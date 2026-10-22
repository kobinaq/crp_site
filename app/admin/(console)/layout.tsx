import Link from "next/link";
import type { ReactNode } from "react";
import { AdminFrame, Wordmark, quiet } from "@/components/admin/marks";
import { requireStaff } from "@/lib/staff/gate";
import { can } from "@/lib/staff/roles";
import { signOut } from "./actions";

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
          <Link className={quiet} href="/admin">Dashboard</Link>
          {can(staff.role, "copy.edit") ? <Link className={quiet} href="/admin/copy">Copy</Link> : null}
          <form action={signOut}>
            <button className={quiet} type="submit">Sign out</button>
          </form>
        </nav>
      </header>
      {children}
    </AdminFrame>
  );
}
