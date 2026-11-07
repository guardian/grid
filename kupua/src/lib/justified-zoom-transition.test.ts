// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createJustifiedZoomTransition, MAX_ZOOM_PIXELS, MAX_ZOOM_TILES, type JustifiedZoomTransition } from "./justified-zoom-transition";
import { justifiedRowScale } from "./results-zoom";
import * as morphRenderer from "./justified-zoom-morph-renderer";

const createRenderer = morphRenderer.createMorphRenderer;
const draws = vi.fn<(progress: number) => void>();

function rect(x: number, y: number, width: number, height: number): DOMRect {
  return { x, y, left: x, top: y, width, height, right: x + width, bottom: y + height, toJSON: () => ({}) };
}

function fixture(count = 8, width = 400, height = 600, echoStoreChanges = false, scale = (n: number) => 1.4 ** n) {
  const element = document.createElement("div");
  document.body.appendChild(element);
  element.getBoundingClientRect = vi.fn(() => rect(0, 80, width, height));
  Object.defineProperties(element, { clientWidth: { value: width }, clientHeight: { value: height } });
  const reads = vi.fn(() => rect(0, 80, 100, 100));
  for (let index = 0; index < count; index++) {
    const cell = document.createElement("div");
    cell.dataset.gridCell = "";
    cell.dataset.imageId = `fixture-${index}`;
    cell.getBoundingClientRect = reads;
    const image = document.createElement("img");
    image.src = "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg'/>";
    image.className = "w-full h-full object-contain";
    cell.appendChild(image);
    element.appendChild(cell);
  }
  let offset = 0;
  let previewOffset: number | null = null;
  let transition: JustifiedZoomTransition;
  const preview = vi.fn((next: number | null) => { previewOffset = next; transition.layout(next ?? offset); });
  const commit = vi.fn((next: number) => {
    const previous = offset;
    offset = next;
    if (echoStoreChanges && previous !== next && previewOffset !== next) transition.external(next, previous);
  });
  transition = createJustifiedZoomTransition({ element, offset: () => offset, range: () => [-2, 2], scale, preview, commit });
  return { element, reads, transition, preview, commit, offset: () => offset, previewOffset: () => previewOffset };
}

const frames = (count = 1) => { for (let n = 0; n < count; n++) vi.advanceTimersByTime(17); };
const overlay = () => document.querySelector<HTMLElement>("[data-justified-zoom-preview]");
const progress = () => !overlay() ? undefined
  : overlay()?.querySelector("[data-zoom-morph-renderer=dom]") ? draws.mock.lastCall?.[0] ?? 0 : 0;

beforeEach(() => {
  vi.useFakeTimers();
  draws.mockClear();
  vi.spyOn(morphRenderer, "createMorphRenderer").mockImplementation((...args) => {
    const renderer = createRenderer(...args);
    if (renderer) {
      const draw = renderer.draw;
      renderer.draw = progress => { draws(progress); draw(progress); };
    }
    return renderer;
  });
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false })));
  vi.stubGlobal("devicePixelRatio", 2);
  vi.spyOn(HTMLImageElement.prototype, "complete", "get").mockReturnValue(true);
  vi.spyOn(HTMLImageElement.prototype, "naturalWidth", "get").mockReturnValue(100);
  vi.spyOn(HTMLImageElement.prototype, "naturalHeight", "get").mockReturnValue(100);
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
  window.history.replaceState({}, "", "/");
});

