import type { WeekCount } from "@/lib/admin/weeks";

export function WeekBars({ weeks }: { weeks: readonly WeekCount[] }) {
  const max = Math.max(1, ...weeks.map((week) => week.count));
  return (
    <div className="mt-4">
      <div className="flex h-36 items-end gap-1 overflow-x-auto" aria-hidden="true">
        {weeks.map((week) => (
          <div key={week.week} className="flex h-full w-6 shrink-0 flex-col justify-end" title={`${week.week}: ${week.count}`}>
            <div className="rounded-t bg-magenta" style={{ height: `${Math.max(week.count === 0 ? 0 : 8, Math.round((week.count / max) * 100))}%` }} />
          </div>
        ))}
      </div>
      <details className="mt-3">
        <summary className="cursor-pointer text-sm font-semibold">Weekly counts</summary>
        <table className="mt-2 w-full text-left text-sm">
          <thead>
            <tr>
              <th scope="col" className="pb-1 font-semibold">Week of</th>
              <th scope="col" className="pb-1 font-semibold">Count</th>
            </tr>
          </thead>
          <tbody>
            {weeks.map((week) => (
              <tr key={week.week}>
                <td className="border-t border-black/10 py-1 pr-4">{week.week}</td>
                <td className="border-t border-black/10 py-1">{week.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
