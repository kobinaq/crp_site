"use client";

import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { useCopy } from "../LanguageProvider";
import { TicketTab } from "../TicketTab";
import { trail } from "@/lib/fonts";
import { aboutImages } from "@/lib/about-assets";
import { aboutTeam, type AboutTeamMember } from "@/lib/about-team";
import { useText } from "@/lib/ui-text";
import type { Pin } from "@/lib/pins";
import { ABOUT_GLOBE_WAIT_IMAGES } from "../platform/globe-defer";
import { PlatformGlobe } from "../platform/PlatformGlobe";
import { MOBILE_GLOBE_YAW, useIsMobile } from "@/lib/useIsMobile";

function FitWidth({
  designWidth,
  designHeight,
  cap = false,
  className = "",
  children,
}: {
  designWidth: number;
  designHeight: number;
  cap?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const next = el.clientWidth / designWidth;
      setScale(cap ? Math.min(1, next) : next);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [designWidth, cap]);

  return (
    <div
      ref={ref}
      className={`relative w-full ${className}`}
      style={{ height: designHeight * scale }}
    >
      <div
        className="absolute left-0 top-0 origin-top-left"
        style={{
          width: designWidth,
          height: designHeight,
          transform: `scale(${scale})`,
        }}
      >
        {children}
      </div>
    </div>
  );
}

function Glow({
  src,
  className,
  inset,
}: {
  src: string;
  className: string;
  inset: string;
}) {
  return (
    <div aria-hidden className={className}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img alt="" src={src} className="absolute max-w-none" style={{ inset }} />
    </div>
  );
}

function GlassOrb({
  icon,
  pad,
  blur,
  opacity = 1,
  className,
}: {
  icon: string;
  pad: number;
  blur?: number;
  opacity?: number;
  className: string;
}) {
  return (
    <div
      aria-hidden
      className={`absolute flex items-center rounded-full border-solid border-white/72 ${className}`}
      style={{
        padding: pad,
        opacity,
        borderWidth: pad / 16,
        filter: blur ? `blur(${blur}px)` : undefined,
      }}
    >
      <div
        className="absolute inset-0 rounded-full bg-black/64"
        style={{ backdropFilter: `blur(${pad * 0.75}px)` }}
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img alt="" src={icon} className="relative size-full" style={{ width: pad, height: pad }} />
    </div>
  );
}

function WorkLabel({ children, className }: { children: string; className?: string }) {
  return (
    <p
      className={`relative z-10 min-w-full text-[16px] font-semibold uppercase leading-[0.9] tracking-[1.28px] ${className ?? "text-black"}`}
    >
      {children}
    </p>
  );
}

function WorkTitle({
  children,
  className,
}: {
  children: string;
  className?: string;
}) {
  return (
    <p
      className={`relative z-10 text-[32px] font-normal leading-none tracking-[-1.28px] ${className ?? "text-black"}`}
    >
      {children}
    </p>
  );
}

// 80% of the 200px card, minus the ears and the chip's side padding, with a little slack so type doesn't clip.
const TICKET_TEXT_MAX = 160 - (19.125 - 2) * 2 - 18 * 2 - 4;
const TICKET_TYPE = 12;

// Keyed by the English role; both sides are translated through ui-*.json.
const SHORTER_ROLE: Readonly<Record<string, string>> = {
  "Founder & President": "Founder & Pres.",
  "Executive Producer": "Exec. Producer",
  "Sponsors Relations Director": "Sponsors Director",
  "Interactive Experience Advisor": "Experience Advisor",
  "Francophone Programs Advocate": "Francophone Adv.",
  "Climate Programming": "Climate Programs",
  "Head of Technology": "Head of Tech",
  "Coordinating Producer": "Coord. Producer",
  "Intern & Volunteer Coordinator": "Volunteer Coord.",
  "Social Media Manager": "Social Manager",
};

function estimateTextWidth(text: string, px: number): number {
  return text.length * px * 0.66;
}

