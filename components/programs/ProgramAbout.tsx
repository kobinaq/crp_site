"use client";

import { useState } from "react";
import { programIcons } from "@/lib/program-assets";
import { useCopy } from "../LanguageProvider";
import { AboutProgramPopup } from "./AboutProgramPopup";
import { FigmaImg } from "./FigmaImg";

function StatCard({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex h-[130px] min-w-0 flex-1 flex-col justify-between rounded-[32px] bg-white px-3 py-6 desk:h-auto desk:min-h-[143px] desk:p-6">
      <p className="text-[24px] font-normal leading-none tracking-[-0.96px] text-black desk:text-[32px] desk:leading-[1.2] desk:tracking-[-1.28px]">
        {value}
      </p>
      <p className="text-[13.5px] font-semibold uppercase leading-[0.9] tracking-[0.54px] text-black/48 desk:mt-4 desk:text-[16px] desk:leading-none desk:tracking-[1.28px]">
        {label}
      </p>
    </div>
  );
}

export function ProgramAbout() {
  const copy = useCopy();
  const about = copy.programs.about;
  const [open, setOpen] = useState(false);

  return (
    <div className="flex flex-col gap-8">
      {/* Date + location pills */}
      <div className="flex items-stretch desk:h-[112px]">
        <div className="relative z-10 flex min-w-0 flex-1 items-center gap-3 rounded-[32px] bg-black px-6 py-8 desk:w-max desk:flex-none desk:px-8 desk:py-0">
          <FigmaImg
            src={programIcons.calendarBlank}
            alt=""
            width={32}
            height={32}
            className="size-[32px] shrink-0"
          />
          <span className="whitespace-nowrap text-[14px] font-semibold uppercase leading-[0.9] tracking-[1.12px] text-white desk:text-[16px] desk:tracking-[1.28px]">
            {about.dates}
          </span>
        </div>
        <div className="flex w-[206px] shrink-0 items-center gap-3 rounded-[32px] bg-black px-6 py-8 desk:-ml-8 desk:w-auto desk:min-w-0 desk:flex-1 desk:py-0 desk:pl-16 desk:pr-8">
          <FigmaImg
            src={programIcons.turkeyFlag}
            alt=""
            width={48}
            height={32}
            className="h-[32px] w-[48px] shrink-0"
          />
          <span className="text-[14px] font-semibold uppercase leading-[1.2] tracking-[1.12px] text-white desk:text-[16px] desk:tracking-[1.28px]">
            {about.location}
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-[17px] px-6 desk:gap-6 desk:px-0">
        <p className="text-[32px] font-normal leading-none tracking-[-1.28px] text-black desk:leading-[1.2]">
          {about.lede}
        </p>
        <div className="flex flex-col gap-3 text-[15px] font-normal leading-[1.2] tracking-[-0.6px] text-black/84 desk:text-[20px] desk:tracking-[-0.8px]">
          {about.body.map((paragraph) => (
            <p key={paragraph.slice(0, 48)}>{paragraph}</p>
          ))}
        </div>
      </div>

      {/* About the program — opens side popup */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={copy.a11y.toggleAbout}
        className="flex w-full items-center justify-between rounded-[32px] bg-white py-2 pl-6 pr-2 text-left transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:scale-[1.02] active:scale-[0.98] desk:h-[112px] desk:py-2 desk:pl-8"
      >
        <span className="text-[24px] font-normal leading-none tracking-[-0.96px] text-black desk:text-[32px] desk:tracking-[-1.28px]">
          {about.accordion}
        </span>
        <span className="flex size-[72px] shrink-0 items-center justify-center rounded-full bg-black desk:size-[96px]">
          <FigmaImg
            src={programIcons.questionMark}
            alt=""
            width={16}
            height={16}
            className="size-[16px] desk:size-[24px]"
          />
        </span>
      </button>

      {/* Stats */}
      <div className="flex items-stretch gap-0 desk:gap-4">
        <StatCard value={about.stats[0].value} label={about.stats[0].label} />
        <StatCard value={about.stats[1].value} label={about.stats[1].label} />
        <StatCard value={about.stats[2].value} label={about.stats[2].label} />
      </div>

      {/* Timeline bar: 3 black segments (online) + 1 orange segment (Antalya) */}
      <div className="relative isolate flex h-[150px] items-stretch desk:h-[173px]">
        <div className="relative z-[4] min-w-px flex-1 rounded-[24px] bg-black" />
        <div className="relative z-[3] min-w-px flex-1 rounded-[24px] bg-black" />
        <div className="relative z-[2] min-w-px flex-1 rounded-[24px] bg-black" />
        <div className="relative z-[1] min-w-px flex-1 overflow-hidden rounded-[24px] bg-orange">
          <span className="absolute left-[33.33px] top-[94px] h-[138.5px] w-[183.814px]">
            <FigmaImg
              src={programIcons.ellipse18}
              alt=""
              width={291}
              height={245}
              className="absolute -left-[29.05%] -top-[38.56%] h-[177.12%] w-[158.1%] max-w-none"
            />
          </span>
          <span className="absolute -left-[125.67px] -top-[90px] h-[149.5px] w-[169.814px]">
            <FigmaImg
              src={programIcons.ellipse17}
              alt=""
              width={277}
              height={256}
              className="absolute -left-[31.45%] -top-[35.72%] h-[171.44%] w-[162.9%] max-w-none"
            />
          </span>
        </div>

        <p className="pointer-events-none absolute left-[calc(50%-49px)] top-1/2 z-10 w-[230px] -translate-x-1/2 -translate-y-1/2 text-center text-[14px] font-semibold uppercase leading-[0.9] tracking-[1.12px] text-white desk:left-[calc(50%-80px)] desk:text-[16px] desk:tracking-[1.28px]">
          <span className="mb-3 block">{about.online}</span>
          {about.onlineDates}
        </p>
        {/* Capped so the 98px label never passes the bar's right edge on narrow
            phones (it pushed /programs to 376px wide at 360). Unchanged at 390+. */}
        <p className="pointer-events-none absolute left-[min(calc(50%+146px),calc(100%-49px))] top-1/2 z-10 w-[98px] -translate-x-1/2 -translate-y-1/2 text-center text-[14px] font-semibold uppercase leading-[0.9] tracking-[1.12px] text-black desk:left-auto desk:right-[79px] desk:w-[126px] desk:translate-x-1/2 desk:text-[16px] desk:tracking-[1.28px] desk:text-white">
          <span className="mb-3 block">{about.antalya}</span>
          {about.antalyaDates}
        </p>
      </div>

      <AboutProgramPopup open={open} onClose={() => setOpen(false)} />
    </div>
  );
}
