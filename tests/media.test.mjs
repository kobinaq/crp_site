import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import pg from "pg";
import { hookHarness, loader, nodes } from "./helpers.mjs";
import { startDatabase } from "./db.mjs";

const puts = [];
const gets = [];
const dels = [];
const missingBlobs = new Set();
let delExplodes = false;
let fetchHandler = async () => new Response(null, { status: 500 });
let getImpl = async () => { throw new Error("get was not expected"); };
let headImpl = async () => { throw new Error("head was not expected"); };
let realFetch;
let db;
let sql;
let load;

before(async () => {
  db = await startDatabase();
  process.env.DATABASE_URL = db.url;
  process.env.APP_SECRET = "test-secret-test-secret-test-secret-1234";
  process.env.NODE_ENV = "test";
  process.env.VIDEOASK_FORM_ID = "FORM-fixture";
  process.env.VIDEOASK_FORM_URL = "https://videoask.invalid/form";
  for (const key of ["VIDEOASK_FORM_ID_EN", "VIDEOASK_FORM_ID_FR", "VIDEOASK_FORM_ID_ES", "VIDEOASK_FORM_IDS"]) delete process.env[key];
  sql = new pg.Client({ connectionString: db.url });
  await sql.connect();
  load = loader({
    "@vercel/blob": {
      put: async (pathname, body, options) => {
        puts.push({ pathname, bytes: body.byteLength, access: options.access, allowOverwrite: options.allowOverwrite, contentType: options.contentType });
        return { url: "https://store.example.vercel-storage.com/hidden", pathname };
      },
      get: async (pathname, options) => {
        gets.push({ pathname, access: options.access, useCache: options.useCache, headers: options.headers });
        return getImpl(pathname, options);
      },
      del: async (pathname) => {
        dels.push(pathname);
        if (delExplodes) throw new Error(`secret path ${pathname} https://store.example.vercel-storage.com/x`);
        if (missingBlobs.has(pathname)) {
          const err = new Error("The requested blob does not exist");
          err.name = "BlobNotFoundError";
          throw err;
        }
      },
      head: async (pathname) => headImpl(pathname),
    },
  });
  realFetch = global.fetch;
  global.fetch = (url, init) => fetchHandler(url, init);
});

after(async () => {
  global.fetch = realFetch;
  await load?.("lib/db/index.ts")?.closeDb?.()?.catch(() => undefined);
  await sql?.end()?.catch(() => undefined);
  await db?.stop()?.catch(() => undefined);
});

async function applicant(email, status = "round1_complete") {
  const inserted = await sql.query(
    `insert into applicants (full_name, email, dob, age, track, status, email_verified_at)
     values ('Ada Lovelace', $1, '1990-01-02', 36, 'in_person', $2, now()) returning id`,
    [email, status],
  );
  return inserted.rows[0].id;
}

function completion(applicantId, eventId, { transcript = null, mediaUrl = "https://media.videoask.com/clip.mp4", questionId = "q-video" } = {}) {
  const { videoaskReference } = load("lib/videoask.ts");
  return {
    event_id: eventId,
    event_type: "form_response",
    form: { form_id: "FORM-fixture", questions: [{ question_id: questionId, label: "Story" }] },
    contact: {
      status: "completed",
      variables: { application_ref: videoaskReference(applicantId) },
      answers: [{ answer_id: `a-${eventId}`, question_id: questionId, type: "video", media_url: mediaUrl, transcription: transcript }],
    },
  };
}

async function deliver(applicantId, eventId, options) {
  const { readVideoaskCompletion } = load("lib/videoask.ts");
  const { ingestWebhook } = load("lib/webhooks.ts");
  const database = load("lib/db/index.ts").getDb();
  const body = completion(applicantId, eventId, options);
  const read = readVideoaskCompletion(body);
  assert.equal(read.applicantId, applicantId);
  const ingest = await ingestWebhook(database, "videoask", `${read.formId}:${read.eventId}`, read);
  return { read, ingest };
}

test("an unverified applicant keeps the VideoAsk answer and the webhook row drops the media url", async () => {
  const inserted = await sql.query(
    `insert into applicants (full_name, email, dob, age, track, status)
     values ('Grace Hopper', 'grace-unverified@example.org', '1990-01-02', 36, 'in_person', 'submitted') returning id`,
  );
  const id = inserted.rows[0].id;
  const first = await deliver(id, "evt-unverified-1", { transcript: "spoken before verify" });
  assert.equal(first.ingest.result.outcome, "email unverified");
  const row = await sql.query(`select transcript, source_url from videoask_answers where applicant_id = $1`, [id]);
  assert.equal(row.rows[0].transcript, "spoken before verify");
  assert.equal(row.rows[0].source_url, "https://media.videoask.com/clip.mp4");
  const stored = await sql.query(`select payload from webhook_events where event_key = 'FORM-fixture:evt-unverified-1'`);
  assert.equal(JSON.stringify(stored.rows[0].payload).includes("media.videoask.com"), false);
  assert.equal(JSON.stringify(stored.rows[0].payload).includes("spoken before verify"), false);
});

