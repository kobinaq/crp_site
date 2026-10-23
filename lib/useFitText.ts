"use client";

import { useLayoutEffect, useRef } from "react";

/**
 * Shrinks an element's font size (from its CSS size, never above it) until its
 * widest word fits its own width. Display headings use fixed type, so longer
 * translated words ("PARTENAIRE", "d'ambassadeurs") would otherwise run past
 * the edge instead of wrapping. Nothing changes while the text already fits.
 */
export function useFitText<T extends HTMLElement>(text: string) {
  const ref = useRef<T>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => {
      el.style.fontSize = "";
      if (!el.clientWidth) return; // display:none at this breakpoint
      let px = parseFloat(getComputedStyle(el).fontSize);
      for (let i = 0; i < 6 && el.scrollWidth > el.clientWidth + 0.5; i++) {
        px = Math.floor(px * Math.min(0.98, el.clientWidth / el.scrollWidth) * 10) / 10;
        el.style.fontSize = `${px}px`;
      }
    };
    fit();
    const observer = new ResizeObserver(fit);
    if (el.parentElement) observer.observe(el.parentElement);
    let live = true;
    void document.fonts?.ready.then(() => live && fit());
    return () => {
      live = false;
      observer.disconnect();
    };
  }, [text]);
  return ref;
}

/**
 * Scales a single nowrap row down (around its centre) when it is wider than its
 * container, so a longer translation stays on screen. Layout is untouched.
 */
export function useFitRow<T extends HTMLElement>(text: string) {
  const ref = useRef<T>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    const box = el?.parentElement;
    if (!el || !box) return;
    const fit = () => {
      el.style.transform = "";
      const pad = getComputedStyle(box);
      const room = box.clientWidth - parseFloat(pad.paddingLeft) - parseFloat(pad.paddingRight);
      const width = el.scrollWidth;
      if (room && width > room) el.style.transform = `scale(${Math.floor((room / width) * 1000) / 1000})`;
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(box);
    let live = true;
    void document.fonts?.ready.then(() => live && fit());
    return () => {
      live = false;
      observer.disconnect();
    };
  }, [text]);
  return ref;
}
