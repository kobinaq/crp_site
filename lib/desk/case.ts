import { and, asc, eq, inArray, isNull, sql, type SQL, type SQLWrapper } from "drizzle-orm";
import { recordEvent } from "@/lib/admin/events";
import type { RecordList } from "@/lib/admin/records";
import {
  deskCases,
  deskNotes,
  nominations,
  partnerInquiries,
  users,
  type Db,
  type Store,
  type Tx,
} from "@/lib/db";
import type { Staff } from "@/lib/staff/auth";
import { can, USER_ROLES, type Capability, type UserRole } from "@/lib/staff/roles";
import { isUserId } from "@/lib/staff/users";

export type DeskId = "nomination" | "partner";

type Node = { readonly id: string; readonly label: string; readonly open: boolean };
type Machine = {
  readonly initial: "new";
  readonly nodes: readonly Node[];
  readonly edges: readonly (readonly [string, string])[];
};

const MACHINES = {
  nomination: {
    initial: "new",
    nodes: [
      { id: "new", label: "New", open: true },
      { id: "reviewing", label: "Reviewing", open: true },
      { id: "contacted", label: "Contacted", open: true },
      { id: "converted", label: "Converted to applicant", open: false },
      { id: "closed", label: "Closed", open: false },
    ],
    edges: [
      ["new", "reviewing"],
      ["new", "closed"],
      ["reviewing", "contacted"],
      ["reviewing", "closed"],
      ["contacted", "converted"],
      ["contacted", "closed"],
      ["closed", "new"],
      ["converted", "new"],
    ],
  },
  partner: {
    initial: "new",
    nodes: [
      { id: "new", label: "New", open: true },
      { id: "in_conversation", label: "In conversation", open: true },
      { id: "committed", label: "Committed", open: false },
      { id: "declined", label: "Declined", open: false },
      { id: "closed", label: "Closed", open: false },
    ],
    edges: [
      ["new", "in_conversation"],
      ["new", "declined"],
      ["new", "closed"],
      ["in_conversation", "committed"],
      ["in_conversation", "declined"],
      ["in_conversation", "closed"],
      ["closed", "new"],
      ["committed", "new"],
      ["declined", "new"],
    ],
  },
} as const satisfies Record<DeskId, Machine>;

export type NominationStatus = (typeof MACHINES.nomination.nodes)[number]["id"];
export type PartnerStatus = (typeof MACHINES.partner.nodes)[number]["id"];

const VERBS = {
  nomination: { read: "nominations.read", note: "nominations.note", manage: "nominations.manage" },
  partner: { read: "partners.read", note: "partners.manage", manage: "partners.manage" },
} as const satisfies Record<DeskId, { read: Capability; note: Capability; manage: Capability }>;

function managersOf(desk: DeskId): readonly UserRole[] {
  return USER_ROLES.filter((role) => can(role, VERBS[desk].manage));
}

export function isNominationStatus(value: string): value is NominationStatus {
  return MACHINES.nomination.nodes.some((node) => node.id === value);
}

export function isPartnerStatus(value: string): value is PartnerStatus {
  return MACHINES.partner.nodes.some((node) => node.id === value);
}

export function legalMove(desk: DeskId, from: string, to: string): boolean {
  if (from === to) return true;
  return MACHINES[desk].edges.some((edge) => edge[0] === from && edge[1] === to);
}

export function needsAttention(
  desk: DeskId,
  status: string,
  assignee: { readonly role: string; readonly disabled: boolean } | null,
): boolean {
  const node = MACHINES[desk].nodes.find((item) => item.id === status);
  if (!node?.open) return false;
  if (!assignee || assignee.disabled) return true;
  return !managersOf(desk).some((role) => role === assignee.role);
}

export function statusOptions(desk: DeskId): readonly (readonly [string, string])[] {
  return MACHINES[desk].nodes.map((node) => [node.id, node.label]);
}

