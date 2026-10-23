import Link from "next/link";

// One pattern for every clickable list row: the row is the target, the name stays plain text.
// Put RowLink in the first cell; it covers the row, so other cells need `relative z-0` content
// and real controls (checkboxes) need `relative z-20` to stay clickable without navigating.
export const linkedRowClass = "relative cursor-pointer hover:bg-black/[0.03] focus-within:bg-black/[0.03]";

export function RowLink({ href, name }: { href: string; name: string }) {
  return (
    <Link href={href} aria-label={`Open ${name}`} className="absolute inset-0 z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-black">
      <span className="sr-only">{`Open ${name}`}</span>
    </Link>
  );
}
