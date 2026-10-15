"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { GetInvolvedPopup } from "./GetInvolvedPopup";
import { useCopy } from "./LanguageProvider";
import { useConsent } from "./cookies/ConsentProvider";

const AVATARS = [
  "/images/involved-youth.png",
  "/images/card-community.jpg",
  "/images/hero.jpg",
];

const LEFT_FLARE = "M34 78C34 96.7777 18.7777 112 0 112H34V78Z";
const RIGHT_FLARE = "M383 78C383 96.7777 398.2223 112 417 112H383V78Z";

const RISE_MS = 600;
const RISE_EASE = "cubic-bezier(0.22, 1, 0.36, 1)";
const OPEN_EVENT = "get-involved:open";

type PillMode = "docked" | "riding" | "immersed" | "leaving";

function readMode(): PillMode {
  // Hands off to a docked tab (data-pill-handoff) when a page has one; Home no longer does (Figma 2308:547).
  const section = document.querySelector<HTMLElement>("[data-pill-handoff]");
  if (!section) return "docked";

  const vh = window.innerHeight;
  const rect = section.getBoundingClientRect();
  const coversBottom = rect.bottom > vh;

  if (rect.top > vh) return "docked";
  if (rect.top > 0) return "riding";
  if (coversBottom) return "immersed";
  return "leaving";
}

export function openGetInvolvedPopup() {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

export function GetInvolvedTab({ className = "" }: { className?: string }) {
  const copy = useCopy();
  return (
    <button
      type="button"
      onClick={openGetInvolvedPopup}
      aria-label={copy.a11y.getInvolvedJump}
      className={`block shrink-0 transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-0.5 active:translate-y-0 ${className}`}
    >
      <span className="relative flex items-end drop-shadow-[0_8px_18px_rgba(0,0,0,0.4)]">
        {/* Side scoops — Figma Exclude nodes at 25.5×25.5 */}
        <svg
          width="25.5"
          height="25.5"
          viewBox="0 78 34 34"
          className="block shrink-0"
          aria-hidden
        >
          <path d={LEFT_FLARE} fill="#000" />
        </svg>

        <span className="flex h-[60px] items-center gap-[15px] rounded-tl-[36px] rounded-tr-[36px] bg-black py-[13.5px] pl-[24px] pr-[15px]">
          <span className="grid size-[12px] shrink-0 place-items-center rounded-full bg-lime/25">
            <span className="size-[6px] rounded-full bg-leaf" />
          </span>

          <span className="whitespace-nowrap text-center text-[15px] font-semibold uppercase leading-[0.745] tracking-[2.25px] text-white">
            {copy.involved.tab}
          </span>

          <span className="flex isolate shrink-0 items-center">
            {AVATARS.map((src, i) => (
              <span
                key={src}
                className={`relative size-[30px] shrink-0 overflow-hidden rounded-full border-[1.25px] border-solid border-white ${
                  i < AVATARS.length - 1 ? "mr-[-21.25px]" : ""
                }`}
                style={{ zIndex: AVATARS.length - i }}
              >
                <Image src={src} alt="" fill sizes="30px" className="object-cover" />
              </span>
            ))}
          </span>
        </span>

        <svg
          width="25.5"
          height="25.5"
          viewBox="383 78 34 34"
          className="block shrink-0"
          aria-hidden
        >
          <path d={RIGHT_FLARE} fill="#000" />
        </svg>
      </span>
    </button>
  );
}

// Fixed copy of the tab: hides while #join is on screen, then rises back up.
export function GetInvolvedPill() {
  const ref = useRef<HTMLDivElement>(null);
  const modeRef = useRef<PillMode>("docked");
  const [rise, setRise] = useState(false);
  const [popupOpen, setPopupOpen] = useState(false);
  const closePopup = useCallback(() => setPopupOpen(false), []);
  // The cookie banner sits where the pill docks; hide the pill until a choice is made.
  const { bannerVisible } = useConsent();

  useEffect(() => {
    const onOpen = () => setPopupOpen(true);
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_EVENT, onOpen);
  }, []);

  useEffect(() => {
    const apply = (mode: PillMode) => {
      const el = ref.current;
      if (!el) return;
      const hide = mode === "riding" || mode === "immersed";
      el.style.visibility = hide ? "hidden" : "visible";
      el.style.pointerEvents = hide ? "none" : "auto";
      if (hide) el.setAttribute("aria-hidden", "true");
      else el.removeAttribute("aria-hidden");

      const prev = modeRef.current;
      if (
        (prev === "riding" || prev === "immersed") &&
        mode === "leaving" &&
        !window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ) {
        setRise(true);
      }
      modeRef.current = mode;
    };

    const onScroll = () => apply(readMode());
    apply(readMode());
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  useEffect(() => {
    if (!rise) return;
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => setRise(false));
    });
    return () => cancelAnimationFrame(id);
  }, [rise]);

  return (
    <>
      <div
        ref={ref}
        data-testid="get-involved-pill"
        className={`fixed bottom-0 left-1/2 z-40 ${bannerVisible ? "hidden" : "flex"}`}
        style={{
          transform: `translate(-50%, ${rise ? 100 : 0}%)`,
          transition: rise ? "none" : `transform ${RISE_MS}ms ${RISE_EASE}`,
        }}
      >
        <GetInvolvedTab />
      </div>
      <GetInvolvedPopup open={popupOpen} onClose={closePopup} />
    </>
  );
}
