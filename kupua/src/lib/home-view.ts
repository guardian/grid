import type { Density } from "@/stores/ui-prefs-store";

/** "Lock this view": the user's chosen Home density and zoom, persisted across tabs. */
export interface HomeView {
  density: Density;
  justifiedOffset: number;
  gridOffset: number;
}

const KEY = "kupua-home-view";

export function readHomeView(): HomeView | null {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) ?? "null");
    if (!value || !["grid", "table", "justified"].includes(value.density)) return null;
    return {
      density: value.density,
      justifiedOffset: Number.isInteger(value.justifiedOffset) ? value.justifiedOffset : 0,
      gridOffset: Number.isInteger(value.gridOffset) ? value.gridOffset : 0,
    };
  } catch {
    return null;
  }
}

export function writeHomeView(view: HomeView | null): void {
  try {
    if (view) localStorage.setItem(KEY, JSON.stringify(view));
    else localStorage.removeItem(KEY);
  } catch {}
}
