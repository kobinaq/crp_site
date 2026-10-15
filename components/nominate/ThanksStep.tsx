"use client";

import { useText } from "@/lib/ui-text";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { Logo } from "../Logo";
import { applicationLocales } from "@/lib/locale";
import { useLanguage } from "../LanguageProvider";

export function ThanksStep({ onExit }: { onExit: () => void }) {
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
      <header className="relative flex h-[68px] shrink-0 items-center justify-end px-4 desk:h-[88px] desk:px-16 desk:py-6">
        <div className="absolute left-1/2 top-1/2 z-20 -translate-x-1/2 -translate-y-1/2 desk:top-5 desk:translate-y-0">
          <Logo
            tone="color"
            imgClassName="h-10 w-auto object-contain desk:h-12 desk:w-[135px]"
          />
        </div>
        <div className="flex items-center rounded-full bg-white p-1">
          {applicationLocales.map((code) => (
            <button
              key={code}
              type="button"
              onClick={() => setLocale(code)}
              aria-pressed={locale === code}
              className={`flex h-8 items-center justify-center rounded-full text-[14px] font-semibold uppercase leading-[0.9] tracking-[0.56px] mix-blend-hard-light ${
                locale === code
                  ? "bg-black px-3 text-white"
                  : "w-[52px] bg-transparent text-black/48"
              }`}
            >
              <span className="w-7 text-center">{code}</span>
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
            className="pointer-events-none absolute left-1/2 top-[28.827%] h-[42.344%] w-[118%] max-w-none -translate-x-1/2 object-fill max-desk:top-[31.25%] max-desk:h-[37.6%] max-desk:w-[151.7%]"
          />
          <div className="relative z-10 flex h-full flex-col items-center justify-center px-6 text-center text-white">
            <div className="flex w-full max-w-[632px] flex-col items-center gap-6">
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
