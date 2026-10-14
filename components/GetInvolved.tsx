"use client";

import { GetInvolvedTab } from "./GetInvolvedPill";
import { PartnerCard, YouthAmbassadorCard } from "./GetInvolvedCards";
import { useCopy } from "./LanguageProvider";

export function GetInvolved({
  embedded = false,
  compactMobile = false,
}: {
  embedded?: boolean;
  /** About page: Figma 297px mobile cards with 20px titles. */
  compactMobile?: boolean;
}) {
  const copy = useCopy();
  return (
    <section
      id={embedded ? undefined : "join"}
      data-nav-tone="dark"
      className={
        embedded
          ? "relative z-10 bg-ink px-5 py-16 text-white desk:px-16 desk:py-24"
          : "relative z-10 bg-ink px-5 py-16 text-white snap-section desk:box-border desk:flex desk:h-svh desk:flex-col desk:justify-center desk:px-8 desk:py-24"
      }
    >
      {embedded ? null : (
        <GetInvolvedTab className="absolute bottom-full left-1/2 z-40 -translate-x-1/2 translate-y-px max-desk:!hidden" />
      )}
      <div className="mx-auto w-full max-w-[1072px]">
        <h2 className="text-center text-[32px] leading-[0.9] tracking-[-0.04em] desk:text-[clamp(28px,6vw,48px)]">
          {copy.involved.title}
        </h2>

        <div
          className={`mt-10 grid gap-0 desk:mt-12 desk:grid-cols-2 desk:items-stretch ${
            compactMobile ? "mx-auto w-[297px] max-w-full desk:mx-0 desk:w-auto desk:max-w-none" : ""
          }`}
        >
          <YouthAmbassadorCard compact={compactMobile} />
          <PartnerCard compact={compactMobile} />
        </div>
      </div>
    </section>
  );
}
