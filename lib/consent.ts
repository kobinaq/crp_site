/**
 * Cookie consent: the first-party `crp-consent` cookie, its categories, and
 * the inventory of every cookie / storage item the site sets.
 *
 * Categories: strictly necessary (always on), functional (language cookie) and
 * analytics (PostHog, anonymous usage statistics). There is no advertising, so
 * that Figma row is omitted.
 *
 * PostHog (analytics) lives in lib/analytics.ts and components/analytics/PostHogProvider.tsx:
 * - posthog-js is imported and initialised only after hasConsent("analytics"),
 *   and follows onConsentChange(): opt_in_capturing() on grant;
 *   opt_out_capturing(), reset() and clearAnalyticsStorage() on withdrawal.
 * - Persistence "localStorage+cookie" (cookie ph_<project_key>_posthog, about
 *   1 year, plus ph_* localStorage), as listed in COOKIE_INVENTORY.
 * - writeConsent() also calls clearAnalyticsStorage() whenever analytics is off.
 * Do not load the SDK, or anything else that sets ph_* items, before consent.
 */

export const CONSENT_COOKIE = "crp-consent";
/** Bump to re-ask everyone (e.g. when a new optional category is added). */
export const CONSENT_VERSION = 2;
/** ~12 months, matching the language cookie. */
export const CONSENT_MAX_AGE = 60 * 60 * 24 * 365;
/** Fired on window whenever the stored choice changes. */
export const CONSENT_EVENT = "crp:consent-change";

export const OPTIONAL_CATEGORIES = ["functional", "analytics"] as const;
export type OptionalCategory = (typeof OPTIONAL_CATEGORIES)[number];
export type ConsentCategory = "necessary" | OptionalCategory;
export type ConsentChoices = Record<OptionalCategory, boolean>;
export type Consent = { version: number; choices: ConsentChoices; at: number };

export const NO_OPTIONAL: ConsentChoices = { functional: false, analytics: false };
export const ALL_OPTIONAL: ConsentChoices = { functional: true, analytics: true };

/** Cookie value: `v2.functional-1.analytics-0.<unix seconds>` (cookie-safe, no encoding). */
export function serializeConsent(choices: ConsentChoices, at = Math.floor(Date.now() / 1000)): string {
  const parts = OPTIONAL_CATEGORIES.map((category) => `${category}-${choices[category] ? 1 : 0}`);
  return [`v${CONSENT_VERSION}`, ...parts, String(at)].join(".");
}

/** Returns null for a missing, malformed or outdated value, so the banner shows again. */
export function parseConsent(value: string | undefined | null): Consent | null {
  if (!value) return null;
  const parts = value.split(".");
  if (parts[0] !== `v${CONSENT_VERSION}`) return null;
  const stamp = parts.at(-1) ?? "";
  const at = Number(stamp);
  if (!/^\d+$/.test(stamp) || parts.length !== OPTIONAL_CATEGORIES.length + 2) return null;
  const choices = { ...NO_OPTIONAL };
  for (const [index, category] of OPTIONAL_CATEGORIES.entries()) {
    const flag = parts[index + 1];
    if (flag !== `${category}-0` && flag !== `${category}-1`) return null;
    choices[category] = flag.endsWith("-1");
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

/** Client only: may an optional item be set right now? e.g. hasConsent("analytics"). */
export function hasConsent(category: ConsentCategory): boolean {
  return allows(readConsent(), category);
}

/**
 * Client only: called with the new consent whenever the visitor saves a choice
 * (banner or preferences panel). Returns an unsubscribe function.
 */
export function onConsentChange(listener: (consent: Consent) => void): () => void {
  const handler = (event: Event) => listener((event as CustomEvent<Consent>).detail);
  window.addEventListener(CONSENT_EVENT, handler);
  return () => window.removeEventListener(CONSENT_EVENT, handler);
}

/** Client only: store the choice, drop anything it no longer allows, notify listeners. */
export function writeConsent(choices: ConsentChoices): Consent {
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${CONSENT_COOKIE}=${serializeConsent(choices)}; path=/; max-age=${CONSENT_MAX_AGE}; SameSite=Lax${secure}`;
  if (!choices.functional) clearFunctionalStorage();
  if (!choices.analytics) clearAnalyticsStorage();
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

/** PostHog keys: ph_<project_key>_posthog and its other ph_* entries, plus the opt-in/out flag. */
const ANALYTICS_KEY = /^(ph_|__ph_opt_in_out_)/;

/** Expires a cookie on this host and on each parent domain it could have been set on. */
function expireCookie(name: string) {
  const parts = window.location.hostname.split(".");
  const domains = [""];
  for (let i = 0; i < parts.length - 1; i++) domains.push(`; domain=.${parts.slice(i).join(".")}`);
  for (const domain of domains) document.cookie = `${name}=; path=/; max-age=0; SameSite=Lax${domain}`;
}

/** Removes PostHog's ph_* cookies and local/session storage (analytics withdrawn or never given). */
export function clearAnalyticsStorage() {
  for (const row of document.cookie ? document.cookie.split("; ") : []) {
    const name = row.split("=")[0];
    if (ANALYTICS_KEY.test(name)) expireCookie(name);
  }
  for (const storage of ["localStorage", "sessionStorage"] as const) {
    try {
      const store = window[storage];
      const keys = Array.from({ length: store.length }, (_, i) => store.key(i)).filter((key): key is string => key !== null);
      for (const key of keys) if (ANALYTICS_KEY.test(key)) store.removeItem(key);
    } catch {
      /* Storage unavailable: nothing to clear. */
    }
  }
}

export type InventoryItem = {
  name: string;
  /** Readable name shown instead of `name` (English source; translated through ui-*.json). */
  label?: string;
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
  { name: "ph_<project_key>_posthog", label: "PostHog analytics cookie (ph_…_posthog)", kind: "cookie", category: "analytics", duration: "About 1 year", purpose: "PostHog: an anonymous ID and session, used for anonymous usage statistics that help us improve the site." },
  { name: "ph_*", kind: "localStorage", category: "analytics", duration: "Until you withdraw consent", purpose: "PostHog local storage: settings and queued anonymous usage statistics, kept with the cookie above." },
];
