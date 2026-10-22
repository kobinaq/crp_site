import type { Metadata } from "next";
import { metadataFor } from "@/lib/seo";
import { StructuredData } from "@/components/StructuredData";
import { ContentGrid } from "@/components/ContentGrid";
import { Footer } from "@/components/Footer";
import { GetInvolved } from "@/components/GetInvolved";
import { GetInvolvedPill } from "@/components/GetInvolvedPill";
import { Header } from "@/components/Header";
import { Hero } from "@/components/Hero";
import { HeroExtension } from "@/components/HeroExtension";
import { PavilionPanel } from "@/components/PavilionPanel";
import { PrefetchGlobe } from "@/components/PrefetchGlobe";
import { PlatformSection } from "@/components/PlatformSection";
import { Sponsors } from "@/components/Sponsors";
import { AboutTicker } from "@/components/about/AboutTicker";
import { Waitlist } from "@/components/Waitlist";

export async function generateMetadata(): Promise<Metadata> { return metadataFor("home"); }

export default function Home() {
  return (<>
      <StructuredData page="home" />
    <div className="relative flex flex-1 flex-col">
      <Header overMedia />
      <main className="flex-1">
        <Hero />
        <HeroExtension />
        <PavilionPanel />
        <PlatformSection />
        <ContentGrid />
        <GetInvolved compactMobile />
        <Waitlist />
        {/* Figma slogan ticker (shared with About); partners band stays hidden. */}
        <AboutTicker desktop className="pt-16 desk:pb-[160px] desk:pt-0" />
        <Sponsors />
      </main>
      <Footer />
      {/* Figma mobile has no floating Get involved pill. */}
      <div className="hidden desk:block">
        <GetInvolvedPill />
      </div>
      <PrefetchGlobe />
    </div>
  </>);
}
