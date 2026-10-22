import { and, eq, or, sql, type SQL } from "drizzle-orm";
import { adminEvents, copyRevisions, users, type Db } from "@/lib/db";

const PAGE = 50;

export type ActivityRow = {
  readonly id: string;
  readonly at: string;
  readonly actor: string;
  readonly label: string;
};

export type ActivityPage = {
  readonly rows: readonly ActivityRow[];
  readonly next: { readonly at: string; readonly id: string } | null;
};

type Cursor = { readonly at: string; readonly id: string };

function detailOf(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value));
}

function textOf(detail: Record<string, unknown>, key: string): string {
  const value = detail[key];
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  return "";
}

function filterText(detail: Record<string, unknown>): string {
  const filters = detail.filters;
  if (!filters || typeof filters !== "object" || Array.isArray(filters)) return "";
  return Object.entries(filters).flatMap(([key, value]) => (typeof value === "string" && value ? [`${key}=${value}`] : [])).join(", ");
}

export function activityLabel(kind: string, detail: Record<string, unknown>): string {
  const email = textOf(detail, "email");
  if (kind === "staff.bootstrap") return `${email} joined from the allowlist`;
  if (kind === "staff.invited") return `Invited ${email} as ${textOf(detail, "role")}`;
  if (kind === "staff.role") return `${email} moved from ${textOf(detail, "from")} to ${textOf(detail, "to")}`;
  if (kind === "staff.disabled") return `Disabled ${email}`;
  if (kind === "staff.enabled") return `Enabled ${email}`;
  if (kind === "records.exported") {
    const filters = filterText(detail);
    const summary = `Exported ${textOf(detail, "rows") || "0"} ${textOf(detail, "list")} rows`;
    return filters ? `${summary} (${filters})` : summary;
  }
  if (kind === "copy.published") return `Published ${textOf(detail, "catalog")} ${textOf(detail, "locale")} ${textOf(detail, "key")}`;
  return "Unknown event";
}

const STAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}$/;

export function parseActivityCursor(at: string | undefined, id: string | undefined): { at: string; id: string } | null {
  if (!at || !id || id.length > 400 || !STAMP.test(at)) return null;
  return { at, id };
}

export async function loadActivity(db: Db, cursor: Cursor | null): Promise<ActivityPage> {
  const [staffRows, copyRows] = await Promise.all([readStaffEvents(db, cursor), readCopyEvents(db, cursor)]);
  const merged = [...staffRows, ...copyRows].sort(byNewest);
  const page = merged.slice(0, PAGE);
  const next = merged.length > PAGE ? page[PAGE - 1] : undefined;
  return { rows: page, next: next ? { at: next.at, id: next.id } : null };
}

function byNewest(a: ActivityRow, b: ActivityRow): number {
  if (a.at !== b.at) return a.at < b.at ? 1 : -1;
  if (a.id !== b.id) return a.id < b.id ? 1 : -1;
  return 0;
}

function olderThan(stamp: SQL<string>, idText: SQL<string>, cursor: Cursor | null) {
  if (!cursor) return undefined;
  return or(sql`${stamp} < ${cursor.at}`, and(sql`${stamp} = ${cursor.at}`, sql`${idText} < ${cursor.id}`));
}

async function readStaffEvents(db: Db, cursor: Cursor | null): Promise<ActivityRow[]> {
  const at = sql<string>`to_char(${adminEvents.createdAt} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US')`;
  const idText = sql<string>`${adminEvents.id}::text`;
  const rows = await db
    .select({
      id: idText,
      at,
      kind: adminEvents.kind,
      detail: adminEvents.detail,
      actor: users.email,
    })
    .from(adminEvents)
    .leftJoin(users, eq(users.id, adminEvents.actorId))
    .where(olderThan(at, idText, cursor))
    .orderBy(sql`${at} desc`, sql`${idText} desc`)
    .limit(PAGE + 1);
  return rows.map((row) => ({
    id: row.id,
    at: row.at,
    actor: row.actor ?? "System",
    label: activityLabel(row.kind, detailOf(row.detail)),
  }));
}

async function readCopyEvents(db: Db, cursor: Cursor | null): Promise<ActivityRow[]> {
  const at = sql<string>`to_char(${copyRevisions.createdAt} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US')`;
  const idText = sql<string>`'copy:' || ${copyRevisions.catalog} || ':' || ${copyRevisions.locale} || ':' || ${copyRevisions.key} || ':' || ${copyRevisions.revision}::text`;
  const rows = await db
    .select({
      id: idText,
      at,
      catalog: copyRevisions.catalog,
      locale: copyRevisions.locale,
      key: copyRevisions.key,
      revision: copyRevisions.revision,
      actor: users.email,
    })
    .from(copyRevisions)
    .leftJoin(users, eq(users.id, copyRevisions.authorId))
    .where(olderThan(at, idText, cursor))
    .orderBy(sql`${at} desc`, sql`${idText} desc`)
    .limit(PAGE + 1);
  return rows.map((row) => ({
    id: row.id,
    at: row.at,
    actor: row.actor ?? "Former staff",
    label: activityLabel("copy.published", { catalog: row.catalog, locale: row.locale, key: row.key, revision: String(row.revision) }),
  }));
}
