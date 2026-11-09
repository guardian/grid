/** @vitest-environment jsdom */

import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { CropCanvas, type CropCanvasHandle } from "./CropCanvas";
import { bindCropTouchViewport, bindCropViewport } from "@/lib/crop/crop-viewport";

const fixture = vi.hoisted(() => ({
  templates: [] as string[],
  sessions: [] as Array<{ resolve: (image: { naturalWidth: number; naturalHeight: number }) => void;
    reject: (error: Error) => void; change: (x: number, y: number, width: number, height: number) => void; destroy: ReturnType<typeof vi.fn>;
    canvas: HTMLElement; image: HTMLElement & { src: string }; media: HTMLImageElement; transform: ReturnType<typeof vi.fn>; selection: HTMLElement & Rect }>,
  frames: new Map<number, FrameRequestCallback>(),
  nextFrame: 0,
}));
import type { Rect } from "@/lib/crop/crop-request";

vi.mock("cropperjs", () => ({ default: class {
  canvas = Object.assign(document.createElement("cropper-canvas"), { $setAction: vi.fn() });
  media = document.createElement("img");
  shadow = document.createDocumentFragment();
  transform = vi.fn();
  image = Object.assign(document.createElement("div"), { src: "", $ready: () => this.promise,
    $setTransform: this.transform, $getShadowRoot: () => this.shadow });
  selection = Object.assign(document.createElement("div"), {
    x: 0, y: 0, width: 0, height: 0, aspectRatio: NaN,
    $render: vi.fn(),
    $change: (x: number, y: number, width: number, height: number, aspectRatio: number = this.selection.aspectRatio, force = false): void => {
      if (!force && x === this.selection.x && y === this.selection.y && width === this.selection.width
        && height === this.selection.height && Object.is(aspectRatio, this.selection.aspectRatio)) return;
      const event = new CustomEvent("change", { cancelable: true, bubbles: true, detail: { x, y, width, height } });
      if (this.selection.dispatchEvent(event)) Object.assign(this.selection, { x, y, width, height, hidden: false });
    },
    $clear: (): void => { this.selection.$change(0, 0, 0, 0, NaN, true); this.selection.hidden = true; },
  });
  promise: Promise<{ naturalWidth: number; naturalHeight: number }>;
  destroy = vi.fn();
  constructor(_image: HTMLImageElement, options: { container: HTMLElement; template: string }) {
    fixture.templates.push(options.template);
    const template = document.createElement("template");
    template.innerHTML = options.template;
    for (const handle of template.content.querySelectorAll('cropper-handle[action$="-resize"]')) {
      const shadow = handle.attachShadow({ mode: "open" });
      Object.assign(handle, { $addStyles: (css: string) => {
        const style = document.createElement("style");
        style.textContent = css;
        shadow.append(style);
        return style;
      } });
      this.selection.append(handle);
    }
    this.shadow.append(this.media);
    let resolve!: (image: { naturalWidth: number; naturalHeight: number }) => void;
    let reject!: (error: Error) => void;
    this.promise = new Promise((accept, decline) => { resolve = accept; reject = decline; });
    this.canvas.getBoundingClientRect = this.image.getBoundingClientRect = () => new DOMRect(0, 0, 1000, 500);
    this.canvas.append(this.image, this.selection);
    options.container.append(this.canvas);
    fixture.sessions.push({ resolve, reject, change: this.selection.$change, destroy: this.destroy,
      canvas: this.canvas, image: this.image, media: this.media, transform: this.transform, selection: this.selection });
  }
  getCropperCanvas() { return this.canvas; }
  getCropperImage() { return this.image; }
  getCropperSelection() { return this.selection; }
} }));

