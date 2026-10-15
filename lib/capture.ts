import { z } from "zod";
import { applicationLocales, locales } from "@/lib/locale";
import { SKILL_LABELS, isSkillLabel } from "@/lib/apply-skills";

// One address, one applicant: trimmed and lower-cased so "Ada@Example.com" and
// "ada@example.com" hit the same unique index and the same rate-limit bucket.
export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}
const emailInput = z.string().trim().max(254).transform(normalizeEmail).pipe(z.email());

// A real calendar date: "2001-02-30" parses under Date.parse but is not a day
// anyone was born on, so the round-trip through UTC must reproduce the input.
export function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}
const dateInput = z.string().refine(isCalendarDate, "not a calendar date");

// The site language at submission, used for the acknowledgement email. An
// unknown or missing value falls back to English rather than failing the form.
const localeInput = z.enum(locales).catch("en");

// Boundary schemas: raw form input is untyped until it passes one of these.
export const waitlistInput = z.object({
  email: emailInput,
  name: z.string().trim().min(1).optional(),
  source: z.string().max(120).optional(),
  locale: localeInput,
});

export const interestInput = z.object({
  email: emailInput,
  name: z.string().trim().min(1).optional(),
  ageGroup: z.enum(["under_19", "19_plus"]),
  track: z.enum(["in_person", "online"]).optional(),
  source: z.string().max(120).optional(),
  locale: localeInput,
});

export const resumeInput = z.object({ email: emailInput });

export const applicationInput = z.object({
  consent: z.literal(true),
  fullName: z.string().trim().min(1).max(200),
  email: emailInput,
  dob: dateInput,
  // "Travel to Antalya" -> in_person, "Only program" -> online.
  track: z.enum(["in_person", "online"]).default("in_person"),
  phone: z.string().trim().max(40).optional(),
  nationality: z.string().trim().max(120).optional(),
  basedIn: z.string().trim().max(120).optional(),
  skills: z
    .array(z.string())
    .min(1)
    .max(SKILL_LABELS.length)
    .refine((values) => values.every(isSkillLabel) && new Set(values).size === values.length),
  canTravel: z.boolean().optional(),
  hasValidPassport: z.boolean().optional(),
  // Chosen at the pre-application popup; the popup is the source of truth. Falls
  // back to English so a missing choice can never block an application.
  language: z.enum(applicationLocales).default("en"),
}).superRefine((data, ctx) => {
  if (data.track === "in_person" && (!data.canTravel || !data.hasValidPassport)) {
    ctx.addIssue({ code: "custom", path: ["canTravel"], message: "travel attestations required" });
  }
});

export const partnerInput = z.object({
  name: z.string().trim().min(2).max(200),
  email: emailInput,
  phone: z.string().trim().max(40).optional(),
  organization: z.string().trim().min(2).max(200),
  designation: z.string().trim().min(2).max(200),
  support: z.string().trim().min(1).max(400),
  sponsorship: z.string().trim().max(200).optional(),
  message: z.string().trim().max(4000).optional(),
  locale: localeInput,
});

export const nominationInput = z.object({
  nominatorName: z.string().trim().min(1).max(200),
  nominatorEmail: emailInput,
  nominatorPhone: z.string().trim().max(40).optional(),
  nominatorOrganization: z.string().trim().max(200).optional(),
  nominatorRelation: z.string().trim().max(200).optional(),
  nomineeName: z.string().trim().min(1).max(200),
  nomineeEmail: emailInput,
  nomineeDob: dateInput.optional(),
  nomineePhone: z.string().trim().max(40).optional(),
  nomineeNationality: z.string().trim().max(120).optional(),
  nomineeBasedIn: z.string().trim().max(120).optional(),
  nomineeLocation: z.string().trim().max(200).optional(),
  track: z.enum(["in_person", "online"]).optional(),
  locale: localeInput,
});

export type WaitlistInput = z.infer<typeof waitlistInput>;
export type InterestInput = z.infer<typeof interestInput>;
export type ApplicationInput = z.infer<typeof applicationInput>;
export type NominationInput = z.infer<typeof nominationInput>;
export type PartnerInput = z.infer<typeof partnerInput>;

// Lives here, not in the "use server" module, whose exports must all be actions.
export type ApplicationResult =
  | { ok: true; id: string; round1Url: string | null; isNew: boolean }
  | { ok: false; reason: "invalid" | "ineligible" | "turnstile" | "existing" | "rate_limited" };

export type ResumeResult = { ok: boolean; reason?: "invalid" | "turnstile" | "rate_limited" };

// Whole years between dob and today, UTC, no timezone drift.
export function ageFromDob(dob: string): number {
  const d = new Date(`${dob}T00:00:00Z`);
  const now = new Date();
  let age = now.getUTCFullYear() - d.getUTCFullYear();
  const monthDelta = now.getUTCMonth() - d.getUTCMonth();
  if (monthDelta < 0 || (monthDelta === 0 && now.getUTCDate() < d.getUTCDate())) {
    age -= 1;
  }
  return age;
}

// Eligibility floor, read from env so it changes without a code edit.
export function minApplicantAge(): number {
  const parsed = Number(process.env.MIN_APPLICANT_AGE);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 19;
}

// Eligibility ceiling: the program is for 19-26 year olds.
export function maxApplicantAge(): number {
  const parsed = Number(process.env.MAX_APPLICANT_AGE);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 26;
}

export const CONSENT_VERSION = process.env.CONSENT_VERSION ?? "v1";

// A URL pasted without a scheme (e.g. "www.videoask.com/...") is treated as a
// relative path by the browser and 404s on our own domain. Force an absolute
// https URL so a copy-paste slip in an env var fails safe.
function absoluteUrl(value: string): string {
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}

// All locales and tracks use the same VideoAsk form.
export function videoAskBase(): string | null {
  const value = process.env.VIDEOASK_FORM_URL;
  return value ? absoluteUrl(value) : null;
}
