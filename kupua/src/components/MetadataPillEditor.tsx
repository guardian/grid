import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import type { FieldDefinition } from "@/lib/field-registry";
import { EditableSearchPill, PillActionButton } from "./SearchPill";
import { FieldAddButton } from "./FieldAddButton";
import { FieldDisclosure } from "./FieldDisclosure";
import { Dash, MetadataBlock } from "./metadata-primitives";
import { MetadataSuggestionInput } from "./MetadataSuggestionInput";
import type { MetadataEditIntent } from "./MetadataTextEditor";
import { MetadataSaveFeedback, panelSaveAdmitted, useMetadataCommit } from "./MetadataEditing";

export const PILL_EDIT_FIELDS = new Set(["keywords", "collections", "people"]);

export function MetadataPillEditor({ field, targetIds, values, onSearch, onPrepare, collectionPaths, available: dataAvailable = true, editable = true, retainReading = false, allowQueuedAdd = false, readOnly, form = false }: {
  form?: boolean;
  field: FieldDefinition;
  targetIds: readonly string[];
  values: readonly { value: string; count: number }[];
  onSearch: (key: string, value: string, event: React.MouseEvent) => void;
  onPrepare?: (intent: MetadataEditIntent) => void;
  collectionPaths?: ReadonlyMap<string, readonly string[]>;
  available?: boolean;
  retainReading?: boolean;
  allowQueuedAdd?: boolean;
  editable?: boolean;
  readOnly?: ReactNode;
}) {
  const commit = useMetadataCommit(form);
  const available = dataAvailable && editable;
  const canAdd = available || allowQueuedAdd;
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [notice, setNotice] = useState("");
  const [expanded, setExpanded] = useState(false);
  const id = useId();
  const header = useRef<HTMLDivElement>(null);
  const addRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (adding) return () => { addRef.current?.focus(); }; }, [adding]);
  const collection = field.id === "collections";
  const noun = collection ? "collection" : field.id === "people" ? "person"
    : field.id === "subjects" ? "subject" : field.id === "labels" ? "label" : "keyword";
  const hasAll = (value: string) => values.some(item => item.value === value.trim() && item.count === targetIds.length);
  const prepare = (action: "add" | "remove", value: string) => {
    if (!(action === "add" ? canAdd : available) || !value.trim() || !targetIds.length || action === "add" && hasAll(value)) return;
    const intent: MetadataEditIntent = { fieldId: field.id, action, value: value.trim(), targetIds: [...targetIds] };
    const submitted = onPrepare ? (onPrepare(intent), undefined) : commit(intent, addRef.current);
    const message = `Not sent - ${action === "add" ? "Add" : "Remove"} ${noun} prepared for ${intent.targetIds.length} ${intent.targetIds.length === 1 ? "image" : "images"}.`;
    if (form) setNotice(submitted === undefined ? message : "");
    else if (panelSaveAdmitted(submitted, message) && action === "add" && value === draft) setAdding(false);
  };
  const sorted = [...values].sort((first, second) => second.count - first.count);
  if (!editable && !adding) return readOnly ?? null;
  return <MetadataBlock ref={header} tabIndex={-1} label={field.label} action={
    <span className={adding ? "invisible" : ""} aria-hidden={adding || undefined}>
      <FieldAddButton ref={addRef} iconOnly label={`Add ${noun}`} disabled={!canAdd || adding} onClick={() => { setAdding(true); setDraft(""); setNotice(""); }} />
    </span>
  }>
      <div id={id} className="flex min-w-0 flex-wrap items-start gap-1 pt-0.5">
        {!dataAvailable && !retainReading && <Dash />}
        {(expanded ? sorted : sorted.slice(0, 20)).map(item => <EditableSearchPill key={item.value} value={item.value}
          cqlKey={field.cqlKey!} count={item.count} total={targetIds.length} onSearch={onSearch} disabled={!available} addDisabled={!canAdd} coverageKnown={dataAvailable || retainReading}
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
    {adding && <form className="metadata-edit-form" onSubmit={event => { event.preventDefault(); prepare("add", draft); }} onKeyDown={event => {
      if (event.nativeEvent.isComposing) return;
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setAdding(false); setDraft(""); setNotice(""); }
      else if (event.key === "Enter") event.stopPropagation();
    }}>
      <MetadataSuggestionInput label={`New ${noun}`} fieldKey={field.cqlKey!} value={draft} onChange={value => { setDraft(value); setNotice(""); }} />
      <div className="metadata-edit-footer justify-end">
        <PillActionButton action="cancel" label={`Cancel new ${noun}`} onClick={() => { setAdding(false); setNotice(""); }} />
        <PillActionButton action="confirm" label={`Commit new ${noun}`} disabled={!canAdd || !draft.trim() || hasAll(draft)} onClick={() => prepare("add", draft)} />
      </div>
    </form>}
    {notice && <p role="status" className="mt-1 text-xs text-grid-text-muted">{notice}</p>}
    {form && <MetadataSaveFeedback fieldId={field.id} targetIds={targetIds} />}
  </MetadataBlock>;
}