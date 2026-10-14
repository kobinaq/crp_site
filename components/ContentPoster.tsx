import type { ReactNode } from "react";
import Image from "next/image";
import { TicketTab } from "./TicketTab";

type ContentPosterProps = {
  image: string;
  topic: ReactNode;
  comingSoon: ReactNode;
  children: ReactNode;
  orientation?: "vertical" | "horizontal" | "window";
};

// Titles use absolute pixel positions inside this 16:9 box, so cards scale as a whole.
const BASE_W = 380;
const BASE_H = 228;
const STRIP_H = 214;

export function ContentPoster({
  image,
  topic,
  comingSoon,
  children,
  orientation = "vertical",
}: ContentPosterProps) {
  const card = (
    <article
      className="relative overflow-hidden rounded-[44px]"
      style={{ width: BASE_W, height: BASE_H }}
    >
      <Image src={image} alt="" fill sizes="380px" className="object-cover" />
      <TicketTab placement="top" label={topic} />
      {children}
      <TicketTab placement="bottom" label={comingSoon} />
    </article>
  );

  if (orientation === "window") {
    // Mobile Figma: two 228px-tall posters side by side, each a centred crop of the 380px card.
    return (
      <div className="relative mr-2 h-[228px] w-[183px] shrink-0 overflow-hidden rounded-[44px]">
        <div className="absolute left-1/2 top-0 -translate-x-1/2">{card}</div>
      </div>
    );
  }

  if (orientation === "horizontal") {
    const scale = STRIP_H / BASE_H;
    return (
      <div
        className="relative mr-2 shrink-0"
        style={{ width: BASE_W * scale, height: STRIP_H }}
      >
        <div
          className="absolute left-0 top-0 origin-top-left"
          style={{ width: BASE_W, height: BASE_H, transform: `scale(${scale})` }}
        >
          {card}
        </div>
      </div>
    );
  }

  return (
    <div className="mb-2 shrink-0" style={{ width: BASE_W, height: BASE_H }}>
      {card}
    </div>
  );
}
