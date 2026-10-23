import type { ReactNode } from "react";
import { Button } from "@/components/admin/Button";
import { ReviewKeys } from "@/components/admin/ReviewKeys";

export function RecordChrome({
  backHref,
  backLabel,
  title,
  meta,
  previous,
  next,
}: {
  backHref: string;
  backLabel: string;
  title: string;
  meta?: ReactNode;
  previous: string | null;
  next: string | null;
}) {
  return (
    <header className="sticky top-0 z-20 -mx-4 border-b border-black/10 bg-cream/95 px-4 py-3 backdrop-blur-sm desk:-mx-8 desk:px-8">
      <ReviewKeys previous={previous} next={next} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button href={backHref} variant="outline" size="icon" aria-label={backLabel} title={backLabel}>
          <Arrow dir="left" />
        </Button>
        <div className="flex flex-wrap gap-2">
          <Pager dir="prev" href={previous} />
          <Pager dir="next" href={next} />
        </div>
      </div>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight">{title}</h1>
      {meta ? <div className="mt-2">{meta}</div> : null}
    </header>
  );
}

function Pager({ dir, href }: { dir: "prev" | "next"; href: string | null }) {
  const label = dir === "prev" ? "Previous" : "Next";
  const hint = dir === "prev" ? "Previous (K or Left arrow)" : "Next (J or Right arrow)";
  const keys = dir === "prev" ? "ArrowLeft k" : "ArrowRight j";
  const body = (
    <>
      {dir === "prev" ? <Arrow dir="left" /> : null}
      {label}
      {dir === "next" ? <Arrow dir="right" /> : null}
    </>
  );
  if (!href) {
    return (
      <Button variant="outline" disabled title={hint} aria-keyshortcuts={keys}>
        {body}
      </Button>
    );
  }
  return (
    <Button href={href} variant="outline" title={hint} aria-keyshortcuts={keys}>
      {body}
    </Button>
  );
}

function Arrow({ dir }: { dir: "left" | "right" }) {
  return (
    <svg aria-hidden width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d={dir === "left" ? "M11 4.5 6.5 9 11 13.5" : "M7 4.5 11.5 9 7 13.5"} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
