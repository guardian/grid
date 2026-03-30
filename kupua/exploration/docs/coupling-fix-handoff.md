# Kupua Coupling Fix — Agent Handoff Plan

> **Created:** 30 March 2026
> **Status:** Ready for execution.
> **Prerequisite reading:** `AGENTS.md`, `fix-ui-coupling.md`, `fix-ui-coupling-plan.md`,
> `fix-ui-docs-eval.md`, `phase0-measurement-infra-plan.md`.

---

## Context for the Fresh Agent

Three audit documents exist:

1. **`fix-ui-coupling.md`** — the original audit. Catalogues 16 coupling issues (C1–C16)
   between CSS pixel values and JS logic. Severity-rated. Accurate.

2. **`fix-ui-coupling-plan.md`** — expanded analysis + detailed work plan. Adds C17–C23.
   Proposes 6 phases of work. Contains the full constants inventory (Appendix A),
   exhaustive E2E pixel literal list (Appendix B), and performance budget (Appendix C).

3. **`fix-ui-docs-eval.md`** — critical evaluation of both documents. Validates them,
   fills gaps (3 extra performance findings, architectural analysis), and produces the
   final prioritised 13-item action list.

### What's Already Done (Phase 0)

Phase 0 merged the coupling plan's Phase 1 (shared constants) with perf test
infrastructure. **All of this is complete and in the working tree:**

- ✅ `src/constants/layout.ts` — single source of truth for 5 pixel constants
  (`TABLE_ROW_HEIGHT`, `TABLE_HEADER_HEIGHT`, `GRID_ROW_HEIGHT`, `GRID_MIN_CELL_WIDTH`,
  `GRID_CELL_GAP`)
- ✅ `ImageTable.tsx` and `ImageGrid.tsx` import from `layout.ts` (no local constants)
- ✅ Store tests (`search-store.test.ts`, `search-store-extended.test.ts`) import from
  `layout.ts`
- ✅ All 3 E2E spec files (`scrubber.spec.ts`, `manual-smoke-test.spec.ts`,
  `e2e-perf/perf.spec.ts`) import from `@/constants/layout` and pass constants as
  `page.evaluate()` arguments — zero raw pixel literals remain
- ✅ `e2e-perf/` directory structure with `perf.spec.ts` (16 tests P1–P16),
  `run-audit.mjs` (harness), `playwright.perf.config.ts`, `results/` directory
- ✅ Structured metric emission (`emitMetric()`) in every perf test
- ✅ Result set pinning via `PERF_STABLE_UNTIL` (hardcoded `2026-02-15T00:00:00Z`)

**What Phase 0 resolved from the coupling plan:**
- C2 (Table ROW_HEIGHT duplication) — ✅ done
- C3 (Grid ROW_HEIGHT duplication) — ✅ done
- C4 (Grid MIN_CELL_WIDTH duplication) — ✅ done
- C13 (E2E pixel constants) — ✅ done

**What remains (this plan):**
- C1 — Header height coupling (JS constant must match CSS)
- C5 — Font string coupling (Canvas measurement)
- C6 — Scrubber DOM archaeology
- C7 — Tooltip height magic number
- C17 — Scroll compensation uses ROW_HEIGHT multiplication
- C19 — handleScroll callback churn
- C20 — Grid cell array allocation per row per render
- C21 — Canvas font re-parsing per measureText call
- C22 — Scrubber MutationObserver lifecycle
- C10 — Panel constraints not viewport-aware
- Plus 3 eval-doc additions: GridCell key fix, visibleImages O(N) join, density-focus module-level variable

---

## How the Perf Testing Loop Works

This is the critical process the agent must follow. **The agent NEVER runs perf tests
directly.** The human runs them. The agent reads the output and iterates.

### The Loop

```
┌─────────────────────────────────────────────────────┐
│ 1. Agent makes code changes                         │
│ 2. Agent runs functional E2E tests (local ES):      │
│    npx playwright test                              │
│    (64 tests, ~70s, agent runs this directly)       │
│ 3. Agent tells human: "Ready for perf measurement.  │
│    Please run:                                      │
│    node e2e-perf/run-audit.mjs --label '...'        │
│    in your IDE terminal (requires --use-TEST)"      │
│ 4. Human runs the command                           │
│ 5. Human pastes output OR agent reads the updated   │
│    e2e-perf/results/audit-log.md                    │
│ 6. Agent reads results, updates audit docs,         │
│    decides whether to proceed or revert             │
│ 7. Goto 1                                           │
└─────────────────────────────────────────────────────┘
```

