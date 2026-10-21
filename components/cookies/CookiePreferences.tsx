"use client";

import { useEffect, useId, useRef, useState } from "react";
import { OPTIONAL_CATEGORIES, type ConsentChoices, type OptionalCategory } from "@/lib/consent";
import { useText } from "@/lib/ui-text";
import { BUTTON_GRADIENT, BUTTON_WHITE, CARD } from "./styles";

/** English source strings; translated through ui-*.json. */
const CATEGORY_COPY: Record<"necessary" | OptionalCategory, { name: string; description: string }> = {
  necessary: {
    name: "Strictly necessary",
    description: "Required for security, spam protection and saving your application. Always active.",
  },
  functional: {
    name: "Functional",
    description: "Remembers your language choice on this device.",
  },
  analytics: {
    name: "Analytics",
    description: "Helps us see how people use the site so we can improve it",
  },
};

const ROW = "flex items-center gap-3 border-b border-black/12 py-5 last:border-b-0 desk:justify-between desk:py-3";
const NAME = "text-[16px] leading-[0.9] tracking-[-0.64px] desk:text-[20px] desk:tracking-[-0.8px]";
const DESCRIPTION = "text-[14px] leading-none tracking-[-0.56px] text-black/72 desk:text-[16px] desk:tracking-[-0.64px]";

/** Figma toggle: white pill, black knob on the right when on, grey knob on the left when off. */
function Toggle({ checked, onChange, labelledBy, describedBy }: { checked: boolean; onChange: (next: boolean) => void; labelledBy: string; describedBy: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      onClick={() => onChange(!checked)}
      className="flex w-[72px] shrink-0 items-center rounded-full bg-white p-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black"
    >
      <span
        aria-hidden
        className={`size-8 rounded-full transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${
          checked ? "translate-x-8 bg-black" : "bg-black/32"
        }`}
      />
    </button>
  );
}

/**
 * Cookie preferences dialog. Figma: desktop 2308:14316, mobile 2308:13846.
 * Optional categories start off until the visitor turns them on.
 */
export function CookiePreferences({
  initial,
  onSave,
  onRejectAll,
  onClose,
}: {
  initial: ConsentChoices;
  onSave: (choices: ConsentChoices) => void;
  onRejectAll: () => void;
  onClose: () => void;
}) {
  const tr = useText();
  const id = useId();
  const [draft, setDraft] = useState<ConsentChoices>(initial);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = dialogRef.current.querySelectorAll<HTMLElement>("button, a[href]");
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      opener?.focus?.();
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center overflow-y-auto p-3">
      <div aria-hidden className="fixed inset-0 bg-white/40 backdrop-blur-[24px]" onClick={onClose} />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        tabIndex={-1}
        data-testid="cookie-preferences"
        className={`${CARD} relative my-auto flex w-full max-w-[366px] flex-col gap-3 rounded-[16px] px-3 pb-3 pt-4 outline-none desk:max-w-[534px] desk:gap-6 desk:rounded-[32px] desk:p-6`}
      >
        <div className="flex flex-col gap-3 desk:gap-6">
          <h2 id={`${id}-title`} className="text-[20px] leading-[0.9] tracking-[-0.8px] desk:text-[32px] desk:tracking-[-1.28px]">
            {tr("Manage cookie preferences")}
          </h2>
          <p className="text-[14px] leading-[1.2] tracking-[-0.56px] desk:text-[20px] desk:leading-none desk:tracking-[-0.8px]">
            {tr("Choose which categories of cookies you allow. You can change this anytime from “Cookie preferences” at the bottom of every page.")}
          </p>
        </div>

        <ul className="flex flex-col">
          <li className={ROW}>
            <div className="flex min-w-0 flex-1 flex-col gap-2 desk:gap-3">
              <p className={`${NAME} text-black`}>{tr(CATEGORY_COPY.necessary.name)}</p>
              <p className={DESCRIPTION}>{tr(CATEGORY_COPY.necessary.description)}</p>
            </div>
            <p className={`${DESCRIPTION} shrink-0 whitespace-nowrap`}>{tr("Always active")}</p>
          </li>
          {OPTIONAL_CATEGORIES.map((category) => (
            <li key={category} className={ROW}>
              <div className="flex min-w-0 flex-1 flex-col gap-2 desk:gap-3">
                <p id={`${id}-${category}`} className={`${NAME} text-black`}>
                  {tr(CATEGORY_COPY[category].name)}
                </p>
                <p id={`${id}-${category}-desc`} className={DESCRIPTION}>
                  {tr(CATEGORY_COPY[category].description)}
                </p>
              </div>
              <Toggle
                checked={draft[category]}
                onChange={(next) => setDraft((current) => ({ ...current, [category]: next }))}
                labelledBy={`${id}-${category}`}
                describedBy={`${id}-${category}-desc`}
              />
            </li>
          ))}
        </ul>

        <div className="flex flex-col gap-2 desk:flex-row desk:gap-0">
          <button type="button" onClick={onRejectAll} className={`${BUTTON_WHITE} desk:min-w-0 desk:flex-1`}>
            {tr("Reject all")}
          </button>
          <button type="button" onClick={() => onSave(draft)} className={`${BUTTON_GRADIENT} desk:min-w-0 desk:flex-1`}>
            {tr("Save preferences")}
          </button>
        </div>
      </div>
    </div>
  );
}
