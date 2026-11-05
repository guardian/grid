# Kupua Coupling Audit — Pixel Constants, UI→Logic Leakage, and Brittle Design

> *"What app is it if changing some UI element suddenly breaks core functionality?"*
>
> This report catalogues every dangerous coupling between visual presentation and
> functional behaviour. Severity ratings:
> - 🔴 **Critical** — changing a CSS class or pixel value breaks scroll position, navigation, data loading, or test suites
> - 🟡 **Moderate** — changing a value causes visual glitches or requires coordinated multi-file edits
> - 🟢 **Low** — cosmetic coupling, easy to fix, no functional impact

---

## 🔴 C1: Table `HEADER_HEIGHT` — the coupling that started this conversation

**Files:** `ImageTable.tsx:171`, `useListNavigation.ts:206,218,228`

```
const HEADER_HEIGHT = 45;  // ← hardcoded = h-11 (44px) + 1px border-b
```

This JS constant must exactly match the CSS `h-11` class on the header `<div>` plus
the `border-b` (1px). If you change the header height via CSS:

1. **`scrollPaddingStart: HEADER_HEIGHT - ROW_HEIGHT`** — virtualizer thinks rows
   behind the header are visible. `scrollToIndex` fails to bring rows into view.
2. **`pageFocus()` in useListNavigation** — `viewportRowSpace = el.clientHeight - headerHeight`
   computes wrong page size. PageUp/PageDown jump wrong distances.
3. **First/last visible row** — `(scrollTop + clientHeight - headerHeight) / rowHeight`
   miscalculates which row is at the bottom of the viewport. Focus lands on wrong row.
4. **First visible row (PageUp)** — `(scrollTop + headerHeight) / rowHeight` — wrong
   starting row for upward page movement.

**The design flaw:** A Tailwind CSS class (`h-11`) is the source of truth for a dimension
that JS also needs. There is no mechanism to derive one from the other. The comment
"h-11 + 1px border-b" is the only link — a human must maintain it.

**Fix direction:** Measure `headerHeight` from the DOM at mount time (ref on the header
element → `el.offsetHeight`). Pass measured value to virtualizer config and
`useListNavigation`. Remove the constant entirely.

---

## 🔴 C2: Table `ROW_HEIGHT = 32` — duplicated in 6 places

**Files:** `ImageTable.tsx:167`, `search-store.test.ts:593`, `search-store-extended.test.ts:471`,
E2E tests: `scrubber.spec.ts:1665`, `manual-smoke-test.spec.ts:336`, `rendering-perf-smoke.spec.ts:859`

The table row height is hardcoded as the literal `32` in **six files**. Change the
row height in the component? Five other files silently break:

- **scroll compensation** (`el.scrollTop += lastPrependCount * ROW_HEIGHT`) — wrong
  pixel adjustment → content jumps on backward extend
