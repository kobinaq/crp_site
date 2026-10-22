import assert from "node:assert/strict";
import test from "node:test";
import { loader } from "./helpers.mjs";

const FORM_KEYS = [
  "VIDEOASK_FORM_ID",
  "VIDEOASK_FORM_ID_EN",
  "VIDEOASK_FORM_ID_FR",
  "VIDEOASK_FORM_ID_ES",
  "VIDEOASK_FORM_IDS",
];

async function withEnv(values, fn) {
  const keys = Object.keys(values);
  const before = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
  for (const k of keys) {
    if (values[k] === undefined) delete process.env[k];
    else process.env[k] = values[k];
  }
  try {
    return await fn();
  } finally {
    for (const k of keys) {
      if (before[k] === undefined) delete process.env[k];
      else process.env[k] = before[k];
    }
  }
}

const clearForms = Object.fromEntries(FORM_KEYS.map((k) => [k, undefined]));

test("videoaskFormIds merges FORM_ID, language ids, and FORM_IDS", () => withEnv({
  ...clearForms,
  VIDEOASK_FORM_ID: "base",
  VIDEOASK_FORM_ID_EN: "en-form",
  VIDEOASK_FORM_ID_FR: "fr-form",
  VIDEOASK_FORM_IDS: "extra-a, extra-b, en-form",
}, () => {
  const { videoaskFormIds, isAllowedVideoaskForm } = loader()("lib/videoask.ts");
  assert.deepEqual(videoaskFormIds(), ["base", "en-form", "fr-form", "extra-a", "extra-b"]);
  assert.equal(isAllowedVideoaskForm("fr-form"), true);
  assert.equal(isAllowedVideoaskForm("unknown"), false);
}));

test("readVideoaskCompletion accepts any allowlisted language form", () => withEnv({
  ...clearForms,
  APP_SECRET: "test-secret-test-secret-test-secret-1234",
  VIDEOASK_FORM_ID_ES: "es-form",
  VIDEOASK_FORM_ID_FR: "fr-form",
}, () => {
  const { videoaskReference, readVideoaskCompletion } = loader()("lib/videoask.ts");
  const applicantId = "11111111-1111-4111-8111-111111111111";
  const body = (formId) => ({
    event_id: "evt-1",
    event_type: "form_response",
    form: { form_id: formId },
    contact: { status: "completed", variables: { application_ref: videoaskReference(applicantId) } },
  });
  assert.equal(readVideoaskCompletion(body("wrong")).ignored, "other form");
  const fr = readVideoaskCompletion(body("fr-form"));
  assert.equal(fr.applicantId, applicantId);
  assert.equal(fr.formId, "fr-form");
  const es = readVideoaskCompletion(body("es-form"));
  assert.equal(es.formId, "es-form");
}));

test("production config accepts language VideoAsk form ids without FORM_ID", () => withEnv({
  ...clearForms,
  NODE_ENV: "production",
  DATABASE_URL: "postgres://x", APP_URL: "https://example.invalid", RESEND_API_KEY: "x", RESEND_FROM: "x",
  APP_SECRET: "a".repeat(32), CRON_SECRET: "b".repeat(32), SYNC_API_SECRET: "c".repeat(32),
  OPERATIONS_TOKENS: JSON.stringify([{ id: "op", tokenHash: "d".repeat(64) }]),
  TURNSTILE_SECRET_KEY: "x", NEXT_PUBLIC_TURNSTILE_SITE_KEY: "x", VIDEOASK_WEBHOOK_SECRET: "x",
  VIDEOASK_FORM_URL: "https://videoask.invalid/f",
  VIDEOASK_FORM_ID_EN: "en", VIDEOASK_FORM_ID_FR: "fr", VIDEOASK_FORM_ID_ES: "es",
  DIDIT_API_KEY: "x", DIDIT_WORKFLOW_ID: "x", DIDIT_WEBHOOK_SECRET: "x", RESEND_WEBHOOK_SECRET: "x",
  BLOB_READ_WRITE_TOKEN: "x", IDENTITY_PROVIDER: undefined,
}, () => {
  assert.doesNotThrow(() => loader()("lib/config.ts").assertBackendConfig());
}));

test("production config still requires at least one VideoAsk form id", () => withEnv({
  ...clearForms,
  NODE_ENV: "production",
  DATABASE_URL: "postgres://x", APP_URL: "https://example.invalid", RESEND_API_KEY: "x", RESEND_FROM: "x",
  APP_SECRET: "a".repeat(32), CRON_SECRET: "b".repeat(32), SYNC_API_SECRET: "c".repeat(32),
  OPERATIONS_TOKENS: JSON.stringify([{ id: "op", tokenHash: "d".repeat(64) }]),
  TURNSTILE_SECRET_KEY: "x", NEXT_PUBLIC_TURNSTILE_SITE_KEY: "x", VIDEOASK_WEBHOOK_SECRET: "x",
  VIDEOASK_FORM_URL: "https://videoask.invalid/f",
  DIDIT_API_KEY: "x", DIDIT_WORKFLOW_ID: "x", DIDIT_WEBHOOK_SECRET: "x", RESEND_WEBHOOK_SECRET: "x",
  BLOB_READ_WRITE_TOKEN: "x", IDENTITY_PROVIDER: undefined,
}, () => {
  assert.throws(
    () => loader()("lib/config.ts").assertBackendConfig(),
    /VIDEOASK_FORM_ID/,
  );
}));
