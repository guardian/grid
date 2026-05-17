# Scroll-to-Center Investigation

> Started 17 May 2026. 6th agent session on this problem.
> Previous 4 agents produced 168 lines of uncommitted changes (now stashed).
> 5th agent stashed everything and started measurement approach.
> This agent (6th) established reproducible Playwright measurements.

## The Problem

After returning to the grid/table from image detail or fullscreen preview,
the focused image row should be vertically centered. It isn't — it lands
too low.

## Environment

| Property | Value |
|---|---|
| User's screen | 1800 × 1169 |
| User's `innerWidth × innerHeight` | 1775 × 994 |
| User's `devicePixelRatio` | 2 |
| Playwright viewport | 1775 × 994 (matching user's innerHeight) |
| Playwright DPR | 1 (Chromium default, not overridden) |
| Branch | `mk-next-next-next` |
| HEAD | `7e9509df2` |
| Working tree | clean (stash has prior work) |
| Untracked | `kupua/e2e/smoke/centering-diag.spec.ts` (diagnostic test) |
| Modified | `dev/nginx-mappings.yml.template` (nginx mapping for kupua, restored from stash) |

## Confirmed Measurements (clean HEAD)

### User's real browser (Chrome, macOS)

| Exit path | Grid | Table |
|---|---|---|
| Image detail exit | **0 px — perfect** | **~79 CSS px too low** (user's earlier measurement) |
| Fullscreen preview exit | **~132 CSS px too low** | **~211 CSS px too low** |

Grid-detail-exit is the ONLY correct path. All others are broken.

### Playwright (DIAG 2 — table detail exit, 1775×994)

| Metric | Value |
|---|---|
| `offsetFromContainerCenter` | **45 CSS px** too low |
| `offsetFromUsableCenter` | **27 CSS px** too low |
| User's Photoshop measurement of same Playwright run | **91 physical px / 2 = 45.5 CSS px** |
| **Verdict** | **Test matches user's measurement.** |

Note: User's "~79 CSS px" earlier measurement may have been at a different
viewport. The 45 CSS px Playwright result is the canonical baseline for
table-detail-exit.

### What the test measures

```
containerCenter = containerTop + containerH / 2    (center of whole table incl. header)
usableCenter    = containerTop + headerH + (containerH - headerH) / 2
offsetFromContainerCenter = focusedRowCenter - containerCenter
```

Container dimensions at 1775×994:
- `containerTop`: 72 (SearchBar 36 + StatusBar 36)
- `containerH`: 910  (`innerHeight - containerTop - 12` — the 12px is unknown, possibly scrollbar or rounding)
- `headerH`: 36 (sticky table header, measured by ResizeObserver)
- `containerCenter`: 527
- `usableCenter`: 545

### Fullscreen measurements — NOT YET TESTED in Playwright

Playwright can't reproduce the real macOS fullscreen bug because Playwright's
"fullscreen" fills the viewport without triggering macOS's native fullscreen
animation. The timing issue (centering fires before macOS resize animation
completes) is invisible to Playwright.

These numbers are user-reported only and from a different viewport. Need to
be re-measured if we want to attack them.

## Architecture: How Centering Works at HEAD

### Three call sites, one mechanism

All three use `scrollToIndex(rowIdx, { align: "center" })` from TanStack Virtual:

1. **Detail exit** — `useReturnFromDetail.ts` line ~115:
   `virtualizer.scrollToIndex(rowIdx, { align: "center" })`

2. **Fullscreen preview exit** — `useScrollEffects.ts` line ~289:
   `virtualizerRef.current.scrollToIndex(rowIdx, { align: "center" })`
   (called via `registerScrollToFocused` → `scrollFocusedIntoView`)

3. **Keyboard nav** — `useScrollEffects.ts` line ~797:
   `virtualizer.scrollToIndex(rowIdx, { align: "center" })`
   (via `_pendingFocusDelta` handler)

### Why grid detail exit works but table detail exit doesn't

**Grid**: No sticky header inside the scroll container. `scrollToIndex({align:"center"})`
centers within the full container height. The content top = container top. Centering
is correct.

**Table**: Has a 36px sticky header INSIDE the scroll container. TanStack Virtual's
`scrollToIndex({align:"center"})` centers within the full container (910px), but the
visible content area is only 910 - 36 = 874px. The centered position is calculated
using 910px, making the row land too low by roughly half the header height... except
we see 45px, not 18px. Something else is contributing.

### `scrollPaddingStart` at HEAD

Table virtualizer has:
```ts
scrollPaddingStart: headerHeight - ROW_HEIGHT   // = 36 - 32 = 4
```

Previous agents believed this should be `scrollPaddingStart: headerHeight` (= 36).
The stash includes that one-line fix. However: `scrollPaddingStart` in TanStack
Virtual affects **clamping**, not the center calculation itself. Its effect on
`align: "center"` needs to be verified by reading TanStack source or by applying
the fix and measuring.

### The 45px error — what is it?

- `headerH` = 36 → `headerH / 2` = 18
- `containerTop` = 72 (app toolbars above the table)
- `ROW_HEIGHT` = 32
- `scrollPaddingStart` at HEAD = `headerHeight - ROW_HEIGHT` = 4

The constant 45px regardless of viewport suggests a fixed geometric offset, not a
proportional error. It's suspiciously close to `TABLE_HEADER_HEIGHT` (37) + some
small constant, or to `containerTop / 2` (36). The "double counting" that a
previous agent identified — the exact mechanism is unclear and needs code-level
analysis of TanStack Virtual's `scrollToIndex` implementation.

## What Previous Agents Tried (All in Stash)

### 1. `scrollPaddingStart: headerHeight` (ImageTable.tsx)

**Change**: Removed `- ROW_HEIGHT` from `scrollPaddingStart: headerHeight - ROW_HEIGHT`.
**Rationale**: The `- ROW_HEIGHT` was a fudge that made the padding too small.
**Status**: Not measured in isolation. Was part of a larger set of changes.

### 2. Custom `scrollRowToCenter` callbacks (ImageGrid.tsx, ImageTable.tsx)

**Change**: Added explicit `scrollToOffset` math to both components.
**Status**: Never measured individually.

#### Stashed centering formula

**Table** (from stashed `ImageTable.tsx`):
```ts
const el = parentRef.current;
const rect = el.getBoundingClientRect();
const visibleHeight = Math.min(
  el.clientHeight,
  window.innerHeight - Math.max(0, rect.top),
  rect.bottom,
);
const rowStart = rowIdx * ROW_HEIGHT;
const rowCenter = rowStart + ROW_HEIGHT / 2;
const usableHeight = visibleHeight - headerHeight;
virtualizer.scrollToOffset(Math.max(0, rowCenter - usableHeight / 2));
```

**Grid** (from stashed `ImageGrid.tsx`):
```ts
const rowStart = rowIdx * ROW_HEIGHT;
const rowCenter = rowStart + ROW_HEIGHT / 2;
const target = rowCenter - visibleHeight / 2;  // no header subtraction
virtualizer.scrollToOffset(Math.max(0, target));
```

Key difference: table subtracts `headerHeight` from `visibleHeight` to get `usableHeight`.
Grid uses full `visibleHeight`. Both use `visibleHeight = min(clientHeight, viewport-clipped)`
to handle cases where the container is partially off-screen.

Note: the grid formula may be unnecessary — `scrollToIndex({align:"center"})` already
works perfectly for grid (no sticky header). The stash replaced it anyway, which was
over-engineering.

### 3. `scrollRowToVisualCenter` in useScrollEffects.ts

**Change**: Added `getClippedVisibleHeight()` + `scrollRowToVisualCenter()` function.
Replaced all 3 `scrollToIndex({align:"center"})` call sites with this function.
Included diagnostic logging.

**Rationale**: Centralise the centering logic. Account for clipped ancestors.
**Status**: This was the most invasive change (~85 lines). Never measured individually.

### 4. Fullscreen exit timing (FullscreenPreview.tsx)

**Change**: `cleanupAfterExit(waitForResize: boolean)` — when exiting real fullscreen,
debounce resize events (wait 150ms after last resize, safety timeout 800ms) before
scrolling.

**Rationale**: macOS animates the window back from fullscreen. Centering during the
animation uses wrong dimensions.
**Status**: The session memory says this still left grid fullscreen exit ~45px off.
The debounce approach was tried but didn't fully work. Playwright can't test this.

### 5. `GRID_THUMBNAIL_HEIGHT` constant (layout.ts)

**Change**: Added `GRID_THUMBNAIL_HEIGHT = 190`.
**Status**: Unused. Leftover from exploration.

## What We Know For Certain

1. **Grid detail exit is perfect at HEAD.** Do not break this.
2. **Table detail exit is 45 CSS px too low** at HEAD (confirmed in both Playwright and Photoshop).
3. **The error is constant regardless of viewport height** (45px at 1169, 45px at 994).
4. **The error is in `scrollToIndex({align:"center"})`**, not in our code — we're calling
   TanStack Virtual correctly, but it doesn't account for the sticky header.
5. **Fullscreen exit has a separate timing bug** — macOS animation. Invisible to Playwright.
   Must be fixed independently and tested manually.

## Next Steps

1. **Understand TanStack Virtual's center calculation** — read the source to see exactly
   how `scrollToIndex({align:"center"})` and `scrollPaddingStart` interact. This tells
   us whether fixing `scrollPaddingStart` alone fixes the 45px, or whether we need
   custom `scrollToOffset` math.

2. **Test `scrollPaddingStart: headerHeight` fix** — apply the one-line change, re-run
   DIAG 2, measure.

3. **If that's not enough, test custom centering** — extract the table centering formula
   from the stash, apply minimally, measure.

4. **Write regression test** — once the fix is confirmed, encode the 45px baseline
   as a failing test, apply fix, confirm it passes.

5. **Fullscreen timing** — separate concern. Attack after detail-exit is fixed.

---

## Addendum A: TanStack Virtual Issues & PRs (researched 17 May 2026)

### Issue #265 — "scrollToIndex does not have a way to take paddingStart/paddingEnd into account"

- Filed Feb 2022, closed Jun 2022.
- **Exactly our problem**: sticky header inside scroll container, `scrollToIndex` scrolls
  items under the header.
- Fix: added `scrollPaddingStart`/`scrollPaddingEnd` options (PR #269, later folded into v3).
- Dantman (author): "I've been using scrollPaddingStart and it's been working."
- **But**: his use case was almost certainly `align: "start"` or `"auto"`, not `"center"`.
  See Addendum B for why this matters.

### Issue #931 — "scrollToOffset with align: 'center' doesn't align correctly anymore"

- Regression in v3.11.2 (PR #864), fixed in v3.13.2 (PR #935).
- **Not our bug** — kupua uses v3.13.23, fix already included.
- But relevant context: the center alignment codepath has been fragile and been broken
  before.

### No other issues match

Searched for: `scrollToIndex center sticky`, `scrollPaddingStart center`,
`sticky header scrollToIndex`, `scrollToIndex offset`. No open issues about
center alignment + sticky header. This appears to be an under-reported
interaction.

---

## Addendum B: TanStack Virtual Source Analysis (v3.13.23)

### The centering algorithm, traced step by step

`scrollToIndex(rowIdx, { align: "center" })` calls `getOffsetForIndex(rowIdx, "center")`:

```
getOffsetForIndex(index, "center"):
  item = measurementsCache[index]
  // For non-auto, non-end alignment:
  toOffset = item.start - scrollPaddingStart
  return getOffsetForAlignment(toOffset, "center", item.size)

getOffsetForAlignment(toOffset, "center", itemSize):
  size = getSize()   // scrollElement.clientHeight = 910
  toOffset += (itemSize - size) / 2
  return clamp(toOffset, 0, maxScrollOffset)
```

Expanding: `scrollTop = item.start - scrollPaddingStart + (itemSize - size) / 2`

### Where the row lands (theoretical)

```
rowPosition = item.start - scrollTop
            = item.start - (item.start - scrollPaddingStart + (itemSize - size)/2)
            = scrollPaddingStart - itemSize/2 + size/2

rowCenter   = rowPosition + itemSize/2
            = scrollPaddingStart + size/2
```

**The row center always lands at `scrollPaddingStart + size/2` from the container top**,
regardless of which row we're centering or the scroll position. This is a pure geometric
result — no dynamic factors.

### The fundamental conflict

For a sticky header of height H, the "usable center" (center of the area below the
header) is at:

```
usableCenter = H + (size - H) / 2 = H/2 + size/2
```

For the row center to match the usable center:

```
scrollPaddingStart + size/2 = H/2 + size/2
→ scrollPaddingStart = H/2
```

But for `align: "start"` (scrolling a row to just below the header):

```
scrollPaddingStart = H     (the full header height)
```

**These two requirements conflict.** `scrollPaddingStart` cannot be set to a single
value that works correctly for both start and center alignment with a sticky header.

| `scrollPaddingStart` value | `align: "start"` | `align: "center"` |
|---|---|---|
| 0 | Row hidden under header | Row centered in container (ignoring header) |
| H/2 (= 18) | Row half-hidden under header | Row centered in usable area ✓ |
| H (= 36) | Row just below header ✓ | Row too low by H/2 |

This is arguably a TanStack Virtual design limitation: `scrollPaddingStart` was designed
for start/end/auto clamping, not for center-point adjustment.

### Observed vs theoretical

The theoretical formula predicts row center at `4 + 455 = 459px` from container top.
The actual measurement shows 500px. There's a **constant 41px discrepancy** between
theory and reality. This is likely caused by the sticky header being a flow child
inside `data-table-root` (the virtualizer's content wrapper) — its 36px of flow space
shifts the absolute-positioned virtual rows downward in the scroll coordinate system.
The exact mechanism is unclear without a DOM debugger, but the discrepancy is constant
and independent of viewport height or scroll position.

With the 41px offset factored in:

```
actual_rowCenter = scrollPaddingStart + size/2 + 41
```

For perfect centering in usable area:
```
scrollPaddingStart + size/2 + 41 = H/2 + size/2
scrollPaddingStart = H/2 - 41 = 18 - 41 = -23
```

**A negative value is needed, which is nonsensical.** This confirms that `scrollPaddingStart`
alone CANNOT fix the table centering for `align: "center"` in our DOM layout.

### Stale comments in ImageTable.tsx

The code comments say "TABLE_HEADER_HEIGHT = 45" (lines 524, 729) but the actual constant
is 37. The comments are stale from when the constant was different. The ResizeObserver
measures 36px at runtime. Minor but confusing for future readers.

### Conclusion: scrollToIndex({align:"center"}) is fundamentally unsuitable for table

The right fix is **not** to tune `scrollPaddingStart`. It's to use `scrollToOffset` with
explicit centering math that accounts for the sticky header, exactly as the stashed code
did. The formula:

```ts
const rowStart = rowIdx * ROW_HEIGHT;
const rowCenter = rowStart + ROW_HEIGHT / 2;
const usableHeight = containerClientHeight - headerHeight;
const target = rowCenter - usableHeight / 2;
virtualizer.scrollToOffset(Math.max(0, target));
```

This bypasses TanStack's centering entirely and computes the correct scroll position.
**Grid doesn't need this** — it has no sticky header, so `scrollToIndex({align:"center"})`
works perfectly.

### Impact on the plan

1. ~~Test scrollPaddingStart fix~~ — won't work for center alignment (proven above).
2. Apply custom `scrollToOffset` centering for **table only**.
3. Keep `scrollToIndex({align:"center"})` for **grid** (confirmed working).
4. The two centering mechanisms (`useReturnFromDetail` and `registerScrollToFocused`)
   both need the fix — they both call the same `scrollToIndex`.
5. The stashed code already has the right formula (see "Stashed centering formula"
   in §"What Previous Agents Tried").

---

## Addendum C: Research Plan for Next Session (added 17 May 2026)

> Audience: Opus 4.6 orchestrator delegating to Sonnet subagents.
> Goal: stop guessing about the 41px discrepancy. Get DOM-level ground truth,
> then decide between two fix paths (structural vs custom-offset).
>
> **Sequencing matters.** Sessions R1, R1b, and R2 run in parallel (all read-only).
> R3 is gated on R1 + R1b results. R4 is optional and only useful if R1 leaves
> the mechanism unclear.
>
> **R3 default is DO NOT RUN.** R3 (structural restructure) has a large blast
> radius — likely a week of collateral test/behaviour fixes across horizontal
> scroll sync, column resize, keyboard nav, scroll restoration, perceived-perf
> traces, and Playwright assertions baked on current geometry. Path B (custom
> `scrollToOffset` for table only) is the default fix path. R3 is only worth
> its cost if R1b surfaces multiple independent second-reasons that R3 would
> simultaneously cure.

### R1 — Pin down the 41px (DOM ground-truth measurement) [PREREQUISITE]

**Mindset:** measurement only. No code changes to `src/`. No fix attempts.

**Why this first:** Five prior agents stashed 168 lines of fixes without ever
reading `getBoundingClientRect()` on the focused row in a paused frame. The
41px discrepancy between TanStack's theoretical formula and observed reality
is the entire root cause and remains a guess. Until this number is decomposed,
every fix is speculation.

**Steps:**

1. Branch from `7e9509df2` (clean HEAD). Do not pop the stash.
2. Extend `kupua/e2e/smoke/centering-diag.spec.ts` with a new test
   `DIAG 3 — DOM ground truth, table detail exit`. Reuse the existing
   exit-from-detail setup from DIAG 2.
3. After the centering scroll settles (use existing wait pattern from DIAG 2),
   in-page `evaluate` the following and return them all in one object:
   - `containerRect = parentRef.getBoundingClientRect()` (top, height,
     clientHeight) — find `parentRef` via a stable `data-testid` you may need
     to add temporarily (`data-testid="virtual-scroll-container"` on the
     scroll element; remove after R1 commits).
   - `headerRect = stickyHeader.getBoundingClientRect()` (top, height).
     Find via existing role/class.
   - `focusedRowRect = focusedRow.getBoundingClientRect()` (top, height).
     Existing focused-row selector.
   - `virtualizerState`:
     - `scrollOffset = virtualizer.scrollOffset` (expose via a one-line
       `window.__kupuaVirtualizer = virtualizer` debug hook in `ImageTable.tsx`
       gated behind `import.meta.env.MODE === "test"`; revert after R1).
     - `virtualItem = virtualizer.getVirtualItems().find(v => v.index === focusedRowIdx)`
       — capture `{ index, start, size }`.
     - `scrollPaddingStart` (read from options).
   - `contentWrapperRect = data-table-root.getBoundingClientRect()` (top relative
     to container, height).
   - `domTreePath`: walk parent chain from focusedRow up to parentRef, emit
     each element's `tagName + className + position style (computed)`.
4. Compute and log the following derived values:
   - `tanstackPredictedRowTopFromContainer = virtualItem.start - scrollOffset`
     (where TanStack thinks the row top is, relative to container top)
   - `actualRowTopFromContainer = focusedRowRect.top - containerRect.top`
   - `delta = actualRowTopFromContainer - tanstackPredictedRowTopFromContainer`
     (this IS the "41px" — or whatever it actually is)
   - `headerOffsetInContainer = headerRect.top - containerRect.top + headerRect.height`
   - `contentWrapperOffsetFromContainer = contentWrapperRect.top - containerRect.top`
5. Print all numbers to test output. Do **not** assert anything yet — the
   point is to read the numbers.

**Falsifiable expectations / interpretation rules:**

- If `delta ≈ 0` → TanStack's model matches DOM. The 41px in Addendum B was
  measurement error (header inside `containerH` vs outside). Re-derive the
  fix from the corrected geometry; the conclusion in Addendum B "Impact on
  the plan" may be wrong.
- If `delta ≈ 36` (header height) → confirmed: the sticky header in flow
  shifts absolute-positioned rows in scroll-space. Fix paths: (a) remove
  header from flow (R3), (b) custom `scrollToOffset` that adds `delta` to
  the target.
- If `delta ≈ 41` (matches Addendum B) → the extra ~5px needs another pass.
  Compare `headerRect.height` (DOM) vs `TABLE_HEADER_HEIGHT` constant (37)
  vs `ROW_HEIGHT` (32). One of these mismatches likely accounts for it.
- If `delta` is none of the above → write a Section 0 noting "predicted
  mechanism wrong, here are the actual numbers" and stop. Do not invent a
  theory to fit.

**Deliverable:** ONE markdown file appended to this doc as "Addendum D — R1
Ground Truth". Required sections:
1. Raw numbers table (all values from step 3).
2. Derived deltas table (all values from step 4).
3. Mechanism conclusion (one of the four cases above, cited with numbers).
4. Diff of the diagnostic test added (so it can be kept or reverted).
5. Recommendation: "proceed to R3" / "skip R3, use custom offset with X correction" / "stop, premise wrong".

**Out of scope:** Any change to `ImageTable.tsx`, `ImageGrid.tsx`,
`useScrollEffects.ts`, `useReturnFromDetail.ts` beyond the temporary debug
hook and `data-testid` mentioned above. No fix attempts.

**Estimated session size:** small. One diagnostic test, one set of measurements,
one markdown deliverable.

---

### R1b — Second-reason audit: what else would header-outside fix? [PARALLEL WITH R1]

**Mindset:** bug-and-pain-point inventory. Read-only. No fix proposals.
No speculation about future features — current pain only.

**Why this exists:** R3 (structural restructure) is only worth a week of work
if it cures multiple problems at once. Centering alone does NOT justify it —
Path B handles that for a day. This session decides whether R3 has a
portfolio of justifications or just the one.

**Steps:**

1. Read the following files end-to-end and catalogue every comment, TODO,
   workaround, or piece of compensating logic that exists *because* the
   sticky header lives inside the virtualizer's scroll container or because
   row geometry has to compensate for header height:
   - `kupua/src/components/ImageTable.tsx`
   - `kupua/src/components/ImageGrid.tsx`
   - `kupua/src/hooks/useScrollEffects.ts`
   - `kupua/src/hooks/useReturnFromDetail.ts`
   - `kupua/src/components/FullscreenPreview.tsx`
   - Anything under `kupua/src/lib/orchestration/` that touches scroll/focus.
   - `kupua/src/lib/reset-to-home.ts`
2. Grep `kupua/src/` for `headerHeight`, `TABLE_HEADER_HEIGHT`, `scrollPaddingStart`,
   `scrollPaddingEnd`, `sticky`, and `parentRef`. For each hit, note in one
   line: "compensation for header-in-container" vs "unrelated".
3. Read `kupua/exploration/docs/worklog-current.md`, `changelog.md` (recent
   entries only), and any "known issues" / "bugs" tracked in AGENTS.md.
   Tag any entry where the root cause was or might be header-in-flow geometry.
4. Read the perceived-perf trace sites (search-store, useDataWindow,
   useScrollEffects scroll-handlers) — note any jank or timing workarounds
   that are header-geometry-related.
5. Sanity-check with the user before delivering: "are there any known UX
   complaints — header overlap, scroll-restoration drift, keyboard-nav
   row-hidden-under-header, Home key wrong position — that I should add to
   the inventory?" Do NOT skip this step. The user has context the
   codebase doesn't.

**Falsifiable expectations:**

- Inventory must be cited (file:line for code items, doc-section for doc items).
- Items must be CURRENT pain — not speculative future features.
- Each item must be classified: "R3 would cure this" / "R3 would partially
  help" / "unrelated, just header-adjacent".
- Volume bound: expect 3–15 entries. Fewer than 3 → R3 not justified.
  More than 15 → likely over-counting; re-read with stricter classification.

**Deliverable:** Markdown appended as "Addendum D2 — R1b Second-Reason
Audit". Required sections:
1. Inventory table: `item | file:line or doc ref | R3-cures? (yes/partial/no) | severity (S1 bug / S2 degradation / S3 latent / N nuisance)`.
2. Count by severity: "R3 would cure: X S1 bugs, Y S2, Z S3, W nuisances".
3. User-confirmed UX complaints (from step 5).
4. Explicit recommendation: **"R3 justified — N independent S1/S2 issues
resolved"** OR **"R3 not justified — go Path B"**.
5. If recommending R3, also state: which of the listed items would NOT be
   solved by Path B + a 1-hour follow-up. (Many "second reasons" may turn out
   to be cheap to fix independently.)

**Out of scope:** fix proposals, refactor commentary, style notes,
speculation about future features. Pure inventory.

**Estimated session size:** small to medium. 45–90 minutes of reading plus
the user check.

---

### R2 — DOM hierarchy audit (read-only) [PARALLEL WITH R1]

**Mindset:** static code reading. No browser. No tests. No edits.

**Why parallel with R1:** R1 measures runtime DOM; R2 reads source for DOM
structure. They cross-check each other. If R2's static reading says "header
is sibling of parentRef" but R1's measurements show otherwise, something is
mounting differently than the source suggests.

**Steps:**

1. Read `kupua/src/components/ImageTable.tsx` end to end.
2. Identify and document:
   - The exact element that becomes `parentRef.current` (the scroll
     container passed to `useVirtualizer({ getScrollElement })`).
   - The exact element that is the virtualizer's content wrapper (the one
     with `height: virtualizer.getTotalSize()`, typically `data-table-root`).
   - The exact element that is the sticky table header.
   - For each: its CSS `position` (computed at runtime if non-obvious from
     source — note ambiguity rather than guess), its parent, its siblings.
3. Repeat for `kupua/src/components/ImageGrid.tsx` for comparison.
4. Cross-reference with `kupua/src/components/data-table/*` if the table is
   composed of sub-components.

**Falsifiable expectations:**

- The doc claims "sticky header being a flow child inside `data-table-root`".
  Either confirm this with a file:line citation or refute it.
- Virtual rows should be `position: absolute` with `top: item.start`. Confirm
  with file:line.

**Deliverable:** ONE markdown file appended as "Addendum E — R2 DOM Audit".
Required sections:
1. 10-line ASCII diagram of table DOM hierarchy from scroll container down to
   a virtual row, annotated with `position` values and key dimensions.
2. Same diagram for grid (for comparison).
3. Citations (file:line) for every structural claim.
4. Explicit answer: "is the sticky header inside or outside the virtualizer's
   scroll container?" with citation.
5. Explicit answer: "is the sticky header a flow child or absolute/fixed?"
   with citation.

**Out of scope:** suggesting fixes, refactor proposals, style commentary.

**Estimated session size:** small. ~30-60 minutes of reading.

---

### DECISION POINT (Opus 4.6 reads R1 + R1b + R2, decides)

After R1, R1b, and R2 land, the orchestrator has enough to choose:

- **If R1's `delta` is small (≤5px) and R2 confirms clean DOM:** the original
  Addendum B analysis was wrong. Re-derive fix from corrected numbers. Likely
  a tiny `scrollPaddingStart` tweak suffices. Skip R3 regardless of R1b.
- **If R1's `delta` is large (~36px) and R2 shows header-in-flow inside
  scroll container:** Path B is the default. R3 is only chosen if **ALL** of:
  - R1b inventory lists ≥2 independent S1/S2 issues that Path B + cheap
    follow-ups would NOT also resolve.
  - User explicitly approves the week-of-collateral cost based on R1b's list.
  - A quick scan suggests R3 won't break horizontal scroll sync irreparably
    (i.e., 2b is viable, not just 2a).
  Otherwise: **Path B**. Apply stashed `scrollToOffset` formula with `delta`
  correction. File the second-reason items from R1b as separate small
  follow-ups, not as justification for R3.
- **If R1's `delta` is unexpected (other value):** new hypothesis needed.
  Run a follow-up R1.5 before committing to any fix.

**Default assumption:** Path B wins. The bar for R3 is deliberately high
because prior agents have already burned a week chasing centering fixes that
turned out to be small-and-local in scope.

---

### R3 — Header-outside-scroll-container spike [HIGH-BAR, GATED]

**DEFAULT: DO NOT RUN.** This session is only justified if ALL the gating
conditions in the Decision Point above are met — in particular, R1b must
list ≥2 independent S1/S2 issues that Path B will not also fix, AND the
user has explicitly approved the week-of-collateral cost.

The blast radius is large: horizontal scroll sync, column resize/reorder,
keyboard nav, scroll restoration, infinite-scroll trigger, perceived-perf
traces, and ~15–40 Playwright specs with geometry assertions are all
at risk. The "≤5 broken specs" expectation below is optimistic; if you
start this session, recalibrate based on R1b's actual inventory.

**Mindset:** implementation spike. Throwaway branch. Goal is to discover cost
and side effects, not produce a merge-ready PR.

**Steps:**

1. Branch from `7e9509df2`. Name `mk-spike-header-outside`.
2. Restructure `ImageTable.tsx` so the sticky header is a sibling of, not a
   child of, the virtualizer's scroll container. Two sub-options to consider:
   - 2a: Two scroll containers — header in non-scrolling region above, rows
     in scroll container below. Simpler but breaks horizontal scroll sync.
   - 2b: Single horizontal scroll wrapper containing two stacked vertical
     regions (header non-scrolling, rows scrolling). Preserves h-scroll sync.
   - Start with 2a. Note h-scroll behaviour.
3. Set `scrollPaddingStart: 0` everywhere it was non-zero.
4. Revert all three centering call sites to plain `scrollToIndex({align:"center"})`.
5. Run `npm --prefix kupua run test:e2e -- centering-diag` and capture
   DIAG 2's new offset.
6. Run full unit + e2e surface to spot collateral damage. Document every
   broken test — do not fix them in this session.
7. Test horizontal scroll behaviour manually (if 2a, expect it to be broken).

**Falsifiable expectations:**

- DIAG 2 offset should drop to ≤5px. If it doesn't, the header-in-flow
  hypothesis is incomplete; report back without merging.
- Unit test breakage should be ≤5 specs. More than that = restructure too
  invasive; recommend Path B instead.

**Deliverable:** Markdown report appended as "Addendum F — R3 Spike".
Required sections:
1. Final DIAG 2 offset (number).
2. Diff size (lines added/removed across all files).
3. Broken tests (list, with one-line cause each).
4. Horizontal scroll status (works / broken / not tested).
5. Recommendation: "merge this, fix tests" / "discard, go Path B" /
   "rework as 2b and retry".

**Out of scope:** Fixing collateral test failures. Polishing. Updating
fullscreen timing logic (separate concern).

**Estimated session size:** medium. 1-3 hours including measurement.

---

### R4 — TanStack precedent search [OPTIONAL]

**Skip unless R1+R2 leave the mechanism genuinely unclear.** This is a
last-resort "has anyone else solved this" search.

**Steps:**

1. GitHub code search across public consumers of `@tanstack/react-virtual`
   v3 for the conjunction: sticky table header inside scroll container +
   `align: "center"` calls.
2. Read at least 3 real-world implementations end-to-end (not snippets).
   Note their approach: structural (header outside), custom offset,
   `scrollPaddingStart` tuned, or "they don't actually center".
3. Check TanStack Virtual issues filed after Issue #265 (closed Jun 2022)
   for any reopens or related discussions.

**Deliverable:** Markdown appended as "Addendum G — R4 Precedent".
Required: 3 cited approaches with file URLs + line numbers, plus a one-paragraph
synthesis. If <3 real precedents found, say so explicitly.

**Out of scope:** copying code (license/attribution risk). Propose approaches
in our own words.

**Estimated session size:** small. 30-60 minutes.

---

### What success looks like (orchestrator's checklist)

Before declaring the centering problem solved:

- [ ] R1 + R2 deliverables exist and agree on the mechanism.
- [ ] A fix is committed that drops DIAG 2 offset to ≤5px (regression test).
- [ ] Grid detail exit still measures 0px (regression test).
- [ ] Full `npm --prefix kupua test` and `npm --prefix kupua run test:e2e`
      pass.
- [ ] User manually verifies on their real browser (1800×1169 macOS) that
      table detail exit and (separately) fullscreen exit both look right.
- [ ] Fullscreen timing bug is filed as a separate follow-up if not yet fixed
      (it almost certainly is — different root cause).
- [ ] This investigation doc is moved from "current" status to "archived",
      with a one-line link to the commit(s) that fixed it.

---

## Addendum D2: R1b Second-Reason Audit (completed 17 May 2026)

> Executed alongside R1/R2 by the 8th agent session.
> Files read: `ImageTable.tsx`, `ImageGrid.tsx`, `useScrollEffects.ts`,
> `useReturnFromDetail.ts`, `FullscreenPreview.tsx`, `useListNavigation.ts`,
> `useHeaderHeight.ts`, `reset-to-home.ts`, `layout.ts`, `constants/layout.ts`,
> all of `src/lib/orchestration/`, `AGENTS.md`, `changelog.md` (recent entries),
> `worklog-current.md`.
> Grep targets: `headerHeight`, `TABLE_HEADER_HEIGHT`, `scrollPaddingStart`,
> `scrollPaddingEnd`, `sticky`, `parentRef`, `headerOffset`.
> User UX sanity-check: "Nothing specific, general polish only" — no additional
> complaints to add to inventory.

### 1. Inventory table

| # | Item | File:line | R3-cures? | Severity |
|---|---|---|---|---|
| 1 | Table detail-exit centering 45px too low | `useReturnFromDetail.ts:115` | yes | **S2** |
| 2 | Table fullscreen-exit centering 45px too low | `useScrollEffects.ts:289` (`registerScrollToFocused` callback) | yes | **S2** |
| 3 | Table centering wrong on `_pendingFocusDelta` path (arrow key after scrubber seek) | `useScrollEffects.ts:~797`, effect #9 | yes | S3 latent |
| 4 | `scrollPaddingStart: headerHeight - ROW_HEIGHT` fudge (= 4px) is wrong for both `align:"start"` and `align:"center"` | `ImageTable.tsx:731` | yes | S3 latent |
| 5 | `headerOffset` asymmetry in density-focus ratio vs sort-focus ratio | `useScrollEffects.ts:596–598, 939, 1040` | yes | N nuisance |
| 6 | `headerHeight` parameter in `useListNavigation` page-scroll math (table passes 36, grid passes 0) | `useListNavigation.ts:64, 225, 236, 330, 338` | yes | N nuisance |
| 7 | `useHeaderHeight` ResizeObserver machinery exists only to feed `scrollPaddingStart` | `useHeaderHeight.ts`, `ImageTable.tsx:528` | yes | N nuisance |
| 8 | `TABLE_HEADER_HEIGHT = 37` in `layout.ts` but DOM measures 36px; used as `headerOffset` (1px error in density-focus ratio) | `layout.ts:17`, `ImageTable.tsx:750` | no | N nuisance |
| 9 | Stale comment "TABLE_HEADER_HEIGHT = 45" (long superseded) | `ImageTable.tsx:524, 729` | no | N nuisance |

### 2. Counts by severity

| Group | Items | Severity |
|---|---|---|
| R3 would cure, Path B would **also** cure | 1, 2, 3 | 2× S2, 1× S3 |
| R3 would cure, Path B would **not** cure | 4, 5, 6, 7 | 1× S3, 3× N |
| Neither R3 nor Path B cures (cheap independent fixes) | 8, 9 | 2× N |

**R3 would cure: 0 S1 bugs, 2 S2, 2 S3, 3 nuisances.**
**Items Path B + cheap follow-ups would NOT fix: 1 S3 and 3 nuisances** — none S1 or S2.

### 3. Notes on individual items

**Item 1 (detail exit)** and **item 2 (fullscreen exit)**: Both are the same root cause (TanStack
`align: "center"` ignoring the sticky header's flow space), just at different call sites.
They are not independent bugs — they are two instances of one bug.

**Item 3 (`_pendingFocusDelta` path)**: Fires only when the user has scrubbed to a distant
position and then presses an arrow key. The focused row recenters with the same 45px error.
Functionally the row is visible; visually it's imprecise. Latent because this path is
uncommon day-to-day.

**Item 4 (`scrollPaddingStart: 4`)**: The current value (= `headerHeight - ROW_HEIGHT` = 4)
means `align: "start"` places a row 9px below the header bottom instead of flush with it
(45px from container top vs 36px ideal). This is imprecise but the row is visible. Addendum B
proves that no single `scrollPaddingStart` value can satisfy both `align: "start"` and
`align: "center"` simultaneously — so the fudge is load-bearing for `align: "start"`
and irrelevant to the centering bug (which needs a custom `scrollToOffset` fix).

**Item 5 (headerOffset asymmetry)**: The density-focus save formula is
`ratio = (rowTop + headerOffset - scrollTop) / clientHeight`, while sort-focus uses
`ratio = (rowTop - scrollTop) / clientHeight`. The asymmetry is intentional and documented
(comment at `useScrollEffects.ts:596–598`). No visible bug; just a fragile invariant that
a future reader could break by "normalising" the two formulas without understanding why
they differ.

**Items 6–7 (useHeaderHeight, headerHeight param)**: Pure compensating machinery. The hook
is ~60 lines; the parameter flows through `useListNavigation`'s page-scroll math. Currently
correct. Eliminable by R3 but harmless as-is.

**Items 8–9 (stale constant, stale comment)**: Independent 5-minute fixes. Not caused by
R3, not fixed by R3.

### 4. User-confirmed UX complaints

User response: "Nothing in particular. Just that all of it, while pretty impressive, could
still probably be polished." — no specific header-geometry UX complaint beyond the centering
bug already known from the investigation.

### 5. Explicit recommendation: **R3 not justified — go Path B**

The R3 gating condition from the Decision Point was:
> "R1b must list ≥2 independent S1/S2 issues that Path B will not also fix."

This audit finds **zero** S1/S2 issues that Path B would not also fix. The only S2 bugs are
items 1 and 2 — both instances of the same centering failure, both cured by Path B's custom
`scrollToOffset`. Items Path B cannot fix (4, 5, 6, 7) are all S3/nuisance with no
user-visible breakage or degradation today.

R3 would clean up compensating code (~4 items, ~80-100 lines total), but the blast radius
(horizontal scroll sync, column resize, 15-40 Playwright geometry assertions) is a week of
collateral work for a net reduction of complexity that is currently causing zero bugs. That
is not a good trade.

**Path B. Apply the `scrollToOffset` centering formula for table only. Keep grid on
`scrollToIndex({align:"center"})`. The `useHeaderHeight`/`scrollPaddingStart`/`headerOffset`
machinery can stay — it is harmless.**

Items 8 and 9 (stale constant and comment) should be fixed as a 5-minute standalone cleanup
commit, independently of the centering fix.

---

## Addendum E: R2 DOM Hierarchy Audit (completed 17 May 2026)

> Completed by Opus 4.6 from source reading during the same session that
> produced Addendums A and B. No browser session needed — all claims are
> from static source analysis with file:line citations.

### 1. Table DOM hierarchy (scroll container → virtual row)

```
<div ref={parentRef}                          ← SCROLL CONTAINER
     overflow-auto, flex-1                       (ImageTable.tsx:1310-1314)
     position: static (default)
  │
  ├── <style> (CSS variable injection)           (ImageTable.tsx:1318-1323)
  │
  └── <div data-table-root                    ← VIRTUALIZER CONTENT WRAPPER
           role="grid"                           (ImageTable.tsx:1328-1335)
           height: virtualizer.getTotalSize()
           position: relative (via className)
           display: inline-block, min-w-full
      │
      ├── <div ref={headerCallbackRef}        ← STICKY HEADER
      │        data-table-header                 (ImageTable.tsx:1340-1345)
      │        position: sticky, top: 0
      │        z-index: 10
      │        display: inline-flex
      │        height: h-9 (36px)
      │        IN NORMAL FLOW — occupies 36px
      │        of vertical space in data-table-root
      │
      └── <div                                ← VIRTUAL ROW (repeated)
               position: absolute                (ImageTable.tsx:291-297)
               left: 0, right: 0
               height: virtualRow.size (32px)
               transform: translateY(virtualRow.start)
```

### 2. Grid DOM hierarchy (for comparison)

```
<div ref={parentRef}                          ← SCROLL CONTAINER
     overflow-y-auto, overflow-x-hidden          (ImageGrid.tsx:870-876)
     flex-1, pt-1
  │
  └── <div                                    ← VIRTUALIZER CONTENT WRAPPER
           height: virtualizer.getTotalSize()    (ImageGrid.tsx:880-883)
           position: relative
           width: 100%
      │
      └── <div                                ← VIRTUAL ROW (repeated)
               position: absolute                (ImageGrid.tsx:889-893)
               left: 0, right: 0
               top: virtualRow.start
               height: ROW_HEIGHT
```

**Key structural difference:** Grid has NO header inside the scroll container.
The content wrapper is a direct child of the scroll container, and virtual rows
are the only children of the content wrapper.

### 3. Citations for every structural claim

| Claim | File:Line |
|---|---|
| `parentRef` is the scroll container (table) | `ImageTable.tsx:1310` (`ref={parentRef}`) |
| `parentRef` has `overflow-auto` (table) | `ImageTable.tsx:1313` (`className="... overflow-auto ..."`) |
| `parentRef` passed to virtualizer (table) | `ImageTable.tsx:729` (`getScrollElement: () => parentRef.current`) |
| `data-table-root` is content wrapper (table) | `ImageTable.tsx:1328-1335` |
| Content wrapper has `position: relative` | `ImageTable.tsx:1335` (`className="relative inline-block min-w-full"`) |
| Content wrapper height = totalSize | `ImageTable.tsx:1333` (`height: virtualizer.getTotalSize()`) |
| Sticky header is child of content wrapper | `ImageTable.tsx:1340` (indented inside `data-table-root` div) |
| Header is `position: sticky, top: 0` | `ImageTable.tsx:1344` (`className="sticky top-0 z-10 ..."`) |
| Header height class = `h-9` (36px) | `ImageTable.tsx:1344` |
| Virtual rows are `position: absolute` | `ImageTable.tsx:291` (`className="absolute left-0 right-0 ..."`) |
| Virtual rows use `translateY(virtualRow.start)` | `ImageTable.tsx:297` |
| `parentRef` is scroll container (grid) | `ImageGrid.tsx:870` (`ref={parentRef}`) |
| Grid has no header inside scroll container | `ImageGrid.tsx:870-910` (only content wrapper + rows) |
| Grid content wrapper is `position: relative` | `ImageGrid.tsx:882` (`className="relative w-full"`) |
| Grid rows use `top: virtualRow.start` | `ImageGrid.tsx:891` |
| `scrollPaddingStart` (table) | `ImageTable.tsx:731` (`scrollPaddingStart: headerHeight - ROW_HEIGHT`) |
| No `scrollPaddingStart` (grid) | grep returns 0 matches in `ImageGrid.tsx` |

### 4. Is the sticky header inside or outside the virtualizer's scroll container?

**Inside.** The header (`data-table-header`, line 1340) is a child of
`data-table-root` (line 1328), which is a child of `parentRef` (line 1310).
`parentRef` IS the scroll container (`getScrollElement: () => parentRef.current`,
line 729). Therefore the header is two levels deep inside the scroll container.

### 5. Is the sticky header a flow child or absolute/fixed?

**Flow child.** `position: sticky` elements participate in normal document flow
for layout purposes — they occupy space in the flow exactly like `static` or
`relative` elements. The header's 36px of height is part of the normal flow
inside `data-table-root`. This means:

- `data-table-root`'s content starts with 36px of header, then the remaining
  space is conceptually "available" for absolute-positioned rows.
- BUT: absolute-positioned rows are positioned relative to `data-table-root`'s
  padding box (it's `position: relative`). `translateY(0)` places a row at
  the TOP of `data-table-root` — overlapping the header.
- When scrolled, the sticky header stays fixed at the top of the viewport
  while rows scroll underneath it. A row with `translateY(0)` scrolls up
  and disappears under the header.

**This is the root cause of the centering error.** TanStack Virtual's
`scrollToIndex({align:"center"})` calculates the scroll position using
`scrollElement.clientHeight` (= full container height including the header
area). But the visually usable area is `clientHeight - headerHeight`. The
center point TanStack targets is too high by `headerHeight / 2`, and
separately, the flow-child header shifts row positions in scroll-space by
an additional amount that R1 will quantify.

### Cross-check with R1

R1's runtime measurements should confirm:
- `containerRect.height` ≈ 910 (full `clientHeight`)
- `headerRect.height` ≈ 36
- `contentWrapperRect.top - containerRect.top` ≈ 0 (content wrapper starts at container top)
- `delta` (actual vs TanStack-predicted row position) ≈ 36 or 41 — this is the number R1 exists to pin down

---

## Addendum D: R1 Ground Truth (completed 17 May 2026)

> Executed by the 7th agent session. Branch `mk-r1-centering-diag`.
> Test: `DIAG 4 — DOM ground truth, table detail exit` in `centering-diag.spec.ts`.
> Run: `npm --prefix kupua run test:e2e -- --config playwright.smoke.config.ts --grep "DIAG 4"`

### 1. Raw numbers table

| Measurement | Value |
|---|---|
| `focusedId` | `064074ea992df505aa70738e40a701c7ae999150` |
| `ariaRowIndex` (= virtualRow.index + 2) | 156 → `focusedVIdx = 154` |
| `container.top` | 72 px |
| `container.height` (getBoundingClientRect) | 910 px |
| `container.clientHeight` | 910 px |
| `header.top` (viewport) | 72 px |
| `header.height` | 36 px |
| `contentWrapper.top` (viewport) | −4413 px |
| `contentWrapper.height` | 6400 px |
| `focusedRow.top` (viewport) | 556 px |
| `focusedRow.height` | 32 px |
| `focusedRow.center` (viewport) | 572 px |
| `domScrollTop` | 4485 px |
| `virt.scrollOffset` | 4485 px (exact match — no lag) |
| `scrollPaddingStart` | 4 (= 36 − 32 = headerHeight − ROW_HEIGHT) |
| `focusedVItem.index` | 154 |
| `focusedVItem.start` | 4928 (= 154 × 32) |
| `focusedVItem.size` | 32 |

### 2. Derived deltas table

| Derived value | Formula | Value |
|---|---|---|
| `tanstackPredictedRowTopFromContainer` | `item.start − virt.scrollOffset = 4928 − 4485` | **443 px** |
| `actualRowTopFromContainer` | `focusedRow.top − container.top = 556 − 72` | **484 px** |
| **DELTA (actual − predicted)** | | **41 px** |
| `headerBottomFromContainerTop` | `header.top − container.top + header.height = 72−72+36` | **36 px** |
| `contentWrapperTopFromContainer` | `contentWrapper.top − container.top = −4413 − 72` | **−4485 px** (= −scrollTop ✓) |
| `containerCenter` | `container.top + container.height / 2 = 72 + 455` | 527 px |
| `usableCenter` | `container.top + header.height + (container.height − header.height) / 2` | 545 px |
| `focusedCenter` | `focusedRow.center = 572` | 572 px |
| `offsetFromContainerCenter` | `572 − 527` | **+45 px** (too low) |
| `offsetFromUsableCenter` | `572 − 545` | **+27 px** (too low) |

**Verification of stash scrollTarget:** TanStack computed `scrollTarget = item.start − scrollPaddingStart + (item.size − containerH) / 2 = 4928 − 4 + (32 − 910)/2 = 4924 − 439 = 4485`. Measured `domScrollTop = 4485`. ✓ The centering scroll fired correctly; the error is purely geometric.

**Row position within contentWrapper:**
`actualRowTopFromContainer − contentWrapperTopFromContainer = 484 − (−4485) = 4969`.
TanStack's `item.start = 4928`. Offset = `4969 − 4928 = 41`. This 41px is the "static position" of absolute rows inside `data-table-root`.

### 3. Mechanism conclusion

**Case 3 — matches Addendum B prediction exactly.**

`delta = 41`. This is composed of:

- **36 px** — sticky header's flow height. The virtual rows use `position: absolute, top: auto` (no explicit `top`). For absolutely-positioned elements with `top: auto`, the browser uses the "static position" — where the element would be if it were `position: static`. Since the sticky header (36 px) is the only flow child before the virtual rows in `data-table-root`, all virtual rows have static position = 36 px from the content wrapper top.

- **5 px** — unexplained by static code analysis. The most likely cause: `data-table-root` has `display: inline-block`. Inline-block elements have `vertical-align: baseline` by default, creating a small alignment gap within their line box context. The scroll container's `overflow: auto` creates a block formatting context, but `inline-block` children still participate in an inline formatting context within that BFC. A 5 px rounding artifact or line-height-derived gap is consistent with this layout. (See Note below.)

**Note on `TABLE_HEADER_HEIGHT = 37` constant:** `TABLE_HEADER_HEIGHT` in `layout.ts` is 37, but the DOM measures 36 px. This constant is passed as `headerOffset` to `useScrollEffects` (for density-focus restore calculations), NOT for virtualizer centering. The virtualizer uses `headerHeight` state from `useHeaderHeight` (ResizeObserver-measured = 36). The 1 px constant mismatch is a stale discrepancy in density-focus restore logic, unrelated to the centering bug.

**DOM tree path (confirmed):**
```
<div position="absolute" transform="translateY(4928px)">   ← virtual row
  <div position="relative">                                 ← data-table-root
    <scroll-container>
```

The sticky header is a sibling (not a parent) of virtual rows. Three DOM levels only. This matches R2's structural analysis exactly.

### 4. Diff of diagnostic additions (reverted now)

**`kupua/src/components/ImageTable.tsx`:**

*Change 1* — `data-testid` on scroll container (line ~1308):
```diff
-        aria-label="Image results table"
+        aria-label="Image results table"
+        data-testid="virtual-scroll-container"
```

*Change 2* — virtualizer debug hook (after virtualizer creation, before `useScrollEffects`):
```diff
+  useEffect(() => {
+    if (import.meta.env.DEV && typeof window !== "undefined") {
+      (window as any).__kupuaVirtualizer = virtualizer;
+    }
+  });
```

**`kupua/e2e/smoke/centering-diag.spec.ts`:**
Added `DIAG 4: DOM ground truth — table detail exit` (~180 lines). Reuses DIAG 2 setup (table detail exit). Evaluates and prints all DOM measurements from R1's step 3/4. No assertions.

### 5. Recommendation

**Skip R3. Apply Path B (custom `scrollToOffset`). Use DOM-reading approach for zero error.**

The stashed formula — `scrollToOffset(rowIdx * ROW_HEIGHT + ROW_HEIGHT/2 − (containerH − headerH)/2)` — reduces the error from 27 px to ~5 px. That may be acceptable, but the 5 px residual is structural (from the `inline-block` gap) and will be consistent across rows, making centering visibly imprecise.

A cleaner fix with zero error reads the row's actual DOM position after a coarse `scrollToIndex` bring-into-view step:

```ts
// Step 1: bring row into view (TanStack handles overscan + render)
virtualizer.scrollToIndex(rowIdx, { align: "start" });
// Step 2: after one animation frame (row is now rendered and on-screen),
//         read actual position and adjust scrollTop to center it
requestAnimationFrame(() => {
  const el = parentRef.current!;
  const rowEl = el.querySelector(`[data-image-id="${imageId}"]`) as HTMLElement | null;
  if (!rowEl) return;
  const containerRect = el.getBoundingClientRect();
  const rowRect = rowEl.getBoundingClientRect();
  const rowCenter = rowRect.top + rowRect.height / 2 - containerRect.top;
  const usableCenter = headerHeight + (el.clientHeight - headerHeight) / 2;
  el.scrollTop += rowCenter - usableCenter;
});
```

This is robust: it doesn't assume static_pos = 0, doesn't depend on `headerHeight` value being exact before the DOM renders, and will correctly handle any future DOM structure changes. The stash can be used as a starting point but should be replaced with this pattern.

**R3 is not recommended** — R1b (second-reason audit) has not been run, and the centering fix is entirely achievable with Path B. R3 has a week-of-collateral blast radius and would need R1b to justify it.

**Fullscreen timing** remains a separate concern (macOS animation race, Playwright can't test it). File as a follow-up after Path B lands.

