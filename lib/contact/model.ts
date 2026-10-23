import type { Locale } from "@/lib/locale";

export const CONTACT_LIMITS = {
  nameMin: 2,
  nameMax: 200,
  organizationMax: 200,
  emailMin: 3,
  emailMax: 254,
  nationalMin: 6,
  nationalMax: 15,
  dialMaxDigits: 4,
  bodyMin: 3,
  bodyMax: 4000,
  noteMax: 4000,
} as const;

export const CONTACT_STATUSES = ["new", "read", "archived", "spam"] as const;
export type ContactStatus = (typeof CONTACT_STATUSES)[number];
export const NEW_MESSAGE_STATUS = "new" as const satisfies ContactStatus;

export const CONTACT_VERBS = ["markRead", "archive", "markSpam", "restore"] as const;
export type ContactVerb = (typeof CONTACT_VERBS)[number];

export const CONTACT_STATUS_LABEL = {
  new: "New",
  read: "Read",
  archived: "Archived",
  spam: "Spam",
} as const satisfies Record<ContactStatus, string>;

export const VERB_LABEL = {
  markRead: "Mark read",
  archive: "Archive",
  markSpam: "Mark spam",
  restore: "Restore",
} as const satisfies Record<ContactVerb, string>;

const CONFIRMED_VERBS = ["markSpam"] as const;
export type ConfirmedVerb = (typeof CONFIRMED_VERBS)[number];

export function verbNeedsConfirm(verb: ContactVerb): verb is ConfirmedVerb {
  return (CONFIRMED_VERBS as readonly ContactVerb[]).includes(verb);
}

export const MESSAGE_FIELDS = {
  kind: "kind",
  messageId: "messageId",
  expected: "expected",
  assigneeId: "assigneeId",
  expectedAssigneeId: "expectedAssigneeId",
  noteId: "noteId",
  body: "body",
} as const;

export const HONEYPOT_FIELD = "company_website" as const;

export const CONTACT_RATE = {
  scope: "contact",
  perIp: 20,
  perEmail: 5,
  windowSeconds: 3600,
} as const;

export function contactRateScopes(): { readonly ip: string; readonly email: string } {
  return { ip: `${CONTACT_RATE.scope}:ip`, email: `${CONTACT_RATE.scope}:email` };
}

export const CONTACT_LIST = "messages" as const;

export const CONTACT_PAGE_FEEDBACK = {
  sent: "sent",
  invalid: "invalid",
  turnstile: "turnstile",
  rateLimited: "rateLimited",
  failed: "failed",
} as const;

export type ContactSubmitReason = "invalid" | "turnstile" | "rate_limited";

// The public form fields a submit can reject one by one. "message" is the form's
// name for the stored body, and "phone" covers both the dial and the national number.
export const CONTACT_FIELDS = ["name", "organization", "email", "phone", "message"] as const;
export type ContactField = (typeof CONTACT_FIELDS)[number];

export type ContactSubmitResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: "invalid"; readonly fields: readonly ContactField[] }
  | { readonly ok: false; readonly reason: Exclude<ContactSubmitReason, "invalid"> };

// Copy keys for the line shown under each rejected field.
export const FIELD_ERROR_LEAF = {
  name: "nameInvalid",
  organization: "organizationInvalid",
  email: "emailInvalid",
  phone: "mobileInvalid",
  message: "messageInvalid",
} as const satisfies Record<ContactField, string>;

// The contact_messages CHECK constraints, by the form field each one guards.
export const CONSTRAINT_FIELD: Readonly<Record<string, ContactField>> = {
  contact_messages_name_len: "name",
  contact_messages_organization_len: "organization",
  contact_messages_email: "email",
  contact_messages_phone: "phone",
  contact_messages_body_len: "message",
};

export const REASON_LEAF = {
  invalid: CONTACT_PAGE_FEEDBACK.invalid,
  turnstile: CONTACT_PAGE_FEEDBACK.turnstile,
  rate_limited: CONTACT_PAGE_FEEDBACK.rateLimited,
} as const satisfies Record<ContactSubmitReason, string>;

export const MESSAGE_LIST_HEADERS = ["Name", "Email", "Organization", "Status", "Assigned to", "Received"] as const;

declare const messageIdBrand: unique symbol;
export type MessageId = string & { readonly [messageIdBrand]: "MessageId" };

declare const noteIdBrand: unique symbol;
export type NoteId = string & { readonly [noteIdBrand]: "NoteId" };

declare const dialBrand: unique symbol;
export type DialCode = string & { readonly [dialBrand]: "DialCode" };

declare const nationalBrand: unique symbol;
export type NationalNumber = string & { readonly [nationalBrand]: "NationalNumber" };

declare const storedPhoneBrand: unique symbol;
export type StoredPhone = string & { readonly [storedPhoneBrand]: "StoredPhone" };

