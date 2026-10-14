import { createHmac, timingSafeEqual } from "crypto";
import { appSecret } from "@/lib/config";
import type { ApplicationLocale } from "@/lib/locale";

function sign(value: string): string {
  return createHmac("sha256", appSecret()).update(`calendly:${value}`).digest("base64url");
}

export function calendlyReference(applicantId: string): string {
  return `${applicantId}.${sign(applicantId)}`;
}

export function parseCalendlyReference(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.length > 200) return null;
  const [applicantId, mac, ...rest] = raw.split(".");
  if (rest.length || !applicantId || !mac || !/^[0-9a-f-]{36}$/i.test(applicantId)) return null;
  const expected = Buffer.from(sign(applicantId));
  const given = Buffer.from(mac);
  return expected.length === given.length && timingSafeEqual(expected, given) ? applicantId : null;
}

// Single switch for interview booking. On only when CALENDLY_ENABLED isn't
// "false" and all three locale URLs are set; otherwise accepted applicants get
// an email without a booking button and the team arranges interviews directly.
// To restore: set CALENDLY_URL_EN/_FR/_ES (and CALENDLY_WEBHOOK_SIGNING_KEY for
// booking-time tracking), and leave CALENDLY_ENABLED unset or "true".
export function calendlyEnabled(): boolean {
  if (process.env.CALENDLY_ENABLED?.trim().toLowerCase() === "false") return false;
  return ["EN", "FR", "ES"].every((lang) => Boolean(process.env[`CALENDLY_URL_${lang}`]));
}

// The webhook additionally needs the signing key to verify events.
export function calendlyWebhookEnabled(): boolean {
  return calendlyEnabled() && Boolean(process.env.CALENDLY_WEBHOOK_SIGNING_KEY);
}

export function calendlyLink(
  applicant: { id: string; fullName: string; email: string; language: ApplicationLocale },
): string | null {
  if (!calendlyEnabled()) return null;
  const base = process.env[`CALENDLY_URL_${applicant.language.toUpperCase()}`];
  if (!base) return null;
  const url = new URL(base);
  url.searchParams.set("name", applicant.fullName);
  url.searchParams.set("email", applicant.email);
  url.searchParams.set("utm_content", calendlyReference(applicant.id));
  return url.toString();
}
