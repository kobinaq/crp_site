import assert from "node:assert/strict";
import fs from "node:fs";
import test, { after, before } from "node:test";
import pg from "pg";
import { loader } from "./helpers.mjs";
import { startDatabase } from "./db.mjs";

const APPLICANT = "11111111-1111-4111-8111-111111111111";
const SHARE = "https://share.example/do-not-keep";

function completionBody() {
  return {
    event_id: "evt-1",
    event_type: "form_response",
    form: {
      form_id: "form-1",
      questions: [
        { question_id: "q-poll", metadata: { text: "Track" } },
        { question_id: "q-text", label: "Name" },
        { question_id: "q-video", label: "Story" },
        { question_id: "q-audio", label: "Voice" },
        { question_id: "q-skip", label: "" },
      ],
    },
    contact: {
      status: "completed",
      answers: [
        { answer_id: "a-video-old", question_id: "q-video", type: "video", media_url: "https://media.videoask.com/old.mp4", transcription: "stale" },
        { answer_id: "a-text", question_id: "q-text", type: "text", input_text: "Nia", share_url: SHARE },
        { answer_id: "a-poll", question_id: "q-poll", type: "poll", poll_option_content: "In person", share_id: "share-1" },
        {
          answer_id: "a-video",
          question_id: "q-video",
          type: "video",
          media_url: "  https://media.videoask.com/clip.mp4",
          transcription: null,
          thumbnail: "https://thumb.example/a.jpg",
          transcription_data: { words: ["hidden"] },
        },
        { answer_id: "a-audio", question_id: "q-audio", type: "audio", media_url: "https://cdn.example/nope.mp3", transcription: "spoken" },
        { answer_id: "a-empty", question_id: "q-skip", type: "text", input_text: "no title" },
      ],
      messages: [{ text: "hidden message" }],
    },
  };
}

test("named VideoAsk fields become answers in form order", () => {
  const { parseApplicantId, parseVideoaskHoldings } = loader()("lib/holdings.ts");
  const applicantId = parseApplicantId(APPLICANT);
  const answers = parseVideoaskHoldings(completionBody(), applicantId);
  assert.deepEqual(answers.map((answer) => answer.questionId), ["q-poll", "q-text", "q-video", "q-audio"]);
  assert.deepEqual(answers.map((answer) => answer.position), [0, 1, 2, 3]);
  assert.equal(answers[1].body.medium, "text");
  assert.equal(answers[1].body.text, "Nia");
  assert.equal(answers[0].body.medium, "poll");
  assert.equal(answers[0].body.label, "In person");
  const video = answers[2];
  assert.equal(video.body.medium, "video");
  assert.equal(video.body.transcript, null);
  assert.equal(video.body.file.phase, "pending");
  assert.equal(video.body.file.sourceUrl, "https://media.videoask.com/clip.mp4");
  assert.equal(answers[3].body.file.phase, "words_only");
  assert.equal(answers[3].body.transcript, "spoken");
  const packed = JSON.stringify(answers);
  assert.equal(packed.includes(SHARE), false);
  assert.equal(packed.includes("share_url"), false);
  assert.equal(packed.includes("cdn.example"), false);
  assert.equal(packed.includes("thumb.example"), false);
  assert.equal(packed.includes("transcription_data"), false);
  assert.equal(packed.includes("hidden message"), false);
});

