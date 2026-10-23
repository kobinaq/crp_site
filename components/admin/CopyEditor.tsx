"use client";

import { useEffect, useState, type ReactNode } from "react";
import { updateCopy } from "@/app/admin/(console)/copy/actions";
import { Button, buttonClass } from "@/components/admin/Button";
import { languageLabel } from "@/lib/admin/labels";
import { area, card } from "@/components/admin/marks";
import { ConfirmSubmit, SubmitButton } from "@/components/admin/SubmitButton";
import { previewPath } from "@/lib/copy/preview";
import {
  copyCellId,
  clearCopyDrafts,
  readCopyDrafts,
  settleCopyDrafts,
  rememberCopyDraft,
  shownCopyText,
  writeCopyDrafts,
  type CopyDraftMap,
} from "@/lib/copy/draftState";
import type { CopyRow } from "@/lib/copy/editor";
import { CATALOGS, type CatalogId } from "@/lib/copy/catalog";

export function CopyEditor({
  row,
  scopeAll,
  query,
  needsReview,
  children,
}: {
  row: CopyRow;
  scopeAll: boolean;
  query: string;
  needsReview: boolean;
  children?: ReactNode;
}) {
  const [drafts, setDrafts] = useState<CopyDraftMap>(readCopyDrafts);
  const live = settleCopyDrafts(
    drafts,
    row.cells.map((cell) => ({
      id: copyCellId(row.catalog, row.key, cell.locale),
      revision: cell.revision,
      serverText: cell.draft ?? cell.value,
    })),
  );
  if (live !== drafts) {
    writeCopyDrafts(live);
    setDrafts(live);
  }
  const dirty = Object.keys(live).length > 0;

  useEffect(() => {
    if (!dirty) return;
    function onBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
    }
    function onClick(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest("a");
      if (!anchor) return;
      const href = anchor.getAttribute("href") ?? "";
      if (href.startsWith("/admin/copy") || href.startsWith("?") || href.startsWith("#")) return;
      if (typeof window.confirm !== "function") return;
      if (window.confirm("You have unsaved changes. Leave without saving?")) {
        clearCopyDrafts();
        return;
      }
      event.preventDefault();
      event.stopPropagation();
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [dirty]);

  return (
    <section className="grid min-w-0 gap-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-black/50">{row.catalog === "page" ? row.sectionLabel : CATALOGS[row.catalog].label}</p>
        <h2 className="mt-1 break-words text-xl font-semibold" title={row.key}>{row.label}</h2>
      </div>
      <div className="grid gap-4 desk:grid-cols-2">
        {row.cells.map((cell) => {
          const id = copyCellId(row.catalog, row.key, cell.locale);
          const server = cell.draft ?? cell.value;
          const shown = shownCopyText(live, id, cell.revision, server);
          const fieldId = `${row.catalog}-${row.key}-${cell.locale}`;
          const preview = previewPath(row.catalog, row.section, cell.locale);
          return (
            <form key={cell.locale} action={updateCopy} className={`${card} grid gap-3`}>
              <HiddenScope catalog={row.catalog} scopeAll={scopeAll} query={query} needsReview={needsReview} copyKey={row.key} />
              <input type="hidden" name="locale" value={cell.locale} />
              <input type="hidden" name="base" value={cell.revision} />
              <input type="hidden" name="digest" value={row.digest} />
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-lg font-semibold">{languageLabel(cell.locale)}</h3>
                <StateChip kind={cell.state.kind} />
                {cell.override ? <span className="rounded-full bg-black px-2 py-1 text-xs font-semibold text-white">Edited</span> : <span className="rounded-full border border-black/15 px-2 py-1 text-xs">Default</span>}
                {cell.locale !== "en" && cell.state.kind !== "source" && !server.trim() ? <span className="rounded-full bg-magenta px-2 py-1 text-xs font-semibold text-white">Missing translation</span> : null}
                {cell.draft !== null || (live[id] && live[id].revision === cell.revision) ? <span className="rounded-full bg-orange px-2 py-1 text-xs font-semibold">Draft</span> : null}
                {preview ? <Button href={preview} variant="outline" size="sm">Preview</Button> : null}
              </div>
              <label className="sr-only" htmlFor={fieldId}>{languageLabel(cell.locale)} text</label>
              <textarea
                id={fieldId}
                name="value"
                className={area}
                value={shown}
                autoComplete="off"
                onChange={(event) => {
                  const next = rememberCopyDraft(readCopyDrafts(), id, cell.revision, event.target.value, server);
                  writeCopyDrafts(next);
                  setDrafts(next);
                }}
              />
              <div className="flex flex-wrap gap-2">
                <SubmitButton className={buttonClass("solid")} name="intent" value="draft" pendingLabel="Saving">Save draft</SubmitButton>
                <SubmitButton className={buttonClass("primary")} name="intent" value="publish" pendingLabel="Publishing">Publish</SubmitButton>
                <ConfirmSubmit
                  className={buttonClass("danger")}
                  confirmVariant="danger"
                  name="intent"
                  value="reset"
                  pendingLabel="Resetting"
                  title="Go back to the default text?"
                  message="Your edits to this language are replaced. You can restore them from earlier versions."
                  confirmLabel="Reset"
                >
                  Reset to default
                </ConfirmSubmit>
                {cell.state.kind === "stale" ? <SubmitButton className={buttonClass("outline")} name="intent" value="mark" pendingLabel="Saving">Mark reviewed</SubmitButton> : null}
              </div>
            </form>
          );
        })}
        {children}
      </div>
    </section>
  );
}

export function HiddenScope({
  catalog,
  scopeAll,
  query,
  needsReview,
  copyKey,
}: {
  catalog: CatalogId;
  scopeAll: boolean;
  query: string;
  needsReview: boolean;
  copyKey?: string;
}) {
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

function StateChip({ kind }: { kind: "source" | "current" | "stale" }) {
  if (kind === "source") return <span className="rounded-full bg-lime px-2 py-1 text-xs font-semibold">Original</span>;
  if (kind === "stale") return <span className="rounded-full bg-black px-2 py-1 text-xs font-semibold text-lime">Needs review</span>;
  return <span className="rounded-full bg-leaf/40 px-2 py-1 text-xs font-semibold">Up to date</span>;
}
