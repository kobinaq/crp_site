import Link from "next/link";
import { markReviewedCopy, updateCopy } from "@/app/admin/(console)/copy/actions";
import { CopyEditor, HiddenScope } from "@/components/admin/CopyEditor";
import { Button, buttonClass } from "@/components/admin/Button";
import { card, field, focusRing } from "@/components/admin/marks";
import { ConfirmSubmit, SubmitButton } from "@/components/admin/SubmitButton";
import { lineDiff } from "@/lib/copy/diff";
import { CATALOGS, type CatalogId } from "@/lib/copy/catalog";
import { languageLabel } from "@/lib/admin/labels";
import { When } from "@/components/admin/When";
import type { CopyRow, Head } from "@/lib/copy/editor";
import { REVIEW_CAP } from "@/lib/copy/editor";

const ERRORS: Record<string, string> = {
  invalid: "Not saved. Keep the words in curly brackets, like {name}, the same as English.",
  placeholders: "Not saved. Keep the words in curly brackets, like {name}, the same as English.",
  "line-break": "An email subject must be one line.",
  "too-long": "Not saved. The text is too long.",
  conflict: "Someone else changed this text. Reload and try again.",
  missing: "Nothing to publish yet.",
  forbidden: "You can't publish.",
  "too-many": `Mark up to ${REVIEW_CAP} at a time.`,
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
    const label = !scopeAll ? row.sectionLabel : row.catalog === "page" ? row.sectionLabel : CATALOGS[row.catalog].label;
    const list = sections.get(label) ?? [];
    list.push(row);
    sections.set(label, list);
  }
  const staleCells = rows.flatMap((row) => row.cells.filter((cell) => cell.state.kind === "stale").map((cell) => ({ row, cell }))).slice(0, REVIEW_CAP);
  const staleTotal = rows.reduce((sum, row) => sum + row.cells.filter((cell) => cell.state.kind === "stale").length, 0);
  const missingCount = rows.filter((row) => missingLocales(row).length > 0).length;
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Website text</h1>
        {reviewCount > 0 || missingCount > 0 ? (
          <p className="mt-1 text-sm text-black/60">
            {[
              reviewCount > 0 ? `${reviewCount} need review` : "",
              missingCount > 0 ? `${missingCount} missing a translation` : "",
            ].filter(Boolean).join(" · ")}
          </p>
        ) : null}
        {error && ERRORS[error] ? <p className="mt-3 text-sm font-semibold text-magenta">{ERRORS[error]}</p> : null}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant={scopeAll ? "solid" : "outline"} href={deskHref({ all: true, review: needsReview, q: query })}>All</Button>
        {catalogIds().map((id) => (
          <Button key={id} variant={!scopeAll && id === catalog ? "solid" : "outline"} href={deskHref({ catalog: id, review: needsReview, q: query })}>{CATALOGS[id].label}</Button>
        ))}
      </div>
      <form className="flex flex-wrap gap-2" action="/admin/copy">
        {scopeAll ? <input type="hidden" name="all" value="1" /> : <input type="hidden" name="catalog" value={catalog} />}
        {needsReview ? <input type="hidden" name="review" value="1" /> : null}
        {selected ? <input type="hidden" name="key" value={selected.key} /> : null}
        <label className="sr-only" htmlFor="copy-filter">Search text</label>
        <input id="copy-filter" key={query} name="q" type="search" defaultValue={query} placeholder="Search" autoComplete="off" className={`${field} max-w-md`} />
        <SubmitButton className={buttonClass("outline")} pendingLabel="Searching">Search</SubmitButton>
        <Button variant={needsReview ? "solid" : "outline"} href={deskHref({ catalog: scopeAll ? undefined : catalog, all: scopeAll, review: !needsReview, q: query, key: selected?.key })}>
Needs review
        </Button>
      </form>
      {needsReview && staleCells.length > 0 ? (
        <form action={markReviewedCopy} className={`${card} grid gap-3`}>
          <p className="text-sm">{staleCells.length === 1 ? "1 translation" : `${staleCells.length} translations`} to mark reviewed{staleTotal > REVIEW_CAP ? `. ${staleTotal - REVIEW_CAP} more after this.` : "."}</p>
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
          <SubmitButton className={buttonClass("primary")} pendingLabel="Saving">Mark these reviewed</SubmitButton>
        </form>
      ) : null}
      <div className="grid items-start gap-6 desk:grid-cols-[minmax(12rem,18rem)_minmax(0,1fr)]">
        <nav className={`${card} max-h-[70vh] overflow-auto p-4`} aria-label="Text entries">
          {rows.length === 0 ? <p className="text-sm">Nothing matches.</p> : null}
          {[...sections.entries()].map(([section, items]) => (
            <details key={section} open={selected ? items.some((item) => item.key === selected.key && item.catalog === selected.catalog) : undefined} className="mb-3">
              <summary className="cursor-pointer text-sm font-semibold">{section}</summary>
              <ul className="mt-2 grid gap-1">
                {items.map((item) => {
                  const stale = item.cells.some((cell) => cell.state.kind === "stale");
                  const missing = missingLocales(item).length > 0;
                  return (
                    <li key={`${item.catalog}:${item.key}`}>
                      <Link
                        title={item.key}
                        aria-current={selected?.key === item.key && selected.catalog === item.catalog ? "page" : undefined}
                        className={`block rounded-2xl px-3 py-2 text-sm ${focusRing} ${selected?.key === item.key && selected.catalog === item.catalog ? "bg-lime" : "hover:bg-cream"}`}
                        href={deskHref({ catalog: item.catalog, all: scopeAll, review: needsReview, q: query, key: item.key })}
                      >
                        <span className="block break-words">{item.label}</span>
                        {stale || missing ? (
                          <span className="mt-1 flex flex-wrap gap-1">
                            {stale ? <span className="text-xs font-semibold">Needs review</span> : null}
                            {missing ? <span className="text-xs font-semibold text-magenta">Missing translation</span> : null}
                          </span>
                        ) : null}
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
        ) : <p className={`${card} text-sm`}>Choose an entry.</p>}
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
      <summary className="cursor-pointer text-sm font-semibold">{languageLabel(locale)}: earlier versions</summary>
      <ul className="mt-2 grid gap-2">
        {rows.map((item, index) => {
          const previous = rows[index + 1];
          const diff = item.value !== null && previous?.value != null ? lineDiff(previous.value, item.value) : null;
          return (
            <li key={item.revision} className="rounded-2xl bg-cream p-3 text-sm">
              <p className="font-semibold">Version {item.revision}{item.revertedFrom ? `, restored from version ${item.revertedFrom}` : ""}</p>
              <p className="text-black/60">{item.authorEmail ?? "Former staff"} · <When stamp={item.createdAt.toISOString().slice(0, 16).replace("T", " ")} /></p>
              {item.value === null ? <p className="mt-2 text-black/70">Default text</p> : diff ? (
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
                <ConfirmSubmit className={buttonClass("outline")} name="intent" value="restore" pendingLabel="Restoring" title="Restore this version?" message="This version goes live on the site." confirmLabel="Restore">Restore</ConfirmSubmit>
              </form>
            </li>
          );
        })}
      </ul>
    </details>
  );
}

export function missingLocales(row: CopyRow): readonly string[] {
  return row.cells.filter((cell) => cell.locale !== "en" && cell.state.kind !== "source" && !(cell.draft ?? cell.value).trim()).map((cell) => cell.locale);
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
