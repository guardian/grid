# Kupua Coupling Fix — Expanded Analysis & Work Plan

> Critical evaluation and expansion of [fix-ui-coupling.md](./fix-ui-coupling.md),
> with modern performance-focused solutions and a detailed implementation plan.

---

## Part 1: Critical Evaluation of the Original Report

### What the report gets right

The diagnosis is accurate. The seven JS↔CSS sync points are real, the E2E
copy-paste problem is dangerous, and the Scrubber's DOM archaeology is
fragile. The severity ratings are correct.

### Where the report falls short

1. **Performance implications are under-explored.** The report focuses on
   *correctness* (what breaks when a value drifts) but doesn't analyse the
   *runtime cost* of the proposed fixes. "Measure from DOM at mount time" is
   not free — and some naive measurement approaches can cause layout thrash.

2. **Scope is too narrow.** The report only covers pixel-constant coupling.
   The codebase has additional coupling categories that create the same class
   of bugs and performance problems:
   - Store↔view scroll compensation coupling
   - Render-path allocations in hot loops
   - Missing `CSS.highlights()` / `content-visibility` opportunities
   - Virtualizer re-measurement costs

3. **C9 is dismissed too easily.** The density-focus bridge is ratio-based
   (good), but the `localIndex` fallback is used as a *scroll target* in the
   restore path (`Math.floor(idx / cols) * ROW_HEIGHT`). If ROW_HEIGHT
   changes, the restore position is wrong. The "informational" downgrade
   should stay at 🟡.

4. **C5's proposed fix has a perf trap.** "Read `getComputedStyle()` from an
   existing rendered cell" is a forced-layout operation. Calling it inside
   `computeFitWidth` (which runs per-column, potentially 10+ times on
   double-click-to-fit-all) would thrash layout. The fix must cache.

5. **C1's "measure at mount time" is fragile for dynamic headers.** If the
   header height ever changes (font scaling, responsive breakpoints, added
   filters row), a mount-time measurement goes stale. A ResizeObserver on the
   header is needed, not a one-shot `offsetHeight` read.

---

## Part 2: Expanded Scope — Additional Coupling & Performance Issues

### 🔴 C17: Scroll compensation uses ROW_HEIGHT for pixel math — not actual rendered sizes

**Files:** `ImageTable.tsx:665,682`, `ImageGrid.tsx:398,415`

```ts
el.scrollTop += lastPrependCount * ROW_HEIGHT;  // backward extend
el.scrollTop -= lastForwardEvictCount * ROW_HEIGHT;  // forward evict
```

