import { DetailsTargetCount, useDetailsDraft } from "./DetailsDrafts";
import { createContext, useContext, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { LabelReceipt } from "@/lib/label-operation";
import { useStore } from "zustand";
import { useShallow } from "zustand/react/shallow";
import { createLabelEditorStore, labelEditorStore, labelTargetKey } from "@/stores/label-editor-store";
import { useSearchStore } from "@/stores/search-store";
import { metadataEditTargetCounts, type MetadataEditContext } from "@/lib/metadata-edit-execution";
import { createLabelSuggestionProvider, type TypeaheadSuggestion } from "@/lib/typeahead-fields";
import { SUGGESTION_DEBOUNCE_MS } from "@/constants/tuning";
import { containPillActivation, EditableSearchPill, PillActionButton, visibleEditorPills } from "./SearchPill";
import { MetadataBlock } from "./metadata-primitives";
import { FieldDisclosure } from "./FieldDisclosure";
import { SuggestionDropdown } from "./SuggestionDropdown";
import { FieldAddButton } from "./FieldAddButton";
import { addToast } from "@/stores/toast-store";
import { MetadataEditorContext, panelSaveAdmitted, SelectionSaveIndicator, useMetadataCommit, usePendingPillIntents } from "./MetadataEditing";
import { useSelectionStore } from "@/stores/selection-store";
import { addressableLabel } from "@/lib/grid-mutation-policy";

export const LabelEditorContext = createContext<ReturnType<typeof createLabelEditorStore>>(labelEditorStore);

export function SelectedEditStatus({ compact = false, below = true, detailImageId, renderSlot }: { compact?: boolean; below?: boolean; detailImageId?: string; renderSlot?: (status: React.ReactElement | null) => React.ReactNode }) {
  const ids = useSelectionStore(state => state.selectedIds);
  const key = useMemo(() => labelTargetKey([...ids]), [ids]);
  const receipts = useStore(useContext(LabelEditorContext), state => state.receipts);
  const status = useMemo(() => {
    let operations = 0, total = 0, confirmed = 0;
    const finished: LabelReceipt[] = [];
    for (const receipt of receipts) {
      if (receipt.mode !== "connected" || detailImageId && !receipt.intent.targetIds.includes(detailImageId)) continue;
      if (!receipt.blocked && receipt.items.some(item => item.state === "queued" || item.state === "submitted" || item.observation === "pending")) {
        operations++;
        total += receipt.intent.targetIds.length;
        confirmed += receipt.items.filter(item => item.observation === "observed" && (item.state === "accepted-awaiting-visibility" || item.state === "unchanged")).length;
        continue;
      }
      finished.push(receipt);
    }
    return { operations, total, confirmed, finished };
  }, [receipts, detailImageId]);
  return <SelectionSaveIndicator targetKey={key} compact={compact} below={below} detailImageId={detailImageId} renderSlot={renderSlot} desktopCount={compact || detailImageId ? undefined : ids.size} labelTotal={status.total} labelCount={status.operations} labelConfirmed={status.confirmed} finishedLabels={status.finished} />;
}


export function LabelEditor({ context, values, onSearch, resolveContext, allowQueuedAdd = false, displayedImageId }: {
  context: MetadataEditContext;
  displayedImageId?: string;
  allowQueuedAdd?: boolean;
  values: readonly { value: string; count: number }[];
  onSearch: (key: string, value: string, event: React.MouseEvent) => void;
  resolveContext?: () => MetadataEditContext;
}) {
  const store = useContext(LabelEditorContext);
  const submit = useMetadataCommit();
  const key = labelTargetKey(context.targetIds);
  const panelIntents = usePendingPillIntents(key, "labels");
  const labelIntents = useStore(store, useShallow(state => state.receipts.filter(receipt => receipt.mode === "connected" && !receipt.blocked &&
    receipt.items.some(item => item.state === "queued" || item.state === "submitted" || item.observation === "pending") && labelTargetKey(receipt.intent.targetIds) === key).map(receipt => receipt.intent)));
  const { restored, scoped, update } = useDetailsDraft<string>("labels");
  const storedValue = useStore(store, state => state.drafts.get(key)?.value ?? "");
  const [panelValue, setPanelValue] = useState(restored ?? "");
  const value = scoped ? panelValue : storedValue;
  const setValue = (next: string) => scoped ? setPanelValue(next) : store.getState().setDraft(context.targetIds, next);
  const refusal = useStore(store, state => state.refusal);
  const [expanded, setExpanded] = useState(false);
  const [adding, setAdding] = useState(Boolean(restored));
  useLayoutEffect(() => { update("Labels", adding && value.trim() ? value : undefined); });
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
    }, SUGGESTION_DEBOUNCE_MS);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [showSuggestions, suggestLabels, prefix, suggestionOwner]);
  const counts = metadataEditTargetCounts(context);
  const disabled = import.meta.env.VITE_USE_MEDIA_API !== "true" || !counts.selected || Boolean(counts.ineligible || counts.unresolved || counts.unavailable);
  const queueAdds = allowQueuedAdd && !counts.ineligible && !counts.unavailable;
  const addDisabled = disabled && !queueAdds;
  const sameSingleImage = displayedImageId !== undefined && context.targetIds.length === 1 && context.targetIds[0] === displayedImageId;
  const coverageKnown = queueAdds || counts.unavailable === 0 && (sameSingleImage || !context.pending && counts.unresolved === 0);
  const chips = visibleEditorPills(values, expanded, [...panelIntents, ...labelIntents.map(intent => ({ action: intent.action, value: intent.label }))]);
  const act = (action: "add" | "remove", label: string) => {
    if (!addressableLabel(action === "add" ? label.trim() : label)) {
      addToast({ category: "warning", message: "This label cannot be addressed by Grid. No change was sent." });
      return false;
    }
    const current = resolveContext?.() ?? context;
    if (labelTargetKey(current.targetIds) !== key) return false;
    if (action === "add" && queueAdds) return panelSaveAdmitted(submit({ fieldId: "labels", action, value: label, targetIds: current.targetIds }, addButtonRef.current), "Label change not sent");
    if (disabled || current.pending) return false;
    return store.getState().prepare(action, label, current);
  };
  const cancel = () => {
    setValue("");
    setInvalid(false);
    setAdding(false);
  };
  const commit = () => {
    const labels = [...new Set(value.split(",").map(label => label.trim()).filter(Boolean))];
    if (!labels.length || !labels.every(addressableLabel)) { setInvalid(true); return; }
    const current = resolveContext?.() ?? context;
    if (addDisabled || !labels.length || (!queueAdds && current.pending) || labelTargetKey(current.targetIds) !== key) return;
    const admitted = queueAdds && labels.length === 1 ? act("add", labels[0]) : store.getState().prepareLabels(labels, current);
    if (admitted) {
      setValue("");
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
    setValue(nextValue);
    setCaret(nextCaret);
    setInvalid(false);
    setDismissedOwner(JSON.stringify([key, nextValue, nextCaret]));
    setActiveSuggestion(-1);
    inputRef.current?.focus();
  };
  return <MetadataBlock label="Labels" ref={headerRef} tabIndex={-1} action={
    <span className={adding ? "invisible" : ""} aria-hidden={adding || undefined}>
      <FieldAddButton ref={addButtonRef} iconOnly label="Add label" disabled={addDisabled || adding} onClick={() => setAdding(true)} />
    </span>
  }>
      <div id={valuesId} className="min-w-0 flex-1 flex flex-wrap items-start gap-1">
      {chips.map(chip => <EditableSearchPill key={chip.value} value={chip.value} cqlKey="label" accent pending={chip.pending}
        count={chip.count} total={counts.selected} coverageKnown={coverageKnown} disabled={disabled} addDisabled={addDisabled} onSearch={onSearch}
        onAdd={() => act("add", chip.value)} onRemove={() => act("remove", chip.value)} />)}
      </div>
    <FieldDisclosure expanded={expanded} hasMore={values.length > 20} controlsId={valuesId} anchorRef={headerRef}
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
          setValue(event.target.value);
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
      {invalid && <span role="status">Enter a label other than . or ..</span>}
      {value.trim() && <DetailsTargetCount count={counts.selected} />}
      <PillActionButton action="cancel" label="Close label entry" title="Close" onClick={cancel} />
      <PillActionButton action="confirm" label="Add label to images" title="Save new label" disabled={addDisabled || !value.split(",").some(label => label.trim())} onClick={commit} />
      </div>
      </div>
      <SuggestionDropdown anchorRef={inputRef} items={suggestions} id={suggestionsId}
        label="Label suggestions from the whole library" activeIndex={activeSuggestion} onSelect={selectSuggestion} onVisibilityChange={setSuggestionsVisible} />
    </form>}
    {counts.unavailable > 0 && <p role="status" className="text-xs text-grid-text-muted">{counts.unavailable} selected {counts.unavailable === 1 ? "image is" : "images are"} unavailable.</p>}
    {refusal && <p role="status" className="text-xs text-grid-error">{store.getState().executionMode === "connected" ? "Change not sent" : "Simulation refused"}: {refusal}.</p>}
  </MetadataBlock>;
}

export function EditLifecycle() {
  const store = useContext(LabelEditorContext);
  const editor = useContext(MetadataEditorContext);
  const saving = useStore(editor, state => [...state.saves.values()].some(save => save.state !== "finished"));
  const unfinished = useStore(store, state => [...state.drafts.values()].some(draft => Boolean(draft.value.trim()))
    || state.receipts.some(receipt => receipt.items.some(item => item.state === "queued" || item.state === "submitted" || item.state === "unknown"
      || ((item.state === "accepted-awaiting-visibility" || item.state === "unchanged") && item.observation !== "observed"))));
  useEffect(() => store.subscribe((next, previous) => {
    const receipt = next.receipts[next.activeReceipt];
    if (!receipt || receipt.blocked || receipt.mode === "connected") return;
    if (next.receipts.length === previous.receipts.length && !(next.repeated && next.activityRevision !== previous.activityRevision)) return;
    const action = receipt.intent.action === "add" ? "Add" : "Remove";
    addToast({ category: "information", message: `Not sent - ${action} label: ${receipt.intent.label}` });
  }), [store]);
  useEffect(() => {
    if (!saving && !unfinished) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [unfinished, saving]);
  return null;
}