"use client";
import { useLanguage } from "@/components/LanguageProvider";
import type { Locale } from "@/lib/locale";
import { lookupUi, uiMessages, type UiOverrides } from "@/lib/ui-messages";
export { uiMessages };
export function uiText(locale: Locale, text: string, overrides?: UiOverrides) {
  return lookupUi(locale, text, overrides);
}
export function useText() {
  const { locale } = useLanguage();
  return (text: string) => uiText(locale, text);
}
