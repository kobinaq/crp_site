declare const applicantIdBrand: unique symbol;
declare const questionIdBrand: unique symbol;
declare const documentIdBrand: unique symbol;
declare const pathnameBrand: unique symbol;
declare const mediaUrlBrand: unique symbol;

export type ApplicantId = string & { readonly [applicantIdBrand]: "ApplicantId" };
export type QuestionId = string & { readonly [questionIdBrand]: "QuestionId" };
export type DocumentId = string & { readonly [documentIdBrand]: "DocumentId" };
export type PrivatePathname = string & { readonly [pathnameBrand]: "PrivatePathname" };
export type VideoAskMediaUrl = string & { readonly [mediaUrlBrand]: "VideoAskMediaUrl" };

const APPLICANT = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const QUESTION = /^[A-Za-z0-9_-]{1,128}$/;
const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;
const TEXT_CAP = 20_000;
const TITLE_CAP = 500;
const ANSWER_CAP = 200;
const URL_CAP = 2_000;

export type StoredObject = {
  readonly pathname: PrivatePathname;
  readonly contentType: string;
  readonly byteSize: number;
};

export type ClipFile =
  | { readonly phase: "pending"; readonly sourceUrl: VideoAskMediaUrl }
  | { readonly phase: "stored"; readonly object: StoredObject }
  | { readonly phase: "words_only" };

export type IncomingClipFile = Exclude<ClipFile, { readonly phase: "stored" }>;

export type AnswerBody =
  | { readonly medium: "text"; readonly text: string }
  | { readonly medium: "poll"; readonly label: string }
  | { readonly medium: "video" | "audio"; readonly transcript: string | null; readonly file: ClipFile };

export type IncomingAnswerBody =
  | { readonly medium: "text"; readonly text: string }
  | { readonly medium: "poll"; readonly label: string }
  | { readonly medium: "video" | "audio"; readonly transcript: string | null; readonly file: IncomingClipFile };

export type AnswerHolding = {
  readonly slot: "answer";
  readonly applicantId: ApplicantId;
  readonly questionId: QuestionId;
  readonly answerId: string;
  readonly position: number;
  readonly title: string;
  readonly body: AnswerBody;
};

export type IncomingAnswer = Omit<AnswerHolding, "body"> & { readonly body: IncomingAnswerBody };

export type DocumentHolding = {
  readonly slot: "document";
  readonly applicantId: ApplicantId;
  readonly documentId: DocumentId;
  readonly kind: string;
  readonly object: StoredObject;
};

export type Holding = AnswerHolding | DocumentHolding;

export type AnswerView =
  | { readonly kind: "text"; readonly questionId: string; readonly position: number; readonly title: string; readonly text: string }
  | { readonly kind: "poll"; readonly questionId: string; readonly position: number; readonly title: string; readonly label: string }
  | {
    readonly kind: "clip";
    readonly questionId: string;
    readonly position: number;
    readonly title: string;
    readonly medium: "video" | "audio";
    readonly transcript: string;
    readonly playback: "ready" | "copying" | "unavailable";
  };

export type DocumentView = {
  readonly documentId: string;
  readonly kind: string;
  readonly contentType: string;
};

export type ByteRange = { readonly start: number; readonly end: number };

export type RangeRead =
  | { readonly kind: "full" }
  | { readonly kind: "partial"; readonly range: ByteRange }
  | { readonly kind: "unsatisfiable" };

export type StreamHeader = {
  readonly status: 200 | 206 | 416;
  readonly headers: Readonly<Record<string, string>>;
};

export const MEDIA_RETENTION_DAYS_DEFAULT = 30;
export const RETENTION_BATCH = 20;
export const MEDIA_BYTE_CAP = 100 * 1024 * 1024;

export type MediaEnv = {
  readonly programEnd: string | null;
  readonly retentionDays: number;
  readonly dryRun: boolean;
};

export type RetentionPlan =
  | { readonly mode: "skip"; readonly reason: "program_end_unset" }
  | { readonly mode: "wait"; readonly cutoff: Date }
  | { readonly mode: "dry_run"; readonly cutoff: Date }
  | { readonly mode: "delete"; readonly cutoff: Date };

