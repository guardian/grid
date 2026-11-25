/** @vitest-environment jsdom */

import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

const route = vi.hoisted(() => ({ path: "/search", search: {} as Record<string, string> }));
vi.mock("@tanstack/react-router", () => ({ useSearch: () => route.search }));
const { updateSearch, commit } = vi.hoisted(() => ({ updateSearch: vi.fn(), commit: vi.fn() }));
vi.mock("@/hooks/useUrlSearchSync", () => ({ useUpdateSearchParams: () => updateSearch }));
vi.mock("./LabelEditor", () => ({ SelectedEditStatus: () => null }));
vi.mock("./SelectionFab", async importOriginal => ({ ...await importOriginal<typeof import("./SelectionFab")>(), SelectionFab: () => null }));
vi.mock("./BottomSheet", () => ({ BottomSheet: () => null }));
vi.mock("@/lib/browsing-context", () => ({ useBrowsingContext: () => route }));
const editing = vi.hoisted(() => ({ connected: false }));
const compact = vi.hoisted(() => vi.fn(() => false));
vi.mock("@/hooks/useShell", async importOriginal => ({ ...await importOriginal<typeof import("@/hooks/useShell")>(), useIsCompact: compact }));
vi.mock("./MetadataEditing", async () => ({
  MetadataEditorContext: (await import("react")).createContext({ getState: () => editing, getInitialState: () => editing, subscribe: () => () => {} }),
  useMetadataCommit: () => commit,
}));

import { CollectionTree, CollectionsSection } from "./CollectionTree";
import type { Image } from "@/types/image";
import { usePanelStore } from "@/stores/panel-store";
import { useCollectionStore, type CollectionNode } from "@/stores/collection-store";
import { useSearchStore } from "@/stores/search-store";
import { useSelectionStore } from "@/stores/selection-store";
import { beginImageDrag } from "@/lib/internal-image-drag";
import { setImageDragPreview } from "@/lib/image-drag-preview";

it("keeps the native drag preview when no thumbnail is drawable", () => {
  const getContext = vi.spyOn(HTMLCanvasElement.prototype, "getContext");
  const setDragImage = vi.fn();
  setImageDragPreview({ setDragImage } as unknown as DataTransfer, document.createElement("img"), ["first"]);
  expect(getContext).not.toHaveBeenCalled();
  expect(setDragImage).not.toHaveBeenCalled();
});

const node = (pathId: string): CollectionNode => ({
  uri: "", links: [], actions: [],
  data: { basename: pathId, children: [], fullPath: [pathId],
    data: { path: [pathId], pathId, description: "", actionData: { author: "", date: "" } } },
});

it("adds the drag-start images once to the clicked row's collection only for a connected same-tab drop", () => {
  vi.spyOn(useCollectionStore.getState(), "loadCounts").mockResolvedValue();
  useCollectionStore.setState({ tree, status: "ready" });
  const source = document.createElement("div");
  const data = new Map<string, string>([["text/plain", "foreign"]]);
  const transfer = { get types() { return [...data.keys()]; }, setData: data.set.bind(data), getData: (type: string) => data.get(type) ?? "" } as unknown as DataTransfer;
  try {
    editing.connected = true;
    useSelectionStore.setState({ selectedIds: new Set(["selected"]) });
    const view = render(<CollectionTree />);
    const row = view.getByText("sport");
    const action = () => view.queryByRole("button", { name: "Add selected images to sport" });
    const drop = () => fireEvent.drop(row, { dataTransfer: transfer });
    fireEvent.dragOver(row, { dataTransfer: transfer });
    expect(view.container.querySelector("[data-drop-target]")).toBeNull();
    drop();
    const ids = ["first", "second"];
    expect(action()).not.toBeNull();
    act(() => beginImageDrag(source, transfer, ids));
    expect(action()).toBeNull();
    fireEvent.dragEnd(source);
    expect(action()).not.toBeNull();
    drop();
    beginImageDrag(source, transfer, ids);
    expect(fireEvent.dragOver(row, { dataTransfer: transfer })).toBe(false);
    editing.connected = false;
    drop();
    expect(commit).not.toHaveBeenCalled();
    editing.connected = true;
    beginImageDrag(source, transfer, ids);
    ids.splice(0, ids.length, "later");
    drop();
    drop();
    expect(commit).toHaveBeenCalledExactlyOnceWith({ fieldId: "collections", action: "add", value: "sport", targetIds: ["first", "second"] });
    expect(updateSearch).not.toHaveBeenCalled();
    fireEvent.click(row);
    expect(updateSearch).toHaveBeenCalledWith({ query: "collection:sport" });
  } finally {
    fireEvent.dragEnd(source);
    editing.connected = false;
  }
});
const tree: CollectionNode = { uri: "", links: [], actions: [], data: { basename: "root", children: [node("sport")], fullPath: [] } };