export function deskOfList(list: RecordList): DeskId | null {
  if (list === "nominations") return "nomination";
  if (list === "partners") return "partner";
  return null;
}

export function listOfDesk(desk: DeskId): "nominations" | "partners" {
  if (desk === "nomination") return "nominations";
  return "partners";
}

export type NoteCommand = {
  readonly desk: DeskId;
  readonly recordId: string;
  readonly noteId: string;
  readonly body: string;
};

export type MoveCommand =
  | { readonly desk: "nomination"; readonly recordId: string; readonly expected: NominationStatus; readonly to: NominationStatus }
  | { readonly desk: "partner"; readonly recordId: string; readonly expected: PartnerStatus; readonly to: PartnerStatus };

export type AssignCommand = {
  readonly desk: DeskId;
  readonly recordId: string;
  readonly assigneeId: string | null;
  readonly expectedAssigneeId: string | null;
};

export type DeskResult =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly reason: "forbidden" | "invalid" | "not_found" | "conflict" | "illegal" | "invalid_assignee";
    };

export type DeskSummary = {
  readonly desk: DeskId;
  readonly list: "nominations" | "partners";
  readonly total: number;
  readonly needsAttention: number;
  readonly counts: readonly { readonly status: string; readonly label: string; readonly count: number }[];
};

export type DeskDetail = {
  readonly desk: DeskId;
  readonly recordId: string;
  readonly heading: string;
  readonly status: string;
  readonly statusLabel: string;
  readonly assignee: { readonly id: string; readonly name: string; readonly email: string } | null;
  readonly moves: readonly { readonly to: string; readonly label: string }[];
  readonly canNote: boolean;
  readonly canAssign: boolean;
  readonly assignees: readonly { readonly id: string; readonly name: string; readonly email: string }[];
  readonly notes: readonly { readonly id: string; readonly authorName: string; readonly body: string; readonly createdAt: string }[];
  readonly fields: readonly { readonly label: string; readonly value: string }[];
  readonly createdAt: Date;
};

const INTAKE_TABLE = {
  nomination: "nominations",
  partner: "partner_inquiries",
} as const;

export async function addNote(db: Db, actor: Staff, command: NoteCommand): Promise<DeskResult> {
  if (!can(actor.role, VERBS[command.desk].note)) return { ok: false, reason: "forbidden" };
  const body = command.body.trim();
  if (!isUserId(command.noteId) || !isUserId(command.recordId) || body.length < 1 || body.length > 4000) {
    return { ok: false, reason: "invalid" };
  }
  return db.transaction(async (tx) => {
    if (!await lockIntake(tx, command.desk, command.recordId)) return { ok: false, reason: "not_found" };
    const inserted = await tx
      .insert(deskNotes)
      .values({
        id: command.noteId,
        desk: command.desk,
        recordId: command.recordId,
        authorId: actor.id,
        body,
      })
      .onConflictDoNothing()
      .returning({ id: deskNotes.id });
    if (!inserted[0]) return { ok: true };
    await recordEvent(tx, actor.id, command.desk === "nomination"
      ? { kind: "nomination.noted", nominationId: command.recordId, noteId: command.noteId }
      : { kind: "partner.noted", partnerId: command.recordId, noteId: command.noteId });
    return { ok: true };
  });
}

