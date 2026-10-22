import { z } from "zod";
import type { Applicant } from "@/lib/db";
import { appUrl } from "@/lib/config";
import { TRANSITIONS } from "@/lib/lifecycle";

type Status = Applicant["status"];

export type ConfirmMove =
  | { readonly field: "reviewDecision"; readonly value: "accept" | "reject"; readonly to: Status }
  | { readonly field: "interviewOutcome"; readonly value: "yes" | "no"; readonly to: Status };

// One decision row as the Excel poll sends it. Blank cells arrive as "" and are
// normalized to undefined before parsing. `version` is the applicant version the
// sheet last saw, so a stale row cannot overwrite a newer decision; `decisionId`
// lets a retried request replay its stored result instead of re-applying.
export const decisionRow = z.object({
  applicantId: z.uuid(),
  decisionId: z.uuid().optional(),
  version: z.coerce.number().int().nonnegative().optional(),
  reviewCycle: z.coerce.number().int().nonnegative(),
  reviewDecision: z.enum(["accept", "reject"]).optional(),
  reviewNotes: z.string().optional(),
  reviewer: z.string().optional(),
  reviewDate: z.string().optional(),
  interviewOutcome: z.enum(["yes", "no"]).optional(),
  interviewNotes: z.string().optional(),
  interviewDate: z.string().optional(),
});
export const decisionsInput = z.array(decisionRow).max(500);
export type DecisionRow = z.infer<typeof decisionRow>;

export function normalizeDecisions(raw: unknown): unknown {
  if (!Array.isArray(raw)) return raw;
  return raw.map((row) => {
    if (!row || typeof row !== "object") return row;
    const next = Object.fromEntries(
      Object.entries(row).map(([k, v]) => [k, v === "" ? undefined : v]),
    ) as Record<string, unknown>;
    if (next.reviewCycle === undefined) next.reviewCycle = 0;
    return next;
  });
}

// The status a set of decisions implies. Later stages win, so an interview
// outcome supersedes the review decision. null means no decision yet.
export function targetStatus(
  d: DecisionRow,
  track: Applicant["track"],
): Status | null {
  if (d.interviewOutcome === "no") return track === "in_person" ? "online_offered" : "rejected";
  if (d.interviewOutcome === "yes") return "interview_yes";
  if (d.reviewDecision === "reject") return track === "in_person" ? "online_offered" : "rejected";
  if (d.reviewDecision === "accept") return "accepted";
  return null;
}

// Review corrections stay inside the review stage. Interview outcomes only move
// people who are already accepted (or correcting an interview_* status). Old
// spreadsheet decisions must never undo document submission or onboarding.
export function decisionSourceStatuses(
  target: Status,
  d: Pick<DecisionRow, "interviewOutcome">,
): Status[] {
  if (d.interviewOutcome) {
    if (target === "interview_yes" || target === "online_offered" || target === "rejected") {
      return ["accepted", "interview_yes", "interview_no"];
    }
    return [];
  }
  const review: Status[] = ["under_review", "accepted", "rejected", "online_offered"];
  if (target === "accepted" || target === "rejected" || target === "online_offered") return review;
  return [];
}

const MOVE_CANDIDATES = [
  { field: "reviewDecision", value: "accept" },
  { field: "reviewDecision", value: "reject" },
  { field: "interviewOutcome", value: "yes" },
  { field: "interviewOutcome", value: "no" },
] as const;

export function offeredMoves(applicant: Pick<Applicant, "status" | "track">): readonly ConfirmMove[] {
  const moves: ConfirmMove[] = [];
  for (const candidate of MOVE_CANDIDATES) {
    // targetStatus reads the decision field. The id only satisfies DecisionRow.
    const probe = {
      applicantId: "00000000-0000-4000-8000-000000000000",
      reviewCycle: 0,
      ...(candidate.field === "reviewDecision"
        ? { reviewDecision: candidate.value }
        : { interviewOutcome: candidate.value }),
    } satisfies DecisionRow;
    const target = targetStatus(probe, applicant.track);
    if (!target || target === applicant.status) continue;
    if (!decisionSourceStatuses(target, {
      interviewOutcome: candidate.field === "interviewOutcome" ? candidate.value : undefined,
    }).includes(applicant.status)) continue;
    if (!TRANSITIONS[applicant.status].includes(target)) continue;
    if (candidate.field === "reviewDecision") moves.push({ field: "reviewDecision", value: candidate.value, to: target });
    else moves.push({ field: "interviewOutcome", value: candidate.value, to: target });
  }
  return moves;
}

// A real Date or undefined; an unparseable cell is dropped, not stored as junk.
export function parseDate(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const t = Date.parse(value);
  return Number.isNaN(t) ? undefined : new Date(t);
}

// The system-owned projection of an applicant that the Excel mirror reads. The
// decision columns are deliberately absent so the sheet never writes them back
// to itself; `version` lets it detect its own stale rows.
function projectApplicant(a: Applicant, identityDocumentIds: string[]) {
  return {
    id: a.id,
    version: a.version,
    reviewCycle: a.reviewCycle,
    submittedAt: a.createdAt,
    fullName: a.fullName,
    email: a.email,
    dob: a.dob,
    age: a.age,
    track: a.track,
    phone: a.phone,
    nationality: a.nationality,
    basedIn: a.basedIn,
    skills: a.skills,
    canTravel: a.canTravel,
    hasValidPassport: a.hasValidPassport,
    language: a.language,
    status: a.status,
    round1Link: null, // Private form references are delivered only to the verified applicant.
    round1CompletedAt: a.round1CompletedAt,
    identityStatus: a.identityStatus,
    identityCheckedAt: a.identityCheckedAt,
    identityDocuments: identityDocumentIds.map((id) => `${appUrl()}/api/ops/documents/${id}`),
    interviewAt: a.interviewAt,
    docsStatus: a.docsStatus,
    lastSynced: a.updatedAt,
  };
}

export function applicantSyncRow(a: Applicant) {
  return projectApplicant(a, []);
}

export function applicantSyncRowWithDocuments(a: Applicant, identityDocumentIds: string[]) {
  return projectApplicant(a, identityDocumentIds);
}
