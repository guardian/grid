import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useSearchStore } from "@/stores/search-store";
import { buildTypeaheadFields, type TypeaheadResolver } from "@/lib/typeahead-fields";
import { parseFieldChips, serializeFieldChips, type FieldChip } from "@/dal/adapters/elasticsearch/cql-query-edit";
import { SuggestionDropdown } from "./SuggestionDropdown";
import { FieldAddButton } from "./FieldAddButton";
import { useTypeaheadSuggestions } from "@/hooks/useTypeaheadSuggestions";

interface RefineChipsProps {
  /** Fields-only CQL (see splitFieldTerms). */
  fields: string;
  onFieldsChange: (fields: string) => void;
}

type Editing = { index: number | null; key: string; negated: boolean } | null;

/**
 * Compact-shell chip list: chips wrap line after line; tap a value to change it,
 * tap the key to flip include/exclude, × removes, "+ Add filter" picks a field.
 * Free text is not editable here — it lives in the search bar.
 */
export function RefineChips({ fields, onFieldsChange }: RefineChipsProps) {
  const [chips, setChips] = useState<FieldChip[]>(() => parseFieldChips(fields));
  useEffect(() => { setChips(parseFieldChips(fields)); }, [fields]);
  const [editing, setEditing] = useState<Editing>(null);
  const [picking, setPicking] = useState(false);

  const dataSource = useSearchStore((s) => s.dataSource);
  const defs = useMemo(() => {
    const store = useSearchStore.getState;
    return buildTypeaheadFields(dataSource, () => store().aggregations, () => store().params,
      () => store().tickerCounts, () => store().isFilterCounts);
  }, [dataSource]);

  const commit = (next: FieldChip[]) => {
    setChips(next);
    onFieldsChange(serializeFieldChips(next));
  };

  if (picking) {
    return (
      <div
        className="flex flex-col gap-3"
        onKeyDown={(e) => { if (e.key === "Escape") { e.nativeEvent.stopPropagation(); setPicking(false); } }}
      >
        <div className="flex items-center justify-between">
          <span className="text-sm text-grid-text-muted">Filter by…</span>
          <button type="button" onClick={() => setPicking(false)} className="text-sm text-grid-accent px-2 h-9">Cancel</button>
        </div>
        <div className="flex flex-wrap gap-2">
          {defs.filter((d) => d.showInKeySuggestions !== false).map((d) => (
            <button
              key={d.fieldName}
              type="button"
              onClick={() => { setPicking(false); setEditing({ index: null, key: d.fieldName, negated: false }); }}
              className="h-[var(--mobile-edit-control-size)] px-3 rounded-full border border-grid-border text-sm text-grid-text-bright"
            >
              {d.fieldName}
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (editing) {
    const def = defs.find((d) => d.fieldName.toLowerCase() === editing.key.toLowerCase());
    const initial = editing.index !== null ? chips[editing.index]?.value ?? "" : "";
    return (
      <ValueEditor
        fieldKey={editing.key}
        initial={initial}
        resolver={def?.resolver}
        onCancel={() => setEditing(null)}
        onDone={(value) => {
          setEditing(null);
          const chip = { key: editing.key, value, negated: editing.negated };
          if (!value) {
            if (editing.index !== null) commit(chips.filter((_, i) => i !== editing.index));
            return;
          }
          commit(editing.index !== null ? chips.map((c, i) => (i === editing.index ? chip : c)) : [...chips, chip]);
        }}
      />
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {chips.map((chip, index) => (
        <span
          key={`${index}-${chip.key}-${chip.value}`}
          className={`inline-flex items-center max-w-full h-[var(--mobile-edit-control-size)] rounded-full border text-sm overflow-hidden ${
            chip.negated ? "border-grid-error/70 bg-grid-error/10" : "border-grid-border bg-grid-cell"
          }`}
        >
          <button
            type="button"
            title={chip.negated ? "Excluding — tap to include" : "Including — tap to exclude"}
            onClick={() => commit(chips.map((c, i) => (i === index ? { ...c, negated: !c.negated } : c)))}
            className="shrink-0 pl-3 pr-1 h-full text-grid-text-muted"
          >
            {chip.negated ? "\u2013\u00a0" : "+\u00a0"}{chip.key}:
          </button>
          <button
            type="button"
            onClick={() => setEditing({ index, key: chip.key, negated: chip.negated })}
            className="min-w-0 truncate px-1 h-full text-grid-text-bright"
          >
            {chip.value}
          </button>
          <button
            type="button"
            aria-label={`Remove ${chip.key}:${chip.value}`}
            onClick={() => commit(chips.filter((_, i) => i !== index))}
            className="shrink-0 pl-1 pr-3 h-full text-grid-text-muted text-[1.5em] leading-none"
          >
            ×
          </button>
        </span>
      ))}
      <FieldAddButton label="Add filter" onClick={() => setPicking(true)} />
    </div>
  );
}

function ValueEditor({ fieldKey, initial, resolver, onCancel, onDone }: {
  fieldKey: string;
  initial: string;
  resolver?: TypeaheadResolver;
  onCancel: () => void;
  onDone: (value: string) => void;
}) {
  const [value, setValue] = useState(initial);
  const suggestions = useTypeaheadSuggestions(resolver, value);
  const [active, setActive] = useState(-1);
  const [suggestionsVisible, setSuggestionsVisible] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestionsId = useId();
  useEffect(() => { inputRef.current?.focus(); }, []);

  useEffect(() => { setActive(-1); }, [suggestions]);

  return (
    <div className="flex flex-col gap-2">
      <form
        className="flex items-center gap-2"
        onSubmit={(e) => { e.preventDefault(); onDone(value.trim()); }}
      >
        <span className="shrink-0 text-sm text-grid-text-muted">{fieldKey}:</span>
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing) return;
            // Escape backs out of this edit only; the sheet's document listener would close Refine.
            if (e.key === "Escape") { e.preventDefault(); e.nativeEvent.stopPropagation(); onCancel(); }
            else if ((e.key === "ArrowDown" || e.key === "ArrowUp") && suggestionsVisible && suggestions.length) {
              e.preventDefault(); e.stopPropagation();
              const direction = e.key === "ArrowDown" ? 1 : -1;
              setActive(index => index < 0 ? direction > 0 ? 0 : suggestions.length - 1 : (index + direction + suggestions.length) % suggestions.length);
            } else if (e.key === "Enter" && suggestionsVisible && active >= 0 && suggestions[active]) {
              e.preventDefault(); e.stopPropagation(); onDone(suggestions[active].value);
            }
          }}
          enterKeyHint="done"
          type="search"
          name="refine-filter-value"
          aria-label="Filter value"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={suggestionsVisible}
          aria-controls={suggestionsVisible ? suggestionsId : undefined}
          aria-activedescendant={suggestionsVisible && active >= 0 && suggestions[active] ? `${suggestionsId}-${active}` : undefined}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="none"
          spellCheck={false}
          data-1p-ignore
          data-lpignore="true"
          className="flex-1 min-w-0 h-10 px-3 rounded-lg bg-grid-cell border border-grid-border text-grid-text-bright focus:outline-none focus:border-grid-accent"
        />
        <button type="button" onClick={onCancel} className="shrink-0 h-10 px-2 text-sm text-grid-text-muted">Cancel</button>
      </form>
      <SuggestionDropdown anchorRef={inputRef} items={suggestions} id={suggestionsId}
        label={`Suggestions for ${fieldKey}`} activeIndex={active} onSelect={item => onDone(item.value)} onVisibilityChange={setSuggestionsVisible} />
    </div>
  );
}
