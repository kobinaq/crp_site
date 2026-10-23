import assert from "node:assert/strict";
import test from "node:test";
import { installDom } from "./dom.mjs";
import { loader } from "./helpers.mjs";

installDom();
const React = await import("react");
const { createRoot } = await import("react-dom/client");
const { act } = React;

const load = loader({
  "next/link": {
    __esModule: true,
    default(props) {
      const { href, children, ...rest } = props;
      return React.createElement("a", { href, ...rest }, children);
    },
  },
  "next/navigation": {
    useRouter() {
      return { push() {}, refresh() {}, replace() {} };
    },
  },
});

function render(node) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  act(() => {
    root.render(node);
  });
  return {
    host,
    cleanup() {
      act(() => root.unmount());
      host.remove();
    },
  };
}

function filters(list) {
  return { list, q: "", status: "", track: "", language: "", cycle: "", age: "", queue: "", attention: "", page: 1 };
}

function page(list, headers, row) {
  return {
    list,
    title: list,
    headers,
    rows: [row],
    total: 1,
    page: 1,
    pageSize: 50,
    filters: filters(list),
    statusOptions: [],
    weeks: [],
  };
}

function assertPlainRow(host, name, href) {
  const link = host.querySelector(`a[href='${href}']`);
  assert.ok(link, href);
  assert.equal(link.getAttribute("aria-label"), `Open ${name}`);
  const nameNode = [...host.querySelectorAll("span")].find((span) => span.textContent === name);
  assert.ok(nameNode, name);
  assert.equal(nameNode.closest("a"), null);
  const box = host.querySelector("input[type='checkbox']");
  if (box) assert.equal(box.closest("a"), null);
}

test("applicants, nominations, partners, and messages open from the row, with the name as plain text", () => {
  const { RecordsView } = load("components/admin/RecordsView.tsx");
  const { BulkQueue } = load("components/admin/BulkQueue.tsx");
  const lists = [
    ["nominations", ["Name"], { id: "nom", href: "/admin/records/nominations/nom", cells: ["Kofi Mensah"] }],
    ["partners", ["Name"], { id: "par", href: "/admin/records/partners/par", cells: ["North Sea Trust"] }],
    ["messages", ["Name"], { id: "msg", href: "/admin/records/messages/msg", cells: ["Fatou Ndiaye"] }],
  ];
  const views = lists.map(([list, headers, row]) => render(React.createElement(RecordsView, {
    data: page(list, headers, row),
    lists: ["applicants", "nominations", "interest", "waitlist", "partners", "messages"],
    exportable: false,
    canConfirm: false,
  })));
  const bulk = render(React.createElement(BulkQueue, {
    headers: ["Name"],
    rows: [{ id: "app", href: "/admin/records/applicants/app", cells: ["Ayat Aberwil"], version: 1, reviewCycle: 1 }],
  }));
  try {
    assertPlainRow(views[0].host, "Kofi Mensah", "/admin/records/nominations/nom");
    assertPlainRow(views[1].host, "North Sea Trust", "/admin/records/partners/par");
    assertPlainRow(views[2].host, "Fatou Ndiaye", "/admin/records/messages/msg");
    assertPlainRow(bulk.host, "Ayat Aberwil", "/admin/records/applicants/app");
    const box = bulk.host.querySelector("input[aria-label='Select Ayat Aberwil']");
    assert.ok(box);
    assert.equal(box.closest("a"), null);
    assert.equal(bulk.host.querySelector("a.button, a[class*='rounded-full']"), null);
  } finally {
    for (const view of views) view.cleanup();
    bulk.cleanup();
  }
});
