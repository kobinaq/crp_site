import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import pg from "pg";
import { randomUUID } from "node:crypto";
import { loader } from "./helpers.mjs";
import { startDatabase } from "./db.mjs";

// Role-by-route matrix. Editors run the website text only; reviewers get what
// application review needs (applicants and nominations); admins get everything.
// Every page, server action, route and export is exercised as each role.

const ROLES = ["admin", "reviewer", "editor"];
let db;
let sql;
let load;
const session = { raw: "" };
const sessions = {};
const ids = {};

const NOT_FOUND = "NEXT_NOT_FOUND";

before(async () => {
  db = await startDatabase();
  process.env.DATABASE_URL = db.url;
  process.env.APP_SECRET = "test-secret-test-secret-test-secret-1234";
  process.env.NODE_ENV = "test";
  sql = new pg.Client({ connectionString: db.url });
  await sql.connect();
  load = loader({
    "next/cache": { unstable_cache: (fn) => fn, updateTag: () => {}, revalidatePath: () => {}, revalidateTag: () => {} },
    "next/headers": {
      headers: async () => new Headers({ origin: "http://localhost:3000", host: "localhost:3000" }),
      cookies: async () => ({
        get: (name) => (name === "crp_staff" && session.raw ? { value: session.raw } : undefined),
        set() {},
        delete() {},
      }),
    },
    "next/navigation": {
      redirect: (url) => { throw new Error(`redirect ${url}`); },
      notFound: () => { throw new Error(NOT_FOUND); },
      useRouter: () => ({ push() {}, refresh() {}, replace() {} }),
      usePathname: () => "/admin",
      useSearchParams: () => new URLSearchParams(),
    },
  });
  const { hashToken } = load("lib/access.ts");
  for (const role of ROLES) {
    const user = await sql.query("insert into users (email, role, name) values ($1, $2, $3) returning id", [`${role}-${randomUUID()}@example.org`, role, role]);
    const raw = `session-${role}-${randomUUID()}`;
    await sql.query("insert into user_sessions (hash, user_id, expires_at) values ($1, $2, now() + interval '1 hour')", [hashToken(raw), user.rows[0].id]);
    sessions[role] = raw;
  }
  ids.applicant = (await sql.query(
    `insert into applicants (full_name, email, dob, age, track, language, status)
     values ('Nia Tester', $1, '1990-01-02', 36, 'in_person', 'en', 'under_review') returning id`,
    [`applicant-${randomUUID()}@example.org`],
  )).rows[0].id;
  ids.nomination = (await sql.query(
    "insert into nominations (nominator_name, nominator_email, nominee_name, nominee_email) values ('Ada', 'ada@example.org', 'Grace', 'grace@example.org') returning id",
  )).rows[0].id;
  ids.partner = (await sql.query(
    "insert into partner_inquiries (name, email, organization, designation, support) values ('Pat', 'pat@example.org', 'Org', 'Lead', 'Funding') returning id",
  )).rows[0].id;
  ids.message = (await sql.query(
    "insert into contact_messages (name, email, phone, body, locale) values ('Ann', 'ann@example.org', '+1 5551234567', 'hello', 'en') returning id",
  )).rows[0].id;
});

after(async () => {
  try { await load("lib/db/index.ts").closeDb(); } catch { /* pool may already be closed */ }
  try { await sql.end(); } catch { /* ignore */ }
  try { await db.stop(); } catch { /* ignore */ }
});

async function as(role, fn) {
  session.raw = sessions[role];
  try {
    return await fn();
  } catch (error) {
    if (error?.message === NOT_FOUND) return "not found";
    if (String(error?.message).startsWith("redirect ")) return error.message;
    throw error;
  } finally {
    session.raw = "";
  }
}

const page = (file) => load(`app/admin/(console)/${file}`).default;
const props = (params = {}, searchParams = {}) => ({ params: Promise.resolve(params), searchParams: Promise.resolve(searchParams) });

