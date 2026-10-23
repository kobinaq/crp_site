import assert from "node:assert/strict";
import test from "node:test";
import { loader } from "./helpers.mjs";

const load = loader();
const { messages, placeholdersIn } = load("lib/messages.ts");
const { uiMessages, lookupUi } = load("lib/ui-messages.ts");
const { locales } = load("lib/locale.ts");
const catalog = load("lib/copy/catalog.ts");

const {
  leaves,
  parseCopyRef,
  checkValue,
  normalizeValue,
  mergePage,
  indexPublished,
  NO_OVERRIDES,
  translationState,
  bundledValue,
  MAX_VALUE_LENGTH,
  uiOverrides,
} = catalog;

function ref(catalogId, locale, key) {
  const parsed = parseCopyRef({ catalog: catalogId, locale, key });
  assert.ok(parsed, `${catalogId}:${locale}:${key}`);
  return parsed;
}

function names(text) {
  return [...new Set(placeholdersIn(text))];
}

test("each catalog has the bundled leaf count and every locale has those leaves", () => {
  assert.equal(leaves("page").length, 387);
  assert.equal(leaves("ui").length, 147);
  assert.equal(leaves("ackEmail").length, 15);
  assert.equal(leaves("appEmail").length, 32);
  for (const leaf of leaves("page")) {
    assert.equal(leaf.key.includes(".."), false);
    assert.ok(leaf.path.every((segment) => typeof segment === "number" || !String(segment).includes(".")));
    for (const locale of locales) {
      const value = bundledValue(ref("page", locale, leaf.key));
      assert.equal(typeof value, "string");
      assert.deepEqual(names(value), names(leaf.english));
      assert.ok(value.length <= MAX_VALUE_LENGTH);
    }
  }
  for (const leaf of [...leaves("ui"), ...leaves("ackEmail"), ...leaves("appEmail")]) {
    assert.ok(bundledValue(ref(leaf.catalog, "en", leaf.key)).length <= MAX_VALUE_LENGTH);
  }
});

test("page and interface placeholders are sets, email placeholders are counts", () => {
  const page = ref("page", "fr", "a11y.changeLanguage");
  assert.deepEqual(checkValue(page, "Langue {language} choisie"), []);
  assert.deepEqual(checkValue(page, "Langue {language} et {language}"), []);
  assert.equal(checkValue(page, "Langue")[0].kind, "placeholders");
  assert.equal(checkValue(page, "Langue {language} {year}")[0].kind, "placeholders");

  const email = ref("ackEmail", "fr", "greeting");
  assert.deepEqual(checkValue(email, "Bonjour {name},"), []);
  assert.equal(checkValue(email, "Bonjour {name} {name},")[0].kind, "placeholders");
  assert.equal(checkValue(email, "Bonjour,")[0].kind, "placeholders");
});

test("empty string is a value, subjects reject line breaks, and length has a ceiling", () => {
  const page = ref("page", "en", "nav.about");
  assert.deepEqual(checkValue(page, ""), []);
  assert.equal(normalizeValue("  a\r\nb\rc  "), "  a\nb\nc  ");
  const subject = ref("ackEmail", "en", "waitlistSubject");
  assert.equal(checkValue(subject, "Line\nbreak")[0].kind, "line-break");
  assert.equal(checkValue(page, "x".repeat(MAX_VALUE_LENGTH + 1))[0].kind, "too-long");
});

test("parseCopyRef rejects a portuguese application string, an unknown key, and a new array slot", () => {
  assert.equal(parseCopyRef({ catalog: "appEmail", locale: "pt", key: "greeting" }), null);
  assert.equal(parseCopyRef({ catalog: "page", locale: "en", key: "nav.missing" }), null);
  const arrayLeaf = leaves("page").find((leaf) => leaf.path.some((segment) => typeof segment === "number"));
  assert.ok(arrayLeaf);
  const extra = arrayLeaf.key.replace(/\.(\d+)/, ".99");
  assert.equal(parseCopyRef({ catalog: "page", locale: "en", key: extra }), null);
});

test("merge keeps the bundle object when nothing is published and does not mutate it", () => {
  assert.equal(mergePage(NO_OVERRIDES, "fr"), messages.fr);
  const leaf = leaves("page").find((item) => item.key === "nav.about");
  const published = indexPublished([{ catalog: "page", locale: "fr", key: leaf.key, value: "" }]);
  const merged = mergePage(published, "fr");
  assert.equal(merged.nav.about, "");
  assert.notEqual(merged, messages.fr);
  assert.notEqual(messages.fr.nav.about, "");
  const broken = indexPublished([{ catalog: "page", locale: "fr", key: "a11y.changeLanguage", value: "no token" }]);
  assert.equal(mergePage(broken, "fr").a11y.changeLanguage, messages.fr.a11y.changeLanguage);
  const unknown = indexPublished([{ catalog: "page", locale: "fr", key: "no.such", value: "x" }]);
  assert.equal(mergePage(unknown, "fr"), messages.fr);
});

test("a translation is stale only when its recorded English differs from today's English", () => {
  const french = ref("page", "fr", "nav.about");
  assert.deepEqual(translationState({ ref: ref("page", "en", "nav.about"), enOverride: null, live: null }), { kind: "source" });
  assert.deepEqual(translationState({ ref: french, enOverride: null, live: null }), { kind: "current" });
  assert.equal(translationState({ ref: french, enOverride: "About us", live: null }).kind, "stale");
  const current = translationState({
    ref: french,
    enOverride: "About us",
    live: { value: "À propos", translatedFrom: "About us" },
  });
  assert.deepEqual(current, { kind: "current" });
  const stale = translationState({
    ref: french,
    enOverride: "About us",
    live: { value: "À propos", translatedFrom: "About" },
  });
  assert.equal(stale.kind, "stale");
});

test("interface lookup keeps an empty override and ignores inherited keys", () => {
  assert.equal(lookupUi("en", "Only program"), uiMessages.en["Only program"]);
  assert.notEqual(lookupUi("en", "Only program"), "Only program");
  assert.equal(lookupUi("en", "Only program", { en: { "Only program": "" } }), "");
  assert.equal(lookupUi("en", "constructor"), "constructor");
  const published = indexPublished([{ catalog: "ui", locale: "es", key: "Only program", value: "Programa" }]);
  assert.equal(uiOverrides(published).es["Only program"], "Programa");
  assert.equal(uiOverrides(published).en, undefined);
});