function sizeToFit(text: string, widthAt: (text: string, px: number) => number): number {
  if (widthAt(text, TICKET_TYPE) <= TICKET_TEXT_MAX) return TICKET_TYPE;
  let px = 11.75;
  while (px > 6 && widthAt(text, px) > TICKET_TEXT_MAX) px -= 0.25;
  return px;
}

/** A team member with role (and its short form) in the page language. */
type TeamMember = AboutTeamMember & { shortRole?: string };

function useTeam(): TeamMember[] {
  const tr = useText();
  return aboutTeam.map((member) => {
    const shorter = SHORTER_ROLE[member.role];
    return { ...member, role: tr(member.role), shortRole: shorter === undefined ? undefined : tr(shorter) };
  });
}

function fittedRole(
  role: string,
  shorter: string | undefined,
  widthAt: (text: string, px: number) => number,
): { text: string; px: number } {
  const full = sizeToFit(role, widthAt);
  if (full >= 8) return { text: role, px: full };
  if (shorter === undefined) return { text: role, px: full };
  return { text: shorter, px: sizeToFit(shorter, widthAt) };
}

function useTicketLabel(role: string, shorter?: string) {
  const cardRef = useRef<HTMLElement | null>(null);
  const [label, setLabel] = useState(() => fittedRole(role, shorter, estimateTextWidth));

  useLayoutEffect(() => {
    const fit = () => {
      const family = cardRef.current
        ? getComputedStyle(cardRef.current).fontFamily
        : getComputedStyle(document.body).fontFamily;
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      setLabel(
        fittedRole(role, shorter, (text, px) => {
          const upper = text.toUpperCase();
          ctx.font = `600 ${px}px ${family}`;
          return ctx.measureText(upper).width + Math.max(0, upper.length - 1) * px * 0.04;
        }),
      );
    };
    fit();
    let cancel = false;
    void document.fonts.ready.then(() => {
      if (!cancel) fit();
    }).catch(() => undefined);
    return () => {
      cancel = true;
    };
  }, [role, shorter]);

  return { cardRef, ...label };
}

function TeamCard({
  photo,
  name,
  role,
  shortRole,
  expand,
  imagePosition,
}: {
  photo: string;
  name: string;
  role: string;
  shortRole?: string;
  expand?: "left" | "lead" | "right";
  imagePosition?: string;
}) {
  const wide =
    expand === "left" ? "group-hover/left:w-[320px]" : expand === "lead" ? "group-hover/lead:w-[320px]" : expand === "right" ? "group-hover/right:w-[320px]" : "";
  const clear =
    expand === "left" ? "group-hover/left:opacity-0" : expand === "lead" ? "group-hover/lead:opacity-0" : expand === "right" ? "group-hover/right:opacity-0" : "";
  const { cardRef, text: ticketText, px: ticketPx } = useTicketLabel(role, shortRole);

  return (
    <article
      ref={cardRef}
      aria-label={`${name}. ${role}`}
      className={`relative h-[200px] w-[200px] shrink-0 transition-[width] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${wide}`}
    >
      <div className="absolute inset-0 overflow-hidden rounded-[64px]">
        <Image
          src={photo}
          alt={name}
          fill
          className="object-cover"
          style={imagePosition ? { objectPosition: imagePosition } : undefined}
          sizes="320px"
        />
        <div className={`absolute inset-0 bg-black/48 transition-opacity duration-500 ${clear}`} />
        <p className="absolute bottom-5 left-0 right-0 px-5 text-center text-[18px] leading-[1.05] tracking-[-0.72px] text-white">
          {name}
        </p>
        <TicketTab placement="top" ink label={ticketText} labelPx={ticketPx} maxWidth={160} />
      </div>
    </article>
  );
}