test("a video with a media url and a null transcript is a legal answer row", async () => {
  const holdings = loader()("lib/holdings.ts");
  const applicantId = holdings.parseApplicantId(APPLICANT);
  const [video] = holdings.parseVideoaskHoldings(completionBody(), applicantId).filter((answer) => answer.questionId === "q-video");
  const row = holdings.answerInsert(holdings.mergeAnswer(null, video));
  assert.equal(row.medium, "video");
  assert.equal(row.transcript, null);
  assert.equal(row.textBody, null);
  assert.equal(row.sourceUrl, "https://media.videoask.com/clip.mp4");
  assert.equal(row.pathname, null);
  assert.equal(row.copiedAt, null);
  const inserted = await sql.query(
    `insert into videoask_answers (
      applicant_id, question_id, answer_id, position, title, medium, text_body, transcript, source_url, pathname, content_type, byte_size, copied_at
    ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) returning transcript, source_url, pathname`,
    [row.applicantId, row.questionId, row.answerId, row.position, row.title, row.medium, row.textBody, row.transcript, row.sourceUrl, row.pathname, row.contentType, row.byteSize, row.copiedAt],
  );
  assert.equal(inserted.rows[0].transcript, null);
  assert.equal(inserted.rows[0].source_url, "https://media.videoask.com/clip.mp4");
  assert.equal(inserted.rows[0].pathname, null);
  await assert.rejects(sql.query(
    `insert into videoask_answers (
      applicant_id, question_id, answer_id, position, title, medium, text_body, transcript
    ) values ($1, 'q-text', 'a-text', 1, 'Name', 'text', 'Nia', 'should not')`,
    [APPLICANT],
  ));
  await assert.rejects(sql.query(
    `insert into videoask_answers (
      applicant_id, question_id, answer_id, position, title, medium, transcript, source_url, pathname, content_type, byte_size, copied_at
    ) values ($1, 'q-both', 'a-both', 0, 'Both', 'video', null, 'https://media.videoask.com/a.mp4', $2, 'video/mp4', 4, now())`,
    [APPLICANT, `videoask/${APPLICANT}/q-both.mp4`],
  ));
});

test("a later transcript fills the same answer and a null transcript leaves the stored words", () => {
  const holdings = loader()("lib/holdings.ts");
  const applicantId = holdings.parseApplicantId(APPLICANT);
  const questionId = holdings.parseQuestionId("q-video");
  const pathname = holdings.videoaskPathname(applicantId, questionId, "video/mp4");
  const stored = {
    slot: "answer",
    applicantId,
    questionId,
    answerId: "a-old",
    position: 2,
    title: "Story",
    body: {
      medium: "video",
      transcript: "kept words",
      file: { phase: "stored", object: { pathname, contentType: "video/mp4", byteSize: 12 } },
    },
  };
  const incoming = {
    slot: "answer",
    applicantId,
    questionId,
    answerId: "a-new",
    position: 2,
    title: "Story retitled",
    body: {
      medium: "video",
      transcript: "fresh words",
      file: { phase: "pending", sourceUrl: holdings.parseVideoAskMediaUrl("https://media.videoask.com/next.mp4") },
    },
  };
  const merged = holdings.mergeAnswer(stored, incoming);
  assert.equal(merged.body.file.phase, "stored");
  assert.equal(merged.body.file.object.pathname, pathname);
  assert.equal(merged.body.transcript, "fresh words");
  assert.equal(merged.title, "Story retitled");
  assert.equal(JSON.stringify(merged).includes("next.mp4"), false);
  const cleared = holdings.mergeAnswer(merged, { ...incoming, body: { ...incoming.body, transcript: null } });
  assert.equal(cleared.body.transcript, "fresh words");
  assert.equal(cleared.body.file.phase, "stored");
  const blank = holdings.mergeAnswer(stored, { ...incoming, body: { ...incoming.body, transcript: "  " } });
  assert.equal(blank.body.transcript, "kept words");
  const other = holdings.mergeAnswer(stored, { ...incoming, questionId: holdings.parseQuestionId("q-audio"), body: { medium: "audio", transcript: "no", file: { phase: "words_only" } } });
  assert.equal(other.body.transcript, "kept words");
  assert.equal(other.body.file.phase, "stored");
});

test("a pending clip keeps its url when a later event has only words, and words gain a url", () => {
  const holdings = loader()("lib/holdings.ts");
  const applicantId = holdings.parseApplicantId(APPLICANT);
  const questionId = holdings.parseQuestionId("q-video");
  const pending = {
    slot: "answer",
    applicantId,
    questionId,
    answerId: "a1",
    position: 0,
    title: "Story",
    body: {
      medium: "video",
      transcript: null,
      file: { phase: "pending", sourceUrl: holdings.parseVideoAskMediaUrl("https://media.videoask.com/clip.mp4") },
    },
  };
  const words = {
    ...pending,
    body: { medium: "video", transcript: "now words", file: { phase: "words_only" } },
  };
  const kept = holdings.mergeAnswer(pending, words);
  assert.equal(kept.body.file.phase, "pending");
  assert.equal(kept.body.file.sourceUrl, "https://media.videoask.com/clip.mp4");
  assert.equal(kept.body.transcript, "now words");
  const gained = holdings.mergeAnswer(words, pending);
  assert.equal(gained.body.file.phase, "pending");
  assert.equal(gained.body.transcript, "now words");
});

