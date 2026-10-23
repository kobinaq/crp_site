import Link from "next/link";
import { Button, buttonClass } from "@/components/admin/Button";
import { When } from "@/components/admin/When";
import { card } from "@/components/admin/marks";
import { WeekBars } from "@/components/admin/WeekBars";
import type { Dashboard } from "@/lib/admin/dashboard";
import { ageLabel, intakeLabel, trackLabel, waitlistLabel } from "@/lib/admin/labels";
import { NEW_MESSAGE_STATUS, messagesListHref } from "@/lib/contact/model";
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
            <Link key={row.status} href={`/admin/records?list=applicants&status=${row.status}`} className="rounded-3xl border border-black/10 bg-white px-4 py-3 outline-none transition hover:bg-cream focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2">
              <p className="text-2xl font-semibold">{row.count}</p>
              <p className="text-sm">{row.label}</p>
            </Link>
          ))}
        </div>
        {data.cycles.some((row) => row.cycle > 0) ? (
          <p className="mt-4 text-sm text-black/70">
            Review cycles. {data.cycles.filter((row) => row.cycle > 0).map((row) => `Cycle ${row.cycle}: ${row.count}`).join(", ")}
          </p>
        ) : null}
        {data.cycles.some((row) => row.cycle === 0 && row.count > 0) ? (
          <p className="mt-2 text-sm text-black/60">
            {data.cycles.find((row) => row.cycle === 0)?.count} applicants have not entered a review cycle.
          </p>
        ) : null}
        <h3 className="mt-6 text-base font-semibold">Applicants by week</h3>
        <WeekBars weeks={weeks} />
      </section>
      <section className="grid gap-6 desk:grid-cols-2">
        <CountCard title="Nominations" href="/admin/records?list=nominations" rows={data.nominations.counts.map((row) => ({ ...row, label: intakeLabel(row.status) }))} />
        <CountCard title="Waitlist" href="/admin/records?list=waitlist" rows={data.waitlist.counts.map((row) => ({ ...row, label: waitlistLabel(row.status), href: `/admin/records?list=waitlist&status=${row.status}` }))} />
        <article className={card}>
          <h2 className="text-lg font-semibold">Interest</h2>
          <p className="mt-2 text-3xl font-semibold">{data.interest.total}</p>
          <Button className="mt-4" href="/admin/records?list=interest" variant="outline">Open interest</Button>
        </article>
        <article className={card}>
          <h2 className="text-lg font-semibold">Partner inquiries</h2>
          <p className="mt-2 text-3xl font-semibold">{data.partners.total}</p>
          <Button className="mt-4" href="/admin/records?list=partners" variant="outline">Open partners</Button>
        </article>
        <article className={card}>
          <h2 className="text-lg font-semibold">New messages</h2>
          <p className="mt-2 text-3xl font-semibold">{data.newMessages}</p>
          <Button className="mt-4" href={messagesListHref(NEW_MESSAGE_STATUS)} variant="outline">Open messages</Button>
        </article>
        <AttentionCard title="Nominations needing attention" summary={data.nominationDesk} />
        <AttentionCard title="Partners needing attention" summary={data.partnerWorkflow} />
      </section>
      <Table title="Recent nominations" empty="No nominations yet." headers={["When", "Nominator", "Nominee", "Staff status"]} rows={data.nominations.recent.map((row) => ({ href: `/admin/records/nominations/${row.id}`, cells: [when(row.createdAt), row.nominatorName, row.nomineeName, row.status] }))} />
      <Table title="Recent interest" empty="No interest sign-ups yet." headers={["When", "Name", "Email", "Age", "Track"]} rows={data.interest.recent.map((row) => ({ href: null, cells: [when(row.createdAt), row.name ?? "", row.email, ageLabel(row.ageGroup), row.track ? trackLabel(row.track) : ""] }))} />
      <Table title="Recent waitlist" empty="No waitlist sign-ups yet." headers={["When", "Name", "Email", "Status"]} rows={data.waitlist.recent.map((row) => ({ href: null, cells: [when(row.createdAt), row.name ?? "", row.email, waitlistLabel(row.status)] }))} />
      <Table title="Recent partner inquiries" empty="No partner inquiries yet." headers={["When", "Name", "Organization", "Support"]} rows={data.partners.recent.map((row) => ({ href: `/admin/records/partners/${row.id}`, cells: [when(row.createdAt), row.name, row.organization, row.support] }))} />
    </div>
  );
}

function AttentionCard({ title, summary }: { title: string; summary: Dashboard["nominationDesk"] }) {
  return (
    <article className={card}>
      <h2 className="text-lg font-semibold">{title}</h2>
            <Button className="mt-3" href={`/admin/records?list=${summary.list}&attention=needs`} variant="outline">
              {summary.needsAttention} need attention
            </Button>
      <ul className="mt-3 grid gap-2">
        {summary.counts.map((row) => (
          <li key={row.status}>
            <Link href={`/admin/records?list=${summary.list}&status=${row.status}`} className="flex items-center justify-between rounded-full border border-black/15 bg-white px-3 py-2 text-sm font-semibold outline-none hover:bg-cream focus-visible:ring-2 focus-visible:ring-black">
              <span>{row.label}</span>
              <span className="font-semibold">{row.count}</span>
            </Link>
          </li>
        ))}
      </ul>
    </article>
  );
}

function CountCard({
  title,
  href,
  rows,
}: {
  title: string;
  href: string;
  rows: readonly { status: string; count: number; label?: string; href?: string }[];
}) {
  return (
    <article className={card}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">{title}</h2>
        <Button href={href} variant="outline" size="sm">Open list</Button>
      </div>
      <ul className="mt-3 grid gap-2">
        {rows.map((row) => (
          <li key={row.status} className="flex items-center justify-between text-sm">
            {row.href ? <Link href={row.href} className={buttonClass("outline", "sm")}>{row.label ?? row.status}</Link> : <span>{row.label ?? row.status}</span>}
            <span className="font-semibold">{row.count}</span>
          </li>
        ))}
      </ul>
    </article>
  );
}

function Table({
  title,
  headers,
  rows,
  empty,
}: {
  title: string;
  headers: string[];
  rows: readonly { href: string | null; cells: readonly string[] }[];
  empty: string;
}) {
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
                <tr key={`${row.cells[0]}-${index}`} className={row.href ? "relative hover:bg-black/[0.03]" : undefined}>
                  {row.cells.map((cell, cellIndex) => (
                    <td key={cellIndex} className="border-t border-black/10 py-3 pr-4">
                      {cellIndex === 0 ? <When stamp={cell} /> : cellIndex === 1 && row.href ? (
                        <Link href={row.href} className="font-semibold after:absolute after:inset-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-inset">{cell}</Link>
                      ) : cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
