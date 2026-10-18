"use client";

import { useText } from "@/lib/ui-text";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

// Step 1 of the application: Terms of application (Figma 2184:4820; mobile is
// the bottom sheet 2308:10358: grab handle, 600px tall, 32px top corners).
// Scrollable consent copy, an "Accept and continue" checkbox, and an APPLY
// button that stays disabled (black/32) until the box is checked, then turns
// into the brand gradient.
export function TermsStep({
  onAccept,
  onClose,
}: {
  onAccept: () => void;
  onClose: () => void;
}) {
  const tr = useText();
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const [accepted, setAccepted] = useState(false);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-end justify-center desk:items-center desk:p-4">
      <button
        type="button"
        aria-label={tr("Close")}
        className="absolute inset-0 bg-black/12 backdrop-blur-[58.5px]"
        onClick={onClose}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative z-10 flex h-[600px] max-h-[calc(100dvh-24px)] w-full flex-col overflow-hidden rounded-t-[32px] bg-white desk:max-h-[90dvh] desk:max-w-[590px] desk:h-[805px] desk:rounded-[88px] desk:shadow-[0_4px_27.6px_rgba(0,0,0,0.25)]"
      >
        {/* Mobile grab handle (Figma 2308:10358). */}
        <span aria-hidden className="absolute left-1/2 top-2 h-1 w-20 -translate-x-1/2 rounded-[8px] bg-black/8 desk:hidden" />

        {/* Header */}
        <div className="relative mt-2 flex h-[72px] shrink-0 items-center justify-end px-6 desk:mt-0 desk:h-auto desk:p-8">
          <h2
            id={titleId}
            className="pointer-events-none absolute inset-x-16 text-center text-[24px] leading-none tracking-[-0.96px] text-black desk:inset-x-2 desk:text-[32px] desk:leading-[0.9] desk:tracking-[-1.28px]"
          >
            {tr("Terms of application")}</h2>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label={tr("Close")}
            className="relative grid size-12 shrink-0 place-items-center rounded-full text-black opacity-0 outline-none focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-black desk:size-[72px] desk:opacity-100"
          >
            <svg viewBox="0 0 24 24" className="size-6" aria-hidden>
              <path
                d="M5.5 5.5l13 13M18.5 5.5l-13 13"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        {/* Scrollable consent copy */}
        <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-6 pb-[64px] desk:px-8 desk:pb-[104px]">
          <div className="space-y-3 text-[15px] leading-[1.4] tracking-[-0.6px] text-black/84 desk:text-[20px] desk:leading-[1.2] desk:tracking-[-0.8px] desk:text-black/72">
            <p>
              {tr("By accepting, I consent to my personal data being processed to assess my application and contact me about the program.")}</p>
            <p>
              {tr("By signing this consent form, you are officially agreeing to participate in an enriching program that delves deeply into the significant and multifaceted theme of migration. This theme is not just a topic of discussion; it serves as a lens through which we can examine how various communities around the world adapt, evolve, and flourish in the face of numerous challenges and adversities. Your participation is not merely a formality; it is a vital contribution that underscores the reality that individuals impacted by climate change are not just faceless statistics. They are real people with unique and compelling stories that deserve to be heard and understood.")}</p>
            <p>
              {tr("As part of this program, you will have the opportunity to engage with thought-provoking content and discussions that aim to shed light on the human experiences behind migration. We encourage you to reflect on the narratives of resilience and hope that emerge from these experiences. Furthermore, please take note that your involvement will require you to respond to a series of questions that will be posted on the VideoAsk platform. This interactive component is designed to foster a deeper connection and understanding of the issues at hand. By signing this consent form, you are also acknowledging and accepting the terms and conditions that govern your participation in this program. We appreciate your commitment to this important cause and look forward to your valuable insights.")}</p>
          </div>
        </div>

        {/* Cream bottom bar overlaps the scroll area so copy shows behind its rounded corners (Figma 2308:6794). */}
        <div className="relative z-10 -mt-[44px] flex shrink-0 flex-col items-center justify-center gap-6 rounded-t-[44px] bg-cream px-2 pb-2 pt-6 desk:-mt-[88px] desk:gap-8 desk:rounded-t-[88px] desk:p-8">
          <button
            type="button"
            onClick={() => setAccepted((v) => !v)}
            aria-pressed={accepted}
            className="flex items-center justify-center gap-2 px-8 desk:gap-3"
          >
            <span
              aria-hidden
              className={`grid size-4 shrink-0 place-items-center rounded-[5.333px] border-[1.333px] border-black desk:size-6 desk:rounded-[8px] desk:border-2 ${accepted ? "bg-black" : "bg-transparent"}`}
            >
              {accepted ? (
                <svg viewBox="0 0 18 13" className="size-[10.667px] desk:size-3.5" fill="none" aria-hidden>
                  <path
                    d="M2 7l4.5 4L16 2"
                    stroke="#fff"
                    strokeWidth="2.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              ) : null}
            </span>
            <span className="text-[15px] leading-[1.2] tracking-[-0.6px] text-black desk:text-[20px] desk:tracking-[-0.8px]">
              {tr("Accept and continue")}</span>
          </button>

          <button
            type="button"
            disabled={!accepted}
            onClick={() => accepted && onAccept()}
            className={`flex h-16 w-full items-center justify-center rounded-full desk:h-20 ${accepted ? "gradient-brand" : "bg-black opacity-[0.32]"}`}
          >
            <span className="text-[15px] font-semibold uppercase leading-[0.9] tracking-[0.6px] text-white mix-blend-hard-light desk:text-[20px] desk:tracking-[0.8px]">
              {tr("Apply")}</span>
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
