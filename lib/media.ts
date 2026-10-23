import { and, asc, count, eq, isNotNull, isNull } from "drizzle-orm";
import { del, get, head, put } from "@vercel/blob";
import { recordEvent } from "@/lib/admin/events";
import { applicants, identityDocuments, videoaskAnswers, type Db, type IdentityDocument, type Store, type VideoaskAnswer } from "@/lib/db";
import {
  MEDIA_BYTE_CAP,
  RETENTION_BATCH,
  answerInsert,
  clipStorage,
  opensHolding,
  mergeAnswer,
  parseApplicantId,
  parseDocumentId,
  parseQuestionId,
  parseVideoAskMediaUrl,
  presentAnswer,
  presentDocument,
  readRangeHeader,
  retentionPlan,
  storedObject,
  streamHeaders,
  videoaskPathname,
  type AnswerHolding,
  type AnswerView,
  type ApplicantId,
  type DocumentHolding,
  type DocumentView,
  type Holding,
  type IncomingAnswer,
  type MediaEnv,
  type PrivatePathname,
  type RetentionPlan,
  type QuestionId,
} from "@/lib/holdings";
import { enqueue, type JobOutcome } from "@/lib/jobs";
import { lockApplicant } from "@/lib/lifecycle";
import { can } from "@/lib/staff/roles";
import { recordChange } from "@/lib/sync-log";
import { applicantSyncRowWithDocuments } from "@/lib/sync";

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

function holdingFromDocumentRow(row: IdentityDocument): DocumentHolding | null {
  const applicantId = parseApplicantId(row.applicantId);
  const documentId = parseDocumentId(row.id);
  if (!applicantId || !documentId || row.size < 0) return null;
  return {
    slot: "document",
    applicantId,
    documentId,
    kind: row.kind,
    object: { pathname: row.pathname as PrivatePathname, contentType: row.contentType, byteSize: row.size },
  };
}

async function loadHolding(db: Store, applicantId: ApplicantId, slot: "answer" | "document", holdingId: string): Promise<Holding | null> {
  if (slot === "answer") {
    const questionId = parseQuestionId(holdingId);
    if (!questionId) return null;
    const [row] = await db
      .select()
      .from(videoaskAnswers)
      .where(and(eq(videoaskAnswers.applicantId, applicantId), eq(videoaskAnswers.questionId, questionId)));
    return row ? holdingFromAnswerRow(row) : null;
  }
  const documentId = parseDocumentId(holdingId);
  if (!documentId) return null;
  const [row] = await db
    .select()
    .from(identityDocuments)
    .where(and(eq(identityDocuments.applicantId, applicantId), eq(identityDocuments.id, documentId)));
  return row ? holdingFromDocumentRow(row) : null;
}

export async function loadAnswerViews(db: Store, applicantId: ApplicantId): Promise<readonly AnswerView[]> {
  const rows = await db
    .select()
    .from(videoaskAnswers)
    .where(eq(videoaskAnswers.applicantId, applicantId))
    .orderBy(asc(videoaskAnswers.position), asc(videoaskAnswers.questionId));
  return rows.flatMap((row) => {
    const holding = holdingFromAnswerRow(row);
    return holding ? [presentAnswer(holding)] : [];
  });
}

export async function loadDocumentViews(db: Store, applicantId: ApplicantId): Promise<readonly DocumentView[]> {
  const rows = await db
    .select()
    .from(identityDocuments)
    .where(eq(identityDocuments.applicantId, applicantId))
    .orderBy(asc(identityDocuments.kind), asc(identityDocuments.id));
  return rows.flatMap((row) => {
    const holding = holdingFromDocumentRow(row);
    return holding ? [presentDocument(holding)] : [];
  });
}

export type StreamInput = {
  readonly actorId: string;
  readonly role: string;
  readonly applicantId: ApplicantId;
  readonly slot: "answer" | "document";
  readonly holdingId: string;
  readonly rangeHeader: string | null;
  readonly method: "GET" | "HEAD";
  readonly signal: AbortSignal;
};

export type StaffBytes = {
  readonly status: 200 | 206 | 416;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: ReadableStream<Uint8Array> | null;
};

