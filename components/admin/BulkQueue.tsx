"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { confirmBulkAction, previewBulkAction } from "@/app/admin/(console)/records/actions";
import { AdminSelect } from "@/components/admin/AdminSelect";
import { Button, buttonClass } from "@/components/admin/Button";
import { RecordCell } from "@/components/admin/RecordCell";
import { ResultLine } from "@/components/admin/ResultLine";
import type { RecordRow } from "@/lib/admin/records";
import { languageLabel } from "@/lib/admin/labels";
import type { ConfirmMove } from "@/lib/sync";

const MOVES: readonly { readonly move: ConfirmMove; readonly label: string }[] = [
  { move: { field: "reviewDecision", value: "accept", to: "accepted" }, label: "Accept to Accepted" },
  { move: { field: "reviewDecision", value: "reject", to: "rejected" }, label: "Reject to Rejected" },
  { move: { field: "reviewDecision", value: "reject", to: "online_offered" }, label: "Reject to Online offered" },
  { move: { field: "interviewOutcome", value: "yes", to: "interview_yes" }, label: "Interview yes" },
  { move: { field: "interviewOutcome", value: "no", to: "rejected" }, label: "Interview no to Rejected" },
  { move: { field: "interviewOutcome", value: "no", to: "online_offered" }, label: "Interview no to Online offered" },
];

const RESULT: Record<string, string> = {
  applied: "Applied",
  stale: "Out of date",
  not_allowed: "Not allowed",
  not_found: "Not found",
  unchanged: "Unchanged",
  replayed: "Already confirmed",
  conflict: "Conflict",
  staff_held: "Held",
  staff_kept: "Kept",
};

export function BulkQueue({ headers, rows }: { headers: readonly string[]; rows: readonly RecordRow[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>([]);
  const [moveIndex, setMoveIndex] = useState(0);
  const [previewKey, setPreviewKey] = useState("");
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState("");
  const [counts, setCounts] = useState<{ apply: number; stale: number; notAllowed: number; notFound: number } | null>(null);
  const [languages, setLanguages] = useState<readonly { language: string; apply: number }[]>([]);
  const [decisionIds, setDecisionIds] = useState<Record<string, string>>({});
  const [results, setResults] = useState<readonly { applicantId: string; result: string }[]>([]);
  const choice = MOVES[moveIndex]?.move;
  const picked = rows.filter((row) => selected.includes(row.id) && typeof row.version === "number" && typeof row.reviewCycle === "number");
  const key = `${picked.map((row) => `${row.id}:${row.version}`).sort().join(",")}::${choice ? `${choice.field}:${choice.value}:${choice.to}` : ""}`;
  const ready = Boolean(choice && picked.length > 0 && previewKey === key && counts);
  const request = useRef(0);

  function toggle(id: string) {
    setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  async function onPreview() {
    if (!choice || picked.length === 0) return;
    const requested = key;
    const ticket = ++request.current;
    setPending(true);
    const ids = { ...decisionIds };
    for (const row of picked) if (!ids[row.id]) ids[row.id] = crypto.randomUUID();
    setDecisionIds(ids);
    try {
      const result = await previewBulkAction({
        move: choice,
        rows: picked.map((row) => ({ applicantId: row.id, version: row.version, reviewCycle: row.reviewCycle })),
      });
      if (request.current !== ticket) return;
      if (result.result !== "ready") {
        setPreviewKey("");
        setCounts(null);
        setNotice(result.result === "forbidden" ? "Your role cannot confirm a decision." : "Select at most 50 applicants.");
        return;
      }
      setPreviewKey(requested);
      setCounts(result.preview.counts);
      setLanguages(result.preview.byLanguage);
      setNotice("");
      setResults([]);
    } finally {
      if (request.current === ticket) setPending(false);
    }
  }

  async function onConfirm() {
    if (!choice || !ready) return;
    const ticket = ++request.current;
    setPending(true);
    try {
      const result = await confirmBulkAction({
        move: choice,
        rows: picked.map((row) => ({
          applicantId: row.id,
          version: row.version,
          reviewCycle: row.reviewCycle,
          decisionId: decisionIds[row.id],
        })),
      });
      if (request.current !== ticket) return;
      if (result.result !== "done") {
        setNotice(result.result === "forbidden" ? "Your role cannot confirm a decision." : "That confirmation could not be read.");
        return;
      }
      setResults(result.rows);
      setPreviewKey("");
      setCounts(null);
      router.refresh();
    } finally {
      if (request.current === ticket) setPending(false);
    }
  }

  return (
    <div>
      {rows.length === 0 ? <p className="mt-3 text-sm text-black/60">Nothing matches these filters.</p> : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[40rem] text-left text-sm">
            <thead>
              <tr>
                <th scope="col" className="pb-2 font-semibold">Select</th>
                {headers.map((header) => <th key={header} scope="col" className="pb-2 font-semibold">{header}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="border-t border-black/10 py-3 pr-4">
                    <input
                      type="checkbox"
                      aria-label={`Select ${row.cells[0] ?? "applicant"}`}
                      checked={selected.includes(row.id)}
                      onChange={() => toggle(row.id)}
                    />
                  </td>
                  {row.cells.map((cell, index) => (
                    <td key={`${row.id}-${index}`} className="border-t border-black/10 py-3 pr-4">
                      {index === 0 && row.href ? (
                        <Link className={buttonClass("outline", "sm")} href={row.href}>
                          <RecordCell list="applicants" header={headers[index] ?? ""} value={cell} />
                        </Link>
                      ) : <RecordCell list="applicants" header={headers[index] ?? ""} value={cell} />}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="mt-4 grid gap-3">
        <label className="grid gap-1 text-sm font-semibold">
          Move
          <AdminSelect
            className="w-full max-w-sm"
            value={String(moveIndex)}
            onValueChange={(next) => setMoveIndex(Number(next))}
            options={MOVES.map((item, index) => ({ value: String(index), label: item.label }))}
          />
        </label>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" type="button" onClick={onPreview} disabled={pending || picked.length === 0}>Preview counts</Button>
          <Button variant="primary" type="button" onClick={onConfirm} disabled={!ready || pending}>Confirm</Button>
        </div>
        {counts && previewKey === key ? (
          <p className="text-sm text-black/70">
            {counts.apply} will apply, {counts.stale} are out of date, {counts.notAllowed} cannot move, {counts.notFound} were not found.
            {languages.length > 0 ? ` ${languages.map((item) => `${languageLabel(item.language)} ${item.apply}`).join(", ")}.` : ""}
          </p>
        ) : null}
        <ResultLine message={notice} tone="warn" />
        {results.length > 0 ? (
          <ul className="grid gap-1 text-sm">
            {results.map((row) => <li key={row.applicantId}>{RESULT[row.result] ?? row.result}</li>)}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