beforeEach(() => {
  fixture.templates = [];
  fixture.sessions = [];
  fixture.frames.clear();
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    const id = ++fixture.nextFrame;
    fixture.frames.set(id, callback);
    return id;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => fixture.frames.delete(id));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("restores an original-pixel draft before revealing the frame, without replaying it on ratio changes", async () => {
  const onChange = vi.fn();
  const props = { src: "/preview", alt: "", aspect: null, onChange,
    initialSelection: { rect: { x: 1, y: 80, width: 4999, height: 200 }, size: { width: 5000, height: 2500 } } };
  const mounted = render(<CropCanvas {...props} />);
  expect(mounted.container.firstElementChild?.getAttribute("data-ready")).toBe("false");
  await act(async () => fixture.sessions[0].resolve({ naturalWidth: 1000, naturalHeight: 500 }));
  act(() => { const frames = [...fixture.frames.values()]; fixture.frames.clear(); frames.forEach(frame => frame(0)); });
  expect(onChange).toHaveBeenLastCalledWith({ status: "ready", selection: { x: 0.2, y: 16, width: 999.8, height: 40 },
    rendition: { width: 1000, height: 500 } });
  expect(onChange.mock.calls.filter(([state]) => state.status === "ready")).toHaveLength(1);
  expect(mounted.container.firstElementChild?.getAttribute("data-ready")).toBe("true");
  mounted.rerender(<CropCanvas {...props} aspect={1} />);
  expect(onChange).toHaveBeenLastCalledWith({ status: "ready", selection: { x: 250, y: 0, width: 500, height: 500 },
    rendition: { width: 1000, height: 500 } });
});

it("restores a cleared draft and can create a new frame afterwards", async () => {
  const onChange = vi.fn();
  const props = { src: "/preview", alt: "", aspect: null, onChange,
    initialSelection: { rect: null, size: { width: 2000, height: 1000 } } };
  const mounted = render(<CropCanvas {...props} />);
  await act(async () => fixture.sessions[0].resolve({ naturalWidth: 1000, naturalHeight: 500 }));
  act(() => { const frames = [...fixture.frames.values()]; fixture.frames.clear(); frames.forEach(frame => frame(0)); });
  expect(onChange).toHaveBeenLastCalledWith({ status: "ready", selection: null, rendition: { width: 1000, height: 500 } });
  expect(fixture.sessions[0].selection.hidden).toBe(true);
  expect(mounted.container.firstElementChild?.getAttribute("data-ready")).toBe("true");
  const recreated = vi.fn();
  mounted.rerender(<CropCanvas {...props} onChange={recreated} />);
  expect(recreated).toHaveBeenLastCalledWith({ status: "ready", selection: { x: 0, y: 0, width: 1000, height: 500 },
    rendition: { width: 1000, height: 500 } });
  expect(fixture.sessions[0].selection.hidden).toBe(false);
});

it("keeps the square outline as well as the circular mask and removes it with the mask", async () => {
  const onChange = vi.fn();
  const props = { src: "/preview", alt: "", aspect: 1, onChange };
  const mounted = render(<CropCanvas {...props} circle="mask" />);
  await act(async () => fixture.sessions[0].resolve({ naturalWidth: 1000, naturalHeight: 500 }));
  act(() => { const frames = [...fixture.frames.values()]; fixture.frames.clear(); frames.forEach(frame => frame(0)); });
  const selection = fixture.sessions[0].selection;
  const rect = onChange.mock.calls.at(-1)![0].selection;
  expect(selection).toHaveProperty("borderRadius", "50%");
  const outline = selection.querySelector<HTMLElement>('[data-testid="crop-square-outline"]')!;
  expect(outline).not.toBeNull();
  expect(outline.style.borderRadius).toBe("0px");
  expect(outline.style.pointerEvents).toBe("none");
  expect(outline.style.outline).toContain("1px solid");
  mounted.rerender(<CropCanvas {...props} circle="guide" />);
  expect(selection.querySelector('[data-testid="crop-square-outline"]')).toBeNull();
  expect(selection.querySelector('[data-testid="crop-circle-guide"]')).not.toBeNull();
  expect(selection).toHaveProperty("borderRadius", "");
  expect(onChange.mock.calls.at(-1)![0].selection).toEqual(rect);
});

it("publishes a valid selection to a new ratio owner even when geometry is unchanged", async () => {
  const first = vi.fn();
  const mounted = render(<CropCanvas src="/preview" alt="" aspect={5 / 4} onChange={first} />);
  await act(async () => fixture.sessions[0].resolve({ naturalWidth: 1000, naturalHeight: 500 }));
  act(() => { const frames = [...fixture.frames.values()]; fixture.frames.clear(); frames.forEach(frame => frame(0)); });
  const ready = first.mock.calls.at(-1)![0];
  expect(ready.status).toBe("ready");
  expect(ready.selection).not.toBeNull();
  const next = vi.fn();
  mounted.rerender(<CropCanvas src="/preview" alt="" aspect={5 / 4} onChange={next} />);
  expect(next).toHaveBeenCalledWith(ready);
  expect(fixture.sessions).toHaveLength(1);
});

it("keeps resizing downward after the same corner drag crosses the image's left edge", async () => {
  const onChange = vi.fn();
  const canvasRef = createRef<CropCanvasHandle>();
  render(<CropCanvas ref={canvasRef} src="/preview" alt="" aspect={null} onChange={onChange} />);
  await act(async () => fixture.sessions[0].resolve({ naturalWidth: 1000, naturalHeight: 500 }));
  act(() => { const frames = [...fixture.frames.values()]; fixture.frames.clear(); frames.forEach(frame => frame(0)); });
  act(() => canvasRef.current!.setSelection({ x: 200, y: 100, width: 300, height: 200 }, { width: 1000, height: 500 }));
  const session = fixture.sessions[0];
  act(() => session.change(-40, 100, 540, 280));
  expect(onChange).toHaveBeenLastCalledWith({ status: "ready", selection: { x: 0, y: 100, width: 500, height: 280 }, rendition: { width: 1000, height: 500 } });
  act(() => session.change(-40, 100, 540, 350));
  expect(onChange).toHaveBeenLastCalledWith({ status: "ready", selection: { x: 0, y: 100, width: 500, height: 350 }, rendition: { width: 1000, height: 500 } });
  act(() => session.change(-40, 100, 540, 450));
  expect(onChange).toHaveBeenLastCalledWith({ status: "ready", selection: { x: 0, y: 100, width: 500, height: 400 }, rendition: { width: 1000, height: 500 } });
});

it("slides a moving frame along the image edge without shrinking it", async () => {
  const onChange = vi.fn();
  const canvasRef = createRef<CropCanvasHandle>();
  render(<CropCanvas ref={canvasRef} src="/preview" alt="" aspect={null} onChange={onChange} />);
  await act(async () => fixture.sessions[0].resolve({ naturalWidth: 1000, naturalHeight: 500 }));
  act(() => { const frames = [...fixture.frames.values()]; fixture.frames.clear(); frames.forEach(frame => frame(0)); });
  act(() => canvasRef.current!.setSelection({ x: 200, y: 100, width: 300, height: 200 }, { width: 1000, height: 500 }));
  act(() => fixture.sessions[0].change(-40, 130, 300, 200));
  expect(onChange).toHaveBeenLastCalledWith({ status: "ready", selection: { x: 0, y: 130, width: 300, height: 200 }, rendition: { width: 1000, height: 500 } });
  act(() => fixture.sessions[0].change(-1, 180, 300, 200));
  expect(onChange).toHaveBeenLastCalledWith({ status: "ready", selection: { x: 0, y: 180, width: 300, height: 200 }, rendition: { width: 1000, height: 500 } });
});

it.each([false, true])("preserves the opposite corner and aspect ratio at a boundary, shift=%s", async shift => {
  const onChange = vi.fn();
  const canvasRef = createRef<CropCanvasHandle>();
  render(<CropCanvas ref={canvasRef} src="/preview" alt="" aspect={shift ? null : 1} onChange={onChange} />);
  await act(async () => fixture.sessions[0].resolve({ naturalWidth: 1000, naturalHeight: 500 }));
  act(() => { const frames = [...fixture.frames.values()]; fixture.frames.clear(); frames.forEach(frame => frame(0)); });
  act(() => canvasRef.current!.setSelection({ x: 200, y: 350, width: 100, height: 100 }, { width: 1000, height: 500 }));
  const session = fixture.sessions[0];
  act(() => {
    session.canvas.dispatchEvent(new CustomEvent("actionstart", { detail: { action: "sw-resize" } }));
    session.canvas.dispatchEvent(new CustomEvent("action", { detail: { action: "sw-resize", relatedEvent: new MouseEvent("pointermove", { shiftKey: shift }) } }));
    session.change(100, 350, 200, 200);
  });
  expect(onChange).toHaveBeenLastCalledWith({ status: "ready", selection: { x: 150, y: 350, width: 150, height: 150 }, rendition: { width: 1000, height: 500 } });
});

it("preserves the orthogonal center when a ratio-locked side resize reaches the image edge", async () => {
  const onChange = vi.fn();
  const canvasRef = createRef<CropCanvasHandle>();
  render(<CropCanvas ref={canvasRef} src="/preview" alt="" aspect={1} onChange={onChange} />);
  await act(async () => fixture.sessions[0].resolve({ naturalWidth: 1000, naturalHeight: 500 }));
  act(() => { const frames = [...fixture.frames.values()]; fixture.frames.clear(); frames.forEach(frame => frame(0)); });
  act(() => canvasRef.current!.setSelection({ x: 200, y: 20, width: 200, height: 200 }, { width: 1000, height: 500 }));
  act(() => fixture.sessions[0].change(200, -30, 300, 300));
  expect(onChange).toHaveBeenLastCalledWith({ status: "ready", selection: { x: 200, y: 0, width: 240, height: 240 }, rendition: { width: 1000, height: 500 } });
});

it("handles failure, ignores obsolete loads and clears a removed selection", async () => {
  const onChange = vi.fn();
  const canvasRef = createRef<CropCanvasHandle>();
  const mounted = render(<CropCanvas ref={canvasRef} src="/A" alt="A" aspect={null} onChange={onChange} />);
  expect(mounted.container.querySelector("[data-crop-grip]")).toBeNull();
  expect(fixture.templates[0]).toContain('theme-color="rgba(51, 51, 51, 0.5)"');
  for (const direction of ["ne", "nw", "se", "sw"]) {
    const handle = mounted.container.querySelector<HTMLElement>(`cropper-handle[action="${direction}-resize"]`)!;
    expect(handle.style.width).toBe("20px");
    expect(handle.style.height).toBe("20px");
    expect(direction.startsWith("n") ? handle.style.top : handle.style.bottom).toBe("-10px");
    expect(direction.endsWith("e") ? handle.style.right : handle.style.left).toBe("-10px");
    expect(handle.shadowRoot?.textContent).toContain("width: 8px");
    expect(handle.shadowRoot?.textContent).toContain("height: 8px");
  }
  expect(mounted.container.querySelector<HTMLElement>('cropper-handle[action="n-resize"]')!.style.height).toBe("");
  expect(mounted.container.firstElementChild?.getAttribute("data-ready")).toBe("false");
  expect(onChange).toHaveBeenLastCalledWith({ status: "loading" });
  const obsolete = fixture.sessions[0];
  mounted.rerender(<CropCanvas ref={canvasRef} src="/B" alt="B" aspect={null} onChange={onChange} />);
  expect(obsolete.destroy).toHaveBeenCalledOnce();
  await act(async () => obsolete.resolve({ naturalWidth: 1000, naturalHeight: 500 }));
  expect(fixture.frames.size).toBe(0);
  await act(async () => fixture.sessions[1].reject(new Error("unavailable")));
  expect(onChange).toHaveBeenLastCalledWith({ status: "unavailable" });
  mounted.rerender(<CropCanvas ref={canvasRef} src="/C" alt="C" aspect={null} onChange={onChange} />);
  await act(async () => fixture.sessions[2].resolve({ naturalWidth: 1000, naturalHeight: 500 }));
  act(() => {
    const frames = [...fixture.frames.values()];
    fixture.frames.clear();
    frames.forEach(frame => frame(0));
  });
  expect(onChange).toHaveBeenLastCalledWith({ status: "ready", selection: { x: 0, y: 0, width: 1000, height: 500 }, rendition: { width: 1000, height: 500 } });
  expect(mounted.container.firstElementChild?.getAttribute("data-ready")).toBe("true");
  act(() => canvasRef.current!.setSelection({ x: 100, y: 80, width: 400, height: 200 }, { width: 2000, height: 1000 }));
  expect(onChange).toHaveBeenLastCalledWith({ status: "ready", selection: { x: 50, y: 40, width: 200, height: 100 }, rendition: { width: 1000, height: 500 } });
  act(() => fixture.sessions[2].change(0, 0, 0, 0));
  expect(onChange).toHaveBeenLastCalledWith({ status: "ready", selection: null, rendition: { width: 1000, height: 500 } });
  mounted.unmount();
  const count = onChange.mock.calls.length;
  fixture.sessions[2].change(10, 10, 100, 100);
  expect(onChange).toHaveBeenCalledTimes(count);
});

it("zooms at the pointer and drag-pans without changing the crop, including a sharper rendition and fullscreen exit", async () => {
  const onChange = vi.fn();
  const canvasRef = createRef<CropCanvasHandle>();
  const props = { src: "/preview", zoomSrc: "/sharp", alt: "", aspect: null, onChange, ref: canvasRef };
  const mounted = render(<CropCanvas {...props} zoomEnabled />);
  const host = mounted.container.firstElementChild as HTMLElement;
  host.getBoundingClientRect = () => new DOMRect(0, 0, 1000, 500);
  await act(async () => fixture.sessions[0].resolve({ naturalWidth: 1000, naturalHeight: 500 }));
  act(() => { const frames = [...fixture.frames.values()]; fixture.frames.clear(); frames.forEach(frame => frame(0)); });
  const session = fixture.sessions[0];
  const grip = host.querySelector<HTMLElement>("[data-crop-grip]")!;
  expect(grip).not.toBeNull();
  expect(grip.title).toBe("Move crop frame");
  expect(grip.getAttribute("action")).toBe("move");
  expect(grip.style.width).toBe("64px");
  expect(grip.style.background).toBe("rgba(0, 0, 0, 0.35)");
  expect(grip.style.height).toBe("28px");
  expect(parseFloat(grip.style.top) + parseFloat(grip.style.height)).toBeLessThan(-8);
  act(() => canvasRef.current!.setSelection({ x: 100, y: 80, width: 400, height: 200 }, { width: 1000, height: 500 }));
  let crop = onChange.mock.calls.at(-1)![0];
  onChange.mockClear();
  fireEvent.mouseMove(host, { clientX: 100, clientY: 80 });
  fireEvent.keyDown(document.body, { key: "+" });
  expect(session.transform).toHaveBeenLastCalledWith(1.5, 0, 0, 1.5, -50, -40);
  expect(session.selection.x).toBe(100);
  expect(session.selection.y).toBe(80);
  expect(grip.style.width).toBe("64px");
  expect(session.image.src).toBe("/sharp");
  expect(onChange).not.toHaveBeenCalled();
  const transforms = session.transform.mock.calls.length;
  act(() => session.change(115, 80, 630, 300));
  crop = onChange.mock.calls.at(-1)![0];
  expect(crop.selection).toEqual({ x: 110, y: 80, width: 420, height: 200 });
  expect(session.transform).toHaveBeenCalledTimes(transforms);
  onChange.mockClear();
  expect(host.style.cursor).toBe("grab");
  let pointerTime = 100;
  const pointer = (type: string, x: number, y: number) => {
    const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 });
    Object.defineProperties(event, { pointerType: { value: "mouse" }, timeStamp: { value: pointerTime } });
    pointerTime += 16;
    fireEvent(type === "pointerdown" ? host : window, event);
  };
  pointer("pointerdown", 100, 80);
  pointer("pointermove", 140, 100);
  pointer("pointerup", 140, 100);
  expect(session.selection.x).toBe(155);
  expect(session.selection.y).toBe(100);
  Object.defineProperties(session.media, { naturalWidth: { value: 2500 }, naturalHeight: { value: 1250 } });
  fireEvent.load(session.media);
  expect(session.transform).toHaveBeenLastCalledWith(0.6, 0, 0, 0.6, -10, -20);
  expect(onChange).not.toHaveBeenCalled();
  expect(fixture.frames.size).toBe(1);
  const momentumFrames = [...fixture.frames.values()]; fixture.frames.clear();
  act(() => momentumFrames.forEach(frame => frame(performance.now() + 16)));
  expect(session.selection.x).toBeGreaterThan(155);
  expect(onChange).not.toHaveBeenCalled();
  mounted.rerender(<CropCanvas {...props} zoomEnabled={false} />);
  expect(fixture.frames.size).toBe(0);
  expect(host.querySelector("[data-crop-grip]")).toBeNull();
  expect(session.selection).toMatchObject(crop.selection);
  fireEvent.wheel(host, { deltaY: -100, clientX: 100, clientY: 80 });
  expect(session.selection).toMatchObject(crop.selection);
  expect(onChange).not.toHaveBeenCalled();
  expect(fixture.sessions).toHaveLength(1);
});

