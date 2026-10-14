"use server";
import { requestCaptureConfirmation } from "@/lib/capture-confirmation";

import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import {
  getDb,
  interest,
  nominations,
  partnerInquiries,
} from "@/lib/db";
import { enqueueEmail } from "@/lib/jobs";
import { recordChange } from "@/lib/sync-log";
import { rateLimit } from "@/lib/rate-limit";
import { createApplication, requestResumeLink } from "@/lib/application";
import { verifyTurnstile } from "@/lib/turnstile";
import {
  nominationEmail,
} from "@/lib/emails";
import {
  waitlistInput,
  interestInput,
  applicationInput,
  nominationInput,
  partnerInput,
  resumeInput,
  type ApplicationResult,
  type ResumeResult,
} from "@/lib/capture";

async function callerIp(): Promise<string> {
  return (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

// Reads the Turnstile token from a raw form payload and verifies it with the
// caller's IP. The field schemas ignore extra keys, so the token rides along in
// the same object.
async function passedTurnstile(raw: unknown): Promise<boolean> {
  const token =
    raw && typeof raw === "object"
      ? (raw as Record<string, unknown>).turnstileToken
      : undefined;
  return verifyTurnstile(typeof token === "string" ? token : undefined, await callerIp());
}

// Per-IP and per-address ceilings. Generous for a person, tight for a script.
async function withinLimits(scope: string, email: string, perIp: number, perEmail: number): Promise<boolean> {
  const ip = await callerIp();
  const [ipOk, emailOk] = await Promise.all([
    rateLimit(`${scope}:ip`, ip, perIp),
    rateLimit(`${scope}:email`, email, perEmail),
  ]);
  return ipOk && emailOk;
}

export async function submitWaitlist(raw: unknown): Promise<{ ok: boolean }> {
  if (!(await passedTurnstile(raw))) return { ok: false };
  const parsed = waitlistInput.safeParse(raw);
  if (!parsed.success) return { ok: false };
  if (!(await withinLimits("waitlist", parsed.data.email, 20, 3))) return { ok: false };
  await requestCaptureConfirmation(getDb(), "waitlist", parsed.data);
  return { ok: true };
}

// `ok` stays for existing callers; `status` lets the apply form tell a repeat
// signup apart. Only checked after Turnstile and the rate limits, and it only
// reveals that the address is on the interest list (no stored details). The
// confirmation email still goes out so the owner can update their preferences.
export type InterestResult =
  | { ok: true; status: "ok" | "already_recorded" }
  | { ok: false; status: "error" };

export async function submitInterest(raw: unknown): Promise<InterestResult> {
  const failed = { ok: false, status: "error" } as const;
  if (!(await passedTurnstile(raw))) return failed;
  const parsed = interestInput.safeParse(raw);
  if (!parsed.success) return failed;
  if (!(await withinLimits("interest", parsed.data.email, 20, 3))) return failed;
  const db = getDb();
  const [existing] = await db.select({ id: interest.id }).from(interest).where(eq(interest.email, parsed.data.email)).limit(1);
  await requestCaptureConfirmation(db, "interest", parsed.data);
  return { ok: true, status: existing ? "already_recorded" : "ok" };
}

export async function submitNomination(raw: unknown): Promise<{ ok: boolean }> {
  if (!(await passedTurnstile(raw))) return { ok: false };
  const parsed = nominationInput.safeParse(raw);
  if (!parsed.success) return { ok: false };
  const {
    nominatorName,
    nominatorEmail,
    nominatorPhone,
    nominatorOrganization,
    nominatorRelation,
    nomineeName,
    nomineeEmail,
    nomineeDob,
    nomineePhone,
    nomineeNationality,
    nomineeBasedIn,
    nomineeLocation,
    track,
  } = parsed.data;
  if (!(await withinLimits("nomination", nominatorEmail, 20, 10))) return { ok: false };

  const basedIn = nomineeBasedIn ?? nomineeLocation;

  await getDb().transaction(async (tx) => {
    const [row] = await tx
      .insert(nominations)
      .values({
        nominatorName,
        nominatorEmail,
        nominatorPhone,
        nominatorOrganization,
        nominatorRelation,
        nomineeName,
        nomineeEmail,
        nomineeDob,
        nomineePhone,
        nomineeNationality,
        nomineeBasedIn: basedIn,
        nomineeLocation: basedIn,
        track,
      })
      .onConflictDoNothing({
        target: [nominations.nominatorEmail, nominations.nomineeEmail],
      })
      .returning();
    // A repeated nomination of the same person is acknowledged, not re-mailed.
    if (!row) return;
    await recordChange(tx, "nominations", row.id, "insert", row);
    await enqueueEmail(tx, `email:nomination:${row.id}`, { to: nominatorEmail, ...nominationEmail(nomineeName) }, "nomination");
  });
  return { ok: true };
}

export async function submitPartner(raw: unknown): Promise<{ ok: boolean; reason?: "invalid" | "turnstile" | "rate_limited" }> {
  if (!(await passedTurnstile(raw))) return { ok: false, reason: "turnstile" };
  const parsed = partnerInput.safeParse(raw);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  if (!(await withinLimits("partner", parsed.data.email, 20, 5))) return { ok: false, reason: "rate_limited" };

  await getDb().transaction(async (tx) => {
    const [row] = await tx.insert(partnerInquiries).values(parsed.data).returning();
    await recordChange(tx, "partners", row.id, "insert", row);
  });
  return { ok: true };
}

export async function startApplication(raw: unknown): Promise<ApplicationResult> {
  if (!(await passedTurnstile(raw))) return { ok: false, reason: "turnstile" };
  const parsed = applicationInput.safeParse(raw);
  if (!parsed.success) {
    console.warn("[apply] invalid input", parsed.error.flatten());
    return { ok: false, reason: "invalid" };
  }
  if (!(await withinLimits("apply", parsed.data.email, 10, 5))) return { ok: false, reason: "rate_limited" };

  const result = await createApplication(getDb(), parsed.data);
  if (!result.ok) return result;

  return { ok: true, id: result.id, round1Url: null, isNew: true };
}

// Emails a single-use link to whoever owns the address. The answer is the same
// whether or not that address has applied.
export async function requestApplicationLink(raw: unknown): Promise<ResumeResult> {
  if (!(await passedTurnstile(raw))) return { ok: false, reason: "turnstile" };
  const parsed = resumeInput.safeParse(raw);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  if (!(await withinLimits("resume", parsed.data.email, 10, 3))) return { ok: false, reason: "rate_limited" };

  await requestResumeLink(getDb(), parsed.data.email);
  return { ok: true };
}
