"use client";

import { useActionState } from "react";
import { requestStaffLink } from "./actions";
import { Button } from "@/components/admin/Button";
import { ResultLine } from "@/components/admin/ResultLine";
import { field } from "@/components/admin/marks";

export function SignInForm({ expired }: { expired: boolean }) {
  const [state, action, pending] = useActionState(requestStaffLink, null);
  return (
    <form action={action} className="mt-8 grid gap-4">
      <label className="grid gap-2 text-sm font-semibold" htmlFor="email">
        Your email
        <input id="email" name="email" type="email" autoComplete="username" inputMode="email" required autoFocus className={field} />
      </label>
      <Button variant="primary" type="submit" disabled={pending}>
        {pending ? "Sending" : "Email me a sign-in link"}
      </Button>
      <ResultLine
        message={state?.message ?? (expired ? "That link has expired or was already used." : null)}
        tone={state?.message ? "ok" : "warn"}
      />
      {state?.devLink ? <Button href={state.devLink} variant="outline">Open the sign-in link</Button> : null}
    </form>
  );
}
