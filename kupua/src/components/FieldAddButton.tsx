import { PILL_ACTION_ICONS } from "./SearchPill";

export function FieldAddButton({ label, onClick, disabled = false, ref, iconOnly = false }: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  ref?: React.Ref<HTMLButtonElement>;
  iconOnly?: boolean;
}) {
  return <button ref={ref} type="button" onClick={onClick} disabled={disabled} aria-label={label} title={label}
    className={iconOnly ? "metadata-add-tool disabled:cursor-not-allowed disabled:opacity-40" : "inline-flex max-w-full shrink-0 cursor-pointer items-center gap-1.5 rounded-full border border-dashed border-grid-border px-3 text-sm text-grid-text-bright disabled:cursor-not-allowed disabled:opacity-40"}
    style={iconOnly ? undefined : { minHeight: "var(--mobile-edit-control-size)" }}>
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={iconOnly ? "metadata-add-box" : undefined}><path d={iconOnly ? PILL_ACTION_ICONS.addBox : PILL_ACTION_ICONS.add} /></svg>
    {iconOnly ? <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="metadata-add-plus"><path d={PILL_ACTION_ICONS.add} /></svg> : label}
  </button>;
}