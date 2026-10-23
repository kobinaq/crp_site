"use client";

import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { useHydrated } from "./useHydrated";
import {
  beginDraft,
  clearDraft,
  draftStorage,
  hasDraft,
  readDraft,
  writeDraftField,
  type DraftParser,
} from "./formDraft";

/**
 * useState that also lives in the form's session draft (see lib/formDraft.ts), so
 * the value survives a language switch.
 *
 * Only for components that never render on the server: the apply / nominate steps
 * mount after a click, or after hydration via useDraftOpen, and portal into
 * document.body. That makes reading storage in the initial state hydration-safe.
 */
export function useDraftState<T>(
  draftKey: string,
  field: string,
  initial: T,
  parse: DraftParser<T>,
): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => {
    const storage = draftStorage();
    const fields = storage ? readDraft(storage, draftKey) : null;
    if (!fields || !(field in fields)) return initial;
    const restored = parse(fields[field]);
    return restored === undefined ? initial : restored;
  });

  useEffect(() => {
    const storage = draftStorage();
    if (storage) writeDraftField(storage, draftKey, field, value);
  }, [draftKey, field, value]);

  return [value, setValue];
}

/**
 * Open/closed state for the component that opens a flow. Opening begins a fresh
 * draft and closing clears it. After hydration, if a live draft says the flow was
 * open before the page reloaded (a language switch), the flow reopens with it.
 * `enabled` is the apply-flow gate: when it is off the state is plain useState and
 * no draft is kept. Closed on the server and the first client pass.
 */
export function useDraftOpen(draftKey: string, enabled: boolean): [boolean, (open: boolean) => void] {
  const hydrated = useHydrated();
  const [open, setOpenState] = useState(false);
  const [checked, setChecked] = useState(false);
  if (hydrated && enabled && !checked) {
    setChecked(true);
    const storage = draftStorage();
    if (storage && hasDraft(storage, draftKey)) setOpenState(true);
  }

  const setOpen = useCallback(
    (next: boolean) => {
      const storage = enabled ? draftStorage() : null;
      if (storage) {
        if (next) beginDraft(storage, draftKey);
        else clearDraft(storage, draftKey);
      }
      setOpenState(next);
    },
    [draftKey, enabled],
  );

  return [open, setOpen];
}

/** Forget the draft now, e.g. right after a successful submit. */
export function endDraft(draftKey: string) {
  const storage = draftStorage();
  if (storage) clearDraft(storage, draftKey);
}
