"use client";

import { PartnerCard, WaitlistCard, YouthAmbassadorCard } from "./GetInvolvedCards";
import { useCopy } from "./LanguageProvider";

export function GetInvolved({
  embedded = false,
  compactMobile = false,
  contactMobile = false,
}: {
  embedded?: boolean;
  /** About page: Figma 297px mobile cards with 20px titles. */
  compactMobile?: boolean;
  /** Contact page: Join the waitlist + Partner up (mobile 297×294; desktop Figma 2308:7412). */
  contactMobile?: boolean;
}) {
  const narrow = compactMobile || contactMobile;
  const copy = useCopy();
  return (
    <section
      id={embedded ? undefined : "join"}
      data-nav-tone="dark"
      className={
        embedded
          ? `relative z-10 bg-ink px-5 text-white desk:px-16 desk:py-24 ${
              contactMobile ? "pb-[161px] pt-[97px]" : "py-16"
            }`
          : "relative z-10 bg-ink px-5 py-16 text-white snap-section desk:px-8 desk:py-24"
      }
    >
      <div className="mx-auto w-full max-w-[1072px]">
        <h2 className="text-center text-[32px] leading-[0.9] tracking-[-0.04em] desk:text-[clamp(28px,6vw,48px)]">
          {copy.involved.title}
        </h2>

        <div
          className={`${contactMobile ? "mt-8" : "mt-10"} grid gap-0 desk:mt-12 desk:grid-cols-2 desk:items-stretch ${
            narrow ? "mx-auto w-[297px] max-w-full desk:mx-0 desk:w-auto desk:max-w-none" : ""
          }`}
        >
          {contactMobile ? (
            <WaitlistCard />
          ) : (
            <YouthAmbassadorCard compact={compactMobile} />
          )}
          <PartnerCard compact={narrow} contact={contactMobile} />
        </div>
      </div>
    </section>
  );
}