test("an already complete VideoAsk delivery stores the answer and drops the media url from the webhook row", async () => {
  const id = await applicant("ada-save@example.org");
  const first = await deliver(id, "evt-save-1", { transcript: null });
  assert.equal(first.ingest.result.outcome, "already complete");
  assert.equal(first.ingest.result.status, "round1_complete");
  const row = await sql.query(`select transcript, source_url, pathname from videoask_answers where applicant_id = $1 and question_id = 'q-video'`, [id]);
  assert.equal(row.rows[0].transcript, null);
  assert.equal(row.rows[0].source_url, "https://media.videoask.com/clip.mp4");
  assert.equal(row.rows[0].pathname, null);
  const jobs = await sql.query(`select dedupe_key, payload from jobs where applicant_id = $1 and kind = 'videoask_media'`, [id]);
  assert.equal(jobs.rowCount, 1);
  assert.equal(jobs.rows[0].dedupe_key, `videoask_media:${id}:q-video`);
  assert.deepEqual(jobs.rows[0].payload, { applicantId: id, questionId: "q-video" });
  const stored = await sql.query(`select payload from webhook_events where provider = 'videoask' and event_key = $1`, ["FORM-fixture:evt-save-1"]);
  assert.deepEqual(stored.rows[0].payload, { applicantId: id, eventId: "evt-save-1", formId: "FORM-fixture", answerCount: 1 });
  assert.equal(JSON.stringify(stored.rows[0].payload).includes("media.videoask.com"), false);

  const second = await deliver(id, "evt-save-2", { transcript: "fresh words" });
  assert.equal(second.ingest.result.outcome, "already complete");
  assert.equal(second.ingest.result.status, "round1_complete");
  const updated = await sql.query(`select status from applicants where id = $1`, [id]);
  assert.equal(updated.rows[0].status, "round1_complete");
  const words = await sql.query(`select transcript, source_url from videoask_answers where applicant_id = $1`, [id]);
  assert.equal(words.rows[0].transcript, "fresh words");
  assert.equal(words.rows[0].source_url, "https://media.videoask.com/clip.mp4");
  const again = await sql.query(`select count(*)::int as n from jobs where applicant_id = $1 and kind = 'videoask_media'`, [id]);
  assert.equal(again.rows[0].n, 1);
});

test("a failed VideoAsk process keeps the payload and does not log the media url", async () => {
  const { ingestWebhook } = load("lib/webhooks.ts");
  const database = load("lib/db/index.ts").getDb();
  const secretUrl = "https://media.videoask.com/secret-clip.mp4";
  const lines = [];
  const original = console.error;
  console.error = (...args) => { lines.push(args.map((part) => String(part?.message ?? part)).join(" ")); };
  try {
    const ingest = await ingestWebhook(database, "videoask", "FORM-fixture:evt-throw", {
      applicantId: { bad: true },
      eventId: "evt-throw",
      formId: "FORM-fixture",
      answers: [{ media_url: secretUrl }],
    });
    assert.equal(ingest.queued, true);
    assert.equal(ingest.result, null);
  } finally {
    console.error = original;
  }
  const stored = await sql.query(`select payload, processed_at from webhook_events where event_key = 'FORM-fixture:evt-throw'`);
  assert.equal(stored.rows[0].processed_at, null);
  assert.equal(JSON.stringify(stored.rows[0].payload).includes(secretUrl), true);
  assert.equal(lines.join("\n").includes(secretUrl), false);
  assert.equal(lines.join("\n").includes("media.videoask.com"), false);
});

test("copying a clip stores it once, and a second run does not fetch", async () => {
  const id = await applicant("ada-copy@example.org");
  await deliver(id, "evt-copy", { transcript: "spoken" });
  puts.length = 0;
  const calls = [];
  fetchHandler = async (url, init) => {
    calls.push({ url: String(url), redirect: init?.redirect });
    return new Response(Buffer.from("frames"), { status: 200, headers: { "content-type": "video/mp4" } });
  };
  const { copyVideoaskMedia } = load("lib/media.ts");
  const { parseApplicantId, parseQuestionId } = load("lib/holdings.ts");
  const database = load("lib/db/index.ts").getDb();
  const first = await copyVideoaskMedia(database, parseApplicantId(id), parseQuestionId("q-video"));
  const second = await copyVideoaskMedia(database, parseApplicantId(id), parseQuestionId("q-video"));
  assert.equal(first.deliveryStatus, "stored");
  assert.equal(second.deliveryStatus, "stored");
  assert.equal(puts.length, 1);
  assert.equal(puts[0].access, "private");
  assert.equal(puts[0].allowOverwrite, true);
  assert.equal(puts[0].contentType, "video/mp4");
  assert.equal(puts[0].pathname, `videoask/${id}/q-video.mp4`);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].redirect, "manual");
  const row = await sql.query(`select source_url, pathname, content_type, byte_size, transcript from videoask_answers where applicant_id = $1`, [id]);
  assert.equal(row.rows[0].source_url, null);
  assert.equal(row.rows[0].pathname, `videoask/${id}/q-video.mp4`);
  assert.equal(row.rows[0].content_type, "video/mp4");
  assert.equal(row.rows[0].byte_size, 6);
  assert.equal(row.rows[0].transcript, "spoken");
  assert.equal(JSON.stringify(row.rows[0]).includes("vercel-storage.com"), false);
});