export type StreamResult =
  | { readonly ok: true; readonly bytes: StaffBytes }
  | { readonly ok: false; readonly status: 403 | 404 | 502 };

function disposition(slot: "answer" | "document", contentType: string): string {
  const known = clipStorage(contentType);
  const subtype = contentType.split(";")[0]?.split("/")[1]?.toLowerCase().replace(/[^a-z0-9]/g, "") ?? "";
  const ext = known.ext !== "bin" ? known.ext : subtype.length > 0 && subtype.length <= 8 ? subtype : "bin";
  return `inline; filename="${slot === "document" ? "document" : "answer"}.${ext}"`;
}

function sliceStream(source: ReadableStream<Uint8Array>, skip: number, take: number): ReadableStream<Uint8Array> {
  const reader = source.getReader();
  let skipped = 0;
  let sent = 0;
  return new ReadableStream({
    async pull(controller) {
      while (sent < take) {
        const { done, value } = await reader.read();
        if (done) {
          controller.close();
          return;
        }
        let chunk = value;
        if (skipped < skip) {
          const need = skip - skipped;
          if (chunk.byteLength <= need) {
            skipped += chunk.byteLength;
            continue;
          }
          chunk = chunk.subarray(need);
          skipped = skip;
        }
        const room = take - sent;
        if (chunk.byteLength <= room) {
          controller.enqueue(chunk);
          sent += chunk.byteLength;
          continue;
        }
        controller.enqueue(chunk.subarray(0, room));
        sent = take;
        break;
      }
      await reader.cancel();
      controller.close();
    },
    cancel() {
      return reader.cancel();
    },
  });
}

export async function streamHolding(db: Db, input: StreamInput): Promise<StreamResult> {
  if (!can(input.role, input.slot === "document" ? "identity.view" : "dashboard.read")) return { ok: false, status: 403 };
  const holding = await loadHolding(db, input.applicantId, input.slot, input.holdingId);
  const object = holding ? storedObject(holding) : null;
  if (!holding || !object) return { ok: false, status: 404 };
  const read = readRangeHeader(input.rangeHeader, object.byteSize);
  const header = streamHeaders(object.contentType, object.byteSize, read);
  const headers = { ...header.headers, "Content-Disposition": disposition(holding.slot, object.contentType) };
  if (read.kind === "unsatisfiable" || input.method === "HEAD") {
    return { ok: true, bytes: { status: header.status, headers, body: null } };
  }
  if (opensHolding(read, object.byteSize)) {
    await db.transaction(async (tx) => {
      await recordEvent(tx, input.actorId, input.slot === "answer"
        ? { kind: "answer.media_opened", applicantId: input.applicantId, questionId: input.holdingId }
        : { kind: "identity.document_opened", applicantId: input.applicantId, documentId: input.holdingId });
    });
  }
  try {
    const result = await get(object.pathname, {
      access: "private",
      useCache: false,
      abortSignal: input.signal,
      ...(read.kind === "partial" ? { headers: { Range: `bytes=${read.range.start}-${read.range.end}` } } : {}),
    });
    if (!result?.stream) return { ok: false, status: 502 };
    if (read.kind === "partial" && !result.headers.get("content-range")) {
      const length = read.range.end - read.range.start + 1;
      return { ok: true, bytes: { status: 206, headers, body: sliceStream(result.stream, read.range.start, length) } };
    }
    return { ok: true, bytes: { status: read.kind === "partial" ? 206 : 200, headers, body: result.stream } };
  } catch {
    return { ok: false, status: 502 };
  }
}

export type RetentionReport = {
  readonly mode: RetentionPlan["mode"] | "error";
  readonly answers: number;
  readonly documents: number;
};

async function removeBlob(pathname: string): Promise<void> {
  try {
    await del(pathname);
  } catch (err) {
    if (err instanceof Error && err.name === "BlobNotFoundError") return;
    throw err;
  }
}

