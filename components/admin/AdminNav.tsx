"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { Button } from "@/components/admin/Button";

export function AdminNav({
  email,
  items,
  signOut,
}: {
  email: string;
  items: readonly { readonly href: string; readonly label: string; readonly badge?: number }[];
  signOut: () => Promise<void>;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [openedAt, setOpenedAt] = useState(pathname);
  if (openedAt !== pathname) {
    setOpenedAt(pathname);
    setOpen(false);
  }
  const badge = items.reduce((sum, item) => sum + (item.badge ?? 0), 0);
  return (
    <header className="mb-6 grid gap-3 desk:flex desk:flex-wrap desk:items-center desk:justify-between desk:gap-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.16em]">Climate Refugee Pavilion</p>
          <p className="mt-1 truncate text-sm text-black/60">{email}</p>
        </div>
        <Button
          variant="outline"
          className="desk:hidden"
          aria-expanded={open}
          aria-controls="admin-menu"
          onClick={() => setOpen((value) => !value)}
        >
          {open ? "Close" : "Menu"}
          {!open && badge > 0 ? <span className="rounded-full bg-lime px-2 py-0.5 text-xs text-black">{badge}<span className="sr-only"> new messages</span></span> : null}
        </Button>
      </div>
      <nav
        id="admin-menu"
        className={`${open ? "grid" : "hidden"} gap-1 rounded-3xl border border-black/10 bg-white p-2 desk:flex desk:flex-wrap desk:items-center desk:gap-2 desk:rounded-none desk:border-0 desk:bg-transparent desk:p-0`}
        aria-label="Admin"
      >
        {items.map((item) => {
          const active = item.href === "/admin" ? pathname === "/admin" : pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Button key={item.href} href={item.href} variant={active ? "solid" : "ghost"} aria-current={active ? "page" : undefined} className="justify-start desk:justify-center">
              {item.label}
              {item.badge ? (
                <span className={`rounded-full px-2 py-0.5 text-xs ${active ? "bg-white text-black" : "bg-lime text-black"}`}>
                  {item.badge}
                  <span className="sr-only"> new messages</span>
                </span>
              ) : null}
            </Button>
          );
        })}
        <form action={signOut} className="grid desk:block">
          <Button variant="ghost" type="submit" className="justify-start desk:justify-center">Sign out</Button>
        </form>
      </nav>
    </header>
  );
}
