"use client";

import { useCopy } from "../LanguageProvider";

const BODY =
  "text-[15px] leading-[1.2] tracking-[-0.6px] text-black/84 desk:text-[20px] desk:tracking-[-0.8px]";

export function PrivacyPage() {
  const { privacyPage: page } = useCopy();

  return (
    <section className="bg-cream px-[12px] pb-[12px] pt-[68px] desk:px-16 desk:pb-24 desk:pt-[120px]">
      <div className="mx-auto flex w-full max-w-[1072px] flex-col gap-[32px] desk:flex-row desk:items-stretch desk:gap-12">
        <div className="flex flex-col justify-between gap-[24px] px-[10px] text-black desk:gap-10 desk:px-0 desk:h-[589px] desk:min-w-0 desk:flex-1">
          <h1 className="text-[48px] leading-[0.8] tracking-[-1.92px] desk:text-[96px] desk:tracking-[-3.84px]">
            {page.title}
          </h1>
          <p className="text-[12px] font-semibold uppercase leading-[0.9] tracking-[0.96px] desk:text-[16px] desk:tracking-[1.28px]">
            {page.updated}
          </p>
        </div>
        <article className="flex w-full shrink-0 flex-col gap-6 rounded-[44px] bg-white px-[24px] py-[32px] desk:p-8 desk:w-[678px]">
          <h2 className="text-[28px] leading-[0.9] tracking-[-1.12px] text-black desk:text-[48px] desk:tracking-[-1.92px]">
            {page.heading}
          </h2>
          {[0, 1].map((block) => (
            <div key={block} className="flex flex-col gap-6">
              <h3 className="text-[20px] leading-[0.9] tracking-[-0.8px] text-black desk:text-[32px] desk:tracking-[-1.28px]">
                {page.subhead}
              </h3>
              <div className={BODY}>
                {page.paragraphs.map((paragraph, index) => (
                  <p
                    key={paragraph}
                    className={index < page.paragraphs.length - 1 ? "mb-[8px] desk:mb-3" : undefined}
                  >
                    {paragraph}
                  </p>
                ))}
              </div>
            </div>
          ))}
        </article>
      </div>
    </section>
  );
}
