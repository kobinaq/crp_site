/**
 * Cookie consent: the first-party `crp-consent` cookie, its categories, and
 * the inventory of every cookie / storage item the site sets.
 *
 * Categories only exist where something on the site actually uses them. The
 * site runs no analytics or advertising, so those Figma rows are omitted; add a
 * category here (and gate its script with <ConsentGate>) if that changes.
 */

export const CONSENT_COOKIE = "crp-consent";
/** Bump to re-ask everyone (e.g. when a new optional category is added). */
export const CONSENT_VERSION = 1;
/** ~12 months, matching the language cookie. */
export const CONSENT_MAX_AGE = 60 * 60 * 24 * 365;
/** Fired on window whenever the stored choice changes. */
export const CONSENT_EVENT = "crp:consent-change";

export const OPTIONAL_CATEGORIES = ["functional"] as const;
export type OptionalCategory = (typeof OPTIONAL_CATEGORIES)[number];
export type ConsentCategory = "necessary" | OptionalCategory;
export type ConsentChoices = Record<OptionalCategory, boolean>;
export type Consent = { version: number; choices: ConsentChoices; at: number };

export const NO_OPTIONAL: ConsentChoices = { functional: false };
export const ALL_OPTIONAL: ConsentChoices = { functional: true };

/** Cookie value: `v1.functional-1.<unix seconds>` (cookie-safe, no encoding). */
export function serializeConsent(choices: ConsentChoices, at = Math.floor(Date.now() / 1000)): string {
  const parts = OPTIONAL_CATEGORIES.map((category) => `${category}-${choices[category] ? 1 : 0}`);
  return [`v${CONSENT_VERSION}`, ...parts, String(at)].join(".");
}

/** Returns null for a missing, malformed or outdated value, so the banner shows again. */
export function parseConsent(value: string | undefined | null): Consent | null {
  if (!value) return null;
  const parts = value.split(".");
  if (parts[0] !== `v${CONSENT_VERSION}`) return null;
  const at = Number(parts.at(-1));
  if (!Number.isFinite(at) || parts.length !== OPTIONAL_CATEGORIES.length + 2) return null;
  const choices = { ...NO_OPTIONAL };
  for (const part of parts.slice(1, -1)) {
    const [category, flag] = part.split("-");
    if (!(OPTIONAL_CATEGORIES as readonly string[]).includes(category) || (flag !== "0" && flag !== "1")) return null;
    choices[category as OptionalCategory] = flag === "1";
  }
  return { version: CONSENT_VERSION, choices, at };
}

export function allows(consent: Consent | null, category: ConsentCategory): boolean {
  if (category === "necessary") return true;
  return consent?.choices[category] ?? false;
}

function readCookie(name: string): string | undefined {
  if (typeof document === "undefined") return undefined;
  const prefix = `${name}=`;
  return document.cookie.split("; ").find((row) => row.startsWith(prefix))?.slice(prefix.length);
}

/** Client only. */
export function readConsent(): Consent | null {
  return parseConsent(readCookie(CONSENT_COOKIE));
}

/** Client only: may an optional item be set right now? */
export function hasConsent(category: ConsentCategory): boolean {
  return allows(readConsent(), category);
}

/** Client only: store the choice, drop anything it no longer allows, notify listeners. */
export function writeConsent(choices: ConsentChoices): Consent {
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${CONSENT_COOKIE}=${serializeConsent(choices)}; path=/; max-age=${CONSENT_MAX_AGE}; SameSite=Lax${secure}`;
  if (!choices.functional) clearFunctionalStorage();
  const consent = readConsent() ?? { version: CONSENT_VERSION, choices, at: Math.floor(Date.now() / 1000) };
  window.dispatchEvent(new CustomEvent(CONSENT_EVENT, { detail: consent }));
  return consent;
}

/** Removes the language cookie and the old localStorage mirror it used to write. */
export function clearFunctionalStorage() {
  document.cookie = "crp-locale=; path=/; max-age=0; SameSite=Lax";
  try {
    window.localStorage.removeItem("crp-locale");
  } catch {
    /* Storage unavailable: nothing to clear. */
  }
}

export type InventoryItem = {
  name: string;
  /** English source string; translated through ui-*.json. */
  purpose: string;
  duration: string;
  kind: "cookie" | "localStorage" | "third-party";
  category: ConsentCategory;
};

/** Everything the site stores on a visitor's device. Keep in sync with the code. */
export const COOKIE_INVENTORY: InventoryItem[] = [
  { name: CONSENT_COOKIE, kind: "cookie", category: "necessary", duration: "12 months", purpose: "Stores your cookie choices so we don’t ask again." },
  { name: "crp_session", kind: "cookie", category: "necessary", duration: "12 hours", purpose: "Lets you continue your application after you confirm your email." },
  { name: "Cloudflare Turnstile", kind: "third-party", category: "necessary", duration: "Session", purpose: "Checks that forms are sent by a person, not a bot. Loaded only on forms." },
  { name: "crp-locale", kind: "cookie", category: "functional", duration: "12 months", purpose: "Remembers the language you chose." },
];
