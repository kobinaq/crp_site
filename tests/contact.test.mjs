import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import test, { after, before } from "node:test";
import pg from "pg";
import { startDatabase } from "./db.mjs";
import { loader } from "./helpers.mjs";

let db;
let sql;
let real;
let stored;

before(async () => {
  db = await startDatabase();
  process.env.DATABASE_URL = db.url;
  process.env.APP_SECRET = "test-secret-test-secret-test-secret-1234";
  process.env.NODE_ENV = "test";
  delete process.env.TURNSTILE_SECRET_KEY;
  sql = new pg.Client({ connectionString: db.url });
  await sql.connect();
  const cache = { "next/cache": { unstable_cache: (fn) => fn, updateTag() {} } };
  real = loader(cache);
  stored = loader({
    ...cache,
    "@/lib/turnstile": { verifyTurnstile: async () => true },
  });
});

after(async () => {
  try { await stored("lib/db/index.ts").closeDb(); } catch { /* pool may already be closed */ }
  try { await real("lib/db/index.ts").closeDb(); } catch { /* pool may already be closed */ }
  try { await sql.end(); } catch { /* ignore */ }
  try { await db.stop(); } catch { /* ignore */ }
});

function payload(overrides = {}) {
  return {
    name: "Ada Lovelace",
    organization: "Harbor",
    email: `ada-${randomUUID()}@example.com`,
    dial: "+1",
    nationalNumber: "5551234567",
    message: "Hello there",
    locale: "en",
    turnstileToken: "token",
    ...overrides,
  };
}

function acceptStored(raw, ip) {
  const messages = stored("lib/contact/messages.ts");
  return messages.acceptContactMessage(stored("lib/db/index.ts").getDb(), raw, ip);
}

function acceptReal(raw, ip) {
  const messages = real("lib/contact/messages.ts");
  return messages.acceptContactMessage(real("lib/db/index.ts").getDb(), raw, ip);
}

async function countEmail(email) {
  const rows = await sql.query("select count(*)::int as n from contact_messages where email = $1", [email]);
  return rows.rows[0].n;
}

async function withTurnstileSecret(fn) {
  const previous = process.env.TURNSTILE_SECRET_KEY;
  process.env.TURNSTILE_SECRET_KEY = "turnstile-test-secret";
  try {
    return await fn();
  } finally {
    if (previous === undefined) delete process.env.TURNSTILE_SECRET_KEY;
    else process.env.TURNSTILE_SECRET_KEY = previous;
  }
}

test("the contact migration is journaled and rejects a phone or read_at pair outside the rules", async () => {
  const sqlText = fs.readFileSync("drizzle/0019_contact_messages.sql", "utf8");
  const journal = JSON.parse(fs.readFileSync("drizzle/meta/_journal.json", "utf8"));
  const entry = journal.entries.find((row) => row.idx === 19);
  assert.equal(entry.tag, "0019_contact_messages");
  assert.equal(entry.version, "7");
  assert.equal(entry.when, 1793500000000);
  assert.equal(entry.breakpoints, true);
  assert.match(sqlText, /Apply by hand/);
  assert.match(sqlText, /IF NOT EXISTS/);
  assert.match(sqlText, /contact_messages_phone/);
  assert.match(sqlText, /contact_messages_read_pair/);
  assert.match(sqlText, /contact_messages_created_idx/);
  assert.match(sqlText, /contact_messages_status_created_idx/);
  assert.match(sqlText, /contact_messages_assignee_idx/);
  assert.match(sqlText, /contact_notes_message_idx/);
  const notes = sqlText.slice(sqlText.indexOf('CREATE TABLE IF NOT EXISTS "contact_notes"'));
  assert.equal(/gen_random_uuid/i.test(notes), false);

  const email = `bad-${randomUUID()}@example.com`;
  await assert.rejects(sql.query(
    "insert into contact_messages (name, email, phone, body, locale) values ('Ann', $1, '555', 'hello', 'en')",
    [email],
  ));
  await assert.rejects(sql.query(
    "insert into contact_messages (name, email, phone, body, locale, status, read_at) values ('Ann', $1, '+1 5551234567', 'hello', 'en', 'new', now())",
    [`${email}.new`],
  ));
  await assert.rejects(sql.query(
    "insert into contact_messages (name, email, phone, body, locale, status) values ('Ann', $1, '+1 5551234567', 'hello', 'en', 'read')",
    [`${email}.read`],
  ));
});

