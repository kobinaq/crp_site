import { sql } from "drizzle-orm";
import {
  pgEnum,
  pgTable,
  uuid,
  text,
  date,
  integer,
  timestamp,
  uniqueIndex,
  index,
  jsonb,
  bigint,
  boolean,
  primaryKey,
  check,
} from "drizzle-orm/pg-core";

// One source of truth for every closed set. These names match the Excel mirror
// and the Lists tab exactly, so a value never means two things in two places.
export const applicantStatus = pgEnum("applicant_status", [
  "submitted",
  "round1_complete",
  "accepted",
  "rejected",
  "interview_yes",
  "interview_no",
  "docs_submitted",
  "onboarding",
  "online",
  "ineligible",
  // Identity check sits after Round 1; appended so existing enum order is kept.
  "id_verified",
  "id_failed",
  "under_review",
  "online_offered",
]);
// The identity/KYC check outcome, tracked apart from the pipeline status so the
// team sees where a check stands even before it moves the applicant on.
export const identityStatus = pgEnum("identity_status", [
  "pending",
  "verified",
  "failed",
  "review",
]);
export const track = pgEnum("track", ["in_person", "online"]);
// Website locale for applicant emails. VideoAsk language is chosen inside the form.
export const appLanguage = pgEnum("app_language", ["en", "fr", "es"]);
export const ageGroup = pgEnum("age_group", ["under_19", "19_plus"]);
export const reviewDecision = pgEnum("review_decision", ["accept", "reject"]);
export const interviewOutcome = pgEnum("interview_outcome", ["yes", "no"]);
export const waitlistStatus = pgEnum("waitlist_status", [
  "subscribed",
  "unsubscribed",
]);
export const nominationStatus = pgEnum("nomination_status", [
  "new",
  "invited",
  "applied",
  "declined",
]);

const id = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).defaultNow().notNull();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date());

