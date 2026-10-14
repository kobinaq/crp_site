"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { locales, localePath, nativeLanguageNames, type Locale } from "@/lib/locale";
import { t } from "@/lib/messages";
import { useLanguage } from "./LanguageProvider";

// Icons from Figma (Pavilion, node 2282:589); source SVGs in public/icons/.
function CaretDownIcon({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 12 12"
      className={`size-[12px] shrink-0 transition-transform duration-200 motion-reduce:transition-none ${open ? "rotate-180" : ""}`}
      aria-hidden
    >
      <path d="M10.0155 4.76534L6.26552 8.51534C6.23069 8.5502 6.18934 8.57786 6.14381 8.59674C6.09829 8.61561 6.04949 8.62532 6.00021 8.62532C5.95093 8.62532 5.90213 8.61561 5.85661 8.59674C5.81108 8.57786 5.76972 8.5502 5.7349 8.51534L1.9849 4.76534C1.91453 4.69497 1.875 4.59954 1.875 4.50003C1.875 4.40051 1.91453 4.30508 1.9849 4.23471C2.05526 4.16435 2.1507 4.12482 2.25021 4.12482C2.34972 4.12482 2.44516 4.16435 2.51552 4.23471L6.00021 7.71987L9.4849 4.23471C9.51974 4.19987 9.5611 4.17223 9.60662 4.15338C9.65215 4.13452 9.70094 4.12482 9.75021 4.12482C9.79948 4.12482 9.84827 4.13452 9.8938 4.15338C9.93932 4.17223 9.98068 4.19987 10.0155 4.23471C10.0504 4.26955 10.078 4.31092 10.0969 4.35644C10.1157 4.40196 10.1254 4.45075 10.1254 4.50003C10.1254 4.5493 10.1157 4.59809 10.0969 4.64361C10.078 4.68913 10.0504 4.7305 10.0155 4.76534Z" fill="currentColor" />
    </svg>
  );
}

function TranslateIcon() {
  return (
    <svg viewBox="0 0 12 12" className="size-[12px] shrink-0" aria-hidden>
      <path d="M11.5852 9.95719L8.96016 4.70719C8.92901 4.64491 8.88113 4.59253 8.8219 4.55593C8.76266 4.51932 8.6944 4.49993 8.62477 4.49993C8.55513 4.49993 8.48687 4.51932 8.42764 4.55593C8.3684 4.59253 8.32052 4.64491 8.28937 4.70719L7.27172 6.74297C6.47404 6.69811 5.70656 6.42258 5.0625 5.94984C5.81817 5.14287 6.27602 4.10232 6.36047 3H7.5C7.59946 3 7.69484 2.96049 7.76517 2.89016C7.83549 2.81984 7.875 2.72446 7.875 2.625C7.875 2.52554 7.83549 2.43016 7.76517 2.35984C7.69484 2.28951 7.59946 2.25 7.5 2.25H4.875V1.5C4.875 1.40054 4.83549 1.30516 4.76516 1.23483C4.69484 1.16451 4.59946 1.125 4.5 1.125C4.40054 1.125 4.30516 1.16451 4.23484 1.23483C4.16451 1.30516 4.125 1.40054 4.125 1.5V2.25H1.5C1.40054 2.25 1.30516 2.28951 1.23483 2.35984C1.16451 2.43016 1.125 2.52554 1.125 2.625C1.125 2.72446 1.16451 2.81984 1.23483 2.89016C1.30516 2.96049 1.40054 3 1.5 3H5.60766C5.52413 3.91905 5.13401 4.78333 4.5 5.45391C4.10492 5.03703 3.80153 4.54203 3.60938 4.00078C3.59357 3.95356 3.56853 3.90995 3.53569 3.87252C3.50286 3.83508 3.4629 3.80455 3.41814 3.78272C3.37339 3.76089 3.32473 3.74819 3.27502 3.74537C3.2253 3.74255 3.17552 3.74965 3.12858 3.76628C3.08164 3.7829 3.03848 3.8087 3.00162 3.84218C2.96476 3.87567 2.93493 3.91615 2.91389 3.96128C2.89284 4.00641 2.881 4.05529 2.87904 4.10504C2.87709 4.1548 2.88506 4.20445 2.9025 4.25109C3.12622 4.88384 3.47863 5.46337 3.9375 5.95312C3.23098 6.47231 2.37676 6.75157 1.5 6.75C1.40054 6.75 1.30516 6.78951 1.23483 6.85983C1.16451 6.93016 1.125 7.02554 1.125 7.125C1.125 7.22446 1.16451 7.31984 1.23483 7.39017C1.30516 7.46049 1.40054 7.5 1.5 7.5C2.58778 7.50121 3.64437 7.13668 4.5 6.465C5.19824 7.01056 6.03176 7.35587 6.91125 7.46391L5.66437 9.95719C5.64234 10.0012 5.62919 10.0492 5.62569 10.0983C5.62218 10.1474 5.62839 10.1968 5.64395 10.2435C5.67537 10.3379 5.743 10.4159 5.83195 10.4604C5.9209 10.5049 6.02389 10.5122 6.11826 10.4808C6.21263 10.4494 6.29065 10.3818 6.33516 10.2928L6.98156 9H10.268L10.9144 10.2928C10.9456 10.3551 10.9935 10.4075 11.0527 10.4441C11.112 10.4807 11.1803 10.5 11.25 10.5C11.3139 10.5 11.3768 10.4836 11.4326 10.4524C11.4884 10.4213 11.5353 10.3764 11.5689 10.322C11.6025 10.2676 11.6216 10.2056 11.6244 10.1417C11.6273 10.0779 11.6138 10.0143 11.5852 9.95719ZM7.35656 8.25L8.625 5.71359L9.89297 8.25H7.35656Z" fill="currentColor" />
    </svg>
  );
}

