import { memo, useContext, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import type { FieldDefinition } from "@/lib/field-registry";
import { MetadataBlock, MetadataRow } from "./metadata-primitives";
import { PillActionButton } from "./SearchPill";
import { MetadataSuggestionInput } from "./MetadataSuggestionInput";
import { DetailsTargetCount, useDetailsDraft } from "./DetailsDrafts";
import { MetadataDateInput } from "./MetadataDateInput";
import { gridConfig } from "@/lib/grid-config";
import { useMetadataDrafts } from "@/stores/metadata-drafts-store";
import { MetadataBatchArrow, MetadataEditorContext, MetadataSaveFeedback, SavingValue, FieldSaveNote, useSubmittedField, useDerivedFieldState, panelSaveAdmitted, useMetadataCommit, usePendingPanelIntent } from "./MetadataEditing";
import { labelTargetKey } from "@/stores/label-editor-store";

export type MetadataLocationChange = Partial<Record<"subLocation" | "city" | "state" | "country", string>>;

export interface MetadataEditIntent {
  fieldId: string;
  targetIds: readonly string[];
  action: "overwrite" | "prepend" | "append" | "add" | "remove";
  value: string | MetadataLocationChange;
}

function MetadataPencil() {
  return <svg width="16" height="16" className="inline-block align-text-bottom" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m15 5 4 4M4 20l4-1L20 7a2.8 2.8 0 0 0-4-4L4 15z" /></svg>;
}

export function MetadataEditHint({ label, mixed = false, furtherInstructions = false, children, onClick, disabled }: {
  label: string; mixed?: boolean; furtherInstructions?: boolean; children?: ReactNode; onClick: () => void; disabled?: boolean;
}) {
  return <button type="button" disabled={disabled} onClick={onClick} aria-label={`${mixed ? "Edit all" : "Add"} ${label}`}
    className={`text-left text-grid-text-dim cursor-pointer${mixed ? " italic" : ""}`}>
    {mixed ? <>{children} (click <MetadataPencil /> to edit <strong>all</strong>)</>
      : furtherInstructions ? <>Click <MetadataPencil /> to add further instructions</>
      : <>Unknown (click <MetadataPencil /> to add)</>}
  </button>;
}

export function MetadataEditButton({ label, editing, disabled, onClick, ref }: {
  label: string; editing: boolean; disabled: boolean; onClick: () => void; ref?: React.Ref<HTMLButtonElement>;
}) {
  return <span className={editing ? "invisible" : ""} aria-hidden={editing || undefined}>
    <button ref={ref} type="button" disabled={disabled || editing} aria-label={`Edit ${label}`} title={`Edit ${label}`}
      className="metadata-edit-tool metadata-pencil" onClick={onClick}>
      <MetadataPencil />
    </button>
  </span>;
}

export const METADATA_EDIT_CONTROLS: ReadonlyMap<string, "text" | "textarea" | "datetime-local" | "image-type"> = new Map([
  ["metadata_title", "textarea"], ["metadata_description", "textarea"], ["metadata_specialInstructions", "textarea"],
  ["metadata_byline", "text"], ["metadata_credit", "text"], ["metadata_copyright", "text"],
  ["metadata_dateTaken", "datetime-local"], ["metadata_imageType", "image-type"], ["photoshoot", "text"],
]);

const MIXED_VALUE_NAMES: ReadonlyMap<string, string> = new Map([
  ["metadata_title", "titles"], ["metadata_description", "descriptions"],
  ["metadata_specialInstructions", "special instructions"], ["metadata_byline", "bylines"],
  ["metadata_credit", "credits"], ["metadata_copyright", "copyrights"],
  ["metadata_dateTaken", "dates"], ["metadata_imageType", "image types"], ["photoshoot", "photoshoots"],
]);

function dateTimeDraft(value: string): string {
  if (!value) return "";
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, -1) : "";
}

