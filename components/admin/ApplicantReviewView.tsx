import Link from "next/link";
import { DecisionPanel } from "@/components/admin/DecisionPanel";
import { ReviewEditor } from "@/components/admin/ReviewEditor";
import { ReviewKeys } from "@/components/admin/ReviewKeys";
import { card } from "@/components/admin/marks";
import { STATUS_LABEL } from "@/lib/admin/dashboard";
import { queueListHref, type ApplicantReview, type ReviewerOption } from "@/lib/admin/records";
import type { QueueName } from "@/lib/review/queue";

export function ApplicantReviewView({
  review,
  queue,
  canWrite,
  canAssign,
  canConfirm,
  reviewers,
  viewerId,
  noteId,
  decisionId,
}: {
  review: ApplicantReview;
  queue: "" | QueueName;
  canWrite: boolean;
  canAssign: boolean;
  canConfirm: boolean;
  reviewers: readonly ReviewerOption[];
  viewerId: string;
  noteId: string;
  decisionId: string;
}) {
  return (
    <div className="grid gap-6">
      <ReviewKeys previous={review.prevHref} next={review.nextHref} />
      <div>
        <Link className="text-sm font-semibold underline" href={queueListHref(queue)}>Applicants</Link>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">{review.fullName}</h1>
        <p className="mt-1 text-sm text-black/70">{review.email}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Pill label={review.statusLabel} />
          <Pill label={review.track} />
          <Pill label={review.language} />
          <Pill label={`Cycle ${review.reviewCycle}`} />
        </div>
        <div className="mt-4 flex flex-wrap gap-4 text-sm font-semibold">
          {review.prevHref ? <Link className="underline" href={review.prevHref}>Previous</Link> : <span className="text-black/40">Previous</span>}
          {review.nextHref ? <Link className="underline" href={review.nextHref}>Next</Link> : <span className="text-black/40">Next</span>}
        </div>
        <p className="mt-3 text-sm text-black/60">Resume links and identity documents are not shown.</p>
      </div>
      <div className="grid items-start gap-6 desk:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="order-2 grid gap-6 desk:order-1">
          <section className="grid gap-4 desk:grid-cols-2">
            <article className={card}>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-black/60">VideoAsk</h2>
              <p className="mt-2 text-2xl font-semibold">{review.videoAsk}</p>
              <p className="mt-1 text-sm text-black/70">{review.round1CompletedAt || "No completion time"}</p>
            </article>
            <article className={card}>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-black/60">Identity</h2>
              <p className="mt-2 text-2xl font-semibold">{review.identity}</p>
              <p className="mt-1 text-sm text-black/70">{review.identityCheckedAt || "Not checked"}</p>
            </article>
          </section>
          <ReviewEditor review={review} canWrite={canWrite} canAssign={canAssign} reviewers={reviewers} viewerId={viewerId} noteId={noteId} />
          <section className={card}>
            <h2 className="text-lg font-semibold">Answers</h2>
            <dl className="mt-4 grid gap-4 desk:grid-cols-2">
              <Fact term="Date of birth" value={review.dob} />
              <Fact term="Age" value={String(review.age)} />
              <Fact term="Phone" value={review.phone} />
              <Fact term="Nationality" value={review.nationality} />
              <Fact term="Based in" value={review.basedIn} />
              <Fact term="Skills" value={review.skills} />
              <Fact term="Can travel" value={review.canTravel} />
              <Fact term="Valid passport" value={review.hasValidPassport} />
              <Fact term="Submitted" value={review.createdAt} />
              <Fact term="Documents" value={review.docsStatus} />
              <Fact term="Online offered" value={review.onlineOfferedAt} />
            </dl>
          </section>
          <section className={card}>
            <h2 className="text-lg font-semibold">Timeline</h2>
            {review.events.length === 0 ? <p className="mt-3 text-sm text-black/60">No events yet.</p> : (
              <ol className="mt-4 grid gap-3">
                {review.events.map((event, index) => (
                  <li key={`${event.at}-${index}`} className="rounded-3xl bg-cream px-4 py-3">
                    <p className="text-sm font-semibold">{event.at} · {event.actor}</p>
                    <p className="mt-1 text-sm">{event.from || "start"} to {event.to || "same"}</p>
                    <p className="mt-1 text-sm text-black/70">{event.reason}</p>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
        <aside className={`${card} order-1 desk:sticky desk:top-6 desk:order-2`}>
          <DecisionPanel review={review} queue={queue} canConfirm={canConfirm} decisionId={decisionId} statusLabel={STATUS_LABEL} />
        </aside>
      </div>
    </div>
  );
}

function Pill({ label }: { label: string }) {
  return <span className="rounded-full bg-lime px-3 py-1 text-sm font-semibold">{label}</span>;
}

function Fact({ term, value }: { term: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-black/50">{term}</dt>
      <dd className="mt-1 text-sm">{value || "Not given"}</dd>
    </div>
  );
}
