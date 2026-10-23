"use client";

import Image from "next/image";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useFitRow } from "@/lib/useFitText";
import {
  motion,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
} from "framer-motion";
import { DisplayWordmark } from "./DisplayWordmark";
import { TicketTab } from "./TicketTab";
import { useCopy } from "./LanguageProvider";

const ROTATE_MS = 2600;
const SLIDE_MS = 520;
const ACTIVE_TEXT =
  "whitespace-nowrap text-[20px] tracking-[-0.8px] desk:text-[32px] desk:tracking-[-1.28px]";
const IDLE_TEXT =
  "whitespace-nowrap text-[16px] tracking-[-0.64px] text-black/25 desk:text-[24px] desk:tracking-[-0.96px]";

function BringingTogether() {
  const copy = useCopy();
  const groups = copy.pavilion.groups;
  const reduceMotion = useReducedMotion();
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [sliding, setSliding] = useState(true);

  useEffect(() => {
    if (paused || reduceMotion) return;
    const id = setTimeout(() => setIndex((v) => v + 1), ROTATE_MS);
    return () => clearTimeout(id);
  }, [index, paused, reduceMotion]);

  // The list is rendered twice so the last item can scroll onward into the
  // first; once it lands there the jump back to the top is done untransitioned.
  useEffect(() => {
    if (index < groups.length) return;
    const id = setTimeout(() => {
      setSliding(false);
      setIndex(0);
    }, SLIDE_MS);
    return () => clearTimeout(id);
  }, [index, groups.length]);

  useEffect(() => {
    if (sliding) return;
    const id = requestAnimationFrame(() =>
      requestAnimationFrame(() => setSliding(true)),
    );
    return () => cancelAnimationFrame(id);
  }, [sliding]);

  // Desktop pill: rows keep their natural height (labels can wrap to two lines) with a
  // 16px gap, so the offset that centres the active row is measured, not computed.
  const pillListRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const list = pillListRef.current;
    if (!list) return;
    const place = () => {
      const row = list.children[index] as HTMLElement | undefined;
      if (!row) return;
      const centre = row.offsetTop + row.offsetHeight / 2;
      list.style.transform = `translateY(${48 - centre}px)`;
    };
    place();
    // The pill is display:none on phones; re-place once it shows (resize, font load).
    const observer = new ResizeObserver(place);
    observer.observe(list);
    return () => observer.disconnect();
  }, [index, groups]);

  const label = `${copy.pavilion.bringing} ${groups.join(", ")} ${copy.pavilion.together}`;
  const mobileRowRef = useFitRow<HTMLDivElement>(label);
  const motionOn = sliding && reduceMotion !== true;

  const pauseHandlers = {
    onPointerEnter: () => setPaused(true),
    onPointerLeave: () => setPaused(false),
    onFocusCapture: () => setPaused(true),
    onBlurCapture: () => setPaused(false),
  };
  const listMotion = motionOn
    ? "transition-transform duration-[520ms] ease-[cubic-bezier(0.22,1,0.36,1)]"
    : "";

  return (
    <>
    {/* Desktop (Figma 2308:204): the active group sits in a black pill, neighbours clipped at its edges. */}
    <div className="hidden items-center gap-[8px] text-center leading-[0.9] desk:flex">
      <p className="whitespace-nowrap text-[32px] tracking-[-1.28px] text-black/72">{copy.pavilion.bringing}</p>
      <span className="sr-only">{label}</span>
      <div
        aria-hidden
        {...pauseHandlers}
        className="relative h-[96px] w-[272px] shrink-0 overflow-hidden rounded-full bg-black"
      >
        <div
          ref={pillListRef}
          className={`absolute inset-x-0 top-0 flex flex-col items-center gap-[16px] ${listMotion}`}
        >
          {[...groups, ...groups].map((group, row) => (
            <button
              key={`${group}-${row}`}
              type="button"
              tabIndex={-1}
              onClick={() => setIndex(row)}
              className="flex min-h-[36px] w-full items-center justify-center px-[24px] text-center text-[20px] font-semibold uppercase leading-[1.2] tracking-[0.8px] text-white mix-blend-hard-light"
            >
              {group}
            </button>
          ))}
        </div>
      </div>
      <p className="whitespace-nowrap text-[32px] tracking-[-1.28px] text-black/72">{copy.pavilion.together}</p>
    </div>
    <div ref={mobileRowRef} className="flex items-center gap-[8px] text-center leading-[0.9] desk:hidden">
      <p className={`${ACTIVE_TEXT} text-black/72`}>{copy.pavilion.bringing}</p>

      <span className="sr-only">{label}</span>

      <div
        aria-hidden
        onPointerEnter={() => setPaused(true)}
        onPointerLeave={() => setPaused(false)}
        onFocusCapture={() => setPaused(true)}
        onBlurCapture={() => setPaused(false)}
        className="relative grid h-[calc(var(--row)*3)] w-max grid-cols-[max-content] overflow-x-visible overflow-y-clip [--row:28px] desk:[--row:40px]"
      >
        {/* Size the column to the longest label so Bringing/together stay put. */}
        {groups.map((group) => (
          <span
            key={group}
            className={`invisible col-start-1 row-start-1 w-max ${ACTIVE_TEXT}`}
          >
            {group}
          </span>
        ))}
        <div
          className={`absolute inset-x-0 top-[var(--row)] ${
            motionOn
              ? "transition-transform duration-[520ms] ease-[cubic-bezier(0.22,1,0.36,1)]"
              : ""
          }`}
          style={{
            transform: `translateY(calc(var(--row) * -${index}))`,
          }}
        >
          {[...groups, ...groups].map((group, row) => {
            const active = row === index;
            return (
              <button
                key={`${group}-${row}`}
                type="button"
                tabIndex={-1}
                onClick={() => setIndex(row)}
                className={`flex h-[var(--row)] w-full items-center justify-center text-center transition-colors desk:justify-start desk:text-left ${
                  active ? `${ACTIVE_TEXT} text-black` : IDLE_TEXT
                }`}
              >
                {group}
              </button>
            );
          })}
        </div>
      </div>

      <p className={`${ACTIVE_TEXT} text-black/72`}>{copy.pavilion.together}</p>
    </div>
    </>
  );
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const easeInOut = (v: number) =>
  v < 0.5 ? 4 * v * v * v : 1 - Math.pow(-2 * v + 2, 3) / 2;

