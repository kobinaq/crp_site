"use client";

export function FormRadioCard({
  label,
  selected,
  onSelect,
  mobileTall = false,
}: {
  label: string;
  selected: boolean;
  onSelect: () => void;
  /** Phones only (Figma 2308:9574): 102px card, 40px radius, 24px radio. */
  mobileTall?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`flex min-w-0 flex-1 flex-col items-start justify-center gap-2.5 rounded-[28px] px-5 py-4 text-left desk:gap-3 desk:rounded-[32px] desk:p-6 ${mobileTall ? "max-desk:h-[102px] max-desk:gap-4 max-desk:rounded-[40px] max-desk:px-6 max-[380px]:px-4" : ""} ${
        selected ? "bg-black text-white" : "bg-cream text-black"
      }`}
    >
      <span
        aria-hidden
        className={`grid size-7 shrink-0 place-items-center rounded-full border desk:size-8 ${mobileTall ? "max-desk:size-6" : ""} ${
          selected ? "border-white bg-black" : "border-black bg-transparent"
        }`}
      >
        {selected ? <span className={`size-3 rounded-full bg-lime desk:size-3.5 ${mobileTall ? "max-desk:size-2.5" : ""}`} /> : null}
      </span>
      <span className="text-[16px] leading-[1.2] tracking-[-0.64px] desk:text-[20px] desk:tracking-[-0.8px]">
        {label}
      </span>
    </button>
  );
}
