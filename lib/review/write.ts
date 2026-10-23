import { and, eq, sql } from "drizzle-orm";
import { recordEvent } from "@/lib/admin/events";
import { reviewNotes, reviewPositions, users, type Db, type Tx } from "@/lib/db";
import { lockApplicant } from "@/lib/lifecycle";
import {
  RUBRIC,
  currentCriteria,
  isRecommendation,
  parseScores,
  type Recommendation,
  type ScoreInput,
} from "@/lib/review/rubric";
import type { StaffGrant } from "@/lib/staff/auth";
import { can } from "@/lib/staff/roles";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type SaveReviewInput = {
  readonly applicantId: string;
  readonly reviewCycle: number;
  readonly scores: ScoreInput;
  readonly recommendation: Recommendation | undefined;
  readonly note: { readonly id: string; readonly body: string } | null;
};

export type SaveReviewResult =
  | { readonly ok: true; readonly applicantId: string; readonly reviewCycle: number }
  | { readonly ok: false; readonly reason: "not_found" | "stale_cycle" | "invalid" };

export type AssignInput = {
  readonly applicantId: string;
  readonly assigneeId: string | null;
  readonly expectedAssigneeId: string | null;
};

export type AssignResult =
  | { readonly ok: true; readonly applicantId: string; readonly assigneeId: string | null; readonly version: number }
  | { readonly ok: false; readonly reason: "not_found" | "conflict" | "invalid_assignee" };

export async function saveReview(
  db: Db,
  actor: StaffGrant<"reviews.write">,
  input: SaveReviewInput,
): Promise<SaveReviewResult> {
  const parsed = parseScores(input.scores);
  if (!parsed.ok) return { ok: false, reason: "invalid" };
  if (input.recommendation !== undefined && !isRecommendation(input.recommendation)) return { ok: false, reason: "invalid" };
  if (input.note && !validNote(input.note)) return { ok: false, reason: "invalid" };
  return db.transaction((tx) => writeReview(tx, actor.id, input, parsed.scores));
}

async function writeReview(tx: Tx, authorId: string, input: SaveReviewInput, scores: ScoreInput): Promise<SaveReviewResult> {
  const current = await lockApplicant(tx, input.applicantId);
  if (!current) return { ok: false, reason: "not_found" };
  if (input.reviewCycle !== current.reviewCycle) return { ok: false, reason: "stale_cycle" };

  const [existing] = await tx
    .select()
    .from(reviewPositions)
    .where(and(
      eq(reviewPositions.applicantId, current.id),
      eq(reviewPositions.reviewCycle, current.reviewCycle),
      eq(reviewPositions.authorId, authorId),
    ));
  const stored = storedScores(existing?.scores);
  const nextScores = mergeScores(stored, scores);
  const storedRecommendation = existing?.recommendation ?? null;
  const nextRecommendation = input.recommendation === undefined ? storedRecommendation : input.recommendation;
  const positionChanged = !sameScores(stored, nextScores) || nextRecommendation !== storedRecommendation;
  if (positionChanged) {
    if (existing) {
      await tx
        .update(reviewPositions)
        .set({
          scores: nextScores,
          recommendation: nextRecommendation,
          updatedAt: new Date(),
        })
        .where(and(
          eq(reviewPositions.applicantId, current.id),
          eq(reviewPositions.reviewCycle, current.reviewCycle),
          eq(reviewPositions.authorId, authorId),
        ));
    } else {
      await tx.insert(reviewPositions).values({
        applicantId: current.id,
        reviewCycle: current.reviewCycle,
        authorId,
        scores: nextScores,
        recommendation: nextRecommendation,
      });
    }
  }

  let noteId: string | null = null;
  if (input.note) {
    const inserted = await tx
      .insert(reviewNotes)
      .values({
        id: input.note.id,
        applicantId: current.id,
        reviewCycle: current.reviewCycle,
        authorId,
        body: input.note.body,
      })
      .onConflictDoNothing()
      .returning({ id: reviewNotes.id });
    noteId = inserted[0]?.id ?? null;
  }
  if (!positionChanged && !noteId) {
    return { ok: true, applicantId: current.id, reviewCycle: current.reviewCycle };
  }
  const recommendation = nextRecommendation !== null && isRecommendation(nextRecommendation) ? nextRecommendation : null;
  await recordEvent(tx, authorId, {
    kind: "review.saved",
    applicantId: current.id,
    reviewCycle: current.reviewCycle,
    recommendation,
    criteria: currentCriteria(nextScores),
    noteId,
  });
  return { ok: true, applicantId: current.id, reviewCycle: current.reviewCycle };
}

