import { exportList, parseRecordQuery } from "@/lib/admin/records";
import { getDb } from "@/lib/db";
import { assertStaffAction } from "@/lib/staff/gate";

function field(form: FormData, name: string): string {
  return String(form.get(name) ?? "");
}

export async function POST(request: Request): Promise<Response> {
  const staff = await assertStaffAction("records.export");
  if (!staff) return new Response("Forbidden", { status: 403 });
  const form = await request.formData();
  const file = await exportList(getDb(), staff, parseRecordQuery({
    list: field(form, "list"),
    q: field(form, "q"),
    status: field(form, "status"),
    track: field(form, "track"),
    language: field(form, "language"),
    cycle: field(form, "cycle"),
    age: field(form, "age"),
    queue: field(form, "queue"),
    attention: field(form, "attention"),
  }));
  if (!file) return new Response("Forbidden", { status: 403 });
  return new Response(file.body, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${file.filename}"`,
      "cache-control": "no-store",
    },
  });
}
