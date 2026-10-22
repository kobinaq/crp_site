import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const NAMES = ["waitlistEmail", "interestEmail", "nominationEmail", "partnerEmail", "applicationEmail", "resumeEmail", "identityEmail", "identityRetryEmail", "decisionEmail"];

function files(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return files(full);
    return full.endsWith(".ts") || full.endsWith(".tsx") ? [full] : [];
  });
}

test("email templates outside the switch-online route receive copy sources", () => {
  const calls = [];
  for (const file of [...files("lib"), ...files("app")]) {
    if (file.endsWith(`${path.sep}lib${path.sep}emails.ts`)) continue;
    const text = readFileSync(file, "utf8");
    for (const name of NAMES) {
      const pattern = new RegExp(`${name}\\(`, "g");
      if (pattern.test(text) && !text.includes("sources")) calls.push(`${file} ${name}`);
    }
    if (file.endsWith(`${path.sep}switch-online${path.sep}route.ts`)) {
      assert.match(text, /receivedEmail\(/);
      assert.doesNotMatch(text, /receivedEmail\([^)]*sources/);
    }
  }
  assert.deepEqual(calls, []);
});
