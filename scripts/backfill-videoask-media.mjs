import fs from "node:fs";
import { and, isNotNull, isNull } from "drizzle-orm";
import { loader } from "../tests/helpers.mjs";

const args = process.argv.slice(2);
const write = args.includes("--write");
const file = args.find((arg) => !arg.startsWith("-"));

console.log("Historical webhook_events rows have no media URL. This script does not invent URLs. Pass a JSON file of redelivered payloads as the last argument to copy those responses.");

const load = loader();
const { copyVideoaskMedia, saveAnswers } = load("lib/media.ts");
const { readVideoaskCompletion } = load("lib/videoask.ts");
const { getDb, videoaskAnswers } = load("lib/db/index.ts");
const { parseApplicantId, parseQuestionId } = load("lib/holdings.ts");
const { lockApplicant } = load("lib/lifecycle.ts");
const db = getDb();

if (file) {
  const bodies = JSON.parse(fs.readFileSync(file, "utf8"));
  if (!Array.isArray(bodies)) throw new Error("payload file must be a JSON array");
  let completions = 0;
  let skipped = 0;
  for (const body of bodies) {
    const completion = readVideoaskCompletion(body);
    if (!completion || "ignored" in completion) {
      skipped += 1;
      continue;
    }
    const applicantId = parseApplicantId(completion.applicantId);
    if (!applicantId) {
      skipped += 1;
      continue;
    }
    completions += 1;
    if (!write) continue;
    await db.transaction(async (tx) => {
      await lockApplicant(tx, applicantId);
      await saveAnswers(tx, applicantId, completion.answers);
    });
  }
  console.log(`completions ${completions}`);
  console.log(`skipped ${skipped}`);
}

const pending = await db
  .select({ applicantId: videoaskAnswers.applicantId, questionId: videoaskAnswers.questionId })
  .from(videoaskAnswers)
  .where(and(isNotNull(videoaskAnswers.sourceUrl), isNull(videoaskAnswers.pathname)));
console.log(`pending ${pending.length}`);
for (const row of pending) {
  console.log(`${row.applicantId} ${row.questionId}`);
  if (!write) continue;
  const applicantId = parseApplicantId(row.applicantId);
  const questionId = parseQuestionId(row.questionId);
  if (!applicantId || !questionId) continue;
  await copyVideoaskMedia(db, applicantId, questionId);
}