it("navigates the mobile viewport without editing the crop or handing a remaining finger back to Cropper", async () => {
  const onChange = vi.fn();
  const onZoomChange = vi.fn();
  const canvasRef = createRef<CropCanvasHandle>();
  const props = { ref: canvasRef, src: "/preview", zoomSrc: "/sharp", alt: "", aspect: null, onChange, onZoomChange, touchEnabled: true };
  const mounted = render(<CropCanvas {...props} />);
  const host = mounted.container.firstElementChild as HTMLElement;
  const flush = () => act(() => {
    const frames = [...fixture.frames.values()]; fixture.frames.clear(); frames.forEach(frame => frame(0));
  });
  await act(async () => fixture.sessions[0].resolve({ naturalWidth: 1000, naturalHeight: 500 }));
  flush();
  const session = fixture.sessions[0];
  act(() => canvasRef.current!.setSelection({ x: 400, y: 200, width: 100, height: 100 }, { width: 1000, height: 500 }));
  onChange.mockClear();
  onZoomChange.mockClear();
  const touch = (type: string, pointerId: number, clientX: number, clientY = 250) => {
    const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX, clientY });
    Object.defineProperties(event, { pointerType: { value: "touch" }, pointerId: { value: pointerId } });
    fireEvent(type === "pointerdown" ? host : window, event);
  };
  const cropAction = () => {
    const event = new CustomEvent("actionstart", { bubbles: true, cancelable: true });
    session.canvas.dispatchEvent(event);
    return event.defaultPrevented;
  };
  touch("pointerdown", 1, 400);
  expect(cropAction()).toBe(false);
  touch("pointerdown", 2, 600);
  expect(cropAction()).toBe(true);
  touch("pointermove", 1, 300);
  touch("pointermove", 2, 700);
  flush();
  expect(session.transform).toHaveBeenLastCalledWith(2, 0, 0, 2, -500, -250);
  expect(session.image.src).toBe("/sharp");
  expect(session.selection).toMatchObject({ x: 300, y: 150, width: 200, height: 200 });
  touch("pointermove", 1, 360);
  touch("pointermove", 2, 760);
  flush();
  expect(session.transform).toHaveBeenLastCalledWith(2, 0, 0, 2, -440, -250);
  touch("pointerup", 2, 760);
  const count = session.transform.mock.calls.length;
  touch("pointermove", 1, 500);
  flush();
  expect(session.transform).toHaveBeenCalledTimes(count);
  expect(cropAction()).toBe(true);
  touch("pointerup", 1, 500);
  expect(cropAction()).toBe(false);
  expect(onChange).not.toHaveBeenCalled();
  expect(onZoomChange.mock.calls).toEqual([[true]]);
  mounted.rerender(<CropCanvas {...props} panMode />);
  touch("pointerdown", 3, 500);
  expect(cropAction()).toBe(true);
  touch("pointermove", 3, 540);
  flush();
  expect(session.transform).toHaveBeenLastCalledWith(2, 0, 0, 2, -400, -250);
  touch("pointerup", 3, 540);
  act(() => canvasRef.current!.resetView());
  expect(onZoomChange.mock.calls).toEqual([[true], [false]]);
  mounted.rerender(<CropCanvas {...props} />);
  expect(session.selection).toMatchObject({ x: 400, y: 200, width: 100, height: 100 });
  expect(onChange).not.toHaveBeenCalled();
  touch("pointerdown", 4, 400);
  touch("pointerdown", 5, 600);
  session.transform.mockClear();
  touch("pointermove", 4, 450);
  touch("pointermove", 5, 550);
  flush();
  expect(session.transform).toHaveBeenCalledExactlyOnceWith(1, 0, 0, 1, 0, 0);
  touch("pointerup", 5, 550);
  touch("pointerup", 4, 450);
  expect(onChange).not.toHaveBeenCalled();
  expect(session.selection.querySelector<HTMLElement>('cropper-handle[action="ne-resize"]')!.style.width).toBe("44px");
  act(() => canvasRef.current!.setSelection({ x: 400, y: 200, width: 20, height: 20 }, { width: 1000, height: 500 }));
  const smallCorner = session.selection.querySelector<HTMLElement>('cropper-handle[action="ne-resize"]')!;
  expect(parseFloat(smallCorner.style.width)).toBeLessThan(session.selection.width);
  expect(parseFloat(smallCorner.style.height)).toBeLessThan(session.selection.height);
  mounted.rerender(<CropCanvas {...props} aspect={1} />);
  expect(session.transform).toHaveBeenLastCalledWith(1, 0, 0, 1, 0, 0);
  expect(onChange).toHaveBeenLastCalledWith({ status: "ready", selection: { x: 250, y: 0, width: 500, height: 500 }, rendition: { width: 1000, height: 500 } });
  mounted.unmount();
  expect(fixture.frames.size).toBe(0);
});

