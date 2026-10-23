import { and, eq, or, sql, type SQL } from "drizzle-orm";
import { STATUS_LABEL } from "@/lib/admin/dashboard";
import { languageLabel } from "@/lib/admin/labels";
import { CATALOGS, type CatalogId } from "@/lib/copy/catalog";
import { copyLabel } from "@/lib/copy/labels";
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
  return Object.entries(filters).flatMap(([key, value]) => (typeof value === "string" && value ? [`${FILTER_NAME[key] ?? key}: ${key === "status" ? plainStatus(value) : value}`] : [])).join(", ");
}

function plainRole(value: string): string {
  if (value === "admin") return "Admin";
  if (value === "editor") return "Editor";
  if (value === "reviewer") return "Reviewer";
  return value;
}

const DESK_STATUS: Readonly<Record<string, string>> = {
  new: "New",
  read: "Read",
  archived: "Archived",
  spam: "Spam",
  reviewing: "Reviewing",
  contacted: "Contacted",
  converted: "Converted to applicant",
  closed: "Closed",
  in_conversation: "In conversation",
  committed: "Committed",
  declined: "Declined",
};

function plainStatus(value: string): string {
  if (Object.hasOwn(STATUS_LABEL, value)) return STATUS_LABEL[value as keyof typeof STATUS_LABEL];
  return DESK_STATUS[value] ?? value.replaceAll("_", " ");
}

const LIST_NAME: Readonly<Record<string, string>> = {
  applicants: "applicants",
  nominations: "nominations",
  interest: "interest sign-ups",
  waitlist: "waitlist sign-ups",
  partners: "partner inquiries",
  messages: "messages",
};

const FILTER_NAME: Readonly<Record<string, string>> = {
  q: "search",
  status: "status",
  track: "track",
  language: "language",
  cycle: "review round",
  age: "age",
  queue: "queue",
  attention: "needs attention",
};

const RECOMMENDATION: Readonly<Record<string, string>> = { advance: "Advance", discuss: "Discuss", decline: "Decline" };

function copyChange(detail: Record<string, unknown>): string {
  const catalog = textOf(detail, "catalog");
  const key = textOf(detail, "key");
  const known = Object.hasOwn(CATALOGS, catalog) ? (catalog as CatalogId) : null;
  const name = known ? copyLabel(known, key) ?? key : key;
  const where = known ? CATALOGS[known].label : "Text";
  const locale = textOf(detail, "locale");
  return `Changed "${name}" (${where}${locale ? `, ${languageLabel(locale)}` : ""})`;
}

export function activityLabel(kind: string, detail: Record<string, unknown>): string {
  const email = textOf(detail, "email");
  if (kind === "staff.bootstrap") return email ? `${email} joined` : "Joined";
  if (kind === "staff.invited") return `Invited ${email} as ${plainRole(textOf(detail, "role"))}`;
  if (kind === "staff.role") return `${email} moved from ${plainRole(textOf(detail, "from"))} to ${plainRole(textOf(detail, "to"))}`;
  if (kind === "staff.disabled") return `Disabled ${email}`;
  if (kind === "staff.enabled") return `Enabled ${email}`;
  if (kind === "records.exported") {
    const filters = filterText(detail);
    const list = textOf(detail, "list");
    const summary = `Downloaded ${textOf(detail, "rows") || "0"} ${LIST_NAME[list] ?? list}`;
    return filters ? `${summary} (${filters})` : summary;
  }
  if (kind === "copy.published") return copyChange(detail);
  if (kind === "review.saved") {
    const recommendation = textOf(detail, "recommendation");
    return recommendation ? `Saved a review: ${RECOMMENDATION[recommendation] ?? recommendation}` : "Saved a review";
  }
  if (kind === "review.assigned") return textOf(detail, "assigneeId") ? "Assigned a reviewer" : "Removed the reviewer";
  if (kind === "decision.confirmed") return `Moved an applicant from ${plainStatus(textOf(detail, "from"))} to ${plainStatus(textOf(detail, "to"))}`;
  if (kind === "nomination.noted") return "Added a nomination note";
  if (kind === "nomination.status") return `Moved a nomination from ${plainStatus(textOf(detail, "from"))} to ${plainStatus(textOf(detail, "to"))}`;
  if (kind === "nomination.assigned") return textOf(detail, "assigneeId") ? "Assigned a nomination" : "Unassigned a nomination";
  if (kind === "partner.noted") return "Added a partner note";
  if (kind === "partner.status") return `Moved a partner inquiry from ${plainStatus(textOf(detail, "from"))} to ${plainStatus(textOf(detail, "to"))}`;
  if (kind === "partner.assigned") return textOf(detail, "assigneeId") ? "Assigned a partner inquiry" : "Unassigned a partner inquiry";
  if (kind === "contact.noted") return "Added a message note";
  if (kind === "contact.status") return `Moved a message from ${plainStatus(textOf(detail, "from"))} to ${plainStatus(textOf(detail, "to"))}`;
  if (kind === "contact.assigned") return textOf(detail, "assigneeId") ? "Assigned a message" : "Unassigned a message";
  if (kind === "answer.media_opened") return "Opened a video answer";
  if (kind === "identity.document_opened") return "Showed an identity document";
  return "Other change";
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
