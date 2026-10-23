"use client";

import { LanguageLinks } from "@/components/LanguageLinks";

import Image from "next/image";
import Link from "@/components/LocaleLink";
import { type ReactNode, useState } from "react";
import { t } from "@/lib/messages";
import { footerHref } from "@/lib/nav";
import { programPhotos } from "@/lib/program-assets";
import { LanguageDropdown } from "../LanguageDropdown";
import { useCopy } from "../LanguageProvider";
import { Logo } from "../Logo";
import { TicketTab } from "../TicketTab";

export const APPLY_GRADIENT =
  "radial-gradient(circle at 85% 70%, #FA8D2E 0%, #EC268F 100%)";

function ApplyHeader() {
  const copy = useCopy();
  return (
    <header className="absolute inset-x-0 top-0 z-50 flex h-[68px] items-center justify-between px-5 backdrop-blur-[12px] desk:h-[88px] desk:px-[64px] desk:py-[24px]">
      <Link
        href="/"
        aria-label={copy.a11y.backHome}
        className="relative flex size-8 items-center justify-center desk:size-10 desk:rounded-full desk:bg-white desk:p-1 desk:shadow-[inset_0_0_18px_rgba(255,255,255,0.25)]"
      >
        <span className="flex size-8 items-center justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/icons/apply/arrow-left.svg"
            alt=""
            width={24}
            height={24}
            className="size-6 brightness-0 invert desk:brightness-100 desk:invert-0"
          />
        </span>
      </Link>

      <div className="absolute left-1/2 top-1/2 z-20 -translate-x-1/2 -translate-y-1/2 desk:top-[20px] desk:translate-y-0">
        <Logo
          tone="light"
          imgClassName="h-6 w-auto object-contain desk:h-12 desk:w-[134px]"
        />
      </div>

      <LanguageDropdown variant="apply" />
    </header>
  );
}

function IconChip({ src, label }: { src: string; label: string }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col items-start gap-3 desk:flex-none desk:flex-row desk:items-center desk:gap-[12px]">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-white p-1 desk:size-[48px] desk:p-[6px]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt=""
          width={16}
          height={16}
          className="size-4 desk:size-[24px]"
        />
      </span>
      <p className="text-[14px] font-semibold uppercase leading-[0.9] tracking-[0.56px] text-black mix-blend-hard-light desk:text-[20px] desk:tracking-[0.8px]">
        {label}
      </p>
    </div>
  );
}

function BlueZoneBadge({ label }: { label: string }) {
  return (
    <span className="relative mx-1 inline-flex h-[22px] w-[58px] align-middle desk:h-[31px] desk:w-[82px]">
      <span className="absolute left-0 top-1/2 flex h-[22px] w-[58px] -translate-y-1/2 items-center justify-center overflow-hidden rounded-[6px] bg-[#3dadff] desk:h-[30.838px] desk:w-[82px] desk:rounded-[8.41px]">
        <Image
          src={programPhotos.blueZone}
          alt=""
          width={82}
          height={31}
          className="absolute inset-0 size-full object-cover opacity-64"
        />
        <span className="relative text-[8px] font-semibold uppercase leading-[0.79] tracking-[0.64px] text-white desk:text-[10.513px] desk:tracking-[0.841px]">
          {label}
        </span>
      </span>
    </span>
  );
}

function BenefitItem({ children }: { children: ReactNode }) {
  return (
    <li className="flex gap-2 text-[16px] leading-[1.2] tracking-[-0.04em] text-white desk:gap-[10px] desk:text-[20px] desk:tracking-[-0.8px]">
      <span
        aria-hidden
        className="mt-[0.45em] size-1.5 shrink-0 rounded-full bg-white desk:mt-[0.5em] desk:size-2"
      />
      <span className="min-w-0">{children}</span>
    </li>
  );
}

