import type { JustifiedZoomTransition } from "./justified-zoom-transition";

export function bindJustifiedZoomGestures(element: HTMLElement, transition: JustifiedZoomTransition,
  pinchAnchor?: { capture: (x: number, y: number) => void; clear: () => void }): () => void {
  let startDistance = 0;
  let contactIds: readonly [number, number] | undefined;
  let used = false;
  let ended = false;
  let wheelFactor = 1;
  let wheelTimer = 0;
  let lastEvent: Event | undefined;
  const origins = new Set<EventTarget>();
  const localContacts = new Set<number>();
  const distance = (touches: TouchList) => Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY);
  const ownsPair = (touches: TouchList) => touches.length === 2 && contactIds && (
    touches[0].identifier === contactIds[0] && touches[1].identifier === contactIds[1]
    || touches[0].identifier === contactIds[1] && touches[1].identifier === contactIds[0]
  );

  const releaseOrigins = () => {
    for (const origin of origins) {
      origin.removeEventListener("touchmove", onMove as EventListener, true);
      origin.removeEventListener("touchend", onEnd as EventListener, true);
      origin.removeEventListener("touchcancel", onEnd as EventListener, true);
    }
    origins.clear();
    localContacts.clear();
    contactIds = undefined;
    lastEvent = undefined;
  };
  const trackOrigins = (event: TouchEvent) => {
    for (const touch of Array.from(event.touches)) {
      const origin = touch.target ?? event.target ?? element;
      if (!origins.has(origin)) {
        origins.add(origin);
        // Repacking can detach the original touched cells. Native touch events keep
        // targeting those nodes and no longer bubble to the results container.
        origin.addEventListener("touchend", onEnd as EventListener, { capture: true, passive: true });
        origin.addEventListener("touchcancel", onEnd as EventListener, { capture: true, passive: true });
      }
      if (used && !ended) origin.addEventListener("touchmove", onMove as EventListener, { capture: true, passive: false });
    }
  };
  const onStart = (event: TouchEvent) => {
    if (!used) {
      for (const touch of Array.from(event.touches)) {
        if (touch.target instanceof Node && element.contains(touch.target)) localContacts.add(touch.identifier);
      }
      // The first contact can detach during native scrolling before the second lands.
      trackOrigins(event);
    }
    if (used) {
      trackOrigins(event);
      if (event.cancelable && event.touches.length >= 2) event.preventDefault();
      if (!ended && event.touches.length > 2) {
        ended = true;
        startDistance = 0;
        transition.interrupt();
        pinchAnchor?.clear();
      }
      return;
    }
    if (event.touches.length !== 2) return;
    const [first, second] = [event.touches[0], event.touches[1]];
    if (!localContacts.has(first.identifier) || !localContacts.has(second.identifier)) return;
    if (first.identifier === second.identifier) return;
    startDistance = distance(event.touches);
    if (!startDistance) return;
    contactIds = [first.identifier, second.identifier];
    used = true;
    ended = false;
    if (event.cancelable) event.preventDefault();
    trackOrigins(event);
    transition.begin((event.touches[0].clientX + event.touches[1].clientX) / 2, (event.touches[0].clientY + event.touches[1].clientY) / 2);
    pinchAnchor?.capture((first.clientX + second.clientX) / 2, (first.clientY + second.clientY) / 2);
  };
  function onMove(event: TouchEvent) {
    if (event === lastEvent) return;
    lastEvent = event;
    if (!used || ended) return;
    if (!ownsPair(event.touches)) {
      trackOrigins(event);
      ended = true;
      startDistance = 0;
      transition.end(true);
      pinchAnchor?.clear();
      return;
    }
    if (event.cancelable) event.preventDefault();
    transition.update(distance(event.touches) / startDistance);
  }
  function onEnd(event: TouchEvent) {
    if (event === lastEvent) return;
    lastEvent = event;
    if (!used) {
      const remaining = new Set(Array.from(event.touches, touch => touch.identifier));
      for (const id of localContacts) if (!remaining.has(id)) localContacts.delete(id);
      if (event.touches.length === 0) releaseOrigins();
      return;
    }
    trackOrigins(event);
    if (!ended && (event.type === "touchcancel" || !ownsPair(event.touches))) {
      ended = true;
      startDistance = 0;
      transition.end(event.type === "touchcancel" || event.touches.length >= 2);
      pinchAnchor?.clear();
    }
    // A recontact while one finger remains is still the same gesture, not a
    // second zoom level. Keep listening until every contact has been released.
    if (event.touches.length === 0) {
      used = false;
      releaseOrigins();
    }
  }
  const onWheel = (event: WheelEvent) => {
    if (!event.ctrlKey) { transition.interrupt(); pinchAnchor?.clear(); return; }
    event.preventDefault();
    if (used) return;
    if (!wheelTimer) { wheelFactor = 1; transition.begin(event.clientX, event.clientY); }
    const pixels = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? element.clientHeight : 1);
    wheelFactor = Math.max(0.25, Math.min(4, wheelFactor * Math.exp(-pixels * 0.006)));
    transition.update(wheelFactor);
    clearTimeout(wheelTimer);
    wheelTimer = window.setTimeout(() => { wheelTimer = 0; transition.end(); }, 140);
  };
  const interrupt = () => {
    startDistance = 0;
    used = false;
    ended = false;
    clearTimeout(wheelTimer);
    wheelTimer = 0;
    releaseOrigins();
    transition.interrupt();
    pinchAnchor?.clear();
  };
  element.addEventListener("touchstart", onStart, { passive: false });
  element.addEventListener("wheel", onWheel, { passive: false });
  window.addEventListener("blur", interrupt);
  document.addEventListener("visibilitychange", interrupt);
  return () => {
    interrupt();
    element.removeEventListener("touchstart", onStart);
    element.removeEventListener("wheel", onWheel);
    window.removeEventListener("blur", interrupt);
    document.removeEventListener("visibilitychange", interrupt);
  };
}
