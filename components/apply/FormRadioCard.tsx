"use client";

/**
 * Program choice card, shared by Apply (AboutStep) and Nominate (NomineeStep).
 * Spacing follows Figma: Apply 2308:3274 (desktop) / 2308:10749 (mobile), Nominate 2308:9574.
 * Keyboard focus draws a 2px ring just inside the card edge: black on cream, lime (the dot colour) on the
 * black selected card (the browser's default ring was black on black there). Inside, so the
 * flow's scroll container can't clip it where Apply's cards sit flush with its edges.
 * Under 380px the side padding drops to 16px in both flows so labels stay on one line.
 */
export function FormRadioCard({
  label,
  selected,
  onSelect,
  mobileTall = false,
}: {
  label: string;
  selected: boolean;
  onSelect: () => void;
  /** Phones only (Figma 2308:9574): 102px card, 40px radius, 24px radio. Content is top-aligned (24px
   *  top, base 12px gap, as 2308:9686) so radios line up when only one label wraps (FR/ES/PT). */
  mobileTall?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`flex min-w-0 flex-1 flex-col items-start justify-center gap-3 rounded-[32px] p-6 text-left transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 ${
        mobileTall
          ? "max-desk:h-[102px] max-desk:justify-start max-desk:rounded-[40px] max-desk:px-6 max-desk:pt-6 max-desk:pb-0"
          : ""
      } max-[380px]:px-4 ${
        selected ? "bg-black text-white focus-visible:outline-lime" : "bg-cream text-black focus-visible:outline-black"
      }`}
    >
      <span
        aria-hidden
        className={`grid size-6 shrink-0 place-items-center rounded-full border desk:size-8 ${
          selected ? "border-white bg-black" : "border-black bg-transparent"
        }`}
      >
        {selected ? <span className="size-2.5 rounded-full bg-lime desk:size-3.5" /> : null}
      </span>
      <span className="text-[15px] leading-[1.2] tracking-[-0.6px] desk:text-[20px] desk:tracking-[-0.8px]">
        {label}
      </span>
    </button>
  );
}