declare const contactAddressBrand: unique symbol;
export type ContactAddress = string & { readonly [contactAddressBrand]: "ContactAddress" };

export type ContactDeskState =
  | { readonly status: "new"; readonly readAt: null }
  | { readonly status: "read"; readonly readAt: Date }
  | { readonly status: "archived"; readonly readAt: Date | null }
  | { readonly status: "spam"; readonly readAt: Date | null };

export type VerbEffect =
  | { readonly kind: "same" }
  | { readonly kind: "illegal" }
  | { readonly kind: "conflict" }
  | { readonly kind: "write"; readonly readAtWrite: "leave"; readonly next: ContactDeskState }
  | { readonly kind: "write"; readonly readAtWrite: "set-once"; readonly next: { readonly status: "read"; readonly readAt: Date } };

export type AssignEffect<T extends string> =
  | { readonly kind: "same" }
  | { readonly kind: "conflict" }
  | { readonly kind: "write"; readonly assigneeId: T | null };

const DIAL_PATTERN = /^\+[0-9]{1,4}$/;

const MOVES: Record<ContactStatus, Partial<Record<ContactVerb, ContactStatus | "restore">>> = {
  new: { markRead: "read", archive: "archived", markSpam: "spam" },
  read: { archive: "archived", markSpam: "spam" },
  archived: { markSpam: "spam", restore: "restore" },
  spam: { archive: "archived", restore: "restore" },
};

export function isContactStatus(value: string): value is ContactStatus {
  return (CONTACT_STATUSES as readonly string[]).includes(value);
}

export function isContactVerb(value: string): value is ContactVerb {
  return (CONTACT_VERBS as readonly string[]).includes(value);
}

export function messagesListHref(status: ContactStatus | "" = ""): string {
  const params = new URLSearchParams({ list: CONTACT_LIST });
  if (status) params.set("status", status);
  return `/admin/records?${params.toString()}`;
}

export function messageHref(id: MessageId): string {
  return `/admin/records/messages/${id}`;
}

export function messageStatusOptions(): readonly (readonly [ContactStatus, string])[] {
  return CONTACT_STATUSES.map((status) => [status, CONTACT_STATUS_LABEL[status]]);
}

export function showsAttention(list: string): boolean {
  return list === "nominations" || list === "partners";
}

export function honeypotFilled(raw: unknown): boolean {
  if (!raw || typeof raw !== "object") return false;
  return filledValue((raw as Record<string, unknown>)[HONEYPOT_FIELD]);
}

function filledValue(value: unknown): boolean {
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.some(filledValue);
  return value !== null && value !== undefined;
}

export function turnstileTokenOf(raw: unknown): string | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const token = (raw as Record<string, unknown>).turnstileToken;
  return typeof token === "string" ? token : undefined;
}

export function parseDial(value: unknown, knownDials: readonly string[]): DialCode | null {
  if (typeof value !== "string") return null;
  const dial = value.trim();
  if (!DIAL_PATTERN.test(dial) || !knownDials.includes(dial)) return null;
  return dial as DialCode;
}

export function parseNational(value: unknown): NationalNumber | null {
  if (typeof value !== "string") return null;
  const digits = value.replace(/\D/g, "");
  if (digits.length < CONTACT_LIMITS.nationalMin || digits.length > CONTACT_LIMITS.nationalMax) return null;
  return digits as NationalNumber;
}

export function formatPhone(dial: DialCode, national: NationalNumber): StoredPhone {
  return `${dial} ${national}` as StoredPhone;
}

export function storedPhonePattern(): string {
  return `^[+][0-9]{1,${CONTACT_LIMITS.dialMaxDigits}} [0-9]{${CONTACT_LIMITS.nationalMin},${CONTACT_LIMITS.nationalMax}}$`;
}

// Postgres char_length counts code points, so "😀" is 1 there but 2 in String.length.
// Every bound below is checked against the CHECK constraints on contact_messages and
// contact_notes, so it has to count the same way.
export function charLength(value: string): number {
  return Array.from(value).length;
}

// Postgres text cannot hold U+0000, so the insert would fail instead of a CHECK.
function storableText(value: string, min: number, max: number): boolean {
  if (value.includes("\u0000")) return false;
  // A code point is one or two UTF-16 units, so these bounds settle it without counting.
  if (value.length < min || value.length > max * 2) return false;
  const length = charLength(value);
  return length >= min && length <= max;
}

export function parseContactName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return storableText(trimmed, CONTACT_LIMITS.nameMin, CONTACT_LIMITS.nameMax) ? trimmed : null;
}

export function parseContactBody(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return storableText(trimmed, CONTACT_LIMITS.bodyMin, CONTACT_LIMITS.bodyMax) ? trimmed : null;
}

