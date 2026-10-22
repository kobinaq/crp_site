import type { Locale } from "@/lib/locale";
import en from "@/lib/translations/ui-en.json";
import fr from "@/lib/translations/ui-fr.json";
import es from "@/lib/translations/ui-es.json";
import pt from "@/lib/translations/ui-pt.json";

export const uiMessages: Record<Locale, Record<string, string>> = { en, fr, es, pt };

export type UiOverrides = Readonly<Partial<Record<Locale, Readonly<Record<string, string>>>>>;

// Empty string is a stored value. A missing key falls through to the bundle, then to the call-site text.
export function lookupUi(locale: Locale, text: string, overrides: UiOverrides = {}): string {
  const own = overrides[locale];
  if (own && Object.hasOwn(own, text)) return own[text] ?? "";
  const bundled = uiMessages[locale];
  if (Object.hasOwn(bundled, text)) return bundled[text] ?? "";
  return text;
}
