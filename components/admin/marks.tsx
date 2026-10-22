import type { ReactNode } from "react";

export const card = "rounded-[32px] bg-white p-6";
export const pill = "inline-flex h-12 items-center justify-center rounded-full gradient-brand px-6 text-sm font-semibold uppercase tracking-wide text-white disabled:opacity-60";
export const quiet = "inline-flex h-12 items-center justify-center rounded-full border border-black/15 bg-white px-5 text-sm font-semibold";
export const field = "h-12 w-full rounded-[40px] border border-black/12 bg-cream px-5 text-base outline-none focus-visible:border-black";
export const area = "min-h-40 w-full rounded-3xl border border-black/12 bg-cream p-4 text-base leading-6 outline-none focus-visible:border-black";

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
