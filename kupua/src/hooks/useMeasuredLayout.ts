import { useLayoutEffect, useMemo, useRef, useState, type FormEvent, type ReactNode, type RefObject } from "react";
import { flushSync } from "react-dom";
import type { Image } from "@/types/image";
import { buildMeasuredLayout } from "@/lib/windowed-measured-layout";
import type { LayoutWindow } from "@/lib/windowed-justified-layout";
import type { WindowGeometry } from "@/lib/scroll-geometry-ref";
import { getViewportAnchorId } from "./useDataWindow";
import { useSearchStore } from "@/stores/search-store";
import { useSelectionStore } from "@/stores/selection-store";
import { getEffectiveFocusMode } from "@/stores/ui-prefs-store";
import { chooseReflowAnchor } from "@/lib/layout-anchor-policy";
import { isFocusEligibleForLayoutAnchor } from "@/lib/grid-scroll-anchor";

export interface MeasuredCells {
  key: string;
  estimate: (image: Image | undefined, width: number) => number;
  thumbnailHeight: (image: Image, width: number) => number;
  render: (image: Image) => ReactNode;
}

interface FieldPoint { key: string; top: number; height: number }
interface Reading { height: number; fields: FieldPoint[]; width: number; key: string }

export function useMeasuredLayout(parent: RefObject<HTMLDivElement | null>, images: readonly (Image | undefined)[],
  width: number, context: LayoutWindow, cells: MeasuredCells | undefined) {
  const [readings, setReadings] = useState(() => new Map<string, Reading>());
  const [correctionAnchor, setCorrectionAnchor] = useState<WindowGeometry["correctionAnchor"]>();
  const committedReadings = useRef(readings);
  useLayoutEffect(() => { committedReadings.current = readings; }, [readings]);
  const current = useRef({ readings, cells, width });
  const committedLayout = useRef<ReturnType<typeof buildMeasuredLayout> | undefined>(undefined);
  const capture = useRef<{ id: string; fields: FieldPoint[]; key: string; viewportOffset?: number } | undefined>(undefined);
  let renderCapture: typeof capture.current;
  if (cells && parent.current && (current.current.cells?.key !== cells.key || current.current.width !== width)) {
    const element = parent.current;
    const source = committedLayout.current;
    const resolve = (id: string | null) => id && source?.window.findItemIndex(id) !== undefined ? id : null;
    const focused = resolve(useSearchStore.getState().focusedImageId);
    const focusRow = focused && source ? source.getItemRow(source.window.findItemIndex(focused)!) : undefined;
    const selection = useSelectionStore.getState();
    const id = chooseReflowAnchor({ selection: resolve(selection.selectedIds.size ? selection.anchorId : null),
      focus: focusRow && isFocusEligibleForLayoutAnchor(getEffectiveFocusMode(), focusRow, element.scrollTop, element.clientHeight) ? focused : null,
      viewport: getViewportAnchorId });
    const previous = id ? readings.get(id) : undefined;
    const cell = id && element.querySelector<HTMLElement>(`[data-measured-cell][data-image-id="${CSS.escape(id)}"]`);
    if (id && previous && cell) {
      const top = cell.getBoundingClientRect().top;
      const viewportTop = element.getBoundingClientRect().top;
      const active = document.activeElement?.closest<HTMLElement>("[data-measured-field]");
      const field = previous.fields.find(field => active?.dataset.measuredField === field.key && cell.contains(active)) ??
        previous.fields.find(field => top + field.top + field.height > viewportTop);
      if (field) renderCapture = { id, fields: previous.fields, key: field.key,
        viewportOffset: top + field.top - viewportTop - parseFloat(getComputedStyle(element).paddingTop) };
    }
  }
  useLayoutEffect(() => {
    current.current = { readings, cells, width };
    if (renderCapture) capture.current = renderCapture;
  });
  const layout = useMemo(() => {
    if (!cells) return undefined;
    const measurements = new Map<string, number>();
    for (const image of images) {
      const reading = image && readings.get(image.id);
      if (image && reading?.width === width && reading.key === cells.key) measurements.set(image.id, reading.height);
    }
    const next = buildMeasuredLayout(images, width, context,
      { estimatedHeight: cells.estimate(undefined, width), estimate: image => cells.estimate(image, width),
        anchorHeight: image => cells.thumbnailHeight(image, width), measurements });
    next.window.correctionAnchor = committedReadings.current !== readings ? correctionAnchor : undefined;
    return next;
  }, [images, width, context.bufferOffset, context.total, context.indexed, context.searchKey, cells, readings, correctionAnchor]);
  useLayoutEffect(() => { committedLayout.current = layout; }, [layout]);
  const measureRef = useRef(() => {});
  const observerRef = useRef<ResizeObserver | null>(null);
  const observed = useRef(new Set<Element>());
  const delivering = useRef(false);
  const observationFrame = useRef(0);
  const inputFrame = useRef(0);
  const observeRef = useRef(() => {});
  const observe = () => {
    const observer = observerRef.current;
    if (!observer || !parent.current || delivering.current) return;
    const mounted = new Set(parent.current.querySelectorAll("[data-measured-cell]"));
    for (const element of observed.current) if (!mounted.has(element)) observer.unobserve(element);
    for (const element of mounted) if (!observed.current.has(element)) observer.observe(element);
    observed.current = mounted;
  };
  const measure = () => {
    const element = parent.current;
    if (!element || !cells || !layout) return;
    const ids = new Set(images.flatMap(image => image ? [image.id] : []));
    const next = new Map([...readings].filter(([id]) => ids.has(id)));
    let changed = next.size !== readings.size;
    let point: WindowGeometry["correctionAnchor"];
    const viewport = element.getBoundingClientRect();
    for (const cell of element.querySelectorAll<HTMLElement>("[data-measured-cell][data-image-id]")) {
      const id = cell.dataset.imageId!;
      if (!ids.has(id)) continue;
      const bounds = cell.getBoundingClientRect();
      const fields = Array.from(cell.querySelectorAll<HTMLElement>("[data-measured-field]"), field => {
        const rect = field.getBoundingClientRect();
        return { key: field.dataset.measuredField!, top: rect.top - bounds.top, height: rect.height };
      });
      const previous = readings.get(id);
      const height = bounds.height + 4;
      if (previous?.height === height && previous.width === width && previous.key === cells.key &&
          JSON.stringify(previous.fields) === JSON.stringify(fields)) continue;
      changed = true;
      next.set(id, { height, fields, width, key: cells.key });
      const captured = capture.current?.id === id ? capture.current : undefined;
      if (captured) {
        const position = captured.fields.findIndex(field => field.key === captured.key);
        const retained = captured.fields.slice(position).find(field => fields.some(next => next.key === field.key)) ?? captured.fields[0];
        const destination = fields.find(field => field.key === retained?.key);
        if (retained && destination) point = { id, beforeOffset: retained.top, afterOffset: destination.top,
          viewportOffset: captured.viewportOffset === undefined ? undefined
            : captured.viewportOffset + retained.top - captured.fields[position].top };
      } else if (!point && previous && bounds.bottom > viewport.top && bounds.top < viewport.bottom) {
        const field = previous.fields.find(field => bounds.top + field.top + field.height > viewport.top);
        const destination = fields.find(next => next.key === field?.key);
        if (field && destination) point = { id, beforeOffset: field.top, afterOffset: destination.top };
      }
    }
    if (changed) {
      capture.current = undefined;
      setCorrectionAnchor(point);
      setReadings(next);
    }
  };
  useLayoutEffect(() => { observeRef.current = observe; measureRef.current = measure; });
  useLayoutEffect(() => {
    if (!cells) return;
    const observer = new ResizeObserver(entries => {
      if (!entries.some(entry => {
        const id = (entry.target as HTMLElement).dataset.imageId;
        return !id || current.current.readings.get(id)?.height !== entry.target.getBoundingClientRect().height + 4;
      })) return;
      observer.disconnect();
      observed.current.clear();
      delivering.current = true;
      try { flushSync(() => measureRef.current()); }
      finally { delivering.current = false; }
      cancelAnimationFrame(observationFrame.current);
      observationFrame.current = requestAnimationFrame(() => { observationFrame.current = 0; observeRef.current(); });
    });
    observerRef.current = observer;
    return () => {
      cancelAnimationFrame(observationFrame.current);
      cancelAnimationFrame(inputFrame.current);
      capture.current = undefined;
      observer.disconnect(); observed.current.clear(); observerRef.current = null;
    };
  }, [!!cells]);
  useLayoutEffect(() => {
    measureRef.current();
    observeRef.current();
  });
  const captureInput = (event: FormEvent<HTMLDivElement>) => {
    const element = parent.current;
    const cell = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-measured-cell]") : null;
    const id = cell?.dataset.imageId;
    const reading = id ? readings.get(id) : undefined;
    if (!element || !cell || !id || !reading) return;
    const top = cell.getBoundingClientRect().top - element.getBoundingClientRect().top - parseFloat(getComputedStyle(element).paddingTop);
    const field = reading.fields.find(field => top + field.top + field.height > 0);
    if (field) {
      const pending = { id, fields: reading.fields, key: field.key, viewportOffset: top + field.top };
      capture.current = pending;
      cancelAnimationFrame(inputFrame.current);
      inputFrame.current = requestAnimationFrame(() => {
        inputFrame.current = 0;
        if (capture.current !== pending) return;
        flushSync(() => measureRef.current());
        if (capture.current === pending) capture.current = undefined;
      });
    }
  };
  const retireInput = () => { capture.current = undefined; cancelAnimationFrame(inputFrame.current); inputFrame.current = 0; };
  return { layout, captureInput, retireInput };
}