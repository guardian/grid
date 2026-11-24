import { useContext, useEffect, useId, useState, type ReactNode } from "react";
import { useStore } from "zustand";
import type { UsageRights } from "@/types/image";
import { readRightsEditorCatalogue, type RightsEditorCategory } from "@/lib/usage-rights-catalogue";
import { siteSettings } from "@/lib/site-settings";
import { useBrowsingContext } from "@/lib/browsing-context";
import { useMetadataDrafts } from "@/stores/metadata-drafts-store";
import { rightsValueSchema } from "@/lib/grid-commands";
import { useDetailsDraft } from "./DetailsDrafts";
import { MetadataEditButton } from "./MetadataTextEditor";
import { RightsCreatorInput } from "./RightsCreatorInput";
import { MetadataFormActions } from "./MetadataFormActions";
import { MetadataBatchArrow, MetadataEditorContext, MetadataSaveFeedback, useMetadataCommit, usePendingPanelIntent, FieldSaveNote, useSubmittedField } from "./MetadataEditing";
import { labelTargetKey } from "@/stores/label-editor-store";

const fieldId = "usageRights_category";
const label = "Rights & restrictions";
const supported = new Set(["", "agency", "pr-and-third-party", "pay-to-use", "publisher-photography", "publisher-illustration"]);
const inputClass = "block w-full min-w-0 rounded-sm border border-grid-border bg-grid-bg px-1.5 py-1 text-grid-text";
type Values = Record<string, string>;
type Draft = { values: Values; restricted: boolean };
let catalogueRead: Promise<RightsEditorCategory[]> | undefined;
let loadedCatalogue: RightsEditorCategory[] | undefined;

function initialDraft(category: RightsEditorCategory | undefined, rights: readonly UsageRights[]): Draft {
  const values: Values = { category: category?.value ?? "mixed" };
  for (const property of category?.properties ?? []) {
    const data = rights.map(item => item[property.name as keyof UsageRights]);
    if (data.length && data.every(value => value === data[0]) && data[0]) values[property.name] = data[0];
    else if (!rights.length && property.name === "publication" && property.required && property.options?.length) values.publication = property.options[0];
  }
  if (category?.defaultRestrictions) values.restrictions = category.defaultRestrictions;
  return { values, restricted: Boolean(values.restrictions || category?.properties.some(prop => prop.name === "restrictions" && prop.required)) };
}