it("cancels mobile navigation on interrupted or outside contacts and removes queued work on teardown", () => {
  const host = document.createElement("div");
  document.body.append(host);
  const viewport = { getZoom: () => 2, zoomAt: vi.fn(), panBy: vi.fn(() => ({ dx: 0, dy: 0 })), resetView: vi.fn() };
  const unbind = bindCropTouchViewport(host, viewport, vi.fn(), () => false);
  const touch = (type: string, pointerId: number, target: EventTarget = host) => {
    const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: pointerId * 100, clientY: 200 });
    Object.defineProperties(event, { pointerType: { value: "touch" }, pointerId: { value: pointerId } });
    target.dispatchEvent(event);
  };
  touch("pointerdown", 1);
  touch("pointerdown", 2, document.body);
  touch("pointermove", 1);
  expect(fixture.frames.size).toBe(0);
  touch("pointerup", 2);
  touch("pointerup", 1);
  touch("pointerdown", 3);
  touch("pointerdown", 4);
  touch("pointermove", 3);
  expect(fixture.frames.size).toBe(1);
  touch("pointercancel", 4);
  expect(fixture.frames.size).toBe(0);
  touch("pointermove", 3);
  expect(fixture.frames.size).toBe(0);
  touch("pointerup", 3);
  touch("pointerdown", 5);
  touch("pointerdown", 6);
  touch("pointermove", 5);
  expect(fixture.frames.size).toBe(1);
  unbind();
  expect(fixture.frames.size).toBe(0);
  touch("pointermove", 6);
  expect(fixture.frames.size).toBe(0);
  expect(viewport.zoomAt).not.toHaveBeenCalled();
  host.remove();
});

