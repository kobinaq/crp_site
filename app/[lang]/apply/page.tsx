import { metadataFor } from "@/lib/seo";
import { StructuredData } from "@/components/StructuredData";
import type { Metadata } from "next";
import { ApplyPage } from "@/components/ApplyPage";

export async function generateMetadata(): Promise<Metadata> { return metadataFor("apply"); }

export default function Page() {
  return <><StructuredData page="apply" /><ApplyPage /></>;
}