const MENU =
  "absolute right-0 top-[calc(100%+8px)] z-[60] min-w-full overflow-hidden rounded-[20px] bg-white p-[4px] text-black shadow-[0_8px_24px_rgba(0,0,0,0.18)]";
const OPTION =
  "outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-1 flex w-full items-center justify-center rounded-full px-[12px] py-[8px] text-center font-semibold uppercase leading-[0.9]";

export function LanguageDropdown({
  variant,
}: {
  variant: "nav" | "compact" | "apply";
}) {
  const { locale, setLocale, copy, path } = useLanguage();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<(HTMLAnchorElement | null)[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const menuId = useId();
  const selectedName = copy.a11y.languageNames[locale];
  const label = t(copy.a11y.changeLanguage, { language: selectedName });

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (rootRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (open) optionRefs.current[activeIndex]?.focus();
  }, [open, activeIndex]);

  const openMenu = (index?: number) => {
    const current = Math.max(0, locales.indexOf(locale));
    setActiveIndex(index ?? current);
    setOpen(true);
  };

  const close = (returnFocus: boolean) => {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  };

  const choose = (next: Locale) => {
    setLocale(next);
    close(true);
  };

  const onTriggerKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      openMenu();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      openMenu(locales.length - 1);
    }
  };

  const onMenuKeyDown = (event: ReactKeyboardEvent<HTMLUListElement>) => {
    const last = locales.length - 1;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((i) => (i >= last ? 0 : i + 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((i) => (i <= 0 ? last : i - 1));
    } else if (event.key === "Home") {
      event.preventDefault();
      setActiveIndex(0);
    } else if (event.key === "End") {
      event.preventDefault();
      setActiveIndex(last);
    } else if (event.key === "Tab") {
      setOpen(false);
    } else if (event.key === " ") {
      event.preventDefault();
      choose(locales[activeIndex]);
    }
  };

  const toggle = () => (open ? close(false) : openMenu());

  const trigger =
    variant === "nav" ? (
      <button
        type="button"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={menuId}
        ref={triggerRef}
        onKeyDown={onTriggerKeyDown}
        onClick={toggle}
        className="group flex shrink-0 items-center rounded-full bg-white p-[4px] text-black shadow-[inset_0_0_18px_rgba(255,255,255,0.25)] transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:scale-[1.03] active:scale-[0.98] outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-black motion-reduce:transition-none"
      >
        <span className="flex h-[32px] items-center gap-[10px] rounded-full px-[12px] py-[10px]">
          <TranslateIcon />
          <span className="w-[28px] text-center text-[14px] font-semibold uppercase leading-[0.9] tracking-[0.56px] mix-blend-hard-light">
            {locale.toUpperCase()}
          </span>
        </span>
        <span className={`flex items-center justify-center rounded-full bg-white p-[10px] transition-colors duration-200 group-hover:bg-black/5 ${open ? "bg-black/5" : ""}`}>
          <CaretDownIcon open={open} />
        </span>
      </button>
    ) : variant === "compact" ? (
      <button
        type="button"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={menuId}
        ref={triggerRef}
        onKeyDown={onTriggerKeyDown}
        onClick={toggle}
        className="flex h-[27px] shrink-0 items-center rounded-full bg-white py-[2px] pl-[2px] pr-[8px] text-black transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:scale-[1.03] active:scale-[0.98] outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-black"
      >
        <span className="flex items-center justify-center rounded-full px-[8px] py-[6px] text-[12px] font-semibold uppercase leading-[0.9] tracking-[0.48px]">
          {locale.toUpperCase()}
        </span>
        <CaretDownIcon open={open} />
      </button>
    ) : (
      <button
        type="button"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={menuId}
        ref={triggerRef}
        onKeyDown={onTriggerKeyDown}
        onClick={toggle}
        className="relative flex h-[27px] items-center rounded-full bg-white py-[2px] pl-[2px] pr-2 text-black shadow-[inset_0_0_18px_rgba(255,255,255,0.25)] desk:h-auto desk:p-[4px] desk:pr-[4px] outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-black"
      >
        <span className="flex h-[23px] items-center justify-center gap-1 px-2 text-[12px] font-semibold uppercase leading-[0.9] tracking-[0.48px] desk:h-[32px] desk:w-auto desk:gap-0 desk:px-[12px] desk:py-[10px] desk:text-[14px] desk:tracking-[0.56px] desk:mix-blend-hard-light">
          <span className="desk:hidden">
            <TranslateIcon />
          </span>
          <span className="desk:w-[28px] desk:text-center">{locale.toUpperCase()}</span>
        </span>
        <span className="flex items-center justify-center pr-1 desk:size-[32px] desk:p-[10px] desk:pr-[10px]">
          <CaretDownIcon open={open} />
        </span>
      </button>
    );

  return (
    <div ref={rootRef} className="relative z-10 shrink-0">
      {trigger}
      {open ? (
        <ul id={menuId} role="listbox" aria-label={label} className={MENU} onKeyDown={onMenuKeyDown}>
          {locales.map((code, index) => {
            const selected = code === locale;
            return (
              <li key={code} role="none">
                <a
                  href={localePath(path, code)} hrefLang={code} lang={code}
                  ref={(el) => { optionRefs.current[index] = el; }}
                  tabIndex={index === activeIndex ? 0 : -1}
                  role="option"
                  aria-selected={selected}
                  onClick={(event) => { event.preventDefault(); choose(code); }}
                  className={`${OPTION} ${
                    variant === "compact"
                      ? "text-[12px] tracking-[0.48px]"
                      : "text-[14px] tracking-[0.56px]"
                  } ${selected ? "bg-black text-white" : "text-black/72 hover:bg-black/5 focus-visible:bg-black/5"}`}
                >
                  {nativeLanguageNames[code]}
                </a>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
