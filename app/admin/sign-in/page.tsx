import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AdminFrame, AuthCard } from "@/components/admin/marks";
import { currentStaff } from "@/lib/staff/gate";
import { SignInForm } from "./form";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await currentStaff()) redirect("/admin");
  const params = await searchParams;
  return (
    <AdminFrame>
      <AuthCard title="Staff sign in">
        <SignInForm expired={params.error === "link"} />
      </AuthCard>
    </AdminFrame>
  );
}
