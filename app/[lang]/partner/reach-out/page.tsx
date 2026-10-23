import type { Metadata } from "next";
import { Suspense } from "react";
import { PartnerReachPage } from "@/components/partner/PartnerReachPage";
import { outfit } from "@/lib/fonts";
import { siteCopy } from "@/lib/copy/read";
import { requestLocale } from "@/lib/request-locale";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await requestLocale();
  const { messages } = await siteCopy(locale);
  return { title: `${messages.partnerPage.reachOutForm.title} — Climate Refugee Pavilion`, robots: { index: false, follow: false } };
}

export default function PartnerReachRoute() {
  return (
    <div className={`${outfit.className} flex flex-1 flex-col`}>
      <Suspense>
        <PartnerReachPage />
      </Suspense>
    </div>
  );
}
