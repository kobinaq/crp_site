import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import fs from "node:fs";
import test, { after, before } from "node:test";
import pg from "pg";
import { startDatabase } from "./db.mjs";
import { loader } from "./helpers.mjs";

const { sql: drizzleSql } = createRequire(import.meta.url)("drizzle-orm");

let db;
let sql;
let load;

before(async () => {
  db = await startDatabase();
  process.env.DATABASE_URL = db.url;
  process.env.APP_SECRET = "test-secret-test-secret-test-secret-1234";
  process.env.NODE_ENV = "test";
  sql = new pg.Client({ connectionString: db.url });
  await sql.connect();
  load = loader();
});

after(async () => {
  try { await load("lib/db/index.ts").closeDb(); } catch { }
  try { await sql.end(); } catch { }
  try { await db.stop(); } catch { }
});

function mod(path) {
  return load(path);
}

function database() {
  return mod("lib/db/index.ts").getDb();
}

function staff(user, role = user.role) {
  return { id: user.id, email: user.email, role, name: user.name };
}

async function insertUser(role, name, { disabled = false } = {}) {
  const email = `${role}-${randomUUID()}@example.org`;
  const inserted = await sql.query(
    "insert into users (email, role, name, disabled_at) values ($1, $2, $3, case when $4 then now() else null end) returning id, email, role, name",
    [email, role, name, disabled],
  );
  return inserted.rows[0];
}

async function insertNomination() {
  const stamp = randomUUID();
  const inserted = await sql.query(
    `insert into nominations (
      nominator_name, nominator_email, nominee_name, nominee_email, nominee_dob, videoask_link
    ) values ('Ada', $1, 'Grace', $2, '1991-02-03', 'https://secret.example/ask') returning id`,
    [`ada-${stamp}@example.org`, `grace-${stamp}@example.org`],
  );
  return inserted.rows[0].id;
}

async function insertPartner() {
  const stamp = randomUUID();
  const inserted = await sql.query(
    `insert into partner_inquiries (name, email, organization, designation, support, message)
     values ('Pat', $1, 'Harbor Org', 'Lead', 'Funding', 'We can help') returning id`,
    [`pat-${stamp}@example.org`],
  );
  return inserted.rows[0].id;
}

async function caseRow(desk, id) {
  const rows = await sql.query(
    "select status, assignee_id::text as assignee_id from desk_cases where desk = $1 and record_id = $2",
    [desk, id],
  );
  return rows.rows[0] ?? null;
}

async function eventsFor(kind, key, id) {
  const rows = await sql.query(
    `select kind, detail, subject_id::text as subject_id
     from admin_events where kind = $1 and detail->>$2 = $3 order by created_at, id`,
    [kind, key, id],
  );
  return rows.rows;
}

function detailKeys(row) {
  return Object.keys(row.detail).sort();
}

test("staff grants derive from one table and leave the editor set unchanged", () => {
  const { can, ROLE_CAPABILITIES } = mod("lib/staff/roles.ts");
  assert.deepEqual(ROLE_CAPABILITIES.editor, ["dashboard.read", "copy.edit", "copy.publish"]);
  assert.equal(can("editor", "nominations.read"), false);
  assert.equal(can("editor", "partners.read"), false);
  assert.equal(can("reviewer", "nominations.read"), true);
  assert.equal(can("reviewer", "nominations.note"), true);
  assert.equal(can("reviewer", "nominations.manage"), false);
  assert.equal(can("reviewer", "partners.read"), false);
  assert.equal(can("reviewer", "partners.manage"), false);
  assert.equal(can("admin", "nominations.read"), true);
  assert.equal(can("admin", "nominations.note"), true);
  assert.equal(can("admin", "nominations.manage"), true);
  assert.equal(can("admin", "partners.read"), true);
  assert.equal(can("admin", "partners.manage"), true);
  assert.equal(ROLE_CAPABILITIES.reviewer.includes("dashboard.read"), true);
  assert.equal(ROLE_CAPABILITIES.reviewer.includes("reviews.write"), true);
});

