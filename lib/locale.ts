import { hasConsent } from "@/lib/consent";
export const locales = ["en", "fr", "es", "pt"] as const;
export type Locale = (typeof locales)[number];
export const applicationLocales = ["en", "fr", "es"] as const;
export type ApplicationLocale = (typeof applicationLocales)[number];
export const defaultLocale: Locale = "en";
export const LOCALE_COOKIE = "crp-locale";
export const nativeLanguageNames: Record<Locale, string> = { en: "English", fr: "Français", es: "Español", pt: "Português" };
export const publicPaths = ["/", "/about", "/programs", "/partner", "/partner/reach-out", "/contact", "/apply", "/nominate", "/privacy"] as const;
export function isLocale(value: string | undefined | null): value is Locale {
  return locales.some((locale) => locale === value);
}
export function parseLocale(value: string | undefined | null): Locale {
  return isLocale(value) ? value : defaultLocale;
}
export function localePath(href: string, locale: Locale): string {
  if (!href.startsWith("/") || href.startsWith("//")) return href;
  const match = href.match(/^([^?#]*)(.*)$/)!;
  const segments = match[1].split("/");
  if (isLocale(segments[1])) segments.splice(1, 1);
  const path = segments.join("/").replace(/\/$/, "") || "/";
  if (!(publicPaths as readonly string[]).includes(path)) return href;
  return `/${locale}${path === "/" ? "" : path}${match[2]}`;
}
/** Remembering the language is a functional cookie: only stored with consent. The URL still carries the locale. */
export function persistLocale(locale: Locale) {
  if (!hasConsent("functional")) return;
  document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=31536000; SameSite=Lax`;
}
