# Perceived-Performance Audit

> Companion to [scroll-audit.md](scroll-audit.md). Different mode of
> thinking. The scroll audit is **diagnostic and read-only**: find
> drift, dead code, footguns. This doc is **prescriptive but
> measurement-first**: identify where the app *feels* slow, instrument
> what's currently invisible, then propose hiding/speeding work — in
> that order.
>
> **Scope:** scroll system + search system. Image traversal explicitly
> excluded (recently audited separately). Filters, sort, panels,
> fullscreen are in scope where they trigger ES round-trips.
>
> **Status:** Phase 1 complete. Instrumentation built
> (`src/lib/perceived-trace.ts`), test suite live
> (`e2e-perf/perceived-{short,long}.spec.ts`, 14 short + 2 long
> scenarios producing 14 + 8 sub-scenarios), harness wired
> (`run-audit.mjs --perceived[-only]`,
> `--short-perceived-only`, `--long-perceived-only`), dashboard
> shipped (`perceived-graphs.html`). Statistical baseline against
> TEST cluster captured 24-Apr-2026 across 3 runs (post-refactor +
> post 4-fix pass: `expectedAction` parameter in `computeMetrics`,
> `open-detail` trace site for image-dblclick journeys, JA3 switched
> to `colourModel:RGB` for corpus stability, perceived-graphs
> legend documents by-design "—" gaps). Ready for Phase 2.

## Why this matters now

Kupua is a prototype, built over a month of conversations between a
non-engineer product owner and a sequence of Claude agents. It uses a
lot of clever features (focus preservation, sort-around-focus,
position-map seeking, bidirectional buffer, two-tier scroll). Those
features take time. The app needs to feel **fast and immediate** for
two reasons:

1. **Demo credibility.** Real engineers will judge the prototype on
   feel before they read the code. A snappy prototype influences
   real follow-up work (media-api integration plan, mapping changes);
   a sluggish one gets dismissed regardless of cleverness.
2. **Personal preference.** The owner just wants it fast.

**Working pain reference:** scripted sort (`width × height`) took ~14 s
on click and was removed entirely. That's the upper bar — nothing
should feel like that. The lower bar is also calibrated: clicking the
Home logo can take ~200 ms, and that **is** felt. So the perceived
threshold to defend is somewhere under 200 ms for an action the user
expects to be instant.

## Mandate

The user's brief:

> *"We are looking at the app that FEELS fast/immediate. While some
> operations just take time network/es, maybe there are opportunities
> to obfuscate them? Apart from, obviously, opportunities to really
> speed them up!"*

This decomposes into three orthogonal axes that perf work routinely
conflates:

1. **Real latency** — wall-clock from user input to final correct
   pixel. Bounded below by network + ES + JS.
2. **Perceived latency** — what the user *thinks* happened. Driven
   by: instant feedback (≤100 ms acknowledgement), continuity (no
   flicker, no layout shift, no spinner-pop-flash), motion
   (animation that fills the unavoidable wait), expectation matching
   (skeleton in the *right shape*).
3. **Attribution** — the user understanding *why* something is slow.
   A 2 s wait with a clear "Loading…" co-located with the trigger
   feels OK. The same 2 s wait with no feedback feels broken.

The existing perf suite (`e2e-perf/`) measures axis 1 only, and only
for the client-side share of it (frame timing, DOM churn, LoAF). It
does **not** measure axis 2 or axis 3 at all. That gap is the focus
of this doc's Phase 1.

## What the existing perf suite measures (and doesn't)

[e2e-perf/perf.spec.ts](../../e2e-perf/perf.spec.ts) /
[run-audit.mjs](../../e2e-perf/run-audit.mjs) inventory:

| Axis | Measured? | By what |
|---|---|---|
| Frame jank during a scripted action | ✅ | `maxFrame`, `severe`, `p95Frame`, `severeRate` |
| Layout stability during action | ✅ | `cls`, `clsMax` |
| DOM mutation cost | ✅ | `domChurn` |
| Long-task / blocked rendering | ✅ | `loafBlocking` |
| Focus position drift across transitions | ✅ | `focusDriftPx`, `focusDriftRatio` (P4a/b, P6, P12) |
| **Time from user action to first visible response** | ❌ | not instrumented |
| **Time from user action to final settled state** | ❌ | not instrumented |
| **Duration of "Loading…" / "Seeking…" / "Finding image…" banners** | ❌ | not instrumented |
| **Time the user spends staring at empty cells / placeholders** | ❌ | not instrumented |
| **ES round-trip distribution per action type** | ❌ | not instrumented (smoke tests have it, but not pinned/regression-tracked) |
| **Whether actions feel "instant" (<100 ms ack)** | ❌ | not instrumented |