### Commands Reference

| What | Command | Who runs it | Notes |
|------|---------|-------------|-------|
| Functional E2E (local) | `npx playwright test` | **Agent** (foreground, no pipe/tail) | 64 tests, ~70s. Must all pass before perf run |
| Unit/integration tests | `npx vitest run` | **Agent** | Must pass after any store/hook changes |
| Perf audit (all tests) | `node e2e-perf/run-audit.mjs --label "Phase X: description"` | **Human only** | Requires `./scripts/start.sh --use-TEST` running in another terminal |
| Perf audit (subset) | `node e2e-perf/run-audit.mjs P8,P19 --label "..."` | **Human only** | Quick check on specific tests |
| Perf audit (baseline) | `node e2e-perf/run-audit.mjs --label "Baseline" --runs 3` | **Human only** | Median of 3 runs for stable baseline |

**Test stability and network dependency:** See `e2e-perf/README.md` for which tests
are client-only (stable, ±5%), mixed (±15%), or ES-dominated (±20%+). The agent
should not panic about fluctuation on ES-dominated tests (P1, P3, P6, P9, P11) from
a single run. Client-only tests (P4, P5, P14, P15, P16) are trustworthy from `--runs 1`.

**Focus position metrics:** P4a, P4b, P6, and P12 emit `focusDriftPx` and
`focusDriftRatio` in their structured metrics. These track "Never Lost" accuracy —
how many pixels the focused image drifts during transitions. The agent must check
these after any phase that touches density switching, scroll compensation, or header
height measurement.

### When and How to Request a Perf Run

**The agent must always give the human the exact, copy-pasteable commands.**
Never say "run the perf tests" — say exactly what to type, including `--runs`,
`--label`, and any test filter. Always remind the human whether the real-data
app needs to be started or stopped. The human may be coming back after a break
and won't remember the state.

**Template for every perf request:**

