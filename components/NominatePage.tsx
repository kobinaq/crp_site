"use client";

import Link from "@/components/LocaleLink";
import {
  AgeSelectionLayout,
  APPLY_GRADIENT,
} from "./age-selection/AgeSelectionLayout";
import { ExpressInterestPopup } from "./ExpressInterestPopup";
import { NominateFlow } from "./nominate/NominateFlow";
import { useApplyFlowEnabled } from "@/lib/applyFlowGate";
import { useCopy } from "./LanguageProvider";
import { useText } from "@/lib/ui-text";
import { NOMINATE_DRAFT } from "@/lib/formDraft";
import { useDraftOpen } from "@/lib/useFormDraft";

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
  // Long labels (fr "Proposer une candidature") would be clipped on one line in
  // the pill: let them wrap onto two balanced lines, a touch smaller on mobile.
  const longLabel =
    "text-center text-[14px] font-semibold uppercase leading-[0.95] tracking-[0.56px] mix-blend-hard-light text-balance desk:text-[20px] desk:tracking-[0.8px]";
  const long = text.length > 16;

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
          className={`${long ? `${longLabel} px-2 desk:px-4` : `${label} px-4`} text-white transition-opacity ${CTA_REVEAL} group-hover:opacity-0 group-focus-within:opacity-0`}
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
  const applyFlow = useApplyFlowEnabled();
  // With the full flow, an open form (and its typed answers) survives a language switch.
  const [interestOpen, setInterestOpen] = useDraftOpen(NOMINATE_DRAFT, applyFlow);

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
