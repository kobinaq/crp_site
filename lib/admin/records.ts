import { and, asc, count, desc, eq, inArray, isNull, or, sql, type SQL, type SQLWrapper } from "drizzle-orm";
import { detailHref, recordsHref } from "@/lib/admin/return";
import { weeklyIntake, type WeekCount } from "@/lib/admin/weeks";
import { adjacentMessageIds, listMessages } from "@/lib/contact/messages";
import { CONTACT_LIST, MESSAGE_LIST_HEADERS, messageCells, messageStatusOptions } from "@/lib/contact/model";
import { recordEvent } from "@/lib/admin/events";
import {
  ageGroup,
  appLanguage,
  applicants,
  applicationEvents,
  interest,
  nominations,
  partnerInquiries,
  reviewNotes,
  reviewPositions,
  sheetConflicts,
  track,
  users,
  waitlist,
  waitlistStatus,
  type Db,
  type Store,
} from "@/lib/db";
import type { StaffGrant } from "@/lib/staff/auth";
import { can, type Capability } from "@/lib/staff/roles";
import { isUserId } from "@/lib/staff/users";
import { PIPELINE_ORDER, STATUS_LABEL } from "@/lib/admin/dashboard";
import { parseApplicantId, type AnswerView, type DocumentView } from "@/lib/holdings";
import { loadAnswerViews, loadDocumentViews } from "@/lib/media";
import { deskColumns, deskOfList, deskWhere, statusOptions as deskStatusOptions } from "@/lib/desk/case";
import { offeredMoves, type ConfirmMove } from "@/lib/sync";
import { NEEDS_DECISION_STATUSES, parseQueue, type QueueName } from "@/lib/review/queue";

export const RECORD_LISTS = ["applicants", "nominations", "interest", "waitlist", "partners", "messages"] as const;
export type RecordList = (typeof RECORD_LISTS)[number];

const messageList = CONTACT_LIST satisfies RecordList;

// Who may open each list. Pages, tabs, and the dashboard all read this one map.
export const LIST_CAPABILITY: Record<RecordList, Capability> = {
  applicants: "applicants.read",
  nominations: "nominations.read",
  interest: "signups.read",
  waitlist: "signups.read",
  partners: "partners.read",
  messages: "messages.read",
};

export function readableLists(role: string): readonly RecordList[] {
  return RECORD_LISTS.filter((list) => can(role, LIST_CAPABILITY[list]));
}
export const PAGE_SIZE = 50;

export type RecordQuery = {
  readonly list: RecordList;
  readonly q: string;
  readonly status: string;
  readonly track: string;
  readonly language: string;
  readonly cycle: string;
  readonly age: string;
  readonly queue: "" | QueueName;
  readonly attention: "" | "needs";
  readonly page: number;
};

export type RecordRow = {
  readonly id: string;
  readonly href: string | null;
  readonly cells: readonly string[];
  readonly version?: number;
  readonly reviewCycle?: number;
};

