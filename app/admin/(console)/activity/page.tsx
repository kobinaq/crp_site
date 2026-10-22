import Link from "next/link";
import { card } from "@/components/admin/marks";
import { loadActivity, parseActivityCursor } from "@/lib/admin/activity";
import { getDb } from "@/lib/db";
import { requireStaff } from "@/lib/staff/gate";

export default async function ActivityPage({ searchParams }: { searchParams: Promise<{ at?: string; id?: string }> }) {
  await requireStaff("activity.read");
  const params = await searchParams;
  const page = await loadActivity(getDb(), parseActivityCursor(params.at, params.id));
  const next = page.next ? `/admin/activity?at=${encodeURIComponent(page.next.at)}&id=${encodeURIComponent(page.next.id)}` : null;
  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Activity</h1>
        <p className="mt-1 max-w-3xl text-sm leading-6 text-black/70">
          Staff changes, CSV exports, and copy publishes. Editors keep publish history on the copy desk. This page is for admins.
        </p>
      </div>
      <section className={card}>
        {page.rows.length === 0 ? <p className="text-sm text-black/60">No activity yet.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[40rem] text-left text-sm">
              <thead>
                <tr>
                  <th scope="col" className="pb-2 font-semibold">When</th>
                  <th scope="col" className="pb-2 font-semibold">Who</th>
                  <th scope="col" className="pb-2 font-semibold">What</th>
                </tr>
              </thead>
              <tbody>
                {page.rows.map((row) => (
                  <tr key={row.id}>
                    <td className="border-t border-black/10 py-2 pr-4">{row.at.slice(0, 16).replace("T", " ")}</td>
                    <td className="border-t border-black/10 py-2 pr-4">{row.actor}</td>
                    <td className="border-t border-black/10 py-2">{row.label}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {next ? <Link className="mt-4 inline-block text-sm font-semibold underline" href={next}>Older</Link> : null}
      </section>
    </div>
  );
}
