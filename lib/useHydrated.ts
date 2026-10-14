import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

// False during SSR and hydration, true on every client render after that.
// Same timing as `useState(false)` + `useEffect(() => set(true), [])`,
// without a synchronous setState inside an effect.
export function useHydrated(): boolean {
  return useSyncExternalStore(subscribe, () => true, () => false);
}
