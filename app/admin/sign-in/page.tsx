import { redirect } from "next/navigation";
import { AdminFrame, Wordmark, card } from "@/components/admin/marks";
import { currentStaff } from "@/lib/staff/gate";
import { SignInForm } from "./form";

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await currentStaff()) redirect("/admin");
  const params = await searchParams;
  return (
    <AdminFrame>
      <main className={`${card} mx-auto max-w-md`}>
        <Wordmark />
        <h1 className="mt-6 text-3xl font-semibold tracking-tight">Admin sign in</h1>
        <p className="mt-2 text-sm leading-6 text-black/70">
          Use the email address on the admin list. We will send a link that works once.
        </p>
        <SignInForm expired={params.error === "link"} />
      </main>
    </AdminFrame>
  );
}