it("retains the crop when the sharper source fails and does not request it again", async () => {
  const onChange = vi.fn();
  const props = { src: "/preview", zoomSrc: "/sharp", alt: "", aspect: null, onChange };
  const mounted = render(<CropCanvas {...props} zoomEnabled />);
  const host = mounted.container.firstElementChild as HTMLElement;
  await act(async () => fixture.sessions[0].resolve({ naturalWidth: 1000, naturalHeight: 500 }));
  act(() => { const frames = [...fixture.frames.values()]; fixture.frames.clear(); frames.forEach(frame => frame(0)); });
  onChange.mockClear();
  const session = fixture.sessions[0];
  fireEvent.wheel(host, { deltaY: -100, clientX: 500, clientY: 250 });
  expect(session.image.src).toBe("/sharp");
  fireEvent.error(session.media);
  expect(session.image.src).toBe("/preview");
  mounted.rerender(<CropCanvas {...props} zoomEnabled={false} />);
  mounted.rerender(<CropCanvas {...props} zoomEnabled />);
  fireEvent.wheel(host, { deltaY: -100, clientX: 500, clientY: 250 });
  expect(session.image.src).toBe("/preview");
  expect(onChange).not.toHaveBeenCalled();
  act(() => session.change(0, 0, 0, 0));
  expect(onChange).toHaveBeenLastCalledWith({ status: "ready", selection: null, rendition: { width: 1000, height: 500 } });
  onChange.mockClear();
  fireEvent.keyDown(document.body, { key: "0" });
  mounted.rerender(<CropCanvas {...props} zoomEnabled={false} />);
  expect(onChange).not.toHaveBeenCalled();
});

