"use client";

import { useCopy } from "../LanguageProvider";

// Desktop sizes (Figma 2308:474) only apply where the ticker is shown on desktop (Home).
function TickerRun({ text }: { text: string }) {
  return (
    <div className="flex shrink-0 items-center gap-[54px] pr-[54px] desk:gap-[74px] desk:pr-[74px]">
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex shrink-0 items-center gap-[54px] desk:gap-[74px]">
          <p className="whitespace-nowrap text-center text-[18px] font-semibold uppercase leading-[0.9] tracking-[0.72px] text-white/48 mix-blend-hard-light desk:text-[24px] desk:tracking-[0.96px]">
            {text}
          </p>
          <span aria-hidden className="size-1 shrink-0 rounded-full bg-white/48 desk:size-2" />
        </div>
      ))}
    </div>
  );
}

/** About page mobile only (Figma 390 frame): slogan ticker tucked above the footer arc. */
export function AboutTicker({
  className = "h-[124px]",
  desktop = false,
}: {
  className?: string;
  /** Also show on desktop (Home, Figma 2308:474). About keeps it mobile only. */
  desktop?: boolean;
}) {
  const a = useCopy().aboutUs;
  return (
    <section data-nav-tone="dark" className={`relative overflow-hidden bg-black text-white ${desktop ? "" : "desk:hidden"} ${className}`}>
      <p className="sr-only">{a.ticker}</p>
      <div aria-hidden className="flex w-max animate-partners-marquee motion-reduce:animate-none">
        <TickerRun text={a.ticker} />
        <TickerRun text={a.ticker} />
      </div>
    </section>
  );
}
