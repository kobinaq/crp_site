export type CopyDraft = {
  readonly revision: number;
  readonly text: string;
};

export type CopyDraftMap = Readonly<Record<string, CopyDraft>>;

let memory: CopyDraftMap = {};

export function copyCellId(catalog: string, key: string, locale: string): string {
  return `${catalog}\u0000${key}\u0000${locale}`;
}

export function readCopyDrafts(): CopyDraftMap {
  return memory;
}

export function writeCopyDrafts(next: CopyDraftMap): void {
  memory = next;
}

export function clearCopyDrafts(): void {
  memory = {};
}

export function shownCopyText(drafts: CopyDraftMap, id: string, revision: number, serverText: string): string {
  const draft = drafts[id];
  if (draft && draft.revision === revision) return draft.text;
  return serverText;
}

export function rememberCopyDraft(
  drafts: CopyDraftMap,
  id: string,
  revision: number,
  text: string,
  serverText: string,
): CopyDraftMap {
  if (text === serverText) {
    if (!Object.hasOwn(drafts, id)) return drafts;
    const next: Record<string, CopyDraft> = { ...drafts };
    delete next[id];
    return next;
  }
  return { ...drafts, [id]: { revision, text } };
}

export function dropStaleCopyDrafts(
  drafts: CopyDraftMap,
  cells: readonly { readonly id: string; readonly revision: number }[],
): CopyDraftMap {
  let next = drafts;
  for (const cell of cells) {
    const draft = next[cell.id];
    if (!draft || draft.revision === cell.revision) continue;
    const editable: Record<string, CopyDraft> = next === drafts ? { ...drafts } : next;
    delete editable[cell.id];
    next = editable;
  }
  return next;
}