- **forward evict compensation** (`el.scrollTop -= lastForwardEvictCount * ROW_HEIGHT`)
  — wrong → infinite extend loop (Bug #16 resurfaces)
- **density-focus ratio** (`localIdx * ROW_HEIGHT - el.scrollTop`) — wrong ratio →
  density switch scrolls to wrong position
- **seek scroll** — virtualizer receives wrong `scrollToIndex` hint
- **E2E tests** — `localIdx * 32` hardcoded inside `page.evaluate()` closures that
  run in the browser context (can't import the constant). Tests pass with wrong
  assertions or fail for wrong reasons.
- **Store tests** — `ROW_HEIGHT = 32` redeclared as local constants. Tests validate
  ratio math with stale values if the real row height changes.

**The design flaw:** A view-layer pixel dimension leaks into state management tests and
E2E browser-context code. The constant is not importable from a shared location. The
E2E copies are particularly dangerous — they're inside `page.evaluate()` strings where
you can't use imports.

**Fix direction:** Export `ROW_HEIGHT` from a shared constants file. For E2E tests,
inject constants via `page.evaluate((ROW_HEIGHT) => ..., ROW_HEIGHT)` parameter passing
instead of hardcoding in the closure.

---

## 🔴 C3: Grid `ROW_HEIGHT = 303` — same problem, different view

**Files:** `ImageGrid.tsx:44`, E2E: `scrubber.spec.ts:1614`, `manual-smoke-test.spec.ts:373,380,485`,
`rendering-perf-smoke.spec.ts:857,866`

Same pattern as C2. The grid row height `303` is duplicated as raw literals in 4 E2E files.
All the same scroll compensation, anchor calculation, and density-focus code depends on it.
Grid has **additional** coupling:

- **Scroll anchor on column count change** — `Math.floor(localIdx / cols) * ROW_HEIGHT`
  used in `captureAnchor()` and `restoreAnchor` layout effect. Wrong value → images jump
  on panel toggle/resize.
- **reportVisibleRange** — `firstRowIdx * columns` to `(lastRowIdx + 1) * columns - 1`
  is correct but derived from virtualizer items that assume `estimateSize: () => ROW_HEIGHT`.

---

## 🔴 C4: Grid `MIN_CELL_WIDTH = 280` — duplicated in 3 E2E files

**Files:** `ImageGrid.tsx:41`, E2E: `scrubber.spec.ts:1612`, `manual-smoke-test.spec.ts:371,484`,
`rendering-perf-smoke.spec.ts:856`

`Math.max(1, Math.floor(el.clientWidth / 280))` is copy-pasted into E2E test `page.evaluate()`
closures. If you change the minimum cell width in the component, E2E tests compute wrong
column counts → wrong row indices → wrong scroll position assertions → false failures
or (worse) false passes.

---

## 🟡 C5: `computeFitWidth` font string constants

**File:** `ImageTable.tsx:923-924`

```ts
const CELL_FONT = "13px 'Open Sans', sans-serif";
const HEADER_FONT = "600 14px 'Open Sans', sans-serif";
```

The comment even admits it: *"⚠️ SYNC: these must match the font sizes rendered by CSS."*
If you change `--text-xs` in `index.css` from 13px, or change the font family, or change
the header weight, these strings go stale. Auto-fit columns will compute wrong widths —
either too narrow (text truncated) or too wide (wastes space).

Also: `PADDING = 8 + 8 + 16` hardcodes `px-2` (8px each side) + sort arrow space.
`PILL_PADDING = 12` hardcodes `px-1.5` (6px × 2). `PILL_GAP = 2` hardcodes `gap-0.5`.

**The design flaw:** Canvas text measurement requires explicit font strings. There's no
way to read the computed CSS font from a virtual (not-yet-rendered) element. This is an
inherent limitation — but it could at least derive the font size from the CSS custom
property instead of hardcoding `"13px"`.

**Fix direction:** Read `getComputedStyle()` from an existing rendered cell to extract the
actual font string. Or accept the coupling but centralise the font definitions (export
from a shared constants module, use in both CSS theme and JS).

---

## ✅ C6: Scrubber `findScrollContainer` — DOM structure coupling — RESOLVED (31 Mar 2026)

**File:** `Scrubber.tsx:409-413`, `scroll-reset.ts:20-22`

**Fix applied:** New module `src/lib/scroll-container-ref.ts`. Density components
(`ImageTable`, `ImageGrid`) call `registerScrollContainer(el)` on mount/unmount.
`Scrubber.tsx` calls `getScrollContainer()` — `findScrollContainer` function and all
sibling-walking code removed. `scroll-reset.ts` updated to use same ref.
`MutationObserver` also removed (no longer needed — density mount/unmount updates the ref).

---

## ✅ C7: Scrubber tooltip `trackHeight - 48` magic number — RESOLVED (31 Mar 2026)

**File:** `Scrubber.tsx:979`

**Fix applied:** `trackHeight - 48` replaced with `trackHeight - (tooltipRef.current?.offsetHeight || 28)`.
Now consistent with all other clamping sites.

---

## 🟡 C8: `CqlSearchInput` min-height and font size

**File:** `CqlSearchInput.tsx:168, 27`

```ts
el.style.minHeight = "28px";
baseFontSize: "13px",
```

The CQL web component receives hardcoded pixel values for its minimum height and base
font size. These must visually harmonise with the search bar container (`h-11` = 44px
minus padding). If the bar height changes, the input won't adapt.

**Fix direction:** Derive from CSS custom properties or from the container's computed
style, not hardcoded strings.

---

## 🟡 C9: Density-focus uses `ROW_HEIGHT` for pixel↔index conversion

**Files:** `ImageTable.tsx:847`, `ImageGrid.tsx:568`

```ts
saveFocusRatio((localIdx * ROW_HEIGHT - el.scrollTop) / el.clientHeight, localIdx);
```

And on restore:
```ts
const rowTop = Math.floor(idx / cols) * ROW_HEIGHT;
const targetScroll = rowTop - saved.ratio * el.clientHeight;
```

The density-focus bridge converts between pixel positions and ratios using
`ROW_HEIGHT`. If the row height changes, the saved ratio from the unmounting view
will produce wrong scroll positions in the mounting view. Since the two views
(table 32px, grid 303px) have *different* row heights, the bridge works correctly
today only because each view uses its own constant. But the **save** and **consume**
happen in different components — there's an implicit contract that the localIndex is
geometrically meaningful to the consumer. If either view's row height changes
independently, the ratio is still valid (it's viewport-relative), but the localIndex
is used as a fallback for the image lookup, which is fine.

**Assessment:** Actually less coupled than it appears — the `ratio` is the primary
mechanism and is geometry-independent. The `localIndex` is an eviction guard, not a
pixel value. **This one is OK.** Downgrading to informational.

---

## 🟡 C10: Panel width constants live in the store, not the view

**File:** `panel-store.ts:51-56`

```ts
const DEFAULT_LEFT_WIDTH = 280;
const DEFAULT_RIGHT_WIDTH = 320;
export const MIN_PANEL_WIDTH = 200;
export const MAX_PANEL_WIDTH_RATIO = 0.5;
```

Panel dimensions are persisted to localStorage. If you change the defaults, existing
users keep their old widths (localStorage wins). This is correct for user preferences,
but the **min/max constraints** being in the store means the view can't enforce its own
layout constraints independently. For mobile-friendly work, you'd want the panel
system to respond to viewport width — but the constraints are static numbers, not
responsive.

**Fix direction:** For mobile, panel constraints need to be viewport-aware (e.g.
`MAX_PANEL_WIDTH_RATIO` should be dynamic based on screen width, or panels should
collapse to overlays below a breakpoint). The current static approach won't survive
responsive design.

---

## 🟡 C11: Column resize `EDGE = 40` and `MAX_SPEED = 20` auto-scroll constants

**File:** `ImageTable.tsx:1341-1342`

```ts
const EDGE = 40;
const MAX_SPEED = 20;
```

The auto-scroll zone width and speed during column resize drags are hardcoded in
pixels. On smaller screens (mobile/tablet), 40px from the edge might be the entire
visible area. Speed of 20px/frame is calibrated for a desktop monitor at 60fps.

**Assessment:** Low impact for now, but will be wrong on mobile. These should scale
with viewport width or be configurable.

---

## 🟡 C12: Scrubber tick label layout constants

**File:** `Scrubber.tsx:799, various`

```ts
const LABEL_HEIGHT = 13;
const MIN_LABEL_GAP = 18;
const ISOLATION_THRESHOLD = 80;
```

These control label decimation — which tick labels are shown based on pixel spacing.
They assume a specific font size (`9px` specified in the tick label render code).
If the font size changes, `LABEL_HEIGHT` and `MIN_LABEL_GAP` need manual adjustment.
`ISOLATION_THRESHOLD = 80` is a magic number for when isolated year ticks get promoted
to major visual treatment — but it's purely cosmetic, so this is low-risk.

---

## 🔴 C13: E2E test pixel constants — the silent killer

**Files:** `scrubber.spec.ts`, `manual-smoke-test.spec.ts`, `rendering-perf-smoke.spec.ts`

This is the worst category. **Raw pixel literals inside `page.evaluate()` closures:**

```ts
// scrubber.spec.ts:1665
const rowTop = localIdx * 32;

// manual-smoke-test.spec.ts:373
const rowTop = rowIdx * 303;

// rendering-perf-smoke.spec.ts:856
const cols = Math.max(1, Math.floor(el.clientWidth / 280));
rowTop = Math.floor(localIdx / cols) * 303;
```

These run inside the browser context where imports don't work. Every pixel constant
from the app is **copy-pasted as a raw number**. There are **at least 15 instances**
across 3 test files. They cannot be automatically checked for consistency. They will
silently produce wrong assertions if the source constants change.

**The design flaw:** No mechanism to share constants between app code and Playwright
`page.evaluate()` closures. The `page.evaluate()` API supports argument passing, but
it's not used — every constant is inlined.

**Fix direction:**
1. Export all layout constants from a shared `src/constants/layout.ts`
2. In E2E tests, pass them as `page.evaluate()` arguments:
   ```ts
   import { ROW_HEIGHT, MIN_CELL_WIDTH } from "../src/constants/layout";
   await page.evaluate(({ ROW_HEIGHT }) => {
     const rowTop = localIdx * ROW_HEIGHT;
   }, { ROW_HEIGHT });
   ```

---

## 🟢 C14: SearchBar / StatusBar / ImageDetail — visual height consistency

**Files:** `SearchBar.tsx:115`, `StatusBar.tsx:56`, `ImageDetail.tsx:364`

All three bars use `h-11` (SearchBar, ImageDetail header) or `h-7` (StatusBar).
These aren't coupled to any JS logic — they're pure CSS. The visual consistency
is maintained by using the same Tailwind class. **Not a coupling problem** — this
is how it should work. Noted only for completeness.

---

## 🟢 C15: `TRACK_WIDTH = 14` and `THUMB_INSET = 3` in Scrubber

**File:** `Scrubber.tsx:27,36`

These are used only within the Scrubber's own render code. Changing them affects
only the scrubber's visual appearance. No other component depends on these values.
**Clean isolation.**

---

## 🟢 C16: `DateFilter` dropdown — `w-80 p-4` hardcoded width

**File:** `DateFilter.tsx:357`

Fixed dropdown width (`w-80` = 320px). On mobile screens narrower than 320px, this
will overflow. But it's a pure CSS problem with no JS coupling. A responsive class
or `max-w-full` would fix it.

---

## Summary: Severity by impact area

| ID | Severity | What breaks | Files affected | Mobile risk |
|----|----------|------------|----------------|-------------|
| C1 | 🔴 | Scroll, PageUp/Down, scrollToIndex | 2 | High — different header height on mobile |
| C2 | 🔴 | Scroll compensation, density switch, E2E tests | 6 | High — row height may change for touch targets |
| C3 | 🔴 | Scroll anchoring, E2E tests | 5 | High — cell height responsive to screen |
| C4 | 🔴 | E2E column calculations | 4 | High — different breakpoints |
| C5 | 🟡 | Auto-fit column widths | 1 | Low |
| C6 | ✅ | Scrubber sync, scroll reset — RESOLVED | 2 | Med — layout structure may differ |
| C7 | ✅ | Tooltip clipping at track bottom — RESOLVED | 1 | Low |
| C8 | 🟡 | Search input sizing | 1 | Med — input height may change |
| C9 | 🟡→🟢 | (False alarm — ratio-based, actually OK) | 2 | Low |
| C10 | 🟡 | Panel constraints on small screens | 1 | **Critical for mobile** |
| C11 | 🟡 | Column resize auto-scroll | 1 | Med |
| C12 | 🟡 | Tick label spacing | 1 | Low |
| C13 | 🔴 | E2E test correctness | 3 | High |
| C14 | 🟢 | None — correct pattern | 3 | Low |
| C15 | 🟢 | None — self-contained | 1 | Low |
| C16 | 🟢 | Dropdown overflow on narrow screens | 1 | Med |

---

## Root cause analysis

The fundamental problem is **the absence of a measurement layer**. The app has:

- **A CSS layer** (Tailwind classes) that controls dimensions
- **A JS layer** (constants, virtualizer config, scroll math) that needs those dimensions
- **No bridge between them**

Every `const FOO_HEIGHT = N` is a manual sync point between CSS and JS. The app has
**at least 7 such sync points** (table row height, table header height, grid row height,
grid cell width, grid cell gap, font sizes, padding values).

**Why virtualizers make this worse:** TanStack Virtual requires `estimateSize` — a
function returning the expected row height in pixels. This is correct and unavoidable.
But the app then **reuses** this constant for scroll compensation, position calculation,
and focus management instead of measuring the actual DOM. The virtualizer's
`estimateSize` is a hint for recycling efficiency; using it as ground truth for scroll
math creates the coupling.

**Why E2E tests make this worse:** Playwright's `page.evaluate()` runs in the browser
context, isolated from Node.js imports. This forces test authors to copy-paste pixel
constants as raw literals. There's no lint rule or type check to catch drift.

---

## Recommended fix priority (for mobile-readiness)

1. **C1 — Measure header height from DOM** (eliminates the deadliest coupling)
2. **C2+C3+C4 — Shared layout constants file** + E2E argument passing (C13)
3. **C6 — Scrubber receives scroll container ref** (eliminates DOM archaeology)
4. **C10 — Responsive panel constraints** (prerequisite for mobile)
5. **C5 — Derive font from computed style** (nice-to-have)

Items 1–3 are probably half a day's work. Item 4 is a design decision (overlay panels
on mobile? bottom sheet? hidden entirely?). Item 5 is a refinement.

---

*The core principle violated: **UI dimensions should flow from CSS to JS via measurement,
never from JS constants that must be manually synced with CSS.** The one exception is
virtualizer `estimateSize`, which is an approximation by design — but even there, the
value should be derived from a single shared source, not duplicated across files.*

