import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { DashboardView } from "@/components/admin/DashboardView";
import { dashboardAccess, hasDashboard, loadDashboard } from "@/lib/admin/dashboard";
import { weeklyIntake } from "@/lib/admin/weeks";
import { getDb } from "@/lib/db";
import { requireStaff } from "@/lib/staff/gate";
import { can } from "@/lib/staff/roles";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const staff = await requireStaff("dashboard.read");
  const access = dashboardAccess(staff.role);
  // Editors have no records to summarise: their home is the website text.
  if (!hasDashboard(access)) {
    if (can(staff.role, "copy.edit")) redirect("/admin/copy");
    notFound();
  }
  const db = getDb();
  const [data, weeks] = await Promise.all([
    loadDashboard(db, staff.role),
    access.applicants ? weeklyIntake(db, "applicants") : Promise.resolve([]),
  ]);
  return <DashboardView data={data} weeks={weeks} />;
}
