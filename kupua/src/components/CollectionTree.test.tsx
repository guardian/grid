/** @vitest-environment jsdom */

import { cleanup, render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

const route = vi.hoisted(() => ({ search: {} as Record<string, string> }));
vi.mock("@tanstack/react-router", () => ({ useSearch: () => route.search }));
vi.mock("@/hooks/useUrlSearchSync", () => ({ useUpdateSearchParams: () => vi.fn() }));

import { CollectionTree } from "./CollectionTree";
import { useCollectionStore, type CollectionNode } from "@/stores/collection-store";
import { useSearchStore } from "@/stores/search-store";

const node = (pathId: string): CollectionNode => ({
  uri: "", links: [], actions: [],
  data: { basename: pathId, children: [], fullPath: [pathId],
    data: { path: [pathId], pathId, description: "", actionData: { author: "", date: "" } } },
});
const tree: CollectionNode = { uri: "", links: [], actions: [], data: { basename: "root", children: [node("sport")], fullPath: [] } };

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  useCollectionStore.setState({ tree: null, countsByScope: {}, status: "idle" });
});

it("shown Collections load and display counts for the Free to use only checkbox's scope", () => {
  const loadCounts = vi.spyOn(useCollectionStore.getState(), "loadCounts").mockResolvedValue();
  useCollectionStore.setState({ tree, status: "ready", countsByScope: { all: { sport: 7 }, free: { sport: 5 } } });

  route.search = { nonFree: "true" };
  const view = render(<CollectionTree />);
  expect(loadCounts).toHaveBeenLastCalledWith(useSearchStore.getState().dataSource, "all");
  expect(view.container.textContent).toContain("7");

  route.search = {};
  view.rerender(<CollectionTree />);
  expect(loadCounts).toHaveBeenLastCalledWith(useSearchStore.getState().dataSource, "free");
  expect(view.container.textContent).toContain("5");
  expect(view.container.textContent).not.toContain("7");
});