export function MetadataTextInput({ field, value, onChange, placeholder, autoFocus = true, natural = false,
  required = false, readOnly = false, textareaRef }: {
  field: FieldDefinition; value: string; onChange: (value: string) => void; placeholder?: string;
  autoFocus?: boolean; natural?: boolean; required?: boolean; readOnly?: boolean;
  textareaRef?: React.Ref<HTMLTextAreaElement>;
}) {
  return METADATA_EDIT_CONTROLS.get(field.id) === "textarea"
    ? <textarea ref={textareaRef} autoFocus={autoFocus} aria-label={field.label} rows={natural ? 1 : 4}
      value={value} placeholder={placeholder} required={required} readOnly={readOnly}
      style={natural ? { fieldSizing: "content" } : undefined} onChange={event => onChange(event.target.value)} />
    : METADATA_EDIT_CONTROLS.get(field.id) === "image-type"
    ? <select aria-label={field.label} value={value} disabled={readOnly} onChange={event => onChange(event.target.value)}>
      <option value="">{natural ? "───  choose type  ───" : "Unknown"}</option>
      {value && !gridConfig.imageTypes.includes(value) && <option value={value}>{value}</option>}
      {gridConfig.imageTypes.map(value => <option key={value} value={value}>{value}</option>)}
    </select>
    : METADATA_EDIT_CONTROLS.get(field.id) === "datetime-local"
    ? <input type="datetime-local" step="1" aria-label={field.label} value={value.slice(0, 19)} autoFocus={autoFocus}
      readOnly={readOnly} onChange={event => {
        const input = event.currentTarget;
        const next = input.value.slice(0, 19);
        if (input.validity.valid && next) onChange(next.length === 16 ? `${next}:00` : next);
      }} />
    : <MetadataSuggestionInput label={field.label} fieldKey={field.cqlKey ?? field.id} value={value}
      placeholder={placeholder} autoFocus={autoFocus} required={required} readOnly={readOnly} onChange={onChange} />;
}

export const MetadataFormField = memo(function MetadataFormField({ imageId, field, value, editable, pendingGrant = false, required = false, editorialGuidance = false }: {
  imageId: string; field: FieldDefinition; value: string; editable: boolean; pendingGrant?: boolean; required?: boolean; editorialGuidance?: boolean;
}) {
  const editor = useContext(MetadataEditorContext);
  const composing = useRef(false);
  const [editingHere, setEditingHere] = useState(false);
  useEffect(() => {
    if (!pendingGrant && !composing.current) editor.getState().settleDraftGrant(imageId, field.id, editable);
  }, [pendingGrant, editable, imageId, field.id, editor]);
  const draft = useMetadataDrafts(state => state.drafts.get(imageId)?.get(field.id));
  const baseline = field.id === "metadata_dateTaken" ? dateTimeDraft(value) : value;
  const derived = useDerivedFieldState([imageId], field.id);
  const displayed = draft?.value ?? baseline;
  const placeholder = !editorialGuidance ? undefined : field.id === "metadata_description"
    ? "Give some context about the image including who, what, where, when and why"
    : field.id === "metadata_byline" ? "Author’s name ONLY, leave empty if unknown"
    : field.id === "metadata_credit" ? "Source, agency or institution which owns the image" : undefined;
  const shortDescription = editorialGuidance && field.id === "metadata_description"
    && (displayed.length < 30 || displayed.split(" ").length < 5);
  return <div data-measured-field={field.id} data-metadata-field="" data-suggestion-width="" className="metadata-form-field"
    onFocus={event => { if (editable && event.target.matches("input,textarea,select")) setEditingHere(true); }}
    onCompositionStart={() => { composing.current = true; editor.getState().pause(imageId, field.id); }}
    onCompositionEnd={() => { composing.current = false; if (editable) editor.getState().schedule(imageId, field.id); else if (pendingGrant) editor.getState().deferDraft(imageId, field.id); }}
    onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) { setEditingHere(false); if (!composing.current && editable) editor.getState().flush(imageId, field.id); } }}>
    <div className="flex items-baseline justify-between gap-2 text-xs text-grid-text-dim">
      <span>{field.label}{required && <span className="text-grid-error"> *</span>}</span>
      {derived && !draft && <FieldSaveNote state={derived} />}
    </div>
    <div className="metadata-form-input" data-field-state={!draft ? derived : undefined} data-grant-pending={pendingGrant || undefined}>
    <MetadataTextInput field={field} value={displayed} placeholder={placeholder} autoFocus={false} natural required={required} readOnly={!editable && !(editingHere && pendingGrant)}
      onChange={next => {
      if (!editable && !(editingHere && pendingGrant)) return;
        const nextValue = field.id !== "metadata_dateTaken" || !next ? next
          : next === baseline.slice(0, 19) ? baseline : `${next}.000`;
        const pending = editor.getState().hasPendingField(imageId, field.id);
        const dateInstant = field.id === "metadata_dateTaken" && nextValue
          ? nextValue === baseline ? value : dateTimeIntent(nextValue, baseline ? new Date(value).getTimezoneOffset() : null)
          : undefined;
        useMetadataDrafts.getState().setDraft(imageId, field.id, baseline, nextValue, pending, dateInstant);
        if (!editable && pendingGrant) editor.getState().deferDraft(imageId, field.id);
        if (!composing.current && editable) editor.getState().schedule(imageId, field.id);
      }} />
    <MetadataBatchArrow imageId={imageId} fieldId={field.id} label={field.label} value={draft?.dateInstant ?? draft?.value ?? value} disabled={!editable || composing.current} />
    </div>
    <MetadataSaveFeedback fieldId={field.id} targetIds={[imageId]} />
    {shortDescription && <p className="text-xs text-grid-warning">Your description is too short! Ideally, please state who, what, where, when and why.</p>}
  </div>;
});

