import Link from "next/link";
import { card } from "@/components/admin/marks";
import type { ApplicantReview } from "@/lib/admin/records";

export function ApplicantReviewView({ review }: { review: ApplicantReview }) {
  return (
    <div className="grid gap-6">
      <div>
        <Link className="text-sm font-semibold underline" href="/admin/records?list=applicants">Applicants</Link>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">{review.fullName}</h1>
        <p className="mt-1 text-sm text-black/70">{review.email}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Pill label={review.statusLabel} />
          <Pill label={review.track} />
          <Pill label={review.language} />
          <Pill label={`Cycle ${review.reviewCycle}`} />
        </div>
        <p className="mt-3 text-sm text-black/60">This page is read only. Resume links and identity documents are not shown.</p>
      </div>
      <section className="grid gap-4 desk:grid-cols-3">
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
        <article className={card}>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-black/60">Review</h2>
          <p className="mt-2 text-2xl font-semibold">{review.reviewDecision || "No decision"}</p>
          <p className="mt-1 text-sm text-black/70">{review.reviewer || "No reviewer"} {review.reviewDate}</p>
        </article>
      </section>
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
          <Fact term="Interview" value={[review.interviewOutcome, review.interviewDate].filter(Boolean).join(" ")} />
        </dl>
        <h3 className="mt-6 text-base font-semibold">Review notes</h3>
        <p className="mt-2 whitespace-pre-wrap text-sm leading-6">{review.reviewNotes || "No review notes."}</p>
        <h3 className="mt-6 text-base font-semibold">Interview notes</h3>
        <p className="mt-2 whitespace-pre-wrap text-sm leading-6">{review.interviewNotes || "No interview notes."}</p>
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
