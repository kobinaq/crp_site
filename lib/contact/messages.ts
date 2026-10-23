import { and, asc, count, desc, eq, gte, or, sql, type SQL, type SQLWrapper } from "drizzle-orm";
import { z } from "zod";
import { recordEvent } from "@/lib/admin/events";
import { COUNTRIES } from "@/lib/countries";
import { normalizeEmail } from "@/lib/capture";
import { contactMessages, contactNotes, users, type Db, type Store, type Tx } from "@/lib/db";
import { CONTACT_EMAIL_TEMPLATE, contactEmail } from "@/lib/emails";
import { enqueueEmail } from "@/lib/jobs";
import { loadEmailSources } from "@/lib/copy/read";
import { isLocale, type Locale } from "@/lib/locale";
import { verifyTurnstile } from "@/lib/turnstile";
import { rateLimit } from "@/lib/rate-limit";
import type { Staff } from "@/lib/staff/auth";
import { can } from "@/lib/staff/roles";
import { isUserId, type UserId } from "@/lib/staff/users";
import type { DeskId } from "@/lib/desk/case";
import {
  CONTACT_LIMITS,
  CONTACT_RATE,
  CONTACT_STATUS_LABEL,
  NEW_MESSAGE_STATUS,
  applyAssign,
  applyContactVerb,
  contactEmailDedupeKey,
  contactRateScopes,
  deskStateOf,
  formatPhone,
  honeypotFilled,
  isContactStatus,
  messageHref,
  parseContactBody,
  parseContactName,
  parseDial,
  parseNational,
  parseNoteBody,
  parseOrganization,
  turnstileTokenOf,
  verbsFor,
  type ContactAddress,
  type ContactIntake,
  type ContactStatus,
  type ContactSubmitResult,
  type ContactVerb,
  type MessageDetail,
  type MessageId,
  type MessageListRow,
  type NoteId,
  type StoredPhone,
} from "@/lib/contact/model";

type DeskStaysClosed = Exclude<DeskId, "nomination" | "partner"> extends never ? true : never;
export const deskStaysClosed: DeskStaysClosed = true;

const knownDials = COUNTRIES.map((country) => country.dial);

function parseContactEmail(value: unknown): ContactAddress | null {
  if (typeof value !== "string") return null;
  const parsed = z.string().trim().max(CONTACT_LIMITS.emailMax).transform(normalizeEmail).pipe(z.email()).safeParse(value);
  if (!parsed.success || parsed.data.length < CONTACT_LIMITS.emailMin) return null;
  return parsed.data as ContactAddress;
}

export function parseContactIntake(raw: unknown, dials: readonly string[] = knownDials): ContactIntake | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  const name = parseContactName(record.name);
  const organization = parseOrganization(record.organization);
  const body = parseContactBody(record.message);
  const dial = parseDial(record.dial, dials);
  const national = parseNational(record.nationalNumber);
  const email = parseContactEmail(record.email);
  if (!name || !organization.ok || !body || !dial || !national || !email) return null;
  const locale: Locale = typeof record.locale === "string" && isLocale(record.locale) ? record.locale : "en";
  return {
    name,
    organization: organization.value,
    email,
    phone: formatPhone(dial, national),
    body,
    locale,
  };
}

export async function acceptContactMessage(db: Db, raw: unknown, ip: string): Promise<ContactSubmitResult> {
  if (honeypotFilled(raw)) return { ok: true };
  if (!(await verifyTurnstile(turnstileTokenOf(raw), ip))) return { ok: false, reason: "turnstile" };
  const intake = parseContactIntake(raw);
  if (!intake) return { ok: false, reason: "invalid" };
  const scopes = contactRateScopes();
  const [ipOk, emailOk] = await Promise.all([
    rateLimit(scopes.ip, ip, CONTACT_RATE.perIp, CONTACT_RATE.windowSeconds),
    rateLimit(scopes.email, intake.email, CONTACT_RATE.perEmail, CONTACT_RATE.windowSeconds),
  ]);
  if (!ipOk || !emailOk) return { ok: false, reason: "rate_limited" };
  const sources = await loadEmailSources();
  await db.transaction(async (tx) => {
    const [row] = await tx.insert(contactMessages).values({
      name: intake.name,
      email: intake.email,
      organization: intake.organization,
      phone: intake.phone,
      body: intake.body,
      locale: intake.locale,
    }).returning({ id: contactMessages.id });
    const id = row.id as MessageId;
    await enqueueEmail(
      tx,
      contactEmailDedupeKey(id),
      { to: intake.email, ...contactEmail(intake.name, intake.locale, sources) },
      CONTACT_EMAIL_TEMPLATE,
    );
  });
  return { ok: true };
}

export function parseMessageId(raw: string): MessageId | null {
  return isUserId(raw) ? (raw as unknown as MessageId) : null;
}

export function parseNoteId(raw: string): NoteId | null {
  return isUserId(raw) ? (raw as unknown as NoteId) : null;
}