function MobileTeamCard({
  member,
  onOpen,
}: {
  member: TeamMember;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`${member.name}. ${member.role}`}
      className="relative h-[200px] min-w-0 flex-1 overflow-hidden rounded-[32px] text-left"
    >
      <Image
        src={member.image}
        alt=""
        fill
        className="object-cover"
        style={member.imagePosition ? { objectPosition: member.imagePosition } : undefined}
        sizes="130px"
      />
      <div className="absolute inset-0 bg-black/48" />
      <div className="absolute inset-x-0 bottom-0 flex flex-col items-start justify-end gap-1 px-5 py-4">
        <p className="w-full text-center text-[15px] leading-none tracking-[-0.6px] text-white">
          {member.name}
        </p>
      </div>
      <TicketTab placement="top" ink wrap label={member.role} />
    </button>
  );
}

function TeamMemberSheet({
  member,
  onClose,
}: {
  member: TeamMember;
  onClose: () => void;
}) {
  const copy = useCopy();
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const { cardRef, text: ticketText, px: ticketPx } = useTicketLabel(member.role, member.shortRole);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-cream/92 p-6 desk:hidden">
      <button
        type="button"
        aria-label={copy.a11y.closeTeamMember}
        className="absolute inset-0"
        onClick={onClose}
      />
      <div className="relative z-10 flex w-full max-w-[342px] flex-col items-center gap-6">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          className="relative flex w-full flex-col gap-6 rounded-[72px] bg-black px-2 pb-8 pt-2"
        >
          <div
            aria-hidden
            className="absolute left-1/2 top-2 h-1 w-20 -translate-x-1/2 rounded-lg bg-black/8"
          />
          <div
            ref={(el) => {
              cardRef.current = el;
            }}
            className="relative aspect-square w-full overflow-hidden rounded-[64px]"
          >
            <Image
              src={member.image}
              alt=""
              fill
              className="object-cover"
              style={member.imagePosition ? { objectPosition: member.imagePosition } : undefined}
              sizes="326px"
            />
            <TicketTab placement="top" ink label={ticketText} labelPx={ticketPx} maxWidth={200} />
            <p
              id={titleId}
              className="absolute bottom-6 left-0 right-0 px-8 text-center text-[24px] leading-none tracking-[-0.96px] text-white"
            >
              {member.name}
            </p>
          </div>
          <p className="px-4 text-[15px] leading-[1.4] tracking-[-0.6px] text-white/84">
            {`“${member.quote}”`}
          </p>
        </div>
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label={copy.a11y.closeTeamMember}
          className="grid size-8 place-items-center rounded-full bg-black text-white"
        >
          <svg viewBox="0 0 16 16" className="size-4" fill="none" aria-hidden>
            <path
              d="M4 4l8 8M12 4l-8 8"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>
    </div>,
    document.body,
  );
}

type WorkCardCopy = { label: string; title: string };

