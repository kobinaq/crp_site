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
    usePathname() {
      return "/admin/records";
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

test("the messages list has a status filter, no attention filter, and no CSV", () => {
  const { RecordsView } = load("components/admin/RecordsView.tsx");
  const data = {
    list: "messages",
    title: "Messages",
    headers: ["Name", "Email", "Organization", "Status", "Assigned to", "Received"],
    rows: [],
    total: 0,
    page: 1,
    pageSize: 50,
    filters: {
      list: "messages",
      q: "",
      status: "",
      track: "",
      language: "",
      cycle: "",
      age: "",
      queue: "",
      attention: "",
      page: 1,
    },
    statusOptions: [["new", "New"], ["read", "Read"], ["archived", "Archived"], ["spam", "Spam"]],
    weeks: [],
  };
  const view = render(React.createElement(RecordsView, { data, lists: ["applicants", "nominations", "interest", "waitlist", "partners", "messages"], exportable: true, canConfirm: true }));
  try {
    assert.match(view.host.textContent, /Messages/);
    assert.match(view.host.textContent, /No messages yet/);
    assert.equal(view.host.textContent.includes("Attention"), false);
    assert.equal(view.host.textContent.includes("Download CSV"), false);
    assert.equal(view.host.querySelector("a[href='/admin/records?list=messages']") !== null, true);
    const labels = [...view.host.querySelectorAll("label")].map((label) => label.textContent);
    assert.equal(labels.some((label) => label.startsWith("Status")), true);
  } finally {
    view.cleanup();
  }
});

test("the needs attention card counts new messages and links to that list", () => {
  const { DashboardView } = load("components/admin/DashboardView.tsx");
  const data = {
    access: { applicants: true, nominations: true, partners: true, signups: true, messages: true },
    pipeline: [],
    applicantTotal: 0,
    cycles: [],
    nominations: { counts: [], recent: [] },
    waitlist: { counts: [], recent: [] },
    interest: { total: 0, recent: [] },
    partners: { total: 0, recent: [] },
    nominationDesk: { desk: "nomination", list: "nominations", total: 0, needsAttention: 0, counts: [] },
    partnerWorkflow: { desk: "partner", list: "partners", total: 0, needsAttention: 0, counts: [] },
    newMessages: 4,
  };
  const view = render(React.createElement(DashboardView, { data, weeks: [] }));
  try {
    const link = view.host.querySelector("a[href='/admin/records?list=messages&status=new']");
    assert.equal(link.textContent, "4New messages");
  } finally {
    view.cleanup();
  }
});

test("mark spam asks for confirmation and the other verbs submit directly", () => {
  const { MessageView } = load("components/admin/MessageView.tsx");
  const detail = {
    id: "00000000-0000-4000-8000-000000000010",
    name: "Ada",
    email: "ada@example.com",
    organization: null,
    phone: "+1 5551234567",
    body: "Hello there",
    locale: "en",
    state: { status: "new", readAt: null },
    statusLabel: "New",
    assignee: null,
    verbs: ["markRead", "archive", "markSpam"],
    canManage: true,
    assignees: [],
    notes: [],
    createdAt: new Date("2026-01-02T03:04:00.000Z"),
  };
  const view = render(React.createElement(MessageView, {
    detail,
    listHref: "/admin/records?list=messages",
    previous: null,
    next: null,
    noteId: "00000000-0000-4000-8000-000000000011",
    action: async () => ({ result: "saved" }),
  }));
  try {
    assert.match(view.host.textContent, /Hello there/);
    assert.equal(view.host.querySelector("a[aria-label='Back to messages']")?.getAttribute("href"), "/admin/records?list=messages");
    const previous = [...view.host.querySelectorAll("button")].find((button) => button.textContent?.includes("Previous"));
    assert.equal(previous?.disabled, true);
    assert.match(view.host.textContent ?? "", /ada@example.com/);
    assert.equal(view.host.querySelector("a[href='mailto:ada@example.com']"), null);
    assert.equal(view.host.querySelector("a[href^='tel:']"), null);
    assert.match(view.host.textContent, /English/);
    assert.equal(view.host.querySelector("[role='alertdialog']"), null);
    const spam = [...view.host.querySelectorAll("button")].find((button) => button.textContent === "Mark spam");
    const archive = [...view.host.querySelectorAll("button")].find((button) => button.textContent === "Archive");
    assert.ok(spam);
    assert.ok(archive);
    assert.equal(archive.getAttribute("type"), "submit");
    const OriginalFormData = globalThis.FormData;
    globalThis.FormData = class FormData {
      get() { return null; }
      has() { return false; }
    };
    try {
      act(() => {
        spam.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
      });
    } finally {
      globalThis.FormData = OriginalFormData;
    }
    const dialog = view.host.querySelector("[role='alertdialog']");
    assert.ok(dialog);
    assert.match(dialog.textContent, /Mark as spam\?/);
    assert.match(dialog.textContent, /Restore puts it back/);
  } finally {
    view.cleanup();
  }
});
