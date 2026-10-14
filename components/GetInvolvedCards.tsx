"use client";

import {
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";
import { motion, useTransform } from "framer-motion";
import Image from "next/image";
import Link from "@/components/LocaleLink";
import { usePointerOrigin } from "@/lib/usePointerOrigin";
import { useCopy } from "./LanguageProvider";
import { TicketTab } from "./TicketTab";

/** Figma card edge length — internals are authored at this size. */
const DESIGN = 536;

const CARD = "group relative aspect-square overflow-hidden";
const CARD_SHELL = "group relative aspect-square";
const SECTION_SIZE =
  "rounded-[88px] desk:rounded-blob-lg desk:mx-auto desk:max-h-[calc(100svh-11rem)] desk:w-full desk:max-w-[calc(100svh-11rem)]";
const POPUP_SHELL =
  "mx-auto w-full max-w-[536px] desk:mx-0 desk:h-full desk:max-h-[536px] desk:w-auto desk:max-w-[min(536px,50%)]";

const REVEAL =
  "duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none";

/**
 * Outer box fills available space; inner stays at the 536² Figma layout and
 * scales uniformly so radius, ticket, type, and CTAs shrink together.
 */
function ScaledDesignCard({
  className = "",
  overflowVisible = false,
  children,
}: {
  className?: string;
  overflowVisible?: boolean;
  children: ReactNode;
}) {
  const outerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const el = outerRef.current;
    if (!el) return;
    const measure = () => {
      const w = el.clientWidth;
      if (w > 0) setScale(Math.min(1, w / DESIGN));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={outerRef} className={`relative aspect-square ${className}`}>
      <div
        className={`absolute left-0 top-0 ${overflowVisible ? "overflow-visible" : "overflow-hidden"}`}
        style={{
          width: DESIGN,
          height: DESIGN,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
          borderRadius: 154,
        }}
      >
        {children}
      </div>
    </div>
  );
}

function ArrowCircle() {
  return (
    <span className="grid h-14 w-14 place-items-center rounded-full bg-white shadow-lg desk:h-20 desk:w-20">
      <span className="flex h-5 w-[19px] items-center justify-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/icons/arrow-right.svg"
          alt=""
          width={19}
          height={20}
          className="h-5 w-[19px] rotate-90"
        />
      </span>
    </span>
  );
}

function YouthActions({ onNavigate }: { onNavigate?: () => void }) {
  const copy = useCopy();

  return (
    <div className="absolute inset-x-0 bottom-0 p-6 desk:p-10">
      <div
        aria-hidden
        className={`pointer-events-none absolute inset-x-0 bottom-8 hidden justify-center transition-[opacity,transform] ${REVEAL} desk:bottom-10 desk:flex desk:group-hover:translate-y-4 desk:group-hover:scale-75 desk:group-hover:opacity-0 desk:group-focus-within:translate-y-4 desk:group-focus-within:scale-75 desk:group-focus-within:opacity-0`}
      >
        <ArrowCircle />
      </div>

      <div
        className={`relative flex transition-[opacity,transform] ${REVEAL} desk:translate-y-5 desk:opacity-0 desk:pointer-events-none desk:delay-75 desk:group-hover:translate-y-0 desk:group-hover:opacity-100 desk:group-hover:pointer-events-auto desk:group-hover:delay-0 desk:group-focus-within:translate-y-0 desk:group-focus-within:opacity-100 desk:group-focus-within:pointer-events-auto desk:group-focus-within:delay-0`}
      >
        <Link
          href="/nominate"
          onClick={onNavigate}
          className="flex h-12 flex-1 items-center justify-center rounded-full bg-white px-4 text-[14px] font-semibold uppercase leading-[0.9] tracking-[0.04em] text-black transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:scale-[1.02] active:scale-[0.98] desk:h-20 desk:text-[20px]"
        >
          {copy.involved.nominate}
        </Link>
        <Link
          href="/apply"
          onClick={onNavigate}
          className="gradient-brand flex h-12 flex-1 items-center justify-center rounded-full px-4 text-[14px] font-semibold uppercase leading-[0.9] tracking-[0.04em] text-white transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:scale-[1.02] active:scale-[0.98] desk:h-20 desk:text-[20px]"
        >
          {copy.involved.apply}
        </Link>
      </div>
    </div>
  );
}

type InvolvedCardProps = {
  surface?: "section" | "popup";
  onNavigate?: () => void;
  /** About page mobile: Figma 297px cards with 20px one-line titles (desktop unchanged). */
  compact?: boolean;
};

const TITLE_SIZE = "text-[clamp(24px,3.4vw,40px)]";
const COMPACT_TITLE_SIZE = "whitespace-nowrap text-[20px] tracking-[-0.8px] desk:whitespace-normal desk:text-[clamp(24px,3.4vw,40px)] desk:tracking-[-0.04em]";

function YouthContent({ onNavigate, compact = false }: { onNavigate?: () => void; compact?: boolean }) {
  const copy = useCopy();

  return (
    <>
      <div className="absolute inset-0 overflow-hidden rounded-[inherit]">
        <Image
          src="/images/involved-youth.png"
          alt={copy.involved.youthAlt}
          fill
          sizes="(min-width: 900px) 536px, 90vw"
          className="object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/15 via-transparent to-black/45" />
      </div>

      <TicketTab
        placement="top"
        size="lg"
        label={copy.involved.programDates}
        className="!-top-[4px]"
      />

      <div className="absolute inset-0 flex items-center justify-center px-8 text-center">
        <p className={`${compact ? `max-w-none desk:max-w-[12ch] ${COMPACT_TITLE_SIZE}` : `max-w-[12ch] ${TITLE_SIZE}`} leading-[0.9] tracking-[-0.04em] text-white [text-shadow:0_1px_16px_rgba(0,0,0,0.35)]`}>
          {copy.involved.youth}
        </p>
      </div>

      <YouthActions onNavigate={onNavigate} />
    </>
  );
}

export function YouthAmbassadorCard({
  surface = "section",
  onNavigate,
  compact = false,
}: InvolvedCardProps) {
  if (surface === "popup") {
    return (
      <ScaledDesignCard className={`${CARD_SHELL} ${POPUP_SHELL}`} overflowVisible>
        <YouthContent onNavigate={onNavigate} />
      </ScaledDesignCard>
    );
  }

  return (
    <div className={`${CARD_SHELL} overflow-visible ${SECTION_SIZE}`}>
      <YouthContent onNavigate={onNavigate} compact={compact} />
    </div>
  );
}

function PartnerContent({ onNavigate, compact = false }: { onNavigate?: () => void; compact?: boolean }) {
  const copy = useCopy();
  const { x, y, active, onPointerMove, onPointerLeave } = usePointerOrigin();
  const shiftX = useTransform(x, [0, 1], ["-12%", "12%"]);
  const shiftY = useTransform(y, [0, 1], ["-12%", "12%"]);
  const washLeft = useTransform(x, (value) => `${(value * 100).toFixed(2)}%`);
  const washTop = useTransform(y, (value) => `${(value * 100).toFixed(2)}%`);
  const washOpacity = useTransform(active, [0, 1], [0, 0.5]);

  return (
    <a
      href="/partner"
      aria-label={copy.a11y.partnerUp}
      onClick={onNavigate}
      className="absolute inset-0 block overflow-hidden rounded-[inherit]"
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
      onPointerCancel={onPointerLeave}
    >
      <motion.div
        aria-hidden
        className="absolute inset-[-22%]"
        style={{ x: shiftX, y: shiftY }}
      >
        <Image
          src="/images/sponsor-gradient.jpg"
          alt=""
          fill
          sizes="(min-width: 900px) 536px, 90vw"
          className="object-cover"
        />
      </motion.div>

      <motion.div
        aria-hidden
        className="pointer-events-none absolute h-[80%] w-[80%] -translate-x-1/2 -translate-y-1/2 rounded-full blur-[80px] mix-blend-soft-light"
        style={{
          left: washLeft,
          top: washTop,
          opacity: washOpacity,
          background:
            "radial-gradient(circle at 50% 50%, #FA8D2E 0%, #EC268F 48%, transparent 72%)",
        }}
      />

      <div className="absolute inset-0 flex items-center justify-center px-8 text-center">
        <p className={`${compact ? COMPACT_TITLE_SIZE : TITLE_SIZE} leading-[0.9] tracking-[-0.04em] text-white [text-shadow:0_1px_16px_rgba(0,0,0,0.25)]`}>
          {copy.involved.partner}
        </p>
      </div>

      <div className="absolute inset-x-0 bottom-8 flex justify-center transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-105 desk:bottom-10">
        <ArrowCircle />
      </div>
    </a>
  );
}

export function PartnerCard({
  surface = "section",
  onNavigate,
  compact = false,
}: InvolvedCardProps) {
  if (surface === "popup") {
    return (
      <ScaledDesignCard className={`group ${CARD} ${POPUP_SHELL}`}>
        <PartnerContent onNavigate={onNavigate} />
      </ScaledDesignCard>
    );
  }

  return (
    <div className={`${CARD} rounded-[88px] desk:rounded-blob-lg ${SECTION_SIZE}`}>
      <PartnerContent onNavigate={onNavigate} compact={compact} />
    </div>
  );
}