export async function moveStatus(db: Db, actor: Staff, command: MoveCommand): Promise<DeskResult> {
  if (!can(actor.role, VERBS[command.desk].manage)) return { ok: false, reason: "forbidden" };
  if (!isUserId(command.recordId)) return { ok: false, reason: "invalid" };
  return db.transaction(async (tx) => {
    if (!await lockIntake(tx, command.desk, command.recordId)) return { ok: false, reason: "not_found" };
    const existing = await readCase(tx, command.desk, command.recordId);
    const current = existing?.status ?? MACHINES[command.desk].initial;
    if (current !== command.expected) return { ok: false, reason: "conflict" };
    if (current === command.to) return { ok: true };
    if (!legalMove(command.desk, current, command.to)) return { ok: false, reason: "illegal" };
    if (command.desk === "nomination") {
      if (!isNominationStatus(current)) return { ok: false, reason: "illegal" };
      if (!await writeStatus(tx, command, existing !== undefined)) return { ok: false, reason: "conflict" };
      await recordEvent(tx, actor.id, {
        kind: "nomination.status",
        nominationId: command.recordId,
        from: current,
        to: command.to,
      });
      return { ok: true };
    }
    if (!isPartnerStatus(current)) return { ok: false, reason: "illegal" };
    if (!await writeStatus(tx, command, existing !== undefined)) return { ok: false, reason: "conflict" };
    await recordEvent(tx, actor.id, {
      kind: "partner.status",
      partnerId: command.recordId,
      from: current,
      to: command.to,
    });
    return { ok: true };
  });
}

export async function assignStaff(db: Db, actor: Staff, command: AssignCommand): Promise<DeskResult> {
  if (!can(actor.role, VERBS[command.desk].manage)) return { ok: false, reason: "forbidden" };
  if (!isUserId(command.recordId)) return { ok: false, reason: "invalid" };
  if (command.assigneeId !== null && !isUserId(command.assigneeId)) return { ok: false, reason: "invalid" };
  return db.transaction(async (tx) => {
    if (!await lockIntake(tx, command.desk, command.recordId)) return { ok: false, reason: "not_found" };
    const existing = await readCase(tx, command.desk, command.recordId);
    const current = existing?.assigneeId ?? null;
    if (current !== command.expectedAssigneeId) return { ok: false, reason: "conflict" };
    if (current === command.assigneeId) return { ok: true };
    if (command.assigneeId !== null && !await managesDesk(tx, command.desk, command.assigneeId)) {
      return { ok: false, reason: "invalid_assignee" };
    }
    if (!existing) {
      const inserted = await tx
        .insert(deskCases)
        .values({
          desk: command.desk,
          recordId: command.recordId,
          status: MACHINES[command.desk].initial,
          assigneeId: command.assigneeId,
        })
        .onConflictDoNothing()
        .returning({ desk: deskCases.desk });
      if (!inserted[0]) return { ok: false, reason: "conflict" };
    } else {
      const updated = await tx
        .update(deskCases)
        .set({ assigneeId: command.assigneeId })
        .where(and(
          eq(deskCases.desk, command.desk),
          eq(deskCases.recordId, command.recordId),
          sql`${deskCases.assigneeId} is not distinct from ${command.expectedAssigneeId}`,
        ))
        .returning({ desk: deskCases.desk });
      if (!updated[0]) return { ok: false, reason: "conflict" };
    }
    await recordEvent(tx, actor.id, command.desk === "nomination"
      ? {
          kind: "nomination.assigned",
          subject: command.assigneeId,
          nominationId: command.recordId,
          assigneeId: command.assigneeId,
          previousAssigneeId: current,
        }
      : {
          kind: "partner.assigned",
          subject: command.assigneeId,
          partnerId: command.recordId,
          assigneeId: command.assigneeId,
          previousAssigneeId: current,
        });
    return { ok: true };
  });
}

