import { useEffect, useState } from "react";
import type { TypeaheadResolver, TypeaheadSuggestion } from "@/lib/typeahead-fields";

export function useTypeaheadSuggestions(resolver: TypeaheadResolver | undefined, value: string, enabled = true) {
  const [items, setItems] = useState<TypeaheadSuggestion[]>([]);

  useEffect(() => {
    setItems([]);
    if (!enabled || !resolver) return;

    if (Array.isArray(resolver)) {
      const prefix = value.toLowerCase();
      setItems(resolver
        .filter(item => item.toLowerCase().startsWith(prefix))
        .slice(0, 50)
        .map(value => ({ value })));
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => {
      resolver(value, controller.signal).then(items => {
        if (!controller.signal.aborted) setItems(items.slice(0, 50));
      }, () => {});
    }, 150);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [resolver, value, enabled]);

  return items;
}