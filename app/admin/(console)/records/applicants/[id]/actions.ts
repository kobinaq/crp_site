"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { loadApplicant, parseRecordQuery } from "@/lib/admin/records";
import { recordsHref } from "@/lib/admin/return";
import { getDb } from "@/lib/db";
import { STATUSES } from "@/lib/lifecycle";
import { confirmDecision, previewDecision } from "@/lib/review/decide";
import { RUBRIC, isRecommendation, parseScores } from "@/lib/review/rubric";
import { assignReviewer, saveReview } from "@/lib/review/write";
import { assertStaffAction } from "@/lib/staff/gate";
import { isUserId, parseUserId } from "@/lib/staff/users";

const moveSchema = z.discriminatedUnion("field", [
  z.object({ field: z.literal("reviewDecision"), value: z.enum(["accept", "reject"]), to: z.enum(STATUSES) }),
  z.object({ field: z.literal("interviewOutcome"), value: z.enum(["yes", "no"]), to: z.enum(STATUSES) }),
]);

export type ReviewFormState = { readonly result: "forbidden" | "invalid" | "not_found" | "stale_cycle" | "saved" } | null;
export type AssignFormState = { readonly result: "forbidden" | "invalid" | "not_found" | "conflict" | "invalid_assignee" | "saved" } | null;
export type ConfirmFormState = { readonly result: "forbidden" | "invalid" | "stale" | "not_allowed" | "not_found" | "conflict" | "unchanged" | "replayed" | "staff_held" | "staff_kept" } | null;

export async function saveReviewAction(_previous: ReviewFormState, formData: FormData): Promise<ReviewFormState> {
  const reviewer = await assertStaffAction("reviews.write");
  if (!reviewer) return { result: "forbidden" };
  const applicantId = parseUserId(String(formData.get("applicantId") ?? ""));
  const reviewCycle = whole(formData.get("reviewCycle"));
  const parsedScores = parseScores(scoresFrom(formData));
  const recommendationRaw = String(formData.get("recommendation") ?? "");
  const recommendation = recommendationRaw ? recommendationRaw : undefined;
  const noteBody = String(formData.get("note") ?? "");
  const noteId = String(formData.get("noteId") ?? "");
  if (!applicantId || reviewCycle === null || !parsedScores.ok) return { result: "invalid" };
  if (recommendation !== undefined && !isRecommendation(recommendation)) return { result: "invalid" };
  const saved = await saveReview(getDb(), reviewer, {
    applicantId,
    reviewCycle,
    scores: parsedScores.scores,
    recommendation,
    note: noteBody ? { id: noteId, body: noteBody } : null,
  });
  if (!saved.ok) return { result: saved.reason };
  revalidatePath(`/admin/records/applicants/${applicantId}`);
  return { result: "saved" };
}

export async function assignReviewAction(_previous: AssignFormState, formData: FormData): Promise<AssignFormState> {
  const actor = await assertStaffAction("reviews.assign");
  if (!actor) return { result: "forbidden" };
  const applicantId = parseUserId(String(formData.get("applicantId") ?? ""));
  const assigneeId = idOrEmpty(formData.get("assigneeId"));
  const expectedAssigneeId = idOrEmpty(formData.get("expectedAssigneeId"));
  if (!applicantId || assigneeId === "invalid" || expectedAssigneeId === "invalid") return { result: "invalid" };
  const assigned = await assignReviewer(getDb(), actor, { applicantId, assigneeId, expectedAssigneeId });
  if (!assigned.ok) return { result: assigned.reason };
  revalidatePath(`/admin/records/applicants/${applicantId}`);
  revalidatePath("/admin/records");
  return { result: "saved" };
}

export async function previewDecisionAction(input: unknown): Promise<
  | { readonly result: "forbidden" | "invalid" | "not_found" | "not_allowed" }
  | { readonly result: "ready"; readonly to: string; readonly subject: string; readonly html: string; readonly toStatus: string }
> {
  const decider = await assertStaffAction("decisions.confirm");
  if (!decider) return { result: "forbidden" };
  const parsed = z.object({ applicantId: z.uuid(), move: moveSchema }).safeParse(input);
  if (!parsed.success) return { result: "invalid" };
  const preview = await previewDecision(getDb(), decider, parsed.data);
  if (!preview.ok) return { result: preview.reason };
  return { result: "ready", to: preview.to, subject: preview.subject, html: preview.html, toStatus: preview.toStatus };
}

export async function confirmDecisionAction(_previous: ConfirmFormState, formData: FormData): Promise<ConfirmFormState> {
  const decider = await assertStaffAction("decisions.confirm");
  if (!decider) return { result: "forbidden" };
  const applicantId = parseUserId(String(formData.get("applicantId") ?? ""));
  const version = whole(formData.get("version"));
  const reviewCycle = whole(formData.get("reviewCycle"));
  const decisionId = String(formData.get("decisionId") ?? "");
  const listQuery = parseRecordQuery({
    list: "applicants",
    q: String(formData.get("q") ?? ""),
    status: String(formData.get("status") ?? ""),
    track: String(formData.get("track") ?? ""),
    language: String(formData.get("language") ?? ""),
    cycle: String(formData.get("cycle") ?? ""),
    age: String(formData.get("age") ?? ""),
    queue: String(formData.get("queue") ?? ""),
    attention: String(formData.get("attention") ?? ""),
    page: String(formData.get("page") ?? ""),
  });
  const move = moveSchema.safeParse({
    field: formData.get("field"),
    value: formData.get("value"),
    to: formData.get("to"),
  });
  if (!applicantId || version === null || reviewCycle === null || !z.uuid().safeParse(decisionId).success || !move.success) {
    return { result: "invalid" };
  }
  const outcome = await confirmDecision(getDb(), decider, {
    applicantId,
    version,
    reviewCycle,
    decisionId,
    move: move.data,
  });
  if (outcome.result === "applied") {
    const review = await loadApplicant(getDb(), applicantId, decider, listQuery);
    redirect(review?.nextHref ?? recordsHref(listQuery));
  }
  return { result: outcome.result };
}

function scoresFrom(formData: FormData): Record<string, number | null> {
  const scores: Record<string, number | null> = {};
  for (const criterion of RUBRIC) {
    const raw = String(formData.get(`score-${criterion.id}`) ?? "").trim();
    scores[criterion.id] = raw ? Number(raw) : null;
  }
  return scores;
}

function whole(value: FormDataEntryValue | null): number | null {
  const raw = String(value ?? "");
  if (!/^\d+$/.test(raw)) return null;
  return Number(raw);
}

function idOrEmpty(value: FormDataEntryValue | null): string | null | "invalid" {
  const raw = String(value ?? "");
  if (!raw) return null;
  return isUserId(raw) ? raw : "invalid";
}
