"use client";

import Link from "@/components/LocaleLink";
import { useState } from "react";
import {
  AgeSelectionLayout,
  APPLY_GRADIENT,
} from "./age-selection/AgeSelectionLayout";
import { ExpressInterestPopup } from "./ExpressInterestPopup";
import { NominateFlow } from "./nominate/NominateFlow";
import { useApplyFlowEnabled } from "@/lib/applyFlowGate";
import { useCopy } from "./LanguageProvider";
import { useText } from "@/lib/ui-text";

const CTA_REVEAL =
  "duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none";

function CtaArrow({ className = "" }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/icons/apply/arrow-left.svg"
      alt=""
      width={24}
      height={24}
      className={`size-6 rotate-180 ${className}`}
    />
  );
}

// With the full flow enabled (dev / previews) the button opens NominateFlow,
// so it says "Nominate"; production's interest gate keeps "Express interest".
function NominateCta({ onExpress, nominate }: { onExpress: () => void; nominate: boolean }) {
  const copy = useCopy();
  const tr = useText();
  const text = nominate ? tr("Nominate") : copy.apply.interest;
  const label =
    "text-[16px] font-semibold uppercase leading-[0.9] tracking-[0.64px] mix-blend-hard-light whitespace-nowrap desk:text-[20px] desk:tracking-[0.8px]";

  return (
    <div
      className={`relative z-10 grid w-full grid-cols-[minmax(0,1fr)_64px] transition-[grid-template-columns] ${CTA_REVEAL} group-hover:grid-cols-[64px_minmax(0,1fr)] group-focus-within:grid-cols-[64px_minmax(0,1fr)] desk:grid-cols-[minmax(0,1fr)_80px] desk:group-hover:grid-cols-[80px_minmax(0,1fr)] desk:group-focus-within:grid-cols-[80px_minmax(0,1fr)]`}
    >
      <button
        type="button"
        onClick={onExpress}
        aria-label={nominate ? text : copy.a11y.expressInterest}
        className="relative flex h-[64px] min-w-0 items-center justify-center overflow-hidden rounded-full desk:h-[80px]"
        style={{ backgroundImage: APPLY_GRADIENT }}
      >
        <span
          className={`${label} px-4 text-white transition-opacity ${CTA_REVEAL} group-hover:opacity-0 group-focus-within:opacity-0`}
        >
          {text}
        </span>
        <CtaArrow
          className={`pointer-events-none absolute opacity-0 transition-opacity ${CTA_REVEAL} group-hover:opacity-100 group-focus-within:opacity-100`}
        />
      </button>
      <Link
        href="/programs?intent=nominate"
        aria-label={copy.a11y.programDetails}
        className="relative flex h-[64px] min-w-0 items-center justify-center overflow-hidden rounded-full bg-white desk:h-[80px]"
      >
        <CtaArrow
          className={`transition-opacity ${CTA_REVEAL} group-hover:opacity-0 group-focus-within:opacity-0`}
        />
        <span
          className={`${label} pointer-events-none absolute px-4 text-black opacity-0 transition-opacity ${CTA_REVEAL} group-hover:opacity-100 group-focus-within:opacity-100`}
        >
          {copy.apply.programDetails}
        </span>
      </Link>
    </div>
  );
}

export function NominatePage() {
  const copy = useCopy();
  const [interestOpen, setInterestOpen] = useState(false);
  const applyFlow = useApplyFlowEnabled();

  return (
    <>
      <AgeSelectionLayout
        title={copy.nominateLanding.title}
        subtitle={copy.apply.subtitle}
        headline={copy.nominateLanding.headline}
        body={copy.nominateLanding.body}
        cta={<NominateCta nominate={applyFlow} onExpress={() => setInterestOpen(true)} />}
      />
      {applyFlow ? (
        // Gate on (dev / previews): the nomination flow. Production keeps the interest popup.
        interestOpen ? <NominateFlow onClose={() => setInterestOpen(false)} /> : null
      ) : (
        <ExpressInterestPopup
          open={interestOpen}
          ageGroup="19_26"
          source="nominate_express_19_26"
          onClose={() => setInterestOpen(false)}
        />
      )}
    </>
  );
}