> Ready for perf measurement. Please:
>
> 1. Make sure the real-data app is running:
>    `./scripts/start.sh --use-TEST`
>    (skip if it's already running from the last run)
>
> 2. Run:
>    `node e2e-perf/run-audit.mjs --label "Phase A: stable handleScroll" --runs 1`
>
> 3. When it finishes, let me know and I'll read the results.

Use `--runs 1` for quick checks during development. Use `--runs 3` for baselines
and final phase measurements where you need stable numbers. Always specify which.

**Request a full perf run** (`--label "Phase X: ..."`) after completing each phase
that has performance implications (Phases A, B, C). The label should describe
what changed so the audit log is self-documenting.

**Request a targeted perf run** (e.g. `P8,P2`) after individual micro-optimisations
within Phase A, to isolate the effect of each change.

**Do NOT request a perf run** after pure documentation updates.

**After perf testing is done for a session**, tell the human they can stop the
real-data app (`Ctrl-C` in the `start.sh --use-TEST` terminal) to free resources.

### What to Do with Results

After the human runs the harness, **the agent MUST do all of the following:**

1. **Read** `e2e-perf/results/audit-log.md` (the diff table appended by the harness)
   and `e2e-perf/results/audit-log.json` (the raw metrics).

2. **Present a plain-English summary to the human.** Don't just say "results look
   fine." Walk through each test that matters for the current phase, explain what the
   numbers mean, highlight anything surprising (good or bad), and explicitly state
   whether the phase achieved its goal. The human is watching the tests run and
   forming visual impressions — connect the numbers to what they saw.

3. **Flag regressions** — any metric >10% worse triggers a `⚠️` in the harness
   verdict. If the agent sees one, explain whether it's real (code change caused it)
   or noise (CPU contention, single-run variance). Recommend `--runs 3` for
   confirmation if ambiguous.

4. **Flag expected improvements that didn't materialise** — if a perf-targeted
   change shows no improvement, investigate before proceeding. Explain why it
   might not have moved the needle (e.g. "the optimisation targets column-fit
   which P16b measures, but P16b shows 80→78ms — within noise; the real benefit
   is when fitting all 10 columns at once, which this test doesn't do").

5. **Update the audit docs** — add a brief note to the relevant coupling issue
   in `fix-ui-coupling-plan.md` Appendix C or create a new section with measured
   before/after numbers.

6. **Evaluate test quality** — if a test produced unexpected results (e.g. zero
   CLS where some was expected, or frameCount=0), investigate whether the test
   instrumentation is working correctly. Propose adjustments if needed.

---

## Execution Plan — Phases 2–6

### Recommended execution order (from eval doc, refined):

**Phase A: Performance micro-optimisations (C19, C20, C21 + eval extras)**
**Phase B: Scrubber decoupling (C6, C7, C22)**
**Phase C: Header measurement (C1)**
**Phase D: Remaining refinements (C5, density-focus ref, C10)**

Rationale: Phase A is highest ROI (measurable perf wins), lowest risk (independent
micro-fixes). Phase B is medium risk but unlocks future extensibility. Phase C is
low-priority (the header height is stable and correct today). Phase D is
nice-to-haves.

---

### Phase A: Performance Micro-Optimisations (~2h)

**Goal:** Measurably improve scroll-path performance. Each task is independent.

#### A.1: Stabilise `handleScroll` callback (C19)

**Files:** `ImageTable.tsx` (~line 612), `ImageGrid.tsx` (~line 370)

**Problem:** `virtualizer` is recreated every render (TanStack Virtual returns a new
object). `handleScroll` depends on it → new callback every render → `useEffect`
tears down and re-attaches the scroll listener every render.

**Fix:**
```ts
const virtualizerRef = useRef(virtualizer);
virtualizerRef.current = virtualizer;

const handleScroll = useCallback(() => {
  const el = parentRef.current;
  if (!el) return;
  const range = virtualizerRef.current.range;
  // ... rest unchanged, use virtualizerRef.current instead of virtualizer
}, [reportVisibleRange]);
// reportVisibleRange is stable (from useDataWindow), loadMore store-bound
```

Also store `loadMore` in a ref if it's in the dependency array.

**Validation:**
1. `npx vitest run` — store tests pass
2. `npx playwright test` — all 64 E2E tests pass
3. **Ask human to run:** `node e2e-perf/run-audit.mjs P2,P8 --label "A.1: stable handleScroll"`
4. Read results — expect: fewer Event Listener entries, slight improvement in P2/P8 frame metrics

#### A.2: Memoise column index array in ImageGrid (C20)

**File:** `ImageGrid.tsx` (~line 629)

**Problem:** `Array.from({ length: columns }, (_, colIdx) => ...)` allocates per
virtual row per render. 6 cols × 15 rows × 60fps = 5,400 GC-able arrays/sec.

**Fix:**
```ts
const columnIndices = useMemo(
  () => Array.from({ length: columns }, (_, i) => i),
  [columns],
);
// In render: {columnIndices.map((colIdx) => { ... })}
```

**Validation:**
1. `npx playwright test` — all pass
2. No separate perf run needed — bundle with A.1

#### A.3: Cache Canvas font in `measureText` (C21)

**File:** `ImageTable.tsx` (~line 895)

**Problem:** `ctx.font = font` is set on every `measureText` call. Font-string
parsing is expensive at 600 calls per column-fit.

**Fix:**
```ts
const lastFontRef = useRef("");

const measureText = useCallback((text: string, font: string): number => {
  if (!measureCtxRef.current) {
    const canvas = document.createElement("canvas");
    measureCtxRef.current = canvas.getContext("2d");
  }
  const ctx = measureCtxRef.current!;
  if (font !== lastFontRef.current) {
    ctx.font = font;
    lastFontRef.current = font;
  }
  return Math.ceil(ctx.measureText(text).width);
}, []);
```

**Validation:**
1. `npx playwright test` — all pass
2. **Ask human to run:** `node e2e-perf/run-audit.mjs P16 --label "A.3: canvas font cache"`
3. P16b (double-click auto-fit) should show improvement

#### A.4: Fix `key={imageIdx}` → `key={image?.id ?? imageIdx}` in ImageGrid (eval doc item 3)

**File:** `ImageGrid.tsx` (~line 634)

**Problem:** Virtual grid rows key `GridCell` by flat image index. When the buffer
prepends items (bufferOffset changes), all imageIdx values shift. React unmounts and
remounts *every* visible GridCell on backward extend.

**Fix:** Use `image.id` as key (stable across buffer mutations):
```ts
key={image?.id ?? `empty-${imageIdx}`}
```

**Validation:**
1. `npx playwright test` — all pass (especially scrubber + density tests)
2. Bundle perf check with the full Phase A run

#### A.5: Replace `ids.join(",")` with O(1) sentinel (eval doc item 7)

**File:** `ImageTable.tsx` (~line 520)

**Problem:** `visibleImages` memo uses `ids.join(",")` — O(N) string concat at
60 visible rows × 60fps during fast scroll.

**Fix:** Use first ID + last ID + length as the memo key:
```ts
const visibleKey = `${ids[0] ?? ""}|${ids[ids.length - 1] ?? ""}|${ids.length}`;
```

Or restructure to avoid the join entirely — the memo likely doesn't need a string
key at all if the dependency array uses individual values.

**Validation:**
1. `npx playwright test` — all pass
2. Bundle with Phase A perf run

#### Phase A — Final Perf Gate

After all A.1–A.5 are complete:
1. `npx vitest run` — all pass
2. `npx playwright test` — all 64 pass
3. **Ask human to run:** `node e2e-perf/run-audit.mjs --label "Phase A: perf micro-opts (C19,C20,C21,GridCell key,ids.join)"`
4. Read `e2e-perf/results/audit-log.md` diff table
5. Expected improvements: P2/P8 (scroll jank), P4a/P4b (density switch), P16b (column fit)
6. If any regression: revert the offending change, re-run functional E2E to confirm

---

### Phase B: Scrubber Decoupling (~2h)

**Goal:** Eliminate DOM archaeology. Pass scroll container ref as prop. Fix tooltip.
Stabilise MutationObserver lifecycle.

#### B.1: Pass `scrollContainerRef` to Scrubber via search route

**Files:** Search route (likely `src/routes/search.tsx` or similar), `PanelLayout.tsx`,
`Scrubber.tsx`, `ImageTable.tsx`, `ImageGrid.tsx`

**Approach:** The density components already have `parentRef` pointing to their
scroll container. Create a shared ref in the search route, pass it to both the
density component AND the Scrubber:

```tsx
// In the search route
const scrollRef = useRef<HTMLDivElement>(null);

// Pass to density component (merge with existing parentRef or use scrollRef directly)
// Pass to Scrubber as a new prop
<Scrubber scrollContainerRef={scrollRef} ... />
```

The density components must assign `scrollRef.current = el` (their scroll container
element). This can be done via a callback ref that sets both the local `parentRef`
and the shared `scrollRef`.

#### B.2: Remove `findScrollContainer` and all sibling-walking code

**File:** `Scrubber.tsx` (~line 403)

Replace all `findScrollContainer()` calls with `scrollContainerRef.current`.
This eliminates:
- The `previousElementSibling` walk
- The `querySelector("[role='region']")` fallback
- The MutationObserver that watches for scroll container changes (no longer needed —
  the ref is always current)

#### B.3: Fix `scroll-reset.ts` to use a module-level ref or accept a ref param

**File:** `src/lib/scroll-reset.ts` (~line 20)

Replace `document.querySelector('[role="region"][aria-label="..."]')` with either:
- A module-level register/unregister pattern, OR
- A parameter on `resetScrollAndFocusSearch(scrollEl?: HTMLElement)`

#### B.4: Fix tooltip height magic number (C7)

**File:** `Scrubber.tsx` (~line 979)

Replace `trackHeight - 48` with `trackHeight - (tooltipRef.current?.offsetHeight || 28)`.
The tooltip is always in the DOM (opacity-controlled), so `offsetHeight` is valid.

#### Phase B — Validation

1. `npx vitest run` — all pass
2. `npx playwright test` — **all 64 pass** (critical — scrubber tests are thorough)
3. **Ask human to run:** `node e2e-perf/run-audit.mjs --label "Phase B: scrubber decoupling (C6,C7,C22)"`
4. Expected: P7 (scrubber drag) neutral or slightly improved. P12 (density drift) unchanged.
5. If scrubber E2E tests fail: read the failures carefully. The Scrubber is ~1010 lines
   of complex code. Don't guess — read the relevant sections before fixing.

---

### Phase C: DOM-Measured Header Height (~1.5h)

**Goal:** Replace `TABLE_HEADER_HEIGHT = 45` (manual CSS↔JS sync) with a
ResizeObserver-measured value.

#### C.1: Create `useHeaderHeight` hook

**File:** New file `src/hooks/useHeaderHeight.ts`

```ts
export function useHeaderHeight(fallback: number): [
  (el: HTMLDivElement | null) => void,
  number,
]
```

Returns a callback ref (assign to the header element) and the measured height.
Uses ResizeObserver internally. Falls back to `fallback` on first render before
measurement.

**Important:** This observer fires at most once on mount + occasionally on resize.
It does NOT fire during scroll (ResizeObserver observes border-box, which doesn't
change on scroll). Zero scroll-path cost.

#### C.2: Wire into ImageTable

- Assign callback ref to the sticky header `<div>`
- Pass `measuredHeaderHeight` to virtualizer's `scrollPaddingStart` and to
  `useListNavigation`'s `headerHeight` config
- Keep `TABLE_HEADER_HEIGHT` in `layout.ts` as the fallback value and for E2E tests

#### C.3: Verify

1. `npx vitest run`
2. `npx playwright test` — all pass (keyboard nav tests are the critical ones)
3. **Ask human to run:** `node e2e-perf/run-audit.mjs P1,P8 --label "Phase C: measured header height"`
4. Expect: no change (the constant was already correct). This phase is about
   resilience, not improvement.

---

### Phase D: Remaining Refinements (~2–3h)

Lower priority. Each is independent.

#### D.1: Move `density-focus.ts` module-level variable into parent ref (eval doc item 5)

**Files:** `src/lib/density-focus.ts`, search route, `ImageTable.tsx`, `ImageGrid.tsx`

**Problem:** Module-level `let saved` works in serial unmount/mount but is a
latent correctness risk under React concurrent rendering.

**Fix:** Move `saved` into a `useRef` on the SearchPage parent component. Pass the
ref to both density components. They read/write via `ref.current` instead of module
imports.

**Validation:** `npx playwright test` — density switch tests (P4a/P4b in E2E, P12).

#### D.2: Derive font strings from CSS custom properties (C5)

**File:** `ImageTable.tsx` (~line 923)

**Fix:** Read `getComputedStyle(document.documentElement).getPropertyValue("--text-xs")`
once (first column-fit invocation), cache it. No layout thrash — reading a CSS custom
property from `:root` doesn't trigger layout.

**Validation:** `npx playwright test` — column fit tests. `P16` perf test.

#### D.3: Viewport-aware panel constraints (C10) — **requires design discussion**

**File:** `src/stores/panel-store.ts`

This changes UX behaviour (panels auto-collapse on small screens). **Do not implement
without discussing with the user first.** Propose the approach, get approval.

---

## Documentation Updates

After each phase, the agent must:

1. **Update `AGENTS.md`** — "What's Done" section with the current state
2. **Append to `changelog.md`** — detailed narrative under current phase heading
3. **Update the coupling plan's Appendix C** — replace estimated perf numbers with
   measured actuals from the audit log

After all phases are complete:

4. **Mark resolved items in `fix-ui-coupling.md`** — add ✅ to the summary table
5. **Mark resolved items in `fix-ui-docs-eval.md`** — update the priority table

---

## Risk Mitigation

| Risk | Mitigation |
|------|-----------|
| Scrubber refactor breaks scroll-mode sync | Run all 64 E2E tests. Scrubber has ~15 dedicated tests including continuous-sync, seek-mode, and density-switch scenarios |
| handleScroll stabilisation changes scroll behaviour | The callback body is unchanged — only the closure mechanism changes. E2E scroll tests (P2, P8 equivalent in functional suite) catch regressions |
| useHeaderHeight produces wrong value on first render | Falls back to `TABLE_HEADER_HEIGHT` (45) — the current value. First-render behaviour is identical to current |
| GridCell key change causes unexpected reconciliation | Use `image?.id ?? "empty-${imageIdx}"` so empty cells still key by index. Only populated cells change key strategy |
| density-focus ref migration breaks "Never Lost" | P12 perf test and functional density-switch E2E tests cover this path |

---

## Summary: What the Agent Does vs What the Human Does

| Actor | Action |
|-------|--------|
| **Agent** | Reads docs, makes code changes, runs `npx vitest run` and `npx playwright test` |
| **Agent** | Tells the human exactly when to run `node e2e-perf/run-audit.mjs --label "..."` and with which test filter |
| **Human** | Runs perf audit commands in their terminal (requires `--use-TEST`) |
| **Agent** | Reads `e2e-perf/results/audit-log.md`, interprets results, updates docs |
| **Agent** | Never runs perf tests directly. Never runs `./scripts/start.sh`. Never touches files outside `kupua/` |
| **Human** | Approves commits. Agent suggests but never commits without permission |




