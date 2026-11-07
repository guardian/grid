import { createContext, useContext, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useStore } from "zustand";
import { createLabelEditorStore, labelEditorStore, labelTargetKey } from "@/stores/label-editor-store";
import { useSearchStore } from "@/stores/search-store";
import { labelTargetCounts, type LabelEditContext } from "@/lib/label-operation";
import { createLabelSuggestionProvider, type TypeaheadSuggestion } from "@/lib/typeahead-fields";
import { containPillActivation, EditableSearchPill, PillActionButton } from "./SearchPill";
import { MetadataRow } from "./metadata-primitives";
import { FieldDisclosure } from "./FieldDisclosure";

export const LabelEditorContext = createContext<ReturnType<typeof createLabelEditorStore>>(labelEditorStore);

export function LabelEditor({ context, values, onSearch, resolveContext }: {
  context: LabelEditContext;
  values: readonly { value: string; count: number }[];
  onSearch: (key: string, value: string, event: React.MouseEvent) => void;
  resolveContext?: () => LabelEditContext;
}) {
  const store = useContext(LabelEditorContext);
  const key = labelTargetKey(context.targetIds);
  const value = useStore(store, state => state.drafts.get(key)?.value ?? "");
  const refusal = useStore(store, state => state.refusal);
  const [expanded, setExpanded] = useState(false);
  const [adding, setAdding] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const [caret, setCaret] = useState(value.length);
  const [inputFocused, setInputFocused] = useState(false);
  const [dismissedOwner, setDismissedOwner] = useState<string | null>(null);
  const [activeSuggestion, setActiveSuggestion] = useState(-1);
  const [suggestionState, setSuggestionState] = useState<{
    owner: string;
    status: "pending" | "ready" | "unavailable";
    items: TypeaheadSuggestion[];
  } | null>(null);
  const dataSource = useSearchStore(state => state.dataSource);
  const suggestLabels = useMemo(() => createLabelSuggestionProvider(dataSource, undefined, () => ({ nonFree: "true" })), [dataSource]);
  const headerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const addButtonRef = useRef<HTMLButtonElement>(null);
  const suggestionListRef = useRef<HTMLUListElement>(null);
  const replacementCaret = useRef<number | null>(null);
  const valuesId = useId();
  const suggestionsId = useId();
  const cursor = Math.min(caret, value.length);
  const tokenStart = value.slice(0, cursor).lastIndexOf(",") + 1;
  const nextComma = value.indexOf(",", cursor);
  const tokenEnd = nextComma === -1 ? value.length : nextComma;
  const prefix = value.slice(tokenStart, cursor).trimStart();
  const suggestionOwner = JSON.stringify([key, value, cursor]);
  const currentSuggestions = suggestionState?.owner === suggestionOwner ? suggestionState : null;
  const showSuggestions = adding && inputFocused && dismissedOwner !== suggestionOwner;
  const suggestions = showSuggestions ? currentSuggestions?.items ?? [] : [];
  useEffect(() => {
    if (!adding) return;
    inputRef.current?.focus();
    return () => { addButtonRef.current?.focus(); };
  }, [adding]);
  useLayoutEffect(() => {
    if (replacementCaret.current === null) return;
    inputRef.current?.setSelectionRange(replacementCaret.current, replacementCaret.current);
    replacementCaret.current = null;
  }, [value, caret, dismissedOwner]);
  useEffect(() => {
    setActiveSuggestion(-1);
    if (import.meta.env.VITE_USE_MEDIA_API !== "true" || !showSuggestions) return;
    const controller = new AbortController();
    setSuggestionState({ owner: suggestionOwner, status: "pending", items: [] });
    const timer = setTimeout(() => {
      suggestLabels(prefix, controller.signal).then(items => {
        if (!controller.signal.aborted) setSuggestionState({ owner: suggestionOwner, status: "ready", items });
      }, () => {
        if (!controller.signal.aborted) setSuggestionState({ owner: suggestionOwner, status: "unavailable", items: [] });
      });
    }, 150);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [showSuggestions, suggestLabels, prefix, suggestionOwner]);
  useEffect(() => {
    if (activeSuggestion >= 0) suggestionListRef.current?.children[activeSuggestion]?.scrollIntoView({ block: "nearest" });
  }, [activeSuggestion]);
  const counts = labelTargetCounts(context);
  const disabled = import.meta.env.VITE_USE_MEDIA_API !== "true" || !counts.selected || Boolean(counts.ineligible || counts.unresolved || counts.unavailable);
  const chips = [...values].sort((first, second) => second.count - first.count);
  const act = (action: "add" | "remove", label: string) => {
    const current = resolveContext?.() ?? context;
    if (disabled || current.pending || labelTargetKey(current.targetIds) !== key) return false;
    return store.getState().prepare(action, label, current);
  };
  const cancel = () => {
    store.getState().setDraft(context.targetIds, "");
    setInvalid(false);
    setAdding(false);
  };
  const commit = () => {
    const labels = [...new Set(value.split(",").map(label => label.trim()).filter(Boolean))];
    setInvalid(!labels.length);
    const current = resolveContext?.() ?? context;
    if (!disabled && !current.pending && labelTargetKey(current.targetIds) === key
      && labels.length && store.getState().prepareLabels(labels, current)) {
      store.getState().setDraft(context.targetIds, "");
      setAdding(false);
    }
  };
  const selectSuggestion = (suggestion: TypeaheadSuggestion) => {
    const token = value.slice(tokenStart, tokenEnd);
    const leadingSpace = token.match(/^\s*/)?.[0] ?? "";
    const trailingSpace = token.trim() ? token.match(/\s*$/)?.[0] ?? "" : "";
    const nextValue = value.slice(0, tokenStart) + leadingSpace + suggestion.value + trailingSpace + value.slice(tokenEnd);
    const nextCaret = tokenStart + leadingSpace.length + suggestion.value.length;
    replacementCaret.current = nextCaret;
    store.getState().setDraft(context.targetIds, nextValue);
    setCaret(nextCaret);
    setInvalid(false);
    setDismissedOwner(JSON.stringify([key, nextValue, nextCaret]));
    setActiveSuggestion(-1);
    inputRef.current?.focus();
  };
  return <MetadataRow label="Labels" ref={headerRef} tabIndex={-1} fill>
    <div className="flex items-start gap-1 pt-0.5">
      <div id={valuesId} className="min-w-0 flex-1 flex flex-wrap items-start gap-1">
      {(expanded ? chips : chips.slice(0, 20)).map(chip => <EditableSearchPill key={chip.value} value={chip.value} cqlKey="label" accent
        count={chip.count} total={counts.selected} coverageKnown={!context.pending && counts.unresolved === 0 && counts.unavailable === 0} disabled={disabled} onSearch={onSearch}
        onAdd={() => act("add", chip.value)} onRemove={() => act("remove", chip.value)} />)}
      </div>
      <span className={`shrink-0${adding ? " invisible" : ""}`} aria-hidden={adding || undefined}>
        <PillActionButton ref={addButtonRef} action="add" compact label="Add label" disabled={disabled || adding} onClick={() => setAdding(true)} />
      </span>
    </div>
    <FieldDisclosure expanded={expanded} hasMore={chips.length > 20} controlsId={valuesId} anchorRef={headerRef}
      onExpand={() => setExpanded(true)} onCollapse={() => setExpanded(false)} />
    {adding && <form className="relative mt-1 max-w-full" onKeyDown={event => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        cancel();
      } else containPillActivation(event);
    }} onSubmit={event => {
      event.preventDefault();
      commit();
    }}>
      <div className="flex items-center gap-1.25">
      <input ref={inputRef} role="combobox" aria-label="Add label" aria-invalid={invalid || undefined} value={value}
        placeholder={"label1, label2, label3\u2026"} required
        aria-autocomplete="list" aria-expanded={suggestions.length > 0} aria-controls={suggestions.length ? suggestionsId : undefined}
        aria-busy={showSuggestions && currentSuggestions?.status === "pending"}
        aria-activedescendant={activeSuggestion >= 0 && suggestions[activeSuggestion] ? `${suggestionsId}-${activeSuggestion}` : undefined}
        onFocus={event => { setInputFocused(true); setCaret(event.currentTarget.selectionStart ?? value.length); setDismissedOwner(null); }}
        onBlur={() => setInputFocused(false)}
        onSelect={event => setCaret(event.currentTarget.selectionStart ?? value.length)}
        onChange={event => {
          setInvalid(false);
          setCaret(event.target.selectionStart ?? event.target.value.length);
          setDismissedOwner(null);
          store.getState().setDraft(context.targetIds, event.target.value);
        }}
        onKeyDown={event => {
          if (event.nativeEvent.isComposing) return;
          if ((event.key === "ArrowDown" || event.key === "ArrowUp") && suggestions.length) {
            event.preventDefault();
            event.stopPropagation();
            const direction = event.key === "ArrowDown" ? 1 : -1;
            setActiveSuggestion(index => index < 0 ? direction > 0 ? 0 : suggestions.length - 1
              : (index + direction + suggestions.length) % suggestions.length);
          } else if (event.key === "Enter") {
            event.preventDefault();
            event.stopPropagation();
            if (activeSuggestion >= 0 && suggestions[activeSuggestion]) selectSuggestion(suggestions[activeSuggestion]);
            else commit();
          }
        }}
        className="h-6 pointer-coarse:h-11 min-w-0 flex-1 rounded-sm border border-grid-border bg-[#444] px-1.25 py-0 text-xs text-grid-text placeholder:text-[#888] aria-invalid:border-grid-error focus:outline-2 focus:outline-grid-accent"
        autoComplete="off" />
      <PillActionButton action="cancel" label="Close label entry" title="Close" onClick={cancel} />
      <PillActionButton action="confirm" label="Add label to images" title="Save new label" disabled={disabled} onClick={commit} />
      </div>
      {suggestions.length > 0 && <div className="absolute inset-x-0 top-full z-20 mt-1 rounded-sm border border-grid-separator bg-grid-bg shadow-lg">
        <ul ref={suggestionListRef} id={suggestionsId} role="listbox" aria-label="Label suggestions from the whole library" data-own-scroll
          className="max-h-48 overflow-y-auto overscroll-contain">
        {suggestions.map((suggestion, index) => <li key={suggestion.value} role="presentation">
          <button type="button" role="option" id={`${suggestionsId}-${index}`} aria-selected={index === activeSuggestion} tabIndex={-1}
            onPointerDown={event => event.preventDefault()} onClick={() => selectSuggestion(suggestion)}
            className={`flex min-h-6 pointer-coarse:min-h-11 w-full cursor-pointer items-center justify-between gap-2 px-2 py-0.5 text-left text-xs hover:bg-grid-cell-hover ${index === activeSuggestion ? "bg-grid-cell-hover text-grid-text-bright" : "text-grid-text"}`}>
            <span className="min-w-0 wrap-anywhere">{suggestion.label ?? suggestion.value}</span>
            {suggestion.count !== undefined && <span className="shrink-0 tabular-nums text-grid-text-dim">{suggestion.count.toLocaleString()}</span>}
          </button>
        </li>)}
        </ul>
      </div>}
    </form>}
    {counts.unavailable > 0 && <p role="status" className="text-xs text-grid-text-muted">{counts.unavailable} selected {counts.unavailable === 1 ? "image is" : "images are"} unavailable.</p>}
    {refusal && <p role="status" className="text-xs text-grid-error">Simulation refused: {refusal}.</p>}
  </MetadataRow>;
}

