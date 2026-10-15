"use client";

import Link from "@/components/LocaleLink";
import { useText } from "@/lib/ui-text";
import { BUTTON_GRADIENT, BUTTON_WHITE, CARD, POLICY_LINK } from "./styles";

/**
 * First-visit cookie banner. Figma: desktop 2308:13895, mobile 2308:13437.
 * Non-modal: the page stays usable; nothing optional is set until a choice.
 */
export function CookieBanner({
  onAcceptAll,
  onRejectAll,
  onManage,
}: {
  onAcceptAll: () => void;
  onRejectAll: () => void;
  onManage: () => void;
}) {
  const tr = useText();
  const links = (
    <div className="flex items-center justify-center gap-3">
      <Link href="/privacy#cookies" className={POLICY_LINK}>
        {tr("Cookie Policy")}
      </Link>
      <span aria-hidden className="size-[2px] rounded-full bg-[#4651c2]" />
      <Link href="/privacy" className={POLICY_LINK}>
        {tr("Privacy Policy")}
      </Link>
    </div>
  );

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[70] flex justify-center p-3 desk:px-8 desk:pb-10">
      <section
        aria-labelledby="cookie-banner-title"
        data-testid="cookie-banner"
        className={`${CARD} pointer-events-auto flex w-full max-w-[874px] flex-col gap-4 rounded-[16px] px-3 pb-3 pt-4 desk:gap-6 desk:rounded-[32px] desk:p-6`}
      >
        <div className="flex flex-col gap-3 desk:gap-6">
          <h2
            id="cookie-banner-title"
            className="text-[20px] leading-[0.9] tracking-[-0.8px] desk:text-[32px] desk:tracking-[-1.28px]"
          >
            {tr("We use cookies")}
          </h2>
          <p className="text-[14px] leading-[1.2] tracking-[-0.56px] desk:text-[20px] desk:leading-none desk:tracking-[-0.8px]">
            {tr("We use necessary cookies to run this site, and optional cookies to remember your preferences, such as your language. You can manage your choices anytime.")}
          </p>
        </div>

        {/* Mobile: stacked, Manage first. Desktop: Accept/Reject left, links + Manage right. */}
        <div className="flex flex-col gap-3 desk:flex-row desk:flex-wrap desk:items-center desk:justify-between desk:gap-y-3">
          <div className="flex flex-col-reverse gap-2 desk:flex-row desk:gap-0">
            <button type="button" onClick={onAcceptAll} className={`${BUTTON_GRADIENT} desk:w-auto`}>
              {tr("Accept all")}
            </button>
            <button type="button" onClick={onRejectAll} className={`${BUTTON_WHITE} desk:w-auto desk:min-w-[143px]`}>
              {tr("Reject all")}
            </button>
            <button type="button" onClick={onManage} className={`${BUTTON_WHITE} desk:hidden`}>
              {tr("Manage preferences")}
            </button>
          </div>
          <div className="hidden items-center gap-6 desk:ml-auto desk:flex">
            {links}
            <button type="button" onClick={onManage} className={`${BUTTON_WHITE} w-auto`}>
              {tr("Manage preferences")}
            </button>
          </div>
          <div className="desk:hidden">{links}</div>
        </div>
      </section>
    </div>
  );
}