export type MessageCommand =
  | { readonly kind: ContactVerb; readonly messageId: MessageId; readonly expected: ContactStatus }
  | { readonly kind: "assign"; readonly messageId: MessageId; readonly assigneeId: UserId | null; readonly expectedAssigneeId: UserId | null }
  | { readonly kind: "note"; readonly messageId: MessageId; readonly noteId: NoteId; readonly body: string };

export type MessageResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: "forbidden" | "invalid" | "not_found" | "conflict" | "illegal" | "invalid_assignee" };

export async function changeMessage(db: Db, actor: Staff, command: MessageCommand): Promise<MessageResult> {
  if (!can(actor.role, "messages.manage")) return { ok: false, reason: "forbidden" };
  return db.transaction(async (tx) => {
    const [locked] = await tx
      .select({
        status: contactMessages.status,
        readAt: contactMessages.readAt,
        assigneeId: contactMessages.assigneeId,
      })
      .from(contactMessages)
      .where(eq(contactMessages.id, command.messageId))
      .for("update");
    if (!locked) return { ok: false, reason: "not_found" };
    if (command.kind === "note") return addMessageNote(tx, actor, command);
    if (command.kind === "assign") return assignMessage(tx, actor, command, locked.assigneeId);
    return moveMessage(tx, actor, command, locked.status, locked.readAt);
  });
}

async function moveMessage(
  tx: Tx,
  actor: Staff,
  command: Extract<MessageCommand, { kind: ContactVerb }>,
  status: string,
  readAt: Date | null,
): Promise<MessageResult> {
  const state = deskStateOf(status, readAt);
  if (!state) return { ok: false, reason: "illegal" };
  const effect = applyContactVerb(state, command.kind, command.expected, new Date());
  if (effect.kind === "same") return { ok: true };
  if (effect.kind === "illegal") return { ok: false, reason: "illegal" };
  if (effect.kind === "conflict") return { ok: false, reason: "conflict" };
  const updated = await tx
    .update(contactMessages)
    .set(effect.readAtWrite === "set-once"
      ? { status: effect.next.status, readAt: effect.next.readAt }
      : { status: effect.next.status })
    .where(and(eq(contactMessages.id, command.messageId), eq(contactMessages.status, state.status)))
    .returning({ id: contactMessages.id });
  if (!updated[0]) return { ok: false, reason: "conflict" };
  await recordEvent(tx, actor.id, {
    kind: "contact.status",
    messageId: command.messageId,
    from: state.status,
    to: effect.next.status,
  });
  return { ok: true };
}

async function assignMessage(
  tx: Tx,
  actor: Staff,
  command: Extract<MessageCommand, { kind: "assign" }>,
  current: string | null,
): Promise<MessageResult> {
  const currentId = current && isUserId(current) ? current : null;
  const effect = applyAssign(currentId, command.expectedAssigneeId, command.assigneeId);
  if (effect.kind === "same") return { ok: true };
  if (effect.kind === "conflict") return { ok: false, reason: "conflict" };
  if (effect.assigneeId) {
    const [user] = await tx
      .select({ role: users.role, disabledAt: users.disabledAt })
      .from(users)
      .where(eq(users.id, effect.assigneeId));
    if (!user || user.disabledAt || !can(user.role, "messages.manage")) return { ok: false, reason: "invalid_assignee" };
  }
  const updated = await tx
    .update(contactMessages)
    .set({ assigneeId: effect.assigneeId })
    .where(and(eq(contactMessages.id, command.messageId), sql`${contactMessages.assigneeId} is not distinct from ${current}`))
    .returning({ id: contactMessages.id });
  if (!updated[0]) return { ok: false, reason: "conflict" };
  await recordEvent(tx, actor.id, {
    kind: "contact.assigned",
    subject: effect.assigneeId,
    messageId: command.messageId,
    assigneeId: effect.assigneeId,
    previousAssigneeId: currentId,
  });
  return { ok: true };
}

async function addMessageNote(
  tx: Tx,
  actor: Staff,
  command: Extract<MessageCommand, { kind: "note" }>,
): Promise<MessageResult> {
  const body = parseNoteBody(command.body);
  if (!body) return { ok: false, reason: "invalid" };
  const inserted = await tx
    .insert(contactNotes)
    .values({
      id: command.noteId,
      messageId: command.messageId,
      authorId: actor.id,
      body,
    })
    .onConflictDoNothing()
    .returning({ id: contactNotes.id });
  if (!inserted[0]) return { ok: true };
  await recordEvent(tx, actor.id, {
    kind: "contact.noted",
    messageId: command.messageId,
    noteId: command.noteId,
  });
  return { ok: true };
}

