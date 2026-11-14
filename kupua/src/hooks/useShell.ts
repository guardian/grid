import { useLayoutEffect, useSyncExternalStore } from "react";

// Touch phones only: narrow desktop windows keep the desktop shell (cards make no sense with a mouse).
const compactMql = typeof window !== "undefined" ? window.matchMedia?.("(max-width: 639px) and (pointer: coarse), (max-height: 639px) and (pointer: coarse)") : undefined;
const installedMql = typeof window !== "undefined" ? window.matchMedia?.("(display-mode: standalone), (display-mode: fullscreen)") : undefined;
const touchMql = typeof window !== "undefined" ? window.matchMedia?.("(any-pointer: coarse)") : undefined;

function isCompactNow(): boolean {
  return compactMql?.matches ?? false;
}

function subscribe(cb: () => void) {
  compactMql?.addEventListener("change", cb);
  return () => compactMql?.removeEventListener("change", cb);
}

function isTouchCapableNow(): boolean {
  return touchMql?.matches === true || (typeof navigator !== "undefined" && navigator.maxTouchPoints > 0);
}

function subscribeTouch(cb: () => void) {
  touchMql?.addEventListener("change", cb);
  return () => touchMql?.removeEventListener("change", cb);
}

/** The `compact:` / `wide:` Tailwind variants key off this attribute. */
function syncAttribute() {
  if (typeof document !== "undefined") document.documentElement.dataset.shell = isCompactNow() ? "compact" : "wide";
}
syncAttribute();
subscribe(syncAttribute);

function subscribeInstalled(cb: () => void) {
  installedMql?.addEventListener("change", cb);
  return () => installedMql?.removeEventListener("change", cb);
}

/** Installed compact chrome can use the cutout area without changing browser-tab viewports. */
export function useAppCutout(enabled: boolean) {
  const installed = useSyncExternalStore(subscribeInstalled,
    () => !!installedMql?.matches || (navigator as Navigator & { standalone?: boolean }).standalone === true,
    () => false);
  useLayoutEffect(() => {
    if (!enabled || !installed) return;
    const viewport = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
    if (!viewport) return;
    const original = viewport.content;
    viewport.content = original.replace(/,?\s*viewport-fit\s*=\s*[^,]+/g, "") + ", viewport-fit=cover";
    document.documentElement.dataset.appCutout = "true";
    return () => {
      viewport.content = original;
      delete document.documentElement.dataset.appCutout;
    };
  }, [enabled, installed]);
}

export function useIsCompact(): boolean {
  return useSyncExternalStore(subscribe, isCompactNow, () => false);
}

export function useTouchCapable(): boolean {
  return useSyncExternalStore(subscribeTouch, isTouchCapableNow, () => false);
}

export { isCompactNow };
