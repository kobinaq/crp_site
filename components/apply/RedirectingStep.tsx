"use client";

import type { ReactNode } from "react";
import { FormShell } from "./FormShell";

// Full-panel status screen after submit (Figma 2308:6237 "Redirecting you to
// the homepage …" and 2308:6210 "Hi Jane Doe, …"): same header and 1072px
// panel as the form steps, text centred, no Continue bar.
export function RedirectingStep({
  message,
  detail,
  onBack,
  pending = !detail,
}: {
  message: string;
  /** Secondary copy under the heading (the check-email screen). */
  detail?: ReactNode;
  onBack?: () => void;
  /** Animated dots under the heading while a redirect is on its way. */
  pending?: boolean;
}) {
  return (
    <FormShell fill wide onBack={onBack} footer={<div aria-hidden className="h-4 desk:h-20" />}>
      <div className="flex h-full min-h-[60dvh] flex-col items-center justify-center gap-6 px-6 text-center text-black desk:min-h-0 desk:gap-8 desk:px-2">
        <p
          role="status"
          className="max-w-[632px] text-[32px] leading-[0.9] tracking-[-1.28px] desk:text-[48px] desk:tracking-[-1.92px]"
        >
          {message}
          {pending ? (
            <span aria-hidden className="mt-2 flex justify-center gap-1.5 desk:mt-3">
              {[0, 1, 2].map((i) => (
                <span key={i} className="size-1.5 animate-pulse rounded-full bg-black desk:size-2" style={{ animationDelay: `${i * 150}ms` }} />
              ))}
            </span>
          ) : null}
        </p>
        {detail ? (
          <div className="max-w-[632px] text-[22px] leading-[0.96] tracking-[-0.88px] desk:text-[32px] desk:tracking-[-1.28px]">{detail}</div>
        ) : null}
      </div>
    </FormShell>
  );
}