// The application pipeline. System columns are written by the app; the six
// decision columns are written back from the Excel review sheet.
export const applicants = pgTable(
  "applicants",
  {
    id: id(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    fullName: text("full_name").notNull(),
    email: text("email").notNull(),
    dob: date("dob").notNull(),
    age: integer("age").notNull(),
    track: track("track").notNull(),
    // Collected on the "More about you" form.
    phone: text("phone"),
    nationality: text("nationality"),
    basedIn: text("based_in"),
    skills: jsonb("skills").$type<string[]>().notNull().default([]),
    canTravel: boolean("can_travel"),
    hasValidPassport: boolean("has_valid_passport"),
    language: appLanguage("language").notNull().default("en"),
    status: applicantStatus("status").notNull().default("submitted"),
    round1Link: text("round1_link"),
    round1CompletedAt: timestamp("round1_completed_at", { withTimezone: true }),
    // Identity check (provider-agnostic): the hosted link, its session id, and
    // the outcome the provider's webhook writes back.
    identityStatus: identityStatus("identity_status"),
    identitySessionId: text("identity_session_id"),
    identityLink: text("identity_link"),
    // When /api/apply/verify last sent this browser on to identityLink. Reset
    // whenever a new session is stored; the fallback email checks it.
    identityLinkOpenedAt: timestamp("identity_link_opened_at", { withTimezone: true }),
    identityCheckedAt: timestamp("identity_checked_at", { withTimezone: true }),
    interviewAt: timestamp("interview_at", { withTimezone: true }),
    docsStatus: text("docs_status"),
    reviewCycle: integer("review_cycle").notNull().default(0),
    onlineOfferedAt: timestamp("online_offered_at", { withTimezone: true }),
    version: integer("version").notNull().default(0),
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
    sessionVersion: integer("session_version").notNull().default(0),
    identityEventAt: timestamp("identity_event_at", { withTimezone: true }),
    // Decision columns (team-owned, synced back from Excel).
    reviewDecision: reviewDecision("review_decision"),
    reviewNotes: text("review_notes"),
    reviewer: text("reviewer"),
    reviewDate: timestamp("review_date", { withTimezone: true }),
    interviewOutcome: interviewOutcome("interview_outcome"),
    interviewNotes: text("interview_notes"),
    interviewDate: timestamp("interview_date", { withTimezone: true }),
    assignedStaffId: uuid("assigned_staff_id").references(() => users.id, { onDelete: "set null" }),
  },
  (t) => [
    uniqueIndex("applicants_email_key").on(t.email),
    index("applicants_assigned_staff_idx").on(t.assignedStaffId),
  ],
);

// Append-only lawful-basis record: one row per consent given, never updated.
export const consentLog = pgTable("consent_log", {
  id: id(),
  createdAt: createdAt(),
  applicantId: uuid("applicant_id")
    .notNull()
    .references(() => applicants.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),
  version: text("version").notNull(),
  acceptedAt: timestamp("accepted_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

// Email sign-ups for updates. Not an application.
export const waitlist = pgTable(
  "waitlist",
  {
    id: id(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    email: text("email").notNull(),
    name: text("name"),
    source: text("source"),
    status: waitlistStatus("status").notNull().default("subscribed"),
  },
  (t) => [uniqueIndex("waitlist_email_key").on(t.email)],
);

// "Express interest" from the age page, tagged by which group and track.
export const interest = pgTable(
  "interest",
  {
    id: id(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    email: text("email").notNull(),
    name: text("name"),
    ageGroup: ageGroup("age_group").notNull(),
    track: track("track"),
    source: text("source"),
  },
  (t) => [uniqueIndex("interest_email_key").on(t.email)],
);

// Someone nominating another person. Deduped per nominator+nominee pair.
export const nominations = pgTable(
  "nominations",
  {
    id: id(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    nominatorName: text("nominator_name").notNull(),
    nominatorEmail: text("nominator_email").notNull(),
    nominatorPhone: text("nominator_phone"),
    nominatorOrganization: text("nominator_organization"),
    nominatorRelation: text("nominator_relation"),
    nomineeName: text("nominee_name").notNull(),
    nomineeEmail: text("nominee_email").notNull(),
    nomineeDob: date("nominee_dob"),
    nomineePhone: text("nominee_phone"),
    nomineeNationality: text("nominee_nationality"),
    nomineeBasedIn: text("nominee_based_in"),
    // Kept for older syncs; new forms also write nomineeBasedIn.
    nomineeLocation: text("nominee_location"),
    track: track("track"),
    videoaskLink: text("videoask_link"),
    status: nominationStatus("status").notNull().default("new"),
  },
  (t) => [
    uniqueIndex("nominations_pair_key").on(t.nominatorEmail, t.nomineeEmail),
  ],
);

// Types derive from the schema, so the DB shape and the TS shape can't drift.
export type Applicant = typeof applicants.$inferSelect;
export type NewApplicant = typeof applicants.$inferInsert;
export type Waitlist = typeof waitlist.$inferSelect;
export type NewWaitlist = typeof waitlist.$inferInsert;
export type Interest = typeof interest.$inferSelect;
export type NewInterest = typeof interest.$inferInsert;
export type Nomination = typeof nominations.$inferSelect;
export type NewNomination = typeof nominations.$inferInsert;

// A partner reach-out. One row per submission; the Excel mirror reads these as-is.
export const partnerInquiries = pgTable("partner_inquiries", {
  id: id(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  phone: text("phone"),
  organization: text("organization").notNull(),
  designation: text("designation").notNull(),
  support: text("support").notNull(),
  sponsorship: text("sponsorship"),
  message: text("message"),
});

export type PartnerInquiry = typeof partnerInquiries.$inferSelect;
export type NewPartnerInquiry = typeof partnerInquiries.$inferInsert;
export type ConsentLog = typeof consentLog.$inferSelect;
export type NewConsentLog = typeof consentLog.$inferInsert;

export const identityDocuments = pgTable(
  "identity_documents",
  {
    id: id(),
    applicantId: uuid("applicant_id")
      .notNull()
      .references(() => applicants.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    pathname: text("pathname").notNull(),
    contentType: text("content_type").notNull(),
    size: integer("size").notNull(),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("identity_documents_applicant_idx").on(t.applicantId),
    uniqueIndex("identity_documents_pathname_key").on(t.pathname),
  ],
);

export type IdentityDocument = typeof identityDocuments.$inferSelect;
export type NewIdentityDocument = typeof identityDocuments.$inferInsert;

export const applicationEvents = pgTable("application_events", {
  id: id(), createdAt: createdAt(),
  applicantId: uuid("applicant_id").references(() => applicants.id, { onDelete: "cascade" }),
  fromStatus: text("from_status"), toStatus: text("to_status"),
  actor: text("actor").notNull(),
  actorStaffId: uuid("actor_staff_id").references(() => users.id, { onDelete: "set null" }),
  reason: text("reason").notNull(),
  version: integer("version"),
}, (t) => [index("application_events_applicant_idx").on(t.applicantId, t.createdAt)]);

export type JobPayload = Record<string, unknown>;
export const jobs = pgTable("jobs", {
  id: id(), createdAt: createdAt(), updatedAt: updatedAt(),
  kind: text("kind").notNull(), dedupeKey: text("dedupe_key").notNull().unique(),
  applicantId: uuid("applicant_id").references(() => applicants.id, { onDelete: "cascade" }),
  payload: jsonb("payload").$type<JobPayload>().notNull(),
  status: text("status").notNull().default("pending"),
  attempts: integer("attempts").notNull().default(0),
  availableAt: timestamp("available_at", { withTimezone: true }).notNull().defaultNow(),
  lockedUntil: timestamp("locked_until", { withTimezone: true }), lockToken: uuid("lock_token"),
  firstAttemptAt: timestamp("first_attempt_at", { withTimezone: true }),
  lastError: text("last_error"), providerId: text("provider_id"), deliveryStatus: text("delivery_status"),
  deliveryEventAt: timestamp("delivery_event_at", { withTimezone: true }),
}, (t) => [index("jobs_due_idx").on(t.status, t.availableAt), index("jobs_applicant_idx").on(t.applicantId), index("jobs_provider_idx").on(t.providerId)]);

export const webhookEvents = pgTable("webhook_events", {
  id: id(), createdAt: createdAt(),
  provider: text("provider").notNull(), eventKey: text("event_key").notNull(),
  payload: jsonb("payload").$type<JobPayload>().notNull(),
  processedAt: timestamp("processed_at", { withTimezone: true }), outcome: text("outcome"),
}, (t) => [uniqueIndex("webhook_events_provider_key").on(t.provider, t.eventKey)]);

export const accessTokens = pgTable("access_tokens", {
  hash: text("hash").primaryKey(), createdAt: createdAt(),
  applicantId: uuid("applicant_id").notNull().references(() => applicants.id, { onDelete: "cascade" }),
  purpose: text("purpose").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
}, (t) => [index("access_tokens_expiry_idx").on(t.expiresAt)]);

export const rateLimits = pgTable("rate_limits", {
  key: text("key").primaryKey(), count: integer("count").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
}, (t) => [index("rate_limits_expiry_idx").on(t.expiresAt)]);

export const decisionReceipts = pgTable("decision_receipts", {
  id: uuid("id").primaryKey(), createdAt: createdAt(),
  applicantId: uuid("applicant_id").notNull().references(() => applicants.id, { onDelete: "cascade" }),
  requestHash: text("request_hash").notNull(),
  result: jsonb("result").$type<{ version: number; status: string }>().notNull(),
  origin: text("origin"),
  staffUserId: uuid("staff_user_id").references(() => users.id, { onDelete: "set null" }),
  reviewCycle: integer("review_cycle"),
}, (t) => [
  index("decision_receipts_staff_hold_idx").on(t.applicantId, t.reviewCycle, t.createdAt.desc()).where(sql`${t.origin} = 'staff'`),
]);

// A transactional clock (rather than a sequence) serializes revision allocation
// until commit, so consumers cannot skip a lower revision committed later.
export const syncClock = pgTable("sync_clock", {
  singleton: boolean("singleton").primaryKey().default(true),
  revision: bigint("revision", { mode: "bigint" }).notNull().default(BigInt(0)),
});
export const syncChanges = pgTable("sync_changes", {
  revision: bigint("revision", { mode: "bigint" }).primaryKey(),
  tableName: text("table_name").notNull(), recordId: uuid("record_id").notNull(),
  operation: text("operation").notNull(), payload: jsonb("payload").notNull(), createdAt: createdAt(),
}, (t) => [index("sync_changes_table_revision_idx").on(t.tableName, t.revision)]);

// One lock for the Excel cron so a second tick cannot write the workbook while
// the first is still inside its function budget. Cursors live here, not in the
// sheet, so a reviewer cannot rewind the feed by editing Config.after.
export const excelSyncState = pgTable("excel_sync_state", {
  singleton: boolean("singleton").primaryKey().default(true),
  decisionOffset: integer("decision_offset").notNull().default(0),
  lockedUntil: timestamp("locked_until", { withTimezone: true }),
  lastError: text("last_error"),
  lastRunAt: timestamp("last_run_at", { withTimezone: true }),
});
export const excelCursors = pgTable("excel_cursors", {
  tableName: text("table_name").primaryKey(),
  cursor: bigint("cursor", { mode: "bigint" }).notNull().default(BigInt(0)),
});

export const captureTokens = pgTable("capture_tokens", {
  hash: text("hash").primaryKey(), createdAt: createdAt(),
  kind: text("kind").notNull(), payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
}, (t) => [index("capture_tokens_expiry_idx").on(t.expiresAt)]);

// Staff and, later, public members. Role is text so a new role does not need
// ALTER TYPE. The email check keeps the allowlist comparison exact.
export const users = pgTable("users", {
  id: id(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  email: text("email").notNull(),
  name: text("name"),
  role: text("role").notNull(),
  disabledAt: timestamp("disabled_at", { withTimezone: true }),
  lastSignInAt: timestamp("last_sign_in_at", { withTimezone: true }),
}, (t) => [
  uniqueIndex("users_email_key").on(t.email),
  check("users_email_lowercase", sql`${t.email} = lower(${t.email})`),
]);

export const signInTokens = pgTable("sign_in_tokens", {
  hash: text("hash").primaryKey(),
  createdAt: createdAt(),
  email: text("email").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
}, (t) => [index("sign_in_tokens_expires_idx").on(t.expiresAt)]);

export const userSessions = pgTable("user_sessions", {
  hash: text("hash").primaryKey(),
  createdAt: createdAt(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
}, (t) => [
  index("user_sessions_user_idx").on(t.userId),
  index("user_sessions_expires_idx").on(t.expiresAt),
]);

// History and the published value are the same row. A null value means the
// JSON bundle is live again. The highest revision for a key is the head.
export const copyRevisions = pgTable("copy_revisions", {
  catalog: text("catalog").notNull(),
  locale: text("locale").notNull(),
  key: text("key").notNull(),
  revision: integer("revision").notNull(),
  value: text("value"),
  translatedFrom: text("translated_from"),
  revertedFrom: integer("reverted_from"),
  authorId: uuid("author_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: createdAt(),
}, (t) => [
  primaryKey({ columns: [t.catalog, t.locale, t.key, t.revision] }),
  check("copy_revisions_revision_positive", sql`${t.revision} > 0`),
  index("copy_revisions_created_idx").on(t.createdAt),
]);

// Staff account changes and record exports. Publishes stay in copy_revisions.
export const adminEvents = pgTable("admin_events", {
  id: id(),
  createdAt: createdAt(),
  actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
  subjectId: uuid("subject_id").references(() => users.id, { onDelete: "set null" }),
  kind: text("kind").notNull(),
  detail: jsonb("detail").$type<Record<string, unknown>>().notNull().default({}),
}, (t) => [
  index("admin_events_created_idx").on(t.createdAt),
  index("admin_events_subject_idx").on(t.subjectId, t.createdAt),
]);

export const reviewPositions = pgTable("review_positions", {
  applicantId: uuid("applicant_id").notNull().references(() => applicants.id, { onDelete: "cascade" }),
  reviewCycle: integer("review_cycle").notNull(),
  authorId: uuid("author_id").notNull().references(() => users.id),
  scores: jsonb("scores").$type<Record<string, number>>().notNull().default({}),
  recommendation: text("recommendation"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  primaryKey({ columns: [t.applicantId, t.reviewCycle, t.authorId] }),
  index("review_positions_applicant_idx").on(t.applicantId, t.reviewCycle),
]);

export const reviewNotes = pgTable("review_notes", {
  id: uuid("id").primaryKey(),
  applicantId: uuid("applicant_id").notNull().references(() => applicants.id, { onDelete: "cascade" }),
  reviewCycle: integer("review_cycle").notNull(),
  authorId: uuid("author_id").notNull().references(() => users.id),
  body: text("body").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  check("review_notes_body_len", sql`char_length(${t.body}) between 1 and 4000`),
  index("review_notes_applicant_idx").on(t.applicantId, t.reviewCycle, t.createdAt),
]);

export const sheetConflicts = pgTable("sheet_conflicts", {
  applicantId: uuid("applicant_id").notNull().references(() => applicants.id, { onDelete: "cascade" }),
  reviewCycle: integer("review_cycle").notNull(),
  decisionId: uuid("decision_id").notNull(),
  sheetTarget: text("sheet_target").notNull(),
  heldStatus: text("held_status").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  primaryKey({ columns: [t.applicantId, t.reviewCycle, t.decisionId] }),
]);

export const copyDrafts = pgTable("copy_drafts", {
  catalog: text("catalog").notNull(),
  locale: text("locale").notNull(),
  key: text("key").notNull(),
  authorId: uuid("author_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  value: text("value").notNull(),
  translatedFrom: text("translated_from"),
  updatedAt: updatedAt(),
}, (t) => [
  primaryKey({ columns: [t.catalog, t.locale, t.key, t.authorId] }),
]);
