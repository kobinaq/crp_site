"use client";
import { usePathname } from "next/navigation";
import { useHydrated } from "@/lib/useHydrated";
import { useLanguage } from "@/components/LanguageProvider";
import { locales, localePath, nativeLanguageNames } from "@/lib/locale";
import { useText } from "@/lib/ui-text";
export function LanguageLinks() {
  const { locale, path: initialPath } = useLanguage();
  const pathname = usePathname();
  const hydrated = useHydrated();
  const tr = useText();
  const path = hydrated ? pathname : initialPath;
  return <nav aria-label={tr("Languages")} className="flex flex-wrap justify-center gap-x-5 gap-y-2 py-5 text-sm">
    {locales.map((code) => <a key={code} href={localePath(path, code)} hrefLang={code} lang={code} aria-current={locale === code ? "page" : undefined} className="underline underline-offset-4">{nativeLanguageNames[code]}</a>)}
  </nav>;
}
