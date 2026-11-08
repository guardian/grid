import { pinchStep } from "./results-zoom";
import { planZoomMorph, type MorphTile, type MorphTrack } from "./justified-zoom-morph";
import { createMorphRenderer, type MorphRenderer } from "./justified-zoom-morph-renderer";

// Bound both DOM work and Retina raster area; never snapshot the logical scroll extent.
export const MAX_ZOOM_TILES = 320;
export const MAX_ZOOM_PIXELS = 18_000_000;
const SETTLE_MS = 160;
const CLEANUP_DEADLINE_MS = 800;
const PINCH_DEAD_ZONE = Math.log(1.035);
const PINCH_FULL_PREVIEW = Math.log(1.30);
const CATCH_UP_MS = 100;
const MAX_PROGRESS_PER_FRAME = 0.18;

function loadedImage(image: HTMLImageElement | null | undefined): image is HTMLImageElement {
  return !!image?.complete && image.naturalWidth > 0 && image.naturalHeight > 0;
}

// Finger travel must not inherit the width-dependent packed row scale.
function pinchProgress(factor: number): number {
  const distance = Math.log(factor);
  const magnitude = Math.abs(distance) - PINCH_DEAD_ZONE;
  return magnitude <= 0 ? 0 : Math.sign(distance) * Math.min(1, magnitude / (PINCH_FULL_PREVIEW - PINCH_DEAD_ZONE));
}

interface Options {
  element: HTMLElement;
  offset: () => number;
  range: () => readonly [number, number];
  scale: (offset: number) => number;
  preview: (offset: number | null) => void;
  commit: (offset: number) => void;
  pinnedImage?: () => string | undefined;
}

interface Gesture {
  base: number;
  target: number;
  factor: number;
  y: number;
  bounds: DOMRect;
  root?: HTMLDivElement;
  sourceLayer?: HTMLDivElement;
  outgoing?: MorphTile[];
  incoming?: MorphTile[];
  sources: Map<string, HTMLImageElement>;
  ready: boolean;
  ending: boolean;
  fallback: boolean;
  external: boolean;
  capturing: boolean;
  committedOffset?: number;
  renderer?: MorphRenderer;
  pendingRenderer?: MorphRenderer;
  plan?: MorphTrack[];
  progress?: number;
  drawnAt?: number;
  published?: boolean;
  settleDone?: boolean;
  placed?: boolean;
  cancelReadiness?: () => void;
  restoring?: boolean;
}

export interface JustifiedZoomTransition {
  begin: (x: number, y: number) => void;
  update: (factor: number) => void;
  end: (cancelled?: boolean) => void;
  layout: (offset: number) => void;
  interrupt: () => void;
  external: (next: number, previous: number) => void;
  dispose: () => void;
}

