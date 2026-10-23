import assert from "node:assert/strict";
import test from "node:test";
import { installDom } from "./dom.mjs";
import { loader } from "./helpers.mjs";

installDom();
const React = await import("react");
const { createRoot } = await import("react-dom/client");
const { act } = React;

const calls = { preview: [], confirm: [] };
let row = { id: "11111111-1111-4111-8111-111111111111", href: "/admin/records/applicants/a", cells: ["Ayat Aberwil"], version: 3, reviewCycle: 0 };

const load = loader({
  "next/link": {
    __esModule: true,
    default({ href, children, ...rest }) {
      return React.createElement("a", { href, ...rest }, children);
    },
  },
  "next/navigation": { useRouter: () => ({ push() {}, refresh() {}, replace() {} }) },
  "@/app/admin/(console)/records/actions": {
    async previewBulkAction(input) {
      calls.preview.push(input);
      return { result: "ready", preview: { move: input.move, counts: { apply: input.rows.length, stale: 0, notAllowed: 0, notFound: 0 }, byLanguage: [], rows: [] } };
    },
    async confirmBulkAction(input) {
      calls.confirm.push(input);
      return { result: "done", rows: input.rows.map((item) => ({ applicantId: item.applicantId, result: "applied" })) };
    },
  },
});

const { BulkQueue } = load("components/admin/BulkQueue.tsx");
const { bulkDecisionKey } = load("lib/review/bulk-key.ts");

async function click(element) {
  await act(async () => {
    element.dispatchEvent(new globalThis.MouseEvent("click", { bubbles: true }));
  });
}

function button(host, name) {
  return [...host.querySelectorAll("button")].find((item) => item.textContent.trim() === name);
}

async function chooseMove(host, label) {
  const trigger = host.querySelector("[data-admin-select] button");
  await click(trigger);
  const option = [...host.querySelectorAll("[role='option'] button, [role='option']")].find((item) => item.textContent.trim() === label);
  assert.ok(option, label);
  await click(option.querySelector("button") ?? option);
}

test("bulk decision ids are per row, version, and move", () => {
  const accept = { field: "reviewDecision", value: "accept", to: "accepted" };
  const reject = { field: "reviewDecision", value: "reject", to: "online_offered" };
  assert.equal(bulkDecisionKey("a", 1, 0, accept), bulkDecisionKey("a", 1, 0, { ...accept }));
  assert.notEqual(bulkDecisionKey("a", 1, 0, accept), bulkDecisionKey("a", 1, 0, reject));
  assert.notEqual(bulkDecisionKey("a", 1, 0, accept), bulkDecisionKey("a", 2, 0, accept));
  assert.notEqual(bulkDecisionKey("a", 1, 0, accept), bulkDecisionKey("a", 1, 1, accept));
});

test("a correction confirmed from the same list page gets a new decision id, and a repeat keeps the old one", async () => {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const draw = () => act(() => root.render(React.createElement(BulkQueue, { headers: ["Name"], rows: [row] })));
  draw();
  try {
    const box = host.querySelector("input[aria-label='Select Ayat Aberwil']");
    await click(box);

    await click(button(host, "Preview"));
    await click(button(host, "Confirm"));
    const acceptId = calls.confirm[0].rows[0].decisionId;
    assert.match(acceptId, /^[0-9a-f-]{36}$/);
    assert.equal(calls.confirm[0].move.to, "accepted");
    assert.match(host.textContent, /Ayat Aberwil: Applied/);

    // The same choice previewed and confirmed again (e.g. a retry) reuses the id, so the server replays it.
    await click(button(host, "Preview"));
    await click(button(host, "Confirm"));
    assert.equal(calls.confirm[1].rows[0].decisionId, acceptId);

    // The refresh brings the new version; the staff member corrects to an online offer.
    row = { ...row, version: 4 };
    draw();
    await chooseMove(host, "Reject, offer an online place (in-person applicants)");
    await click(button(host, "Preview"));
    await click(button(host, "Confirm"));
    const correction = calls.confirm[2];
    assert.equal(correction.move.to, "online_offered");
    assert.equal(correction.rows[0].version, 4);
    assert.notEqual(correction.rows[0].decisionId, acceptId);
  } finally {
    act(() => root.unmount());
    host.remove();
  }
});

test("a correction on the same version but a different move also gets a new id", async () => {
  calls.confirm.length = 0;
  row = { ...row, id: "22222222-2222-4222-8222-222222222222", cells: ["Kofi Mensah"], version: 1 };
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  act(() => root.render(React.createElement(BulkQueue, { headers: ["Name"], rows: [row] })));
  try {
    await click(host.querySelector("input[aria-label='Select Kofi Mensah']"));
    await click(button(host, "Preview"));
    await click(button(host, "Confirm"));
    await chooseMove(host, "Reject, offer an online place (in-person applicants)");
    await click(button(host, "Preview"));
    await click(button(host, "Confirm"));
    assert.equal(calls.confirm.length, 2);
    assert.notEqual(calls.confirm[0].rows[0].decisionId, calls.confirm[1].rows[0].decisionId);
  } finally {
    act(() => root.unmount());
    host.remove();
  }
});
