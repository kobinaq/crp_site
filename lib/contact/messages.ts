import { z } from "zod";
import { COUNTRIES } from "@/lib/countries";
import { normalizeEmail } from "@/lib/capture";
import { contactMessages, type Db } from "@/lib/db";
import { isLocale, type Locale } from "@/lib/locale";
import { verifyTurnstile } from "@/lib/turnstile";
import { rateLimit } from "@/lib/rate-limit";
import type { DeskId } from "@/lib/desk/case";
import {
  CONTACT_LIMITS,
  CONTACT_RATE,
  contactRateScopes,
  formatPhone,
  honeypotFilled,
  parseContactBody,
  parseContactName,
  parseDial,
  parseNational,
  parseOrganization,
  turnstileTokenOf,
  type ContactAddress,
  type ContactIntake,
  type ContactSubmitResult,
} from "@/lib/contact/model";

type DeskStaysClosed = Exclude<DeskId, "nomination" | "partner"> extends never ? true : never;
export const deskStaysClosed: DeskStaysClosed = true;

const knownDials = COUNTRIES.map((country) => country.dial);

function parseContactEmail(value: unknown): ContactAddress | null {
  if (typeof value !== "string") return null;
  const parsed = z.string().trim().max(CONTACT_LIMITS.emailMax).transform(normalizeEmail).pipe(z.email()).safeParse(value);
  if (!parsed.success || parsed.data.length < CONTACT_LIMITS.emailMin) return null;
  return parsed.data as ContactAddress;
}

export function parseContactIntake(raw: unknown, dials: readonly string[] = knownDials): ContactIntake | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  const name = parseContactName(record.name);
  const organization = parseOrganization(record.organization);
  const body = parseContactBody(record.message);
  const dial = parseDial(record.dial, dials);
  const national = parseNational(record.nationalNumber);
  const email = parseContactEmail(record.email);
  if (!name || !organization.ok || !body || !dial || !national || !email) return null;
  const locale: Locale = typeof record.locale === "string" && isLocale(record.locale) ? record.locale : "en";
  return {
    name,
    organization: organization.value,
    email,
    phone: formatPhone(dial, national),
    body,
    locale,
  };
}

export async function acceptContactMessage(db: Db, raw: unknown, ip: string): Promise<ContactSubmitResult> {
  if (honeypotFilled(raw)) return { ok: true };
  if (!(await verifyTurnstile(turnstileTokenOf(raw), ip))) return { ok: false, reason: "turnstile" };
  const intake = parseContactIntake(raw);
  if (!intake) return { ok: false, reason: "invalid" };
  const scopes = contactRateScopes();
  const [ipOk, emailOk] = await Promise.all([
    rateLimit(scopes.ip, ip, CONTACT_RATE.perIp, CONTACT_RATE.windowSeconds),
    rateLimit(scopes.email, intake.email, CONTACT_RATE.perEmail, CONTACT_RATE.windowSeconds),
  ]);
  if (!ipOk || !emailOk) return { ok: false, reason: "rate_limited" };
  await db.transaction(async (tx) => {
    await tx.insert(contactMessages).values({
      name: intake.name,
      email: intake.email,
      organization: intake.organization,
      phone: intake.phone,
      body: intake.body,
      locale: intake.locale,
    });
  });
  return { ok: true };
}
