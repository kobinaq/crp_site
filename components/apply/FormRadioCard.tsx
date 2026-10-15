"use client";

export function FormRadioCard({
  label,
  selected,
  onSelect,
}: {
  label: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`flex min-w-0 flex-1 flex-col items-start justify-center gap-3 rounded-[32px] p-6 text-left ${
        selected ? "bg-black text-white" : "bg-cream text-black"
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
