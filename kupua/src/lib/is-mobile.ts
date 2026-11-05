/**
 * isMobile — touch-primary device detection.
 *
 * Used to suppress autofocus behaviours that would summon the on-screen
 * keyboard and obscure half the UI. Matches the `(pointer: coarse)` check
 * used elsewhere (image-prefetch, image-urls, ui-prefs-store).
 */
export function isMobile(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(pointer: coarse)").matches;
}
