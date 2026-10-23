"use client";

import Image from "next/image";
import { DisplayWordmark } from "./DisplayWordmark";
import { PosterMarquee } from "./PosterMarquee";
import { SectionReveal } from "./SectionReveal";
import { trail } from "@/lib/fonts";
import { useCopy } from "./LanguageProvider";

// Featured 16:9 tile with the HOME wordmark, a play cue, and an overlaid caption.
function FeaturedVideo() {
  const copy = useCopy();
  return (
    <div className="@container relative h-[225px] overflow-hidden rounded-[44px] bg-white desk:h-[max(376px,56.25cqw)]">
      <Image
        src="/images/home/hero.png"
        alt={copy.content.featuredAlt}
        fill
        sizes="(min-width: 900px) 680px, 100vw"
        className="object-cover"
      />
      {/* HOME sits on the right half, matching Figma (overflow clipped by the card); desktop wraps HO/ME in a 479/668 box. */}
      <span
        aria-hidden
        className={`${trail.className} pointer-events-none absolute left-[84%] top-0 -translate-x-1/2 text-center uppercase leading-[0.7] tracking-[-0.02em] text-magenta text-[clamp(140px,48vw,280px)] desk:top-[-1.2%] desk:w-[71.8%] desk:text-[50.1cqw]`}
      >
        Home
      </span>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-[100px] bg-gradient-to-t from-black to-transparent desk:h-[120px]"
      />
      <button
        type="button"
        aria-label={copy.a11y.playHome}
        className="absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:scale-110 active:scale-95"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/icons/play.svg"
          alt=""
          width={48}
          height={48}
          className="h-[38px] w-[38px] desk:h-[48px] desk:w-[48px]"
        />
      </button>
      <p className="absolute bottom-6 left-6 z-10 w-[min(604px,86%)] text-[20px] font-normal leading-[0.9] tracking-[-0.8px] text-white desk:bottom-8 desk:left-8 desk:w-[calc(100%-64px)] desk:text-[22px] desk:tracking-[-0.04em] min-[1200px]:w-[min(604px,86%)] min-[1200px]:text-[clamp(24px,2.7vw,32px)]">
        {copy.content.homeCaption}
      </p>
    </div>
  );
}

export function ContentGrid() {
  const copy = useCopy();
  return (
    <section
      id="content"
      data-nav-tone="dark"
      className="relative z-10 -mt-[110px] overflow-hidden rounded-t-[88px] bg-black px-5 pb-16 pt-16 snap-section desk:mt-0 desk:box-border desk:flex desk:flex-col desk:rounded-t-[105px] desk:px-16 desk:pb-[41px] desk:pt-24"
    >
      <div aria-hidden className="absolute inset-0">
        <Image
          src="/images/home/bg.png"
          alt=""
          fill
          sizes="100vw"
          className="scale-110 object-cover blur-[50px]"
        />
        <div className="absolute inset-0 bg-black/45" />
      </div>

      <div className="relative z-10 mx-auto flex w-full max-w-[1072px] flex-col items-center">
        <DisplayWordmark kicker={copy.content.kicker} word={copy.content.word} size="section" className="shrink-0" />

        <p className="mt-[11px] w-[360px] max-w-full text-center text-[28px] font-normal leading-[0.9] tracking-[-1.12px] text-white desk:mt-0 desk:w-auto desk:max-w-[840px] desk:text-[48px] desk:tracking-[-1.92px]">
          {copy.content.subtitle}
        </p>

        <SectionReveal className="mt-8 w-full desk:mt-[34px]">
          <div className="rounded-[52px] bg-white/[0.12] p-2">
            <div className="relative flex flex-col gap-2 desk:block">
              {/* Video drives the height (16:9, min 376px on 900-1200px screens); on desktop it leaves room for the column. */}
              <div className="@container desk:mr-[388px]">
                <FeaturedVideo />
              </div>

              {/* Desktop: vertical auto-scroll column clipped to the video height. */}
              <div className="absolute inset-y-0 right-0 hidden w-[380px] overflow-hidden rounded-[44px] desk:block">
                <PosterMarquee />
              </div>

              {/* Mobile: the same cards scrolling sideways. */}
              <div className="h-[228px] overflow-hidden rounded-[44px] desk:hidden">
                <PosterMarquee orientation="window" />
              </div>
            </div>
          </div>
        </SectionReveal>
      </div>
    </section>
  );
}