function dateTimeIntent(value: string, originalOffset: number | null): string {
  const date = new Date(value);
  if (originalOffset === null) return date.toISOString();
  const alternate = new Date(date.getTime() + (originalOffset - date.getTimezoneOffset()) * 60_000);
  return dateTimeDraft(alternate.toISOString()) === dateTimeDraft(date.toISOString()) ? alternate.toISOString() : date.toISOString();
}

export function MetadataTextEditor({ field, targetIds, selectionKey, retainHint, reconciling, value, mixed = false, children, onPrepare, available: dataAvailable = true, furtherInstructions = false, editable = true, readOnly }: {
  reconciling?: boolean;
  selectionKey?: string;
  retainHint?: boolean;
  field: FieldDefinition;
  targetIds: readonly string[];
  value: string;
  mixed?: boolean;
  children: ReactNode;
  onPrepare?: (intent: MetadataEditIntent) => void;
  available?: boolean;
  furtherInstructions?: boolean;
  editable?: boolean;
  readOnly?: ReactNode;
}) {
  const commit = useMetadataCommit();
  const pending = usePendingPanelIntent(selectionKey ?? labelTargetKey(targetIds), field.id, reconciling);
  const derived = useDerivedFieldState(targetIds, field.id);
  const available = dataAvailable && editable && !pending;
  type Mode = "overwrite" | "prepend" | "append";
  const { restored, update } = useDetailsDraft<{ initial: string; initialMixed: boolean; drafts: Record<Mode, string>;
    mode: Mode; overwriteEdited: boolean; inputValid: boolean; dateParts?: import("./MetadataDateInput").DateParts; typeTouched: boolean; originalOffset: number | null }>(field.id);
  const [editing, setEditing] = useState(Boolean(restored));
  const submitted = useSubmittedField(() => setEditing(false));
  const [initial, setInitial] = useState(restored?.initial ?? "");
  const [initialMixed, setInitialMixed] = useState(restored?.initialMixed ?? mixed);
  const [drafts, setDrafts] = useState(restored?.drafts ?? { overwrite: "", prepend: "", append: "" });
  const [mode, setMode] = useState<Mode>(restored?.mode ?? "overwrite");
  const editRef = useRef<HTMLButtonElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [inputValid, setInputValid] = useState(restored?.inputValid ?? true);
  const [typeTouched, setTypeTouched] = useState(restored?.typeTouched ?? false);
  const [originalOffset, setOriginalOffset] = useState<number | null>(restored?.originalOffset ?? null);
  const [dateParts, setDateParts] = useState(restored?.dateParts);
  const [overwriteEdited, setOverwriteEdited] = useState(restored?.overwriteEdited ?? false);
  const [needsBaseline, setNeedsBaseline] = useState(Boolean(restored));
  if (needsBaseline && available) {
    const next = mixed ? "" : field.id === "metadata_dateTaken" ? dateTimeDraft(value) : value;
    if (!overwriteEdited && !dateParts) setDrafts({ ...drafts, overwrite: next });
    setInitial(next);
    setInitialMixed(mixed);
    setNeedsBaseline(false);
  }
  useLayoutEffect(() => {
    update(field.label, editing && !submitted.locked && (overwriteEdited || drafts.prepend.trim() !== "" || drafts.append.trim() !== "" || !inputValid)
      ? { initial, initialMixed, drafts, mode, overwriteEdited, inputValid, dateParts, typeTouched, originalOffset } : undefined);
  });
  const validationId = useId();
  useEffect(() => { if (editing) return () => { editRef.current?.focus(); }; }, [editing]);
  useLayoutEffect(() => {
    const input = textareaRef.current;
    if (editing && input) input.setSelectionRange(input.value.length, input.value.length);
  }, [editing]);
  const control = METADATA_EDIT_CONTROLS.get(field.id) ?? "text";
  const multiline = control === "textarea";
  const description = field.id === "metadata_description" && (targetIds.length > 1 || mode !== "overwrite" || drafts.prepend !== "" || drafts.append !== "");
  const draft = drafts[mode];
  const editingMixed = editing ? initialMixed : mixed;
  const mixedPlaceholder = editingMixed && mode === "overwrite" ? `Multiple ${MIXED_VALUE_NAMES.get(field.id) ?? field.label.toLowerCase()}` : undefined;
  const normalizedDraft = field.id === "photoshoot" ? draft.trim() : draft;
  const normalizedInitial = field.id === "photoshoot" ? initial.trim() : initial;
  const validDraft = inputValid && (control !== "datetime-local" || draft !== "");
  let changed: boolean;
  if (mode !== "overwrite") {
    changed = draft.trim().length > 0;
  } else if (editingMixed) {
    changed = control !== "image-type" || typeTouched;
  } else {
    changed = normalizedDraft !== normalizedInitial;
  }
  const beginEditing = () => {
    const baseline = mixed ? "" : control === "datetime-local" ? dateTimeDraft(value) : value;
    const offset = control === "datetime-local" && value ? new Date(value).getTimezoneOffset() : NaN;
    setOriginalOffset(Number.isFinite(offset) ? offset : null);
    setDateParts(undefined);
    setOverwriteEdited(false);
    setInitial(baseline);
    setInitialMixed(mixed);
    setDrafts({ overwrite: baseline, prepend: "", append: "" });
    setMode("overwrite");
    setInputValid(true);
    setTypeTouched(false);
    setEditing(true);
  };
  const cancelEditing = () => {
    submitted.track(undefined);
    setEditing(false);
  };
  const updateDraft = (value: string) => {
    submitted.track(undefined);
    if (mode === "overwrite") setOverwriteEdited(editingMixed || (field.id === "photoshoot" ? value.trim() : value) !== normalizedInitial);
    setDrafts(current => ({ ...current, [mode]: value }));
  };
  const changeMode = (nextMode: typeof mode) => {
    setMode(nextMode);
  };
  const prepare = () => {
    if (!available || submitted.locked || !targetIds.length || !changed) return;
    if (!validDraft || !formRef.current?.checkValidity()) return;
    const prepared = control === "datetime-local" && draft ? dateTimeIntent(draft, originalOffset) : normalizedDraft;
    const intent: MetadataEditIntent = { fieldId: field.id, targetIds: [...targetIds], action: mode, value: prepared };
    const save = onPrepare ? (onPrepare(intent), undefined) : commit(intent, editRef.current);
    if (save) submitted.track(save.id);
    else panelSaveAdmitted(save, `Not sent - ${field.label} change prepared for ${intent.targetIds.length} ${intent.targetIds.length === 1 ? "image" : "images"}.`);
  };
  const stacked = field.detailLayout === "stacked" || editing && control === "datetime-local";
  const Layout = stacked ? MetadataBlock : MetadataRow;
  if (!editable && !editing && !pending) return readOnly ?? null;
  return <Layout label={field.label} {...(stacked ? {} : { fill: true })} action={
    <MetadataEditButton ref={editRef} label={field.label} editing={editing} disabled={!available} onClick={beginEditing} />
  }>
    {!editing && (pending || derived) ? <SavingValue saving={!!pending} state={pending ? "Saving…" : derived}>{pending?.action === "overwrite" && typeof pending.value === "string" ? <span className="whitespace-pre-wrap">{pending.value || "Unknown"}</span> : children}</SavingValue> : !editing ?
      (available || retainHint) && (mixed || !value) ? <MetadataEditHint label={field.label} mixed={mixed} disabled={!available}
      furtherInstructions={furtherInstructions} onClick={beginEditing}>{children}</MetadataEditHint>
      : children : <fieldset disabled={submitted.locked} className="min-w-0"><form ref={formRef} data-field-state={submitted.state} className={`metadata-edit-form${multiline ? "" : " metadata-scalar-edit-form"}`} onSubmit={event => { event.preventDefault(); prepare(); }} onKeyDown={event => {
      if (event.nativeEvent.isComposing) return;
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); cancelEditing(); }
      else if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) { event.preventDefault(); event.stopPropagation(); prepare(); }
      else if (event.key === "Enter") event.stopPropagation();
    }}>
      <FieldSaveNote state={submitted.state} />
      {multiline ? <MetadataTextInput field={field} textareaRef={textareaRef} value={draft} placeholder={mixedPlaceholder} onChange={updateDraft} />
        : control === "datetime-local" ? <MetadataDateInput initialValue={initial} restoredParts={dateParts} mixed={editingMixed} validationId={validationId}
          onChange={(value, valid, parts) => { updateDraft(value); setInputValid(valid); setDateParts(parts); }} />
        : control === "image-type" ? <select autoFocus aria-label={field.label} data-mixed={editingMixed && !typeTouched || undefined}
          value={editingMixed && !typeTouched ? "mixed" : draft === "" ? "clear" : String(gridConfig.imageTypes.indexOf(draft))}
          onChange={event => {
            const next = event.target.value === "clear" ? "" : gridConfig.imageTypes[Number(event.target.value)];
            if (next === undefined) return;
            updateDraft(next);
            setTypeTouched(true);
          }}>
          {editingMixed && !typeTouched && <option value="mixed" disabled>{mixedPlaceholder}</option>}
          <option value="clear">Unknown</option>
          {initial && !gridConfig.imageTypes.includes(initial) && <option value="-1" disabled>{initial}</option>}
          {gridConfig.imageTypes.map((value, index) => <option key={value} value={index}>{value}</option>)}
        </select> : <MetadataTextInput field={field} value={draft} placeholder={mixedPlaceholder} onChange={updateDraft} />}
      {!inputValid && <p id={validationId} role="alert" className="mt-1 text-xs text-grid-error">Enter a valid date and time.</p>}
      <div className="metadata-edit-footer">
        {control === "datetime-local" && <button type="button" className="metadata-edit-tool" aria-label="Clear Taken on"
          title="Date clearing is unavailable until Grid supports it" disabled>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" /></svg>
        </button>}
        {description && <fieldset className="metadata-edit-modes" aria-label="Description change">
          {([['overwrite', 'Overwrite'], ['prepend', 'Add before'], ['append', 'Add after']] as const).map(([key, label]) =>
            !editingMixed ? key === "overwrite" ? <span key={key} aria-hidden="true" /> : <button type="button" key={key} aria-pressed={mode === key}
              onClick={() => changeMode(mode === key ? "overwrite" : key)}>{label}</button> : <label key={key}>
              <input type="radio" name="description-change" checked={mode === key}
                onChange={() => changeMode(key)} /><span>{label}</span>
            </label>)}
        </fieldset>}
        <div className="ml-auto flex shrink-0 gap-1">
          {(overwriteEdited || drafts.prepend || drafts.append) && <DetailsTargetCount count={targetIds.length} />}
          <PillActionButton action="cancel" label={`Cancel ${field.label}`} onClick={cancelEditing} />
          <PillActionButton action="confirm" label={`Commit ${field.label}`} disabled={!available || !changed || !targetIds.length || !validDraft} onClick={() => prepare()} />
        </div>
      </div>
    </form></fieldset>}
    {editing && submitted.state === "Not confirmed" && <PillActionButton action="cancel" label={`Dismiss ${field.label} edit`} onClick={cancelEditing} />}
  </Layout>;
}