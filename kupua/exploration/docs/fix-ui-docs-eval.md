# Kupua Coupling Audit — Evaluation Report

> **Created:** 2026-03-30
> **Status:** Living document.
> **Sources evaluated:** `fix-ui-coupling.md` (the audit), `fix-ui-coupling-plan.md` (the
> expanded plan), `frontend-philosophy.md` (the UX constitution), and the full
> `kupua/src/` source tree.

---

## Executive Summary

Both coupling documents are accurate diagnoses of a real class of problem. The original
audit (`fix-ui-coupling.md`) identifies seven critical sync points between CSS and JS;
the expanded plan (`fix-ui-coupling-plan.md`) widens the lens to seven additional
performance and lifecycle issues. Taken together, the remediation programme directly
supports *browser performance* in measurable ways and indirectly supports the
*flexibility and extensibility* goals described in `frontend-philosophy.md`. However,
neither document probes whether the chosen architecture — a React/Zustand SPA with
TanStack Virtual — is the *best* possible model for the unique UX requirements described
in the philosophy. That question deserves its own analysis, which this report provides
in Part 3.

---

## Part 1 — How the Coupling Fixes Improve Browser Performance

### 1.1 The scroll path is the hot path

Kupua's UX core is a continuously-scrolled, virtualised list over up to 9 million
images. Every millisecond saved on the scroll path compounds: at 60 fps a single slow
frame is 16.6 ms; at 120 Hz it halves to 8.3 ms. The coupling issues the documents
identify mostly live *on or adjacent to* the scroll path:

| Issue | Where it fires | Real-world cost |
|---|---|---|
| **C19 — `handleScroll` listener churn** | Every render during fast scroll | `useEffect` teardown + reattach × N renders. The windowed-buffer store calls `set()` on every page extend; each call can trigger a render; each render creates a new `handleScroll` function (because `virtualizer` is a new object every render), tearing down and re-registering the passive scroll listener. |
| **C20 — `Array.from({length: columns})` per virtual row** | Every render of every visible row | 6 columns × 15 visible rows × 60 fps = 5,400 array allocations per second for GC to reclaim. Measurable on low-end hardware (6× CPU throttle). |
| **C21 — Canvas `ctx.font` set on every `measureText` call** | Column double-click-to-fit | 600 font-string parses (10 cols × 60 visible rows) collapsing to 2 after fix. Font-shorthand tokenisation + system-font lookup is not free. Appendix C of the plan estimates 80 ms → 15 ms — a main-thread block on a user-visible action. |
| **C17 — `scrollTop` compensation multiplies by `ROW_HEIGHT` constant** | Backward-extend and forward-evict `useLayoutEffect` | Currently correct as long as `estimateSize` and the constant agree, but wrong compensation triggers the infinite-extend loop (Bug #16). Runs on every buffer extend event. |
| **C22 — MutationObserver created on every Scrubber effect re-run** | Panel toggle, resize, density switch | Dense re-runs (rapid panel resize) each instantiate and GC a MutationObserver + closure. Brief window where two observers coexist. |
| **C6 — `findScrollContainer` DOM archaeology in scroll listener** | Every scroll event in scroll mode | `trackRef.current?.previousElementSibling?.querySelector("[role='region']")` is an O(subtree) DOM query called from within an active scroll listener. Even short DOM walks inhibit scroll-linked animation offloading in the browser compositor. |

**C1 — `HEADER_HEIGHT = 45` hardcoded** is a correctness issue more than a perf issue:
wrong `scrollPaddingStart` on the virtualizer causes `scrollToIndex` to land one row
behind the sticky header. Keyboard navigation (arrow keys, PageDown, Enter) silently
places the focused row under the header — a quiet violation of the "Never Lost"
principle.

### 1.2 What the fixes deliver, concretely

**Phase 1 (shared constants) + Phase 4 (micro-optimisations)** together are the
highest-ROI work:

- **Stable `handleScroll` callback (C19):** moving `virtualizer` into a ref shrinks the
  `useCallback` dependency array to `[reportVisibleRange]`, which is itself stable. The
  `useEffect` that registers the scroll listener stops re-registering on every render.
  This eliminates the single most frequent teardown/reattach in the hot path.

- **Memoised column index array (C20):** `useMemo(() => Array.from({length: columns},
  (_, i) => i), [columns])` creates the array once per column-count change (panel
  toggle, window resize) rather than once per rendered row per render.

- **Canvas font caching (C21):** adding a `lastFontRef` check reduces 600 font-parses
  to 2 per fit invocation. Font-string parsing in Canvas involves font-shorthand
  tokenisation and a system-font lookup — not free at 600 calls.

- **Scrubber ref-passing (Phase 3 / C6):** replacing the `querySelector` DOM walk with
  an O(1) ref dereference in the scroll-mode listener removes the most frequent
  avoidable DOM query in the app.

### 1.3 Performance gaps the documents do not address

The plan's Appendix C estimates scroll handler time: 0.8 ms → 0.5 ms; grid render:
2.1 ms → 1.8 ms. These are accurate but modest. Three additional opportunities exist
that neither document covers:

**1. `key={imageIdx}` in `ImageGrid`'s render loop** (`ImageGrid.tsx:634`).
Virtual grid rows key `GridCell` by flat image index. When the buffer prepends items
(`bufferOffset` changes), all existing `imageIdx` values shift by `lastPrependCount`.
React unmounts and remounts *every* visible `GridCell` on a backward extend, even
though the images visible on screen are the same. Using `image.id` as the key would
allow React to reconcile existing cells rather than remounting them, and removes the
race between cell remount and the `useLayoutEffect` scroll compensation.

**2. `visibleImages` key string uses `ids.join(",")` (O(N) per render)** (`ImageTable.tsx:520`).
At 60 visible rows × 60 fps = 3,600 string concatenations per second during fast
scroll. A sentinel comparison (first ID + last ID + length) would reduce this to O(1).

**3. `contain: strict` prevents future variable-height rows (C18 in the plan).**
The plan flags this but does not give a concrete migration path. `contain: strict`
includes *size containment*, which means the scroll container's size is determined by
its flex parent, not its content. This is correct and meaningfully improves Firefox
scroll performance today. But if expandable metadata rows are ever introduced (a
feature the philosophy contemplates via the metadata panel staying open during
density switches), `contain: strict` will silently clip the overflow. The fix is
`contain: layout paint` — retaining paint and layout isolation without size
containment. This should be validated against a Firefox scroll performance profile
before being changed, because size containment is specifically what eliminates Gecko's
whole-page relayout on virtualizer item repositioning.

---

## Part 2 — How the Coupling Fixes Reduce Brittleness and Improve Extensibility

### 2.1 The "silent drift" pattern and the philosophy's Non-Negotiables

The philosophy lists non-negotiable features: keyboard navigation, density-switch
position preservation ("Never Lost"), selection/focus persistence. Every one of these
features has a direct runtime dependency on `ROW_HEIGHT`, `HEADER_HEIGHT`, or both.
C1 and C2/C3 are not cosmetic: if `HEADER_HEIGHT` drifts from the actual CSS-rendered
header, `pageDown` jumps by a wrong number of rows, `scrollToIndex` puts focused rows
behind the header, and the density-focus bridge restores scroll to a wrong position.
These are violations of the philosophy's most explicit commitments, not visual glitches.

The shared-constants module (Phase 1) converts a 6-file manual synchronisation problem
into a 1-import problem — the difference between a change that requires a developer to
know about 6 files and one that requires knowing about 1.

### 2.2 Adding a third density: the filmstrip

The philosophy devotes its entire "Kahuna Filmstrip" section to explaining why three
previous filmstrip attempts failed. The lesson: shared state works, geometry-coupled
state explodes. Kupua solves shared state correctly (Zustand `results[]`,
`density-focus.ts` viewport-ratio bridge). But adding the filmstrip density would today
require:

- A third `ROW_HEIGHT` variant (e.g. 80 px thumbnail height)
- A third `estimateSize` virtualizer
- A third scroll-compensation `useLayoutEffect`
- A third `useListNavigation` call
- Three or more additional E2E literal instances if Phase 1 is not done first

After Phase 1, adding the filmstrip means adding `FILMSTRIP_ROW_HEIGHT` to `layout.ts`
and importing it in one new component. Before Phase 1, it means another round of
6-file manual copies. Phase 1 directly enables the filmstrip.

### 2.3 The Scrubber's DOM archaeology and density switching

`findScrollContainer()` in `Scrubber.tsx` walks `previousElementSibling` to find the
scroll container. In `PanelLayout.tsx`, the DOM structure is:

```
<div class="flex-1 min-w-0 flex relative">        ← Scrubber's parentElement
  <div class="flex-1 min-w-0 flex flex-col ...">
    {children}   ← ImageTable or ImageGrid (the actual scroll container is inside here)
  </div>
  {scrubber}     ← Scrubber renders here
</div>
```

The chain has three single points of failure: the sibling relationship, the wrapper
div count, and the `[role='region']` ARIA string. Any of these breaks if:

- `PanelLayout` gains an additional slot inside the content column (e.g. a filmstrip
  row at the bottom)
- A future density adds a second `[role='region']` within the content column, causing
  the query to return the wrong element
- The density component's scroll container changes its ARIA role

The plan's Phase 3 (pass `scrollContainerRef` as a prop from the search route to both
the density component and the Scrubber) directly solves this and is the prerequisite
for any future multi-scroll-container density (side-by-side comparison view,
split-pane).

