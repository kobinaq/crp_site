import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { RecordsView } from "@/components/admin/RecordsView";
import { loadRecords, parseRecordQuery, readableLists } from "@/lib/admin/records";
import { getDb } from "@/lib/db";
import { requireStaff } from "@/lib/staff/gate";
import { can } from "@/lib/staff/roles";

export const metadata: Metadata = { title: "Records" };

export default async function RecordsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const staff = await requireStaff("dashboard.read");
  const lists = readableLists(staff.role);
  if (lists.length === 0) notFound();
  const params = await searchParams;
  const asked = parseRecordQuery(params);
  // No list asked for: open the first one this role may read. A list asked for
  // by name that this role may not read does not exist for them.
  if (!lists.includes(asked.list) && params.list !== undefined) notFound();
  const query = lists.includes(asked.list) ? asked : { ...asked, list: lists[0] };
  const data = await loadRecords(getDb(), query, staff);
  return <RecordsView data={data} lists={lists} exportable={can(staff.role, "records.export")} canConfirm={can(staff.role, "decisions.confirm")} />;
}
