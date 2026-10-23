import { relativeWhen } from "@/lib/admin/time";

export function When({ stamp }: { stamp: string }) {
  const shown = relativeWhen(stamp);
  if (!shown) return <>{stamp}</>;
  return (
    <time dateTime={`${stamp.replace(" ", "T")}:00Z`} title={shown.title}>
      {shown.label}
    </time>
  );
}
