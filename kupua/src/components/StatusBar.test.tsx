/** @vitest-environment jsdom */

import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  window.matchMedia = vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })) as unknown as typeof window.matchMedia;
});
vi.mock("@tanstack/react-router", () => ({ useSearch: () => ({}) }));
vi.mock("@/hooks/useUrlSearchSync", () => ({ useUpdateSearchParams: () => vi.fn() }));

import { StatusBar } from "./StatusBar";
import { useSearchStore } from "@/stores/search-store";
import { gridConfig } from "@/lib/grid-config";
import { snapshotStore } from "@/lib/history-snapshot";
import { buildSearchKey } from "@/lib/image-offset-cache";

const ticker = gridConfig.tickerDefinitions[0];
const resultCount = () => screen.getAllByRole("status")[0].textContent;
const tickerBadge = () => screen.queryByRole("button", { name: new RegExp(ticker.name) });

describe("StatusBar AI totals", () => {
  const initial = useSearchStore.getState();
  const initialHistory = window.history.state;

  beforeEach(() => {
    sessionStorage.clear();
    useSearchStore.setState({ _isInitialLoad: false, total: 200, aiPoolTotal: null, tickerCounts: null, newCount: 0 });
  });
  afterEach(() => {
    cleanup();
    useSearchStore.setState(initial, true);
    snapshotStore.delete("ticker-reload");
    window.history.replaceState(initialHistory, "");
  });

  it("reads 'Best k of N matches' for an AI result and plain matches otherwise", () => {
    useSearchStore.setState({ aiPoolTotal: 10_216_960 });
    const view = render(<StatusBar />);
    expect(resultCount()).toBe("Best 200 of 10,216,960\u00a0matches");

    view.unmount();
    useSearchStore.setState({ aiPoolTotal: null, total: 13_260 });
    render(<StatusBar />);
    expect(resultCount()).toBe("13,260\u00a0matches");
  });

  it("does not claim a best-of pool for an empty AI result", () => {
    useSearchStore.setState({ total: 0, aiPoolTotal: 0 });
    render(<StatusBar />);
    expect(resultCount()).toBe("0\u00a0matches");
  });

  it("shows absolute pool ticker counts, hiding only a ticker equal to the pool", () => {
    useSearchStore.setState({ aiPoolTotal: 4000, tickerCounts: { [ticker.name]: { value: 200 } } });
    const view = render(<StatusBar />);
    expect(tickerBadge()?.textContent).toBe(`200 ${ticker.name}`);

    view.unmount();
    useSearchStore.setState({ tickerCounts: { [ticker.name]: { value: 4000 } } });
    render(<StatusBar />);
    expect(tickerBadge()).toBeNull();
  });

  it("keeps restored arrivals across initial settlement without pairing a pool with a cached total", () => {
    sessionStorage.setItem("kupua-sb-total", "1234");
    window.history.replaceState({ kupuaKey: "ticker-reload" }, "");
    snapshotStore.set("ticker-reload", { searchKey: buildSearchKey({}), anchorImageId: null,
      anchorIsPhantom: false, anchorOffset: 0, viewportRatio: null,
      newCountSince: "2026-04-26T10:00:00.000Z", newCount: 134 });
    useSearchStore.setState({ _isInitialLoad: true, aiPoolTotal: 9000, total: 0 });
    render(<StatusBar />);
    expect(resultCount()).toBe("1,234\u00a0matches");
    expect(screen.getByRole("button", { name: "134 new" })).toBeTruthy();
    act(() => useSearchStore.setState({ newCount: 134, newCountSince: "2026-04-26T10:00:00.000Z", loading: true }));
    expect(screen.getByRole("button", { name: "134 new" })).toBeTruthy();
    act(() => useSearchStore.setState({ newCount: 135 }));
    expect(screen.getByRole("button", { name: "135 new" })).toBeTruthy();
    act(() => useSearchStore.setState({ _isInitialLoad: false, total: 1234, aiPoolTotal: null, loading: false }));
    expect(screen.getByRole("button", { name: "135 new" })).toBeTruthy();
    act(() => useSearchStore.setState({ newCount: 0 }));
    expect(screen.queryByRole("button", { name: /new$/ })).toBeNull();
    expect(sessionStorage.getItem("kupua-sb-new")).toBeNull();
  });
});