test("status moves follow the desk graph, including undo to new and a same-status no-op", () => {
  const { legalMove, isNominationStatus, isPartnerStatus, statusOptions } = mod("lib/desk/case.ts");
  assert.deepEqual(statusOptions("nomination").map(([id]) => id), ["new", "reviewing", "contacted", "converted", "closed"]);
  assert.deepEqual(statusOptions("partner").map(([id]) => id), ["new", "in_conversation", "committed", "declined", "closed"]);
  assert.equal(isNominationStatus("reviewing"), true);
  assert.equal(isNominationStatus("in_conversation"), false);
  assert.equal(isPartnerStatus("declined"), true);
  assert.equal(isPartnerStatus("reviewing"), false);

  for (const [from, to] of [
    ["new", "reviewing"],
    ["new", "closed"],
    ["reviewing", "contacted"],
    ["reviewing", "closed"],
    ["contacted", "converted"],
    ["contacted", "closed"],
    ["closed", "new"],
    ["converted", "new"],
  ]) {
    assert.equal(legalMove("nomination", from, to), true, `${from} -> ${to}`);
  }
  for (const [from, to] of [
    ["new", "in_conversation"],
    ["new", "declined"],
    ["new", "closed"],
    ["in_conversation", "committed"],
    ["in_conversation", "declined"],
    ["in_conversation", "closed"],
    ["closed", "new"],
    ["committed", "new"],
    ["declined", "new"],
  ]) {
    assert.equal(legalMove("partner", from, to), true, `${from} -> ${to}`);
  }

  assert.equal(legalMove("nomination", "reviewing", "reviewing"), true);
  assert.equal(legalMove("partner", "committed", "committed"), true);
  assert.equal(legalMove("nomination", "converted", "reviewing"), false);
  assert.equal(legalMove("nomination", "closed", "contacted"), false);
  assert.equal(legalMove("nomination", "reviewing", "new"), false);
  assert.equal(legalMove("nomination", "new", "converted"), false);
  assert.equal(legalMove("partner", "committed", "declined"), false);
  assert.equal(legalMove("partner", "declined", "in_conversation"), false);
  assert.equal(legalMove("partner", "new", "committed"), false);
});

test("an open row needs attention unless an enabled manager owns it", () => {
  const { needsAttention } = mod("lib/desk/case.ts");
  const admin = { role: "admin", disabled: false };
  const disabledAdmin = { role: "admin", disabled: true };
  const reviewer = { role: "reviewer", disabled: false };
  const editor = { role: "editor", disabled: false };

  for (const status of ["new", "reviewing", "contacted"]) {
    assert.equal(needsAttention("nomination", status, null), true, status);
    assert.equal(needsAttention("nomination", status, admin), false, status);
    assert.equal(needsAttention("nomination", status, disabledAdmin), true, status);
    assert.equal(needsAttention("nomination", status, reviewer), true, status);
  }
  assert.equal(needsAttention("nomination", "converted", null), false);
  assert.equal(needsAttention("nomination", "closed", admin), false);
  assert.equal(needsAttention("nomination", "missing", null), false);

  for (const status of ["new", "in_conversation"]) {
    assert.equal(needsAttention("partner", status, null), true, status);
    assert.equal(needsAttention("partner", status, admin), false, status);
    assert.equal(needsAttention("partner", status, editor), true, status);
  }
  assert.equal(needsAttention("partner", "committed", null), false);
  assert.equal(needsAttention("partner", "declined", null), false);
  assert.equal(needsAttention("partner", "closed", null), false);
});

test("the desk migration adds case tables and does not alter intake columns", () => {
  const sqlText = fs.readFileSync("drizzle/0017_desk_cases.sql", "utf8");
  const journal = JSON.parse(fs.readFileSync("drizzle/meta/_journal.json", "utf8"));
  const entry = journal.entries.find((row) => row.idx === 17);
  assert.equal(entry.tag, "0017_desk_cases");
  assert.equal(entry.when, 1793300000000);
  assert.equal(entry.breakpoints, true);
  assert.match(sqlText, /CREATE TABLE IF NOT EXISTS "desk_cases"/);
  assert.match(sqlText, /CREATE TABLE IF NOT EXISTS "desk_notes"/);
  assert.match(sqlText, /desk_cases_status/);
  assert.match(sqlText, /char_length\("body"\) BETWEEN 1 AND 4000/);
  assert.equal(/alter table "nominations"/i.test(sqlText), false);
  assert.equal(/alter table "partner_inquiries"/i.test(sqlText), false);
  assert.equal(/create type/i.test(sqlText), false);
});

