import { RecordsView } from "@/components/admin/RecordsView";
import { loadRecords, parseRecordQuery } from "@/lib/admin/records";
import { getDb } from "@/lib/db";
import { requireStaff } from "@/lib/staff/gate";
import { can } from "@/lib/staff/roles";

export default async function RecordsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const staff = await requireStaff("dashboard.read");
  const params = await searchParams;
  const data = await loadRecords(getDb(), parseRecordQuery(params), staff);
  return <RecordsView data={data} exportable={can(staff.role, "records.export")} canConfirm={can(staff.role, "decisions.confirm")} />;
}
