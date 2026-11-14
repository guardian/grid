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

import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import {
  createCqlInput,
  Typeahead,
  TypeaheadField,
} from "@guardian/cql";
import { LazyTypeahead } from "@/lib/lazy-typeahead";
import { useSearchStore } from "@/stores/search-store";
import { buildTypeaheadFields, buildDynamicFieldFallback } from "@/lib/typeahead-fields";
import { isMobile } from "@/lib/is-mobile";
import { useIsCompact } from "@/hooks/useShell";
import { isCqlChipDeleteEvent } from "@/lib/cql-chip-delete";
import { beginTraceInteraction } from "@/lib/perceived-trace";
import { deriveEffectiveQuery } from "@/lib/cql-effective-query";
import { queryStrFromAst } from "@/lib/cql-ast-serialize";

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
let activeTypeahead: LazyTypeahead | undefined;

function ensureRegistered() {
  if (registered) return;
  const typeahead = new Typeahead([]);
  typeahead.getSuggestions = (...args) => activeTypeahead?.getSuggestions(...args) ?? Promise.resolve([]);
  const CqlInput = createCqlInput(typeahead, {
    theme,
    lang: cqlParserSettings,
  });
  customElements.define("cql-input", CqlInput);
  registered = true;
}


// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface CqlSearchInputProps {
  value: string;
  externalRevision?: number;
  onChange: (queryStr: string) => void;
  onDraftChange?: (queryStr: string) => void;
  /** Called whenever the editor content changes — true if there's any content */
  onHasContentChange?: (hasContent: boolean) => void;
  placeholder?: string;
}