export type AnswerInsert = {
  readonly applicantId: string;
  readonly questionId: string;
  readonly answerId: string;
  readonly position: number;
  readonly title: string;
  readonly medium: "text" | "poll" | "video" | "audio";
  readonly textBody: string | null;
  readonly transcript: string | null;
  readonly sourceUrl: string | null;
  readonly pathname: string | null;
  readonly contentType: string | null;
  readonly byteSize: number | null;
  readonly copiedAt: Date | null;
};

export type VideoaskMediaJobPayload = {
  readonly applicantId: ApplicantId;
  readonly questionId: QuestionId;
};

const CLIP_EXT: Readonly<Record<string, string>> = {
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
  "video/ogg": "ogv",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/webm": "weba",
  "audio/wav": "wav",
  "audio/wave": "wav",
  "audio/ogg": "ogg",
  "audio/aac": "aac",
  "audio/flac": "flac",
};

export function parseApplicantId(raw: string): ApplicantId | null {
  if (!APPLICANT.test(raw)) return null;
  return raw.toLowerCase() as ApplicantId;
}

export function parseQuestionId(raw: string): QuestionId | null {
  if (!QUESTION.test(raw)) return null;
  return raw as QuestionId;
}

export function parseDocumentId(raw: string): DocumentId | null {
  if (!APPLICANT.test(raw)) return null;
  return raw.toLowerCase() as DocumentId;
}

export function parseVideoAskMediaUrl(raw: unknown): VideoAskMediaUrl | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (trimmed.length < 1 || trimmed.length > URL_CAP) return null;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username || url.password || url.hostname !== "media.videoask.com") return null;
  return trimmed as VideoAskMediaUrl;
}

export function clipStorage(contentType: string): { readonly contentType: string; readonly ext: string } {
  const base = contentType.split(";")[0]?.trim().toLowerCase() ?? "";
  const ext = CLIP_EXT[base];
  if (!ext) return { contentType: "application/octet-stream", ext: "bin" };
  return { contentType: base, ext };
}

export function identityPathname(applicantId: ApplicantId, kind: string, index: number, contentType: string): PrivatePathname {
  const extension = contentType.split("/")[1]?.replace(/[^a-z0-9]+/gi, "") || "bin";
  return `identity/${applicantId}/${kind}-${index}.${extension}` as PrivatePathname;
}

export function videoaskPathname(applicantId: ApplicantId, questionId: QuestionId, contentType: string): PrivatePathname {
  const { ext } = clipStorage(contentType);
  return `videoask/${applicantId.toLowerCase()}/${questionId}.${ext}` as PrivatePathname;
}

type QuestionMeta = { readonly questionId: QuestionId; readonly position: number; readonly title: string };

function record(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function questionTitle(question: Record<string, unknown>): string | null {
  if (typeof question.label === "string" && question.label.length > 0 && question.label.length <= TITLE_CAP) return question.label;
  const metadata = record(question.metadata);
  const text = metadata?.text;
  if (typeof text === "string" && text.length > 0 && text.length <= TITLE_CAP) return text;
  return null;
}

function questionsOf(body: Record<string, unknown>): readonly QuestionMeta[] {
  const form = record(body.form);
  const questions = form?.questions;
  if (!Array.isArray(questions)) return [];
  const rows: QuestionMeta[] = [];
  questions.forEach((item, position) => {
    const question = record(item);
    if (!question || typeof question.question_id !== "string") return;
    const questionId = parseQuestionId(question.question_id);
    const title = questionTitle(question);
    if (!questionId || !title || rows.some((row) => row.questionId === questionId)) return;
    rows.push({ questionId, position, title });
  });
  return rows;
}

function boundedText(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.length > TEXT_CAP) return null;
  return raw;
}

function transcriptOf(raw: unknown): string | null | undefined {
  if (raw == null) return null;
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.length > TEXT_CAP) return undefined;
  return trimmed;
}

function answerIdOf(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.length < 1 || raw.length > ANSWER_CAP) return null;
  return raw;
}

