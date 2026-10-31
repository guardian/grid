import { useSyncExternalStore } from "react";

// Touch phones only: narrow desktop windows keep the desktop shell (cards make no sense with a mouse).
const compactMql = typeof window !== "undefined" ? window.matchMedia?.("(max-width: 639px) and (pointer: coarse)") : undefined;

function isCompactNow(): boolean {
  return compactMql?.matches ?? false;
}

function subscribe(cb: () => void) {
  compactMql?.addEventListener("change", cb);
  return () => compactMql?.removeEventListener("change", cb);
}

/** The `compact:` / `wide:` Tailwind variants key off this attribute. */
function syncAttribute() {
  if (typeof document !== "undefined") document.documentElement.dataset.shell = isCompactNow() ? "compact" : "wide";
}
syncAttribute();
subscribe(syncAttribute);

/** Phone shell: narrow viewport on a touch device. */
export function useIsCompact(): boolean {
  return useSyncExternalStore(subscribe, isCompactNow, () => false);
}

export { isCompactNow };
