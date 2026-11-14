/**
 * Development-only console.log wrapper.
 *
 * Calls are completely eliminated from production builds by Vite's
 * dead-code elimination — `import.meta.env.DEV` is replaced with
 * `false` at build time, making the function body unreachable.
 *
 * Usage: replace `console.log(...)` with `devLog(...)` for diagnostic
 * messages that should never appear in production.
 *
 * Note: `console.warn` for error-path diagnostics should remain as
 * bare `console.warn` — those are valuable in production.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function devLog(...args: any[]): void {
  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.log(...args);
  }
}

