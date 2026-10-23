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
    payload({ name: "A" }),
    payload({ message: "y".repeat(4001) }),
    payload({ email: "not-an-email" }),
    payload({ dial: "+999" }),
    payload({ nationalNumber: "12345" }),
  ];
  for (const fields of cases) {
    assert.deepEqual(await acceptStored(fields, "203.0.113.22"), { ok: false, reason: "invalid" });
    if (fields.email.includes("@")) assert.equal(await countEmail(fields.email.toLowerCase()), 0);
  }
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
