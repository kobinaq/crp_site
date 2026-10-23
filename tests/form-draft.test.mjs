import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { loader } from './helpers.mjs';

const load = loader();
const {
  APPLY_DRAFT, NOMINATE_DRAFT, DRAFT_TTL_MS,
  beginDraft, hasDraft, readDraft, writeDraftField, clearDraft, isStorableField,
  asText, asBoolean, asOneOf, asNullable, asTextList, asCountry, asRecord,
} = load('lib/formDraft.ts');

function memoryStorage() {
  const map = new Map();
  return {
    map,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}

const T0 = 1_800_000_000_000;

test('typed values survive a reload while the form is open (the language-switch case)', () => {
  const storage = memoryStorage();
  beginDraft(storage, APPLY_DRAFT, T0);
  writeDraftField(storage, APPLY_DRAFT, 'about.fullName', 'Ama Mensah', T0 + 1);
  writeDraftField(storage, APPLY_DRAFT, 'about.email', 'crp-qa+crptest@mail.grokbot.com', T0 + 2);
  writeDraftField(storage, APPLY_DRAFT, 'step', 'about', T0 + 3);
  writeDraftField(storage, APPLY_DRAFT, 'skills', ['design'], T0 + 4);
  // A new page load reads the same sessionStorage entry.
  assert.equal(hasDraft(storage, APPLY_DRAFT, T0 + 5), true);
  assert.deepEqual(readDraft(storage, APPLY_DRAFT, T0 + 5), {
    'about.fullName': 'Ama Mensah',
    'about.email': 'crp-qa+crptest@mail.grokbot.com',
    step: 'about',
    skills: ['design'],
  });
  // Apply and nominate drafts are separate.
  assert.equal(hasDraft(storage, NOMINATE_DRAFT, T0 + 5), false);
});

test('nothing is written without a begun draft, so a cleared (submitted / closed) form stays gone', () => {
  const storage = memoryStorage();
  writeDraftField(storage, APPLY_DRAFT, 'about.fullName', 'x', T0);
  assert.equal(storage.map.size, 0);

  beginDraft(storage, APPLY_DRAFT, T0);
  writeDraftField(storage, APPLY_DRAFT, 'about.fullName', 'x', T0);
  clearDraft(storage, APPLY_DRAFT);
  // Late writes after a successful submit (e.g. the step changing to check-email) are dropped.
  writeDraftField(storage, APPLY_DRAFT, 'step', 'check-email', T0 + 1);
  assert.equal(hasDraft(storage, APPLY_DRAFT, T0 + 1), false);
  assert.equal(storage.map.size, 0);
});

test('beginning a draft starts empty', () => {
  const storage = memoryStorage();
  beginDraft(storage, NOMINATE_DRAFT, T0);
  writeDraftField(storage, NOMINATE_DRAFT, 'nominee.name', 'Kofi', T0);
  beginDraft(storage, NOMINATE_DRAFT, T0 + 1);
  assert.deepEqual(readDraft(storage, NOMINATE_DRAFT, T0 + 1), {});
});

test('tokens, uploads and verification results are never stored', () => {
  for (const field of ['turnstileToken', 'about.turnstileToken', 'resumeFile', 'upload', 'diditResult', 'verification', 'videoaskUrl', 'captcha']) {
    assert.equal(isStorableField(field), false, field);
  }
  const storage = memoryStorage();
  beginDraft(storage, APPLY_DRAFT, T0);
  writeDraftField(storage, APPLY_DRAFT, 'turnstileToken', 'secret-token', T0);
  assert.ok(!storage.map.get(APPLY_DRAFT).includes('secret-token'));
});

test('drafts expire and corrupt entries are dropped', () => {
  const storage = memoryStorage();
  beginDraft(storage, APPLY_DRAFT, T0);
  writeDraftField(storage, APPLY_DRAFT, 'about.fullName', 'x', T0);
  assert.equal(hasDraft(storage, APPLY_DRAFT, T0 + DRAFT_TTL_MS), true);
  assert.equal(hasDraft(storage, APPLY_DRAFT, T0 + DRAFT_TTL_MS + 1), false);
  assert.equal(storage.map.size, 0);

  for (const bad of ['{', 'null', '[]', '{"v":2,"savedAt":0,"fields":{}}', '{"v":1,"savedAt":"x","fields":{}}', '{"v":1,"savedAt":1,"fields":[]}']) {
    storage.setItem(APPLY_DRAFT, bad);
    assert.equal(readDraft(storage, APPLY_DRAFT, 1), null, bad);
    assert.equal(storage.map.has(APPLY_DRAFT), false, bad);
  }
});

test('storage failures never break the form', () => {
  const broken = {
    getItem() { throw new Error('denied'); },
    setItem() { throw new Error('quota'); },
    removeItem() { throw new Error('denied'); },
  };
  assert.doesNotThrow(() => beginDraft(broken, APPLY_DRAFT, T0));
  assert.doesNotThrow(() => writeDraftField(broken, APPLY_DRAFT, 'about.email', 'a@b.co', T0));
  assert.equal(hasDraft(broken, APPLY_DRAFT, T0), false);
  assert.doesNotThrow(() => clearDraft(broken, APPLY_DRAFT));
});

test('restored values are validated and fall back to the default when unexpected', () => {
  assert.equal(asText('hi'), 'hi');
  assert.equal(asText(3), undefined);
  assert.equal(asText('x'.repeat(5000)).length, 1000);
  assert.equal(asBoolean(true), true);
  assert.equal(asBoolean('true'), undefined);
  const step = asOneOf(['terms', 'skills', 'about']);
  assert.equal(step('about'), 'about');
  assert.equal(step('check-email'), undefined);
  assert.equal(asNullable(step)(null), null);
  assert.deepEqual(asTextList(['a', 'b']), ['a', 'b']);
  assert.equal(asTextList(['a', 1]), undefined);
  // Countries come back from the list by code, whatever else was stored.
  assert.deepEqual(asCountry({ code: 'GH', name: 'Hacked', dial: '+0' }), { code: 'GH', name: 'Ghana', dial: '+233' });
  assert.equal(asCountry({ code: 'ZZ' }), undefined);
  assert.equal(asCountry('GH'), undefined);

  const nominee = asRecord(['nomineeName', 'track'], ['nomineePhone'], { track: ['in_person', 'online'] });
  assert.deepEqual(nominee({ nomineeName: 'Kofi', track: 'online', extra: 'x' }), { nomineeName: 'Kofi', track: 'online' });
  assert.equal(nominee({ nomineeName: 'Kofi', track: 'space' }), undefined);
  assert.equal(nominee({ track: 'online' }), undefined);
});

test('wiring: flows keep answers in the draft, clear it on submit, and never store the Turnstile token', () => {
  const read = (f) => readFileSync(f, 'utf8');
  const about = read('components/apply/AboutStep.tsx');
  for (const field of ['fullName', 'email', 'dob', 'dialCountry', 'mobile', 'nationality', 'basedIn', 'track', 'canTravel', 'hasValidPassport']) {
    assert.match(about, new RegExp(`useDraftState[^;]*"about\\.${field}"`), field);
  }
  assert.match(about, /useState<string \| null>\(null\);\n/); // turnstileToken stays plain state
  assert.doesNotMatch(about, /useDraftState[^;]*[Tt]oken/);

  const apply = read('components/apply/ApplyFlow.tsx');
  assert.match(apply, /endDraft\(APPLY_DRAFT\);\n\s+setApplicant/);
  const nominate = read('components/nominate/NominateFlow.tsx');
  assert.match(nominate, /endDraft\(NOMINATE_DRAFT\);\n\s+setStep\("thanks"\)/);
  for (const f of ['components/nominate/NomineeStep.tsx', 'components/nominate/NominatorStep.tsx']) {
    assert.doesNotMatch(read(f), /useDraftState[^;]*[Tt]oken/, f);
  }
  assert.match(read('components/programs/ProgramApplyBar.tsx'), /useDraftOpen\(nominate \? NOMINATE_DRAFT : APPLY_DRAFT, applyFlow\)/);
  assert.match(read('components/NominatePage.tsx'), /useDraftOpen\(NOMINATE_DRAFT, applyFlow\)/);
});

test('hydration-safe: the open state reads storage only after hydration', () => {
  const src = readFileSync('lib/useFormDraft.ts', 'utf8');
  assert.match(src, /if \(hydrated && enabled && !checked\)/);
  assert.match(src, /useState\(false\)/);
});
