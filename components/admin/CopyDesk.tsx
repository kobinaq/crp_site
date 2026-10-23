import Link from "next/link";
import { markReviewedCopy, updateCopy } from "@/app/admin/(console)/copy/actions";
import { CopyEditor, HiddenScope } from "@/components/admin/CopyEditor";
import { card, field, focusRing, pill, quiet } from "@/components/admin/marks";
import { ConfirmSubmit, SubmitButton } from "@/components/admin/SubmitButton";
import { lineDiff } from "@/lib/copy/diff";
import { CATALOGS, type CatalogId } from "@/lib/copy/catalog";
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
        <input id="copy-filter" key={query} name="q" defaultValue={query} placeholder="Key or any language" autoComplete="off" className={`${field} max-w-md`} />
        <SubmitButton className={quiet} pendingLabel="Filtering">Filter</SubmitButton>
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
          <SubmitButton className={pill} pendingLabel="Saving">Mark these reviewed</SubmitButton>
        </form>
      ) : null}
      <div className="grid items-start gap-6 desk:grid-cols-[minmax(12rem,18rem)_minmax(0,1fr)]">
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
                      <Link className={`block rounded-2xl px-3 py-2 text-sm ${focusRing} ${selected?.key === item.key && selected.catalog === item.catalog ? "bg-lime" : "hover:bg-cream"}`} href={deskHref({ catalog: item.catalog, all: scopeAll, review: needsReview, q: query, key: item.key })}>
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
        {selected ? (
          <CopyEditor row={selected} scopeAll={scopeAll} query={query} needsReview={needsReview}>
            {selected.cells.map((cell) => (
              <History key={cell.locale} row={selected} scopeAll={scopeAll} query={query} needsReview={needsReview} locale={cell.locale} base={cell.revision} rows={history[cell.locale] ?? []} />
            ))}
          </CopyEditor>
        ) : <p className={`${card} text-sm`}>Choose a key.</p>}
      </div>
    </div>
  );
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
                <ConfirmSubmit className={quiet} name="intent" value="restore" pendingLabel="Restoring" title="Restore this revision?" message="This language is published again from the revision you picked." confirmLabel="Restore">Restore</ConfirmSubmit>
              </form>
            </li>
          );
        })}
      </ul>
    </details>
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
