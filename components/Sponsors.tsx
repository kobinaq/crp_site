"use client";

// Partners / sponsors band — logos and ticker hidden temporarily; glow stays.
export function Sponsors() {
  return (
    <section
      id="sponsors"
      data-nav-tone="dark"
      className="relative isolate overflow-hidden bg-ink pb-[160px] pt-16 text-white desk:hidden"
      aria-hidden
    >
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-[26%] -z-10 w-[620px] max-w-none -translate-x-1/2 desk:top-[143px] desk:w-[1051px]"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/images/sponsors-swirl.png" alt="" className="h-auto w-full" />
      </div>
    </section>
  );
}
