import { metadataFor } from "@/lib/seo";
import { StructuredData } from "@/components/StructuredData";
import type { Metadata } from "next";
import { NominatePage } from "@/components/NominatePage";

export async function generateMetadata(): Promise<Metadata> { return metadataFor("nominate"); }

export default function Page() {
  return <><StructuredData page="nominate" /><NominatePage /></>;
}
