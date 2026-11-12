import { createContext, useContext, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useStore } from "zustand";
import { createLabelEditorStore, labelEditorStore, labelTargetKey } from "@/stores/label-editor-store";
import { useSearchStore } from "@/stores/search-store";
import { labelTargetCounts, type LabelEditContext } from "@/lib/label-operation";
import { createLabelSuggestionProvider, type TypeaheadSuggestion } from "@/lib/typeahead-fields";
import { containPillActivation, EditableSearchPill, PillActionButton } from "./SearchPill";
import { MetadataBlock } from "./metadata-primitives";
import { FieldDisclosure } from "./FieldDisclosure";
import { SuggestionDropdown } from "./SuggestionDropdown";
import { FieldAddButton } from "./FieldAddButton";
import { ImageActivityFrame } from "./ImageActivityFrame";

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
  const targetLimit = useStore(store, state => state.targetLimit);
  const [expanded, setExpanded] = useState(false);
  const [adding, setAdding] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const [caret, setCaret] = useState(value.length);
  const [inputFocused, setInputFocused] = useState(false);
  const [dismissedOwner, setDismissedOwner] = useState<string | null>(null);
  const [activeSuggestion, setActiveSuggestion] = useState(-1);
  const [suggestionsVisible, setSuggestionsVisible] = useState(false);
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
    const input = inputRef.current;
    input?.focus();
    input?.setSelectionRange(value.length, value.length);
    setCaret(value.length);
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
  const counts = labelTargetCounts(context);
  const oversized = targetLimit !== undefined && counts.selected > targetLimit;
  const disabled = import.meta.env.VITE_USE_MEDIA_API !== "true" || oversized || !counts.selected || Boolean(counts.ineligible || counts.unresolved || counts.unavailable);
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
  return <MetadataBlock label="Labels" ref={headerRef} tabIndex={-1} action={
    <span className={adding ? "invisible" : ""} aria-hidden={adding || undefined}>
      <FieldAddButton ref={addButtonRef} iconOnly label="Add label" disabled={disabled || adding} onClick={() => setAdding(true)} />
    </span>
  }>
      <div id={valuesId} className="min-w-0 flex-1 flex flex-wrap items-start gap-1">
      {(expanded ? chips : chips.slice(0, 20)).map(chip => <EditableSearchPill key={chip.value} value={chip.value} cqlKey="label" accent
        count={chip.count} total={counts.selected} coverageKnown={!context.pending && counts.unresolved === 0 && counts.unavailable === 0} disabled={disabled} onSearch={onSearch}
        onAdd={() => act("add", chip.value)} onRemove={() => act("remove", chip.value)} />)}
      </div>
    <FieldDisclosure expanded={expanded} hasMore={chips.length > 20} controlsId={valuesId} anchorRef={headerRef}
      onExpand={() => setExpanded(true)} onCollapse={() => setExpanded(false)} />
    {adding && <form className="relative mt-1 max-w-full" onKeyDown={event => {
      if (event.nativeEvent.isComposing) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        cancel();
      } else containPillActivation(event);
    }} onSubmit={event => {
      event.preventDefault();
      commit();
    }}>
      <div className="flex flex-col gap-1.25">
      <input ref={inputRef} role="combobox" aria-label="Add label" aria-invalid={invalid || undefined} value={value}
        placeholder={store.getState().executionMode === "connected" ? "New label" : "label1, label2, label3\u2026"} required
        aria-autocomplete="list" aria-expanded={suggestionsVisible} aria-controls={suggestionsVisible ? suggestionsId : undefined}
        aria-busy={showSuggestions && currentSuggestions?.status === "pending"}
        aria-activedescendant={suggestionsVisible && activeSuggestion >= 0 && suggestions[activeSuggestion] ? `${suggestionsId}-${activeSuggestion}` : undefined}
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
          if (event.key === "Escape" && suggestions.length) {
            event.preventDefault(); event.stopPropagation(); setDismissedOwner(suggestionOwner); setActiveSuggestion(-1);
          } else if ((event.key === "ArrowDown" || event.key === "ArrowUp") && suggestionsVisible && suggestions.length) {
            event.preventDefault();
            event.stopPropagation();
            const direction = event.key === "ArrowDown" ? 1 : -1;
            setActiveSuggestion(index => index < 0 ? direction > 0 ? 0 : suggestions.length - 1
              : (index + direction + suggestions.length) % suggestions.length);
          } else if (event.key === "Enter") {
            event.preventDefault();
            event.stopPropagation();
            if (suggestionsVisible && activeSuggestion >= 0 && suggestions[activeSuggestion]) selectSuggestion(suggestions[activeSuggestion]);
            else commit();
          }
        }}
        className="h-6 pointer-coarse:h-[var(--mobile-edit-control-size)] min-w-0 w-full rounded-sm border border-grid-border bg-[#444] px-1.25 py-0 text-xs text-grid-text placeholder:text-[#888] aria-invalid:border-grid-error focus:outline-2 focus:-outline-offset-2 focus:outline-grid-accent"
        autoComplete="off" />
      <div className="flex justify-end gap-1.25">
      <PillActionButton action="cancel" label="Close label entry" title="Close" onClick={cancel} />
      <PillActionButton action="confirm" label="Add label to images" title="Save new label" disabled={disabled || !value.split(",").some(label => label.trim())} onClick={commit} />
      </div>
      </div>
      <SuggestionDropdown anchorRef={inputRef} items={suggestions} id={suggestionsId}
        label="Label suggestions from the whole library" activeIndex={activeSuggestion} onSelect={selectSuggestion} onVisibilityChange={setSuggestionsVisible} />
    </form>}
    {counts.unavailable > 0 && <p role="status" className="text-xs text-grid-text-muted">{counts.unavailable} selected {counts.unavailable === 1 ? "image is" : "images are"} unavailable.</p>}
    {oversized && <p role="status" className="text-xs text-grid-text-muted">Select at most {targetLimit} {targetLimit === 1 ? "image" : "images"} to edit labels.</p>}
    {refusal && <p role="status" className="text-xs text-grid-error">{store.getState().executionMode === "connected" ? "Change not sent" : "Simulation refused"}: {refusal}.</p>}
  </MetadataBlock>;
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
    || receipts.some(receipt => receipt.items.some(item => item.state === "queued" || item.state === "submitted" || item.state === "unknown"
      || ((item.state === "accepted-awaiting-visibility" || item.state === "unchanged") && item.observation !== "observed")));
  useEffect(() => {
    if (inline || !unfinished) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [unfinished, inline]);
  return <ImageActivityFrame inline={inline} hidden={hidden} labelCount={receipts.length} draftCount={drafts.size} revision={activityRevision}>
      <div className="space-y-3">
        {repeated && <p role="status" className="text-xs">Operation already recorded.</p>}
        {[...drafts.values()].map(draft => <details className="text-xs wrap-anywhere" key={labelTargetKey(draft.targetIds)}>
          <summary tabIndex={0} className="cursor-pointer">Unfinished input ({draft.targetIds.length} {draft.targetIds.length === 1 ? "image" : "images"})</summary>
          <p>{draft.value.slice(0, 160)}{draft.value.length > 160 ? " [Preview truncated]" : ""}</p>
          <p>{draft.targetIds.slice(0, 8).join(", ")}{draft.targetIds.length > 8 ? ` (+${draft.targetIds.length - 8} more)` : ""}</p>
        </details>)}
        {receiptOrder.map(index => {
          const receipt = receipts[index];
          const states = receipt.items.reduce<Record<string, number>>((counts, item) => { counts[item.state] = (counts[item.state] ?? 0) + 1; return counts; }, {});
          const observed = receipt.items.filter(item => item.observation === "observed").length;
          const queued = states.queued ?? 0;
          const submitted = states.submitted ?? 0;
          const previewLimit = receipt.mode === "connected" && !receipt.blocked ? receipt.items.length : 8;
          const data = JSON.stringify({ action: receipt.intent.action, label: receipt.intent.label.slice(0, 240),
            ...receipt.counts, targets: receipt.intent.targetIds.slice(0, previewLimit),
            ...(receipt.intent.targetIds.length > previewLimit && { additionalTargets: receipt.intent.targetIds.length - previewLimit }),
            ...(receipt.blocked && { blocked: receipt.blocked }),
            outcomes: states,
            items: receipt.items.slice(0, previewLimit),
          }, null, 2);
          return <div key={index}>
            <p className="text-xs mb-1" role="status">{receipt.mode === "disconnected" ? "Not sent - dry run"
              : receipt.mode === "connected" ? "Label change"
              : receipt.items.some(item => item.observation) ? "Simulated command - readback only" : "Simulated - no service calls"}</p>
            {receipt.mode === "connected" && <>
              <p className="text-xs wrap-anywhere">{receipt.intent.action === "add" ? "Add" : "Remove"} "{receipt.intent.label}" - {receipt.items.length} {receipt.items.length === 1 ? "image" : "images"}</p>
              {!receipt.blocked && <progress aria-label="Label operation progress" className="w-full h-1" max={receipt.items.length}
                value={receipt.items.length - queued - submitted} />}
              <p className="text-xs" role="status">{queued} queued, {submitted} in progress, {states["accepted-awaiting-visibility"] ?? 0} acknowledged, {observed} observed, {states.rejected ?? 0} rejected, {states.unknown ?? 0} unknown, {states.unchanged ? `${states.unchanged} unchanged, ` : ""}{states.stopped ?? 0} stopped.</p>
              {queued > 0 && <button type="button" onClick={() => store.getState().stopRemaining(index)}
                className="my-1 inline-flex min-h-6 pointer-coarse:min-h-11 items-center gap-1 rounded-sm border border-grid-border px-2 text-xs">
                <svg aria-hidden="true" width="12" height="12" viewBox="0 0 12 12"><rect x="2" y="2" width="8" height="8" fill="currentColor" /></svg>
                Stop remaining
              </button>}
            </>}
            <details open={receipt.mode !== "connected"} className="text-xs">
              <summary className="cursor-pointer">Details</summary>
              <pre className="whitespace-pre-wrap wrap-anywhere">{receipt.mode === "connected" ? data : data.slice(0, 1800)}{receipt.mode !== "connected" && data.length > 1800 || receipt.intent.label.length > 240 ? "\n[Preview truncated]" : ""}</pre>
            </details>
          </div>;
        })}
      </div>
  </ImageActivityFrame>;
}