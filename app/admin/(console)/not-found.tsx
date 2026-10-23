import { Button } from "@/components/admin/Button";
import { card } from "@/components/admin/marks";

export default function AdminNotFound() {
  return (
    <div className={card} role="alert">
      <h1 className="text-xl font-semibold">That record is not here</h1>
      <p className="mt-2 max-w-xl text-sm leading-6 text-black/70">The address may be wrong, or the record is no longer on file. The rest of the admin is still available.</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button href="/admin/records" variant="solid">Records</Button>
        <Button href="/admin" variant="outline">Dashboard</Button>
      </div>
    </div>
  );
}
