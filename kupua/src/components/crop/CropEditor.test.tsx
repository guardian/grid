/** @vitest-environment jsdom */

import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useImperativeHandle, useRef, type Ref } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Image } from "@/types/image";
import { CropEditor } from "./CropEditor";
import { registerShortcut } from "@/lib/keyboard-shortcuts";
import { applyLegacyCropParams } from "@/lib/crop/crop-options";
import type { Rect, Size } from "@/lib/crop/crop-request";
import { useFullscreen } from "@/hooks/useFullscreen";
import { useToastStore } from "@/stores/toast-store";
import { clearCropDraft, discardCropDraftOutside } from "@/lib/crop/crop-draft";
import type { UseBlockerOpts } from "@tanstack/react-router";
import { deriveImage } from "@/lib/derive-enriched-image";

vi.hoisted(() => {
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
});

const fixture = vi.hoisted(() => ({ changes: [] as Array<(state: unknown) => void>, edits: [] as Rect[], sources: [] as string[], zoomEnabled: false, compact: false,
  aspect: null as number | null,
  invalidated: false, sessionListeners: new Set<() => void>(),
  onZoomChange: undefined as ((zoomed: boolean) => void) | undefined, resets: 0, panMode: false,
  onAltChange: undefined as ((held: boolean) => void) | undefined,
  initialSelection: undefined as { rect: Rect | null; size: Size } | undefined,
  blocker: undefined as UseBlockerOpts | undefined }));
vi.mock("@tanstack/react-router", () => ({ useBlocker: (options: UseBlockerOpts) => { fixture.blocker = options; } }));
vi.mock("@/hooks/useShell", () => ({ useIsCompact: () => fixture.compact, isCompactNow: () => fixture.compact }));
vi.mock("./CropCanvas", () => ({ CropCanvas: ({ onChange, ref, src, aspect, zoomEnabled, initialSelection, onZoomChange, panMode, onAltChange }: { src: string; aspect: number | null; zoomEnabled?: boolean; onChange: (state: unknown) => void;
  onZoomChange?: (zoomed: boolean) => void; panMode?: boolean;
  onAltChange?: (held: boolean) => void;
  initialSelection?: { rect: Rect | null; size: Size };
  ref?: Ref<{ setSelection: (selection: Rect, coordinateSize: Size) => void; resetView: () => void }> }) => {
  fixture.zoomEnabled = !!zoomEnabled;
  fixture.aspect = aspect;
  fixture.onZoomChange = onZoomChange;
  fixture.panMode = !!panMode;
  fixture.onAltChange = onAltChange;
  fixture.initialSelection = initialSelection;
  useImperativeHandle(ref, () => ({ setSelection: (selection, rendition) => {
    fixture.edits.push(selection);
    onChange({ status: "ready", selection, rendition });
  }, resetView: () => { fixture.resets++; onZoomChange?.(false); } }));
  fixture.sources.push(src);
  fixture.changes.push(onChange);
  return <div data-testid="canvas" />;
} }));
vi.mock("@/lib/grid-api-instance", () => ({ serviceLink: async () => "https://example.invalid/images/{id}",
  isGridSessionInvalidated: () => fixture.invalidated, subscribeGridSessionInvalidation: (listener: () => void) => {
    fixture.sessionListeners.add(listener);
    return () => { fixture.sessionListeners.delete(listener); };
  } }));
vi.mock("@/lib/image-urls", () => ({ getFullImageUrl: (image: Image) => `/preview/${image.id}`, getThumbnailUrl: () => undefined,
  getZoomImageUrl: (image: Image) => `/zoom/${image.id}` }));

const image = (id: string) => ({ id, metadata: { title: id }, source: { dimensions: { width: 2000, height: 1000 } } }) as Image;
const ready = { status: "ready", selection: { x: 10, y: 20, width: 100, height: 100 }, rendition: { width: 1000, height: 500 } };

