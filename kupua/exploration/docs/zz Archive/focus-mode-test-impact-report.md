# Focus Mode Test Hardening — How It Works Now

> 20 April 2026. Documents the test infrastructure changes that make the suite
> resilient to either focus mode being the default, and the rationale behind them.

## Current State

Explicit is still the default focus mode. All **153 Playwright E2E tests** and
**322 Vitest** tests pass regardless of which mode is the default — the suite is
ready if phantom ever becomes default. Tests that exercise
explicit-focus behaviour (focus ring, arrow-key focus movement, sort-around-focus,
etc.) are **pinned to explicit mode** via `ensureExplicitMode()` in `beforeEach`.
Tests that exercise phantom behaviour use `ensurePhantomMode()` or the existing
`addInitScript` pattern. Tests that don't interact with focus at all need no pinning.

### Key helpers in `e2e/shared/helpers.ts`

| Helper | Purpose |
|--------|---------|
| `ensureExplicitMode()` | Sets `focusMode: "explicit"` in localStorage via `addInitScript` (before page load) |
| `ensurePhantomMode()` | Sets `focusMode: "phantom"` in localStorage via `addInitScript` |
| `focusNthItem(n)` | Physical `.click()` — only works in explicit mode (in phantom, click navigates to detail) |
| `openDetailForNthItem(n)` | Mode-independent: gets image ID from store via `page.evaluate`, uses `.dblclick()` which works in both modes |

### Which files are pinned

**Pinned to explicit** (12 files) — all via `test.beforeEach(async ({ kupua }) => { await kupua.ensureExplicitMode(); })`:
- `e2e/local/`: browser-history, focus-preservation, keyboard-nav, scrubber, ui-features, visual-baseline, tier-matrix
- `e2e/smoke/`: manual-smoke-test, focus-preservation-smoke, home-logo-diag
- `e2e-perf/`: perf.spec.ts, experiments.spec.ts

**Already mode-aware** (1 file):
- `e2e/local/phantom-focus.spec.ts` — sets mode explicitly per-test via its own `addInitScript` helper

**No pinning needed** (3 files):
- `e2e/local/buffer-corruption.spec.ts` — no focus interactions
- `e2e/smoke/smoke-scroll-stability.spec.ts` — scrubber/wheel only, no image clicks
- `e2e/local/visual-baseline.spec.ts` — uses `openDetailForNthItem` (mode-independent)

---

## Background: Why This Was Needed

The following section is the original audit that motivated the changes above.
It explains what *would have* broken without mode-pinning.

### The problem

Changing the default focus mode from `explicit` to `phantom` would have broken
**~60+ tests** across all Playwright suites. The root cause was a single helper —
`focusNthItem()` — which uses `.click()`. In explicit mode this sets focus; in
phantom mode it navigates to image detail. There were **47 call sites** for this
helper. A second helper, `openDetailForNthItem()`, also broke because it called
`focusNthItem()` internally before doing a `.dblclick()`.

**Vitest unit tests (322) were completely unaffected** — they don't depend on click behaviour.

### The critical bottleneck: `focusNthItem()` in `e2e/shared/helpers.ts`

```typescript
async focusNthItem(n: number) {
  if (await this.isGridView()) {
    const cells = this.page.locator('[aria-label="Image results grid"] [class*="cursor-pointer"]');
    await cells.nth(n).click();   // ← In phantom mode, this opens detail
  } else {
    const dataRows = this.page.locator('...');
    await dataRows.nth(n).click(); // ← Same problem
  }
}
```

In **explicit** mode: `.click()` → sets focusedImageId in store, shows ring, stays on search.
In **phantom** mode: `.click()` → navigates to `?image=...` detail overlay. Test is now on
the wrong page for all subsequent assertions.

`openDetailForNthItem()` compounds this — it calls `focusNthItem(n)` to get the image ID,
then `.dblclick()`. In phantom mode the first click already navigated away.

### Breakdown by test suite (pre-fix)

| Suite | Total tests | Tests affected | Severity |
|-------|------------|----------------|----------|
| Vitest (unit) | 322 | 0 | None |
| Local E2E | 153 | ~40+ | Critical |
| Smoke (TEST) | 27 | ~7 | High |
| Perf | 20 | ~8 | High |
| Tier-matrix | 18 | ~4 | High |
| Experiments | 2+ | ~2 | High |

### Affected test files — detailed inventory

### Completely broken (most/all tests fail)

**`e2e/local/focus-preservation.spec.ts`** — 6 tests, ALL use `focusNthItem` + assert focus ring/id
- `focus preserved when query changes`
- `focus cleared when image NOT in results`
- `focuses nearest neighbour when image drops`
- `arrow key snaps back to focused image`
- `viewport anchor preserves position...`
- `explicit focus still takes precedence...`

**`e2e/local/keyboard-nav.spec.ts`** — 5 tests using `focusNthItem` then asserting arrow-key focus movement
- `ArrowDown moves focus...`
- `ArrowUp/Left/Right move focus...`
- `Home/End... focuses first/last image`
- `row-aligned snapping`
- `search box key propagation` (partially)

**`e2e/local/browser-history.spec.ts`** — 2 tests using `focusNthItem` + focus assertions
- `focus is NOT carried into old search...`
- `back from image detail preserves focused image`

**`e2e/smoke/focus-preservation-smoke.spec.ts`** — 4 tests, all `focusNthItem`-based
- `T2: explicit focus preserved when clearing filter`
- `T3: explicit focus preserved across sort change`
- `T4: neighbour fallback when focused image leaves results`
- `T5: arrow key snaps back to focused image after distant seek`
- `T7: focus then clear focus then clear filter`

