import { createHmac, timingSafeEqual } from "crypto";
import { appSecret } from "@/lib/config";
import { videoAskBase } from "@/lib/capture";

function signature(value: string) {
  return createHmac("sha256", appSecret()).update(`videoask:${value}`).digest("base64url");
}
export function videoaskReference(applicantId: string): string {
  return `${applicantId}.${signature(applicantId)}`;
}
export function parseVideoaskReference(raw: unknown): { applicantId: string } | null {
  if (typeof raw !== "string" || raw.length > 200) return null;
  const parts = raw.split(".");
  if (parts.length !== 2) return null;
  const [applicantId, mac] = parts;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(applicantId)) return null;
  const expected = Buffer.from(signature(applicantId));
  const given = Buffer.from(mac);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  return { applicantId };
}
export function videoaskLink(applicantId: string): string | null {
  const base = videoAskBase();
  if (!base) return null;
  const url = new URL(base);
  const variables = new URLSearchParams(url.hash.slice(1));
  variables.set("application_ref", videoaskReference(applicantId));
  url.hash = variables.toString();
  return url.toString();
}
// Inspect only provider metadata, never answer text or arbitrary nested values.
// Events that are authentic but not ours to act on (other event types,
// abandoned responses, or another environment's form sharing this webhook)
// come back as { ignored } so the route can acknowledge them with 200 and
// VideoAsk does not keep retrying. Malformed or forged references stay null.
export type VideoaskCompletion = { applicantId: string; eventId: string; formId: string };
export function readVideoaskCompletion(body: unknown): VideoaskCompletion | { ignored: string } | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  if (typeof b.event_id !== "string") return null;
  if (!["form_response", "form_response_transcribed"].includes(String(b.event_type))) return { ignored: "event type" };
  const contact = b.contact as Record<string, unknown> | undefined;
  const form = b.form as Record<string, unknown> | undefined;
  if (!contact || !form) return null;
  const expectedForm = process.env.VIDEOASK_FORM_ID;
  if (!expectedForm) return null;
  if (form.form_id !== expectedForm) return { ignored: "other form" };
  if (contact.status !== "completed") return { ignored: "not completed" };
  const variables = contact.variables as Record<string, unknown> | { key?: string; name?: string; value?: unknown }[] | undefined;
  const raw = Array.isArray(variables)
    ? variables.find((v) => v && typeof v === "object" && (v.key ?? v.name) === "application_ref")?.value
    : variables?.application_ref;
  const reference = parseVideoaskReference(raw);
  if (!reference) return null;
  return { ...reference, eventId: b.event_id, formId: expectedForm };
}
