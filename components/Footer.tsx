"use client";

import Link from "@/components/LocaleLink";
import { t } from "@/lib/messages";
import { Logo } from "./Logo";
import { useCopy } from "./LanguageProvider";
import { useConsent } from "./cookies/ConsentProvider";
import { useText } from "@/lib/ui-text";

/**
 * Footer — Figma 71EZfqbpz5kmSX767kSuEV, section 2308:12927
 * ("Footer mobile" 2308:12928, "Footer desktop" 2308:12983).
 */

/** Routes for copy.footer.sections, by section then link. "#" = no page yet. */
/** Legal (index 1) also gets a "Cookie preferences" button that reopens the consent panel. */
const SECTION_HREFS = [
  ["/", "/about", "/programs"],
  ["/privacy", "#"],
  ["/contact", "/partner", "/#join"],
] as const;

/** Profile URLs aren't known yet; a tile renders as a link once its href is set. */
const SOCIAL: { name: string; icon: string; href: string | null }[] = [
  { name: "Instagram", icon: "/icons/social/instagram.svg", href: null },
  { name: "LinkedIn", icon: "/icons/social/linkedin.svg", href: null },
  { name: "X", icon: "/icons/social/x.svg", href: null },
  { name: "YouTube", icon: "/icons/social/youtube.svg", href: null },
  { name: "TikTok", icon: "/icons/social/tiktok.svg", href: null },
  { name: "Discord", icon: "/icons/social/discord.svg", href: null },
];

const HEADING =
  "text-[12px] font-semibold uppercase leading-none tracking-[0.96px] text-black desk:text-[14px] desk:tracking-[1.12px]";
const LINK =
  "text-[15px] leading-[1.2] tracking-[-0.6px] text-black/84 transition-colors hover:text-black";
const TILE =
  "flex aspect-square min-w-0 flex-1 items-center justify-center rounded-[12px] bg-white desk:size-16 desk:flex-none";

export function Footer({
  pillSpace = true,
}: {
  /**
   * Mobile only: reserve 64px under the copyright so the fixed GET INVOLVED pill
   * never covers it. Pass false on pages that don't show the pill (Contact).
   * Desktop padding is unchanged either way.
   */
  pillSpace?: boolean;
} = {}) {
  const copy = useCopy();
  const tr = useText();
  const { openPreferences } = useConsent();
  const year = new Date().getFullYear();
  const { sections, getInTouch } = copy.footer;

  return (
    <footer
      id="contact"
      className={`relative z-10 -mt-16 rounded-t-[88px] bg-cream px-6 pt-6 ${
        pillSpace ? "pb-[88px]" : "pb-6"
      } desk:-mt-24 desk:rounded-t-[96px] desk:py-14`}
    >
      <div className="mx-auto flex max-w-[1152px] flex-col items-center gap-[58px] desk:gap-14">
        <div className="flex w-full flex-col items-center gap-[58px] desk:flex-row">
          <div className="shrink-0 p-[15px] desk:p-[30px]">
            <Logo tone="color" imgClassName="h-[60px] w-auto desk:h-[120px]" />
          </div>

          <div className="flex w-full min-w-0 flex-col gap-[58px] desk:flex-1">
            <div className="flex flex-col gap-[58px] desk:flex-row">
              {sections.map((section, sectionIndex) => (
                <div key={section.title} className="flex min-w-0 flex-1 flex-col gap-6">
                  <h3 className={HEADING}>{section.title}</h3>
                  <ul className="grid grid-cols-2 gap-3 desk:grid-cols-1">
                    {section.links.map((label, linkIndex) => {
                      const href = SECTION_HREFS[sectionIndex]?.[linkIndex] ?? "#";
                      return (
                        <li key={label} className="min-w-0">
                          {href === "#" ? (
                            <a href="#" className={LINK}>
                              {label}
                            </a>
                          ) : (
                            <Link href={href} className={LINK}>
                              {label}
                            </Link>
                          )}
                        </li>
                      );
                    })}
                    {sectionIndex === 1 ? (
                      <li className="min-w-0">
                        <button type="button" onClick={openPreferences} className={`${LINK} text-left`}>
                          {tr("Cookie preferences")}
                        </button>
                      </li>
                    ) : null}
                  </ul>
                </div>
              ))}
            </div>

            <div className="flex flex-col gap-3 desk:flex-row desk:items-center desk:justify-end">
              <h3 className={`${HEADING} desk:w-[69px]`}>{getInTouch}</h3>
              <ul className="flex w-full desk:w-auto">
                {SOCIAL.map(({ name, icon, href }) => {
                  const img = (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={icon} alt="" width={24} height={24} className="size-6" />
                  );
                  return (
                    <li key={name} className={TILE}>
                      {href ? (
                        <a
                          href={href}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={name}
                          className="flex size-full items-center justify-center rounded-[12px] transition-transform duration-300 hover:scale-105"
                        >
                          {img}
                        </a>
                      ) : (
                        <span role="img" aria-label={name} className="flex size-full items-center justify-center">
                          {img}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        </div>

        <div className="w-full border-t border-black/12 py-3 text-center text-[12px] leading-[1.2] tracking-[-0.48px] text-black/84 desk:text-[16px] desk:tracking-[-0.64px]">
          <p>{t(copy.footer.copyright, { year })}</p>
        </div>
      </div>
    </footer>
  );
}
