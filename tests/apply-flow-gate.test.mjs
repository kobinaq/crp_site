import assert from 'node:assert/strict';
import test from 'node:test';
import { loader } from './helpers.mjs';

const load = loader();
const { applyFlowEnabledFor, PRODUCTION_HOSTS } = load('lib/applyFlowGate.ts');

const PREVIEW_HOST = 'crp-site-abc123-omefdevteam.vercel.app';

test('non-production always gets the full flow, whatever the override says', () => {
  for (const vercelEnv of [undefined, 'development', 'preview']) {
    for (const hostname of ['localhost', PREVIEW_HOST]) {
      for (const override of [undefined, '', 'true', 'false', 'yes']) {
        assert.equal(applyFlowEnabledFor({ vercelEnv, override, hostname }), true, `${vercelEnv} ${hostname} ${override}`);
      }
    }
  }
});

test('production (VERCEL_ENV) shows Express interest unless the flag is exactly "true"', () => {
  for (const hostname of [PREVIEW_HOST, ...PRODUCTION_HOSTS]) {
    assert.equal(applyFlowEnabledFor({ vercelEnv: 'production', override: undefined, hostname }), false);
    assert.equal(applyFlowEnabledFor({ vercelEnv: 'production', override: 'false', hostname }), false);
    assert.equal(applyFlowEnabledFor({ vercelEnv: 'production', override: 'TRUE', hostname }), false);
    assert.equal(applyFlowEnabledFor({ vercelEnv: 'production', override: '1', hostname }), false);
    assert.equal(applyFlowEnabledFor({ vercelEnv: 'production', override: 'true', hostname }), true);
  }
});

test('a production hostname counts as production even without VERCEL_ENV', () => {
  for (const hostname of PRODUCTION_HOSTS) {
    for (const vercelEnv of [undefined, 'preview', 'development']) {
      assert.equal(applyFlowEnabledFor({ vercelEnv, override: undefined, hostname }), false);
      assert.equal(applyFlowEnabledFor({ vercelEnv, override: 'false', hostname }), false);
      assert.equal(applyFlowEnabledFor({ vercelEnv, override: 'true', hostname }), true);
    }
  }
});

test('the hook stays hydration-safe: server snapshot is false (Express interest)', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync('lib/applyFlowGate.ts', 'utf8');
  assert.match(src, /useSyncExternalStore\(subscribe, computeEnabled, \(\) => false\)/);
});
