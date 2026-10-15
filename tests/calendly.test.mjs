import assert from "node:assert/strict";
import test from "node:test";
import { loader } from "./helpers.mjs";

const CALENDLY = ["CALENDLY_ENABLED", "CALENDLY_URL_EN", "CALENDLY_URL_FR", "CALENDLY_URL_ES", "CALENDLY_WEBHOOK_SIGNING_KEY"];

async function withEnv(values, fn) {
  const keys = Object.keys(values);
  const before = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
  for (const k of keys) { if (values[k] === undefined) delete process.env[k]; else process.env[k] = values[k]; }
  try { return await fn(); } finally {
    for (const k of keys) { if (before[k] === undefined) delete process.env[k]; else process.env[k] = before[k]; }
  }
}
const unset = Object.fromEntries(CALENDLY.map((k) => [k, undefined]));
const urls = { CALENDLY_URL_EN: "https://calendly.invalid/en", CALENDLY_URL_FR: "https://calendly.invalid/fr", CALENDLY_URL_ES: "https://calendly.invalid/es" };

test("production config no longer requires Calendly", () => withEnv({
  ...unset,
  NODE_ENV: "production",
  DATABASE_URL: "postgres://x", APP_URL: "https://example.invalid", RESEND_API_KEY: "x", RESEND_FROM: "x",
  APP_SECRET: "a".repeat(32), CRON_SECRET: "b".repeat(32), SYNC_API_SECRET: "c".repeat(32),
  OPERATIONS_TOKENS: JSON.stringify([{ id: "op", tokenHash: "d".repeat(64) }]),
  TURNSTILE_SECRET_KEY: "x", NEXT_PUBLIC_TURNSTILE_SITE_KEY: "x", VIDEOASK_WEBHOOK_SECRET: "x",
  VIDEOASK_FORM_URL: "https://videoask.invalid/f", VIDEOASK_FORM_ID: "x", DIDIT_API_KEY: "x", DIDIT_WORKFLOW_ID: "x",
  DIDIT_WEBHOOK_SECRET: "x", RESEND_WEBHOOK_SECRET: "x", BLOB_READ_WRITE_TOKEN: "x", IDENTITY_PROVIDER: undefined,
}, () => {
  assert.doesNotThrow(() => loader()("lib/config.ts").assertBackendConfig());
}));

test("the Calendly flag needs every locale URL and can be switched off", () => withEnv(unset, async () => {
  const load = () => loader()("lib/calendly.ts");
  assert.equal(load().calendlyEnabled(), false);
  await withEnv({ ...urls }, async () => {
    assert.equal(load().calendlyEnabled(), true);
    assert.equal(load().calendlyWebhookEnabled(), false);
    await withEnv({ CALENDLY_WEBHOOK_SIGNING_KEY: "k" }, () => assert.equal(load().calendlyWebhookEnabled(), true));
    await withEnv({ CALENDLY_ENABLED: "false" }, () => {
      assert.equal(load().calendlyEnabled(), false);
      assert.equal(load().calendlyLink({ id: "11111111-1111-4111-8111-111111111111", fullName: "A", email: "a@example.invalid", language: "en" }), null);
    });
  });
  await withEnv({ CALENDLY_URL_EN: urls.CALENDLY_URL_EN }, () => assert.equal(load().calendlyEnabled(), false));
}));

test("the accepted email has no booking button without a Calendly link", () => {
  const emails = loader()("lib/emails.ts");
  for (const lang of ["en", "fr", "es"]) {
    const plain = emails.decisionEmail("accepted", null, lang);
    assert.doesNotMatch(plain.html, /class="btn"|v:roundrect/);
    assert.doesNotMatch(plain.html, /undefined/);
    const booked = emails.decisionEmail("accepted", "https://calendly.invalid/en?x=1", lang);
    assert.match(booked.html, /href="https:\/\/calendly\.invalid\/en\?x=1"/);
  }
});

test("the Calendly webhook is a harmless 503 when not configured", () => withEnv(unset, async () => {
  let ingested = false;
  const route = loader({ "@/lib/db": { getDb: () => ({}) }, "@/lib/webhooks": { ingestWebhook: async () => { ingested = true; return {}; } } })("app/api/webhooks/calendly/route.ts");
  const res = await route.POST(new Request("https://example.invalid/api/webhooks/calendly", { method: "POST", body: "{}" }));
  assert.equal(res.status, 503);
  assert.deepEqual(await res.json(), { ok: false, ignored: "calendly not configured" });
  assert.equal(ingested, false);
}));