describe("default Justified DOM tile transition", () => {
  it.each([296, 360, 400, 1280])("uses the same dead-zone-subtracted gain at %ipx", width => {
    const f = fixture(4, width, 600, false, n => justifiedRowScale(n, width));
    f.transition.begin(width / 2, 350);
    f.transition.update(1.036);
    frames(12);
    const expanded = Number(progress());
    const expected = (Math.log(1.036) - Math.log(1.035)) / (Math.log(1.30) - Math.log(1.035));
    expect(expanded).toBeCloseTo(expected, 3);
    expect(f.commit).not.toHaveBeenCalled();
    f.transition.dispose();
    f.element.remove();
    const reverse = fixture(4, width, 600, false, n => justifiedRowScale(n, width));
    reverse.transition.begin(width / 2, 350);
    reverse.transition.update(1 / 1.036);
    frames(12);
    expect(Number(progress())).toBeCloseTo(expanded, 3);
    reverse.transition.dispose();
  });

  it("stages one neighbour, follows the fingers without layout reads, then commits once", () => {
    const f = fixture();
    f.transition.begin(200, 350);
    f.transition.update(0.8);
    frames(5);
    expect(f.previewOffset()).toBe(-1);
    expect(f.offset()).toBe(0);
    expect(overlay()?.querySelector("[data-zoom-morph-renderer=dom]")).not.toBeNull();
    const reads = f.reads.mock.calls.length;
    const clones = overlay()?.querySelectorAll("img").length;
    for (let n = 0; n < 100; n++) f.transition.update(0.81 - n * 0.0001);
    frames();
    expect(f.reads).toHaveBeenCalledTimes(reads);
    expect(overlay()?.querySelectorAll("img")).toHaveLength(clones!);
    const p = Number(progress());
    expect(p).toBeGreaterThan(0);
    expect(p).toBeLessThan(1);
    expect(f.preview).toHaveBeenCalledTimes(1);
    f.transition.end();
    frames();
    vi.advanceTimersByTime(180);
    frames();
    expect(f.commit).toHaveBeenCalledExactlyOnceWith(-1);
    expect(f.previewOffset()).toBeNull();
    expect(overlay()).toBeNull();
    expect(f.element.style.transform).toBe("");
    f.transition.dispose();
  });

  it("keeps semantic commit ownership even when fast-release visuals clear first", () => {
    const f = fixture(8, 400, 600, true);
    f.transition.begin(200, 350);
    f.transition.update(0.8);
    f.transition.end();
    frames(6);
    expect(f.offset()).toBe(-1);
    expect(f.commit).toHaveBeenCalledTimes(1);
    expect(overlay()).toBeNull();
    expect(f.previewOffset()).toBeNull();
    f.transition.dispose();
  });

  it("unwinds a cancelled or sub-threshold pinch without changing the stored zoom", () => {
    for (const cancelled of [false, true]) {
      const f = fixture();
      f.transition.begin(200, 350);
      f.transition.update(0.8);
      frames(3);
      f.transition.update(cancelled ? 0.8 : 0.97);
      frames();
      f.transition.end(cancelled);
      frames();
      vi.advanceTimersByTime(180);
      frames();
      expect(f.offset()).toBe(0);
      expect(f.previewOffset()).toBeNull();
      expect(overlay()).toBeNull();
      f.transition.dispose();
      f.element.remove();
    }
  });

  it("does no packing or snapshotting for a wobble, and handles release before preparation", () => {
    const f = fixture();
    f.transition.begin(200, 350);
    f.transition.update(0.99);
    expect(f.reads).not.toHaveBeenCalled();
    f.transition.end();
    expect(overlay()).toBeNull();
    f.transition.begin(200, 350);
    f.transition.update(0.8);
    f.transition.end(true);
    frames(4);
    expect(overlay()).toBeNull();
    expect(f.previewOffset()).toBeNull();
    expect(f.offset()).toBe(0);
    f.transition.dispose();
  });

  it("bounds cleanup when React coalesces a cancelled staged layout without an acknowledgement", () => {
    const f = fixture();
    f.transition.begin(200, 350);
    f.transition.update(0.8);
    frames();
    vi.spyOn(f.transition, "layout").mockImplementation(() => {});
    f.transition.end(true);
    expect(f.offset()).toBe(0);
    frames(60);
    expect(overlay()).toBeNull();
    expect(f.previewOffset()).toBeNull();
    f.transition.dispose();
  });

  it("keeps neutral in the shared base pose and arms reversal after its preview dead zone", () => {
    const f = fixture();
    f.transition.begin(200, 350);
    f.transition.update(0.8);
    frames(10);
    f.transition.update(1.02);
    frames(8);
    expect(f.preview).toHaveBeenCalledTimes(1);
    expect(progress()).toBe(0);
    f.transition.update(1.04);
    frames(3);
    expect(f.previewOffset()).toBe(1);
    expect(f.commit).not.toHaveBeenCalled();
    f.transition.update(1.3);
    frames(3);
    expect(f.previewOffset()).toBe(1);
    f.transition.end();
    frames();
    vi.advanceTimersByTime(180);
    frames();
    expect(f.offset()).toBe(1);
    expect(overlay()).toBeNull();
    f.transition.dispose();
  });

  it("keeps the source cover and tile renderer decorative", () => {
    const f = fixture();
    f.transition.begin(200, 350);
    f.transition.update(0.8);
    frames(3);
    expect(overlay()?.getAttribute("aria-hidden")).toBe("true");
    expect(overlay()?.inert).toBe(true);
    expect(overlay()?.querySelector("[data-image-id]")).toBeNull();
    for (const image of overlay()!.querySelectorAll("img")) {
      expect(image.alt).toBe("");
    }
    f.transition.dispose();
    expect(overlay()).toBeNull();
    expect(f.previewOffset()).toBeNull();
  });

  it("declines protected media without exposing pixels or substituting another animation", () => {
    const f = fixture();
    const image = f.element.querySelector("img")!;
    image.classList.add("blur-lg");
    f.transition.begin(200, 350);
    f.transition.update(0.8);
    frames(5);
    expect(overlay()).toBeNull();
    expect(f.preview).not.toHaveBeenCalled();
    expect(image.classList.contains("blur-lg")).toBe(true);
    f.transition.end();
    expect(f.offset()).toBe(-1);
    expect(f.commit).toHaveBeenCalledTimes(1);
    f.transition.dispose();
  });

  it("bounds tile and raster work, falling back to the normal anchored step", () => {
    const f = fixture(MAX_ZOOM_TILES + 1);
    f.transition.begin(200, 350);
    f.transition.update(0.8);
    frames(3);
    expect(overlay()).toBeNull();
    expect(f.preview).not.toHaveBeenCalled();
    f.transition.end();
    expect(f.offset()).toBe(-1);
    f.transition.dispose();
    f.element.remove();
    const large = fixture(8, MAX_ZOOM_PIXELS, 1000);
    large.transition.begin(200, 350);
    large.transition.update(0.8);
    expect(large.reads).not.toHaveBeenCalled();
    expect(overlay()).toBeNull();
    large.transition.end();
    expect(large.offset()).toBe(-1);
    large.transition.dispose();
  });

  it("admits a dense 2560×1440 CSS viewport at 2× without per-frame tile work", () => {
    const f = fixture(300, 2560, 1440);
    f.transition.begin(1280, 720);
    f.transition.update(0.8);
    frames(3);
    const renderer = overlay()?.querySelector("[data-zoom-morph-renderer=dom]");
    expect(renderer?.children).toHaveLength(300);
    const reads = f.reads.mock.calls.length;
    const clones = overlay()!.querySelectorAll("img").length;
    for (let n = 0; n < 10; n++) { f.transition.update(0.81); frames(); }
    expect(f.reads).toHaveBeenCalledTimes(reads);
    expect(overlay()!.querySelectorAll("img")).toHaveLength(clones);
    expect(clones).toBeLessThanOrEqual(MAX_ZOOM_TILES * 3);
    f.transition.dispose();
  });

  it("skips visual layers for reduced motion or unavailable cached bitmaps", () => {
    const f = fixture();
    vi.mocked(matchMedia).mockReturnValue({ matches: true } as MediaQueryList);
    f.transition.begin(200, 350);
    f.transition.update(0.8);
    f.transition.end();
    expect(f.offset()).toBe(-1);
    expect(f.reads).not.toHaveBeenCalled();
    expect(overlay()).toBeNull();
    f.transition.dispose();
    vi.mocked(matchMedia).mockReturnValue({ matches: false } as MediaQueryList);
    const pending = fixture();
    pending.transition.begin(200, 350);
    pending.transition.update(0.8);
    vi.spyOn(HTMLImageElement.prototype, "complete", "get").mockReturnValue(false);
    frames();
    expect(overlay()).toBeNull();
    expect(pending.previewOffset()).toBeNull();
    pending.transition.end();
    expect(pending.offset()).toBe(-1);
    pending.transition.dispose();
  });

  it("declines snapshots with already-loading thumbnails instead of covering them with blank tiles", () => {
    const f = fixture();
    vi.spyOn(HTMLImageElement.prototype, "complete", "get").mockReturnValue(false);
    f.transition.begin(200, 350);
    f.transition.update(0.8);
    expect(overlay()).toBeNull();
    expect(f.preview).not.toHaveBeenCalled();
    f.transition.end();
    expect(f.offset()).toBe(-1);
    f.transition.dispose();
  });

  it("ignores unloaded margin images but still declines a partially visible unloaded image", () => {
    const f = fixture(2);
    const cell = f.element.querySelectorAll<HTMLElement>("[data-grid-cell]")[1];
    cell.getBoundingClientRect = () => rect(0, 30, 100, 40);
    Object.defineProperty(cell.querySelector("img")!, "complete", { configurable: true, value: false });
    f.commit(-1);
    f.transition.external(-1, 0);
    frames(4);
    expect(overlay()?.querySelector("[data-zoom-morph-renderer=dom]")).toBeTruthy();
    expect(draws).toHaveBeenCalled();
    frames(12);
    expect(overlay()).toBeNull();
    expect(f.offset()).toBe(-1);

    cell.getBoundingClientRect = () => rect(0, 60, 100, 40);
    f.commit(0);
    f.transition.external(0, -1);
    frames(4);
    expect(overlay()).toBeNull();
    expect(f.offset()).toBe(0);
    f.transition.dispose();
  });

  it("keeps the source covered until a declined destination has been restored", () => {
    const f = fixture();
    const layout = f.transition.layout;
    let restore: (() => void) | undefined;
    vi.spyOn(f.transition, "layout").mockImplementation(offset => {
      if (offset === 0) restore = () => layout(offset);
      else layout(offset);
    });
    f.transition.begin(200, 350);
    f.transition.update(0.8);
    frames();
    const cell = f.element.querySelector<HTMLElement>("[data-grid-cell]")!;
    cell.dataset.imageId = "uncached-destination";
    const image = cell.querySelector("img")!;
    Object.defineProperty(image, "complete", { configurable: true, value: false });
    frames(3);
    image.dispatchEvent(new Event("error"));
    expect(f.previewOffset()).toBeNull();
    expect(overlay()?.style.visibility).toBe("visible");
    expect(overlay()?.querySelector<HTMLElement>("[data-zoom-source]")?.style.visibility).not.toBe("hidden");
    cell.dataset.imageId = "fixture-0";
    restore!();
    frames();
    expect(overlay()).toBeNull();
    f.transition.end();
    expect(f.commit).toHaveBeenCalledExactlyOnceWith(-1);
    f.transition.dispose();
  });

  it.each([false, true])("keeps destination loading pending until load or release (release first: %s)", releaseFirst => {
    const f = fixture();
    f.transition.begin(200, 350);
    f.transition.update(0.8);
    frames();
    const cell = f.element.querySelector<HTMLElement>("[data-grid-cell]")!;
    cell.dataset.imageId = "uncached-destination";
    const image = cell.querySelector("img")!;
    Object.defineProperty(image, "complete", { configurable: true, value: false });
    const removeListener = vi.spyOn(image, "removeEventListener");
    frames(3);
    expect(f.previewOffset()).toBe(-1);
    expect(overlay()?.style.visibility).toBe("visible");
    expect(f.commit).not.toHaveBeenCalled();
    const reads = f.reads.mock.calls.length;
    f.transition.update(0.77);
    frames(10);
    expect(f.reads).toHaveBeenCalledTimes(reads);
    if (releaseFirst) f.transition.end();
    Object.defineProperty(image, "complete", { configurable: true, value: true });
    image.dispatchEvent(new Event("load"));
    frames(4);
    expect(removeListener).toHaveBeenCalledWith("load", expect.any(Function));
    expect(removeListener).toHaveBeenCalledWith("error", expect.any(Function));
    if (!releaseFirst) {
      expect(overlay()?.querySelector<HTMLElement>("[data-zoom-morph-renderer=dom]")?.style.visibility).toBe("visible");
      expect(f.commit).not.toHaveBeenCalled();
      f.transition.end();
    }
    frames(60);
    expect(f.commit).toHaveBeenCalledExactlyOnceWith(-1);
    expect(f.previewOffset()).toBeNull();
    expect(overlay()).toBeNull();
    f.transition.dispose();
  });

  it("uses an unanimated step when DOM renderer clones are not ready", () => {
    const f = fixture();
    vi.spyOn(HTMLImageElement.prototype, "complete", "get").mockImplementation(function (this: HTMLImageElement) {
      return !this.closest("[data-zoom-morph-renderer]");
    });
    f.transition.begin(200, 350);
    f.transition.update(0.8);
    frames(5);
    expect(overlay()).toBeNull();
    expect(f.previewOffset()).toBeNull();
    expect(f.offset()).toBe(0);
    f.transition.end();
    expect(f.commit).toHaveBeenCalledExactlyOnceWith(-1);
    expect(overlay()).toBeNull();
    f.transition.dispose();
  });

  it("preserves intentionally thumbnail-less cells", () => {
    const f = fixture();
    f.element.querySelector("img")!.remove();
    f.transition.begin(200, 350);
    f.transition.update(0.8);
    frames(3);
    expect(overlay()).not.toBeNull();
    f.transition.dispose();
  });

  it("animates keyboard/menu changes and cancels outstanding work on disposal", () => {
    const f = fixture();
    f.commit(-2);
    f.transition.external(-2, 0);
    frames(4);
    vi.advanceTimersByTime(180);
    frames();
    expect(f.offset()).toBe(-2);
    expect(f.previewOffset()).toBeNull();
    expect(overlay()).toBeNull();
    f.transition.begin(200, 350);
    f.transition.update(1.3);
    frames(3);
    f.transition.end();
    f.transition.dispose();
    vi.advanceTimersByTime(500);
    expect(overlay()).toBeNull();
    expect(f.offset()).toBe(-1);
  });

  it("commits on release and accepts an immediate reverse pinch during visual settling", () => {
    const f = fixture();
    f.transition.begin(200, 350);
    f.transition.update(0.8);
    frames(3);
    f.transition.end();
    expect(f.offset()).toBe(-1);
    expect(f.commit).toHaveBeenCalledTimes(1);
    f.transition.begin(200, 350);
    f.transition.update(1.3);
    frames(3);
    f.transition.end();
    expect(f.offset()).toBe(0);
    expect(f.commit).toHaveBeenCalledTimes(2);
    frames();
    vi.advanceTimersByTime(180);
    expect(overlay()).toBeNull();
    f.transition.dispose();
  });
});

