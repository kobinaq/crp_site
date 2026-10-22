import { CopyDesk } from "@/components/admin/CopyDesk";
import { CATALOGS, type CatalogId } from "@/lib/copy/catalog";
import { copyHistory, entryRef, listCatalog, type Head } from "@/lib/copy/editor";
import { getDb } from "@/lib/db";
import { requireStaff } from "@/lib/staff/gate";

function isCatalog(value: string | undefined): value is CatalogId {
  return typeof value === "string" && Object.hasOwn(CATALOGS, value);
}

export default async function CopyPage({
  searchParams,
}: {
  searchParams: Promise<{ catalog?: string; key?: string; q?: string; error?: string }>;
}) {
  const staff = await requireStaff("copy.edit");
  const params = await searchParams;
  const catalog: CatalogId = isCatalog(params.catalog) ? params.catalog : "page";
  const query = (params.q ?? "").trim().toLowerCase();
  const rows = await listCatalog(getDb(), catalog, staff.id);
  const filtered = query
    ? rows.filter((row) => row.key.toLowerCase().includes(query) || row.english.toLowerCase().includes(query))
    : rows;
  const selected = filtered.find((row) => row.key === params.key) ?? null;
  const history: Record<string, readonly Head[]> = {};
  if (selected) {
    for (const cell of selected.cells) {
      const ref = entryRef(catalog, cell.locale, selected.key);
      if (ref) history[cell.locale] = await copyHistory(getDb(), ref);
    }
  }
  return <CopyDesk catalog={catalog} query={params.q ?? ""} rows={filtered} selected={selected} history={history} error={params.error} />;
}
