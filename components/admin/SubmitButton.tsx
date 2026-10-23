"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { buttonClass, type ButtonVariant } from "@/components/admin/Button";

export function SubmitButton({
  className,
  children,
  pendingLabel,
  name,
  value,
}: {
  className?: string;
  children: string;
  pendingLabel: string;
  name?: string;
  value?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button className={className} type="submit" name={name} value={value} disabled={pending}>
      {pending ? pendingLabel : children}
    </button>
  );
}

export function ConfirmSubmit({
  className,
  children,
  pendingLabel,
  name,
  value,
  title,
  message,
  confirmLabel,
  confirmVariant = "primary",
}: {
  className?: string;
  children: string;
  pendingLabel: string;
  name?: string;
  value?: string;
  title: string;
  message: string;
  confirmLabel: string;
  confirmVariant?: ButtonVariant;
}) {
  const { pending } = useFormStatus();
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const bodyId = useId();

  useEffect(() => {
    if (!open) return;
    cancelRef.current?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpen(false);
      buttonRef.current?.focus();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        ref={buttonRef}
        className={className}
        type="submit"
        name={name}
        value={value}
        disabled={pending}
        onClick={(event) => {
          if (buttonRef.current?.dataset.confirmed === "yes") {
            delete buttonRef.current.dataset.confirmed;
            return;
          }
          event.preventDefault();
          setOpen(true);
        }}
      >
        {pending ? pendingLabel : children}
      </button>
      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div role="alertdialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={bodyId} className="w-full max-w-md rounded-[32px] bg-white p-6">
            <h2 id={titleId} className="text-lg font-semibold">{title}</h2>
            <p id={bodyId} className="mt-2 text-sm leading-6 text-black/70">{message}</p>
            <div className="mt-5 flex flex-wrap gap-2">
              <button ref={cancelRef} type="button" className={buttonClass("outline")} onClick={() => { setOpen(false); buttonRef.current?.focus(); }}>Cancel</button>
              <button
                type="button"
                className={buttonClass(confirmVariant)}
                onClick={() => {
                  if (buttonRef.current) buttonRef.current.dataset.confirmed = "yes";
                  setOpen(false);
                  buttonRef.current?.click();
                }}
              >
                {confirmLabel}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
