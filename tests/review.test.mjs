import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import pg from "pg";
import { createHmac, randomUUID } from "node:crypto";
import { loader } from "./helpers.mjs";
import { startDatabase } from "./db.mjs";

let db;
let sql;
let load;
const session = { raw: "" };

before(async () => {
  db = await startDatabase();
  process.env.DATABASE_URL = db.url;
  process.env.APP_SECRET = "test-secret-test-secret-test-secret-1234";
  process.env.NODE_ENV = "test";
  process.env.CALENDLY_URL_EN = "https://calendly.invalid/en";
  process.env.CALENDLY_URL_FR = "https://calendly.invalid/fr";
  process.env.CALENDLY_URL_ES = "https://calendly.invalid/es";
  process.env.CALENDLY_WEBHOOK_SIGNING_KEY = "calendly-test-secret";
  sql = new pg.Client({ connectionString: db.url });
  await sql.connect();
  load = loader({
    "next/cache": { unstable_cache: (fn) => fn, updateTag: () => {}, revalidatePath: () => {} },
    "next/headers": {
      headers: async () => new Headers({ origin: "http://localhost:3000", host: "localhost:3000" }),
      cookies: async () => ({
        get: (name) => (name === "crp_staff" && session.raw ? { value: session.raw } : undefined),
        set() {},
        delete() {},
      }),
    },
    "next/navigation": { redirect: (url) => { throw new Error(`redirect ${url}`); } },
    "next/server": {
      NextResponse: {
        json: (body, init) => ({ body, status: init?.status ?? 200 }),
        redirect: (url) => ({ url: String(url), status: 307 }),
      },
    },
  });
});

after(async () => {
  try { await load("lib/db/index.ts").closeDb(); } catch { /* pool may already be closed */ }
  try { await sql.end(); } catch { /* ignore */ }
  try { await db.stop(); } catch { /* ignore */ }
});

function mod(path) {
  return load(path);
}

async function insertUser(role, name) {
  const email = `${role}-${randomUUID()}@example.org`;
  const inserted = await sql.query(
    "insert into users (email, role, name) values ($1, $2, $3) returning id, email",
    [email, role, name],
  );
  return { id: inserted.rows[0].id, email: inserted.rows[0].email, role, name };
}

async function insertApplicant({ track = "in_person", status = "under_review", language = "en" } = {}) {
  const email = `applicant-${randomUUID()}@example.org`;
  const inserted = await sql.query(
    `insert into applicants (full_name, email, dob, age, track, language, status)
     values ('Nia Tester', $1, '1990-01-02', 36, $2, $3, $4)
     returning id, version, status, email, review_cycle`,
    [email, track, language, status],
  );
  return inserted.rows[0];
}

async function applicantRow(id) {
  const result = await sql.query("select * from applicants where id = $1", [id]);
  return result.rows[0];
}

async function receipts(id) {
  const result = await sql.query(
    "select origin, staff_user_id, review_cycle, result from decision_receipts where applicant_id = $1 order by created_at",
    [id],
  );
  return result.rows;
}

async function jobs(id) {
  const result = await sql.query("select payload from jobs where applicant_id = $1 order by created_at", [id]);
  return result.rows;
}

async function conflicts(id) {
  const result = await sql.query(
    "select decision_id, sheet_target, held_status from sheet_conflicts where applicant_id = $1 order by updated_at",
    [id],
  );
  return result.rows;
}

function apply(row, origin) {
  return mod("lib/decisions.ts").applyDecision(mod("lib/db/index.ts").getDb(), row, origin);
}

