import { metadataFor } from "@/lib/seo";
import { StructuredData } from "@/components/StructuredData";
import type { Metadata } from "next";
import { AboutPage } from "@/components/about/AboutPage";
import { AboutTicker } from "@/components/about/AboutTicker";
import { Footer } from "@/components/Footer";
import { GetInvolved } from "@/components/GetInvolved";
import { GetInvolvedPill } from "@/components/GetInvolvedPill";
import { Header } from "@/components/Header";
import { outfit } from "@/lib/fonts";

export async function generateMetadata(): Promise<Metadata> { return metadataFor("about"); }

export default function AboutRoute() {
  return (<>
      <StructuredData page="about" />
    <div className={`${outfit.className} relative flex flex-1 flex-col`}>
      <Header overMedia />
      <main className="flex-1">
        <AboutPage />
        <GetInvolved embedded compactMobile />
        {/* Mobile: Figma slogan ticker sits between Get involved and the footer arc. */}
        <AboutTicker />
        <div aria-hidden className="hidden h-16 bg-cream desk:block desk:h-24" />
      </main>
      <Footer />
      {/* Figma mobile has no floating Get involved pill. */}
      <div className="hidden desk:block">
        <GetInvolvedPill />
      </div>
    </div>
  </>);
}
