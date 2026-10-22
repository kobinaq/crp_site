import { and, eq, isNull } from "drizzle-orm";
import { put } from "@vercel/blob";
import { videoaskAnswers, type Db, type Store, type VideoaskAnswer } from "@/lib/db";
import {
  MEDIA_BYTE_CAP,
  answerInsert,
  clipStorage,
  mergeAnswer,
  parseApplicantId,
  parseQuestionId,
  parseVideoAskMediaUrl,
  videoaskPathname,
  type AnswerHolding,
  type ApplicantId,
  type IncomingAnswer,
  type PrivatePathname,
  type QuestionId,
} from "@/lib/holdings";
import { enqueue, type JobOutcome } from "@/lib/jobs";
import { lockApplicant } from "@/lib/lifecycle";

const REDIRECT_HOPS = 2;

function holdingFromAnswerRow(row: VideoaskAnswer): AnswerHolding | null {
  const applicantId = parseApplicantId(row.applicantId);
  const questionId = parseQuestionId(row.questionId);
  if (!applicantId || !questionId) return null;
  const shared = {
    slot: "answer" as const,
    applicantId,
    questionId,
    answerId: row.answerId,
    position: row.position,
    title: row.title,
  };
  if (row.medium === "text" || row.medium === "poll") {
    if (row.textBody == null || row.transcript != null) return null;
    return row.medium === "text"
      ? { ...shared, body: { medium: "text", text: row.textBody } }
      : { ...shared, body: { medium: "poll", label: row.textBody } };
  }
  if (row.medium !== "video" && row.medium !== "audio") return null;
  if (row.textBody != null) return null;
  if (row.pathname) {
    if (row.sourceUrl || !row.contentType || row.byteSize == null || row.byteSize < 0 || !row.copiedAt) return null;
    return {
      ...shared,
      body: {
        medium: row.medium,
        transcript: row.transcript,
        file: {
          phase: "stored",
          object: { pathname: row.pathname as PrivatePathname, contentType: row.contentType, byteSize: row.byteSize },
        },
      },
    };
  }
  if (row.contentType || row.byteSize != null || row.copiedAt) return null;
  if (row.sourceUrl) {
    const sourceUrl = parseVideoAskMediaUrl(row.sourceUrl);
    if (!sourceUrl) return null;
    return { ...shared, body: { medium: row.medium, transcript: row.transcript, file: { phase: "pending", sourceUrl } } };
  }
  return { ...shared, body: { medium: row.medium, transcript: row.transcript, file: { phase: "words_only" } } };
}

export async function saveAnswers(tx: Store, applicantId: ApplicantId, incoming: readonly IncomingAnswer[]): Promise<void> {
  for (const item of incoming) {
    if (item.applicantId !== applicantId) continue;
    const [row] = await tx
      .select()
      .from(videoaskAnswers)
      .where(and(eq(videoaskAnswers.applicantId, applicantId), eq(videoaskAnswers.questionId, item.questionId)));
    const stored = row ? holdingFromAnswerRow(row) : null;
    const merged = mergeAnswer(stored, item);
    const copiedAt = merged.body.medium !== "text" && merged.body.medium !== "poll" && merged.body.file.phase === "stored"
      ? row?.copiedAt ?? new Date()
      : null;
    const values = answerInsert(merged, copiedAt);
    await tx
      .insert(videoaskAnswers)
      .values(values)
      .onConflictDoUpdate({
        target: [videoaskAnswers.applicantId, videoaskAnswers.questionId],
        set: {
          answerId: values.answerId,
          position: values.position,
          title: values.title,
          medium: values.medium,
          textBody: values.textBody,
          transcript: values.transcript,
          sourceUrl: values.sourceUrl,
          pathname: values.pathname,
          contentType: values.contentType,
          byteSize: values.byteSize,
          copiedAt: values.copiedAt,
        },
      });
    const pending = merged.body.medium !== "text" && merged.body.medium !== "poll" && merged.body.file.phase === "pending";
    if (!pending) continue;
    await enqueue(tx, {
      kind: "videoask_media",
      dedupeKey: `videoask_media:${applicantId}:${item.questionId}`,
      applicantId,
      payload: { applicantId, questionId: item.questionId },
    });
  }
}

