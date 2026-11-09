export interface CropViewport {
  getZoom(): number;
  zoomAt(factor: number, clientX: number, clientY: number, panX?: number, panY?: number): void;
  panBy(dx: number, dy: number, overflow?: number): { dx: number; dy: number };
  resetView(): void;
}

export function bindCropViewport(host: HTMLElement, viewport: CropViewport, isPanMode: () => boolean = () => true,
  onAltChange?: (held: boolean) => void): () => void {
  let alt = false;
  const setAlt = (held: boolean) => {
    if (alt === held) return;
    alt = held;
    onAltChange?.(held);
  };
  let panning = false;
  let editing = false;
  let suppressClick = false;
  let lastX = 0;
  let lastY = 0;
  let hoverX = NaN;
  let hoverY = NaN;
  let velocityX = 0;
  let velocityY = 0;
  let lastTime = 0;
  let panDistance = 0;
  let momentumFrame = 0;
  const stopMomentum = () => {
    cancelAnimationFrame(momentumFrame);
    momentumFrame = 0;
  };
  const startMomentum = () => {
    let speedX = velocityX * 16;
    let speedY = velocityY * 16;
    let previousTime = performance.now();
    const step = (now: number) => {
      const frames = Math.max(0, Math.min(64, now - previousTime)) / 16.67;
      previousTime = now;
      const decay = Math.pow(0.95, frames);
      const distanceFactor = 0.95 * (1 - decay) / (1 - 0.95);
      const dx = speedX * distanceFactor;
      const dy = speedY * distanceFactor;
      speedX *= decay;
      speedY *= decay;
      const moved = viewport.panBy(dx, dy);
      if (Math.abs(moved.dx - dx) > 0.01) speedX = 0;
      if (Math.abs(moved.dy - dy) > 0.01) speedY = 0;
      momentumFrame = Math.abs(speedX) > 0.5 || Math.abs(speedY) > 0.5 ? requestAnimationFrame(step) : 0;
    };
    momentumFrame = requestAnimationFrame(step);
  };
  const handles = [...host.querySelectorAll<HTMLElement>('cropper-handle[action="move"]:not([data-crop-grip])')];
  const cursors = handles.map(handle => handle.style.cursor);
  const titles = handles.map(handle => handle.getAttribute("title"));
  const previousCursor = host.style.cursor;
  const cursor = () => {
    const pan = isPanMode() !== alt;
    host.style.cursor = panning ? "grabbing" : pan ? "grab" : "";
    handles.forEach(handle => {
      handle.style.cursor = !pan && !panning ? "move" : host.style.cursor;
      handle.title = isPanMode() ? "Drag to pan; Alt+drag to move crop frame" : "Drag to move crop frame; Alt+drag to pan";
    });
  };
  cursor();
  const action = (event: Event) => event.composedPath()
    .find((node): node is Element => node instanceof Element && node.matches("cropper-handle"))?.getAttribute("action") ?? "";
  const isGrip = (event: Event) => event.composedPath()
    .some(node => node instanceof Element && node.hasAttribute("data-crop-grip"));
  const stop = (event: Event) => { event.preventDefault(); event.stopImmediatePropagation(); };
  const editable = (event: KeyboardEvent) => event.target instanceof Element
    && !!event.target.closest("input,textarea,select,button,a,[contenteditable]");
  const anchor = () => {
    const box = host.getBoundingClientRect();
    return hoverX >= box.left && hoverX <= box.right && hoverY >= box.top && hoverY <= box.bottom
      ? { x: hoverX, y: hoverY } : { x: box.left + box.width / 2, y: box.top + box.height / 2 };
  };
  const toggleZoom = (clientX: number, clientY: number) => {
    if (viewport.getZoom() > 1) viewport.resetView();
    else viewport.zoomAt(3, clientX, clientY);
  };
  const onKeyDown = (event: KeyboardEvent) => {
    setAlt(event.altKey); cursor();
    if (isGrip(event)) {
      stopMomentum();
      if (event.key === " " || event.key === "Enter") stop(event);
      return;
    }
    if (event.metaKey || event.ctrlKey || event.altKey || editable(event)) return;
    stopMomentum();
    if (event.code === "Space" || event.key === " ") {
      stop(event);
      if (!editing && !panning && !event.repeat) {
        const point = anchor();
        toggleZoom(point.x, point.y);
      }
      return;
    }
    if (!["+", "=", "-", "0", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
    stop(event);
    if (editing || panning) return;
    if (event.key === "0") viewport.resetView();
    else if (["+", "=", "-"].includes(event.key)) {
      const point = anchor();
      viewport.zoomAt(event.key === "-" ? 1 / 1.5 : 1.5, point.x, point.y);
    } else {
      const box = host.getBoundingClientRect();
      switch (event.key) {
        case "ArrowLeft": viewport.panBy(box.width * 0.25, 0, 0.05); break;
        case "ArrowRight": viewport.panBy(-box.width * 0.25, 0, 0.05); break;
        case "ArrowUp": viewport.panBy(0, box.height * 0.25, 0.05); break;
        case "ArrowDown": viewport.panBy(0, -box.height * 0.25, 0.05); break;
        case "Home": viewport.panBy(event.shiftKey ? -1e6 : 1e6, 1e6, 0.05); break;
        case "End": viewport.panBy(event.shiftKey ? 1e6 : -1e6, -1e6, 0.05); break;
      }
    }
  };
  const release = () => { stopMomentum(); setAlt(false); panning = false; editing = false; suppressClick = true; cursor(); };
  const onKeyUp = (event: KeyboardEvent) => {
    setAlt(event.altKey); cursor();
  };
  const onHover = (event: MouseEvent) => { hoverX = event.clientX; hoverY = event.clientY; setAlt(event.altKey); cursor(); };
  const onPointerDown = (event: PointerEvent) => {
    if (event.pointerType !== "mouse" || event.button !== 0) return;
    setAlt(event.altKey);
    host.focus({ preventScroll: true });
    editing = !(isPanMode() !== alt) || isGrip(event) || action(event).endsWith("-resize");
    suppressClick = editing;
    cursor();
    if (editing) return;
    stop(event);
    panning = true; lastX = event.clientX; lastY = event.clientY;
    velocityX = 0; velocityY = 0; lastTime = event.timeStamp; panDistance = 0;
    cursor();
  };
  const onPointerMove = (event: PointerEvent) => {
    if (!panning) return;
    stop(event);
    const dx = event.clientX - lastX;
    const dy = event.clientY - lastY;
    const elapsed = event.timeStamp - lastTime;
    if (elapsed > 0) {
      velocityX = velocityX * 0.4 + dx / elapsed * 0.6;
      velocityY = velocityY * 0.4 + dy / elapsed * 0.6;
    }
    panDistance += Math.abs(dx) + Math.abs(dy);
    lastTime = event.timeStamp;
    viewport.panBy(dx, dy);
    lastX = event.clientX; lastY = event.clientY;
  };
  const onPointerEnd = (event: PointerEvent) => {
    if (panning) {
      stop(event);
      suppressClick = panDistance > 3 || event.type === "pointercancel";
      if (event.type === "pointerup" && panDistance > 3 && event.timeStamp - lastTime < 80
        && Math.hypot(velocityX, velocityY) > 0.15) startMomentum();
    }
    panning = false; editing = false; cursor();
  };
  const onClick = (event: MouseEvent) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey) return;
    stop(event);
    if (suppressClick || isGrip(event) || event.altKey || action(event).endsWith("-resize")) return;
    stopMomentum();
    toggleZoom(event.clientX, event.clientY);
  };
  const onWheel = (event: WheelEvent) => {
    if (event.metaKey) return;
    stopMomentum();
    stop(event);
    if (editing || panning) return;
    const pixels = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? host.clientHeight : 1);
    viewport.zoomAt(Math.max(0.1, 1 - pixels * 0.002), event.clientX, event.clientY);
  };
  host.addEventListener("pointerdown", onPointerDown, true);
  host.addEventListener("click", onClick, true);
  host.addEventListener("wheel", onWheel, { capture: true, passive: false });
  window.addEventListener("pointerdown", stopMomentum, true);
  window.addEventListener("pointermove", onPointerMove, true);
  window.addEventListener("pointerup", onPointerEnd, true);
  window.addEventListener("pointercancel", onPointerEnd, true);
  window.addEventListener("mousemove", onHover);
  window.addEventListener("keydown", onKeyDown, true);
  window.addEventListener("keyup", onKeyUp, true);
  window.addEventListener("blur", release);
  return () => {
    release();
    host.style.cursor = previousCursor;
    handles.forEach((handle, index) => {
      handle.style.cursor = cursors[index];
      if (titles[index] === null) handle.removeAttribute("title");
      else handle.setAttribute("title", titles[index]!);
    });
    host.removeEventListener("pointerdown", onPointerDown, true);
    host.removeEventListener("click", onClick, true);
    host.removeEventListener("wheel", onWheel, true);
    window.removeEventListener("pointerdown", stopMomentum, true);
    window.removeEventListener("pointermove", onPointerMove, true);
    window.removeEventListener("pointerup", onPointerEnd, true);
    window.removeEventListener("pointercancel", onPointerEnd, true);
    window.removeEventListener("mousemove", onHover);
    window.removeEventListener("keydown", onKeyDown, true);
    window.removeEventListener("keyup", onKeyUp, true);
    window.removeEventListener("blur", release);
  };
}

