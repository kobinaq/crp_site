import { pageMetadata } from "@/lib/seo";
import { requestLocale } from "@/lib/request-locale";
import { StructuredData } from "@/components/StructuredData";
import type { Metadata } from "next";
import { Footer } from "@/components/Footer";
import { GetInvolvedPill } from "@/components/GetInvolvedPill";
import { Header } from "@/components/Header";
import { PartnerPage } from "@/components/partner/PartnerPage";
import { outfit } from "@/lib/fonts";

export async function generateMetadata(): Promise<Metadata> { return pageMetadata(await requestLocale(), "partner"); }

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