function geometryFixture(width = 400, echoStoreChanges = false) {
  const f = fixture(4, width, 600, echoStoreChanges, n => justifiedRowScale(n, width));
  f.element.querySelectorAll<HTMLElement>("[data-grid-cell]").forEach((cell, index) => {
    cell.getBoundingClientRect = vi.fn(() => rect((index % 2) * 102, 80 + Math.floor(index / 2) * 102, 100, 100));
  });
  return f;
}

describe("tile morph continuity", () => {
  it("holds the unchanged source pose through tile activation, then catches up in bounded frames", () => {
    const f = geometryFixture(296);
    f.transition.begin(100, 150);
    f.transition.update(0.8);
    frames();
    expect(progress()).toBe(0);
    const source = overlay()?.querySelector<HTMLElement>("[data-zoom-source]");
    expect(source?.style.transform).toBe("");
    expect(source?.style.opacity).toBe("");
    frames(2);
    expect(overlay()?.querySelector<HTMLElement>("[data-zoom-morph-renderer=dom]")?.style.visibility).toBe("visible");
    expect(progress()).toBe(0);
    const reads = Array.from(f.element.querySelectorAll<HTMLElement>("[data-grid-cell]"), cell => vi.mocked(cell.getBoundingClientRect));
    const readCounts = reads.map(read => read.mock.calls.length);
    const nodes = overlay()!.querySelectorAll("*").length;
    let previous = 0;
    for (let frame = 0; frame < 12; frame++) {
      frames();
      const p = Number(progress());
      expect(p).toBeGreaterThanOrEqual(previous);
      expect(p - previous).toBeLessThanOrEqual(0.181);
      previous = p;
    }
    expect(previous).toBeCloseTo((Math.abs(Math.log(0.8)) - Math.log(1.035)) / (Math.log(1.30) - Math.log(1.035)), 3);
    reads.forEach((read, index) => expect(read).toHaveBeenCalledTimes(readCounts[index]));
    expect(overlay()!.querySelectorAll("*")).toHaveLength(nodes);
    expect(f.commit).not.toHaveBeenCalled();
    f.transition.dispose();
  });

  it.each([false, true])("skips unchanged poses and zero-distance settling with cancellation=%s", cancelled => {
    const f = geometryFixture(296);
    f.transition.begin(100, 150);
    f.transition.update(1.3);
    frames(20);
    if (cancelled) { f.transition.update(1); frames(20); }
    expect(progress()).toBe(cancelled ? 0 : 1);
    const count = draws.mock.calls.length;
    for (let n = 0; n < 5; n++) {
      f.transition.update(cancelled ? 1 : 1.5);
      frames(2);
    }
    expect(draws).toHaveBeenCalledTimes(count);
    f.transition.end(cancelled);
    expect(f.commit).toHaveBeenCalledExactlyOnceWith(cancelled ? 0 : 1);
    expect(overlay()).not.toBeNull();
    frames();
    expect(draws).toHaveBeenCalledTimes(count);
    expect(overlay()).toBeNull();
    f.transition.dispose();
  });

  it("crosses the common source pose before preparing an opposite neighbour below its commit threshold", () => {
    const f = geometryFixture(296);
    f.transition.begin(100, 150);
    f.transition.update(0.8);
    frames(14);
    expect(Number(progress())).toBeGreaterThan(0.8);
    f.transition.update(1.08);
    const samples: { target: number | null; progress: number }[] = [];
    for (let frame = 0; frame < 16; frame++) {
      frames();
      samples.push({ target: f.previewOffset(), progress: Number(progress()) });
    }
    const switched = samples.findIndex(sample => sample.target === 1);
    expect(switched).toBeGreaterThan(0);
    expect(samples[switched].progress).toBe(0);
    expect(samples.slice(0, switched).every((sample, index, before) => !index || sample.progress <= before[index - 1].progress)).toBe(true);
    expect(f.preview.mock.calls.map(([target]) => target)).toEqual([-1, 1]);
    expect(f.commit).not.toHaveBeenCalled();
    f.transition.update(1.12);
    frames(8);
    const before = Number(progress());
    f.transition.update(1.1201);
    frames(2);
    expect(Math.abs(Number(progress()) - before)).toBeLessThan(0.002);
    f.transition.dispose();
  });

  it("coalesces direction changes while preparation is pending", () => {
    const f = geometryFixture(296);
    f.transition.begin(100, 150);
    f.transition.update(0.8);
    frames();
    f.transition.update(1.3);
    f.transition.update(0.8);
    frames(14);
    expect(f.preview.mock.calls.map(([target]) => target)).toEqual([-1]);
    expect(f.commit).not.toHaveBeenCalled();
    f.transition.dispose();
  });

  it.each([0, 1, 2, 3, 4, 5])("commits once and cleans up when released after %i preparation frames", count => {
    const f = geometryFixture(296, true);
    f.transition.begin(100, 150);
    f.transition.update(0.8);
    frames(count);
    f.transition.end();
    expect(f.commit).toHaveBeenCalledExactlyOnceWith(-1);
    frames(60);
    expect(f.offset()).toBe(-1);
    expect(f.commit).toHaveBeenCalledTimes(1);
    expect(overlay()).toBeNull();
    expect(f.previewOffset()).toBeNull();
    f.transition.dispose();
  });

  it("commits immediately, waits for placement, and allows immediate native-direction reversal", () => {
    const f = geometryFixture();
    f.transition.begin(100, 150);
    f.transition.update(0.8);
    frames(5);
    expect(overlay()?.querySelector("[data-zoom-morph-renderer=dom]")).not.toBeNull();
    f.transition.end();
    expect(f.offset()).toBe(-1);
    frames(2);
    expect(overlay()).not.toBeNull();
    f.transition.begin(100, 150);
    f.transition.update(1.3);
    frames(5);
    f.transition.end();
    expect(f.offset()).toBe(0);
    frames(14);
    expect(overlay()).toBeNull();
    f.transition.dispose();
  });

  it.each([false, true])("settles from the displayed pose with cancellation=%s and no queued drag writer", cancelled => {
    const f = geometryFixture();
    f.transition.begin(100, 150);
    f.transition.update(0.95);
    frames(5);
    const before = draws.mock.calls.length;
    f.transition.update(0.8);
    f.transition.end(cancelled);
    frames(12);
    const writes = draws.mock.calls.slice(before).map(([progress]) => progress);
    expect(writes.length).toBeGreaterThan(0);
    for (let i = 1; i < writes.length; i++) {
      if (cancelled) expect(writes[i]).toBeLessThanOrEqual(writes[i - 1]);
      else expect(writes[i]).toBeGreaterThanOrEqual(writes[i - 1]);
    }
    expect(writes.at(-1)).toBe(cancelled ? 0 : 1);
    expect(overlay()).toBeNull();
    f.transition.dispose();
  });

  it("declines an unreadable source-cover clone before staging a native preview", () => {
    const f = geometryFixture();
    vi.spyOn(HTMLImageElement.prototype, "complete", "get").mockImplementation(function (this: HTMLImageElement) { return !!this.closest("[data-grid-cell]"); });
    f.transition.begin(100, 150);
    f.transition.update(0.8);
    frames(5);
    expect(overlay()).toBeNull();
    expect(f.preview).toHaveBeenCalledExactlyOnceWith(null);
    expect(f.offset()).toBe(0);
    f.transition.end();
    expect(f.commit).toHaveBeenCalledExactlyOnceWith(-1);
    f.transition.dispose();
  });

  it("cleans an active native morph up on resize", () => {
    const f = geometryFixture();
    f.transition.begin(100, 150);
    f.transition.update(0.8);
    frames(5);
    expect(overlay()?.querySelector("[data-zoom-morph-renderer=dom]")).not.toBeNull();
    window.dispatchEvent(new Event("resize"));
    expect(overlay()).toBeNull();
    expect(f.previewOffset()).toBeNull();
    f.transition.dispose();
  });
});