test("status moves write the case, leave intake and applicants alone, and undo only to new", async () => {
  const { moveStatus } = mod("lib/desk/case.ts");
  const db = database();
  const admin = staff(await insertUser("admin", "Ada Admin"));
  const reviewer = staff(await insertUser("reviewer", "Rita Reviewer"));
  const id = await insertNomination();
  const applicantsBefore = await sql.query("select count(*)::int as n from applicants");

  assert.deepEqual(await moveStatus(db, reviewer, { desk: "nomination", recordId: id, expected: "new", to: "reviewing" }), { ok: false, reason: "forbidden" });
  assert.equal(await caseRow("nomination", id), null);
  assert.deepEqual(await moveStatus(db, admin, { desk: "nomination", recordId: id, expected: "new", to: "new" }), { ok: true });
  assert.equal(await caseRow("nomination", id), null);
  assert.equal((await eventsFor("nomination.status", "nominationId", id)).length, 0);

  assert.deepEqual(await moveStatus(db, admin, { desk: "nomination", recordId: id, expected: "new", to: "reviewing" }), { ok: true });
  assert.equal((await caseRow("nomination", id)).status, "reviewing");
  assert.deepEqual(await moveStatus(db, admin, { desk: "nomination", recordId: id, expected: "reviewing", to: "reviewing" }), { ok: true });
  assert.equal((await eventsFor("nomination.status", "nominationId", id)).length, 1);
  assert.deepEqual(await moveStatus(db, admin, { desk: "nomination", recordId: id, expected: "reviewing", to: "converted" }), { ok: false, reason: "illegal" });
  assert.deepEqual(await moveStatus(db, admin, { desk: "nomination", recordId: id, expected: "new", to: "closed" }), { ok: false, reason: "conflict" });
  assert.equal((await caseRow("nomination", id)).status, "reviewing");

  assert.deepEqual(await moveStatus(db, admin, { desk: "nomination", recordId: id, expected: "reviewing", to: "contacted" }), { ok: true });
  assert.deepEqual(await moveStatus(db, admin, { desk: "nomination", recordId: id, expected: "contacted", to: "converted" }), { ok: true });
  const intake = await sql.query("select status::text as status from nominations where id = $1", [id]);
  assert.equal(intake.rows[0].status, "new");
  const applicantsAfter = await sql.query("select count(*)::int as n from applicants");
  assert.equal(applicantsAfter.rows[0].n, applicantsBefore.rows[0].n);
  assert.deepEqual(await moveStatus(db, admin, { desk: "nomination", recordId: id, expected: "converted", to: "new" }), { ok: true });
  assert.equal((await caseRow("nomination", id)).status, "new");
  const undo = await eventsFor("nomination.status", "nominationId", id);
  assert.equal(undo.at(-1).detail.from, "converted");
  assert.equal(undo.at(-1).detail.to, "new");
  assert.equal(JSON.stringify(undo).includes("@"), false);
  assert.equal(JSON.stringify(undo).includes("body"), false);

  const partnerId = await insertPartner();
  assert.deepEqual(await moveStatus(db, admin, { desk: "partner", recordId: partnerId, expected: "new", to: "declined" }), { ok: true });
  assert.deepEqual(await moveStatus(db, admin, { desk: "partner", recordId: partnerId, expected: "declined", to: "declined" }), { ok: true });
  assert.equal((await eventsFor("partner.status", "partnerId", partnerId)).length, 1);
  assert.deepEqual(await moveStatus(db, admin, { desk: "partner", recordId: partnerId, expected: "declined", to: "new" }), { ok: true });
  assert.equal((await caseRow("partner", partnerId)).status, "new");
  await assert.rejects(sql.query("update desk_cases set status = 'nope' where desk = 'nomination' and record_id = $1", [id]));
});

