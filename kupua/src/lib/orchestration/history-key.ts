/**
 * kupuaKey — stable per-history-entry identity for snapshot-based
 * position restoration on browser back/forward.
 *
 * TSR's `state.key` is unsuitable: it changes on every navigation
 * including replace (intentional in @tanstack/history — their key
 * matches a navigation *action*, not an entry). We mint our own UUID
 * on push and carry it forward on replace.
 *
 * See: exploration/docs/browser-history-analysis.md § "Per-entry identity"
 */

// ---------------------------------------------------------------------------
// Mint
// ---------------------------------------------------------------------------

/** Mint a fresh kupuaKey (for push navigations and cold-load synthesis). */
export function mintKupuaKey(): string {
  // crypto.randomUUID() requires a secure context (HTTPS or localhost).
  // When accessed over LAN (http://192.168.x.x), Chrome treats the page
  // as insecure and crypto.randomUUID is undefined. Fall back to a
  // manual UUID-v4 using crypto.getRandomValues (available everywhere).
  if (typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // RFC 4122 version 4 UUID via getRandomValues
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 10
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

/**
 * Read the current entry's kupuaKey from the browser's history state.
 *
 * Reads `window.history.state` (the browser's canonical state) rather
 * than TSR's `router.history.location.state`. TSR's internal copy can
 * lag behind our direct `history.replaceState` calls (cold-load
 * synthesis). `window.history.state` is always up to date.
 *
 * Returns `undefined` if no key has been synthesised yet.
 */
export function getCurrentKupuaKey(): string | undefined {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (history.state as any)?.kupuaKey as string | undefined;
}

// ---------------------------------------------------------------------------
// State builders — for TSR navigate({ state })
// ---------------------------------------------------------------------------

/**
 * Build a state object carrying the *current* entry's kupuaKey through
 * a replace navigation. Call sites that replace (traversal, debounced
 * typing follow-ups, default-injection) use this so the key survives.
 *
 * Preserves the entire existing `history.state` — not just kupuaKey —
 * so that flags stamped by other code (e.g. `_bareListSynthesized` from
 * ImageDetail synthesis) survive across replace navigations.
 *
 * If `extraState` is provided, it is shallow-merged over the existing
 * state (kupuaKey always wins).
 */
export function withCurrentKupuaKey(
  extraState?: Record<string, unknown>,
): Record<string, unknown> {
  const kupuaKey = getCurrentKupuaKey();
  // If no key exists yet (cold load before synthesis), don't inject
  // an undefined — let the cold-load synthesis handle it.
  if (kupuaKey === undefined) return extraState ?? {};
  return { ...history.state, ...extraState, kupuaKey };
}

/**
 * Build a state object with a freshly minted kupuaKey for a push
 * navigation. The new entry gets its own identity; the *predecessor*
 * keeps the old key (already in history.state).
 *
 * If `extraState` is provided, it is shallow-merged under the kupuaKey.
 */
export function withFreshKupuaKey(
  extraState?: Record<string, unknown>,
): Record<string, unknown> {
  return { ...extraState, kupuaKey: mintKupuaKey() };
}

// ---------------------------------------------------------------------------
// Cold-load synthesis
// ---------------------------------------------------------------------------

/**
 * Ensure the current history entry has a kupuaKey. Called once on app
 * mount (before any other history mutation). If the entry already has
 * a key (e.g. surviving reload via browser-persisted history.state),
 * this is a no-op.
 *
 * Uses raw `history.replaceState` to inject the key without triggering
 * a TSR navigation cycle.
 */
export function synthesiseKupuaKeyIfAbsent(): void {
  const existing = getCurrentKupuaKey();
  if (existing) return;

  const key = mintKupuaKey();
  const currentState = history.state ?? {};
  // "" keeps the current URL per HTML spec (equivalent to location.href).
  history.replaceState(
    { ...currentState, kupuaKey: key },
    "",
  );
}
