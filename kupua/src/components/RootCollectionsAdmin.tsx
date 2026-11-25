import { useEffect, useRef, useState } from "react";
import { canRemoveTreeNode, changeCollectionTree, hasRootCollectionAccess } from "@/lib/collection-tree-command";
import { collectionNameError } from "@/lib/collection-tree-policy";
import { useSearchStore } from "@/stores/search-store";
import { useCollectionStore } from "@/stores/collection-store";
import { subscribeGridSessionInvalidation } from "@/lib/grid-api-instance";
import { editingAllowedAtStartup } from "@/lib/editing-preference";
import { addToast } from "@/stores/toast-store";

export function RootCollectionsAdmin() {
  const [witness, setWitness] = useState<string>();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [selected, select] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState("");
  const live = useRef(false);
  const rootSelect = useRef<HTMLSelectElement>(null);
  const cancelDelete = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (confirm) cancelDelete.current?.focus(); }, [confirm]);
  const id = useSearchStore(state => state.focusedImageId ?? state.results.find(image => image && !image.__availability)?.id);
  const tree = useCollectionStore(state => state.tree);
  useEffect(() => {
    live.current = true;
    let current = true;
    const invalidate = subscribeGridSessionInvalidation(() => { current = false; setWitness(undefined); });
    if (editingAllowedAtStartup && import.meta.env.VITE_USE_MEDIA_API === "true") {
      void hasRootCollectionAccess(id).then(allowed => { if (current && allowed) setWitness(id); });
    }
    return () => { current = false; live.current = false; invalidate(); };
  }, [id]);
  if (!witness || witness !== id || !tree) return null;
  const error = name && collectionNameError(name, tree.data.children);
  const eligible = tree.data.children.filter(node => canRemoveTreeNode(tree, node));
  const target = eligible.find(node => node.data.data!.pathId === selected);
  async function submit(path: string[], value: string | null) {
    if (sending) return;
    setSending(true); setStatus("");
    const receipt = await changeCollectionTree(path, value, witness);
    if (!live.current) { addToast({ category: receipt.observed ? "information" : "warning", message: receipt.message }); return; }
    setSending(false); setStatus(receipt.message); setConfirm(false);
    if (receipt.observed) { setName(""); select(""); requestAnimationFrame(() => rootSelect.current?.focus()); }
  }
  return <div className="px-3 py-1 text-sm text-grid-text border-b border-grid-separator">
    <button type="button" role="menuitem" aria-expanded={open} onClick={() => setOpen(!open)}>Admin</button>
    {open && <section aria-label="Root collections" className="grid gap-2 py-2"><strong>Root collections</strong>
      <form onSubmit={event => { event.preventDefault(); if (name.trim() && !error) void submit([], name); }}><label>New root collection<input disabled={sending} className="w-full border p-1" value={name} onChange={event => { setName(event.target.value); setStatus(""); }} /></label>
        {error && <p role="status">{error}</p>}<button disabled={sending || !name.trim() || !!error} className="py-1 underline disabled:opacity-50">Create root collection</button></form>
      <label>Root to delete<select ref={rootSelect} className="w-full border p-1 bg-grid-bg" disabled={sending || !eligible.length} value={target ? selected : ""} onChange={event => { select(event.target.value); setConfirm(false); setStatus(""); }}><option value="">{eligible.length ? "Choose a root" : "No eligible roots"}</option>{eligible.map(node => <option key={node.data.data!.pathId} value={node.data.data!.pathId}>{node.data.basename}</option>)}</select></label>
      {target && (confirm ? <div><p>Delete “{target.data.basename}”?</p><button ref={cancelDelete} disabled={sending} onClick={() => { setConfirm(false); rootSelect.current?.focus(); }}>Cancel</button> <button disabled={sending} onClick={() => void submit(target.data.fullPath, null)}>Delete collection</button></div> : <button onClick={() => setConfirm(true)}>Delete root…</button>)}
      <p role="status">{sending ? "Saving…" : status}</p></section>}
  </div>;
}