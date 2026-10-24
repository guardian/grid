/**
 * Fullscreen hook — thin wrapper around the Fullscreen API.
 *
 * CRITICAL DESIGN PROPERTY: The fullscreen element must be a **stable DOM
 * node** that persists across image navigation. The Fullscreen API exits
 * fullscreen when the fullscreened element is removed from the DOM.
 *
 * Image detail is an overlay within the search route — React reconciles
 * the same `ImageDetail` component when only the `image` prop changes,
 * so the fullscreened `<div ref>` stays in the DOM and fullscreen persists
 * across prev/next navigation. This is how flicking through images in
 * fullscreen works — the container stays, only the image src updates.
 */

import { useCallback, useEffect, useState, type RefObject } from "react";

export function useFullscreen(ref: RefObject<HTMLElement | null>) {
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Listen for fullscreen changes (including user pressing Escape)
  useEffect(() => {
    const handleChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", handleChange);
    return () => document.removeEventListener("fullscreenchange", handleChange);
  }, []);

  const toggleFullscreen = useCallback(() => {
    const el = ref.current;
    if (!el) return;

    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {
        // Silently ignore — may fail if already exiting
      });
    } else {
      el.requestFullscreen().catch(() => {
        // Silently ignore — may fail if not user-initiated
      });
    }
  }, [ref]);

  const enterFullscreen = useCallback(() => {
    const el = ref.current;
    if (!el || document.fullscreenElement) return;
    el.requestFullscreen().catch(() => {});
  }, [ref]);

  const exitFullscreen = useCallback(() => {
    if (!document.fullscreenElement) return;
    document.exitFullscreen().catch(() => {});
  }, []);

  return { isFullscreen, toggleFullscreen, enterFullscreen, exitFullscreen };
}