function incomingFromItem(item: Record<string, unknown>, applicantId: ApplicantId, meta: QuestionMeta): IncomingAnswer | null {
  const answerId = answerIdOf(item.answer_id);
  if (!answerId) return null;
  const shared = {
    slot: "answer" as const,
    applicantId,
    questionId: meta.questionId,
    answerId,
    position: meta.position,
    title: meta.title,
  };
  if (item.type === "text") {
    const text = boundedText(item.input_text);
    if (text === null) return null;
    return { ...shared, body: { medium: "text", text } };
  }
  if (item.type === "poll") {
    const label = boundedText(item.poll_option_content);
    if (label === null) return null;
    return { ...shared, body: { medium: "poll", label } };
  }
  if (item.type !== "video" && item.type !== "audio") return null;
  const transcript = transcriptOf(item.transcription);
  if (transcript === undefined) return null;
  const sourceUrl = parseVideoAskMediaUrl(item.media_url);
  if (sourceUrl) return { ...shared, body: { medium: item.type, transcript, file: { phase: "pending", sourceUrl } } };
  if (transcript) return { ...shared, body: { medium: item.type, transcript, file: { phase: "words_only" } } };
  return null;
}

export function parseVideoaskHoldings(body: unknown, applicantId: ApplicantId): readonly IncomingAnswer[] {
  const root = record(body);
  if (!root) return [];
  const contact = record(root.contact);
  const answers = contact?.answers;
  if (!Array.isArray(answers)) return [];
  const questions = questionsOf(root);
  const byQuestion = new Map<QuestionId, IncomingAnswer>();
  for (const item of answers) {
    const row = record(item);
    if (!row || typeof row.question_id !== "string") continue;
    const meta = questions.find((question) => question.questionId === row.question_id);
    if (!meta) continue;
    const incoming = incomingFromItem(row, applicantId, meta);
    if (incoming) byQuestion.set(meta.questionId, incoming);
  }
  return questions.flatMap((question) => {
    const incoming = byQuestion.get(question.questionId);
    return incoming ? [incoming] : [];
  });
}

function readIncomingFile(raw: unknown): IncomingClipFile | null {
  const file = record(raw);
  if (!file) return null;
  if (file.phase === "words_only") return { phase: "words_only" };
  if (file.phase !== "pending") return null;
  const sourceUrl = parseVideoAskMediaUrl(file.sourceUrl);
  if (!sourceUrl) return null;
  return { phase: "pending", sourceUrl };
}

function readIncomingBody(raw: unknown): IncomingAnswerBody | null {
  const body = record(raw);
  if (!body) return null;
  if (body.medium === "text") {
    const text = boundedText(body.text);
    if (text === null) return null;
    return { medium: "text", text };
  }
  if (body.medium === "poll") {
    const label = boundedText(body.label);
    if (label === null) return null;
    return { medium: "poll", label };
  }
  if (body.medium !== "video" && body.medium !== "audio") return null;
  if (body.transcript !== null && typeof body.transcript !== "string") return null;
  if (typeof body.transcript === "string" && body.transcript.length > TEXT_CAP) return null;
  const file = readIncomingFile(body.file);
  if (!file) return null;
  return { medium: body.medium, transcript: body.transcript, file };
}

function readIncoming(raw: unknown): IncomingAnswer | null {
  const row = record(raw);
  if (!row || row.slot !== "answer") return null;
  if (typeof row.applicantId !== "string" || typeof row.questionId !== "string") return null;
  const applicantId = parseApplicantId(row.applicantId);
  const questionId = parseQuestionId(row.questionId);
  const answerId = answerIdOf(row.answerId);
  if (!applicantId || !questionId || !answerId) return null;
  if (typeof row.position !== "number" || !Number.isInteger(row.position) || row.position < 0) return null;
  if (typeof row.title !== "string" || row.title.length < 1 || row.title.length > TITLE_CAP) return null;
  const body = readIncomingBody(row.body);
  if (!body) return null;
  return { slot: "answer", applicantId, questionId, answerId, position: row.position, title: row.title, body };
}

export function readStoredAnswers(raw: unknown): readonly IncomingAnswer[] {
  if (!Array.isArray(raw)) return [];
  const byQuestion = new Map<QuestionId, IncomingAnswer>();
  const order: QuestionId[] = [];
  for (const item of raw) {
    const incoming = readIncoming(item);
    if (!incoming) continue;
    if (!byQuestion.has(incoming.questionId)) order.push(incoming.questionId);
    byQuestion.set(incoming.questionId, incoming);
  }
  return order.flatMap((questionId) => {
    const incoming = byQuestion.get(questionId);
    return incoming ? [incoming] : [];
  });
}