export async function assignReviewer(
  db: Db,
  actor: StaffGrant<"reviews.assign">,
  input: AssignInput,
): Promise<AssignResult> {
  if (input.assigneeId !== null && !isUuid(input.assigneeId)) return { ok: false, reason: "invalid_assignee" };
  return db.transaction(async (tx) => {
    const current = await lockApplicant(tx, input.applicantId);
    if (!current) return { ok: false, reason: "not_found" };
    if (current.assignedStaffId !== input.expectedAssigneeId) return { ok: false, reason: "conflict" };
    if (current.assignedStaffId === input.assigneeId) {
      return { ok: true, applicantId: current.id, assigneeId: input.assigneeId, version: current.version };
    }
    if (input.assigneeId !== null) {
      const [user] = await tx
        .select({ role: users.role, disabledAt: users.disabledAt })
        .from(users)
        .where(eq(users.id, input.assigneeId));
      if (!user || user.disabledAt || !can(user.role, "reviews.write")) return { ok: false, reason: "invalid_assignee" };
    }
    const result = await tx.execute(sql`
      update applicants
      set assigned_staff_id = ${input.assigneeId}
      where id = ${current.id}
        and assigned_staff_id is not distinct from ${current.assignedStaffId}
      returning version
    `);
    const version = versionOf(result);
    if (version === null) return { ok: false, reason: "conflict" };
    await recordEvent(tx, actor.id, {
      kind: "review.assigned",
      subject: input.assigneeId,
      applicantId: current.id,
      assigneeId: input.assigneeId,
      previousAssigneeId: current.assignedStaffId,
    });
    return { ok: true, applicantId: current.id, assigneeId: input.assigneeId, version };
  });
}

function validNote(note: { id: string; body: string }): boolean {
  return isUuid(note.id) && note.body.length >= 1 && note.body.length <= 4000;
}

function isUuid(value: string): boolean {
  return UUID.test(value);
}

function storedScores(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const scores: Record<string, number> = {};
  for (const [key, item] of Object.entries(value)) {
    if (typeof item === "number" && Number.isInteger(item)) scores[key] = item;
  }
  return scores;
}

function mergeScores(stored: Record<string, number>, input: ScoreInput): Record<string, number> {
  const next = { ...stored };
  for (const criterion of RUBRIC) {
    if (!Object.hasOwn(input, criterion.id)) continue;
    const value = input[criterion.id];
    if (value === undefined) continue;
    if (value === null) delete next[criterion.id];
    else next[criterion.id] = value;
  }
  return next;
}

function sameScores(left: Record<string, number>, right: Record<string, number>): boolean {
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  if (leftKeys.length !== rightKeys.length) return false;
  return leftKeys.every((key, index) => key === rightKeys[index] && left[key] === right[key]);
}

function versionOf(result: unknown): number | null {
  const rows = Array.isArray(result)
    ? result
    : result && typeof result === "object" && "rows" in result && Array.isArray(result.rows)
      ? result.rows
      : [];
  const row = rows[0];
  if (!row || typeof row !== "object" || !("version" in row) || typeof row.version !== "number") return null;
  return row.version;
}
