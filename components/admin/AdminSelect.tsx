"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { field } from "@/components/admin/marks";

export type AdminOption = {
  readonly value: string;
  readonly label: string;
};

function caret() {
  return (
    <svg viewBox="0 0 12 12" className="size-3 shrink-0" aria-hidden>
      <path d="M2.2 4.3 6 8.1l3.8-3.8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function AdminSelect({
  id,
  name,
  value,
  defaultValue = "",
  onValueChange,
  options,
  className,
}: {
  id?: string;
  name?: string;
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  options: readonly AdminOption[];
  className?: string;
}) {
  const controlled = value !== undefined;
  const [uncontrolled, setUncontrolled] = useState(defaultValue);
  const [boundDefault, setBoundDefault] = useState(defaultValue);
  if (!controlled && defaultValue !== boundDefault) {
    setBoundDefault(defaultValue);
    setUncontrolled(defaultValue);
  }
  const current = controlled ? value : uncontrolled;
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const activeRef = useRef(0);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listId = useId();
  const selected = options.find((option) => option.value === current);
  const label = selected?.label ?? current;

  useEffect(() => {
    if (!open) return;
    listRef.current?.focus();
    function onPointer(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (rootRef.current?.contains(target)) return;
      setOpen(false);
    }
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [open]);

  function choose(next: string) {
    if (!controlled) setUncontrolled(next);
    onValueChange?.(next);
    setOpen(false);
  }

  function highlight(index: number) {
    activeRef.current = index;
    setActive(index);
  }

  function openAt(index: number) {
    highlight(index);
    setOpen(true);
  }

  function onTriggerKey(event: ReactKeyboardEvent<HTMLButtonElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp" || event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      const currentIndex = Math.max(0, options.findIndex((option) => option.value === current));
      openAt(event.key === "ArrowUp" ? Math.max(0, currentIndex - 1) : currentIndex);
    }
  }

  function onListKey(event: ReactKeyboardEvent<HTMLUListElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      highlight(Math.min(options.length - 1, activeRef.current + 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      highlight(Math.max(0, activeRef.current - 1));
    } else if (event.key === "Home") {
      event.preventDefault();
      highlight(0);
    } else if (event.key === "End") {
      event.preventDefault();
      highlight(Math.max(0, options.length - 1));
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      const option = options[activeRef.current];
      if (option) choose(option.value);
    } else if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    } else if (event.key === "Tab") {
      triggerRef.current?.focus();
      setOpen(false);
    }
  }

  return (
    <div ref={rootRef} data-admin-select="" className={`relative ${className ?? "w-full"}`}>
      {name ? <input type="hidden" name={name} value={current} /> : null}
      <button
        ref={triggerRef}
        id={id}
        type="button"
        className={`${field} flex items-center justify-between gap-3 text-left`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => (open ? setOpen(false) : openAt(Math.max(0, options.findIndex((option) => option.value === current))))}
        onKeyDown={onTriggerKey}
      >
        <span className="truncate">{label}</span>
        {caret()}
      </button>
      {open ? (
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          tabIndex={-1}
          aria-activedescendant={`${listId}-${active}`}
          className="absolute z-30 mt-2 max-h-60 w-full overflow-auto rounded-3xl border border-black/10 bg-white p-1 shadow-[0_8px_24px_rgba(0,0,0,0.12)] outline-none focus-visible:ring-2 focus-visible:ring-black"
          onKeyDown={onListKey}
        >
          {options.map((option, index) => (
            <li key={`${option.value}:${option.label}`} id={`${listId}-${index}`} role="option" aria-selected={option.value === current}>
              <button
                type="button"
                className={`w-full rounded-full px-4 py-2 text-left text-sm outline-none focus-visible:ring-2 focus-visible:ring-black ${index === active ? "bg-lime" : ""} ${option.value === current ? "font-semibold" : ""}`}
                onMouseEnter={() => highlight(index)}
                onClick={() => choose(option.value)}
              >
                {option.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
