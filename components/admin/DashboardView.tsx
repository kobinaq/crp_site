import Link from "next/link";
import { Button, buttonClass } from "@/components/admin/Button";
import { When } from "@/components/admin/When";
import { card } from "@/components/admin/marks";
import { RowLink, linkedRowClass } from "@/components/admin/RowLink";
import { WeekBars } from "@/components/admin/WeekBars";
import type { Dashboard } from "@/lib/admin/dashboard";
import { ageLabel, intakeLabel, trackLabel, waitlistLabel } from "@/lib/admin/labels";
import { NEW_MESSAGE_STATUS, messagesListHref } from "@/lib/contact/model";
import type { WeekCount } from "@/lib/admin/weeks";
import { NEEDS_DECISION_STATUSES } from "@/lib/review/queue";

function when(value: Date): string {
  return value.toISOString().slice(0, 16).replace("T", " ");
}

export function DashboardView({ data, denied, weeks }: { data: Dashboard; denied: boolean; weeks: readonly WeekCount[] }) {
  const attention = attentionItems(data);
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Dashboard</h1>
        {denied ? <p className="mt-3 text-sm font-semibold text-magenta">You don&apos;t have access to that page.</p> : null}
      </div>
      <section className={card} aria-labelledby="needs-attention">
        <h2 id="needs-attention" className="text-lg font-semibold">Needs attention</h2>
        {attention.every((item) => item.count === 0) ? <p className="mt-3 text-sm text-black/60">All caught up.</p> : null}
        <ul className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 desk:grid-cols-4">
          {attention.map((item) => (
            <li key={item.label}>
              <Link
                href={item.href}
                className={`flex h-full flex-col rounded-3xl border px-4 py-3 outline-none transition hover:bg-cream focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2 ${item.count > 0 ? "border-black bg-lime/40" : "border-black/10 bg-white"}`}
              >
                <span className="text-3xl font-semibold">{item.count}</span>
                <span className="mt-1 text-sm font-semibold">{item.label}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
      <section className={card}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold">Applicants</h2>
          <p className="text-sm text-black/60">{data.applicantTotal} in total</p>
        </div>
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
            {data.cycles.filter((row) => row.cycle > 0).map((row) => `Review round ${row.cycle}: ${row.count}`).join(", ")}
          </p>
        ) : null}
        {data.cycles.some((row) => row.cycle === 0 && row.count > 0) ? (
          <p className="mt-2 text-sm text-black/60">
            {data.cycles.find((row) => row.cycle === 0)?.count} not in a review round.
          </p>
        ) : null}
        <h3 className="mt-6 text-base font-semibold">New applicants by week</h3>
        <WeekBars weeks={weeks} />
      </section>
      <section className="grid gap-6 desk:grid-cols-2">
        <AttentionCard title="Nominations" summary={data.nominationDesk} />
        <AttentionCard title="Partner inquiries" summary={data.partnerWorkflow} />
        <CountCard title="Nominees invited to apply" href="/admin/records?list=nominations" rows={data.nominations.counts.map((row) => ({ ...row, label: intakeLabel(row.status) }))} />
        <CountCard title="Waitlist" href="/admin/records?list=waitlist" rows={data.waitlist.counts.map((row) => ({ ...row, label: waitlistLabel(row.status), href: `/admin/records?list=waitlist&status=${row.status}` }))} />
        <article className={card}>
          <h2 className="text-lg font-semibold">Interest sign-ups</h2>
          <p className="mt-2 text-3xl font-semibold">{data.interest.total}</p>
          <Button className="mt-4" href="/admin/records?list=interest" variant="outline">Open list</Button>
        </article>
        <article className={card}>
          <h2 className="text-lg font-semibold">Partner inquiries in total</h2>
          <p className="mt-2 text-3xl font-semibold">{data.partners.total}</p>
          <Button className="mt-4" href="/admin/records?list=partners" variant="outline">Open list</Button>
        </article>
      </section>
      <Table title="Latest nominations" empty="No nominations yet." headers={["Received", "Nominated by", "Nominee", "Status"]} rows={data.nominations.recent.map((row) => ({ href: `/admin/records/nominations/${row.id}`, name: row.nomineeName, cells: [when(row.createdAt), row.nominatorName, row.nomineeName, row.status] }))} />
      <Table title="Latest partner inquiries" empty="No partner inquiries yet." headers={["Received", "Name", "Organization", "Support"]} rows={data.partners.recent.map((row) => ({ href: `/admin/records/partners/${row.id}`, name: row.name, cells: [when(row.createdAt), row.name, row.organization, row.support] }))} />
      <Table title="Latest interest sign-ups" empty="No interest sign-ups yet." headers={["Received", "Name", "Email", "Age", "Track"]} rows={data.interest.recent.map((row) => ({ href: null, name: row.name ?? row.email, cells: [when(row.createdAt), row.name ?? "", row.email, ageLabel(row.ageGroup), row.track ? trackLabel(row.track) : ""] }))} />
      <Table title="Latest waitlist sign-ups" empty="No waitlist sign-ups yet." headers={["Received", "Name", "Email", "Status"]} rows={data.waitlist.recent.map((row) => ({ href: null, name: row.name ?? row.email, cells: [when(row.createdAt), row.name ?? "", row.email, waitlistLabel(row.status)] }))} />
    </div>
  );
}

export function attentionItems(data: Dashboard): readonly { label: string; count: number; href: string }[] {
  const decide = data.pipeline.filter((row) => (NEEDS_DECISION_STATUSES as readonly string[]).includes(row.status)).reduce((sum, row) => sum + row.count, 0);
  return [
    { label: "Applicants waiting for a decision", count: decide, href: "/admin/records?list=applicants&queue=needs" },
    { label: "New messages", count: data.newMessages, href: messagesListHref(NEW_MESSAGE_STATUS) },
    { label: "Nominations to follow up", count: data.nominationDesk.needsAttention, href: `/admin/records?list=${data.nominationDesk.list}&attention=needs` },
    { label: "Partner inquiries to follow up", count: data.partnerWorkflow.needsAttention, href: `/admin/records?list=${data.partnerWorkflow.list}&attention=needs` },
  ];
}

function AttentionCard({ title, summary }: { title: string; summary: Dashboard["nominationDesk"] }) {
  return (
    <article className={card}>
      <h2 className="text-lg font-semibold">{title}</h2>
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
  rows: readonly { href: string | null; name: string; cells: readonly string[] }[];
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
                <tr key={`${row.cells[0]}-${index}`} className={row.href ? linkedRowClass : undefined}>
                  {row.cells.map((cell, cellIndex) => (
                    <td key={cellIndex} className="border-t border-black/10 py-3 pr-4">
                      {cellIndex === 0 && row.href ? <RowLink href={row.href} name={row.name} /> : null}
                      <span className="relative z-0 break-words">{cellIndex === 0 ? <When stamp={cell} /> : cell}</span>
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