function pages() {
  return [
    ["/admin", () => page("page.tsx")(props()), { admin: "ok", reviewer: "ok", editor: "redirect /admin/copy" }],
    ["/admin/records", () => page("records/page.tsx")(props()), { admin: "ok", reviewer: "ok", editor: "not found" }],
    ["/admin/records?list=applicants", () => page("records/page.tsx")(props({}, { list: "applicants" })), { admin: "ok", reviewer: "ok", editor: "not found" }],
    ["/admin/records?list=nominations", () => page("records/page.tsx")(props({}, { list: "nominations" })), { admin: "ok", reviewer: "ok", editor: "not found" }],
    ["/admin/records?list=interest", () => page("records/page.tsx")(props({}, { list: "interest" })), { admin: "ok", reviewer: "not found", editor: "not found" }],
    ["/admin/records?list=waitlist", () => page("records/page.tsx")(props({}, { list: "waitlist" })), { admin: "ok", reviewer: "not found", editor: "not found" }],
    ["/admin/records?list=partners", () => page("records/page.tsx")(props({}, { list: "partners" })), { admin: "ok", reviewer: "not found", editor: "not found" }],
    ["/admin/records?list=messages", () => page("records/page.tsx")(props({}, { list: "messages" })), { admin: "ok", reviewer: "not found", editor: "not found" }],
    ["/admin/records/applicants/[id]", () => page("records/applicants/[id]/page.tsx")(props({ id: ids.applicant })), { admin: "ok", reviewer: "ok", editor: "not found" }],
    ["/admin/records/nominations/[id]", () => page("records/nominations/[id]/page.tsx")(props({ id: ids.nomination })), { admin: "ok", reviewer: "ok", editor: "not found" }],
    ["/admin/records/partners/[id]", () => page("records/partners/[id]/page.tsx")(props({ id: ids.partner })), { admin: "ok", reviewer: "not found", editor: "not found" }],
    ["/admin/records/messages/[id]", () => page("records/messages/[id]/page.tsx")(props({ id: ids.message })), { admin: "ok", reviewer: "not found", editor: "not found" }],
    ["/admin/copy", () => page("copy/page.tsx")(props()), { admin: "ok", reviewer: "not found", editor: "ok" }],
    ["/admin/staff", () => page("staff/page.tsx")(props()), { admin: "ok", reviewer: "not found", editor: "not found" }],
    ["/admin/activity", () => page("activity/page.tsx")(props()), { admin: "ok", reviewer: "not found", editor: "not found" }],
  ];
}

test("every console page opens only for the roles that may use it", async () => {
  for (const [route, open, expected] of pages()) {
    for (const role of ROLES) {
      const outcome = await as(role, async () => {
        const result = await open();
        assert.ok(result, `${route} rendered nothing for ${role}`);
        return "ok";
      });
      assert.equal(outcome === "redirect /admin/copy" ? "redirect /admin/copy" : outcome, expected[role], `${role} on ${route}`);
    }
  }
});

test("signed-out visitors are sent to sign in from every page", async () => {
  for (const [route, open] of pages()) {
    session.raw = "";
    await assert.rejects(open(), /redirect \/admin\/sign-in/, route);
  }
});

const forbidden = (outcome) =>
  outcome === "redirect /admin/sign-in" || outcome === "redirect /admin/staff?notice=forbidden" ||
  (outcome && typeof outcome === "object" && (outcome.result === "forbidden" || outcome.notice === "forbidden"));

function actions() {
  const action = (file) => load(`app/admin/(console)/${file}`);
  const form = () => new FormData();
  return [
    ["copy updateCopy", () => action("copy/actions.ts").updateCopy(form()), ["admin", "editor"]],
    ["copy markReviewedCopy", () => action("copy/actions.ts").markReviewedCopy(form()), ["admin", "editor"]],
    ["staff inviteAction", () => action("staff/actions.ts").inviteAction(null, form()), ["admin"]],
    ["staff changeStaffAction", () => action("staff/actions.ts").changeStaffAction(form()), ["admin"]],
    ["records previewBulkAction", () => action("records/actions.ts").previewBulkAction({}), ["admin"]],
    ["records confirmBulkAction", () => action("records/actions.ts").confirmBulkAction({}), ["admin"]],
    ["applicant saveReviewAction", () => action("records/applicants/[id]/actions.ts").saveReviewAction(null, form()), ["admin", "reviewer"]],
    ["applicant assignReviewAction", () => action("records/applicants/[id]/actions.ts").assignReviewAction(null, form()), ["admin"]],
    ["applicant previewDecisionAction", () => action("records/applicants/[id]/actions.ts").previewDecisionAction({}), ["admin"]],
    ["applicant confirmDecisionAction", () => action("records/applicants/[id]/actions.ts").confirmDecisionAction(null, form()), ["admin"]],
    ["nomination addNominationNote", () => action("records/nominations/[id]/actions.ts").addNominationNote(null, form()), ["admin", "reviewer"]],
    ["nomination moveNomination", () => action("records/nominations/[id]/actions.ts").moveNomination(null, form()), ["admin"]],
    ["nomination assignNomination", () => action("records/nominations/[id]/actions.ts").assignNomination(null, form()), ["admin"]],
    ["partner addPartnerNote", () => action("records/partners/[id]/actions.ts").addPartnerNote(null, form()), ["admin"]],
    ["partner movePartner", () => action("records/partners/[id]/actions.ts").movePartner(null, form()), ["admin"]],
    ["partner assignPartner", () => action("records/partners/[id]/actions.ts").assignPartner(null, form()), ["admin"]],
    ["message updateMessage", () => action("records/messages/[id]/actions.ts").updateMessage(null, form()), ["admin"]],
  ];
}

test("every server action refuses the roles that may not use it", async () => {
  for (const [name, run, allowed] of actions()) {
    for (const role of ROLES) {
      const outcome = await as(role, run);
      assert.equal(forbidden(outcome), !allowed.includes(role), `${role} on ${name}: ${JSON.stringify(outcome)}`);
    }
  }
});

