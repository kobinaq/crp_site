import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import pg from "pg";
import { createHmac, randomUUID } from "node:crypto";
import { loader } from "./helpers.mjs";
import { startDatabase } from "./db.mjs";

let db;
let sql;
let load;

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
      cookies: async () => ({ get: () => undefined, set() {}, delete() {} }),
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
  return inserted.rows[0];
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
