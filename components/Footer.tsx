"use client";

import Link from "@/components/LocaleLink";
import { footerHref } from "@/lib/nav";
import { t } from "@/lib/messages";
import { geist } from "@/lib/fonts";
import { Logo } from "./Logo";
import { useCopy } from "./LanguageProvider";

export function Footer() {
  const copy = useCopy();
  const year = new Date().getFullYear();

  return (
    <footer
      id="contact"
      className={`${geist.variable} relative z-10 -mt-16 rounded-t-[88px] bg-cream px-5 pb-16 pt-16 desk:-mt-24 desk:rounded-t-[96px] desk:px-8 desk:pb-20 desk:pt-16`}
    >
      <div className="mx-auto max-w-[1240px]">
        <div className="flex flex-col items-center gap-[95px] desk:flex-row desk:items-start desk:justify-between desk:gap-10">
          <Logo size="lg" tone="color" imgClassName="h-[50.5px] w-auto desk:h-[84px]" />
          <div className="flex justify-center gap-16">
            {copy.footer.columns.map((col, columnIndex) => (
              <div key={col.title}>
                <h3 className="text-[12px] font-bold uppercase leading-[normal] tracking-[1.2px] text-[#111] desk:text-[11px] desk:font-semibold desk:leading-[inherit] desk:tracking-[0.14em] desk:text-inherit">
                  {col.title}
                </h3>
                <ul className="mt-4 flex flex-col gap-4 font-[family-name:var(--font-geist)] text-[14px] leading-[normal] text-black/72 desk:mt-3 desk:gap-2 desk:font-[family-name:inherit] desk:text-[13px] desk:leading-[inherit] desk:text-black/60">
                  {col.links.map((link, linkIndex) => {
                    const href = footerHref(columnIndex, linkIndex);
                    const className = "transition-colors hover:text-black";
                    return (
                      <li key={link}>
                        {href === "#" ? (
                          <a href="#" className={className}>
                            {link}
                          </a>
                        ) : (
                          <Link href={href} className={className}>
                            {link}
                          </Link>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-12 border-t border-black/10 pt-6 text-center font-[family-name:var(--font-geist)] text-[12px] text-black/72 desk:border-black/15 desk:pt-5 desk:text-left desk:font-[family-name:inherit] desk:text-[11px] desk:text-black/55">
          <p>{t(copy.footer.copyright, { year })}</p>
        </div>
      </div>
    </footer>
  );
}