export async function loadDetail(db: Db, actor: Staff, desk: DeskId, recordId: string): Promise<DeskDetail | null> {
  if (!can(actor.role, VERBS[desk].read) || !isUserId(recordId)) return null;
  const intake = desk === "nomination" ? await nominationFields(db, recordId) : await partnerFields(db, recordId);
  if (!intake) return null;
  const [caseRow] = await db
    .select({
      status: deskCases.status,
      assigneeId: deskCases.assigneeId,
      assigneeName: users.name,
      assigneeEmail: users.email,
    })
    .from(deskCases)
    .leftJoin(users, eq(users.id, deskCases.assigneeId))
    .where(and(eq(deskCases.desk, desk), eq(deskCases.recordId, recordId)));
  const status = caseRow?.status ?? MACHINES[desk].initial;
  const assignee = caseRow?.assigneeId && caseRow.assigneeEmail
    ? { id: caseRow.assigneeId, name: caseRow.assigneeName ?? "", email: caseRow.assigneeEmail }
    : null;
  return {
    desk,
    recordId,
    heading: intake.heading,
    status,
    statusLabel: labelOf(desk, status),
    assignee,
    moves: movesFrom(desk, status, actor),
    canNote: can(actor.role, VERBS[desk].note),
    canAssign: can(actor.role, VERBS[desk].manage),
    assignees: await managerChoices(db, desk, actor),
    notes: await noteRows(db, desk, recordId),
    fields: intake.fields,
    createdAt: intake.createdAt,
  };
}

export async function loadDeskSummary(tx: Store, desk: DeskId): Promise<DeskSummary> {
  const initial = MACHINES[desk].initial;
  const grouped = rowsOf(await tx.execute(sql`
    select coalesce(c.status, ${initial}) as status, count(*)::int as count
    from ${sql.raw(INTAKE_TABLE[desk])} n
    left join desk_cases c on c.desk = ${desk} and c.record_id = n.id
    group by 1
  `));
  const found = new Map(grouped.map((row) => [String(row.status), Number(row.count)]));
  const counts = MACHINES[desk].nodes.map((node) => ({
    status: node.id,
    label: node.label,
    count: found.get(node.id) ?? 0,
  }));
  const attention = rowsOf(await tx.execute(sql`
    select count(*)::int as count
    from ${sql.raw(INTAKE_TABLE[desk])} n
    where ${needsAttentionSql(desk, sql`n.id`)}
  `));
  return {
    desk,
    list: listOfDesk(desk),
    total: counts.reduce((sum, row) => sum + row.count, 0),
    needsAttention: Number(attention[0]?.count ?? 0),
    counts,
  };
}

export function deskWhere(
  desk: DeskId,
  recordId: SQLWrapper,
  query: { readonly status: string; readonly attention: "" | "needs" },
): SQL | "empty" {
  if (query.status && !MACHINES[desk].nodes.some((node) => node.id === query.status)) return "empty";
  const parts: SQL[] = [];
  if (query.status) parts.push(sql`${effectiveStatus(desk, recordId)} = ${query.status}`);
  if (query.attention === "needs") parts.push(needsAttentionSql(desk, recordId));
  if (parts.length === 0) return sql`true`;
  if (parts.length === 1) return parts[0];
  return sql`${parts[0]} and ${parts[1]}`;
}

export function deskColumns(desk: DeskId, recordId: SQLWrapper): {
  readonly status: SQL<string>;
  readonly label: SQL<string>;
  readonly assigneeEmail: SQL<string | null>;
  readonly assignee: SQL<string>;
} {
  const whens = sql.join(MACHINES[desk].nodes.map((node) => sql`when ${node.id} then ${node.label}`), sql` `);
  return {
    status: effectiveStatus(desk, recordId),
    label: sql<string>`case ${effectiveStatus(desk, recordId)} ${whens} else ${MACHINES[desk].nodes[0].label} end`,
    assigneeEmail: sql<string | null>`(
      select u.email from desk_cases c
      join users u on u.id = c.assignee_id
      where c.desk = ${desk} and c.record_id = ${recordId}
    )`,
    assignee: sql<string>`coalesce((
      select coalesce(nullif(u.name, ''), u.email) from desk_cases c
      join users u on u.id = c.assignee_id
      where c.desk = ${desk} and c.record_id = ${recordId}
    ), '')`,
  };
}

function openIds(desk: DeskId): readonly string[] {
  return MACHINES[desk].nodes.filter((node) => node.open).map((node) => node.id);
}

