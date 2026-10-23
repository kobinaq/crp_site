"use client";

import { COOKIE_INVENTORY, type ConsentCategory } from "@/lib/consent";
import { useText } from "@/lib/ui-text";
import { useConsent } from "../cookies/ConsentProvider";

const BODY =
  "text-[15px] leading-[1.2] tracking-[-0.6px] text-black/84 desk:text-[20px] desk:tracking-[-0.8px]";
const LABEL =
  "text-[12px] font-semibold uppercase leading-none tracking-[0.96px] text-black/72 desk:text-[14px] desk:tracking-[1.12px]";

const CATEGORIES: { category: ConsentCategory; title: string }[] = [
  { category: "necessary", title: "Strictly necessary" },
  { category: "functional", title: "Functional" },
  { category: "analytics", title: "Analytics" },
];

/** Privacy page "Cookies" section (#cookies): the same inventory the consent panel controls. */
export function CookieSection() {
  const tr = useText();
  const { openPreferences } = useConsent();

  return (
    <div id="cookies" className="flex scroll-mt-28 flex-col gap-6">
      <h3 className="text-[20px] leading-[0.9] tracking-[-0.8px] text-black desk:text-[32px] desk:tracking-[-1.28px]">
        {tr("Cookies and local storage")}
      </h3>
      <p className={BODY}>
        {tr("We use the cookies this site needs to work. With your permission, we also remember your language and collect anonymous usage statistics with PostHog to improve the site. We do not use advertising cookies. Optional cookies are only set after you allow them, and they are removed if you withdraw your consent. You can change your choice anytime.")}
      </p>
      {CATEGORIES.map(({ category, title }) => (
        <div key={category} className="flex flex-col gap-3">
          <h4 className="text-[16px] leading-[0.9] tracking-[-0.64px] text-black desk:text-[20px] desk:tracking-[-0.8px]">
            {tr(title)}
            {category === "necessary" ? <span className="text-black/72"> · {tr("Always active")}</span> : null}
          </h4>
          <ul className="flex flex-col">
            {COOKIE_INVENTORY.filter((item) => item.category === category).map((item) => (
              <li key={item.name} className="grid gap-2 border-b border-black/12 py-3 desk:grid-cols-[180px_1fr_120px] desk:gap-4">
                <span className={`${BODY} font-medium text-black [overflow-wrap:anywhere]`}>{item.label ? tr(item.label) : item.name}</span>
                <span className={BODY}>{tr(item.purpose)}</span>
                <span className={`${BODY} desk:text-right`}>
                  <span className={`${LABEL} desk:hidden`}>{tr("Duration")}: </span>
                  {tr(item.duration)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
      <button
        type="button"
        onClick={openPreferences}
        className="self-start rounded-full bg-black px-7 py-4 text-[14px] font-semibold uppercase leading-[0.9] tracking-[0.56px] text-white transition-transform duration-300 hover:scale-[1.02] active:scale-[0.98]"
      >
        {tr("Cookie preferences")}
      </button>
    </div>
  );
}
