import type { Metadata } from "next";
import { CopyDesk } from "@/components/admin/CopyDesk";
import { CATALOGS, type CatalogId } from "@/lib/copy/catalog";
import { copyHistory, entryRef, loadDesk, type Head } from "@/lib/copy/editor";
import { getDb } from "@/lib/db";
import { requireStaff } from "@/lib/staff/gate";

export const metadata: Metadata = { title: "Website text" };

function firstParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function isCatalog(value: string | undefined): value is CatalogId {
  return typeof value === "string" && Object.hasOwn(CATALOGS, value);
}

export default async function CopyPage({
  searchParams,
}: {
  searchParams: Promise<{ catalog?: string; key?: string; q?: string; error?: string; review?: string; all?: string }>;
}) {
  const staff = await requireStaff("copy.edit");
  const params = await searchParams;
  const catalogParam = firstParam(params.catalog);
  const key = firstParam(params.key);
  const query = firstParam(params.q);
  const needsReview = firstParam(params.review) === "1";
  const scopeAll = firstParam(params.all) === "1";
  const catalog: CatalogId = isCatalog(catalogParam) ? catalogParam : "page";
  const desk = await loadDesk(getDb(), {
    catalog: scopeAll ? null : catalog,
    query,
    needsReview,
    authorId: staff.id,
  });
  const selected = desk.rows.find((row) => row.key === key && row.catalog === catalog) ?? null;
  const history: Record<string, readonly Head[]> = {};
  if (selected) {
    for (const cell of selected.cells) {
      const parsed = entryRef(selected.catalog, cell.locale, selected.key);
      if (parsed) history[cell.locale] = await copyHistory(getDb(), parsed);
    }
  }
  return (
    <CopyDesk
      catalog={selected?.catalog ?? catalog}
      scopeAll={scopeAll}
      query={query}
      needsReview={needsReview}
      reviewCount={desk.reviewCount}
      rows={desk.rows}
      selected={selected}
      history={history}
      error={params.error}
    />
  );
}
