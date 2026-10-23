"use client";

import { trail } from "@/lib/fonts";
import { useFitText } from "@/lib/useFitText";

type DisplayWordmarkProps = {
  word: string;
  kicker?: string;
  className?: string;
  size?: "md" | "xl" | "platform" | "section";
};

/** The English wordmarks bleed up to 6px past each screen edge on phones; translations may too, no more. */
const screenWidth = () => document.documentElement.clientWidth + 12;

export function DisplayWordmark({
  word,
  kicker = "The",
  className = "",
  size = "md",
}: DisplayWordmarkProps) {
  // Translated words can be longer than the English ("PLATEFORME", "CONTENIDOS").
  const wordRef = useFitText<HTMLSpanElement>(word, screenWidth);
  let theClass: string;
  let wordClass: string;
  switch (size) {
    case "xl":
      theClass =
        "text-[18px] font-semibold uppercase tracking-[0.04em] text-lime mix-blend-hard-light [text-shadow:0_0_5.688px_rgba(0,0,0,0.25)] desk:text-[24px] desk:tracking-[0.96px]";
      wordClass = `${trail.className} uppercase leading-[0.9] tracking-[0.04em] text-lime text-[clamp(64px,23vw,128px)] desk:text-[130px] desk:tracking-[5.2px]`;
      break;
    case "section":
      // Mobile as "xl"; desktop at the 115px of Figma 2308:288 (OUR CONTENT).
      theClass =
        "text-[18px] font-semibold uppercase tracking-[0.04em] text-lime mix-blend-hard-light [text-shadow:0_0_5.688px_rgba(0,0,0,0.25)] desk:text-[24px] desk:tracking-[0.96px]";
      wordClass = `${trail.className} uppercase leading-[0.9] tracking-[0.04em] text-lime text-[clamp(64px,23vw,128px)] desk:text-[115px] desk:tracking-[4.6px]`;
      break;
    case "platform":
      theClass =
        "text-[18px] font-semibold uppercase tracking-[0.72px] text-lime mix-blend-hard-light [text-shadow:0_0_4px_rgba(0,0,0,0.25)] desk:text-[26px] desk:tracking-[1.02px] desk:[text-shadow:0_0_5.7px_rgba(0,0,0,0.25)]";
      wordClass = `${trail.className} uppercase whitespace-nowrap leading-[0.9] tracking-[0.04em] text-lime text-[81px] desk:text-[115px] desk:tracking-[4.6px]`;
      break;
    case "md":
      theClass = "eyebrow text-lime";
      wordClass = `${trail.className} uppercase leading-[0.85] tracking-[-0.02em] text-lime text-[clamp(64px,22vw,96px)] desk:text-[clamp(96px,11vw,140px)]`;
      break;
    default: {
      const _exhaustive: never = size;
      return _exhaustive;
    }
  }

  const stackGap =
    size === "platform" ? "gap-[11px] desk:gap-4" : size === "section" ? "desk:gap-4" : "";

  return (
    <div className={`flex flex-col items-center text-center ${stackGap} ${className}`}>
      <span className={theClass}>{kicker}</span>
      <span ref={wordRef} aria-label={word} className={wordClass}>
        {word}
      </span>
    </div>
  );
}