function labelOf(desk: DeskId, status: string): string {
  return MACHINES[desk].nodes.find((node) => node.id === status)?.label ?? status;
}

function effectiveStatus(desk: DeskId, recordId: SQLWrapper): SQL<string> {
  return sql<string>`coalesce((select c.status from desk_cases c where c.desk = ${desk} and c.record_id = ${recordId}), ${MACHINES[desk].initial})`;
}

function needsAttentionSql(desk: DeskId, recordId: SQLWrapper): SQL {
  const managers = managersOf(desk);
  const qualified = managers.length === 0
    ? sql`false`
    : sql`u.disabled_at is null and u.role in (${sqlList(managers)})`;
  return sql`coalesce((select c.status from desk_cases c where c.desk = ${desk} and c.record_id = ${recordId}), ${MACHINES[desk].initial}) in (${sqlList(openIds(desk))})
    and not exists (
      select 1 from desk_cases c
      join users u on u.id = c.assignee_id
      where c.desk = ${desk}
        and c.record_id = ${recordId}
        and ${qualified}
    )`;
}

function sqlList(values: readonly string[]): SQL {
  return sql.join(values.map((value) => sql`${value}`), sql`, `);
}

function movesFrom(desk: DeskId, status: string, actor: Staff): readonly { readonly to: string; readonly label: string }[] {
  if (!can(actor.role, VERBS[desk].manage)) return [];
  return MACHINES[desk].edges
    .filter((edge) => edge[0] === status)
    .map((edge) => ({ to: edge[1], label: labelOf(desk, edge[1]) }));
}

async function lockIntake(tx: Tx, desk: DeskId, recordId: string): Promise<boolean> {
  if (desk === "nomination") {
    const [row] = await tx.select({ id: nominations.id }).from(nominations).where(eq(nominations.id, recordId)).for("update");
    return Boolean(row);
  }
  const [row] = await tx.select({ id: partnerInquiries.id }).from(partnerInquiries).where(eq(partnerInquiries.id, recordId)).for("update");
  return Boolean(row);
}

async function readCase(tx: Tx, desk: DeskId, recordId: string): Promise<{ status: string; assigneeId: string | null } | undefined> {
  const [row] = await tx
    .select({ status: deskCases.status, assigneeId: deskCases.assigneeId })
    .from(deskCases)
    .where(and(eq(deskCases.desk, desk), eq(deskCases.recordId, recordId)));
  return row;
}

async function writeStatus(tx: Tx, command: MoveCommand, exists: boolean): Promise<boolean> {
  if (!exists) {
    const inserted = await tx
      .insert(deskCases)
      .values({ desk: command.desk, recordId: command.recordId, status: command.to })
      .onConflictDoNothing()
      .returning({ status: deskCases.status });
    return Boolean(inserted[0]);
  }
  const updated = await tx
    .update(deskCases)
    .set({ status: command.to })
    .where(and(
      eq(deskCases.desk, command.desk),
      eq(deskCases.recordId, command.recordId),
      eq(deskCases.status, command.expected),
    ))
    .returning({ status: deskCases.status });
  return Boolean(updated[0]);
}

async function managesDesk(tx: Tx, desk: DeskId, userId: string): Promise<boolean> {
  const [user] = await tx.select({ role: users.role, disabledAt: users.disabledAt }).from(users).where(eq(users.id, userId));
  if (!user || user.disabledAt) return false;
  return managersOf(desk).some((role) => role === user.role);
}

async function managerChoices(db: Store, desk: DeskId, actor: Staff): Promise<readonly { id: string; name: string; email: string }[]> {
  if (!can(actor.role, VERBS[desk].manage)) return [];
  const roles = managersOf(desk);
  if (roles.length === 0) return [];
  const rows = await db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .where(and(isNull(users.disabledAt), inArray(users.role, [...roles])))
    .orderBy(asc(users.email));
  return rows.map((row) => ({ id: row.id, name: row.name ?? "", email: row.email }));
}

