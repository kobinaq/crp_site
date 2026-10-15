"use client";

import Image from "next/image";
import type { ReactNode } from "react";
import { SectionReveal } from "./SectionReveal";
import { useCopy } from "./LanguageProvider";

const HERO_RATIO = 1;
const HERO_RADIUS = 0.28;
const MASK_W = 100;
const MASK_H = MASK_W * HERO_RATIO;
const MASK_RX = MASK_W * HERO_RADIUS;
// Squares overlap so the column reads as one shape instead of meeting at a point.
const MASK_OVERLAP = 2;
// Peeking square plus two full squares: headline, then the empty climate-refugees tile.
const MASK_SQUARES = 3;
const VISIBLE_SQUARES = MASK_SQUARES - 1;

// Top of his head is 0.3805 down hero.jpg, here as a share of the displayed width.
const SRC_ASPECT = 1024 / 682;
const HEAD_FROM_TOP = (0.3805 / SRC_ASPECT).toFixed(4);

// The mask stretches to fit, so it needs one rect per square; CSS picks the size.
function stackMask(squares: number) {
  const rects = Array.from({ length: squares }, (_, i) => {
    const y = i === 0 ? 0 : i * MASK_H - MASK_OVERLAP;
    return `<rect y="${y}" width="${MASK_W}" height="${MASK_H + MASK_OVERLAP}" rx="${MASK_RX}"/>`;
  }).join("");

  const svg = encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${MASK_W} ${MASK_H * squares}" preserveAspectRatio="none">${rects}</svg>`,
  );
  return `url("data:image/svg+xml,${svg}")`;
}

const COPY_CLASS =
  "text-[28px] font-normal leading-[0.9] tracking-[-1.12px] desk:text-[clamp(32px,4vw,48px)] desk:tracking-[-0.04em] text-white drop-shadow-[0_2px_18px_rgba(0,0,0,0.35)]";

function HeroCopy({
  square,
  children,
  heading,
  className = "",
}: {
  square: number;
  children: ReactNode;
  heading: "h1" | "h2";
  className?: string;
}) {
  const Heading = heading;
  return (
    <div
      className={`pointer-events-none absolute inset-x-0 z-10 flex items-center justify-center px-3 text-center desk:px-[7.95%] ${className}`}
      style={{
        top: `calc(var(--hero-peek-t) + ${square} * var(--hero-h))`,
        height: "var(--hero-h)",
      }}
    >
      <SectionReveal>
        <Heading className={COPY_CLASS}>{children}</Heading>
      </SectionReveal>
    </div>
  );
}

export function Hero() {
  const copy = useCopy();
  return (
    <section
      id="top"
      data-pill-after
      className="relative overflow-hidden pt-8 desk:pt-0 [--hero-w:var(--column-w)] [--hero-peek-t:calc(var(--hero-h)*0.14)] desk:[--hero-peek-t:calc(var(--hero-h)*0.0784)] [--hero-img-zoom:7.3] desk:[--hero-img-zoom:3.6]"
      style={
        {
          ["--hero-h" as string]: `calc(var(--hero-w) * ${HERO_RATIO})`,
          ["--hero-radius" as string]: `calc(var(--hero-w) * ${HERO_RADIUS})`,
          ["--hero-img-w" as string]:
            "calc(var(--hero-img-zoom) * var(--hero-w))",
          // Where the top of his head lands: just inside the second square.
          ["--hero-head-y" as string]:
            "calc(var(--hero-peek-t) + 0.06 * var(--hero-h))",
          ["--hero-mask-sm" as string]: stackMask(MASK_SQUARES),
          ["--hero-mask-lg" as string]: stackMask(MASK_SQUARES),
        } as React.CSSProperties
      }
    >
      <div
        className="relative mx-auto"
        style={{
          width: "var(--hero-w)",
          height: `calc(var(--hero-peek-t) + ${VISIBLE_SQUARES} * var(--hero-h))`,
        }}
      >
        <div
          className="hero-stack absolute inset-x-0 bg-black"
          data-nav-tone="dark"
          style={{
            top: "calc(-1 * (var(--hero-h) - var(--hero-peek-t)))",
            height: `calc(${MASK_SQUARES} * var(--hero-h))`,
          }}
        >
          {/* Sized by width, then offset so the head lands on --hero-head-y. */}
          <Image
            src="/images/hero.jpg"
            alt={copy.hero.photoAlt}
            width={1024}
            height={682}
            priority
            sizes="(min-width: 900px) 360vw, 730vw"
            className="absolute left-1/2 max-w-none -translate-x-1/2 h-auto"
            style={{
              width: "var(--hero-img-w)",
              top: `calc(var(--hero-head-y) + var(--hero-h) - var(--hero-peek-t) - ${HEAD_FROM_TOP} * var(--hero-img-w))`,
            }}
          />
          {/* Image holds through the headline tile, then dies out across the empty tile. */}
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background: `linear-gradient(to bottom, transparent calc(100% * ${VISIBLE_SQUARES} / ${MASK_SQUARES}), #000 calc(100% * ${VISIBLE_SQUARES + 1 / 3} / ${MASK_SQUARES}))`,
            }}
          />
        </div>

        {/* Figma sets the headline below the square's centre, clear of his face. */}
        <HeroCopy heading="h1" square={0} className="desk:pt-[35%]">
          {copy.hero.line1Before}
          <span className="text-lime">{copy.hero.line1Accent}</span>
          {copy.hero.line1After}
        </HeroCopy>
        <HeroCopy heading="h2" square={1}>
          {copy.hero.line2}
        </HeroCopy>
      </div>
    </section>
  );
}
