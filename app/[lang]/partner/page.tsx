import { metadataFor } from "@/lib/seo";
import { StructuredData } from "@/components/StructuredData";
import type { Metadata } from "next";
import { Footer } from "@/components/Footer";
import { GetInvolvedPill } from "@/components/GetInvolvedPill";
import { Header } from "@/components/Header";
import { PartnerPage } from "@/components/partner/PartnerPage";
import { outfit } from "@/lib/fonts";

export async function generateMetadata(): Promise<Metadata> { return metadataFor("partner"); }

export default function PartnerRoute() {
  return (<>
      <StructuredData page="partner" />
    <div className={`${outfit.className} relative flex flex-1 flex-col`}>
      <Header overMedia lightNav />
      <main className="flex-1">
        <PartnerPage />
      </main>
      <Footer />
      <GetInvolvedPill />
    </div>
  </>);
}