test("notes keep the first body and reject roles that cannot write", async () => {
  const { addNote, loadDetail } = mod("lib/desk/case.ts");
  const db = database();
  const admin = staff(await insertUser("admin", "Ada Admin"));
  const reviewer = staff(await insertUser("reviewer", "Rita Reviewer"));
  const editor = staff(await insertUser("editor", "Ed Editor"));
  const id = await insertNomination();
  const noteId = randomUUID();
  const partnerId = await insertPartner();

  assert.deepEqual(await addNote(db, editor, { desk: "nomination", recordId: id, noteId, body: "hello" }), { ok: false, reason: "forbidden" });
  assert.deepEqual(await addNote(db, reviewer, { desk: "partner", recordId: partnerId, noteId, body: "hello" }), { ok: false, reason: "forbidden" });
  assert.deepEqual(await addNote(db, reviewer, { desk: "nomination", recordId: id, noteId, body: "   " }), { ok: false, reason: "invalid" });
  assert.deepEqual(await addNote(db, reviewer, { desk: "nomination", recordId: id, noteId, body: "x".repeat(4001) }), { ok: false, reason: "invalid" });
  assert.deepEqual(await addNote(db, reviewer, { desk: "nomination", recordId: randomUUID(), noteId, body: "hello" }), { ok: false, reason: "not_found" });

  assert.deepEqual(await addNote(db, reviewer, { desk: "nomination", recordId: id, noteId, body: "  first body  " }), { ok: true });
  assert.deepEqual(await addNote(db, admin, { desk: "nomination", recordId: id, noteId, body: "second body" }), { ok: true });
  const stored = await sql.query("select body from desk_notes where id = $1", [noteId]);
  assert.equal(stored.rows[0].body, "first body");
  const noted = await eventsFor("nomination.noted", "nominationId", id);
  assert.equal(noted.length, 1);
  assert.deepEqual(detailKeys(noted[0]), ["nominationId", "noteId"]);
  assert.equal(JSON.stringify(noted).includes("first body"), false);

  const laterId = randomUUID();
  assert.deepEqual(await addNote(db, reviewer, { desk: "nomination", recordId: id, noteId: laterId, body: "later" }), { ok: true });
  await sql.query("update desk_notes set created_at = '2020-01-02T00:00:00Z' where id = $1", [noteId]);
  await sql.query("update desk_notes set created_at = '2020-01-01T00:00:00Z' where id = $1", [laterId]);
  const detail = await loadDetail(db, reviewer, "nomination", id);
  assert.deepEqual(detail.notes.map((note) => note.body), ["later", "first body"]);
  const partnerNote = randomUUID();
  assert.deepEqual(await addNote(db, admin, { desk: "partner", recordId: partnerId, noteId: partnerNote, body: "partner note" }), { ok: true });
  const partnerEvents = await eventsFor("partner.noted", "partnerId", partnerId);
  assert.deepEqual(detailKeys(partnerEvents[0]), ["noteId", "partnerId"]);
});