test("a filled honeypot is success and stores nothing, and it skips Turnstile", async () => {
  const fields = payload({ company_website: "https://spam.example" });
  delete fields.turnstileToken;
  await withTurnstileSecret(async () => {
    assert.deepEqual(await acceptReal(fields, "203.0.113.20"), { ok: true });
  });
  assert.equal(await countEmail(fields.email), 0);
  const jobs = await sql.query("select count(*)::int as n from jobs where payload->>'to' = $1", [fields.email]);
  assert.equal(jobs.rows[0].n, 0);
});

test("Turnstile rejection stores nothing", async () => {
  const fields = payload();
  delete fields.turnstileToken;
  await withTurnstileSecret(async () => {
    assert.deepEqual(await acceptReal(fields, "203.0.113.21"), { ok: false, reason: "turnstile" });
  });
  assert.equal(await countEmail(fields.email), 0);
});

test("validation rejects a short name, a long body, a bad email, an unknown dial, and a short national number", async () => {
  const cases = [
    [payload({ name: "A" }), ["name"]],
    [payload({ message: "y".repeat(4001) }), ["message"]],
    [payload({ email: "not-an-email" }), ["email"]],
    [payload({ dial: "+999" }), ["phone"]],
    [payload({ nationalNumber: "12345" }), ["phone"]],
    [payload({ name: "A", organization: "o".repeat(201), message: "hi" }), ["name", "organization", "message"]],
  ];
  for (const [fields, invalid] of cases) {
    assert.deepEqual(await acceptStored(fields, "203.0.113.22"), { ok: false, reason: "invalid", fields: invalid });
    if (fields.email.includes("@")) assert.equal(await countEmail(fields.email.toLowerCase()), 0);
  }
});

// Postgres char_length counts code points; String.length counts UTF-16 units.
const ASTRAL = "\u{1F600}"; // 😀: char_length 1, String.length 2

test("an emoji-only name is a name field error, not a failed insert", async () => {
  const fields = payload({ name: ASTRAL });
  assert.deepEqual(await acceptStored(fields, "203.0.113.30"), { ok: false, reason: "invalid", fields: ["name"] });
  assert.equal(await countEmail(fields.email), 0);
  const padded = payload({ name: `  ${ASTRAL}  ` });
  assert.deepEqual(await acceptStored(padded, "203.0.113.30"), { ok: false, reason: "invalid", fields: ["name"] });
});

test("a two-emoji name is stored and the database agrees on its length", async () => {
  const fields = payload({ name: ASTRAL + ASTRAL });
  assert.deepEqual(await acceptStored(fields, "203.0.113.31"), { ok: true });
  const rows = await sql.query("select name, char_length(name) as n from contact_messages where email = $1", [fields.email]);
  assert.equal(rows.rowCount, 1);
  assert.equal(rows.rows[0].name, ASTRAL + ASTRAL);
  assert.equal(rows.rows[0].n, 2);
});

test("bodies and names at the max in code points are stored, and one more is a field error", async () => {
  const body = ASTRAL.repeat(4000);
  assert.equal(body.length, 8000);
  const atMax = payload({ message: body });
  assert.deepEqual(await acceptStored(atMax, "203.0.113.32"), { ok: true });
  const rows = await sql.query("select char_length(body) as n from contact_messages where email = $1", [atMax.email]);
  assert.equal(rows.rows[0].n, 4000);

  const over = payload({ message: ASTRAL.repeat(4001) });
  assert.deepEqual(await acceptStored(over, "203.0.113.32"), { ok: false, reason: "invalid", fields: ["message"] });
  assert.equal(await countEmail(over.email), 0);

  const mixed = payload({ message: `${"a".repeat(3999)}${ASTRAL}` });
  assert.deepEqual(await acceptStored(mixed, "203.0.113.32"), { ok: true });

  const name = payload({ name: ASTRAL.repeat(200), organization: ASTRAL.repeat(200) });
  assert.deepEqual(await acceptStored(name, "203.0.113.33"), { ok: true });
  const longName = payload({ name: ASTRAL.repeat(201), organization: ASTRAL.repeat(201) });
  assert.deepEqual(await acceptStored(longName, "203.0.113.33"), { ok: false, reason: "invalid", fields: ["name", "organization"] });

  const nul = payload({ name: "Ada\u0000", message: "Hello\u0000there" });
  assert.deepEqual(await acceptStored(nul, "203.0.113.33"), { ok: false, reason: "invalid", fields: ["name", "message"] });
});