### 2.4 E2E tests as the canary

The 15 raw pixel literals in 3 E2E files (C13) are a practical threat to engineering
velocity. The philosophy describes a system that is supposed to evolve rapidly — new
densities, faceted filters, a filmstrip slider. Every geometry change will touch these
files. E2E tests that silently assert on stale pixel values are tests that pass when
they should fail, and fail when they should pass. Phase 1's E2E constant fix
(`page.evaluate(({ ROW_HEIGHT }) => ..., { ROW_HEIGHT })`) is not glamorous, but it
is the difference between a test suite that is a safety net and one that is a
*false* safety net.

### 2.5 Panel constraints and the density continuum's eventual slider

The philosophy is explicit that density should eventually be a slider, not discrete
stops. `MAX_PANEL_WIDTH_RATIO = 0.5` in `panel-store.ts` is a static fraction. On
small screens, a 50%-wide panel would leave the content area too narrow for a
280px-minimum grid cell. Viewport-aware panel constraints (Phase 6) are the
prerequisite for the density slider on any screen narrower than ~600 px.

---

## Part 3 — Architectural Evaluation: Was This the Right Choice?

This section takes the constraint stated in the philosophy (*it must work in the
browser*) as given and asks whether the React + TanStack Virtual + Zustand architecture
was the best available model for kupua's specific, unusual UX requirements.

### 3.1 What the architecture does exceptionally well

**The windowed buffer with generation-counter signals** (`_prependGeneration`,
`_forwardEvictGeneration`, `_seekGeneration`) is an elegant design. Monotonic counters
in Zustand let the `useLayoutEffect` guards in `ImageTable` and `ImageGrid` detect
new events reliably without stale-closure problems. This is substantially better than
the AngularJS factory + `$state.go` approach that killed all three Kahuna filmstrip
attempts.

**The `useDataWindow` abstraction** is the correct mediator between the store and the
view. `ImageTable`, `ImageGrid`, and `ImageDetail` share a single data contract.
Adding a fourth density (filmstrip) requires implementing that contract in one new
component, not touching the store.

**CSS-variable column widths** (`buildColumnSizeVars` + `<style>` injection) is a
well-known pattern for zero-JS-re-render column resizing. The memoised `TableBody`
reads widths via `var(--col-<id>)`, so a resize drag touches only the `<style>` tag.

**The overlay pattern for image detail** (search page stays mounted at `opacity-0`,
image detail overlays it) perfectly solves the problem that destroyed all three Kahuna
filmstrip attempts. The virtualizer's scroll position, the Zustand buffer, and the
focused image ID all persist across the overlay. Browser back removes `?image=` and
the view is pixel-perfect where you left it.

### 3.2 Where the architecture creates unnecessary friction

#### 3.2.1 TanStack Virtual's `estimateSize` is the origin of the entire coupling audit