beforeEach(() => {
  fixture.changes = []; fixture.edits = []; fixture.sources = []; fixture.compact = false; fixture.resets = 0;
  fixture.blocker = undefined;
  fixture.invalidated = false;
  clearCropDraft(); sessionStorage.clear(); localStorage.clear();
  vi.spyOn(window, "confirm").mockReturnValue(true);
});
afterEach(() => {
  cleanup(); clearCropDraft(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers();
  Reflect.deleteProperty(document, "fullscreenElement");
  Reflect.deleteProperty(document, "exitFullscreen");
  Reflect.deleteProperty(HTMLElement.prototype, "requestFullscreen");
});

function blockDeparture(search: Record<string, string> = { image: "A" }) {
  return fixture.blocker!.shouldBlockFn({ next: { pathname: "/search", search }, action: "BACK" } as never);
}

it("uses accepted crop authority and source while retaining the frame when preparation is withheld", () => {
  vi.stubEnv("VITE_USE_MEDIA_API", "true");
  try {
    const raw = image("A");
    const accepted = deriveImage(raw, { valid: true, invalidReasons: {}, cost: "conditional",
      usageRights: { category: "fixture", restrictions: "Fixture restriction" },
      resource: { uri: "https://canonical.example.test/images/A", links: [{ rel: "crops", href: "https://crop.example.test/A" }] } });
    const view = render(<CropEditor image={raw} actionImage={accepted} onClose={() => {}} />);
    act(() => fixture.changes.at(-1)!(ready));
    expect(screen.getByText("Restricted use")).toBeTruthy();
    expect(screen.getByText("Fixture restriction")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Crop" }));
    expect(screen.getByTestId("crop-dry-run").textContent).toContain("https://canonical.example.test/images/A");
    const canvas = screen.getByTestId("canvas");
    const width = screen.getByRole("spinbutton", { name: "Crop width" }) as HTMLInputElement;
    const originalWidth = width.value;
    view.rerender(<CropEditor image={raw} actionImage={{ ...accepted, metadataStale: true }} onClose={() => {}} />);
    expect((screen.getByRole("button", { name: "Crop" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByTestId("crop-dry-run")).toBeNull();
    expect(screen.getByTestId("canvas")).toBe(canvas);
    expect(width.value).toBe(originalWidth);
    fireEvent.keyDown(document.body, { key: "Enter" });
    expect(screen.queryByTestId("crop-dry-run")).toBeNull();
    view.rerender(<CropEditor image={raw} actionImage={{ ...accepted, resource: { ...accepted.resource!, links: [] } }} onClose={() => {}} />);
    expect((screen.getByRole("button", { name: "Crop" }) as HTMLButtonElement).disabled).toBe(true);
    view.rerender(<CropEditor image={raw} actionImage={accepted} onClose={() => {}} />);
    expect((screen.getByRole("button", { name: "Crop" }) as HTMLButtonElement).disabled).toBe(false);
    expect(width.value).toBe(originalWidth);
    act(() => { fixture.invalidated = true; fixture.sessionListeners.forEach(listener => listener()); });
    expect((screen.getByRole("button", { name: "Crop" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByTestId("crop-dry-run")).toBeNull();
    fireEvent.keyDown(document.body, { key: "Enter" });
    expect(screen.queryByTestId("crop-dry-run")).toBeNull();
    act(() => { fixture.invalidated = false; fixture.sessionListeners.forEach(listener => listener()); });
    expect(width.value).toBe(originalWidth);
  } finally { vi.unstubAllEnvs(); }
});

it("does not warn for default frames, preset changes or view-only zoom", () => {
  const close = vi.fn();
  const home = vi.fn();
  render(<CropEditor image={image("A")} onClose={close} onHome={home} />);
  act(() => fixture.changes.at(-1)!({ ...ready, selection: { x: 0, y: 0, width: 1000, height: 500 } }));
  act(() => fixture.onZoomChange?.(true));
  expect(blockDeparture()).toBe(false);
  fireEvent.click(screen.getByRole("radio", { name: "portrait (4:5)" }));
  act(() => fixture.changes.at(-1)!({ ...ready, selection: { x: 300, y: 0, width: 400, height: 500 } }));
  fireEvent.click(screen.getByRole("button", { name: "Back to image" }));
  fireEvent.click(screen.getByRole("link", { name: "Grid" }));
  expect(close).toHaveBeenCalledOnce();
  expect(home).toHaveBeenCalledOnce();
  expect(window.confirm).not.toHaveBeenCalled();
});

it.each([false, true])("guards adjusted frames before Home, Back and history without double prompting, compact=%s", compact => {
  fixture.compact = compact;
  const close = vi.fn();
  const home = vi.fn();
  vi.mocked(window.confirm).mockReturnValue(false);
  render(<CropEditor image={image("A")} onClose={close} onHome={home} />);
  act(() => fixture.changes.at(-1)!({ ...ready, selection: { x: 0, y: 0, width: 1000, height: 500 } }));
  act(() => fixture.changes.at(-1)!(ready));
  fireEvent.click(screen.getByRole("button", { name: "Back to image" }));
  fireEvent.click(screen.getByRole("link", { name: "Grid" }));
  expect(close).not.toHaveBeenCalled();
  expect(home).not.toHaveBeenCalled();
  expect(blockDeparture()).toBe(true);
  expect(window.confirm).toHaveBeenCalledTimes(3);
  expect(blockDeparture({ image: "A", cropping: "true" })).toBe(false);
  expect(window.confirm).toHaveBeenCalledTimes(3);
  act(() => fixture.changes.at(-1)!({ ...ready, selection: { x: 0, y: 0, width: 1000, height: 500 } }));
  expect(blockDeparture()).toBe(false);
  expect(window.confirm).toHaveBeenCalledTimes(3);
  act(() => fixture.changes.at(-1)!(ready));
  vi.mocked(window.confirm).mockReturnValue(true);
  fireEvent.click(screen.getByRole("link", { name: "Grid" }));
  expect(home).toHaveBeenCalledOnce();
  expect(blockDeparture({})).toBe(false);
  expect(window.confirm).toHaveBeenCalledTimes(4);
  act(() => fixture.changes.at(-1)!({ ...ready, selection: null }));
  vi.mocked(window.confirm).mockReturnValue(false);
  expect(blockDeparture()).toBe(true);
  expect(window.confirm).toHaveBeenCalledTimes(5);
});

it("keeps an existing frame adjustment guarded after ratio changes and reload", () => {
  vi.mocked(window.confirm).mockReturnValue(false);
  const close = vi.fn();
  const mounted = render(<CropEditor image={image("A")} onClose={close} />);
  act(() => fixture.changes.at(-1)!({ ...ready, selection: { x: 0, y: 0, width: 1000, height: 500 } }));
  act(() => fixture.changes.at(-1)!(ready));
  fireEvent.click(screen.getByRole("radio", { name: "portrait (4:5)" }));
  expect(blockDeparture()).toBe(true);
  const portrait = { ...ready, selection: { x: 300, y: 0, width: 400, height: 500 } };
  act(() => fixture.changes.at(-1)!(portrait));
  fireEvent.click(screen.getByRole("button", { name: "Back to image" }));
  expect(close).not.toHaveBeenCalled();
  expect(window.confirm).toHaveBeenLastCalledWith("Abandon the adjusted crop? Leaving this editor will discard it.");
  fireEvent(window, new Event("pagehide"));
  mounted.unmount();
  render(<CropEditor image={image("A")} onClose={close} />);
  expect(blockDeparture()).toBe(true);
  act(() => fixture.changes.at(-1)!(portrait));
  expect(blockDeparture()).toBe(true);
});

it("retains the actual default through reload without hiding a one-pixel adjustment", () => {
  const source = { ...image("A"), source: { dimensions: { width: 7388, height: 4925 } } } as Image;
  const frame = { x: 49.99999999999999, y: 0, width: 300, height: 300 };
  const rendition = { width: 400, height: 300 };
  const mounted = render(<CropEditor image={source} onClose={() => {}} />);
  fireEvent.click(screen.getByRole("radio", { name: "square (1:1)" }));
  act(() => fixture.changes.at(-1)!({ status: "ready", selection: frame, rendition }));
  expect(blockDeparture()).toBe(false);
  fireEvent(window, new Event("pagehide"));
  mounted.unmount();
  render(<CropEditor image={source} onClose={() => {}} />);
  expect(blockDeparture()).toBe(false);
  act(() => fixture.changes.at(-1)!({ status: "ready", selection: frame, rendition }));
  expect(blockDeparture()).toBe(false);
  act(() => fixture.changes.at(-1)!({ status: "ready", selection: { ...frame, x: frame.x + 400 / 7388 }, rendition }));
  vi.mocked(window.confirm).mockReturnValue(false);
  expect(blockDeparture()).toBe(true);
});

it("keeps restored adjustments guarded while reload stays prompt-free", () => {
  const draft = { version: 1, imageId: "A", size: { width: 2000, height: 1000 }, cropKey: "freeform", ratio: null,
    rect: { x: 100, y: 80, width: 400, height: 500 } };
  sessionStorage.setItem("kupua.crop.draft", JSON.stringify(draft));
  vi.mocked(window.confirm).mockReturnValue(false);
  const mounted = render(<CropEditor image={image("A")} onClose={() => {}} />);
  expect(blockDeparture()).toBe(true);
  act(() => fixture.changes.at(-1)!({ status: "ready", selection: draft.rect, rendition: draft.size }));
  fireEvent(window, new Event("pagehide"));
  expect(fixture.blocker!.enableBeforeUnload).toBe(false);
  expect(JSON.parse(sessionStorage.getItem("kupua.crop.draft")!).rect).toEqual(draft.rect);
  expect(window.confirm).toHaveBeenCalledOnce();
  mounted.unmount();
  render(<CropEditor image={image("A")} onClose={() => {}} />);
  expect(fixture.initialSelection?.rect).toEqual(draft.rect);
  expect(blockDeparture()).toBe(true);
  expect(window.confirm).toHaveBeenCalledTimes(2);
});

it("edits mobile precision without replacing the canvas and closes nested controls before leaving Crop", () => {
  fixture.compact = true;
  const close = vi.fn();
  render(<CropEditor image={image("A")} onClose={close} />);
  act(() => fixture.changes.at(-1)!(ready));
  const canvas = screen.getByTestId("canvas");
  fireEvent.click(screen.getByRole("radio", { name: "square (1:1)" }));
  const mask = screen.getByRole("checkbox", { name: "Apply mask" }) as HTMLInputElement;
  expect(mask.closest("footer")).not.toBeNull();
  fireEvent.click(mask);
  expect(mask.checked).toBe(false);
  expect(localStorage.getItem("kupua.crop.circularMask")).toBe("false");
  fireEvent.click(screen.getByRole("radio", { name: "freeform" }));
  expect(screen.queryByRole("checkbox", { name: "Apply mask" })).toBeNull();
  act(() => fixture.changes.at(-1)!(ready));
  expect(screen.queryByRole("spinbutton", { name: "Crop width" })).toBeNull();
  const precision = screen.getByRole("button", { name: "Edit crop coordinates" });
  fireEvent.click(precision);
  const width = screen.getByRole("spinbutton", { name: "Crop width" });
  expect(document.activeElement).toBe(screen.getByRole("spinbutton", { name: "Crop x" }));
  fireEvent.change(width, { target: { value: "500" } });
  expect(fixture.edits.at(-1)?.width).toBe(500);
  fireEvent.keyDown(width, { key: "Escape" });
  expect(screen.queryByRole("spinbutton", { name: "Crop width" })).toBeNull();
  expect(document.activeElement).toBe(precision);
  expect(screen.getByTestId("canvas")).toBe(canvas);
  const settings = screen.getByRole("button", { name: "Settings" });
  fireEvent.click(settings);
  expect(screen.getByRole("menu")).toBeTruthy();
  fireEvent.pointerDown(screen.getByRole("menu"));
  expect(screen.getByRole("menu")).toBeTruthy();
  canvas.addEventListener("pointerdown", event => event.stopPropagation(), { once: true });
  fireEvent.pointerDown(canvas);
  expect(screen.queryByRole("menu")).toBeNull();
  fireEvent.click(settings);
  fireEvent.keyDown(settings, { key: "Escape" });
  expect(screen.queryByRole("menu")).toBeNull();
  expect(close).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Back to image" }));
  expect(close).toHaveBeenCalledOnce();
});

it("shows zoomed-only header tools and a once-per-opening pan hint with tap or timeout dismissal", () => {
  vi.useFakeTimers();
  vi.spyOn(console, "info").mockImplementation(() => {});
  fixture.compact = true;
  const mounted = render(<CropEditor image={image("A")} onClose={() => {}} />);
  act(() => fixture.changes.at(-1)!(ready));
  expect(screen.getByRole("button", { name: "Crop" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Fit image" })).toBeNull();
  act(() => fixture.onZoomChange?.(true));
  const fit = screen.getByRole("button", { name: "Fit image" });
  const pan = screen.getByRole("button", { name: "Pan view" });
  expect(fit.closest("header")).not.toBeNull();
  expect(pan.closest("header")).toBe(fit.closest("header"));
  expect(screen.queryByRole("button", { name: "View controls" })).toBeNull();
  expect(screen.getByText("Two-finger pan")).toBeTruthy();
  const hint = screen.getByText("Two-finger pan").closest('[data-testid="toast"]')!;
  expect(hint.querySelector('svg[data-icon="hand"]')).not.toBeNull();
  expect(hint.querySelectorAll("svg")).toHaveLength(1);
  act(() => vi.advanceTimersByTime(3999));
  expect(screen.getByText("Two-finger pan")).toBeTruthy();
  act(() => vi.advanceTimersByTime(1));
  expect(screen.queryByText("Two-finger pan")).toBeNull();
  act(() => fixture.onZoomChange?.(false));
  act(() => fixture.onZoomChange?.(true));
  expect(screen.queryByText("Two-finger pan")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Pan view" }));
  expect(fixture.panMode).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Fit image" }));
  expect(fixture.resets).toBe(1);
  expect(fixture.panMode).toBe(false);
  expect(screen.queryByRole("button", { name: "Fit image" })).toBeNull();
  mounted.unmount();
  render(<CropEditor image={image("A")} onClose={() => {}} />);
  act(() => fixture.changes.at(-1)!(ready));
  act(() => fixture.onZoomChange?.(true));
  expect(screen.getByText("Two-finger pan")).toBeTruthy();
  const pointer = (target: HTMLElement, type: string, clientX: number) => {
    const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX, clientY: 10 });
    Object.defineProperties(event, { pointerId: { value: 1 }, isPrimary: { value: true } });
    fireEvent(target, event);
    expect(event.defaultPrevented).toBe(false);
  };
  const canvas = screen.getByTestId("canvas");
  pointer(canvas, "pointerdown", 10);
  pointer(canvas, "pointermove", 50);
  pointer(canvas, "pointerup", 50);
  expect(screen.getByText("Two-finger pan")).toBeTruthy();
  const crop = screen.getByRole("button", { name: "Crop" });
  pointer(crop, "pointerdown", 10);
  pointer(crop, "pointerup", 10);
  expect(screen.queryByText("Two-finger pan")).toBeNull();
  fireEvent.click(crop);
  expect(screen.getByTestId("crop-dry-run")).toBeTruthy();
});

it.each([false, true])("keeps rejected coordinates visible without changing the crop, compact=%s", compact => {
  fixture.compact = compact;
  render(<CropEditor image={image("A")} onClose={() => {}} />);
  act(() => fixture.changes.at(-1)!(ready));
  if (compact) fireEvent.click(screen.getByRole("button", { name: "Edit crop coordinates" }));
  const width = screen.getByRole("spinbutton", { name: "Crop width" }) as HTMLInputElement;
  const crop = screen.getByRole("button", { name: "Crop" }) as HTMLButtonElement;
  width.focus();
  fireEvent.change(width, { target: { value: "5000" } });
  expect(width.getAttribute("aria-invalid")).toBe("true");
  expect(fixture.edits).toHaveLength(0);
  expect(crop.disabled).toBe(true);
  fireEvent.blur(width);
  expect(width.value).toBe("5000");
  fireEvent.keyDown(document.body, { key: "Enter" });
  expect(screen.queryByTestId("crop-dry-run")).toBeNull();
  if (compact) {
    fireEvent.click(screen.getByRole("button", { name: "Done editing coordinates" }));
    expect(screen.getByRole("spinbutton", { name: "Crop width" })).toBe(width);
    expect(screen.getByRole("button", { name: "Edit crop coordinates" }).getAttribute("aria-expanded")).toBe("true");
  }
  fireEvent.change(width, { target: { value: "" } });
  expect(width.getAttribute("aria-invalid")).toBe("true");
  fireEvent.change(width, { target: { value: "500" } });
  expect(width.getAttribute("aria-invalid")).not.toBe("true");
  expect(fixture.edits.at(-1)?.width).toBe(500);
  expect(crop.disabled).toBe(false);
  fireEvent.click(screen.getByRole("radio", { name: "square (1:1)" }));
  act(() => fixture.changes.at(-1)!(ready));
  const editCount = fixture.edits.length;
  fireEvent.change(screen.getByRole("spinbutton", { name: "Crop width" }), { target: { value: "1000" } });
  expect(screen.getByRole("spinbutton", { name: "Crop width" }).getAttribute("aria-invalid")).toBe("true");
  expect(fixture.edits).toHaveLength(editCount);
  fireEvent.click(screen.getByRole("radio", { name: "video (16:9)" }));
  const videoWidth = 500 * 16 / 9;
  act(() => fixture.changes.at(-1)!({ ...ready, selection: { x: (1000 - videoWidth) / 2, y: 0, width: videoWidth, height: 500 } }));
  expect(width.value).toBe("1778");
  fireEvent.change(width, { target: { value: "1779" } });
  expect(width.getAttribute("aria-invalid")).toBe("true");
  fireEvent.change(width, { target: { value: "1778" } });
  expect(width.getAttribute("aria-invalid")).not.toBe("true");
  expect(width.value).toBe("1778");
  expect(crop.disabled).toBe(false);
  if (compact) {
    fireEvent.click(screen.getByRole("button", { name: "Done editing coordinates" }));
    expect(screen.queryByRole("spinbutton", { name: "Crop width" })).toBeNull();
  }
});

it("fits the keyboard viewport and finishes a deliberate header swipe without changing geometry", () => {
  vi.useFakeTimers();
  fixture.compact = true;
  const viewport = Object.assign(new EventTarget(), { height: 800, width: 390, offsetTop: 0, scale: 1 });
  vi.stubGlobal("visualViewport", viewport);
  render(<CropEditor image={image("A")} onClose={() => {}} />);
  act(() => fixture.changes.at(-1)!(ready));
  const editor = screen.getByRole("dialog", { name: "Crop image" });
  const precision = screen.getByRole("button", { name: "Edit crop coordinates" });
  expect(editor.style.height).toBe("800px");
  fireEvent.click(precision);
  const canvas = screen.getByTestId("canvas");
  act(() => { viewport.height = 400; viewport.offsetTop = 18; viewport.dispatchEvent(new Event("resize")); });
  expect(editor.style.height).toBe("400px");
  expect(editor.style.top).toBe("18px");
  expect(screen.queryByRole("radiogroup", { name: "Crop ratio" })).toBeNull();
  act(() => { viewport.height = 800; viewport.offsetTop = 0; viewport.dispatchEvent(new Event("resize")); });
  expect(editor.style.height).toBe("400px");
  act(() => screen.getByRole("spinbutton", { name: "Crop y" }).focus());
  act(() => { viewport.height = 400; viewport.offsetTop = 18; viewport.dispatchEvent(new Event("resize")); });
  act(() => vi.advanceTimersByTime(200));
  expect(editor.style.height).toBe("400px");
  expect(editor.style.top).toBe("18px");
  act(() => { viewport.height = 800; viewport.offsetTop = 0; viewport.dispatchEvent(new Event("resize")); });
  act(() => vi.advanceTimersByTime(200));
  expect(editor.style.height).toBe("800px");
  expect(screen.getByRole("radiogroup", { name: "Crop ratio" })).toBeTruthy();
  act(() => { viewport.height = 400; viewport.offsetTop = 18; viewport.dispatchEvent(new Event("resize")); });
  expect(editor.style.height).toBe("400px");
  const handle = screen.getByTestId("crop-coordinate-handle");
  const pointer = (type: string, vertical: number, timestamp: number) => {
    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.defineProperties(event, {
      clientX: { value: 100 }, clientY: { value: vertical }, pointerId: { value: 1 },
      button: { value: 0 }, isPrimary: { value: true }, timeStamp: { value: timestamp },
    });
    fireEvent(handle, event);
  };
  pointer("pointerdown", 100, 0);
  pointer("pointermove", 120, 1000);
  pointer("pointerup", 120, 1100);
  expect(precision.getAttribute("aria-expanded")).toBe("true");
  pointer("pointerdown", 100, 1200);
  pointer("pointermove", 180, 1500);
  pointer("pointercancel", 180, 1600);
  expect(precision.getAttribute("aria-expanded")).toBe("true");
  pointer("pointerdown", 100, 2000);
  pointer("pointermove", 180, 3000);
  expect(handle.closest("section")!.style.transform).toBe("translateY(80px)");
  pointer("pointerup", 180, 3100);
  expect(precision.getAttribute("aria-expanded")).toBe("false");
  expect(document.activeElement).toBe(precision);
  expect(screen.getByTestId("canvas")).toBe(canvas);
  expect(fixture.edits).toHaveLength(0);
  act(() => { viewport.height = 800; viewport.offsetTop = 0; viewport.dispatchEvent(new Event("resize")); });
  expect(editor.style.height).toBe("800px");
  expect(screen.getByRole("radiogroup", { name: "Crop ratio" })).toBeTruthy();
});

it("restores the tab's draft ratio and frame and flushes edited or cleared geometry for reload", () => {
  const draft = { version: 1, imageId: "A", size: { width: 2000, height: 1000 }, cropKey: "portrait", ratio: 4 / 5,
    rect: { x: 100, y: 80, width: 400, height: 500 } };
  sessionStorage.setItem("kupua.crop.draft", JSON.stringify(draft));
  const mounted = render(<CropEditor image={image("A")} onClose={() => {}} />);
  expect(screen.getByRole("radio", { name: "portrait (4:5)" }).getAttribute("aria-checked")).toBe("true");
  expect(fixture.initialSelection).toEqual({ rect: draft.rect, size: draft.size });
  act(() => fixture.changes.at(-1)!({ status: "ready", selection: draft.rect, rendition: draft.size }));
  fireEvent.change(screen.getByRole("spinbutton", { name: "Crop x" }), { target: { value: "120" } });
  fireEvent(window, new Event("pagehide"));
  expect(JSON.parse(sessionStorage.getItem("kupua.crop.draft")!).rect.x).toBe(120);
  act(() => fixture.changes.at(-1)!({ status: "unavailable" }));
  fireEvent(window, new Event("pagehide"));
  expect(JSON.parse(sessionStorage.getItem("kupua.crop.draft")!).rect.x).toBe(120);
  mounted.unmount();
  const reloaded = render(<CropEditor image={image("A")} onClose={() => {}} />);
  expect(fixture.initialSelection?.rect?.x).toBe(120);
  act(() => fixture.changes.at(-1)!({ status: "ready", selection: null, rendition: draft.size }));
  fireEvent(window, new Event("pagehide"));
  expect(JSON.parse(sessionStorage.getItem("kupua.crop.draft")!).rect).toBeNull();
  reloaded.unmount();
  render(<CropEditor image={image("A")} onClose={() => {}} />);
  expect(fixture.initialSelection?.rect).toBeNull();
});

it.each([
  ["corrupt JSON", "{"],
  ["another image", JSON.stringify({ version: 1, imageId: "B", size: { width: 2000, height: 1000 }, cropKey: "portrait", ratio: 4 / 5, rect: null })],
  ["changed dimensions", JSON.stringify({ version: 1, imageId: "A", size: { width: 1000, height: 500 }, cropKey: "portrait", ratio: 4 / 5, rect: null })],
  ["changed ratio", JSON.stringify({ version: 1, imageId: "A", size: { width: 2000, height: 1000 }, cropKey: "portrait", ratio: 3 / 4, rect: null })],
  ["out-of-bounds frame", JSON.stringify({ version: 1, imageId: "A", size: { width: 2000, height: 1000 }, cropKey: "portrait", ratio: 4 / 5,
    rect: { x: 1900, y: 0, width: 400, height: 500 } })],
])("ignores a draft with %s", (_name, stored) => {
  sessionStorage.setItem("kupua.crop.draft", stored);
  render(<CropEditor image={image("A")} onClose={() => {}} />);
  expect(screen.getByRole("radio", { name: "freeform" }).getAttribute("aria-checked")).toBe("true");
  expect(fixture.initialSelection).toBeUndefined();
});

it("lets integration restrictions override the draft", () => {
  sessionStorage.setItem("kupua.crop.draft", JSON.stringify({ version: 1, imageId: "A", size: { width: 2000, height: 1000 },
    cropKey: "portrait", ratio: 4 / 5, rect: null }));
  applyLegacyCropParams(new URLSearchParams("cropType=video"));
  render(<CropEditor image={image("A")} onClose={() => {}} />);
  expect(screen.getAllByRole("radio")).toHaveLength(1);
  expect(screen.getByRole("radio", { name: "video (16:9)" }).getAttribute("aria-checked")).toBe("true");
  expect(fixture.initialSelection).toBeUndefined();
});

it("discards pending writes on crop departure and starts fresh when reopened", () => {
  vi.useFakeTimers();
  const mounted = render(<CropEditor image={image("A")} onClose={() => {}} />);
  act(() => fixture.changes.at(-1)!(ready));
  discardCropDraftOutside("?image=A&cropping=true");
  act(() => vi.advanceTimersByTime(100));
  expect(sessionStorage.getItem("kupua.crop.draft")).not.toBeNull();
  act(() => fixture.changes.at(-1)!({ ...ready, selection: null }));
  discardCropDraftOutside("?image=A");
  mounted.unmount();
  act(() => vi.advanceTimersByTime(100));
  expect(sessionStorage.getItem("kupua.crop.draft")).toBeNull();
  render(<CropEditor image={image("A")} onClose={() => {}} />);
  expect(fixture.initialSelection).toBeUndefined();
});

it("still edits crops when browser storage is unavailable", () => {
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
  render(<CropEditor image={image("A")} onClose={() => {}} />);
  act(() => fixture.changes.at(-1)!(ready));
  expect(() => fireEvent(window, new Event("pagehide"))).not.toThrow();
  expect((screen.getByRole("button", { name: "Crop" }) as HTMLButtonElement).disabled).toBe(false);
});

it("keeps a two-sentence warning while the frame is small, respects dismissal and clears it when large enough", () => {
  vi.useFakeTimers();
  useToastStore.getState()._clearAll();
  const mounted = render(<CropEditor image={image("A")} onClose={() => {}} />);
  const resize = (width: number) => act(() => fixture.changes.at(-1)!({ ...ready, selection: { ...ready.selection, width } }));
  const first = "This crop is very small and will result in a low-quality image.";
  const second = "Please try to use a larger crop or an alternative image.";
  expect(screen.queryByRole("alert")).toBeNull();
  resize(499);
  const warning = screen.getByRole("alert");
  expect(warning.getAttribute("data-category")).toBe("warning");
  expect(warning.classList.contains("w-max")).toBe(true);
  expect(warning.classList.contains("w-full")).toBe(false);
  expect(warning.classList.contains("max-w-full")).toBe(true);
  expect(warning.classList.contains("select-none")).toBe(true);
  expect(warning.classList.contains("pointer-events-none")).toBe(true);
  expect(warning.classList.contains("pointer-events-auto")).toBe(false);
  expect(screen.getByRole("button", { name: "Dismiss notification" }).classList.contains("pointer-events-auto")).toBe(true);
  expect(warning.parentElement?.className).toContain("bottom-4");
  expect(warning.parentElement?.className).toContain("right-4");
  expect(warning.parentElement?.className).toContain("items-end");
  expect(screen.getByText(first).classList.contains("block")).toBe(true);
  expect(screen.getByText(second).classList.contains("block")).toBe(true);
  act(() => vi.advanceTimersByTime(60_000));
  resize(400);
  expect(screen.getByRole("alert")).toBe(warning);
  expect(useToastStore.getState().queue).toHaveLength(0);
  const dismiss = screen.getByRole("button", { name: "Dismiss notification" });
  dismiss.focus();
  fireEvent.click(dismiss);
  expect(document.activeElement).toBe(screen.getByRole("dialog"));
  const tab = new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true, cancelable: true });
  fireEvent(screen.getByRole("dialog"), tab);
  expect(tab.defaultPrevented).toBe(true);
  expect(screen.getByRole("dialog").contains(document.activeElement)).toBe(true);
  expect(document.activeElement?.matches("button,input,a,[tabindex='0']")).toBe(true);
  resize(300);
  expect(screen.queryByRole("alert")).toBeNull();
  resize(500);
  expect(screen.queryByRole("alert")).toBeNull();
  resize(499);
  expect(screen.getByRole("alert")).toBeTruthy();
  const widthInput = screen.getByRole("spinbutton", { name: "Crop width" });
  widthInput.focus();
  fireEvent.click(screen.getByRole("button", { name: "Dismiss notification" }));
  expect(document.activeElement).toBe(widthInput);
  resize(500);
  expect(screen.queryByRole("alert")).toBeNull();
  resize(499);
  act(() => fixture.changes.at(-1)!({ ...ready, selection: null }));
  expect(screen.queryByRole("alert")).toBeNull();
  mounted.unmount();
  expect(useToastStore.getState().queue).toHaveLength(0);
});

it.each([
  { cost: "pay" as const, notice: "Pay to use" },
  { cost: "overquota" as const, notice: "Quota exceeded for this supplier" },
])("keeps $cost notices visible when Settings hides in crop fullscreen", ({ cost, notice }) => {
  let fullscreen: Element | null = null;
  Object.defineProperty(document, "fullscreenElement", { configurable: true, get: () => fullscreen });
  const raw = image("A");
  render(<CropEditor image={raw} actionImage={deriveImage(raw, { cost, valid: true, invalidReasons: {} })} onClose={() => {}} />);
  expect(screen.getByText(notice)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Settings" }));
  const menu = within(screen.getByRole("menu"));
  expect(menu.queryByRole("button", { name: /full screen/i })).toBeNull();
  expect(menu.queryByRole("button", { name: "Smaller thumbnails" })).toBeNull();
  expect(menu.queryByRole("menuitemcheckbox", { name: /Lock this view|View locked as Home/ })).toBeNull();
  fireEvent.pointerDown(screen.getByTestId("canvas"));
  expect(screen.queryByRole("menu")).toBeNull();
  act(() => { fullscreen = screen.getByRole("dialog"); document.dispatchEvent(new Event("fullscreenchange")); });
  expect(screen.queryByRole("button", { name: "Settings" })).toBeNull();
  expect(screen.getByText(notice).closest("[hidden]")).toBeNull();
  act(() => { fullscreen = null; document.dispatchEvent(new Event("fullscreenchange")); });
  expect(screen.getByRole("button", { name: "Settings" })).toBeTruthy();
  expect(screen.queryByRole("menu")).toBeNull();
});

it("keeps freeform on f and preserves crop coordinates when Alt+f or Escape changes fullscreen", async () => {
  vi.stubGlobal("matchMedia", () => ({ matches: true, addEventListener() {}, removeEventListener() {} }));
  let fullscreen: Element | null = null;
  Object.defineProperty(document, "fullscreenElement", { configurable: true, get: () => fullscreen });
  const request = vi.fn(async function(this: HTMLElement) {
    fullscreen = this;
    document.dispatchEvent(new Event("fullscreenchange"));
  });
  Object.defineProperty(HTMLElement.prototype, "requestFullscreen", { configurable: true, value: request });
  const exit = vi.fn(async () => {
    fullscreen = null;
    document.dispatchEvent(new Event("fullscreenchange"));
  });
  Object.defineProperty(document, "exitFullscreen", { configurable: true, value: exit });
  const close = vi.fn();
  function DetailOwner() {
    const ref = useRef<HTMLDivElement>(null);
    const { isFullscreen } = useFullscreen(ref);
    return <div ref={ref} data-testid="detail-owner" data-fullscreen={isFullscreen}>
      <CropEditor image={image("A")} onClose={close} />
    </div>;
  }
  render(<DetailOwner />);
  fireEvent.click(screen.getByRole("radio", { name: "square (1:1)" }));
  act(() => fixture.changes.at(-1)!(ready));
  const warning = screen.getByRole("alert");
  const width = screen.getByRole("spinbutton", { name: "Crop width" }) as HTMLInputElement;
  await act(async () => fireEvent.keyDown(width, { key: "ƒ", code: "KeyF", altKey: true }));
  expect(request).toHaveBeenCalledOnce();
  expect(screen.getByTestId("detail-owner").getAttribute("data-fullscreen")).toBe("false");
  expect(screen.queryByRole("group", { name: "Crop coordinates" })).toBeNull();
  expect(screen.queryByRole("radiogroup", { name: "Crop ratio" })).toBeNull();
  expect(screen.getByRole("dialog").classList.contains("bg-black")).toBe(true);
  expect(screen.queryByRole("button", { name: "Settings" })).toBeNull();
  expect(screen.getByRole("dialog").contains(warning)).toBe(true);
  expect(screen.getByRole("alert")).toBe(warning);
  expect(screen.getByRole("button", { name: "Crop" }).parentElement?.className).toContain("right-4");
  expect(screen.getByRole("button", { name: "Crop" }).parentElement?.className).toContain("top-[6px]");
  expect(screen.getByTestId("canvas").parentElement?.className).toContain("pt-[50px]");
  expect(screen.getByRole("radio", { name: "square (1:1)", hidden: true }).getAttribute("aria-checked")).toBe("true");
  expect(fixture.zoomEnabled).toBe(true);
  const hand = screen.getByRole("button", { name: "Pan view" });
  expect(hand.getAttribute("aria-pressed")).toBe("true");
  act(() => fixture.onAltChange?.(true));
  expect(hand.getAttribute("aria-pressed")).toBe("false");
  expect(fixture.panMode).toBe(true);
  act(() => fixture.onAltChange?.(false));
  expect(hand.getAttribute("aria-pressed")).toBe("true");
  fireEvent.click(hand);
  act(() => fixture.onAltChange?.(true));
  expect(hand.getAttribute("aria-pressed")).toBe("true");
  expect(fixture.panMode).toBe(false);
  act(() => fixture.onAltChange?.(false));
  expect(hand.getAttribute("aria-pressed")).toBe("false");
  expect(width.value).toBe("200");
  await act(async () => fireEvent.keyDown(document.body, { key: "Escape" }));
  expect(exit).toHaveBeenCalledOnce();
  expect(close).not.toHaveBeenCalled();
  expect(screen.getByRole("alert")).toBe(warning);
  expect(fixture.zoomEnabled).toBe(false);
  expect(width.value).toBe("200");
  expect(screen.getByRole("button", { name: "Full screen" }).title).toContain("Alt+f");
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Full screen" })));
  expect(document.activeElement).toBe(screen.getByRole("dialog", { name: "Crop image" }));
  const grip = document.createElement("cropper-handle");
  grip.attachShadow({ mode: "open" });
  screen.getByRole("dialog").append(grip);
  for (const [key, name] of [["l", "landscape (5:4)"], ["p", "portrait (4:5)"], ["s", "square (1:1)"], ["f", "freeform"]]) {
    fireEvent.keyDown(grip, { key });
    expect(screen.getByRole("radio", { name, hidden: true }).getAttribute("aria-checked")).toBe("true");
  }
  grip.remove();
  act(() => fixture.changes.at(-1)!(ready));
  act(() => { fullscreen = null; document.dispatchEvent(new Event("fullscreenchange")); });
  fireEvent.keyDown(document.body, { key: "Escape" });
  expect(close).not.toHaveBeenCalled();
  expect(width.value).toBe("200");
  fireEvent.keyDown(document.body, { key: "f", code: "KeyF" });
  expect(screen.getByRole("radio", { name: "freeform" }).getAttribute("aria-checked")).toBe("true");
});

it.each([false, true])("exposes crop fullscreen by model rather than hover capability, compact=%s", compact => {
  fixture.compact = compact;
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  render(<CropEditor image={image("A")} onClose={() => {}} />);
  expect(screen.queryByRole("button", { name: "Full screen" }) !== null).toBe(!compact);
  expect(fixture.zoomEnabled).toBe(false);
});

it("edits numeric geometry and Shift steps using the already-displayed image asset", () => {
  render(<CropEditor image={image("A")} previewSrc="/already-loaded.jpg" onClose={() => {}} />);
  expect(fixture.sources.at(-1)).toBe("/already-loaded.jpg");
  const width = screen.getByRole("spinbutton", { name: "Crop width" }) as HTMLInputElement;
  expect(width.disabled).toBe(true);
  expect(width.autocomplete).toBe("off");
  expect(width.name).toBe("crop-width");
  expect(width.id).not.toBe("");
  act(() => fixture.changes.at(-1)!(ready));
  fireEvent.change(width, { target: { value: "500" } });
  expect(fixture.edits.at(-1)?.width).toBe(500);
  const x = screen.getByRole("spinbutton", { name: "Crop x" }) as HTMLInputElement;
  fireEvent.keyDown(x, { key: "ArrowUp", shiftKey: true });
  expect(fixture.edits.at(-1)?.x).toBe(30);
  expect(x.value).toBe("30");
  fireEvent.click(screen.getByRole("radio", { name: "square (1:1)" }));
  act(() => fixture.changes.at(-1)!(ready));
  expect(screen.getByRole("checkbox", { name: "Apply circular mask" }).closest("footer")).toBeNull();
  fireEvent.change(screen.getByRole("spinbutton", { name: "Crop height" }), { target: { value: "300" } });
  expect(fixture.edits.at(-1)).toMatchObject({ width: 300, height: 300 });
});

it("requires a live valid selection and retires old output across ratio and image changes", async () => {
  const mounted = render(<CropEditor image={image("A")} onClose={() => {}} />);
  const crop = screen.getByRole("button", { name: "Crop" }) as HTMLButtonElement;
  expect(crop.disabled).toBe(true);
  const oldCallback = fixture.changes.at(-1)!;
  act(() => oldCallback(ready));
  expect(crop.disabled).toBe(false);
  fireEvent.click(crop);
  expect(screen.getByTestId("crop-dry-run").textContent).toContain('"width": 200');
  fireEvent.click(screen.getByRole("radio", { name: "square (1:1)" }));
  expect(crop.disabled).toBe(true);
  expect(screen.queryByText("Loading image...")).toBeNull();
  expect(screen.queryByTestId("crop-dry-run")).toBeNull();
  act(() => oldCallback(ready));
  expect(crop.disabled).toBe(true);
  act(() => fixture.changes.at(-1)!(ready));
  expect(crop.disabled).toBe(false);
  act(() => fixture.changes.at(-1)!({ ...ready, selection: null }));
  expect(crop.disabled).toBe(true);
  mounted.rerender(<CropEditor image={image("B")} onClose={() => {}} />);
  expect(crop.disabled).toBe(true);
  expect(screen.getByText("Loading image...")).toBeTruthy();
  act(() => fixture.changes.at(-1)!({ status: "unavailable" }));
  expect(screen.getByText("Image preview not available")).toBeTruthy();
  expect(crop.disabled).toBe(true);
  await act(async () => {});
});

it("owns shortcuts without submitting from focused controls or stealing browser combinations", async () => {
  const background = vi.fn();
  const unregister = registerShortcut({ key: "[", action: background });
  const close = vi.fn();
  let nativeSelection: import("cropperjs").CropperSelection | undefined;
  let nativeCanvas: HTMLElement | undefined;
  try {
    render(<CropEditor image={image("A")} onClose={close} />);
    act(() => fixture.changes.at(-1)!(ready));
    const { CropperSelection } = await import("cropperjs");
    CropperSelection.$define();
    nativeSelection = document.createElement("cropper-selection") as import("cropperjs").CropperSelection;
    nativeCanvas = document.createElement("cropper-canvas");
    nativeCanvas.append(nativeSelection);
    screen.getByRole("dialog").append(nativeCanvas);
    await act(async () => {
      nativeSelection!.movable = true;
      nativeSelection!.keyboard = true;
      nativeSelection!.$change(100, 100, 300, 200);
    });
    const plain = new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true, cancelable: true });
    fireEvent(document.body, plain);
    expect(nativeSelection.x).toBe(99);
    expect(plain.defaultPrevented).toBe(true);
    for (const modifier of ["metaKey", "ctrlKey", "altKey"]) {
      for (const key of ["ArrowLeft", "Delete", "Backspace", "+", "-"]) {
        const event = new KeyboardEvent("keydown", { key, [modifier]: true, bubbles: true, cancelable: true });
        fireEvent(document.body, event);
        expect(nativeSelection.x).toBe(99);
        expect(nativeSelection.width).toBe(300);
        expect(nativeSelection.hidden).toBe(false);
        expect(event.defaultPrevented).toBe(false);
      }
    }
    fireEvent.keyDown(document.body, { key: "[" });
    expect(background).not.toHaveBeenCalled();
    fireEvent.keyDown(screen.getByRole("radio", { name: "square (1:1)" }), { key: "Enter" });
    expect(screen.queryByTestId("crop-dry-run")).toBeNull();
    fireEvent.keyDown(document.body, { key: "Enter", metaKey: true });
    expect(screen.queryByTestId("crop-dry-run")).toBeNull();
    fireEvent.keyDown(document.body, { key: "Enter" });
    expect(screen.getByTestId("crop-dry-run")).toBeTruthy();
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(close).toHaveBeenCalledOnce();
  } finally {
    await act(async () => { if (nativeSelection) nativeSelection.keyboard = false; });
    nativeCanvas?.remove(); unregister();
  }
});

it("applies incoming legacy restrictions to an already-open editor and invalidates its selection", () => {
  render(<CropEditor image={image("A")} onClose={() => {}} />);
  act(() => fixture.changes.at(-1)!(ready));
  const crop = screen.getByRole("button", { name: "Crop" }) as HTMLButtonElement;
  expect(crop.disabled).toBe(false);
  act(() => applyLegacyCropParams(new URLSearchParams("cropType=custom&customRatio=custom,3,1")));
  expect(screen.getAllByRole("radio")).toHaveLength(1);
  expect(screen.getByRole("radio", { name: "custom (3:1)" }).getAttribute("aria-checked")).toBe("true");
  expect(fixture.aspect).toBe(3);
  expect(crop.disabled).toBe(true);
  const constrained = { ...ready, selection: { x: 10, y: 20, width: 300, height: 100 } };
  act(() => fixture.changes.at(-1)!(constrained));
  fireEvent.change(screen.getByRole("spinbutton", { name: "Crop width" }), { target: { value: "900" } });
  expect((screen.getByRole("spinbutton", { name: "Crop height" }) as HTMLInputElement).value).toBe("300");
  expect(crop.disabled).toBe(false);
  const settledOwner = fixture.changes.at(-1)!;
  fireEvent.click(screen.getByRole("radio", { name: "custom (3:1)" }));
  expect(fixture.changes.at(-1)).toBe(settledOwner);
  expect(crop.disabled).toBe(false);
  act(() => settledOwner({ ...ready, selection: null }));
  expect(crop.disabled).toBe(true);
  fireEvent.click(screen.getByRole("radio", { name: "custom (3:1)" }));
  expect(fixture.changes.at(-1)).not.toBe(settledOwner);
  act(() => settledOwner(constrained));
  expect(crop.disabled).toBe(true);
  act(() => fixture.changes.at(-1)!(constrained));
  expect(crop.disabled).toBe(false);
  act(() => applyLegacyCropParams(new URLSearchParams("customRatio=custom,2,1")));
  expect(screen.getByRole("radio", { name: "custom (2:1)" })).toBeTruthy();
  expect(crop.disabled).toBe(true);
});