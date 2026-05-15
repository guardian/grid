/**
 * Compact count formatter — shared by FacetFilters and CollectionTree.
 *
 * - 1,234 → "1,234"
 * - 12,345 → "12k"
 * - 1,234,567 → "1.2M"
 */
export function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 10_000) return `${Math.round(n / 1_000)}k`;
  return n.toLocaleString();
}