it("opens collection actions without browsing and adds the selection to the exact row", () => {
  vi.spyOn(useCollectionStore.getState(), "loadCounts").mockResolvedValue();
  editing.connected = true;
  useSelectionStore.setState({ selectedIds: new Set(["first", "second"]) });
  useCollectionStore.setState({ tree, status: "ready" });
  const view = render(<CollectionTree />);
  expect(view.queryByRole("button", { name: "Actions for sport" })).toBeNull();
  const plus = view.getByRole("button", { name: "Add selected images to sport" });
  fireEvent.focus(plus);
  expect(plus.title).toBe("Add 2 photos");
  compact.mockReturnValue(true);
  view.rerender(<CollectionTree />);
  fireEvent.click(view.getByRole("button", { name: "Actions for sport" }));
  expect(view.getByRole("button", { name: "Remove selected photos" })).toBeTruthy();
  const cache = useSelectionStore.getState().metadataCache;
  const cachePhoto = (id: string, pathId: string) => cache.set(id, { id, collections: [{ pathId }] } as Image);
  cachePhoto("first", "sport/football");
  cachePhoto("second", "sport");
  act(() => useSelectionStore.setState(state => ({ metadataRevision: state.metadataRevision + 1 })));
  expect(view.getByRole("button", { name: "Remove 1/2 photos" })).toBeTruthy();
  cachePhoto("second", "sport/football");
  act(() => useSelectionStore.setState(state => ({ metadataRevision: state.metadataRevision + 1 })));
  expect(view.queryByRole("button", { name: /^Remove .*photos?$/ })).toBeNull();
  fireEvent.click(view.getByRole("button", { name: "Add 2 photos" }));
  expect(commit).toHaveBeenCalledExactlyOnceWith({ fieldId: "collections", action: "add", value: "sport", targetIds: ["first", "second"] });
  expect(updateSearch).not.toHaveBeenCalled();
  compact.mockReturnValue(false);
  view.rerender(<CollectionTree />);
  const minus = view.getByRole("button", { name: "Remove selected images from sport" });
  fireEvent.mouseEnter(minus);
  expect(minus.title).toBe("Remove 0 photos");
  cachePhoto("first", "sport");
  act(() => useSelectionStore.setState(state => ({ metadataRevision: state.metadataRevision + 1 })));
  expect(minus.title).toBe("Remove 1/2 photos");
});

it("keeps a conflicting subcollection draft on its parent and returns focus on cancellation", () => {
  vi.spyOn(useCollectionStore.getState(), "loadCounts").mockResolvedValue();
  editing.connected = true;
  const parent = node("sport");
  parent.actions = [{ name: "add-child", method: "POST" }];
  parent.data.children.push(node("Portraits "));
  useCollectionStore.setState({ tree: { ...tree, data: { ...tree.data, children: [parent] } }, status: "ready" });
  const view = render(<CollectionTree />);
  const button = (name: string) => view.getByRole("button", { name });
  fireEvent.click(button("Edit collections"));
  const trigger = button("Actions for sport");
  fireEvent.click(trigger);
  fireEvent.click(button("New subcollection"));
  const input = view.getByRole("textbox", { name: "Subcollection name" });
  fireEvent.change(input, { target: { value: "portraits" } });
  expect(view.getByText(/already exists here with a trailing space/)).toBeTruthy();
  expect((button("Create") as HTMLButtonElement).disabled).toBe(true);
  fireEvent.change(input, { target: { value: "Team arrivals" } });
  expect((button("Create") as HTMLButtonElement).disabled).toBe(false);
  fireEvent.keyDown(input, { key: "Escape" });
  expect(document.activeElement).toBe(trigger);
  expect(view.queryByRole("dialog")).toBeNull();
});

it("edits the exact path with the live Search selection without browsing or using retained IDs on Upload", () => {
  vi.spyOn(useCollectionStore.getState(), "loadCounts").mockResolvedValue();
  const child = node("sport/football");
  child.data.basename = "football";
  const folder = node("sport");
  delete folder.data.data;
  folder.data.children.push(child);
  useCollectionStore.setState({ tree: { ...tree, data: { ...tree.data, children: [folder] } }, status: "ready" });
  const view = render(<CollectionTree />);
  fireEvent.click(view.getByRole("button", { name: "Expand" }));
  const actions = () => view.queryAllByRole("button", { name: /selected images/i });
  editing.connected = true;
  view.rerender(<CollectionTree />);
  expect(actions()).toHaveLength(0);
  act(() => useSelectionStore.setState({ selectedIds: new Set(["first"]) }));
  expect(actions()).toHaveLength(2);
  fireEvent.click(view.getByRole("button", { name: "Add selected images to sport/football" }));
  act(() => useSelectionStore.setState({ selectedIds: new Set(["second"]) }));
  fireEvent.click(view.getByRole("button", { name: "Remove selected images from sport/football" }));
  expect(commit.mock.calls.map(([command]) => command)).toEqual([
    { fieldId: "collections", action: "add", value: "sport/football", targetIds: ["first"] },
    { fieldId: "collections", action: "remove", value: "sport/football", targetIds: ["second"] },
  ]);
  expect(updateSearch).not.toHaveBeenCalled();
  route.path = "/upload";
  view.rerender(<CollectionTree />);
  expect(actions()).toHaveLength(0);
  route.path = "/search";
  editing.connected = false;
  view.rerender(<CollectionTree />);
  expect(actions()).toHaveLength(0);
});