export type RecordPage = {
  readonly list: RecordList;
  readonly title: string;
  readonly headers: readonly string[];
  readonly rows: readonly RecordRow[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
  readonly filters: RecordQuery;
  readonly statusOptions: readonly (readonly [string, string])[];
  readonly weeks: readonly WeekCount[];
};

const TITLES: Record<RecordList, string> = {
  applicants: "Applicants",
  nominations: "Nominations",
  interest: "Interest",
  waitlist: "Waitlist",
  partners: "Partner inquiries",
  messages: "Messages",
};

const ACTOR_NAME: Record<string, string> = {
  applicant: "Applicant",
  videoask: "Video answers",
  identity: "Identity check",
  excel: "Spreadsheet",
  ops: "Tech team",
  system: "Automatic",
  staff: "Staff",
};

export function actorName(actor: string): string {
  return ACTOR_NAME[actor] ?? actor;
}

function sentence(text: string | null): string {
  const value = text ?? "";
  return value ? value[0].toUpperCase() + value.slice(1) : "";
}

const SCREEN: Record<RecordList, readonly string[]> = {
  applicants: ["Name", "Email", "Track", "Language", "Status", "Assigned to", "Review round", "Received"],
  nominations: ["Nominated by", "Nominee", "Email", "Track", "Status", "Assigned to", "Received"],
  interest: ["Name", "Email", "Age", "Track", "Received"],
  waitlist: ["Name", "Email", "Status", "Received"],
  partners: ["Name", "Email", "Organization", "Support", "Status", "Assigned to", "Received"],
  messages: MESSAGE_LIST_HEADERS,
};

export type ApplicantReview = {
  readonly id: string;
  readonly fullName: string;
  readonly email: string;
  readonly dob: string;
  readonly age: number;
  readonly track: string;
  readonly phone: string;
  readonly nationality: string;
  readonly basedIn: string;
  readonly skills: string;
  readonly canTravel: string;
  readonly hasValidPassport: string;
  readonly language: string;
  readonly status: string;
  readonly statusLabel: string;
  readonly reviewCycle: number;
  readonly createdAt: string;
  readonly videoAsk: "complete" | "not complete";
  readonly round1CompletedAt: string;
  readonly identity: string;
  readonly identityCheckedAt: string;
  readonly reviewDecision: string;
  readonly reviewNotes: string;
  readonly reviewer: string;
  readonly reviewDate: string;
  readonly interviewOutcome: string;
  readonly interviewNotes: string;
  readonly interviewDate: string;
  readonly docsStatus: string;
  readonly onlineOfferedAt: string;
  readonly version: number;
  readonly assignedStaff: { readonly id: string; readonly name: string; readonly email: string } | null;
  readonly positions: readonly {
    readonly authorId: string;
    readonly authorName: string;
    readonly scores: Readonly<Record<string, number>>;
    readonly recommendation: string;
    readonly updatedAt: string;
  }[];
  readonly notes: readonly {
    readonly id: string;
    readonly authorName: string;
    readonly body: string;
    readonly createdAt: string;
  }[];
  readonly conflicts: readonly { readonly decisionId: string; readonly sheetTarget: string; readonly heldStatus: string }[];
  readonly offeredMoves: readonly ConfirmMove[];
  readonly prevHref: string | null;
  readonly nextHref: string | null;
  readonly events: readonly { readonly at: string; readonly actor: string; readonly from: string; readonly to: string; readonly reason: string }[];
  readonly answers: readonly AnswerView[];
  readonly documents: readonly DocumentView[];
};

export type ReviewerOption = { readonly id: string; readonly name: string; readonly email: string };

export function queueListHref(queue: "" | QueueName): string {
  return recordsHref({
    list: "applicants",
    q: "",
    status: "",
    track: "",
    language: "",
    cycle: "",
    age: "",
    attention: "",
    page: 1,
    queue,
  });
}

function scopeQuery(scope: "" | QueueName | RecordQuery): RecordQuery {
  if (typeof scope === "object") return { ...scope, list: "applicants" };
  return {
    list: "applicants",
    q: "",
    status: "",
    track: "",
    language: "",
    cycle: "",
    age: "",
    attention: "",
    page: 1,
    queue: scope,
  };
}

type Sheet = { readonly headers: readonly string[]; readonly rows: readonly (readonly string[])[] };

function textOf(value: string | null | undefined): string {
  return value ?? "";
}

function stamp(value: Date | null | undefined): string {
  return value ? value.toISOString().slice(0, 16).replace("T", " ") : "";
}

function flag(value: boolean | null | undefined): string {
  if (value === true) return "yes";
  if (value === false) return "no";
  return "";
}

function skillsText(value: unknown): string {
  if (!Array.isArray(value)) return "";
  return value.filter((item): item is string => typeof item === "string").join(", ");
}

function oneOf<T extends string>(value: string, allowed: readonly T[]): T | null {
  return allowed.find((item) => item === value) ?? null;
}

function cycleOf(value: string): number | null {
  if (!/^\d{1,4}$/.test(value)) return null;
  return Number(value);
}

function pageOf(value: string): number {
  if (!/^\d{1,6}$/.test(value)) return 1;
  const page = Number(value);
  return page >= 1 ? page : 1;
}

function clip(value: unknown): string {
  const raw = Array.isArray(value) ? value[0] : value;
  return typeof raw === "string" ? raw.trim().slice(0, 200) : "";
}

function likePattern(value: string): string {
  return `%${value.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}

function matches(column: SQLWrapper, value: string): SQL {
  return sql`${column} ilike ${likePattern(value)} escape '\\'`;
}

export function parseRecordQuery(raw: Readonly<Record<string, unknown>>): RecordQuery {
  const list = oneOf(clip(raw.list), RECORD_LISTS) ?? "applicants";
  return {
    list,
    q: clip(raw.q),
    status: clip(raw.status),
    track: clip(raw.track),
    language: clip(raw.language),
    cycle: clip(raw.cycle),
    age: clip(raw.age),
    queue: parseQueue(clip(raw.queue)),
    attention: clip(raw.attention) === "needs" ? "needs" : "",
    page: pageOf(clip(raw.page)),
  };
}

function auditOf(query: RecordQuery): Record<string, string> {
  const pairs: readonly (readonly [string, string])[] = [
    ["q", query.q],
    ["status", query.status],
    ["track", query.track],
    ["language", query.language],
    ["cycle", query.cycle],
    ["age", query.age],
    ["queue", query.queue],
    ["attention", query.attention],
  ];
  return Object.fromEntries(pairs.filter(([, value]) => value.length > 0));
}

function whereOf(parts: readonly (SQL | undefined)[]): SQL | undefined {
  const present = parts.filter((part): part is SQL => part !== undefined);
  if (present.length === 0) return undefined;
  return and(...present);
}

export async function loadRecords(db: Db, query: RecordQuery, viewer: { readonly id: string; readonly role?: string }): Promise<RecordPage> {
  const [listed, weeks] = await Promise.all([
    listRows(db, query, viewer, PAGE_SIZE, (query.page - 1) * PAGE_SIZE),
    weeklyIntake(db, query.list),
  ]);
  return {
    list: query.list,
    title: TITLES[query.list],
    headers: SCREEN[query.list],
    rows: listed.rows,
    total: listed.total,
    page: query.page,
    pageSize: PAGE_SIZE,
    filters: query,
    statusOptions: deskList(query.list),
    weeks,
  };
}

function deskList(list: RecordList): readonly (readonly [string, string])[] {
  if (list === messageList) return messageStatusOptions();
  const desk = deskOfList(list);
  return desk ? deskStatusOptions(desk) : [];
}

export async function exportList(
  db: Db,
  actor: StaffGrant<"records.export">,
  query: RecordQuery,
): Promise<{ readonly filename: string; readonly body: string } | null> {
  if (!can(actor.role, "records.export") || !can(actor.role, LIST_CAPABILITY[query.list])) return null;
  return db.transaction(async (tx) => {
    const sheet = await sheetOf(tx, query, actor);
    if (!sheet) return null;
    await recordEvent(tx, actor.id, {
      kind: "records.exported",
      list: query.list,
      rows: sheet.rows.length,
      filters: auditOf(query),
    });
    return { filename: `${query.list}.csv`, body: toCsv(sheet.headers, sheet.rows) };
  });
}

export async function loadApplicant(
  db: Db,
  id: string,
  viewer: { readonly id: string; readonly role?: string },
  scope: "" | QueueName | RecordQuery = "",
): Promise<ApplicantReview | null> {
  const [row] = await db
    .select({
      id: applicants.id,
      fullName: applicants.fullName,
      email: applicants.email,
      dob: applicants.dob,
      age: applicants.age,
      track: applicants.track,
      phone: applicants.phone,
      nationality: applicants.nationality,
      basedIn: applicants.basedIn,
      skills: applicants.skills,
      canTravel: applicants.canTravel,
      hasValidPassport: applicants.hasValidPassport,
      language: applicants.language,
      status: applicants.status,
      reviewCycle: applicants.reviewCycle,
      version: applicants.version,
      createdAt: applicants.createdAt,
      round1CompletedAt: applicants.round1CompletedAt,
      identityStatus: applicants.identityStatus,
      identityCheckedAt: applicants.identityCheckedAt,
      reviewDecision: applicants.reviewDecision,
      reviewNotes: applicants.reviewNotes,
      reviewer: applicants.reviewer,
      reviewDate: applicants.reviewDate,
      interviewOutcome: applicants.interviewOutcome,
      interviewNotes: applicants.interviewNotes,
      interviewDate: applicants.interviewDate,
      docsStatus: applicants.docsStatus,
      onlineOfferedAt: applicants.onlineOfferedAt,
      assigneeId: users.id,
      assigneeName: users.name,
      assigneeEmail: users.email,
    })
    .from(applicants)
    .leftJoin(users, eq(users.id, applicants.assignedStaffId))
    .where(eq(applicants.id, id));
  if (!row) return null;
  const query = scopeQuery(scope);
  const [events, positions, notes, conflictRows, neighbors] = await Promise.all([
    db
      .select({
        createdAt: applicationEvents.createdAt,
        actor: applicationEvents.actor,
        fromStatus: applicationEvents.fromStatus,
        toStatus: applicationEvents.toStatus,
        reason: applicationEvents.reason,
        staffName: users.name,
        staffEmail: users.email,
      })
      .from(applicationEvents)
      .leftJoin(users, eq(users.id, applicationEvents.actorStaffId))
      .where(eq(applicationEvents.applicantId, id))
      .orderBy(asc(applicationEvents.createdAt)),
    db
      .select({
        authorId: reviewPositions.authorId,
        authorName: users.name,
        authorEmail: users.email,
        scores: reviewPositions.scores,
        recommendation: reviewPositions.recommendation,
        updatedAt: reviewPositions.updatedAt,
      })
      .from(reviewPositions)
      .innerJoin(users, eq(users.id, reviewPositions.authorId))
      .where(and(eq(reviewPositions.applicantId, id), eq(reviewPositions.reviewCycle, row.reviewCycle)))
      .orderBy(asc(reviewPositions.updatedAt)),
    db
      .select({
        id: reviewNotes.id,
        authorName: users.name,
        authorEmail: users.email,
        body: reviewNotes.body,
        createdAt: reviewNotes.createdAt,
      })
      .from(reviewNotes)
      .innerJoin(users, eq(users.id, reviewNotes.authorId))
      .where(and(eq(reviewNotes.applicantId, id), eq(reviewNotes.reviewCycle, row.reviewCycle)))
      .orderBy(asc(reviewNotes.createdAt)),
    db
      .select({
        decisionId: sheetConflicts.decisionId,
        sheetTarget: sheetConflicts.sheetTarget,
        heldStatus: sheetConflicts.heldStatus,
      })
      .from(sheetConflicts)
      .where(and(eq(sheetConflicts.applicantId, id), eq(sheetConflicts.reviewCycle, row.reviewCycle)))
      .orderBy(desc(sheetConflicts.updatedAt)),
    adjacentDetailHrefs(db, query, { id: row.id, createdAt: row.createdAt }, viewer),
  ]);
  const applicantId = parseApplicantId(row.id);
  const answers = applicantId ? await loadAnswerViews(db, applicantId) : [];
  const documents = applicantId && viewer.role && can(viewer.role, "identity.view")
    ? await loadDocumentViews(db, applicantId)
    : [];
  return {
    id: row.id,
    fullName: row.fullName,
    email: row.email,
    dob: row.dob,
    age: row.age,
    track: row.track,
    phone: textOf(row.phone),
    nationality: textOf(row.nationality),
    basedIn: textOf(row.basedIn),
    skills: skillsText(row.skills),
    canTravel: flag(row.canTravel),
    hasValidPassport: flag(row.hasValidPassport),
    language: row.language,
    status: row.status,
    statusLabel: STATUS_LABEL[row.status],
    reviewCycle: row.reviewCycle,
    createdAt: stamp(row.createdAt),
    videoAsk: row.round1CompletedAt ? "complete" : "not complete",
    round1CompletedAt: stamp(row.round1CompletedAt),
    identity: row.identityStatus ?? "none",
    identityCheckedAt: stamp(row.identityCheckedAt),
    reviewDecision: textOf(row.reviewDecision),
    reviewNotes: textOf(row.reviewNotes),
    reviewer: textOf(row.reviewer),
    reviewDate: stamp(row.reviewDate),
    interviewOutcome: textOf(row.interviewOutcome),
    interviewNotes: textOf(row.interviewNotes),
    interviewDate: stamp(row.interviewDate),
    docsStatus: textOf(row.docsStatus),
    onlineOfferedAt: stamp(row.onlineOfferedAt),
    version: row.version,
    assignedStaff: row.assigneeId && row.assigneeEmail
      ? { id: row.assigneeId, name: row.assigneeName || row.assigneeEmail, email: row.assigneeEmail }
      : null,
    positions: positions.map((position) => ({
      authorId: position.authorId,
      authorName: position.authorName || position.authorEmail,
      scores: scoreRecord(position.scores),
      recommendation: textOf(position.recommendation),
      updatedAt: stamp(position.updatedAt),
    })),
    notes: notes.map((note) => ({
      id: note.id,
      authorName: note.authorName || note.authorEmail,
      body: note.body,
      createdAt: stamp(note.createdAt),
    })),
    conflicts: conflictRows,
    offeredMoves: offeredMoves(row),
    prevHref: neighbors.previous,
    nextHref: neighbors.next,
    events: events.map((event) => ({
      at: stamp(event.createdAt),
      actor: event.staffName || event.staffEmail || actorName(event.actor),
      from: textOf(event.fromStatus),
      to: textOf(event.toStatus),
      reason: sentence(event.reason),
    })),
    answers,
    documents,
  };
}

export async function loadReviewers(db: Db): Promise<readonly ReviewerOption[]> {
  const rows = await db
    .select({ id: users.id, name: users.name, email: users.email, role: users.role, disabledAt: users.disabledAt })
    .from(users)
    .orderBy(asc(users.email));
  return rows.flatMap((row) => {
    if (row.disabledAt || !can(row.role, "reviews.write") || !isUserId(row.id)) return [];
    return [{ id: row.id, name: row.name || row.email, email: row.email }];
  });
}

async function listRows(db: Store, query: RecordQuery, viewer: { readonly id: string; readonly role?: string }, limit: number, offset: number): Promise<{ rows: readonly RecordRow[]; total: number }> {
  switch (query.list) {
    case "applicants":
      return applicantRows(db, query, viewer, limit, offset);
    case "nominations":
      return nominationRows(db, query, viewer, limit, offset);
    case "interest":
      return interestRows(db, query, limit, offset);
    case "waitlist":
      return waitlistRows(db, query, limit, offset);
    case "partners":
      return partnerRows(db, query, viewer, limit, offset);
    case messageList:
      return messageRows(db, query, viewer, limit, offset);
    default: {
      const unreachable: never = query.list;
      return unreachable;
    }
  }
}

async function sheetOf(db: Store, query: RecordQuery, viewer: { readonly id: string }): Promise<Sheet | null> {
  switch (query.list) {
    case "applicants":
      return applicantSheet(db, query, viewer);
    case "nominations":
      return nominationSheet(db, query);
    case "interest":
      return interestSheet(db, query);
    case "waitlist":
      return waitlistSheet(db, query);
    case "partners":
      return partnerSheet(db, query);
    case messageList:
      return null;
    default: {
      const unreachable: never = query.list;
      return unreachable;
    }
  }
}

async function messageRows(db: Store, query: RecordQuery, viewer: { readonly role?: string }, limit: number, offset: number): Promise<{ rows: RecordRow[]; total: number }> {
  const listed = await listMessages(db, { q: query.q, status: query.status, limit, offset }, { role: viewer.role ?? "" });
  return {
    total: listed.total,
    rows: listed.rows.map((row) => ({
      id: row.id,
      href: row.href ? detailHref(row.href, query) : null,
      cells: messageCells(row, stamp(row.createdAt)),
    })),
  };
}

function applicantWhere(query: RecordQuery, viewer: { readonly id: string }): SQL | "empty" {
  const status = token(query.status, PIPELINE_ORDER);
  const chosenTrack = token(query.track, track.enumValues);
  const language = token(query.language, appLanguage.enumValues);
  const cycle = query.cycle ? cycleOf(query.cycle) : null;
  if (status === "reject" || chosenTrack === "reject" || language === "reject" || (query.cycle !== "" && cycle === null)) return "empty";
  return whereOf([
    status ? eq(applicants.status, status) : undefined,
    chosenTrack ? eq(applicants.track, chosenTrack) : undefined,
    language ? eq(applicants.language, language) : undefined,
    cycle === null ? undefined : eq(applicants.reviewCycle, cycle),
    query.q
      ? or(matches(applicants.fullName, query.q), matches(applicants.email, query.q), matches(applicants.nationality, query.q), matches(applicants.basedIn, query.q))
      : undefined,
    queueFilter(query, viewer),
  ]) ?? sql`true`;
}

function queueFilter(query: RecordQuery, viewer: { readonly id: string }): SQL | undefined {
  if (!query.queue) return undefined;
  const needs = inArray(applicants.status, [...NEEDS_DECISION_STATUSES]);
  if (query.queue === "needs") return needs;
  if (query.queue === "unassigned") return and(isNull(applicants.assignedStaffId), needs);
  return and(eq(applicants.assignedStaffId, viewer.id), needs);
}

export async function adjacentDetailHrefs(
  db: Db,
  query: RecordQuery,
  current: { readonly id: string; readonly createdAt: Date },
  viewer: { readonly id: string },
): Promise<{ readonly previous: string | null; readonly next: string | null }> {
  const path = detailPath(query.list);
  if (!path) return { previous: null, next: null };
  if (query.list === "messages") {
    const ids = await adjacentMessageIds(db, { q: query.q, status: query.status }, current);
    return {
      previous: ids.previous ? detailHref(`${path}/${ids.previous}`, query) : null,
      next: ids.next ? detailHref(`${path}/${ids.next}`, query) : null,
    };
  }
  const [previous, next] = await Promise.all([
    stepId(db, query, current, viewer, "prev"),
    stepId(db, query, current, viewer, "next"),
  ]);
  return {
    previous: previous ? detailHref(`${path}/${previous}`, query) : null,
    next: next ? detailHref(`${path}/${next}`, query) : null,
  };
}

function detailPath(list: RecordList): string | null {
  if (list === "applicants") return "/admin/records/applicants";
  if (list === "nominations") return "/admin/records/nominations";
  if (list === "partners") return "/admin/records/partners";
  if (list === "messages") return "/admin/records/messages";
  return null;
}

async function stepId(
  db: Db,
  query: RecordQuery,
  current: { readonly id: string; readonly createdAt: Date },
  viewer: { readonly id: string },
  direction: "prev" | "next",
): Promise<string | null> {
  if (query.list === "applicants") return columnStep(db, applicants, applicantWhere(query, viewer), current, direction);
  if (query.list === "nominations") return columnStep(db, nominations, nominationWhere(query), current, direction);
  if (query.list === "partners") return columnStep(db, partnerInquiries, partnerWhere(query), current, direction);
  return null;
}

async function columnStep(
  db: Db,
  table: typeof applicants | typeof nominations | typeof partnerInquiries,
  where: SQL | "empty",
  current: { readonly id: string; readonly createdAt: Date },
  direction: "prev" | "next",
): Promise<string | null> {
  if (where === "empty") return null;
  const closer = direction === "prev"
    ? or(sql`${table.createdAt} > ${current.createdAt}`, and(eq(table.createdAt, current.createdAt), sql`${table.id} > ${current.id}`))
    : or(sql`${table.createdAt} < ${current.createdAt}`, and(eq(table.createdAt, current.createdAt), sql`${table.id} < ${current.id}`));
  const order = direction === "prev" ? [asc(table.createdAt), asc(table.id)] : [desc(table.createdAt), desc(table.id)];
  const [row] = await db.select({ id: table.id }).from(table).where(and(where, closer)).orderBy(...order).limit(1);
  return row?.id ?? null;
}

function scoreRecord(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const scores: Record<string, number> = {};
  for (const [key, item] of Object.entries(value)) {
    if (typeof item === "number" && Number.isInteger(item)) scores[key] = item;
  }
  return scores;
}

function token<T extends string>(value: string, allowed: readonly T[]): T | "reject" | null {
  if (!value) return null;
  return oneOf(value, allowed) ?? "reject";
}

function applicantSelect() {
  return {
    id: applicants.id,
    fullName: applicants.fullName,
    email: applicants.email,
    age: applicants.age,
    track: applicants.track,
    phone: applicants.phone,
    nationality: applicants.nationality,
    basedIn: applicants.basedIn,
    skills: applicants.skills,
    canTravel: applicants.canTravel,
    hasValidPassport: applicants.hasValidPassport,
    language: applicants.language,
    status: applicants.status,
    reviewCycle: applicants.reviewCycle,
    createdAt: applicants.createdAt,
    round1CompletedAt: applicants.round1CompletedAt,
    identityStatus: applicants.identityStatus,
    identityCheckedAt: applicants.identityCheckedAt,
    reviewDecision: applicants.reviewDecision,
    reviewNotes: applicants.reviewNotes,
    reviewer: applicants.reviewer,
    reviewDate: applicants.reviewDate,
    interviewOutcome: applicants.interviewOutcome,
    interviewNotes: applicants.interviewNotes,
    interviewDate: applicants.interviewDate,
    docsStatus: applicants.docsStatus,
    onlineOfferedAt: applicants.onlineOfferedAt,
    version: applicants.version,
  };
}

type ApplicantSafe = Awaited<ReturnType<typeof selectApplicants>>[number];

async function selectApplicants(db: Store, query: RecordQuery, viewer: { readonly id: string }, limit: number | null, offset: number) {
  const where = applicantWhere(query, viewer);
  if (where === "empty") return [];
  const base = db
    .select({ ...applicantSelect(), assigneeName: users.name, assigneeEmail: users.email })
    .from(applicants)
    .leftJoin(users, eq(users.id, applicants.assignedStaffId))
    .where(where)
    .orderBy(desc(applicants.createdAt), desc(applicants.id));
  if (limit === null) return await base;
  return await base.limit(limit).offset(offset);
}

async function applicantRows(db: Store, query: RecordQuery, viewer: { readonly id: string }, limit: number, offset: number): Promise<{ rows: RecordRow[]; total: number }> {
  const where = applicantWhere(query, viewer);
  if (where === "empty") return { rows: [], total: 0 };
  const [rows, totals] = await Promise.all([
    selectApplicants(db, query, viewer, limit, offset),
    db.select({ count: count() }).from(applicants).where(where),
  ]);
  return {
    total: Number(totals[0]?.count ?? 0),
    rows: rows.map((row) => ({
      id: row.id,
      href: detailHref(`/admin/records/applicants/${row.id}`, query),
      version: row.version,
      reviewCycle: row.reviewCycle,
      cells: [row.fullName, row.email, row.track, row.language, STATUS_LABEL[row.status], row.assigneeName || row.assigneeEmail || "", String(row.reviewCycle), stamp(row.createdAt)],
    })),
  };
}

const APPLICANT_CSV = [
  "full_name", "email", "age", "track", "phone", "nationality", "based_in", "skills", "can_travel", "has_valid_passport",
  "language", "status", "review_cycle", "created_at", "round1_completed_at", "identity_status", "identity_checked_at",
  "review_decision", "review_notes", "reviewer", "review_date", "interview_outcome", "interview_notes", "interview_date",
  "docs_status", "online_offered_at", "assigned_staff_email",
] as const;

function applicantCsv(row: ApplicantSafe): readonly string[] {
  return [
    row.fullName, row.email, String(row.age), row.track, textOf(row.phone), textOf(row.nationality), textOf(row.basedIn),
    skillsText(row.skills), flag(row.canTravel), flag(row.hasValidPassport), row.language, row.status, String(row.reviewCycle),
    stamp(row.createdAt), stamp(row.round1CompletedAt), textOf(row.identityStatus), stamp(row.identityCheckedAt),
    textOf(row.reviewDecision), textOf(row.reviewNotes), textOf(row.reviewer), stamp(row.reviewDate),
    textOf(row.interviewOutcome), textOf(row.interviewNotes), stamp(row.interviewDate), textOf(row.docsStatus), stamp(row.onlineOfferedAt),
    textOf(row.assigneeEmail),
  ];
}

async function applicantSheet(db: Store, query: RecordQuery, viewer: { readonly id: string }): Promise<Sheet> {
  const rows = await selectApplicants(db, query, viewer, null, 0);
  return { headers: APPLICANT_CSV, rows: rows.map(applicantCsv) };
}

function nominationWhere(query: RecordQuery): SQL | "empty" {
  const chosenTrack = token(query.track, track.enumValues);
  if (chosenTrack === "reject") return "empty";
  const desk = deskWhere("nomination", sql`${nominations.id}`, { status: query.status, attention: query.attention });
  if (desk === "empty") return "empty";
  return whereOf([
    chosenTrack ? eq(nominations.track, chosenTrack) : undefined,
    query.q
      ? or(
          matches(nominations.nominatorName, query.q),
          matches(nominations.nominatorEmail, query.q),
          matches(nominations.nomineeName, query.q),
          matches(nominations.nomineeEmail, query.q),
        )
      : undefined,
    desk,
  ]) ?? sql`true`;
}

function nominationSelect() {
  const desk = deskColumns("nomination", sql`${nominations.id}`);
  return {
    id: nominations.id,
    createdAt: nominations.createdAt,
    nominatorName: nominations.nominatorName,
    nominatorEmail: nominations.nominatorEmail,
    nominatorPhone: nominations.nominatorPhone,
    nominatorOrganization: nominations.nominatorOrganization,
    nominatorRelation: nominations.nominatorRelation,
    nomineeName: nominations.nomineeName,
    nomineeEmail: nominations.nomineeEmail,
    nomineePhone: nominations.nomineePhone,
    nomineeNationality: nominations.nomineeNationality,
    nomineeBasedIn: nominations.nomineeBasedIn,
    nomineeLocation: nominations.nomineeLocation,
    track: nominations.track,
    status: nominations.status,
    staffStatus: desk.status,
    assigneeEmail: desk.assigneeEmail,
    staffLabel: desk.label,
    assignee: desk.assignee,
  };
}

async function selectNominations(db: Store, query: RecordQuery, limit: number | null, offset: number) {
  const where = nominationWhere(query);
  if (where === "empty") return [];
  const base = db.select(nominationSelect()).from(nominations).where(where).orderBy(desc(nominations.createdAt), desc(nominations.id));
  if (limit === null) return await base;
  return await base.limit(limit).offset(offset);
}

async function nominationRows(db: Store, query: RecordQuery, viewer: { readonly role?: string }, limit: number, offset: number): Promise<{ rows: RecordRow[]; total: number }> {
  const where = nominationWhere(query);
  if (where === "empty") return { rows: [], total: 0 };
  const [rows, totals] = await Promise.all([
    selectNominations(db, query, limit, offset),
    db.select({ count: count() }).from(nominations).where(where),
  ]);
  return {
    total: Number(totals[0]?.count ?? 0),
    rows: rows.map((row) => ({
      id: row.id,
      href: can(viewer.role ?? "", "nominations.read") ? detailHref(`/admin/records/nominations/${row.id}`, query) : null,
      cells: [row.nominatorName, row.nomineeName, row.nomineeEmail, textOf(row.track), row.staffLabel, row.assignee, stamp(row.createdAt)],
    })),
  };
}

async function nominationSheet(db: Store, query: RecordQuery): Promise<Sheet> {
  const rows = await selectNominations(db, query, null, 0);
  return {
    headers: [
      "nominator_name", "nominator_email", "nominator_phone", "nominator_organization", "nominator_relation",
      "nominee_name", "nominee_email", "nominee_phone", "nominee_nationality", "nominee_based_in", "nominee_location",
      "track", "status", "created_at", "staff_status", "assignee_email",
    ],
    rows: rows.map((row) => [
      row.nominatorName, row.nominatorEmail, textOf(row.nominatorPhone), textOf(row.nominatorOrganization), textOf(row.nominatorRelation),
      row.nomineeName, row.nomineeEmail, textOf(row.nomineePhone), textOf(row.nomineeNationality), textOf(row.nomineeBasedIn),
      textOf(row.nomineeLocation), textOf(row.track), row.status, stamp(row.createdAt), row.staffStatus, textOf(row.assigneeEmail),
    ]),
  };
}

function interestWhere(query: RecordQuery): SQL | "empty" {
  const age = token(query.age, ageGroup.enumValues);
  const chosenTrack = token(query.track, track.enumValues);
  if (age === "reject" || chosenTrack === "reject") return "empty";
  return whereOf([
    age ? eq(interest.ageGroup, age) : undefined,
    chosenTrack ? eq(interest.track, chosenTrack) : undefined,
    query.q ? or(matches(interest.name, query.q), matches(interest.email, query.q)) : undefined,
  ]) ?? sql`true`;
}

function interestSelect() {
  return {
    id: interest.id,
    createdAt: interest.createdAt,
    email: interest.email,
    name: interest.name,
    ageGroup: interest.ageGroup,
    track: interest.track,
    source: interest.source,
  };
}

async function selectInterest(db: Store, query: RecordQuery, limit: number | null, offset: number) {
  const where = interestWhere(query);
  if (where === "empty") return [];
  const base = db.select(interestSelect()).from(interest).where(where).orderBy(desc(interest.createdAt), desc(interest.id));
  if (limit === null) return await base;
  return await base.limit(limit).offset(offset);
}

async function interestRows(db: Store, query: RecordQuery, limit: number, offset: number): Promise<{ rows: RecordRow[]; total: number }> {
  const where = interestWhere(query);
  if (where === "empty") return { rows: [], total: 0 };
  const [rows, totals] = await Promise.all([
    selectInterest(db, query, limit, offset),
    db.select({ count: count() }).from(interest).where(where),
  ]);
  return {
    total: Number(totals[0]?.count ?? 0),
    rows: rows.map((row) => ({
      id: row.id,
      href: null,
      cells: [textOf(row.name), row.email, row.ageGroup, textOf(row.track), stamp(row.createdAt)],
    })),
  };
}

async function interestSheet(db: Store, query: RecordQuery): Promise<Sheet> {
  const rows = await selectInterest(db, query, null, 0);
  return {
    headers: ["name", "email", "age_group", "track", "source", "created_at"],
    rows: rows.map((row) => [textOf(row.name), row.email, row.ageGroup, textOf(row.track), textOf(row.source), stamp(row.createdAt)]),
  };
}

function waitlistWhere(query: RecordQuery): SQL | "empty" {
  const status = token(query.status, waitlistStatus.enumValues);
  if (status === "reject") return "empty";
  return whereOf([
    status ? eq(waitlist.status, status) : undefined,
    query.q ? or(matches(waitlist.name, query.q), matches(waitlist.email, query.q)) : undefined,
  ]) ?? sql`true`;
}

function waitlistSelect() {
  return {
    id: waitlist.id,
    createdAt: waitlist.createdAt,
    email: waitlist.email,
    name: waitlist.name,
    source: waitlist.source,
    status: waitlist.status,
  };
}

async function selectWaitlist(db: Store, query: RecordQuery, limit: number | null, offset: number) {
  const where = waitlistWhere(query);
  if (where === "empty") return [];
  const base = db.select(waitlistSelect()).from(waitlist).where(where).orderBy(desc(waitlist.createdAt), desc(waitlist.id));
  if (limit === null) return await base;
  return await base.limit(limit).offset(offset);
}

async function waitlistRows(db: Store, query: RecordQuery, limit: number, offset: number): Promise<{ rows: RecordRow[]; total: number }> {
  const where = waitlistWhere(query);
  if (where === "empty") return { rows: [], total: 0 };
  const [rows, totals] = await Promise.all([
    selectWaitlist(db, query, limit, offset),
    db.select({ count: count() }).from(waitlist).where(where),
  ]);
  return {
    total: Number(totals[0]?.count ?? 0),
    rows: rows.map((row) => ({
      id: row.id,
      href: null,
      cells: [textOf(row.name), row.email, row.status, stamp(row.createdAt)],
    })),
  };
}

async function waitlistSheet(db: Store, query: RecordQuery): Promise<Sheet> {
  const rows = await selectWaitlist(db, query, null, 0);
  return {
    headers: ["name", "email", "source", "status", "created_at"],
    rows: rows.map((row) => [textOf(row.name), row.email, textOf(row.source), row.status, stamp(row.createdAt)]),
  };
}

function partnerWhere(query: RecordQuery): SQL | "empty" {
  const desk = deskWhere("partner", sql`${partnerInquiries.id}`, { status: query.status, attention: query.attention });
  if (desk === "empty") return "empty";
  return whereOf([
    query.q
      ? or(
          matches(partnerInquiries.name, query.q),
          matches(partnerInquiries.email, query.q),
          matches(partnerInquiries.organization, query.q),
          matches(partnerInquiries.support, query.q),
        )
      : undefined,
    desk,
  ]) ?? sql`true`;
}

function partnerSelect() {
  const desk = deskColumns("partner", sql`${partnerInquiries.id}`);
  return {
    id: partnerInquiries.id,
    createdAt: partnerInquiries.createdAt,
    name: partnerInquiries.name,
    email: partnerInquiries.email,
    phone: partnerInquiries.phone,
    organization: partnerInquiries.organization,
    designation: partnerInquiries.designation,
    support: partnerInquiries.support,
    sponsorship: partnerInquiries.sponsorship,
    message: partnerInquiries.message,
    staffStatus: desk.status,
    assigneeEmail: desk.assigneeEmail,
    staffLabel: desk.label,
    assignee: desk.assignee,
  };
}

async function selectPartners(db: Store, query: RecordQuery, limit: number | null, offset: number) {
  const where = partnerWhere(query);
  if (where === "empty") return [];
  const base = db.select(partnerSelect()).from(partnerInquiries).where(where).orderBy(desc(partnerInquiries.createdAt), desc(partnerInquiries.id));
  if (limit === null) return await base;
  return await base.limit(limit).offset(offset);
}

async function partnerRows(db: Store, query: RecordQuery, viewer: { readonly role?: string }, limit: number, offset: number): Promise<{ rows: RecordRow[]; total: number }> {
  const where = partnerWhere(query);
  if (where === "empty") return { rows: [], total: 0 };
  const [rows, totals] = await Promise.all([
    selectPartners(db, query, limit, offset),
    db.select({ count: count() }).from(partnerInquiries).where(where),
  ]);
  return {
    total: Number(totals[0]?.count ?? 0),
    rows: rows.map((row) => ({
      id: row.id,
      href: can(viewer.role ?? "", "partners.read") ? detailHref(`/admin/records/partners/${row.id}`, query) : null,
      cells: [row.name, row.email, row.organization, row.support, row.staffLabel, row.assignee, stamp(row.createdAt)],
    })),
  };
}

async function partnerSheet(db: Store, query: RecordQuery): Promise<Sheet> {
  const rows = await selectPartners(db, query, null, 0);
  return {
    headers: [
      "name", "email", "phone", "organization", "designation", "support", "sponsorship", "message", "created_at",
      "staff_status", "assignee_email",
    ],
    rows: rows.map((row) => [
      row.name, row.email, textOf(row.phone), row.organization, row.designation, row.support, textOf(row.sponsorship), textOf(row.message), stamp(row.createdAt),
      row.staffStatus, textOf(row.assigneeEmail),
    ]),
  };
}

export function csvCell(value: string): string {
  const guarded = /^[\s]*[=+\-@]|^[\t\r]/.test(value) ? `'${value}` : value;
  if (/[",\n\r]/.test(guarded)) return `"${guarded.replace(/"/g, '""')}"`;
  return guarded;
}

function toCsv(headers: readonly string[], rows: readonly (readonly string[])[]): string {
  const lines = [headers.map(csvCell).join(",")];
  for (const row of rows) lines.push(row.map(csvCell).join(","));
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}
