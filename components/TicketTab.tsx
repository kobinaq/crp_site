import type { ReactNode } from "react";

type TicketTabProps = {
  label: ReactNode;
  placement: "top" | "bottom";
  size?: "sm" | "lg";
  className?: string;
  /** Black chip with light type — Figma team tabs on photos. */
  ink?: boolean;
  /** Overrides the chip's type size so a long label can stay on one line. */
  labelPx?: number;
  /** Caps the whole tab, ears included. Height stays the Figma team-tab size. */
  maxWidth?: number;
  /** Team-tab size that wraps onto extra lines instead of shrinking or truncating (mobile team grid). */
  wrap?: boolean;
};

// Concave corner that blends the chip into the surface it sits on, so it has
// to take the chip's colour rather than the baked-in fill the SVG assets have.
function Ear({ className }: { className: string }) {
  return (
    <svg
      viewBox="0 0 19.125 19.125"
      preserveAspectRatio="none"
      className={`block ${className}`}
      aria-hidden
    >
      <path
        d="M0 0C0 10.5624 8.56255 19.125 19.125 19.125H0V0Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function TicketTab({
  label,
  placement,
  size = "sm",
  className = "",
  ink = false,
  labelPx,
  maxWidth,
  wrap = false,
}: TicketTabProps) {
  const isTop = placement === "top";
  const isLarge = size === "lg";
  const capped = maxWidth !== undefined;

  const tone = ink
    ? "text-black"
    : isLarge
      ? isTop
        ? "text-black"
        : "text-cream"
      : isTop
        ? "text-white"
        : "text-black";

  const earSize = isLarge
    ? "h-[19px] w-[19px] desk:h-[38.25px] desk:w-[38.25px]"
    : capped
      ? "h-[19.125px] w-[19.125px]"
      : "h-[19px] w-[19px]";

  const chip = wrap
    ? `min-h-[32.625px] min-w-0 px-[8px] py-[6px] text-[12px] tracking-[0.04em] bg-current ${
        isTop ? "rounded-b-[13.5px]" : "rounded-t-[13.5px]"
      }`
    : isLarge
    ? isTop
      ? "h-[33px] px-[18px] text-[13.5px] rounded-b-[13.5px] tracking-[0.96px] bg-current desk:h-[65.25px] desk:px-[36px] desk:text-[24px] desk:rounded-b-[27px]"
      : "h-[33px] px-[18px] text-[13.5px] rounded-t-[13.5px] tracking-[0.96px] bg-current desk:h-[65.25px] desk:px-[36px] desk:text-[24px] desk:rounded-t-[27px]"
    : capped
      ? `h-[32.625px] min-w-0 overflow-hidden px-[18px] text-[12px] tracking-[0.04em] bg-current ${
          isTop
            ? "rounded-b-[13.5px]"
            : "rounded-t-[13.5px] [text-shadow:0_0_4.5px_rgba(0,0,0,0.25)]"
        }`
      : `min-h-[33px] px-[18px] py-[11px] text-[13.5px] tracking-[0.04em] bg-current ${
          isTop
            ? "rounded-b-[13.5px]"
            : "rounded-t-[13.5px] [text-shadow:0_0_4.5px_rgba(0,0,0,0.25)]"
        }`;

  const labelTone = ink
    ? "text-white/72 [text-shadow:0_0_4.5px_rgba(0,0,0,0.25)]"
    : isLarge
      ? isTop
        ? "text-white"
        : "text-black"
      : isTop
        ? "text-black/72"
        : "text-white/72";

  // 2px overlap kills flex/SVG hairlines between ear and chip.
  const leftEar = `${earSize} shrink-0 -mr-[2px] ${
    isTop ? "rotate-180" : "-scale-y-100 rotate-180"
  }`;
  const rightEar = `${earSize} shrink-0 -ml-[2px] ${
    isTop ? "-scale-y-100" : ""
  }`;

  return (
    // Center with inset + justify so translateX(-50%) can't open a subpixel
    // seam along the docked edge.
    <div
      className={`pointer-events-none absolute inset-x-0 z-20 flex justify-center ${
        isTop ? "-top-px" : "-bottom-px"
      } ${className}`}
    >
      <div
        className={`relative flex min-w-0 ${capped ? "w-max shrink-0" : ""} ${tone} ${
          isTop ? "items-start" : "items-end"
        }`}
        style={capped ? { maxWidth } : wrap ? { maxWidth: "100%" } : undefined}
      >
        {/* Bleed strip under the docked edge of this ticket only. */}
        <span
          aria-hidden
          className={`absolute inset-x-0 h-[3px] bg-current ${
            isTop ? "-top-px" : "-bottom-px"
          }`}
        />
        <Ear className={leftEar} />
        <span
          className={`relative z-[1] items-center justify-center text-center font-semibold uppercase leading-[0.9] ${
            capped ? "flex min-w-0" : "inline-flex"
          } ${chip} ${!wrap && (typeof label === "string" || capped) ? "whitespace-nowrap" : ""}`}
          style={labelPx === undefined ? undefined : { fontSize: labelPx }}
        >
          <span className={`mix-blend-hard-light ${capped ? "min-w-0 truncate" : ""} ${labelTone}`}>
            {label}
          </span>
        </span>
        <Ear className={rightEar} />
      </div>
    </div>
  );
}