export function LabelOperationReceipts({ inline = false, hidden = false }: { inline?: boolean; hidden?: boolean } = {}) {
  const store = useContext(LabelEditorContext);
  const receipts = useStore(store, state => state.receipts);
  const drafts = useStore(store, state => state.drafts);
  const activityRevision = useStore(store, state => state.activityRevision);
  const activeReceipt = useStore(store, state => state.activeReceipt);
  const repeated = useStore(store, state => state.repeated);
  const receiptOrder = receipts.map((_, index) => index).reverse();
  if (activeReceipt >= 0 && activeReceipt < receipts.length) {
    receiptOrder.splice(receiptOrder.indexOf(activeReceipt), 1);
    receiptOrder.unshift(activeReceipt);
  }
  const unfinished = [...drafts.values()].some(draft => Boolean(draft.value.trim()))
    || receipts.some(receipt => receipt.items.some(item => item.state === "submitted" || item.state === "unknown"
      || (item.state === "accepted-awaiting-visibility" && item.observation !== "observed")));
  useEffect(() => {
    if (inline || !unfinished) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [unfinished, inline]);
  if (hidden || (!receipts.length && !drafts.size)) return null;
  return <aside aria-label="Label activity" onKeyDown={containPillActivation}
    className={`${inline ? "m-3" : "fixed bottom-4 left-4 z-[120] w-80 max-w-[calc(100vw-2rem)]"} rounded bg-black/90 text-white shadow-lg`}>
    <details open={receipts.length > 0} key={activityRevision}>
      <summary tabIndex={0} className="px-3 py-2 cursor-pointer text-xs">Label activity ({receipts.length})</summary>
      <div className="max-h-[30dvh] overflow-auto overscroll-contain px-3 pb-3 space-y-3">
        {repeated && <p role="status" className="text-xs">Operation already recorded.</p>}
        {[...drafts.values()].map(draft => <details className="text-xs wrap-anywhere" key={labelTargetKey(draft.targetIds)}>
          <summary tabIndex={0} className="cursor-pointer">Unfinished input ({draft.targetIds.length} {draft.targetIds.length === 1 ? "image" : "images"})</summary>
          <p>{draft.value.slice(0, 160)}{draft.value.length > 160 ? " [Preview truncated]" : ""}</p>
          <p>{draft.targetIds.slice(0, 8).join(", ")}{draft.targetIds.length > 8 ? ` (+${draft.targetIds.length - 8} more)` : ""}</p>
        </details>)}
        {receiptOrder.map(index => {
          const receipt = receipts[index];
          const data = JSON.stringify({ action: receipt.intent.action, label: receipt.intent.label.slice(0, 240),
            ...receipt.counts, targets: receipt.intent.targetIds.slice(0, 8),
            ...(receipt.intent.targetIds.length > 8 && { additionalTargets: receipt.intent.targetIds.length - 8 }),
            ...(receipt.blocked && { blocked: receipt.blocked }),
            outcomes: receipt.items.reduce<Record<string, number>>((counts, item) => { counts[item.state] = (counts[item.state] ?? 0) + 1; return counts; }, {}),
            items: receipt.items.slice(0, 8),
          }, null, 2);
          return <div key={index}>
            <p className="text-xs mb-1" role="status">{receipt.mode === "disconnected" ? "Not sent - dry run"
              : receipt.items.some(item => item.observation) ? "Simulated command - readback only" : "Simulated - no service calls"}</p>
            <pre className="text-xs whitespace-pre-wrap wrap-anywhere">{data.slice(0, 1800)}{data.length > 1800 || receipt.intent.label.length > 240 ? "\n[Preview truncated]" : ""}</pre>
          </div>;
        })}
      </div>
    </details>
  </aside>;
}