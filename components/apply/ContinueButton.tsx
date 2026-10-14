"use client";

import { useText } from "@/lib/ui-text";

// Shared Continue control for apply / nominate forms (Figma 2184:4918):
// gradient pill with optional "N selected" count on the right.
export function ContinueButton({
  label,
  selectedCount,
  progress,
  disabled,
  onClick,
  className = "",
}: {
  label: string;
  selectedCount?: number;
  // Share of the two-part flow this screen represents. Independent of selectedCount.
  progress?: number;
  disabled?: boolean;
  onClick: () => void;
  className?: string;
}) {
  const tr = useText();
  const ready = !disabled;
  const fill = typeof progress === "number" ? Math.min(1, Math.max(0, progress)) : null;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`relative flex h-14 w-full max-w-[632px] items-center overflow-hidden rounded-full transition-[filter,opacity,transform] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:scale-[1.02] active:scale-[0.98] disabled:hover:scale-100 desk:h-20 ${
        fill !== null ? "bg-black" : "gradient-brand"
      } ${!ready ? (fill !== null ? "opacity-[0.32]" : "cursor-not-allowed opacity-40") : ""} ${className}`}
    >
      {fill !== null && fill > 0 ? (
        <span aria-hidden className="absolute inset-y-0 left-0 overflow-hidden rounded-full" style={{ width: `${fill * 100}%` }}>
          <span className="gradient-brand absolute inset-y-0 left-0" style={{ width: `${100 / fill}%` }} />
        </span>
      ) : null}
      <span className="relative flex-1 text-center text-[16px] font-semibold uppercase leading-[0.9] tracking-[0.64px] text-white mix-blend-hard-light desk:text-[20px] desk:tracking-[0.8px]">
        {label}
      </span>
      {typeof selectedCount === "number" ? (
        <span className="relative pr-8 text-[14px] font-semibold uppercase leading-[0.9] tracking-[0.64px] text-white mix-blend-hard-light desk:text-[16px]">
          {selectedCount} {tr("selected")}
        </span>
      ) : null}
    </button>
  );
}
