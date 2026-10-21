import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import {
  applicants,
  consentLog,
  type Applicant,
  type Db,
  type Store,
} from "@/lib/db";
import { appUrl } from "@/lib/config";
import {
  ageFromDob,
  minApplicantAge,
  maxApplicantAge,
  CONSENT_VERSION,
  type ApplicationInput,
} from "@/lib/capture";
import { applicationEmail, identityRetryEmail, receivedEmail } from "@/lib/emails";
import { getIdentityProvider } from "@/lib/identity";
import { enqueue, enqueueEmail } from "@/lib/jobs";
import { videoaskLink } from "@/lib/videoask";
import { lockApplicant, recordCreation, transition, updateApplicant } from "@/lib/lifecycle";
import { reconcileIdentity } from "@/lib/application-status";

// The applicant journey as database operations. Each function is one unit of
// work: everything that must be true together is written in one transaction,
// and every email is queued in that same transaction rather than sent inline.

export type CreateApplicationResult =
  | { ok: true; id: string; round1Link: string | null }
  | { ok: false; reason: "ineligible" | "existing" };

export async function createApplication(db: Db, input: ApplicationInput): Promise<CreateApplicationResult> {
  if (input.consent !== true) throw new Error("explicit consent required");
  const { fullName, email, dob, language, track, phone, nationality, basedIn, skills, canTravel, hasValidPassport } = input;

  // Silent server-side backstop for the 19-26 window; the form gates too.
  const age = ageFromDob(dob);
  if (age < minApplicantAge() || age > maxApplicantAge()) return { ok: false, reason: "ineligible" };

  const id = randomUUID();
  const round1Link = videoaskLink(id);

  return db.transaction(async (tx) => {
    const [inserted] = await tx
      .insert(applicants)
      .values({
        id,
        fullName,
        email,
        dob,
        age,
        language,
        track,
        phone,
        nationality,
        basedIn,
        skills,
        canTravel: track === "in_person" ? Boolean(canTravel) : null,
        hasValidPassport: track === "in_person" ? Boolean(hasValidPassport) : null,
        round1Link,
      })
      .onConflictDoNothing({ target: applicants.email })
      .returning();
    // Knowing an email address is not proof of ownership. Existing applicants
    // get a resume link sent to that address instead (see requestResumeLink).
    if (!inserted) return { ok: false, reason: "existing" } as const;

    await tx.insert(consentLog).values({ applicantId: id, kind: "data_processing", version: CONSENT_VERSION });
    await recordCreation(tx, inserted, "applicant", "application submitted");
    // Validate/render the acknowledgement inside the transaction; the worker
    // replaces its CTA with a short-lived confirmation link at delivery.
    await enqueue(tx, { kind: "email", dedupeKey: `email:application:${id}`, applicantId: id,
      payload: { to: email, name: fullName, language, template: "application", subject: applicationEmail(fullName, null, language).subject } });
    return { ok: true, id, round1Link } as const;
  });
}

// Sends a single-use sign-in link to an existing applicant. Returns the same
// shape whether or not the address is known, so the form cannot be used to
// probe which emails have applied.
export async function requestResumeLink(db: Db, email: string): Promise<{ queued: boolean }> {
  return db.transaction(async (tx) => {
    const [applicant] = await tx.select().from(applicants).where(eq(applicants.email, email));
    if (!applicant) return { queued: false };
    // The worker mints the token immediately before delivery, not while queued.
    await enqueue(tx, {
      kind: "email", dedupeKey: `email:resume:${randomUUID()}`, applicantId: applicant.id,
      payload: { template: "resume", to: applicant.email, name: applicant.fullName, language: applicant.language },
    });
    return { queued: true };
  });
}

// Where an applicant should be sent when they come back with a valid session.
export function nextStepUrl(applicant: Applicant): string {
  const site = appUrl();
  switch (applicant.status) {
    case "submitted":
      return videoaskLink(applicant.id) ?? `${site}/apply/complete`;
    case "round1_complete":
    case "id_failed":
      return applicant.track === "in_person"
        ? applicant.identityLink ?? `${site}/api/apply/verify`
        : `${site}/apply/complete`;
    default:
      return `${site}/apply/complete`;
  }
}