test("a redirect off media.videoask.com does not store a file", async () => {
  const id = await applicant("ada-redirect@example.org");
  await deliver(id, "evt-redirect");
  puts.length = 0;
  fetchHandler = async () => new Response(null, { status: 302, headers: { location: "https://evil.example/file.mp4" } });
  const { copyVideoaskMedia } = load("lib/media.ts");
  const { parseApplicantId, parseQuestionId } = load("lib/holdings.ts");
  const outcome = await copyVideoaskMedia(load("lib/db/index.ts").getDb(), parseApplicantId(id), parseQuestionId("q-video"));
  assert.deepEqual(outcome, { status: "failed", error: "media redirect was refused" });
  assert.equal(puts.length, 0);
  assert.equal(outcome.error.includes("evil.example"), false);
  const row = await sql.query(`select source_url, pathname from videoask_answers where applicant_id = $1`, [id]);
  assert.equal(row.rows[0].source_url, "https://media.videoask.com/clip.mp4");
  assert.equal(row.rows[0].pathname, null);
});

test("two hops that stay on media.videoask.com store the file, and a third hop does not", async () => {
  const id = await applicant("ada-hops@example.org");
  await deliver(id, "evt-hops", { questionId: "q-hops" });
  puts.length = 0;
  const seen = [];
  fetchHandler = async (url) => {
    seen.push(String(url));
    if (seen.length < 3) {
      return new Response(null, { status: 302, headers: { location: `https://media.videoask.com/hop-${seen.length}.mp4` } });
    }
    return new Response(Buffer.from("ok"), { status: 200, headers: { "content-type": "video/mp4" } });
  };
  const { copyVideoaskMedia } = load("lib/media.ts");
  const { parseApplicantId, parseQuestionId } = load("lib/holdings.ts");
  const database = load("lib/db/index.ts").getDb();
  const stored = await copyVideoaskMedia(database, parseApplicantId(id), parseQuestionId("q-hops"));
  assert.equal(stored.deliveryStatus, "stored");
  assert.equal(seen.length, 3);
  assert.equal(seen.every((url) => new URL(url).hostname === "media.videoask.com"), true);
  assert.equal(puts.length, 1);

  const other = await applicant("ada-hops-3@example.org");
  await deliver(other, "evt-hops-3", { questionId: "q-far" });
  puts.length = 0;
  let hops = 0;
  fetchHandler = async () => {
    hops += 1;
    return new Response(null, { status: 302, headers: { location: `https://media.videoask.com/again-${hops}.mp4` } });
  };
  const refused = await copyVideoaskMedia(database, parseApplicantId(other), parseQuestionId("q-far"));
  assert.equal(refused.status, "failed");
  assert.equal(puts.length, 0);
  assert.equal(hops, 3);
  const row = await sql.query(`select pathname from videoask_answers where applicant_id = $1`, [other]);
  assert.equal(row.rows[0].pathname, null);
});

test("a missing recording becomes words only and a second run does not fetch", async () => {
  const id = await applicant("ada-missing@example.org");
  await deliver(id, "evt-missing", { transcript: "still here" });
  let calls = 0;
  fetchHandler = async () => {
    calls += 1;
    return new Response(null, { status: 404 });
  };
  const { copyVideoaskMedia } = load("lib/media.ts");
  const { parseApplicantId, parseQuestionId } = load("lib/holdings.ts");
  const database = load("lib/db/index.ts").getDb();
  const first = await copyVideoaskMedia(database, parseApplicantId(id), parseQuestionId("q-video"));
  const second = await copyVideoaskMedia(database, parseApplicantId(id), parseQuestionId("q-video"));
  assert.equal(first.deliveryStatus, "words only");
  assert.equal(second.deliveryStatus, "words only");
  assert.equal(calls, 1);
  const row = await sql.query(`select source_url, pathname, transcript from videoask_answers where applicant_id = $1`, [id]);
  assert.equal(row.rows[0].source_url, null);
  assert.equal(row.rows[0].pathname, null);
  assert.equal(row.rows[0].transcript, "still here");
});

async function staffUser(email, role) {
  const inserted = await sql.query(`insert into users (email, role) values ($1, $2) returning id`, [email, role]);
  return inserted.rows[0].id;
}

async function storedClip(applicantId, questionId, byteSize) {
  const pathname = `videoask/${applicantId}/${questionId}.mp4`;
  await sql.query(
    `insert into videoask_answers (
      applicant_id, question_id, answer_id, position, title, medium, transcript, pathname, content_type, byte_size, copied_at
    ) values ($1, $2, 'a1', 0, 'Story', 'video', 'spoken', $3, 'video/mp4', $4, now())`,
    [applicantId, questionId, pathname, byteSize],
  );
  return pathname;
}

