/** Shared Tailwind classes for the cookie banner and panel (Figma 2308:13042). */
export const CARD =
  "border border-[rgba(179,25,66,0.12)] bg-[#f4f1ea] text-black shadow-[0px_4px_16px_rgba(0,0,0,0.12)]";
const BUTTON =
  "flex h-12 w-full items-center justify-center rounded-full px-7 text-[14px] font-semibold uppercase leading-[0.9] tracking-[0.56px] whitespace-nowrap transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:scale-[1.02] active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black desk:h-16";
export const BUTTON_WHITE = `${BUTTON} bg-white text-black`;
export const BUTTON_GRADIENT = `${BUTTON} gradient-brand text-white`;
export const POLICY_LINK =
  "text-[14px] leading-[1.2] tracking-[-0.56px] text-[#4651c2] whitespace-nowrap hover:underline";
