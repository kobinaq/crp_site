import type { CatalogId } from "@/lib/copy/catalog";
import { isLocale, localePath } from "@/lib/locale";
import type { Messages } from "@/lib/messages";

const SECTION_PATH = {
  nav: "/",
  hero: "/",
  heroExtension: "/",
  pavilion: "/",
  platform: "/",
  content: "/",
  involved: "/",
  waitlist: "/",
  sponsors: "/",
  footer: "/",
  aboutUs: "/about",
  programs: "/programs",
  partnerPage: "/partner",
  contactPage: "/contact",
  apply: "/apply",
  nominateLanding: "/nominate",
  privacyPage: "/privacy",
} as const;

const UNROUTED = ["a11y", "meta"] as const satisfies readonly (keyof Messages)[];

type Covered = keyof typeof SECTION_PATH | (typeof UNROUTED)[number];
type Gap = Exclude<keyof Messages, Covered>;

function assertRouted(gap: Gap extends never ? true : Gap): void {
  if (gap !== true) throw new Error("A page section has no preview route.");
}

assertRouted(true);

function pathFor(section: string): string | null {
  if (UNROUTED.some((item) => item === section)) return null;
  for (const [key, path] of Object.entries(SECTION_PATH)) {
    if (key === section) return path;
  }
  return null;
}

export function previewPath(catalog: CatalogId, section: string, locale: string): string | null {
  if (catalog !== "page" || !isLocale(locale)) return null;
  const path = pathFor(section);
  return path ? localePath(path, locale) : null;
}
