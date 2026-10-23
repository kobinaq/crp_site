// The one-time code rides in the URL fragment. Browsers never send the
// fragment to the server, so the code stays out of request logs.
export const CONFIRM_PATH = "/admin/confirm";

export function staffSignInLink(base: string, raw: string): string {
  return `${base}${CONFIRM_PATH}#token=${encodeURIComponent(raw)}`;
}

export function readFragmentToken(hash: string): string {
  const fragment = hash.startsWith("#") ? hash.slice(1) : hash;
  const token = new URLSearchParams(fragment).get("token")?.trim() ?? "";
  return token.length > 0 && token.length <= 512 ? token : "";
}