/** Native mobile 2x2 "What we do" grid (Figma 390 frame: 195x254 cards, 64px radius). */
function MobileWorkCards({ cards }: { cards: readonly WorkCardCopy[] }) {
  const card =
    "relative flex h-[254px] min-w-0 flex-1 flex-col items-center justify-center gap-6 overflow-hidden rounded-[64px] p-6";
  const label = "relative z-10 w-full text-[14px] font-semibold uppercase leading-[0.9] tracking-[1.12px] text-black";
  const title = "relative z-10 w-full text-[24px] leading-none tracking-[-0.96px]";
  return (
    <div className="flex w-full flex-col desk:hidden">
      <div className="flex w-full">
        <article className={`${card} bg-white`}>
          <Glow
            src={aboutImages.workGlow}
            className="absolute left-[57px] top-[-75px] h-[149.5px] w-[169.814px] rotate-180"
            inset="-35.72% -31.45%"
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            alt=""
            src={aboutImages.workRings}
            className="pointer-events-none absolute right-[7.15px] top-[calc(50%-0.56px)] size-[213.848px] max-w-none -translate-y-1/2"
          />
          <GlassOrb icon={aboutImages.iconPin} pad={15} opacity={0.72} className="left-[37.71px] top-[2.67px]" />
          <GlassOrb
            icon={aboutImages.iconUser}
            pad={22.5}
            opacity={0.8}
            className="left-[152.69px] top-[calc(50%-0.56px)] -translate-y-1/2"
          />
          <GlassOrb icon={aboutImages.iconCrosshair} pad={28.12} className="left-[17.21px] top-[190.15px]" />
          <p className={label}>{cards[0].label}</p>
          <p className={`${title} text-black`}>{cards[0].title}</p>
        </article>
        <article className={`${card} bg-lime`}>
          <Glow
            src={aboutImages.workGlowStories}
            className="absolute left-[79px] top-[136px] h-[138.5px] w-[183.814px]"
            inset="-38.56% -29.05%"
          />
          <p
            aria-hidden
            className={`${trail.className} pointer-events-none absolute left-[168px] top-[6px] w-[88px] -translate-x-1/2 text-center text-[88.8px] uppercase leading-[0.7] tracking-[-1.776px] text-magenta mix-blend-plus-lighter`}
          >
            HOME
          </p>
          <p className={label}>{cards[1].label}</p>
          <p className={`${title} text-black`}>{cards[1].title}</p>
        </article>
      </div>
      <div className="flex w-full">
        <article className={`${card} bg-magenta`}>
          <Glow
            src={aboutImages.workGlowAmbassadors}
            className="absolute left-[-16px] top-[-59px] h-[149.5px] w-[169.814px]"
            inset="-35.72% -31.45%"
          />
          <p className={label}>{cards[2].label}</p>
          <p className={`${title} text-white`}>{cards[2].title}</p>
          <div className="absolute left-6 top-[194px] isolate flex items-center">
            {[aboutImages.avatar1, aboutImages.avatar2, aboutImages.avatar3].map((src, i) => (
              <span
                key={src}
                className={`relative size-6 overflow-hidden rounded-full border border-white ${i < 2 ? "-mr-[17px]" : ""}`}
                style={{ zIndex: 3 - i }}
              >
                <Image src={src} alt="" fill className="object-cover" sizes="24px" />
              </span>
            ))}
          </div>
        </article>
        <article className={`${card} bg-orange`}>
          <Glow
            src={aboutImages.workGlow}
            className="absolute left-[58px] top-[159px] h-[138.5px] w-[183.814px] rotate-180"
            inset="-38.56% -29.05%"
          />
          <p className={label}>{cards[3].label}</p>
          <p className={`${title} text-black`}>{cards[3].title}</p>
          <div className="pointer-events-none absolute left-[98px] top-[-15px] flex size-[106.215px] items-center justify-center">
            <div className="rotate-45">
              <div className="relative bg-white p-[2.59px] [border-radius:647px_647px_0_647px]">
                <div className="relative size-[69.926px]">
                  <div className="absolute left-1/2 top-1/2 flex size-[98.89px] -translate-x-1/2 -translate-y-1/2 -rotate-45 items-center justify-center">
                    <Image
                      src={aboutImages.pavilionPin}
                      alt=""
                      width={70}
                      height={70}
                      className="size-[69.926px] rounded-full object-cover"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </article>
      </div>
    </div>
  );
}