it("spring-opens Collections and a folder only after a continuous internal drag hover", () => {
  vi.useFakeTimers();
  vi.spyOn(useCollectionStore.getState(), "loadCounts").mockResolvedValue();
  const folder = node("folder");
  delete folder.data.data;
  folder.data.children.push(node("team"));
  const sibling = node("sport");
  sibling.data.children.push(node("football"));
  useCollectionStore.setState({ tree: { ...tree, data: { ...tree.data, children: [sibling, folder] } }, status: "ready" });
  const panel = usePanelStore.getState();
  if (panel.isSectionOpen("left-collections")) panel.toggleSection("left-collections");
  const source = document.createElement("div");
  const data = new Map<string, string>();
  const transfer = { get types() { return [...data.keys()]; }, setData: data.set.bind(data), getData: data.get.bind(data) } as unknown as DataTransfer;
  const over = (target: Element) => fireEvent.dragOver(target, { dataTransfer: transfer });
  const wait = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });
  try {
    editing.connected = true;
    const view = render(<CollectionsSection />);
    const header = view.getByRole("button", { name: "Collections" });
    over(header);
    wait(1000);
    expect(header.getAttribute("aria-expanded")).toBe("false");
    beginImageDrag(source, transfer, ["image"]);
    over(header);
    wait(300);
    fireEvent.dragLeave(header);
    wait(600);
    expect(header.getAttribute("aria-expanded")).toBe("false");
    over(header);
    editing.connected = false;
    wait(600);
    expect(header.getAttribute("aria-expanded")).toBe("false");
    editing.connected = true;
    over(header);
    wait(300);
    over(header);
    wait(300);
    const row = view.getByText("folder");
    const highlighted = () => view.container.querySelector("[data-drop-target]")?.textContent;
    over(view.getByText("sport"));
    expect(highlighted()).toContain("sport");
    wait(600);
    expect(view.getByText("football")).toBeTruthy();
    over(row);
    expect(highlighted()).toBeUndefined();
    fireEvent.dragEnd(source);
    wait(600);
    expect(view.queryByText("team")).toBeNull();
    beginImageDrag(source, transfer, ["image"]);
    over(row);
    wait(600);
    fireEvent.dragLeave(row);
    const child = view.getByText("team");
    over(child);
    expect(highlighted()).toContain("team");
    fireEvent.dragLeave(child);
    expect(highlighted()).toBeUndefined();
    over(child);
    fireEvent.dragEnd(source);
    expect(highlighted()).toBeUndefined();
    beginImageDrag(source, transfer, ["image"]);
    over(child);
    fireEvent.drop(child, { dataTransfer: transfer });
    expect(highlighted()).toBeUndefined();
    expect(commit).toHaveBeenLastCalledWith({ fieldId: "collections", action: "add", value: "team", targetIds: ["image"] });
    expect(view.getByText("team")).toBe(child);
    expect(view.getByText("football")).toBeTruthy();
  } finally {
    fireEvent.dragEnd(source);
    usePanelStore.setState(panel);
    editing.connected = false;
    vi.useRealTimers();
  }
});

afterEach(() => {
  cleanup();
  commit.mockClear();
  updateSearch.mockClear();
  route.path = "/search";
  editing.connected = false;
  useSelectionStore.getState().clear();
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

it("hides zero counts and reloads an open tree after invalidation", () => {
  const loadCounts = vi.spyOn(useCollectionStore.getState(), "loadCounts").mockResolvedValue();
  const folder = node("folder");
  delete folder.data.data;
  useCollectionStore.setState({ tree: { ...tree, data: { ...tree.data, children: [node("sport"), folder] } }, status: "ready", countsByScope: { all: {} } });
  route.search = { nonFree: "true" };
  const view = render(<CollectionTree />);
  expect(view.getByText("sport").parentElement?.textContent).toBe("sport");
  expect(view.getByText("folder").parentElement?.textContent).toBe("folder");
  loadCounts.mockClear();
  act(() => useCollectionStore.getState().invalidateCounts());
  expect(view.queryByText("0")).toBeNull();
  expect(loadCounts).toHaveBeenCalledExactlyOnceWith(useSearchStore.getState().dataSource, "all");
});
