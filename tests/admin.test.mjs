import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import pg from "pg";
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
  process.env.ADMIN_EMAILS = "admin@example.org";
  sql = new pg.Client({ connectionString: db.url });
  await sql.connect();
  load = loader({
    "next/cache": {
      unstable_cache: (fn) => fn,
      updateTag: () => {},
    },
    "next/headers": {
      headers: async () => new Headers(),
      cookies: async () => ({ get: () => undefined, set() {}, delete() {} }),
    },
    "next/navigation": { redirect: (url) => { throw new Error(`redirect ${url}`); } },
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

test("roles keep reviewers off copy and leave an unknown role with nothing", () => {
  const { can, ROLE_CAPABILITIES, USER_ROLES } = mod("lib/staff/roles.ts");
  assert.equal(can("reviewer", "dashboard.read"), true);
  assert.equal(can("reviewer", "copy.publish"), false);
  assert.equal(can("editor", "copy.publish"), true);
  assert.equal(can("member", "dashboard.read"), false);
  for (const role of USER_ROLES) assert.ok(ROLE_CAPABILITIES[role].includes("dashboard.read"));
});

test("staff mutations refuse a request with no origin signal", () => {
  const { staffSameOrigin } = mod("lib/staff/origin.ts");
  assert.equal(staffSameOrigin(new Headers()), false);
  assert.equal(staffSameOrigin(new Headers({ origin: "https://pavilion.example", host: "pavilion.example" })), true);
  assert.equal(staffSameOrigin(new Headers({ origin: "https://evil.example", host: "pavilion.example" })), false);
  assert.equal(staffSameOrigin(new Headers({ "sec-fetch-site": "cross-site", origin: "https://pavilion.example", host: "pavilion.example" })), false);
  assert.equal(staffSameOrigin(new Headers({ "sec-fetch-site": "same-origin" })), true);
});

test("the staff cookie stays on /admin", () => {
  const { staffCookieOptions, STAFF_COOKIE } = mod("lib/staff/auth.ts");
  assert.equal(STAFF_COOKIE, "crp_staff");
  assert.deepEqual(staffCookieOptions(true), {
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    path: "/admin",
    maxAge: 12 * 60 * 60,
  });
});

test("staff sign-in, copy publish, and the dashboard share one database", async () => {
  await allowlistAndSession();
  await publishedCopy();
  await dashboardCounts();
});

async function allowlistAndSession() {
  const { parseEmail, resolveSignIn, adminAllowlist } = mod("lib/staff/users.ts");
  const { hashToken } = mod("lib/access.ts");
  const { issueSignInLink, redeemSignInLink, readStaff } = mod("lib/staff/auth.ts");
  const database = mod("lib/db/index.ts").getDb();
  assert.equal(parseEmail("  Admin@Example.org "), "admin@example.org");
  const allow = adminAllowlist("admin@example.org");
  const [first, second] = await Promise.all([
    resolveSignIn(database, "admin@example.org", allow),
    resolveSignIn(database, "admin@example.org", allow),
  ]);
  assert.equal(first.id, second.id);
  const rows = await sql.query("select role from users where email = $1", ["admin@example.org"]);
  assert.equal(rows.rowCount, 1);
  assert.equal(rows.rows[0].role, "admin");
  await sql.query("update users set role = 'reviewer' where email = $1", ["admin@example.org"]);
  const reviewer = await resolveSignIn(database, "admin@example.org", allow);
  assert.equal(reviewer.id, first.id);
  const still = await sql.query("select role from users where email = $1", ["admin@example.org"]);
  assert.equal(still.rows[0].role, "reviewer");
  await sql.query("update users set disabled_at = now() where email = $1", ["admin@example.org"]);
  assert.equal(await resolveSignIn(database, "admin@example.org", allow), null);
  assert.equal(await resolveSignIn(database, "stranger@example.org", allow), null);
  await sql.query("update users set disabled_at = null, role = 'editor' where email = $1", ["admin@example.org"]);
  const editor = await resolveSignIn(database, "admin@example.org", new Set());
  assert.ok(editor);
  const issued = await issueSignInLink(database, "admin@example.org");
  const stored = await sql.query("select hash from sign_in_tokens where hash = $1", [hashToken(issued.raw)]);
  assert.equal(stored.rows[0].hash, hashToken(issued.raw));
  assert.notEqual(stored.rows[0].hash, issued.raw);
  const [opened, again] = await Promise.all([redeemSignInLink(database, issued.raw), redeemSignInLink(database, issued.raw)]);
  const sessions = [opened, again].filter(Boolean);
  assert.equal(sessions.length, 1);
  const sessionRow = await sql.query("select hash from user_sessions where hash = $1", [hashToken(sessions[0].session)]);
  assert.equal(sessionRow.rowCount, 1);
  const staff = await readStaff(database, sessions[0].session);
  assert.equal(staff.role, "editor");
  await sql.query("update user_sessions set expires_at = now() - interval '1 minute' where hash = $1", [hashToken(sessions[0].session)]);
  assert.equal(await readStaff(database, sessions[0].session), null);
  await sql.query("update users set disabled_at = now() where id = $1", [staff.id]);
  const fresh = await issueSignInLink(database, "admin@example.org");
  assert.equal(fresh, null);
  await sql.query("update users set disabled_at = null where id = $1", [staff.id]);
}

async function publishedCopy() {
  const { parseCopyRef, mergePage, bundledValue, translationState } = mod("lib/copy/catalog.ts");
  const { saveDraft, publishCopy } = mod("lib/copy/editor.ts");
  const { queryPublishedRows, publishedOrFallback } = mod("lib/copy/read.ts");
  const database = mod("lib/db/index.ts").getDb();
  const user = await sql.query("select id from users where email = $1", ["admin@example.org"]);
  const authorId = user.rows[0].id;
  const english = parseCopyRef({ catalog: "page", locale: "en", key: "hero.line1Accent" });
  const french = parseCopyRef({ catalog: "page", locale: "fr", key: "hero.line1Accent" });
  assert.deepEqual(await saveDraft(database, english, authorId, "differently {extra}"), { ok: false, reason: "invalid", problems: [{ kind: "placeholders", expected: [], found: ["extra"] }] });
  assert.deepEqual(await saveDraft(database, english, authorId, "unequally"), { ok: true });
  assert.deepEqual(await publishCopy(database, english, authorId, { kind: "draft" }, 0), { ok: true });
  const rows = await queryPublishedRows(database);
  const merged = mergePage(mod("lib/copy/catalog.ts").indexPublished(rows), "en");
  assert.equal(merged.hero.line1Accent, "unequally");
  assert.equal(mod("lib/messages.ts").messages.en.hero.line1Accent, "differently");
  const frHead = await sql.query("select translated_from from copy_revisions where catalog = 'page' and locale = 'fr' and key = 'hero.line1Accent'");
  assert.equal(frHead.rowCount, 0);
  const state = translationState({ ref: french, enOverride: "unequally", live: null });
  assert.equal(state.kind, "stale");
  assert.equal(bundledValue(french).length > 0, true);
  assert.deepEqual(await publishCopy(database, english, authorId, { kind: "reset" }, 1), { ok: true });
  const after = await queryPublishedRows(database);
  assert.equal(after.some((row) => row.key === "hero.line1Accent"), false);
  assert.equal(await publishedOrFallback(async () => { throw new Error("down"); }), mod("lib/copy/catalog.ts").NO_OVERRIDES);
}

async function dashboardCounts() {
  const { PIPELINE_ORDER, loadDashboard } = mod("lib/admin/dashboard.ts");
  const { STATUSES } = mod("lib/lifecycle.ts");
  assert.equal(PIPELINE_ORDER.length, STATUSES.length);
  assert.deepEqual([...PIPELINE_ORDER].sort(), [...STATUSES].sort());
  await sql.query(`insert into nominations (nominator_name, nominator_email, nominee_name, nominee_email) values ('Ada', 'ada@example.org', 'Grace', 'grace@example.org')`);
  await sql.query(`insert into interest (email, age_group) values ('interest@example.org', '19_plus')`);
  await sql.query(`insert into waitlist (email) values ('wait@example.org')`);
  await sql.query(`insert into partner_inquiries (name, email, organization, designation, support) values ('Pat', 'pat@example.org', 'Org', 'Lead', 'Funding')`);
  const dashboard = await loadDashboard(mod("lib/db/index.ts").getDb());
  assert.equal(dashboard.pipeline.find((row) => row.status === "submitted").count, 0);
  assert.equal(dashboard.nominations.counts.find((row) => row.status === "new").count, 1);
  assert.equal(dashboard.nominations.counts.find((row) => row.status === "declined").count, 0);
  assert.equal(dashboard.interest.total, 1);
  assert.equal(dashboard.partners.total, 1);
  assert.equal(JSON.stringify(dashboard).includes("round1_link"), false);
  assert.equal(JSON.stringify(dashboard).includes("identity_link"), false);
}

test("email body overrides are escaped and subjects lose line breaks", () => {
  const { interestEmail, JSON_EMAILS } = { ...mod("lib/emails.ts"), ...mod("lib/copy/sources.ts") };
  const sources = { ack: { en: { interest: "Line one\n<script>", interestSubject: "Hello\nthere" } }, app: {} };
  const mail = interestEmail("en", "A<b>", sources);
  assert.match(mail.html, /Line one<br \/>&lt;script&gt;/);
  assert.doesNotMatch(mail.html, /<script>/);
  assert.equal(mail.subject, "Hellothere");
  const bundled = interestEmail("en", "A<b>", JSON_EMAILS);
  assert.match(bundled.html, /&lt;b&gt;/);
  assert.match(bundled.subject, /interest/i);
});
