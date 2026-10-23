import assert from "node:assert/strict";
import test from "node:test";
import { installDom } from "./dom.mjs";
import { loader } from "./helpers.mjs";

installDom();
const React = await import("react");
const { createRoot } = await import("react-dom/client");
const { act } = React;

const navigations = [];
const redirects = [];
const load = loader({
  "next/navigation": {
    __esModule: true,
    redirect(to) {
      redirects.push(to);
      throw new Error("NEXT_REDIRECT");
    },
    useRouter() {
      return { refresh() {}, push() {}, replace(to) { navigations.push(to); } };
    },
  },
  "@/app/admin/confirm/actions": { async completeStaffSignIn() {} },
  "./actions": { async completeStaffSignIn() {} },
});

async function mount(hash) {
  window.history.replaceState(null, "", `/admin/confirm${hash}`);
  const { ConfirmForm } = load("app/admin/confirm/form.tsx");
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => { root.render(React.createElement(ConfirmForm)); });
  return { host, async unmount() { await act(async () => root.unmount()); host.remove(); } };
}

test("sign-in and invite links put the code after #, never in the path or query", () => {
  const { staffSignInLink, readFragmentToken } = load("lib/staff/link.ts");
  const link = staffSignInLink("https://pavilion.example", "abc_def-XYZ");
  assert.equal(link, "https://pavilion.example/admin/confirm#token=abc_def-XYZ");
  const url = new URL(link);
  assert.equal(url.pathname, "/admin/confirm");
  assert.equal(url.search, "");
  assert.equal(readFragmentToken(url.hash), "abc_def-XYZ");
  assert.equal(readFragmentToken(""), "");
  assert.equal(readFragmentToken("#other=1"), "");
  assert.equal(readFragmentToken(`#token=${"a".repeat(600)}`), "");
});

test("the confirm page reads the code from the fragment, clears the address, and posts it", async () => {
  navigations.length = 0;
  const page = await mount("#token=abc_def-XYZ");
  try {
    assert.equal(window.location.hash, "");
    assert.equal(window.location.pathname, "/admin/confirm");
    assert.equal(window.location.href.includes("abc_def-XYZ"), false);
    const input = page.host.querySelector('input[name="token"]');
    assert.equal(input.type, "hidden");
    assert.equal(input.value, "abc_def-XYZ");
    assert.equal(page.host.querySelector("button").disabled, false);
    assert.deepEqual(navigations, []);
  } finally {
    await page.unmount();
  }
});

test("the confirm page without a code sends staff back to sign in", async () => {
  navigations.length = 0;
  const page = await mount("");
  try {
    assert.deepEqual(navigations, ["/admin/sign-in?error=link"]);
    assert.equal(page.host.querySelector('input[name="token"]').value, "");
    assert.equal(page.host.querySelector("button").disabled, true);
  } finally {
    await page.unmount();
  }
});

test("an old ?token= link is refused without echoing the code", async () => {
  const { default: ConfirmPage } = load("app/admin/confirm/page.tsx");
  redirects.length = 0;
  await assert.rejects(ConfirmPage({ searchParams: Promise.resolve({ token: "old-code" }) }), /NEXT_REDIRECT/);
  assert.deepEqual(redirects, ["/admin/sign-in?error=link"]);
  assert.equal(redirects[0].includes("old-code"), false);
  const rendered = await ConfirmPage({ searchParams: Promise.resolve({}) });
  assert.equal(JSON.stringify(rendered).includes("token="), false);
});

test("the confirm page sends no referrer and is never cached", () => {
  const { proxy } = load("proxy.ts");
  const { metadata } = load("app/admin/confirm/page.tsx");
  assert.equal(metadata.referrer, "no-referrer");
  const { NextRequest } = load("node_modules/next/server.js");
  const response = proxy(new NextRequest("https://pavilion.example/admin/confirm"));
  assert.equal(response.headers.get("referrer-policy"), "no-referrer");
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  const other = proxy(new NextRequest("https://pavilion.example/admin/sign-in"));
  assert.equal(other.headers.get("referrer-policy"), null);
});