type Download = { readonly ok: true; readonly response: Response } | { readonly ok: false; readonly outcome: JobOutcome };

async function fetchMedia(sourceUrl: string, signal: AbortSignal): Promise<Download> {
  let current = sourceUrl;
  for (let hop = 0; hop <= REDIRECT_HOPS; hop++) {
    let response: Response;
    try {
      response = await fetch(current, { redirect: "manual", signal });
    } catch {
      return { ok: false, outcome: { status: "retry", error: "media download failed" } };
    }
    if (response.status < 300 || response.status >= 400) return { ok: true, response };
    await response.body?.cancel();
    // A redirect off media.videoask.com would make the worker fetch an arbitrary host.
    const next = parseVideoAskMediaUrl(response.headers.get("location"));
    if (!next || hop === REDIRECT_HOPS) return { ok: false, outcome: { status: "failed", error: "media redirect was refused" } };
    current = next;
  }
  return { ok: false, outcome: { status: "failed", error: "media redirect was refused" } };
}

async function readCapped(response: Response): Promise<Buffer | "too large" | "retry"> {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MEDIA_BYTE_CAP) return "too large";
  if (!response.body) return Buffer.alloc(0);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MEDIA_BYTE_CAP) {
        await reader.cancel();
        return "too large";
      }
      chunks.push(value);
    }
  } catch {
    return "retry";
  }
  return Buffer.concat(chunks);
}

export async function copyVideoaskMedia(db: Db, applicantId: ApplicantId, questionId: QuestionId): Promise<JobOutcome> {
  const [row] = await db
    .select()
    .from(videoaskAnswers)
    .where(and(eq(videoaskAnswers.applicantId, applicantId), eq(videoaskAnswers.questionId, questionId)));
  const holding = row ? holdingFromAnswerRow(row) : null;
  if (!holding || holding.body.medium === "text" || holding.body.medium === "poll") {
    return { status: "failed", error: "videoask answer is missing" };
  }
  if (holding.body.file.phase === "stored") return { status: "done", deliveryStatus: "stored" };
  if (holding.body.file.phase !== "pending") return { status: "done", deliveryStatus: "words only" };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const downloaded = await fetchMedia(holding.body.file.sourceUrl, controller.signal);
    if (!downloaded.ok) return downloaded.outcome;
    const response = downloaded.response;
    if (response.status === 404 || response.status === 410) {
      await db
        .update(videoaskAnswers)
        .set({ sourceUrl: null })
        .where(and(eq(videoaskAnswers.applicantId, applicantId), eq(videoaskAnswers.questionId, questionId), isNull(videoaskAnswers.pathname)));
      return { status: "done", deliveryStatus: "words only" };
    }
    if (response.status === 408 || response.status === 429 || response.status >= 500) {
      return { status: "retry", error: "media download failed" };
    }
    if (!response.ok) return { status: "failed", error: `media download failed: ${response.status}` };
    const body = await readCapped(response);
    if (body === "too large") return { status: "failed", error: "media too large" };
    if (body === "retry") return { status: "retry", error: "media download failed" };
    const stored = clipStorage(response.headers.get("content-type") ?? "");
    const pathname = videoaskPathname(applicantId, questionId, stored.contentType);
    try {
      await put(pathname, body, { access: "private", contentType: stored.contentType, allowOverwrite: true });
    } catch {
      return { status: "retry", error: "media store failed" };
    }
    await db.transaction(async (tx) => {
      await lockApplicant(tx, applicantId);
      await tx
        .update(videoaskAnswers)
        .set({ pathname, contentType: stored.contentType, byteSize: body.byteLength, copiedAt: new Date(), sourceUrl: null })
        .where(and(eq(videoaskAnswers.applicantId, applicantId), eq(videoaskAnswers.questionId, questionId), isNull(videoaskAnswers.pathname)));
    });
    return { status: "done", deliveryStatus: "stored" };
  } finally {
    clearTimeout(timer);
  }
}
