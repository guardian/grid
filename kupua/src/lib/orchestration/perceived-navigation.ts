export function traceActionsForNavigation(
  isUserInitiated: boolean,
  isSortOnly: boolean,
  changedSearchKeys: string[],
): string[] {
  if (!isUserInitiated) return [];
  if (isSortOnly) return ["sort-around-focus", "sort-no-focus"];
  if (changedSearchKeys.length === 1 && changedSearchKeys[0] === "query") {
    return ["metadata-click", "facet-click", "chip-remove", "search"];
  }
  return [];
}