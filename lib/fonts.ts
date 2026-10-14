import { Geist, Outfit } from "next/font/google";
import localFont from "next/font/local";

export const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

// Footer mobile (Figma): links and copyright are set in Geist.
export const geist = Geist({
  variable: "--font-geist",
  subsets: ["latin"],
  weight: ["400"],
  display: "swap",
  preload: false,
});

export const trail = localFont({
  src: "../public/TrailFree-p7ARD.otf",
  display: "swap",
  adjustFontFallback: "Times New Roman",
  // Only used below the fold, so skip the preload and its unused-preload warning.
  preload: false,
});