function textOf(stream) {
  return stream.getReader().read().then(({ value }) => Buffer.from(value ?? []).toString());
}

function streamInput(fields) {
  return { rangeHeader: null, method: "GET", signal: AbortSignal.timeout(1000), ...fields };
}

function eventCount(kind) {
  return sql.query(`select count(*)::int as n from admin_events where kind = $1`, [kind]).then((result) => result.rows[0].n);
}

test("streaming checks the role, audits once per open, and never reveals the store", async () => {
  const id = await applicant("ada-open@example.org");
  const pathname = await storedClip(id, "q-open", 8000000);
  const document = await sql.query(
    `insert into identity_documents (applicant_id, kind, pathname, content_type, size) values ($1, 'passport', $2, 'image/jpeg', 12) returning id`,
    [id, `identity/${id}/passport-0.jpg`],
  );
  const documentId = document.rows[0].id;
  const admin = await staffUser("admin-open@example.org", "admin");
  const editor = await staffUser("editor-open@example.org", "editor");
  const reviewer = await staffUser("reviewer-open@example.org", "reviewer");
  const { streamHolding } = load("lib/media.ts");
  const { parseApplicantId } = load("lib/holdings.ts");
  const database = load("lib/db/index.ts").getDb();
  const applicantId = parseApplicantId(id);

  gets.length = 0;
  for (const [actorId, role] of [[editor, "editor"], [reviewer, "reviewer"]]) {
    const refused = await streamHolding(database, streamInput({ actorId, role, applicantId, slot: "document", holdingId: documentId }));
    assert.deepEqual(refused, { ok: false, status: 403 });
  }
  assert.equal(gets.length, 0);
  assert.equal(await eventCount("identity.document_opened"), 0);

  getImpl = async () => ({
    statusCode: 200,
    stream: new ReadableStream({ start(controller) { controller.enqueue(Buffer.from("passport-jpg")); controller.close(); } }),
    headers: new Headers(),
    blob: { url: "https://store.example.vercel-storage.com/hidden", pathname: "hidden", size: 12 },
  });
  const shown = await streamHolding(database, streamInput({ actorId: admin, role: "admin", applicantId, slot: "document", holdingId: documentId }));
  assert.equal(shown.ok, true);
  assert.equal(shown.bytes.status, 200);
  assert.equal(await textOf(shown.bytes.body), "passport-jpg");
  const events = await sql.query(`select actor_id, subject_id, kind, detail from admin_events where kind = 'identity.document_opened'`);
  assert.equal(events.rowCount, 1);
  assert.equal(events.rows[0].actor_id, admin);
  assert.equal(events.rows[0].subject_id, null);
  assert.deepEqual(events.rows[0].detail, { applicantId: id, documentId });
  assert.equal(Object.hasOwn(events.rows[0].detail, "email"), false);

  gets.length = 0;
  getImpl = async (_path, options) => {
    const [, start, end] = /bytes=(\d+)-(\d+)/.exec(options.headers.Range);
    return {
      statusCode: 206,
      stream: new ReadableStream({ start(controller) { controller.enqueue(Buffer.from("ab")); controller.close(); } }),
      headers: new Headers({ "content-range": `bytes ${start}-${end}/8000000` }),
      blob: { url: "https://store.example.vercel-storage.com/hidden", downloadUrl: "https://store.example.vercel-storage.com/dl", pathname, size: 2, contentType: "video/mp4" },
    };
  };
  const clip = (rangeHeader, method = "GET") => streamHolding(database, streamInput({
    actorId: reviewer, role: "reviewer", applicantId, slot: "answer", holdingId: "q-open", rangeHeader, method,
  }));
  const probe = await clip("bytes=0-1");
  assert.equal(probe.bytes.status, 206);
  assert.equal(probe.bytes.headers["Content-Range"], "bytes 0-1/8000000");
  assert.equal(probe.bytes.headers["Cache-Control"], "private, no-store");
  assert.deepEqual(gets[0], { pathname, access: "private", useCache: false, headers: { Range: "bytes=0-1" } });
  const packed = `${JSON.stringify(probe.bytes.headers)}\n${await textOf(probe.bytes.body)}`;
  assert.equal(packed.includes("vercel-storage.com"), false);
  assert.equal(packed.includes(pathname), false);
  assert.equal(await eventCount("answer.media_opened"), 0, "the two-byte probe is not a play");

  const play = await clip("bytes=0-");
  assert.equal(play.bytes.status, 206);
  assert.equal(play.bytes.headers["Content-Range"], "bytes 0-7999999/8000000");
  assert.equal(await eventCount("answer.media_opened"), 1);
  for (const range of ["bytes=4000000-", "bytes=65536-131071", "bytes=-500"]) {
    const chunk = await clip(range);
    assert.equal(chunk.bytes.status, 206);
  }
  assert.equal(await eventCount("answer.media_opened"), 1, "later range requests in the same play are not logged again");

  const calls = gets.length;
  const head = await clip("bytes=0-", "HEAD");
  assert.equal(head.bytes.status, 206);
  assert.equal(head.bytes.body, null);
  const unsatisfiable = await clip("bytes=0-1,2-3");
  assert.equal(unsatisfiable.bytes.status, 416);
  assert.equal(unsatisfiable.bytes.headers["Content-Range"], "bytes */8000000");
  assert.equal(gets.length, calls);
  assert.equal(await eventCount("answer.media_opened"), 1);

  const missing = await streamHolding(database, streamInput({ actorId: reviewer, role: "reviewer", applicantId, slot: "answer", holdingId: "q-none" }));
  assert.deepEqual(missing, { ok: false, status: 404 });
  const demoted = await streamHolding(database, streamInput({ actorId: admin, role: "editor", applicantId, slot: "document", holdingId: documentId }));
  assert.deepEqual(demoted, { ok: false, status: 403 });
  assert.equal(gets.length, calls);
});

