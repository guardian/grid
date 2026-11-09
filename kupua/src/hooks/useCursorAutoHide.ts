/**
 * useCursorAutoHide — hide cursor after inactivity in fullscreen.
 *
 * YouTube-style: cursor disappears after 2s of no mouse movement.
 * Moving the mouse brings it back immediately. Hovering over nav zones
 * (signalled via `navMouseEnter`/`navMouseLeave` callbacks) keeps the
 * cursor visible indefinitely.
 *
 * Used by both FullscreenPreview and ImageDetail fullscreen.
 */

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

const IDLE_TIMEOUT = 2000;

export function useCursorAutoHide(isActive: boolean, touchSurfaceRef?: RefObject<HTMLElement | null>) {
  const [cursorHidden, setCursorHidden] = useState(false);
  const [touchControlsVisible, setTouchControlsVisible] = useState(false);
  const cursorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchVisibleRef = useRef(false);
  const lastTouchTimeRef = useRef<number | null>(null);
  const activeRef = useRef(isActive);
  activeRef.current = isActive;
  const overNavRef = useRef(false);

  useEffect(() => {
    if (!isActive) {
      setCursorHidden(false);
      if (cursorTimerRef.current) clearTimeout(cursorTimerRef.current);
      return;
    }

    const resetTimer = () => {
      setCursorHidden(false);
      if (cursorTimerRef.current) clearTimeout(cursorTimerRef.current);
      cursorTimerRef.current = setTimeout(() => {
        if (!overNavRef.current) setCursorHidden(true);
      }, IDLE_TIMEOUT);
    };

    const onMouseMove = () => {
      const lastTouch = lastTouchTimeRef.current;
      if (lastTouch !== null && Date.now() - lastTouch < 500) return;
      touchVisibleRef.current = false;
      setTouchControlsVisible(false);
      if (touchTimerRef.current) clearTimeout(touchTimerRef.current);
      resetTimer();
    };
    resetTimer(); // start the timer on enter
    document.addEventListener("mousemove", onMouseMove);
    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      if (cursorTimerRef.current) clearTimeout(cursorTimerRef.current);
    };
  }, [isActive]);

  useEffect(() => {
    const surface = touchSurfaceRef?.current;
    if (!surface) {
      touchVisibleRef.current = false;
      setTouchControlsVisible(false);
      return;
    }
    const onTouchStart = () => { lastTouchTimeRef.current = Date.now(); };
    const onClick = (event: MouseEvent) => {
      if ((event as PointerEvent).pointerType !== "touch"
        && (lastTouchTimeRef.current === null || Date.now() - lastTouchTimeRef.current >= 500)) return;
      const wasVisible = touchVisibleRef.current;
      const control = event.target instanceof Element
        ? event.target.closest("button,a,input,select,textarea,label,[role=button]") : null;
      if (!wasVisible && (!control || control.hasAttribute("data-image-control"))) {
        event.preventDefault();
        event.stopPropagation();
      }
      touchVisibleRef.current = true;
      overNavRef.current = false;
      setTouchControlsVisible(true);
      setCursorHidden(false);
      if (cursorTimerRef.current) clearTimeout(cursorTimerRef.current);
      if (touchTimerRef.current) clearTimeout(touchTimerRef.current);
      touchTimerRef.current = setTimeout(() => {
        touchVisibleRef.current = false;
        setTouchControlsVisible(false);
        if (activeRef.current) setCursorHidden(true);
      }, IDLE_TIMEOUT);
    };
    surface.addEventListener("touchstart", onTouchStart, { passive: true });
    surface.addEventListener("click", onClick, true);
    return () => {
      surface.removeEventListener("touchstart", onTouchStart);
      surface.removeEventListener("click", onClick, true);
      if (touchTimerRef.current) clearTimeout(touchTimerRef.current);
      touchVisibleRef.current = false;
      lastTouchTimeRef.current = null;
    };
  }, [touchSurfaceRef]);

  const navMouseEnter = useCallback(() => { overNavRef.current = true; }, []);
  const navMouseLeave = useCallback(() => { overNavRef.current = false; }, []);

  return { cursorHidden, navMouseEnter, navMouseLeave, touchControlsVisible };
}