test("assignment is compare-and-swap and only an enabled manager can take the row", async () => {
  const { assignStaff } = mod("lib/desk/case.ts");
  const db = database();
  const admin = staff(await insertUser("admin", "Ada Admin"));
  const other = staff(await insertUser("admin", "Bea Admin"));
  const reviewer = staff(await insertUser("reviewer", "Rita Reviewer"));
  const editor = staff(await insertUser("editor", "Ed Editor"));
  const disabled = await insertUser("admin", "Disabled Admin", { disabled: true });
  const id = await insertNomination();

  assert.deepEqual(await assignStaff(db, editor, { desk: "nomination", recordId: id, assigneeId: admin.id, expectedAssigneeId: null }), { ok: false, reason: "forbidden" });
  assert.deepEqual(await assignStaff(db, admin, { desk: "nomination", recordId: id, assigneeId: "not-a-uuid", expectedAssigneeId: null }), { ok: false, reason: "invalid" });
  assert.deepEqual(await assignStaff(db, admin, { desk: "nomination", recordId: id, assigneeId: reviewer.id, expectedAssigneeId: null }), { ok: false, reason: "invalid_assignee" });
  assert.deepEqual(await assignStaff(db, admin, { desk: "nomination", recordId: id, assigneeId: disabled.id, expectedAssigneeId: null }), { ok: false, reason: "invalid_assignee" });
  assert.deepEqual(await assignStaff(db, admin, { desk: "nomination", recordId: id, assigneeId: randomUUID(), expectedAssigneeId: null }), { ok: false, reason: "invalid_assignee" });
  assert.equal(await caseRow("nomination", id), null);

  assert.deepEqual(await assignStaff(db, admin, { desk: "nomination", recordId: id, assigneeId: admin.id, expectedAssigneeId: null }), { ok: true });
  assert.equal((await caseRow("nomination", id)).status, "new");
  assert.equal((await caseRow("nomination", id)).assignee_id, admin.id);
  assert.deepEqual(await assignStaff(db, admin, { desk: "nomination", recordId: id, assigneeId: other.id, expectedAssigneeId: null }), { ok: false, reason: "conflict" });
  assert.equal((await caseRow("nomination", id)).assignee_id, admin.id);
  assert.deepEqual(await assignStaff(db, admin, { desk: "nomination", recordId: id, assigneeId: admin.id, expectedAssigneeId: admin.id }), { ok: true });
  assert.equal((await eventsFor("nomination.assigned", "nominationId", id)).length, 1);

  assert.deepEqual(await assignStaff(db, admin, { desk: "nomination", recordId: id, assigneeId: other.id, expectedAssigneeId: admin.id }), { ok: true });
  assert.deepEqual(await assignStaff(db, admin, { desk: "nomination", recordId: id, assigneeId: null, expectedAssigneeId: other.id }), { ok: true });
  const assigned = await eventsFor("nomination.assigned", "nominationId", id);
  assert.equal(assigned.length, 3);
  assert.equal(assigned.at(-1).detail.assigneeId, null);
  assert.equal(assigned.at(-1).detail.previousAssigneeId, other.id);
  assert.equal(assigned.at(-1).subject_id, null);
  assert.equal(assigned[0].subject_id, admin.id);
  assert.equal(JSON.stringify(assigned).includes("@"), false);
  assert.deepEqual(await assignStaff(db, admin, { desk: "nomination", recordId: id, assigneeId: null, expectedAssigneeId: null }), { ok: true });
  assert.equal((await eventsFor("nomination.assigned", "nominationId", id)).length, 3);
  assert.equal((await caseRow("nomination", id)).assignee_id, null);
});