test("a range the store ignores is sliced from the full object", async () => {
  const id = await applicant("ada-slice@example.org");
  await storedClip(id, "q-slice", 10);
  const reviewer = await staffUser("reviewer-slice@example.org", "reviewer");
  const { streamHolding } = load("lib/media.ts");
  const { parseApplicantId } = load("lib/holdings.ts");
  const database = load("lib/db/index.ts").getDb();
  getImpl = async () => ({
    statusCode: 200,
    stream: new ReadableStream({ start(controller) { controller.enqueue(Buffer.from("abcdefghij")); controller.close(); } }),
    headers: new Headers(),
    blob: { url: "https://store.example.vercel-storage.com/hidden", size: 10, pathname: "hidden" },
  });
  const streamed = await streamHolding(database, streamInput({
    actorId: reviewer, role: "reviewer", applicantId: parseApplicantId(id), slot: "answer", holdingId: "q-slice", rangeHeader: "bytes=2-4",
  }));
  assert.equal(streamed.bytes.status, 206);
  assert.equal(streamed.bytes.headers["Content-Range"], "bytes 2-4/10");
  assert.equal(await textOf(streamed.bytes.body), "cde");
});

test("a store failure stays a fixed unavailable response", async () => {
  const id = await applicant("ada-down@example.org");
  const pathname = await storedClip(id, "q-down", 4);
  const reviewer = await staffUser("reviewer-down@example.org", "reviewer");
  const { streamHolding } = load("lib/media.ts");
  const { parseApplicantId } = load("lib/holdings.ts");
  const database = load("lib/db/index.ts").getDb();
  getImpl = async () => { throw new Error(`missing ${pathname} https://store.example.vercel-storage.com/nope`); };
  const failed = await streamHolding(database, streamInput({
    actorId: reviewer, role: "reviewer", applicantId: parseApplicantId(id), slot: "answer", holdingId: "q-down",
  }));
  assert.deepEqual(failed, { ok: false, status: 502 });
});

test("the player has no src until pressed, then points at a token-free staff path", async () => {
  const hooks = hookHarness();
  const ui = loader({ react: hooks.react });
  const { PrivateMedia } = ui("components/admin/PrivateMedia.tsx");
  const applicantId = "11111111-1111-4111-8111-111111111111";
  const view = { kind: "clip", questionId: "q-video", position: 0, title: "Story", medium: "video", transcript: "hello", playback: "ready" };
  let tree = hooks.render(() => PrivateMedia({ applicantId, view }));
  assert.equal(nodes(tree).some((node) => node.type === "video" || node.props?.src), false);
  const button = nodes(tree).find((node) => node.props?.children === "Play video");
  assert.equal(button.props.onPlay, undefined);
  let fetched = 0;
  fetchHandler = async () => { fetched += 1; return new Response(null, { status: 500 }); };
  await button.props.onClick();
  tree = hooks.render(() => PrivateMedia({ applicantId, view }));
  const video = nodes(tree).find((node) => node.type === "video");
  assert.equal(video.props.src, undefined);
  const element = { dataset: {}, src: "", attrs: {}, setAttribute(name, value) { this.attrs[name] = value; } };
  video.props.ref(element);
  assert.equal(element.attrs.referrerpolicy, "no-referrer");
  assert.equal(element.src, `/admin/records/applicants/${applicantId}/media/answer/q-video`);
  assert.equal(fetched, 0, "no token is fetched first");

  const revealHooks = hookHarness();
  const revealUi = loader({ react: revealHooks.react });
  const reveal = () => revealHooks.render(() => revealUi("components/admin/PrivateMedia.tsx").DocumentReveal({
    applicantId,
    view: { documentId: "22222222-2222-4222-8222-222222222222", kind: "passport", contentType: "image/jpeg" },
  }));
  let shown = reveal();
  assert.equal(nodes(shown).some((node) => node.type === "img" || node.type === "iframe"), false);
  await nodes(shown).find((node) => node.props?.children === "Show document passport").props.onClick();
  shown = reveal();
  const img = nodes(shown).find((node) => node.type === "img");
  assert.equal(img.props.src, `/admin/records/applicants/${applicantId}/media/document/22222222-2222-4222-8222-222222222222`);
  assert.equal(img.props.referrerPolicy, "no-referrer");
});

