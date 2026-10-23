import { NextResponse, type NextRequest } from "next/server";
import { defaultLocale, isLocale, localePath, publicPaths, parseLocale, LOCALE_COOKIE } from "@/lib/locale";
export function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname.replace(/\/$/, "") || "/";
  const first = pathname.split("/")[1];
  const localized = isLocale(first);
  const path = localized ? pathname.slice(first.length + 1) || "/" : pathname;
  const isPublic = (publicPaths as readonly string[]).includes(path);
  const headers = new Headers(request.headers);
  headers.set("x-site-path", isPublic ? path : "/");
  headers.set("x-site-locale", localized ? first : isPublic ? defaultLocale : parseLocale(request.cookies.get(LOCALE_COOKIE)?.value));
  if (!localized && isPublic && ["GET", "HEAD"].includes(request.method)) {
    const destination = request.nextUrl.clone();
    destination.pathname = localePath(path, defaultLocale);
    return NextResponse.redirect(destination, 308);
  }
  const response = NextResponse.next({ request: { headers } });
  response.headers.set("Content-Language", headers.get("x-site-locale")!);
  if (!isPublic) response.headers.set("X-Robots-Tag", "noindex, nofollow");
  if (pathname === "/admin/confirm") {
    response.headers.set("Referrer-Policy", "no-referrer");
    response.headers.set("Cache-Control", "private, no-store");
  }
  return response;
}
export const config = { matcher: ["/((?!api(?:/|$)|_next/|.*\\.).*)"] };