**Reading the gap charitably:** the suite was built to catch
*regressions in browser smoothness*. It does that well — the audit log
shows P8 (table fast scroll, the known worst case) tracked over many
months. It was never meant to measure perceived performance, and
shouldn't be retrofitted to do so.

**Decision: extend `e2e-perf` rather than create a parallel suite.**
The owner runs `e2e-perf` occasionally already; a parallel suite would
rarely be run. New perceived-perf scenarios live alongside `perf.spec.ts`
(e.g. `perceived.spec.ts`) and feed a *separate* results file
(`results/perceived-log.json`) so the dashboards stay readable. One
command runs both.

## Operations in scope

Per the brief: "every time the app displays Seeking… or Finding
image… or any operation >500 ms." Two categories:

### A. Operations with explicit user-visible status text

| Trigger | Status text | Source |
|---|---|---|
| Sort change with focused image (sort-around-focus) | `"Finding image…"` | [search-store.ts:1181](../../src/stores/search-store.ts#L1181) → `StatusBar` |
| Sort change with focused image, post-find buffer load | `"Seeking…"` | [search-store.ts:1383](../../src/stores/search-store.ts#L1383) → `StatusBar` |
| Search load (any search()) | spinner via `loading: true` flag | [routes/search.tsx:61](../../src/routes/search.tsx#L61) |
| Aggregation fetch | spinner per facet | aggLoading |
| Position-map background load | (silent; degrades to slower seek path) | `positionMapLoading` — read by some UI but no banner |

The `sortAroundFocusStatus` is the most visible one — it's a banner
the user reads. **Empirically: typically 500 ms – 5 s on TEST cluster
depending on map state, hit/miss, and buffer load size.** Not measured
in regression suite.

### B. Silent operations >500 ms (suspected, not measured)

These are the candidates Phase 1 needs to actually time:

| Trigger | Likely cost | What user sees today |
|---|---|---|
| Initial search (cold) | 500 ms – 3 s | full-viewport spinner + skeleton |
| Re-search after CQL/filter change | 200 ms – 2 s | spinner over results |
| Sort field change (non-focused) | 200 ms – 1.5 s | spinner |
| Sort direction toggle (focused) | 500 ms – 5 s | "Finding image…" → "Seeking…" → result |
| Scrubber seek in seek-mode (>65k) | 200 ms – 1.5 s | brief blank cells then content fills |
| Density swap with deep buffer | 100 ms – 800 ms | reflow + abortExtends-2s-cooldown freeze |
| Position-map background fetch | 1 s – 5 s | silent; affects scrubber tooltip accuracy if user drags before it loads |
| Aggregation fetch (CQL change) | 200 ms – 2 s | facet skeletons |
| First scrubber drag in keyword sort (sortDist composite agg) | 500 ms – 3 s | tooltip label falls back to buffer-extrapolation |
| Scroll past buffer end (extend-forward in seek mode) | 100 ms – 800 ms | placeholder cells until extend lands |

These are guesses based on reading the code paths and the cooldown
constants. **None of them are currently measured against the real
TEST cluster on a recurring basis.**

## Phase 1: measurement-gathering exercise (the proposal) ✅

The argument for doing this *before* writing an opportunities list:
without numbers, the opportunities list is "things I imagine could
help." The scroll audit's discipline — "Don't do unless evidence
appears" — applies here too. Spending one session on instrumentation
buys evidence-based prioritisation for everything that follows.

### What to instrument ✅

**A new lightweight tracing API in the store, distinct from the
existing perf instrumentation.** Conceptually:

```
trace.begin("sort-around-focus", { sort, focusedId })
  → records: t_user_action, t_first_visible_change,
             t_status_visible, t_status_cleared,
             t_first_new_pixel, t_settled, t_total
```

For each user action, the suite captures:

| Phase | Definition | Why it matters |
|---|---|---|
| **t_ack** | input → first DOM change attributable to this action (any: spinner, status text, optimistic preview) | <100 ms = feels instant. >100 ms = feels laggy. |
| **t_status_visible** | input → "Finding image…" or "Seeking…" or "Loading…" first paints | If t_status_visible > t_settled, the status was unnecessary |
| **t_first_useful_pixel** | input → first piece of *real* (non-skeleton, non-stale) content paints | This is "perceived done" for fast cases |
| **t_settled** | input → no further DOM changes for 200 ms AND status banners cleared | This is "actually done" |
| **t_total_status_visible** | sum of time any "Loading"-class banner was on screen | Direct measure of "how long did the user stare at a wait indicator" |

These are all derivable from existing instrumentation primitives
(MutationObserver for paint events, Zustand subscribe for state
flips, store-side `performance.mark()` for action boundaries).

### Action set to cover ✅

In priority order (slowest-felt first, per owner's experience):

1. **Search submit** (CQL Enter, filter toggle). Distinguish cold
   (first ever) / warm (URL change in same session) / cached. The
   "clever effects" (position preservation, focus preservation,
   phantom focus) live here.
2. **Sort change** with focused image — the "Finding image…" → "Seeking…"
   path. Suspected worst case after scripted-sort removal.
3. **Sort direction toggle** with focused image. Same path, different
   trigger.
4. **Sort change** without focused image.
5. **Home logo click** — owner's named ~200 ms felt-pain. Measure
   what's between click and `bufferOffset=0 + scrollTop=0` settle.
   This one might not even hit ES; if it doesn't, it's pure client work.
6. **Scrubber seek** — three modes (buffer / indexed / seek). Click
   and drag-release.
7. **Density swap** at three buffer depths (top / mid / deep). Owner
   reports this is fine — measure to confirm and to set a baseline.
8. **Filter checkbox toggle** in the filter panel.
9. **CQL chip add/remove**.
10. **Position-map fetch completion** (silent, but affects subsequent
    seek behaviour — measure as a background operation).

### Trigger boundaries (`t_0` definitions) ✅

**Critical.** All numbers are wrong if `t_0` is wrong. For each action,
the `trace(action, "t_0", ...)` call MUST happen at the exact site
below — not at a more convenient nearby site, not at the next layer
up, not after the React re-render.

| Action | `t_0` site | Notes |
|---|---|---|
| Search submit (CQL Enter) | `onSubmit` handler in `SearchBar.tsx`, *before* `cancelSearchDebounce` / `navigate()` | Captures the user-perceived click moment, not the URL change |
| Search submit (filter toggle) | `onChange` handler in the filter checkbox component, *before* `useUpdateSearchParams` is called | Same principle |
| Sort change with focused image | Sort dropdown `onChange`, *before* `navigate({sort:...})` | The async work starts later in `_findAndFocusImage` — don't move `t_0` there |
| Sort direction toggle (focused) | Sort-direction button `onClick`, *before* `navigate(...)` | Same |
| Sort change (no focus) | Same as above. The `_findAndFocusImage` branch isn't taken; that's a property of the action, not of `t_0`. |
| Home logo click | Logo `onClick` handler in the top-bar component, *before* `resetToHome()` is called | Probably the cheapest way to localise the named ~200 ms grievance |
| Scrubber seek (click) | `Scrubber.tsx` track `onPointerDown`, *before* `onSeek(pos)` or `scrollContentTo(...)` | Mode discrimination happens after `t_0`; capture mode in payload |
| Scrubber seek (drag-release) | `Scrubber.tsx` thumb `onPointerUp`, *before* the final `onSeek(latestPosition)` | Drag-internal events do NOT trigger a new `t_0`; only release |
| Density swap | The `onClick` of the density toggle button, *before* the route param change | Unmount/mount is downstream |
| Filter checkbox toggle | Same as "search submit (filter toggle)" — they're the same code path | One scenario is enough; collapse if implementation makes them identical |
| CQL chip add/remove | The chip’s `onRemove` / chip-add commit handler, *before* the resulting `navigate()` | |
| Position-map fetch completion | `t_0` = `search()` PIT-open completion (start of `_loadPositionMap` background work); `t_settled` = `set({positionMap: ...})` lands. Background-only — no "settle from user view" sense. |

**Phase boundary rules** (apply to every action):

- **`t_ack`** — first call to any `set()` in the store that produces a
  visible DOM change attributable to the action (`loading: true`,
  status banner set, `_phantomFocusImageId` set, etc.). The
  instrumentation hooks the store's `set()` boundary, not React paint.
- **`t_status_visible`** — the specific `set()` that produces the
  status banner text (`sortAroundFocusStatus: "Finding image…"`,
  `loading: true` driving the search spinner). Skip emission if no
  status banner ever shows for this action.
- **`t_first_useful_pixel`** — first `set({results: […]})` that
  replaces stale buffer content with results matching the new query.
  For `seek()`, the first `set()` after `searchAfter` returns. The
  agent should NOT use MutationObserver to detect this — too noisy.
  Use store-side hooks.
- **`t_settled`** — emitted when ALL of: `loading === false`,
  `sortAroundFocusStatus === null`, `aggLoading === false`, AND no
  in-flight extend/seek (check `_extendForwardInFlight`,
  `_extendBackwardInFlight`, `_seekCooldownUntil < now`). A small
  `requestAnimationFrame` settle ensures the paint completed before
  emission.
- **`t_total_status_visible`** — derived in the harness, not emitted
  by the trace API. Sum of `(t_status_cleared - t_status_visible)`
  pairs. The harness pairs them by action.

### How to deliver the data ✅

- Tests live alongside `e2e-perf/perf.spec.ts` (new file
  `e2e-perf/perceived.spec.ts`) and reuse the same harness.
- Run against TEST cluster (real ES latency). Owner grants smoke
  permission per session, as today.
- 3 runs per action (deliberate — matches jank suite cadence; 5+
  considered too costly against shared TEST cluster). Report median.
- Output: same shape as `audit-log.json` but written to
  `results/perceived-log.json`. Existing jank dashboard untouched.
- New dashboard view (`perceived-graphs.html` or a tab in the existing
  page): plots `t_ack` / `t_first_useful_pixel` / `t_settled` /
  `t_total_status_visible` per action, sparkline-per-entry like the
  current dashboard.
- One command runs both suites:
  `node e2e-perf/run-audit.mjs --label "…" --include perceived` (or
  similar). Decided in implementation.

### Instrumentation: in-app, dev-only, removable ✅

**Canonical implementation spec lives in [e2e-perf/README.md](../../e2e-perf/README.md)
→ "Perceived-Performance Suite".** It's the contract for both the
building agent and future readers. Summary here:

- In-app marks via `performance.mark()` + a window-exposed ring buffer
  in `src/lib/perceived-trace.ts` (the single owning module).
- Gated on `import.meta.env.DEV || localStorage.kupua_perceived_perf` —
  zero runtime cost in production, off by default in dev (so console
  stays clean), always on in Playwright.
- Removable by deleting `src/lib/perceived-trace.ts` and reverting the
  ~10 store/hook call sites it adds.

### Repo memory: when to run the suite ✅

Add a note to `.github/copilot-instructions.md` (under the existing
test-running directive) suggesting that perceived-perf scenarios
should be re-run when an agent touches:

- `src/stores/search-store.ts` (search/seek/extend paths)
- `src/hooks/useDataWindow.ts`, `src/hooks/useScrollEffects.ts`
- `src/lib/orchestration/`, `src/lib/reset-to-home.ts`
- Anything in the sort-around-focus / position-map / phantom-focus
  paths.

Like the existing `e2e-perf` rule, this is a *suggest to user* rule,
not an autonomous run — perceived-perf needs real ES.

### Acceptance for Phase 1

Phase 1 is "done" when the perceived-perf log has at least one entry
for every action in the priority list above, with median across
≥3 runs against TEST. **No optimisation work happens until
this exists.** — ✅ achieved 24-Apr-2026.

## Phase 2 (after measurements): the opportunities framework

This is a sketch, not a backlog. It describes *categories* of move,
not specific changes. Specific changes wait for Phase 1 numbers.

### Latency-hiding opportunities (perceived)

These don't speed anything up — they make the wait feel shorter or
attributable. Useful when the floor is network-bound.

| Move | When it helps | Cost / risk |
|---|---|---|
| **Optimistic UI** — show the new state immediately, reconcile when ES responds | Filter/sort toggles where user knows what they asked for | Have to handle "wrong" optimistic prediction (e.g. sort change re-orders predictably for date but not for keyword) |
| **Skeleton in the right shape** — render placeholder cells *of the right size and count* during loading, so the layout doesn't reflow on settle | Search/sort transitions that change result count significantly | Requires knowing approximate count before query — not always possible |
| **Keep stale content visible** during re-fetch, dim it, replace atomically | Re-sort, filter narrow — when stale-but-visible is more useful than blank-and-loading | Requires the user to understand the dimmed state isn't current; needs visual cue |
| **Co-locate the loading indicator with the trigger** — spinner on the *button* the user clicked, not in the centre of the viewport | All button-triggered actions | Cheap; mostly UI work |
| **Hide latency under animation** — use the 200–400 ms a transition takes anyway to do the work | Density swap (the visual transition could absorb the abortExtends-cooldown freeze) | Risk of looking like the animation is what's slow |
| **Predictive prefetch on hover** — start the request when the user hovers the trigger, complete when they click | Filter checkboxes, sort dropdown options | Speculative work; can waste ES if user doesn't click. Use sparingly. |
| **Eager kickoff** — start ES request the instant the input is "probably committed" rather than waiting for Enter | CQL input — already debounced 300 ms, could start at 200 ms with cancel-on-edit | Requires reliable cancellation (we have it) |
| **Suppress short waits** — only show "Loading…" if the operation takes >300 ms | Status banners that flash on/off for sub-perceptual durations | Standard pattern; no risk if cooldown chosen correctly |
| **Progressive reveal** — paint first row of results as soon as it arrives, don't wait for the whole page | Initial search and re-search | Already partially done by virtualizer; could be pushed further |

### Real-latency opportunities (speeding up)

These actually reduce wall-clock time. Bounded by physics
(network + ES) at the bottom.

| Move | When it helps | Cost / risk |
|---|---|---|
| **Cache aggregations by (query, filter)** | Same query opened twice, or facet that updates frequently | Cache invalidation is hard; ES already has its own caches |
| **Cache sortDist by (query, sortField)** | Scrubber tooltip on revisited queries | Same story |
| **Parallelise independent fetches** — kick off position-map and first-page in the same tick instead of post-page | Initial search | Already partially done — verify in code |
| **Reduce round-trips** — combine searchAfter + countBefore in one request when both are needed | Sort-around-focus path | Requires custom ES-side aggregation; significant work |
| **Smaller PAGE_SIZE for initial fetch only** — show the first 50 fast, then backfill to 200 | Cold search | Two round-trips total cost more, but the *first useful pixel* lands earlier |
| **Skip position-map for sessions that don't need it** — only fetch when user actually drags scrubber or seeks | Initial search → user scrolls naturally | Requires predicting intent; trivial heuristic suffices ("did the user touch the scrubber in 5 s?") |
| **Bundle splitting** — the 896 kB single chunk noted in scroll audit Round 2 #D delays first paint on cold load | Initial page load only | Standard Vite tweak; modest win |

### Anti-patterns to avoid (push back if these come up)

- **Spinners that appear for <200 ms.** Worse than no spinner —
  reads as "broken-and-recovered." Suppress under a threshold.
- **Optimistic UI for operations that can fail silently.** If the
  user thinks the action committed and it didn't, that's worse than
  any wait.
- **Prefetch on hover for expensive operations.** Wastes ES under a
  hovering / skim-reading user. OK for cheap operations only.
- **"Loading…" banner on operations that genuinely complete in
  <100 ms.** The banner's flash *is* the latency the user perceives.
- **Faster scroll-to-target by skipping intermediate paints.** The
  scroll audit already cites this trap (FOCC research, reverted).
  Bidirectional seek is the existing answer.
- **Generalised performance budgets.** Per-action budgets only.
  Otherwise you optimise the easy ones and ignore the hard ones.

## Targets

Derived from the owner's calibration (Home logo at ~200 ms is felt;
scripted sort at ~14 s was unacceptable):

| Action class | Target (median) | Hard ceiling (p95) |
|---|---|---|
| Logo / home / reset / panel toggle | <100 ms ack, <200 ms settle | 300 ms settle |
| Density swap | <100 ms ack, <400 ms settle | 800 ms settle |
| Filter / sort toggle | <100 ms ack, <1 s settle | 2 s settle |
| Search (warm) | <100 ms ack, <1.5 s first useful pixel | 3 s |
| Search (cold) | <100 ms ack, <2.5 s first useful pixel | 4 s |
| Sort-around-focus | <100 ms ack, <2 s settle | 4 s; status banner ≤2 s |
| Scrubber seek | <100 ms ack on click, <1 s first useful pixel | 2 s |

These are starting targets, not a contract. Phase 1 measurements may
show some are optimistic and some are slack. Adjust with evidence.

## What this doc is NOT

- **Not a backlog.** Nothing here is queued for work. Phase 1
  decision required first.
- **Not a critique of the existing perf suite.** The existing suite
  measures what it set out to measure (browser smoothness). This is
  a different lens.
- **Not a place for architectural changes** that touch the
  three-tier scroll model, PIT lifecycle, or the search-store
  structure. The scroll audit covers those constraints.
- **Not image-traversal scoped.** Recently audited; out of scope.
