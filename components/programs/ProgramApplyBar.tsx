"use client";

import { ExpressInterestPopup } from "../ExpressInterestPopup";
import { ApplyFlow } from "../apply/ApplyFlow";
import { NominateFlow } from "../nominate/NominateFlow";
import { useApplyFlowEnabled } from "@/lib/applyFlowGate";
import { useLanguage } from "../LanguageProvider";
import { useText } from "@/lib/ui-text";
import { APPLY_DRAFT, NOMINATE_DRAFT } from "@/lib/formDraft";
import { useDraftOpen } from "@/lib/useFormDraft";

/** Floating CTA pinned to the bottom of the viewport. */
export function ProgramApplyBar({ mode = "apply" }: { mode?: "apply" | "nominate" }) {
  const { copy } = useLanguage();
  const nominate = mode === "nominate";
  const applyFlow = useApplyFlowEnabled();
  // With the full flow, an open form (and its typed answers) survives a language switch.
  const [open, setOpen] = useDraftOpen(nominate ? NOMINATE_DRAFT : APPLY_DRAFT, applyFlow);
  const tr = useText();
  // Figma labels the bar "Apply" when it opens ApplyFlow; the production
  // ExpressInterestPopup path (and nominate mode) keep "Express interest".
  const applyLabel = applyFlow && !nominate;
  // Same gate, nominate mode: the bar opens NominateFlow, so it says "Nominate".
  const nominateLabel = applyFlow && nominate;

  return (
    <>
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center p-2 desk:p-[10px]">
        <button
          id="apply"
          type="button"
          onClick={() => setOpen(true)}
          aria-label={applyLabel ? tr("Apply") : nominateLabel ? tr("Nominate") : copy.a11y.expressInterest}
          className="gradient-brand pointer-events-auto flex w-full max-w-[632px] items-center justify-center rounded-full px-6 py-6 shadow-[0_0_5.45px_rgba(0,0,0,0.25)] transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:scale-[1.02] active:scale-[0.98] desk:h-[80px] desk:px-8 desk:py-0 desk:shadow-[0_8px_28px_rgba(236,38,143,0.35)]"
        >
          <span className="text-[20px] font-medium leading-[0.9] tracking-[-0.8px] text-white desk:font-semibold desk:uppercase desk:tracking-[0.8px]">
            {applyLabel ? tr("Apply") : nominateLabel ? tr("Nominate") : copy.apply.interest}
          </span>
        </button>
      </div>

      {applyFlow ? (
        open ? (
          nominate ? <NominateFlow onClose={() => setOpen(false)} /> : <ApplyFlow onClose={() => setOpen(false)} />
        ) : null
      ) : (
        <ExpressInterestPopup
          open={open}
          ageGroup="19_26"
          source={nominate ? "nominate_express_19_26" : "apply_express_19_26"}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
