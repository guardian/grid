/** @vitest-environment jsdom */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  window.matchMedia = vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })) as unknown as typeof window.matchMedia;
});
vi.mock("@tanstack/react-router", () => ({ useSearch: () => ({}) }));
vi.mock("@/hooks/useUrlSearchSync", () => ({ useUpdateSearchParams: () => vi.fn() }));

import { StatusBar } from "./StatusBar";
import { useSearchStore } from "@/stores/search-store";
import { gridConfig } from "@/lib/grid-config";

const ticker = gridConfig.tickerDefinitions[0];
const resultCount = () => screen.getAllByRole("status")[0].textContent;
const tickerBadge = () => screen.queryByRole("button", { name: new RegExp(ticker.name) });

describe("StatusBar AI totals", () => {
  const initial = useSearchStore.getState();

  beforeEach(() => {
    sessionStorage.clear();
    useSearchStore.setState({ _isInitialLoad: false, total: 200, aiPoolTotal: null, tickerCounts: null, newCount: 0 });
  });
  afterEach(() => {
    cleanup();
    useSearchStore.setState(initial, true);
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

  it("never pairs a pool label with a cached total before the first search settles", () => {
    sessionStorage.setItem("kupua-sb-total", "1234");
    useSearchStore.setState({ _isInitialLoad: true, aiPoolTotal: 9000, total: 0 });
    render(<StatusBar />);
    expect(resultCount()).toBe("1,234\u00a0matches");
  });
});
