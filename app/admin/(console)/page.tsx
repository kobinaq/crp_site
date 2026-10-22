import { DashboardView } from "@/components/admin/DashboardView";
import { loadDashboard } from "@/lib/admin/dashboard";
import { getDb } from "@/lib/db";
import { requireStaff } from "@/lib/staff/gate";

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  await requireStaff("dashboard.read");
  const params = await searchParams;
  const data = await loadDashboard(getDb());
  return <DashboardView data={data} denied={params.denied === "1"} />;
}
