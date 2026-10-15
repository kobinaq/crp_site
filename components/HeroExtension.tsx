"use client";

import Image from "next/image";
import { SectionReveal } from "./SectionReveal";
import { useCopy } from "./LanguageProvider";

function CaretDown() {
  return (
    <svg
      viewBox="0 0 48 48"
      className="size-[36px] desk:size-[48px]"
      fill="none"
      aria-hidden
    >
      <path
        d="M14 20l10 10 10-10"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function HeroExtension() {
  const copy = useCopy();
  return (
    <section
      // Card shares the hero's width and 0.28 corner radius so the column reads as one.
      className="relative bg-cream [--card-w:var(--column-w)]"
      style={
        {
          ["--card-r" as string]: "calc(var(--card-w) * 0.28)",
        } as React.CSSProperties
      }
    >
      <div
        className="mx-auto -mt-px flex flex-col items-center"
        style={{ width: "var(--card-w)" }}
      >
        <div
          className="relative -mt-px flex aspect-square w-full items-center justify-center overflow-hidden bg-cream"
          data-nav-tone="dark"
          style={{ borderRadius: "var(--card-r)" }}
        >
          <Image
            src="/images/signal-field.jpg"
            alt={copy.heroExtension.photoAlt}
            fill
            sizes="(min-width: 900px) 640px, 92vw"
            className="object-cover"
          />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent via-black/25 to-black/55" />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 z-[1] h-[42%] bg-gradient-to-b from-black from-0% via-black/55 via-35% to-transparent to-100%"
          />
          <SectionReveal className="relative z-10 flex flex-col items-center gap-[12px] px-[21px] text-center text-white desk:mt-[4%] desk:px-0 desk:w-[75.2%]">
            <h2 className="text-[28px] font-normal leading-[0.9] tracking-[-1.12px] desk:text-[clamp(32px,4vw,48px)] desk:tracking-[-0.04em] drop-shadow-[0_2px_18px_rgba(0,0,0,0.35)]">
              {copy.heroExtension.title}
            </h2>
            <p className="text-[14px] font-normal leading-[0.9] tracking-[-0.56px] text-white/90 desk:text-[clamp(16px,2vw,24px)] desk:tracking-[-0.04em]">
              {copy.heroExtension.subtitle}
            </p>
            <CaretDown />
          </SectionReveal>
        </div>
        {/* Desktop (Figma 2308:167): the next square peeks out under the pavilion. */}
        <div
          aria-hidden
          className="relative hidden w-full overflow-hidden desk:block"
          style={{
            height: "calc(var(--card-w) * 0.212)",
            borderTopLeftRadius: "var(--card-r)",
            borderTopRightRadius: "var(--card-r)",
          }}
        >
          <div className="absolute inset-x-0 top-0 aspect-square">
            <Image
              src="/images/signal-field.jpg"
              alt=""
              fill
              sizes="561px"
              className="scale-y-[-1] object-cover"
            />
            <div className="absolute inset-0 bg-black/55" />
          </div>
        </div>
      </div>
    </section>
  );
}
