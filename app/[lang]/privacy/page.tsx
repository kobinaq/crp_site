import { metadataFor } from "@/lib/seo";
import { StructuredData } from "@/components/StructuredData";
import type { Metadata } from "next";
import { Footer } from "@/components/Footer";
import { GetInvolvedPill } from "@/components/GetInvolvedPill";
import { Header } from "@/components/Header";
import { PrivacyPage } from "@/components/privacy/PrivacyPage";
import { outfit } from "@/lib/fonts";

export async function generateMetadata(): Promise<Metadata> {
  return metadataFor("privacy");
}

export default function PrivacyRoute() {
  return (
    <>
      <StructuredData page="privacy" />
      <div className={`${outfit.className} relative flex flex-1 flex-col`}>
        <Header />
        <main className="flex-1">
          <PrivacyPage />
        </main>
        <Footer />
        <GetInvolvedPill />
      </div>
    </>
  );
}
