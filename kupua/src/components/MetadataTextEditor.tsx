import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import type { FieldDefinition } from "@/lib/field-registry";
import { MetadataBlock, MetadataRow } from "./metadata-primitives";
import { PillActionButton } from "./SearchPill";
import { MetadataSuggestionInput } from "./MetadataSuggestionInput";
import { MetadataDateInput, type MetadataDateInputHandle } from "./MetadataDateInput";
import { gridConfig } from "@/lib/grid-config";
import { useMetadataDrafts } from "@/stores/metadata-drafts-store";

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

export function MetadataEditHint({ label, mixed = false, furtherInstructions = false, children, onClick }: {
  label: string; mixed?: boolean; furtherInstructions?: boolean; children?: ReactNode; onClick: () => void;
}) {
  return <button type="button" onClick={onClick} aria-label={`${mixed ? "Edit all" : "Add"} ${label}`}
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
        if (input.validity.valid) onChange(next.length === 16 ? `${next}:00` : next);
      }} />
    : <MetadataSuggestionInput label={field.label} fieldKey={field.cqlKey ?? field.id} value={value}
      placeholder={placeholder} autoFocus={autoFocus} required={required} readOnly={readOnly} onChange={onChange} />;
}

export function MetadataFormField({ imageId, field, value, editable, required = false, editorialGuidance = false }: {
  imageId: string; field: FieldDefinition; value: string; editable: boolean; required?: boolean; editorialGuidance?: boolean;
}) {
  const draft = useMetadataDrafts(state => state.drafts.get(imageId)?.get(field.id));
  const baseline = field.id === "metadata_dateTaken" ? dateTimeDraft(value) : value;
  const displayed = draft?.value ?? baseline;
  const placeholder = !editorialGuidance ? undefined : field.id === "metadata_description"
    ? "Give some context about the image including who, what, where, when and why"
    : field.id === "metadata_byline" ? "Author’s name ONLY, leave empty if unknown"
    : field.id === "metadata_credit" ? "Source, agency or institution which owns the image" : undefined;
  const shortDescription = editorialGuidance && field.id === "metadata_description"
    && (displayed.length < 30 || displayed.split(" ").length < 5);
  return <div data-measured-field={field.id} data-metadata-field="" data-suggestion-width="" className="metadata-form-field">
    <div className="flex items-baseline justify-between gap-2 text-xs text-grid-text-dim">
      <span>{field.label}{required && <span className="text-grid-error"> *</span>}</span>
      {draft && <span role="status">Not sent</span>}
    </div>
    <MetadataTextInput field={field} value={displayed} placeholder={placeholder} autoFocus={false} natural required={required} readOnly={!editable}
      onChange={next => {
        const nextValue = field.id !== "metadata_dateTaken" || !next ? next
          : next === baseline.slice(0, 19) ? baseline : `${next}.000`;
        useMetadataDrafts.getState().setDraft(imageId, field.id, baseline, nextValue);
      }} />
    {shortDescription && <p className="text-xs text-grid-warning">Your description is too short! Ideally, please state who, what, where, when and why.</p>}
  </div>;
}

function dateTimeIntent(value: string, originalOffset: number | null): string {
  const date = new Date(value);
  if (originalOffset === null) return date.toISOString();
  const alternate = new Date(date.getTime() + (originalOffset - date.getTimezoneOffset()) * 60_000);
  return dateTimeDraft(alternate.toISOString()) === dateTimeDraft(date.toISOString()) ? alternate.toISOString() : date.toISOString();
}

