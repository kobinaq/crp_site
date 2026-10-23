"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/admin/Button";
import { CONFIRM_PATH, readFragmentToken } from "@/lib/staff/link";
import { completeStaffSignIn } from "./actions";

export function ConfirmForm() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const read = useRef(false);

  useEffect(() => {
    // Read once: a re-run would find the cleared address and bounce to sign-in.
    if (read.current) return;
    read.current = true;
    const found = readFragmentToken(window.location.hash);
    // Drop the code from the address bar and history straight away.
    window.history.replaceState(null, "", CONFIRM_PATH);
    if (!found) {
      router.replace("/admin/sign-in?error=link");
      return;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the fragment only exists in the browser
    setToken(found);
  }, [router]);

  return (
    <form action={completeStaffSignIn} className="mt-8">
      <input type="hidden" name="token" value={token ?? ""} />
      <Button variant="primary" type="submit" disabled={!token}>Finish signing in</Button>
    </form>
  );
}
