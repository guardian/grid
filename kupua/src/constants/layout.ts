/**
 * Shared layout pixel constants.
 *
 * Single source of truth for pixel values that appear in:
 * - App components (ImageTable, ImageGrid)
 * - Zustand store tests
 * - E2E test helpers
 *
 * If any of these change (e.g. Tailwind class change or design revision),
 * update here and the change propagates everywhere automatically.
 */

/** Table row height (px). Matches the Tailwind h-8 class on table rows. */
export const TABLE_ROW_HEIGHT = 32;

/** Table sticky header height including 1px border-b. Matches h-11 + border. */
export const TABLE_HEADER_HEIGHT = 45;

/** Grid row height (px). Thumbnail (190) + metadata (~105) + cell gap (8). */
export const GRID_ROW_HEIGHT = 303;

/** Grid minimum cell width (px). Columns = floor(containerWidth / MIN_CELL_WIDTH). */
export const GRID_MIN_CELL_WIDTH = 280;

/** Grid cell gap (px). */
export const GRID_CELL_GAP = 8;

