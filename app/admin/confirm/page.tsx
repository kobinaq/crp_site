import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AdminFrame, AuthCard } from "@/components/admin/marks";
import { ConfirmForm } from "./form";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Finish signing in", referrer: "no-referrer" };

// Links now carry the code after "#". Older "?token=" links (15 minutes at
// most) are not honoured, so the code is never echoed back into a page or URL.
export default async function ConfirmPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  if (params.token !== undefined) redirect("/admin/sign-in?error=link");
  return (
    <AdminFrame>
      <AuthCard title="Finish signing in">
        <ConfirmForm />
      </AuthCard>
    </AdminFrame>
  );
}
