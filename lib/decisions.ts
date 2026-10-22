import { createHash } from "crypto";
import { eq, sql } from "drizzle-orm";
import { decisionReceipts, type Db } from "@/lib/db";
import { lockApplicant, transition, updateApplicant } from "@/lib/lifecycle";
import { loadEmailSources } from "@/lib/copy/read";
import { queueDecisionEmail } from "@/lib/webhooks";
import {
  decisionSourceStatuses,
  parseDate,
  targetStatus,
  type DecisionRow,
} from "@/lib/sync";

export type DecisionOutcome = {
  applicantId: string;
  result: "applied" | "unchanged" | "stale" | "not_found" | "replayed" | "not_allowed" | "conflict";
  status?: string;
  version?: number;
};

export function decisionHash(d: DecisionRow): string {
  // Version changes when the system columns refresh; it is not a reviewer edit.
  const { decisionId: _decisionId, version: _version, ...rest } = d;
  void _decisionId;
  void _version;
  return createHash("sha256").update(JSON.stringify(rest, Object.keys(rest).sort())).digest("hex");
}

// One row, one transaction. The applicant is row-locked, so a webhook landing
// at the same moment waits its turn; the version check refuses a row the sheet
// built from an older view; the receipt lets a retried poll replay its stored
// result instead of re-applying it.
export async function applyDecision(db: Db, d: DecisionRow): Promise<DecisionOutcome> {
  const sources = await loadEmailSources();
  return db.transaction(async (tx) => {
    if (d.decisionId) {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${d.decisionId}, 0))`);
      const [receipt] = await tx.select().from(decisionReceipts).where(eq(decisionReceipts.id, d.decisionId));
      if (receipt) {
        if (receipt.applicantId !== d.applicantId || receipt.requestHash !== decisionHash(d)) {
          return { applicantId: d.applicantId, result: "conflict" };
        }
        return { applicantId: d.applicantId, result: "replayed", ...receipt.result };
      }
    }

    const current = await lockApplicant(tx, d.applicantId);
    if (!current) return { applicantId: d.applicantId, result: "not_found" };
    if (d.reviewCycle !== current.reviewCycle) {
      return { applicantId: d.applicantId, result: "stale", status: current.status, version: current.version };
    }
    if (d.version !== undefined && d.version !== current.version) {
      return { applicantId: d.applicantId, result: "stale", status: current.status, version: current.version };
    }

    const columns = {
      reviewDecision: d.reviewDecision,
      reviewNotes: d.reviewNotes,
      reviewer: d.reviewer,
      reviewDate: parseDate(d.reviewDate),
      interviewOutcome: d.interviewOutcome,
      interviewNotes: d.interviewNotes,
      interviewDate: parseDate(d.interviewDate),
    };

    const target = targetStatus(d, current.track);
    let outcome: DecisionOutcome;
    if (target && target !== current.status) {
      const moved = await transition(tx, {
        applicantId: current.id,
        to: target,
        actor: "excel",
        reason: d.reviewer ? `review sheet decision by ${d.reviewer}` : "review sheet decision",
        allowFrom: decisionSourceStatuses(target, d),
        patch: {
          ...columns,
          ...(target === "online_offered" ? { onlineOfferedAt: new Date() } : {}),
        },
      });
      if (moved.ok) {
        await queueDecisionEmail(tx, moved.applicant, target, moved.version, sources);
        outcome = { applicantId: current.id, result: "applied", status: target, version: moved.version };
      } else {
        // Decision columns are the team's notes; keep them even when the stage
        // itself may not move (e.g. a late review row for someone onboarding).
        const updated = await updateApplicant(tx, current.id, columns);
        outcome = { applicantId: current.id, result: "not_allowed", status: updated?.status ?? current.status, version: updated?.version ?? current.version };
      }
    } else {
      const updated = await updateApplicant(tx, current.id, columns);
      outcome = { applicantId: current.id, result: "unchanged", status: updated?.status ?? current.status, version: updated?.version ?? current.version };
    }

    if (d.decisionId) {
      await tx.insert(decisionReceipts).values({
        id: d.decisionId,
        applicantId: current.id,
        requestHash: decisionHash(d),
        result: { status: outcome.status ?? current.status, version: outcome.version ?? current.version },
      }).onConflictDoNothing();
    }
    return outcome;
  });
}

export async function applyDecisions(db: Db, rows: DecisionRow[]): Promise<{
  outcomes: DecisionOutcome[];
  transitions: Record<string, string>;
}> {
  const outcomes: DecisionOutcome[] = [];
  const transitions: Record<string, string> = {};
  for (const d of rows) {
    const outcome = await applyDecision(db, d);
    outcomes.push(outcome);
    if (outcome.result === "applied" && outcome.status) transitions[d.applicantId] = outcome.status;
  }
  return { outcomes, transitions };
}
