import { createContext, Fragment, useContext, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useBlocker } from "@tanstack/react-router";
import { allowDetailsDeparture, registerDetailsGuard, type Departure } from "@/lib/details-departure";

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
  const [action, setAction] = useState<Departure>();
  const resolver = useRef<((allow: boolean) => void) | undefined>(undefined);
  const dialog = useRef<HTMLDialogElement>(null);
  useLayoutEffect(() => {
    if (!dirty) return;
    const unregister = registerDetailsGuard(reason => new Promise(resolve => {
      if (!entries.size) { resolve(true); return; }
      if (resolver.current) { resolve(false); return; }
      resolver.current = resolve;
      setAction(reason);
    }));
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => { unregister(); window.removeEventListener("beforeunload", warn); resolver.current?.(false); resolver.current = undefined; };
  }, [dirty]);
  useLayoutEffect(() => { if (action) dialog.current?.showModal(); }, [action]);
  const finish = (allow: boolean) => {
    const resolve = resolver.current;
    resolver.current = undefined;
    dialog.current?.close();
    setAction(undefined);
    if (allow) { entries.clear(); setDirty(false); setGeneration(value => value + 1); }
    resolve?.(allow);
  };
  const [scope] = useState(() => ({ entries, selection, sync: () => setDirty(entries.size > 0) }));
  const question = entries.size === 1 ? `Discard your ${entries.values().next().value?.label} edit?` : "Discard your edits?";
  return <DetailsDraftContext.Provider value={scope}><Fragment key={generation}>{children}</Fragment>
    {dirty && routed && <DraftNavigationGuard />}
    {action && <dialog ref={dialog} aria-label={question} className="m-auto rounded border border-grid-border bg-grid-bg p-4 text-grid-text backdrop:bg-black/50" onCancel={event => { event.preventDefault(); finish(false); }}>
      <p>{question}</p><div className="mt-4 flex justify-end gap-4"><button autoFocus type="button" onClick={() => finish(false)}>Keep editing</button>
        <button type="button" onClick={() => finish(true)}>{action}</button></div>
    </dialog>}</DetailsDraftContext.Provider>;
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