async function noteRows(db: Store, desk: DeskId, recordId: string) {
  const rows = await db
    .select({
      id: deskNotes.id,
      body: deskNotes.body,
      createdAt: deskNotes.createdAt,
      authorName: users.name,
      authorEmail: users.email,
    })
    .from(deskNotes)
    .leftJoin(users, eq(users.id, deskNotes.authorId))
    .where(and(eq(deskNotes.desk, desk), eq(deskNotes.recordId, recordId)))
    .orderBy(asc(deskNotes.createdAt), asc(deskNotes.id));
  return rows.map((row) => ({
    id: row.id,
    authorName: row.authorName || row.authorEmail || "Former staff",
    body: row.body,
    createdAt: stamp(row.createdAt),
  }));
}

async function nominationFields(db: Store, recordId: string): Promise<{ heading: string; createdAt: Date; fields: DeskDetail["fields"] } | null> {
  const [row] = await db
    .select({
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
      intakeStatus: nominations.status,
      createdAt: nominations.createdAt,
    })
    .from(nominations)
    .where(eq(nominations.id, recordId));
  if (!row) return null;
  return {
    heading: row.nomineeName,
    createdAt: row.createdAt,
    fields: [
      ["Nominator name", row.nominatorName],
      ["Nominator email", row.nominatorEmail],
      ["Nominator phone", shown(row.nominatorPhone)],
      ["Nominator organization", shown(row.nominatorOrganization)],
      ["Relation to nominee", shown(row.nominatorRelation)],
      ["Nominee name", row.nomineeName],
      ["Nominee email", row.nomineeEmail],
      ["Nominee phone", shown(row.nomineePhone)],
      ["Nominee nationality", shown(row.nomineeNationality)],
      ["Nominee based in", shown(row.nomineeBasedIn)],
      ["Nominee location", shown(row.nomineeLocation)],
      ["Track", shown(row.track)],
      ["Nominee status", row.intakeStatus],
      ["Received", stamp(row.createdAt)],
    ].map(([label, value]) => ({ label, value })),
  };
}

async function partnerFields(db: Store, recordId: string): Promise<{ heading: string; createdAt: Date; fields: DeskDetail["fields"] } | null> {
  const [row] = await db
    .select({
      name: partnerInquiries.name,
      email: partnerInquiries.email,
      phone: partnerInquiries.phone,
      organization: partnerInquiries.organization,
      designation: partnerInquiries.designation,
      support: partnerInquiries.support,
      sponsorship: partnerInquiries.sponsorship,
      message: partnerInquiries.message,
      createdAt: partnerInquiries.createdAt,
    })
    .from(partnerInquiries)
    .where(eq(partnerInquiries.id, recordId));
  if (!row) return null;
  return {
    heading: row.organization,
    createdAt: row.createdAt,
    fields: [
      ["Name", row.name],
      ["Email", row.email],
      ["Phone", shown(row.phone)],
      ["Organization", row.organization],
      ["Job title", row.designation],
      ["Support", row.support],
      ["Sponsorship", shown(row.sponsorship)],
      ["Message", shown(row.message)],
      ["Received", stamp(row.createdAt)],
    ].map(([label, value]) => ({ label, value })),
  };
}

function shown(value: string | null | undefined): string {
  return value ?? "";
}

function stamp(value: Date | null | undefined): string {
  return value ? value.toISOString().slice(0, 16).replace("T", " ") : "";
}

function rowsOf(result: unknown): Record<string, unknown>[] {
  const rows = Array.isArray(result)
    ? result
    : result && typeof result === "object" && "rows" in result && Array.isArray(result.rows)
      ? result.rows
      : [];
  return rows.flatMap((row) => (row && typeof row === "object" ? [row as Record<string, unknown>] : []));
}
