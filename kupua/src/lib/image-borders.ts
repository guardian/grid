/**
 * IMAGE_BORDERS — maps usageRights.category values to border colours.
 *
 * Used by both ImageGrid (cell border) and ImageTable (row left accent).
 * Kahuna parity: staff/contract/commissioned photographers get #005689.
 */
export const IMAGE_BORDERS: Record<string, string> = {
  "staff-photographer": "#005689",
  "contract-photographer": "#005689",
  "commissioned-photographer": "#005689",
};