test("offered moves follow target status, source statuses, and the transition map", () => {
  const { offeredMoves } = mod("lib/sync.ts");
  const { STATUSES } = mod("lib/lifecycle.ts");
  const expected = [
    ["under_review", "in_person", "reviewDecision", "accept", "accepted"],
    ["under_review", "online", "reviewDecision", "accept", "accepted"],
    ["under_review", "online", "reviewDecision", "reject", "rejected"],
    ["under_review", "in_person", "reviewDecision", "reject", "online_offered"],
    ["accepted", "online", "reviewDecision", "reject", "rejected"],
    ["accepted", "in_person", "reviewDecision", "reject", "online_offered"],
    ["accepted", "in_person", "interviewOutcome", "yes", "interview_yes"],
    ["accepted", "online", "interviewOutcome", "yes", "interview_yes"],
    ["accepted", "online", "interviewOutcome", "no", "rejected"],
    ["accepted", "in_person", "interviewOutcome", "no", "online_offered"],
    ["rejected", "in_person", "reviewDecision", "accept", "accepted"],
    ["rejected", "online", "reviewDecision", "accept", "accepted"],
    ["rejected", "in_person", "reviewDecision", "reject", "online_offered"],
    ["interview_no", "in_person", "interviewOutcome", "yes", "interview_yes"],
    ["interview_no", "online", "interviewOutcome", "yes", "interview_yes"],
    ["interview_no", "online", "interviewOutcome", "no", "rejected"],
    ["interview_no", "in_person", "interviewOutcome", "no", "online_offered"],
  ];
  const seen = [];
  for (const status of STATUSES) {
    for (const track of ["in_person", "online"]) {
      for (const move of offeredMoves({ status, track })) seen.push([status, track, move.field, move.value, move.to]);
    }
  }
  const key = (row) => row.join("|");
  assert.deepEqual(seen.map(key).sort(), expected.map(key).sort());
});

test("a sheet decision applies on the tick after a webhook bumps the version", async () => {
  const applicant = await insertApplicant();
  const before = await applicantRow(applicant.id);
  const raw = JSON.stringify({
    event: "invitee.created",
    payload: { email: applicant.email, scheduled_event: { start_time: "2026-10-20T14:00:00Z" }, tracking: {} },
  });
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = createHmac("sha256", process.env.CALENDLY_WEBHOOK_SIGNING_KEY).update(`${timestamp}.${raw}`).digest("hex");
  const booked = await mod("app/api/webhooks/calendly/route.ts").POST({
    headers: new Headers({ "calendly-webhook-signature": `t=${timestamp},v1=${signature}` }),
    text: async () => raw,
  });
  assert.equal(booked.body.outcome, "interview booked");
  const bumped = await applicantRow(applicant.id);
  assert.equal(bumped.status, "under_review");
  assert.ok(bumped.version > before.version);

  const stale = await apply({
    applicantId: applicant.id,
    decisionId: randomUUID(),
    version: before.version,
    reviewCycle: 0,
    reviewDecision: "accept",
  }, { via: "sheet" });
  assert.equal(stale.result, "stale");
  assert.equal((await receipts(applicant.id)).length, 0);
  assert.equal((await applicantRow(applicant.id)).status, "under_review");
  assert.equal((await applicantRow(applicant.id)).version, bumped.version);

  const decisionId = randomUUID();
  const applied = await apply({
    applicantId: applicant.id,
    decisionId,
    version: bumped.version,
    reviewCycle: 0,
    reviewDecision: "accept",
  }, { via: "sheet" });
  assert.equal(applied.result, "applied");
  assert.equal(applied.status, "accepted");
  const after = await applicantRow(applicant.id);
  assert.equal(after.status, "accepted");
  const [receipt] = await receipts(applicant.id);
  assert.equal(receipt.origin, "sheet");
  assert.equal(receipt.review_cycle, 0);
  assert.equal(receipt.staff_user_id, null);
  const events = await sql.query(
    "select actor, actor_staff_id from application_events where applicant_id = $1 and to_status = 'accepted'",
    [applicant.id],
  );
  assert.equal(events.rows[0].actor, "excel");
  assert.equal(events.rows[0].actor_staff_id, null);
});

test("a sheet decision that disagrees with a staff receipt is staff_held and does not write", async () => {
  const staff = await insertUser("admin", "Ada Admin");
  const applicant = await insertApplicant({ track: "in_person" });
  const decisionId = randomUUID();
  const confirmed = await apply({
    applicantId: applicant.id,
    decisionId,
    version: applicant.version,
    reviewCycle: 0,
    reviewDecision: "accept",
  }, { via: "staff", staffUserId: staff.id });
  assert.equal(confirmed.result, "applied");
  const standing = await applicantRow(applicant.id);
  assert.equal(standing.status, "accepted");
  const sheetId = randomUUID();
  const held = await apply({
    applicantId: applicant.id,
    decisionId: sheetId,
    version: standing.version,
    reviewCycle: 0,
    reviewDecision: "reject",
    reviewNotes: "The sheet arrived late.",
    reviewer: "Sam",
  }, { via: "sheet" });
  assert.equal(held.result, "staff_held");
  const after = await applicantRow(applicant.id);
  assert.equal(after.status, "accepted");
  assert.equal(after.version, standing.version);
  assert.equal(after.review_decision, null);
  assert.equal(after.review_notes, null);
  assert.equal((await receipts(applicant.id)).length, 1);
  assert.equal((await jobs(applicant.id)).length, 1);
  const [conflict] = await conflicts(applicant.id);
  assert.equal(conflict.decision_id, sheetId);
  assert.equal(conflict.sheet_target, "online_offered");
  assert.equal(conflict.held_status, "accepted");
  const audit = await sql.query(
    "select subject_id, detail from admin_events where kind = 'decision.confirmed' and detail->>'applicantId' = $1",
    [applicant.id],
  );
  assert.equal(audit.rows.length, 1);
  assert.equal(audit.rows[0].subject_id, null);
  assert.equal(audit.rows[0].detail.decisionId, decisionId);
});

