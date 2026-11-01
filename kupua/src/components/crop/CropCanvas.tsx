import { useEffect, useImperativeHandle, useMemo, useReducer, useRef, useState, type Ref } from "react";
import { createPortal } from "react-dom";
import Cropper, { type CropperHandle, type CropperImage, type CropperSelection } from "cropperjs";
import { isValidCropRect, type Rect, type Size } from "@/lib/crop/crop-request";
import { bindCropViewport, type CropViewport } from "@/lib/crop/crop-viewport";

export type CropCanvasState = { status: "loading" | "unavailable" }
  | { status: "ready"; selection: Rect | null; rendition: Size };

const HANDLES = ["n", "e", "s", "w", "ne", "nw", "se", "sw"]
  .map((d) => `<cropper-handle action="${d}-resize"></cropper-handle>`).join("");

const TEMPLATE = `<cropper-canvas>
  <cropper-image initial-fit="contain"></cropper-image>
  <cropper-shade theme-color="rgba(51, 51, 51, 0.5)"></cropper-shade>
  <cropper-selection movable resizable outlined precise>
    <cropper-grid role="grid" covered></cropper-grid>
    <cropper-crosshair centered></cropper-crosshair>
    <cropper-handle action="move" plain></cropper-handle>
    ${HANDLES}
  </cropper-selection>
</cropper-canvas>`;

interface CropCanvasProps {
  ref?: Ref<CropCanvasHandle>;
  src: string;
  zoomSrc?: string;
  zoomEnabled?: boolean;
  alt: string;
  /** width / height; null for freeform. Changing it refits a maximal centred selection. */
  aspect: number | null;
  initialSelection?: { rect: Rect | null; size: Size };
  /** Selection in the displayed rendition's natural pixels. */
  onChange: (state: CropCanvasState) => void;
  /** Kahuna's square-crop circle: a mask clips the view, a guide draws a dashed circle. */
  circle?: "mask" | "guide";
}

export interface CropCanvasHandle {
  setSelection: (selection: Rect, coordinateSize: Size) => void;
}

type ShadeElement = HTMLElement & { borderRadius: string; $render(): void };

/** Live cropper state shared between effects; geometry is in canvas CSS pixels. */
interface Session extends CropViewport {
  image: CropperImage;
  selection: CropperSelection;
  shade: ShadeElement | null;
  /** Rendered image box; undefined until the image has loaded and been centred. */
  box?: Rect;
  natural: Size;
  pixels: Size;
  projecting: boolean;
  setSelection(rect: Rect): void;
  /** Last reported selection in natural pixels, for re-mapping after a resize. */
  last?: Rect;
}

