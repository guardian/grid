import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useSearchStore } from "@/stores/search-store";
import { buildTypeaheadFields, type TypeaheadSuggestion } from "@/lib/typeahead-fields";
import { SuggestionDropdown } from "./SuggestionDropdown";
import { useCollectionStore } from "@/stores/collection-store";
import { useTypeaheadSuggestions } from "@/hooks/useTypeaheadSuggestions";

export function MetadataSuggestionInput({ label, fieldKey, value, onChange, placeholder }: {
  label: string; fieldKey: string; value: string; onChange: (value: string) => void; placeholder?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const id = useId();
  const source = useSearchStore(state => state.dataSource);
  const collectionTree = useCollectionStore(state => fieldKey === "collection" ? state.tree : null);
  const resolver = useMemo(() => buildTypeaheadFields(source, () => null, () => ({ nonFree: "true" }))
    .find(field => field.fieldName === fieldKey)?.resolver, [source, fieldKey, collectionTree]);
  const [active, setActive] = useState(-1);
  const [suggestionsVisible, setSuggestionsVisible] = useState(false);
  const [focused, setFocused] = useState(true);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const items = useTypeaheadSuggestions(resolver, value, focused && dismissed !== value);
  useLayoutEffect(() => {
    const input = ref.current;
    if (input) input.setSelectionRange(input.value.length, input.value.length);
  }, []);
  useEffect(() => { setActive(-1); }, [items]);
  const choose = (item: TypeaheadSuggestion) => {
    onChange(item.value);
    setDismissed(item.value);
    setActive(-1);
  };
  return <>
    <input ref={ref} autoFocus aria-label={label} value={value} placeholder={placeholder} autoComplete="off"
      role={resolver ? "combobox" : undefined} aria-autocomplete={resolver ? "list" : undefined} aria-expanded={resolver ? suggestionsVisible : undefined}
      aria-controls={suggestionsVisible ? id : undefined} aria-activedescendant={suggestionsVisible && active >= 0 && items[active] ? `${id}-${active}` : undefined}
      onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
      onChange={event => { setDismissed(null); onChange(event.target.value); }}
      onKeyDown={event => {
        if (event.nativeEvent.isComposing) return;
        if (event.key === "Escape" && items.length) {
          event.preventDefault(); event.stopPropagation(); setDismissed(value); setActive(-1);
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