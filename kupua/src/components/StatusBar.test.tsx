/** @vitest-environment jsdom */

import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { Profiler } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  window.matchMedia = vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })) as unknown as typeof window.matchMedia;
});
const shell = vi.hoisted(() => ({ compact: false }));
vi.mock("@/hooks/useShell", () => ({ useIsCompact: () => shell.compact, isCompactNow: () => shell.compact }));
vi.mock("@tanstack/react-router", () => ({ useSearch: () => ({}) }));
vi.mock("@/hooks/useUrlSearchSync", () => ({ useUpdateSearchParams: () => vi.fn() }));
vi.mock("date-fns", async (importOriginal) => {
  const actual = await importOriginal<typeof import("date-fns")>();
  return { ...actual, formatDistanceToNow: vi.fn(actual.formatDistanceToNow) };
});

import { formatDistanceToNow } from "date-fns";
import { StatusBar } from "./StatusBar";
import { useSearchStore } from "@/stores/search-store";
import { gridConfig } from "@/lib/grid-config";
import { snapshotStore } from "@/lib/history-snapshot";
import { buildSearchKey } from "@/lib/image-offset-cache";
import { useCollectionStore } from "@/stores/collection-store";
import { usePanelStore } from "@/stores/panel-store";
import { useUiPrefsStore } from "@/stores/ui-prefs-store";
import { useSelectionStore } from "@/stores/selection-store";
import { ImageActionFab, SelectionFab } from "./SelectionFab";
import { PanelLayout } from "./PanelLayout";
import { FullFrameOptions, ImageActions, SelectionImageActions } from "./ImageActions";
import { LabelOperationReceipts } from "./LabelEditor";
import { useImageActionStore } from "@/stores/image-action-store";
import { useEnrichmentStore } from "@/stores/enrichment-store";
import * as gridApi from "@/lib/grid-api-instance";

const ticker = gridConfig.tickerDefinitions[0];
const resultCount = () => screen.getAllByRole("status")[0].textContent;
const tickerBadge = () => screen.queryByRole("button", { name: new RegExp(ticker.name) });

