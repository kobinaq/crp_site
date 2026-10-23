import { DecisionPanel } from "@/components/admin/DecisionPanel";
import { DocumentReveal, PrivateMedia } from "@/components/admin/PrivateMedia";
import { EmailLine } from "@/components/admin/EmailLine";
import { RecordChrome } from "@/components/admin/RecordChrome";
import { ReviewEditor } from "@/components/admin/ReviewEditor";
import { When } from "@/components/admin/When";
import { card } from "@/components/admin/marks";
import { STATUS_LABEL } from "@/lib/admin/dashboard";
import { cycleLabel, languageLabel, trackLabel } from "@/lib/admin/labels";
import { recordsHref } from "@/lib/admin/return";
import type { ApplicantReview, RecordQuery, ReviewerOption } from "@/lib/admin/records";
import type { AnswerView } from "@/lib/holdings";

export function ApplicantReviewView({
  review,
  listQuery,
  canWrite,
  canAssign,
  canConfirm,
  reviewers,
  viewerId,
  noteId,
  decisionId,
}: {
  review: ApplicantReview;
  listQuery: RecordQuery;
  canWrite: boolean;
  canAssign: boolean;
  canConfirm: boolean;
  reviewers: readonly ReviewerOption[];
  viewerId: string;
  noteId: string;
  decisionId: string;
}) {
  const cycle = cycleLabel(review.reviewCycle);
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      <RecordChrome
        backHref={recordsHref(listQuery)}
        backLabel="Back to applicants"
        title={review.fullName}
        previous={review.prevHref}
        next={review.nextHref}
        meta={(
          <>
            <EmailLine email={review.email} />
            <div className="mt-3 flex flex-wrap gap-2">
              <Pill label={review.statusLabel} />
              <Pill label={trackLabel(review.track)} />
              <Pill label={languageLabel(review.language)} />
              {cycle ? <Pill label={cycle} /> : null}
            </div>
          </>
        )}
      />
      <div className="grid items-start gap-6 desk:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="order-2 grid gap-6 desk:order-1">
          <section className="grid gap-4 desk:grid-cols-2">
            <article className={card}>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-black/60">Video answers</h2>
              <p className="mt-2 text-2xl font-semibold">{review.videoAsk === "complete" ? "Complete" : "Not complete"}</p>
              <p className="mt-1 text-sm text-black/70">{review.round1CompletedAt ? <When stamp={review.round1CompletedAt} /> : "No completion time"}</p>
            </article>
            <article className={card}>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-black/60">Identity</h2>
              <p className="mt-2 text-2xl font-semibold">{identityWords(review.identity)}</p>
              <p className="mt-1 text-sm text-black/70">{review.identityCheckedAt ? <When stamp={review.identityCheckedAt} /> : "Not checked"}</p>
              {review.documents.length === 0 ? <p className="mt-3 text-sm text-black/60">No document on file.</p> : review.documents.map((document) => (
                <DocumentReveal key={`${review.id}:${document.documentId}`} applicantId={review.id} view={document} />
              ))}
            </article>
          </section>
          <ReviewEditor review={review} canWrite={canWrite} canAssign={canAssign} reviewers={reviewers} viewerId={viewerId} noteId={noteId} />
          <section className={card}>
            <h2 className="text-lg font-semibold">Answers</h2>
            {review.answers.length === 0 ? <p className="mt-3 text-sm text-black/60">No answers yet.</p> : (
              <div className="mt-4 grid gap-4">
                {review.answers.map((answer) => <AnswerBlock key={`${review.id}:${answer.questionId}`} applicantId={review.id} view={answer} />)}
              </div>
            )}
            <dl className="mt-4 grid gap-4 desk:grid-cols-2">
              <Fact term="Date of birth" value={review.dob} />
              <Fact term="Age" value={String(review.age)} />
              <Fact term="Phone" value={review.phone} />
              <Fact term="Nationality" value={review.nationality} />
              <Fact term="Based in" value={review.basedIn} />
              <Fact term="Skills" value={review.skills} />
              <Fact term="Can travel" value={review.canTravel} />
              <Fact term="Valid passport" value={review.hasValidPassport} />
              <Fact term="Submitted" value={review.createdAt} when />
              <Fact term="Documents" value={documentWords(review.docsStatus)} />
              <Fact term="Offered online place" value={review.onlineOfferedAt} when />
            </dl>
          </section>
          <section className={card}>
            <h2 className="text-lg font-semibold">Timeline</h2>
            {review.events.length === 0 ? <p className="mt-3 text-sm text-black/60">No events yet.</p> : (
              <ol className="mt-4 grid gap-3">
                {review.events.map((event, index) => (
                  <li key={`${event.at}-${index}`} className="rounded-3xl bg-cream px-4 py-3">
                    <p className="text-sm font-semibold"><When stamp={event.at} /> · {event.actor}</p>
                    <p className="mt-1 text-sm">{statusName(event.from, "start")} to {statusName(event.to, "same")}</p>
                    <p className="mt-1 text-sm text-black/70">{event.reason}</p>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
        <aside className={`${card} order-1 desk:sticky desk:top-36 desk:order-2 desk:max-h-[calc(100dvh-12rem)] desk:overflow-y-auto`}>
          <DecisionPanel review={review} listQuery={listQuery} canConfirm={canConfirm} decisionId={decisionId} statusLabel={STATUS_LABEL} />
        </aside>
      </div>
    </div>
  );
}

function statusName(value: string, empty: string): string {
  if (!value) return empty;
  if (Object.hasOwn(STATUS_LABEL, value)) return STATUS_LABEL[value as keyof typeof STATUS_LABEL];
  return value.replaceAll("_", " ").replace(/^\w/, (letter) => letter.toUpperCase());
}

const IDENTITY_WORDS: Record<string, string> = {
  none: "Not started",
  pending: "In progress",
  verified: "Confirmed",
  failed: "Failed",
  review: "Needs a manual look",
};

function identityWords(value: string): string {
  if (!value) return "Not started";
  return IDENTITY_WORDS[value] ?? value.replaceAll("_", " ").replace(/^\w/, (letter) => letter.toUpperCase());
}

function documentWords(value: string): string {
  if (value === "submitted") return "Sent in";
  return value.replaceAll("_", " ").replace(/^\w/, (letter) => letter.toUpperCase());
}

function Pill({ label }: { label: string }) {
  return <span className="rounded-full bg-lime px-3 py-1 text-sm font-semibold">{label}</span>;
}

function AnswerBlock({ applicantId, view }: { applicantId: string; view: AnswerView }) {
  if (view.kind === "text") {
    return (
      <div>
        <h3 className="text-sm font-semibold">{view.title}</h3>
        <p className="mt-1 text-sm">{view.text || "Not given"}</p>
      </div>
    );
  }
  if (view.kind === "poll") {
    return (
      <div>
        <h3 className="text-sm font-semibold">{view.title}</h3>
        <p className="mt-1 text-sm">{view.label || "Not given"}</p>
      </div>
    );
  }
  const copying = view.medium === "video" ? "Video is still copying" : "Audio is still copying";
  const gone = view.medium === "video" ? "Video file is no longer available" : "Audio file is no longer available";
  return (
    <div>
      <h3 className="text-sm font-semibold">{view.title}</h3>
      <p className="mt-1 text-sm">{view.transcript || "No transcript yet"}</p>
      {view.playback === "copying" ? <p className="mt-2 text-sm text-black/70">{copying}</p> : null}
      {view.playback === "unavailable" ? <p className="mt-2 text-sm text-black/70">{gone}</p> : null}
      {view.playback === "ready" ? <PrivateMedia applicantId={applicantId} view={view} /> : null}
    </div>
  );
}

function Fact({ term, value, when = false }: { term: string; value: string; when?: boolean }) {
  const shown = when && value ? <When stamp={value} /> : value || "Not given";
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-black/50">{term}</dt>
      <dd className="mt-1 break-words text-sm">{shown}</dd>
    </div>
  );
}