test("a stored answer cannot be replayed as an incoming file", () => {
  const { readStoredAnswers, parseApplicantId } = loader()("lib/holdings.ts");
  const applicantId = parseApplicantId(APPLICANT);
  const answers = readStoredAnswers([
    {
      slot: "answer",
      applicantId,
      questionId: "q-video",
      answerId: "a1",
      position: 0,
      title: "Story",
      body: { medium: "video", transcript: null, file: { phase: "stored", object: { pathname: "videoask/x", contentType: "video/mp4", byteSize: 1 } } },
    },
    {
      slot: "answer",
      applicantId,
      questionId: "q-text",
      answerId: "a2",
      position: 1,
      title: "Name",
      body: { medium: "text", text: "Nia" },
    },
  ]);
  assert.equal(answers.length, 1);
  assert.equal(answers[0].questionId, "q-text");
});

test("byte ranges are one inclusive span", () => {
  const { readRangeHeader, streamHeaders } = loader()("lib/holdings.ts");
  assert.deepEqual(readRangeHeader(null, 8000000), { kind: "full" });
  assert.deepEqual(readRangeHeader("bytes=0-1,2-3", 8000000), { kind: "unsatisfiable" });
  assert.deepEqual(readRangeHeader("bytes=9000000-9000001", 8000000), { kind: "unsatisfiable" });
  assert.deepEqual(readRangeHeader("bytes=-500", 8000000), { kind: "partial", range: { start: 7999500, end: 7999999 } });
  assert.deepEqual(readRangeHeader("bytes=1000-", 8000000), { kind: "partial", range: { start: 1000, end: 7999999 } });
  const probe = streamHeaders("video/mp4", 8000000, readRangeHeader("bytes=0-1", 8000000));
  assert.equal(probe.status, 206);
  assert.equal(probe.headers["Content-Range"], "bytes 0-1/8000000");
  assert.equal(probe.headers["Content-Length"], "2");
  assert.equal(probe.headers["Cache-Control"], "private, no-store");
  const full = streamHeaders("video/mp4", 8000000, readRangeHeader(null, 8000000));
  assert.equal(full.status, 200);
  assert.equal(full.headers["Content-Range"], undefined);
  assert.equal(full.headers["Content-Length"], "8000000");
  const rejected = streamHeaders("video/mp4", 8000000, readRangeHeader("bytes=0-1,2-3", 8000000));
  assert.equal(rejected.status, 416);
  assert.equal(rejected.headers["Content-Range"], "bytes */8000000");
});

test("the videoask answers migration is journal entry 18", () => {
  const journal = JSON.parse(fs.readFileSync("drizzle/meta/_journal.json", "utf8"));
  const entry = journal.entries.find((row) => row.idx === 18);
  assert.equal(entry.tag, "0018_videoask_answers");
  assert.equal(entry.when, 1793400000000);
  assert.equal(entry.breakpoints, true);
  const sqlText = fs.readFileSync("drizzle/0018_videoask_answers.sql", "utf8");
  assert.equal(sqlText.includes("--> statement-breakpoint"), true);
  assert.equal(sqlText.includes("IF NOT EXISTS"), true);
});

let db;
let sql;

before(async () => {
  db = await startDatabase();
  sql = new pg.Client({ connectionString: db.url });
  await sql.connect();
  await sql.query(
    `insert into applicants (id, full_name, email, dob, age, track) values ($1, 'Nia Tester', 'nia-holdings@example.org', '1990-01-02', 36, 'in_person')`,
    [APPLICANT],
  );
});

after(async () => {
  try { await sql.end(); } catch { /* ignore */ }
  try { await db.stop(); } catch { /* ignore */ }
});
