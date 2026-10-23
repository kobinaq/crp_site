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
  assert.equal(can("reviewer", "records.export"), false);
  assert.equal(can("reviewer", "activity.read"), false);
  assert.equal(can("editor", "copy.publish"), true);
  assert.equal(can("editor", "users.manage"), false);
  assert.equal(can("editor", "records.export"), false);
  assert.equal(can("editor", "activity.read"), false);
  assert.equal(can("admin", "users.manage"), true);
  assert.equal(can("admin", "records.export"), true);
  assert.equal(can("admin", "activity.read"), true);
  assert.equal(can("admin", "identity.view"), true);
  assert.equal(can("editor", "identity.view"), false);
  assert.equal(can("reviewer", "identity.view"), false);
  assert.equal(can("member", "dashboard.read"), false);
  for (const role of USER_ROLES) assert.ok(ROLE_CAPABILITIES[role].includes("dashboard.read"));
});

test("preview links stay on public routes and line diffs keep shared lines", () => {
  const { previewPath } = mod("lib/copy/preview.ts");
  const { lineDiff } = mod("lib/copy/diff.ts");
  assert.equal(previewPath("page", "apply", "es"), "/es/apply");
  assert.equal(previewPath("page", "nav", "en"), "/en");
  assert.equal(previewPath("page", "a11y", "en"), null);
  assert.equal(previewPath("page", "meta", "fr"), null);
  assert.equal(previewPath("ui", "nav", "en"), null);
  assert.equal(previewPath("page", "missing", "en"), null);
  assert.deepEqual(lineDiff("a\nb", "a\nc"), [
    { kind: "same", text: "a" },
    { kind: "remove", text: "b" },
    { kind: "add", text: "c" },
  ]);
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
  await applicantReview();
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
  const { englishDigest, markReviewed } = mod("lib/copy/editor.ts");
  assert.deepEqual(await publishCopy(database, french, authorId, { kind: "mark-current", digest: englishDigest("differently") }, 0), { ok: false, reason: "conflict" });
  assert.deepEqual(await publishCopy(database, french, authorId, { kind: "mark-current", digest: englishDigest("unequally") }, 0), { ok: true });
  const capped = Array.from({ length: 101 }, () => ({ catalog: "page", locale: "fr", key: "hero.line1Accent", revision: 0, digest: "nope" }));
  assert.deepEqual(await markReviewed(database, authorId, capped), { ok: false, reason: "invalid" });
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
  const dashboard = await loadDashboard(mod("lib/db/index.ts").getDb(), "admin");
  assert.equal(dashboard.pipeline.find((row) => row.status === "submitted").count, 0);
  assert.equal(dashboard.nominations.counts.find((row) => row.status === "new").count, 1);
  assert.equal(dashboard.nominations.counts.find((row) => row.status === "declined").count, 0);
  assert.equal(dashboard.nominationDesk.needsAttention, 1);
  assert.equal(dashboard.nominationDesk.counts.find((row) => row.status === "new").count, 1);
  assert.equal(dashboard.partnerWorkflow.needsAttention, 1);
  assert.equal(dashboard.nominations.recent[0].status, "New");
  assert.equal(dashboard.interest.total, 1);
  const reviewerView = await loadDashboard(mod("lib/db/index.ts").getDb(), "reviewer");
  assert.deepEqual(reviewerView.access, { applicants: true, nominations: true, partners: false, signups: false, messages: false });
  assert.equal(reviewerView.nominationDesk.needsAttention, 1);
  assert.equal(reviewerView.interest.total, 0);
  assert.equal(reviewerView.interest.recent.length, 0);
  assert.equal(reviewerView.waitlist.recent.length, 0);
  assert.equal(reviewerView.partners.total, 0);
  assert.equal(reviewerView.partnerWorkflow.needsAttention, 0);
  assert.equal(reviewerView.newMessages, 0);
  const editorView = await loadDashboard(mod("lib/db/index.ts").getDb(), "editor");
  assert.equal(Object.values(editorView.access).some(Boolean), false);
  assert.equal(editorView.nominations.recent.length, 0);
  assert.equal(editorView.applicantTotal, 0);
  assert.equal(dashboard.partners.total, 1);
  assert.equal(JSON.stringify(dashboard).includes("round1_link"), false);
  assert.equal(JSON.stringify(dashboard).includes("identity_link"), false);
}

async function applicantReview() {
  const { loadApplicant, loadRecords, exportList, parseRecordQuery } = mod("lib/admin/records.ts");
  const { weeklyIntake } = mod("lib/admin/weeks.ts");
  const { loadActivity, activityLabel } = mod("lib/admin/activity.ts");
  const { parseUserId } = mod("lib/staff/users.ts");
  const database = mod("lib/db/index.ts").getDb();
  const inserted = await sql.query(`
    insert into applicants (
      full_name, email, dob, age, track, phone, language, status, review_cycle,
      round1_link, identity_link, identity_session_id, round1_completed_at, identity_status
    ) values (
      'Nia Tester', 'nia@example.org', '1990-01-02', 36, 'in_person', '+3531000000', 'fr', 'submitted', 2,
      'https://secret.example/resume', 'https://secret.example/identity', 'session-secret', now(), 'verified'
    ) returning id
  `);
  const id = inserted.rows[0].id;
  await sql.query(`insert into identity_documents (applicant_id, kind, pathname, content_type, size) values ($1, 'passport', 'secret.example/doc', 'image/jpeg', 12)`, [id]);
  await sql.query(
    `insert into videoask_answers (
      applicant_id, question_id, answer_id, position, title, medium, transcript, pathname, content_type, byte_size, copied_at
    ) values ($1, 'secret', 'a-story', 0, 'Story', 'video', 'the spoken answer', $2, 'video/mp4', 8, now())`,
    [id, `videoask/${id}/secret.example`],
  );
  await sql.query(`insert into application_events (applicant_id, from_status, to_status, actor, reason) values ($1, 'submitted', 'round1_complete', 'videoask', 'round 1 finished')`, [id]);
  await sql.query(`insert into nominations (nominator_name, nominator_email, nominee_name, nominee_email, videoask_link) values ('Ivy', 'ivy@example.org', 'Nia', 'nia-nom@example.org', 'https://secret.example/ask')`);
  const viewer = { id: "00000000-0000-4000-8000-000000000000" };
  const detail = await loadApplicant(database, id, viewer, "");
  assert.equal(detail.dob, "1990-01-02");
  assert.equal(detail.videoAsk, "complete");
  assert.equal(detail.identity, "verified");
  assert.equal(detail.events.some((event) => event.reason === "Round 1 finished"), true);
  assert.equal(Object.hasOwn(detail, "round1Link"), false);
  assert.equal(JSON.stringify(detail).includes("secret.example"), false);
  assert.equal(JSON.stringify(detail).includes("media.videoask.com"), false);
  assert.equal(JSON.stringify(detail).includes("vercel-storage.com"), false);
  assert.equal(JSON.stringify(detail).includes("the spoken answer"), true);
  assert.deepEqual(detail.documents, []);
  assert.equal(JSON.stringify(detail).includes("session-secret"), false);
  const editorDetail = await loadApplicant(database, id, { id: viewer.id, role: "editor" }, "");
  assert.deepEqual(editorDetail.documents, []);
  assert.equal(JSON.stringify(editorDetail).includes("secret.example"), false);
  assert.equal(JSON.stringify(editorDetail).includes("the spoken answer"), true);
  const adminDetail = await loadApplicant(database, id, { id: viewer.id, role: "admin" }, "");
  assert.equal(adminDetail.documents.length, 1);
  assert.equal(adminDetail.documents[0].kind, "passport");
  assert.equal(JSON.stringify(adminDetail).includes("secret.example"), false);
  assert.equal(await loadApplicant(database, parseUserId("00000000-0000-4000-8000-000000000000")), null);
  const query = parseRecordQuery({ list: "applicants", q: "nia", status: "submitted", track: "in_person", language: "fr", cycle: "2" });
  const listed = await loadRecords(database, query, viewer);
  assert.equal(listed.total, 1);
  assert.equal(listed.rows[0].href, `/admin/records/applicants/${id}?q=nia&status=submitted&track=in_person&language=fr&cycle=2`);
  assert.equal(JSON.stringify(listed.rows).includes("secret.example"), false);
  assert.equal(JSON.stringify(listed.rows).includes("1990-01-02"), false);
  const missed = await loadRecords(database, parseRecordQuery({ list: "applicants", status: "accepted" }), viewer);
  assert.equal(missed.rows.some((row) => row.id === id), false);
  const labeled = await loadRecords(database, parseRecordQuery({ list: "applicants", status: "Accepted" }), viewer);
  assert.equal(labeled.total, 0);
  assert.equal(JSON.stringify(listed.rows).includes("session-secret"), false);
  const user = await sql.query(`select id, email from users where email = 'admin@example.org'`);
  const actor = { id: user.rows[0].id, email: user.rows[0].email, role: "editor", name: null };
  assert.equal(await exportList(database, actor, query), null);
  const before = await sql.query(`select count(*)::int as n from admin_events where kind = 'records.exported'`);
  actor.role = "admin";
  const file = await exportList(database, actor, query);
  assert.match(file.body, /'\+3531000000/);
  assert.equal(file.body.includes("secret.example"), false);
  assert.equal(file.body.includes("session-secret"), false);
  assert.equal(file.body.includes("1990-01-02"), false);
  const nominations = await exportList(database, actor, parseRecordQuery({ list: "nominations", q: "ivy" }));
  assert.equal(nominations.body.includes("secret.example"), false);
  assert.match(nominations.body, /ivy@example.org/);
  assert.match(nominations.body, /staff_status,assignee_email/);
  assert.equal(nominations.body.includes("nominee_dob"), false);
  assert.equal(nominations.body.includes("videoask"), false);
  const partnersFile = await exportList(database, actor, parseRecordQuery({ list: "partners" }));
  assert.match(partnersFile.body, /staff_status,assignee_email/);
  const adminViewer = { id: user.rows[0].id, role: "admin" };
  const editorViewer = { id: user.rows[0].id, role: "editor" };
  const reviewerViewer = { id: user.rows[0].id, role: "reviewer" };
  const nominationList = await loadRecords(database, parseRecordQuery({ list: "nominations", q: "ivy" }), adminViewer);
  assert.equal(nominationList.headers.at(-3), "Status");
  assert.equal(nominationList.headers.at(-2), "Assigned to");
  assert.match(nominationList.rows[0].href, /^\/admin\/records\/nominations\//);
  assert.equal(nominationList.rows[0].cells.includes("New"), true);
  const editorNominations = await loadRecords(database, parseRecordQuery({ list: "nominations", q: "ivy" }), editorViewer);
  assert.equal(editorNominations.rows[0].href, null);
  const reviewerNominations = await loadRecords(database, parseRecordQuery({ list: "nominations", q: "ivy" }), reviewerViewer);
  assert.match(reviewerNominations.rows[0].href, /^\/admin\/records\/nominations\//);
  const reviewerPartners = await loadRecords(database, parseRecordQuery({ list: "partners" }), reviewerViewer);
  assert.equal(reviewerPartners.total >= 1, true);
  assert.equal(reviewerPartners.rows.every((row) => row.href === null), true);
  const editorPartners = await loadRecords(database, parseRecordQuery({ list: "partners" }), editorViewer);
  assert.equal(editorPartners.rows.every((row) => row.href === null), true);
  const adminPartners = await loadRecords(database, parseRecordQuery({ list: "partners" }), adminViewer);
  assert.equal(adminPartners.headers.at(-3), "Status");
  assert.match(adminPartners.rows[0].href, /^\/admin\/records\/partners\//);
  const needs = await loadRecords(database, parseRecordQuery({ list: "nominations", q: "ivy", attention: "needs" }), adminViewer);
  assert.equal(needs.total, 1);
  assert.equal(parseRecordQuery({ attention: "later" }).attention, "");
  const { addNote, moveStatus } = mod("lib/desk/case.ts");
  await addNote(database, adminViewer, { desk: "nomination", recordId: nominationList.rows[0].id, noteId: "00000000-0000-4000-8000-0000000000aa", body: "private desk note" });
  const withNote = await exportList(database, actor, parseRecordQuery({ list: "nominations", q: "ivy" }));
  assert.equal(withNote.body.includes("private desk note"), false);
  await moveStatus(database, adminViewer, { desk: "nomination", recordId: nominationList.rows[0].id, expected: "new", to: "closed" });
  const closed = await loadRecords(database, parseRecordQuery({ list: "nominations", q: "ivy", status: "closed" }), adminViewer);
  assert.equal(closed.total, 1);
  assert.equal(closed.rows[0].cells.includes("Closed"), true);
  const dropped = await loadRecords(database, parseRecordQuery({ list: "nominations", q: "ivy", attention: "needs" }), adminViewer);
  assert.equal(dropped.total, 0);
  const applicantsStill = await loadRecords(database, parseRecordQuery({ list: "applicants", q: "nia", attention: "needs" }), viewer);
  assert.equal(applicantsStill.total, 1);
  const after = await sql.query(`select count(*)::int as n from admin_events where kind = 'records.exported'`);
  assert.equal(after.rows[0].n, before.rows[0].n + 4);
  const weeks = await weeklyIntake(database, "applicants");
  assert.equal(weeks.length, 26);
  for (const week of weeks) assert.equal(new Date(`${week.week}T00:00:00Z`).getUTCDay(), 1);
  assert.equal(weeks.some((week) => week.count > 0), true);
  const activity = await loadActivity(database, null);
  assert.equal(activity.rows.some((row) => row.label.startsWith("Downloaded")), true);
  assert.equal(activityLabel("nope", {}), "Other change");
  assert.equal(activityLabel("nomination.noted", { body: "private desk note" }), "Added a nomination note");
  assert.equal(activityLabel("nomination.status", { from: "new", to: "closed" }), "Moved a nomination from New to Closed");
  assert.equal(activityLabel("nomination.assigned", { assigneeId: "00000000-0000-4000-8000-000000000001" }), "Assigned a nomination");
  assert.equal(activityLabel("nomination.assigned", {}), "Unassigned a nomination");
  assert.equal(activityLabel("partner.noted", {}), "Added a partner note");
  assert.equal(activityLabel("partner.status", { from: "new", to: "declined" }), "Moved a partner inquiry from New to Declined");
  assert.equal(activityLabel("partner.assigned", { assigneeId: "" }), "Unassigned a partner inquiry");
  assert.equal(activityLabel("answer.media_opened", { pathname: "videoask/secret.example", transcript: "private words" }), "Opened a video answer");
  assert.equal(activityLabel("identity.document_opened", { url: "https://store.example.vercel-storage.com/doc" }), "Showed an identity document");
}

test("an admin invites an editor and cannot remove the last admin", async () => {
  const { resolveSignIn, parseEmail, parseUserId } = mod("lib/staff/users.ts");
  const { inviteStaff, changeStaff } = mod("lib/staff/manage.ts");
  const db = mod("lib/db/index.ts").getDb();
  process.env.ADMIN_EMAILS = "roster-admin@example.org,admin@example.org";
  const adminEmail = parseEmail("roster-admin@example.org");
  const created = await resolveSignIn(db, adminEmail);
  assert.ok(created);
  const actor = { id: created.id, email: adminEmail, role: "admin", name: null };
  const editorEmail = parseEmail("editor-one@example.org");
  const invited = await inviteStaff(db, actor, { email: editorEmail, role: "editor" });
  assert.equal(invited.kind, "invited");
  assert.equal(invited.mail.kind, "skipped");
  assert.match(invited.mail.devLink, /\/admin\/confirm#token=[^&?]+$/);
  assert.doesNotMatch(invited.mail.devLink, /\?/);
  const resent = await inviteStaff(db, actor, { email: editorEmail, role: "editor" });
  assert.equal(resent.kind, "resent");
  const wrongRole = await inviteStaff(db, actor, { email: editorEmail, role: "reviewer" });
  assert.equal(wrongRole.reason, "role-differs");
  assert.equal(wrongRole.role, "editor");
  const bootstrap = await sql.query(`select actor_id from admin_events where kind = 'staff.bootstrap' and detail->>'email' = 'roster-admin@example.org'`);
  assert.equal(bootstrap.rows.length, 1);
  assert.equal(bootstrap.rows[0].actor_id, null);
  const invites = await sql.query(`select kind from admin_events where kind = 'staff.invited' and detail->>'email' = 'editor-one@example.org'`);
  assert.equal(invites.rows.length, 1);
  const last = await changeStaff(db, actor, parseUserId(created.id), { kind: "disable" });
  assert.deepEqual(last, { ok: false, reason: "last-admin" });
  const secondEmail = parseEmail("admin-two@example.org");
  const second = await inviteStaff(db, actor, { email: secondEmail, role: "admin" });
  assert.equal(second.kind, "invited");
  const { listStaff } = mod("lib/staff/manage.ts");
  const other = (await listStaff(db)).find((row) => row.email === secondEmail);
  assert.ok(other);
  const stepped = await changeStaff(db, actor, parseUserId(actor.id), { kind: "disable" });
  assert.deepEqual(stepped, { ok: false, reason: "self" });
  const demoted = await changeStaff(db, actor, other.id, { kind: "role", role: "editor" });
  assert.deepEqual(demoted, { ok: true, changed: true });
  const repeat = await changeStaff(db, actor, other.id, { kind: "role", role: "editor" });
  assert.deepEqual(repeat, { ok: true, changed: false });
  const alone = await changeStaff(db, actor, parseUserId(actor.id), { kind: "disable" });
  assert.deepEqual(alone, { ok: false, reason: "last-admin" });
  await sql.query(`insert into user_sessions (hash, user_id, expires_at) values ('roster-session', $1, now() + interval '1 hour')`, [other.id]);
  const blocked = await changeStaff(db, actor, other.id, { kind: "disable" });
  assert.deepEqual(blocked, { ok: true, changed: true });
  const again = await inviteStaff(db, actor, { email: secondEmail, role: "editor" });
  assert.equal(again.reason, "disabled");
  const sessions = await sql.query(`select count(*)::int as n from user_sessions where user_id = $1`, [other.id]);
  assert.equal(sessions.rows[0].n, 0);
});

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