/** Native mobile H.O.M.E banner (Figma 390x170). */
function MobileHomeBanner({ topics, caption }: { topics: readonly string[]; caption: string }) {
  const spots = [
    { left: 36, top: 14.5 },
    { left: 132, top: 37.5 },
    { left: 214, top: 13.5 },
    { left: 311, top: 60.5 },
  ];
  return (
    <div className="flex h-[170px] w-full flex-col bg-black desk:hidden">
      <div className="relative flex min-h-0 flex-1 overflow-hidden rounded-[16.9px] bg-white/12 p-1">
        <div className="relative h-full min-w-0 flex-1 overflow-hidden rounded-[14.3px] bg-white">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={aboutImages.homeSlide} alt="" className="absolute inset-0 size-full object-cover" />
          <div className="pointer-events-none absolute bottom-[-0.5px] left-1/2 h-[130px] w-[385px] -translate-x-1/2 bg-gradient-to-t from-black to-transparent backdrop-blur-[3.9px] [mask-image:linear-gradient(to_top,#000_40%,transparent)]" />
          <p
            aria-hidden
            className={`${trail.className} pointer-events-none absolute left-1/2 top-[-1.95px] z-10 -translate-x-1/2 whitespace-nowrap text-center text-[146.475px] uppercase leading-[0.7] tracking-[-2.93px] text-magenta`}
          >
            HOME
          </p>
          {topics.slice(0, 4).map((topic, i) => (
            <p
              key={topic}
              className="absolute z-10 whitespace-nowrap text-[10px] font-semibold uppercase leading-[0.9] tracking-[0.4px] text-white mix-blend-hard-light"
              style={spots[i]}
            >
              {topic}
            </p>
          ))}
          <p className="absolute left-1/2 top-[106px] z-10 w-[362px] max-w-[calc(100%-8px)] -translate-x-1/2 text-center text-[20px] leading-[0.9] tracking-[-0.8px] text-white">
            {caption}
          </p>
        </div>
      </div>
    </div>
  );
}


const TEAM_SEATS = ["left", "lead", "right"] as const;

function TeamRow({ members }: { members: readonly TeamMember[] }) {
  return (
    <div className="flex w-full items-center justify-center">
      {TEAM_SEATS.map((seat, index) => {
        const member = members[index];
        if (!member) return null;
        const groupClass = seat === "left" ? "group/left" : seat === "lead" ? "group/lead" : "group/right";
        return (
          <div key={member.id} className={`${groupClass} flex items-center`}>
            <TeamCard
              expand={seat}
              photo={member.image}
              name={member.name}
              role={member.role}
              shortRole={member.shortRole}
              imagePosition={member.imagePosition}
            />
            <TeamQuote group={seat} quote={member.quote} />
          </div>
        );
      })}
    </div>
  );
}

function TeamQuote({ quote, group }: { quote: string; group: "left" | "lead" | "right" }) {
  const open =
    group === "left" ? "group-hover/left:w-[280px]" : group === "lead" ? "group-hover/lead:w-[280px]" : "group-hover/right:w-[280px]";
  const shown =
    group === "left"
      ? "group-hover/left:translate-x-0 group-hover/left:opacity-100"
      : group === "lead"
        ? "group-hover/lead:translate-x-0 group-hover/lead:opacity-100"
        : "group-hover/right:translate-x-0 group-hover/right:opacity-100";

  return (
    <div className={`w-0 overflow-hidden transition-[width] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${open}`}>
      <p className={`w-[280px] -translate-x-8 p-8 text-[20px] leading-[1.2] tracking-[-0.8px] text-white opacity-0 transition duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${shown}`}>
        {`“${quote}”`}
      </p>
    </div>
  );
}

