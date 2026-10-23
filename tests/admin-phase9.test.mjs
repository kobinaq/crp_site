import assert from "node:assert/strict";
import test from "node:test";
import { installDom } from "./dom.mjs";
import { loader } from "./helpers.mjs";

installDom();
const React = await import("react");
const { createRoot } = await import("react-dom/client");
const { act } = React;

let currentPath = "/admin";
const load = loader({
  "next/link": {
    __esModule: true,
    default(props) {
      const { href, children, ...rest } = props;
      return React.createElement("a", { href, ...rest }, children);
    },
  },
  "next/navigation": {
    usePathname() {
      return currentPath;
    },
    useRouter() {
      return { push() {}, refresh() {}, replace() {} };
    },
  },
});

const { leaves } = load("lib/copy/catalog.ts");
const { copyLabel, labelPattern, KEY_LABELS, SECTION_LABELS } = load("lib/copy/labels.ts");

function render(node) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  act(() => root.render(node));
  return {
    host,
    rerender(next) {
      act(() => root.render(next));
    },
    cleanup() {
      act(() => root.unmount());
      host.remove();
    },
  };
}

const JARGON = /\b(slug|payload|webhook|sync|pathname|capability|enum|json|cta|meta|seo|og)\b|_/i;

test("every website text entry and email entry has a plain label", () => {
  for (const catalog of ["page", "ackEmail", "appEmail"]) {
    const missing = leaves(catalog).filter((leaf) => !copyLabel(catalog, leaf.key)).map((leaf) => leaf.key);
    assert.deepEqual(missing, [], `${catalog} needs labels for: ${missing.join(", ")}`);
  }
  for (const leaf of leaves("ui")) assert.ok(copyLabel("ui", leaf.key)?.trim(), leaf.key);
});

test("every website text section has a plain label", () => {
  const sections = new Set(leaves("page").map((leaf) => leaf.section));
  const missing = [...sections].filter((section) => !Object.hasOwn(SECTION_LABELS, section));
  assert.deepEqual(missing, []);
});

test("labels avoid technical words and raw keys", () => {
  for (const [catalog, labels] of Object.entries(KEY_LABELS)) {
    for (const [pattern, label] of Object.entries(labels)) {
      assert.equal(JARGON.test(label), false, `${catalog} ${pattern}: ${label}`);
      assert.notEqual(label, pattern);
    }
  }
  for (const label of Object.values(SECTION_LABELS)) assert.equal(JARGON.test(label), false, label);
});

test("numbered entries get human positions", () => {
  assert.equal(labelPattern("about.team.2.name"), "about.team.#.name");
  const numbered = leaves("page").find((leaf) => /\.\d+(\.|$)/.test(leaf.key));
  assert.ok(numbered);
  const label = copyLabel("page", numbered.key);
  assert.equal(/\{[nm]\}/.test(label), false, label);
});

test("label coverage fails for a key without a label", () => {
  assert.equal(copyLabel("page", "no.such.key"), null);
});

function cell(locale, value, kind = locale === "en" ? "source" : "current") {
  return { locale, revision: 1, value, draft: null, override: false, state: { kind } };
}

test("missing translations are counted per language", () => {
  const { missingLocales } = load("components/admin/CopyDesk.tsx");
  const row = { catalog: "page", key: "nav.about", label: "Menu: About", section: "nav", sectionLabel: "Top menu", english: "About", digest: "d", cells: [cell("en", ""), cell("fr", ""), cell("es", "Acerca"), cell("pt", "  ")] };
  assert.deepEqual(missingLocales(row), ["fr", "pt"]);
  assert.deepEqual(missingLocales({ ...row, cells: [cell("en", "About"), { ...cell("fr", ""), draft: "À propos" }] }), []);
});

test("the copy desk shows the plain label and keeps the key as a tooltip only", () => {
  const { CopyDesk } = load("components/admin/CopyDesk.tsx");
  const rows = [{ catalog: "page", key: "nav.about", label: "Menu: About", section: "nav", sectionLabel: "Top menu", english: "About", digest: "d", cells: [cell("en", "About"), cell("fr", "")] }];
  const view = render(React.createElement(CopyDesk, { catalog: "page", scopeAll: false, query: "", needsReview: false, reviewCount: 0, rows, selected: null, history: {} }));
  try {
    const text = view.host.textContent;
    assert.match(text, /Menu: About/);
    assert.match(text, /Top menu/);
    assert.equal(text.includes("nav.about"), false);
    assert.ok(view.host.querySelector("[title='nav.about']"));
    assert.match(text, /1 missing a translation/);
  } finally {
    view.cleanup();
  }
});

function dashboard(overrides = {}) {
  return {
    pipeline: [],
    applicantTotal: 0,
    cycles: [],
    nominations: { counts: [], recent: [] },
    waitlist: { counts: [], recent: [] },
    interest: { total: 0, recent: [] },
    partners: { total: 0, recent: [] },
    nominationDesk: { desk: "nomination", list: "nominations", total: 0, needsAttention: 0, counts: [] },
    partnerWorkflow: { desk: "partner", list: "partners", total: 0, needsAttention: 0, counts: [] },
    newMessages: 0,
    ...overrides,
  };
}

