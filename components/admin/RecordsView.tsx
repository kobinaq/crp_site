import Link from "next/link";
import { BulkQueue } from "@/components/admin/BulkQueue";
import { card } from "@/components/admin/marks";
import { WeekBars } from "@/components/admin/WeekBars";
import { PIPELINE_ORDER, STATUS_LABEL } from "@/lib/admin/dashboard";
import type { RecordPage } from "@/lib/admin/records";
import { RECORD_LISTS } from "@/lib/admin/records";
import { ageGroup, appLanguage, track, waitlistStatus } from "@/lib/db";

const LABELS: Record<(typeof RECORD_LISTS)[number], string> = {
  applicants: "Applicants",
  nominations: "Nominations",
  interest: "Interest",
  waitlist: "Waitlist",
  partners: "Partners",
};

export function RecordsView({ data, exportable, canConfirm }: { data: RecordPage; exportable: boolean; canConfirm: boolean }) {
  const pages = Math.max(1, Math.ceil(data.total / data.pageSize));
  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Records</h1>
        <p className="mt-1 max-w-3xl text-sm leading-6 text-black/70">
          Applicants are the review queue. This list shows answers, status, track, language, and cycle. Resume links and identity documents stay off the page.
        </p>
      </div>
      <nav className="flex flex-wrap gap-2" aria-label="Record lists">
        {RECORD_LISTS.map((list) => (
          <Link key={list} className={list === data.list ? "inline-flex h-12 items-center justify-center rounded-full gradient-brand px-5 text-sm font-semibold uppercase tracking-wide text-white" : "inline-flex h-12 items-center justify-center rounded-full border border-black/15 bg-white px-5 text-sm font-semibold"} href={hrefFor({ ...data.filters, list, page: 1, q: "", status: "", track: "", language: "", cycle: "", age: "", queue: "", attention: "" })}>
            {LABELS[list]}
          </Link>
        ))}
      </nav>
      <form className="flex flex-wrap items-end gap-2" action="/admin/records">
        <input type="hidden" name="list" value={data.list} />
        <Filter label="Search" name="q" value={data.filters.q} />
        {data.list === "applicants" ? <Choice label="Status" name="status" value={data.filters.status} options={PIPELINE_ORDER.map((status) => [status, STATUS_LABEL[status]])} /> : null}
        {data.statusOptions.length > 0 ? <Choice label="Status" name="status" value={data.filters.status} options={data.statusOptions} /> : null}
        {data.statusOptions.length > 0 ? <Choice label="Attention" name="attention" value={data.filters.attention} options={[["needs", "Needs attention"]]} /> : null}
        {data.list === "waitlist" ? <Choice label="Status" name="status" value={data.filters.status} options={waitlistStatus.enumValues.map((status) => [status, status])} /> : null}
        {data.list === "applicants" || data.list === "nominations" || data.list === "interest" ? <Choice label="Track" name="track" value={data.filters.track} options={track.enumValues.map((item) => [item, item])} /> : null}
        {data.list === "applicants" ? <Choice label="Language" name="language" value={data.filters.language} options={appLanguage.enumValues.map((item) => [item, item])} /> : null}
        {data.list === "applicants" ? <Filter label="Cycle" name="cycle" value={data.filters.cycle} /> : null}
        {data.list === "interest" ? <Choice label="Age" name="age" value={data.filters.age} options={ageGroup.enumValues.map((item) => [item, item])} /> : null}
        <input type="hidden" name="queue" value={data.filters.queue} />
        <button className="inline-flex h-12 items-center justify-center rounded-full border border-black/15 bg-white px-5 text-sm font-semibold" type="submit">Apply</button>
      </form>
      {data.list === "applicants" ? (
        <nav className="flex flex-wrap gap-2" aria-label="Queues">
          <QueueLink current={data.filters.queue} queue="" filters={data.filters}>All</QueueLink>
          <QueueLink current={data.filters.queue} queue="mine" filters={data.filters}>Mine</QueueLink>
          <QueueLink current={data.filters.queue} queue="unassigned" filters={data.filters}>Unassigned</QueueLink>
          <QueueLink current={data.filters.queue} queue="needs" filters={data.filters}>Needs decision</QueueLink>
        </nav>
      ) : null}
      <section className={card}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">{data.title}</h2>
          <p className="text-sm text-black/60">{data.total} rows</p>
        </div>
        {data.list === "applicants" && canConfirm ? <BulkQueue headers={data.headers} rows={data.rows} /> : data.rows.length === 0 ? <p className="mt-3 text-sm text-black/60">Nothing matches these filters.</p> : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[40rem] text-left text-sm">
              <thead>
                <tr>
                  {data.headers.map((header) => <th key={header} scope="col" className="pb-2 font-semibold">{header}</th>)}
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row) => (
                  <tr key={row.id}>
                    {row.cells.map((cell, index) => (
                      <td key={`${row.id}-${index}`} className="border-t border-black/10 py-2 pr-4">
                        {index === 0 && row.href ? <Link className="font-semibold underline" href={row.href}>{cell}</Link> : cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          {data.page > 1 ? <Link className="text-sm font-semibold underline" href={hrefFor({ ...data.filters, page: data.page - 1 })}>Previous</Link> : null}
          {data.page < pages ? <Link className="text-sm font-semibold underline" href={hrefFor({ ...data.filters, page: data.page + 1 })}>Next</Link> : null}
        </div>
        {exportable ? (
          <form className="mt-4" method="post" action="/admin/records/export">
            <input type="hidden" name="list" value={data.list} />
            <input type="hidden" name="q" value={data.filters.q} />
            <input type="hidden" name="status" value={data.filters.status} />
            <input type="hidden" name="track" value={data.filters.track} />
            <input type="hidden" name="language" value={data.filters.language} />
            <input type="hidden" name="cycle" value={data.filters.cycle} />
            <input type="hidden" name="age" value={data.filters.age} />
            <input type="hidden" name="queue" value={data.filters.queue} />
            <input type="hidden" name="attention" value={data.filters.attention} />
            <button className="inline-flex h-12 items-center justify-center rounded-full gradient-brand px-6 text-sm font-semibold uppercase tracking-wide text-white" type="submit">Download CSV</button>
          </form>
        ) : <p className="mt-4 text-sm text-black/60">CSV download is limited to admins.</p>}
      </section>
      <section className={card}>
        <h2 className="text-lg font-semibold">New rows by week</h2>
        <p className="mt-1 text-sm text-black/60">Monday to Monday, UTC. Counts use the created date, not status changes.</p>
        <WeekBars weeks={data.weeks} />
      </section>
    </div>
  );
}

function Choice({ label, name, value, options }: { label: string; name: string; value: string; options: readonly (readonly [string, string])[] }) {
  return (
    <label className="grid gap-1 text-sm font-semibold">
      {label}
      <select name={name} defaultValue={value} className="h-12 w-44 rounded-[40px] border border-black/12 bg-cream px-4 text-base outline-none focus-visible:border-black">
        <option value="">Any</option>
        {options.map(([option, text]) => <option key={option} value={option}>{text}</option>)}
      </select>
    </label>
  );
}

function Filter({ label, name, value }: { label: string; name: string; value: string }) {
  return (
    <label className="grid gap-1 text-sm font-semibold">
      {label}
      <input name={name} defaultValue={value} className="h-12 w-44 rounded-[40px] border border-black/12 bg-cream px-4 text-base outline-none focus-visible:border-black" />
    </label>
  );
}

function QueueLink({ current, queue, filters, children }: { current: string; queue: RecordPage["filters"]["queue"]; filters: RecordPage["filters"]; children: string }) {
  const active = current === queue;
  return (
    <Link className={active ? "inline-flex h-12 items-center justify-center rounded-full gradient-brand px-5 text-sm font-semibold uppercase tracking-wide text-white" : "inline-flex h-12 items-center justify-center rounded-full border border-black/15 bg-white px-5 text-sm font-semibold"} href={hrefFor({ ...filters, queue, page: 1 })}>
      {children}
    </Link>
  );
}

function hrefFor(filters: RecordPage["filters"]): string {
  const params = new URLSearchParams();
  params.set("list", filters.list);
  if (filters.q) params.set("q", filters.q);
  if (filters.status) params.set("status", filters.status);
  if (filters.track) params.set("track", filters.track);
  if (filters.language) params.set("language", filters.language);
  if (filters.cycle) params.set("cycle", filters.cycle);
  if (filters.age) params.set("age", filters.age);
  if (filters.queue) params.set("queue", filters.queue);
  if (filters.attention) params.set("attention", filters.attention);
  if (filters.page > 1) params.set("page", String(filters.page));
  return `/admin/records?${params.toString()}`;
}
