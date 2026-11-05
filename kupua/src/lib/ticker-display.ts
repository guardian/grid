import type { TickerCountResult } from "@/dal";
import { gridConfig, type TickerDefinition } from "@/lib/grid-config";

export interface DisplayTicker extends TickerCountResult {
  name: string;
  searchClause: string;
  backgroundColour: string;
  /** The `is:` value the badge applies. */
  isValue: string;
}

/**
 * Tickers to show, in a stable order: configured definitions first (preserving the
 * UI's org-owned → agency-picks order), then server-only tickers in response order.
 * Returned metadata wins; configured metadata fills gaps. Only `is:` clauses render.
 */
export function displayTickers(
  counts: Record<string, TickerCountResult> | null,
  definitions: readonly TickerDefinition[] = gridConfig.tickerDefinitions,
): DisplayTicker[] {
  if (!counts) return [];
  const configured = new Map(definitions.map((def) => [def.name, def]));
  const names = [
    ...definitions.map((def) => def.name).filter((name) => name in counts),
    ...Object.keys(counts).filter((name) => !configured.has(name)),
  ];
  const shown: DisplayTicker[] = [];
  for (const name of names) {
    const count = counts[name];
    const def = configured.get(name);
    const searchClause = count.searchClause ?? def?.searchClause;
    const backgroundColour = count.backgroundColour ?? def?.backgroundColour;
    if (!searchClause?.startsWith("is:") || searchClause.length <= 3 || !backgroundColour) continue;
    shown.push({ ...count, name, searchClause, backgroundColour, isValue: searchClause.slice(3) });
  }
  return shown;
}
