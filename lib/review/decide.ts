import { eq, inArray } from "drizzle-orm";
import { applicants, type Applicant, type Db } from "@/lib/db";
import { loadEmailSources } from "@/lib/copy/read";
import { calendlyLink } from "@/lib/calendly";
import { applyDecision, applyDecisions, type DecisionOutcome } from "@/lib/decisions";
import { previewDecisionEmail } from "@/lib/emails";
import type { Status } from "@/lib/lifecycle";
import { offeredMoves, type ConfirmMove, type DecisionRow } from "@/lib/sync";
import type { StaffGrant } from "@/lib/staff/auth";

const BULK_CAP = 50;

export type BulkRowSeen = {
  readonly applicantId: string;
  readonly version: number;
  readonly reviewCycle: number;
};

export type BulkRowRef = BulkRowSeen & { readonly decisionId: string };

export type BulkProjection = "apply" | "stale" | "not_allowed" | "not_found";

export type BulkPreview = {
  readonly move: ConfirmMove;
  readonly counts: {
    readonly apply: number;
    readonly stale: number;
    readonly notAllowed: number;
    readonly notFound: number;
  };
  readonly byLanguage: readonly { readonly language: string; readonly apply: number }[];
  readonly rows: readonly {
    readonly applicantId: string;
    readonly fullName: string;
    readonly projection: BulkProjection;
    readonly to: Status | null;
  }[];
};

export async function previewDecision(
  db: Db,
  actor: StaffGrant<"decisions.confirm">,
  input: { applicantId: string; move: ConfirmMove },
): Promise<
  | { ok: true; to: string; subject: string; html: string; toStatus: Status }
  | { ok: false; reason: "not_found" | "not_allowed" }
> {
  void actor;
  const [applicant] = await db.select().from(applicants).where(eq(applicants.id, input.applicantId));
  if (!applicant) return { ok: false, reason: "not_found" };
  if (!exactMove(offeredMoves(applicant), input.move) || !isMailStatus(input.move.to)) {
    return { ok: false, reason: "not_allowed" };
  }
  const sources = await loadEmailSources();
  const calendly = input.move.to === "accepted" ? calendlyLink(applicant) : null;
  const mail = previewDecisionEmail(input.move.to, applicant, sources, calendly);
  return { ok: true, to: applicant.email, subject: mail.subject, html: mail.html, toStatus: input.move.to };
}

export async function confirmDecision(
  db: Db,
  actor: StaffGrant<"decisions.confirm">,
  input: { applicantId: string; version: number; reviewCycle: number; decisionId: string; move: ConfirmMove },
): Promise<DecisionOutcome> {
  const [current] = await db.select().from(applicants).where(eq(applicants.id, input.applicantId));
  // applyDecision sees the field, not the named target. A reject for the other
  // track would still send that track's email, so refuse the mismatch first.
  if (current && current.reviewCycle === input.reviewCycle && current.version === input.version && !exactMove(offeredMoves(current), input.move)) {
    return { applicantId: input.applicantId, result: "not_allowed", status: current.status, version: current.version };
  }
  return applyDecision(db, oneField(input.applicantId, input.version, input.reviewCycle, input.decisionId, input.move), {
    via: "staff",
    staffUserId: actor.id,
  });
}

export async function previewBulk(
  db: Db,
  actor: StaffGrant<"decisions.confirm">,
  input: { move: ConfirmMove; rows: readonly BulkRowSeen[] },
): Promise<BulkPreview | { ok: false; reason: "invalid" }> {
  void actor;
  if (input.rows.length > BULK_CAP) return { ok: false, reason: "invalid" };
  const found = await loadApplicants(db, input.rows.map((row) => row.applicantId));
  const rows = input.rows.map((row) => projectRow(found.get(row.applicantId), row, input.move));
  const counts = { apply: 0, stale: 0, notAllowed: 0, notFound: 0 };
  const languages = new Map<string, number>();
  for (const row of rows) {
    if (row.projection === "apply") {
      counts.apply += 1;
      const language = found.get(row.applicantId)?.language ?? "";
      languages.set(language, (languages.get(language) ?? 0) + 1);
    } else if (row.projection === "stale") counts.stale += 1;
    else if (row.projection === "not_allowed") counts.notAllowed += 1;
    else counts.notFound += 1;
  }
  const byLanguage = [...languages.entries()]
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([language, apply]) => ({ language, apply }));
  return { move: input.move, counts, byLanguage, rows };
}

export async function confirmBulk(
  db: Db,
  actor: StaffGrant<"decisions.confirm">,
  input: { move: ConfirmMove; rows: readonly BulkRowRef[] },
): Promise<{ rows: DecisionOutcome[] } | { ok: false; reason: "invalid" }> {
  if (input.rows.length > BULK_CAP) return { ok: false, reason: "invalid" };
  const found = await loadApplicants(db, input.rows.map((row) => row.applicantId));
  const delegated: DecisionRow[] = [];
  const delegatedAt: number[] = [];
  const blocked = new Map<number, DecisionOutcome>();
  input.rows.forEach((row, index) => {
    const current = found.get(row.applicantId);
    const fresh = Boolean(current && current.version === row.version && current.reviewCycle === row.reviewCycle);
    if (current && fresh && !exactMove(offeredMoves(current), input.move)) {
      blocked.set(index, { applicantId: row.applicantId, result: "not_allowed", status: current.status, version: current.version });
      return;
    }
    delegated.push(oneField(row.applicantId, row.version, row.reviewCycle, row.decisionId, input.move));
    delegatedAt.push(index);
  });
  const applied = delegated.length
    ? await applyDecisions(db, delegated, { via: "staff", staffUserId: actor.id })
    : { outcomes: [] as DecisionOutcome[] };
  return {
    rows: input.rows.map((row, index) => {
      const refused = blocked.get(index);
      if (refused) return refused;
      const at = delegatedAt.indexOf(index);
      return applied.outcomes[at] ?? { applicantId: row.applicantId, result: "not_found" };
    }),
  };
}

function projectRow(current: Applicant | undefined, row: BulkRowSeen, move: ConfirmMove): BulkPreview["rows"][number] {
  if (!current) return { applicantId: row.applicantId, fullName: "", projection: "not_found", to: null };
  if (current.version !== row.version || current.reviewCycle !== row.reviewCycle) {
    return { applicantId: row.applicantId, fullName: current.fullName, projection: "stale", to: null };
  }
  if (!exactMove(offeredMoves(current), move)) {
    return { applicantId: row.applicantId, fullName: current.fullName, projection: "not_allowed", to: null };
  }
  return { applicantId: row.applicantId, fullName: current.fullName, projection: "apply", to: move.to };
}

async function loadApplicants(db: Db, ids: readonly string[]): Promise<Map<string, Applicant>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();
  const rows = await db.select().from(applicants).where(inArray(applicants.id, unique));
  return new Map(rows.map((row) => [row.id, row]));
}

function oneField(applicantId: string, version: number, reviewCycle: number, decisionId: string, move: ConfirmMove): DecisionRow {
  return {
    applicantId,
    version,
    reviewCycle,
    decisionId,
    ...(move.field === "reviewDecision" ? { reviewDecision: move.value } : { interviewOutcome: move.value }),
  };
}

function exactMove(moves: readonly ConfirmMove[], move: ConfirmMove): boolean {
  return moves.some((item) => item.field === move.field && item.value === move.value && item.to === move.to);
}

function isMailStatus(status: Status): status is "rejected" | "online_offered" | "accepted" | "interview_yes" {
  return status === "rejected" || status === "online_offered" || status === "accepted" || status === "interview_yes";
}
