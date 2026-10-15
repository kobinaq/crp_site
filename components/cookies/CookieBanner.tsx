"use client";

import Link from "@/components/LocaleLink";
import { useText } from "@/lib/ui-text";
import { BUTTON_GRADIENT, BUTTON_WHITE, CARD, POLICY_LINK } from "./styles";

/**
 * First-visit cookie banner. Figma: desktop 2308:13895, mobile 2308:13437.
 * Non-modal: the page stays usable; nothing optional is set until a choice.
 * Mobile and desktop rows are separate DOM so tab order always matches what is
 * on screen (mobile: Manage, Reject, Accept, links; desktop: Accept, Reject,
 * links, Manage). `hidden` keeps it mounted but inert under the preferences panel.
 */
export function CookieBanner({
  hidden = false,
  onAcceptAll,
  onRejectAll,
  onManage,
}: {
  hidden?: boolean;
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
  const accept = (
    <button type="button" onClick={onAcceptAll} className={`${BUTTON_GRADIENT} desk:w-auto`}>
      {tr("Accept all")}
    </button>
  );
  const reject = (
    <button type="button" onClick={onRejectAll} className={`${BUTTON_WHITE} desk:w-auto desk:min-w-[143px]`}>
      {tr("Reject all")}
    </button>
  );
  const manage = (
    <button type="button" onClick={onManage} className={`${BUTTON_WHITE} desk:w-auto`}>
      {tr("Manage preferences")}
    </button>
  );

  return (
    <div
      inert={hidden}
      aria-hidden={hidden || undefined}
      className="pointer-events-none fixed inset-x-0 bottom-0 z-[70] flex justify-center p-3 desk:px-8 desk:pb-10"
    >
      <section
        role="region"
        aria-labelledby="cookie-banner-title"
        data-testid="cookie-banner"
        className={`${CARD} pointer-events-auto flex w-full max-w-[874px] flex-col gap-3 rounded-[16px] px-3 pb-3 pt-4 desk:gap-6 desk:rounded-[32px] desk:p-6`}
      >
        <div className="flex flex-col gap-3 desk:gap-6">
          <h2
            id="cookie-banner-title"
            className="text-[20px] leading-[0.9] tracking-[-0.8px] desk:text-[32px] desk:tracking-[-1.28px]"
          >
            {tr("We use cookies")}
          </h2>
          <p className="text-[14px] leading-[1.2] tracking-[-0.56px] desk:text-[20px] desk:leading-none desk:tracking-[-0.8px]">
            {tr("We use necessary cookies to run this site, and optional cookies to remember your language and collect anonymous usage statistics. You can manage your choices anytime.")}
          </p>
        </div>

        {/* Mobile (Figma 2308:13437): stacked Manage, Reject, Accept, then links. */}
        <div className="flex flex-col gap-3 desk:hidden">
          <div className="flex flex-col gap-2">
            {manage}
            {reject}
            {accept}
          </div>
          {links}
        </div>

        {/* Desktop (Figma 2308:13895): Accept + Reject left, links + Manage right. */}
        <div className="hidden items-center justify-between desk:flex">
          <div className="flex">
            {accept}
            {reject}
          </div>
          <div className="flex items-center gap-6">
            {links}
            {manage}
          </div>
        </div>
      </section>
    </div>
  );
}
