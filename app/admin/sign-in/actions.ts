"use server";

import { headers } from "next/headers";
import { appUrl } from "@/lib/config";
import { deliverEmail } from "@/lib/email";
import { staffSignInEmail } from "@/lib/emails";
import { getDb } from "@/lib/db";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { issueSignInLink } from "@/lib/staff/auth";
import { staffSameOrigin } from "@/lib/staff/origin";
import { parseEmail } from "@/lib/staff/users";
import { staffSignInLink } from "@/lib/staff/link";

const SENT = "If this address can sign in, a link is on its way.";

export async function requestStaffLink(_previous: { message: string; devLink?: string } | null, formData: FormData) {
  const headerList = await headers();
  if (!staffSameOrigin(headerList)) return { message: SENT };
  const email = parseEmail(String(formData.get("email") ?? ""));
  if (!email) return { message: "Enter your email address." };
  const ip = clientIp(headerList);
  const allowed = (await rateLimit("staff-signin:ip", ip, 20, 3600)) && (await rateLimit("staff-signin:email", email, 5, 3600));
  if (!allowed) return { message: SENT };
  const issued = await issueSignInLink(getDb(), email);
  if (!issued) return { message: SENT };
  const link = staffSignInLink(appUrl(), issued.raw);
  const mail = staffSignInEmail(link, null);
  const sent = await deliverEmail({ to: email, subject: mail.subject, html: mail.html }, issued.hash);
  if (!sent.ok) return { message: SENT };
  if (sent.skipped && process.env.NODE_ENV !== "production") return { message: SENT, devLink: link };
  return { message: SENT };
}