export function CqlSearchInput({
  value,
  externalRevision = 0,
  onChange,
  onDraftChange,
  onHasContentChange,
  placeholder = "Search for images… (type + for advanced search)",
}: CqlSearchInputProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cqlInputRef = useRef<HTMLElement | null>(null);
  const compact = useIsCompact();
  useLayoutEffect(() => {
    const el = cqlInputRef.current;
    if (!el) return;
    el.toggleAttribute("data-compact", compact);
    if (compact) el.style.setProperty("--cql-popover-top", `${el.getBoundingClientRect().bottom + 4}px`);
  }, [compact]);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onDraftChangeRef = useRef(onDraftChange);
  onDraftChangeRef.current = onDraftChange;
  const onHasContentRef = useRef(onHasContentChange);
  onHasContentRef.current = onHasContentChange;

  // Track the last "effective" query we reported to the parent — i.e. the
  // queryStr with incomplete chip expressions stripped. We only call onChange
  // when this changes, preventing URL/search updates during chip composition.
  // Matches kahuna's renderQuery `.filter(item => item.value)` + distinctUntilChanged.
  const lastEffectiveQueryRef = useRef(value);

  // True when the most recent onChange was caused by the CQL editor's own
  // queryChange event (user editing). Consumed by the value-sync effect to
  // skip setAttribute — the CQL editor's ProseMirror state is richer than
  // the stripped effective query (it may contain an empty-value chip like
  // `colourModel:` that the user is still composing/editing). Without this
  // guard, the stripped value would flow back via props and clobber the chip.
  // Kahuna avoids this entirely because gr-cql-input never syncs the value
  // attribute back from the URL.
  const selfCausedChangeRef = useRef(false);
  const externalRevisionRef = useRef(externalRevision);

  const dataSource = useSearchStore((s) => s.dataSource);

  // Build typeahead from DAL — memoised so we don't rebuild on every render
  //
  // liveQueryRef: written by LazyTypeahead on every getSuggestions call with
  // the query serialized from the LIVE AST it's just been given. getParams
  // (below) prefers this over the search store's committed query, which
  // lags behind by one event — the store only updates once our own
  // queryChange listener runs, which happens after the widget's own
  // suggestion pass. Without this, a field whose key was free text a
  // moment ago (e.g. a quoted ES path just turned into a chip by typing
  // ":") gets its value-suggestion aggregation wrongly scoped by that
  // stale, pre-chip free-text content — self-defeating the very
  // aggregation meant to inspect that field. See deviations.md.
  const liveQueryRef = useRef<string | undefined>(undefined);
  const typeahead = useMemo(() => {
    const getAggs = () => useSearchStore.getState().aggregations;
    const getParams = () => {
      const params = useSearchStore.getState().params;
      return liveQueryRef.current !== undefined
        ? { ...params, query: liveQueryRef.current || undefined }
        : params;
    };
    const getTickerCounts = () => useSearchStore.getState().tickerCounts;
    const getIsFilterCounts = () => useSearchStore.getState().isFilterCounts;
    const fieldDefs = buildTypeaheadFields(dataSource, getAggs, getParams, getTickerCounts, getIsFilterCounts);
    const hiddenFieldIds = new Set(
      fieldDefs
        .filter((d) => d.showInKeySuggestions === false)
        .map((d) => d.fieldName)
    );
    const fields = fieldDefs.map(({ fieldName, resolver }) => {
      const cqlResolver = resolver
        ? async (_fieldName: string, signal?: AbortSignal) => {
            const suggestions = Array.isArray(resolver)
              ? resolver
              : await resolver(_fieldName, signal);
            return suggestions.map((s) =>
              typeof s === "string"
                ? { label: undefined as undefined, value: s }
                : { label: s.label ?? undefined, value: s.value, count: s.count }
            );
          }
        : undefined;

      return new TypeaheadField(
        fieldName,
        fieldName,
        undefined,
        cqlResolver,
      );
    });
    const dynamicFieldFallback = buildDynamicFieldFallback(dataSource, getParams);
    return new LazyTypeahead(fields, hiddenFieldIds, dynamicFieldFallback, liveQueryRef);
  }, [dataSource]);

  // Register custom element + create instance
  useEffect(() => {
    ensureRegistered();

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
    //
    // Also skip autofocus on touch devices — focusing the input pops the
    // on-screen keyboard, which obscures most of the app on phones/tablets.
    const imageDetailOpen = new URL(window.location.href).searchParams.has("image");
    if (!imageDetailOpen && !isMobile()) {
      el.setAttribute("autofocus", "");
    }

    // Style the element to fill its container
    el.style.width = "100%";
    el.style.minHeight = "28px";

    // Listen for query changes
    const handleQueryChange = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (detail?.queryStr !== undefined) {
        // Always update the content indicator (drives the clear button)
        onHasContentRef.current?.(detail.queryStr.trim().length > 0);

        // Re-derive the query string from the AST ourselves rather than
        // trusting detail.queryStr — @guardian/cql's own serialiser has a
        // quoting bug for plain phrases containing reserved chars (e.g.
        // `"hello:world"` loses its quotes). See cql-ast-serialize.ts.
        const queryStr = detail.queryAst
          ? queryStrFromAst(detail.queryAst)
          : detail.queryStr;

        // Strip incomplete CQL chip expressions (key: with no value) before
        // reporting to parent. These appear while composing a new chip —
        // pressing + inserts a bare ":", selecting a field produces "credit:",
        // etc.  Sending them upstream would trigger URL/search updates with
        // meaningless fragments that reset results to 0.
        // Matches kahuna's renderQuery `.filter(item => item.value)`.
        const effective = deriveEffectiveQuery(queryStr);
        onDraftChangeRef.current?.(queryStr);

        if (effective !== lastEffectiveQueryRef.current) {
          lastEffectiveQueryRef.current = effective;
          selfCausedChangeRef.current = true;
          onChangeRef.current(effective);
        }
      }
    };
    el.addEventListener("queryChange", handleQueryChange);
    const handleChipDelete = (event: Event) => {
      if (isCqlChipDeleteEvent(event)) beginTraceInteraction("chip-remove");
    };
    el.addEventListener("click", handleChipDelete, true);

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

    cqlInputRef.current = el;
    activeTypeahead = typeahead;
    typeahead.setEnabled(true);
    container.appendChild(el);
    const syncPresentation = () => {
      const compact = isMobile();
      el.toggleAttribute("data-compact", compact);
      if (compact) el.style.setProperty("--cql-popover-top", `${el.getBoundingClientRect().bottom + 4}px`);
    };
    syncPresentation();
    const positionObserver = new ResizeObserver(syncPresentation);
    positionObserver.observe(container.closest('[role="toolbar"]') ?? container);

    // Inject custom styles into the open shadow DOM for elements that
    // CQL doesn't expose via theme or ::part.
    if (el.shadowRoot) {
      const style = document.createElement("style");
      style.textContent = `.Cql__OptionCount { opacity: 0.7; margin-left: 1.5em; }
        :host([data-compact]) .Cql__TypeaheadPopoverContainer {
          position: fixed !important; top: var(--cql-popover-top, 46px) !important; left: 8px !important; right: 8px !important;
          width: auto !important; max-width: none !important; transform: none !important;
        }`;
      el.shadowRoot.appendChild(style);
    }

    // Chip deletion can remove the focused contenteditable and dismiss the
    // mobile keyboard. This refocus is separate from upstream blur selection.
    // connectedCallback creates editorView synchronously before appendChild returns.
    const view = (el as HTMLElement & {
      editorView?: { dom: HTMLElement; focus(): void };
    }).editorView;
    if (view) {
      let recentKeyAction = false;
      let keyActionTimer: ReturnType<typeof setTimeout> | undefined;

      view.dom.addEventListener("keydown", (e: KeyboardEvent) => {
        if (!isMobile()) return;
        if (e.key === "Backspace" || e.key === "Delete") {
          recentKeyAction = true;
          clearTimeout(keyActionTimer);
          // Clear after a frame — any DOM-mutation blur from this keypress
          // will fire synchronously or in the same microtask.
          keyActionTimer = setTimeout(() => { recentKeyAction = false; }, 80);
        }
      }, true);

      view.dom.addEventListener("focusout", (e: FocusEvent) => {
        if (!isMobile() || !recentKeyAction) return;
        const related = e.relatedTarget as Node | null;
        // If focus moved to another element outside the editor, don't interfere
        if (related && !el.contains(related) && !el.shadowRoot?.contains(related)) {
          return;
        }
        // Focus left because the DOM node was removed (chip deletion).
        // Refocus to keep the keyboard open.
        queueMicrotask(() => {
          const active = document.activeElement;
          // Only refocus if nothing else grabbed focus in the meantime
          if (!active || active === document.body || active === el || el.contains(active)) {
            view.focus();
          }
        });
      });
    }

    return () => {
      positionObserver.disconnect();
      typeahead.setEnabled(false);
      if (activeTypeahead === typeahead) activeTypeahead = undefined;
      cqlInputRef.current = null;
      el.removeEventListener("queryChange", handleQueryChange);
      el.removeEventListener("click", handleChipDelete, true);
      el.removeEventListener("keydown", handleEscape, true);
      for (const type of ["keydown", "keyup", "keypress"]) {
        el.removeEventListener(type, stopUnhandled);
      }
      container.removeChild(el);
    };
    // Only run on mount — value sync is handled separately below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typeahead]);

  // Sync value attribute when prop changes (e.g. back/forward navigation).
  // Update lastEffectiveQueryRef BEFORE setAttribute so the synchronous
  // queryChange fired by the CQL web component sees the new baseline and
  // doesn't re-report the same query as a change.
  //
  // Skip setAttribute when the value change was caused by our own queryChange
  // handler (selfCausedChangeRef). The CQL editor's ProseMirror state is
  // authoritative while the user is editing — it may contain empty-value
  // chips (e.g. `colourModel:` after backspacing the last value character)
  // that our stripping logic removed before reporting to the URL. Forcing
  // the stripped value back would destroy the chip.
  useEffect(() => {
    if (cqlInputRef.current) {
      const external = externalRevisionRef.current !== externalRevision;
      externalRevisionRef.current = externalRevision;
      lastEffectiveQueryRef.current = value;
      if (selfCausedChangeRef.current && !external) {
        selfCausedChangeRef.current = false;
      } else {
        selfCausedChangeRef.current = false;
        typeahead.setEnabled(false);
        try {
          cqlInputRef.current.setAttribute("value", value);
        } finally {
          typeahead.setEnabled(true);
        }
      }
    }
  }, [value, externalRevision, typeahead]);

  return (
    <div
      ref={containerRef}
      className="w-full [&_cql-input]:w-full [&_cql-input]:block"
    />
  );
}

