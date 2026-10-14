"use client";

import { useCopy } from "../LanguageProvider";

function TickerRun({ text }: { text: string }) {
  return (
    <div className="flex shrink-0 items-center gap-[54px] pr-[54px]">
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex shrink-0 items-center gap-[54px]">
          <p className="whitespace-nowrap text-center text-[18px] font-semibold uppercase leading-[0.9] tracking-[0.72px] text-white/48 mix-blend-hard-light">
            {text}
          </p>
          <span aria-hidden className="size-1 shrink-0 rounded-full bg-white/48" />
        </div>
      ))}
    </div>
  );
}

/** About page mobile only (Figma 390 frame): slogan ticker tucked above the footer arc. */
export function AboutTicker({ className = "h-[124px]" }: { className?: string }) {
  const a = useCopy().aboutUs;
  return (
    <section data-nav-tone="dark" className={`relative overflow-hidden bg-black text-white desk:hidden ${className}`}>
      <p className="sr-only">{a.ticker}</p>
      <div aria-hidden className="flex w-max animate-partners-marquee motion-reduce:animate-none">
        <TickerRun text={a.ticker} />
        <TickerRun text={a.ticker} />
      </div>
    </section>
  );
}
