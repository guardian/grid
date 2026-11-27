import type { TickerCountResult } from "@/dal";
import { gridConfig, type TickerDefinition } from "@/lib/grid-config";

export interface DisplayTicker extends TickerCountResult {
  name: string;
  shortName?: string;
  searchClause: string;
  backgroundColour: string;
  /** The `is:` value the badge applies. */
  isValue: string;
}

const shortTickerNames: Readonly<Record<string, string>> = {
  "GNM-owned": "GNM",
  "agency-pick": "agency",
};

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
    const isValue = searchClause.slice(3);
    const shortName = shortTickerNames[isValue];
    shown.push({ ...count, name, searchClause, backgroundColour, isValue, ...(shortName ? { shortName } : {}) });
  }
  return shown;
}
