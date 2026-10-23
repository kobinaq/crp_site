"use client";

import { Button } from "@/components/admin/Button";
import { card } from "@/components/admin/marks";

export default function AdminError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className={card} role="alert">
      <h1 className="text-xl font-semibold">This page did not load</h1>
      <p className="mt-2 max-w-xl text-sm leading-6 text-black/70">The rest of the admin is still available. Try this page again.</p>
      <Button className="mt-4" variant="outline" type="button" onClick={() => reset()}>Try again</Button>
    </div>
  );
}
