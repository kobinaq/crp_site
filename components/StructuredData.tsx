import { siteCopy } from "@/lib/copy/read";
import { structuredData, type PageKey } from "@/lib/seo";
import { requestLocale } from "@/lib/request-locale";
export async function StructuredData({ page }: { page: PageKey }) {
  const locale = await requestLocale();
  const { messages } = await siteCopy(locale);
  const data = structuredData({ locale, messages }, page);
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }} />;
}
