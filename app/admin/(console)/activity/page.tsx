import type { Metadata } from "next";
import { Button } from "@/components/admin/Button";
import { When } from "@/components/admin/When";
import { card } from "@/components/admin/marks";
import { loadActivity, parseActivityCursor } from "@/lib/admin/activity";
import { getDb } from "@/lib/db";
import { requireStaff } from "@/lib/staff/gate";

export const metadata: Metadata = { title: "Activity" };

export default async function ActivityPage({ searchParams }: { searchParams: Promise<{ at?: string; id?: string }> }) {
  await requireStaff("activity.read");
  const params = await searchParams;
  const page = await loadActivity(getDb(), parseActivityCursor(params.at, params.id));
  const next = page.next ? `/admin/activity?at=${encodeURIComponent(page.next.at)}&id=${encodeURIComponent(page.next.id)}` : null;
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Activity</h1>
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
                    <td className="border-t border-black/10 py-3 pr-4"><When stamp={row.at.slice(0, 16).replace("T", " ")} /></td>
                    <td className="border-t border-black/10 py-3 pr-4">{row.actor}</td>
                    <td className="border-t border-black/10 py-3">{row.label}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {next ? (
          <div className="mt-4">
            <Button href={next} variant="outline">Older</Button>
          </div>
        ) : null}
      </section>
    </div>
  );
}