test("a missing case row is new and needs attention until an enabled manager owns an open row", async () => {
  const { assignStaff, deskColumns, deskWhere, loadDeskSummary, moveStatus, needsAttention } = mod("lib/desk/case.ts");
  const db = database();
  const admin = staff(await insertUser("admin", "Ada Admin"));
  const before = await loadDeskSummary(db, "nomination");
  const openId = await insertNomination();
  const closedId = await insertNomination();
  const afterInsert = await loadDeskSummary(db, "nomination");
  assert.equal(afterInsert.list, "nominations");
  assert.equal(afterInsert.total, before.total + 2);
  assert.equal(afterInsert.needsAttention, before.needsAttention + 2);
  assert.equal(afterInsert.counts.find((row) => row.status === "new").count, before.counts.find((row) => row.status === "new").count + 2);
  assert.equal(afterInsert.counts.find((row) => row.status === "converted").count, before.counts.find((row) => row.status === "converted").count);
  assert.equal(afterInsert.counts.length, 5);

  const columns = deskColumns("nomination", drizzleSql.raw("nominations.id"));
  const missing = await db.execute(drizzleSql`
    select ${columns.status} as status, ${columns.label} as label, ${columns.assigneeEmail} as email, ${columns.assignee} as assignee
    from nominations where id = ${openId}
  `);
  assert.equal(missing.rows[0].status, "new");
  assert.equal(missing.rows[0].label, "New");
  assert.equal(missing.rows[0].email, null);
  assert.equal(missing.rows[0].assignee, "");

  assert.equal(deskWhere("nomination", drizzleSql`nominations.id`, { status: "invited", attention: "" }), "empty");
  const needs = await attentionIds("nomination");
  assert.equal(needs.has(openId), true);
  assert.equal(needs.has(closedId), true);

  await moveStatus(db, admin, { desk: "nomination", recordId: closedId, expected: "new", to: "closed" });
  const closedSummary = await loadDeskSummary(db, "nomination");
  assert.equal(closedSummary.needsAttention, afterInsert.needsAttention - 1);
  assert.equal((await attentionIds("nomination")).has(closedId), false);
  assert.equal(needsAttention("nomination", "closed", null), false);

  await assignStaff(db, admin, { desk: "nomination", recordId: openId, assigneeId: admin.id, expectedAssigneeId: null });
  assert.equal((await attentionIds("nomination")).has(openId), false);
  const owned = await db.execute(drizzleSql`
    select ${columns.assigneeEmail} as email, ${columns.assignee} as assignee
    from nominations where id = ${openId}
  `);
  assert.equal(owned.rows[0].email, admin.email);
  assert.equal(owned.rows[0].assignee, "Ada Admin");

  await sql.query("update users set disabled_at = now() where id = $1", [admin.id]);
  assert.equal((await attentionIds("nomination")).has(openId), true);
  await sql.query("update users set disabled_at = null, role = 'editor' where id = $1", [admin.id]);
  assert.equal((await attentionIds("nomination")).has(openId), true);
  await sql.query("update users set role = 'admin' where id = $1", [admin.id]);
  assert.equal((await attentionIds("nomination")).has(openId), false);

  await moveStatus(db, admin, { desk: "nomination", recordId: closedId, expected: "closed", to: "new" });
  assert.equal((await attentionIds("nomination")).has(closedId), true);
  assert.equal((await caseRow("nomination", closedId)).status, "new");

  const partnerBefore = await loadDeskSummary(db, "partner");
  const partnerId = await insertPartner();
  const partnerAfter = await loadDeskSummary(db, "partner");
  assert.equal(partnerAfter.needsAttention, partnerBefore.needsAttention + 1);
  assert.equal(partnerAfter.list, "partners");
  assert.deepEqual(await moveStatus(db, admin, { desk: "partner", recordId: partnerId, expected: "new", to: "in_conversation" }), { ok: true });
  assert.equal((await attentionIds("partner")).has(partnerId), true);
  assert.deepEqual(await moveStatus(db, admin, { desk: "partner", recordId: partnerId, expected: "in_conversation", to: "committed" }), { ok: true });
  assert.equal((await attentionIds("partner")).has(partnerId), false);
});

test("detail hides date of birth and videoask, and hides controls the viewer cannot use", async () => {
  const { addNote, loadDetail } = mod("lib/desk/case.ts");
  const db = database();
  const admin = staff(await insertUser("admin", "Ada Admin"));
  const reviewer = staff(await insertUser("reviewer", "Rita Reviewer"));
  const editor = staff(await insertUser("editor", "Ed Editor"));
  const id = await insertNomination();
  const partnerId = await insertPartner();

  assert.equal(await loadDetail(db, editor, "nomination", id), null);
  assert.equal(await loadDetail(db, reviewer, "partner", partnerId), null);
  assert.equal(await loadDetail(db, admin, "nomination", "not-a-uuid"), null);

  const reviewerDetail = await loadDetail(db, reviewer, "nomination", id);
  assert.equal(reviewerDetail.heading, "Grace");
  assert.equal(reviewerDetail.status, "new");
  assert.equal(reviewerDetail.statusLabel, "New");
  assert.equal(reviewerDetail.canNote, true);
  assert.equal(reviewerDetail.canAssign, false);
  assert.deepEqual(reviewerDetail.moves, []);
  assert.deepEqual(reviewerDetail.assignees, []);
  assert.equal(reviewerDetail.fields.find((field) => field.label === "Nominee status").value, "new");
  const packed = JSON.stringify(reviewerDetail);
  assert.equal(packed.includes("1991-02-03"), false);
  assert.equal(packed.includes("secret.example"), false);
  assert.equal(packed.includes("videoask"), false);

  const adminDetail = await loadDetail(db, admin, "nomination", id);
  assert.deepEqual(adminDetail.moves.map((move) => move.to), ["reviewing", "closed"]);
  assert.equal(adminDetail.canAssign, true);
  assert.equal(adminDetail.assignees.some((person) => person.id === admin.id), true);

  const partner = await loadDetail(db, admin, "partner", partnerId);
  assert.equal(partner.heading, "Harbor Org");
  assert.equal(partner.fields.find((field) => field.label === "Message").value, "We can help");
  await addNote(db, admin, { desk: "partner", recordId: partnerId, noteId: randomUUID(), body: "keep this off the list" });
  const reread = await loadDetail(db, admin, "partner", partnerId);
  assert.equal(reread.notes[0].body, "keep this off the list");
});

