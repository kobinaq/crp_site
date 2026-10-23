import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Button } from "@/components/admin/Button";
import { AdminFrame, Wordmark, card } from "@/components/admin/marks";
import { completeStaffSignIn } from "./actions";

export const metadata: Metadata = { title: "Finish signing in" };

export default async function ConfirmPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  if (!token) redirect("/admin/sign-in?error=link");
  return (
    <AdminFrame>
      <main className={`${card} mx-auto max-w-md`}>
        <Wordmark />
        <h1 className="mt-6 text-3xl font-semibold tracking-tight">Finish signing in</h1>
        <p className="mt-2 text-sm leading-6 text-black/70">
          The link in your email has not been used yet. Confirm to open the admin.
        </p>
        <form action={completeStaffSignIn} className="mt-8">
          <input type="hidden" name="token" value={token} />
          <Button variant="primary" type="submit">Finish signing in</Button>
        </form>
      </main>
    </AdminFrame>
  );
}
