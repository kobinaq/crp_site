import type { Metadata } from "next";
import { DashboardView } from "@/components/admin/DashboardView";
import { loadDashboard } from "@/lib/admin/dashboard";
import { weeklyIntake } from "@/lib/admin/weeks";
import { getDb } from "@/lib/db";
import { requireStaff } from "@/lib/staff/gate";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  await requireStaff("dashboard.read");
  const params = await searchParams;
  const db = getDb();
  const [data, weeks] = await Promise.all([loadDashboard(db), weeklyIntake(db, "applicants")]);
  return <DashboardView data={data} denied={params.denied === "1"} weeks={weeks} />;
}