describe("StatusBar AI totals", () => {
  const initial = useSearchStore.getState();
  const initialHistory = window.history.state;
  const initialPrefs = useUiPrefsStore.getState();
  const initialSelection = useSelectionStore.getState();

  beforeEach(() => {
    shell.compact = false;
    sessionStorage.clear();
    useSearchStore.setState({ _isInitialLoad: false, total: 200, aiPoolTotal: null, tickerCounts: null, newCount: 0 });
  });
  afterEach(() => {
    cleanup();
    useImageActionStore.setState({ prepared: [] });
    useSearchStore.setState(initial, true);
    useUiPrefsStore.setState(initialPrefs, true);
    useSelectionStore.setState(initialSelection, true);
    snapshotStore.delete("ticker-reload");
    window.history.replaceState(initialHistory, "");
  });

  it.each([false, true])("keeps selection controls in their chosen model with touch input, compact=%s", compact => {
    shell.compact = compact;
    useUiPrefsStore.setState({ _pointerCoarse: true });
    useSelectionStore.setState({ selectedIds: new Set(["selected-image"]) });
    render(<><StatusBar /><SelectionFab /></>);
    expect(screen.queryByRole("button", { name: "Deselect" }) !== null).toBe(!compact);
    expect(screen.queryByRole("button", { name: "Clear selection (1 selected)" }) !== null).toBe(compact);
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

  it("offers the five image actions only for an explicit desktop selection", () => {
    const view = render(<StatusBar />);
    expect(screen.queryByRole("group", { name: "Image actions" })).toBeNull();
    act(() => useSelectionStore.setState({ selectedIds: new Set(["selected-image"]) }));
    const actions = screen.getByRole("group", { name: "Image actions" });
    expect([...actions.querySelectorAll("button")].map(button => button.getAttribute("aria-label"))).toEqual([
      "Share with URL", "Crop full frame", "Download", "Delete", "Add to Library",
    ]);
    expect(screen.getByRole("button", { name: "Deselect" })).toBeTruthy();
    const counter = screen.getByRole("status", { name: "1 selected" });
    const followingButtons = [...counter.parentElement!.querySelectorAll("button")]
      .filter(button => Boolean(counter.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING));
    expect(followingButtons[0]).toBe(screen.getByRole("button", { name: "Deselect" }));
    view.unmount();
  });

  it("keeps pending action styling steady while blocking preparation immediately", () => {
    const view = render(<ImageActions actions={["delete"]} context={{ targets: [{ id: "pending", pending: true }], api: true, archive: true }} />);
    const button = screen.getByRole("button", { name: "Delete" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.getAttribute("aria-busy")).toBe("true");
    expect(button.style.opacity).toBe("0.4");
    fireEvent.click(button);
    expect(useImageActionStore.getState().prepared).toEqual([]);
    view.rerender(<ImageActions actions={["delete"]} context={{ targets: [{ id: "pending", pending: false }], api: true, archive: true }} />);
    expect(button.disabled).toBe(true);
    expect(button.getAttribute("aria-busy")).toBeNull();
    expect(button.style.opacity).toBe("");
  });

  it("does not brighten disabled Full frame while newly selected metadata is pending", () => {
    const target = (id: string, full = true) => ({ id, image: { id, uploadTime: "", uploadedBy: "", metadata: {},
      source: { mimeType: "image/jpeg", dimensions: { width: 1200, height: 800 } },
      exports: full ? [{ specification: { type: "full" } }] : [] },
      overlay: { resource: { uri: `https://api.example.test/images/${id}`, links: [{ rel: "crops", href: `https://crop.example.test/crops/${id}` }] } } });
    const existing = target("existing");
    const view = render(<ImageActions actions={["full-frame"]} context={{ targets: [existing], api: true, archive: true }} />);
    const button = screen.getByRole("button", { name: "Crop full frame" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    view.rerender(<ImageActions actions={["full-frame"]} context={{ targets: [existing, { id: "new", pending: true }], api: true, archive: true }} />);
    expect(button.disabled).toBe(true);
    expect(button.getAttribute("aria-busy")).toBe("true");
    expect(button.style.opacity).toBe("0.4");
    fireEvent.click(button);
    expect(useImageActionStore.getState().prepared).toEqual([]);
    view.rerender(<ImageActions actions={["full-frame"]} context={{ targets: [existing, target("new", false)], api: true, archive: true }} />);
    expect(button.disabled).toBe(false);
    expect(button.getAttribute("aria-busy")).toBeNull();
    expect(button.style.opacity).toBe("");
  });

  it("captures a disconnected Share in the existing activity panel", () => {
    useSelectionStore.setState({ selectedIds: new Set(["share-first", "share-second"]) });
    render(<><StatusBar /><LabelOperationReceipts /></>);
    fireEvent.click(screen.getByRole("button", { name: "Share with URL" }));
    expect(screen.getByText("Not sent - Share with URL")).toBeTruthy();
    act(() => useSelectionStore.setState({ selectedIds: new Set(["later-selection"]) }));
    expect(screen.getByText(/"share-first"/)).toBeTruthy();
    expect(screen.getByText(/"share-second"/)).toBeTruthy();
    const dismiss = screen.getByRole("button", { name: "Dismiss Share with URL preview" });
    dismiss.focus();
    fireEvent.click(dismiss);
    expect(screen.queryByText("Not sent - Share with URL")).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Share with URL" }));
  });

  it("falls back to the toolbar when a preview's return control is now disabled", () => {
    const target = { id: "first", image: { id: "first", uploadTime: "", uploadedBy: "", metadata: {},
      source: { mimeType: "image/jpeg", dimensions: { width: 1200, height: 800 } } },
      overlay: { actions: [{ name: "delete", href: "https://api.example.test/images/first", method: "DELETE" as const }] } };
    const content = (pending: boolean) => <><header role="toolbar"><a href="/search">Grid</a></header>
      <ImageActions actions={["delete"]} context={{ targets: [{ ...target, pending }], api: true, archive: true }} /><LabelOperationReceipts /></>;
    const view = render(content(false));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm delete 1 image" }));
    view.rerender(content(true));
    const fallback = screen.getByRole("link", { name: "Grid" });
    const rects = vi.spyOn(fallback, "getClientRects").mockReturnValue([new DOMRect(0, 0, 44, 44)] as unknown as DOMRectList);
    try {
      const dismiss = screen.getByRole("button", { name: "Dismiss Delete preview" });
      dismiss.focus();
      fireEvent.click(dismiss);
      expect(document.activeElement).toBe(fallback);
    } finally { rects.mockRestore(); }
  });

  it("retains open activity details when another disconnected preview is prepared", () => {
    useSelectionStore.setState({ selectedIds: new Set(["share-first"]) });
    render(<><StatusBar /><LabelOperationReceipts /></>);
    const share = screen.getByRole("button", { name: "Share with URL" });
    fireEvent.click(share);
    const activity = screen.getByRole("complementary", { name: "Image activity" });
    const details = within(activity).getByText("Details").closest("details")!;
    details.open = true;
    fireEvent.click(share);
    expect(details.isConnected).toBe(true);
    expect(details.open).toBe(true);
  });

  it("requires a second Delete activation and disarms when the detail target changes", () => {
    const target = (id: string) => ({ id, image: { id, uploadTime: "", uploadedBy: "", metadata: {},
      source: { mimeType: "image/jpeg", dimensions: { width: 1200, height: 800 } } },
      overlay: { actions: [{ name: "delete", href: `https://api.example.test/images/${id}`, method: "DELETE" as const }] } });
    const view = render(<ImageActions actions={["delete"]} context={{ targets: [target("first")], api: true, archive: true }} />);
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(screen.getByRole("button", { name: "Confirm delete 1 image" })).toBeTruthy();
    view.rerender(<ImageActions actions={["delete"]} context={{ targets: [target("second")], api: true, archive: true }} />);
    expect(screen.queryByRole("button", { name: "Confirm delete 1 image" })).toBeNull();
    expect(screen.getByRole("button", { name: "Delete" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm delete 1 image" }));
    expect(useImageActionStore.getState().prepared.at(-1)?.targetIds).toEqual(["second"]);
  });

  it.each([false, true])("keeps explicit action controls independent of unrelated stores, compact=%s", async compact => {
    shell.compact = compact;
    const enrichment = useEnrichmentStore.getState();
    const commits = vi.fn();
    const target = { id: "detail", image: { id: "detail", uploadTime: "", uploadedBy: "", metadata: {},
      source: { mimeType: "image/jpeg", dimensions: { width: 1200, height: 800 } } },
      overlay: { actions: [{ name: "delete", href: "https://api.example.test/images/detail", method: "DELETE" as const }] } };
    const context = { targets: [target], api: true, archive: true };
    try {
      render(<Profiler id="explicit-actions" onRender={commits}>
        {compact ? <ImageActionFab docked context={context} /> : <>
          <ImageActions context={context} actions={["delete"]} />
          <FullFrameOptions context={context} />
        </>}
      </Profiler>);
      if (compact) fireEvent.click(screen.getByRole("button", { name: "Image actions" }));
      fireEvent.click(screen.getByRole("button", { name: "Delete" }));
      const confirm = screen.getByRole("button", { name: "Confirm delete 1 image" });
      confirm.focus();
      await act(async () => {});
      const settled = commits.mock.calls.length;
      act(() => useSelectionStore.setState(state => ({ selectedIds: new Set(["unrelated"]),
        metadataRevision: state.metadataRevision + 1, pendingFetchIds: new Set(["unrelated"]), isRangeWalking: true })));
      act(() => useSearchStore.setState(state => ({ results: [...state.results] })));
      act(() => useEnrichmentStore.setState({ data: new Map([["unrelated", { valid: false }]]) }));
      expect(commits).toHaveBeenCalledTimes(settled);
      expect(document.activeElement).toBe(confirm);
      fireEvent.click(confirm);
      expect(useImageActionStore.getState().prepared.at(-1)?.targetIds).toEqual(["detail"]);
    } finally { useEnrichmentStore.setState(enrichment, true); }
  });

  it("keeps selection actions live and rechecks membership at activation", () => {
    const enrichment = useEnrichmentStore.getState();
    const archive = vi.spyOn(gridApi, "serviceLink").mockResolvedValue(undefined);
    vi.stubEnv("VITE_USE_MEDIA_API", "true");
    try {
      useSelectionStore.setState({ selectedIds: new Set(["first"]), isRangeWalking: false });
      render(<SelectionImageActions actions={["share", "delete"]} />);
      const share = screen.getByRole("button", { name: "Share with URL" });
      act(() => {
        useSelectionStore.setState({ selectedIds: new Set(["second"]) });
        fireEvent.click(share);
      });
      expect(useImageActionStore.getState().prepared.at(-1)?.targetIds).toEqual(["second"]);
      act(() => useSelectionStore.setState({ isRangeWalking: true }));
      expect((share as HTMLButtonElement).disabled).toBe(true);
      act(() => useSelectionStore.setState({ isRangeWalking: false }));
      expect((share as HTMLButtonElement).disabled).toBe(false);
      const remove = screen.getByRole("button", { name: "Delete" }) as HTMLButtonElement;
      expect(remove.disabled).toBe(true);
      act(() => useSearchStore.setState({ results: [{ id: "second", uploadTime: "", uploadedBy: "", metadata: {},
        source: { mimeType: "image/jpeg", dimensions: { width: 1200, height: 800 } } }],
        imagePositions: new Map([["second", 0]]), bufferOffset: 0 }));
      act(() => useEnrichmentStore.setState({ data: new Map([["second", { actions: [
        { name: "delete", href: "https://api.example.test/images/second", method: "DELETE" as const },
      ] }]]) }));
      expect(remove.disabled).toBe(false);
      act(() => useEnrichmentStore.setState({ data: new Map([["second", { actions: [] }]]) }));
      expect(remove.disabled).toBe(true);
    } finally {
      archive.mockRestore();
      vi.unstubAllEnvs();
      useEnrichmentStore.setState(enrichment, true);
    }
  });

  it("closes selection actions when membership changes without changing the count", () => {
    shell.compact = true;
    useSelectionStore.setState({ selectedIds: new Set(["first"]), isRangeWalking: false });
    render(<SelectionFab />);
    const trigger = screen.getByRole("button", { name: "1 selected — actions" });
    fireEvent.click(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    act(() => useSelectionStore.setState({ selectedIds: new Set(["second"]) }));
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
  });

  it("keeps action taps separate from card dragging in the compact header", () => {
    shell.compact = true;
    useSelectionStore.setState({ selectedIds: new Set(["selected-image"]) });
    const panels = usePanelStore.getState().config;
    usePanelStore.setState({ config: { ...panels, right: { ...panels.right, visible: false } } });
    const clock = vi.spyOn(performance, "now");
    try {
      render(<PanelLayout rightPanel={<button>Metadata control</button>}><button>Result control</button></PanelLayout>);
      const card = screen.getByRole("region", { name: "Details" });
      const trigger = screen.getByRole("button", { name: "1 selected — actions" });
      const touch = (type: string, vertical: number, time: number) => {
        clock.mockReturnValue(time);
        fireEvent[type as "touchStart" | "touchMove" | "touchEnd"](trigger, {
          touches: type === "touchEnd" ? [] : [{ clientX: 200, clientY: vertical }],
          changedTouches: [{ clientX: 200, clientY: vertical }],
        });
      };
      touch("touchStart", 500, 1000);
      touch("touchEnd", 500, 1100);
      fireEvent.click(trigger);
      expect(trigger.getAttribute("aria-expanded")).toBe("true");
      expect(screen.getByRole("button", { name: "Expand Details" })).toBeTruthy();
      const peek = card.style.translate;
      touch("touchStart", 500, 2000);
      touch("touchMove", 480, 2100);
      expect(card.style.translate).not.toBe(peek);
      expect(screen.queryByRole("group", { name: "Selection actions" })).toBeNull();
      touch("touchMove", 100, 2500);
      touch("touchEnd", 100, 5000);
      fireEvent.click(trigger, { detail: 1 });
      expect(screen.getByRole("button", { name: "Collapse Details" })).toBeTruthy();
      expect(trigger.getAttribute("aria-expanded")).toBe("false");
      expect(trigger.closest("button button")).toBeNull();
      expect(card.contains(trigger)).toBe(true);
      expect(screen.queryByRole("button", { name: "Close details" })).toBeNull();
    } finally {
      clock.mockRestore();
      usePanelStore.setState({ config: panels });
    }
  });

  it("expands the compact floaty to expose the same five image actions", () => {
    shell.compact = true;
    useSelectionStore.setState({ selectedIds: new Set(["selected-image"]) });
    render(<SelectionFab />);
    expect(screen.getByText("Deselect")).toBeTruthy();
    expect(screen.getByRole("button", { name: "1 selected — actions" }).textContent).toBe("");
    fireEvent.click(screen.getByRole("button", { name: "1 selected — actions" }));
    const actions = screen.getByRole("group", { name: "Image actions" });
    expect([...actions.querySelectorAll("button")].map(button => button.getAttribute("aria-label"))).toEqual([
      "Share with URL", "Crop full frame", "Download", "Delete", "Add to Library",
    ]);
    const popup = screen.getByRole("group", { name: "Selection actions" });
    expect(within(popup).queryByRole("button", { name: "Clear selection" })).toBeNull();
    expect(screen.getByRole("button", { name: "Clear selection (1 selected)" })).toBeTruthy();
    expect(within(screen.getByRole("button", { name: "Clear selection (1 selected)" })).getByText("Deselect")).toBeTruthy();
  });

  it("closes Actions when the header toggles the card and opens below the expanded header", () => {
    shell.compact = true;
    useSelectionStore.setState({ selectedIds: new Set(["selected-image"]) });
    const panels = usePanelStore.getState().config;
    usePanelStore.setState({ config: { ...panels, right: { ...panels.right, visible: false } } });
    try {
      render(<PanelLayout rightPanel={<button>Metadata control</button>}><button>Result control</button></PanelLayout>);
      const trigger = screen.getByRole("button", { name: "1 selected — actions" });
      fireEvent.click(trigger);
      expect(screen.queryByRole("button", { name: "Details" })).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: "Expand Details" }));
      expect(usePanelStore.getState().config.right.visible).toBe(true);
      expect(trigger.getAttribute("aria-expanded")).toBe("false");
      fireEvent.click(trigger);
      fireEvent.click(screen.getByRole("button", { name: "Collapse Details" }));
      expect(usePanelStore.getState().config.right.visible).toBe(false);
      expect(trigger.getAttribute("aria-expanded")).toBe("false");
    } finally { usePanelStore.setState({ config: panels }); }
  });

  it("preserves header width and the Deselect hit area when expanded", () => {
    shell.compact = true;
    useSelectionStore.setState({ selectedIds: new Set(["selected-image"]) });
    render(<SelectionFab />);
    const trigger = screen.getByRole("button", { name: "1 selected — actions" });
    const clear = screen.getByRole("button", { name: "Clear selection (1 selected)" });
    const strip = trigger.parentElement!;
    const collapsedWidth = Number.parseFloat(strip.style.width);
    const clearWidth = Number.parseFloat(clear.style.width);
    expect(collapsedWidth).toBe(112);
    expect(clearWidth).toBeGreaterThanOrEqual(44);
    fireEvent.click(trigger);
    expect(screen.getByRole("group", { name: "Selection actions" }).style.width).toContain("136px");
    expect(Number.parseFloat(clear.style.width)).toBe(clearWidth);
    expect(Number.parseFloat(strip.style.width)).toBe(collapsedWidth);
  });

  it("keeps the expanded selection card nonmodal and lets an outside tap reach the page", () => {
    shell.compact = true;
    useSelectionStore.setState({ selectedIds: new Set(["selected-image"]) });
    const panels = usePanelStore.getState().config;
    usePanelStore.setState({ config: { ...panels, right: { ...panels.right, visible: true } } });
    const activate = vi.fn();
    try {
      render(<PanelLayout rightPanel={<button>Metadata control</button>}><button onClick={activate}>Result control</button></PanelLayout>);
      expect(screen.getByRole("region", { name: "Details" }).classList.contains("chrome-fade")).toBe(true);
      expect(screen.queryByTestId("card-scrim")).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: "1 selected — actions" }));
      const popup = screen.getByRole("group", { name: "Selection actions" });
      const last = [...popup.querySelectorAll<HTMLButtonElement>("button:not([disabled])")].at(-1)!;
      last.focus();
      expect(fireEvent.keyDown(last, { key: "Tab" })).toBe(true);
      const behind = screen.getByRole("button", { name: "Result control" });
      expect(fireEvent.pointerDown(behind)).toBe(true);
      fireEvent.click(behind);
      expect(activate).toHaveBeenCalledOnce();
      expect(screen.queryByRole("group", { name: "Selection actions" })).toBeNull();
      act(() => behind.focus());
      expect(document.activeElement).toBe(behind);
    } finally { usePanelStore.setState({ config: panels }); }
  });

  it("fits action options above a trigger when the visual viewport has no room below", () => {
    const original = Object.getOwnPropertyDescriptor(window, "visualViewport");
    const bounds = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      return this.getAttribute("aria-label") === "Full frame options" ? new DOMRect(270, 80, 32, 32) : new DOMRect(110, 112, 192, 140);
    });
    Object.defineProperty(window, "visualViewport", { configurable: true, value: { width: 320, height: 120, offsetTop: 0, offsetLeft: 0,
      addEventListener: vi.fn(), removeEventListener: vi.fn() } });
    try {
      render(<FullFrameOptions context={{ targets: [{ id: "first" }], api: true, archive: true }} />);
      fireEvent.click(screen.getByRole("button", { name: "Full frame options" }));
      const popup = screen.getByRole("group", { name: "Image actions" }).parentElement!;
      expect(popup.textContent).toBe("Crop full frame");
      expect(popup.className).toContain("bottom-full");
      expect(Number.parseFloat(popup.style.maxHeight)).toBeLessThanOrEqual(72);
    } finally {
      bounds.mockRestore();
      if (original) Object.defineProperty(window, "visualViewport", original);
      else Reflect.deleteProperty(window, "visualViewport");
    }
  });

  it("repositions an open floaty while its owning card is still moving", async () => {
    shell.compact = true;
    useSelectionStore.setState({ selectedIds: new Set(["selected-image"]) });
    const panels = usePanelStore.getState().config;
    usePanelStore.setState({ config: { ...panels, right: { ...panels.right, visible: false } } });
    const viewport = Object.getOwnPropertyDescriptor(window, "visualViewport");
    let top = 330;
    let moving = true;
    const bounds = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      return this.getAttribute("aria-label") === "1 selected — actions" ? new DOMRect(220, top, 82, 44) : new DOMRect(160, top, 176, 262);
    });
    Object.defineProperty(window, "visualViewport", { configurable: true, value: { width: 393, height: 400, offsetTop: 0, offsetLeft: 0,
      addEventListener: vi.fn(), removeEventListener: vi.fn() } });
    vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame"] });
    try {
      render(<PanelLayout rightPanel={<button>Metadata control</button>}><button>Result control</button></PanelLayout>);
      const card = screen.getByRole("region", { name: "Details" });
      card.getAnimations = () => [{ playState: moving ? "running" : "finished", pending: false }] as Animation[];
      const trigger = screen.getByRole("button", { name: "1 selected — actions" });
      fireEvent.click(trigger);
      const floaty = trigger.closest(".selection-fab")!;
      expect(floaty.getAttribute("data-side")).toBe("above");
      top = 60;
      await act(async () => { vi.advanceTimersByTime(32); });
      expect(floaty.getAttribute("data-side")).toBe("below");
      moving = false;
      await act(async () => { vi.advanceTimersByTime(32); });
    } finally {
      cleanup();
      vi.useRealTimers();
      bounds.mockRestore();
      if (viewport) Object.defineProperty(window, "visualViewport", viewport); else Reflect.deleteProperty(window, "visualViewport");
      usePanelStore.setState({ config: panels });
    }
  });

  it("does not claim a best-of pool for an empty AI result", () => {
    useSearchStore.setState({ total: 0, aiPoolTotal: 0 });
    render(<StatusBar />);
    expect(resultCount()).toBe("0\u00a0matches");
  });

  it("skips unchanged parent-driven ticker formatting while keeping store updates fresh", () => {
    useSearchStore.setState({ tickerCounts: { [ticker.name]: { value: 5 } },
      tickersLastUpdated: new Date(Date.now() - 120_000).toISOString() });
    const view = render(<StatusBar />);
    const previousTitle = tickerBadge()?.getAttribute("title");
    expect(formatDistanceToNow).toHaveBeenCalled();
    vi.mocked(formatDistanceToNow).mockClear();

    view.rerender(<StatusBar />);
    expect(formatDistanceToNow).not.toHaveBeenCalled();

    act(() => useSearchStore.setState({ total: 201, tickerCounts: { [ticker.name]: { value: 6 } },
      tickersLastUpdated: new Date().toISOString() }));
    expect(resultCount()).toBe("201\u00a0matches");
    expect(tickerBadge()?.getAttribute("aria-label")).toBe(`6 ${ticker.name}`);
    expect(tickerBadge()?.getAttribute("title")).not.toBe(previousTitle);
    expect(formatDistanceToNow).toHaveBeenCalled();
  });

  it("shows absolute pool ticker counts, hiding only a ticker equal to the pool", () => {
    useSearchStore.setState({ aiPoolTotal: 4000, tickerCounts: { [ticker.name]: { value: 200 } } });
    const view = render(<StatusBar />);
    expect(tickerBadge()?.getAttribute("aria-label")).toBe(`200 ${ticker.name}`);

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

  it("renders New, then configured tickers in order, then server-only ones, with returned colours", () => {
    const [org, picks] = gridConfig.tickerDefinitions;
    useSearchStore.setState({ newCount: 3, tickerCounts: {
      server: { value: 4, searchClause: "is:server-only", backgroundColour: "#000001" },
      text: { value: 5, searchClause: "credit:Reuters", backgroundColour: "#000002" },
      [picks.name]: { value: 2, searchClause: picks.searchClause, backgroundColour: "#abcdef" },
      [org.name]: { value: 1 },
    } });
    render(<StatusBar />);
    const badges = screen.getAllByRole("button").filter((button) => /^\d/.test(button.textContent ?? ""));
    expect(badges.map((badge) => badge.getAttribute("aria-label") ?? badge.textContent)).toEqual(["3 new", `1 ${org.name}`, `2 ${picks.name}`, "4 server"]);
    expect(badges[1].style.backgroundColor).toBe("rgb(0, 86, 137)");
    expect(badges[2].style.backgroundColor).toBe("rgb(171, 205, 239)");
  });

  it("hovering Browse prefetches collection counts only when the hidden panel's Collections section is open", () => {
    const loadCounts = vi.spyOn(useCollectionStore.getState(), "loadCounts").mockResolvedValue();
    const panels = usePanelStore.getState().config;
    try {
      usePanelStore.setState({ config: { ...panels, left: { ...panels.left, visible: false }, sections: { "left-collections": false } } });
      render(<StatusBar />);
      const browse = screen.getByRole("button", { name: "Show Browse panel" });
      fireEvent.mouseEnter(browse);
      expect(loadCounts).not.toHaveBeenCalled();

      act(() => usePanelStore.setState({ config: { ...panels, left: { ...panels.left, visible: false }, sections: { "left-collections": true } } }));
      fireEvent.mouseEnter(browse);
      expect(loadCounts).toHaveBeenCalledWith(useSearchStore.getState().dataSource, "free");
    } finally {
      loadCounts.mockRestore();
      usePanelStore.setState({ config: panels });
    }
  });
});
