"use client";

import { useActionState } from "react";
import { requestStaffLink } from "./actions";
import { field, pill } from "@/components/admin/marks";

export function SignInForm({ expired }: { expired: boolean }) {
  const [state, action, pending] = useActionState(requestStaffLink, null);
  return (
    <form action={action} className="mt-8 grid gap-4">
      <label className="grid gap-2 text-sm font-semibold" htmlFor="email">
        Email
        <input id="email" name="email" type="email" autoComplete="username" required className={field} />
      </label>
      <button className={pill} type="submit" disabled={pending}>
        {pending ? "Sending" : "Send link"}
      </button>
      {expired ? <p className="text-sm font-semibold text-magenta">That link has expired or was already used.</p> : null}
      {state ? <p className="text-sm">{state.message}</p> : null}
      {state?.devLink ? (
        <p className="text-sm">
          <a className="font-semibold underline" href={state.devLink}>
            Open the sign-in link
          </a>
        </p>
      ) : null}
    </form>
  );
}