export function PavilionPanel() {
  const copy = useCopy();
  const ref = useRef<HTMLElement>(null);
  const reduceMotion = useReducedMotion();

  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "start start"],
  });

  const progress = useSpring(scrollYProgress, {
    stiffness: 120,
    damping: 30,
    mass: 0.4,
  });

  const clipPath = useTransform(progress, (value) => {
    const p = easeInOut(clamp01(value));
    const inv = 1 - p;
    const side = `calc((50% - var(--column-w) / 2) * ${inv})`;
    const r = `calc(var(--column-w) * 0.28 * ${inv} + var(--pavilion-end-r) * ${p})`;
    return `inset(0px ${side} 0px ${side} round ${r})`;
  });

  const style = reduceMotion
    ? undefined
    : { clipPath, WebkitClipPath: clipPath };

  return (
    <section
      ref={ref}
      id="stories"
      className="relative w-full overflow-hidden rounded-t-[88px] bg-cream desk:rounded-t-[154px]"
    >
      <div className="relative mx-auto h-[844px] w-full max-w-[1200px] desk:h-[805px]">
        <div className="absolute inset-x-0 top-0 h-[670px] desk:h-[613px]">
          <motion.div
            className={`absolute inset-0 overflow-hidden [--pavilion-end-r:88px] desk:[--pavilion-end-r:154px] ${
              reduceMotion ? "rounded-[88px] desk:rounded-[154px]" : ""
            }`}
            style={style}
          >
            {/* Desktop: Figma (2308:180) crops the photo 1.6x in on the dome. */}
            <div className="absolute inset-0 desk:inset-auto desk:left-[-60%] desk:top-[-16.6%] desk:aspect-[1600/831] desk:w-[160%]">
              <Image
                src="/images/pavilion-expo.jpg"
                alt={copy.pavilion.photoAlt}
                fill
                sizes="(min-width: 900px) 1920px, 100vw"
                className="object-cover object-bottom desk:object-center"
              />
            </div>
            <div
              aria-hidden
              className="absolute inset-0 bg-black/45 mix-blend-multiply"
            />

            <div className="absolute inset-0 z-10 flex flex-col items-center px-4 pb-[63px] pt-[96px] desk:pb-[97px] desk:pt-[96px]">
              <div className="flex flex-col items-center">
                <DisplayWordmark
                  kicker={copy.pavilion.kicker}
                  word={copy.pavilion.word}
                  size="xl"
                  className="gap-[15.641px]"
                />
                {/* Desktop (Figma 2308:196): flag + location in a 202x104 blurred panel. */}
                <div className="contents desk:relative desk:z-10 desk:-mt-[50px] desk:flex desk:h-[104px] desk:w-[202px] desk:flex-col desk:items-center desk:gap-2 desk:rounded-[12px] desk:backdrop-blur-[12px]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/images/turkey-flag.svg"
                  alt=""
                  width={72}
                  height={48}
                  className="relative z-10 -mt-[36px] h-8 w-12 overflow-clip desk:mt-0 desk:h-[48px] desk:w-[72px]"
                />
                <div className="relative z-10 mt-2 flex flex-col items-center gap-1 whitespace-nowrap font-semibold uppercase leading-[0.9] mix-blend-hard-light [text-shadow:0_0_4px_rgba(0,0,0,0.25)] desk:mt-0 desk:gap-2">
                  <p className="text-[18px] tracking-[0.72px] text-white desk:text-[24px] desk:tracking-[0.96px]">{copy.pavilion.locationPlace}</p>
                  <p className="text-[14px] tracking-[0.56px] text-white/72 desk:text-[20px] desk:tracking-[0.8px]">{copy.pavilion.locationOnline}</p>
                </div>
                </div>
              </div>

              <h2 className="mt-auto w-[342px] max-w-full text-center text-[28px] font-normal leading-[0.9] tracking-[-1.12px] text-white desk:w-[92%] desk:max-w-[859px] desk:text-[48px] desk:tracking-[-1.92px]">
                <span className="desk:hidden">{copy.pavilion.headlineMobile}</span>
                <span className="hidden desk:inline">{copy.pavilion.headline}</span>
              </h2>
            </div>
          </motion.div>
          <TicketTab
            placement="bottom"
            size="lg"
            label={copy.involved.dates}
            className="!bottom-[-5px]"
          />
        </div>

        <div className="flex h-full flex-col items-center justify-end">
          <div className="flex h-[174px] w-full items-center justify-center desk:h-[192px]">
            <BringingTogether />
          </div>
        </div>
      </div>
    </section>
  );
}
