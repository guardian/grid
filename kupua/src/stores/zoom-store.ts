import { create } from "zustand";
import { readZoomOffset, writeZoomOffset } from "@/lib/results-zoom";
import { readHomeView } from "@/lib/home-view";
import type { Density } from "@/stores/ui-prefs-store";

type Zoomable = "justified" | "grid";
const KEYS: Record<Zoomable, string> = { justified: "kupua-justified-zoom", grid: "kupua-grid-zoom" };

interface ZoomState {
  /** Offsets from each density's default level (0 = default). */
  justifiedOffset: number;
  gridOffset: number;
  /** Valid offsets at the current container width, registered by the mounted view. */
  ranges: Record<Zoomable, [number, number]>;
  setRange: (density: Zoomable, range: [number, number]) => void;
  setOffset: (density: Density, offset: number) => void;
  /** +1 = bigger thumbnails, -1 = smaller. Table has no zoom. */
  step: (density: Density, delta: number) => void;
  reset: (density: Density) => void;
  /** Home: back to the locked view's zoom (or default). */
  resetToHome: () => void;
}

const field = (density: Zoomable) => (density === "justified" ? "justifiedOffset" : "gridOffset");

/** Session-scoped zoom shared by pinch, keyboard and the ⋮ menu. */
export const useZoomStore = create<ZoomState>()((set, get) => ({
  justifiedOffset: readZoomOffset(KEYS.justified, readHomeView()?.justifiedOffset),
  gridOffset: readZoomOffset(KEYS.grid, readHomeView()?.gridOffset),
  ranges: { justified: [-5, 5], grid: [-5, 5] },
  setRange: (density, range) => {
    const { ranges } = get();
    if (ranges[density][0] === range[0] && ranges[density][1] === range[1]) return;
    set({ ranges: { ...ranges, [density]: range } });
    // Resizing across ladders (e.g. rotating a tablet) may leave the offset out of range.
    get().setOffset(density, get()[field(density)]);
  },
  setOffset: (density, offset) => {
    if (density === "table") return;
    const [min, max] = get().ranges[density];
    const next = Math.max(min, Math.min(max, offset));
    if (next === get()[field(density)]) return;
    writeZoomOffset(KEYS[density], next);
    set({ [field(density)]: next } as Partial<ZoomState>);
  },
  step: (density, delta) => {
    if (density === "table") return;
    get().setOffset(density, get()[field(density)] + delta);
  },
  reset: (density) => get().setOffset(density, 0),
  resetToHome: () => {
    const home = readHomeView();
    get().setOffset("justified", home?.justifiedOffset ?? 0);
    get().setOffset("grid", home?.gridOffset ?? 0);
  },
}));
