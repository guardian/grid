/** @vitest-environment jsdom */

import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MockDataSource } from "@/dal/mock-data-source";
import type { AggregationsResult } from "@/dal";
import { useSearchStore } from "@/stores/search-store";
import { FacetFilters } from "./FacetFilters";

const fixture = vi.hoisted(() => {
  vi.stubGlobal("matchMedia", vi.fn(() => ({
    matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn(),
  })));
  return { updateSearch: vi.fn() };
});
vi.mock("@tanstack/react-router", () => ({ useSearch: () => ({ query: "" }) }));
vi.mock("@/hooks/useUrlSearchSync", () => ({ useUpdateSearchParams: () => fixture.updateSearch }));

const field = "metadata.credit";
const baseBuckets = Array.from({ length: 10 }, (_, i) => ({ key: `credit-${i}`, count: 100 - i }));
let source: MockDataSource;
let frames: FrameRequestCallback[];

beforeEach(() => {
  vi.clearAllMocks();
  frames = [];
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { frames.push(callback); return frames.length; });
  source = new MockDataSource(100);
  useSearchStore.setState({
    dataSource: source, params: {}, total: 100,
    aggregations: { fields: { [field]: { buckets: baseBuckets, total: 100 } } },
    dynamicFacetBuckets: {}, expandedAggs: {}, expandedAggsLoading: new Set(),
    tickerCounts: null, isFilterCounts: null, usageFilterCounts: null,
  });
});
afterEach(() => {
  useSearchStore.getState().collapseExpandedAgg(field);
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function creditSection() {
  return screen.getByText("Credit", { exact: true }).parentElement!;
}

function rowKeys(section: HTMLElement) {
  return Array.from(section.querySelectorAll("[data-facet-key]")).map(button => button.getAttribute("data-facet-key"));
}

describe("Filters disclosure", () => {
  it("retains the ten-bucket possibly-more heuristic, including overfull base responses", () => {
    useSearchStore.setState({ aggregations: { fields: { [field]: { buckets: baseBuckets.slice(0, 9), total: 9 } } } });
    render(<FacetFilters />);
    expect(rowKeys(creditSection())).toHaveLength(9);
    expect(within(creditSection()).queryByRole("button", { name: "Show more…" })).toBeNull();
    act(() => useSearchStore.setState({ aggregations: { fields: { [field]: { buckets: baseBuckets, total: 10 } } } }));
    expect(rowKeys(creditSection())).toEqual(baseBuckets.map(bucket => bucket.key));
    expect(within(creditSection()).getByRole("button", { name: "Show more…" })).toBeTruthy();
    act(() => useSearchStore.setState({ aggregations: { fields: { [field]: { buckets: Array.from({ length: 20 }, (_, i) => ({ key: `credit-${i}`, count: 100 - i })), total: 20 } } } }));
    expect(rowKeys(creditSection())).toEqual(baseBuckets.map(bucket => bucket.key));
    expect(within(creditSection()).getByRole("button", { name: "Show more…" })).toBeTruthy();
  });

  it("owns one bounded async expansion, renders all returned buckets and anchors collapse with retained focus", async () => {
    let resolve!: (result: AggregationsResult) => void;
    const pending = new Promise<AggregationsResult>(accept => { resolve = accept; });
    const fetch = vi.spyOn(source, "getAggregations").mockReturnValueOnce(pending);
    render(<div style={{ overflowY: "auto" }}><FacetFilters /></div>);
    const section = creditSection();
    const toggle = within(section).getByRole("button", { name: "Show more…" });
    toggle.focus();
    fireEvent.click(toggle);
    expect(toggle.textContent).toBe("Loading…");
    expect((toggle as HTMLButtonElement).disabled).toBe(true);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(toggle.getAttribute("aria-busy")).toBe("true");
    fireEvent.click(toggle);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][1]).toEqual([{ field, size: 100 }]);
    expect(fetch.mock.calls[0][2]?.aborted).toBe(false);
    expect(rowKeys(section)).toEqual(baseBuckets.map(bucket => bucket.key));

    toggle.blur(); // Model Chromium's native blur when the loading button disables.
    const allBuckets = Array.from({ length: 100 }, (_, i) => ({ key: `expanded-${i}`, count: 100 - i }));
    await act(async () => resolve({ fields: { [field]: { buckets: allBuckets, total: 100 } } }));
    expect(rowKeys(section)).toEqual(allBuckets.map(bucket => bucket.key));
    expect(toggle.textContent).toBe("Show fewer");
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect((toggle as HTMLButtonElement).disabled).toBe(false);
    expect(document.activeElement).toBe(toggle);
    expect(section.contains(document.getElementById(toggle.getAttribute("aria-controls")!))).toBe(true);

    const header = screen.getByText("Credit", { exact: true });
    const scroller = section.parentElement!.parentElement!;
    scroller.scrollTop = 100;
    vi.spyOn(header, "getBoundingClientRect").mockReturnValue({ top: 35 } as DOMRect);
    vi.spyOn(scroller, "getBoundingClientRect").mockReturnValue({ top: 10 } as DOMRect);
    toggle.focus();
    fireEvent.click(toggle);
    expect(rowKeys(section)).toEqual(baseBuckets.map(bucket => bucket.key));
    expect(useSearchStore.getState().expandedAggs[field]).toBeUndefined();
    frames.splice(0).forEach(callback => callback(0));
    expect(scroller.scrollTop).toBe(125);
    expect(document.activeElement).toBe(toggle);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("does not steal newer adjacent-field focus when loading completes", async () => {
    let resolve!: (result: AggregationsResult) => void;
    vi.spyOn(source, "getAggregations").mockReturnValueOnce(new Promise(accept => { resolve = accept; }));
    render(<><button>Adjacent field</button><FacetFilters /></>);
    const toggle = within(creditSection()).getByRole("button", { name: "Show more…" });
    toggle.focus();
    fireEvent.click(toggle);
    const adjacent = screen.getByRole("button", { name: "Adjacent field" });
    adjacent.focus();
    await act(async () => resolve({ fields: { [field]: { buckets: baseBuckets, total: 10 } } }));
    expect(toggle.textContent).toBe("Show fewer");
    expect(document.activeElement).toBe(adjacent);
  });

  it("does not restore cancelled-field focus after a newer expansion disables and blurs its control", async () => {
    let resolveFirst!: (result: AggregationsResult) => void;
    let resolveSecond!: (result: AggregationsResult) => void;
    vi.spyOn(source, "getAggregations")
      .mockReturnValueOnce(new Promise(accept => { resolveFirst = accept; }))
      .mockReturnValueOnce(new Promise(accept => { resolveSecond = accept; }));
    useSearchStore.setState({ aggregations: { fields: {
      [field]: { buckets: baseBuckets, total: 10 },
      "metadata.source": { buckets: baseBuckets, total: 10 },
    } } });
    const setAttribute = HTMLElement.prototype.setAttribute;
    vi.spyOn(HTMLElement.prototype, "setAttribute").mockImplementation(function (this: HTMLElement, name, value) {
      // Model native disable-time blur before layout effects (absent in jsdom).
      if (name === "disabled" && document.activeElement === this) this.blur();
      return setAttribute.call(this, name, value);
    });
    render(<FacetFilters />);
    const first = within(creditSection()).getByRole("button", { name: "Show more…" });
    const second = within(screen.getByText("Source", { exact: true }).parentElement!).getByRole("button", { name: "Show more…" });
    first.focus();
    fireEvent.click(first);
    expect(document.activeElement).toBe(document.body);
    second.focus();
    fireEvent.click(second);
    expect(document.activeElement).not.toBe(first);
    await act(async () => resolveSecond({ fields: { "metadata.source": { buckets: baseBuckets, total: 10 } } }));
    expect(document.activeElement).toBe(second);
    await act(async () => resolveFirst({ fields: { [field]: { buckets: baseBuckets, total: 10 } } }));
    expect(useSearchStore.getState().expandedAggs[field]).toBeUndefined();
    expect(document.activeElement).toBe(second);
  });

  it("retains filter toggling and Alt exclusion on expanded rows", () => {
    useSearchStore.setState({ expandedAggs: { [field]: { buckets: [{ key: "Expanded credit", count: 3 }], total: 3 } } });
    render(<FacetFilters />);
    const row = within(creditSection()).getByRole("button", { name: "Expanded credit3" });
    fireEvent.click(row);
    expect(fixture.updateSearch).toHaveBeenLastCalledWith({ query: 'credit:"Expanded credit"' });
    fireEvent.click(row, { altKey: true });
    expect(fixture.updateSearch).toHaveBeenLastCalledWith({ query: '-credit:"Expanded credit"' });
  });
});