export function MetadataTextEditor({ field, targetIds, value, mixed = false, children, onPrepare, available: dataAvailable = true, furtherInstructions = false, editable = true, readOnly }: {
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
  const available = dataAvailable && editable;
  const [editing, setEditing] = useState(false);
  const [initial, setInitial] = useState("");
  const [initialMixed, setInitialMixed] = useState(mixed);
  const [drafts, setDrafts] = useState({ overwrite: "", prepend: "", append: "" });
  const [mode, setMode] = useState<"overwrite" | "prepend" | "append">("overwrite");
  const [notice, setNotice] = useState("");
  const editRef = useRef<HTMLButtonElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dateInputRef = useRef<MetadataDateInputHandle>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [inputValid, setInputValid] = useState(true);
  const [typeTouched, setTypeTouched] = useState(false);
  const [originalOffset, setOriginalOffset] = useState<number | null>(null);
  const validationId = useId();
  useEffect(() => { if (editing) return () => { editRef.current?.focus(); }; }, [editing]);
  useLayoutEffect(() => {
    const input = textareaRef.current;
    if (editing && input) input.setSelectionRange(input.value.length, input.value.length);
  }, [editing]);
  const control = METADATA_EDIT_CONTROLS.get(field.id) ?? "text";
  const multiline = control === "textarea";
  const description = field.id === "metadata_description" && targetIds.length > 1;
  const draft = drafts[mode];
  const editingMixed = editing ? initialMixed : mixed;
  const mixedPlaceholder = editingMixed && mode === "overwrite" ? `Multiple ${MIXED_VALUE_NAMES.get(field.id) ?? field.label.toLowerCase()}` : undefined;
  const normalizedDraft = field.id === "photoshoot" ? draft.trim() : draft;
  const normalizedInitial = field.id === "photoshoot" ? initial.trim() : initial;
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
    setInitial(baseline);
    setInitialMixed(mixed);
    setDrafts({ overwrite: baseline, prepend: "", append: "" });
    setMode("overwrite");
    setNotice("");
    setInputValid(true);
    setTypeTouched(false);
    setEditing(true);
  };
  const cancelEditing = () => {
    setEditing(false);
    setNotice("");
  };
  const updateDraft = (value: string) => {
    setDrafts(current => ({ ...current, [mode]: value }));
    setNotice("");
  };
  const changeMode = (nextMode: typeof mode) => {
    setMode(nextMode);
    setNotice("");
  };
  const prepare = () => {
    if (!available || !targetIds.length || !changed) return;
    if (!inputValid || !formRef.current?.checkValidity()) return;
    const prepared = control === "datetime-local" && draft ? dateTimeIntent(draft, originalOffset) : normalizedDraft;
    const intent: MetadataEditIntent = { fieldId: field.id, targetIds: [...targetIds], action: mode, value: prepared };
    onPrepare?.(intent);
    setNotice(`Not sent - ${field.label} change prepared for ${intent.targetIds.length} ${intent.targetIds.length === 1 ? "image" : "images"}.`);
  };
  const stacked = field.detailLayout === "stacked" || editing && control === "datetime-local";
  const Layout = stacked ? MetadataBlock : MetadataRow;
  if (!editable && !editing) return readOnly ?? null;
  return <Layout label={field.label} {...(stacked ? {} : { fill: true })} action={
    <MetadataEditButton ref={editRef} label={field.label} editing={editing} disabled={!available} onClick={beginEditing} />
  }>
    {!editing ? available && (mixed || !value) ? <MetadataEditHint label={field.label} mixed={mixed}
      furtherInstructions={furtherInstructions} onClick={beginEditing}>{children}</MetadataEditHint>
      : children : <form ref={formRef} className={`metadata-edit-form${multiline ? "" : " metadata-scalar-edit-form"}`} onSubmit={event => { event.preventDefault(); prepare(); }} onKeyDown={event => {
      if (event.nativeEvent.isComposing) return;
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); cancelEditing(); }
      else if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) { event.preventDefault(); event.stopPropagation(); prepare(); }
      else if (event.key === "Enter") event.stopPropagation();
    }}>
      {multiline ? <MetadataTextInput field={field} textareaRef={textareaRef} value={draft} placeholder={mixedPlaceholder} onChange={updateDraft} />
        : control === "datetime-local" ? <MetadataDateInput ref={dateInputRef} initialValue={initial} mixed={editingMixed} validationId={validationId}
          onChange={(value, valid) => { updateDraft(value); setInputValid(valid); }} />
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
        {control === "datetime-local" && <button type="button" className="metadata-edit-tool" aria-label="Clear Taken on" title="Clear Taken on"
          disabled={!available} onClick={() => dateInputRef.current?.clear()}>
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
          <PillActionButton action="cancel" label={`Cancel ${field.label}`} onClick={cancelEditing} />
          <PillActionButton action="confirm" label={`Commit ${field.label}`} disabled={!available || !changed || !targetIds.length || !inputValid} onClick={() => prepare()} />
        </div>
      </div>
      {notice && <p role="status" className="mt-1 text-xs text-grid-text-muted">{notice}</p>}
    </form>}
  </Layout>;
}