test("a sheet decision that matches a staff receipt is staff_kept and does not write", async () => {
  const staff = await insertUser("admin", "Ada Admin");
  const applicant = await insertApplicant();
  const confirmed = await apply({
    applicantId: applicant.id,
    decisionId: randomUUID(),
    version: applicant.version,
    reviewCycle: 0,
    reviewDecision: "accept",
  }, { via: "staff", staffUserId: staff.id });
  assert.equal(confirmed.result, "applied");
  const standing = await applicantRow(applicant.id);
  const sheetId = randomUUID();
  await sql.query(
    `insert into sheet_conflicts (applicant_id, review_cycle, decision_id, sheet_target, held_status)
     values ($1, 0, $2, 'online_offered', 'accepted')`,
    [applicant.id, sheetId],
  );
  const kept = await apply({
    applicantId: applicant.id,
    decisionId: sheetId,
    version: standing.version,
    reviewCycle: 0,
    reviewDecision: "accept",
    reviewNotes: "Agree, with a note.",
  }, { via: "sheet" });
  assert.equal(kept.result, "staff_kept");
  const after = await applicantRow(applicant.id);
  assert.equal(after.status, "accepted");
  assert.equal(after.version, standing.version);
  assert.equal(after.review_notes, null);
  assert.equal((await receipts(applicant.id)).length, 1);
  assert.equal((await jobs(applicant.id)).length, 1);
  assert.equal((await conflicts(applicant.id)).length, 0);
});

test("a staff confirm that would be not_allowed does not change version or insert a receipt", async () => {
  const staff = await insertUser("admin", "Ada Admin");
  const blocked = await insertApplicant({ status: "interview_yes" });
  const refused = await apply({
    applicantId: blocked.id,
    decisionId: randomUUID(),
    version: blocked.version,
    reviewCycle: 0,
    reviewDecision: "accept",
  }, { via: "staff", staffUserId: staff.id });
  assert.equal(refused.result, "not_allowed");
  assert.equal((await applicantRow(blocked.id)).version, blocked.version);
  assert.equal((await applicantRow(blocked.id)).status, "interview_yes");
  assert.equal((await receipts(blocked.id)).length, 0);
  assert.equal((await jobs(blocked.id)).length, 0);
  const events = await sql.query("select actor from application_events where applicant_id = $1 and actor = 'staff'", [blocked.id]);
  assert.equal(events.rows.length, 0);

  const both = await insertApplicant();
  const version = both.version;
  const mixed = await apply({
    applicantId: both.id,
    decisionId: randomUUID(),
    version,
    reviewCycle: 0,
    reviewDecision: "accept",
    interviewOutcome: "yes",
  }, { via: "staff", staffUserId: staff.id });
  assert.equal(mixed.result, "not_allowed");
  assert.equal((await applicantRow(both.id)).version, version);
  assert.equal((await applicantRow(both.id)).status, "under_review");
  assert.equal((await receipts(both.id)).length, 0);
});

test("the same decisionId confirmed twice replays and queues one email", async () => {
  const staff = await insertUser("admin", "Ada Admin");
  const applicant = await insertApplicant();
  const row = {
    applicantId: applicant.id,
    decisionId: randomUUID(),
    version: applicant.version,
    reviewCycle: 0,
    reviewDecision: "accept",
  };
  const first = await apply(row, { via: "staff", staffUserId: staff.id });
  assert.equal(first.result, "applied");
  const standing = await applicantRow(applicant.id);
  const second = await apply(row, { via: "staff", staffUserId: staff.id });
  assert.equal(second.result, "replayed");
  assert.equal(second.status, "accepted");
  const after = await applicantRow(applicant.id);
  assert.equal(after.version, standing.version);
  assert.equal(after.status, "accepted");
  assert.equal((await jobs(applicant.id)).length, 1);
  assert.equal((await receipts(applicant.id)).length, 1);
  const history = await sql.query(
    "select actor, actor_staff_id, reason from application_events where applicant_id = $1 and actor = 'staff'",
    [applicant.id],
  );
  assert.equal(history.rows.length, 1);
  assert.equal(history.rows[0].actor_staff_id, staff.id);
  assert.equal(history.rows[0].reason, "staff decision");
});

