"use client";

import { useState } from "react";
import { Button, buttonClass } from "@/components/admin/Button";

export function EmailLine({ email }: { email: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  if (!email) return <span>Not given</span>;
  return (
    <span className="inline-flex max-w-full flex-wrap items-center gap-2">
      <span className="font-semibold break-all">{email}</span>
      <a className={buttonClass("outline", "sm")} href={`mailto:${email}`}>Email</a>
      <Button
        variant="ghost"
        size="sm"
        type="button"
        aria-label={`Copy ${email}`}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(email);
            setState("copied");
          } catch {
            setState("failed");
          }
        }}
      >
        {state === "copied" ? "Copied" : state === "failed" ? "Copy failed" : "Copy"}
      </Button>
    </span>
  );
}
