"use client";

import { useState } from "react";
import { aboutTeam } from "@/lib/about-team";
import { programIcons } from "@/lib/program-assets";
import { TicketTab } from "../TicketTab";
import { useCopy } from "../LanguageProvider";
import { FigmaImg } from "./FigmaImg";

function RoleTab({ role }: { role: string }) {
  const lines = role.split("\n");
  const label =
    lines.length > 1 ? (
      <span className="flex flex-col text-center text-[13px] font-semibold uppercase leading-[1.2] tracking-[0.52px] desk:text-[16px] desk:tracking-[0.64px]">
        {lines.map((line) => (
          <span key={line}>{line}</span>
        ))}
      </span>
    ) : (
      role
    );

  return <TicketTab placement="top" size="lg" label={label} />;
}

type TestimonialBase = {
  name: string;
  image: string;
};

const TESTIMONIAL_IDS = [
  "joseph-raymond-hammond",
  "gemma-gutierrez",
  "sthella-ngolet",
] as const;

const TESTIMONIALS: TestimonialBase[] = TESTIMONIAL_IDS.map((id) => {
  const member = aboutTeam.find((person) => person.id === id);
  if (!member) throw new Error(`Missing team member ${id}`);
  return { name: member.name, image: member.image };
});

type Testimonial = TestimonialBase & {
  role: string;
  quote: string;
};

function Card({ item, dim }: { item: Testimonial; dim?: boolean }) {
  return (
    <figure
      className={`w-[280px] shrink-0 transition-opacity duration-300 desk:w-[403px] ${
        dim ? "opacity-32" : "opacity-100"
      }`}
    >
      <div className="relative flex h-[420px] flex-col justify-end overflow-hidden rounded-[64px] px-8 py-6 desk:h-[576px]">
        <FigmaImg
          src={item.image}
          alt=""
          width={403}
          height={576}
          className="absolute inset-0 size-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
        <RoleTab role={item.role} />
        <blockquote className="relative text-[24px] font-normal leading-none tracking-[-0.96px] text-white desk:text-[32px] desk:tracking-[-1.28px]">
          {item.quote}
        </blockquote>
      </div>
      <figcaption className="mt-4 text-center text-[24px] font-normal leading-none tracking-[-0.96px] text-black desk:text-[32px] desk:tracking-[-1.28px]">
        {item.name}
      </figcaption>
    </figure>
  );
}

function ArrowButton({
  dir,
  onClick,
  label,
}: {
  dir: "left" | "right";
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={`group pointer-events-auto absolute top-[210px] z-20 flex size-[80px] -translate-x-1/2 items-center justify-center desk:top-[288px] ${
        dir === "left" ? "left-0" : "left-full"
      }`}
    >
      <span className="flex size-[64px] items-center justify-center rounded-full bg-black shadow-[0_6px_24px_rgba(0,0,0,0.18)] transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-105">
        <FigmaImg
          src={programIcons.arrowLeft}
          alt=""
          width={24}
          height={24}
          className={`size-[24px] ${dir === "right" ? "rotate-180" : ""}`}
        />
      </span>
    </button>
  );
}

export function ProgramTestimonials() {
  const copy = useCopy();
  const [active, setActive] = useState(1);
  const items: Testimonial[] = TESTIMONIALS.map((item, i) => ({
    ...item,
    role: copy.programs.testimonials[i].role,
    quote: copy.programs.testimonials[i].quote,
  }));
  const len = items.length;
  const prev = (active - 1 + len) % len;
  const next = (active + 1) % len;

  const go = (dir: number) => setActive((a) => (a + dir + len) % len);

  return (
    <div className="relative w-full">
      {/* Clip only the card row so side peeks don't spill; arrows sit above it. */}
      <div className="relative w-full overflow-x-clip">
        <div className="relative flex w-full items-start justify-center px-6">
          <div className="flex shrink-0 items-start gap-0">
            <div className="hidden desk:block">
              <Card item={items[prev]} dim />
            </div>
            <Card item={items[active]} />
            <div className="hidden desk:block">
              <Card item={items[next]} dim />
            </div>
          </div>
        </div>
      </div>

      {/* Arrow rail: on mobile it matches the 280px card so the half-overhanging
          arrows straddle the card edge instead of spilling past the viewport
          (which widened the page to 430px at 390). Desktop keeps 632px. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 mx-auto h-[420px] w-full max-w-[280px] desk:h-[576px] desk:max-w-[632px]">
        <ArrowButton
          dir="left"
          onClick={() => go(-1)}
          label={copy.a11y.prevTestimonial}
        />
        <ArrowButton
          dir="right"
          onClick={() => go(1)}
          label={copy.a11y.nextTestimonial}
        />
      </div>
    </div>
  );
}
