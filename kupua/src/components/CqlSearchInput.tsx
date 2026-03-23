/**
 * CqlSearchInput — React wrapper around @guardian/cql's <cql-input> Web Component.
 *
 * The Web Component handles all chip rendering, editing, keyboard navigation,
 * cursor management, and typeahead popover. We just:
 *   1. Register it as a custom element (once)
 *   2. Mount it in a ref
 *   3. Sync the `value` attribute
 *   4. Listen for `queryChange` events
 *   5. Feed it typeahead fields with resolvers
 */

import { useEffect, useMemo, useRef } from "react";
import {
  createCqlInput,
  TypeaheadField,
} from "@guardian/cql";
import { LazyTypeahead } from "@/lib/lazy-typeahead";
import { useSearchStore } from "@/stores/search-store";
import { buildTypeaheadFields } from "@/lib/typeahead-fields";

// ---------------------------------------------------------------------------
// Theme — matches kupua's dark palette
// ---------------------------------------------------------------------------

const theme = {
  baseFontSize: "13px",
  input: {
    // Use single-value padding so the placeholder's calc(input.padding + chipContent.padding) works.
    // Multi-value shorthand (e.g. "2px 6px") breaks CSS calc() inside the CQL shadow DOM.
    layout: { padding: "4px" },
    color: { background: "transparent" },
  },
  placeholder: {
    color: { text: "#8a8a8a" }, // matches --color-grid-text-dim
  },
  chipWrapper: {
    color: { background: "#2a2a2a" },
  },
  chipContent: {
    layout: { padding: "2px" },
  },
  chipHandle: {
    color: {
      background: "none",
      border: "#444",
    },
  },
  typeahead: {
    layout: {
      minWidth: "200px",
      borderRadius: "4px",
      padding: "4px",
    },
    color: {
      background: "#333",
    },
    option: {
      layout: { padding: "4px 8px" },
    },
    selectedOption: {
      color: {
        background: "#00adee",
        text: "#fff",
      },
    },
  },
};

// CQL parser settings — same as kahuna
const cqlParserSettings = {
  operators: false,
  groups: false,
  shortcuts: {
    "#": "label",
    "~": "collection",
  },
};

// ---------------------------------------------------------------------------
// Custom element registration (once globally)
// ---------------------------------------------------------------------------

let registered = false;

function ensureRegistered(typeahead: LazyTypeahead) {
  if (registered) return;
  const CqlInput = createCqlInput(typeahead, {
    theme,
    lang: cqlParserSettings,
  });
  // @ts-expect-error — upstream: @guardian/cql's createCqlInput return type
  // is missing HTMLElement properties that TS DOM types require for
  // CustomElementConstructor. The class works fine at runtime.
  customElements.define("cql-input", CqlInput);
  registered = true;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface CqlSearchInputProps {
  value: string;
  onChange: (queryStr: string) => void;
  /** Called whenever the editor content changes — true if there's any content */
  onHasContentChange?: (hasContent: boolean) => void;
  placeholder?: string;
}

export function CqlSearchInput({
  value,
  onChange,
  onHasContentChange,
  placeholder = "Search for images… (type + for advanced search)",
}: CqlSearchInputProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cqlInputRef = useRef<HTMLElement | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onHasContentRef = useRef(onHasContentChange);
  onHasContentRef.current = onHasContentChange;

  const dataSource = useSearchStore((s) => s.dataSource);

  // Build typeahead from DAL — memoised so we don't rebuild on every render
  const typeahead = useMemo(() => {
    const fieldDefs = buildTypeaheadFields(dataSource);
    const fields = fieldDefs.map(({ fieldName, resolver }) => {
      const cqlResolver = resolver
        ? async (_fieldName: string) => {
            const suggestions = Array.isArray(resolver)
              ? resolver
              : await resolver(_fieldName);
            return suggestions.map((s) => ({
              label: undefined as undefined,
              value: s,
            }));
          }
        : undefined;

      return new TypeaheadField(
        fieldName,
        fieldName,
        "",
        cqlResolver,
        "TEXT"
      );
    });
    return new LazyTypeahead(fields);
  }, [dataSource]);

  // Register custom element + create instance
  useEffect(() => {
    ensureRegistered(typeahead);

    const container = containerRef.current;
    if (!container) return;

    // Create the element
    const el = document.createElement("cql-input");
    el.setAttribute("placeholder", placeholder);
    el.setAttribute("value", value);
    el.setAttribute("autofocus", "");

    // Style the element to fill its container
    el.style.width = "100%";
    el.style.minHeight = "28px";

    // Listen for query changes
    const handleQueryChange = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (detail?.queryStr !== undefined) {
        onChangeRef.current(detail.queryStr);
        onHasContentRef.current?.(detail.queryStr.trim().length > 0);
      }
    };
    el.addEventListener("queryChange", handleQueryChange);

    // Prevent keyboard events from bubbling (matches kahuna).
    // Navigation keys propagate so the ImageTable keyboard handler can
    // scroll the results — even when the caret is in the search box.
    // Home/End are handled separately via capture-phase listener on
    // document (see ImageTable.tsx) — they must NOT propagate here,
    // otherwise the editor would also move the cursor.
    const keysToPropagate = [
      "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight",
      "PageUp", "PageDown",
    ];
    const stopUnhandled = (e: Event) => {
      const { shiftKey, altKey, metaKey, ctrlKey, key } = e as KeyboardEvent;
      const noModifier = !(shiftKey || altKey || metaKey || ctrlKey);
      if (e.defaultPrevented || (noModifier && !keysToPropagate.includes(key))) {
        e.stopImmediatePropagation();
      }
    };
    for (const type of ["keydown", "keyup", "keypress"]) {
      el.addEventListener(type, stopUnhandled);
    }

    container.appendChild(el);
    cqlInputRef.current = el;

    return () => {
      el.removeEventListener("queryChange", handleQueryChange);
      for (const type of ["keydown", "keyup", "keypress"]) {
        el.removeEventListener(type, stopUnhandled);
      }
      container.removeChild(el);
      cqlInputRef.current = null;
    };
    // Only run on mount — value sync is handled separately below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync value attribute when prop changes (e.g. back/forward navigation)
  useEffect(() => {
    if (cqlInputRef.current) {
      cqlInputRef.current.setAttribute("value", value);
    }
  }, [value]);

  return (
    <div
      ref={containerRef}
      className="w-full [&_cql-input]:w-full [&_cql-input]:block"
    />
  );
}

