import { randomUUID } from "crypto";
import { notFound } from "next/navigation";
import { DeskView } from "@/components/admin/DeskView";
import { loadDetail } from "@/lib/desk/case";
import { getDb } from "@/lib/db";
import { requireStaff } from "@/lib/staff/gate";
import { addNominationNote, assignNomination, moveNomination } from "./actions";

export default async function NominationDeskPage({ params }: { params: Promise<{ id: string }> }) {
  const staff = await requireStaff("nominations.read");
  const { id } = await params;
  const detail = await loadDetail(getDb(), staff, "nomination", id);
  if (!detail) notFound();
  return (
    <DeskView
      detail={detail}
      noteId={randomUUID()}
      noteAction={addNominationNote}
      moveAction={moveNomination}
      assignAction={assignNomination}
    />
  );
}