test("a CHECK violation from the database maps to the field it guards", async () => {
  const messages = stored("lib/contact/messages.ts");
  const error = await sql.query(
    "insert into contact_messages (name, email, phone, body, locale) values ($1, $2, '+1 5551234567', 'hello', 'en')",
    [ASTRAL, `check-${randomUUID()}@example.com`],
  ).then(() => null, (err) => err);
  assert.equal(error.code, "23514");
  assert.equal(error.constraint, "contact_messages_name_len");
  assert.equal(messages.checkViolationField(error), "name");
  assert.equal(messages.checkViolationField(new Error("wrapped", { cause: error })), "name");
  assert.equal(messages.checkViolationField({ code: "23514", constraint: "contact_messages_body_len" }), "message");
  assert.equal(messages.checkViolationField({ code: "23514", constraint: "contact_messages_read_pair" }), null);
  assert.equal(messages.checkViolationField({ code: "23505", constraint: "contact_messages_name_len" }), null);
});

test("a message is stored as new with read_at null", async () => {
  const email = `Ada-${randomUUID()}@Example.com`;
  const fields = payload({
    email,
    name: "  Ada Lovelace ",
    organization: "   ",
    nationalNumber: "555-123-4567",
    locale: "de",
    message: "  Hello there  ",
  });
  assert.deepEqual(await acceptStored(fields, "203.0.113.23"), { ok: true });
  const storedEmail = email.toLowerCase();
  const rows = await sql.query(
    "select name, email, organization, phone, body, locale, status, read_at from contact_messages where email = $1",
    [storedEmail],
  );
  assert.equal(rows.rowCount, 1);
  assert.equal(rows.rows[0].name, "Ada Lovelace");
  assert.equal(rows.rows[0].email, storedEmail);
  assert.equal(rows.rows[0].organization, null);
  assert.equal(rows.rows[0].phone, "+1 5551234567");
  assert.equal(rows.rows[0].body, "Hello there");
  assert.equal(rows.rows[0].locale, "en");
  assert.equal(rows.rows[0].status, "new");
  assert.equal(rows.rows[0].read_at, null);
  const found = await sql.query("select id from contact_messages where email = $1", [storedEmail]);
  const job = await sql.query("select payload from jobs where dedupe_key = $1", [`email:contact:${found.rows[0].id}`]);
  assert.equal(job.rowCount, 1);
  assert.equal(job.rows[0].payload.template, "contact");
  assert.equal(job.rows[0].payload.to, storedEmail);
  assert.equal(job.rows[0].payload.subject, "We've received your message");
  assert.match(job.rows[0].payload.html, /We've received your message\./);
  assert.doesNotMatch(job.rows[0].payload.html, /stored|retention/i);
  const user = await sql.query(
    "insert into users (email, role, name) values ($1, 'admin', 'Ada') returning id",
    [`admin-${randomUUID()}@example.org`],
  );
  await assert.rejects(sql.query(
    "insert into contact_notes (message_id, author_id, body) values ($1, $2, 'hi')",
    [found.rows[0].id, user.rows[0].id],
  ));
});

test("the fifth message for an email is stored and the sixth is refused", async () => {
  const email = `rate-${randomUUID()}@example.com`;
  const ip = "203.0.113.24";
  for (let n = 0; n < 5; n += 1) {
    assert.deepEqual(await acceptStored(payload({ email, message: `Hello there ${n}` }), ip), { ok: true });
  }
  assert.deepEqual(await acceptStored(payload({ email, message: "Hello there again" }), ip), { ok: false, reason: "rate_limited" });
  assert.equal(await countEmail(email), 5);

  const skipped = payload({ email: `skip-${randomUUID()}@example.com`, company_website: "filled" });
  for (let n = 0; n < 6; n += 1) assert.deepEqual(await acceptStored(skipped, "203.0.113.25"), { ok: true });
  assert.equal(await countEmail(skipped.email), 0);
  assert.deepEqual(await acceptStored(payload({ email: skipped.email }), "203.0.113.25"), { ok: true });
  assert.equal(await countEmail(skipped.email), 1);
});

test("a French receipt is queued without saying the message is stored", async () => {
  const email = `fr-${randomUUID()}@example.com`;
  assert.deepEqual(await acceptStored(payload({ email, locale: "fr", name: "Camille" }), "203.0.113.26"), { ok: true });
  const row = await sql.query("select id from contact_messages where email = $1", [email]);
  const job = await sql.query("select payload from jobs where dedupe_key = $1", [`email:contact:${row.rows[0].id}`]);
  assert.equal(job.rowCount, 1);
  assert.equal(job.rows[0].payload.subject, "Nous avons bien reçu votre message");
  assert.match(job.rows[0].payload.html, /Nous avons bien reçu votre message\./);
  assert.match(job.rows[0].payload.html, /lang="fr"/);
  assert.doesNotMatch(job.rows[0].payload.html, /stored|retention/i);
});

function staff(user, role = user.role) {
  return { id: user.id, email: user.email, role, name: user.name };
}

async function insertUser(role, name) {
  const email = `${role}-${randomUUID()}@example.org`;
  const inserted = await sql.query(
    "insert into users (email, role, name) values ($1, $2, $3) returning id, email, role, name",
    [email, role, name],
  );
  return inserted.rows[0];
}

async function messageRow(email) {
  const rows = await sql.query("select id, status, read_at from contact_messages where email = $1", [email]);
  return rows.rows[0];
}

async function eventsFor(id) {
  const rows = await sql.query(
    "select kind, subject_id::text as subject_id, detail from admin_events where detail->>'messageId' = $1 order by created_at, id",
    [id],
  );
  return rows.rows;
}

function change(actor, command) {
  return stored("lib/contact/messages.ts").changeMessage(stored("lib/db/index.ts").getDb(), actor, command);
}

test("an editor or reviewer cannot read or manage messages, and a manage call leaves the row", async () => {
  const { can } = stored("lib/staff/roles.ts");
  for (const role of ["editor", "reviewer"]) {
    assert.equal(can(role, "messages.read"), false, role);
    assert.equal(can(role, "messages.manage"), false, role);
  }
  assert.equal(can("admin", "messages.read"), true);
  assert.equal(can("admin", "messages.manage"), true);

  const email = `locked-${randomUUID()}@example.com`;
  assert.deepEqual(await acceptStored(payload({ email }), "203.0.113.40"), { ok: true });
  const row = await messageRow(email);
  const editor = staff(await insertUser("editor", "Ed Editor"));
  assert.deepEqual(await change(editor, { kind: "markRead", messageId: row.id, expected: "new" }), { ok: false, reason: "forbidden" });
  const after = await messageRow(email);
  assert.equal(after.status, "new");
  assert.equal(after.read_at, null);
  assert.equal((await eventsFor(row.id)).length, 0);
  assert.equal(await stored("lib/contact/messages.ts").loadMessage(stored("lib/db/index.ts").getDb(), editor, row.id), null);
});

test("status repeats write no second event, and spam from archived does not pass through new", async () => {
  const admin = staff(await insertUser("admin", "Ada Admin"));
  const email = `graph-${randomUUID()}@example.com`;
  await acceptStored(payload({ email }), "203.0.113.41");
  const row = await messageRow(email);

  assert.deepEqual(await change(admin, { kind: "markRead", messageId: row.id, expected: "new" }), { ok: true });
  const read = await messageRow(email);
  assert.equal(read.status, "read");
  assert.ok(read.read_at);
  assert.deepEqual(await change(admin, { kind: "markRead", messageId: row.id, expected: "new" }), { ok: true });
  const still = await messageRow(email);
  assert.equal(new Date(still.read_at).getTime(), new Date(read.read_at).getTime());
  const readEvents = (await eventsFor(row.id)).filter((event) => event.kind === "contact.status");
  assert.equal(readEvents.length, 1);
  assert.equal(readEvents[0].subject_id, null);
  assert.equal(readEvents[0].detail.messageId, row.id);

  assert.deepEqual(await change(admin, { kind: "markSpam", messageId: row.id, expected: "read" }), { ok: true });
  const spam = await messageRow(email);
  assert.equal(spam.status, "spam");
  assert.equal(new Date(spam.read_at).getTime(), new Date(read.read_at).getTime());
  assert.deepEqual(await change(admin, { kind: "restore", messageId: row.id, expected: "spam" }), { ok: true });
  const restored = await messageRow(email);
  assert.equal(restored.status, "read");
  assert.equal(new Date(restored.read_at).getTime(), new Date(read.read_at).getTime());

  const unreadEmail = `unread-${randomUUID()}@example.com`;
  await acceptStored(payload({ email: unreadEmail }), "203.0.113.42");
  const unread = await messageRow(unreadEmail);
  assert.deepEqual(await change(admin, { kind: "archive", messageId: unread.id, expected: "read" }), { ok: false, reason: "conflict" });
  assert.equal((await messageRow(unreadEmail)).status, "new");
  assert.deepEqual(await change(admin, { kind: "archive", messageId: unread.id, expected: "new" }), { ok: true });
  const archived = await messageRow(unreadEmail);
  assert.equal(archived.status, "archived");
  assert.equal(archived.read_at, null);
  assert.deepEqual(await change(admin, { kind: "archive", messageId: unread.id, expected: "new" }), { ok: true });
  assert.equal((await eventsFor(unread.id)).filter((event) => event.kind === "contact.status").length, 1);
  assert.deepEqual(await change(admin, { kind: "markSpam", messageId: unread.id, expected: "archived" }), { ok: true });
  const spammed = await messageRow(unreadEmail);
  assert.equal(spammed.status, "spam");
  assert.equal(spammed.read_at, null);
  const moves = (await eventsFor(unread.id)).filter((event) => event.kind === "contact.status");
  assert.deepEqual(moves.map((event) => [event.detail.from, event.detail.to]), [
    ["new", "archived"],
    ["archived", "spam"],
  ]);
  assert.deepEqual(await change(admin, { kind: "restore", messageId: unread.id, expected: "spam" }), { ok: true });
  const back = await messageRow(unreadEmail);
  assert.equal(back.status, "new");
  assert.equal(back.read_at, null);

  const detail = await stored("lib/contact/messages.ts").loadMessage(stored("lib/db/index.ts").getDb(), admin, unread.id);
  assert.equal(detail.state.status, "new");
  assert.equal((await messageRow(unreadEmail)).read_at, null);
});

test("assignment and notes record one event, and a repeat writes nothing", async () => {
  const adminUser = await insertUser("admin", "Owner Admin");
  const admin = staff(adminUser);
  const editor = staff(await insertUser("editor", "Note Editor"));
  const email = `own-${randomUUID()}@example.com`;
  await acceptStored(payload({ email }), "203.0.113.43");
  const row = await messageRow(email);
  assert.deepEqual(await change(admin, {
    kind: "assign",
    messageId: row.id,
    assigneeId: editor.id,
    expectedAssigneeId: null,
  }), { ok: false, reason: "invalid_assignee" });
  assert.equal((await messageRow(email)).status, "new");
  assert.deepEqual(await change(admin, {
    kind: "assign",
    messageId: row.id,
    assigneeId: admin.id,
    expectedAssigneeId: null,
  }), { ok: true });
  const assignEvent = (await eventsFor(row.id)).find((event) => event.kind === "contact.assigned");
  assert.equal(assignEvent.subject_id, admin.id);
  assert.equal(assignEvent.detail.messageId, row.id);
  assert.deepEqual(await change(admin, {
    kind: "assign",
    messageId: row.id,
    assigneeId: admin.id,
    expectedAssigneeId: null,
  }), { ok: true });
  assert.equal((await eventsFor(row.id)).filter((event) => event.kind === "contact.assigned").length, 1);

  const noteId = randomUUID();
  assert.deepEqual(await change(admin, { kind: "note", messageId: row.id, noteId, body: "First note" }), { ok: true });
  assert.deepEqual(await change(admin, { kind: "note", messageId: row.id, noteId, body: "Second note" }), { ok: true });
  const notes = await sql.query("select body from contact_notes where id = $1", [noteId]);
  assert.equal(notes.rows[0].body, "First note");
  assert.equal((await eventsFor(row.id)).filter((event) => event.kind === "contact.noted").length, 1);
});

test("the messages list searches the body, hides an unknown status, and does not export", async () => {
  const admin = staff(await insertUser("admin", "List Admin"));
  const editor = staff(await insertUser("editor", "List Editor"));
  const token = `body-${randomUUID()}`;
  const email = `list-${randomUUID()}@example.com`;
  await acceptStored(payload({ email, message: `Please read ${token} today`, name: "List Person" }), "203.0.113.44");
  await sql.query(
    "insert into partner_inquiries (name, email, organization, designation, support, message) values ($1, $2, 'Org', 'Lead', 'Funding', $3)",
    [token, `partner-${randomUUID()}@example.com`, token],
  );
  const percent = `percent-${randomUUID()}@example.com`;
  const other = `other-${randomUUID()}@example.com`;
  await acceptStored(payload({ email: percent, message: "100% sure" }), "203.0.113.45");
  await acceptStored(payload({ email: other, message: "100X sure" }), "203.0.113.46");

  const records = stored("lib/admin/records.ts");
  const weeks = stored("lib/admin/weeks.ts");
  const database = stored("lib/db/index.ts").getDb();
  assert.deepEqual([...records.RECORD_LISTS].sort(), [...weeks.INTAKE_LISTS].sort());

  const found = await records.loadRecords(database, records.parseRecordQuery({ list: "messages", q: token }), admin);
  assert.equal(found.total, 1);
  assert.equal(found.rows[0].cells[0], "List Person");
  assert.equal(found.headers.join(","), "Name,Email,Organization,Status,Assigned to,Received");
  assert.equal(found.rows[0].href.startsWith("/admin/records/messages/"), true);

  const hidden = await records.loadRecords(database, records.parseRecordQuery({ list: "messages", q: token }), editor);
  assert.equal(hidden.rows[0].href, null);

  const escaped = await records.loadRecords(database, records.parseRecordQuery({ list: "messages", q: "100% sure" }), admin);
  assert.equal(escaped.total, 1);
  assert.equal(escaped.rows[0].cells[1], percent);

  const unknown = await records.loadRecords(database, records.parseRecordQuery({ list: "messages", status: "nope" }), admin);
  assert.equal(unknown.total, 0);
  assert.equal(unknown.rows.length, 0);

  const before = await sql.query("select count(*)::int as n from admin_events where kind = 'records.exported'");
  assert.equal(await records.exportList(database, admin, records.parseRecordQuery({ list: "messages", q: token })), null);
  const after = await sql.query("select count(*)::int as n from admin_events where kind = 'records.exported'");
  assert.equal(after.rows[0].n, before.rows[0].n);

  const messageWeeks = await weeks.weeklyIntake(database, "messages");
  const partnerWeeks = await weeks.weeklyIntake(database, "partners");
  const messages = await sql.query("select count(*)::int as n from contact_messages");
  const partners = await sql.query("select count(*)::int as n from partner_inquiries");
  assert.equal(messageWeeks.reduce((sum, row) => sum + row.count, 0), messages.rows[0].n);
  assert.equal(partnerWeeks.reduce((sum, row) => sum + row.count, 0), partners.rows[0].n);

  const dashboard = await stored("lib/admin/dashboard.ts").loadDashboard(database, "admin");
  const fresh = await sql.query("select count(*)::int as n from contact_messages where status = 'new'");
  assert.equal(dashboard.newMessages, fresh.rows[0].n);

  const { activityLabel } = stored("lib/admin/activity.ts");
  assert.equal(activityLabel("contact.status", { from: "archived", to: "spam" }), "Moved a message from Archived to Spam");
  assert.equal(activityLabel("contact.noted", { body: "private" }), "Added a message note");
  assert.equal(activityLabel("contact.assigned", { assigneeId: admin.id }), "Assigned a message");
  assert.equal(activityLabel("contact.assigned", {}), "Unassigned a message");
});