export async function retainPrivateMedia(db: Db, now: Date, env: MediaEnv): Promise<RetentionReport> {
  const plan = retentionPlan(now, env);
  if (plan.mode === "skip" || plan.mode === "wait") return { mode: plan.mode, answers: 0, documents: 0 };
  if (plan.mode === "dry_run") {
    const [answerRow] = await db.select({ n: count() }).from(videoaskAnswers).where(isNotNull(videoaskAnswers.pathname));
    const [documentRow] = await db.select({ n: count() }).from(identityDocuments);
    return { mode: "dry_run", answers: Number(answerRow?.n ?? 0), documents: Number(documentRow?.n ?? 0) };
  }
  const answerRows = await db
    .select({
      applicantId: videoaskAnswers.applicantId,
      questionId: videoaskAnswers.questionId,
      pathname: videoaskAnswers.pathname,
    })
    .from(videoaskAnswers)
    .where(isNotNull(videoaskAnswers.pathname))
    .orderBy(asc(videoaskAnswers.applicantId), asc(videoaskAnswers.questionId))
    .limit(RETENTION_BATCH);
  let answers = 0;
  for (const row of answerRows) {
    if (!row.pathname) continue;
    await removeBlob(row.pathname);
    const cleared = await db
      .update(videoaskAnswers)
      .set({ pathname: null, contentType: null, byteSize: null, sourceUrl: null, copiedAt: null })
      .where(and(
        eq(videoaskAnswers.applicantId, row.applicantId),
        eq(videoaskAnswers.questionId, row.questionId),
        eq(videoaskAnswers.pathname, row.pathname),
      ))
      .returning({ questionId: videoaskAnswers.questionId });
    if (cleared.length > 0) answers += 1;
  }
  const room = RETENTION_BATCH - answers;
  let documents = 0;
  if (room <= 0) return { mode: "delete", answers, documents };
  const documentRows = await db
    .select()
    .from(identityDocuments)
    .orderBy(asc(identityDocuments.applicantId), asc(identityDocuments.id))
    .limit(room);
  for (const row of documentRows) {
    await removeBlob(row.pathname);
    const removed = await db.transaction(async (tx) => {
      const deleted = await tx
        .delete(identityDocuments)
        .where(and(eq(identityDocuments.id, row.id), eq(identityDocuments.pathname, row.pathname)))
        .returning({ id: identityDocuments.id });
      if (deleted.length === 0) return false;
      const [applicant] = await tx.select().from(applicants).where(eq(applicants.id, row.applicantId));
      if (!applicant) return true;
      const remaining = await tx
        .select({ id: identityDocuments.id })
        .from(identityDocuments)
        .where(eq(identityDocuments.applicantId, row.applicantId));
      await recordChange(tx, "applicants", row.applicantId, "update", applicantSyncRowWithDocuments(applicant, remaining.map((item) => item.id)));
      return true;
    });
    if (removed) documents += 1;
  }
  return { mode: "delete", answers, documents };
}

function blobAccessFromUrl(url: string): "private" | "public" | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return null;
    if (parsed.hostname.endsWith(".private.blob.vercel-storage.com")) return "private";
    if (parsed.hostname.endsWith(".public.blob.vercel-storage.com")) return "public";
    return null;
  } catch {
    return null;
  }
}

export async function classifyIdentityBlob(pathname: string): Promise<"private" | "public" | "missing"> {
  try {
    const listed = await head(pathname);
    return blobAccessFromUrl(listed.url) ?? "missing";
  } catch {
    return "missing";
  }
}

export async function copyIdentityBlobPrivate(pathname: string): Promise<boolean> {
  let listed;
  try {
    listed = await head(pathname);
  } catch {
    return false;
  }
  if (blobAccessFromUrl(listed.url) !== "public") return false;
  const file = await get(pathname, { access: "public", useCache: false });
  if (!file?.stream) return false;
  const body = Buffer.from(await new Response(file.stream).arrayBuffer());
  await put(pathname, body, { access: "private", allowOverwrite: true, contentType: listed.contentType });
  let stored;
  try {
    stored = await head(pathname);
  } catch {
    return false;
  }
  // Same URL means the private put replaced the public object. Deleting it would remove the only copy.
  if (stored.url === listed.url || blobAccessFromUrl(stored.url) !== "private") return false;
  await del(listed.url);
  try {
    const after = await head(pathname);
    return blobAccessFromUrl(after.url) === "private";
  } catch {
    return false;
  }
}
