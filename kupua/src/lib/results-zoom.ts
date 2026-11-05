/**
 * Results zoom ladders. A zoom level is an offset from the default (0 = default),
 * so the default geometry is identical everywhere — e2e and perf campaigns stay
 * comparable. Ladders depend on container width: phones and desktops get different
 * steps, each step always changes what you see.
 */

export const ZOOM_STEPS = 6;
const TYPICAL_RATIO = 1.5;

// ---------------------------------------------------------------------------
// Justified
// ---------------------------------------------------------------------------

/** Multipliers of "images per row" (typical 3:2 image) relative to the default. */
const JUSTIFIED_PHONE = { factors: [2.6, 1.8, 1.35, 1, 1 / 1.5, 1 / 2.2], defaultIndex: 3 };
/** Desktop ladder sits one notch bigger: two smaller steps, three bigger. */
const JUSTIFIED_DESKTOP = { factors: [1.8, 1.35, 1, 1 / 1.5, 1 / 2.2, 1 / 3.2], defaultIndex: 2 };
/** Minimum images-per-row floor for bigger steps, so the top steps never collapse. */
const LARGEST_STEP = 1.35;

export function justifiedBaseRowHeight(width: number): number {
  return width < 600 ? 130 : 190;
}

function justifiedLadder(width: number) {
  return width < 600 ? JUSTIFIED_PHONE : JUSTIFIED_DESKTOP;
}

export function justifiedOffsetRange(width: number): [number, number] {
  const { factors, defaultIndex } = justifiedLadder(width);
  return [-defaultIndex, factors.length - 1 - defaultIndex];
}

/** Row-height multiplier for a zoom offset at a container width; offset 0 is exactly 1. */
export function justifiedRowScale(offset: number, width: number): number {
  if (width <= 0) return 1;
  const { factors, defaultIndex } = justifiedLadder(width);
  const index = clampIndex(defaultIndex + offset, factors.length);
  if (index === defaultIndex) return 1;
  const base = justifiedBaseRowHeight(width);
  const perRowDefault = width / (base * TYPICAL_RATIO);
  let perRow = perRowDefault * factors[index];
  if (index > defaultIndex) {
    // Narrow screens: keep distinct steps down to ~one landscape image per row.
    perRow = Math.min(perRow, perRowDefault * 0.85 ** (index - defaultIndex));
    perRow = Math.max(perRow, LARGEST_STEP ** (factors.length - 1 - index));
  }
  return width / (perRow * TYPICAL_RATIO) / base;
}

// ---------------------------------------------------------------------------
// Grid
// ---------------------------------------------------------------------------

export interface GridSpec { minCellWidth: number; thumbHeight: number; meta: boolean; dateOnly: boolean }

/** The classic 280px/303px grid: the default at every width. */
export const GRID_CLASSIC: GridSpec = { minCellWidth: 280, thumbHeight: 190, meta: true, dateOnly: false };

/** Phone ladder (fewer than 3 classic columns): ≈5/4/3/2/1 image-only, then 1 with metadata. */
const GRID_PHONE: GridSpec[] = [
  { minCellWidth: 72, thumbHeight: 64, meta: false, dateOnly: false },
  { minCellWidth: 90, thumbHeight: 80, meta: false, dateOnly: false },
  { minCellWidth: 120, thumbHeight: 110, meta: false, dateOnly: false },
  { minCellWidth: 180, thumbHeight: 160, meta: false, dateOnly: false },
  // Just the date line: tells this level apart from its neighbours on phones.
  { minCellWidth: 230, thumbHeight: 260, meta: false, dateOnly: true },
  GRID_CLASSIC,
];

/** Below this cell width the metadata block no longer fits usefully. */
const META_MIN_CELL_WIDTH = 200;

function gridLadder(width: number): { levels: GridSpec[]; defaultIndex: number } {
  const classicColumns = Math.floor(width / GRID_CLASSIC.minCellWidth);
  if (classicColumns < 3) return { levels: GRID_PHONE, defaultIndex: GRID_PHONE.length - 1 };
  // Desktop: one column per notch, three smaller and two bigger than the classic grid.
  const levels = [3, 2, 1, 0, -1, -2].map((delta) => {
    if (delta === 0) return GRID_CLASSIC;
    const minCellWidth = Math.floor(width / (classicColumns + delta));
    return {
      minCellWidth,
      thumbHeight: Math.round(GRID_CLASSIC.thumbHeight * minCellWidth / GRID_CLASSIC.minCellWidth),
      meta: minCellWidth >= META_MIN_CELL_WIDTH,
      dateOnly: false,
    };
  });
  return { levels, defaultIndex: 3 };
}

export function gridOffsetRange(width: number): [number, number] {
  const { levels, defaultIndex } = gridLadder(width);
  return [-defaultIndex, levels.length - 1 - defaultIndex];
}

export function gridSpec(offset: number, width: number): GridSpec {
  if (width <= 0) return GRID_CLASSIC;
  const { levels, defaultIndex } = gridLadder(width);
  return levels[clampIndex(defaultIndex + offset, levels.length)];
}

const GRID_META_HEIGHT = 105;
export const GRID_DATE_LINE_HEIGHT = 22;

export function gridRowHeight(spec: GridSpec, gap: number): number {
  return spec.thumbHeight + (spec.meta ? GRID_META_HEIGHT : spec.dateOnly ? GRID_DATE_LINE_HEIGHT : 0) + gap;
}

// ---------------------------------------------------------------------------
// Shared
// ---------------------------------------------------------------------------

function clampIndex(index: number, count: number): number {
  return Math.max(0, Math.min(count - 1, index));
}

/** One step per deliberate pinch (Google Photos model): +1 bigger, -1 smaller, 0 wobble. */
export function pinchStep(factor: number): number {
  return factor > 1.12 ? 1 : factor < 0.89 ? -1 : 0;
}

export function readZoomOffset(key: string, fallback = 0): number {
  try {
    const value = Number(sessionStorage.getItem(key) ?? fallback);
    return Number.isInteger(value) && Math.abs(value) < ZOOM_STEPS ? value : 0;
  } catch {
    return 0;
  }
}

export function writeZoomOffset(key: string, value: number): void {
  try { sessionStorage.setItem(key, String(value)); } catch {}
}