function ProgramHero({
  headline,
  body,
  cta,
}: {
  headline: string;
  body: string;
  cta: ReactNode;
}) {
  const copy = useCopy();
  const { benefits } = copy.apply;
  const [bodyOpen, setBodyOpen] = useState(false);

  return (
    <div className="relative w-full desk:h-[562px]">
      <div className="relative flex flex-col items-center justify-center gap-6 overflow-hidden rounded-[88px] p-8 desk:h-[562px] desk:min-h-0 desk:flex-row desk:items-center desk:justify-between desk:gap-[48px] desk:overflow-clip desk:rounded-[154px] desk:p-[64px]">
        <Image
          src="/images/apply/hero.jpg"
          alt={copy.apply.heroAlt}
          fill
          priority
          sizes="100vw"
          className="pointer-events-none object-cover object-center"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-black/40 mix-blend-multiply"
        />

        <div className="relative z-10 flex h-full w-full max-w-[590px] flex-col items-start justify-between gap-8 py-2 text-left desk:w-[590px] desk:shrink-0 desk:gap-0 desk:py-[32px]">
          <div className="flex w-full flex-col items-start gap-4 desk:gap-[16px]">
            <div className="flex items-center gap-4 desk:gap-[16px]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/images/apply/turkey.svg"
                alt=""
                width={48}
                height={32}
                className="h-6 w-9 desk:h-8 desk:w-12"
              />
              <p className="text-[14px] font-semibold uppercase leading-[0.9] tracking-[0.56px] text-white/72 mix-blend-hard-light [text-shadow:0_0_4px_rgba(0,0,0,0.25)] desk:text-[20px] desk:tracking-[0.8px]">
                {copy.apply.location}
              </p>
            </div>
            <p className="w-full text-[20px] leading-[0.9] tracking-[-0.8px] text-white desk:text-[32px] desk:tracking-[-1.28px]">
              {headline}
            </p>
            <p className="w-full text-[15px] leading-[1.2] tracking-[-0.6px] text-white desk:text-[20px] desk:tracking-[-0.8px]">
              <span className="desk:hidden">
                {bodyOpen ? body : `${body.slice(0, 108).trim()}… `}
                {bodyOpen ? null : (
                  <button type="button" onClick={() => setBodyOpen(true)} className="text-lime">
                    {copy.apply.readMore}
                  </button>
                )}
              </span>
              <span className="hidden desk:inline">{body}</span>
            </p>
          </div>

          <ul className="grid w-full grid-cols-1 gap-3 desk:grid-cols-2 desk:gap-x-[12px] desk:gap-y-[12px]">
            <BenefitItem>{benefits.travel}</BenefitItem>
            <BenefitItem>
              {benefits.accreditationBefore}
              <BlueZoneBadge label={benefits.blueZone} />
              {benefits.accreditationAfter}
            </BenefitItem>
            <BenefitItem>{benefits.capacity}</BenefitItem>
            <BenefitItem>{benefits.mentorship}</BenefitItem>
          </ul>
        </div>

        <div className="group relative z-10 mx-auto flex min-h-[244px] w-[244px] shrink-0 flex-col justify-between gap-3 overflow-hidden rounded-[44px] bg-lime px-3 pb-3 pt-6 desk:mx-0 desk:h-full desk:w-[434px] desk:gap-0 desk:rounded-[64px] desk:p-[32px]">
          <div
            aria-hidden
            className="pointer-events-none absolute left-[96px] top-[-55px] h-[214.5px] w-[284.68px]"
          >
            <span className="absolute inset-[-38.56%_-29.05%]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/images/apply/glow-magenta.svg"
                alt=""
                className="block size-full max-w-none"
              />
            </span>
          </div>
          <p className="relative min-w-full text-[48px] leading-[0.8] tracking-[-1.92px] text-black desk:w-[370px] desk:text-[96px] desk:tracking-[-3.84px]">
            {copy.apply.ages1926.split("\n").map((line, i) => (
              <span key={line}>
                {i > 0 ? <br /> : null}
                {line}
              </span>
            ))}
          </p>
          <div className="relative flex w-full flex-row items-start justify-center gap-1.5 desk:flex-col desk:gap-[6px]">
            <IconChip src="/icons/apply/laptop.svg" label={copy.apply.online} />
            <IconChip
              src="/icons/apply/airplane-takeoff.svg"
              label={copy.apply.antalya}
            />
          </div>
          {cta}
        </div>
      </div>
      <TicketTab placement="top" size="lg" label={copy.apply.dates} />
    </div>
  );
}