### Partially broken (some tests fail)

**`e2e/local/ui-features.spec.ts`** — ~6 tests
- `Back to search button returns... image focused` — asserts focus ring
- `Backspace key returns... image focused` — asserts focus ring
- `Enter key on focused image opens detail` — Enter is no-op in phantom
- `ArrowLeft/Right in fullscreen preview` — f-key entry gated on explicit
- Tests using `openDetailForNthItem` (5 calls) — helper breaks
- Tests using `focusNthItem` for setup (2 calls)

**`e2e/local/scrubber.spec.ts`** — 7 tests use `focusNthItem`
- Sort-around-focus tests (lines 1094, 1216, 1249)
- Density switch preservation (line 1424)
- Home/End keyboard (lines 2063, 2127)
- Bug regression #18 (line 2519)

**`e2e/local/tier-matrix.spec.ts`** — 4 tests
- `8. Rapid density toggling doesn't corrupt state` — `focusNthItem(2)`
- `9. focused image survives sort direction change` — `focusNthItem(3)`
- `10. focused image is within viewport after sort field change` — `focusNthItem(5)`
- `14. End focuses last image` — `focusNthItem(0)`

**`e2e/smoke/manual-smoke-test.spec.ts`** — 3 tests
- `S7: sort direction toggle preserves focused image at scale` — `focusNthItem(5)`
- `S8: sort toggle in grid preserves focus and scrolls to image` — `focusNthItem(4)`
- `S9: table->grid density switch after deep scroll` — `focusNthItem(5)`

**`e2e-perf/perf.spec.ts`** — 8 scenarios
- P4a/b, P6 (focus drift during transitions) — `focusNthItem(5)`
- P12 (sort-around-focus) — `focusNthItem(3)`
- P13 (return from detail) — `focusNthItem(2)` + `.dblclick()`
- P14 (density switch) — `focusNthItem(3)`
- P15 (filter change) — `focusNthItem(3)` + `.dblclick()`

**`e2e-perf/experiments.spec.ts`** — 2 uses
- `focusNthItem(3)` — sort-around-focus experiment
- `focusNthItem(imageIndex)` + `.dblclick()` — traversal experiment

### Already phantom-aware (no changes needed)

**`e2e/local/phantom-focus.spec.ts`** — 8 tests already set mode explicitly via `addInitScript`

### Unaffected

- `e2e/local/buffer-corruption.spec.ts` — no focus interactions, only logo/metadata/query changes
- `e2e/local/visual-baseline.spec.ts` — uses `openDetailForNthItem` (would need fix) but screenshots are mode-independent otherwise
- `e2e/smoke/smoke-scroll-stability.spec.ts` — scrubber/wheel only, no image clicks
- `e2e/smoke/home-logo-diag.spec.ts` — uses `.dblclick()` directly (not `focusNthItem`) for most tests; one uses `openDetailForNthItem`
- `e2e/scrubber-debug.spec.ts` — diagnostic, no focus

### Resolution approach (now implemented)

Three categories of fix were identified and applied:

- **Category A — Pin to explicit mode:** Tests exercising focus-specific behaviour
  (ring, arrows, sort-around-focus). Pinned via `ensureExplicitMode()` in `beforeEach`.
- **Category B — Pin to explicit mode:** Tests using `focusNthItem` as setup (could
  alternatively use programmatic focus, but pinning was simpler and consistent).
- **Category C — Mode-independent detail opening:** `openDetailForNthItem()` rewritten
  to use `page.evaluate` for image ID + `.dblclick()` (works in both modes).

All pinned to explicit mode via `ensureExplicitMode()` in `beforeEach`.

| File | Count | Lines |
|------|-------|-------|
| `e2e/shared/helpers.ts` (definition + openDetailForNthItem) | 2 | 732, 904 |
| `e2e/local/focus-preservation.spec.ts` | 6 | 42, 84, 120, 194, 249, 380 |
| `e2e/local/keyboard-nav.spec.ts` | 5 | 128, 145, 161, 191, 262 |
| `e2e/local/ui-features.spec.ts` | 5 | 82, 175, 316, 488, 541 |
| `e2e/local/scrubber.spec.ts` | 7 | 1094, 1216, 1249, 1424, 2063, 2127, 2202, 2519 |
| `e2e/local/browser-history.spec.ts` | 2 | 137, 160 |
| `e2e/local/tier-matrix.spec.ts` | 4 | 334, 362, 393, 509 |
| `e2e/smoke/manual-smoke-test.spec.ts` | 3 | 246, 276, 349 |
| `e2e/smoke/focus-preservation-smoke.spec.ts` | 4 | 325, 404, 481, 603 |
| `e2e-perf/perf.spec.ts` | 8 | 836, 872, 944, 1107, 1282, 1371, 1438, 1523 |
| `e2e-perf/experiments.spec.ts` | 2 | 813, 1085 |

## Call site inventory (47 sites, for reference)

2. **Dual-mode test runs:** Should the local E2E suite run in both modes (doubling
   ~6min → ~12min)? Or: run once in phantom (default), with Category A tests
   explicitly pinned to explicit mode?

3. **`focusNthItem` semantics:** Should `focusNthItem()` remain a "click the item"
   physical action (callers pin their mode), or become the programmatic
   `setFocusProgrammatically()` with a new `clickNthItem()` for physical-click tests?

4. **Perf baselines:** The 8 affected perf scenarios measure timings that may differ
   between modes (e.g. sort-around-focus is irrelevant in phantom mode if there's
   no explicit focus). Should perf tests pin to explicit, or do we need separate
   phantom-mode perf benchmarks?
