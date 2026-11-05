# Profiling Results — Seek Latency (Completed 2026-04-12)

> **Status:** DONE. Results below. Phase 3b is unnecessary.

## Raw Numbers (24k images on TEST, position-map seek, DevTools Performance tab)

| Metric | Seek #1 (~50%) | Seek #2 (other) |
|---|---|---|
| **seek: total (to paint)** | **851ms** | **1,040ms** |
| seek: forward fetch | 446ms | 594ms |
| seek: backward fetch | 250ms | 352ms |
| seek: compute + set() | 0.39ms | 0.39ms |
| seek: render + paint | 154ms | 88ms |
| Unaccounted gap | ~0.6ms | ~0.6ms |

## Analysis

1. **`compute + set()` is 0.39ms — effectively zero.** Zustand's `set()` is
   a synchronous object swap. The ~450ms "store overhead" reported by
   Playwright was entirely an artefact of how Playwright measures (it
   includes microtask scheduling, evaluate() round-trips, and React's
   asynchronous rendering in its timing).

2. **Network dominates: 82-91% of total.** The forward + backward ES calls
   take 696-946ms. This is the SSH tunnel to TEST ES — irreducible from
   kupua's side. On PROD (direct network, no tunnel), this would likely be
   150-300ms total.

3. **React render + paint = 88-154ms.** Replacing ~300 image cells in the
   DOM. Reasonable and not optimisable without fundamentally changing what
   we render.

4. **No mystery overhead.** The numbers add up cleanly (forward + backward +
   set + render ≈ total). No scheduler.yield gaps, no hidden costs.

5. **Playwright was under-reporting, not over-reporting.** Playwright's
   647ms avg measured to `set()` return (not paint). Real user-perceived
   latency is ~850-1000ms including render + paint.

## Decision

**Phase 3b (Seek Overhead Reduction) is definitively unnecessary.** There is
no store overhead to reduce. The only lever remaining is parallelising the
forward + backward ES calls, which would save ~100-250ms — worth doing as
a small enhancement in Phase 4b, not a separate phase.

## Implications for Phase 4b UX

- Seek latency on TEST: ~850-1000ms (network-dominated)
- Seek latency on PROD (estimated): ~250-450ms (faster network, same render)
- "Fast pointer-up" UX: the 850ms delay is visible. Optimistic thumb
  positioning + brief loading skeleton in content area is the right pattern.
- "Live drag-seek" (debounced seeks during drag): NOT viable at these
  latencies. Each seek takes ~1s — debounced at 200ms would queue seeks
  that arrive after the next drag event.
- Parallel fwd+bwd fetch: would reduce to ~600-700ms on TEST, ~200-350ms
  on PROD. Worth doing.

## Cleanup

The `performance.mark()` / `performance.measure()` instrumentation in
`search-store.ts` can stay (zero-cost, useful for future profiling) or be
removed. No functional impact either way.


