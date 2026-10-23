"use client";

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
  return (
    <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.16em]">Climate Refugee Pavilion</p>
        <p className="mt-1 text-sm text-black/60">{email}</p>
      </div>
      <nav className="flex flex-wrap items-center gap-2" aria-label="Admin">
        {items.map((item) => {
          const active = item.href === "/admin" ? pathname === "/admin" : pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Button key={item.href} href={item.href} variant={active ? "solid" : "ghost"} aria-current={active ? "page" : undefined}>
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
        <form action={signOut}>
          <Button variant="ghost" type="submit">Sign out</Button>
        </form>
      </nav>
    </header>
  );
}
