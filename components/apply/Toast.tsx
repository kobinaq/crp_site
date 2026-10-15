"use client";

import { useText } from "@/lib/ui-text";

import type { ReactNode } from "react";

// Feedback toast for the apply form (Figma 2308:3615 error, 2308:3947 success,
// 2308:4277 short error). Error is a cream bar with a pink warning chip and an
// optional white action pill; success is a black bar with a periwinkle check
// chip. The bar hugs short messages and caps at 874px. Mobile (Figma
// 2308:11420): 16px radius, chip + copy + close on one row, action full width below.
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
      className={`flex w-full max-w-[874px] flex-col gap-2 rounded-[16px] border p-3 drop-shadow-[0_4px_16px_rgba(0,0,0,0.12)] desk:w-fit desk:flex-row desk:items-center desk:gap-3 desk:rounded-[32px] desk:p-6 ${
        err ? "border-[rgba(179,25,66,0.12)] bg-cream" : "border-[rgba(109,192,110,0.12)] bg-black"
      }`}
    >
      <div className="flex min-w-0 flex-1 items-start gap-3 desk:items-center">
        <span
          aria-hidden
          className={`grid size-16 shrink-0 place-items-center rounded-[10px] border desk:size-20 ${
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
          className={`min-w-0 flex-1 self-center text-[12px] leading-[1.2] tracking-[-0.48px] desk:text-[20px] desk:leading-none desk:tracking-[-0.8px] ${
            err ? "text-[#5d0d22]" : "text-[#a8aff8]"
          }`}
        >
          {children}
        </div>
        <CloseButton err={err} label={tr("Dismiss")} onClose={onClose} className="size-8 desk:hidden" />
      </div>

      <div className={`shrink-0 items-center gap-2 desk:flex desk:self-stretch ${action ? "flex" : "hidden"}`}>
        {action ? (
          <button
            type="button"
            onClick={action.onClick}
            className="flex h-16 w-full items-center justify-center whitespace-nowrap rounded-full bg-white px-8 text-[15px] font-semibold uppercase leading-[0.9] tracking-[0.6px] text-black mix-blend-hard-light transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:scale-[1.02] active:scale-[0.98] desk:h-20 desk:w-auto desk:text-[20px] desk:tracking-[0.8px]"
          >
            {action.label}
          </button>
        ) : null}
        <CloseButton err={err} label={tr("Dismiss")} onClose={onClose} className="hidden size-20 desk:grid" />
      </div>
    </div>
  );
}

function CloseButton({ err, label, onClose, className }: { err: boolean; label: string; onClose: () => void; className: string }) {
  return (
    <button
      type="button"
      onClick={onClose}
      aria-label={label}
      className={`grid shrink-0 place-items-center rounded-full ${err ? "text-black" : "text-white"} ${className}`}
    >
      <svg viewBox="0 0 24 24" className="size-6" aria-hidden>
        <path d="M5.5 5.5l13 13M18.5 5.5l-13 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    </button>
  );
}
