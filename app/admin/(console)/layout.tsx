import type { ReactNode } from "react";
import { AdminFrame } from "@/components/admin/marks";
import { AdminNav } from "@/components/admin/AdminNav";
import { countNewMessages } from "@/lib/contact/messages";
import { getDb } from "@/lib/db";
import { requireStaff } from "@/lib/staff/gate";
import { can, type Capability } from "@/lib/staff/roles";
import { signOut } from "./actions";

const NAV: readonly { readonly href: string; readonly label: string; readonly capability: Capability }[] = [
  { href: "/admin", label: "Dashboard", capability: "dashboard.read" },
  { href: "/admin/records", label: "Records", capability: "dashboard.read" },
  { href: "/admin/copy", label: "Website text", capability: "copy.edit" },
  { href: "/admin/staff", label: "Staff", capability: "users.manage" },
  { href: "/admin/activity", label: "Activity", capability: "activity.read" },
];

export default async function ConsoleLayout({ children }: { children: ReactNode }) {
  const staff = await requireStaff("dashboard.read");
  const messages = can(staff.role, "messages.read") ? await countNewMessages(getDb()) : 0;
  const items = NAV.filter((item) => can(staff.role, item.capability)).map((item) => ({
    href: item.href,
    label: item.label,
    badge: item.href === "/admin/records" && messages > 0 ? messages : undefined,
  }));
  return (
    <AdminFrame>
      <a href="#admin-main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-black focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white">
        Skip to content
      </a>
      <AdminNav email={staff.email} items={items} signOut={signOut} />
      <main id="admin-main">{children}</main>
    </AdminFrame>
  );
}