test("saving a review does not change applicants.version", async () => {
  const reviewer = await insertUser("reviewer", "Rae Reviewer");
  const applicant = await insertApplicant();
  const before = await applicantRow(applicant.id);
  const noteId = randomUUID();
  const saved = await mod("lib/review/write.ts").saveReview(mod("lib/db/index.ts").getDb(), grant(reviewer), {
    applicantId: applicant.id,
    reviewCycle: 0,
    scores: { commitment: 4, context: 5, contribution: 3 },
    recommendation: "advance",
    note: { id: noteId, body: "Fieldwork in the delta is specific and recent." },
  });
  assert.equal(saved.ok, true);
  const after = await applicantRow(applicant.id);
  assert.equal(after.version, before.version);
  assert.equal(after.status, "under_review");
  const note = await sql.query("select body, author_id from review_notes where id = $1", [noteId]);
  assert.equal(note.rows[0].body, "Fieldwork in the delta is specific and recent.");
  assert.equal(note.rows[0].author_id, reviewer.id);
  const again = await mod("lib/review/write.ts").saveReview(mod("lib/db/index.ts").getDb(), grant(reviewer), {
    applicantId: applicant.id,
    reviewCycle: 0,
    scores: { commitment: 4, context: 5, contribution: 3 },
    recommendation: "advance",
    note: { id: noteId, body: "A second body must not replace the first." },
  });
  assert.equal(again.ok, true);
  const kept = await sql.query("select body from review_notes where id = $1", [noteId]);
  assert.equal(kept.rows[0].body, "Fieldwork in the delta is specific and recent.");
  const audits = await sql.query(
    "select subject_id, detail from admin_events where kind = 'review.saved' and detail->>'applicantId' = $1",
    [applicant.id],
  );
  assert.equal(audits.rows.length, 1);
  assert.equal(audits.rows[0].subject_id, null);
  assert.equal(audits.rows[0].detail.recommendation, "advance");
  assert.equal((await applicantRow(applicant.id)).version, before.version);
  const changes = await sql.query("select count(*)::int as n from sync_changes where record_id = $1", [applicant.id]);
  assert.equal(changes.rows[0].n, 0);
  const staleCycle = await mod("lib/review/write.ts").saveReview(mod("lib/db/index.ts").getDb(), grant(reviewer), {
    applicantId: applicant.id,
    reviewCycle: 1,
    scores: { commitment: 1 },
    recommendation: undefined,
    note: null,
  });
  assert.deepEqual(staleCycle, { ok: false, reason: "stale_cycle" });
  const applied = await apply({
    applicantId: applicant.id,
    decisionId: randomUUID(),
    version: before.version,
    reviewCycle: 0,
    reviewDecision: "accept",
  }, { via: "sheet" });
  assert.equal(applied.result, "applied");
  assert.equal((await applicantRow(applicant.id)).status, "accepted");
});

