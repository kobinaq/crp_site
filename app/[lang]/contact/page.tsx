import { pageMetadata } from "@/lib/seo";
import { requestLocale } from "@/lib/request-locale";
import { StructuredData } from "@/components/StructuredData";
import type { Metadata } from "next";
import { ContactPage } from "@/components/contact/ContactPage";
import { Footer } from "@/components/Footer";
import { GetInvolved } from "@/components/GetInvolved";
import { GetInvolvedPill } from "@/components/GetInvolvedPill";
import { Header } from "@/components/Header";
import { Sponsors } from "@/components/Sponsors";
import { outfit } from "@/lib/fonts";

export async function generateMetadata(): Promise<Metadata> { return pageMetadata(await requestLocale(), "contact"); }

export default function ContactRoute() {
  return (<>
      <StructuredData page="contact" />
    <div className={`${outfit.className} relative flex flex-1 flex-col`}>
      <Header mobileLogoTone="color" />
      <main className="flex-1">
        <ContactPage />
        <GetInvolved embedded contactMobile />
        {/* Mobile Figma has no sponsors band here (it renders empty); desktop unchanged. */}
        <div className="max-desk:hidden">
          <Sponsors />
        </div>
      </main>
      <Footer pillSpace={false} />
      {/* Mobile Figma has no floating pill on Contact; it covered the EMAIL/PHONE tiles. */}
      <div className="max-desk:hidden">
        <GetInvolvedPill />
      </div>
    </div>
  </>);
}
