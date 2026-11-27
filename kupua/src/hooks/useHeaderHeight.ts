import { useCallback, useRef, useState } from "react";

/**
 * Measures the actual rendered border-box height of a header element via
 * ResizeObserver. Returns a [callbackRef, measuredHeight] tuple.
 *
 * Assign the callbackRef to the header element:
 *   <div ref={headerCallbackRef} className="sticky top-0 ...">
 *
 * The hook fires synchronously on mount (reading the element's initial height)
 * and again if the header resizes (font load, window resize, added rows).
 *
 * Falls back to `fallback` on the first render frame before the DOM is ready —
 * ensures dependent calculations (e.g. virtualizer scrollPaddingStart) have
 * a reasonable estimate immediately.
 *
 * Performance: ResizeObserver observes border-box size, NOT scroll position.
 * It does NOT fire during scroll. Zero cost on the scroll path.
 *
 * @param fallback  Initial height to use before the element is mounted and
 *                  measured. Should match TABLE_HEADER_HEIGHT from constants.
 */
export function useHeaderHeight(fallback: number): [
  (el: HTMLElement | null) => void,
  number,
] {
  const [height, setHeight] = useState(fallback);
  const observerRef = useRef<ResizeObserver | null>(null);

  const callbackRef = useCallback(
    (el: HTMLElement | null) => {
      // Disconnect the previous observer on every call (element replaced or
      // component unmounted).
      if (observerRef.current) {
        observerRef.current.disconnect();
        observerRef.current = null;
      }
      if (!el) return;

      // Read the initial height synchronously so the virtualizer doesn't need
      // to wait for a ResizeObserver callback tick.
      const initial = el.getBoundingClientRect().height;
      if (initial > 0) setHeight(initial);

      const observer = new ResizeObserver((entries) => {
        // borderBoxSize is the most accurate — includes padding + border.
        const entry = entries[0];
        const h = entry?.borderBoxSize?.[0]?.blockSize ?? el.getBoundingClientRect().height;
        if (h > 0) setHeight(h);
      });
      // Observe border-box so the 1px border-b is included in the measurement.
      observer.observe(el, { box: "border-box" });
      observerRef.current = observer;
    },
    [], // stable — no dependencies; setHeight is stable per React guarantee
  );

  return [callbackRef, height];
}

