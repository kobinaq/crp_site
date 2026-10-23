"use client";

import { useActionState, useState } from "react";
import { assignReviewAction, saveReviewAction, type AssignFormState, type ReviewFormState } from "@/app/admin/(console)/records/applicants/[id]/actions";
import { AdminSelect } from "@/components/admin/AdminSelect";
import { Button } from "@/components/admin/Button";
import { area, card, field } from "@/components/admin/marks";
import type { ApplicantReview, ReviewerOption } from "@/lib/admin/records";
import { RECOMMENDATIONS, RUBRIC, isRecommendation, retiredScoreKeys } from "@/lib/review/rubric";

const SAVE: Record<string, string> = {
  saved: "Saved.",
  forbidden: "You don't have permission to save a review.",
  invalid: "Not saved. Check the scores and the note.",
  not_found: "That applicant was not found.",
  stale_cycle: "This applicant moved to a new review round. Reload the page.",
};

const ASSIGN: Record<string, string> = {
  saved: "Saved.",
  forbidden: "You don't have permission to assign a reviewer.",
  invalid: "Not saved. Reload the page and try again.",
  not_found: "That applicant was not found.",
  conflict: "Someone else changed this. Reload the page and try again.",
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
        <h2 className="text-lg font-semibold">Assigned to</h2>
        <p className="mt-2 text-sm">{review.assignedStaff?.name ?? "Unassigned"}</p>
        {canAssign ? <AssignForm key={review.id} review={review} options={options} /> : null}
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
        {canWrite ? <ScoreForm key={review.id} review={review} noteId={noteId} scores={mine?.scores ?? {}} recommendation={recommendation} /> : null}
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
        <li key={key}>Earlier question ({key.replaceAll("_", " ")}): {scores[key]}</li>
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
  const [note, setNote] = useState("");
  const [cleared, setCleared] = useState<ReviewFormState>(null);
  if (state?.result === "saved" && cleared !== state) {
    setCleared(state);
    setNote("");
  }
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
            key={`${review.id}:${criterion.id}:${scores[criterion.id] ?? ""}`}
            defaultValue={scores[criterion.id] ?? ""}
          />
        </label>
      ))}
      <label className="grid gap-1 text-sm font-semibold">
        Recommendation
        <AdminSelect
          name="recommendation"
          defaultValue={recommendation}
          options={[
            ...(recommendation ? [] : [{ value: "", label: "No recommendation yet" }]),
            ...RECOMMENDATIONS.map((item) => ({ value: item, label: RECOMMENDATION_LABEL[item] })),
          ]}
        />
      </label>
      <label className="grid gap-1 text-sm font-semibold">
        Note
        <textarea className={area} name="note" maxLength={4000} value={note} onChange={(event) => setNote(event.target.value)} />
      </label>
      <Button variant="primary" type="submit" disabled={pending}>{pending ? "Saving" : "Save"}</Button>
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
        <AdminSelect
          name="assigneeId"
          defaultValue={review.assignedStaff?.id ?? ""}
          options={[{ value: "", label: "Unassigned" }, ...options.map((person) => ({ value: person.id, label: person.name || person.email }))]}
        />
      </label>
      <Button variant="solid" type="submit" disabled={pending}>{pending ? "Saving" : "Assign"}</Button>
      {state ? <p className="text-sm">{ASSIGN[state.result]}</p> : null}
    </form>
  );
}
