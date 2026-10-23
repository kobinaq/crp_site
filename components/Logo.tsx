"use client";

import Link from "@/components/LocaleLink";
import { useText } from "@/lib/ui-text";

type LogoProps = {
  size?: "sm" | "lg";
  className?: string;
  imgClassName?: string;
  tone?: "dark" | "light" | "color";
};

const LOCKUP = {
  light: "/CRP_iDentity_Monochromatic-HWhite.png",
  dark: "/CRP_iDentity_Monochromatic-HBlack.png",
  color: "/CRP_iDentity_HorizontalLockup.png",
} as const;

export function Logo({
  size = "sm",
  className = "",
  imgClassName,
  tone = "dark",
}: LogoProps) {
  const tr = useText();
  const heightClass =
    imgClassName ??
    (size === "lg"
      ? "h-[68px] w-auto desk:h-[84px]"
      : "h-[24px] w-auto desk:h-[48px]");

  return (
    <Link
      href="/"
      aria-label={tr("Climate Refugee Pavilion home")}
      className={`inline-flex cursor-pointer opacity-100 transition-opacity duration-300 hover:opacity-70 ${className}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={LOCKUP[tone]}
        alt=""
        width={1006}
        height={378}
        className={heightClass}
      />
    </Link>
  );
}
