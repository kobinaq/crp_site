"use client";

import { useText } from "@/lib/ui-text";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { Logo } from "../Logo";
import { applicationLocales } from "@/lib/locale";
import { useLanguage } from "../LanguageProvider";

export function ThanksStep({ onExit, onBack }: { onExit: () => void; onBack?: () => void }) {
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
      <header className="relative flex h-[68px] shrink-0 items-center justify-end px-4 max-desk:justify-between max-desk:px-8 desk:h-[88px] desk:px-16 desk:py-6">
        {/* Phones only (Figma 2308:9574): back button on the left; desktop keeps its layout. */}
        <button
          type="button"
          onClick={onBack ?? onExit}
          aria-label={tr("Back")}
          className="grid size-8 place-items-center rounded-full bg-white transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:scale-105 active:scale-95 desk:hidden"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/apply/arrow-left.svg" alt="" width={16} height={16} className="size-4" />
        </button>
        <div className="absolute left-1/2 top-1/2 z-20 -translate-x-1/2 -translate-y-1/2 desk:top-5 desk:translate-y-0">
          <Logo
            tone="color"
            imgClassName="h-10 w-auto object-contain max-desk:h-6 desk:h-12 desk:w-[135px]"
          />
        </div>
        <div className="flex items-center rounded-full bg-white p-1 max-desk:h-[27px] max-desk:p-[2px]">
          {applicationLocales.map((code) => (
            <button
              key={code}
              type="button"
              onClick={() => setLocale(code)}
              aria-pressed={locale === code}
              className={`flex h-8 items-center justify-center rounded-full text-[14px] font-semibold uppercase leading-[0.9] tracking-[0.56px] mix-blend-hard-light max-desk:h-full max-desk:text-[12px] max-desk:tracking-[0.48px] ${
                locale === code
                  ? "bg-black px-3 text-white max-desk:px-2"
                  : "w-[52px] bg-transparent text-black/48 max-desk:w-8"
              }`}
            >
              <span className="w-7 text-center max-desk:w-auto">{code}</span>
            </button>
          ))}
        </div>
      </header>

      <main className="flex min-h-0 flex-1 items-center justify-center px-4 max-desk:items-stretch max-desk:px-3 max-desk:pb-0.5 desk:px-16">
        <div className="relative aspect-[1072/836] w-full max-w-[1072px] max-h-full overflow-hidden rounded-[88px] bg-white max-desk:aspect-auto max-desk:h-full desk:rounded-[154px]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/images/nominate/thank-you-union.png"
            alt=""
            width={1072}
            height={354}
            className="pointer-events-none absolute left-1/2 top-[28.827%] h-[42.344%] w-[118%] max-w-none -translate-x-1/2 object-fill max-desk:top-[31.25%] max-desk:h-[37.6%] max-desk:w-[175%]"
          />
          <div className="relative z-10 flex h-full flex-col items-center justify-center px-6 text-center text-white">
            <div className="flex w-full max-w-[632px] flex-col items-center gap-6 max-desk:gap-4">
              <h1 className="text-[clamp(28px,4.5vw,48px)] leading-[0.9] tracking-[-0.04em] desk:text-[48px] desk:tracking-[-1.92px]">
                {tr("Thank you!")}</h1>
              <p className="text-[clamp(18px,3vw,32px)] leading-[0.9] tracking-[-0.04em] max-desk:text-[20px] max-desk:tracking-[-0.8px] desk:text-[32px] desk:tracking-[-1.28px]">
                {tr("We've received your nomination.")}<br />
                {tr("Check your email for further steps.")}</p>
            </div>
          </div>
        </div>
      </main>

      <footer className="flex shrink-0 justify-center p-[10px] max-desk:p-2">
        <button
          type="button"
          onClick={onExit}
          className="gradient-brand flex h-14 w-full max-w-[632px] items-center justify-center rounded-full max-desk:h-16 desk:h-20"
        >
          <span className="text-[16px] font-semibold uppercase leading-[0.9] tracking-[0.8px] text-white mix-blend-hard-light desk:text-[20px]">
            {tr("Exit")}</span>
        </button>
      </footer>
    </div>,
    document.body,
  );
}
