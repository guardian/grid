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

import { useCallback, useEffect, useRef, useState } from "react";

const IDLE_TIMEOUT = 2000;

export function useCursorAutoHide(isActive: boolean) {
  const [cursorHidden, setCursorHidden] = useState(false);
  const cursorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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

    resetTimer(); // start the timer on enter
    document.addEventListener("mousemove", resetTimer);
    return () => {
      document.removeEventListener("mousemove", resetTimer);
      if (cursorTimerRef.current) clearTimeout(cursorTimerRef.current);
    };
  }, [isActive]);

  const navMouseEnter = useCallback(() => { overNavRef.current = true; }, []);
  const navMouseLeave = useCallback(() => { overNavRef.current = false; }, []);

  return { cursorHidden, navMouseEnter, navMouseLeave };
}