test("needs attention sums the decision statuses and links each count to its list", () => {
  const { attentionItems } = load("components/admin/DashboardView.tsx");
  const { NEEDS_DECISION_STATUSES } = load("lib/review/queue.ts");
  const pipeline = [
    { status: NEEDS_DECISION_STATUSES[0], label: "a", count: 3 },
    { status: NEEDS_DECISION_STATUSES.at(-1), label: "b", count: NEEDS_DECISION_STATUSES.length > 1 ? 2 : 0 },
    { status: "applied", label: "c", count: 50 },
  ];
  const items = attentionItems(dashboard({ pipeline, newMessages: 1, nominationDesk: { desk: "nomination", list: "nominations", total: 9, needsAttention: 4, counts: [] } }));
  assert.deepEqual(items.map((item) => item.count), [NEEDS_DECISION_STATUSES.length > 1 ? 5 : 3, 1, 4, 0]);
  assert.equal(items[0].href, "/admin/records?list=applicants&queue=needs");
  assert.equal(items[2].href, "/admin/records?list=nominations&attention=needs");
});

test("an empty dashboard says all caught up", () => {
  const { DashboardView } = load("components/admin/DashboardView.tsx");
  const view = render(React.createElement(DashboardView, { data: dashboard(), denied: false, weeks: [] }));
  try {
    assert.match(view.host.textContent, /All caught up\./);
  } finally {
    view.cleanup();
  }
});

test("dashboard rows open from the whole row and the name stays plain text", () => {
  const { DashboardView } = load("components/admin/DashboardView.tsx");
  const recent = [{ id: "p1", createdAt: new Date("2026-10-01T10:00:00Z"), name: "North Sea Trust", email: "n@example.org", organization: "NST", support: "Funding" }];
  const view = render(React.createElement(DashboardView, { data: dashboard({ partners: { total: 1, recent } }), denied: false, weeks: [] }));
  try {
    const link = view.host.querySelector("a[href='/admin/records/partners/p1']");
    assert.equal(link.getAttribute("aria-label"), "Open North Sea Trust");
    assert.ok(link.closest("tr"));
    const name = [...view.host.querySelectorAll("td")].find((td) => td.textContent === "North Sea Trust");
    assert.ok(name);
    assert.equal(name.querySelector("a"), null);
  } finally {
    view.cleanup();
  }
});

test("the narrow menu opens, and closes after moving to another page", () => {
  const { AdminNav } = load("components/admin/AdminNav.tsx");
  const items = [{ href: "/admin", label: "Dashboard" }, { href: "/admin/records", label: "Records", badge: 2 }];
  const props = { email: "staff@example.org", items, signOut: async () => {} };
  currentPath = "/admin";
  const view = render(React.createElement(AdminNav, props));
  try {
    const toggle = view.host.querySelector("button[aria-controls='admin-menu']");
    assert.equal(toggle.getAttribute("aria-expanded"), "false");
    assert.match(view.host.querySelector("#admin-menu").className, /(^|\s)hidden(\s|$)/);
    act(() => toggle.dispatchEvent(new window.MouseEvent("click", { bubbles: true })));
    assert.equal(toggle.getAttribute("aria-expanded"), "true");
    assert.match(view.host.querySelector("#admin-menu").className, /(^|\s)grid(\s|$)/);
    currentPath = "/admin/records";
    view.rerender(React.createElement(AdminNav, { ...props }));
    assert.equal(toggle.getAttribute("aria-expanded"), "false");
    assert.equal(view.host.querySelector("a[aria-current='page']").getAttribute("href"), "/admin/records");
  } finally {
    view.cleanup();
  }
});

test("applicant history names who made each change in plain words", () => {
  const { actorName } = load("lib/admin/records.ts");
  assert.equal(actorName("videoask"), "Video answers");
  assert.equal(actorName("identity"), "Identity check");
  assert.equal(actorName("ops"), "Tech team");
  assert.equal(actorName("applicant"), "Applicant");
});

test("website text search matches the plain label, the section, and the key", () => {
  const { matchesCopyQuery } = load("lib/copy/editor.ts");
  const row = { catalog: "page", key: "nav.about", label: "Menu: About link", section: "nav", sectionLabel: "Top menu", english: "About", digest: "d", cells: [cell("en", "About"), cell("fr", "À propos")] };
  assert.equal(matchesCopyQuery(row, "about link"), true);
  assert.equal(matchesCopyQuery(row, "top menu"), true);
  assert.equal(matchesCopyQuery(row, "nav.about"), true);
  assert.equal(matchesCopyQuery(row, "propos"), true);
  assert.equal(matchesCopyQuery(row, "footer"), false);
  assert.equal(matchesCopyQuery(row, "  "), true);
});
