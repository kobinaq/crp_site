import { card } from "@/components/admin/marks";

export default function AdminLoading() {
  return (
    <div className={card} role="status">
      <p className="text-sm text-black/60">Loading</p>
    </div>
  );
}
