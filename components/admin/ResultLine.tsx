"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/admin/Button";

export function ResultLine({ message, tone = "ok" }: { message: string | null; tone?: "ok" | "warn" }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [previous, setPrevious] = useState(message);
  const [dismissed, setDismissed] = useState<string | null>(null);
  if (message !== previous) {
    setPrevious(message);
    setDismissed(null);
  }
  useEffect(() => {
    if (message && dismissed !== message) ref.current?.focus();
  }, [message, dismissed]);
  if (!message || dismissed === message) return null;
  const color = tone === "warn" ? "bg-magenta text-white" : "bg-black text-white";
  return (
    <div className={`fixed bottom-4 left-1/2 z-50 flex w-[min(100%-2rem,28rem)] -translate-x-1/2 items-center justify-between gap-3 rounded-full px-4 py-2 shadow-lg ${color}`}>
      <p ref={ref} tabIndex={-1} role="status" className="text-sm font-semibold outline-none">
        {message}
      </p>
      <Button variant="ghost" size="sm" className="!text-white hover:!bg-white/15" type="button" onClick={() => setDismissed(message)}>
        Dismiss
      </Button>
    </div>
  );
}