export function bindCropTouchViewport(host: HTMLElement, viewport: CropViewport, cancelEdit: () => void, isPanMode: () => boolean): () => void {
  type Point = { x: number; y: number };
  const pointers = new Map<number, Point>();
  let navigating = false;
  let blocked = false;
  let frame = 0;
  let previous: Point = { x: 0, y: 0 };
  let startDistance = 0;
  let startZoom = 1;
  const midpoint = (first: Point, second: Point) => ({ x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 });
  const distance = (first: Point, second: Point) => Math.hypot(second.x - first.x, second.y - first.y);
  const cancelFrame = () => { cancelAnimationFrame(frame); frame = 0; };
  const render = () => {
    frame = 0;
    if (!navigating || blocked) return;
    const [first, second] = [...pointers.values()];
    if (!first) return;
    if (second) {
      const center = midpoint(first, second);
      if (startDistance > 0) {
        const zoom = Math.max(1, Math.min(5, startZoom * distance(first, second) / startDistance));
        if (zoom === 1) viewport.resetView();
        else viewport.zoomAt(zoom / viewport.getZoom(), previous.x, previous.y, center.x - previous.x, center.y - previous.y);
      }
      previous = center;
    } else {
      if (viewport.getZoom() > 1) viewport.panBy(first.x - previous.x, first.y - previous.y);
      previous = first;
    }
  };
  const flush = () => {
    if (!frame) return;
    cancelFrame();
    render();
  };
  const down = (event: PointerEvent) => {
    if (event.pointerType !== "touch") return;
    const inside = event.target instanceof Node && host.contains(event.target);
    if ((!inside && !pointers.size) || pointers.has(event.pointerId)) return;
    flush();
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (!inside || pointers.size > 2 || blocked) {
      blocked = true;
      navigating = false;
      cancelEdit();
      return;
    }
    const [first, second] = [...pointers.values()];
    if (second) {
      navigating = true;
      startDistance = distance(first, second);
      startZoom = viewport.getZoom();
      previous = midpoint(first, second);
    } else if (isPanMode()) {
      navigating = true;
      previous = first;
    }
    if (navigating) {
      cancelEdit();
      event.preventDefault();
    }
  };
  const move = (event: PointerEvent) => {
    if (!pointers.has(event.pointerId)) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (navigating && !blocked) {
      event.preventDefault();
      if (!frame) frame = requestAnimationFrame(render);
    }
  };
  const end = (event: PointerEvent) => {
    if (!pointers.has(event.pointerId)) return;
    if (event.type === "pointerup") flush();
    else cancelFrame();
    pointers.delete(event.pointerId);
    if (navigating || event.type === "pointercancel") {
      cancelEdit();
      navigating = false;
      blocked = pointers.size > 0;
    }
    if (!pointers.size) blocked = false;
  };
  const preventCropAction = (event: Event) => {
    if (navigating || blocked) event.preventDefault();
  };
  const release = () => {
    cancelFrame();
    pointers.clear();
    navigating = false;
    blocked = false;
    cancelEdit();
  };
  const actions = ["actionstart", "actionmove", "action"];
  actions.forEach(action => host.addEventListener(action, preventCropAction, true));
  window.addEventListener("pointerdown", down, { capture: true, passive: false });
  window.addEventListener("pointermove", move, { capture: true, passive: false });
  window.addEventListener("pointerup", end, true);
  window.addEventListener("pointercancel", end, true);
  window.addEventListener("blur", release);
  return () => {
    release();
    actions.forEach(action => host.removeEventListener(action, preventCropAction, true));
    window.removeEventListener("pointerdown", down, true);
    window.removeEventListener("pointermove", move, true);
    window.removeEventListener("pointerup", end, true);
    window.removeEventListener("pointercancel", end, true);
    window.removeEventListener("blur", release);
  };
}