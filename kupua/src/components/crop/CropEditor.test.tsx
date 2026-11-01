/** @vitest-environment jsdom */

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
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

const fixture = vi.hoisted(() => ({ changes: [] as Array<(state: unknown) => void>, edits: [] as Rect[], sources: [] as string[], zoomEnabled: false,
  initialSelection: undefined as { rect: Rect | null; size: Size } | undefined }));
vi.mock("./CropCanvas", () => ({ CropCanvas: ({ onChange, ref, src, zoomEnabled, initialSelection }: { src: string; zoomEnabled?: boolean; onChange: (state: unknown) => void;
  initialSelection?: { rect: Rect | null; size: Size };
  ref?: Ref<{ setSelection: (selection: Rect, coordinateSize: Size) => void }> }) => {
  fixture.zoomEnabled = !!zoomEnabled;
  fixture.initialSelection = initialSelection;
  useImperativeHandle(ref, () => ({ setSelection: (selection, rendition) => {
    fixture.edits.push(selection);
    onChange({ status: "ready", selection, rendition });
  } }));
  fixture.sources.push(src);
  fixture.changes.push(onChange);
  return <div data-testid="canvas" />;
} }));
vi.mock("@/lib/grid-api-instance", () => ({ serviceLink: async () => "https://example.invalid/images/{id}" }));
vi.mock("@/lib/image-urls", () => ({ getFullImageUrl: (image: Image) => `/preview/${image.id}`, getThumbnailUrl: () => undefined,
  getZoomImageUrl: (image: Image) => `/zoom/${image.id}` }));

const image = (id: string) => ({ id, metadata: { title: id }, source: { dimensions: { width: 2000, height: 1000 } } }) as Image;
const ready = { status: "ready", selection: { x: 10, y: 20, width: 100, height: 100 }, rendition: { width: 1000, height: 500 } };

beforeEach(() => { fixture.changes = []; fixture.edits = []; fixture.sources = []; clearCropDraft(); sessionStorage.clear(); localStorage.clear(); });
afterEach(() => {
  cleanup(); clearCropDraft(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers();
  Reflect.deleteProperty(document, "fullscreenElement");
  Reflect.deleteProperty(document, "exitFullscreen");
  Reflect.deleteProperty(HTMLElement.prototype, "requestFullscreen");
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
  expect((screen.getByRole("button", { name: "Crop (dry run)" }) as HTMLButtonElement).disabled).toBe(false);
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
  expect(screen.getAllByRole("button")).toHaveLength(2);
  expect(screen.getByRole("dialog").contains(warning)).toBe(true);
  expect(screen.getByRole("alert")).toBe(warning);
  expect(screen.getByRole("button", { name: "Crop (dry run)" }).parentElement?.className).toContain("right-4");
  expect(screen.getByRole("button", { name: "Crop (dry run)" }).parentElement?.className).toContain("top-[6px]");
  expect(screen.getByTestId("canvas").parentElement?.className).toContain("pt-[50px]");
  expect(screen.getByRole("radio", { name: "square (1:1)", hidden: true }).getAttribute("aria-checked")).toBe("true");
  expect(fixture.zoomEnabled).toBe(true);
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

it("does not expose crop fullscreen on a coarse-pointer device", () => {
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  render(<CropEditor image={image("A")} onClose={() => {}} />);
  expect(screen.queryByRole("button", { name: "Full screen" })).toBeNull();
  expect(fixture.zoomEnabled).toBe(false);
});

it("edits numeric geometry and Shift steps using the already-displayed image asset", () => {
  render(<CropEditor image={image("A")} previewSrc="/already-loaded.jpg" onClose={() => {}} />);
  expect(fixture.sources.at(-1)).toBe("/already-loaded.jpg");
  const width = screen.getByRole("spinbutton", { name: "Crop width" }) as HTMLInputElement;
  expect(width.disabled).toBe(true);
  act(() => fixture.changes.at(-1)!(ready));
  fireEvent.change(width, { target: { value: "500" } });
  expect(fixture.edits.at(-1)?.width).toBe(500);
  const x = screen.getByRole("spinbutton", { name: "Crop x" }) as HTMLInputElement;
  fireEvent.keyDown(x, { key: "ArrowUp", shiftKey: true });
  expect(fixture.edits.at(-1)?.x).toBe(30);
  expect(x.value).toBe("30");
  fireEvent.click(screen.getByRole("radio", { name: "square (1:1)" }));
  act(() => fixture.changes.at(-1)!(ready));
  fireEvent.change(screen.getByRole("spinbutton", { name: "Crop height" }), { target: { value: "300" } });
  expect(fixture.edits.at(-1)).toMatchObject({ width: 300, height: 300 });
});

it("requires a live valid selection and retires old output across ratio and image changes", async () => {
  const mounted = render(<CropEditor image={image("A")} onClose={() => {}} />);
  const crop = screen.getByRole("button", { name: "Crop (dry run)" }) as HTMLButtonElement;
  expect(crop.disabled).toBe(true);
  const oldCallback = fixture.changes.at(-1)!;
  act(() => oldCallback(ready));
  expect(crop.disabled).toBe(false);
  fireEvent.click(crop);
  expect(screen.getByTestId("crop-dry-run").textContent).toContain('"width": 200');
  fireEvent.click(screen.getByRole("radio", { name: "square (1:1)" }));
  expect(crop.disabled).toBe(true);
  expect(screen.queryByTestId("crop-dry-run")).toBeNull();
  act(() => oldCallback(ready));
  expect(crop.disabled).toBe(true);
  act(() => fixture.changes.at(-1)!(ready));
  expect(crop.disabled).toBe(false);
  act(() => fixture.changes.at(-1)!({ ...ready, selection: null }));
  expect(crop.disabled).toBe(true);
  mounted.rerender(<CropEditor image={image("B")} onClose={() => {}} />);
  expect(crop.disabled).toBe(true);
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
  const crop = screen.getByRole("button", { name: "Crop (dry run)" }) as HTMLButtonElement;
  expect(crop.disabled).toBe(false);
  act(() => applyLegacyCropParams(new URLSearchParams("cropType=custom&customRatio=custom,3,1")));
  expect(screen.getAllByRole("radio")).toHaveLength(1);
  expect(screen.getByRole("radio", { name: "custom (3:1)" }).getAttribute("aria-checked")).toBe("true");
  expect(crop.disabled).toBe(true);
  act(() => fixture.changes.at(-1)!(ready));
  expect(crop.disabled).toBe(false);
  const settledOwner = fixture.changes.at(-1)!;
  fireEvent.click(screen.getByRole("radio", { name: "custom (3:1)" }));
  expect(fixture.changes.at(-1)).toBe(settledOwner);
  expect(crop.disabled).toBe(false);
  act(() => settledOwner({ ...ready, selection: null }));
  expect(crop.disabled).toBe(true);
  fireEvent.click(screen.getByRole("radio", { name: "custom (3:1)" }));
  expect(fixture.changes.at(-1)).not.toBe(settledOwner);
  act(() => settledOwner(ready));
  expect(crop.disabled).toBe(true);
  act(() => fixture.changes.at(-1)!(ready));
  expect(crop.disabled).toBe(false);
  act(() => applyLegacyCropParams(new URLSearchParams("customRatio=custom,2,1")));
  expect(screen.getByRole("radio", { name: "custom (2:1)" })).toBeTruthy();
  expect(crop.disabled).toBe(true);
});