export function parseOrganization(value: unknown): { readonly ok: true; readonly value: string | null } | { readonly ok: false } {
  if (value === undefined || value === null) return { ok: true, value: null };
  if (typeof value !== "string") return { ok: false };
  const trimmed = value.trim();
  if (trimmed.length === 0) return { ok: true, value: null };
  if (!storableText(trimmed, 1, CONTACT_LIMITS.organizationMax)) return { ok: false };
  return { ok: true, value: trimmed };
}

export function parseNoteBody(value: string): string | null {
  const trimmed = value.trim();
  return storableText(trimmed, 1, CONTACT_LIMITS.noteMax) ? trimmed : null;
}

function restoredStatus(state: ContactDeskState): "new" | "read" {
  return state.readAt ? "read" : "new";
}

function goalStatus(state: ContactDeskState, verb: ContactVerb): ContactStatus | null {
  const edge = MOVES[state.status][verb];
  if (edge === "restore") return restoredStatus(state);
  if (edge) return edge;
  if (verb === "markRead" && state.status === "read") return "read";
  if (verb === "archive" && state.status === "archived") return "archived";
  if (verb === "markSpam" && state.status === "spam") return "spam";
  if (verb === "restore" && (state.status === "new" || state.status === "read")) return state.status;
  return null;
}

function writtenState(state: ContactDeskState, goal: ContactStatus, now: Date): VerbEffect {
  if (goal === "read" && state.status === "new") {
    return { kind: "write", readAtWrite: "set-once", next: { status: "read", readAt: now } };
  }
  if (goal === "new") return { kind: "write", readAtWrite: "leave", next: { status: "new", readAt: null } };
  if (goal === "read") {
    if (!state.readAt) return { kind: "illegal" };
    return { kind: "write", readAtWrite: "leave", next: { status: "read", readAt: state.readAt } };
  }
  if (goal === "archived") return { kind: "write", readAtWrite: "leave", next: { status: "archived", readAt: state.readAt } };
  return { kind: "write", readAtWrite: "leave", next: { status: "spam", readAt: state.readAt } };
}

// Already sitting in the goal state is a repeat. A stale expected does not turn that into a conflict.
export function applyContactVerb(
  state: ContactDeskState,
  verb: ContactVerb,
  expected: ContactStatus,
  now: Date,
): VerbEffect {
  const goal = goalStatus(state, verb);
  if (!goal) return { kind: "illegal" };
  if (goal === state.status) return { kind: "same" };
  if (expected !== state.status) return { kind: "conflict" };
  return writtenState(state, goal, now);
}

export function verbsFor(state: ContactDeskState): readonly ContactVerb[] {
  return CONTACT_VERBS.filter((verb) => applyContactVerb(state, verb, state.status, new Date(0)).kind === "write");
}

export function applyAssign<T extends string>(current: T | null, expected: T | null, next: T | null): AssignEffect<T> {
  if (current === next) return { kind: "same" };
  if (current !== expected) return { kind: "conflict" };
  return { kind: "write", assigneeId: next };
}

export function deskStateOf(status: string, readAt: Date | null): ContactDeskState | null {
  if (status === "new" && readAt === null) return { status: "new", readAt: null };
  if (status === "read" && readAt instanceof Date) return { status: "read", readAt };
  if (status === "archived") return { status: "archived", readAt: readAt instanceof Date ? readAt : null };
  if (status === "spam") return { status: "spam", readAt: readAt instanceof Date ? readAt : null };
  return null;
}

export function contactEmailDedupeKey(id: MessageId): string {
  return `email:contact:${id}`;
}

export type MessageListRow = {
  readonly id: MessageId;
  readonly href: string | null;
  readonly name: string;
  readonly email: string;
  readonly organization: string | null;
  readonly status: ContactStatus;
  readonly assignee: string;
  readonly createdAt: Date;
};

export function messageCells(row: MessageListRow, createdLabel: string): readonly string[] {
  return [
    row.name,
    row.email,
    row.organization ?? "",
    CONTACT_STATUS_LABEL[row.status],
    row.assignee,
    createdLabel,
  ];
}

export type MessageDetail = {
  readonly id: MessageId;
  readonly name: string;
  readonly email: string;
  readonly organization: string | null;
  readonly phone: StoredPhone;
  readonly body: string;
  readonly locale: Locale;
  readonly state: ContactDeskState;
  readonly statusLabel: string;
  readonly assignee: { readonly id: string; readonly name: string; readonly email: string } | null;
  readonly verbs: readonly ContactVerb[];
  readonly canManage: boolean;
  readonly assignees: readonly { readonly id: string; readonly name: string; readonly email: string }[];
  readonly notes: readonly { readonly id: NoteId; readonly authorName: string; readonly body: string; readonly createdAt: Date }[];
  readonly createdAt: Date;
};

export type ContactIntake = {
  readonly name: string;
  readonly organization: string | null;
  readonly email: ContactAddress;
  readonly phone: StoredPhone;
  readonly body: string;
  readonly locale: Locale;
};
