"use client";

import { useActionState } from "react";
import { assignReviewAction, saveReviewAction, type AssignFormState, type ReviewFormState } from "@/app/admin/(console)/records/applicants/[id]/actions";
import { area, card, field, pill, quiet } from "@/components/admin/marks";
import type { ApplicantReview, ReviewerOption } from "@/lib/admin/records";
import { RECOMMENDATIONS, RUBRIC, isRecommendation, retiredScoreKeys } from "@/lib/review/rubric";

const SAVE: Record<string, string> = {
  saved: "Saved.",
  forbidden: "Your role cannot save a review.",
  invalid: "Check the scores and the note.",
  not_found: "That applicant was not found.",
  stale_cycle: "This review cycle is out of date. Reload the page.",
};

const ASSIGN: Record<string, string> = {
  saved: "Assignee updated.",
  forbidden: "Your role cannot assign a reviewer.",
  invalid: "That assignment could not be read.",
  not_found: "That applicant was not found.",
  conflict: "Someone else changed the assignee. Reload and try again.",
  invalid_assignee: "That person cannot review applications.",
};

const RECOMMENDATION_LABEL = { advance: "Advance", discuss: "Discuss", decline: "Decline" } as const;

export function ReviewEditor({
  review,
  canWrite,
  canAssign,
  reviewers,
  viewerId,
  noteId,
}: {
  review: ApplicantReview;
  canWrite: boolean;
  canAssign: boolean;
  reviewers: readonly ReviewerOption[];
  viewerId: string;
  noteId: string;
}) {
  const mine = review.positions.find((position) => position.authorId === viewerId);
  const recommendation = mine && isRecommendation(mine.recommendation) ? mine.recommendation : "";
  const options = review.assignedStaff && !reviewers.some((person) => person.id === review.assignedStaff?.id)
    ? [...reviewers, review.assignedStaff]
    : reviewers;
  return (
    <div className="grid gap-6">
      <section className={card}>
        <h2 className="text-lg font-semibold">Assignee</h2>
        <p className="mt-2 text-sm">{review.assignedStaff?.name ?? "Unassigned"}</p>
        {canAssign ? <AssignForm review={review} options={options} /> : null}
      </section>
      <section className={card}>
        <h2 className="text-lg font-semibold">Scores</h2>
        {review.positions.length === 0 ? <p className="mt-3 text-sm text-black/60">No scores yet.</p> : (
          <div className="mt-4 grid gap-4">
            {review.positions.map((position) => (
              <article key={position.authorId} className="rounded-3xl bg-cream px-4 py-3">
                <p className="text-sm font-semibold">{position.authorName} · {position.updatedAt}</p>
                <p className="mt-1 text-sm">{recommendationText(position.recommendation)}</p>
                <ScoreList scores={position.scores} />
              </article>
            ))}
          </div>
        )}
        {canWrite ? <ScoreForm review={review} noteId={noteId} scores={mine?.scores ?? {}} recommendation={recommendation} /> : null}
      </section>
      <section className={card}>
        <h2 className="text-lg font-semibold">Staff notes</h2>
        {review.notes.length === 0 ? <p className="mt-3 text-sm text-black/60">No staff notes yet.</p> : (
          <div className="mt-4 grid gap-3">
            {review.notes.map((note) => (
              <article key={note.id} className="rounded-3xl bg-cream px-4 py-3">
                <p className="text-sm font-semibold">{note.authorName} · {note.createdAt}</p>
                <p className="mt-1 whitespace-pre-wrap text-sm leading-6">{note.body}</p>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function ScoreList({ scores }: { scores: Readonly<Record<string, number>> }) {
  return (
    <ul className="mt-2 grid gap-1 text-sm">
      {RUBRIC.map((criterion) => (
        <li key={criterion.id}>{criterion.label}: {scores[criterion.id] ?? "Not scored"}</li>
      ))}
      {retiredScoreKeys(scores).map((key) => (
        <li key={key}>Retired {key}: {scores[key]}</li>
      ))}
    </ul>
  );
}

function ScoreForm({
  review,
  noteId,
  scores,
  recommendation,
}: {
  review: ApplicantReview;
  noteId: string;
  scores: Readonly<Record<string, number>>;
  recommendation: string;
}) {
  const [state, action, pending] = useActionState(saveReviewAction, null as ReviewFormState);
  return (
    <form action={action} className="mt-6 grid gap-3">
      <input type="hidden" name="applicantId" value={review.id} />
      <input type="hidden" name="reviewCycle" value={review.reviewCycle} />
      <input type="hidden" name="noteId" value={noteId} />
      {RUBRIC.map((criterion) => (
        <label key={criterion.id} className="grid gap-1 text-sm font-semibold">
          {criterion.label}
          <input
            className={field}
            name={`score-${criterion.id}`}
            type="number"
            min={criterion.min}
            max={criterion.max}
            step={1}
            defaultValue={scores[criterion.id] ?? ""}
          />
        </label>
      ))}
      <label className="grid gap-1 text-sm font-semibold">
        Recommendation
        <select className={field} name="recommendation" defaultValue={recommendation}>
          {recommendation ? null : <option value="">No recommendation yet</option>}
          {RECOMMENDATIONS.map((item) => <option key={item} value={item}>{RECOMMENDATION_LABEL[item]}</option>)}
        </select>
      </label>
      <label className="grid gap-1 text-sm font-semibold">
        Note
        <textarea className={area} name="note" maxLength={4000} />
      </label>
      <button className={pill} type="submit" disabled={pending}>{pending ? "Saving" : "Save"}</button>
      {state ? <p className="text-sm">{SAVE[state.result]}</p> : null}
    </form>
  );
}

function recommendationText(value: string): string {
  if (value === "advance" || value === "discuss" || value === "decline") return RECOMMENDATION_LABEL[value];
  return value || "No recommendation";
}

function AssignForm({ review, options }: { review: ApplicantReview; options: readonly ReviewerOption[] }) {
  const [state, action, pending] = useActionState(assignReviewAction, null as AssignFormState);
  return (
    <form action={action} className="mt-4 grid gap-3">
      <input type="hidden" name="applicantId" value={review.id} />
      <input type="hidden" name="expectedAssigneeId" value={review.assignedStaff?.id ?? ""} />
      <label className="grid gap-1 text-sm font-semibold">
        Reviewer
        <select className={field} name="assigneeId" defaultValue={review.assignedStaff?.id ?? ""}>
          <option value="">Unassigned</option>
          {options.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
        </select>
      </label>
      <button className={quiet} type="submit" disabled={pending}>{pending ? "Saving" : "Assign"}</button>
      {state ? <p className="text-sm">{ASSIGN[state.result]}</p> : null}
    </form>
  );
}