export function UsageRightsEditor({ ids, rights, allowed, form = false, pendingGrant = false, inactive = false, children }: {
  ids: readonly string[]; rights: readonly UsageRights[]; allowed: boolean; form?: boolean; pendingGrant?: boolean; inactive?: boolean; children: ReactNode;
}) {
  const editor = useContext(MetadataEditorContext);
  const uploadForm = useBrowsingContext().path === "/upload" && form;
  const connected = useStore(editor, state => state.connected);
  const tracking = useStore(editor, state => form ? state.formRightsSaves.get(ids[0]) : undefined);
  const retained = useMetadataDrafts(state => form ? state.drafts.get(ids[0])?.get(fieldId) : undefined);
  const enabled = connected && allowed && import.meta.env.VITE_USE_MEDIA_API === "true";
  const [categories, setCategories] = useState<RightsEditorCategory[] | undefined>(() => loadedCatalogue);
  useEffect(() => {
    if (inactive || (!enabled && !(retained && catalogueRead))) return;
    let current = true;
    catalogueRead ??= readRightsEditorCatalogue().then(result => loadedCatalogue = result).catch(error => { catalogueRead = undefined; throw error; });
    void catalogueRead.then(result => { if (current) setCategories(result); }, () => { if (current) setCategories(undefined); });
    return () => { current = false; };
  }, [enabled, !!retained, inactive]);
  const commit = useMetadataCommit(form);
  const pending = usePendingPanelIntent(labelTargetKey(ids), fieldId);
  const { restored, update } = useDetailsDraft<Draft>(fieldId);
  const [localDraft, setDraft] = useState(form ? undefined : restored);
  const [dismissed, setDismissed] = useState(false);
  const unique = useId();
  const choices = categories?.filter(category => supported.has(category.value)) ?? [];
  const modern = choices.some(category => category.value && category.value !== "agency");
  const common = rights.every(item => item.category === rights[0]?.category) ? rights[0]?.category ?? "" : "mixed";
  const initial = initialDraft(choices.find(category => category.value === common), rights);
  const draft = localDraft ?? (retained ? JSON.parse(retained.value) as Draft : undefined)
    ?? (uploadForm && enabled && !dismissed && common === "" && initial.values.category === "" ? initial : undefined);
  const change = (next: Draft) => {
    submitted.track(undefined);
    setDraft(next);
    const baseline = JSON.stringify(initial), value = JSON.stringify(next);
    if (form) useMetadataDrafts.getState().setDraft(ids[0], fieldId, baseline, value);
    else update(label, baseline === value ? undefined : next);
  };
  const close = () => {
    submitted.track(undefined);
    setDraft(undefined);
    if (uploadForm) setDismissed(true);
    if (!form) return update(label, undefined);
    const store = useMetadataDrafts.getState(), retained = store.drafts.get(ids[0])?.get(fieldId);
    if (retained) store.clearDraft(ids[0], fieldId, retained.revision);
  };
  const selected = choices.find(category => category.value === draft?.values.category);
  const submitted = useSubmittedField(form ? () => {} : close, retained && tracking?.revision === retained.revision ? tracking.id : undefined);
  const guide = siteSettings().usageRightsHelpLink;
  const feedback = form && tracking && !tracking.superseded && <MetadataSaveFeedback fieldId={fieldId} targetIds={ids} saveId={tracking.id} />;
  const showEdit = enabled || connected && pendingGrant && import.meta.env.VITE_USE_MEDIA_API === "true";
  if (!draft || !modern) return <>{!form && pending ? <><div className="metadata-saving" data-field-state="Saving…"><div aria-busy="true">{children}</div></div><span className={`metadata-edit-tool absolute top-2 ${showEdit && modern ? "right-10" : "right-0"}`}><FieldSaveNote label="rights" state="Saving…" /></span></> : children}{showEdit && modern && <span className="absolute right-0 top-2 inline-flex items-center gap-1">
    <span className="inline-flex text-grid-text-dim"><MetadataEditButton label={label} editing={false} disabled={!enabled} onClick={() => setDraft(initial)} /></span>
    {form && choices.some(category => category.value === common) && <MetadataBatchArrow fieldId={fieldId} imageId={ids[0]} label={label} value={initial.values} disabled={!allowed} />}
  </span>}{feedback}</>;
  const values = draft.values;
  const setField = (name: string, value: string) => {
    const next = { ...values };
    if (value) next[name] = value; else delete next[name];
    change({ ...draft, values: next });
  };
  return <><fieldset className="min-w-0" disabled={submitted.locked}><form aria-label="Image usage rights" className="usage-rights-form text-xs" data-field-state={submitted.state} data-unknown={selected?.value === "" || undefined} onKeyDown={event => {
    if (event.key === "Escape" && !event.nativeEvent.isComposing) { event.stopPropagation(); close(); }
  }} onSubmit={event => {
    event.preventDefault();
    if (!enabled || submitted.locked || !selected || !rightsValueSchema.safeParse(values).success) return;
    const save = commit({ fieldId, action: "overwrite", value: values, targetIds: ids });
    if (save) {
      if (form) {
        const drafts = useMetadataDrafts.getState();
        if (!retained) drafts.setDraft(ids[0], fieldId, JSON.stringify(initial), JSON.stringify(draft), true);
        editor.getState().trackFormRights(ids[0], save.id, useMetadataDrafts.getState().drafts.get(ids[0])!.get(fieldId)!.revision);
        setDraft(undefined);
      } else submitted.track(save.id);
      update(label, undefined);
    }
  }}>
    {guide && <a className="underline" href={guide} target="_blank" rel="noopener noreferrer">Having trouble picking rights?</a>}
    {submitted.state !== "Saving…" && <FieldSaveNote state={submitted.state} />}
    <select className={inputClass} aria-label="Rights category" aria-describedby={selected?.caution ? `${unique}-caution` : undefined} value={values.category} onChange={event => {
      const category = choices.find(item => item.value === event.target.value);
      const next = initialDraft(category, []);
      if (values.restrictions && !category?.defaultRestrictions && category?.properties.some(prop => prop.name === "restrictions")) {
        next.values.restrictions = values.restrictions; next.restricted = true;
      }
      change(next);
    }}>
      {!selected && <option value="mixed" disabled>Multiple categories</option>}
      {choices.map(category => <option key={category.value} value={category.value}>{category.name}</option>)}
    </select>
    {selected?.caution && <p id={`${unique}-caution`} className="rights-caution">{selected.caution}</p>}
    {selected?.description && <p className="whitespace-pre-line">{selected.description}</p>}
    {ids.length > 1 && <p title="Some specific information about the usage rights of these images might be missing below and will be overridden.">Multiple rights &amp; restrictions</p>}
    {selected?.properties.map(property => {
      const name = property.name, value = values[name] ?? "";
      if (name === "restrictions") return <div key={name}>
        {selected.usageRestrictions && <p>{selected.usageRestrictions}</p>}
        {selected.usageSpecialInstructions && <p>{selected.usageSpecialInstructions}</p>}
        <label><input type="checkbox" checked={draft.restricted} disabled={property.required || !!selected.defaultRestrictions} onChange={event => {
          const next = { ...values }; if (!event.target.checked) delete next.restrictions;
          change({ values: next, restricted: event.target.checked });
        }} /> {selected.usageRestrictions ? "Add further restrictions" : "Restricted"}</label>
        {draft.restricted && <><span className="rights-required metadata-field-status" aria-hidden="true">Required</span><textarea className={inputClass} aria-label="Restrictions" required readOnly={!!selected.defaultRestrictions} value={value} onChange={event => setField(name, event.target.value)} /></>}
      </div>;
      const options = property.options;
      const list = `${unique}-${name}`;
      if (options && options.length <= 3) return <fieldset key={name}><legend>{property.label}</legend><span className="rights-required metadata-field-status" aria-hidden="true">Required</span><div className="rights-segments">{options.map(option => <label key={option}>
        <input className="absolute inset-0 z-1 m-0 size-full cursor-pointer opacity-0 peer" type="radio" name={list} required={property.required} checked={option === value} onChange={() => setField(name, option)} />
        <span className="grid-segment peer-focus-visible:outline-2 peer-focus-visible:outline-grid-accent" data-selected={option === value}>{option}</span></label>)}</div></fieldset>;
      if (property.optionsMap) return <RightsCreatorInput key={`${name}:${values[property.optionsMapKey ?? ""]}`} label={property.label} required={property.required} value={value}
        options={property.optionsMap[values[property.optionsMapKey ?? ""]] ?? []} className={inputClass} onChange={next => setField(name, next)} />;
      return <label key={name} className="block">{property.label}<span className="rights-required metadata-field-status" aria-hidden="true">Required</span>{options ? <select className={inputClass} value={value} required={property.required} onChange={event => setField(name, event.target.value)}>
        <option value="" />{options.map(option => <option key={option}>{option}</option>)}
      </select> : <input className={inputClass} value={value} required={property.required} autoComplete="off"
        placeholder={property.examples ? `e.g. ${property.examples}` : undefined} onChange={event => setField(name, event.target.value)} />}</label>;
    })}
    <MetadataFormActions count={ids.length} cancel={close} saving={submitted.state === "Saving…" ? "rights" : undefined} disabled={!enabled || !selected || !rightsValueSchema.safeParse(values).success || !!(draft.restricted && !values.restrictions?.trim())} />
  </form></fieldset>{submitted.state === "Not confirmed" && <button type="button" onClick={close}>Cancel</button>}</>;
}