test("an unknown rubric key is rejected and a retired stored key remains after a later save", async () => {
  const reviewer = await insertUser("reviewer", "Rae Reviewer");
  const applicant = await insertApplicant();
  const database = mod("lib/db/index.ts").getDb();
  const { saveReview } = mod("lib/review/write.ts");
  const unknown = await saveReview(database, grant(reviewer), {
    applicantId: applicant.id,
    reviewCycle: 0,
    scores: { grit: 3 },
    recommendation: "accept",
    note: null,
  });
  assert.deepEqual(unknown, { ok: false, reason: "invalid" });
  const high = await saveReview(database, grant(reviewer), {
    applicantId: applicant.id,
    reviewCycle: 0,
    scores: { commitment: 6 },
    recommendation: undefined,
    note: null,
  });
  assert.deepEqual(high, { ok: false, reason: "invalid" });
  const longNote = await saveReview(database, grant(reviewer), {
    applicantId: applicant.id,
    reviewCycle: 0,
    scores: {},
    recommendation: undefined,
    note: { id: randomUUID(), body: "x".repeat(4001) },
  });
  assert.deepEqual(longNote, { ok: false, reason: "invalid" });
  const missing = await saveReview(database, grant(reviewer), {
    applicantId: randomUUID(),
    reviewCycle: 0,
    scores: { commitment: 1 },
    recommendation: undefined,
    note: null,
  });
  assert.deepEqual(missing, { ok: false, reason: "not_found" });
  const first = await saveReview(database, grant(reviewer), {
    applicantId: applicant.id,
    reviewCycle: 0,
    scores: { commitment: 4 },
    recommendation: "advance",
    note: null,
  });
  assert.equal(first.ok, true);
  await sql.query(
    "update review_positions set scores = scores || '{\"grit\":2}'::jsonb where applicant_id = $1 and author_id = $2",
    [applicant.id, reviewer.id],
  );
  const later = await saveReview(database, grant(reviewer), {
    applicantId: applicant.id,
    reviewCycle: 0,
    scores: { commitment: null, context: 5 },
    recommendation: undefined,
    note: null,
  });
  assert.equal(later.ok, true);
  const position = await sql.query(
    "select scores, recommendation from review_positions where applicant_id = $1 and author_id = $2",
    [applicant.id, reviewer.id],
  );
  assert.equal(position.rows[0].scores.grit, 2);
  assert.equal(position.rows[0].scores.context, 5);
  assert.equal(position.rows[0].scores.commitment, undefined);
  assert.equal(position.rows[0].recommendation, "advance");
  assert.equal((await applicantRow(applicant.id)).version, applicant.version);
});

test("assignment does not change applicants.version and does not block a later sheet apply", async () => {
  const admin = await insertUser("admin", "Ada Admin");
  const reviewer = await insertUser("reviewer", "Rae Reviewer");
  const editor = await insertUser("editor", "Ed Editor");
  const applicant = await insertApplicant();
  const before = await applicantRow(applicant.id);
  const { assignReviewer } = mod("lib/review/write.ts");
  const database = mod("lib/db/index.ts").getDb();
  const assigned = await assignReviewer(database, grant(admin, "admin"), {
    applicantId: applicant.id,
    assigneeId: reviewer.id,
    expectedAssigneeId: null,
  });
  assert.equal(assigned.ok, true);
  assert.equal(assigned.version, before.version);
  const afterAssign = await applicantRow(applicant.id);
  assert.equal(afterAssign.version, before.version);
  assert.equal(afterAssign.assigned_staff_id, reviewer.id);
  assert.equal(afterAssign.updated_at.toISOString(), before.updated_at.toISOString());
  const repeat = await assignReviewer(database, grant(admin, "admin"), {
    applicantId: applicant.id,
    assigneeId: reviewer.id,
    expectedAssigneeId: reviewer.id,
  });
  assert.equal(repeat.ok, true);
  const assignedEvents = await sql.query(
    "select subject_id, detail from admin_events where kind = 'review.assigned' and detail->>'applicantId' = $1",
    [applicant.id],
  );
  assert.equal(assignedEvents.rows.length, 1);
  assert.equal(assignedEvents.rows[0].subject_id, reviewer.id);
  assert.equal(assignedEvents.rows[0].detail.previousAssigneeId, null);
  const refused = await assignReviewer(database, grant(admin, "admin"), {
    applicantId: applicant.id,
    assigneeId: editor.id,
    expectedAssigneeId: reviewer.id,
  });
  assert.deepEqual(refused, { ok: false, reason: "invalid_assignee" });
  assert.equal((await applicantRow(applicant.id)).assigned_staff_id, reviewer.id);
  const conflict = await assignReviewer(database, grant(admin, "admin"), {
    applicantId: applicant.id,
    assigneeId: null,
    expectedAssigneeId: null,
  });
  assert.deepEqual(conflict, { ok: false, reason: "conflict" });
  const applied = await apply({
    applicantId: applicant.id,
    decisionId: randomUUID(),
    version: before.version,
    reviewCycle: 0,
    reviewDecision: "accept",
  }, { via: "sheet" });
  assert.equal(applied.result, "applied");
  const after = await applicantRow(applicant.id);
  assert.equal(after.status, "accepted");
  assert.equal(after.assigned_staff_id, reviewer.id);
  assert.equal(after.version, before.version + 1);
});

function grant(user, role = user.role) {
  return { id: user.id, email: user.email, role, name: user.name };
}

async function tokenCount(id) {
  const result = await sql.query("select count(*)::int as n from access_tokens where applicant_id = $1", [id]);
  return result.rows[0].n;
}

