import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { MetadataBlock, MetadataRow } from "./metadata-primitives";
import { MetadataEditButton, MetadataEditHint, type MetadataEditIntent, type MetadataLocationChange } from "./MetadataTextEditor";
import { PillActionButton } from "./SearchPill";

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

export function MetadataLocationEditor({ fields, targetIds, available: dataAvailable, children, onPrepare, editable = true, readOnly }: {
  fields: readonly { key: LocationKey; label: string; value: string; mixed: boolean }[];
  targetIds: readonly string[];
  available: boolean;
  children: ReactNode;
  onPrepare?: (intent: MetadataEditIntent) => void;
  editable?: boolean;
  readOnly?: ReactNode;
}) {
  const available = dataAvailable && editable;
  const [editing, setEditing] = useState(false);
  const [initial, setInitial] = useState(emptyLocation);
  const [draft, setDraft] = useState(emptyLocation);
  const [mixed, setMixed] = useState<ReadonlySet<LocationKey>>(() => new Set());
  const [cleared, setCleared] = useState<ReadonlySet<LocationKey>>(() => new Set());
  const id = useId();
  const [notice, setNotice] = useState("");
  const editRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (editing) return () => { editRef.current?.focus(); }; }, [editing]);
  useLayoutEffect(() => {
    const input = inputRef.current;
    if (editing && input) input.setSelectionRange(input.value.length, input.value.length);
  }, [editing]);
  const changes: MetadataLocationChange = {};
  for (const { key } of fields) {
    if (cleared.has(key) || (mixed.has(key) ? draft[key] !== "" : draft[key] !== initial[key])) changes[key] = draft[key];
  }
  const prepare = () => {
    if (!available || !targetIds.length || !Object.keys(changes).length) return;
    onPrepare?.({ fieldId: "location", action: "overwrite", value: changes, targetIds: [...targetIds] });
    setNotice(`Not sent - Location change prepared for ${targetIds.length} ${targetIds.length === 1 ? "image" : "images"}.`);
  };
  const cancel = () => { setEditing(false); setNotice(""); };
  const beginEditing = () => {
    const baseline = emptyLocation();
    for (const field of fields) baseline[field.key] = field.mixed ? "" : field.value;
    setInitial(baseline); setDraft(baseline); setMixed(new Set(fields.filter(field => field.mixed).map(field => field.key)));
    setCleared(new Set()); setNotice(""); setEditing(true);
  };
  const Layout = editing ? MetadataBlock : MetadataRow;
  if (!editable && !editing) return readOnly ?? null;
  return <Layout label="Location" {...(editing ? {} : { fill: true })} action={<MetadataEditButton ref={editRef} label="Location" editing={editing} disabled={!available} onClick={beginEditing} />}>
    {!editing ? available && fields.some(field => field.mixed)
      ? <>{children} <MetadataEditHint label="Location" mixed onClick={beginEditing} /></>
      : available && fields.every(field => !field.value && !field.mixed)
      ? <MetadataEditHint label="Location" onClick={beginEditing} /> : children
      : <form className="metadata-edit-form" onSubmit={event => { event.preventDefault(); prepare(); }} onKeyDown={event => {
      if (event.nativeEvent.isComposing) return;
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); cancel(); }
      else if (event.key === "Enter") {
        event.stopPropagation();
        if (event.target instanceof HTMLInputElement) { event.preventDefault(); prepare(); }
      }
    }}>
      <div className="metadata-location-fields">
        {fields.map((field, index) => <div key={field.key} className="metadata-location-row min-w-0">
          <label htmlFor={`${id}-${field.key}`} className="text-xs text-grid-text-dim">{field.label}</label>
          <div className="flex min-w-0 items-center gap-1">
            <input id={`${id}-${field.key}`} ref={index === 0 ? inputRef : undefined} autoFocus={index === 0} type="text" value={draft[field.key]}
              data-mixed={mixed.has(field.key) && !cleared.has(field.key) || undefined}
              placeholder={mixed.has(field.key) && !cleared.has(field.key) ? `Multiple ${LOCATION_PLURALS[field.key]}` : field.key === "subLocation" ? "or place" : field.key === "state" ? "or region" : undefined}
              onChange={event => {
                setDraft(current => ({ ...current, [field.key]: event.target.value }));
                setCleared(current => { const next = new Set(current); next.delete(field.key); return next; }); setNotice("");
              }} />
            {mixed.has(field.key) && <button type="button" className="metadata-edit-tool" disabled={!available}
              aria-label={`Clear ${field.label}`} title={`Clear ${field.label} for all ${targetIds.length} images`}
              onClick={() => { setDraft(current => ({ ...current, [field.key]: "" })); setCleared(current => new Set([...current, field.key])); setNotice(""); }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" /></svg>
            </button>}
          </div>
        </div>)}
      </div>
      <div className="metadata-edit-footer justify-end">
        <PillActionButton action="cancel" label="Cancel Location" onClick={cancel} />
        <PillActionButton action="confirm" label="Commit Location" disabled={!available || !Object.keys(changes).length} onClick={() => prepare()} />
      </div>
      {notice && <p role="status" className="mt-1 text-xs text-grid-text-muted">{notice}</p>}
    </form>}
  </Layout>;
}