function likePattern(value: string): string {
  return `%${value.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}

function matches(column: SQLWrapper, value: string): SQL {
  return sql`${column} ilike ${likePattern(value)} escape '\\'`;
}

export async function listMessages(
  db: Store,
  query: { readonly q: string; readonly status: string; readonly limit: number; readonly offset: number },
  viewer: { readonly role: string },
): Promise<{ readonly rows: readonly MessageListRow[]; readonly total: number }> {
  if (query.status && !isContactStatus(query.status)) return { rows: [], total: 0 };
  const where = and(
    query.status && isContactStatus(query.status) ? eq(contactMessages.status, query.status) : undefined,
    query.q
      ? or(
          matches(contactMessages.name, query.q),
          matches(contactMessages.email, query.q),
          matches(contactMessages.organization, query.q),
          matches(contactMessages.phone, query.q),
          matches(contactMessages.body, query.q),
        )
      : undefined,
  );
  const [rows, totals] = await Promise.all([
    db
      .select({
        id: contactMessages.id,
        name: contactMessages.name,
        email: contactMessages.email,
        organization: contactMessages.organization,
        status: contactMessages.status,
        assigneeName: users.name,
        assigneeEmail: users.email,
        createdAt: contactMessages.createdAt,
      })
      .from(contactMessages)
      .leftJoin(users, eq(users.id, contactMessages.assigneeId))
      .where(where)
      .orderBy(desc(contactMessages.createdAt), desc(contactMessages.id))
      .limit(query.limit)
      .offset(query.offset),
    db.select({ count: count() }).from(contactMessages).where(where),
  ]);
  const readable = can(viewer.role, "messages.read");
  return {
    total: Number(totals[0]?.count ?? 0),
    rows: rows.flatMap((row) => {
      if (!isContactStatus(row.status) || !isUserId(row.id)) return [];
      const id = row.id as unknown as MessageId;
      return [{
        id,
        href: readable ? messageHref(id) : null,
        name: row.name,
        email: row.email,
        organization: row.organization,
        status: row.status,
        assignee: row.assigneeName || row.assigneeEmail || "Unassigned",
        createdAt: row.createdAt,
      }];
    }),
  };
}

async function messageAssignees(db: Store): Promise<MessageDetail["assignees"]> {
  const rows = await db
    .select({ id: users.id, name: users.name, email: users.email, role: users.role, disabledAt: users.disabledAt })
    .from(users)
    .orderBy(asc(users.email));
  return rows.flatMap((row) => {
    if (row.disabledAt || !can(row.role, "messages.manage") || !isUserId(row.id)) return [];
    return [{ id: row.id, name: row.name || row.email, email: row.email }];
  });
}

export async function loadMessage(db: Store, actor: { readonly role: string }, id: MessageId): Promise<MessageDetail | null> {
  if (!can(actor.role, "messages.read")) return null;
  const [row] = await db
    .select({
      name: contactMessages.name,
      email: contactMessages.email,
      organization: contactMessages.organization,
      phone: contactMessages.phone,
      body: contactMessages.body,
      locale: contactMessages.locale,
      status: contactMessages.status,
      readAt: contactMessages.readAt,
      createdAt: contactMessages.createdAt,
      assigneeId: users.id,
      assigneeName: users.name,
      assigneeEmail: users.email,
    })
    .from(contactMessages)
    .leftJoin(users, eq(users.id, contactMessages.assigneeId))
    .where(eq(contactMessages.id, id));
  if (!row || !isLocale(row.locale)) return null;
  const state = deskStateOf(row.status, row.readAt);
  if (!state) return null;
  const notes = await db
    .select({
      id: contactNotes.id,
      authorName: users.name,
      authorEmail: users.email,
      body: contactNotes.body,
      createdAt: contactNotes.createdAt,
    })
    .from(contactNotes)
    .innerJoin(users, eq(users.id, contactNotes.authorId))
    .where(eq(contactNotes.messageId, id))
    .orderBy(asc(contactNotes.createdAt));
  return {
    id,
    name: row.name,
    email: row.email,
    organization: row.organization,
    phone: row.phone as StoredPhone,
    body: row.body,
    locale: row.locale,
    state,
    statusLabel: CONTACT_STATUS_LABEL[state.status],
    assignee: row.assigneeId && row.assigneeEmail && isUserId(row.assigneeId)
      ? { id: row.assigneeId, name: row.assigneeName || row.assigneeEmail, email: row.assigneeEmail }
      : null,
    verbs: verbsFor(state),
    canManage: can(actor.role, "messages.manage"),
    assignees: await messageAssignees(db),
    notes: notes.flatMap((note) => {
      if (!isUserId(note.id)) return [];
      return [{ id: note.id as unknown as NoteId, authorName: note.authorName || note.authorEmail, body: note.body, createdAt: note.createdAt }];
    }),
    createdAt: row.createdAt,
  };
}

export async function countNewMessages(db: Store): Promise<number> {
  const [row] = await db.select({ count: count() }).from(contactMessages).where(eq(contactMessages.status, NEW_MESSAGE_STATUS));
  return Number(row?.count ?? 0);
}

export async function messageWeeks(db: Store, start: Date): Promise<readonly { week: unknown; count: unknown }[]> {
  const week = sql<string>`to_char(date_trunc('week', ${contactMessages.createdAt} at time zone 'UTC'), 'YYYY-MM-DD')`.as("week");
  return db.select({ week, count: count() }).from(contactMessages).where(gte(contactMessages.createdAt, start)).groupBy(week);
}
