"use client";

import { useText } from "@/lib/ui-text";

import type { ReactNode } from "react";

// Feedback toast for the apply form (Figma 2308:3615 error, 2308:3947 success,
// 2308:4277 short error). Error is a cream bar with a pink warning chip and an
// optional white action pill; success is a black bar with a periwinkle check
// chip. The bar hugs short messages and caps at 874px.
export function Toast({
  variant,
  children,
  action,
  onClose,
}: {
  variant: "error" | "success";
  children: ReactNode;
  action?: { label: string; onClick: () => void };
  onClose: () => void;
}) {
  const tr = useText();
  const err = variant === "error";
  return (
    <div
      role="status"
      className={`flex w-full max-w-[874px] flex-col gap-3 rounded-[32px] border p-4 drop-shadow-[0_4px_16px_rgba(0,0,0,0.12)] desk:w-fit desk:flex-row desk:items-center desk:p-6 ${
        err ? "border-[rgba(179,25,66,0.12)] bg-cream" : "border-[rgba(109,192,110,0.12)] bg-black"
      }`}
    >
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <span
          aria-hidden
          className={`grid size-14 shrink-0 place-items-center rounded-[10px] border desk:size-20 ${
            err ? "border-[rgba(179,25,66,0.12)] bg-[#fde0e6]" : "border-[rgba(88,101,242,0.12)] bg-[rgba(88,101,242,0.32)]"
          }`}
        >
          {err ? (
            <svg viewBox="0 0 24 24" className="size-6" aria-hidden>
              <circle cx="12" cy="12" r="9.5" fill="#b31942" />
              <path d="M12 7.5v5.25" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />
              <circle cx="12" cy="16.1" r="1.1" fill="#fff" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" className="size-6" aria-hidden>
              <circle cx="12" cy="12" r="9.5" fill="#5865f2" />
              <path d="M8.25 12.25l2.5 2.5 5-5" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </span>
        <div
          className={`min-w-0 flex-1 text-[16px] leading-[1.05] tracking-[-0.64px] desk:text-[20px] desk:leading-none desk:tracking-[-0.8px] ${
            err ? "text-[#5d0d22]" : "text-[#a8aff8]"
          }`}
        >
          {children}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2 self-end desk:self-stretch">
        {action ? (
          <button
            type="button"
            onClick={action.onClick}
            className="flex h-14 items-center justify-center whitespace-nowrap rounded-full bg-white px-6 text-[16px] font-semibold uppercase leading-[0.9] tracking-[0.8px] text-black mix-blend-hard-light transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:scale-[1.02] active:scale-[0.98] desk:h-20 desk:px-8 desk:text-[20px]"
          >
            {action.label}
          </button>
        ) : null}
        <button
          type="button"
          onClick={onClose}
          aria-label={tr("Dismiss")}
          className={`grid size-12 place-items-center rounded-full desk:size-20 ${err ? "text-black" : "text-white"}`}
        >
          <svg viewBox="0 0 24 24" className="size-6" aria-hidden>
            <path d="M5.5 5.5l13 13M18.5 5.5l-13 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </div>
  );
}
