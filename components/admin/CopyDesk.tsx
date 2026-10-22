import Link from "next/link";
import { markReviewedCopy, updateCopy } from "@/app/admin/(console)/copy/actions";
import { area, card, field, pill, quiet } from "@/components/admin/marks";
import { lineDiff } from "@/lib/copy/diff";
import { CATALOGS, type CatalogId } from "@/lib/copy/catalog";
import { previewPath } from "@/lib/copy/preview";
import type { CopyRow, Head } from "@/lib/copy/editor";
import { REVIEW_CAP } from "@/lib/copy/editor";

const ERRORS: Record<string, string> = {
  invalid: "That text was not saved. Check the placeholders against English.",
  placeholders: "That text was not saved. The placeholders do not match English.",
  "line-break": "Subjects cannot contain a line break.",
  "too-long": "That text is over the length limit.",
  conflict: "English changed, or someone else published this key. Reload and try again.",
  missing: "There is no draft or revision to publish.",
  forbidden: "Your role cannot publish.",
  "too-many": `Mark at most ${REVIEW_CAP} cells at a time.`,
};

export function CopyDesk({
  catalog,
  scopeAll,
  query,
  needsReview,
  reviewCount,
  rows,
  selected,
  history,
  error,
}: {
  catalog: CatalogId;
  scopeAll: boolean;
  query: string;
  needsReview: boolean;
  reviewCount: number;
  rows: readonly CopyRow[];
  selected: CopyRow | null;
  history: Readonly<Record<string, readonly Head[]>>;
  error?: string;
}) {
  const sections = new Map<string, CopyRow[]>();
  for (const row of rows) {
    const label = scopeAll ? `${row.catalog} / ${row.section}` : row.section;
    const list = sections.get(label) ?? [];
    list.push(row);
    sections.set(label, list);
  }
  const staleCells = rows.flatMap((row) => row.cells.filter((cell) => cell.state.kind === "stale").map((cell) => ({ row, cell }))).slice(0, REVIEW_CAP);
  const staleTotal = rows.reduce((sum, row) => sum + row.cells.filter((cell) => cell.state.kind === "stale").length, 0);
  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Copy</h1>
        <p className="mt-1 max-w-3xl text-sm leading-6 text-black/70">
          English is the source. Search covers keys and every language. {reviewCount === 1 ? "1 key needs review" : `${reviewCount} keys need review`} in this catalog.
        </p>
        {error && ERRORS[error] ? <p className="mt-3 text-sm font-semibold text-magenta">{ERRORS[error]}</p> : null}
      </div>
      <div className="flex flex-wrap gap-2">
        <Link className={scopeAll ? pill : quiet} href={deskHref({ all: true, review: needsReview, q: query })}>All catalogs</Link>
        {catalogIds().map((id) => (
          <Link key={id} className={!scopeAll && id === catalog ? pill : quiet} href={deskHref({ catalog: id, review: needsReview, q: query })}>{CATALOGS[id].label}</Link>
        ))}
      </div>
      <form className="flex flex-wrap gap-2" action="/admin/copy">
        {scopeAll ? <input type="hidden" name="all" value="1" /> : <input type="hidden" name="catalog" value={catalog} />}
        {needsReview ? <input type="hidden" name="review" value="1" /> : null}
        {selected ? <input type="hidden" name="key" value={selected.key} /> : null}
        <label className="sr-only" htmlFor="copy-filter">Filter copy</label>
        <input id="copy-filter" name="q" defaultValue={query} placeholder="Key or any language" className={`${field} max-w-md`} />
        <button className={quiet} type="submit">Filter</button>
        <Link className={needsReview ? pill : quiet} href={deskHref({ catalog: scopeAll ? undefined : catalog, all: scopeAll, review: !needsReview, q: query, key: selected?.key })}>
          {needsReview ? "Showing needs review" : "Needs review"}
        </Link>
      </form>
      {needsReview && staleCells.length > 0 ? (
        <form action={markReviewedCopy} className={`${card} grid gap-3`}>
          <p className="text-sm">Mark {staleCells.length} visible cells reviewed{staleTotal > REVIEW_CAP ? `. ${staleTotal - REVIEW_CAP} more stay for the next pass.` : "."}</p>
          {staleCells.map(({ row, cell }) => (
            <span key={`${row.catalog}:${row.key}:${cell.locale}`}>
              <input type="hidden" name="cellCatalog" value={row.catalog} />
              <input type="hidden" name="cellLocale" value={cell.locale} />
              <input type="hidden" name="cellKey" value={row.key} />
              <input type="hidden" name="cellBase" value={cell.revision} />
              <input type="hidden" name="cellDigest" value={row.digest} />
            </span>
          ))}
          <HiddenScope catalog={catalog} scopeAll={scopeAll} query={query} needsReview={needsReview} copyKey={selected?.key} />
          <button className={pill} type="submit">Mark these reviewed</button>
        </form>
      ) : null}
      <div className="grid items-start gap-6 desk:grid-cols-[18rem_minmax(0,1fr)]">
        <nav className={`${card} max-h-[70vh] overflow-auto p-4`} aria-label="Copy keys">
          {rows.length === 0 ? <p className="text-sm">No keys match.</p> : null}
          {[...sections.entries()].map(([section, items]) => (
            <details key={section} open={selected ? items.some((item) => item.key === selected.key && item.catalog === selected.catalog) : undefined} className="mb-3">
              <summary className="cursor-pointer text-sm font-semibold">{section}</summary>
              <ul className="mt-2 grid gap-1">
                {items.map((item) => {
                  const stale = item.cells.some((cell) => cell.state.kind === "stale");
                  return (
                    <li key={`${item.catalog}:${item.key}`}>
                      <Link className={`block rounded-2xl px-3 py-2 text-sm ${selected?.key === item.key && selected.catalog === item.catalog ? "bg-lime" : "hover:bg-cream"}`} href={deskHref({ catalog: item.catalog, all: scopeAll, review: needsReview, q: query, key: item.key })}>
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
        {selected ? <Editor row={selected} scopeAll={scopeAll} query={query} needsReview={needsReview} history={history} /> : <p className={`${card} text-sm`}>Choose a key.</p>}
      </div>
    </div>
  );
}

function Editor({
  row,
  scopeAll,
  query,
  needsReview,
  history,
}: {
  row: CopyRow;
  scopeAll: boolean;
  query: string;
  needsReview: boolean;
  history: Readonly<Record<string, readonly Head[]>>;
}) {
  return (
    <section className="grid gap-4">
      <h2 className="break-all text-xl font-semibold">{row.key}</h2>
      <div className="grid gap-4 desk:grid-cols-2">
        {row.cells.map((cell) => {
          const preview = previewPath(row.catalog, row.section, cell.locale);
          return (
            <form key={cell.locale} action={updateCopy} className={`${card} grid gap-3`}>
              <HiddenScope catalog={row.catalog} scopeAll={scopeAll} query={query} needsReview={needsReview} copyKey={row.key} />
              <input type="hidden" name="locale" value={cell.locale} />
              <input type="hidden" name="base" value={cell.revision} />
              <input type="hidden" name="digest" value={row.digest} />
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-lg font-semibold uppercase">{cell.locale}</h3>
                <StateChip kind={cell.state.kind} />
                {cell.override ? <span className="rounded-full bg-black px-2 py-1 text-xs font-semibold text-white">Published</span> : <span className="rounded-full border border-black/15 px-2 py-1 text-xs">File</span>}
                {cell.draft !== null ? <span className="rounded-full bg-orange px-2 py-1 text-xs font-semibold">Draft</span> : null}
                {preview ? <a className="text-sm font-semibold underline" href={preview}>Preview</a> : null}
              </div>
              <label className="sr-only" htmlFor={`${row.catalog}-${row.key}-${cell.locale}`}>Value in {cell.locale}</label>
              <textarea id={`${row.catalog}-${row.key}-${cell.locale}`} name="value" className={area} defaultValue={cell.draft ?? cell.value} />
              <div className="flex flex-wrap gap-2">
                <button className={quiet} type="submit" name="intent" value="draft">Save draft</button>
                <button className={pill} type="submit" name="intent" value="publish">Publish</button>
                <button className={quiet} type="submit" name="intent" value="reset">Reset to file</button>
                {cell.state.kind === "stale" ? <button className={quiet} type="submit" name="intent" value="mark">Mark reviewed</button> : null}
              </div>
            </form>
          );
        })}
        {row.cells.map((cell) => (
          <History key={cell.locale} row={row} scopeAll={scopeAll} query={query} needsReview={needsReview} locale={cell.locale} base={cell.revision} rows={history[cell.locale] ?? []} />
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

function History({
  row,
  scopeAll,
  query,
  needsReview,
  locale,
  base,
  rows,
}: {
  row: CopyRow;
  scopeAll: boolean;
  query: string;
  needsReview: boolean;
  locale: string;
  base: number;
  rows: readonly Head[];
}) {
  if (rows.length === 0) return null;
  return (
    <details className={card}>
      <summary className="cursor-pointer text-sm font-semibold">History for {locale}</summary>
      <ul className="mt-2 grid gap-2">
        {rows.map((item, index) => {
          const previous = rows[index + 1];
          const diff = item.value !== null && previous?.value != null ? lineDiff(previous.value, item.value) : null;
          return (
            <li key={item.revision} className="rounded-2xl bg-cream p-3 text-sm">
              <p className="font-semibold">Revision {item.revision}{item.revertedFrom ? `, restored from ${item.revertedFrom}` : ""}</p>
              <p className="text-black/60">{item.authorEmail ?? "Former staff"} · {item.createdAt.toISOString().slice(0, 16).replace("T", " ")}</p>
              {item.value === null ? <p className="mt-2 text-black/70">File value</p> : diff ? (
                <div className="mt-2 grid gap-1">
                  {diff.map((line, lineIndex) => (
                    <p key={`${item.revision}-${lineIndex}`} className={line.kind === "add" ? "text-leaf" : line.kind === "remove" ? "text-magenta line-through" : "text-black/70"}>
                      {line.text || " "}
                    </p>
                  ))}
                </div>
              ) : <p className="mt-2 whitespace-pre-wrap text-black/70">{item.value}</p>}
              <form action={updateCopy} className="mt-2">
                <HiddenScope catalog={row.catalog} scopeAll={scopeAll} query={query} needsReview={needsReview} copyKey={row.key} />
                <input type="hidden" name="locale" value={locale} />
                <input type="hidden" name="base" value={base} />
                <input type="hidden" name="revision" value={item.revision} />
                <button className={`${quiet} h-10`} type="submit" name="intent" value="restore">Restore</button>
              </form>
            </li>
          );
        })}
      </ul>
    </details>
  );
}

function HiddenScope({ catalog, scopeAll, query, needsReview, copyKey }: { catalog: CatalogId; scopeAll: boolean; query: string; needsReview: boolean; copyKey?: string }) {
  return (
    <>
      <input type="hidden" name="catalog" value={catalog} />
      {scopeAll ? <input type="hidden" name="all" value="1" /> : null}
      <input type="hidden" name="q" value={query} />
      {needsReview ? <input type="hidden" name="review" value="1" /> : null}
      {copyKey ? <input type="hidden" name="key" value={copyKey} /> : null}
    </>
  );
}

function catalogIds(): readonly CatalogId[] {
  return Object.keys(CATALOGS).filter((key): key is CatalogId => Object.hasOwn(CATALOGS, key));
}

function deskHref(input: { catalog?: CatalogId; all?: boolean; review?: boolean; q?: string; key?: string }): string {
  const params = new URLSearchParams();
  if (input.all) params.set("all", "1");
  if (input.catalog) params.set("catalog", input.catalog);
  if (input.review) params.set("review", "1");
  if (input.q) params.set("q", input.q);
  if (input.key) params.set("key", input.key);
  const query = params.toString();
  return query ? `/admin/copy?${query}` : "/admin/copy";
}
