import { useContext, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useStore } from "zustand";
import { useDeleteConfirmation } from "@/hooks/useDeleteConfirmation";
import type { Image, Lease, LeaseAccess } from "@/types/image";
import { leaseTerms } from "@/lib/lease-change";
import { useMetadataDrafts } from "@/stores/metadata-drafts-store";
import { useDetailsDraft } from "./DetailsDrafts";
import { FieldAddButton } from "./FieldAddButton";
import { MetadataFormActions } from "./MetadataFormActions";
import { FieldSaveNote, MetadataBatchArrow, MetadataEditorContext, MetadataSaveFeedback, panelSaveAdmitted, useMetadataCommit, useSubmittedField } from "./MetadataEditing";

const names: Record<LeaseAccess, string> = { "allow-use": "Allow use", "deny-use": "Deny use", "allow-syndication": "Allow syndication", "deny-syndication": "Deny syndication" };
const blank = { access: "" as LeaseAccess | "", start: "", end: "", delay: false, expires: false, notes: "", call: false, premium: false };
function localDate(offset: number, end: boolean) {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  date.setHours(end ? 23 : 0, end ? 59 : 0, end ? 59 : 0, end ? 999 : 0);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, -1);
}

export function RemoveLease({ lease, imageId, form, disabled = false }: { lease: Lease; imageId: string; form: boolean; disabled?: boolean }) {
  const commit = useMetadataCommit(form);
  const store = useContext(MetadataEditorContext);
  const ready = useStore(store, state => !disabled && !state.hasPendingField(imageId, "leases"));
  const target = JSON.stringify([imageId, lease.id]);
  const [armed, setArmed] = useDeleteConfirmation(target, !ready);
  const confirming = ready && armed === target;
  const label = confirming ? "Confirm delete" : "Delete";
  if (!store.getState().connected) return null;
  return <button type="button" className={`float-right inline-flex items-center justify-center gap-1 rounded-sm px-1.5 min-h-6 pointer-coarse:min-h-9 cursor-pointer disabled:opacity-40 ${confirming ? "bg-grid-error text-white" : "hover:bg-grid-hover"}`} disabled={!ready} aria-label={`${label} ${names[lease.access]} lease`} onBlur={() => setArmed(null)} onKeyDown={event => {
    if (confirming && event.key === "Escape") { event.stopPropagation(); setArmed(null); }
  }} onClick={() => {
    if (!confirming) { setArmed(target); return; }
    setArmed(null);
    commit({ fieldId: "leases", action: "overwrite", value: { kind: "remove", id: lease.id }, targetIds: [imageId] });
  }}><svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13" /></svg>{label}</button>;
}