export function CropCanvas({ ref, src, zoomSrc, zoomEnabled = false, alt, aspect, initialSelection, onChange, circle }: CropCanvasProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const sessionRef = useRef<Session | null>(null);
  const initialSelectionRef = useRef(initialSelection);
  initialSelectionRef.current = initialSelection;
  const initializedRef = useRef(false);
  const owner = useMemo(() => ({}), [src, alt]);
  const [readyOwner, setReadyOwner] = useState<object>();
  const [grip, setGrip] = useState<HTMLElement | null>(null);
  const [readyTick, bump] = useReducer((n: number) => n + 1, 0);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const zoomSrcRef = useRef(zoomSrc);
  zoomSrcRef.current = zoomSrc;

  useImperativeHandle(ref, () => ({
    setSelection(selection, coordinateSize) {
      const session = sessionRef.current;
      if (!session?.box || !isValidCropRect(selection, coordinateSize)) return;
      const scaleX = session.natural.width / coordinateSize.width;
      const scaleY = session.natural.height / coordinateSize.height;
      session.setSelection({ x: selection.x * scaleX, y: selection.y * scaleY,
        width: selection.width * scaleX, height: selection.height * scaleY });
    },
  }), []);

  // One cropper per image source.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    onChangeRef.current({ status: "loading" });
    const img = document.createElement("img");
    img.src = src;
    img.alt = alt;
    host.append(img);
    const cropper = new Cropper(img, { container: host, template: TEMPLATE });
    const canvas = cropper.getCropperCanvas()!;
    canvas.style.height = "100%";
    canvas.style.overflow = "visible";
    canvas.style.minWidth = "0";
    canvas.style.minHeight = "0";
    for (const direction of ["ne", "nw", "se", "sw"]) {
      const handle = canvas.querySelector<CropperHandle>(`cropper-handle[action="${direction}-resize"]`);
      if (!handle) continue;
      Object.assign(handle.style, {
        width: "20px", height: "20px",
        [direction.startsWith("n") ? "top" : "bottom"]: "-10px",
        [direction.endsWith("e") ? "right" : "left"]: "-10px",
      });
      handle.$addStyles(':host([action$="-resize"])::after { width: 8px; height: 8px; }');
    }
    const session: Session = {
      image: cropper.getCropperImage()!,
      selection: cropper.getCropperSelection()!,
      shade: canvas.querySelector<ShadeElement>("cropper-shade"),
      natural: { width: 0, height: 0 },
      pixels: { width: 0, height: 0 },
      projecting: false,
      getZoom: () => zoom, zoomAt, panBy, resetView, setSelection,
    };
    let cancelled = false;
    let zoom = 1;
    let offsetX = 0;
    let offsetY = 0;
    let upgradeRequested = false;
    session.selection.keyboard = true;
    Object.assign(session.image.style, { position: "absolute", left: "0", top: "0", transformOrigin: "0 0" });

    function clipShade(s: Rect) {
      const { box, shade } = session;
      if (box && shade) {
        const left = box.x - s.x;
        const top = box.y - s.y;
        const right = left + box.width;
        const bottom = top + box.height;
        shade.style.clipPath = `polygon(${left}px ${top}px, ${right}px ${top}px, ${right}px ${bottom}px, ${left}px ${bottom}px)`;
      }
    }
    function projectSelection() {
      const { box, last, natural, selection } = session;
      if (!box || !last) return;
      const scaleX = box.width / natural.width;
      const scaleY = box.height / natural.height;
      const frame = { x: box.x + last.x * scaleX, y: box.y + last.y * scaleY,
        width: last.width * scaleX, height: last.height * scaleY };
      session.projecting = true;
      try { selection.$change(frame.x, frame.y, frame.width, frame.height, NaN); }
      finally { session.projecting = false; }
      clipShade(frame);
    }
    function setSelection(rect: Rect) {
      rect = { ...rect, width: Math.min(rect.width, session.natural.width - rect.x),
        height: Math.min(rect.height, session.natural.height - rect.y) };
      session.last = rect;
      projectSelection();
      onChangeRef.current({ status: "ready", selection: rect, rendition: session.natural });
    }
    function renderView(overflow = 0.25) {
      const view = canvas.getBoundingClientRect();
      const { natural, pixels, image } = session;
      if (cancelled || !natural.width || !pixels.width || view.width <= 0 || view.height <= 0) return;
      const fit = Math.min(view.width / natural.width, view.height / natural.height);
      const width = natural.width * fit * zoom;
      const height = natural.height * fit * zoom;
      const allowance = Math.min(view.width, view.height) * overflow;
      const maxX = Math.max(0, (width - view.width) / 2 + allowance);
      const maxY = Math.max(0, (height - view.height) / 2 + allowance);
      offsetX = Math.max(-maxX, Math.min(maxX, offsetX));
      offsetY = Math.max(-maxY, Math.min(maxY, offsetY));
      session.box = { x: (view.width - width) / 2 + offsetX, y: (view.height - height) / 2 + offsetY, width, height };
      image.scalable = image.translatable = true;
      image.$setTransform(width / pixels.width, 0, 0, height / pixels.height, session.box.x, session.box.y);
      image.scalable = image.translatable = false;
      projectSelection();
    }
    function zoomAt(factor: number, clientX: number, clientY: number) {
      if (!session.box || !Number.isFinite(factor)) return;
      const next = Math.max(1, Math.min(5, zoom * factor));
      const view = canvas.getBoundingClientRect();
      const anchorX = clientX - view.left - view.width / 2;
      const anchorY = clientY - view.top - view.height / 2;
      offsetX = anchorX - (anchorX - offsetX) * next / zoom;
      offsetY = anchorY - (anchorY - offsetY) * next / zoom;
      zoom = next;
      renderView();
      const sharp = zoomSrcRef.current;
      if (zoom > 1 && !upgradeRequested && sharp && sharp !== src) {
        upgradeRequested = true;
        session.image.src = sharp;
      }
    }
    function panBy(dx: number, dy: number, overflow = 0.25) {
      const previousX = offsetX;
      const previousY = offsetY;
      offsetX += dx; offsetY += dy;
      renderView(overflow);
      return { dx: offsetX - previousX, dy: offsetY - previousY };
    }
    function resetView() { zoom = 1; offsetX = 0; offsetY = 0; renderView(); }
    const report = (s: Rect) => {
      const { box, natural } = session;
      if (cancelled || !box || box.width <= 0 || box.height <= 0) return;
      clipShade(s);
      const scaleX = natural.width / box.width;
      const scaleY = natural.height / box.height;
      const x = Math.max(0, (s.x - box.x) * scaleX);
      const y = Math.max(0, (s.y - box.y) * scaleY);
      const rect = { x, y, width: Math.min(s.width * scaleX, natural.width - x), height: Math.min(s.height * scaleY, natural.height - y) };
      session.last = isValidCropRect(rect, natural) ? rect : undefined;
      onChangeRef.current({ status: "ready", selection: session.last ?? null, rendition: natural });
    };
    // v2 has no viewMode: reject changes leaving the image (documented boundary pattern).
    const onSelectionChange = (event: Event) => {
      const d = (event as CustomEvent<Rect>).detail;
      const b = session.box;
      if (cancelled || !b) return;
      if (session.projecting) return;
      if (d.width === 0 && d.height === 0) {
        session.last = undefined;
        onChangeRef.current({ status: "ready", selection: null, rendition: session.natural });
        return;
      }
      const eps = 0.5;
      if (![d.x, d.y, d.width, d.height].every(Number.isFinite) || d.width <= 0 || d.height <= 0
        || d.x < b.x - eps || d.y < b.y - eps || d.x + d.width > b.x + b.width + eps || d.y + d.height > b.y + b.height + eps) {
        event.preventDefault();
        return;
      }
      report(d);
    };
    session.selection.addEventListener("change", onSelectionChange);

    // v2 does not re-centre on resize: re-fit the image and map the selection back.
    let resizeFrame = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(resizeFrame);
      resizeFrame = requestAnimationFrame(() => {
        if (cancelled || !session.box) return;
        renderView();
      });
    });

    const media = session.image.$getShadowRoot().querySelector("img");
    const onMediaLoad = () => {
      if (cancelled || !session.box || !media?.naturalWidth || !media.naturalHeight) return;
      session.pixels = { width: media.naturalWidth, height: media.naturalHeight };
      renderView();
    };
    const onMediaError = () => {
      if (!cancelled && session.box && session.image.src !== src) session.image.src = src;
    };
    media?.addEventListener("load", onMediaLoad);
    media?.addEventListener("error", onMediaError);
    let readyFrame = 0;
    void session.image.$ready().then((loaded) => {
      // Centring applies after load; measure on the next frame.
      if (cancelled) return;
      readyFrame = requestAnimationFrame(() => {
        if (cancelled) return;
        session.natural = { width: loaded.naturalWidth, height: loaded.naturalHeight };
        session.pixels = session.natural;
        renderView();
        sessionRef.current = session;
        observer.observe(host);
        bump();
      });
    }).catch(() => {
      if (!cancelled) onChangeRef.current({ status: "unavailable" });
    });

    return () => {
      cancelled = true;
      sessionRef.current = null;
      observer.disconnect();
      cancelAnimationFrame(resizeFrame);
      cancelAnimationFrame(readyFrame);
      media?.removeEventListener("load", onMediaLoad);
      media?.removeEventListener("error", onMediaError);
      session.selection.keyboard = false;
      session.selection.removeEventListener("change", onSelectionChange);
      cropper.destroy();
      host.replaceChildren();
    };
  }, [src, alt, bump]);

  useEffect(() => {
    const session = sessionRef.current;
    const host = hostRef.current;
    if (!session || !host) return;
    session.resetView();
    if (!zoomEnabled) return;
    const handle = Object.assign(document.createElement("cropper-handle"), { slottable: true });
    handle.setAttribute("action", "move");
    handle.setAttribute("role", "button");
    handle.setAttribute("aria-label", "Move crop frame");
    handle.setAttribute("aria-keyshortcuts", "ArrowUp ArrowDown ArrowLeft ArrowRight");
    handle.dataset.cropGrip = "";
    handle.title = "Move crop frame";
    handle.tabIndex = 0;
    Object.assign(handle.style, {
      position: "absolute", left: "50%", top: "-40px", right: "auto", bottom: "auto",
      width: "64px", height: "28px", transform: "translateX(-50%)", boxSizing: "border-box",
      display: "flex", alignItems: "center", justifyContent: "center", cursor: "move", zIndex: "2",
      background: "rgba(0, 0, 0, 0.35)", color: "rgba(255, 255, 255, 0.7)", border: "1px solid rgba(255, 255, 255, 0.35)", borderRadius: "4px",
    });
    session.selection.append(handle);
    setGrip(handle);
    const unbind = bindCropViewport(host, session);
    return () => { unbind(); handle.remove(); setGrip(null); session.resetView(); };
  }, [zoomEnabled, readyTick]);

  // Ratio change (and first load): maximal centred selection, as Kahuna's autoCropArea 1.
  useEffect(() => {
    const session = sessionRef.current;
    if (!session?.box) return;
    const { box, selection } = session;
    selection.aspectRatio = aspect ?? NaN;
    const restored = !initializedRef.current ? initialSelectionRef.current : undefined;
    initializedRef.current = true;
    if (restored && (restored.rect === null || isValidCropRect(restored.rect, restored.size))) {
      if (restored.rect === null) selection.$clear();
      else {
        const scaleX = session.natural.width / restored.size.width;
        const scaleY = session.natural.height / restored.size.height;
        session.setSelection({ x: restored.rect.x * scaleX, y: restored.rect.y * scaleY,
          width: restored.rect.width * scaleX, height: restored.rect.height * scaleY });
      }
      setReadyOwner(owner);
      return;
    }
    let width = box.width;
    let height = box.height;
    if (aspect) {
      if (width / height > aspect) width = height * aspect;
      else height = width / aspect;
    }
    selection.$change(box.x + (box.width - width) / 2, box.y + (box.height - height) / 2, width, height, selection.aspectRatio, true);
    if (width > 0 && height > 0) setReadyOwner(owner);
  }, [aspect, readyTick, onChange, owner]);

  useEffect(() => {
    const session = sessionRef.current;
    if (!session || !circle) return;
    const { selection, shade } = session;
    // The shade copies borderRadius only on selection change events, so set it too.
    const setRadius = (radius: string) => {
      selection.borderRadius = radius;
      selection.$render();
      if (shade) { shade.borderRadius = radius; shade.$render(); }
    };
    if (circle === "mask") {
      setRadius("50%");
      const outline = document.createElement("div");
      outline.dataset.testid = "crop-square-outline";
      outline.setAttribute("aria-hidden", "true");
      Object.assign(outline.style, {
        position: "absolute", inset: "0", borderRadius: "0", pointerEvents: "none",
        outline: "1px solid rgba(51, 153, 255, 0.75)",
      });
      selection.append(outline);
      return () => { outline.remove(); setRadius(""); };
    }
    const guide = createCircleGuide();
    selection.append(guide);
    return () => guide.remove();
  }, [circle, readyTick]);

  return <>
    <div ref={hostRef} tabIndex={-1} data-ready={readyOwner === owner} className="w-full h-full outline-none" style={{ visibility: readyOwner === owner ? "visible" : "hidden" }} />
    {grip && createPortal(
      <svg className="size-5 pointer-events-none" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
        <circle cx="9" cy="6" r="1.5" /><circle cx="15" cy="6" r="1.5" />
        <circle cx="9" cy="12" r="1.5" /><circle cx="15" cy="12" r="1.5" />
        <circle cx="9" cy="18" r="1.5" /><circle cx="15" cy="18" r="1.5" />
      </svg>, grip)}
  </>;
}

/** Dashed circle inscribed in the selection, slotted as light DOM (Kahuna's guideline). */
function createCircleGuide(): HTMLElement {
  const outer = document.createElement("div");
  outer.dataset.testid = "crop-circle-guide";
  Object.assign(outer.style, { position: "absolute", inset: "0", pointerEvents: "none", containerType: "size" });
  const inner = document.createElement("div");
  Object.assign(inner.style, {
    position: "absolute", inset: "0", margin: "auto",
    width: "min(100cqw, 100cqh)", height: "min(100cqw, 100cqh)",
    borderRadius: "50%", border: "1px dashed white", mixBlendMode: "difference",
  });
  outer.append(inner);
  return outer;
}