export function createJustifiedZoomTransition(options: Options): JustifiedZoomTransition {
  const { element } = options;
  let gesture: Gesture | undefined;
  const frames = new Set<number>();
  let drawFrame = 0;
  let settle = 0;
  let disposed = false;
  let ownCommit: number | undefined;

  const snapshot = (g: Gesture, pending?: HTMLImageElement[]): MorphTile[] | undefined => {
    const cells = element.querySelectorAll<HTMLElement>("[data-grid-cell]");
    if (cells.length > MAX_ZOOM_TILES * 3) return;
    const margin = Math.min(100, g.bounds.height * 0.12);
    const visible: { cell: HTMLElement; bounds: DOMRect }[] = [];
    for (const cell of cells) {
      const bounds = cell.getBoundingClientRect();
      if (bounds.bottom <= g.bounds.top - margin || bounds.top >= g.bounds.bottom + margin) continue;
      visible.push({ cell, bounds });
      if (visible.length > MAX_ZOOM_TILES) return;
    }
    if (!visible.length) return;
    const tiles: MorphTile[] = [];
    for (const { cell, bounds } of visible) {
      const current = cell.querySelector("img");
      const id = cell.dataset.imageId ?? "";
      const source = loadedImage(current) ? current : g.sources.get(id);
      if (current && !loadedImage(source)) {
        if (bounds.bottom <= g.bounds.top || bounds.top >= g.bounds.bottom) continue;
        if (!pending || current.complete) {
          return;
        }
        pending.push(current);
      }
      tiles.push({ id, x: bounds.left - g.bounds.left, y: bounds.top - g.bounds.top, width: bounds.width, height: bounds.height, image: source, protected: source?.classList.contains("blur-lg") ?? false, radius: parseFloat(getComputedStyle(cell).borderTopLeftRadius) || 0 });
      if (source) g.sources.set(id, source);
    }
    return tiles;
  };

  const removeVisuals = (g: Gesture) => {
    g.cancelReadiness?.();
    g.cancelReadiness = undefined;
    g.renderer?.dispose();
    g.renderer = undefined;
    g.pendingRenderer?.dispose();
    g.pendingRenderer = undefined;
    g.plan = undefined;
    g.root?.remove();
    g.root = undefined;
    g.sourceLayer = undefined;
    g.outgoing = undefined;
    g.incoming = undefined;
    g.sources.clear();
  };

  const clear = () => {
    for (const frame of frames) cancelAnimationFrame(frame);
    frames.clear();
    cancelAnimationFrame(drawFrame);
    clearTimeout(settle);
    drawFrame = 0;
    settle = 0;
    if (gesture) {
      removeVisuals(gesture);
    }
    gesture = undefined;
  };

  const schedule = (callback: () => void) => {
    const frame = requestAnimationFrame(() => { frames.delete(frame); callback(); });
    frames.add(frame);
  };

  const draw = (g: Gesture, progress: number) => {
    if (!g.root || !g.outgoing) return;
    const p = Math.max(0, Math.min(1, progress));
    if (g.renderer && g.progress === p) return;
    g.progress = p;
    if (g.renderer) {
      try { g.renderer.draw(p); } catch { fallback(g); }
    }
  };

  const nativeTarget = (g: Gesture) => {
    const [min, max] = options.range();
    return Math.max(min, Math.min(max, g.base + Math.sign(pinchProgress(g.factor))));
  };

  const requestGestureDraw = (g: Gesture) => {
    if (drawFrame || gesture !== g || !g.ready || g.ending || g.external || g.fallback) return;
    drawFrame = requestAnimationFrame(() => {
      drawFrame = 0;
      if (gesture !== g || !g.ready || g.ending) return;
      const target = nativeTarget(g);
      const desired = target === g.target ? Math.abs(pinchProgress(g.factor)) : 0;
      const current = g.progress ?? 0;
      const now = performance.now();
      const limit = Math.min(MAX_PROGRESS_PER_FRAME, Math.max(0, now - (g.drawnAt ?? now)) / CATCH_UP_MS);
      const next = Math.abs(desired - current) <= limit ? desired : current + Math.sign(desired - current) * limit;
      g.drawnAt = now;
      draw(g, next);
      if (g.fallback) return;
      // Neighbours share only the original zero pose, even when input skips neutral.
      if (next === 0 && target !== g.base && target !== g.target) { stage(g, target); return; }
      if (next !== desired) requestGestureDraw(g);
    });
  };

  const activate = (g: Gesture) => {
    if (gesture !== g || g.ending) return;
    g.ready = true;
    g.drawnAt = performance.now();
    draw(g, 0);
    if (g.external) controller.end();
    else requestGestureDraw(g);
  };

  const configureMorph = (g: Gesture) => {
    if (!g.root || !g.outgoing || !g.incoming) return;
    g.ready = false;
    g.renderer?.dispose();
    g.renderer = undefined;
    g.pendingRenderer?.dispose();
    g.pendingRenderer = undefined;
    if (g.sourceLayer) g.sourceLayer.style.visibility = "visible";
    g.plan ??= planZoomMorph(g.outgoing, g.incoming, g.y, MAX_ZOOM_TILES, options.pinnedImage?.());
    if (!g.plan) { fallback(g); return; }
    const renderer = createMorphRenderer(g.root, g.plan, getComputedStyle(g.root).backgroundColor);
    if (!renderer) { fallback(g); return; }
    g.pendingRenderer = renderer;
    try { renderer.draw(0); }
    catch {
      renderer.dispose();
      g.pendingRenderer = undefined;
      fallback(g);
      return;
    }
    schedule(() => {
      if (gesture !== g || g.pendingRenderer !== renderer || g.ending) return;
      g.pendingRenderer = undefined;
      if (!renderer.ready()) {
        renderer.dispose();
        fallback(g);
        return;
      }
      g.renderer = renderer;
      if (g.sourceLayer) g.sourceLayer.style.visibility = "hidden";
      activate(g);
    });
  };

  const commit = (g: Gesture, offset: number) => {
    if (g.published) return;
    g.published = true;
    // Store notifications are synchronous; semantic ownership must outlive visual cleanup.
    const previous = ownCommit;
    ownCommit = offset;
    try { options.commit(offset); }
    finally { ownCommit = previous; }
  };

  const checkPlacement = (g: Gesture, expected: MorphTile[] | undefined) => {
    const actual = new Map(Array.from(element.querySelectorAll<HTMLElement>("[data-grid-cell]")).map(cell => [cell.dataset.imageId, cell]));
    let missing = 0;
    let maxError = 0;
    for (const tile of expected ?? []) {
      const bounds = actual.get(tile.id)?.getBoundingClientRect();
      if (!bounds) { missing++; continue; }
      maxError = Math.max(maxError, Math.abs(bounds.left - g.bounds.left - tile.x), Math.abs(bounds.top - g.bounds.top - tile.y), Math.abs(bounds.width - tile.width), Math.abs(bounds.height - tile.height));
    }
    g.placed = !!expected && !missing && maxError < 1;
  };

  const finish = (g: Gesture, offset: number) => {
    if (gesture !== g) return;
    clearTimeout(settle);
    settle = 0;
    // Keep the final visual cover until React has committed the real geometry.
    const staged = g.target !== g.base;
    g.ready = false;
    g.target = offset;
    g.committedOffset = offset;
    if (!g.root || !staged) clear();
    else {
      // React may coalesce a cancelled staged update without running its placement effect.
      settle = window.setTimeout(() => { if (gesture === g) clear(); }, CLEANUP_DEADLINE_MS);
    }
    commit(g, offset);
    options.preview(null);
  };

  const fallback = (g: Gesture) => {
    g.cancelReadiness?.();
    g.cancelReadiness = undefined;
    g.fallback = true;
    g.ready = false;
    if (!g.external && g.root?.style.visibility === "visible" && g.target !== g.base) {
      g.renderer?.dispose();
      g.renderer = undefined;
      g.pendingRenderer?.dispose();
      g.pendingRenderer = undefined;
      if (g.sourceLayer) g.sourceLayer.style.visibility = "visible";
      g.restoring = true;
      settle = window.setTimeout(() => { if (gesture === g) { g.restoring = false; removeVisuals(g); } }, CLEANUP_DEADLINE_MS);
    } else removeVisuals(g);
    options.preview(null);
    if (g.external) {
      clear();
    }
  };

  const waitForDestination = (g: Gesture, target: number, images: HTMLImageElement[]) => {
    const pending = new Set(images);
    const cleanup = () => {
      for (const image of images) {
        image.removeEventListener("load", loaded);
        image.removeEventListener("error", failed);
      }
      g.cancelReadiness = undefined;
    };
    const ready = () => {
      cleanup();
      if (gesture !== g || g.ending || g.target !== target) return;
      g.capturing = false;
      controller.layout(target);
    };
    const loaded = (event: Event) => {
      pending.delete(event.currentTarget as HTMLImageElement);
      if (!pending.size) ready();
    };
    const failed = () => { cleanup(); if (gesture === g && !g.ending) fallback(g); };
    g.cancelReadiness = cleanup;
    for (const image of images) {
      image.addEventListener("load", loaded);
      image.addEventListener("error", failed);
    }
    for (const image of images) {
      if (!image.complete) continue;
      if (!loadedImage(image)) { failed(); return; }
      pending.delete(image);
    }
    if (!pending.size) ready();
  };

  const stage = (g: Gesture, target: number) => {
    g.cancelReadiness?.();
    g.cancelReadiness = undefined;
    g.target = target;
    g.ready = false;
    g.capturing = false;
    g.renderer?.dispose();
    g.renderer = undefined;
    g.pendingRenderer?.dispose();
    g.pendingRenderer = undefined;
    g.plan = undefined;
    if (g.sourceLayer) g.sourceLayer.style.visibility = "visible";
    g.incoming = undefined;
    draw(g, 0);
    options.preview(target);
  };

  const prepare = (g: Gesture, target: number) => {
    const { width, height } = g.bounds;
    const margin = Math.min(100, height * 0.12);
    if (options.scale(target) === options.scale(g.base) || matchMedia("(prefers-reduced-motion: reduce)").matches || width * (height + margin * 2) * devicePixelRatio ** 2 > MAX_ZOOM_PIXELS) {
      g.fallback = true;
      return;
    }
    const outgoing = snapshot(g);
    if (!outgoing || outgoing.some(tile => tile.protected)) { g.fallback = true; return; }
    const root = document.createElement("div");
    root.dataset.justifiedZoomPreview = "";
    root.setAttribute("aria-hidden", "true");
    root.inert = true;
    Object.assign(root.style, { position: "fixed", left: `${g.bounds.left}px`, top: `${g.bounds.top}px`, width: `${width}px`, height: `${height}px`, overflow: "hidden", pointerEvents: "none", zIndex: "20", visibility: "hidden", background: "var(--color-grid-bg)" });
    const sourceLayer = document.createElement("div");
    sourceLayer.dataset.zoomSource = "";
    Object.assign(sourceLayer.style, { position: "absolute", inset: "0" });
    const images: HTMLImageElement[] = [];
    for (const tile of outgoing) {
      const cell = document.createElement("div");
      cell.className = "bg-grid-cell overflow-hidden";
      Object.assign(cell.style, { position: "absolute", left: `${tile.x}px`, top: `${tile.y}px`, width: `${tile.width}px`, height: `${tile.height}px`, borderRadius: `${tile.radius ?? 0}px` });
      if (tile.image) {
        const image = tile.image.cloneNode(false) as HTMLImageElement;
        image.removeAttribute("id");
        image.alt = "";
        image.loading = "eager";
        image.draggable = false;
        cell.appendChild(image);
        images.push(image);
      }
      sourceLayer.appendChild(cell);
    }
    root.appendChild(sourceLayer);
    document.body.appendChild(root);
    g.root = root;
    g.sourceLayer = sourceLayer;
    g.outgoing = outgoing;
    schedule(() => {
      if (gesture !== g || g.ending) return;
      if (images.some(image => !loadedImage(image))) { fallback(g); return; }
      root.style.visibility = "visible";
      stage(g, target);
    });
  };

  const controller: JustifiedZoomTransition = {
    begin(_x, y) {
      if (disposed) return;
      // The previous gesture has already committed; its cosmetic settle must not
      // swallow the next pinch or become the next gesture's distance baseline.
      if (gesture?.ending) clear();
      controller.interrupt();
      const bounds = element.getBoundingClientRect();
      if (!bounds.width || !bounds.height) return;
      const base = options.offset();
      gesture = { base, target: base, factor: 1, y: y - bounds.top, bounds, sources: new Map(), ready: false, ending: false, fallback: false, external: false, capturing: false };
    },
    update(factor) {
      const g = gesture;
      if (!g || g.ending || !Number.isFinite(factor) || factor <= 0) return;
      g.factor = factor;
      if (g.fallback) return;
      const target = nativeTarget(g);
      if (!g.root) {
        if (target !== g.base) prepare(g, target);
        return;
      }
      requestGestureDraw(g);
    },
    end(cancelled = false) {
      const g = gesture;
      if (!g || g.ending) return;
      const [min, max] = options.range();
      const offset = cancelled ? g.base : g.external ? g.target : Math.max(min, Math.min(max, g.base + pinchStep(g.factor)));
      g.ending = true;
      g.cancelReadiness?.();
      g.cancelReadiness = undefined;
      cancelAnimationFrame(drawFrame);
      drawFrame = 0;
      if (!g.root || !g.ready || !g.renderer || (offset !== g.base && offset !== g.target)) {
        finish(g, offset);
        return;
      }
      g.committedOffset = offset;
      commit(g, offset);
      options.preview(null);
      const from = g.progress ?? 0;
      const to = offset === g.base ? 0 : 1;
      // A watchdog aborts cosmetics; it is not a successful placement acknowledgement.
      settle = window.setTimeout(() => { if (gesture === g) clear(); }, CLEANUP_DEADLINE_MS);
      if (from === to) {
        g.settleDone = true;
        if (g.placed) clear();
        return;
      }
      const start = performance.now();
      const tick = () => {
        if (gesture !== g) return;
        const time = Math.min(1, (performance.now() - start) / SETTLE_MS);
        draw(g, from + (to - from) * (1 - (1 - time) ** 3));
        if (time < 1) schedule(tick);
        else { g.settleDone = true; if (g.placed) clear(); }
      };
      schedule(tick);
    },
    layout(offset) {
      const g = gesture;
      if (!g) return;
      if (g.restoring && !g.ending && offset === g.base) {
        schedule(() => {
          if (gesture !== g || !g.restoring || g.ending) return;
          checkPlacement(g, g.outgoing);
          if (!g.placed) return;
          g.restoring = false;
          clearTimeout(settle);
          settle = 0;
          removeVisuals(g);
        });
        return;
      }
      if (g.ending && g.renderer && offset === g.committedOffset) {
        schedule(() => {
          if (gesture !== g) return;
          checkPlacement(g, offset === g.base ? g.outgoing : g.incoming);
          if (g.placed && g.settleDone) clear();
        });
        return;
      }
      if (offset !== g.target) return;
      if (g.ending && !g.ready) {
        schedule(clear);
        return;
      }
      if (g.incoming || g.capturing || !g.root || g.target === g.base) return;
      g.capturing = true;
      const target = g.target;
      schedule(() => {
        if (gesture !== g || !g.root || g.ending || g.target !== target) return;
        const pending = !g.external ? [] as HTMLImageElement[] : undefined;
        const incoming = snapshot(g, pending);
        if (!incoming) { fallback(g); return; }
        if (pending?.length) { waitForDestination(g, target, pending); return; }
        g.incoming = incoming;
        configureMorph(g);
      });
    },
    interrupt() {
      if (!gesture) return;
      clear();
      options.preview(null);
    },
    external(next, previous) {
      if (ownCommit === next) return;
      const g = gesture;
      if (g?.ending && g.committedOffset === next) return;
      controller.interrupt();
      if (next === previous || disposed) return;
      // Keyboard/menu zooms use the same visual cover without another layout calculation.
      controller.begin(element.getBoundingClientRect().left + element.clientWidth / 2, element.getBoundingClientRect().top + element.clientHeight / 2);
      const current = gesture;
      if (!current) return;
      current.base = previous;
      current.external = true;
      current.factor = options.scale(next) / options.scale(previous);
      prepare(current, next);
      if (current.fallback) clear();
    },
    dispose() {
      controller.interrupt();
      window.removeEventListener("resize", resize);
      disposed = true;
    },
  };
  const resize = () => {
    if (!gesture) return;
    controller.interrupt();
  };
  window.addEventListener("resize", resize);
  return controller;
}