The virtualizer needs a size estimate at construction time. This is inherent — the
virtualizer cannot know item sizes before they render. The coupling is *aggravated*,
however, by the codebase reusing the same constant for scroll-compensation math
(`el.scrollTop += lastPrependCount * ROW_HEIGHT`), which is not necessary — the plan
correctly identifies the `getTotalSize()` delta approach as geometry-agnostic.

Had the codebase adopted TanStack Virtual's `measureElement` API from the start (the
"measured virtualizer" pattern, where actual DOM sizes are recorded at item mount
time), `ROW_HEIGHT` would be an initial estimate only, and all scroll-compensation
math would naturally use `getTotalSize()` deltas. This is a small architectural
regret — not a crisis, but relevant when variable-height rows become necessary for
expanded metadata rows.

#### 3.2.2 The density switch mounts and unmounts components

When `density` changes, `search.tsx` renders `{isGrid ? <ImageGrid /> : <ImageTable />}`.
React unmounts one and mounts the other. The `density-focus.ts` module-level bridge
heroically papers over this — the unmounting component saves its viewport ratio, the
mounting component reads it and scrolls synchronously in `useLayoutEffect`. This
works and correctly satisfies the "Never Lost" principle.

An alternative would be to keep both density components mounted and use
`visibility: hidden` (not `display: none`, which resets `scrollTop`) to hide the
inactive one. This would eliminate the unmount/mount cycle and the `density-focus.ts`
bridge entirely. The reason not to do this: two virtualised lists simultaneously
maintaining their internal state, event listeners, and ResizeObserver callbacks would
have a non-trivial idle cost. For a planned slider density control, this approach
would not scale. The current unmount/remount + focus-ratio bridge is the correct
trade-off for the near term.

#### 3.2.3 The Scrubber is architecturally misplaced

The Scrubber is rendered as a `ReactNode` prop passed into `PanelLayout`, making it a
sibling to the content column with no direct access to the scroll container. It then
locates the scroll container by DOM archaeology. This is a structural consequence of
placing a density-agnostic component (the Scrubber) outside the density components
that own the scroll containers.

The plan's Phase 3 fix (pass `scrollContainerRef` from the search route) is correct
and sufficient. The alternative — embedding the Scrubber inside each density component
— would either duplicate it or require hoisting back up. The current placement is
architecturally reasonable; it just needs the ref-passing fix already described.

#### 3.2.4 The "Never Lost" adjacency algorithm is not implemented

This is the most significant gap between the philosophy and the code. The philosophy
describes a specific algorithm for when the focused image leaves the result set after
a query change: scan neighbours (±5 items from the old result set), find the first
that survives in the new results, focus that one. The code does not implement this —
a new search resets focus to the first result, which is the "naïve" approach the
philosophy explicitly rejects. This is an architectural omission, not a coupling
problem, but it is the philosophy's most concrete behavioural commitment.

#### 3.2.5 Selection is not implemented

The philosophy's "Selection is Not Focus" section describes multi-select with batch
metadata editing as a non-negotiable feature at parity with Kahuna. The store
(`search-store.ts`) has no `selectedImageIds` field. The philosophy is clear that
selection must be orthogonal to focus, survive density switches, and silently drop
deselected images when the result set changes. This is a significant missing feature,
not a coupling problem — but it is directly blocked by the same architectural patterns
(shared Zustand store, density-agnostic data layer) that the coupling work reinforces.
Once the store correctly tracks selection, the density components can each consume it
from `useDataWindow` without duplication.

#### 3.2.6 The `density-focus.ts` module-level variable is a latent correctness risk

```typescript
// density-focus.ts
let saved: DensityFocusState | null = null;

export function saveFocusRatio(ratio: number, localIndex: number): void {
  saved = { ratio, localIndex };
}
export function consumeFocusRatio(): DensityFocusState | null {
  const s = saved;
  saved = null;
  return s;
}
```

This works today because density switches are single-threaded: `ImageGrid` unmounts
(saves ratio), then `ImageTable` mounts (reads ratio). But if React's concurrent
rendering is ever enabled — which React 18's automatic batching already partially
activates — concurrent rendering could invoke the mount effect of the new density
before the unmount cleanup of the old one, or vice versa. The module-level variable
would be consumed by the wrong component or consumed before it was written.

