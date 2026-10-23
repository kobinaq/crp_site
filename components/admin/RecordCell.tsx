import type { ReactNode } from "react";
import { When } from "@/components/admin/When";
import { ageLabel, languageLabel, trackLabel, waitlistLabel } from "@/lib/admin/labels";

export function RecordCell({ list, header, value }: { list: string; header: string; value: string }): ReactNode {
  if (!value) return value;
  if (header === "Track") return trackLabel(value);
  if (header === "Language") return languageLabel(value);
  if (header === "Age") return ageLabel(value);
  if (header === "Review round") return value === "0" ? "—" : value;
  if (header === "Status" && list === "waitlist") return waitlistLabel(value);
  if (header === "Received") return <When stamp={value} />;
  return value;
}
