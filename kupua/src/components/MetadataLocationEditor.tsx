import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { MetadataBlock, MetadataRow } from "./metadata-primitives";
import { MetadataEditButton, MetadataEditHint, type MetadataEditIntent, type MetadataLocationChange } from "./MetadataTextEditor";
import { PillActionButton } from "./SearchPill";
import { panelSaveAdmitted, useMetadataCommit, SavingValue, usePendingPanelIntent, FieldSaveNote, useSubmittedField } from "./MetadataEditing";
import { labelTargetKey } from "@/stores/label-editor-store";
import { DetailsTargetCount, useDetailsDraft } from "./DetailsDrafts";

export const LOCATION_COMPONENTS = [
  { key: "subLocation", fieldId: "location_subLocation", label: "Sublocation" },
  { key: "city", fieldId: "location_city", label: "City" },
  { key: "state", fieldId: "location_state", label: "State" },
  { key: "country", fieldId: "location_country", label: "Country" },
] as const;

type LocationKey = keyof MetadataLocationChange;
const LOCATION_PLURALS: Record<LocationKey, string> = {
  subLocation: "sublocations", city: "cities", state: "states", country: "countries",
};
const emptyLocation = () => ({ subLocation: "", city: "", state: "", country: "" });

export function MetadataLocationEditor({ fields, targetIds, available: dataAvailable, children, onPrepare, editable = true, retainReading = false, readOnly }: {
  fields: readonly { key: LocationKey; label: string; value: string; mixed: boolean }[];
  targetIds: readonly string[];
  available: boolean;
  children: ReactNode;
  onPrepare?: (intent: MetadataEditIntent) => void;
  editable?: boolean;
  retainReading?: boolean;
  readOnly?: ReactNode;
}) {
  const commit = useMetadataCommit();
  const pending = usePendingPanelIntent(labelTargetKey(targetIds), "location");
  const available = dataAvailable && editable;
  const { restored, update } = useDetailsDraft<{ initial: ReturnType<typeof emptyLocation>; changes: MetadataLocationChange;
    mixed: ReadonlySet<LocationKey> }>("location");
  const [editing, setEditing] = useState(Boolean(restored));
  const submission = useSubmittedField(() => setEditing(false));
  const [initial, setInitial] = useState(() => restored?.initial ?? emptyLocation());
  const [changes, setChanges] = useState<MetadataLocationChange>(() => restored?.changes ?? {});
  const [mixed, setMixed] = useState<ReadonlySet<LocationKey>>(() => restored?.mixed ?? new Set());
  const [needsBaseline, setNeedsBaseline] = useState(Boolean(restored));
  if (needsBaseline && available) {
    const next = emptyLocation();
    for (const field of fields) {
      next[field.key] = field.mixed ? "" : field.value;
    }
    setInitial(next); setMixed(new Set(fields.filter(field => field.mixed).map(field => field.key)));
    setNeedsBaseline(false);
  }
  const id = useId();
  const editRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (editing) return () => { editRef.current?.focus(); }; }, [editing]);
  useLayoutEffect(() => {
    const input = inputRef.current;
    if (editing && input) input.setSelectionRange(input.value.length, input.value.length);
  }, [editing]);
  useLayoutEffect(() => { update("Location", editing && !submission.locked && Object.keys(changes).length ? { initial, changes, mixed } : undefined); });
  const prepare = () => {
    if (!available || submission.locked || !targetIds.length || !Object.keys(changes).length) return;
    const intent: MetadataEditIntent = { fieldId: "location", action: "overwrite", value: changes, targetIds: [...targetIds] };
    const submitted = onPrepare ? (onPrepare(intent), undefined) : commit(intent, editRef.current);
    if (submitted) submission.track(submitted.id);
    else panelSaveAdmitted(submitted, `Not sent - Location change prepared for ${targetIds.length} ${targetIds.length === 1 ? "image" : "images"}.`);
  };
  const cancel = () => { submission.track(undefined); setEditing(false); };
  const beginEditing = () => {
    const baseline = emptyLocation();
    for (const field of fields) baseline[field.key] = field.mixed ? "" : field.value;
    setInitial(baseline); setChanges({}); setMixed(new Set(fields.filter(field => field.mixed).map(field => field.key)));
    setEditing(true);
  };
  const Layout = editing ? MetadataBlock : MetadataRow;
  if (!editable && !editing) return readOnly ?? null;
  return <Layout label="Location" {...(editing ? {} : { fill: true })} action={<MetadataEditButton ref={editRef} label="Location" editing={editing} disabled={!available} onClick={beginEditing} />}>
    {!editing && pending ? <SavingValue saving>{children}</SavingValue> : !editing ? (available || retainReading) && fields.some(field => field.mixed)
      ? <>{children} <MetadataEditHint label="Location" mixed onClick={beginEditing} disabled={!available} /></>
      : (available || retainReading) && fields.every(field => !field.value && !field.mixed)
      ? <MetadataEditHint label="Location" onClick={beginEditing} disabled={!available} /> : children
      : <form className="metadata-edit-form" onSubmit={event => { event.preventDefault(); prepare(); }} onKeyDown={event => {
      if (event.nativeEvent.isComposing) return;
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); cancel(); }
      else if (event.key === "Enter") {
        event.stopPropagation();
        if (event.target instanceof HTMLInputElement) { event.preventDefault(); prepare(); }
      }
    }}>
      <div className="metadata-location-fields">
        {fields.map((field, index) => <div key={field.key} data-field-state={changes[field.key] !== undefined ? submission.state : undefined} className="metadata-location-row min-w-0">
          <label htmlFor={`${id}-${field.key}`} className="text-xs text-grid-text-dim">{field.label}</label>
          {changes[field.key] !== undefined && <FieldSaveNote state={submission.state} />}
          <div className="flex min-w-0 items-center gap-1">
            <input id={`${id}-${field.key}`} disabled={submission.locked} ref={index === 0 ? inputRef : undefined} autoFocus={index === 0} type="text" value={changes[field.key] ?? initial[field.key]}
              data-mixed={mixed.has(field.key) && changes[field.key] === undefined || undefined}
              placeholder={mixed.has(field.key) && changes[field.key] === undefined ? `Multiple ${LOCATION_PLURALS[field.key]}` : field.key === "subLocation" ? "or place" : field.key === "state" ? "or region" : undefined}
              onChange={event => {
                submission.track(undefined);
                const next = { ...changes, [field.key]: event.target.value };
                if (next[field.key] === initial[field.key]) delete next[field.key];
                setChanges(next);
              }} />
            {mixed.has(field.key) && <button type="button" className="metadata-edit-tool" disabled={!available || submission.locked}
              aria-label={`Clear ${field.label}`} title={`Clear ${field.label} for all ${targetIds.length} images`}
              onClick={() => setChanges({ ...changes, [field.key]: "" })}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" /></svg>
            </button>}
          </div>
        </div>)}
      </div>
      <div className="metadata-edit-footer justify-end">
        {Object.keys(changes).length > 0 && <DetailsTargetCount count={targetIds.length} />}
        <PillActionButton action="cancel" label="Cancel Location" onClick={cancel} />
        <PillActionButton action="confirm" label="Commit Location" disabled={!available || submission.locked || !Object.keys(changes).length} onClick={() => prepare()} />
      </div>
    </form>}
  </Layout>;
}