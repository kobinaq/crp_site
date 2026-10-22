import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import pg from "pg";
import { loader } from "./helpers.mjs";
import { startDatabase } from "./db.mjs";

const puts = [];
let fetchHandler = async () => new Response(null, { status: 500 });
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
      get: async () => { throw new Error("get was not expected"); },
      del: async () => {},
      head: async () => { throw new Error("head was not expected"); },
    },
  });
  realFetch = global.fetch;
  global.fetch = (url, init) => fetchHandler(url, init);
});

after(async () => {
  global.fetch = realFetch;
  try { await load("lib/db/index.ts").closeDb(); } catch { /* pool may already be closed */ }
  try { await sql.end(); } catch { /* ignore */ }
  try { await db.stop(); } catch { /* ignore */ }
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