The fix is to move `saved` into a `useRef` on the stable `SearchPage` parent
component, pass it as a ref to both density components, and have them read/write the
ref rather than the module-level variable. This is a small change with a meaningful
correctness guarantee for the future.

### 3.3 Was a different architecture possible?

The constraint is "must work in the browser." Within that, three alternatives warrant
examination:

#### Alternative A: Canvas-rendered list

For the table density in particular, a `<canvas>` renderer (like VSCode's Explorer or
Figma's layers panel) would sidestep the entire CSS↔JS coupling problem. There are
no Tailwind classes whose pixel values need to be mirrored in JS — the canvas draws
at whatever coordinates it wants. Canvas-rendered lists achieve 60 fps at 100k+ items
without virtualisation.

**The cost:** accessibility. A canvas-rendered table is not a `role="grid"` with
`aria-rowindex`. Screen readers cannot traverse it. Given the philosophy's explicit
keyboard-navigation requirements (↑↓ Enter Escape Home End PageUp PageDown), a
parallel invisible ARIA DOM would be required, which is complex and fragile.

**Verdict: not the right choice for kupua.** The accessibility cost outweighs the
performance gain, especially since the virtual DOM approach already achieves adequate
performance with the fixes the plan describes.

#### Alternative B: Web Component rendering layer for the list

The CQL input is already a Web Component (`<cql-input>`). The same model could be
applied to the result list — a custom element backed by an imperative renderer, with
React managing only the outer shell (search bar, panels, scrubber). This would decouple
the render path from React's reconciler.

**The cost:** the very thing React is useful for here — declarative state-driven
rendering — would be traded away for the most stateful part of the UI. The windowed
buffer, focus, selection, density switching, and keyboard navigation all benefit from
React's reconciliation model. Splitting this into an imperative Web Component would
recreate the AngularJS architecture kupua was specifically designed to escape.

**Verdict: not the right choice.** React is better suited to the stateful complexity
of the list interactions.

#### Alternative C: Signals-based fine-grained reactivity (the most credible alternative)

The coupling problems in the audit are largely a symptom of React's batch-render model
conflicting with scroll-path requirements. The `handleScroll` callback churn (C19)
exists because `virtualizer` is a new object every render — a React reconciliation
artifact. In a signals-based system (Solid.js, Preact Signals), computed values are
tracked at the expression level. A scroll handler reading `virtualizer.range` would
not need `useCallback` at all — it would read the signal directly, notifying only the
consumers that actually depend on it.

The codebase already moves in this direction manually:

- `useDataWindow`'s visible-range tracking uses `useSyncExternalStore` with module-level
  state (`_visibleStart`, `_visibleEnd`) to avoid React re-renders on scroll — this
  is manual signal-like behaviour.
- The Scrubber's `thumbEl.style.top = ...` bypasses React entirely for scroll-linked
  animation — again, signal-like.
- `configRef` in `useListNavigation` stores the entire config in a ref to prevent
  hook re-registration — a manual approximation of signal read-without-subscribe.

Had the project started with Preact Signals (React-compatible via
`@preact/signals-react`) or SolidJS for the list components, the C19/C20 allocations
and the `useCallback`/`useRef` approximations would be structurally prevented rather
than manually worked around. The `Array.from({length: columns})` allocation (C20) would
also be solved — Solid's fine-grained reactivity would not re-run the row render
function unless `columns` changed; it would update individual cell bindings directly.

**Verdict: this is the most credible architectural alternative.** Not a recommendation
to rewrite — the codebase is well past the point where a rewrite is justified. But for
*future* density components (the filmstrip, the slider-density control), using Preact
Signals for scroll-path components while keeping the outer React shell would be a
legitimate and measurable improvement over the current pattern. The codebase's own
manual approximations (`useSyncExternalStore`, DOM-direct Scrubber updates, config
refs) demonstrate that the team already understands what signals would give them for
free.

---

## Part 4 — Prioritised Recommendations

The following table merges the plan's phases with the additional findings from this
report, ordered by impact:

| Priority | Action | Impact | Effort | Why now |
|---|---|---|---|---|
| **1** | Phase 1: Shared `layout.ts` constants + E2E arg-passing (C2, C3, C4, C13) | Brittleness, test correctness | 2 h | Zero risk; unblocks everything else |
| **2** | Phase 4: Stable `handleScroll` (C19) + memoised column array (C20) + Canvas font cache (C21) | Performance | 2 h | Highest perf ROI; independent of other phases |
| **3** | Fix `key={imageIdx}` → `key={image?.id ?? imageIdx}` in `ImageGrid` render loop | Performance / correctness | 30 min | Eliminates full cell remount on every backward extend |
| **4** | Phase 3: Scrubber receives `scrollContainerRef` prop; remove `findScrollContainer` (C6, C7, C22) | Brittleness, extensibility | 2 h | Prerequisite for any future multi-scroll-container density |
| **5** | Move `density-focus.ts` module-level `saved` into a stable parent `useRef` | Correctness (React concurrent mode) | 1 h | Low risk now; high risk when concurrent rendering activates |
| **6** | Phase 2: `useHeaderHeight` ResizeObserver replacing `HEADER_HEIGHT = 45` (C1) | Correctness (keyboard nav) | 1.5 h | Fixes silent keyboard navigation bug under sticky header |
| **7** | Replace `ids.join(",")` key with O(1) sentinel in `visibleImages` memo | Performance | 15 min | Free win; trivial change |
| **8** | Implement "Never Lost" adjacency algorithm in `search()` | UX fidelity to philosophy | 3–4 h | Most concrete unfulfilled philosophical commitment |
| **9** | Add `selectedImageIds: Set<string>` to search store + density-switch survival | Missing feature | 4–6 h | Non-negotiable per philosophy; blocks batch metadata editing |
| **10** | Phase 5: Font strings from CSS custom properties (C5) | Brittleness | 1 h | Nice-to-have; no functional impact today |
| **11** | Phase 6: Viewport-aware panel constraints (C10) | Extensibility (mobile / slider) | 1.5 h + design | Prerequisite for density slider on small screens |
| **12** | Relax `contain: strict` → `contain: layout paint` in `.hide-scrollbar` (C18) | Extensibility (variable-height rows) | 30 min | Prerequisite for expandable metadata rows — validate Firefox perf first |
| **13** | Spike: Preact Signals for scroll-path components (ImageTable, ImageGrid) | Performance (architectural) | 1–2 day spike | Best deferred until the filmstrip density is being built |

**Estimated total for items 1–7:** ~9 hours of implementation, zero design decisions
needed, zero risk of UX regression. Items 8–9 are the features the philosophy marks
as non-negotiable. Items 10–13 are refinements and future-proofing.

---

## Conclusion

Both coupling documents are well-written, accurate, and practically actionable. The
original audit correctly identifies 13 coupling categories, rates their severity
honestly, and proposes the right high-level fixes. The expanded plan adds real value
by catching five additional issues (C17–C22) and, critically, by preventing the
audit's most naive proposed fix (`getComputedStyle()` from a rendered cell) from
becoming a layout-thrash regression. The recommended execution order in the plan
(Phase 1 → Phase 4 → Phase 3 → Phase 2 → Phase 5 → Phase 6) is sound.

The gaps are: the documents treat performance and correctness in isolation from the UX
goals in `frontend-philosophy.md`; they do not address the "Never Lost" adjacency
algorithm or the missing selection feature; and they do not examine whether the
architecture's scroll-path reliance on `useCallback` + `useRef` approximations could
be structurally improved via fine-grained reactivity.

The chosen architecture — React SPA, TanStack Virtual, Zustand, URL-as-source-of-truth,
overlay-not-navigate for image detail — is the right model for kupua's requirements.
Its weaknesses are execution-level (duplicated constants, unstable callbacks, DOM
archaeology) rather than structural, and the two documents correctly address those
weaknesses. The one structural improvement worth acting on now is moving the
`density-focus.ts` module-level variable into a parent-component ref before React
concurrent mode creates non-deterministic unmount/mount ordering.