test("preview html matches the queued online_offered email after the token is substituted, and preview inserts no access token", async () => {
  const admin = await insertUser("admin", "Ada Admin");
  const applicant = await insertApplicant({ track: "in_person" });
  const database = mod("lib/db/index.ts").getDb();
  const { previewDecision, confirmDecision } = mod("lib/review/decide.ts");
  const { DECISION_PREVIEW_TOKEN } = mod("lib/emails.ts");
  const move = { field: "reviewDecision", value: "reject", to: "online_offered" };
  const preview = await previewDecision(database, grant(admin, "admin"), { applicantId: applicant.id, move });
  assert.equal(preview.ok, true);
  assert.equal(preview.toStatus, "online_offered");
  assert.equal(preview.html.includes(DECISION_PREVIEW_TOKEN), true);
  assert.equal(await tokenCount(applicant.id), 0);
  assert.equal((await jobs(applicant.id)).length, 0);
  const confirmed = await confirmDecision(database, grant(admin, "admin"), {
    applicantId: applicant.id,
    version: applicant.version,
    reviewCycle: 0,
    decisionId: randomUUID(),
    move,
  });
  assert.equal(confirmed.result, "applied");
  const queued = await jobs(applicant.id);
  assert.equal(queued.length, 1);
  const token = decodeURIComponent(queued[0].payload.html.match(/switch-online\?token=([^"&]+)/)[1]);
  assert.notEqual(token, DECISION_PREVIEW_TOKEN);
  assert.equal(preview.html.replaceAll(DECISION_PREVIEW_TOKEN, token), queued[0].payload.html);
  assert.equal(preview.subject, queued[0].payload.subject);
  assert.equal(await tokenCount(applicant.id), 1);
  const history = await sql.query(
    "select actor, actor_staff_id from application_events where applicant_id = $1 and actor = 'staff'",
    [applicant.id],
  );
  assert.equal(history.rows[0].actor, "staff");
  assert.equal(history.rows[0].actor_staff_id, admin.id);
});

test("a stale confirm writes nothing and queues no email", async () => {
  const admin = await insertUser("admin", "Ada Admin");
  const applicant = await insertApplicant({ track: "in_person" });
  const { confirmDecision } = mod("lib/review/decide.ts");
  const database = mod("lib/db/index.ts").getDb();
  const first = await confirmDecision(database, grant(admin, "admin"), {
    applicantId: applicant.id,
    version: applicant.version,
    reviewCycle: 0,
    decisionId: randomUUID(),
    move: { field: "reviewDecision", value: "reject", to: "online_offered" },
  });
  assert.equal(first.result, "applied");
  const standing = await applicantRow(applicant.id);
  assert.equal(standing.status, "online_offered");
  const beforeJobs = (await jobs(applicant.id)).length;
  const stale = await confirmDecision(database, grant(admin, "admin"), {
    applicantId: applicant.id,
    version: applicant.version,
    reviewCycle: 0,
    decisionId: randomUUID(),
    move: { field: "reviewDecision", value: "accept", to: "accepted" },
  });
  assert.equal(stale.result, "stale");
  const after = await applicantRow(applicant.id);
  assert.equal(after.status, "online_offered");
  assert.equal(after.version, standing.version);
  assert.equal((await jobs(applicant.id)).length, beforeJobs);
});

test("bulk confirm returns applied, stale, and not_allowed, and only the applied row changes", async () => {
  const admin = await insertUser("admin", "Ada Admin");
  const applyRow = await insertApplicant();
  const staleRow = await insertApplicant();
  await sql.query("update applicants set version = version + 1 where id = $1", [staleRow.id]);
  const blocked = await insertApplicant({ status: "interview_yes" });
  const move = { field: "reviewDecision", value: "accept", to: "accepted" };
  const database = mod("lib/db/index.ts").getDb();
  const { previewBulk, confirmBulk } = mod("lib/review/decide.ts");
  const rows = [
    { applicantId: applyRow.id, version: applyRow.version, reviewCycle: 0 },
    { applicantId: staleRow.id, version: staleRow.version, reviewCycle: 0 },
    { applicantId: blocked.id, version: blocked.version, reviewCycle: 0 },
  ];
  const previewed = await previewBulk(database, grant(admin, "admin"), { move, rows });
  assert.deepEqual(previewed.counts, { apply: 1, stale: 1, notAllowed: 1, notFound: 0 });
  assert.deepEqual(previewed.byLanguage, [{ language: "en", apply: 1 }]);
  assert.equal((await jobs(applyRow.id)).length, 0);
  assert.equal((await applicantRow(blocked.id)).version, blocked.version);
  const bulk = await confirmBulk(database, grant(admin, "admin"), {
    move,
    rows: rows.map((row) => ({ ...row, decisionId: randomUUID() })),
  });
  assert.equal(bulk.rows[0].result, "applied");
  assert.equal(bulk.rows[1].result, "stale");
  assert.equal(bulk.rows[2].result, "not_allowed");
  assert.equal((await applicantRow(applyRow.id)).status, "accepted");
  assert.equal((await jobs(applyRow.id)).length, 1);
  const staleAfter = await applicantRow(staleRow.id);
  assert.equal(staleAfter.status, "under_review");
  assert.equal(staleAfter.version, staleRow.version + 1);
  assert.equal((await jobs(staleRow.id)).length, 0);
  const blockedAfter = await applicantRow(blocked.id);
  assert.equal(blockedAfter.status, "interview_yes");
  assert.equal(blockedAfter.version, blocked.version);
  assert.equal((await receipts(blocked.id)).length, 0);
  assert.equal((await jobs(blocked.id)).length, 0);

  const mismatch = await insertApplicant({ track: "in_person" });
  const wrong = await confirmBulk(database, grant(admin, "admin"), {
    move: { field: "reviewDecision", value: "reject", to: "rejected" },
    rows: [{ applicantId: mismatch.id, version: mismatch.version, reviewCycle: 0, decisionId: randomUUID() }],
  });
  assert.equal(wrong.rows[0].result, "not_allowed");
  assert.equal((await applicantRow(mismatch.id)).status, "under_review");
  assert.equal((await applicantRow(mismatch.id)).version, mismatch.version);
  assert.equal((await jobs(mismatch.id)).length, 0);
  const tooMany = await previewBulk(database, grant(admin, "admin"), {
    move,
    rows: Array.from({ length: 51 }, () => ({ applicantId: applyRow.id, version: 0, reviewCycle: 0 })),
  });
  assert.deepEqual(tooMany, { ok: false, reason: "invalid" });
});

test("a reviewer can save scores, a note, and a recommendation, and confirm decisions as themselves", async () => {
  const reviewer = await insertUser("reviewer", "Rae Reviewer");
  const editor = await insertUser("editor", "Ed Editor");
  const applicant = await insertApplicant();
  const database = mod("lib/db/index.ts").getDb();
  const noteId = randomUUID();
  const saved = await mod("lib/review/write.ts").saveReview(database, grant(reviewer), {
    applicantId: applicant.id,
    reviewCycle: 0,
    scores: { commitment: 4, context: 5, contribution: 3 },
    recommendation: "advance",
    note: { id: noteId, body: "Fieldwork in the delta is specific and recent." },
  });
  assert.equal(saved.ok, true);
  const before = await applicantRow(applicant.id);
  assert.equal(before.version, applicant.version);
  assert.equal(before.status, "under_review");
  assert.equal((await jobs(applicant.id)).length, 0);
  const { loadApplicant, loadRecords, parseRecordQuery } = mod("lib/admin/records.ts");
  const { needsDecision } = mod("lib/review/queue.ts");
  const { STATUSES, can } = { ...mod("lib/lifecycle.ts"), ...mod("lib/staff/roles.ts") };
  for (const status of STATUSES) assert.equal(needsDecision(status), status === "under_review" || status === "accepted");
  assert.equal(can("reviewer", "reviews.write"), true);
  assert.equal(can("reviewer", "decisions.confirm"), true);
  assert.equal(can("reviewer", "reviews.assign"), false);
  assert.equal(can("editor", "reviews.write"), false);
  assert.equal(can("editor", "reviews.assign"), false);
  assert.equal(can("editor", "decisions.confirm"), false);
  assert.equal(can("admin", "reviews.write"), true);
  assert.equal(can("admin", "reviews.assign"), true);
  assert.equal(can("admin", "decisions.confirm"), true);
  const read = await loadApplicant(database, applicant.id, { id: editor.id }, "");
  assert.equal(read.positions[0].scores.commitment, 4);
  assert.equal(read.positions[0].recommendation, "advance");
  assert.equal(read.notes[0].body, "Fieldwork in the delta is specific and recent.");
  assert.equal(read.notes[0].authorName, "Rae Reviewer");
  assert.equal(JSON.stringify(read).includes("round1_link"), false);
  const unassigned = await loadRecords(database, parseRecordQuery({ list: "applicants", queue: "unassigned" }), { id: editor.id });
  assert.equal(unassigned.rows.some((row) => row.id === applicant.id), true);
  assert.equal(JSON.stringify(unassigned.filters).includes(editor.id), false);
  const admin = await insertUser("admin", "Ada Admin");
  await mod("lib/review/write.ts").assignReviewer(database, grant(admin, "admin"), {
    applicantId: applicant.id,
    assigneeId: reviewer.id,
    expectedAssigneeId: null,
  });
  const mine = await loadRecords(database, parseRecordQuery({ list: "applicants", queue: "mine" }), { id: reviewer.id });
  assert.equal(mine.rows.some((row) => row.id === applicant.id), true);
  assert.equal(mine.rows.find((row) => row.id === applicant.id).href.includes("queue=mine"), true);
  assert.equal(JSON.stringify(mine.filters).includes(reviewer.id), false);
  const notMine = await loadRecords(database, parseRecordQuery({ list: "applicants", queue: "mine" }), { id: editor.id });
  assert.equal(notMine.rows.some((row) => row.id === applicant.id), false);
  const needs = await loadRecords(database, parseRecordQuery({ list: "applicants", queue: "needs" }), { id: editor.id });
  assert.equal(needs.rows.some((row) => row.id === applicant.id), true);
  const { hashToken } = mod("lib/access.ts");
  const raw = `session-${randomUUID()}`;
  await sql.query(
    "insert into user_sessions (hash, user_id, expires_at) values ($1, $2, now() + interval '1 hour')",
    [hashToken(raw), reviewer.id],
  );
  session.raw = raw;
  const form = new FormData();
  form.set("applicantId", applicant.id);
  form.set("version", String(before.version));
  form.set("reviewCycle", "0");
  form.set("decisionId", randomUUID());
  form.set("queue", "mine");
  form.set("field", "reviewDecision");
  form.set("value", "accept");
  form.set("to", "accepted");
  const actions = mod("app/admin/(console)/records/applicants/[id]/actions.ts");
  const preview = await actions.previewDecisionAction({
    applicantId: applicant.id,
    move: { field: "reviewDecision", value: "accept", to: "accepted" },
  });
  assert.equal(preview.result, "ready");
  assert.equal(preview.to, applicant.email);
  await assert.rejects(actions.confirmDecisionAction(null, form), /redirect /);
  const after = await applicantRow(applicant.id);
  assert.equal(after.status, "accepted");
  assert.equal(after.version, before.version + 1);
  assert.equal((await jobs(applicant.id)).length, 1);
  const [receipt] = await receipts(applicant.id);
  assert.equal(receipt.origin, "staff");
  assert.equal(receipt.staff_user_id, reviewer.id);
  const events = await sql.query(
    "select actor, actor_staff_id from application_events where applicant_id = $1 and to_status = 'accepted'",
    [applicant.id],
  );
  assert.equal(events.rows[0].actor_staff_id, reviewer.id);
  const audit = await sql.query(
    "select actor_id from admin_events where kind = 'decision.confirmed' and detail->>'applicantId' = $1",
    [applicant.id],
  );
  assert.deepEqual(audit.rows.map((row) => row.actor_id), [reviewer.id]);

  // Interview outcome in bulk, with its preview, also as the reviewer.
  const bulk = mod("app/admin/(console)/records/actions.ts");
  const accepted = await applicantRow(applicant.id);
  const move = { field: "interviewOutcome", value: "yes", to: "interview_yes" };
  const seen = { applicantId: applicant.id, version: accepted.version, reviewCycle: accepted.review_cycle };
  const bulkPreview = await bulk.previewBulkAction({ move, rows: [seen] });
  assert.equal(bulkPreview.result, "ready");
  assert.equal(bulkPreview.preview.counts.apply, 1);
  const done = await bulk.confirmBulkAction({ move, rows: [{ ...seen, decisionId: randomUUID() }] });
  assert.deepEqual(done.rows.map((row) => row.result), ["applied"]);
  assert.equal((await applicantRow(applicant.id)).status, "interview_yes");
  const interview = await sql.query(
    "select actor_staff_id from application_events where applicant_id = $1 and to_status = 'interview_yes'",
    [applicant.id],
  );
  assert.equal(interview.rows[0].actor_staff_id, reviewer.id);

  // Reviewers still cannot assign reviewers.
  const assign = new FormData();
  assign.set("applicantId", applicant.id);
  assign.set("assigneeId", reviewer.id);
  assert.deepEqual(await actions.assignReviewAction(null, assign), { result: "forbidden" });
  session.raw = "";
});
