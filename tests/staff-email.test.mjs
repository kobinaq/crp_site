import assert from "node:assert/strict";
import test from "node:test";
import { loader } from "./helpers.mjs";

const load = loader();
const { staffSignInEmail } = load("lib/emails.ts");
const { staffLinkHtml } = load("lib/staff/auth.ts");
const { applicationEmail } = load("lib/emails.ts");
const { JSON_EMAILS } = load("lib/copy/sources.ts");

const LINK = "https://pavilion.example/admin/confirm#token=abc_def-XYZ";

function shellMarks(html) {
  return {
    logo: html.includes("email-logo.png"),
    banner: html.includes("email-banner-desktop.png"),
    swirl: html.includes("email-footer-swirl.png"),
    button: html.includes('class="btn-link"'),
  };
}

function expiryCount(html) {
  return html.match(/15 minutes/g)?.length ?? 0;
}

test("the staff sign-in email uses the applicant shell, one expiry, and a plain link", () => {
  const mail = staffSignInEmail(LINK, null);
  const applicant = applicationEmail("Ada", "https://example.invalid/go", "en", JSON_EMAILS);
  assert.equal(mail.subject, "Sign in to Climate Refugee Pavilion");
  assert.deepEqual(shellMarks(mail.html), shellMarks(applicant.html));
  assert.equal(shellMarks(mail.html).button, true);
  assert.match(mail.html, /<html lang="en"/);
  assert.ok(mail.html.includes(`href="${LINK}"`));
  assert.ok(mail.html.includes(LINK));
  assert.equal(expiryCount(mail.html), 1);
  assert.match(mail.html, /This link works once and expires in 15 minutes/);
  assert.match(mail.html, /Didn't request this\? Ignore this email/);
  assert.match(mail.html, />Sign in</);
  assert.doesNotMatch(mail.html, /invited/);
  assert.doesNotMatch(mail.html, /Finish signing in/);
  assert.equal(staffLinkHtml(LINK, null), mail.html);
});

test("the staff invite email uses the same shell and names the role", () => {
  const mail = staffSignInEmail(LINK, "editor");
  assert.equal(mail.subject, "You're invited to Climate Refugee Pavilion");
  assert.equal(shellMarks(mail.html).logo, true);
  assert.equal(shellMarks(mail.html).banner, true);
  assert.equal(shellMarks(mail.html).swirl, true);
  assert.equal(shellMarks(mail.html).button, true);
  assert.match(mail.html, /You are invited as Editor/);
  assert.doesNotMatch(mail.html, /invited as editor/);
  assert.equal(expiryCount(mail.html), 1);
  assert.match(mail.html, /Didn't request this\? Ignore this email/);
  assert.ok(mail.html.includes(LINK));
  assert.ok(mail.html.includes(`href="${LINK}"`));
  assert.equal(staffLinkHtml(LINK, "editor"), mail.html);
  assert.match(staffSignInEmail(LINK, "admin").html, /You are invited as Admin/);
  assert.match(staffSignInEmail(LINK, "reviewer").html, /You are invited as Reviewer/);
});
