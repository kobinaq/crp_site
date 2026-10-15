"use client";

import { useText } from "@/lib/ui-text";

import { type KeyboardEvent, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal, flushSync } from "react-dom";
import { useLanguage } from "../LanguageProvider";
import { COUNTRIES, countryLabel, rankCountries, type Country } from "@/lib/countries";
import { FIELD, FIELD_LG, LABEL, LABEL_LG, MINI_LABEL, VALUE_LG } from "./fieldStyles";

function Caret({ up = false }: { up?: boolean }) {
  return (
    <svg viewBox="0 0 12 12" className={`size-3 shrink-0 text-black/48 transition-transform ${up ? "rotate-180" : ""}`} fill="none" aria-hidden>
      <path d="M2.5 4.5L6 8l3.5-3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Flag({ code, lazy = false, compact = false }: { code: string; lazy?: boolean; compact?: boolean }) {
  return (
    <span
      className={`inline-flex shrink-0 overflow-hidden bg-black/5 shadow-[inset_0_0_0_1px_rgba(0,0,0,0.12)] ${
        compact ? "size-5 rounded-[8px]" : "size-6 rounded-full"
      }`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`/flags/${code.toLowerCase()}.svg`}
        alt=""
        width={24}
        height={16}
        draggable={false}
        loading={lazy ? "lazy" : "eager"}
        className="h-full w-full object-cover"
      />
    </span>
  );
}

function placeMenu(anchor: HTMLButtonElement, variant: "field" | "inline") {
  const rect = anchor.getBoundingClientRect();
  const width = Math.min(variant === "field" ? Math.max(rect.width, 280) : 312, window.innerWidth - 16);
  const gap = 8;
  const spaceBelow = window.innerHeight - rect.bottom - gap;
  const spaceAbove = rect.top - gap;
  const openUp = spaceBelow < 220 && spaceAbove > spaceBelow;
  const maxHeight = Math.max(180, Math.min(360, openUp ? spaceAbove : spaceBelow));
  const top = openUp ? Math.max(8, rect.top - gap - maxHeight) : rect.bottom + gap;
  const left = Math.min(Math.max(8, rect.left), window.innerWidth - width - 8);
  return { top, left, width, maxHeight };
}

// Rounded flag + name rows. "field" is the nationality / based-in pill.
// "inline" is the phone dial control. Typing ranks matches to the top.
// Menus follow Figma 2308:4292 (nationality: flag + name) and 2308:4977 (dial:
// search row, then flag + code | name). size="lg" is the More about you
// trigger (Figma 2308:2967): 64px desktop pill with a floating label.
export function CountryDropdown({
  variant,
  label,
  value,
  onChange,
  compact = false,
  size = "md",
}: {
  variant: "field" | "inline";
  label?: string;
  value: Country | null;
  onChange: (country: Country) => void;
  compact?: boolean;
  size?: "md" | "lg";
}) {
  const lg = size === "lg";
  const tr = useText();
  const { locale } = useLanguage();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [menuStyle, setMenuStyle] = useState<ReturnType<typeof placeMenu> | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const lastTyped = useRef(0);
  const listId = useId();

  const ranked = useMemo(() => {
    let names: Intl.DisplayNames | null = null;
    try {
      names = new Intl.DisplayNames([locale], { type: "region" });
    } catch {
      names = null;
    }
    const labelFor = (country: Country) => {
      const localized = names?.of(country.code);
      return localized && localized !== country.code ? localized : country.name;
    };
    return rankCountries(COUNTRIES, query, labelFor).map((country) => ({
      country,
      label: labelFor(country),
    }));
  }, [locale, query]);
  const safeActive = ranked.length === 0 ? 0 : Math.min(active, ranked.length - 1);

  useLayoutEffect(() => {
    const anchor = triggerRef.current;
    if (!open || !anchor) return;
    const place = () => {
      const next = placeMenu(anchor, variant);
      setMenuStyle((current) =>
        current &&
        current.top === next.top &&
        current.left === next.left &&
        current.width === next.width &&
        current.maxHeight === next.maxHeight
          ? current
          : next,
      );
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, variant]);

  useEffect(() => {
    if (!open || !menuStyle) return;
    const list = listRef.current;
    if (!list) return;
    const target = list.querySelector<HTMLElement>(query ? "[data-active='true']" : "[data-selected='true'], [data-active='true']");
    if (!target) return;
    const option = target.getBoundingClientRect();
    const frame = list.getBoundingClientRect();
    if (option.top < frame.top) list.scrollTop -= frame.top - option.top;
    else if (option.bottom > frame.bottom) list.scrollTop += option.bottom - frame.bottom;
  }, [open, menuStyle, query, safeActive]);

  const choose = useCallback(
    (country: Country) => {
      onChange(country);
      setOpen(false);
      triggerRef.current?.focus();
    },
    [onChange],
  );

  useEffect(() => {
    if (!open) return;
    const onDown = (event: PointerEvent) => {
      if (!(event.target instanceof Node)) return;
      if (wrapRef.current?.contains(event.target) || menuRef.current?.contains(event.target)) return;
      setOpen(false);
    };
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
        return;
      }
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      // In the dial search input, text editing keys belong to the input itself.
      const inSearch = event.target === searchRef.current;
      if (inSearch && (event.key === "Backspace" || event.key.length === 1 || event.key === "Home" || event.key === "End")) return;
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActive((index) => Math.min(index + 1, Math.max(ranked.length - 1, 0)));
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        setActive((index) => Math.max(index - 1, 0));
      } else if (event.key === "Home") {
        event.preventDefault();
        setActive(0);
      } else if (event.key === "End") {
        event.preventDefault();
        setActive(Math.max(ranked.length - 1, 0));
      } else if (event.key === "Enter") {
        event.preventDefault();
        const country = ranked[safeActive]?.country;
        if (country) choose(country);
      } else if (event.key === "Backspace") {
        event.preventDefault();
        lastTyped.current = Date.now();
        setQuery((current) => current.slice(0, -1));
        setActive(0);
      } else if (event.key.length === 1) {
        event.preventDefault();
        const now = Date.now();
        const fresh = now - lastTyped.current > 700;
        lastTyped.current = now;
        setQuery((current) => (fresh ? event.key : `${current}${event.key}`));
        setActive(0);
      }
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, ranked, safeActive, choose]);

  // Dial menu: move focus into the search input so typing (and the mobile
  // keyboard) goes there. Click-open focuses synchronously (see onClick) so iOS
  // shows the keyboard; this covers keyboard-open paths.
  useEffect(() => {
    if (open && menuStyle && variant === "inline" && document.activeElement !== searchRef.current) {
      const input = searchRef.current;
      input?.focus({ preventScroll: true });
      input?.setSelectionRange(input.value.length, input.value.length);
    }
  }, [open, menuStyle, variant]);


  function onTriggerKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (open) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setQuery("");
      setActive(0);
      setOpen(true);
      return;
    }
    if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      lastTyped.current = Date.now();
      setQuery(event.key);
      setActive(0);
      setOpen(true);
    }
  }

  const shownLabel = value ? countryLabel(value, locale) : label;

  return (
    <div ref={wrapRef} className={variant === "field" ? "relative min-w-0 flex-1" : "relative shrink-0"}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => {
          setQuery("");
          setActive(0);
          if (variant === "inline" && !open) {
            // Render the menu synchronously so focus lands in the search input
            // inside the tap gesture (required for the iOS keyboard).
            flushSync(() => setOpen(true));
            searchRef.current?.focus({ preventScroll: true });
            return;
          }
          setOpen((current) => !current);
        }}
        onKeyDown={onTriggerKeyDown}
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open && ranked[safeActive] ? `${listId}-${ranked[safeActive].country.code}` : undefined}
        aria-label={variant === "inline" ? tr("Country code") : undefined}
        className={
          variant === "field"
            ? lg
              ? `${FIELD} ${FIELD_LG} w-full gap-3 ${value && !(open && query) ? "pl-4" : "pl-6"} pr-8`
              : `${FIELD} w-full gap-4 pl-5 pr-6`
            : "flex h-11 items-center gap-2 border-r border-black/8 pr-2"
        }
      >
        {variant === "field" && lg ? (
          open && query ? (
            <span className="flex min-w-0 flex-1 flex-col items-start gap-0.5 text-left">
              <span className={MINI_LABEL}>{label}</span>
              <span className={`max-w-full truncate ${VALUE_LG}`}>
                {query}
                <span aria-hidden className="ml-px inline-block h-[0.9em] w-px translate-y-[0.1em] bg-black" />
              </span>
            </span>
          ) : value ? (
            <span className="flex min-w-0 flex-1 items-center gap-3 text-left">
              <Flag code={value.code} compact />
              <span className="flex min-w-0 flex-col items-start gap-0.5">
                <span className={MINI_LABEL}>{label}</span>
                <span className={`max-w-full truncate ${VALUE_LG}`}>{shownLabel}</span>
              </span>
            </span>
          ) : (
            <span className={`flex-1 text-left ${LABEL_LG}`}>{label}</span>
          )
        ) : variant === "field" ? (
          value ? (
            <span className="flex min-w-0 flex-1 items-center gap-3 text-left">
              <Flag code={value.code} />
              <span className="shrink-0 text-[14px] font-semibold text-black/60">{value.dial}</span>
              <span className="truncate text-[16px] text-black">{shownLabel}</span>
            </span>
          ) : (
            <span className={`flex-1 text-left ${LABEL}`}>{label}</span>
          )
        ) : (
          <>
            {value ? (
              <Flag code={value.code} compact={compact || lg} />
            ) : (
              <span className={`inline-block bg-black/5 ${compact ? "size-5 rounded-[8px]" : "size-6 rounded-full"}`} />
            )}
            <span
              className={
                compact
                  ? "text-[12px] font-semibold uppercase leading-[0.9] tracking-[0.48px] text-black/48"
                  : lg
                    ? "text-[14px] font-semibold uppercase leading-[0.9] tracking-[0.56px] text-black"
                    : "text-[14px] font-semibold text-black/60"
              }
            >
              {value?.dial ?? "+"}
            </span>
          </>
        )}
        <Caret up={open && lg && variant === "field"} />
      </button>

      {open && menuStyle
        ? createPortal(
            <div
              ref={menuRef}
              style={{ top: menuStyle.top, left: menuStyle.left, width: menuStyle.width, maxHeight: menuStyle.maxHeight }}
              className="fixed z-[90] flex flex-col overflow-hidden rounded-[32px] bg-white shadow-[0_12px_40px_rgba(0,0,0,0.14)]"
            >
              {variant === "inline" ? (
                <div className="mx-[19px] mt-[7px] flex h-[63px] shrink-0 items-center gap-3">
                  <svg viewBox="0 0 16 16" className="size-4 shrink-0 text-black/48" fill="none" aria-hidden>
                    <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.5" />
                    <path d="M10.75 10.75L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                  <input
                    ref={searchRef}
                    type="text"
                    inputMode="search"
                    enterKeyHint="search"
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck={false}
                    value={query}
                    onChange={(event) => {
                      setQuery(event.target.value);
                      setActive(0);
                    }}
                    placeholder={tr("Search")}
                    aria-label={tr("Search")}
                    aria-controls={listId}
                    aria-activedescendant={ranked[safeActive] ? `${listId}-${ranked[safeActive].country.code}` : undefined}
                    className="min-w-0 flex-1 bg-transparent text-[20px] leading-[1.2] tracking-[-0.8px] text-black outline-none placeholder:text-black/32"
                  />
                  {query ? (
                    <button
                      type="button"
                      aria-label={tr("Clear search")}
                      onClick={() => {
                        setQuery("");
                        setActive(0);
                        searchRef.current?.focus();
                      }}
                      className="grid size-6 shrink-0 place-items-center rounded-full text-black/48 hover:bg-cream"
                    >
                      <svg viewBox="0 0 12 12" className="size-3" fill="none" aria-hidden>
                        <path d="M2.5 2.5l7 7M9.5 2.5l-7 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                      </svg>
                    </button>
                  ) : null}
                </div>
              ) : null}
              <div ref={listRef} id={listId} role="listbox" className="overflow-y-auto px-[7px] py-[7px]">
                {ranked.length === 0 ? (
                  <p className="px-3 py-4 text-[14px] text-black/48">{tr("No countries found")}</p>
                ) : (
                  ranked.map(({ country, label: countryName }, index) => {
                    const selected = value?.code === country.code;
                    const current = index === safeActive;
                    return (
                      <button
                        key={country.code}
                        id={`${listId}-${country.code}`}
                        type="button"
                        role="option"
                        aria-selected={selected}
                        data-active={current ? "true" : undefined}
                        data-selected={selected ? "true" : undefined}
                        onMouseMove={() => {
                          if (index !== safeActive) setActive(index);
                        }}
                        onClick={() => choose(country)}
                        className={`flex h-14 w-full items-center gap-3 rounded-[16px] px-3 text-left ${selected || current ? "bg-cream" : ""}`}
                      >
                        <Flag code={country.code} lazy />
                        {variant === "inline" ? (
                          <span className="flex h-11 w-[42px] shrink-0 items-center border-r border-black/8 text-[14px] font-semibold leading-[0.9] tracking-[0.56px] text-black">
                            {country.dial}
                          </span>
                        ) : null}
                        <span className="line-clamp-2 min-w-0 flex-1 text-[20px] leading-[1] tracking-[-0.8px] text-black">
                          {countryName}
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