test("staff media paths carry only record ids", () => {
  const { staffMediaPath } = load("lib/holdings.ts");
  const path = staffMediaPath("11111111-1111-4111-8111-111111111111", "answer", "q/../x?y");
  assert.equal(path, "/admin/records/applicants/11111111-1111-4111-8111-111111111111/media/answer/q%2F..%2Fx%3Fy");
});

test("the media route needs a staff session, refuses non-admins for documents, and streams ranges", async () => {
  const id = await applicant("ada-route@example.org");
  const pathname = await storedClip(id, "q-route", 8);
  const document = await sql.query(
    `insert into identity_documents (applicant_id, kind, pathname, content_type, size) values ($1, 'passport', $2, 'application/pdf', 4) returning id`,
    [id, `identity/${id}/passport-route.pdf`],
  );
  const documentId = document.rows[0].id;
  const reviewer = await staffUser("reviewer-route@example.org", "reviewer");
  const admin = await staffUser("admin-route@example.org", "admin");
  const { hashToken } = load("lib/access.ts");
  const sessions = { reviewer: "route-session-reviewer", admin: "route-session-admin" };
  await sql.query(`insert into user_sessions (hash, user_id, expires_at) values ($1, $2, now() + interval '1 hour')`, [hashToken(sessions.reviewer), reviewer]);
  await sql.query(`insert into user_sessions (hash, user_id, expires_at) values ($1, $2, now() + interval '1 hour')`, [hashToken(sessions.admin), admin]);
  let cookie = null;
  const reads = [];
  const routeLoad = loader({
    "@vercel/blob": {
      put: async () => ({ url: "https://store.example.vercel-storage.com/hidden" }),
      get: async (got, options) => {
        assert.equal(options.access, "private");
        assert.equal(options.useCache, false);
        reads.push({ got, range: options.headers?.Range ?? null });
        const body = got === pathname ? "ab" : "%PDF";
        return {
          statusCode: 200,
          stream: new ReadableStream({ start(controller) { controller.enqueue(Buffer.from(body)); controller.close(); } }),
          headers: new Headers(got === pathname ? { "content-range": "bytes 0-1/8" } : {}),
          blob: { url: "https://store.example.vercel-storage.com/hidden", pathname: got, size: body.length },
        };
      },
      del: async () => {},
      head: async () => { throw new Error("head was not expected"); },
    },
    "next/headers": {
      cookies: async () => ({ get: (name) => (name === "crp_staff" && cookie ? { value: cookie } : undefined) }),
    },
  });
  const route = routeLoad("app/admin/(console)/records/applicants/[id]/media/[slot]/[holdingId]/route.ts");
  const call = (slot, holdingId, headers = {}, method = "GET") => route[method]({
    headers: new Headers({ "sec-fetch-site": "same-origin", ...headers }),
    signal: AbortSignal.timeout(1000),
  }, { params: Promise.resolve({ id, slot, holdingId }) });
  const privateHeaders = (response) => {
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    assert.equal(response.headers.get("referrer-policy"), "no-referrer");
  };

  const anonymous = await call("answer", "q-route", { range: "bytes=0-1" });
  assert.equal(anonymous.status, 401);
  privateHeaders(anonymous);
  const anonymousDocument = await call("document", documentId);
  assert.equal(anonymousDocument.status, 401);
  cookie = "not-a-session";
  assert.equal((await call("answer", "q-route")).status, 401);
  assert.equal(reads.length, 0);

  cookie = sessions.reviewer;
  const crossSite = await call("answer", "q-route", { "sec-fetch-site": "cross-site", range: "bytes=0-1" });
  assert.equal(crossSite.status, 403);
  privateHeaders(crossSite);
  const refusedDocument = await call("document", documentId);
  assert.equal(refusedDocument.status, 403);
  privateHeaders(refusedDocument);
  assert.equal(reads.length, 0);
  assert.equal((await call("other", "q-route")).status, 404);

  const before = await eventCount("answer.media_opened");
  const streamed = await call("answer", "q-route", { range: "bytes=0-1" });
  assert.equal(streamed.status, 206);
  privateHeaders(streamed);
  assert.equal(streamed.headers.get("accept-ranges"), "bytes");
  assert.equal(streamed.headers.get("content-range"), "bytes 0-1/8");
  const bytes = Buffer.from(await streamed.arrayBuffer()).toString();
  assert.equal(bytes, "ab");
  const headerText = [...streamed.headers.entries()].map(([key, value]) => `${key}:${value}`).join("\n");
  assert.equal(`${headerText}\n${bytes}`.includes("vercel-storage.com"), false);
  assert.equal(`${headerText}\n${bytes}`.includes(pathname), false);
  assert.deepEqual(reads.at(-1), { got: pathname, range: "bytes=0-1" });
  const play = await call("answer", "q-route", { range: "bytes=0-" });
  assert.equal(play.status, 206);
  await play.arrayBuffer();
  assert.equal(await eventCount("answer.media_opened"), before + 1);

  cookie = sessions.admin;
  const documentBefore = await eventCount("identity.document_opened");
  const opened = await call("document", documentId);
  assert.equal(opened.status, 200);
  privateHeaders(opened);
  assert.equal(Buffer.from(await opened.arrayBuffer()).toString(), "%PDF");
  assert.equal(await eventCount("identity.document_opened"), documentBefore + 1);

  cookie = null;
  const signedOut = await call("answer", "q-route", { range: "bytes=0-1" });
  assert.equal(signedOut.status, 401);
  await routeLoad("lib/db/index.ts").closeDb();
});

