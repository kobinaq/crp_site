"use client";

import { useText } from "@/lib/ui-text";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLanguage } from "../LanguageProvider";
import { FIELD, FIELD_LG, LABEL, LABEL_LG, MINI_LABEL, VALUE_LG } from "./fieldStyles";

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;

// Calendar date picker matching Figma 2184:3924: month/year header with
// prev/next, S-M-T-W-T-F-S row, a 6-week grid with greyed adjacent months and a
// cream circle on the selected day. The month/year caret opens a year list.
// Popover restyled to Figma 2308:5762 (black rounded day with lime text).
// size="lg" is the More about you trigger (Figma 2308:2967): 64px desktop pill,
// floating "*D.O.B" label over a "Nov 9, 2003" value, cream while open.
export function DateField({
  value,
  onChange,
  className = "",
  size = "md",
  invalid = false,
}: {
  value: string; // YYYY-MM-DD
  onChange: (v: string) => void;
  className?: string;
  size?: "md" | "lg";
  /** Highlight the field (e.g. the age check failed). */
  invalid?: boolean;
}) {
  const lg = size === "lg";
  const tr = useText();
  const { locale } = useLanguage();
  const MONTHS = Array.from({ length: 12 }, (_, month) => new Intl.DateTimeFormat(locale, { month: "long" }).format(new Date(2024, month, 1)));
  const WEEKDAYS = Array.from({ length: 7 }, (_, day) => new Intl.DateTimeFormat(locale, { weekday: "narrow" }).format(new Date(2024, 0, day + 7)));
  const [open, setOpen] = useState(false);
  const [yearPicker, setYearPicker] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuBox, setMenuBox] = useState<{ top: number; left: number; width: number } | null>(null);

  const today = useMemo(() => new Date(), []);
  const selected = value ? new Date(`${value}T00:00:00`) : null;
  const [view, setView] = useState(() => ({
    y: selected?.getFullYear() ?? today.getFullYear() - 18,
    m: selected?.getMonth() ?? today.getMonth(),
  }));

  useLayoutEffect(() => {
    const anchor = wrapRef.current;
    if (!open || !anchor) return;
    const place = () => {
      const rect = anchor.getBoundingClientRect();
      const width = Math.min(312, window.innerWidth - 16);
      const left = Math.min(Math.max(8, rect.left), window.innerWidth - width - 8);
      setMenuBox({ top: rect.bottom + 8, left, width });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!(e.target instanceof Node)) return;
      if (wrapRef.current?.contains(e.target) || menuRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const cells = useMemo(() => {
    const first = new Date(view.y, view.m, 1).getDay(); // 0=Sun
    const daysInMonth = new Date(view.y, view.m + 1, 0).getDate();
    const prevDays = new Date(view.y, view.m, 0).getDate();
    const out: { d: number; cur: boolean; y: number; m: number }[] = [];
    for (let i = first - 1; i >= 0; i--) {
      const m = view.m === 0 ? 11 : view.m - 1;
      const y = view.m === 0 ? view.y - 1 : view.y;
      out.push({ d: prevDays - i, cur: false, y, m });
    }
    for (let d = 1; d <= daysInMonth; d++) out.push({ d, cur: true, y: view.y, m: view.m });
    while (out.length % 7 !== 0) {
      const idx = out.length - (first + daysInMonth) + 1;
      const m = view.m === 11 ? 0 : view.m + 1;
      const y = view.m === 11 ? view.y + 1 : view.y;
      out.push({ d: idx, cur: false, y, m });
    }
    return out;
  }, [view]);

  const shift = (delta: number) => {
    setView((v) => {
      const m = v.m + delta;
      if (m < 0) return { y: v.y - 1, m: 11 };
      if (m > 11) return { y: v.y + 1, m: 0 };
      return { y: v.y, m };
    });
  };

  const years = useMemo(() => {
    const end = today.getFullYear();
    return Array.from({ length: end - 1940 + 1 }, (_, i) => end - i);
  }, [today]);

  const display = selected
    ? lg
      ? new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", year: "numeric" }).format(selected)
      : `${pad(selected.getDate())} ${MONTHS[selected.getMonth()].slice(0, 3)} ${selected.getFullYear()}`
    : null;

  return (
    <div ref={wrapRef} className={`relative min-w-0 ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={`${FIELD} w-full gap-2.5 px-4 transition-colors ${lg ? `${FIELD_LG} ${display ? "justify-start" : "justify-center"}` : "justify-center"} ${
          lg && open ? "bg-cream!" : ""
        } ${invalid ? "border-magenta!" : ""}`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icons/calendar-blank.svg" alt="" width={20} height={20} className={`size-5 ${lg ? "opacity-[0.48] brightness-0" : "opacity-60"}`} />
        {lg && display ? (
          <span className="flex min-w-0 flex-col items-start gap-0.5 text-left">
            <span className={MINI_LABEL}>{tr("*D.O.B")}</span>
            <span className={`truncate ${VALUE_LG}`}>{display}</span>
          </span>
        ) : display ? (
          <span className="text-[16px] text-black">{display}</span>
        ) : (
          <span className={lg ? LABEL_LG : LABEL}>{tr("*D.O.B")}</span>
        )}
      </button>

      {open && menuBox
        ? createPortal(
        <div
          ref={menuRef}
          style={{ top: menuBox.top, left: menuBox.left, width: menuBox.width }}
          className="fixed z-[90] rounded-[32px] bg-white px-4 pb-3 pt-5 shadow-[0_12px_40px_rgba(0,0,0,0.14)]"
        >
          <div className="mb-3 flex items-center justify-between pl-2">
            <button
              type="button"
              onClick={() => setYearPicker((v) => !v)}
              className="flex items-center gap-2 text-[20px] leading-[1.2] tracking-[-0.8px] text-black"
            >
              {MONTHS[view.m]} {view.y}
              <svg viewBox="0 0 12 12" className="size-3 text-black" fill="none" aria-hidden>
                <path d="M2.5 4.5L6 8l3.5-3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            {!yearPicker ? (
              <div className="flex items-center gap-3">
                <button type="button" onClick={() => shift(-1)} aria-label={tr("Previous month")} className="grid size-8 place-items-center rounded-full text-black hover:bg-cream">
                  <svg viewBox="0 0 12 12" className="size-3.5" fill="none" aria-hidden>
                    <path d="M7.5 2.5L4 6l3.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
                <button type="button" onClick={() => shift(1)} aria-label={tr("Next month")} className="grid size-8 place-items-center rounded-full text-black hover:bg-cream">
                  <svg viewBox="0 0 12 12" className="size-3.5" fill="none" aria-hidden>
                    <path d="M4.5 2.5L8 6l-3.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </div>
            ) : null}
          </div>

          {yearPicker ? (
            <div className="grid max-h-[240px] grid-cols-4 gap-1 overflow-y-auto">
              {years.map((y) => (
                <button
                  key={y}
                  type="button"
                  onClick={() => {
                    setView((v) => ({ ...v, y }));
                    setYearPicker(false);
                  }}
                  className={`h-10 rounded-[16px] text-[16px] ${y === view.y ? "bg-black text-lime" : "text-black hover:bg-cream"}`}
                >
                  {y}
                </button>
              ))}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-7 text-center text-[10px] font-semibold uppercase tracking-[0.4px] text-black/48">
                {WEEKDAYS.map((w, i) => (
                  <span key={i} className="py-2">{w}</span>
                ))}
              </div>
              <div className="grid grid-cols-7">
                {cells.map((c, i) => {
                  const isSel =
                    selected != null &&
                    c.cur &&
                    selected.getFullYear() === c.y &&
                    selected.getMonth() === c.m &&
                    selected.getDate() === c.d;
                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => {
                        onChange(iso(c.y, c.m, c.d));
                        setOpen(false);
                      }}
                      className={`grid aspect-square place-items-center text-[16px] leading-none ${
                        c.cur ? "text-black" : "text-black/32"
                      }`}
                    >
                      <span
                        className={`grid size-10 place-items-center rounded-[16px] transition-colors ${isSel ? "bg-black text-lime" : "hover:bg-cream"}`}
                      >
                        {c.d}
                      </span>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>,
            document.body,
          )
        : null}
    </div>
  );
}
