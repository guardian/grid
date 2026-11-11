// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RefineChips } from "./RefineChips";
import type { TypeaheadResolver, TypeaheadSuggestion } from "@/lib/typeahead-fields";

const suggestions = vi.hoisted(() => ({ labels: ["Politics", "Portrait"], resolver: undefined as TypeaheadResolver | undefined }));

vi.mock("@/stores/search-store", () => {
  const state = { dataSource: {}, aggregations: null, params: {}, tickerCounts: null, isFilterCounts: null };
  return { useSearchStore: Object.assign((selector: (value: typeof state) => unknown) => selector(state), { getState: () => state }) };
});

vi.mock("@/lib/typeahead-fields", () => ({
  buildTypeaheadFields: () => [{ fieldName: "label", resolver: suggestions.resolver ?? suggestions.labels }],
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
  suggestions.labels = ["Politics", "Portrait"];
  suggestions.resolver = undefined;
});

function openEditor(onFieldsChange = vi.fn()) {
  render(<div role="dialog" aria-label="Refine test" style={{ position: "relative" }}>
    <div data-testid="scroll-area"><RefineChips fields="" onFieldsChange={onFieldsChange} /></div>
  </div>);
  fireEvent.click(screen.getByRole("button", { name: /Add filter/ }));
  fireEvent.click(screen.getByRole("button", { name: "label" }));
  return screen.getByLabelText("Filter value");
}

describe("Refine value suggestions", () => {
  it("keeps an overlay inside the viewport when its focused input scrolls below it", () => {
    vi.spyOn(HTMLInputElement.prototype, "getBoundingClientRect").mockReturnValue(new DOMRect(100, window.innerHeight + 120, 200, 40));
    openEditor();
    const list = screen.getByRole("listbox", { name: "Suggestions for label" });
    expect(Number.parseFloat(list.style.top)).toBeLessThanOrEqual(window.innerHeight);
    expect(list.style.transform).toBe("translateY(-100%)");
  });

  it("keeps suggestions in the dialog but outside the scrolling field content", () => {
    openEditor();
    expect(screen.getByText("Politics")).toBeTruthy();
    const list = screen.getByRole("listbox", { name: "Suggestions for label" });
    expect(list.parentElement).toBe(screen.getByRole("dialog", { name: "Refine test" }));
    expect(list.style.position).toBe("absolute");
    expect(screen.getByTestId("scroll-area").contains(list)).toBe(false);
  });

  it("chooses a suggestion with the keyboard rather than submitting an empty value", () => {
    const onFieldsChange = vi.fn();
    const input = openEditor(onFieldsChange);
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onFieldsChange).toHaveBeenCalledWith("label:Politics");
  });

  it("does not commit a highlighted suggestion while confirming keyboard composition", () => {
    const onFieldsChange = vi.fn();
    const input = openEditor(onFieldsChange);
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter", isComposing: true });
    expect(onFieldsChange).not.toHaveBeenCalled();
  });

  it("wraps keyboard selection within the visible suggestion shortlist", () => {
    suggestions.labels = Array.from({ length: 51 }, (_, index) => `Option${index}`);
    const onFieldsChange = vi.fn();
    const input = openEditor(onFieldsChange);
    expect(screen.getAllByRole("option")).toHaveLength(50);
    fireEvent.keyDown(input, { key: "ArrowUp" });
    expect(document.getElementById(input.getAttribute("aria-activedescendant")!)?.textContent).toBe("Option49");
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onFieldsChange).toHaveBeenCalledWith("label:Option49");
  });

  it("debounces input, rejects stale results and preserves the provider's matching and order", async () => {
    vi.useFakeTimers();
    const pending: { signal: AbortSignal; resolve: (items: TypeaheadSuggestion[]) => void }[] = [];
    const resolver = vi.fn((_value: string, signal?: AbortSignal) => new Promise<TypeaheadSuggestion[]>(resolve => {
      pending.push({ signal: signal!, resolve });
    }));
    suggestions.resolver = resolver;
    const input = openEditor();
    await act(async () => { vi.advanceTimersByTime(150); });
    fireEvent.change(input, { target: { value: "e" } });
    fireEvent.change(input, { target: { value: "ebr" } });
    expect(pending[0].signal.aborted).toBe(true);
    await act(async () => { vi.advanceTimersByTime(150); });
    expect(resolver).toHaveBeenCalledTimes(2);
    expect(resolver).toHaveBeenLastCalledWith("ebr", expect.any(AbortSignal));
    await act(async () => { pending[1].resolve([{ value: "Zebra conservation", count: 12 }, { value: "Debris", count: 3 }]); });
    expect(screen.getAllByRole("option").map(option => option.textContent)).toEqual(["Zebra conservation12", "Debris3"]);
    await act(async () => { pending[0].resolve([{ value: "Obsolete" }]); });
    expect(screen.queryByRole("option", { name: "Obsolete" })).toBeNull();
    expect(screen.getAllByRole("option")).toHaveLength(2);
    cleanup();
    expect(pending[1].signal.aborted).toBe(true);
  });
});