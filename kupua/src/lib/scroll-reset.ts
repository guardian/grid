/**
 * resetScrollAndFocusSearch — imperatively resets the scroll position of
 * whichever result container (table or grid) is mounted, and moves focus
 * to the CQL search input.
 *
 * This is intentionally imperative: the scroll containers live in
 * ImageTable / ImageGrid and the callers (SearchBar logo, ImageDetail logo)
 * are unrelated siblings in the component tree. A store-based approach
 * would add a subscription + effect in two consumers for a fire-once action
 * that only occurs on logo clicks — DOM access is simpler and adequate.
 *
 * Dispatches a synthetic `scroll` event after resetting `scrollTop` because
 * programmatic scrollTop changes on hidden (`opacity-0`) containers may not
 * fire a native scroll event in all browsers, and the virtualizer needs it.
 *
 * IMPORTANT: calls abortExtends() BEFORE resetting scrollTop. The synthetic
 * scroll event fires synchronously and triggers the scroll handler →
 * reportVisibleRange → extendBackward. If the buffer is at a deep offset
 * (e.g. after a scrubber seek), extendBackward would prepend stale data
 * and corrupt the buffer. abortExtends() sets a 2-second cooldown that
 * blocks extendBackward at its synchronous guard.
 */

import { resetVisibleRange } from "@/hooks/useDataWindow";
import { getScrollContainer } from "@/lib/scroll-container-ref";
import { fireScrollReset } from "@/lib/scroll-reset-ref";
import { useSearchStore } from "@/stores/search-store";

export function resetScrollAndFocusSearch() {
  // Abort in-flight extends and set cooldown BEFORE the synthetic scroll
  // event can trigger extendBackward on a stale deep-offset buffer.
  useSearchStore.getState().abortExtends();

  const scrollContainer = getScrollContainer();
  if (scrollContainer) {
    scrollContainer.scrollTop = 0;
    scrollContainer.scrollLeft = 0;
    scrollContainer.dispatchEvent(new Event("scroll"));
  }

  // Also reset the virtualizer's internal scrollOffset — setting DOM scrollTop
  // alone is insufficient because TanStack Virtual syncs asynchronously via
  // scroll events. During rapid state transitions (deep seek → Home click),
  // the virtualizer can lag behind the DOM.
  fireScrollReset();

  // Immediately reset the visible range so the Scrubber thumb reflects
  // position 0 without waiting for the scroll handler to fire.
  resetVisibleRange();

  // Directly reset the scrubber thumb and tooltip DOM positions to top.
  // This bypasses React's render cycle for instant visual feedback — the
  // React-computed position will catch up on the next render after search
  // completes with bufferOffset: 0.
  const thumb = document.querySelector<HTMLElement>("[data-scrubber-thumb]");
  if (thumb) thumb.style.top = "0px";

  requestAnimationFrame(() => {
    const cqlInput = document.querySelector("cql-input");
    if (cqlInput instanceof HTMLElement) cqlInput.focus();
  });
}
