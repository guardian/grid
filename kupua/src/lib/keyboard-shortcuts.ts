/**
 * Centralised keyboard shortcut registry.
 *
 * Single-character shortcuts follow a universal pattern:
 *   - When focus is NOT in an editable field → bare key fires the shortcut
 *   - When focus IS in an editable field → Alt+key fires the shortcut
 *   - Both combos always work when not editing (power users can use either)
 *
 * Alt was chosen because:
 *   - Cmd/Ctrl conflicts with browser builtins (Cmd+F = Find, Cmd+[ = Back)
 *   - Alt+letter on macOS types dead characters (ƒ, ", ') — irrelevant in
 *     a CQL search field for an image DAM
 *   - Alt has no browser or OS conflicts on any platform
 *
 * One `keydown` listener on `document` (capture phase) handles all shortcuts.
 * Components register/unregister shortcuts via `registerShortcut()` /
 * `unregisterShortcut()`, or more commonly via the `useKeyboardShortcut` hook.
 *
 * See kupua/exploration/docs/panels-plan.md Decision #7 and deviations.md.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Shortcut {
  /** The key to listen for (e.g. "[", "]", "f"). Case-sensitive. */
  key: string;
  /** Action to execute when the shortcut fires. */
  action: () => void;
  /**
   * Human-readable label for tooltips / UI display.
   * If omitted, defaults to the key character.
   */
  label?: string;
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

/** Map from key → list of shortcuts (most-recent-first for stack semantics). */
const registry = new Map<string, Shortcut[]>();

/**
 * Register a keyboard shortcut. Returns an unregister function.
 *
 * If multiple shortcuts share the same key (e.g. `f` for fullscreen
 * registered both app-wide and in image detail), the most recently
 * registered one wins (stack semantics — the component that mounts
 * last takes priority, and unmounting restores the previous handler).
 */
export function registerShortcut(shortcut: Shortcut): () => void {
  const { key } = shortcut;
  if (!registry.has(key)) registry.set(key, []);
  const stack = registry.get(key)!;
  stack.unshift(shortcut); // newest first

  return () => {
    const idx = stack.indexOf(shortcut);
    if (idx >= 0) stack.splice(idx, 1);
    if (stack.length === 0) registry.delete(key);
  };
}

/**
 * Unregister a shortcut by reference. Prefer the returned function from
 * `registerShortcut()` — this is a convenience for imperative cleanup.
 */
export function unregisterShortcut(shortcut: Shortcut): void {
  const stack = registry.get(shortcut.key);
  if (!stack) return;
  const idx = stack.indexOf(shortcut);
  if (idx >= 0) stack.splice(idx, 1);
  if (stack.length === 0) registry.delete(shortcut.key);
}

// ---------------------------------------------------------------------------
// Editable field detection
// ---------------------------------------------------------------------------

function isEditableTarget(e: KeyboardEvent): boolean {
  const target = e.target as HTMLElement | null;
  if (!target) return false;

  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (target.isContentEditable) return true;

  // Shadow DOM: CQL input's shadow root dispatches events with the
  // cql-input host as target (composed path).
  if (target.shadowRoot != null) return true;
  const composed = e.composedPath?.();
  return composed?.some((el) => (el as HTMLElement)?.tagName === "CQL-INPUT") ?? false;
}

// ---------------------------------------------------------------------------
// Global listener (installed once on first import)
// ---------------------------------------------------------------------------

function handleKeyDown(e: KeyboardEvent): void {
  // Never interfere with Cmd/Ctrl combos — those are browser/OS shortcuts
  if (e.metaKey || e.ctrlKey) return;

  const editing = isEditableTarget(e);

  if (editing) {
    // In an editable field: only fire if Alt is held
    if (!e.altKey) return;
  }
  // Not editing: fire on bare key OR Alt+key (both work)

  // Look up the key. When Alt is held, e.key may be a dead character
  // (e.g. Alt+[ on Mac → """). Use e.code as fallback for known keys.
  let key = e.key;
  if (e.altKey) {
    // Map physical key codes back to logical keys for our shortcuts
    key = codeToKey(e.code) ?? key;
  }

  const stack = registry.get(key);
  if (!stack || stack.length === 0) return;

  e.preventDefault();
  // Fire the top-of-stack (most recently registered) shortcut
  stack[0].action();
}

/**
 * Map KeyboardEvent.code → logical key character for shortcuts that use
 * characters which are altered by the Alt/Option modifier on macOS.
 */
function codeToKey(code: string): string | undefined {
  switch (code) {
    case "BracketLeft": return "[";
    case "BracketRight": return "]";
    case "KeyF": return "f";
    // Add more as needed
    default: return undefined;
  }
}

// Install once — capture phase so we intercept before shadow DOM consumers
document.addEventListener("keydown", handleKeyDown, { capture: true });

// ---------------------------------------------------------------------------
// Tooltip helper
// ---------------------------------------------------------------------------

/** Platform-aware modifier key symbol for display in tooltips. */
const ALT_SYMBOL = navigator.platform.includes("Mac") ? "⌥" : "Alt+";

/**
 * Format a shortcut for display in a tooltip.
 *
 * Returns e.g. `"[  (⌥[ in text fields)"` on Mac,
 * or `"[  (Alt+[ in text fields)"` on Windows.
 */
export function shortcutTooltip(key: string): string {
  return `${key}  (${ALT_SYMBOL}${key} in text fields)`;
}


