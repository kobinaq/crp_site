"use client";

import { useState } from "react";
import { useActionState } from "react";
import { confirmDecisionAction, previewDecisionAction, type ConfirmFormState } from "@/app/admin/(console)/records/applicants/[id]/actions";
import { pill, quiet } from "@/components/admin/marks";
import type { ApplicantReview } from "@/lib/admin/records";
import type { QueueName } from "@/lib/review/queue";
import type { ConfirmMove } from "@/lib/sync";

const NOTICE: Record<string, string> = {
  forbidden: "Your role cannot confirm a decision.",
  invalid: "That decision could not be read.",
  stale: "This page is out of date. Reload it before confirming.",
  not_allowed: "That move is not available.",
  not_found: "That applicant was not found.",
  conflict: "That decision was already used for a different request.",
  unchanged: "The status did not change.",
  replayed: "That decision was already confirmed.",
  staff_held: "The spreadsheet row is held.",
  staff_kept: "The spreadsheet row already matches.",
};

export function DecisionPanel({
  review,
  queue,
  canConfirm,
  decisionId,
  statusLabel,
}: {
  review: ApplicantReview;
  queue: "" | QueueName;
  canConfirm: boolean;
  decisionId: string;
  statusLabel: Readonly<Record<string, string>>;
}) {
  const [index, setIndex] = useState(0);
  const [preview, setPreview] = useState<{ key: string; subject: string; html: string; notice: string } | null>(null);
  const [pending, setPending] = useState(false);
  const [confirmState, confirm, confirmPending] = useActionState(confirmDecisionAction, null as ConfirmFormState);
  const move = review.offeredMoves[index];
  const key = move ? moveKey(move) : "";
  const ready = Boolean(preview && preview.key === key && preview.html);

  async function onPreview() {
    if (!move) return;
    setPending(true);
    const result = await previewDecisionAction({ applicantId: review.id, move });
    setPending(false);
    if (result.result === "ready") setPreview({ key, subject: result.subject, html: result.html, notice: "" });
    else setPreview({ key, subject: "", html: "", notice: NOTICE[result.result] ?? "Preview failed." });
  }

  return (
    <div className="grid gap-5">
      {review.conflicts.map((conflict) => (
        <p key={conflict.decisionId} className="rounded-3xl bg-cream px-4 py-3 text-sm leading-6">
          Spreadsheet says {statusLabel[conflict.sheetTarget] || "nothing"}. The staff decision {statusLabel[conflict.heldStatus] || conflict.heldStatus} stands. The spreadsheet row was not applied.
        </p>
      ))}
      <div>
        <h2 className="text-lg font-semibold">Sheet</h2>
        <dl className="mt-3 grid gap-3">
          <SheetFact term="Review decision" value={review.reviewDecision} />
          <SheetFact term="Reviewer" value={review.reviewer} />
          <SheetFact term="Review date" value={review.reviewDate} />
          <SheetFact term="Review notes" value={review.reviewNotes} />
          <SheetFact term="Interview outcome" value={review.interviewOutcome} />
          <SheetFact term="Interview date" value={review.interviewDate} />
          <SheetFact term="Interview notes" value={review.interviewNotes} />
        </dl>
      </div>
      <div>
        <h2 className="text-lg font-semibold">Decision</h2>
        {review.offeredMoves.length === 0 ? <p className="mt-2 text-sm text-black/60">No moves from this status.</p> : canConfirm ? (
          <fieldset className="mt-3 grid gap-2">
            <legend className="sr-only">Offered moves</legend>
            {review.offeredMoves.map((item, itemIndex) => (
              <label key={moveKey(item)} className="flex items-center gap-2 text-sm">
                <input type="radio" name="offered-move" checked={itemIndex === index} onChange={() => setIndex(itemIndex)} />
                {moveText(item, statusLabel)}
              </label>
            ))}
          </fieldset>
        ) : (
          <ul className="mt-3 grid gap-1 text-sm">
            {review.offeredMoves.map((item) => <li key={moveKey(item)}>{moveText(item, statusLabel)}</li>)}
          </ul>
        )}
      </div>
      {canConfirm && move ? (
        <div className="grid gap-3">
          <button className={quiet} type="button" onClick={onPreview} disabled={pending}>{pending ? "Previewing" : "Preview"}</button>
          {preview && preview.key === key && preview.html ? (
            <div>
              <p className="text-sm font-semibold">{preview.subject}</p>
              <iframe title="Email preview" sandbox="" srcDoc={preview.html} className="mt-2 h-80 w-full rounded-3xl border border-black/10 bg-white" />
            </div>
          ) : null}
          {preview && preview.key === key && preview.notice ? <p className="text-sm">{preview.notice}</p> : null}
          <form action={confirm} className="grid gap-3">
            <input type="hidden" name="applicantId" value={review.id} />
            <input type="hidden" name="version" value={review.version} />
            <input type="hidden" name="reviewCycle" value={review.reviewCycle} />
            <input type="hidden" name="decisionId" value={decisionId} />
            <input type="hidden" name="queue" value={queue} />
            <input type="hidden" name="field" value={move.field} />
            <input type="hidden" name="value" value={move.value} />
            <input type="hidden" name="to" value={move.to} />
            <button className={pill} type="submit" disabled={!ready || confirmPending}>Confirm</button>
          </form>
          {confirmState ? <p className="text-sm">{NOTICE[confirmState.result]}</p> : null}
        </div>
      ) : null}
    </div>
  );
}

function moveKey(move: ConfirmMove): string {
  return `${move.field}:${move.value}:${move.to}`;
}

function moveText(move: ConfirmMove, statusLabel: Readonly<Record<string, string>>): string {
  const action = move.field === "reviewDecision"
    ? (move.value === "accept" ? "Accept" : "Reject")
    : (move.value === "yes" ? "Interview yes" : "Interview no");
  return `${action} to ${statusLabel[move.to] ?? move.to}`;
}

function SheetFact({ term, value }: { term: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-black/50">{term}</dt>
      <dd className="mt-1 whitespace-pre-wrap text-sm">{value || "Not given"}</dd>
    </div>
  );
}