export function AboutPage() {
  const copy = useCopy();
  const a = copy.aboutUs;
  const team = useTeam();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedMember = team.find((member) => member.id === selectedId) ?? null;
  const statementLines = a.statement.split("\n");
  // Mobile Figma frames the globe on Asia; desktop keeps its original start (yaw 0).
  const isMobile = useIsMobile();
  const globeYaw = isMobile ? MOBILE_GLOBE_YAW : 0;
  const teamPins: Pin[] = aboutTeam.map((member, index) => {
    const band = (index + 0.5) / aboutTeam.length;
    const place = "place" in member ? member.place : undefined;
    return {
      id: member.id,
      kind: "photo",
      group: "ambassadors",
      city: member.name,
      lat: place ? place.lat : Math.asin(1 - 2 * band) * (180 / Math.PI) * 0.72,
      lng: place ? place.lng : ((index * 137.508) % 360) - 180,
      image: member.image,
    };
  });
  const teamRows: TeamMember[][] = [];
  for (let i = 0; i < team.length; i += 3) {
    teamRows.push(team.slice(i, i + 3));
  }
  const teamGridHeight = teamRows.length * 200;

  return (
    <div className="overflow-x-hidden bg-cream">
      <section className="relative flex h-[855px] items-start justify-center overflow-hidden px-3 pb-3 pt-[123px] desk:h-auto desk:min-h-[805px] desk:items-center desk:px-16 desk:pb-[96px] desk:pt-[120px]">
        <Image
          src={aboutImages.heroBg}
          alt=""
          fill
          priority
          className="object-cover"
          sizes="100vw"
        />
        <div className="relative z-auto flex w-full flex-col items-center gap-8 text-white desk:z-10 desk:min-h-[589px] desk:justify-between desk:gap-0">
          <h1
            className={`${trail.className} relative z-10 h-[81px] w-[421px] shrink-0 text-center text-[90px] uppercase leading-[0.9] tracking-[3.6px] desk:h-auto desk:w-auto desk:text-[clamp(64px,14vw,130px)] desk:tracking-[5.2px]`}
          >
            {a.heroTitle}
          </h1>
          {/* Mobile: reserve the 407x430 Figma globe slot; the globe itself is absolutely positioned over it. */}
          <div aria-hidden className="h-[430px] w-full shrink-0 desk:hidden" />
          <p className="relative z-30 max-w-[632px] text-center text-[20px] desk:z-auto leading-[0.9] tracking-[-0.8px] text-white desk:text-[32px] desk:tracking-[-1.28px]">
            {a.heroBody}
          </p>
        </div>
        {/* Figma mobile: 407px globe in a 390px frame so L/R clip to the screen edge. */}
        <div className="absolute left-1/2 top-[259px] z-20 aspect-square w-[407px] max-w-none -translate-x-1/2 desk:top-[calc(50%-38.5px)] desk:w-[min(407px,42vw)] desk:-translate-y-1/2">
          <PlatformGlobe
            visibleGroups={["ambassadors"]}
            emphasis={null}
            pins={teamPins}
            waitForImages={ABOUT_GLOBE_WAIT_IMAGES}
            initialYaw={globeYaw}
          />
        </div>
      </section>

      <section className="flex h-[855px] items-center justify-center px-6 pb-3 pt-[68px] desk:h-[805px] desk:px-16 desk:py-24">
        <div className="flex w-full max-w-[632px] flex-col gap-8 desk:gap-12">
          <div className="text-[28px] leading-[0.9] tracking-[-0.04em] text-black desk:text-[48px] desk:tracking-[-1.92px]">
            {statementLines.map((line, i) => (
              <p
                key={line}
                className={i < statementLines.length - 1 ? "mb-3" : undefined}
              >
                {line}
              </p>
            ))}
          </div>
          <p className="text-[20px] leading-[0.9] tracking-[-0.8px] text-black desk:text-[32px] desk:tracking-[-1.28px]">
            {a.statementTag}
          </p>
        </div>
      </section>

      <section data-nav-tone="dark" className="bg-black py-24 text-white desk:px-16">
        <div className="mx-auto flex w-full flex-col gap-8 desk:max-w-[632px] desk:gap-16">
          <div className="flex flex-col gap-8 px-6 desk:px-0">
            <h2 className="text-[28px] leading-[0.9] tracking-[-1.12px] desk:text-[48px] desk:tracking-[-1.92px]">
              {a.whatTitle}
            </h2>
            <p className="text-[20px] leading-none tracking-[-0.8px] desk:text-[32px] desk:tracking-[-1.28px]">
              {a.whatBody}
            </p>
          </div>

          <MobileWorkCards cards={a.cards} />

          <div className="hidden w-full desk:block">
            <FitWidth designWidth={632} designHeight={632} cap>
              <div className="grid size-[632px] grid-cols-2">
                <article className="relative flex flex-col items-center justify-center gap-6 overflow-hidden rounded-[64px] bg-white p-8">
                  <Glow
                    src={aboutImages.workGlow}
                    className="absolute left-[85px] top-[-115px] h-[252.5px] w-[286.81px] rotate-180"
                    inset="-35.72% -31.45%"
                  />
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    alt=""
                    src={aboutImages.workRings}
                    className="pointer-events-none absolute right-[51px] top-1/2 size-[292px] -translate-y-1/2"
                  />
                  <WorkLabel>{a.cards[0].label}</WorkLabel>
                  <WorkTitle className="w-[252px] text-black">{a.cards[0].title}</WorkTitle>
                  <GlassOrb
                    icon={aboutImages.iconPin}
                    pad={20.48}
                    blur={4}
                    opacity={0.72}
                    className="left-[60px] top-[-11px]"
                  />
                  <GlassOrb
                    icon={aboutImages.iconUser}
                    pad={30.72}
                    blur={1.6}
                    opacity={0.8}
                    className="left-[217px] top-1/2 -translate-y-1/2"
                  />
                  <GlassOrb
                    icon={aboutImages.iconCrosshair}
                    pad={38.4}
                    className="left-[32px] top-[245px]"
                  />
                </article>

                <article className="relative flex flex-col items-center justify-center gap-6 overflow-hidden rounded-[64px] bg-lime p-8">
                  <Glow
                    src={aboutImages.workGlowStories}
                    className="absolute left-[109px] top-[82px] h-[214.5px] w-[284.68px]"
                    inset="-38.56% -29.05%"
                  />
                  <p
                    aria-hidden
                    className={`${trail.className} pointer-events-none absolute left-[283.5px] top-[-1px] w-[115px] -translate-x-1/2 text-center text-[116px] uppercase leading-[0.7] tracking-[-2.32px] text-magenta mix-blend-plus-lighter`}
                  >
                    HOME
                  </p>
                  <WorkLabel>{a.cards[1].label}</WorkLabel>
                  <WorkTitle>{a.cards[1].title}</WorkTitle>
                </article>

                <article className="relative flex flex-col items-start justify-center gap-6 overflow-hidden rounded-[64px] bg-magenta p-8">
                  <Glow
                    src={aboutImages.workGlowAmbassadors}
                    className="absolute left-[-39px] top-[-101px] h-[258.83px] w-[294px]"
                    inset="-35.72% -31.45%"
                  />
                  <WorkLabel>{a.cards[2].label}</WorkLabel>
                  <div className="relative z-10 flex w-full flex-col gap-3">
                    <WorkTitle className="text-white">{a.cards[2].title}</WorkTitle>
                    <div className="absolute left-0 top-[80px] flex isolate items-center">
                      {[aboutImages.avatar1, aboutImages.avatar2, aboutImages.avatar3].map(
                        (src, i) => (
                          <span
                            key={src}
                            className={`relative size-12 overflow-hidden rounded-full border-2 border-white ${
                              i < 2 ? "-mr-[34px]" : ""
                            }`}
                            style={{ zIndex: 3 - i }}
                          >
                            <Image src={src} alt="" fill className="object-cover" sizes="48px" />
                          </span>
                        ),
                      )}
                    </div>
                  </div>
                </article>

                <article className="relative flex flex-col items-center justify-center gap-6 overflow-hidden rounded-[64px] bg-orange p-8">
                  <Glow
                    src={aboutImages.workGlow}
                    className="absolute left-[103px] top-[130px] h-[252.5px] w-[286.81px] rotate-180"
                    inset="-35.72% -31.45%"
                  />
                  <WorkLabel>{a.cards[3].label}</WorkLabel>
                  <WorkTitle>{a.cards[3].title}</WorkTitle>
                  <div className="pointer-events-none absolute left-[156.68px] top-[-35px] flex size-[212.43px] items-center justify-center">
                    <div className="rotate-45">
                      <div className="relative bg-white p-[5.18px] [border-radius:1295px_1295px_0_1295px]">
                        <div className="relative size-[139.852px]">
                          <div className="absolute left-1/2 top-1/2 flex size-[197.78px] -translate-x-1/2 -translate-y-1/2 -rotate-45 items-center justify-center">
                            <Image
                              src={aboutImages.pavilionPin}
                              alt=""
                              width={140}
                              height={140}
                              className="size-[139.852px]"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </article>
              </div>
            </FitWidth>
          </div>
        </div>
      </section>

      <section data-nav-tone="dark" className="bg-black">
        <MobileHomeBanner topics={a.homeTopics} caption={copy.content.homeCaption} />
        <div className="hidden desk:block">
        <FitWidth designWidth={1200} designHeight={526}>
          <div className="flex h-[526px] w-[1200px] flex-col bg-black">
            <div className="relative flex min-h-0 flex-1 overflow-hidden rounded-[52px] bg-white/12 p-2">
              <div className="relative h-full min-h-0 min-w-0 flex-1 overflow-hidden rounded-[44px] bg-white">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={aboutImages.homeSlide}
                  alt=""
                  className="absolute inset-0 size-full object-cover"
                />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={aboutImages.homeSlide}
                  alt=""
                  aria-hidden
                  className="pointer-events-none absolute inset-0 size-full object-cover blur-[16px]"
                  style={{
                    maskImage:
                      "linear-gradient(to top, #000 0%, rgb(0 0 0 / 0.55) 34%, transparent 66%)",
                    WebkitMaskImage:
                      "linear-gradient(to top, #000 0%, rgb(0 0 0 / 0.55) 34%, transparent 66%)",
                  }}
                />
                <div className="pointer-events-none absolute bottom-0 left-1/2 h-[406px] w-[1184px] -translate-x-1/2 bg-gradient-to-t from-black to-transparent" />
                <p
                  aria-hidden
                  className={`${trail.className} pointer-events-none absolute left-1/2 top-[-6px] z-10 -translate-x-1/2 whitespace-nowrap text-center text-[450.691px] uppercase leading-[0.7] tracking-[-9.014px] text-magenta`}
                >
                  HOME
                </p>
                {[
                  { label: a.homeTopics[0], left: 135, top: 55 },
                  { label: a.homeTopics[1], left: 429, top: 122 },
                  { label: a.homeTopics[2], left: 704, top: 48 },
                  { label: a.homeTopics[3], left: 1010, top: 171 },
                ].map((topic) => (
                  <p
                    key={topic.label}
                    className="absolute z-10 whitespace-nowrap text-[20px] font-semibold uppercase leading-[0.9] tracking-[0.8px] text-white mix-blend-hard-light"
                    style={{ left: topic.left, top: topic.top }}
                  >
                    {topic.label}
                  </p>
                ))}
                <p className="absolute left-1/2 top-[377px] z-10 w-[588px] -translate-x-1/2 text-center text-[32px] leading-[0.9] tracking-[-1.28px] text-white">
                  {copy.content.homeCaption}
                </p>
              </div>
            </div>
          </div>
        </FitWidth>
        </div>
      </section>

      <section data-nav-tone="dark" className="bg-black py-16 text-white desk:px-16 desk:py-24">
        <h2 className="px-5 text-center text-[32px] leading-[0.9] tracking-[-0.04em] desk:px-0 desk:text-[48px] desk:tracking-[-1.92px]">
          {a.teamTitle}
        </h2>

        <div className="mt-12 flex w-full flex-col desk:hidden">
          {teamRows.map((row) => (
            <div key={row.map((member) => member.id).join()} className="flex w-full items-start">
              {row.map((member) => (
                <MobileTeamCard
                  key={member.id}
                  member={member}
                  onOpen={() => setSelectedId(member.id)}
                />
              ))}
            </div>
          ))}
        </div>

        <div className="mx-auto mt-12 hidden max-w-[1000px] desk:block">
          <FitWidth designWidth={1000} designHeight={teamGridHeight} cap>
            <div className="flex w-[1000px] flex-col items-center" style={{ height: teamGridHeight }}>
              {teamRows.map((row) => (
                <TeamRow key={row.map((member) => member.id).join()} members={row} />
              ))}
            </div>
          </FitWidth>
        </div>
      </section>

      {selectedMember ? (
        <TeamMemberSheet member={selectedMember} onClose={() => setSelectedId(null)} />
      ) : null}
    </div>
  );
}
