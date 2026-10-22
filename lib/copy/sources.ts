import type { ApplicationLocale, Locale } from "@/lib/locale";
import { applicationLocales, locales } from "@/lib/locale";
import { overrides, type PublishedCopy } from "@/lib/copy/catalog";

export type EmailSources = {
  readonly ack: Readonly<Partial<Record<Locale, Readonly<Record<string, string>>>>>;
  readonly app: Readonly<Partial<Record<ApplicationLocale, Readonly<Record<string, string>>>>>;
};

export const JSON_EMAILS: EmailSources = { ack: {}, app: {} };

export function emailSourcesFrom(published: PublishedCopy): EmailSources {
  const ack: Partial<Record<Locale, Record<string, string>>> = {};
  for (const locale of locales) {
    const pairs = overrides(published, "ackEmail", locale);
    if (pairs.length > 0) ack[locale] = Object.fromEntries(pairs.map(([leaf, value]) => [leaf.key, value]));
  }
  const app: Partial<Record<ApplicationLocale, Record<string, string>>> = {};
  for (const locale of applicationLocales) {
    const pairs = overrides(published, "appEmail", locale);
    if (pairs.length > 0) app[locale] = Object.fromEntries(pairs.map(([leaf, value]) => [leaf.key, value]));
  }
  return { ack, app };
}