test("no admin route or media url carries a token segment", async () => {
  const fs = await import("node:fs");
  const path = await import("node:path");
  const found = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name === "route.ts") found.push(full);
    }
  };
  walk("app/admin");
  assert.equal(found.some((file) => /\[token\]|\/open\//.test(file)), false, found.join("\n"));
  const component = fs.readFileSync("components/admin/PrivateMedia.tsx", "utf8");
  assert.doesNotMatch(component, /token|\/open|\/stream\//i);
});

test("retention counts in a dry run, deletes at most 20, and a later run finds nothing", async () => {
  const { retainPrivateMedia } = load("lib/media.ts");
  const { readMediaEnv } = load("lib/holdings.ts");
  const { tick } = load("lib/worker.ts");
  const database = load("lib/db/index.ts").getDb();
  const id = await applicant("ada-retain@example.org");
  const before = Number((await sql.query(`select count(*)::int as n from videoask_answers where pathname is not null`)).rows[0].n);
  for (let i = 0; i < 21; i++) {
    const questionId = `q${String(i).padStart(2, "0")}`;
    await sql.query(
      `insert into videoask_answers (
        applicant_id, question_id, answer_id, position, title, medium, transcript, pathname, content_type, byte_size, copied_at
      ) values ($1, $2, $2, $3, 'Story', 'video', 'kept words', $4, 'video/mp4', 4, now())`,
      [id, questionId, i, `videoask/${id}/${questionId}.mp4`],
    );
  }
  const total = before + 21;
  const dry = await retainPrivateMedia(database, new Date(), readMediaEnv({ PROGRAM_END: "2020-01-01", MEDIA_RETENTION_DRY_RUN: "False" }));
  assert.equal(dry.mode, "dry_run");
  assert.equal(dry.answers, total);
  assert.equal(dels.length, 0);
  const kept = await sql.query(`select count(*)::int as n from videoask_answers where applicant_id = $1 and pathname is not null`, [id]);
  assert.equal(kept.rows[0].n, 21);
  const skipped = await retainPrivateMedia(database, new Date(), readMediaEnv({ MEDIA_RETENTION_DRY_RUN: "false" }));
  assert.equal(skipped.mode, "skip");
  const waiting = await retainPrivateMedia(database, new Date(), readMediaEnv({ PROGRAM_END: "2999-01-01", MEDIA_RETENTION_DRY_RUN: "false" }));
  assert.equal(waiting.mode, "wait");

  const liveEnv = readMediaEnv({ PROGRAM_END: "2020-01-01", MEDIA_RETENTION_DAYS: "30", MEDIA_RETENTION_DRY_RUN: "false" });
  const first = await retainPrivateMedia(database, new Date(), liveEnv);
  assert.equal(first.mode, "delete");
  assert.equal(first.answers, 20);
  const left = Number((await sql.query(`select count(*)::int as n from videoask_answers where pathname is not null`)).rows[0].n);
  assert.equal(left, total - 20);
  const words = await sql.query(`select count(*)::int as n from videoask_answers where applicant_id = $1 and transcript = 'kept words'`, [id]);
  assert.equal(words.rows[0].n, 21);
  let guard = 0;
  while (Number((await sql.query(`select count(*)::int as n from videoask_answers where pathname is not null`)).rows[0].n) > 0) {
    const report = await retainPrivateMedia(database, new Date(), liveEnv);
    assert.equal(report.answers > 0, true);
    guard += 1;
    assert.equal(guard < 10, true);
  }
  const idle = await retainPrivateMedia(database, new Date(), liveEnv);
  assert.equal(idle.answers, 0);

  const docPath = `identity/${id}/passport-0.jpg`;
  const document = await sql.query(
    `insert into identity_documents (applicant_id, kind, pathname, content_type, size) values ($1, 'passport', $2, 'image/jpeg', 9) returning id`,
    [id, docPath],
  );
  const documentId = document.rows[0].id;
  missingBlobs.add(docPath);
  let docGuard = 0;
  while (Number((await sql.query(`select count(*)::int as n from identity_documents where id = $1`, [documentId])).rows[0].n) > 0) {
    await retainPrivateMedia(database, new Date(), liveEnv);
    docGuard += 1;
    assert.equal(docGuard < 10, true);
  }
  const gone = await sql.query(`select count(*)::int as n from identity_documents where id = $1`, [documentId]);
  assert.equal(gone.rows[0].n, 0);
  const change = await sql.query(`select payload from sync_changes where table_name = 'applicants' and record_id = $1 order by revision desc limit 1`, [id]);
  const packed = JSON.stringify(change.rows[0].payload);
  assert.equal(packed.includes(documentId), false);
  assert.equal(packed.includes(docPath), false);
  assert.equal(dels.includes(docPath), true);
  let drain = 0;
  while (Number((await sql.query(`select count(*)::int as n from identity_documents`)).rows[0].n) > 0) {
    const report = await retainPrivateMedia(database, new Date(), liveEnv);
    assert.equal(report.documents > 0, true);
    drain += 1;
    assert.equal(drain < 10, true);
  }
  const again = await retainPrivateMedia(database, new Date(), liveEnv);
  assert.equal(again.answers, 0);
  assert.equal(again.documents, 0);

  const survivor = `videoask/${id}/q-left.mp4`;
  await sql.query(
    `insert into videoask_answers (
      applicant_id, question_id, answer_id, position, title, medium, transcript, pathname, content_type, byte_size, copied_at
    ) values ($1, 'q-left', 'a-left', 0, 'Story', 'video', 'kept words', $2, 'video/mp4', 4, now())`,
    [id, survivor],
  );
  delExplodes = true;
  const previous = process.env.PROGRAM_END;
  const previousRun = process.env.MEDIA_RETENTION_DRY_RUN;
  process.env.PROGRAM_END = "2020-01-01";
  process.env.MEDIA_RETENTION_DRY_RUN = "false";
  try {
    const summary = await tick(1);
    assert.equal(summary.mediaRetention.mode, "error");
    assert.equal(summary.mediaRetention.answers, 0);
    assert.equal(JSON.stringify(summary).includes("vercel-storage.com"), false);
    assert.equal(JSON.stringify(summary).includes(survivor), false);
  } finally {
    delExplodes = false;
    if (previous === undefined) delete process.env.PROGRAM_END;
    else process.env.PROGRAM_END = previous;
    if (previousRun === undefined) delete process.env.MEDIA_RETENTION_DRY_RUN;
    else process.env.MEDIA_RETENTION_DRY_RUN = previousRun;
  }
  const still = await sql.query(`select transcript, pathname from videoask_answers where applicant_id = $1 and question_id = 'q-left'`, [id]);
  assert.equal(still.rows[0].pathname, survivor);
  assert.equal(still.rows[0].transcript, "kept words");
});

test("a public identity blob is copied aside and the public url is the only delete", async () => {
  const { classifyIdentityBlob, copyIdentityBlobPrivate } = load("lib/media.ts");
  const pathname = "identity/00000000-0000-4000-8000-000000000001/passport-0.jpg";
  const publicUrl = `https://store.public.blob.vercel-storage.com/${pathname}`;
  const privateUrl = `https://store.private.blob.vercel-storage.com/${pathname}`;
  headImpl = async () => { throw new Error("missing"); };
  assert.equal(await classifyIdentityBlob(pathname), "missing");
  headImpl = async () => ({ url: privateUrl, contentType: "image/jpeg", pathname, size: 4 });
  assert.equal(await classifyIdentityBlob(pathname), "private");
  const beforeDel = dels.length;
  assert.equal(await copyIdentityBlobPrivate(pathname), false);
  assert.equal(dels.length, beforeDel);

  let heads = 0;
  headImpl = async () => {
    heads += 1;
    if (heads === 1) return { url: publicUrl, contentType: "image/jpeg", pathname, size: 4 };
    return { url: publicUrl, contentType: "image/jpeg", pathname, size: 4 };
  };
  getImpl = async () => ({
    stream: new ReadableStream({ start(controller) { controller.enqueue(Buffer.from("jpeg")); controller.close(); } }),
    headers: new Headers(),
  });
  assert.equal(await classifyIdentityBlob(pathname), "public");
  heads = 0;
  const replaced = await copyIdentityBlobPrivate(pathname);
  assert.equal(replaced, false);
  assert.equal(dels.length, beforeDel);
  assert.equal(puts.at(-1).access, "private");
  assert.equal(puts.at(-1).pathname, pathname);

  heads = 0;
  headImpl = async () => {
    heads += 1;
    if (heads === 1) return { url: publicUrl, contentType: "image/jpeg", pathname, size: 4 };
    return { url: privateUrl, contentType: "image/jpeg", pathname, size: 4 };
  };
  const copied = await copyIdentityBlobPrivate(pathname);
  assert.equal(copied, true);
  assert.equal(dels.at(-1), publicUrl);
  assert.equal(dels.includes(pathname), false);
  headImpl = async () => { throw new Error("head was not expected"); };
  getImpl = async () => { throw new Error("get was not expected"); };
});

