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
  /**
   * Apply-flow layout. Desktop: Figma 2308:2048 (Skills step), 88px header, 1072px panel, 154px radius.
   * Mobile: Figma 2308:10372, 88px panel radius with 32px vertical padding; children own horizontal padding.
   */
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
      <header className={`flex h-[68px] shrink-0 items-center justify-between px-8 ${wide ? "desk:h-[88px] desk:px-16 desk:py-6" : "desk:h-auto desk:px-12 desk:py-3"}`}>
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            aria-label={tr("Back")}
            className={`grid size-8 place-items-center rounded-full bg-white desk:shadow-sm ${wide ? "desk:size-10" : "desk:size-9"} transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:scale-105 active:scale-95`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icons/apply/arrow-left.svg" alt="" width={20} height={20} className={`size-4 ${wide ? "desk:size-6" : "desk:size-5"}`} />
          </button>
        ) : (
          <span className="size-9" />
        )}

        <div className="flex h-[27px] items-center rounded-full bg-white p-0.5 desk:h-auto desk:p-1">
          {applicationLocales.map((code) => (
            <button
              key={code}
              type="button"
              onClick={() => setLocale(code)}
              aria-pressed={locale === code}
              className={`h-full min-w-8 rounded-full px-2 text-[12px] font-semibold uppercase leading-[0.9] tracking-[0.48px] transition-colors ${
                wide ? "desk:h-8 desk:min-w-[52px] desk:px-3 desk:text-[14px] desk:leading-normal desk:tracking-[0.56px]" : "desk:h-7 desk:min-w-0 desk:px-3.5 desk:leading-normal desk:tracking-[0.04em]"
              } ${
                locale === code ? "bg-black text-white" : "bg-transparent text-black/48 hover:bg-black/5 hover:text-black desk:text-black/50"
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
          className={`w-full min-w-0 bg-white ${
            wide
              ? "max-w-[1072px] overflow-hidden rounded-[88px] py-8 desk:overflow-visible desk:rounded-[154px] desk:px-10 desk:py-16"
              : "max-w-[960px] rounded-[36px] px-5 py-5 desk:rounded-[64px] desk:px-0 desk:py-8"
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
        <footer className={`flex shrink-0 flex-col items-center gap-1.5 px-2 pb-2 pt-0.5 ${wide ? "desk:p-[10px]" : "desk:px-2.5 desk:pb-2.5 desk:pt-1"}`}>
          {footer}
        </footer>
      ) : null}
    </div>,
    document.body,
  );
}
