import { redirect } from "next/navigation";
import { AdminFrame, Wordmark, card, pill } from "@/components/admin/marks";
import { completeStaffSignIn } from "./actions";

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
          <button className={pill} type="submit">Finish signing in</button>
        </form>
      </main>
    </AdminFrame>
  );
}
