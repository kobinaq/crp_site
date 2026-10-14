import { pageMetadata } from "@/lib/seo";
import { requestLocale } from "@/lib/request-locale";
import { StructuredData } from "@/components/StructuredData";
import type { Metadata } from "next";
import { Footer } from "@/components/Footer";
import { ProgramAbout } from "@/components/programs/ProgramAbout";
import { ProgramApplicationBand } from "@/components/programs/ProgramApplicationBand";
import { ProgramApplyBar } from "@/components/programs/ProgramApplyBar";
import { ProgramFaq } from "@/components/programs/ProgramFaq";
import { ProgramHero } from "@/components/programs/ProgramHero";
import { ProgramResonate } from "@/components/programs/ProgramResonate";
import { ProgramTestimonials } from "@/components/programs/ProgramTestimonials";
import { ProgramWhatYouGet } from "@/components/programs/ProgramWhatYouGet";
import { outfit } from "@/lib/fonts";

export async function generateMetadata(): Promise<Metadata> { return pageMetadata(await requestLocale(), "programs"); }

export default async function ProgramsPage({
  searchParams,
}: {
  searchParams: Promise<{ intent?: string | string[] }>;
}) {
  const { intent } = await searchParams;
  const mode = intent === "nominate" ? "nominate" : "apply";

  return (<>
      <StructuredData page="programs" />
    <div className={`${outfit.className} relative flex flex-1 flex-col bg-cream`}>
      <main className="flex-1">
        <ProgramHero />

        {/* Centered 632px content column (632 + 2×24 gutter); Figma 2308:6448 uses 64px desktop rhythm. */}
        <div className="mx-auto flex max-w-[680px] flex-col gap-8 px-0 pt-8 desk:gap-16 desk:px-6 desk:pt-16">
          <ProgramAbout />
          <ProgramResonate />
          <ProgramWhatYouGet />
        </div>

        {/* Team cards bleed past the content column, matching Figma. */}
        <div className="pt-16 desk:pt-16">
          <ProgramTestimonials />
        </div>

        <div className="pt-20 desk:pt-16">
          <ProgramApplicationBand />
        </div>

        <ProgramFaq />
      </main>

      <Footer />
      {/* Reserve space so the fixed Apply bar never covers footer content */}
      <div className="h-[110px]" aria-hidden />

      <ProgramApplyBar mode={mode} />
    </div>
  </>);
}
