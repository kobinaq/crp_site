"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function ReviewKeys({ previous, next }: { previous: string | null; next: string | null }) {
  const router = useRouter();
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target;
      if (target instanceof HTMLElement) {
        const tag = target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
        if (target.closest("[data-admin-select], [role='listbox'], [role='dialog'], [role='alertdialog']")) return;
      }
      const href = event.key === "j" || event.key === "ArrowRight" ? next : event.key === "k" || event.key === "ArrowLeft" ? previous : null;
      if (!href) return;
      event.preventDefault();
      router.push(href);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, previous, router]);
  return null;
}
