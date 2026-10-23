import { randomUUID } from "crypto";
import { notFound } from "next/navigation";
import { DeskView } from "@/components/admin/DeskView";
import { loadDetail } from "@/lib/desk/case";
import { getDb } from "@/lib/db";
import { requireStaff } from "@/lib/staff/gate";
import { addPartnerNote, assignPartner, movePartner } from "./actions";

export default async function PartnerDeskPage({ params }: { params: Promise<{ id: string }> }) {
  const staff = await requireStaff("partners.read");
  const { id } = await params;
  const detail = await loadDetail(getDb(), staff, "partner", id);
  if (!detail) notFound();
  return (
    <DeskView
      detail={detail}
      noteId={randomUUID()}
      noteAction={addPartnerNote}
      moveAction={movePartner}
      assignAction={assignPartner}
    />
  );
}