These scroll compensation paths multiply item counts by the constant
`ROW_HEIGHT`. If TanStack Virtual's measured sizes ever differ from the
estimate (e.g. dynamic row heights in a future feature, or browser zoom
rounding), compensation will be wrong — causing content jumps or the
infinite-extend loop (Bug #16 resurfaces).

**Performance note:** Using `virtualizer.measureElement()` per-item is too
expensive here. The correct approach: read the virtualizer's
`getTotalSize()` before and after the buffer mutation, then compensate by
the delta. This is geometry-agnostic and O(1).

### 🟡 C18: `contain: strict` on scroll containers blocks future dynamic row heights

**File:** `index.css:103,126`

The `.hide-scrollbar` class applies `contain: strict`, which includes *size
containment*. This means the container's intrinsic size is determined by
the flex parent, not its content. This is currently correct (virtualizer
sets explicit `height` on the inner div). But it locks the architecture
into fixed-height rows — if you ever want variable-height rows (e.g.
expanded metadata, multi-line descriptions), `contain: strict` will
silently ignore content overflow.

**Assessment:** Not a bug today, but a constraint that should be documented
or relaxed to `contain: layout paint` (which preserves scroll performance
without size containment).

### 🟡 C19: `handleScroll` callback churns on dependency changes

**Files:** `ImageTable.tsx:630-633`, `ImageGrid.tsx:370`

```ts
const handleScroll = useCallback(() => { ... }, [virtualizer, reportVisibleRange, loadMore]);
```

`virtualizer` is recreated on every render (TanStack Virtual returns a new
object). This means `handleScroll` is also new every render → the
`useEffect` that attaches the scroll listener tears down and re-attaches
on every render. During fast scroll, this creates listener churn.

**Fix:** Use a ref for virtualizer inside the callback (same pattern as
`configRef` in `useListNavigation`), making the callback stable.

### 🟡 C20: Grid cell `Array.from({ length: columns })` allocates per virtual row per render

**File:** `ImageGrid.tsx:629`

```tsx
{Array.from({ length: columns }, (_, colIdx) => { ... })}
```

Every virtual row allocates a new array on every render. With 15 visible
rows × 6 columns at 60fps scroll, that's 90 allocations/frame that GC
must collect. A reusable column-index array (memoised on `columns`) would
eliminate this.

### 🟡 C21: `computeFitWidth` scans visible items but creates Canvas context per call

**File:** `ImageTable.tsx:895-904`

```ts
const measureText = useCallback((text: string, font: string): number => {
  if (!measureCtxRef.current) {
    const canvas = document.createElement("canvas");
    measureCtxRef.current = canvas.getContext("2d");
  }
  const ctx = measureCtxRef.current!;
  ctx.font = font;
  return Math.ceil(ctx.measureText(text).width);
}, []);
```

The Canvas is created lazily (good), but `ctx.font = font` is set on every
call. Setting Canvas font is expensive (browser must parse the font string
and resolve it against loaded fonts). When scanning 60 visible rows × 10
columns = 600 `measureText` calls, the font resolution dominates.

**Fix:** Cache by font string — only set `ctx.font` when the font changes
from the last call.

### 🔴 C22: Scrubber creates a MutationObserver that never disconnects on re-render

**File:** `Scrubber.tsx:464-468`

The scroll-mode continuous sync effect creates a MutationObserver:

```ts
mo = new MutationObserver(() => attach());
mo.observe(contentCol, { childList: true });
```

The cleanup function disconnects it, but the effect depends on
`[allDataInBuffer, isDragging, maxThumbTop, trackHeight, findScrollContainer]`.
Several of these change frequently (`trackHeight` on any resize,
`maxThumbTop` on any total change). Each re-run creates a new
MutationObserver + scroll listener. The cleanup runs, but there's a brief
window where two observers coexist.

**Fix:** Separate the MutationObserver into a stable effect with fewer
dependencies, or use refs for the values that change.

### 🟡 C23: `200` magic number in grid thumbnail

**File:** `ImageGrid.tsx:130`

```tsx
<div className="overflow-hidden" style={{ height: 190 }}>
```

And:
```tsx
<img ... className="block w-full h-[186px] object-contain" />
```

The thumbnail area is 190px, the image is 186px (4px gap at bottom). These
are implicit parts of the `ROW_HEIGHT = 303` calculation:
`190 (thumb) + ~105 (metadata + padding + gap) + 8 (cell gap) = 303`.
But these sub-dimensions aren't documented or derived from ROW_HEIGHT.
Changing the metadata area size requires manually recalculating ROW_HEIGHT.

---

## Part 3: Solution Architecture — Performance-First Design

### Principle: Constants Stay Constant, Refs Replace Queries

The guiding principle is **not** "measure everything from the DOM at
runtime." That would be expensive and fragile — measuring forces layout,
and anything on the scroll path must be zero-cost.

What we actually do is much simpler:

1. **Centralise the constants that are already constants.** `ROW_HEIGHT`,
   `MIN_CELL_WIDTH`, `CELL_GAP` — these are hardcoded design decisions.
   They don't need measurement. They just need to live in one file instead
   of being copy-pasted into components, tests, and E2E scripts. This is
   Phase 1 — a pure rename, zero runtime cost.

2. **Pass refs instead of querying the DOM.** The Scrubber currently walks
   the DOM tree (`previousElementSibling.querySelector(…)`) every time it
   needs the scroll container. A React ref is an O(1) pointer dereference.
   This is Phase 3 — strictly cheaper than the status quo.

3. **Measure only the one value that genuinely couples JS to CSS.**
   `HEADER_HEIGHT = 45` is the only constant where the JS value must match
   a CSS-rendered size (the sticky header's border-box height). Today it's
   a manual sync: change the CSS class → forget to update the constant →
   `scrollPaddingStart` is wrong → focused rows hide behind the header.
   Phase 2 replaces this with a single ResizeObserver on the header
   element. This observer:
   - fires **once** on mount (synchronous initial read via callback ref)
   - fires again only if the header resizes (font load, window resize)
   - **never fires during scroll** — ResizeObserver observes the element's
     own border-box, which doesn't change when the user scrolls
   - costs exactly what the Scrubber's existing `trackCallbackRef`
     ResizeObserver costs (the same pattern, already in production)

   If even that feels too adventurous, Phase 2 is the lowest-priority
   phase. The constant-centralisation (Phase 1) and ref-passing (Phase 3)
   deliver 90% of the value with zero runtime measurement.

**What we never do:**
- No `getComputedStyle()` on the scroll path
- No `offsetHeight` reads inside render loops
- No `measureElement()` calls for scroll compensation
- No DOM measurement inside `estimateSize` (TanStack Virtual calls this
  hundreds of times — it stays a pure `() => TABLE_ROW_HEIGHT`)

**TL;DR:** The constants stay as constants. We just stop copy-pasting them.
The only "measurement" is one ResizeObserver on one element, firing once.

### Architecture Overview

```
src/
  constants/
    layout.ts          ← Single source of truth for all pixel constants
  hooks/
    useHeaderHeight.ts ← ResizeObserver-based header height measurement
  components/
    ImageTable.tsx      ← imports from constants/layout.ts
    ImageGrid.tsx       ← imports from constants/layout.ts
    Scrubber.tsx        ← receives scrollContainerRef as prop
  lib/
    density-focus.ts    ← unchanged (ratio-based, ROW_HEIGHT not needed)
    scroll-reset.ts     ← receives ref instead of querySelector
e2e/
  constants.ts          ← re-exports from src/constants/layout.ts for E2E
  helpers.ts            ← page.evaluate passes constants as arguments
```

---

## Part 4: Detailed Work Plan

### Phase 1: Shared Constants Module (C2, C3, C4, C13) — ~2h

**Goal:** Single source of truth for all layout constants. Zero functional
change, zero performance impact. Pure refactor.

#### Task 1.1: Create `src/constants/layout.ts`

```ts
// All pixel constants used by virtualizers, scroll math, and tests.
// These are ESTIMATES for the virtualizer — the actual rendered size may
// differ by ±1px due to browser rounding. Scroll compensation should
// prefer virtualizer.getTotalSize() deltas over raw multiplication.

/** Table row height (px). Matches the h-8 class on table rows. */
export const TABLE_ROW_HEIGHT = 32;

/** Table sticky header height including 1px border-b. Matches h-11 + border. */
export const TABLE_HEADER_HEIGHT = 45;

/** Grid row height (px). Thumbnail (190) + metadata (~105) + cell gap (8). */
export const GRID_ROW_HEIGHT = 303;

/** Grid minimum cell width (px). Columns = floor(containerWidth / MIN_CELL_WIDTH). */
export const GRID_MIN_CELL_WIDTH = 280;

/** Grid cell gap (px). */
export const GRID_CELL_GAP = 8;
```

#### Task 1.2: Replace all local constants in app code

- `ImageTable.tsx`: replace `ROW_HEIGHT`, `HEADER_HEIGHT` with imports
- `ImageGrid.tsx`: replace `ROW_HEIGHT`, `MIN_CELL_WIDTH`, `CELL_GAP` with imports

#### Task 1.3: Replace constants in store tests

- `search-store.test.ts:593`: replace local `ROW_HEIGHT = 32` with import
- `search-store-extended.test.ts:471`: same

#### Task 1.4: Fix E2E tests — pass constants as `page.evaluate()` arguments

Create `e2e/constants.ts`:
```ts
// Re-export layout constants for E2E tests.
// Playwright runs in Node.js — can import from src/.
export {
  TABLE_ROW_HEIGHT,
  GRID_ROW_HEIGHT,
  GRID_MIN_CELL_WIDTH,
} from "../src/constants/layout";
```

Update all `page.evaluate()` closures to use argument passing:
```ts
import { GRID_ROW_HEIGHT, GRID_MIN_CELL_WIDTH } from "./constants";

const visible = await page.evaluate(
  ({ ROW_HEIGHT, MIN_CELL_WIDTH }) => {
    const cols = Math.max(1, Math.floor(el.clientWidth / MIN_CELL_WIDTH));
    const rowTop = rowIdx * ROW_HEIGHT;
    // ...
  },
  { ROW_HEIGHT: GRID_ROW_HEIGHT, MIN_CELL_WIDTH: GRID_MIN_CELL_WIDTH },
);
```

**Files touched:** ~10. **Risk:** zero (pure rename). **Performance:** zero impact.

---

### Phase 2: DOM-Measured Header Height (C1) — ~1.5h

**Goal:** Eliminate the `HEADER_HEIGHT = 45` constant that must match CSS.
Replace with a ResizeObserver-measured value.

#### Task 2.1: Create `useHeaderHeight` hook

```ts
import { useCallback, useRef, useState } from "react";

/**
 * Measures the actual rendered height of a header element via ResizeObserver.
 * Returns [callbackRef, measuredHeight].
 *
 * The callbackRef is assigned to the header element. The hook observes it
 * and updates measuredHeight when the element's border-box height changes.
 *
 * Falls back to TABLE_HEADER_HEIGHT (from constants) on first render before
 * measurement completes — ensures the virtualizer has a reasonable estimate
 * even before the DOM is ready.
 */
export function useHeaderHeight(fallback: number): [
  (el: HTMLDivElement | null) => void,
  number,
] { ... }
```

#### Task 2.2: Wire into ImageTable

- Add `headerRef` callback to the sticky header `<div>`
- Pass `measuredHeaderHeight` to virtualizer's `scrollPaddingTop` and to `useListNavigation`'s `headerHeight`
- Remove the `HEADER_HEIGHT` constant from layout.ts (it becomes
  `TABLE_HEADER_HEIGHT_ESTIMATE` — used only as the fallback)
- Keep `TABLE_HEADER_HEIGHT` export for E2E tests (they don't need
  pixel-perfect measurement, just a reasonable value for assertions)

#### Task 2.3: Performance validation

The ResizeObserver fires at most once per layout (after resize or font
load). It does NOT fire during scroll. Zero scroll-path cost.

Measure: add a `performance.mark()` in the observer callback during dev
to verify it fires ≤3 times per session (mount, optional font load,
optional window resize).

**Files touched:** 3. **Risk:** low (fallback to old constant on first frame).
**Performance:** neutral (observer fires rarely).

---

### Phase 3: Scrubber Decoupling (C6, C7, C22) — ~2h

**Goal:** Eliminate DOM archaeology. Pass scroll container ref as a prop.
Fix tooltip height inconsistency. Stabilise MutationObserver lifecycle.

#### Task 3.1: Pass `scrollContainerRef` to Scrubber via PanelLayout

Currently `PanelLayout` renders the Scrubber as `{scrubber}` (a ReactNode
prop). The caller (search route) creates the Scrubber and passes it.

Change: add a `scrollContainerRef` prop to `ScrubberProps`. The parent
layout (or the density component) provides it.

**Approach:** The density components (ImageTable/ImageGrid) already have
`parentRef` pointing to their scroll container. Lift this to the search
route via a shared ref, pass to both the density component and the Scrubber.

```tsx
// In the search route
const scrollRef = useRef<HTMLDivElement>(null);

<PanelLayout
  scrubber={<Scrubber scrollContainerRef={scrollRef} ... />}
>
  {isGrid
    ? <ImageGrid scrollRef={scrollRef} />
    : <ImageTable scrollRef={scrollRef} />
  }
</PanelLayout>
```

#### Task 3.2: Remove `findScrollContainer` and sibling-walking code

Replace all instances of:
```ts
trackRef.current?.previousElementSibling?.querySelector("[role='region']")
```
with:
```ts
scrollContainerRef.current
```

This eliminates the MutationObserver (no need to watch for DOM changes —
the ref is always correct).

#### Task 3.3: Fix scroll-reset.ts

Replace `document.querySelector(...)` with a module-level ref that the
density components register on mount:

```ts
let _scrollContainer: HTMLElement | null = null;

export function registerScrollContainer(el: HTMLElement | null) {
  _scrollContainer = el;
}

export function resetScrollAndFocusSearch() {
  if (_scrollContainer) {
    _scrollContainer.scrollTop = 0;
    _scrollContainer.scrollLeft = 0;
    _scrollContainer.dispatchEvent(new Event("scroll"));
  }
  // ...rest unchanged
}
```

#### Task 3.4: Fix tooltip height magic number (C7)

Replace:
```ts
top: Math.max(0, Math.min(trackHeight - 48, thumbTop)),
```
with:
```ts
top: Math.max(0, Math.min(trackHeight - (tooltipRef.current?.offsetHeight || 28), thumbTop)),
```

The tooltip element is always in the DOM (`opacity: 0` when hidden), so
`offsetHeight` is always valid. This is a render-path read, but it's a
single `offsetHeight` access on an element that doesn't trigger layout
reflow (its size is determined by its own content, not ancestors).

**Files touched:** ~5. **Risk:** medium (Scrubber is complex; needs E2E validation).
**Performance:** positive (removes MutationObserver + sibling walks).

---

### Phase 4: Performance Micro-Optimisations (C19, C20, C21, C17) — ~2h

#### Task 4.1: Stabilise `handleScroll` callback (C19)

```ts
// Before
const handleScroll = useCallback(() => {
  const range = virtualizer.range;  // ← virtualizer changes every render
  // ...
}, [virtualizer, reportVisibleRange, loadMore]);

// After
const virtualizerRef = useRef(virtualizer);
virtualizerRef.current = virtualizer;

const handleScroll = useCallback(() => {
  const range = virtualizerRef.current.range;
  // ...
}, [reportVisibleRange]);  // reportVisibleRange is stable (no deps)
```

Same pattern for `loadMore` — store in ref.

**Impact:** Eliminates listener teardown/reattach on every render during
scroll. Measurable in Chrome DevTools Performance panel as fewer
"Event Listener" entries.

#### Task 4.2: Memoise column index array in ImageGrid (C20)

```ts
const columnIndices = useMemo(
  () => Array.from({ length: columns }, (_, i) => i),
  [columns],
);

// In render:
{columnIndices.map((colIdx) => { ... })}
```

**Impact:** Eliminates `columns * visibleRows` array allocations per frame.
At 6 cols × 15 rows = 90 allocations → 0 per frame.

#### Task 4.3: Cache Canvas font in `measureText` (C21)

```ts
const lastFontRef = useRef("");
const measureText = useCallback((text: string, font: string): number => {
  // ... canvas creation unchanged ...
  if (font !== lastFontRef.current) {
    ctx.font = font;
    lastFontRef.current = font;
  }
  return Math.ceil(ctx.measureText(text).width);
}, []);
```

**Impact:** Reduces font parsing from N calls to 2 (once for CELL_FONT,
once for HEADER_FONT per fit operation). Font parsing is ~0.1ms per call
on Chrome; at 600 calls that's 60ms → ~0.2ms.

#### Task 4.4: Virtualizer-delta scroll compensation (C17)

Replace:
```ts
el.scrollTop += lastPrependCount * ROW_HEIGHT;
```

With a virtualizer-aware approach:
```ts
// Capture total size BEFORE the buffer mutation is reflected in render
const sizeBefore = virtualizerRef.current.getTotalSize();
// ... after render (in useLayoutEffect) ...
const sizeAfter = virtualizerRef.current.getTotalSize();
el.scrollTop += sizeAfter - sizeBefore;
```

**Caveat:** This requires the virtualizer to have processed the new count
before the layout effect. TanStack Virtual updates synchronously during
render, so `getTotalSize()` in `useLayoutEffect` reflects the new count.

**Alternative (simpler, less invasive):** Keep the multiplication but use
the shared constant. The virtualizer's `estimateSize` returns the same
value, so the multiplication is correct as long as `estimateSize` and the
constant are the same — which they now are (both from `layout.ts`).

**Recommendation:** Keep multiplication for Phase 4 (lower risk). Move to
delta-based in a future phase if variable row heights are needed.

**Files touched:** ~4. **Risk:** low (each is an independent micro-fix).
**Performance:** measurable improvement in scroll-heavy scenarios.

---

### Phase 5: Font String Decoupling (C5) — ~1h

#### Task 5.1: Derive font strings from CSS custom properties

```ts
// In layout.ts or a new font-constants.ts
const ROOT_FONT_FAMILY = "'Open Sans', ui-sans-serif, system-ui, sans-serif";

// In computeFitWidth, read --text-xs from the document:
function getCellFontString(): string {
  // Cache after first read — font size doesn't change during session
  if (_cachedCellFont) return _cachedCellFont;
  const rootStyle = getComputedStyle(document.documentElement);
  const xs = rootStyle.getPropertyValue("--text-xs").trim() || "0.8125rem";
  // Convert rem to px (assume 16px base — Tailwind 4 default)
  const pxSize = parseFloat(xs) * 16;
  _cachedCellFont = `${pxSize}px ${ROOT_FONT_FAMILY}`;
  return _cachedCellFont;
}
```

This reads `getComputedStyle` once (first column-fit invocation), then
caches. No layout thrash — reading a CSS custom property from `:root`
doesn't trigger layout.

**Files touched:** 2. **Risk:** low. **Performance:** neutral (one-shot read).

---

### Phase 6: Panel Constraints Responsiveness (C10) — ~1.5h (design decisions needed)

#### Task 6.1: Dynamic MAX_PANEL_WIDTH_RATIO

```ts
// In panel-store.ts — make the constraint a function
export function getMaxPanelWidth(): number {
  return Math.min(
    window.innerWidth * MAX_PANEL_WIDTH_RATIO,
    window.innerWidth - 320, // always leave 320px for content
  );
}
```

#### Task 6.2: Auto-collapse panels below breakpoint

```ts
// In PanelLayout — collapse panels when viewport < 768px
useEffect(() => {
  const mq = window.matchMedia("(max-width: 768px)");
  const handler = (e: MediaQueryListEvent) => {
    if (e.matches) {
      // Auto-close both panels on mobile
      const { config, togglePanel } = usePanelStore.getState();
      if (config.left.visible) togglePanel("left");
      if (config.right.visible) togglePanel("right");
    }
  };
  mq.addEventListener("change", handler);
  return () => mq.removeEventListener("change", handler);
}, []);
```

**Files touched:** 2. **Risk:** medium (UX decision — needs design review).
**Performance:** neutral.

---

## Phase Summary & Prioritisation

| Phase | Issues Fixed | Effort | Risk | Performance Impact |
|-------|-------------|--------|------|--------------------|
| **1. Shared constants** | C2,C3,C4,C13 | 2h | Zero | None |
| **2. Header measurement** | C1 | 1.5h | Low | Neutral |
| **3. Scrubber decoupling** | C6,C7,C22 | 2h | Medium | Positive |
| **4. Perf micro-opts** | C17,C19,C20,C21 | 2h | Low | **Positive** |
| **5. Font decoupling** | C5 | 1h | Low | Neutral |
| **6. Panel responsiveness** | C10 | 1.5h | Medium | Neutral |

**Total:** ~10 hours of implementation + testing.

**Recommended order:** Phase 1 → 4 → 3 → 2 → 5 → 6

Rationale: Phase 1 is zero-risk and unblocks Phase 4 (shared constants
make the perf fixes cleaner). Phase 4 has the highest performance ROI.
Phase 3 is medium-risk and needs careful E2E validation, so it goes after
the quick wins. Phase 6 is last because it requires design decisions.

---

## Appendix A: Constants Inventory

Complete list of every hardcoded pixel value that appears in multiple files
or couples JS to CSS:

| Constant | Value | Defined in | Duplicated in | Used for |
|----------|-------|-----------|---------------|----------|
| Table ROW_HEIGHT | 32 | ImageTable:167 | store tests ×2, E2E ×3 | Virtualizer, scroll comp, density focus |
| Table HEADER_HEIGHT | 45 | ImageTable:171 | — | scrollPaddingStart, pageFocus, visible-row calc |
| Grid ROW_HEIGHT | 303 | ImageGrid:44 | E2E ×4 | Virtualizer, scroll comp, anchor, density focus |
| Grid MIN_CELL_WIDTH | 280 | ImageGrid:41 | E2E ×4 | Column count calculation |
| Grid CELL_GAP | 8 | ImageGrid:47 | — | Cell sizing, padding |
| CELL_FONT | "13px..." | ImageTable:923 | — | Canvas text measurement |
| HEADER_FONT | "600 14px..." | ImageTable:924 | — | Canvas text measurement |
| PADDING | 32 | ImageTable:918 | — | Column fit width |
| PILL_PADDING | 12 | ImageTable:937 | — | Column fit width |
| PILL_GAP | 2 | ImageTable:938 | — | Column fit width |
| Thumb height 190 | 190 | ImageGrid:130 | — | Grid cell layout |
| Tooltip clamp | 48 | Scrubber:978 | — | Tooltip bottom clamp |
| TRACK_WIDTH | 14 | Scrubber:27 | — | Scrubber layout |
| EDGE | 40 | ImageTable:1341 | — | Auto-scroll zone |
| MAX_SPEED | 20 | ImageTable:1342 | — | Auto-scroll speed |
| MIN_PANEL_WIDTH | 200 | panel-store:55 | — | Panel constraints |
| CQL minHeight | 28px | CqlSearchInput:168 | — | Input sizing |
| CQL baseFontSize | 13px | CqlSearchInput:27 | — | Input font |
| LABEL_HEIGHT | 13 | Scrubber:799 | — | Tick decimation |
| MIN_LABEL_GAP | 18 | Scrubber:763 | — | Tick decimation |
| ISOLATION_THRESHOLD | 80 | Scrubber:779 | — | Tick promotion |

---

## Appendix B: E2E Constant Instances (exhaustive)

Every raw pixel literal inside `page.evaluate()` closures:

| File | Line | Value | Meaning |
|------|------|-------|---------|
| scrubber.spec.ts | 1612 | 280 | GRID_MIN_CELL_WIDTH |
| scrubber.spec.ts | 1614 | 303 | GRID_ROW_HEIGHT |
| scrubber.spec.ts | 1617 | 303 | GRID_ROW_HEIGHT (tolerance) |
| scrubber.spec.ts | 1665 | 32 | TABLE_ROW_HEIGHT |
| scrubber.spec.ts | 1668 | 32 | TABLE_ROW_HEIGHT (tolerance) |
| manual-smoke-test.spec.ts | 336 | 32 | TABLE_ROW_HEIGHT |
| manual-smoke-test.spec.ts | 371 | 280 | GRID_MIN_CELL_WIDTH |
| manual-smoke-test.spec.ts | 373 | 303 | GRID_ROW_HEIGHT |
| manual-smoke-test.spec.ts | 377 | 303 | GRID_ROW_HEIGHT (tolerance) |
| manual-smoke-test.spec.ts | 380 | 303 | GRID_ROW_HEIGHT (visible calc) |
| manual-smoke-test.spec.ts | 484 | 280 | GRID_MIN_CELL_WIDTH |
| manual-smoke-test.spec.ts | 485 | 303 | GRID_ROW_HEIGHT |
| rendering-perf-smoke.spec.ts | 856 | 280 | GRID_MIN_CELL_WIDTH |
| rendering-perf-smoke.spec.ts | 857 | 303 | GRID_ROW_HEIGHT |
| rendering-perf-smoke.spec.ts | 859 | 32 | TABLE_ROW_HEIGHT |

**Total:** 15 instances across 3 files.

---

## Appendix C: Performance Budget

Target scroll performance (Chrome DevTools, 6× CPU throttle):

| Metric | Current | After Phase 4 | Method |
|--------|---------|---------------|--------|
| Scroll handler time | ~0.8ms | ~0.5ms | Stable callback, no listener churn |
| Grid render (15 rows) | ~2.1ms | ~1.8ms | Memoised column array |
| Column fit-all (10 cols) | ~80ms | ~15ms | Cached canvas font |
| Density switch | ~45ms | ~40ms | Stable scroll compensation |

These are estimates based on profiling patterns. Actual measurements should
be taken before/after each phase.

---

*Created from analysis of `fix-ui-coupling.md` with expanded scope covering
performance implications, additional coupling categories, and a concrete
implementation plan.*