it("coasts after a hand drag but cancels inertia before crop editing, zoom or teardown", () => {
  const host = document.createElement("div");
  host.tabIndex = -1;
  const edge = document.createElement("cropper-handle");
  edge.setAttribute("action", "e-resize");
  host.append(edge);
  document.body.append(host);
  const viewport = { getZoom: () => 2, panBy: vi.fn((dx: number, dy: number) => ({ dx, dy })), zoomAt: vi.fn(), resetView: vi.fn() };
  const unbind = bindCropViewport(host, viewport);
  let time = 100;
  const pointer = (type: string, x: number, target: HTMLElement = host) => {
    const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: 100, button: 0 });
    Object.defineProperties(event, { pointerType: { value: "mouse" }, timeStamp: { value: time } });
    time += 16;
    fireEvent(type === "pointerdown" ? target : window, event);
  };
  const drag = () => {
    pointer("pointerdown", 100);
    pointer("pointermove", 140);
    pointer("pointerup", 140);
  };
  try {
    drag();
    expect(fixture.frames.size).toBe(1);
    const frames = [...fixture.frames.values()]; fixture.frames.clear();
    frames.forEach(frame => frame(performance.now() + 16));
    expect(viewport.panBy).toHaveBeenCalledTimes(2);
    expect(viewport.panBy.mock.calls[1][0]).toBeGreaterThan(0);
    expect(fixture.frames.size).toBe(1);
    pointer("pointerdown", 140, edge);
    expect(fixture.frames.size).toBe(0);
    pointer("pointerup", 140);
    drag();
    fireEvent.wheel(host, { deltaY: -100, clientX: 100, clientY: 100 });
    expect(fixture.frames.size).toBe(0);
    expect(viewport.zoomAt).toHaveBeenCalledOnce();
    drag();
    viewport.panBy.mockReturnValueOnce({ dx: 0, dy: 0 });
    const edgeFrames = [...fixture.frames.values()]; fixture.frames.clear();
    edgeFrames.forEach(frame => frame(performance.now() + 16));
    expect(fixture.frames.size).toBe(0);
    drag();
    unbind();
    expect(fixture.frames.size).toBe(0);
  } finally { unbind(); host.remove(); }
});

