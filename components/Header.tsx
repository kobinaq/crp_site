"use client";

import { useReducedMotion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { mobileNavLinks, navLinks } from "@/lib/nav";
import { LanguageDropdown } from "./LanguageDropdown";
import { localePath } from "@/lib/locale";
import { useLanguage, useCopy } from "./LanguageProvider";
import { Logo } from "./Logo";

const TOP_LOCK_PX = 64;
const DIR_DELTA_PX = 12;

const PILL =
  "bg-black/64 backdrop-blur-[12px] shadow-[0_4px_34.5px_rgba(0,0,0,0.25)]";
const PILL_OFF = "bg-transparent shadow-none backdrop-blur-none";
const PILL_TWEEN =
  "transition-[background-color,box-shadow,backdrop-filter,border-radius] duration-300 ease-out";

function EqualsIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-[24px]" aria-hidden>
      <path
        d="M4 9h16M4 15h16"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-[24px]" aria-hidden>
      <path
        d="M5.5 5.5l13 13M18.5 5.5l-13 13"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function Header({ overMedia = false }: { overMedia?: boolean }) {
  const copy = useCopy();
  const { locale } = useLanguage();
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [scrolledUp, setScrolledUp] = useState(false);

  const openRef = useRef(open);
  const lastYRef = useRef(0);
  const hiddenRef = useRef(false);
  const scrolledUpRef = useRef(false);
  const menuBtnRef = useRef<HTMLButtonElement>(null);
  const reduceMotion = useReducedMotion();

  // Ref copy of `open` so the scroll handler, registered once, reads the current value.
  useEffect(() => {
    openRef.current = open;
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      menuBtnRef.current?.focus();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  useEffect(() => {
    lastYRef.current = Math.max(0, window.scrollY);
    let frame = 0;
    let travel = 0;

    const update = () => {
      frame = 0;
      const y = Math.max(0, window.scrollY);
      const delta = y - lastYRef.current;
      lastYRef.current = y;

      let nextHidden = hiddenRef.current;
      let nextScrolledUp = scrolledUpRef.current;
      if (delta !== 0) {
        travel = Math.sign(delta) === Math.sign(travel) ? travel + delta : delta;
      }
      if (y <= TOP_LOCK_PX || openRef.current) {
        nextHidden = false;
        travel = 0;
        if (y <= TOP_LOCK_PX) nextScrolledUp = false;
      } else if (travel > DIR_DELTA_PX) {
        nextHidden = true;
        nextScrolledUp = false;
        travel = 0;
      } else if (travel < -DIR_DELTA_PX) {
        nextHidden = false;
        nextScrolledUp = true;
        travel = 0;
      }

      if (nextHidden !== hiddenRef.current) {
        hiddenRef.current = nextHidden;
        setHidden(nextHidden);
      }
      if (nextScrolledUp !== scrolledUpRef.current) {
        scrolledUpRef.current = nextScrolledUp;
        setScrolledUp(nextScrolledUp);
      }
    };

    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  const reveal = open || !hidden;
  const showPill = open || scrolledUp;
  const instant = reduceMotion === true;
  const pillClass = `${showPill ? PILL : PILL_OFF} ${instant ? "" : PILL_TWEEN}`;
  const lightChrome = overMedia && !showPill;

  return (
    <header
      inert={!reveal}
      aria-hidden={!reveal}
      className={`pointer-events-none fixed inset-x-0 top-0 z-50 motion-reduce:transition-none ${
        reveal ? "translate-y-0" : "-translate-y-[calc(100%+0.75rem)]"
      } ${instant ? "" : "transition-transform duration-300 ease-out"}`}
    >
      {/* 4.5px gutters around a 59px pill give the 68px bar height from Figma. */}
      <div className="px-[12px] py-[4.5px] desk:hidden">
        <div
          className={`pointer-events-auto flex flex-col gap-[24px] px-[20px] py-[16px] ${pillClass} ${
            open ? "rounded-[30px]" : "rounded-full"
          }`}
        >
          <div className="relative flex items-center justify-between">
            <button
              ref={menuBtnRef}
              type="button"
              aria-label={open ? copy.a11y.closeMenu : copy.a11y.openMenu}
              aria-expanded={open}
              onClick={() => setOpen((v) => !v)}
              className={`flex h-[27px] shrink-0 items-center transition-opacity duration-300 hover:opacity-60 ${
                showPill || lightChrome ? "text-white" : "text-black"
              }`}
            >
              {open ? <CloseIcon /> : <EqualsIcon />}
            </button>

            <LanguageDropdown variant="compact" />

            <div className="absolute left-1/2 top-[1.5px] z-20 -translate-x-1/2">
              <Logo tone={showPill || lightChrome ? "light" : "dark"} />
            </div>
          </div>

          {open ? (
            <ul className="flex flex-col gap-[8px]">
              {mobileNavLinks.map((link) => (
                <li key={link.href}>
                  <a
                    href={localePath(link.href, locale)}
                    onClick={() => setOpen(false)}
                    className="flex w-full items-center justify-center py-[24px] text-center text-[14px] font-semibold uppercase leading-[0.9] tracking-[0.56px] text-white transition-colors duration-300 hover:text-white/70 [text-shadow:0_0_4px_rgba(0,0,0,0.25)]"
                  >
                    {copy.nav[link.key]}
                  </a>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>

      {/* 88px bar from Figma: 24px padding around the 40px language pill. */}
      <div className={`hidden desk:block ${showPill ? "px-[32px] py-[8px]" : ""}`}>
        <div
          className={`pointer-events-auto relative mx-auto flex items-center justify-between ${
            showPill
              ? `max-w-[1200px] rounded-[56px] p-[16px] ${PILL}`
              : "px-[64px] py-[24px]"
          } ${instant ? "" : PILL_TWEEN}`}
        >
          <nav
            className={`flex shrink-0 items-center gap-[32px] text-[14px] font-semibold uppercase tracking-[-0.28px] ${
              showPill ? "pl-[16px] text-white" : "text-[#111]"
            }`}
          >
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={localePath(link.href, locale)}
                className={`whitespace-nowrap ${
                  showPill ? "hover:text-white/80" : "hover:text-black/70"
                } ${instant ? "" : "transition-colors duration-300"}`}
              >
                {copy.nav[link.key]}
              </a>
            ))}
          </nav>

          <LanguageDropdown variant="nav" />

          <div
            className={`absolute left-1/2 z-20 flex -translate-x-1/2 ${
              showPill ? "top-1/2 -translate-y-1/2" : "top-[20px]"
            }`}
          >
            <Logo
              tone={showPill || lightChrome ? "light" : "dark"}
              imgClassName="h-12 w-[134px] object-contain"
            />
          </div>
        </div>
      </div>
    </header>
  );
}
