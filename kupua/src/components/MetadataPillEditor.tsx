import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { DetailsTargetCount, useDetailsDraft } from "./DetailsDrafts";
import type { FieldDefinition } from "@/lib/field-registry";
import { EditableSearchPill, PillActionButton, visibleEditorPills } from "./SearchPill";
import { FieldAddButton } from "./FieldAddButton";
import { FieldDisclosure } from "./FieldDisclosure";
import { Dash, MetadataBlock } from "./metadata-primitives";
import { MetadataSuggestionInput } from "./MetadataSuggestionInput";
import type { MetadataEditIntent } from "./MetadataTextEditor";
import { MetadataSaveFeedback, panelSaveAdmitted, useMetadataCommit, usePendingPillIntents, SubjectSaveStatus } from "./MetadataEditing";
import { labelTargetKey } from "@/stores/label-editor-store";
import { addressableLabel } from "@/lib/grid-mutation-policy";

import { SUBJECTS, pillCommandField } from "@/lib/metadata-pill-fields";
import type { collectionEligibility } from "@/lib/collection-eligibility";

export const PILL_EDIT_FIELDS = new Set(["keywords", "collections", "people", "subjects"]);

export function MetadataPillEditor({ field, targetIds, values, onSearch, onPrepare, collectionPaths, collectionGrants, collectionPending = false, available: dataAvailable = true, editable = true, retainReading = false, allowQueuedAdd = false, readOnly, form = false }: {
  form?: boolean;
  field: FieldDefinition;
  targetIds: readonly string[];
  values: readonly { value: string; count: number }[];
  onSearch: (key: string, value: string, event: React.MouseEvent) => void;
  onPrepare?: (intent: MetadataEditIntent) => void;
  collectionPaths?: ReadonlyMap<string, readonly string[]>;
  collectionGrants?: ReturnType<typeof collectionEligibility>;
  collectionPending?: boolean;
  available?: boolean;
  retainReading?: boolean;
  allowQueuedAdd?: boolean;
  editable?: boolean;
  readOnly?: ReactNode;
}) {
  const panelTargetKey = labelTargetKey(targetIds);
  const commit = useMetadataCommit(form, panelTargetKey);
  const pending = usePendingPillIntents(panelTargetKey, pillCommandField(field.id), form ? targetIds[0] : undefined);
  const bounded = field.id === "subjects";
  const available = dataAvailable && editable;
  const canAdd = (available || allowQueuedAdd) && (collectionGrants?.add ?? true);
  const { restored, update } = useDetailsDraft<string | Record<string, boolean>>(field.id);
  const [adding, setAdding] = useState(Boolean(restored));
  const [draft, setDraft] = useState(typeof restored === "string" ? restored : "");
  const [changes, setChanges] = useState<Record<string, boolean>>(typeof restored === "object" ? restored : {});
  const dirty = Object.keys(changes).length > 0;
  useLayoutEffect(() => { if (!form) update(field.label, adding ? bounded ? dirty ? changes : undefined : draft.trim() ? draft : undefined : undefined); });
  const [notice, setNotice] = useState("");
  const [expanded, setExpanded] = useState(false);
  const id = useId();
  const header = useRef<HTMLDivElement>(null);
  const addRef = useRef<HTMLButtonElement>(null);
  const chooser = useRef<HTMLFieldSetElement>(null);
  const [lastSubjectSave, setLastSubjectSave] = useState<number>();
  useLayoutEffect(() => { if (bounded && adding) chooser.current?.querySelector<HTMLInputElement>('input:not(:disabled)')?.focus(); }, [bounded, adding]);
  useEffect(() => { if (adding) return () => { addRef.current?.focus(); }; }, [adding]);
  const collection = field.id === "collections";
  const lastSettledVisible = useRef<boolean | undefined>(undefined);
  useLayoutEffect(() => {
    if (collection && !collectionPending) lastSettledVisible.current = editable;
  }, [collection, collectionPending, editable]);
  const noun = collection ? "collection" : field.id === "people" ? "person"
    : field.id === "subjects" ? "subject" : field.id === "labels" ? "label" : "keyword";
  const hasAll = (value: string) => values.some(item => item.value === value.trim() && item.count === targetIds.length);
  const closeChooser = () => { setAdding(false); setChanges({}); addRef.current?.focus(); };
  const canCommit = dirty && canAdd && (available || Object.values(changes).every(Boolean)) && pending.length === 0;
  const commitChooser = () => {
    if (!canCommit) return;
    const value = SUBJECTS.filter(subject => changes[subject] === true);
    const removed = SUBJECTS.filter(subject => changes[subject] === false);
    const save = commit({ fieldId: "subjects", action: "add", value, removed, targetIds }, addRef.current);
    setLastSubjectSave(save?.id);
    if (panelSaveAdmitted(save, "Not sent - Subjects edit unavailable.")) closeChooser();
  };
  const prepare = (action: "add" | "remove", value: string) => {
    if (field.id === "labels" && !addressableLabel(action === "add" ? value.trim() : value)) {
      setNotice("This label cannot be addressed by Grid. No change was sent."); return;
    }
    const allowed = action === "add" ? canAdd || available && collectionGrants?.canFill(value) : available && (collectionGrants?.removable.has(value) ?? true);
    if (!allowed || !value.trim() || !targetIds.length || action === "add" && (hasAll(value) || bounded && !SUBJECTS.includes(value))) return;
    const normalized = action === "remove" ? value : value.trim();
    const recipients = collectionGrants?.affectedIds(action, normalized) ?? [...targetIds];
    if (!recipients.length) return;
    const intent: MetadataEditIntent = { fieldId: field.id, action, value: normalized, targetIds: recipients };
    const submitted = onPrepare ? (onPrepare(intent), undefined) : commit(intent, addRef.current);
    if (bounded) setLastSubjectSave(submitted?.id);
    const message = `Not sent - ${action === "add" ? "Add" : "Remove"} ${noun} prepared for ${intent.targetIds.length} ${intent.targetIds.length === 1 ? "image" : "images"}.`;
    if (form) setNotice(submitted === undefined ? message : "");
    const admitted = form ? submitted?.state !== "finished" : panelSaveAdmitted(submitted, message) || !submitted;
    if (admitted && action === "add" && value === draft) { setAdding(false); setDraft(""); }
  };
  if (!adding && collectionPending && lastSettledVisible.current === false) return readOnly ?? null;
  if (!editable && !adding && !(collectionPending && lastSettledVisible.current)) return readOnly ?? null;
  return <MetadataBlock ref={header} tabIndex={-1} label={field.label} action={
    <span className={adding && !bounded ? "invisible" : ""} aria-hidden={adding && !bounded || undefined}>
      <FieldAddButton ref={addRef} iconOnly label={bounded ? "Choose subjects" : `Add ${noun}`} expanded={bounded ? adding : undefined} controls={bounded && adding ? `${id}-subjects` : undefined} disabled={!canAdd || adding && !bounded} onClick={() => { if (adding) closeChooser(); else setAdding(true); setDraft(""); setNotice(""); }} />
    </span>
  }>
      <div id={id} className="flex min-w-0 flex-wrap items-start gap-1 pt-0.5">
        {!dataAvailable && !retainReading && <Dash />}
        {visibleEditorPills(values, expanded, pending).map(item => <EditableSearchPill key={item.value} value={item.value} pending={item.pending}
          cqlKey={field.cqlKey!} accent={field.id === "labels"} count={item.count} total={targetIds.length} onSearch={onSearch} disabled={!available || !!collectionGrants && !collectionGrants.removable.has(item.value)} addDisabled={collectionGrants ? !available || !collectionGrants.canFill(item.value) : !canAdd || bounded && !SUBJECTS.includes(item.value)} coverageKnown={dataAvailable || retainReading}
          onAdd={() => prepare("add", item.value)} onRemove={() => prepare("remove", item.value)}
          label={collection ? <span className="inline-flex max-w-full flex-wrap items-center gap-x-1">
            {(collectionPaths?.get(item.value) ?? item.value.split("/")).map((part, index) => <span key={index} className="inline-flex min-w-0 items-center gap-1">
              {index > 0 && <svg width="12" height="12" className="shrink-0" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z" /></svg>}
              <span className="min-w-0 wrap-anywhere">{part}</span>
            </span>)}
          </span> : undefined} />)}
      </div>
      <FieldDisclosure expanded={expanded} hasMore={values.length > 20} controlsId={id} anchorRef={header}
        onExpand={() => setExpanded(true)} onCollapse={() => setExpanded(false)} />
    {bounded && lastSubjectSave !== undefined && <SubjectSaveStatus id={lastSubjectSave} />}
    {bounded && adding && <fieldset ref={chooser} id={`${id}-subjects`} aria-label="Choose subjects" onKeyDown={event => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); closeChooser(); }
    }}>
      <div className="mt-1 grid grid-flow-col grid-cols-2 gap-x-1 border border-grid-border bg-grid-cell p-1" style={{ gridTemplateRows: `repeat(${Math.ceil(SUBJECTS.length / 2)}, auto)` }}>
        {SUBJECTS.map(subject => {
          const count = values.find(item => item.value === subject)?.count ?? 0;
          const saving = pending.findLast(intent => intent.action === "overwrite" || ("removed" in intent && intent.removed?.includes(subject)) ||
            (Array.isArray(intent.value) ? intent.value.includes(subject) : intent.value === subject));
          const checked = changes[subject] ?? (saving ? saving.action === "add" && (Array.isArray(saving.value) ? saving.value.includes(subject) : saving.value === subject) : count > 0 && count === targetIds.length);
          const mixed = count > 0 && count < targetIds.length;
          const partial = !saving && mixed && changes[subject] === undefined;
          const blocked = !targetIds.length || (checked ? !available : !canAdd);
          return <label key={subject} className="flex min-h-6 items-center gap-1 px-1 pointer-coarse:min-h-[var(--mobile-edit-control-size)]">
            <input type="checkbox" className="accent-grid-accent" checked={checked} aria-busy={!!saving || undefined}
              ref={input => { if (input) input.indeterminate = partial; }} disabled={!saving && blocked} aria-disabled={saving ? true : undefined}
              onChange={event => {
                if (saving || blocked) return;
                const next = { ...changes }, wanted = event.target.checked;
                if (mixed ? changes[subject] === false : wanted === hasAll(subject)) delete next[subject];
                else next[subject] = wanted;
                setChanges(next);
              }} />{subject}
          </label>;
        })}
      </div>
      <div className="metadata-edit-footer justify-end">
        {dirty && <DetailsTargetCount count={targetIds.length} />}
        <PillActionButton action="cancel" label="Cancel subject changes" onClick={closeChooser} />
        <PillActionButton action="confirm" label="Commit subject changes" disabled={!canCommit} onClick={commitChooser} />
      </div>
    </fieldset>}
    {adding && !bounded && <form className="metadata-edit-form" onSubmit={event => { event.preventDefault(); prepare("add", draft); }} onKeyDown={event => {
      if (event.nativeEvent.isComposing) return;
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setAdding(false); setDraft(""); setNotice(""); }
      else if (event.key === "Enter") event.stopPropagation();
    }}>
      <MetadataSuggestionInput label={`New ${noun}`} fieldKey={field.cqlKey!} value={draft} onChange={value => { setDraft(value); setNotice(""); }} />
      <div className="metadata-edit-footer justify-end">
        {draft.trim() && <DetailsTargetCount count={targetIds.length} />}
        <PillActionButton action="cancel" label={`Cancel new ${noun}`} onClick={() => { setAdding(false); setNotice(""); }} />
        <PillActionButton action="confirm" label={`Commit new ${noun}`} disabled={!canAdd || !draft.trim() || hasAll(draft)} onClick={() => prepare("add", draft)} />
      </div>
    </form>}
    {notice && <p role="status" className="mt-1 text-xs text-grid-text-muted">{notice}</p>}
    {form && <MetadataSaveFeedback fieldId={field.id} targetIds={targetIds} />}
  </MetadataBlock>;
}