test("the export route is admin only (messages have no export)", async () => {
  const { POST } = load("app/admin/(console)/records/export/route.ts");
  for (const list of ["applicants", "nominations", "interest", "waitlist", "partners", "messages"]) {
    for (const role of ROLES) {
      const body = new FormData();
      body.set("list", list);
      const response = await as(role, () => POST(new Request("http://localhost:3000/admin/records/export", {
        method: "POST",
        headers: { origin: "http://localhost:3000", host: "localhost:3000" },
        body,
      })));
      const refused = role !== "admin" || list === "messages";
      assert.equal(response.status === 403, refused, `${role} exporting ${list}: ${response.status}`);
    }
  }
});

test("VideoAsk answers open for admins and reviewers; identity documents for admins only", async () => {
  const { streamHolding } = load("lib/media.ts");
  const database = load("lib/db/index.ts").getDb();
  const expected = {
    answer: { admin: 404, reviewer: 404, editor: 403 },
    document: { admin: 404, reviewer: 403, editor: 403 },
  };
  for (const slot of ["answer", "document"]) {
    for (const role of ROLES) {
      const result = await streamHolding(database, {
        actorId: randomUUID(),
        role,
        applicantId: ids.applicant,
        slot,
        holdingId: slot === "answer" ? "missing-question" : randomUUID(),
        rangeHeader: null,
        method: "HEAD",
        signal: AbortSignal.timeout(1000),
      });
      // 404 means the role passed the gate and the (absent) file was looked up.
      assert.equal(result.status, expected[slot][role], `${role} ${slot}`);
    }
  }
});

test("nav, home and not-found offer each role only what it can open", () => {
  const { consoleAreas } = load("lib/admin/access.ts");
  const { readableLists } = load("lib/admin/records.ts");
  assert.deepEqual(consoleAreas("admin"), ["dashboard", "records", "copy", "staff", "activity"]);
  assert.deepEqual(consoleAreas("reviewer"), ["dashboard", "records"]);
  assert.deepEqual(consoleAreas("editor"), ["copy"]);
  assert.deepEqual(readableLists("admin"), ["applicants", "nominations", "interest", "waitlist", "partners", "messages"]);
  assert.deepEqual(readableLists("reviewer"), ["applicants", "nominations"]);
  assert.deepEqual(readableLists("editor"), []);
});

test("the capability matrix", () => {
  const { can } = load("lib/staff/roles.ts");
  const matrix = {
    "dashboard.read": ["admin", "reviewer", "editor"],
    "applicants.read": ["admin", "reviewer"],
    "reviews.write": ["admin", "reviewer"],
    "reviews.assign": ["admin"],
    "decisions.confirm": ["admin"],
    "nominations.read": ["admin", "reviewer"],
    "nominations.note": ["admin", "reviewer"],
    "nominations.manage": ["admin"],
    "identity.view": ["admin"],
    "signups.read": ["admin"],
    "partners.read": ["admin"],
    "partners.manage": ["admin"],
    "messages.read": ["admin"],
    "messages.manage": ["admin"],
    "records.export": ["admin"],
    "activity.read": ["admin"],
    "users.manage": ["admin"],
    "copy.edit": ["admin", "editor"],
    "copy.publish": ["admin", "editor"],
  };
  const { ROLE_CAPABILITIES } = load("lib/staff/roles.ts");
  const every = new Set(Object.values(ROLE_CAPABILITIES).flat());
  assert.deepEqual([...every].sort(), Object.keys(matrix).sort());
  for (const [capability, roles] of Object.entries(matrix)) {
    for (const role of ROLES) assert.equal(can(role, capability), roles.includes(role), `${role} ${capability}`);
  }
});

test("the dashboard shows a reviewer only applicants and nominations", async () => {
  const React = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const viewLoad = loader({ "next/link": ({ href, children, ...rest }) => React.createElement("a", { href, ...rest }, children) });
  const { DashboardView, attentionItems } = viewLoad("components/admin/DashboardView.tsx");
  const { loadDashboard } = load("lib/admin/dashboard.ts");
  const data = await loadDashboard(load("lib/db/index.ts").getDb(), "reviewer");
  const html = renderToStaticMarkup(React.createElement(DashboardView, { data, weeks: [] }));
  for (const shown of ["Applicants", "Nominations", "Latest nominations"]) assert.match(html, new RegExp(shown));
  for (const hidden of ["Waitlist", "Interest", "Partner", "New messages", "list=messages", "list=partners", "list=waitlist", "list=interest"]) {
    assert.equal(html.includes(hidden), false, hidden);
  }
  assert.deepEqual(attentionItems(data).map((item) => item.label), ["Applicants waiting for a decision", "Nominations to follow up"]);
  const admin = await loadDashboard(load("lib/db/index.ts").getDb(), "admin");
  assert.equal(attentionItems(admin).length, 4);
});
