import Link from "next/link";
import { area, card, field, pill, quiet } from "@/components/admin/marks";
import { CATALOGS, type CatalogId } from "@/lib/copy/catalog";
import { updateCopy } from "@/app/admin/(console)/copy/actions";
import type { CopyRow, Head } from "@/lib/copy/editor";

const ERRORS: Record<string, string> = {
  invalid: "That text was not saved. Check the placeholders against English.",
  placeholders: "That text was not saved. The placeholders do not match English.",
  "line-break": "Subjects cannot contain a line break.",
  "too-long": "That text is over the length limit.",
  conflict: "Someone else published this key. Reload and try again.",
  missing: "There is no draft or revision to publish.",
  forbidden: "Your role cannot publish.",
};

export function CopyDesk({
  catalog,
  query,
  rows,
  selected,
  history,
  error,
}: {
  catalog: CatalogId;
  query: string;
  rows: readonly CopyRow[];
  selected: CopyRow | null;
  history: Readonly<Record<string, readonly Head[]>>;
  error?: string;
}) {
  const sections = new Map<string, CopyRow[]>();
  for (const row of rows) {
    const list = sections.get(row.section) ?? [];
    list.push(row);
    sections.set(row.section, list);
  }
  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Copy</h1>
        <p className="mt-1 max-w-3xl text-sm leading-6 text-black/70">
          English is the source. Publishing English marks the other languages for review. The files stay in place, and a published value replaces the file until you reset it.
        </p>
        {error && ERRORS[error] ? <p className="mt-3 text-sm font-semibold text-magenta">{ERRORS[error]}</p> : null}
      </div>
      <div className="flex flex-wrap gap-2">
        {(Object.keys(CATALOGS) as CatalogId[]).map((id) => (
          <Link key={id} className={id === catalog ? pill : quiet} href={`/admin/copy?catalog=${id}`}>{CATALOGS[id].label}</Link>
        ))}
      </div>
      <form className="flex flex-wrap gap-2" action="/admin/copy">
        <input type="hidden" name="catalog" value={catalog} />
        {selected ? <input type="hidden" name="key" value={selected.key} /> : null}
        <label className="sr-only" htmlFor="copy-filter">Filter copy</label>
        <input id="copy-filter" name="q" defaultValue={query} placeholder="Filter by key or English" className={`${field} max-w-md`} />
        <button className={quiet} type="submit">Filter</button>
      </form>
      <div className="grid items-start gap-6 desk:grid-cols-[18rem_minmax(0,1fr)]">
        <nav className={`${card} max-h-[70vh] overflow-auto p-4`} aria-label="Copy keys">
          {[...sections.entries()].map(([section, items]) => (
            <details key={section} open={selected ? items.some((item) => item.key === selected.key) : undefined} className="mb-3">
              <summary className="cursor-pointer text-sm font-semibold">{section}</summary>
              <ul className="mt-2 grid gap-1">
                {items.map((item) => {
                  const stale = item.cells.some((cell) => cell.state.kind === "stale");
                  const params = new URLSearchParams({ catalog, key: item.key });
                  if (query) params.set("q", query);
                  return (
                    <li key={item.key}>
                      <Link className={`block rounded-2xl px-3 py-2 text-sm ${selected?.key === item.key ? "bg-lime" : "hover:bg-cream"}`} href={`/admin/copy?${params.toString()}`}>
                        <span className="block break-all">{item.key}</span>
                        {stale ? <span className="text-xs font-semibold">Needs review</span> : null}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </details>
          ))}
        </nav>
        {selected ? <Editor row={selected} catalog={catalog} history={history} /> : <p className={`${card} text-sm`}>Choose a key.</p>}
      </div>
    </div>
  );
}

function Editor({ row, catalog, history }: { row: CopyRow; catalog: CatalogId; history: Readonly<Record<string, readonly Head[]>> }) {
  return (
    <section className="grid gap-4">
      <h2 className="break-all text-xl font-semibold">{row.key}</h2>
      <div className="grid gap-4 desk:grid-cols-2">
        {row.cells.map((cell) => (
          <form key={cell.locale} action={updateCopy} className={`${card} grid gap-3`}>
            <input type="hidden" name="catalog" value={catalog} />
            <input type="hidden" name="key" value={row.key} />
            <input type="hidden" name="locale" value={cell.locale} />
            <input type="hidden" name="base" value={cell.revision} />
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-lg font-semibold uppercase">{cell.locale}</h3>
              <StateChip kind={cell.state.kind} />
              {cell.override ? <span className="rounded-full bg-black px-2 py-1 text-xs font-semibold text-white">Published</span> : <span className="rounded-full border border-black/15 px-2 py-1 text-xs">File</span>}
              {cell.draft !== null ? <span className="rounded-full bg-orange px-2 py-1 text-xs font-semibold">Draft</span> : null}
            </div>
            <label className="sr-only" htmlFor={`${row.key}-${cell.locale}`}>Value in {cell.locale}</label>
            <textarea id={`${row.key}-${cell.locale}`} name="value" className={area} defaultValue={cell.draft ?? cell.value} />
            <div className="flex flex-wrap gap-2">
              <button className={quiet} type="submit" name="intent" value="draft">Save draft</button>
              <button className={pill} type="submit" name="intent" value="publish">Publish</button>
              <button className={quiet} type="submit" name="intent" value="reset">Reset to file</button>
              {cell.state.kind === "stale" ? <button className={quiet} type="submit" name="intent" value="mark">Mark reviewed</button> : null}
            </div>
          </form>
        ))}
        {row.cells.map((cell) => (
          <History key={cell.locale} catalog={catalog} copyKey={row.key} locale={cell.locale} base={cell.revision} rows={history[cell.locale] ?? []} />
        ))}
      </div>
    </section>
  );
}

function StateChip({ kind }: { kind: "source" | "current" | "stale" }) {
  if (kind === "source") return <span className="rounded-full bg-lime px-2 py-1 text-xs font-semibold">Source</span>;
  if (kind === "stale") return <span className="rounded-full bg-black px-2 py-1 text-xs font-semibold text-lime">Needs review</span>;
  return <span className="rounded-full bg-leaf/40 px-2 py-1 text-xs font-semibold">Current</span>;
}

function History({ catalog, copyKey, locale, base, rows }: { catalog: CatalogId; copyKey: string; locale: string; base: number; rows: readonly Head[] }) {
  if (rows.length === 0) return null;
  return (
    <details className={card}>
      <summary className="cursor-pointer text-sm font-semibold">History for {locale}</summary>
      <ul className="mt-2 grid gap-2">
        {rows.map((row) => (
          <li key={row.revision} className="rounded-2xl bg-cream p-3 text-sm">
            <p className="font-semibold">Revision {row.revision}{row.revertedFrom ? `, restored from ${row.revertedFrom}` : ""}</p>
            <p className="mt-1 line-clamp-4 whitespace-pre-wrap break-words text-black/70">{row.value ?? "File value"}</p>
            <form action={updateCopy} className="mt-2">
              <input type="hidden" name="catalog" value={catalog} />
              <input type="hidden" name="key" value={copyKey} />
              <input type="hidden" name="locale" value={locale} />
              <input type="hidden" name="base" value={base} />
              <input type="hidden" name="revision" value={row.revision} />
              <button className={`${quiet} h-10`} type="submit" name="intent" value="restore">Restore</button>
            </form>
          </li>
        ))}
      </ul>
    </details>
  );
}