it("reserves edges/corners and Alt-drag for crop edits, suppresses their clicks and restores fullscreen navigation keys", () => {
  const host = document.createElement("div");
  host.tabIndex = -1;
  host.getBoundingClientRect = () => new DOMRect(0, 0, 1000, 500);
  const selection = document.createElement("cropper-selection");
  const move = document.createElement("cropper-handle");
  move.setAttribute("action", "move");
  const grip = document.createElement("cropper-handle");
  grip.setAttribute("action", "move");
  grip.dataset.cropGrip = "";
  grip.title = "Move crop frame";
  grip.style.cursor = "move";
  selection.append(move, grip); host.append(selection); document.body.append(host);
  let zoom = 1;
  const viewport = { getZoom: () => zoom, zoomAt: vi.fn((factor: number) => { zoom *= factor; }),
    resetView: vi.fn(() => { zoom = 1; }), panBy: vi.fn((dx: number, dy: number) => ({ dx, dy })) };
  let panMode = true;
  const altChanged = vi.fn();
  const unbind = bindCropViewport(host, viewport, () => panMode, altChanged);
  const pointer = (type: string, target: Element, altKey = false, x = 100) => {
    const event = new MouseEvent(type, { bubbles: true, composed: true, cancelable: true, button: 0, clientX: x, clientY: 80, altKey });
    Object.defineProperty(event, "pointerType", { value: "mouse" });
    fireEvent(target, event);
    return event.defaultPrevented;
  };
  try {
    expect(pointer("pointerdown", move)).toBe(true);
    pointer("pointerup", move);
    fireEvent.click(move, { clientX: 100, clientY: 80 });
    expect(viewport.zoomAt).toHaveBeenLastCalledWith(3, 100, 80);
    fireEvent.click(move, { clientX: 100, clientY: 80 });
    expect(viewport.resetView).toHaveBeenCalledOnce();
    viewport.zoomAt.mockClear();
    for (const direction of ["n", "e", "s", "w", "ne", "nw", "se", "sw"]) {
      const handle = document.createElement("cropper-handle");
      handle.setAttribute("action", `${direction}-resize`); selection.append(handle);
      expect(pointer("pointerdown", handle)).toBe(false);
      pointer("pointerup", handle);
      fireEvent.click(handle);
      handle.remove();
    }
    expect(pointer("pointerdown", move, true)).toBe(false);
    pointer("pointerup", move, true);
    fireEvent.click(move);
    panMode = false;
    fireEvent.keyDown(window, { key: "Alt", altKey: true });
    expect(pointer("pointerdown", move, true)).toBe(true);
    expect(move.style.cursor).toBe("grabbing");
    expect(altChanged).toHaveBeenLastCalledWith(true);
    pointer("pointerup", move, true);
    fireEvent.keyUp(window, { key: "Alt", altKey: false });
    expect(altChanged).toHaveBeenLastCalledWith(false);
    expect(pointer("pointerdown", move)).toBe(false);
    pointer("pointerup", move);
    panMode = true;
    fireEvent.keyDown(window, { key: "Alt", altKey: true });
    fireEvent.blur(window);
    expect(altChanged).toHaveBeenLastCalledWith(false);
    expect(pointer("pointerdown", grip)).toBe(false);
    pointer("pointerup", grip);
    fireEvent.click(grip);
    expect(grip.style.cursor).toBe("move");
    expect(grip.title).toBe("Move crop frame");
    const gripKey = new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true, cancelable: true });
    fireEvent(grip, gripKey);
    expect(gripKey.defaultPrevented).toBe(false);
    expect(viewport.panBy).not.toHaveBeenCalled();
    expect(viewport.zoomAt).not.toHaveBeenCalled();
    expect(pointer("pointerdown", move)).toBe(true);
    pointer("pointermove", move, false, 120);
    pointer("pointerup", move, false, 120);
    fireEvent.click(move);
    expect(viewport.zoomAt).not.toHaveBeenCalled();
    fireEvent.mouseMove(host, { clientX: 100, clientY: 80 });
    fireEvent.keyDown(document.body, { key: " ", code: "Space" });
    expect(viewport.zoomAt).toHaveBeenLastCalledWith(3, 100, 80);
    const cameraKey = new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true, cancelable: true });
    fireEvent(document.body, cameraKey);
    expect(cameraKey.defaultPrevented).toBe(true);
    expect(viewport.panBy).toHaveBeenLastCalledWith(-250, 0, 0.05);
    fireEvent.keyDown(document.body, { key: "Home", shiftKey: true });
    expect(viewport.panBy).toHaveBeenLastCalledWith(-1e6, 1e6, 0.05);
    fireEvent.keyDown(document.body, { key: "0" });
    expect(zoom).toBe(1);
  } finally { unbind(); host.remove(); }
});

