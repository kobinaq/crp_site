"use client";

import { locales, localePath } from "@/lib/locale";
import { t } from "@/lib/messages";
import { useLanguage } from "./LanguageProvider";

export function LanguageSwitch() {
  const { locale, setLocale, copy, path } = useLanguage();
  const selectedName = copy.a11y.languageNames[locale];
  const label = t(copy.a11y.changeLanguage, { language: selectedName });

  return (
    <div
      role="group"
      aria-label={label}
      className="flex items-center rounded-full bg-white p-[4px]"
    >
      {locales.map((code) => {
        const selected = code === locale;
        return (
          <a
            key={code}
            href={localePath(path, code)} hrefLang={code} lang={code}
            aria-current={selected ? "page" : undefined}
            onClick={(event) => { event.preventDefault(); setLocale(code); }}
            className={`flex h-[32px] min-w-[52px] items-center justify-center rounded-full px-[12px] text-[14px] font-semibold uppercase leading-[0.9] tracking-[0.56px] ${
              selected ? "bg-black text-white" : "text-black/48 transition-colors hover:bg-black/5 hover:text-black"
            }`}
          >
            {code.toUpperCase()}
          </a>
        );
      })}
    </div>
  );
}
