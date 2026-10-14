"use client";

import { useText } from "@/lib/ui-text";

import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { applicationLocales } from "@/lib/locale";
import { useLanguage } from "../LanguageProvider";

// Full-screen cream shell shared by apply + nominate multi-step forms.
export function FormShell({
  onBack,
  children,
  footer,
  fill = false,
  wide = false,
}: {
  onBack?: () => void;
  children: ReactNode;
  footer?: ReactNode;
  fill?: boolean;
  /** Desktop layout from Figma 2308:2048 (Skills step): 88px header, 1072px panel, 154px radius. Mobile unchanged. */
  wide?: boolean;
}) {
  const tr = useText();
  const { locale, setLocale } = useLanguage();

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  return createPortal(
    <div className="fixed inset-0 z-[70] flex h-dvh flex-col overflow-hidden bg-cream">
      <header className={`flex shrink-0 items-center justify-between px-4 py-2.5 ${wide ? "desk:h-[88px] desk:px-16 desk:py-6" : "desk:px-12 desk:py-3"}`}>
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            aria-label={tr("Back")}
            className={`grid size-9 place-items-center rounded-full bg-white shadow-sm ${wide ? "desk:size-10" : ""} transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:scale-105 active:scale-95`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icons/apply/arrow-left.svg" alt="" width={20} height={20} className={`size-5 ${wide ? "desk:size-6" : ""}`} />
          </button>
        ) : (
          <span className="size-9" />
        )}

        <div className="flex items-center rounded-full bg-white p-1">
          {applicationLocales.map((code) => (
            <button
              key={code}
              type="button"
              onClick={() => setLocale(code)}
              aria-pressed={locale === code}
              className={`h-7 rounded-full px-3.5 text-[12px] font-semibold uppercase tracking-[0.04em] transition-colors ${
                wide ? "desk:h-8 desk:min-w-[52px] desk:px-3 desk:text-[14px] desk:tracking-[0.56px]" : ""
              } ${
                locale === code ? "bg-black text-white" : "bg-transparent text-black/50 hover:bg-black/5 hover:text-black"
              }`}
            >
              {code}
            </button>
          ))}
        </div>
      </header>

      <main
        className={`flex min-h-0 flex-1 justify-center px-3 pb-2 ${wide ? "desk:px-16 desk:pb-0" : ""} ${
          fill ? "items-stretch" : "items-center"
        }`}
      >
        <div
          className={`w-full min-w-0 rounded-[36px] bg-white px-5 py-5 ${
            wide
              ? "max-w-[1072px] desk:rounded-[154px] desk:px-10 desk:py-16"
              : "max-w-[960px] desk:rounded-[64px] desk:px-0 desk:py-8"
          } ${
            fill ? "flex h-full min-h-0 flex-col" : ""
          }`}
        >
          <div
            className={`mx-auto flex w-full min-w-0 max-w-[632px] flex-col ${
              fill ? "min-h-0 flex-1" : ""
            }`}
          >
            {children}
          </div>
        </div>
      </main>

      {footer ? (
        <footer className={`flex shrink-0 flex-col items-center gap-1.5 px-2.5 pb-2.5 pt-1 ${wide ? "desk:p-[10px]" : ""}`}>
          {footer}
        </footer>
      ) : null}
    </div>,
    document.body,
  );
}