it("allows initial-fit panning to the same overscroll allowance without changing the crop", async () => {
  const onChange = vi.fn();
  const mounted = render(<CropCanvas src="/preview" alt="" aspect={null} onChange={onChange} zoomEnabled />);
  const host = mounted.container.firstElementChild as HTMLElement;
  await act(async () => fixture.sessions[0].resolve({ naturalWidth: 1000, naturalHeight: 500 }));
  act(() => { const frames = [...fixture.frames.values()]; fixture.frames.clear(); frames.forEach(frame => frame(0)); });
  onChange.mockClear();
  const session = fixture.sessions[0];
  const pointer = (type: string, position: number) => {
    const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: position, clientY: position, button: 0 });
    Object.defineProperty(event, "pointerType", { value: "mouse" });
    fireEvent(type === "pointerdown" ? host : window, event);
  };
  pointer("pointerdown", 0);
  pointer("pointermove", 2000);
  expect(session.transform).toHaveBeenLastCalledWith(1, 0, 0, 1, 125, 125);
  pointer("pointermove", -2000);
  expect(session.transform).toHaveBeenLastCalledWith(1, 0, 0, 1, -125, -125);
  pointer("pointerup", -2000);
  fireEvent.keyDown(document.body, { key: "0" });
  expect(session.transform).toHaveBeenLastCalledWith(1, 0, 0, 1, 0, 0);
  expect(onChange).not.toHaveBeenCalled();
});