function ApplyFooter() {
  const copy = useCopy();
  const year = new Date().getFullYear();
  return (
    <footer
      id="contact"
      className="flex flex-col gap-10 bg-cream px-5 pb-10 pt-12 desk:gap-[48px] desk:px-[64px] desk:pb-[40px] desk:pt-[64px]"
    >
      <div className="flex flex-col items-center justify-between gap-10 desk:flex-row desk:items-start desk:gap-0">
        <Logo
          tone="color"
          imgClassName="mx-auto h-12 w-auto object-contain desk:mx-0 desk:h-[121px] desk:w-[341px] desk:object-left"
        />
        {/* Mobile: titles and links wrap at spaces (e.g. "Informations légales") so the row never
            outgrows the screen; each column still keeps its longest word whole, and under 380px the gap
            narrows so pt (Patrocinadores / Solidariedade / Informação) fits at 360. From 420px up to
            desktop the row may use the footer's side padding, as it always has, so wider phones keep
            the one-line titles. Desktop stays on one line. */}
        <div className="flex w-full justify-center gap-8 max-[380px]:gap-5 min-[420px]:max-desk:-mx-5 min-[420px]:max-desk:w-[calc(100%+40px)] desk:w-auto desk:justify-start desk:gap-[64px] desk:whitespace-nowrap">
          {copy.footer.columns.map((col, columnIndex) => (
            <div
              key={col.title}
              className="flex flex-col items-start gap-3 desk:gap-[16px]"
            >
              <p className="break-words text-[12px] font-bold tracking-[1.2px] text-[#111] uppercase">
                {col.title}
              </p>
              {col.links.map((link, linkIndex) => {
                const href = footerHref(columnIndex, linkIndex);
                const className =
                  "text-[14px] text-black/72 transition-colors hover:text-black";
                return href === "#" ? (
                  <a key={link} href="#" className={className}>
                    {link}
                  </a>
                ) : (
                  <Link key={link} href={href} className={className}>
                    {link}
                  </Link>
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <div className="flex flex-col items-center border-t border-black/10 pt-6 text-center desk:flex-row desk:pt-[24px] desk:text-left">
        <p className="w-full text-[12px] text-black/72">
          {t(copy.footer.copyright, { year })}
        </p>
        <div className="hidden desk:block">
          <LanguageLinks />
        </div>
      </div>
    </footer>
  );
}

export function AgeSelectionLayout({
  title,
  subtitle,
  headline,
  body,
  cta,
  belowHero,
}: {
  title: string;
  subtitle: string;
  headline: string;
  body: string;
  cta: ReactNode;
  belowHero?: ReactNode;
}) {
  return (
    <div className="apply-canvas relative bg-cream">
      <ApplyHeader />

      <section className="flex flex-col items-center gap-8 rounded-b-[80px] bg-ink pt-24 text-white desk:h-[805px] desk:gap-[32px] desk:rounded-b-[154px] desk:pt-[120px]">
        <div className="flex w-full flex-col items-center gap-3 px-5 text-center desk:flex-1 desk:gap-[12px] desk:px-[64px]">
          <h1 className="w-full text-[28px] leading-[0.9] tracking-[-1.12px] [text-shadow:0_0_4px_rgba(0,0,0,0.25)] desk:text-[48px] desk:tracking-[-1.92px] desk:[text-shadow:none]">
            {title}
          </h1>
          <p className="w-full max-w-[246px] text-[20px] leading-none tracking-[-0.8px] text-white/64 desk:max-w-none desk:text-[32px] desk:tracking-[-1.28px]">
            {subtitle}
          </p>
        </div>
        <ProgramHero headline={headline} body={body} cta={cta} />
      </section>

      {belowHero}

      <ApplyFooter />
    </div>
  );
}
