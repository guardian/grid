import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useSelectionStore } from "@/stores/selection-store";
import type { CollectionNode } from "@/stores/collection-store";
import { ActionSurface } from "./SelectionFab";
import { collectionNameError } from "@/lib/collection-tree-policy";
import { canRemoveTreeNode, changeCollectionTree } from "@/lib/collection-tree-command";
import { useCollectionStore } from "@/stores/collection-store";
import { addToast } from "@/stores/toast-store";
import { directMembershipCounts, membershipActionLabel } from "@/lib/collection-eligibility";

export function CollectionActionPopup({ node, trigger, onDismiss, editSelection, onObserved }: {
  node: CollectionNode; trigger: HTMLButtonElement; onDismiss: () => void;
  onObserved: (path: string[], deleted: boolean) => void;
  editSelection?: (action: "add" | "remove", pathId: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const strip = useRef<HTMLDivElement>(null);
  const shell = useRef<HTMLDivElement>(null);
  const [placement, setPlacement] = useState({ below: true, shiftX: 0, maxHeight: 320 });
  const [closing, setClosing] = useState(false);
  const sheet = trigger.closest<HTMLElement>("[data-side-sheet]");
  const selectedIds = useSelectionStore(state => state.selectedIds);
  const revision = useSelectionStore(state => state.metadataRevision);
  const selected = selectedIds.size;
  const pathId = node.data.data?.pathId;
  const counts = useMemo(() => {
    const { metadataCache } = useSelectionStore.getState();
    return directMembershipCounts(selectedIds, pathId, id => metadataCache.peek(id));
  }, [selectedIds, pathId, revision]);
  const { direct, unknown } = counts;
  const [view, setView] = useState<"menu" | "create" | "delete">("menu");
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const mounted = useRef(false);
  useLayoutEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const tree = useCollectionStore(state => state.tree);
  async function submit(value: string | null) {
    if (sending) return;
    setSending(true); setMessage("");
    const receipt = await changeCollectionTree(node.data.fullPath, value);
    if (!mounted.current) { addToast({ category: receipt.observed ? "information" : "warning", message: receipt.message }); return; }
    setSending(false);
    if (!receipt.observed) { setMessage(receipt.message); return; }
    addToast({ category: "information", message: receipt.message });
    onObserved(value === null ? node.data.fullPath.slice(0,-1) : [...node.data.fullPath, value.trim()], value === null);
    onDismiss();
  }
  const path = node.data.fullPath.join(" / ");
  const nameError = name ? collectionNameError(name, node.data.children) : undefined;
  const permits = (name: string, method: string) => node.actions.some(action => typeof action === "object" && action !== null && "name" in action && action.name === name && "method" in action && action.method === method);
  const close = () => { setClosing(true); trigger.focus({ preventScroll: true }); };
  useEffect(() => {
    if (!closing) return;
    const timer = setTimeout(onDismiss, 160);
    return () => clearTimeout(timer);
  }, [closing, onDismiss]);
  useLayoutEffect(() => {
    const popup = ref.current!;
    const place = () => {
      const anchor = trigger.getBoundingClientRect();
      const visual = window.visualViewport;
      const top = visual?.offsetTop ?? 0, left = visual?.offsetLeft ?? 0;
      const bottom = top + (visual?.height ?? innerHeight);
      const below = bottom - anchor.bottom - 8, above = anchor.top - top - 8;
      const opensBelow = below >= popup.scrollHeight || below >= above;
      const maxHeight = Math.max(60, opensBelow ? below : above);
      const shiftX = Math.max(left + 8 + popup.offsetWidth, Math.min(anchor.right, left + (visual?.width ?? innerWidth) - 8)) - anchor.right;
      const bounds = sheet?.getBoundingClientRect();
      Object.assign(shell.current!.style, { left: `${anchor.left - (bounds?.left ?? 0)}px`, top: `${anchor.top - (bounds?.top ?? 0)}px`, width: `${anchor.width}px`, height: `${anchor.height}px` });
      setPlacement(current => current.below === opensBelow && current.shiftX === shiftX && current.maxHeight === maxHeight ? current : { below: opensBelow, shiftX, maxHeight });
    };
    const isOutside = (event: Event) => !shell.current?.contains(event.target as Node) && !trigger.contains(event.target as Node);
    const outside = (event: PointerEvent) => {
      if (!isOutside(event)) return;
      if (sheet) event.preventDefault(); else setClosing(true);
    };
    const dismissOnTap = (event: MouseEvent) => {
      if (!sheet || popup.inert || !isOutside(event)) return;
      event.preventDefault(); event.stopPropagation(); close();
    };
    place();
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(place) : null;
    observer?.observe(popup);
    document.addEventListener("click", dismissOnTap, true);
    document.addEventListener("pointerdown", outside, true); window.addEventListener("scroll", place, true); window.addEventListener("resize", place);
    window.visualViewport?.addEventListener("resize", place); window.visualViewport?.addEventListener("scroll", place);
    return () => { observer?.disconnect(); document.removeEventListener("click", dismissOnTap, true); document.removeEventListener("pointerdown", outside, true); window.removeEventListener("scroll", place, true); window.removeEventListener("resize", place); window.visualViewport?.removeEventListener("resize", place); window.visualViewport?.removeEventListener("scroll", place); };
  }, [trigger, onDismiss, sheet]);
  useLayoutEffect(() => { ref.current?.querySelector<HTMLElement>(view === "create" ? "input" : "button")?.focus({ preventScroll: true }); }, [view]);
  function membership(action: "add" | "remove") { close(); if (node.data.data) editSelection?.(action, node.data.data.pathId); }
  return createPortal(<div ref={shell} className="selection-fab collection-actions-shell" data-side={placement.below ? "below" : "above"}>
    <ActionSurface strip={strip} popup={ref} visible below={placement.below} shiftX={placement.shiftX} maxHeight={placement.maxHeight} />
    <div ref={strip} className="selection-fab-trigger collection-actions-cap" aria-hidden="true" onClick={close}>
      <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>
    </div>
    <div ref={ref} role="dialog" aria-label={`Collection actions for ${path}`} className={`collection-actions-popup selection-fab-options absolute right-0 grid text-white ${placement.below ? 'top-full' : 'bottom-full'}`}
    style={{ translate: `${placement.shiftX}px 0`, maxHeight: placement.maxHeight }} data-closing={closing || undefined} inert={closing} aria-hidden={closing || undefined}
    onBlur={event => { if (event.relatedTarget instanceof Node && !trigger.contains(event.relatedTarget) && !event.currentTarget.contains(event.relatedTarget)) setClosing(true); }}
    onKeyDown={event => { event.stopPropagation(); if (event.key === "Escape") { event.preventDefault(); close(); } }}>
    <strong className="collection-action-path">{path}</strong>
    {view === "menu" ? <>
      {permits("add-child", "POST") && <button className="selection-fab-detail" onClick={() => setView("create")}>New subcollection</button>}
      {node.data.fullPath.length > 1 && tree && canRemoveTreeNode(tree, node) && <button className="selection-fab-detail" onClick={() => setView("delete")}>Delete collection…</button>}
      {selected > 0 && editSelection && <div className="collection-membership-options">
        <button className="selection-fab-detail" onClick={() => membership("add")}>{membershipActionLabel("add", counts)}</button>
        {(unknown > 0 || direct > 0) && <button className="selection-fab-detail" onClick={() => membership("remove")}>{membershipActionLabel("remove", counts)}</button>}
      </div>}
      <button className="selection-fab-detail" onClick={close}>Close</button>
    </> : view === "create" ? <form onSubmit={event => { event.preventDefault(); if (name.trim() && !nameError) void submit(name); }}>
      <label>Subcollection name<input disabled={sending} value={name} aria-invalid={!!nameError} aria-describedby={nameError ? "collection-name-error" : undefined} onChange={event => { setName(event.target.value); setMessage(""); }} /></label>
      {nameError && <p id="collection-name-error" role="status">{nameError}</p>}
      <button type="submit" disabled={sending || !name.trim() || !!nameError} className="selection-fab-detail disabled:opacity-50">{sending ? "Creating…" : "Create"}</button><button type="button" disabled={sending} className="selection-fab-detail" onClick={close}>Cancel</button>
      <p role="status">{message}</p>
    </form> : <><p className="collection-action-path">Delete “{path}”?</p><button disabled={sending} className="selection-fab-detail" onClick={close}>Cancel</button><button disabled={sending} className="selection-fab-detail" onClick={() => void submit(null)}>Delete collection</button><p role="status">{message}</p></>}
  </div></div>, sheet ?? document.body);
}