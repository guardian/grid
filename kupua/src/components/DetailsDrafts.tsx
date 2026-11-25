import { createContext, Fragment, useContext, useLayoutEffect, useState, type ReactNode } from "react";
import { useBlocker } from "@tanstack/react-router";
import { allowDetailsDeparture, registerDetailsGuard } from "@/lib/details-departure";

type Entry = { label: string; value: unknown };
const DetailsDraftContext = createContext<{ entries: Map<string, Entry>; selection: boolean; sync: () => void } | null>(null);

function DraftNavigationGuard() {
  useBlocker({ enableBeforeUnload: false, shouldBlockFn: async ({ current, next, action }) => {
    if (action === "REPLACE" && current.pathname === next.pathname && JSON.stringify(current.search) === JSON.stringify(next.search)) return false;
    return !await allowDetailsDeparture(next.search?.image && next.search.image !== current.search?.image ? "Discard and open" : "Discard edit");
  } });
  return null;
}

export function DetailsDrafts({ children, routed = false, selection = false }: { children: ReactNode; routed?: boolean; selection?: boolean }) {
  const [entries] = useState(() => new Map<string, Entry>());
  const [dirty, setDirty] = useState(false);
  const [generation, setGeneration] = useState(0);
  useLayoutEffect(() => {
    if (!dirty) return;
    const unregister = registerDetailsGuard(async () => {
      if (!entries.size) return true;
      const label = entries.values().next().value?.label;
      const name = label === "By" ? "Byline" : label?.toLowerCase() === "taken on" ? "Date Taken" : label;
      if (!window.confirm(entries.size === 1 ? `Discard your ${name} edit?` : "Discard your edits?")) return false;
      entries.clear();
      setDirty(false);
      setGeneration(value => value + 1);
      return true;
    });
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => { unregister(); window.removeEventListener("beforeunload", warn); };
  }, [dirty]);
  const [scope] = useState(() => ({ entries, selection, sync: () => setDirty(entries.size > 0) }));
  return <DetailsDraftContext.Provider value={scope}><Fragment key={generation}>{children}</Fragment>
    {dirty && routed && <DraftNavigationGuard />}
  </DetailsDraftContext.Provider>;
}

export function DetailsTargetCount({ count }: { count: number }) {
  return useContext(DetailsDraftContext)?.selection ? <span className="self-center text-xs text-grid-text-muted">{count.toLocaleString()} {count === 1 ? "image" : "images"}</span> : null;
}

export function useDetailsDraft<Value>(key: string) {
  const scope = useContext(DetailsDraftContext);
  const [restored] = useState(() => scope?.entries.get(key)?.value as Value | undefined);
  return { restored, scoped: Boolean(scope), update: (label: string, value: Value | undefined) => {
    if (!scope) return;
    if (value === undefined) scope.entries.delete(key);
    else scope.entries.set(key, { label, value });
    scope.sync();
  } };
}