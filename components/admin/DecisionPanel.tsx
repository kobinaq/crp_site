"use client";

import { useRef, useState } from "react";
import { useActionState } from "react";
import { confirmDecisionAction, previewDecisionAction, type ConfirmFormState } from "@/app/admin/(console)/records/applicants/[id]/actions";
import { Button } from "@/components/admin/Button";
import { ResultLine } from "@/components/admin/ResultLine";
import type { ApplicantReview, RecordQuery } from "@/lib/admin/records";
import type { ConfirmMove } from "@/lib/sync";

const NOTICE: Record<string, string> = {
  forbidden: "You don't have permission to confirm a decision.",
  invalid: "Not saved. Reload the page and try again.",
  stale: "This page is out of date. Reload it before confirming.",
  not_allowed: "That change isn't available for this applicant.",
  not_found: "This applicant could not be found.",
  conflict: "Something else changed. Reload the page and try again.",
  unchanged: "The status did not change.",
  replayed: "That decision was already confirmed.",
  staff_held: "A staff decision is already in place.",
  staff_kept: "Already up to date.",
};

export function DecisionPanel({
  review,
  listQuery,
  canConfirm,
  decisionId,
  statusLabel,
}: {
  review: ApplicantReview;
  listQuery: RecordQuery;
  canConfirm: boolean;
  decisionId: string;
  statusLabel: Readonly<Record<string, string>>;
}) {
  return <DecisionBody key={review.id} review={review} listQuery={listQuery} canConfirm={canConfirm} decisionId={decisionId} statusLabel={statusLabel} />;
}

function DecisionBody({
  review,
  listQuery,
  canConfirm,
  decisionId,
  statusLabel,
}: {
  review: ApplicantReview;
  listQuery: RecordQuery;
  canConfirm: boolean;
  decisionId: string;
  statusLabel: Readonly<Record<string, string>>;
}) {
  const [index, setIndex] = useState(0);
  const [preview, setPreview] = useState<{ key: string; subject: string; html: string; notice: string } | null>(null);
  const [pending, setPending] = useState(false);
  const bounded = review.offeredMoves.length === 0 ? 0 : Math.min(index, review.offeredMoves.length - 1);
  const move = review.offeredMoves[bounded];
  const key = `${review.id}:${move ? moveKey(move) : ""}`;
  const ready = Boolean(preview && preview.key === key && preview.html);
  const request = useRef(0);

  async function onPreview() {
    if (!move) return;
    const requested = key;
    const ticket = ++request.current;
    setPending(true);
    try {
      const result = await previewDecisionAction({ applicantId: review.id, move });
      if (request.current !== ticket) return;
      if (result.result === "ready") setPreview({ key: requested, subject: result.subject, html: result.html, notice: "" });
      else setPreview({ key: requested, subject: "", html: "", notice: NOTICE[result.result] ?? "Preview failed." });
    } finally {
      if (request.current === ticket) setPending(false);
    }
  }

  return (
    <div className="grid gap-5">
      {review.conflicts.map((conflict) => (
        <p key={conflict.decisionId} className="rounded-3xl bg-cream px-4 py-3 text-sm leading-6">
          The spreadsheet says {statusLabel[conflict.sheetTarget] || "nothing"}, but the decision made here ({statusLabel[conflict.heldStatus] || conflict.heldStatus}) was kept.
        </p>
      ))}
      <div>
        <h2 className="text-lg font-semibold">Spreadsheet</h2>
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
        {review.offeredMoves.length === 0 ? <p className="mt-2 text-sm text-black/60">No decision to make at this stage.</p> : canConfirm ? (
          <fieldset className="mt-3 grid gap-2">
            <legend className="sr-only">Decisions</legend>
            {review.offeredMoves.map((item, itemIndex) => (
              <label key={moveKey(item)} className="flex items-center gap-2 text-sm">
                <input type="radio" name="offered-move" checked={itemIndex === bounded} onChange={() => setIndex(itemIndex)} />
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
          <Button variant="outline" type="button" onClick={onPreview} disabled={pending}>{pending ? "Previewing" : "Preview"}</Button>
          {preview && preview.key === key && preview.html ? (
            <div>
              <p className="text-sm font-semibold">{preview.subject}</p>
              <iframe title="Email preview" sandbox="" srcDoc={preview.html} className="mt-2 h-80 w-full rounded-3xl border border-black/10 bg-white" />
            </div>
          ) : null}
          {preview && preview.key === key && preview.notice ? <p className="text-sm">{preview.notice}</p> : null}
          <ConfirmForm key={review.id} review={review} listQuery={listQuery} decisionId={decisionId} move={move} ready={ready} />
        </div>
      ) : null}
    </div>
  );
}

function ConfirmForm({
  review,
  listQuery,
  decisionId,
  move,
  ready,
}: {
  review: ApplicantReview;
  listQuery: RecordQuery;
  decisionId: string;
  move: ConfirmMove;
  ready: boolean;
}) {
  const [confirmState, confirm, confirmPending] = useActionState(confirmDecisionAction, null as ConfirmFormState);
  return (
    <form action={confirm} className="grid gap-3">
      <input type="hidden" name="applicantId" value={review.id} />
      <input type="hidden" name="version" value={review.version} />
      <input type="hidden" name="reviewCycle" value={review.reviewCycle} />
      <input type="hidden" name="decisionId" value={decisionId} />
      <input type="hidden" name="q" value={listQuery.q} />
      <input type="hidden" name="status" value={listQuery.status} />
      <input type="hidden" name="track" value={listQuery.track} />
      <input type="hidden" name="language" value={listQuery.language} />
      <input type="hidden" name="cycle" value={listQuery.cycle} />
      <input type="hidden" name="age" value={listQuery.age} />
      <input type="hidden" name="queue" value={listQuery.queue} />
      <input type="hidden" name="attention" value={listQuery.attention} />
      <input type="hidden" name="page" value={listQuery.page} />
      <input type="hidden" name="field" value={move.field} />
      <input type="hidden" name="value" value={move.value} />
      <input type="hidden" name="to" value={move.to} />
      <Button variant="primary" type="submit" disabled={!ready || confirmPending}>{confirmPending ? "Confirming" : "Confirm"}</Button>
      <ResultLine message={confirmState ? NOTICE[confirmState.result] : null} tone="warn" />
    </form>
  );
}

function moveKey(move: ConfirmMove): string {
  return `${move.field}:${move.value}:${move.to}`;
}

function moveText(move: ConfirmMove, statusLabel: Readonly<Record<string, string>>): string {
  const action = move.field === "reviewDecision"
    ? (move.value === "accept" ? "Accept" : "Reject")
    : (move.value === "yes" ? "Passed interview" : "Did not pass interview");
  return `${action}: ${statusLabel[move.to] ?? move.to}`;
}

function SheetFact({ term, value }: { term: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-black/50">{term}</dt>
      <dd className="mt-1 whitespace-pre-wrap text-sm">{sheetValue(value)}</dd>
    </div>
  );
}

const SHEET_VALUE: Readonly<Record<string, string>> = { accept: "Accept", reject: "Reject", yes: "Yes", no: "No" };

function sheetValue(value: string): string {
  if (!value) return "Not given";
  return SHEET_VALUE[value] ?? value;
}
