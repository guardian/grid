import { DetailsTargetCount } from "./DetailsDrafts";
import { cancelButtonColours, PILL_ACTION_ICONS } from "./SearchPill";
import { FieldSaveNote } from "./MetadataEditing";

export function MetadataFormActions({ count, cancel, disabled, cancelDisabled, cancelLabel = "Cancel", saveLabel, saving }: {
  count: number; cancel: () => void; disabled: boolean; cancelDisabled?: boolean; cancelLabel?: string; saveLabel?: string; saving?: string;
}) {
  return <div className="rights-actions flex flex-wrap justify-end items-center gap-1.5">
    <DetailsTargetCount count={count} />
    <button type="button" className={cancelButtonColours} disabled={cancelDisabled} onClick={cancel}><svg aria-hidden="true" viewBox="0 0 24 24"><path d={PILL_ACTION_ICONS.close} /></svg>{cancelLabel}</button>
    <button type="submit" disabled={disabled} aria-label={saveLabel ?? "Save"}><span className="relative inline-flex size-4">{saving ? <FieldSaveNote label={saving} state="Saving…"/> : <svg aria-hidden="true" viewBox="0 0 24 24"><path d={PILL_ACTION_ICONS.confirm} /></svg>}</span>Save</button>
  </div>;
}