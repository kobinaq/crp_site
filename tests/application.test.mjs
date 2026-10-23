import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import pg from "pg";
import { createHash, createHmac, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { loader } from "./helpers.mjs";
import { startDatabase } from "./db.mjs";
import { Webhook } from "svix";

// End-to-end through the real application code against a disposable Postgres:
// server actions, webhook routes, the review-sheet endpoint, the sync feed, the
// job worker, and the ops actions. Only the network edges are replaced: Resend,
// Turnstile, the identity provider, and Next's request helpers.

let db, sql, h;

before(async () => {
  db = await startDatabase();
  process.env.DATABASE_URL = db.url;
  process.env.APP_SECRET = "test-secret-test-secret-test-secret-1234";
  process.env.SYNC_API_SECRET = "sync";
  process.env.VIDEOASK_WEBHOOK_SECRET = "videoask";
  process.env.OPERATIONS_SECRET = "ops"; // Legacy credential must not authorize operations.
  process.env.OPERATIONS_TOKENS = JSON.stringify([{ id: "tester", tokenHash: createHash("sha256").update("test-operator-token-at-least-32-characters").digest("hex") }]);
  for (const lang of ["EN", "FR", "ES"]) {
    process.env[`VIDEOASK_${lang}`] = undefined;
    process.env[`VIDEOASK_FORM_ID_${lang}`] = undefined;
  }
  process.env.VIDEOASK_FORM_IDS = undefined;
  process.env.VIDEOASK_FORM_ID = "FORM-fixture";
  process.env.VIDEOASK_FORM_URL = "https://videoask.invalid/form";
  process.env.CRON_SECRET = "cron";
  process.env.RESEND_WEBHOOK_SECRET = `whsec_${Buffer.from("resend-test-signing-secret-32bytes").toString("base64")}`;
  process.env.CALENDLY_URL_EN = "https://calendly.invalid/en";
  process.env.CALENDLY_URL_FR = "https://calendly.invalid/fr";
  process.env.CALENDLY_URL_ES = "https://calendly.invalid/es";
  process.env.CALENDLY_WEBHOOK_SIGNING_KEY = "calendly-test-secret";
  sql = new pg.Client({ connectionString: db.url });
  await sql.connect();
  h = harness();
});

after(async () => {
  try { await h?.load("lib/db/index.ts").closeDb(); } catch { /* setup may have failed before the pool existed */ }
  try { await sql?.end(); } catch { /* ignore */ }
  try { await db?.stop(); } catch { /* ignore */ }
});

let ipCounter = 0;
let emailCounter = 0;
const nextEmail = () => `applicant${++emailCounter}@example.invalid`;
const dobFor = (age) => `${new Date().getUTCFullYear() - age}-01-15`;

function harness() {
  const state = {
    ip: `10.0.0.${++ipCounter}`,
    cookies: [],
    delivered: [],
    deliver: async () => ({ ok: true, id: `re_${state.delivered.length + 1}` }),
    sessions: [],
    emailsThrow: false,
  };
  const realEmails = loader()("lib/emails.ts");
  const mocks = {
    "next/headers": {
      headers: async () => new Headers({ "x-forwarded-for": state.ip }),
      cookies: async () => ({ set: (...args) => state.cookies.push(args) }),
    },
    "next/server": {
      NextResponse: {
        json: (body, init) => ({ body, status: init?.status ?? 200 }),
        redirect: (url) => {
          const res = { url: String(url), status: 307, setCookies: [] };
          res.cookies = { set: (...args) => res.setCookies.push(args) };
          return res;
        },
      },
    },
    "@/lib/turnstile": { verifyTurnstile: async () => true },
    "@/lib/email": {
      deliverEmail: async (input, key) => {
        const result = await state.deliver(input, key);
        if (result.ok) state.delivered.push({ ...input, key });
        return result;
      },
    },
    "@/lib/emails": new Proxy(realEmails, {
      get: (target, name) => (name === "applicationEmail" && state.emailsThrow
        ? () => { throw new Error("template exploded"); }
        : target[name]),
    }),
    "@/lib/identity": {
      getIdentityProvider: () => ({
        name: "test",
        verify: () => true,
        parse: (body) => ({ reference: body.reference ?? null, sessionId: body.sessionId ?? null, decision: body.decision ?? "pending", occurredAt: body.occurredAt ? new Date(body.occurredAt) : null, eventId: body.eventId ?? null }),
        createSession: async (applicantId) => {
          const id = `session-${state.sessions.length + 1}`;
          state.sessions.push({ applicantId, id });
          return { sessionId: id, url: `https://identity.invalid/${id}` };
        },
      }),
    },
  };
  const load = loader(mocks);
  const req = (url, init = {}) => ({
    headers: new Headers(init.headers ?? {}),
    nextUrl: new URL(url, "https://example.invalid"),
    cookies: { get: (name) => (init.cookies?.[name] ? { value: init.cookies[name] } : undefined) },
    text: async () => init.body ?? "",
    json: async () => JSON.parse(init.body ?? "null"),
    formData: async () => new URLSearchParams(init.body ?? ""),
  });
  const routes = {
    identity: (body, extra = {}) => load("app/api/webhooks/identity/route.ts").POST(req("/api/webhooks/identity", { body: JSON.stringify(body), ...extra })),
    videoask: (applicantId, body = {}) => {
      const reference = load("lib/videoask.ts").videoaskReference(applicantId);
      return load("app/api/webhooks/videoask/route.ts").POST(req("/api/webhooks/videoask", {
        headers: { "x-webhook-secret": "videoask" }, body: JSON.stringify({
          event_id: randomUUID(), event_type: "form_response", contact: { status: "completed", variables: { application_ref: reference } },
          form: { form_id: process.env.VIDEOASK_FORM_ID }, ...body,
        }),
      }));
    },
    // Signed exactly as Resend (Svix) signs: svix-id, svix-timestamp, svix-signature.
    resend: (payload, { id = `msg_${randomUUID()}`, secret = process.env.RESEND_WEBHOOK_SECRET, raw } = {}) => {
      const body = raw ?? JSON.stringify(payload);
      const now = new Date();
      const signature = new Webhook(secret).sign(id, now, body);
      return load("app/api/webhooks/resend/route.ts").POST(req("/api/webhooks/resend", {
        headers: { "svix-id": id, "svix-timestamp": String(Math.floor(now.getTime() / 1000)), "svix-signature": signature },
        body,
      }));
    },
    decisions: (rows) => load("app/api/decisions/route.ts").POST(req("/api/decisions", { headers: { "x-sync-secret": "sync" }, body: JSON.stringify(rows) })),
    sync: (table, query) => load("app/api/sync/[table]/route.ts").GET(req(`/api/sync/${table}?${query}`, { headers: { "x-sync-secret": "sync" } }), { params: Promise.resolve({ table }) }),
    verify: (cookies, query = "") => load("app/api/apply/verify/route.ts").GET(req(`/api/apply/verify${query}`, { cookies })),
    openLink: (token, cookies = {}) => load("app/api/apply/resume/route.ts").GET(req(`/api/apply/resume?token=${encodeURIComponent(token)}&lang=en`, { cookies })),
    resume: (token) => load("app/api/apply/resume/route.ts").POST(req("/api/apply/resume", { body: new URLSearchParams({ token }).toString() })),
    switchOnline: (token) => load("app/api/apply/switch-online/route.ts").POST(req("/api/apply/switch-online", { body: new URLSearchParams({ token }).toString() })),
    calendly: (payload) => {
      const raw = JSON.stringify(payload);
      const timestamp = Math.floor(Date.now() / 1000);
      const signature = createHmac("sha256", process.env.CALENDLY_WEBHOOK_SIGNING_KEY).update(`${timestamp}.${raw}`).digest("hex");
      return load("app/api/webhooks/calendly/route.ts").POST(req("/api/webhooks/calendly", {
        headers: { "calendly-webhook-signature": `t=${timestamp},v1=${signature}` },
        body: raw,
      }));
    },
    cron: () => load("app/api/cron/jobs/route.ts").GET(req("/api/cron/jobs", { headers: { authorization: "Bearer cron" } })),
    excel: () => load("app/api/cron/excel/route.ts").GET(req("/api/cron/excel", { headers: { authorization: "Bearer cron" } })),
    ops: (body) => load("app/api/ops/route.ts").POST(req("/api/ops", { headers: { authorization: "Bearer test-operator-token-at-least-32-characters", "x-operator": "impersonated" }, body: JSON.stringify(body) })),
    opsOverview: () => load("app/api/ops/route.ts").GET(req("/api/ops", { headers: { authorization: "Bearer test-operator-token-at-least-32-characters" } })),
  };
  const actions = load("lib/actions.ts");
  const apply = async (overrides = {}) => {
    const { ip, unverified = false, ...fields } = overrides;
    state.ip = ip ?? `10.2.${Math.floor(ipCounter / 250) % 250}.${(ipCounter++ % 250) + 1}`;
    const result = await actions.startApplication({ fullName: "Ada Lovelace", email: nextEmail(), dob: dobFor(22), language: "en", track: "in_person", skills: ["Agriculture & Food"], canTravel: true, hasValidPassport: true, consent: true, ...fields });
    // Lifecycle fixtures represent verified owners. Security tests opt out and
    // exercise the real email-token exchange before accessing private routes.
    if (result.ok && !unverified) await sql.query("update applicants set email_verified_at = now(), session_version = 1 where id = $1", [result.id]);
    return result;
  };
  return { state, load, req, actions, apply, ...routes };
}

const row = async (table, id) => (await sql.query(`select * from ${table} where id = $1`, [id])).rows[0];
const count = async (table, where = "true", params = []) => Number((await sql.query(`select count(*)::int as n from ${table} where ${where}`, params)).rows[0].n);
const jobsFor = (applicantId) => sql.query("select * from jobs where applicant_id = $1 order by created_at", [applicantId]).then((r) => r.rows);
const setStatus = (id, status) => sql.query("update applicants set status = $2 where id = $1", [id, status]);

test("an application commits the applicant, consent, history, and confirmation email together", async () => {
  const result = await h.apply({ unverified: true });
  assert.equal(result.ok, true);
  const applicant = await row("applicants", result.id);
  assert.equal(applicant.status, "submitted");
  assert.equal(applicant.version, 0);
  assert.equal(await count("consent_log", "applicant_id = $1", [result.id]), 1);
  assert.equal(await count("application_events", "applicant_id = $1 and to_status = 'submitted'", [result.id]), 1);
  const jobs = await jobsFor(result.id);
  assert.deepEqual(jobs.map((j) => [j.kind, j.status, j.payload.template]), [["email", "pending", "application"]]);
  assert.equal(await count("sync_changes", "record_id = $1 and operation = 'insert'", [result.id]), 1);
  assert.equal(h.state.cookies.length, 0);
  assert.equal(result.round1Url, null);
  assert.equal(applicant.email_verified_at, null);
  assert.equal(jobs[0].payload.html, undefined);

});

test("a failure after the applicant insert rolls everything back", async () => {
  const email = nextEmail();
  h.state.emailsThrow = true;
  await assert.rejects(h.apply({ email }));
  h.state.emailsThrow = false;
  assert.equal(await count("applicants", "email = $1", [email]), 0);
  assert.equal(await count("jobs", "payload->>'to' = $1", [email]), 0);
});

test("input is normalized: mixed-case email dedupes, impossible dates are refused", async () => {
  const email = nextEmail();
  const first = await h.apply({ email: ` ${email.toUpperCase()} ` });
  assert.equal(first.ok, true);
  assert.equal((await row("applicants", first.id)).email, email);
  const second = await h.apply({ email });
  assert.deepEqual(second, { ok: false, reason: "existing" });
  assert.deepEqual(await h.apply({ dob: `${new Date().getUTCFullYear() - 22}-02-30` }), { ok: false, reason: "invalid" });
});

test("skills and travel attestations are required for an in-person application", async () => {
  assert.deepEqual(await h.apply({ skills: [] }), { ok: false, reason: "invalid" });
  assert.deepEqual(await h.apply({ skills: ["Not a skill"] }), { ok: false, reason: "invalid" });
  assert.deepEqual(await h.apply({ canTravel: false }), { ok: false, reason: "invalid" });
  const online = await h.apply({ track: "online", canTravel: false, hasValidPassport: false });
  assert.equal(online.ok, true);
  const storedOnline = await row("applicants", online.id);
  assert.deepEqual(storedOnline.skills, ["Agriculture & Food"]);
  assert.equal(storedOnline.can_travel, null);
  assert.equal(storedOnline.has_valid_passport, null);
  const traveller = await h.apply({ skills: ["AI & Data", "Energy"] });
  assert.equal(traveller.ok, true);
  const stored = await row("applicants", traveller.id);
  assert.deepEqual(stored.skills, ["AI & Data", "Energy"]);
  assert.equal(stored.can_travel, true);
  assert.equal(stored.has_valid_passport, true);
});

test("an existing email grants no session and no email; the email link confirms on GET and goes straight to VideoAsk", async () => {
  const first = await h.apply();
  const cookiesBefore = h.state.cookies.length;
  const jobsBefore = (await jobsFor(first.id)).length;
  const again = await h.apply({ email: (await row("applicants", first.id)).email, fullName: "Someone else" });
  assert.deepEqual(again, { ok: false, reason: "existing" });
  assert.equal(h.state.cookies.length, cookiesBefore);
  assert.equal((await jobsFor(first.id)).length, jobsBefore);

  // Asking for a link queues one email carrying a token stored only as a hash.
  const asked = await h.actions.requestApplicationLink({ email: (await row("applicants", first.id)).email });
  assert.deepEqual(asked, { ok: true });
  const unknown = await h.actions.requestApplicationLink({ email: "nobody@example.invalid" });
  assert.deepEqual(unknown, { ok: true });
  assert.equal(await count("access_tokens", "applicant_id = $1", [first.id]), 0);
  await h.cron();
  const [resumeJob] = (await jobsFor(first.id)).filter((j) => j.payload.template === "resume");
  const token = new URL(resumeJob.payload.html.match(/href="([^"]+\/api\/apply\/resume[^"]+)"/)[1]).searchParams.get("token");
  assert.ok(await count("access_tokens", "applicant_id = $1 and used_at is null", [first.id]) >= 1);
  assert.equal(await count("access_tokens", "hash = $1", [token]), 0);

  // One GET: no interstitial page, the address is confirmed, a session is
  // issued, and the redirect goes straight to VideoAsk with the signed ref.
  const videoask = h.load("lib/videoask.ts").videoaskLink(first.id);
  assert.match(videoask, /^https:\/\/videoask\.invalid\/form#application_ref=/);
  const landed = await h.openLink(token);
  assert.equal(landed.url, videoask);
  assert.equal(landed.setCookies[0][0], "crp_session");
  assert.ok((await row("applicants", first.id)).email_verified_at);
  assert.equal(await count("access_tokens", "applicant_id = $1 and used_at is not null", [first.id]), 1);

  // A scanner prefetch followed by the real click: the reopen still lands in
  // VideoAsk and rotates the session, so the earlier opener is signed out.
  const reopened = await h.openLink(token);
  assert.equal(reopened.url, videoask);
  assert.notEqual(reopened.setCookies[0][1], landed.setCookies[0][1]);
  assert.equal((await h.verify({ crp_session: landed.setCookies[0][1] })).url, "https://example.invalid/apply");

  // Past its expiry the link no longer signs anyone in...
  await sql.query("update access_tokens set expires_at = now() - interval '1 minute' where applicant_id = $1", [first.id]);
  const stale = await h.openLink(token);
  assert.match(stale.url, /\/apply\?resume=expired$/);
  assert.equal(stale.setCookies?.length ?? 0, 0);
  // ...but the applicant's own signed-in browser is sent on to their step, not a dead end.
  const own = await h.openLink(token, { crp_session: reopened.setCookies[0][1] });
  assert.equal(own.url, videoask);
  // A different applicant's session gains nothing from someone else's link.
  const other = await h.apply();
  const { signSession } = h.load("lib/session.ts");
  assert.match((await h.openLink(token, { crp_session: signSession(other.id, 1) })).url, /resume=expired/);
  assert.match((await h.openLink("A".repeat(43))).url, /resume=expired/);
});

test("resume sets crp-locale only with functional consent and always redirects the same way", async () => {
  const a = await h.apply({ language: "fr" });
  const database = h.load("lib/db/index.ts").getDb();
  const { serializeConsent, CONSENT_COOKIE } = h.load("lib/consent.ts");
  const issue = async () => (await database.transaction((tx) => h.load("lib/access.ts").issueAccessToken(tx, a.id, "resume", 600))).raw;
  h.state.ip = "198.51.100.88";
  const cases = [
    ["no consent", {}, false],
    ["functional accepted", { [CONSENT_COOKIE]: serializeConsent({ functional: true }) }, true],
    ["functional declined", { [CONSENT_COOKIE]: serializeConsent({ functional: false }) }, false],
    ["malformed consent", { [CONSENT_COOKIE]: "v1.functional-yes.0" }, false],
  ];
  const targets = new Set();
  for (const [label, cookies, expectLocale] of cases) {
    const res = await h.openLink(await issue(), cookies);
    const target = new URL(res.url);
    assert.equal(`${target.origin}${target.pathname}`, "https://videoask.invalid/form", label);
    targets.add(`${target.origin}${target.pathname}`);
    const names = res.setCookies.map(([name]) => name);
    assert.ok(names.includes("crp_session"), `${label}: session cookie`);
    assert.equal(names.includes("crp-locale"), expectLocale, `${label}: crp-locale`);
    if (expectLocale) assert.equal(res.setCookies.find(([name]) => name === "crp-locale")[1], "fr");
  }
  assert.equal(targets.size, 1);
});

test("email confirmation POSTs accept same-origin and null-origin-with-valid-token only", async () => {
  const a = await h.apply();
  const database = h.load("lib/db/index.ts").getDb();
  const issue = async () => (await database.transaction((tx) => h.load("lib/access.ts").issueAccessToken(tx, a.id, "resume", 600))).raw;
  const resume = h.load("app/api/apply/resume/route.ts");
  const post = (token, headers) => resume.POST(h.req("/api/apply/resume", { headers, body: new URLSearchParams({ token }).toString() }));
  const landed = (res) => res.url === h.load("lib/videoask.ts").videoaskLink(a.id);
  h.state.ip = "198.51.100.77";

  const first = await post(await issue(), { origin: "https://example.invalid" });
  assert.ok(landed(first), "matching origin");
  assert.ok(landed(await post(await issue(), { origin: "null" })), "null origin with a valid token");
  assert.ok(landed(await post(await issue(), { origin: "null", "sec-fetch-site": "same-origin" })), "null origin, same-origin fetch metadata");
  const bogus = await post("A".repeat(43), { origin: "null" });
  assert.equal(bogus.status, 403);
  assert.deepEqual(bogus.body, { error: "invalid origin" });
  const crossToken = await issue();
  assert.equal((await post(crossToken, { origin: "https://evil.invalid" })).status, 403);
  assert.equal((await post(crossToken, { origin: "null", "sec-fetch-site": "cross-site" })).status, 403);
  assert.equal((await post(crossToken, { origin: "https://example.invalid", "sec-fetch-site": "cross-site" })).status, 403);
  assert.ok(landed(await post(crossToken, {})), "a rejected cross-site attempt does not burn the token");

  // Legacy capture links have no dead end: an unknown link just goes home.
  const capture = h.load("app/api/capture/confirm/route.ts");
  assert.equal((await capture.GET(h.req("/api/capture/confirm?token=" + "A".repeat(43)))).url, "https://example.invalid/");
});

test("the verify hand-off trusts the signed session, never the echoed applicant id", async () => {
  const a = await h.apply();
  const { signSession } = h.load("lib/session.ts");
  const { videoaskReference } = h.load("lib/videoask.ts");
  const noSession = await h.verify({}, `?applicant_id=${a.id}`);
  assert.equal(noSession.url, "https://example.invalid/apply");
  const forged = await h.verify({ crp_session: `${a.id}.9999999999.forged` });
  assert.equal(forged.url, "https://example.invalid/apply");

  const timings = { ...h.load("lib/verify-wait.ts").verifyWait };
  const wait = h.load("lib/verify-wait.ts").verifyWait;
  Object.assign(wait, { budgetMs: 60, intervalMs: 20 });
  try {
    // Neither the session nor the signed thank-you ref advances the applicant.
    const premature = await h.verify({ crp_session: signSession(a.id, 1) });
    assert.equal(premature.url, "https://example.invalid/apply/complete");
    assert.equal((await row("applicants", a.id)).status, "submitted");
    const ref = encodeURIComponent(videoaskReference(a.id));
    const fromThankYou = await h.verify({}, `?ref=${ref}`);
    assert.equal((await row("applicants", a.id)).status, "submitted");
    assert.equal((await row("applicants", a.id)).round1_completed_at, null);
    assert.match(await fromThankYou.text(), /url=https:\/\/example\.invalid\/api\/apply\/verify\?ref=[^"&]+&amp;attempt=1/);
    // A ref for someone else while signed in is refused outright.
    const b = await h.apply();
    assert.equal((await h.verify({ crp_session: signSession(a.id, 1) }, `?ref=${encodeURIComponent(videoaskReference(b.id))}`)).url, "https://example.invalid/apply");

    // Timeout path: after the last re-check the applicant lands on /apply/complete.
    const last = await h.verify({}, `?ref=${ref}&attempt=${wait.maxAttempts}`);
    assert.equal(last.url, "https://example.invalid/apply/complete");
    assert.equal((await row("applicants", a.id)).status, "submitted");

    // Only the authenticated webhook completes Round 1; then verify hands off to Didit.
    await h.videoask(a.id);
    assert.equal((await row("applicants", a.id)).status, "round1_complete");
    const first = await h.verify({}, `?ref=${ref}`);
    assert.match(first.url, /^https:\/\/identity\.invalid\/session-/);
    const second = await h.verify({ crp_session: signSession(a.id, 1) });
    assert.equal(second.url, first.url);
    const applicant = await row("applicants", a.id);
    assert.ok(applicant.round1_completed_at);
    assert.equal(applicant.identity_link, first.url);
    assert.equal(applicant.identity_status, "pending");
  } finally {
    Object.assign(wait, timings);
  }
});

test("verify waits for an in-flight webhook, then sends in-person applicants to Didit", async () => {
  const a = await h.apply({ track: "in_person" });
  const { videoaskReference } = h.load("lib/videoask.ts");
  const wait = h.load("lib/verify-wait.ts").verifyWait;
  const timings = { ...wait };
  let polls = 0;
  Object.assign(wait, {
    budgetMs: 5000, intervalMs: 10,
    // The webhook lands while verify is polling.
    sleep: async () => { if (++polls === 2) await h.videoask(a.id); },
  });
  try {
    const res = await h.verify({}, `?ref=${encodeURIComponent(videoaskReference(a.id))}`);
    assert.match(res.url, /^https:\/\/identity\.invalid\/session-/);
    assert.ok(polls >= 2 && polls < 5, `polled ${polls} times`);
    assert.equal((await row("applicants", a.id)).status, "round1_complete");
  } finally {
    Object.assign(wait, timings);
  }
});

test("verify sends online applicants to /apply/complete without advancing them", async () => {
  const a = await h.apply({ track: "online" });
  const { videoaskReference } = h.load("lib/videoask.ts");
  const res = await h.verify({}, `?ref=${encodeURIComponent(videoaskReference(a.id))}`);
  assert.equal(res.url, "https://example.invalid/apply/complete");
  assert.equal((await row("applicants", a.id)).status, "submitted");
});

test("the worker delivers queued email with an idempotency key, backs off on failure, and parks bad requests", async () => {
  const a = await h.apply();
  const [job] = await jobsFor(a.id);
  await sql.query("update jobs set available_at = now() + interval '1 hour' where id <> $1 and status = 'pending'", [job.id]);
  let calls = 0;
  h.state.deliver = async () => { calls++; return { ok: false, error: "resend 503: down", retryable: true }; };
  const first = await h.cron();
  assert.equal(first.body.ok, true);
  let after = await row("jobs", job.id);
  assert.equal(after.status, "pending");
  assert.equal(after.attempts, 1);
  assert.ok(after.available_at > new Date(), "retry is scheduled in the future");
  assert.match(after.last_error, /503/);

  // Not due yet, so a second tick leaves it alone.
  await h.cron();
  assert.equal((await row("jobs", job.id)).attempts, 1);

  await sql.query("update jobs set available_at = now() - interval '1 second' where id = $1", [job.id]);
  h.state.deliver = async () => ({ ok: false, error: "resend 422: bad address", retryable: false });
  await h.cron();
  after = await row("jobs", job.id);
  assert.equal(after.status, "failed");

  // Ops can requeue; a successful delivery records the provider id.
  const retried = await h.ops({ action: "retry_job", jobId: job.id });
  assert.equal(retried.status, 200);
  h.state.deliver = async (input, key) => ({ ok: true, id: `re_${key}` });
  await h.cron();
  after = await row("jobs", job.id);
  assert.equal(after.status, "done");
  assert.equal(after.provider_id, `re_${job.dedupe_key}`);
  assert.equal(after.delivery_status, "accepted");
  assert.equal(calls, 1);
});

test("signed Resend delivery events are accepted and update the matching email job", async () => {
  const a = await h.apply();
  const [job] = await jobsFor(a.id);
  await sql.query("update jobs set available_at = now() + interval '1 hour' where id <> $1 and status = 'pending'", [job.id]);
  h.state.deliver = async (input, key) => ({ ok: true, id: `re_${key}` });
  await h.cron();
  const emailId = (await row("jobs", job.id)).provider_id;
  assert.ok(emailId);

  // Resend's real event shape.
  const event = (type, createdAt) => ({
    type,
    created_at: createdAt,
    data: {
      email_id: emailId,
      created_at: "2026-10-15 07:00:00.000000+00",
      from: "Climate Refugee Pavilion <hello@example.invalid>",
      to: ["applicant@example.invalid"],
      subject: "Confirm your email",
    },
  });
  const deliveredId = `msg_${randomUUID()}`;
  const delivered = await h.resend(event("email.delivered", "2026-10-15T07:44:01.000Z"), { id: deliveredId });
  assert.equal(delivered.status, 200);
  assert.equal(delivered.body.ok, true);
  assert.equal(delivered.body.outcome, "delivery delivered");
  let after = await row("jobs", job.id);
  assert.equal(after.delivery_status, "delivered");

  // An older event arriving late does not overwrite the newer status.
  const late = await h.resend(event("email.sent", "2026-10-15T07:44:00.000Z"));
  assert.equal(late.body.outcome, "no matching email");
  assert.equal((await row("jobs", job.id)).delivery_status, "delivered");

  // A redelivery (same svix-id) is answered without reprocessing.
  const replay = await h.resend(event("email.delivered", "2026-10-15T07:44:01.000Z"), { id: deliveredId });
  assert.equal(replay.body.duplicate, true);
  assert.equal(await count("webhook_events", "provider = 'resend' and event_key = $1", [deliveredId]), 1);

  const bounced = await h.resend(event("email.bounced", "2026-10-15T07:45:00.000Z"));
  assert.equal(bounced.body.outcome, "delivery bounced");
  after = await row("jobs", job.id);
  assert.equal(after.delivery_status, "bounced");

  // Wrong signing secret is refused; a signed non-object body is a 400.
  const forged = await h.resend(event("email.delivered", "2026-10-15T07:46:00.000Z"), { secret: `whsec_${Buffer.from("some-other-secret-value-32-bytes!").toString("base64")}` });
  assert.equal(forged.status, 401);
  assert.equal((await h.resend(null, { raw: "[1,2]" })).status, 400);
  assert.equal((await h.resend(null, { raw: "not json" })).status, 400);
});

test("a VideoAsk webhook without a query stage uses its signed form reference", async () => {
  const a = await h.apply();
  const res = await h.videoask(a.id, { event_id: "evt-no-stage" });
  assert.equal(res.body.advanced, true);
  assert.equal(res.body.status, "round1_complete");
});

test("webhook deliveries are recorded once and replays are answered without reprocessing", async () => {
  const a = await h.apply();
  const first = await h.videoask(a.id, { event_id: "evt-1" });
  assert.equal(first.body.advanced, true);
  assert.equal(first.body.status, "round1_complete");
  const replay = await h.videoask(a.id, { event_id: "evt-1" });
  assert.equal(replay.body.duplicate, true);
  assert.equal(await count("webhook_events", "provider = 'videoask' and event_key = $1", [`${process.env.VIDEOASK_FORM_ID}:evt-1`]), 1);
  assert.equal(await count("application_events", "applicant_id = $1 and to_status = 'round1_complete'", [a.id]), 1);
  // Round 1 done: identity provisioning is queued for the worker.
  const queued = (await jobsFor(a.id)).find((j) => j.kind === "identity_session");
  assert.ok(queued);
  await h.cron();
  const applicant = await row("applicants", a.id);
  assert.match(applicant.identity_link, /^https:\/\/identity\.invalid\//);
  assert.equal((await row("jobs", queued.id)).status, "done");
});

for (const decision of ["approved", "declined"]) {
  for (const order of ["identity-first", "round1-first", "concurrent"]) {
    test(`${decision} converges when deliveries are ${order}`, async () => {
      const a = await h.apply();
      const identity = () => h.identity({ reference: a.id, decision, eventId: `${a.id}-${order}-id` });
      const round1 = () => h.videoask(a.id, { event_id: `${a.id}-${order}-r1` });
      if (order === "identity-first") { await identity(); await round1(); }
      else if (order === "round1-first") { await round1(); await identity(); }
      else await Promise.all([identity(), round1()]);
      const expected = decision === "approved" ? "under_review" : "id_failed";
      assert.equal((await row("applicants", a.id)).status, expected);
      await round1();
      await h.identity({ reference: a.id, decision, eventId: `${a.id}-${order}-id2` });
      const final = await row("applicants", a.id);
      assert.equal(final.status, expected);
      assert.equal(await count("application_events", "applicant_id = $1 and to_status = $2", [a.id, expected]), 1);
    });
  }
}

// Delayed "Verify your identity" fallback email (identity_fallback).
async function provisionViaWorker(applicantId) {
  const { handlers } = h.load("lib/worker.ts");
  const database = h.load("lib/db/index.ts").getDb();
  return handlers.identity_session({ payload: { applicantId } }, database);
}
const fallbackJobs = async (applicantId) => (await jobsFor(applicantId)).filter((j) => j.payload.template === "identity_fallback");
async function runFallback(applicantId) {
  const { handlers } = h.load("lib/worker.ts");
  const database = h.load("lib/db/index.ts").getDb();
  const [job] = await fallbackJobs(applicantId);
  const before = h.state.delivered.length;
  const outcome = await handlers.email({ id: job.id, dedupeKey: job.dedupe_key, payload: job.payload }, database);
  return { job, outcome, sent: h.state.delivered.slice(before).filter((m) => m.key === job.dedupe_key) };
}

test("identity fallback: reaching Didit from the redirect means no email", async () => {
  const a = await h.apply({ track: "in_person" });
  await h.videoask(a.id);
  await provisionViaWorker(a.id);
  const [job] = await fallbackJobs(a.id);
  assert.equal(job.dedupe_key, `identity-link-fallback:${a.id}:0`);
  const delay = new Date(job.available_at).getTime() - new Date(job.created_at).getTime();
  assert.ok(delay >= 10 * 60_000 && delay <= 15 * 60_000, `delay ${delay}`);
  const { videoaskReference } = h.load("lib/videoask.ts");
  const res = await h.verify({}, `?ref=${encodeURIComponent(videoaskReference(a.id))}`);
  assert.match(res.url, /^https:\/\/identity\.invalid\//);
  assert.ok((await row("applicants", a.id)).identity_link_opened_at);
  const { outcome, sent } = await runFallback(a.id);
  assert.equal(outcome.deliveryStatus, "skipped: link opened");
  assert.equal(sent.length, 0);
});

test("identity fallback: a closed tab gets exactly one email, even with duplicate webhooks", async () => {
  const a = await h.apply({ track: "in_person", language: "fr" });
  await h.videoask(a.id);
  await h.videoask(a.id);
  await provisionViaWorker(a.id);
  await provisionViaWorker(a.id);
  await h.videoask(a.id);
  assert.equal((await fallbackJobs(a.id)).length, 1);
  const applicant = await row("applicants", a.id);
  assert.equal(applicant.identity_link_opened_at, null);
  const { outcome, sent } = await runFallback(a.id);
  assert.equal(outcome.status, "done");
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, applicant.email);
  assert.equal(sent[0].subject, h.load("lib/emails.ts").identityEmail(applicant.full_name, applicant.identity_link, "fr").subject);
  assert.ok(sent[0].html.includes(applicant.identity_link.replace(/&/g, "&amp;")));
  assert.equal((await jobsFor(a.id)).filter((j) => j.payload.template === "identity").length, 0);
});

test("identity fallback is skipped once the applicant has moved on, and id_failed retries still email at once", async () => {
  const a = await h.apply({ track: "in_person" });
  await h.videoask(a.id);
  await provisionViaWorker(a.id);
  const { identity_session_id: session } = await row("applicants", a.id);
  await h.identity({ reference: a.id, sessionId: session, decision: "declined", eventId: `d-${a.id}` });
  assert.equal((await row("applicants", a.id)).status, "id_failed");
  await provisionViaWorker(a.id);
  const jobs = await jobsFor(a.id);
  assert.equal(jobs.filter((j) => j.payload.template === "identity_retry").length, 1);
  assert.equal((await fallbackJobs(a.id)).length, 1, "no second fallback for the retry session");
  const { outcome, sent } = await runFallback(a.id);
  assert.equal(outcome.deliveryStatus, "skipped: status id_failed");
  assert.equal(sent.length, 0);
});

test("identity events for another session or from the past are ignored", async () => {
  const a = await h.apply();
  await h.videoask(a.id);
  const { signSession } = h.load("lib/session.ts");
  await h.verify({ crp_session: signSession(a.id, 1) });
  const { identity_session_id: session } = await row("applicants", a.id);

  const other = await h.identity({ reference: a.id, sessionId: "someone-elses-session", decision: "approved", eventId: "x1" });
  assert.equal(other.body.outcome, "session mismatch");
  assert.equal((await row("applicants", a.id)).status, "round1_complete");

  const newer = await h.identity({ reference: a.id, sessionId: session, decision: "declined", occurredAt: "2026-09-20T12:00:00Z", eventId: "x2" });
  assert.equal(newer.body.advanced, true);
  const failed = await row("applicants", a.id);
  assert.equal(failed.status, "id_failed");
  assert.equal(failed.identity_link, null);
  assert.equal(failed.identity_session_id, null);
  // Dead-session redeliveries must not stick while a retry session is pending.
  const orphaned = await h.identity({ reference: a.id, sessionId: session, decision: "approved", occurredAt: "2026-09-20T13:00:00Z", eventId: "x3" });
  assert.equal(orphaned.body.outcome, "no active session");
  assert.equal((await row("applicants", a.id)).status, "id_failed");

  // Other tests share this queue, so one tick can be spent on their jobs.
  let retried = await row("applicants", a.id);
  for (let attempt = 0; retried.identity_link == null && attempt < 8; attempt++) {
    await h.cron();
    retried = await row("applicants", a.id);
  }
  assert.match(retried.identity_link, /^https:\/\/identity\.invalid\//);
  assert.ok(retried.identity_session_id);
  assert.notEqual(retried.identity_session_id, session);
  assert.equal((await jobsFor(a.id)).filter((j) => j.payload.template === "identity_retry").length, 1);

  const older = await h.identity({ reference: a.id, sessionId: retried.identity_session_id, decision: "declined", occurredAt: "2026-09-20T11:00:00Z", eventId: "x4" });
  assert.equal(older.body.outcome, "stale");
  // A genuinely newer approval on the active retry session lifts into review.
  await h.identity({ reference: a.id, sessionId: retried.identity_session_id, decision: "approved", occurredAt: "2026-09-20T14:00:00Z", eventId: "x5" });
  assert.equal((await row("applicants", a.id)).status, "under_review");
});

test("late identity and round1 events preserve onboarding", async () => {
  const a = await h.apply();
  await setStatus(a.id, "onboarding");
  await h.identity({ reference: a.id, decision: "approved", eventId: `${a.id}-late` });
  await h.videoask(a.id);
  assert.equal((await row("applicants", a.id)).status, "onboarding");
});

test("a second VideoAsk completion does not advance past review", async () => {
  const a = await h.apply();
  await setStatus(a.id, "interview_yes");
  await h.videoask(a.id);
  assert.equal((await row("applicants", a.id)).status, "interview_yes");
  const b = await h.apply();
  await setStatus(b.id, "rejected");
  await h.videoask(b.id);
  assert.equal((await row("applicants", b.id)).status, "rejected");
});

for (const status of ["docs_submitted", "onboarding", "online", "ineligible"]) {
  test(`decision polls preserve ${status} and queue no email`, async () => {
    const a = await h.apply();
    await setStatus(a.id, status);
    const before = (await jobsFor(a.id)).length;
    for (const d of [{ reviewDecision: "accept" }, { reviewDecision: "reject" }, { interviewOutcome: "yes" }, { interviewOutcome: "no" }]) {
      await h.decisions([{ applicantId: a.id, ...d }]);
    }
    assert.equal((await row("applicants", a.id)).status, status);
    assert.equal((await jobsFor(a.id)).length, before);
  });
}

test("a valid interview decision queues one email across repeated polls, and stale versions are refused", async () => {
  const a = await h.apply();
  await setStatus(a.id, "accepted");
  const { version } = await row("applicants", a.id);
  const first = await h.decisions([{ applicantId: a.id, decisionId: "22222222-2222-4222-8222-222222222222", version, interviewOutcome: "yes", reviewer: "Sam" }]);
  assert.equal(first.body.outcomes[0].result, "applied");
  const again = await h.decisions([{ applicantId: a.id, interviewOutcome: "yes" }]);
  assert.equal(again.body.outcomes[0].result, "unchanged");
  assert.equal((await row("applicants", a.id)).status, "interview_yes");
  assert.equal((await jobsFor(a.id)).filter((j) => j.payload.template === "decision:interview_yes").length, 1);

  // The sheet's old view of the row cannot undo the newer decision.
  const stale = await h.decisions([{ applicantId: a.id, version, interviewOutcome: "no" }]);
  assert.equal(stale.body.outcomes[0].result, "stale");
  assert.equal((await row("applicants", a.id)).status, "interview_yes");

  // A retried request replays the receipt rather than re-applying.
  const conflicting = await h.decisions([{ applicantId: a.id, decisionId: "22222222-2222-4222-8222-222222222222", interviewOutcome: "no" }]);
  assert.equal(conflicting.body.outcomes[0].result, "conflict");
  const replay = await h.decisions([{ applicantId: a.id, decisionId: "22222222-2222-4222-8222-222222222222", version, interviewOutcome: "yes", reviewer: "Sam" }]);
  assert.equal(replay.body.outcomes[0].result, "replayed");
  assert.equal((await row("applicants", a.id)).status, "interview_yes");
  const [event] = (await sql.query("select * from application_events where applicant_id = $1 and to_status = 'interview_yes'", [a.id])).rows;
  assert.equal(event.actor, "excel");
  assert.match(event.reason, /Sam/);
});

test("an in-person rejection offers online and switching starts a clean review cycle", async () => {
  const a = await h.apply({ track: "in_person" });
  await setStatus(a.id, "under_review");
  const decision = await h.decisions([{ applicantId: a.id, reviewCycle: 0, reviewDecision: "reject" }]);
  assert.equal(decision.body.outcomes[0].status, "online_offered");
  const database = h.load("lib/db/index.ts").getDb();
  const token = await database.transaction((tx) => h.load("lib/access.ts").issueAccessToken(tx, a.id, "switch_online", 600));
  const switched = await h.switchOnline(token.raw);
  assert.match(switched.url, /switch=ok/);
  const applicant = await row("applicants", a.id);
  assert.equal(applicant.track, "online");
  assert.equal(applicant.status, "under_review");
  assert.equal(applicant.review_cycle, 1);
  assert.ok(applicant.online_offered_at);
  assert.equal(applicant.review_decision, null);
  assert.equal((await jobsFor(a.id)).filter((job) => job.payload.template === "received").length, 1);
});

test("Calendly booking and cancellation only update the interview time", async () => {
  const a = await h.apply();
  await setStatus(a.id, "accepted");
  const email = (await row("applicants", a.id)).email;
  const booking = await h.calendly({
    event: "invitee.created",
    payload: { email, scheduled_event: { start_time: "2026-10-20T14:00:00Z" }, tracking: {} },
  });
  assert.equal(booking.body.outcome, "interview booked");
  assert.equal((await row("applicants", a.id)).interview_at.toISOString(), "2026-10-20T14:00:00.000Z");
  assert.equal((await row("applicants", a.id)).status, "accepted");
  await h.calendly({ event: "invitee.canceled", payload: { email, tracking: {} } });
  assert.equal((await row("applicants", a.id)).interview_at, null);
});

test("ops recovery writes the same completion columns as the webhooks", async () => {
  const a = await h.apply();
  const r1 = await h.ops({ action: "transition", applicantId: a.id, to: "round1_complete", reason: "form done" });
  assert.equal(r1.status, 200);
  const afterR1 = await row("applicants", a.id);
  assert.equal(afterR1.status, "round1_complete");
  assert.ok(afterR1.round1_completed_at);

  const id = await h.ops({ action: "transition", applicantId: a.id, to: "id_verified", reason: "manual verify" });
  assert.equal(id.status, 200);
  const afterId = await row("applicants", a.id);
  assert.equal(afterId.status, "id_verified");
  assert.equal(afterId.identity_status, "verified");

  await setStatus(a.id, "under_review");
  const review = await h.ops({ action: "transition", applicantId: a.id, to: "accepted", reason: "approved" });
  assert.equal(review.status, 200);
  assert.equal((await row("applicants", a.id)).status, "accepted");
});

test("the lifecycle refuses onboarding a traveller without a verified identity", async () => {
  const traveller = await h.apply({ track: "in_person" });
  await setStatus(traveller.id, "docs_submitted");
  const refused = await h.ops({ action: "transition", applicantId: traveller.id, to: "onboarding", reason: "docs approved" });
  assert.equal(refused.status, 409);
  assert.match(refused.body.detail, /identity_required/);
  await sql.query("update applicants set identity_status = 'verified' where id = $1", [traveller.id]);
  const allowed = await h.ops({ action: "transition", applicantId: traveller.id, to: "onboarding", reason: "docs approved" });
  assert.equal(allowed.status, 200);

  const online = await h.apply({ track: "online" });
  await setStatus(online.id, "docs_submitted");
  const ok = await h.ops({ action: "transition", applicantId: online.id, to: "onboarding", reason: "online cohort" });
  assert.equal(ok.status, 200);
  const skip = await h.ops({ action: "transition", applicantId: online.id, to: "submitted", reason: "nope" });
  assert.equal(skip.status, 409);
  const [event] = (await sql.query("select * from application_events where applicant_id = $1 and to_status = 'onboarding'", [online.id])).rows;
  assert.equal(event.actor, "ops");
  assert.match(event.reason, /tester/);
});

test("the sync feed pages by revision without gaps and by timestamp with a cursor", async () => {
  const ids = [];
  for (let i = 0; i < 3; i++) ids.push((await h.apply()).id);
  const all = await h.sync("applicants", "after=0&limit=500");
  const revisions = all.body.rows.map((r) => BigInt(r.revision));
  for (let i = 1; i < revisions.length; i++) assert.equal(revisions[i], revisions[i - 1] + 1n);
  const mine = all.body.rows.filter((r) => ids.includes(r.id));
  assert.equal(mine.length, 3);
  assert.equal("reviewDecision" in mine[0], false, "decision columns never leave the server");
  assert.equal(typeof mine[0].version, "number");

  const start = revisions[revisions.length - 4];
  const page1 = await h.sync("applicants", `after=${start}&limit=2`);
  assert.equal(page1.body.rows.length, 2);
  assert.equal(page1.body.hasMore, true);
  const page2 = await h.sync("applicants", `after=${page1.body.cursor}&limit=2`);
  assert.equal(page2.body.rows.length, 1);
  assert.equal(page2.body.hasMore, false);

  const byTime = await h.sync("applicants", "changedSince=1970-01-01T00:00:00Z&limit=2");
  assert.equal(byTime.body.rows.length, 2);
  assert.ok(byTime.body.next.afterId);
  const seen = new Set(byTime.body.rows.map((r) => r.id));
  let next = byTime.body.next;
  while (next) {
    const page = await h.sync("applicants", `changedSince=${next.changedSince}&afterId=${next.afterId}&limit=2`);
    for (const r of page.body.rows) { assert.equal(seen.has(r.id), false); seen.add(r.id); }
    next = page.body.hasMore ? page.body.next : null;
  }
  assert.equal(seen.size, await count("applicants"));
});

test("the ops overview surfaces failed emails and stuck identity checks", async () => {
  const a = await h.apply();
  await h.videoask(a.id);
  await sql.query("update applicants set updated_at = now() - interval '2 hours' where id = $1", [a.id]);
  const [job] = await jobsFor(a.id);
  await sql.query("update jobs set status = 'failed', last_error = 'x' where id = $1", [job.id]);
  const view = await h.opsOverview();
  assert.ok(view.body.awaitingIdentity.some((r) => r.id === a.id));
  assert.ok(view.body.failedEmails.some((r) => r.id === job.id));
  assert.equal(typeof view.body.counts.submitted, "number");
});

test("submissions are rate limited per connection", async () => {
  const previousIp = h.state.ip;
  h.state.ip = "203.0.113.7";
  try {
    const results = [];
    for (let i = 0; i < 11; i++) results.push(await h.apply({ ip: "203.0.113.7" }));
    assert.equal(results.slice(0, 10).every((r) => r.ok), true);
    assert.deepEqual(results[10], { ok: false, reason: "rate_limited" });
  } finally {
    h.state.ip = previousIp;
  }
});

const SHEETS_KEYS = ["GOOGLE_SHEET_ID", "GOOGLE_SERVICE_ACCOUNT_JSON"];
const GRAPH_KEYS = ["GRAPH_TENANT_ID", "GRAPH_CLIENT_ID", "GRAPH_CLIENT_SECRET", "GRAPH_DRIVE_ID", "GRAPH_ITEM_ID"];

test("excel cron skips when Google Sheets is not configured", async () => {
  for (const key of [...SHEETS_KEYS, ...GRAPH_KEYS]) delete process.env[key];
  const res = await h.excel();
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { ok: true, skipped: true });
});

test("excel pull keeps reviewer cells when merging a system row", () => {
  const excel = h.load("lib/excel-rows.ts");
  const headers = excel.APPLICANT_COLUMNS;
  const existing = headers.map((name) => {
    if (name === "reviewDecision") return "accept";
    if (name === "decisionId") return "22222222-2222-4222-8222-222222222222";
    if (name === "reviewNotes") return "keep me";
    return "";
  });
  const merged = excel.mergeRow(headers, existing, {
    id: "11111111-1111-4111-8111-111111111111",
    status: "accepted",
    fullName: "Ada",
    skills: ["Agriculture & Food"],
    reviewDecision: "reject",
    decisionId: "33333333-3333-4333-8333-333333333333",
  }, excel.APPLICANT_SYSTEM);
  assert.equal(merged[headers.indexOf("reviewDecision")], "accept");
  assert.equal(merged[headers.indexOf("decisionId")], "22222222-2222-4222-8222-222222222222");
  assert.equal(merged[headers.indexOf("reviewNotes")], "keep me");
  assert.equal(merged[headers.indexOf("status")], "accepted");
  assert.equal(merged[headers.indexOf("fullName")], "Ada");
  assert.equal(merged[headers.indexOf("skills")], "[\"Agriculture & Food\"]");
  const blank = headers.map((name) => (name === "reviewDecision" ? "accept" : ""));
  assert.equal(excel.readApplicantDecision(headers, blank), null);
});

test("excel cron pulls an applicant, pushes one accept, and replays the same decision", async () => {
  for (const key of [...SHEETS_KEYS, ...GRAPH_KEYS]) delete process.env[key];
  const { generateKeyPairSync } = await import("node:crypto");
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  process.env.GOOGLE_SHEET_ID = "sheet";
  process.env.GOOGLE_SERVICE_ACCOUNT_JSON = JSON.stringify({
    client_email: "sync@example.iam.gserviceaccount.com",
    private_key: privateKey.export({ type: "pkcs8", format: "pem" }),
  });

  const excel = h.load("lib/excel-rows.ts");
  const tables = {
    Applicants: excel.APPLICANT_COLUMNS,
    Waitlist: excel.WAITLIST_COLUMNS,
    Interest: excel.INTEREST_COLUMNS,
    Nominations: excel.NOMINATION_COLUMNS,
    Partners: excel.PARTNER_COLUMNS,
  };
  const book = {};
  for (const [name, headers] of Object.entries(tables)) {
    const row = headers.map(() => "");
    if (name === "Applicants") row[headers.indexOf("reviewDecision")] = "accept";
    book[name] = { headers, rows: [row] };
  }

  const realFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
    if (url.includes("oauth2.googleapis.com/token")) {
      const params = new URLSearchParams(String(init?.body ?? ""));
      if (params.get("grant_type") !== "urn:ietf:params:oauth:grant-type:jwt-bearer") return json({ error: "bad grant" }, 400);
      if (!params.get("assertion")) return json({ error: "missing assertion" }, 400);
      return json({ access_token: "tok", expires_in: 3600 });
    }
    if (!url.includes("sheets.googleapis.com")) return new Response(`not found ${url}`, { status: 404 });
    const headers = new Headers(init?.headers);
    if (headers.get("authorization") !== "Bearer tok") throw new Error(`missing token ${url}`);
    if (url.includes(":batchUpdate")) {
      const body = JSON.parse(init.body);
      for (const update of body.data) {
        const match = String(update.range).match(/^'([^']+)'!([A-Z]+)(\d+)/);
        if (!match) return new Response(`bad range ${update.range}`, { status: 400 });
        const sheet = book[match[1]];
        if (!sheet) return new Response(`missing table ${match[1]}`, { status: 404 });
        const index = Number(match[3]) - 2;
        while (sheet.rows.length < index) sheet.rows.push(sheet.headers.map(() => ""));
        if (sheet.rows.length === index) sheet.rows.push(update.values[0]);
        else sheet.rows[index] = update.values[0];
      }
      return json({ totalUpdatedRows: body.data.length });
    }
    const match = url.match(/\/values\/([^?]+)/);
    if (!match) return new Response(`not found ${url}`, { status: 404 });
    const table = decodeURIComponent(match[1]);
    const sheet = book[table];
    if (!sheet) return new Response("Unable to parse range", { status: 400 });
    return json({ values: [sheet.headers, ...sheet.rows] });
  };

  try {
    const max = await sql.query("select coalesce(max(revision), 0)::text as rev from sync_changes");
    for (const table of ["applicants", "waitlist", "interest", "nominations", "partners"]) {
      await sql.query(
        "insert into excel_cursors (table_name, cursor) values ($1, $2) on conflict (table_name) do update set cursor = excluded.cursor",
        [table, max.rows[0].rev],
      );
    }
    const applicant = await h.apply();
    const headers = book.Applicants.headers;
    const at = (name) => headers.indexOf(name);

    const applicantRow = () => book.Applicants.rows.find((values) => values[at("id")] === applicant.id);

    const pulled = await h.excel();
    assert.equal(pulled.status, 200, JSON.stringify(pulled.body));
    assert.equal(pulled.body.pushed.attempted, 0);
    assert.equal(book.Applicants.rows[0][at("id")], "");
    assert.equal(book.Applicants.rows[0][at("reviewDecision")], "accept");
    assert.equal(applicantRow()[at("fullName")], "Ada Lovelace");
    assert.equal(applicantRow()[at("status")], "submitted");
    assert.equal(applicantRow()[at("reviewDecision")], "");
    assert.equal(applicantRow()[at("skills")], "[\"Agriculture & Food\"]");

    await setStatus(applicant.id, "under_review");
    await h.excel();
    applicantRow()[at("reviewDecision")] = "accept";
    applicantRow()[at("reviewNotes")] = "keep me";
    const pushed = await h.excel();
    assert.equal(pushed.status, 200, JSON.stringify(pushed.body));
    assert.equal(pushed.body.pushed.outcomes[0].result, "applied");
    assert.equal((await row("applicants", applicant.id)).status, "accepted");
    assert.equal(applicantRow()[at("reviewNotes")], "keep me");
    assert.equal(applicantRow()[at("reviewDecision")], "accept");
    assert.equal(applicantRow()[at("status")], "accepted");
    assert.match(String(applicantRow()[at("decisionId")]), /^[0-9a-f-]{36}$/i);

    const replayed = await h.excel();
    assert.equal(replayed.status, 200, JSON.stringify(replayed.body));
    assert.equal(replayed.body.pushed.outcomes[0].result, "replayed");
    assert.equal((await row("applicants", applicant.id)).status, "accepted");
    assert.equal(applicantRow()[at("reviewNotes")], "keep me");
    const receipts = await sql.query("select count(*)::int as n from decision_receipts where applicant_id = $1", [applicant.id]);
    assert.equal(receipts.rows[0].n, 1);
    const previousId = applicantRow()[at("decisionId")];
    applicantRow()[at("interviewOutcome")] = "yes";
    const edited = await h.excel();
    assert.equal(edited.body.pushed.outcomes[0].result, "applied");
    assert.notEqual(applicantRow()[at("decisionId")], previousId);
    assert.equal((await row("applicants", applicant.id)).status, "interview_yes");
  } finally {
    globalThis.fetch = realFetch;
    for (const key of [...SHEETS_KEYS, ...GRAPH_KEYS]) delete process.env[key];
  }
});

test("all email templates escape untrusted names while preserving branded HTML", () => {
  const emails = loader()("lib/emails.ts");
  const name = '<a href="https://example.invalid">O\'Brien & Co</a>';
  const messages = [emails.nominationEmail(name)];
  for (const locale of ["en", "fr"]) messages.push(emails.applicationEmail(name, null, locale), emails.identityEmail(name, "https://example.invalid/verify", locale), emails.resumeEmail(name, "https://example.invalid/resume", locale));
  for (const { html } of messages) {
    assert.ok(!html.includes(name));
    assert.ok(html.includes("&lt;a href=&quot;https://example.invalid&quot;&gt;O&#39;Brien &amp; Co&lt;/a&gt;"));
    assert.ok(html.includes("<table"));
  }
});

test("consent must be explicitly true before any application or consent record is saved", async () => {
  const before = await count("consent_log");
  for (const consent of [undefined, false, "true", 1]) {
    const email = nextEmail();
    assert.deepEqual(await h.apply({ email, consent }), { ok: false, reason: "invalid" });
    assert.equal(await count("applicants", "email = $1", [email]), 0);
  }
  assert.equal(await count("consent_log"), before);
});

test("expired worker leases are reclaimed while active leases and newer owners are protected", async () => {
  const database = h.load("lib/db/index.ts").getDb();
  const { enqueue, claimJobs, settle, runClaimedJob, MAX_ATTEMPTS } = h.load("lib/jobs.ts");
  const key = `test:lease:${randomUUID()}`;
  await enqueue(database, { kind: "email", dedupeKey: key, payload: {} });
  // Keep this fixture ahead of unrelated jobs in the shared integration database.
  await sql.query("update jobs set available_at = '2000-01-01' where dedupe_key = $1", [key]);
  const [old] = await claimJobs(database, 1);
  assert.equal(old.dedupeKey, key);
  const otherJobs = await claimJobs(database, 100);
  assert.ok(!otherJobs.some((job) => job.id === old.id));
  for (const job of otherJobs) await settle(database, job, { status: "retry", error: "released test lease" });
  await sql.query("update jobs set locked_until = now() - interval '1 second' where id = $1", [old.id]);
  const [replacement] = await claimJobs(database, 1);
  assert.equal(replacement.id, old.id);
  assert.notEqual(replacement.lockToken, old.lockToken);
  assert.equal(replacement.attempts, 2);
  await settle(database, old, { status: "done" });
  assert.equal((await row("jobs", old.id)).status, "running");
  await settle(database, replacement, { status: "done" });
  assert.equal((await row("jobs", old.id)).status, "done");
  let called = false;
  const exhausted = await runClaimedJob({ ...replacement, attempts: MAX_ATTEMPTS + 1 }, { email: async () => { called = true; return { status: "done" }; } }, database);
  assert.equal(exhausted.status, "failed");
  assert.equal(called, false);
  const uncertain = await runClaimedJob({ ...replacement, firstAttemptAt: new Date(Date.now() - 24 * 3600_000) }, { email: async () => { called = true; return { status: "done" }; } }, database);
  assert.equal(uncertain.status, "failed");
  assert.equal(called, false);
});

test("queued recovery links get their lifetime at delivery and retry the same email", async () => {
  const a = await h.apply();
  const database = h.load("lib/db/index.ts").getDb();
  await h.load("lib/application.ts").requestResumeLink(database, (await row("applicants", a.id)).email);
  const [queued] = (await jobsFor(a.id)).filter((j) => j.payload.template === "resume");
  await sql.query("update jobs set created_at = now() - interval '2 days', available_at = '1999-01-01' where id = $1", [queued.id]);
  const { claimJobs, settle, runClaimedJob } = h.load("lib/jobs.ts");
  const [claimed] = await claimJobs(database, 1);
  const { handlers } = h.load("lib/worker.ts");
  const oldDeliver = h.state.deliver;
  const sent = [];
  h.state.deliver = async (input, key) => { sent.push({ input, key }); return { ok: false, retryable: true, error: "timeout" }; };
  try {
    const result = await runClaimedJob(claimed, handlers, database);
    await settle(database, claimed, result);
    const [token] = (await sql.query("select * from access_tokens where applicant_id = $1", [a.id])).rows;
    assert.ok(token.expires_at.getTime() > Date.now() + 29 * 60_000);
    await sql.query("update jobs set available_at = '1999-01-01' where id = $1", [queued.id]);
    const [retry] = await claimJobs(database, 1);
    await runClaimedJob(retry, handlers, database);
    assert.deepEqual(sent[0], sent[1]);
    await settle(database, retry, { status: "failed", error: "test complete" });
  } finally { h.state.deliver = oldDeliver; }
});

test("decision ids cannot be reused for another applicant, including concurrent requests", async () => {
  const a = await h.apply();
  const b = await h.apply();
  await setStatus(a.id, "under_review");
  await setStatus(b.id, "under_review");
  const decisionId = randomUUID();
  const results = await Promise.all([a, b].map((applicant) => h.decisions([{ applicantId: applicant.id, decisionId, version: 0, reviewDecision: "accept" }])));
  assert.deepEqual(results.map((result) => result.body.outcomes[0].result).sort(), ["applied", "conflict"]);
});

test("Excel sync skips test addresses, configurable via SYNC_EXCLUDE_EMAIL_PATTERN", () => {
  const { excludedFromSync, syncExcludePatterns } = h.load("lib/excel-sync.ts");
  const before = process.env.SYNC_EXCLUDE_EMAIL_PATTERN;
  try {
    delete process.env.SYNC_EXCLUDE_EMAIL_PATTERN;
    assert.deepEqual(syncExcludePatterns(), ["+crptest"]);
    assert.equal(excludedFromSync({ email: "CRP-QA+CrpTest3@mail.grokbot.com" }), true);
    assert.equal(excludedFromSync({ nominatorEmail: "real@example.org", nomineeEmail: "x+crptest@example.org" }), true);
    assert.equal(excludedFromSync({ email: "applicant@example.org" }), false);
    process.env.SYNC_EXCLUDE_EMAIL_PATTERN = " @qa.invalid , +e2e ";
    assert.equal(excludedFromSync({ email: "a@qa.invalid" }), true);
    assert.equal(excludedFromSync({ email: "a+crptest@example.org" }), false);
    process.env.SYNC_EXCLUDE_EMAIL_PATTERN = "";
    assert.equal(excludedFromSync({ email: "a+crptest@example.org" }), false);
  } finally {
    if (before === undefined) delete process.env.SYNC_EXCLUDE_EMAIL_PATTERN;
    else process.env.SYNC_EXCLUDE_EMAIL_PATTERN = before;
  }
});

test("Excel rotates past 200 completed or invalid decisions to reach later applicants", async () => {
  const database = h.load("lib/db/index.ts").getDb();
  const a = await h.apply();
  const b = await h.apply();
  await setStatus(a.id, "under_review");
  await setStatus(b.id, "under_review");
  const decisionId = randomUUID();
  await h.decisions([{ applicantId: a.id, decisionId, version: 0, reviewDecision: "accept" }]);
  const excel = h.load("lib/excel-rows.ts");
  const headers = excel.APPLICANT_COLUMNS;
  const values = (payload) => headers.map((key) => payload[key] ?? "");
  const rows = Array.from({ length: 200 }, (_, index) => ({ index, values: values({ id: a.id, version: 1, reviewCycle: 0, decisionId, reviewDecision: index % 2 ? "invalid" : "accept" }) }));
  rows.push({ index: 200, values: values({ id: b.id, version: 0, reviewCycle: 0, reviewDecision: "accept" }) });
  const workbook = {
    async readTable(name) { return name === "Applicants" ? { headers, rows } : { headers: ["id"], rows: [] }; },
    async writeRow(name, index, next) { if (name === "Applicants") rows[index].values = next; },
    async addRow() {},
  };
  await sql.query("update excel_sync_state set decision_offset = 0, locked_until = null");
  const { tickExcel } = h.load("lib/excel-sync.ts");
  await tickExcel(database, workbook);
  assert.equal((await row("applicants", b.id)).status, "under_review");
  await tickExcel(database, workbook);
  assert.equal((await row("applicants", b.id)).status, "accepted");
});

test("the backfill includes all four legacy tables, excludes private identity links, and is repeatable", async () => {
  const a = await h.apply();
  const ids = [a.id, randomUUID(), randomUUID(), randomUUID()];
  const backfill = readFileSync("drizzle/0008_backend_recovery.sql", "utf8").split("--> statement-breakpoint")[1];
  await sql.query("BEGIN");
  try {
    await sql.query("delete from sync_changes where record_id = $1", [a.id]);
    await sql.query("insert into waitlist (id, email) values ($1, $2)", [ids[1], nextEmail()]);
    await sql.query("insert into interest (id, email, age_group) values ($1, $2, '19_plus')", [ids[2], nextEmail()]);
    await sql.query("insert into nominations (id, nominator_name, nominator_email, nominee_name, nominee_email) values ($1, 'A', $2, 'B', $3)", [ids[3], nextEmail(), nextEmail()]);
    await sql.query(backfill);
    const changes = (await sql.query("select * from sync_changes where record_id = any($1::uuid[]) order by revision", [ids])).rows;
    assert.equal(changes.length, 4);
    assert.deepEqual(changes.map((c) => c.table_name).sort(), ["applicants", "interest", "nominations", "waitlist"]);
    const payload = changes.find((c) => c.table_name === "applicants").payload;
    assert.equal(payload.fullName, "Ada Lovelace");
    assert.equal("identityLink" in payload, false);
    assert.equal("identitySessionId" in payload, false);
    assert.equal(payload.round1Link, null);
    await sql.query(backfill);
    assert.equal(await count("sync_changes", "record_id = any($1::uuid[])", [ids]), 4);
  } finally { await sql.query("ROLLBACK"); }
});


test("registration grants no access until email confirmation and resuming revokes old sessions", async () => {
  const a = await h.apply({ unverified: true });
  const database = h.load("lib/db/index.ts").getDb();
  const { signSession } = h.load("lib/session.ts");
  const before = await h.verify({ crp_session: signSession(a.id, 0) });
  assert.equal(before.url, "https://example.invalid/apply");
  const blockedEvent = await h.videoask(a.id);
  assert.equal(blockedEvent.body.advanced, false);
  assert.equal((await row("applicants", a.id)).status, "submitted");
  assert.equal(await count("jobs", "applicant_id = $1 and kind = 'identity_session'", [a.id]), 0);
  const { claimJobs, runClaimedJob, settle } = h.load("lib/jobs.ts");
  const { handlers } = h.load("lib/worker.ts");
  async function deliverLink() {
    const [pending] = (await jobsFor(a.id)).filter((j) => j.status === "pending" && ["application", "resume"].includes(j.payload.template));
    await sql.query("update jobs set available_at = '1900-01-01' where id = $1", [pending.id]);
    const [claimed] = await claimJobs(database, 1);
    assert.equal(claimed.id, pending.id);
    await settle(database, claimed, await runClaimedJob(claimed, handlers, database));
    const saved = await row("jobs", pending.id);
    return new URL(saved.payload.html.match(/href="([^"]+\/api\/apply\/resume[^"]+)"/)[1]).searchParams.get("token");
  }
  const first = await h.resume(await deliverLink());
  const firstCookie = first.setCookies[0][1];
  assert.ok((await row("applicants", a.id)).email_verified_at);
  assert.equal((await row("applicants", a.id)).session_version, 1);
  assert.equal((await h.verify({ crp_session: firstCookie })).url, "https://example.invalid/apply/complete");
  await h.load("lib/application.ts").requestResumeLink(database, (await row("applicants", a.id)).email);
  const second = await h.resume(await deliverLink());
  assert.equal((await row("applicants", a.id)).session_version, 2);
  assert.equal((await h.verify({ crp_session: firstCookie })).url, "https://example.invalid/apply");
  assert.equal((await h.verify({ crp_session: second.setCookies[0][1] })).url, "https://example.invalid/apply/complete");
});

test("VideoAsk rejects forged references, wrong forms, abandoned and unrelated events", async () => {
  const a = await h.apply();
  const valid = h.load("lib/videoask.ts").videoaskReference(a.id);
  // Authentic events that are not ours to act on are acknowledged, not stored.
  for (const change of [
    { event_type: "form_contact_message" },
    { form: { form_id: "wrong-form" } },
    { contact: { status: "abandoned", variables: { application_ref: valid } } },
  ]) {
    const result = await h.videoask(a.id, change);
    assert.equal(result.status, 200);
    assert.ok(result.body.ignored);
  }
  assert.equal((await row("applicants", a.id)).status, "submitted");
  for (const change of [
    { contact: { status: "completed", variables: [null, "invalid"] } },
    { contact: { status: "completed", variables: { application_ref: valid.slice(0, -2) + "XX" } } },
    { applicant_id: a.id, contact: { status: "completed", answers: [{ input_text: valid }] } },
  ]) {
    const result = await h.videoask(a.id, change);
    assert.equal(result.status, 400);
  }
  // A cryptographically valid reference for someone else is accepted as that
  // other applicant's event and must not advance this one.
  const mismatch = h.load("lib/videoask.ts").videoaskReference("11111111-1111-4111-8111-111111111111");
  const other = await h.videoask(a.id, { contact: { status: "completed", variables: { application_ref: mismatch } } });
  assert.equal(other.status, 200);
  assert.equal(other.body.advanced, false);
  assert.equal((await row("applicants", a.id)).status, "submitted");
  assert.equal((await h.videoask(a.id)).body.advanced, true);
});

test("operations credentials bind the audit actor and reject legacy shared credentials", async () => {
  const route = h.load("app/api/ops/route.ts");
  assert.equal((await route.GET(h.req("/api/ops", { headers: { "x-ops-secret": "ops", "x-operator": "tester" } }))).status, 401);
  const a = await h.apply();
  const result = await h.ops({ action: "transition", applicantId: a.id, to: "round1_complete", reason: "verified manually" });
  assert.equal(result.body.ok, true);
  const events = (await sql.query("select reason from application_events where applicant_id = $1 and actor = 'ops'", [a.id])).rows;
  assert.match(events[0].reason, /by tester/);
  assert.doesNotMatch(events[0].reason, /impersonated/);
  const before = process.env.OPERATIONS_TOKENS;
  process.env.OPERATIONS_TOKENS = "[]";
  try { assert.equal((await h.opsOverview()).status, 401); } finally { process.env.OPERATIONS_TOKENS = before; }
});

test("interest signup tells new and repeat addresses apart without exposing details", async () => {
  const email = nextEmail();
  h.state.ip = `192.0.2.${++ipCounter % 250}`;
  const input = { email, ageGroup: "19_plus", track: "online" };
  assert.deepEqual(await h.actions.submitInterest(input), { ok: true, status: "ok" });
  await sql.query("update interest set name = 'Secret Name', age_group = 'under_19' where email = $1", [email]);
  const repeat = await h.actions.submitInterest(input);
  assert.deepEqual(repeat, { ok: true, status: "already_recorded" });
  assert.doesNotMatch(JSON.stringify(repeat), /Secret Name|under_19/);
  // A repeat never overwrites the stored entry (no mailbox proof any more).
  assert.equal((await sql.query("select age_group from interest where email = $1", [email])).rows[0].age_group, "under_19");
  assert.deepEqual(await h.actions.submitInterest({ email: "not-an-email" }), { ok: false, status: "error" });
});

const ackJobs = (to) => sql.query("select * from jobs where payload->>'to' = $1 order by created_at", [to]).then((r) => r.rows);
const noConfirmation = async (to) => {
  assert.equal(await count("jobs", "payload->>'to' = $1 and payload->>'template' = 'capture_confirmation'", [to]), 0);
  assert.equal(await count("capture_tokens", "payload->>'email' = $1", [to]), 0);
};

for (const kind of ["waitlist", "interest"]) {
  test(`${kind} sign-ups are saved on submit with no confirmation email, and acknowledged in the site language`, async () => {
    const email = nextEmail();
    const submit = kind === "waitlist" ? h.actions.submitWaitlist : h.actions.submitInterest;
    h.state.ip = `192.0.2.${++ipCounter % 250}`;
    const result = await submit({ email, name: "Ana", ageGroup: "19_plus", track: "in_person", locale: "pt" });
    assert.deepEqual(result, kind === "waitlist" ? { ok: true } : { ok: true, status: "ok" });
    const saved = (await sql.query(`select * from ${kind} where email = $1`, [email])).rows[0];
    assert.ok(saved, "saved straight away");
    if (kind === "interest") assert.equal(saved.track, "in_person");
    assert.equal(await count("sync_changes", "record_id = $1", [saved.id]), 1);
    await noConfirmation(email);
    const jobs = await ackJobs(email);
    assert.equal(jobs.length, 1);
    assert.equal(jobs[0].payload.template, kind);
    assert.match(jobs[0].payload.html, /<html lang="pt"/);
    assert.equal(jobs[0].payload.subject, kind === "waitlist" ? "Já está na lista" : "O seu interesse foi registado");
    assert.doesNotMatch(jobs[0].payload.html, /\/api\/capture\/confirm/);

    // A repeat changes nothing and is not re-mailed.
    await submit({ email, ageGroup: "under_19", track: "online", locale: "fr" });
    assert.equal((await ackJobs(email)).length, 1);
    if (kind === "interest") assert.equal((await sql.query("select track from interest where email = $1", [email])).rows[0].track, "in_person");
  });
}

test("acknowledgements fall back to English for a missing or unknown locale", async () => {
  for (const locale of [undefined, "de"]) {
    const email = nextEmail();
    h.state.ip = `192.0.2.${++ipCounter % 250}`;
    assert.deepEqual(await h.actions.submitInterest({ email, ageGroup: "19_plus", ...(locale ? { locale } : {}) }), { ok: true, status: "ok" });
    const [job] = await ackJobs(email);
    assert.match(job.payload.html, /<html lang="en"/);
    assert.equal(job.payload.subject, "We've received your interest");
  }
});

test("partner inquiries are saved on submit and acknowledged in the site language", async () => {
  const email = nextEmail();
  h.state.ip = `192.0.2.${++ipCounter % 250}`;
  const result = await h.actions.submitPartner({ name: "Camille Dupont", email, organization: "Org Verte", designation: "Directrice", support: "Funding", locale: "fr" });
  assert.deepEqual(result, { ok: true });
  const saved = (await sql.query("select * from partner_inquiries where email = $1", [email])).rows[0];
  assert.equal(saved.organization, "Org Verte");
  assert.equal(await count("sync_changes", "record_id = $1", [saved.id]), 1);
  await noConfirmation(email);
  const [job] = await ackJobs(email);
  assert.equal(job.payload.template, "partner");
  assert.match(job.payload.html, /<html lang="fr"/);
  assert.match(job.payload.html, /Bonjour Camille Dupont,/);
  assert.equal(job.payload.subject, "Nous avons bien reçu votre message");
});

test("nominations are saved on submit and acknowledged once, in the site language", async () => {
  const nominatorEmail = nextEmail();
  const nomineeEmail = nextEmail();
  h.state.ip = `192.0.2.${++ipCounter % 250}`;
  const input = { nominatorName: "Lucía", nominatorEmail, nomineeName: "Mateo <b>", nomineeEmail, locale: "es" };
  assert.deepEqual(await h.actions.submitNomination(input), { ok: true });
  assert.equal(await count("nominations", "nominator_email = $1 and nominee_email = $2", [nominatorEmail, nomineeEmail]), 1);
  await noConfirmation(nominatorEmail);
  let jobs = await ackJobs(nominatorEmail);
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].payload.template, "nomination");
  assert.match(jobs[0].payload.html, /<html lang="es"/);
  assert.match(jobs[0].payload.html, /Gracias por proponer a Mateo &lt;b&gt;/);
  assert.equal(jobs[0].payload.subject, "Hemos recibido tu propuesta");
  assert.deepEqual(await h.actions.submitNomination(input), { ok: true });
  jobs = await ackJobs(nominatorEmail);
  assert.equal(jobs.length, 1, "a repeated nomination is not re-mailed");
});

test("sign-ups queued for a confirmation email before the change are saved directly", async () => {
  const email = nextEmail();
  const database = h.load("lib/db/index.ts").getDb();
  await sql.query("update jobs set available_at = now() + interval '1 hour' where status = 'pending'");
  await sql.query("insert into jobs (kind, dedupe_key, payload, available_at) values ('email', $1, $2, '1900-01-01')",
    [`email:capture:${randomUUID()}`, JSON.stringify({ template: "capture_confirmation", to: email, kind: "interest", input: { email, ageGroup: "19_plus", track: "online" } })]);
  const { claimJobs, runClaimedJob, settle } = h.load("lib/jobs.ts");
  const [claimed] = await claimJobs(database, 1);
  assert.equal(claimed.payload.to, email);
  const outcome = await runClaimedJob(claimed, h.load("lib/worker.ts").handlers, database);
  assert.equal(outcome.status, "done");
  await settle(database, claimed, outcome);
  assert.equal(await count("interest", "email = $1", [email]), 1);
  assert.equal(await count("capture_tokens", "payload->>'email' = $1", [email]), 0);
  assert.equal((await ackJobs(email)).filter((j) => j.payload.template === "interest").length, 1);
});

test("Spanish applicants confirm ownership before the form advances", async () => {
  const a = await h.apply({ language: "es", unverified: true });
  assert.equal(a.ok, true);
  assert.equal((await row("applicants", a.id)).language, "es");
  const database = h.load("lib/db/index.ts").getDb();
  const [queued] = await jobsFor(a.id);
  await sql.query("update jobs set available_at = '1800-01-01' where id = $1", [queued.id]);
  const { claimJobs, runClaimedJob, settle } = h.load("lib/jobs.ts");
  const [claimed] = await claimJobs(database, 1);
  assert.equal(claimed.id, queued.id);
  const outcome = await runClaimedJob(claimed, h.load("lib/worker.ts").handlers, database);
  assert.equal(outcome.status, "done");
  await settle(database, claimed, outcome);
  const sent = await row("jobs", queued.id);
  assert.match(sent.payload.html, /<html lang="es"/);
  const link = new URL(sent.payload.html.match(/href="([^"]+\/api\/apply\/resume[^"]+)"/)[1]);
  assert.equal(link.searchParams.get("lang"), "es");
  const confirmed = await h.resume(link.searchParams.get("token"));
  // No crp-consent on this request, so the functional crp-locale cookie is not set.
  assert.ok(confirmed.setCookies.some(([name]) => name === "crp_session"));
  assert.equal(confirmed.setCookies.some(([name]) => name === "crp-locale"), false);
  const { videoaskReference, videoaskLink } = h.load("lib/videoask.ts");
  assert.match(videoaskLink(a.id), /form#application_ref=/);
  const send = (formId, reference = videoaskReference(a.id)) => h.load("app/api/webhooks/videoask/route.ts").POST(h.req("/api/webhooks/videoask", {
    headers: { "x-webhook-secret": "videoask" }, body: JSON.stringify({ event_id: randomUUID(), event_type: "form_response", form: { form_id: formId }, contact: { status: "completed", variables: { application_ref: reference } } }),
  }));
  assert.equal((await send("wrong-form")).body.ignored, "other form");
  process.env.VIDEOASK_FORM_ID_FR = "FORM-fr";
  assert.equal((await send("FORM-fr")).body.advanced, true);
  assert.equal((await row("applicants", a.id)).status, "round1_complete");
  delete process.env.VIDEOASK_FORM_ID_FR;
});
