import type { ReactNode } from "react";

export const focusRing = "outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2";
export const card = "rounded-[32px] bg-white p-4 desk:p-6";
export const pill = `inline-flex h-12 items-center justify-center rounded-full gradient-brand px-6 text-sm font-semibold uppercase tracking-wide text-white disabled:cursor-not-allowed disabled:opacity-60 ${focusRing}`;
export const quiet = `inline-flex h-12 items-center justify-center rounded-full border border-black/15 bg-white px-5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60 ${focusRing}`;
export const field = `h-12 w-full rounded-[40px] border border-black/12 bg-cream px-5 text-base ${focusRing} focus-visible:border-black`;
export const area = `min-h-40 w-full rounded-3xl border border-black/12 bg-cream p-4 text-base leading-6 ${focusRing} focus-visible:border-black`;

export function Wordmark() {
  return (
    <p className="text-xs font-semibold uppercase tracking-[0.16em]">
      Climate Refugee Pavilion
    </p>
  );
}

export function AdminFrame({ children }: { children: ReactNode }) {
  return <div className="mx-auto w-full max-w-6xl px-4 py-6 desk:px-8 desk:py-10">{children}</div>;
}
