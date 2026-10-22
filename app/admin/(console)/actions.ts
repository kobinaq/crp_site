"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { clearStaffCookie } from "@/lib/staff/gate";
import { staffSameOrigin } from "@/lib/staff/origin";

export async function signOut() {
  if (!staffSameOrigin(await headers())) redirect("/admin");
  await clearStaffCookie();
  redirect("/admin/sign-in");
}