export function readVideoaskMediaJob(payload: unknown): VideoaskMediaJobPayload | null {
  const row = record(payload);
  if (!row || typeof row.applicantId !== "string" || typeof row.questionId !== "string") return null;
  const applicantId = parseApplicantId(row.applicantId);
  const questionId = parseQuestionId(row.questionId);
  if (!applicantId || !questionId) return null;
  return { applicantId, questionId };
}

function asHolding(incoming: IncomingAnswer): AnswerHolding {
  return {
    slot: "answer",
    applicantId: incoming.applicantId,
    questionId: incoming.questionId,
    answerId: incoming.answerId,
    position: incoming.position,
    title: incoming.title,
    body: incoming.body,
  };
}

function mergeFile(stored: ClipFile, incoming: IncomingClipFile): ClipFile {
  if (stored.phase === "stored") return stored;
  if (stored.phase === "pending" && incoming.phase === "words_only") return stored;
  if (stored.phase === "words_only" && incoming.phase === "words_only") return stored;
  return incoming;
}

export function mergeAnswer(stored: AnswerHolding | null, incoming: IncomingAnswer): AnswerHolding {
  if (!stored) return asHolding(incoming);
  if (stored.questionId !== incoming.questionId || stored.applicantId !== incoming.applicantId) return stored;
  if (stored.body.medium !== incoming.body.medium) return stored;
  if (incoming.body.medium === "text" || incoming.body.medium === "poll") {
    return {
      slot: "answer",
      applicantId: stored.applicantId,
      questionId: stored.questionId,
      answerId: incoming.answerId,
      position: incoming.position,
      title: incoming.title,
      body: incoming.body,
    };
  }
  if (stored.body.medium === "text" || stored.body.medium === "poll") return stored;
  const replacement = incoming.body.transcript?.trim() ? incoming.body.transcript : null;
  return {
    slot: "answer",
    applicantId: stored.applicantId,
    questionId: stored.questionId,
    answerId: incoming.answerId,
    position: incoming.position,
    title: incoming.title,
    body: {
      medium: stored.body.medium,
      transcript: replacement ?? stored.body.transcript,
      file: mergeFile(stored.body.file, incoming.body.file),
    },
  };
}

export function presentAnswer(holding: AnswerHolding): AnswerView {
  if (holding.body.medium === "text") {
    return { kind: "text", questionId: holding.questionId, position: holding.position, title: holding.title, text: holding.body.text };
  }
  if (holding.body.medium === "poll") {
    return { kind: "poll", questionId: holding.questionId, position: holding.position, title: holding.title, label: holding.body.label };
  }
  const playback = holding.body.file.phase === "stored" ? "ready" : holding.body.file.phase === "pending" ? "copying" : "unavailable";
  return {
    kind: "clip",
    questionId: holding.questionId,
    position: holding.position,
    title: holding.title,
    medium: holding.body.medium,
    transcript: holding.body.transcript ?? "",
    playback,
  };
}

export function presentDocument(holding: DocumentHolding): DocumentView {
  return { documentId: holding.documentId, kind: holding.kind, contentType: holding.object.contentType };
}

export function storedObject(holding: Holding): StoredObject | null {
  if (holding.slot === "document") return holding.object;
  if (holding.body.medium === "text" || holding.body.medium === "poll") return null;
  return holding.body.file.phase === "stored" ? holding.body.file.object : null;
}

export function answerInsert(holding: AnswerHolding, copiedAt: Date | null = null): AnswerInsert {
  const shared = {
    applicantId: holding.applicantId,
    questionId: holding.questionId,
    answerId: holding.answerId,
    position: holding.position,
    title: holding.title,
  };
  if (holding.body.medium === "text" || holding.body.medium === "poll") {
    return {
      ...shared,
      medium: holding.body.medium,
      textBody: holding.body.medium === "text" ? holding.body.text : holding.body.label,
      transcript: null,
      sourceUrl: null,
      pathname: null,
      contentType: null,
      byteSize: null,
      copiedAt: null,
    };
  }
  const transcript = holding.body.transcript;
  if (holding.body.file.phase === "pending") {
    return {
      ...shared,
      medium: holding.body.medium,
      textBody: null,
      transcript,
      sourceUrl: holding.body.file.sourceUrl,
      pathname: null,
      contentType: null,
      byteSize: null,
      copiedAt: null,
    };
  }
  if (holding.body.file.phase === "words_only") {
    return {
      ...shared,
      medium: holding.body.medium,
      textBody: null,
      transcript,
      sourceUrl: null,
      pathname: null,
      contentType: null,
      byteSize: null,
      copiedAt: null,
    };
  }
  return {
    ...shared,
    medium: holding.body.medium,
    textBody: null,
    transcript,
    sourceUrl: null,
    pathname: holding.body.file.object.pathname,
    contentType: holding.body.file.object.contentType,
    byteSize: holding.body.file.object.byteSize,
    copiedAt,
  };
}

