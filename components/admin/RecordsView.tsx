import { AdminSelect } from "@/components/admin/AdminSelect";
import { BulkQueue } from "@/components/admin/BulkQueue";
import { Button, buttonClass } from "@/components/admin/Button";
import { RecordTable } from "@/components/admin/RecordTable";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { WeekBars } from "@/components/admin/WeekBars";
import { card, field } from "@/components/admin/marks";
import { PIPELINE_ORDER, STATUS_LABEL } from "@/lib/admin/dashboard";
import { ageLabel, languageLabel, trackLabel, waitlistLabel } from "@/lib/admin/labels";
import type { RecordPage, RecordQuery } from "@/lib/admin/records";
import { RECORD_LISTS } from "@/lib/admin/records";
import { filtersAreOpen, recordsHref } from "@/lib/admin/return";
import { CONTACT_LIST, showsAttention } from "@/lib/contact/model";
import { ageGroup, appLanguage, track, waitlistStatus } from "@/lib/db";

const LABELS: Record<(typeof RECORD_LISTS)[number], string> = {
  applicants: "Applicants",
  nominations: "Nominations",
  interest: "Interest",
  waitlist: "Waitlist",
  partners: "Partners",
  messages: "Messages",
};

const SEARCH: Record<(typeof RECORD_LISTS)[number], string> = {
  applicants: "Name, email, nationality, or city",
  nominations: "Nominator or nominee",
  interest: "Name or email",
  waitlist: "Name or email",
  partners: "Name, email, or organization",
  messages: "Name, email, phone, or message",
};

export function RecordsView({ data, exportable, canConfirm }: { data: RecordPage; exportable: boolean; canConfirm: boolean }) {
  const pages = Math.max(1, Math.ceil(data.total / data.pageSize));
  const filtered = filtersAreOpen(data.filters);
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      <h1 className="text-3xl font-semibold tracking-tight">Records</h1>
      <nav className="flex flex-wrap gap-2" aria-label="Lists">
        {RECORD_LISTS.map((list) => (
          <Button key={list} variant={list === data.list ? "solid" : "outline"} href={recordsHref({ ...data.filters, list, page: 1, q: "", status: "", track: "", language: "", cycle: "", age: "", queue: "", attention: "" })}>
            {LABELS[list]}
          </Button>
        ))}
      </nav>
      <form className="flex flex-wrap items-end gap-2" action="/admin/records" role="search">
        <input type="hidden" name="list" value={data.list} />
        <Filter label="Search" name="q" value={data.filters.q} placeholder={SEARCH[data.list]} />
        {data.list === "applicants" ? <Choice label="Status" name="status" value={data.filters.status} options={PIPELINE_ORDER.map((status) => [status, STATUS_LABEL[status]])} /> : null}
        {data.statusOptions.length > 0 ? <Choice label="Status" name="status" value={data.filters.status} options={data.statusOptions} /> : null}
        {showsAttention(data.list) ? <Choice label="Attention" name="attention" value={data.filters.attention} options={[["needs", "Needs attention"]]} /> : null}
        {data.list === "waitlist" ? <Choice label="Status" name="status" value={data.filters.status} options={waitlistStatus.enumValues.map((status) => [status, waitlistLabel(status)])} /> : null}
        {data.list === "applicants" || data.list === "nominations" || data.list === "interest" ? <Choice label="Track" name="track" value={data.filters.track} options={track.enumValues.map((item) => [item, trackLabel(item)])} /> : null}
        {data.list === "applicants" ? <Choice label="Language" name="language" value={data.filters.language} options={appLanguage.enumValues.map((item) => [item, languageLabel(item)])} /> : null}
        {data.list === "applicants" ? <Filter label="Review round" name="cycle" value={data.filters.cycle} placeholder="1" /> : null}
        {data.list === "interest" ? <Choice label="Age" name="age" value={data.filters.age} options={ageGroup.enumValues.map((item) => [item, ageLabel(item)])} /> : null}
        <input type="hidden" name="queue" value={data.filters.queue} />
        <SubmitButton className={buttonClass("solid")} pendingLabel="Applying">Apply</SubmitButton>
        {filtered ? <Button href={recordsHref({ ...data.filters, q: "", status: "", track: "", language: "", cycle: "", age: "", attention: "", page: 1 })} variant="ghost">Clear filters</Button> : null}
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
          <p className="text-sm text-black/60">{data.total === 1 ? "1 result" : `${data.total} results`}</p>
        </div>
        {data.list === "applicants" && canConfirm ? <BulkQueue headers={data.headers} rows={data.rows} /> : data.rows.length === 0 ? (
          <p className="mt-3 text-sm text-black/60">{filtered ? "Nothing matches these filters." : `No ${LABELS[data.list].toLowerCase()} yet.`}</p>
        ) : (
          <RecordTable list={data.list} headers={data.headers} rows={data.rows} />
        )}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {data.page > 1 ? <Button variant="outline" href={recordsHref({ ...data.filters, page: data.page - 1 })}>Previous</Button> : <Button variant="outline" disabled>Previous</Button>}
          <p className="px-2 text-sm text-black/70">Page {Math.min(data.page, pages)} of {pages}</p>
          {data.page < pages ? <Button variant="outline" href={recordsHref({ ...data.filters, page: data.page + 1 })}>Next</Button> : <Button variant="outline" disabled>Next</Button>}
        </div>
        {data.list === CONTACT_LIST ? null : exportable ? (
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
            <SubmitButton className={buttonClass(canConfirm ? "outline" : "primary")} pendingLabel="Preparing">Download spreadsheet</SubmitButton>
          </form>
        ) : null}
      </section>
      <section className={card}>
        <h2 className="text-lg font-semibold">New by week</h2>
        <WeekBars weeks={data.weeks} />
      </section>
    </div>
  );
}

function Choice({ label, name, value, options }: { label: string; name: string; value: string; options: readonly (readonly [string, string])[] }) {
  return (
    <label className="grid gap-1 text-sm font-semibold">
      {label}
      <AdminSelect
        name={name}
        defaultValue={value}
        className="w-full min-w-44 desk:w-44"
        options={[{ value: "", label: "Any" }, ...options.map(([option, text]) => ({ value: option, label: text }))]}
      />
    </label>
  );
}

function Filter({ label, name, value, placeholder }: { label: string; name: string; value: string; placeholder?: string }) {
  return (
    <label className="grid gap-1 text-sm font-semibold">
      {label}
      <input key={value} name={name} defaultValue={value} placeholder={placeholder} type={name === "q" ? "search" : "text"} autoComplete="off" enterKeyHint={name === "q" ? "search" : undefined} className={`${field} w-full min-w-44 desk:w-56`} />
    </label>
  );
}

function QueueLink({ current, queue, filters, children }: { current: string; queue: RecordQuery["queue"]; filters: RecordQuery; children: string }) {
  const active = current === queue;
  return (
    <Button variant={active ? "solid" : "outline"} href={recordsHref({ ...filters, queue, page: 1 })}>
      {children}
    </Button>
  );
}
