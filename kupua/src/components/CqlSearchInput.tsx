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
import { isMobile } from "@/lib/is-mobile";

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

  const dataSource = useSearchStore((s) => s.dataSource);

  // Keep a ref to the store's aggregation cache so typeahead resolvers can
  // read it at resolution time without forcing the typeahead to rebuild.
  const aggregations = useSearchStore((s) => s.aggregations);
  const aggregationsRef = useRef(aggregations);
  aggregationsRef.current = aggregations;

  // Build typeahead from DAL — memoised so we don't rebuild on every render
  const typeahead = useMemo(() => {
    const getAggs = () => aggregationsRef.current;
    const fieldDefs = buildTypeaheadFields(dataSource, getAggs);
    const hiddenFieldIds = new Set(
      fieldDefs
        .filter((d) => d.showInKeySuggestions === false)
        .map((d) => d.fieldName)
    );
    const fields = fieldDefs.map(({ fieldName, resolver }) => {
      const cqlResolver = resolver
        ? async (_fieldName: string) => {
            const suggestions = Array.isArray(resolver)
              ? resolver
              : await resolver(_fieldName);
            return suggestions.map((s) =>
              typeof s === "string"
                ? { label: undefined as undefined, value: s }
                : { label: undefined as undefined, value: s.value, count: s.count }
            );
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
    return new LazyTypeahead(fields, hiddenFieldIds);
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

        // Strip incomplete CQL chip expressions (key: with no value) before
        // reporting to parent. These appear while composing a new chip —
        // pressing + inserts a bare ":", selecting a field produces "credit:",
        // etc.  Sending them upstream would trigger URL/search updates with
        // meaningless fragments that reset results to 0.
        // In CQL normalised form complete chips are always "key:value" (no
        // space between colon and value), so ":(?=\s|$)" identifies incomplete
        // chips reliably.  Matches kahuna's renderQuery .filter(item => item.value).
        const effective = detail.queryStr
          // Strip incomplete chip expressions (key: with no value)
          .replace(/[+\-]?[\w#~]*:(?=\s|$)/g, "")
          // CQL wraps text in quotes when it contains whitespace. A trailing
          // space alone (e.g. user typed "climate ") triggers quoting that
          // adds no search meaning.  Strip these — keep only quotes around
          // real multi-word phrases (and trim trailing space within them).
          // Matches kahuna's renderQuery which re-renders from AST values
          // (no CQL quoting) and trims the result.
          .replace(/"([^"]*)"/g, (_match: string, inner: string) => {
            const trimmed = inner.trim();
            return trimmed.includes(" ") ? `"${trimmed}"` : trimmed;
          })
          .replace(/\s{2,}/g, " ")
          .trim();

        if (effective !== lastEffectiveQueryRef.current) {
          lastEffectiveQueryRef.current = effective;
          selfCausedChangeRef.current = true;
          onChangeRef.current(effective);
        }
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

    // Inject custom styles into the open shadow DOM for elements that
    // CQL doesn't expose via theme or ::part.
    if (el.shadowRoot) {
      const style = document.createElement("style");
      style.textContent = `.Cql__OptionCount { opacity: 0.7; margin-left: 1.5em; }`;
      el.shadowRoot.appendChild(style);
    }

    // ---------------------------------------------------------------------
    // Caret preservation across tab/window switch.
    //
    // Problem: when the tab hides (or the window blurs via Cmd/Alt+Tab),
    // the browser clears the DOM selection. On return, the browser
    // refocuses the editable, ProseMirror's focusin handler runs
    // selectionFromDOM, reads position 0 from the cleared DOM, and writes
    // it to PM state — resetting the caret to the start of the field.
    //
    // Mechanism (three pieces):
    //
    //   1. Wrap view.dispatch to continuously cache the latest selection
    //      (`lastKnownSelection`). PM positions are cheap integers — zero
    //      per-keystroke cost beyond an object allocation.
    //
    //   2. Capture the editor DOM's `blur` event in the CAPTURE phase,
    //      BEFORE CQL's own plugin blur handler fires. CQL dispatches
    //      `setSelection(near(0))` on blur (cqlInput/editor/plugins/cql.ts
    //      L382), which would otherwise clobber `lastKnownSelection`. By
    //      snapshotting in the capture phase we record the real position.
    //
    //   3. On `visibilitychange:visible` / window `focus`, dispatch the
    //      saved selection in a microtask AND in a rAF (belt-and-braces:
    //      the microtask wins the race against PM's focusin reset most of
    //      the time; the rAF re-dispatches if anything else interferes).
    //
    // Listeners only fire on tab/window switch (not on every keystroke or
    // selection change), so per-keystroke cost is the dispatch wrapper's
    // single object allocation.
    // ---------------------------------------------------------------------
    let savedSelection: { from: number; to: number } | null = null;
    let lastKnownSelection: { from: number; to: number } | null = null;

    type CqlEditorView = {
      hasFocus(): boolean;
      focus(): void;
      dispatch(tr: unknown): void;
      state: {
        selection: {
          from: number;
          to: number;
          constructor: { create(doc: unknown, from: number, to: number): unknown };
        };
        doc: { content: { size: number } };
        tr: { setSelection(sel: unknown): unknown };
      };
      dom: HTMLElement;
    };
    const getView = (): CqlEditorView | undefined =>
      (el as unknown as { editorView?: CqlEditorView }).editorView;

    // Wire dispatch wrapper + editor-blur snapshot. CQL's connectedCallback
    // creates editorView synchronously, but appendChild is async-ish in
    // some browsers, so we retry once via rAF.
    let dispatchWrapped = false;
    const tryWrapDispatch = () => {
      if (dispatchWrapped) return;
      const view = getView();
      if (!view) return;
      const original = view.dispatch.bind(view);
      view.dispatch = (tr: unknown) => {
        original(tr);
        lastKnownSelection = {
          from: view.state.selection.from,
          to: view.state.selection.to,
        };
      };
      // Snapshot in capture phase, BEFORE CQL's plugin reset-to-0 fires.
      view.dom.addEventListener("blur", () => {
        // Only save if there's a meaningful position (skip empty editor).
        if (lastKnownSelection && lastKnownSelection.from > 1) {
          savedSelection = { ...lastKnownSelection };
        }
      }, true);
      lastKnownSelection = {
        from: view.state.selection.from,
        to: view.state.selection.to,
      };
      dispatchWrapped = true;
    };
    tryWrapDispatch();
    if (!dispatchWrapped) requestAnimationFrame(tryWrapDispatch);

    const handleHide = () => {
      // savedSelection is normally already populated by the editor-blur
      // capture listener. Fall back to lastKnownSelection only if the
      // editor never received a blur (e.g. page hidden via OS while editor
      // had focus — some browsers fire visibilitychange without blur).
      if (savedSelection) return;
      if (lastKnownSelection && lastKnownSelection.from > 1) {
        savedSelection = { ...lastKnownSelection };
      }
    };

    const handleShow = () => {
      const saved = savedSelection;
      if (!saved) return;
      savedSelection = null;
      const view = getView();
      if (!view) return;
      const docSize = view.state.doc.content.size;
      const from = Math.min(saved.from, docSize);
      const to = Math.min(saved.to, docSize);
      view.focus();

      const dispatchSelection = () => {
        const v = getView();
        if (!v || v.state.selection.from === from) return;
        try {
          const SelCtor = v.state.selection.constructor;
          const newSel = SelCtor.create(v.state.doc, from, to);
          v.dispatch(v.state.tr.setSelection(newSel));
        } catch {
          // Defensive: doc may have changed shape; leave caret alone.
        }
      };
      // Microtask wins the race vs PM's synchronous focusin reset most of
      // the time; rAF re-dispatch covers the remaining cases.
      queueMicrotask(dispatchSelection);
      requestAnimationFrame(dispatchSelection);
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") handleHide();
      else handleShow();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("blur", handleHide);
    window.addEventListener("focus", handleShow);

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("blur", handleHide);
      window.removeEventListener("focus", handleShow);
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
      lastEffectiveQueryRef.current = value;
      if (selfCausedChangeRef.current) {
        selfCausedChangeRef.current = false;
      } else {
        cqlInputRef.current.setAttribute("value", value);
      }
    }
  }, [value]);

  return (
    <div
      ref={containerRef}
      className="w-full [&_cql-input]:w-full [&_cql-input]:block"
    />
  );
}