test("desk controls stay hidden when the viewer cannot use them, and the form does not post a desk", () => {
  const viewLoad = loader({
    react: {
      useActionState: (action) => [null, action, false],
      useState: (initial) => [typeof initial === "function" ? initial() : initial, () => {}],
      useRef: (initial) => ({ current: initial }),
      useId: () => "desk-test",
      useEffect: () => {},
      useLayoutEffect: () => {},
    },
    "next/link": (props) => ({ type: "a", props }),
    "next/navigation": {
      useRouter: () => ({ push() {}, refresh() {}, replace() {} }),
    },
  });
  const { DeskView } = viewLoad("components/admin/DeskView.tsx");
  const detail = {
    desk: "nomination",
    recordId: "00000000-0000-4000-8000-000000000010",
    heading: "Grace",
    status: "new",
    statusLabel: "New",
    assignee: null,
    moves: [],
    canNote: true,
    canAssign: false,
    assignees: [],
    notes: [],
    fields: [{ label: "Nominee status", value: "new" }],
  };
  const actions = { noteAction() {}, moveAction() {}, assignAction() {}, listHref: "/admin/records?list=nominations", backLabel: "Back to nominations", previous: null, next: null };
  const reviewer = DeskView({ detail, noteId: "note-1", ...actions });
  const reviewerNames = fieldNames(reviewer);
  assert.equal(reviewerNames.includes("desk"), false);
  assert.equal(reviewerNames.includes("body"), true);
  assert.equal(reviewerNames.includes("to"), false);
  assert.equal(reviewerNames.includes("assigneeId"), false);

  const admin = DeskView({
    detail: {
      ...detail,
      canAssign: true,
      moves: [{ to: "reviewing", label: "Reviewing" }, { to: "closed", label: "Closed" }],
      assignees: [{ id: "00000000-0000-4000-8000-000000000011", name: "Ada Admin", email: "ada@example.org" }],
    },
    noteId: "note-1",
    ...actions,
  });
  const adminNames = fieldNames(admin);
  assert.equal(adminNames.includes("desk"), false);
  assert.deepEqual(adminNames.filter((name) => name === "to"), ["to", "to"]);
  assert.equal(adminNames.includes("expected"), true);
  assert.equal(adminNames.includes("assigneeId"), true);
  assert.equal(expand(admin).some((node) => node.props?.children === "Reviewing"), true);
});

function expand(tree) {
  const all = [];
  function walk(node) {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    all.push(node);
    if (typeof node.type === "function") walk(node.type(node.props));
    walk(node.props?.children);
  }
  walk(tree);
  return all;
}

function fieldNames(tree) {
  return expand(tree).flatMap((node) => (typeof node.props?.name === "string" ? [node.props.name] : []));
}

async function attentionIds(desk) {
  const { deskWhere } = mod("lib/desk/case.ts");
  const table = desk === "nomination" ? "nominations" : "partner_inquiries";
  const where = deskWhere(desk, drizzleSql.raw(`${table}.id`), { status: "", attention: "needs" });
  const result = await database().execute(drizzleSql`select id from ${drizzleSql.raw(table)} where ${where}`);
  return new Set(result.rows.map((row) => row.id));
}