// Advances the pipeline the same way the VideoAsk webhook does. Safe to call
// from the thank-you redirect (when the webhook is still in flight) and from
// the webhook itself: transitions are idempotent and identity is only queued
// when a Didit link is still missing.
export async function applyVideoaskCompletion(tx: Store, applicantId: string): Promise<{
  outcome: string;
  advanced: boolean;
  status?: Applicant["status"];
  applicant?: Applicant;
}> {
  const current = await lockApplicant(tx, applicantId);
  if (!current) return { outcome: "unknown applicant", advanced: false };
  if (!current.emailVerifiedAt) return { outcome: "email unverified", advanced: false };

  let applicant = current;
  let advanced = false;

  if (applicant.status === "submitted") {
    const moved = await transition(tx, {
      applicantId: applicant.id,
      to: "round1_complete",
      actor: "videoask",
      reason: "application form completed",
      allowFrom: ["submitted"],
      patch: { round1CompletedAt: new Date() },
    });
    if (!moved.ok) {
      return {
        outcome: `ignored:${moved.code}`,
        advanced: false,
        status: moved.applicant?.status,
        applicant: moved.applicant,
      };
    }
    applicant = moved.applicant;
    advanced = true;
  }

  if (applicant.track === "online") {
    if (applicant.status === "round1_complete") {
      const review = await transition(tx, {
        applicantId: applicant.id,
        to: "under_review",
        actor: "videoask",
        reason: "online application ready for review",
        allowFrom: ["round1_complete"],
      });
      if (review.ok) {
        await enqueueEmail(tx, `email:received:${applicant.id}:${review.applicant.reviewCycle}`, {
          to: review.applicant.email,
          ...receivedEmail(review.applicant.fullName, review.applicant.language),
        }, "received", applicant.id);
        return { outcome: "advanced", advanced: true, status: review.to, applicant: review.applicant };
      }
    }
    return {
      outcome: advanced ? "advanced" : "already complete",
      advanced,
      status: applicant.status,
      applicant,
    };
  }

  const reconciled = await reconcileIdentity(tx, applicant.id);
  const [after] = await tx.select().from(applicants).where(eq(applicants.id, applicant.id));
  if (!after) return { outcome: "unknown applicant", advanced: false };
  if (reconciled && after.status === "under_review") {
    await enqueueEmail(tx, `email:received:${after.id}:${after.reviewCycle}`, {
      to: after.email,
      ...receivedEmail(after.fullName, after.language),
    }, "received", after.id);
    return { outcome: "advanced", advanced: true, status: after.status, applicant: after };
  }
  if (after.status === "id_failed" || (after.status === "round1_complete" && !after.identityLink)) {
    await scheduleIdentitySession(tx, after.id, after.version);
  }
  return {
    outcome: advanced || reconciled ? "advanced" : "already complete",
    advanced: advanced || reconciled,
    status: after.status,
    applicant: after,
  };
}

// Creates (or reuses) the hosted identity session and stores it. Idempotent: an
// existing link is returned as is. The first Didit hand-off is the VideoAsk
// thank-you redirect (`/api/apply/verify?ref=…`); only identity retries email.
export async function provisionIdentitySession(db: Db, applicantId: string): Promise<{ url: string | null; created: boolean }> {
  const [existing] = await db.select().from(applicants).where(eq(applicants.id, applicantId));
  if (!existing?.emailVerifiedAt || existing.track === "online" || !["round1_complete", "id_failed"].includes(existing.status)) return { url: null, created: false };
  if (existing.identityLink) return { url: existing.identityLink, created: false };

  const callback = `${appUrl()}/apply/complete`;
  const session = await getIdentityProvider().createSession(existing.id, callback);
  if (!session) return { url: null, created: false };

  return db.transaction(async (tx) => {
    const [fresh] = await tx.select().from(applicants).where(eq(applicants.id, applicantId)).for("update");
    if (fresh?.identityLink) return { url: fresh.identityLink, created: false };
    const updated = await updateApplicant(tx, applicantId, {
      identitySessionId: session.sessionId,
      identityLink: session.url,
      identityStatus: "pending",
    });
    if (!updated) return { url: null, created: false };
    if (existing.status === "id_failed") {
      await enqueueEmail(
        tx,
        `email:identity:${applicantId}:${session.sessionId}`,
        { to: updated.email, ...identityRetryEmail(updated.fullName, session.url, updated.language) },
        "identity_retry",
        applicantId,
      );
    }
    return { url: session.url, created: true };
  });
}

// Queues provisioning for the worker; used from webhook processing so a
// provider outage there is retried rather than logged and forgotten.
export async function scheduleIdentitySession(tx: Parameters<typeof enqueue>[0], applicantId: string, attempt = 0): Promise<void> {
  await enqueue(tx, { kind: "identity_session", dedupeKey: `identity_session:${applicantId}:${attempt}`, payload: { applicantId }, applicantId });
}
