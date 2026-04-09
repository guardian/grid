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
  customElements.define("cql-input", CqlInput as unknown as CustomElementConstructor);
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
    // Only autofocus when not in image detail view. The CQL input is part of
    // the layout even when image detail is open (hidden behind the overlay).
    // If autofocus fires on reload in image detail view, the hidden search box
    // steals focus — breaking keyboard shortcuts (e.g. 'f' for fullscreen)
    // because the shortcut system sees an editable target.
    const imageDetailOpen = new URL(window.location.href).searchParams.has("image");
    if (!imageDetailOpen) {
      el.setAttribute("autofocus", "");
    }

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

    // Escape blurs the search box — but only when the CQL typeahead popup
    // is not visible. When suggestions are showing, CQL handles Escape
    // internally (hides the popup via ProseMirror keydown inside the shadow
    // DOM). We use capture phase so we see data-isvisible BEFORE CQL's
    // handler flips it to "false".
    const handleEscape = (e: Event) => {
      if ((e as KeyboardEvent).key !== "Escape") return;

      // If the typeahead popup is visible, CQL will dismiss it — don't blur
      const popover = el.shadowRoot?.querySelector('[data-isvisible="true"]');
      if (popover) return;

      (document.activeElement as HTMLElement | null)?.blur();
      el.blur();
      // Also try to blur inside the shadow root
      el.shadowRoot?.activeElement instanceof HTMLElement &&
        el.shadowRoot.activeElement.blur();
    };
    el.addEventListener("keydown", handleEscape, true);

    // Prevent keyboard events from bubbling (matches kahuna).
    // Navigation keys propagate so useListNavigation can scroll/move
    // the results — even when the caret is in the search box.
    // ArrowLeft/Right are trapped — they're needed for cursor movement
    // inside the text field. ArrowUp/Down, PageUp/Down, Home/End all
    // propagate to the list navigation handler.
    const keysToPropagate = [
      "ArrowUp", "ArrowDown",
      "PageUp", "PageDown",
      "Home", "End",
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
      el.removeEventListener("keydown", handleEscape, true);
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

