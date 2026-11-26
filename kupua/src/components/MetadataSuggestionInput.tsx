import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useSearchStore } from "@/stores/search-store";
import { buildTypeaheadFields, type TypeaheadSuggestion } from "@/lib/typeahead-fields";
import { SuggestionDropdown } from "./SuggestionDropdown";
import { useCollectionStore } from "@/stores/collection-store";
import { useTypeaheadSuggestions } from "@/hooks/useTypeaheadSuggestions";
import { labelEntryToken, replaceLabelToken } from "@/lib/grid-mutation-policy";

export function MetadataSuggestionInput({ label, fieldKey, value, onChange, placeholder, autoFocus = true, required = false, readOnly = false }: {
  label: string; fieldKey: string; value: string; onChange: (value: string, chosen?: boolean) => void; placeholder?: string;
  autoFocus?: boolean; required?: boolean; readOnly?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const id = useId();
  const source = useSearchStore(state => state.dataSource);
  const collectionTree = useCollectionStore(state => fieldKey === "collection" ? state.tree : null);
  const resolver = useMemo(() => buildTypeaheadFields(source, () => null, () => ({ nonFree: "true" }))
    .find(field => field.fieldName === fieldKey)?.resolver, [source, fieldKey, collectionTree]);
  const [active, setActive] = useState(-1);
  const [suggestionsVisible, setSuggestionsVisible] = useState(false);
  const [focused, setFocused] = useState(autoFocus);
  const [dismissed, setDismissed] = useState<(TypeaheadSuggestion & { caret?: number }) | null>(null);
  const [caret, setCaret] = useState(value.length);
  const nextCaret = useRef<number | null>(null);
  const token = fieldKey === "label" ? labelEntryToken(value, Math.min(caret, value.length)) : undefined;
  const dismissedHere = dismissed?.value === value && (!token || dismissed.caret === caret);
  const items = useTypeaheadSuggestions(resolver, token?.prefix ?? value, focused && !readOnly && !dismissedHere);
  const displayValue = fieldKey === "collection" && dismissed?.value === value ? dismissed.label ?? value : value;
  useLayoutEffect(() => {
    const input = ref.current;
    if (input && autoFocus) input.setSelectionRange(input.value.length, input.value.length);
  }, []);
  useEffect(() => { setActive(-1); }, [items]);
  useLayoutEffect(() => {
    if (nextCaret.current !== null) { ref.current?.setSelectionRange(nextCaret.current, nextCaret.current); nextCaret.current = null; }
  }, [value, caret]);
  const choose = (item: TypeaheadSuggestion) => {
    if (token) {
      const replacement = replaceLabelToken(value, token, item.value);
      nextCaret.current = replacement.caret;
      setCaret(replacement.caret);
      onChange(replacement.value, true);
      setDismissed({ value: replacement.value, caret: replacement.caret });
      setActive(-1);
      return;
    }
    onChange(item.value, true);
    setDismissed(item);
    setActive(-1);
  };
  return <>
    <input ref={ref} autoFocus={autoFocus} required={required} readOnly={readOnly} aria-label={label} value={displayValue} placeholder={placeholder} autoComplete="off"
      role={resolver ? "combobox" : undefined} aria-autocomplete={resolver ? "list" : undefined} aria-expanded={resolver ? suggestionsVisible : undefined}
      aria-controls={suggestionsVisible ? id : undefined} aria-activedescendant={suggestionsVisible && active >= 0 && items[active] ? `${id}-${active}` : undefined}
      onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
      onSelect={fieldKey === "label" ? event => setCaret(event.currentTarget.selectionStart ?? value.length) : undefined}
      onChange={event => { setDismissed(null); if (fieldKey === "label") setCaret(event.target.selectionStart ?? event.target.value.length); onChange(event.target.value); }}
      onKeyDown={event => {
        if (event.nativeEvent.isComposing) return;
        if (event.key === "Escape" && items.length) {
          event.preventDefault(); event.stopPropagation(); setDismissed({ value, caret }); setActive(-1);
        } else if ((event.key === "ArrowDown" || event.key === "ArrowUp") && suggestionsVisible && items.length) {
          event.preventDefault(); event.stopPropagation();
          const direction = event.key === "ArrowDown" ? 1 : -1;
          setActive(index => index < 0 ? direction > 0 ? 0 : items.length - 1 : (index + direction + items.length) % items.length);
        } else if (event.key === "Enter" && !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey && suggestionsVisible && active >= 0 && items[active]) {
          event.preventDefault(); event.stopPropagation(); choose(items[active]);
        }
      }} />
    <SuggestionDropdown anchorRef={ref} items={items} id={id} label={`Suggestions for ${label}`} activeIndex={active} onSelect={choose} onVisibilityChange={setSuggestionsVisible} />
  </>;
}