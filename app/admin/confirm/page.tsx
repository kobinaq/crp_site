import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Button } from "@/components/admin/Button";
import { AdminFrame, AuthCard } from "@/components/admin/marks";
import { completeStaffSignIn } from "./actions";

export const metadata: Metadata = { title: "Finish signing in" };

export default async function ConfirmPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  if (!token) redirect("/admin/sign-in?error=link");
  return (
    <AdminFrame>
      <AuthCard title="Finish signing in">
        <form action={completeStaffSignIn} className="mt-8">
          <input type="hidden" name="token" value={token} />
          <Button variant="primary" type="submit">Finish signing in</Button>
        </form>
      </AuthCard>
    </AdminFrame>
  );
}