export function LeaseEditor({ ids, images, allowed, pendingGrant = false, form = false, canReplace = false, canClear = false, children }: {
  children?: ReactNode;
  ids: readonly string[]; images: readonly Image[]; allowed: boolean; pendingGrant?: boolean; form?: boolean; canReplace?: boolean; canClear?: boolean;
}) {
  const store = useContext(MetadataEditorContext);
  const connected = useStore(store, state => state.connected);
  const busy = useStore(store, state => ids.some(id => state.hasPendingField(id, "leases")));
  const commit = useMetadataCommit(form);
  const { restored, scoped, update } = useDetailsDraft<typeof blank>("leases");
  const tracking = useStore(store, state => form ? state.formLeaseSaves.get(ids[0]) : undefined);
  const retained = useMetadataDrafts(state => form ? state.drafts.get(ids[0])?.get("leases") : undefined);
  const [local, setDraft] = useState(restored);
  const draft = local ?? (retained ? JSON.parse(retained.value) as typeof blank : undefined);
  const add = useRef<HTMLButtonElement>(null);
  const accessInput = useRef<HTMLSelectElement>(null);
  const focus = useRef<"access" | "add" | undefined>(undefined);
  useLayoutEffect(() => {
    if (focus.current === "access" && accessInput.current) accessInput.current.focus();
    else if (focus.current === "add" && add.current && !add.current.disabled) {
      if (document.activeElement === document.body) add.current.focus();
    } else return;
    focus.current = undefined;
  });
  const change = (next: typeof blank | undefined) => {
    submitted.track(undefined);
    setDraft(form && next?.access ? undefined : next);
    if (!form) return update("lease", next);
    const drafts = useMetadataDrafts.getState();
    if (next) drafts.setDraft(ids[0], "leases", JSON.stringify(blank), JSON.stringify(next));
    else if (retained) drafts.clearDraft(ids[0], "leases", retained.revision);
  };
  const submitted = useSubmittedField(() => { if (!form) change(undefined); }, retained && tracking?.revision === retained.revision ? tracking.id : undefined);
  const close = () => { focus.current = "add"; submitted.track(undefined); change(undefined); };
  const records = images[0]?.leases?.leases;
  const ready = allowed && !busy && ids.length > 0 && ids.length === images.length && images.every(image => Array.isArray(image.leases?.leases));
  return <div className="lease-editor"><div className="lease-header flex items-center justify-between gap-1 text-xs font-bold text-grid-text-dim pb-1">
    <span className="lease-heading flex flex-1 items-center justify-between gap-1">Leases
      {connected && (allowed || pendingGrant) && !draft && <FieldAddButton ref={add} iconOnly label="Add lease" disabled={!ready} onClick={() => { focus.current = "access"; setDraft({ ...blank }); }} />}
    </span>
    {connected && form && <div className="lease-header-actions flex items-center gap-1">
      {form && records && (records.length ? canReplace : canClear) && <MetadataBatchArrow imageId={ids[0]} fieldId="leases" label="leases" value={{ kind: "replace", leases: records.map(leaseTerms) }} disabled={busy || !!draft} />}
    </div>}
  </div>{form && !draft && <MetadataSaveFeedback fieldId="leases" targetIds={ids} />}
  {connected && draft && <form className="usage-rights-form lease-form min-w-0 text-xs" aria-label="New lease" onBlur={event => {
    if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) focus.current = undefined;
  }} onKeyDown={event => {
    if (event.key === "Escape" && !event.nativeEvent.isComposing) { event.stopPropagation(); if (submitted.state !== "Saving…") close(); }
  }} onSubmit={event => {
    event.preventDefault();
    if (!ready || submitted.locked || !draft.access) return;
    const syndication = draft.access.endsWith("-syndication");
    const replacements = syndication ? images.flatMap(image => {
      const existing = image.leases?.leases?.find(item => item.access.endsWith("-syndication"));
      return existing ? [[image.id, existing.id] as const] : [];
    }) : [];
    if (replacements.length && !window.confirm(`Replace existing syndication leases on ${replacements.length} ${replacements.length === 1 ? "image" : "images"}?`)) return;
    const notes = [draft.call && "CALL AGENCY", draft.premium && "PREMIUM", draft.notes.trim()].filter(Boolean).join(", ");
    const save = commit({ fieldId: "leases", action: "overwrite", targetIds: ids, value: { kind: "add", approvedLeaseIds: Object.fromEntries(replacements), lease: { access: draft.access,
      ...(draft.start && { startDate: new Date(draft.start).toISOString() }), ...(draft.end && { endDate: new Date(draft.end).toISOString() }), ...(notes && { notes }) } } });
    if (!save) return;
    if (event.currentTarget.contains(document.activeElement)) focus.current = "add";
    if (form && retained) store.getState().trackFormLease(ids[0], save.id, retained.revision);
    else if (scoped && !form && panelSaveAdmitted(save, "Lease not sent")) change(undefined);
    else submitted.track(save.id);
  }}>
    {submitted.state !== "Saving…" && <FieldSaveNote state={submitted.state} />}
    <fieldset className="grid min-w-0 gap-2.5" disabled={submitted.locked}>
    <label>Access<select ref={accessInput} value={draft.access} onChange={event => { const access = event.target.value as LeaseAccess;
      const delay = !!access && access !== "deny-syndication" && draft.delay;
      const expires = access.endsWith("-use") && (!draft.access.endsWith("-use") || draft.expires);
      change({ ...blank, notes: draft.notes, access, delay, expires, start: delay ? draft.start : "", end: expires ? draft.end || localDate(2, true) : "" }); }}>
      <option value="" disabled>Choose access</option>{Object.entries(names).map(([key, name]) => <option key={key} value={key}>{name}</option>)}
    </select></label>
    {draft.access && <>{draft.access !== "deny-syndication" && <div><label className="lease-option"><input type="checkbox" checked={draft.delay} onChange={event => change({ ...draft, delay: event.target.checked, start: event.target.checked ? localDate(1, false).slice(0, 16) : "" })} />
      <span>Delay start{!draft.delay && <span className="lease-default" aria-hidden="true">Starts now</span>}</span></label>
      {draft.delay && <input aria-label="Starts" type="datetime-local" required min={draft.access === "allow-syndication" ? localDate(1, false).slice(0, 16) : undefined} max={draft.end.slice(0, 16) || undefined} value={draft.start.slice(0, 16)} onChange={event => change({ ...draft, start: event.target.value })} />}</div>}
    {draft.access !== "allow-syndication" && <div><label className="lease-option"><input type="checkbox" checked={draft.expires} onChange={event => change({ ...draft, expires: event.target.checked, end: event.target.checked ? localDate(2, true) : "" })} />
      <span>Set expiry{!draft.expires && <span className="lease-default" aria-hidden="true">No expiry</span>}</span></label>
      {draft.expires && <input aria-label="Expires" type="datetime-local" required min={draft.access === "deny-syndication" ? localDate(1, false).slice(0, 16) : draft.start.slice(0, 16) || undefined} value={draft.end.slice(0, 16)} onChange={event => change({ ...draft, end: event.target.value })} />}</div>}
    {draft.access === "allow-syndication" && <div className="flex flex-wrap gap-x-5"><label className="lease-option"><input type="checkbox" checked={draft.call} onChange={event => change({ ...draft, call: event.target.checked })} /> Call agency</label><label className="lease-option"><input type="checkbox" checked={draft.premium} onChange={event => change({ ...draft, premium: event.target.checked })} /> Premium</label></div>}
    <label>Notes<input type="text" placeholder="Optional notes" value={draft.notes} onChange={event => change({ ...draft, notes: event.target.value })} /></label></>}
    </fieldset>
    <MetadataFormActions count={ids.length} cancel={close} saving={submitted.state === "Saving…" ? "lease" : undefined} cancelDisabled={submitted.state === "Saving…"} cancelLabel={submitted.state ? "Discard draft" : "Cancel"} saveLabel="Save lease" disabled={!ready || submitted.locked || !draft.access || draft.delay && !draft.start || draft.expires && !draft.end || !!draft.start && !!draft.end && Date.parse(draft.start) >= Date.parse(draft.end)} />
  </form>}{children}</div>;
}