export function readRangeHeader(header: string | null, total: number): RangeRead {
  if (header == null || header.trim() === "") return { kind: "full" };
  const value = header.trim();
  if (!/^bytes=/i.test(value)) return { kind: "unsatisfiable" };
  const spec = value.slice(value.indexOf("=") + 1).trim();
  if (spec.includes(",") || total <= 0) return { kind: "unsatisfiable" };
  if (spec.startsWith("-")) {
    if (!/^\d+$/.test(spec.slice(1))) return { kind: "unsatisfiable" };
    const suffix = Number(spec.slice(1));
    if (suffix <= 0) return { kind: "unsatisfiable" };
    const length = Math.min(suffix, total);
    return { kind: "partial", range: { start: total - length, end: total - 1 } };
  }
  const match = /^(\d+)-(\d*)$/.exec(spec);
  if (!match) return { kind: "unsatisfiable" };
  const start = Number(match[1]);
  if (start >= total) return { kind: "unsatisfiable" };
  if (match[2] === "") return { kind: "partial", range: { start, end: total - 1 } };
  const end = Number(match[2]);
  if (end < start) return { kind: "unsatisfiable" };
  return { kind: "partial", range: { start, end: Math.min(end, total - 1) } };
}

export function streamHeaders(contentType: string, total: number, read: RangeRead): StreamHeader {
  const headers: Record<string, string> = {
    "Content-Type": contentType,
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  };
  if (read.kind === "unsatisfiable") {
    headers["Content-Range"] = `bytes */${total}`;
    return { status: 416, headers };
  }
  if (read.kind === "full") {
    headers["Content-Length"] = String(total);
    return { status: 200, headers };
  }
  const length = read.range.end - read.range.start + 1;
  headers["Content-Range"] = `bytes ${read.range.start}-${read.range.end}/${total}`;
  headers["Content-Length"] = String(length);
  return { status: 206, headers };
}

// Staff media is read through the staff session cookie. The path holds only
// record ids, never a token, because request paths end up in hosting logs.
export function staffMediaPath(applicantId: string, slot: "answer" | "document", holdingId: string): string {
  return `/admin/records/applicants/${encodeURIComponent(applicantId)}/media/${slot}/${encodeURIComponent(holdingId)}`;
}

// One audit row per play or open: a whole read, or a range from byte 0 that is
// more than Safari's two-byte probe. Seeks and later chunks are not logged.
export function opensHolding(read: RangeRead, total: number): boolean {
  if (read.kind === "full") return true;
  if (read.kind !== "partial" || read.range.start !== 0) return false;
  return read.range.end > 1 || read.range.end === total - 1;
}

function wholeDay(raw: string | undefined): string | null {
  if (!raw) return null;
  const match = DAY.exec(raw.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${match[1]}-${match[2]}-${match[3]}`;
}

function retentionDays(raw: string | undefined): number {
  if (raw == null || raw.trim() === "") return MEDIA_RETENTION_DAYS_DEFAULT;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > 3650) return MEDIA_RETENTION_DAYS_DEFAULT;
  return value;
}

export function readMediaEnv(env: Readonly<Record<string, string | undefined>>): MediaEnv {
  return {
    programEnd: wholeDay(env.PROGRAM_END),
    retentionDays: retentionDays(env.MEDIA_RETENTION_DAYS),
    dryRun: env.MEDIA_RETENTION_DRY_RUN !== "false",
  };
}

export function retentionPlan(now: Date, env: MediaEnv): RetentionPlan {
  if (!env.programEnd) return { mode: "skip", reason: "program_end_unset" };
  const [year, month, day] = env.programEnd.split("-").map(Number);
  const cutoff = new Date(Date.UTC(year, month - 1, day + 1 + env.retentionDays));
  if (now.getTime() < cutoff.getTime()) return { mode: "wait", cutoff };
  if (env.dryRun) return { mode: "dry_run", cutoff };
  return { mode: "delete", cutoff };
}
