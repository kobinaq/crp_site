"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { redeemSignInLink } from "@/lib/staff/auth";
import { setStaffCookie } from "@/lib/staff/gate";
import { staffSameOrigin } from "@/lib/staff/origin";

export async function completeStaffSignIn(formData: FormData) {
  if (!staffSameOrigin(await headers())) redirect("/admin/sign-in?error=link");
  const session = await redeemSignInLink(getDb(), String(formData.get("token") ?? ""));
  if (!session) redirect("/admin/sign-in?error=link");
  await setStaffCookie(session.session);
  redirect("/admin");
}
