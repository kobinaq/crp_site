import type { Locale } from "@/lib/locale";
import en from "@/lib/translations/en.json";
import fr from "@/lib/translations/fr.json";
import es from "@/lib/translations/es.json";
import pt from "@/lib/translations/pt.json";
export type Messages = typeof en;
export const messages: Record<Locale, Messages> = { en, fr, es, pt };
const PLACEHOLDER = /\{(\w+)\}/g;

export function placeholdersIn(text: string): string[] {
  return [...text.matchAll(new RegExp(PLACEHOLDER.source, "g"))].map((match) => match[1] ?? "").sort();
}

export function t(template: string, vars: Record<string, string | number>): string {
  return template.replace(new RegExp(PLACEHOLDER.source, "g"), (_, key: string) => String(vars[key] ?? ""));
}
export function copyFor(locale: Locale): Messages { return messages[locale]; }
