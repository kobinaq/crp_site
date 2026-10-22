import { createHash } from "crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import { decisionReceipts, sheetConflicts, type Applicant, type Db, type Tx } from "@/lib/db";
import { recordEvent } from "@/lib/admin/events";
import { lockApplicant, transition, updateApplicant } from "@/lib/lifecycle";
import { loadEmailSources } from "@/lib/copy/read";
import { queueDecisionEmail } from "@/lib/webhooks";
import type { EmailSources } from "@/lib/copy/sources";
import {
  decisionSourceStatuses,
  offeredMoves,
  parseDate,
  targetStatus,
  type DecisionRow,
} from "@/lib/sync";

export type DecisionOrigin =
  | { readonly via: "sheet" }
  | { readonly via: "staff"; readonly staffUserId: string };

export type DecisionOutcome = {
  applicantId: string;
  result:
    | "applied"
    | "unchanged"
    | "stale"
    | "not_found"
    | "replayed"
    | "not_allowed"
    | "conflict"
    | "staff_held"
    | "staff_kept";
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
export async function applyDecision(db: Db, d: DecisionRow, origin: DecisionOrigin): Promise<DecisionOutcome> {
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
    if (origin.via === "staff") {
      if (d.version === undefined || d.version !== current.version) {
        return { applicantId: d.applicantId, result: "stale", status: current.status, version: current.version };
      }
      return staffApply(tx, d, current, origin.staffUserId, sources);
    }
    if (d.version !== undefined && d.version !== current.version) {
      return { applicantId: d.applicantId, result: "stale", status: current.status, version: current.version };
    }

    const target = targetStatus(d, current.track);
    const [staffReceipt] = await tx
      .select()
      .from(decisionReceipts)
      .where(and(
        eq(decisionReceipts.applicantId, current.id),
        eq(decisionReceipts.origin, "staff"),
        eq(decisionReceipts.reviewCycle, current.reviewCycle),
      ))
      .orderBy(desc(decisionReceipts.createdAt))
      .limit(1);
    if (staffReceipt) {
      // No receipt on keep or hold. A receipt would replay on the next tick and hide a later staff decision.
      const standing = staffReceipt.result.status;
      if (target === standing) {
        if (d.decisionId) {
          await tx.delete(sheetConflicts).where(and(
            eq(sheetConflicts.applicantId, current.id),
            eq(sheetConflicts.reviewCycle, current.reviewCycle),
            eq(sheetConflicts.decisionId, d.decisionId),
          ));
        }
        return { applicantId: current.id, result: "staff_kept", status: current.status, version: current.version };
      }
      if (d.decisionId) {
        await tx.insert(sheetConflicts).values({
          applicantId: current.id,
          reviewCycle: current.reviewCycle,
          decisionId: d.decisionId,
          sheetTarget: target ?? "",
          heldStatus: standing,
        }).onConflictDoUpdate({
          target: [sheetConflicts.applicantId, sheetConflicts.reviewCycle, sheetConflicts.decisionId],
          set: { sheetTarget: target ?? "", heldStatus: standing, updatedAt: new Date() },
        });
      }
      return { applicantId: current.id, result: "staff_held", status: current.status, version: current.version };
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

    const outcome = await sheetWrite(tx, d, current, columns, target, sources);
    if (d.decisionId) {
      await tx.insert(decisionReceipts).values({
        id: d.decisionId,
        applicantId: current.id,
        requestHash: decisionHash(d),
        result: { status: outcome.status ?? current.status, version: outcome.version ?? current.version },
        origin: "sheet",
        reviewCycle: current.reviewCycle,
      }).onConflictDoNothing();
    }
    return outcome;
  });
}

async function staffApply(
  tx: Tx,
  d: DecisionRow,
  current: Applicant,
  staffUserId: string,
  sources: EmailSources,
): Promise<DecisionOutcome> {
  const offered = offeredMoves(current).find((move) =>
    move.field === "reviewDecision"
      ? d.reviewDecision === move.value && d.interviewOutcome === undefined
      : d.interviewOutcome === move.value && d.reviewDecision === undefined,
  );
  if (!offered) {
    return { applicantId: current.id, result: "not_allowed", status: current.status, version: current.version };
  }
  const moved = await transition(tx, {
    applicantId: current.id,
    to: offered.to,
    actor: "staff",
    staffUserId,
    reason: "staff decision",
    allowFrom: decisionSourceStatuses(offered.to, d),
    patch: offered.to === "online_offered" ? { onlineOfferedAt: new Date() } : undefined,
  });
  if (!moved.ok) {
    return { applicantId: current.id, result: "not_allowed", status: current.status, version: current.version };
  }
  await queueDecisionEmail(tx, moved.applicant, offered.to, moved.version, sources);
  if (d.decisionId) {
    await tx.insert(decisionReceipts).values({
      id: d.decisionId,
      applicantId: current.id,
      requestHash: decisionHash(d),
      result: { status: offered.to, version: moved.version },
      origin: "staff",
      staffUserId,
      reviewCycle: current.reviewCycle,
    }).onConflictDoNothing();
  }
  await tx.delete(sheetConflicts).where(and(
    eq(sheetConflicts.applicantId, current.id),
    eq(sheetConflicts.reviewCycle, current.reviewCycle),
  ));
  if (d.decisionId) {
    await recordEvent(tx, staffUserId, {
      kind: "decision.confirmed",
      applicantId: current.id,
      from: moved.from,
      to: offered.to,
      decisionId: d.decisionId,
      version: moved.version,
    });
  }
  return { applicantId: current.id, result: "applied", status: offered.to, version: moved.version };
}

async function sheetWrite(
  tx: Tx,
  d: DecisionRow,
  current: Applicant,
  columns: {
    reviewDecision: DecisionRow["reviewDecision"];
    reviewNotes: string | undefined;
    reviewer: string | undefined;
    reviewDate: Date | undefined;
    interviewOutcome: DecisionRow["interviewOutcome"];
    interviewNotes: string | undefined;
    interviewDate: Date | undefined;
  },
  target: Applicant["status"] | null,
  sources: EmailSources,
): Promise<DecisionOutcome> {
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
      return { applicantId: current.id, result: "applied", status: target, version: moved.version };
    }
    // Decision columns are the team's notes; keep them even when the stage
    // itself may not move (e.g. a late review row for someone onboarding).
    const updated = await updateApplicant(tx, current.id, columns);
    return { applicantId: current.id, result: "not_allowed", status: updated?.status ?? current.status, version: updated?.version ?? current.version };
  }
  const updated = await updateApplicant(tx, current.id, columns);
  return { applicantId: current.id, result: "unchanged", status: updated?.status ?? current.status, version: updated?.version ?? current.version };
}

export async function applyDecisions(db: Db, rows: DecisionRow[], origin: DecisionOrigin): Promise<{
  outcomes: DecisionOutcome[];
  transitions: Record<string, string>;
}> {
  const outcomes: DecisionOutcome[] = [];
  const transitions: Record<string, string> = {};
  for (const d of rows) {
    const outcome = await applyDecision(db, d, origin);
    outcomes.push(outcome);
    if (outcome.result === "applied" && outcome.status) transitions[d.applicantId] = outcome.status;
  }
  return { outcomes, transitions };
}
