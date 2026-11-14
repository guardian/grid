/** Candidates have already passed their owner's residency, visibility and lifetime checks. */
export function chooseDensityAnchor<T>({ retained, focus, browsingDeparture, viewport }: {
  retained: T | null;
  focus: T | null;
  browsingDeparture: boolean;
  viewport: () => T | null;
}): T | null {
  return retained ?? (browsingDeparture ? viewport() : focus ?? viewport());
}

/** Reflow and thumbnail zoom prefer selection; density switching does not. */
export function chooseReflowAnchor<T>({ selection, focus, viewport }: {
  selection: T | null;
  focus: T | null;
  viewport: () => T | null;
}): T | null {
  return selection ?? focus ?? viewport();
}
