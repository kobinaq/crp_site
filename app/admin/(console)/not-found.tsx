import { Button } from "@/components/admin/Button";
import { card } from "@/components/admin/marks";

export default function AdminNotFound() {
  return (
    <div className={card} role="alert">
      <h1 className="text-xl font-semibold">That record is not here</h1>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button href="/admin/records" variant="solid">Records</Button>
        <Button href="/admin" variant="outline">Dashboard</Button>
      </div>
    </div>
  );
}
