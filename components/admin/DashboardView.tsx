import Link from "next/link";
import { card } from "@/components/admin/marks";
import { WeekBars } from "@/components/admin/WeekBars";
import type { Dashboard } from "@/lib/admin/dashboard";
import type { WeekCount } from "@/lib/admin/weeks";

function when(value: Date): string {
  return value.toISOString().slice(0, 16).replace("T", " ");
}

export function DashboardView({ data, denied, weeks }: { data: Dashboard; denied: boolean; weeks: readonly WeekCount[] }) {
  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Dashboard</h1>
        <p className="mt-1 text-sm text-black/60">{data.applicantTotal} applicants. Open a status to review that queue.</p>
        {denied ? <p className="mt-3 text-sm font-semibold text-magenta">That page is not available for your role.</p> : null}
      </div>
      <section className={card}>
        <h2 className="text-lg font-semibold">Pipeline</h2>
        <div className="mt-4 grid grid-cols-2 gap-3 desk:grid-cols-4">
          {data.pipeline.map((row) => (
            <Link key={row.status} href={`/admin/records?list=applicants&status=${row.status}`} className="rounded-3xl bg-cream px-4 py-3">
              <p className="text-2xl font-semibold">{row.count}</p>
              <p className="text-sm">{row.label}</p>
            </Link>
          ))}
        </div>
        {data.cycles.length > 0 ? (
          <p className="mt-4 text-sm text-black/70">
            Review cycles. {data.cycles.map((row) => `cycle ${row.cycle}: ${row.count}`).join(", ")}
          </p>
        ) : null}
        <h3 className="mt-6 text-base font-semibold">Applicants by week</h3>
        <WeekBars weeks={weeks} />
      </section>
      <section className="grid gap-6 desk:grid-cols-2">
        <CountCard title="Nominations" rows={data.nominations.counts} />
        <CountCard title="Waitlist" rows={data.waitlist.counts} />
        <article className={card}>
          <h2 className="text-lg font-semibold">Interest</h2>
          <p className="mt-2 text-3xl font-semibold">{data.interest.total}</p>
        </article>
        <article className={card}>
          <h2 className="text-lg font-semibold">Partner inquiries</h2>
          <p className="mt-2 text-3xl font-semibold">{data.partners.total}</p>
        </article>
        <AttentionCard title="Nominations needing attention" summary={data.nominationDesk} />
        <AttentionCard title="Partners needing attention" summary={data.partnerWorkflow} />
      </section>
      <Table title="Recent nominations" empty="No nominations yet." headers={["When", "Nominator", "Nominee", "Staff status"]} rows={data.nominations.recent.map((row) => [when(row.createdAt), row.nominatorName, row.nomineeName, row.status])} />
      <Table title="Recent interest" empty="No interest sign-ups yet." headers={["When", "Name", "Email", "Age", "Track"]} rows={data.interest.recent.map((row) => [when(row.createdAt), row.name ?? "", row.email, row.ageGroup, row.track ?? ""])} />
      <Table title="Recent waitlist" empty="No waitlist sign-ups yet." headers={["When", "Name", "Email", "Status"]} rows={data.waitlist.recent.map((row) => [when(row.createdAt), row.name ?? "", row.email, row.status])} />
      <Table title="Recent partner inquiries" empty="No partner inquiries yet." headers={["When", "Name", "Organization", "Support"]} rows={data.partners.recent.map((row) => [when(row.createdAt), row.name, row.organization, row.support])} />
    </div>
  );
}

function AttentionCard({ title, summary }: { title: string; summary: Dashboard["nominationDesk"] }) {
  return (
    <article className={card}>
      <h2 className="text-lg font-semibold">{title}</h2>
      <Link href={`/admin/records?list=${summary.list}&attention=needs`} className="mt-2 block text-3xl font-semibold">
        {summary.needsAttention}
      </Link>
      <ul className="mt-3 grid gap-2">
        {summary.counts.map((row) => (
          <li key={row.status}>
            <Link href={`/admin/records?list=${summary.list}&status=${row.status}`} className="flex items-center justify-between text-sm">
              <span>{row.label}</span>
              <span className="font-semibold">{row.count}</span>
            </Link>
          </li>
        ))}
      </ul>
    </article>
  );
}

function CountCard({ title, rows }: { title: string; rows: readonly { status: string; count: number }[] }) {
  return (
    <article className={card}>
      <h2 className="text-lg font-semibold">{title}</h2>
      <ul className="mt-3 grid gap-2">
        {rows.map((row) => (
          <li key={row.status} className="flex items-center justify-between text-sm">
            <span>{row.status}</span>
            <span className="font-semibold">{row.count}</span>
          </li>
        ))}
      </ul>
    </article>
  );
}

function Table({ title, headers, rows, empty }: { title: string; headers: string[]; rows: string[][]; empty: string }) {
  return (
    <section className={card}>
      <h2 className="text-lg font-semibold">{title}</h2>
      {rows.length === 0 ? <p className="mt-3 text-sm text-black/60">{empty}</p> : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[36rem] text-left text-sm">
            <thead>
              <tr>
                {headers.map((header) => <th key={header} scope="col" className="pb-2 font-semibold">{header}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={`${row[0]}-${index}`}>
                  {row.map((cell, cellIndex) => <td key={cellIndex} className="border-t border-black/10 py-2 pr-4">{cell}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
