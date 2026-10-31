# Prefetch Cadence & Carousel Convergence — Multi-Session Workplan

> **Created:** 2026-04-22
> **Author / context source:** Conversation between Mateusz and a fresh
> Claude Opus 4.7 agent (no prior involvement in the swipe-carousel fix).
> **Status:** ✅ Sessions 1–4 + 6 complete. Session 5 skipped (risk/reward).
> Session 7 not attempted (optional). Perf audit clean — no regressions.
> Tier 0 revert included in the commit.
> **Companion docs:**
> - `zz Archive/swipe-carousel-review.md` — the review that triggered this work.
> - `zz Archive/touch-gestures-handoff.md` — the original swipe-carousel work.
> - `worklog-current.md` — duplicate-image investigation.
> **Goal:** Make image traversal fast and correct on slow networks and
> long bursts, on both mobile swipe and desktop arrow-keys, by making the
> prefetch pipeline cadence-aware and converging the three traversal flows
> (mobile carousel / desktop ImageDetail / desktop FullscreenPreview)
> around one shared traversal-session abstraction.

---

## 0. TL;DR for the next agent

Three symptoms drive this work, all confirmed on a slow mobile network on
Apr 22 2026:

1. **Duplicate-image during swipe** still occurs on long rapid bursts.
   Cause: prefetch is outpaced; data-thumb fallback writes a not-yet-cached
   thumbnail; side-panel `<img>` retains its previous compositor texture
   and the GPU paints stale pixels into the slide.
2. **"Stuck on thumbnail of wrong image" after burst.** After landing,
   the user stares at the thumbnail of *some other* nearby image for
   seconds. Cause: head-of-line blocking on the connection pool — N
   in-flight prefetches issued during the burst are queued ahead of the
   final image's full-res request. The final image is the *most* urgent
   thing but the *most recently* enqueued — it loses the race.
3. **Held-arrow-key on desktop** has the same root cause: same prefetch
   pipeline, same connection-pool starvation, less visible because there
   is no animation expecting alignment.

The right unit of work is **the traversal session** — one user holding
down arrows or chain-swiping on a phone — not the individual navigation.
This workplan introduces a small `TraversalSession` state machine inside
`image-prefetch.ts` (no new files except types & tests) that:

- Tracks cadence (interval between navigation calls).
- Cancels in-flight prefetches that left the radius.
- Uses `fetchPriority` hints to keep the visible image at the front of
  the queue.
- Skips middle radius during fast bursts; debounces a "post-burst" full
  prefetch ~300ms after the last navigation.
- Issues thumbnails *before* full-res within each batch (mobile only).

The same pipeline serves all three flows. As a side effect, the three
flows are converged: `FullscreenPreview` adopts `getCarouselImageUrl`,
the desktop ImageDetail strip is simplified further, and a small amount
of mobile-only machinery is finally physically scoped to mobile.

---

## A. Tier 0 — Already-uncommitted starting point (do not redo)

The conversation that produced this doc also produced one tiny revert,
already applied to the working tree (uncommitted):

- [`kupua/src/lib/image-prefetch.ts`](../../src/lib/image-prefetch.ts) — restored thumbnail prefetch radius to
  the full prefetch set (was restricted to `i±1` by the review-driven
  cleanup in `1b4f7b38d`; that restriction caused the duplicate-image
  regression on slow networks because today's `i+2` becomes tomorrow's
  `i+1` side panel after one navigation step, but its thumbnail had
  never been warmed).
- `swipe-carousel-review.md` — checkbox struck through with a
  "REVERTED" note for posterity.

The first session begins from this state. Whoever picks up the work
should `git status` to see this diff in their tree before touching
anything.

---

## 1. What exists today (essential reading)

### Three traversal flows

| Flow | Component | Trigger | Renders |
|---|---|---|---|
| **A. Mobile carousel** | `ImageDetail` | Touch swipe (`useSwipeCarousel`) | 3-panel strip with WAAPI slide; `StableImg` everywhere |
| **B. Desktop ImageDetail** | `ImageDetail` | `←`/`→`, NavStrip click | Same 3-panel strip, but **side panels gated on `_pointerCoarse`** so only the center renders. Carousel hook attached but no-op. |
| **C. Desktop FullscreenPreview** | `FullscreenPreview` | `f` key from grid/table | Single bare `<img>`, no `StableImg`, no carousel. URL built inline (NOT via `getCarouselImageUrl`!). |

Already shared between all three: `useImageTraversal` hook (the navigation
primitive — buffer extend / seek / pending nav resolution / initial
prefetch on mount) and `prefetchNearbyImages` (the prefetch entry point).

### Current prefetch behaviour ([`image-prefetch.ts`](../../src/lib/image-prefetch.ts))

- Throttle gate: skip if called <150ms since last call.
- Per call, builds index list `[i+1, i+2, i+3, i+4, i-1]` (forward) or
  reversed.
- For each idx, issues full-res `new Image(); img.src = url;` then on
  mobile additionally `img.decode()` to populate `_loadedFullRes` Set.
- Then on mobile additionally issues thumbnail `new Image(); img.src = thumb;`.
- **No `fetchPriority` hints anywhere in prefetch.**
- **No cancellation of in-flight prefetches.** The browser runs every
  `Image()` to completion regardless of whether the JS reference is
  dropped.
- **Thumbnails are issued AFTER full-res within each batch** — meaning
  the cheap, decode-fast safety-net resource sits behind a 1MB AVIF on
  the priority queue.
- Throttle is per-batch only — does not cancel anything in flight.

### Existing safety-net mechanisms (do not disturb during this work)

These are load-bearing and must keep working. The review doc describes
them in §1 of `swipe-carousel-review.md`; not repeating here. Just be
aware:

- `commitStripReset` (mobile only, `useSwipeCarousel.ts`).
- `StableImg` `data-committed` flag.
- COMMIT-time `data-thumb` fallback.
- Side-panel `removeAttribute("src")` after commit.

---

## 2. Architecture of the new prefetch pipeline

### 2.1 Concept: one traversal session per user-burst

A **session** opens on the first `prefetchNearbyImages` call after idle,
and closes ~`BURST_END_MS` after the last navigation. While a session is
open it tracks:

- `lastCallAt` — for cadence calculation.
- `cadenceMs` — exponentially-smoothed interval between calls.
- `direction` — last known.
- `inFlight` — `Map<string, HTMLImageElement>` of currently-loading
  prefetches keyed by image ID (not URL — one entry per image, with the
  most recent `Image` object for that image).
- `pendingDebounce` — a `setTimeout` handle for the post-burst full
  prefetch.

Sessions are **module-level singletons** (one mobile, one desktop —
actually one global since `isTouchDevice` is stable per page load).
There is exactly one session at any moment.

### 2.2 Lifecycle

```
prefetchNearbyImages(idx, results, dir, _) called
  ├── if no session OR session timed out → openSession()
  ├── update cadence, direction, lastCallAt
  ├── compute desired neighbour set (id → priority)
  │     - cadence < FAST_THRESHOLD: skip middle (only i±1 + far lookahead i±N)
  │     - cadence ≥ FAST_THRESHOLD: full radius
  ├── cancelLeftRadius(desired) — for each inFlight not in desired,
  │     img.src = "" then delete from inFlight
  ├── issueMissing(desired) — issue Image() for each desired not in
  │     inFlight or _loadedFullRes (thumbnails-first within each batch,
  │     fetchPriority set per tier)
  └── scheduleBurstEnd() — clear & set BURST_END_MS timeout that:
        ├── recomputes desired with cadence reset to "stable"
        ├── runs cancelLeftRadius + issueMissing for stable set
        └── closes the session
```

### 2.3 Tunable constants — live in `@/constants/tuning.ts`

The codebase already has a [`src/constants/tuning.ts`](../../src/constants/tuning.ts) file used by the
windowed-buffer / aggregation system (see imports in `search-store.ts`,
`useScrollEffects.ts`, etc.). New prefetch constants should be added
there, with the existing one-comment-block-per-constant style, under a
new `// ── Prefetch / traversal session ──` section header.

**None of these have been measured on real hardware. Starting values are
educated guesses; expect to tune after Session 3 lands.** A localStorage
override mechanism is recommended (Session 1 step) so tuning can be done
by a non-engineer in DevTools without rebuilds.

```ts
// In src/constants/tuning.ts

/** Cadence below which we consider the user mid-burst (ms between
 *  navigations). Below this: skip middle radius, prefetch only i±1 +
 *  far lookahead. Above: full radius. */
export const PREFETCH_FAST_CADENCE_MS = 350;

/** No navigation for this long → burst is over; fire the
 *  full-radius post-burst prefetch around the resting position. */
export const PREFETCH_BURST_END_MS = 280;

/** No navigation for this long → close the session entirely; next
 *  prefetch call opens a fresh one with reset cadence. */
export const PREFETCH_SESSION_TIMEOUT_MS = 2000;

/** During fast burst, also prefetch i±FAR_LOOKAHEAD as a guess at
 *  where the user might stop. */
export const PREFETCH_FAR_LOOKAHEAD = 6;

/** Stable cadence: prefetch i+1..i+FULL_RADIUS_AHEAD in the
 *  movement direction. */
export const PREFETCH_FULL_RADIUS_AHEAD = 4;

/** Stable cadence: prefetch i-1..i-FULL_RADIUS_BEHIND opposite
 *  the movement direction. */
export const PREFETCH_FULL_RADIUS_BEHIND = 1;
```

All prefetch logic in `image-prefetch.ts` reads these as imports — no
magic numbers inline. The localStorage override (Session 1) lets a
tester change any of them at runtime via
`localStorage.setItem('kupua.prefetch.fastCadenceMs', '500')`.

### 2.4 Priority assignment

Within the desired set, assign `fetchPriority` to influence the
browser's connection-pool ordering:

| Position | Priority | Rationale |
|---|---|---|
| Center img (in StableImg / FullscreenPreview img tag) | `high` | Already set today, keep |
| Thumb i±1 | `high` | Cheap & critical for COMMIT fallback |
| Full-res i+1 (movement direction) | `high` | Most likely next view |
| Full-res i-1 (behind) | `low` | Useful but rarely used |
| Full-res i+2..i+4 | `low` | Lookahead, sacrificeable |
| Far lookahead during fast burst | `low` | Speculative |

Issue order within a batch (one-shot synchronous loop — browser handles
the rest):

1. All thumbs (mobile only).
2. Full-res i+1 (high).
3. Full-res i-1.
4. Full-res i+2, i+3, i+4 (low, in distance order).

### 2.5 Cancellation semantics

`img.src = ""` aborts an in-flight image fetch on Chromium and WebKit.
On Firefox the behaviour is "the request continues but the response is
not stored" — still useful for freeing the connection slot from JS POV.
Confirm with a smoke test in DevTools Network panel during dev.

In-flight tracking is per **image ID**, not per URL (so re-issuing the
same image with a different priority replaces the previous entry — last
write wins). When `_loadedFullRes` learns of a successful decode, drop
its in-flight entry.

### 2.6 Cadence computation

```ts
// EMA smoothing — 1 step at the new interval has weight 0.4
cadenceMs = cadenceMs == null
  ? interval
  : cadenceMs * 0.6 + interval * 0.4;
```

First call seeds; second call onward smooths. Reset on session timeout.

### 2.7 What stays in the React layer

- `isFullResLoaded` / `markFullResLoaded` / `onFullResDecoded` —
  unchanged signature, unchanged consumers. The Set fills both from
  prefetch decode and from center `onLoad`.
- `prefetchGen` state in `ImageDetail` — unchanged for now (deletion
  considered in T6).

### 2.8 What moves between flows (convergence)

- `FullscreenPreview.getImageUrl` → delete; use `getCarouselImageUrl`.
- ImageDetail desktop path can render a single `<img>` instead of a
  one-panel-strip. Considered in Tier 5 (see §5 success criteria).

---

## 3. Sessions

Sessions are sized for one Claude Opus 4.6 agent each (~2 hours of
focused work, with comprehensive context loaded fresh from this doc).
Each session is independently committable and leaves the codebase in a
working state. Subsequent sessions assume previous ones have landed.

Recommended commit message prefix: `Prefetch:` so the work clusters in
log.

### Session 1 — Foundation: types, tuning consts, instrumentation, no behaviour change ✅

**Goal:** Land the scaffolding (constants in `tuning.ts`, types, dev-only
instrumentation, localStorage overrides) without changing any
user-visible behaviour. Future sessions read from this state.

**Estimated size:** ~150 LOC + tests.

**Steps:**

1. **Tier 0 commit.** If the uncommitted thumbnail-radius revert (§A)
   has not landed yet, commit it as the first commit of this branch with
   message `Prefetch: revert i±1 thumbnail restriction (slow-network regression)`.
2. In [`src/constants/tuning.ts`](../../src/constants/tuning.ts), add the prefetch-section block with all
   six constants from §2.3.
3. In `image-prefetch.ts`, define the `TraversalSession` type (§2.1) and
   a module-level `_currentSession: TraversalSession | null`. Import the
   constants from `@/constants/tuning`.
4. Add a localStorage override helper:
   ```ts
   function tunable(key: string, fallback: number): number {
     if (typeof localStorage === 'undefined') return fallback;
     const raw = localStorage.getItem(`kupua.prefetch.${key}`);
     const n = raw == null ? NaN : Number(raw);
     return Number.isFinite(n) ? n : fallback;
   }
   ```
   Read each constant through this helper at call sites (not at module
   load — read each time so DevTools edits take effect on next call).
5. Add `import.meta.env.DEV`-gated logger utility `prefetchLog(tag, payload)`
   — push to a ring buffer of last 200 entries and `console.debug` (only
   in dev). Expose `getPrefetchLog()` for use by future debug button. NO
   call sites yet.
6. Add a `getPrefetchStats()` exported for tests: returns
   `{ inFlightCount, sessionOpen, cadenceMs, lastCancelledCount }`.
7. Add `__resetPrefetchForTests()` exported to clear all module state.
8. **Do not call any of this from the existing `prefetchNearbyImages`
   yet.** This session adds infrastructure; behaviour is identical.

**Tests:** unit-test the cadence EMA helper as a pure function. Do not
test `prefetchNearbyImages` behaviour change — there is none yet.

**Pre-condition:** Tier 0 revert applied.
**Post-condition:** All existing tests pass. New constants and types
exported. `pnpm typecheck` clean.

### Session 2 — Cancellation + fetchPriority + thumbnail-first ordering ✅

**Goal:** Layer in cancellation and priority hints. Visible improvement on
slow networks, no behavioural changes on fast networks.

**Estimated size:** ~120 LOC.

**Steps:**

1. Refactor `prefetchNearbyImages` body to use the session abstraction:
   - Open / reuse `_currentSession`.
   - Track inFlight Map (keyed by image ID).
   - Compute `desired` = full radius (no cadence skipping yet — that's
     Session 3).
2. Implement `cancelLeftRadius(desired)`: for each inFlight entry whose
   ID is not in desired, set `img.src = ""` and delete.
3. Implement `issueMissing(desired)`:
   - Mobile: issue all thumbs first (with `fetchPriority = "high"` for
     i±1, `"low"` for further).
   - Then full-res, `fetchPriority` per §2.4.
   - On full-res `decode()` success (mobile only), drop from inFlight.
4. Drop the old throttle gate (`if (now - lastPrefetchTime.current < 150) return;`).
   Cancellation + cadence-aware skipping (Session 3) supersedes it. The
   `lastPrefetchTime` ref param can stay for backward signature compat
   for now; it just becomes unused. Mark with a TODO referencing
   Session 6.
5. Verify in DevTools Network: trigger a 10-step burst with throttling
   on, observe cancelled requests as red entries. Final image should
   arrive within ~1 download-time of stopping.

**Tests:**

- New unit test: simulate a sequence of `prefetchNearbyImages` calls,
  assert `getPrefetchStats().inFlightCount` doesn't grow unbounded.
- Mock `Image` constructor; assert priority assignments in the order
  expected.
- Existing unit + e2e tests must pass.

**Pre-condition:** Session 1 committed.
**Post-condition:** "Stuck on wrong image" symptom should be qualitatively
gone on slow-network manual test. Document the manual test result in
`worklog-current.md`.

### Session 3 — Cadence-aware skipping + post-burst debounce ✅

**Goal:** During fast bursts, stop wasting bandwidth on intermediate
positions; on burst end, aggressively prefetch around the resting
position.

**Estimated size:** ~80 LOC.

**Steps:**

1. Add cadence computation (§2.6) on each `prefetchNearbyImages` call.
2. Compute `desired` differently when `cadenceMs < FAST_CADENCE_MS`:
   - Include only thumbs i±1 (mobile) + full-res i+1 + far lookahead
     i±FAR_LOOKAHEAD.
   - Skip middle full-res (i+2, i+3, i+4).
3. Implement `scheduleBurstEnd()`:
   - Clear any existing timeout.
   - Set new `setTimeout(BURST_END_MS, ...)`:
     - Recompute desired with cadence forced to "stable".
     - Run cancelLeftRadius + issueMissing.
     - Don't close the session; let SESSION_TIMEOUT_MS handle that.
4. Implement `closeSession()` on SESSION_TIMEOUT_MS: clear all
   inFlight (don't cancel — let in-flight finish populating cache),
   null out session.

**Tests:**

- Unit test the cadence calculation: feed timestamped calls, assert
  cadenceMs values.
- Unit test the desired-set computation: at `cadenceMs = 200ms`, assert
  set is `{i-1 thumb, i+1 thumb, i+1 full, i+FAR full, i-FAR full?}`;
  at `cadenceMs = 800ms`, assert full radius.
- Manual: 10-step burst at ~150ms cadence, then stop. After 300ms,
  should see the 5-image stable batch fire in DevTools.

**Pre-condition:** Session 2 committed.
**Post-condition:** Connection pool stays clear during bursts. Final
image arrives quickly.

### Session 4 — Converge FullscreenPreview onto the shared pipeline ✅

**Goal:** `FullscreenPreview` should benefit from the same prefetch
machinery as `ImageDetail`. Today it builds its URL inline differently
and never benefits from cancellation because the symptom appeared
"desktop-only".

**Estimated size:** ~50 LOC, mostly deletes.

**Steps:**

1. Delete `getImageUrl()` in `FullscreenPreview.tsx`. Replace with
   `getCarouselImageUrl(image)` from `image-prefetch.ts`.
2. Confirm the bare `<img>` in FullscreenPreview gets `fetchPriority="high"`
   (add the attribute).
3. Verify that `useImageTraversal` already calls `prefetchNearbyImages`
   on every navigation (it does, line ~205 of the hook). No extra
   plumbing needed — sessions, cancellation, priority all kick in
   automatically.
4. Add an explicit `prefetchNearbyImages` call from `enterPreview()`
   path (already done, line ~120 of `FullscreenPreview.tsx`) — verify
   it bypasses the throttle (passes `null`) and so triggers a fresh
   session.
5. **Cleanup:** in `FullscreenPreview.tsx`, the `lastPrefetchRef` is
   not currently passed (the hook owns it). Confirm nothing dangling.

**Tests:**

- Existing FullscreenPreview e2e test (smoke) should pass unchanged.
- Add a unit test that mounting → arrow-right calls
  `prefetchNearbyImages` with the right index/direction. (May require
  exposing it via dependency injection or jest.spyOn — pick lightest
  path.)

**Pre-condition:** Session 3 committed.
**Post-condition:** Held-arrow-key in FullscreenPreview feels as good as
in ImageDetail. URL canonicalisation matches everywhere.

### Session 5 — Simplify desktop ImageDetail traversal ⏭️ SKIPPED

> **Skip rationale (22 Apr 2026):** Swapping StableImg for bare `<img>` on
> desktop saves microseconds but risks subtle React reconciliation regressions
> on the primary user surface. The workplan's own escape hatch said "ship 1–4 +
> 6 only" — we took it proactively. The real gains (cancellation, fetchPriority,
> cadence-aware skipping) all landed in Sessions 2–3.

**Goal:** ImageDetail-on-desktop pays for mobile-only carousel machinery
even though side panels are already gated on `_pointerCoarse`. There's
one more reasonable simplification step before more invasive work.

> **Desktop is the primary user surface.** Real users do most of their
> work on desktop and care about traversal performance there far more
> than on mobile (mobile is a flight of fancy for the team, not for
> users). This session must produce **measurably equal-or-better**
> desktop performance — never a regression, however small. If any
> manual smoke test feels even slightly worse than before this session,
> revert and ship Sessions 1–4 + 6 only. The escape hatch is genuine,
> not theoretical.

**Estimated size:** ~80 LOC.

**Steps:**

1. **Decision point — already pre-agreed with user.** Render the desktop
   center panel as a bare `<img src={imageUrl} fetchPriority="high">`
   instead of `<StableImg>`.
   - **Pro:** removes one layer of indirection, removes the only place
     where StableImg's `useLayoutEffect` is overhead-without-payoff on
     desktop. Brings desktop ImageDetail to FullscreenPreview parity.
   - **Con:** small risk of subtle regression around the React
     reconciliation path during navigation. Verify center panel
     `key={image.id}` is sufficient to force fresh decode.
2. Implement the `_pointerCoarse ? <StableImg> : <img>` branching in
   [`ImageDetail.tsx`](../../src/components/ImageDetail.tsx) center panel JSX. Side panels remain gated as today.
3. Drop `prefetchGen` state / `onFullResDecoded` subscription on
   desktop. The whole `prefetchGen → re-render → side-panel URL
   upgrade` loop only matters when side panels render — mobile-only.
   Conditional registration of the listener: gate the body of the
   `useEffect` with an early return `if (!_pointerCoarse) return;` —
   never conditionally call a hook.
4. Re-test mobile carousel still works end-to-end (the side-panel URL
   upgrade path is mobile-only and must continue to fire there).
5. **Mandatory desktop regression check** before commit:
   - Held arrow-right for 5s, slow network: at-least-as-fast as before.
   - Single arrow press, fast network: no perceptible flash that wasn't
     there before.
   - DevTools Performance recording of a 10-press burst: total scripting
     time within ±10% of pre-session baseline.
   - If ANY of these fail: revert this session, ship Sessions 1–4 + 6,
     and reopen as a separate investigation.

**Tests:**

- Existing ImageDetail unit + e2e tests pass.
- New e2e: with simulated coarse-pointer (`page.emulate({ hasTouch:
  true })`), assert side panels render. With fine-pointer, assert they
  don't. (Probably already tested via `_pointerCoarse` gating —
  expand if not.)

**Pre-condition:** Session 4 committed.
**Post-condition:** Desktop ImageDetail is one `<img>` + one prefetch
pipeline. Mobile is unchanged. Held-arrow-key noticeably snappier on
slower desktops.

### Session 6 — Cleanup pass ✅

**Goal:** Remove dead code and unify the prefetch entry points after the
dust has settled.

**Estimated size:** ~60 LOC of deletions.

**Steps:**

1. Drop `lastPrefetchTime` ref param from `prefetchNearbyImages`
   signature. Update all call sites in `useImageTraversal` and
   `FullscreenPreview`. The session manages its own state now.
2. Delete the doc comment in `image-prefetch.ts` referencing the old
   throttle gate (lines describing T=150ms behaviour).
3. Audit `useSwipeCarousel.ts` for dead diagnostic shims and stale
   comments; the review doc §2.3 / §2.8 list specific examples.
4. Update `swipe-carousel-review.md` checklist with completed items
   (the parts of §6 "Bigger experiments" that are now done).
5. Add a top-of-file doc comment to `image-prefetch.ts` describing the
   session model so the next agent doesn't have to read this workplan.

**Tests:** All existing tests pass. No behavioural change.

**Pre-condition:** Session 5 committed.
**Post-condition:** Codebase tidy. This workplan can be moved to
`zz Archive/`.

### Session 7 (optional) — Hover-prefetch on NavStrip — not attempted

Only do this if measurement after Sessions 1–6 still shows visible
hover→click latency on desktop. Implementation per §7.4 of the review
doc. ~30 LOC. Skip otherwise.

---

## 4. Things explicitly out of scope

- **Spinner during blank slides.** User explicitly deferred. May be
  trivially added later — Way A from the conversation (1×1 transparent
  data URI as `img.src` placeholder + spinner behind) is the recommended
  approach if/when it happens. No code in this workplan should preclude
  it.
- **`<link rel="preload" as="image">`.** Listed in `swipe-carousel-review.md`
  §6 and worth doing for partial decode-share on Chromium, but
  orthogonal to this workplan. Defer.
- **`createImageBitmap()` + `<canvas>`.** §3.B of the review. Real
  engineering effort, only worth it if measurement after this work
  shows decode latency is still UX-visible. Defer.
- **Dropping the slide animation entirely.** Architectural option from
  §4.1 of the review. Product call, not a perf call. Out of scope.
- **Center-src canonicalisation at COMMIT time.** §3.D of the review.
  Worth doing as a focused mini-commit after this workplan if "rapid
  swipe lands → brief blur" is still observable; not bundled in
  because it touches `commitStripReset` which this workplan
  deliberately leaves alone.

---

## 5. Success criteria

A reasonable observer running the manual scenarios on a 3G-class
network (Chrome DevTools "Slow 3G" preset) on the same hardware that
exhibited the bugs on Apr 22 2026 should see:

| # | Scenario | Expected after this work |
|---|---|---|
| S1 | Mobile: single-step swipe at relaxed cadence | Full-res slides in. No duplicate. (Same as today.) |
| S2 | Mobile: 5-swipe burst at ~250ms cadence | Either full-res or thumbnail visible during each slide. **No duplicate of any previous image.** Final image is full-res within ~1 download-time of stopping. |
| S3 | Mobile: 15-swipe burst at ~150ms cadence | Side panels may be blank during burst (acceptable). **No duplicates.** Within 300ms of stopping, the rested image's thumbnail is visible; within 1 download-time, full-res. |
| S4 | Desktop: held arrow-right for 5 seconds | Center image updates without "stuck on previous" flash longer than one decode time. After releasing, final image full-res visible within 1 download-time. |
| S5 | Desktop FullscreenPreview: held arrow-right | Same as S4. (No regression vs today; should be at least as good.) |
| S6 | Desktop: held arrow-right for 30 seconds across buffer-extend boundary | Buffer extends as today; after release, final image arrives quickly. |

**Quantitative target (DevTools Network panel):**
- After a 10-step rapid burst, the number of *uncancelled* in-flight
  full-res requests at the moment of release should be **≤ 3** (one for
  the current center, two for i±1). Pre-fix this is **8–12+** depending
  on burst length.

**Negative criterion (must not introduce):**
- No reduction in success rate of the side-panel data-thumb fallback —
  the i±1 thumbnail must still be in cache at COMMIT time on slow
  networks. Verify by reproducing the original duplicate-image scenario
  from `worklog-current.md` and confirming it still works.

---

## 6. Test strategy

### Unit tests

- `image-prefetch.test.ts` (new file or expanded existing):
  - Cadence EMA pure function.
  - Desired-set computation at various cadences.
  - inFlight tracking under sequential calls (no leak, correct
    cancellation set).
  - Mock `Image` to assert `fetchPriority` assignment.
- `useImageTraversal.test.ts` (existing): no behavioural change
  expected; ensure passes after each session.

### Integration / e2e

- Use Playwright with `await page.context().setOffline()` and
  `page.context().route()` to introduce per-request delay simulating
  slow network. Existing test infra in `kupua/e2e/` supports this; see
  `kupua/playwright.config.ts` and helpers under `kupua/e2e/shared/`.
- New e2e: **`prefetch-cadence.spec.ts`** (in `kupua/e2e/`):
  - Open ImageDetail on desktop. Hold arrow-right for 3 seconds via
    `page.keyboard.down('ArrowRight')` → wait → `up`. Assert: final
    rendered image is the expected one within N seconds. Network panel
    captures via CDP show ≤ 3 in-flight at release.
  - Equivalent for `FullscreenPreview` (`f` key entry path).
  - Mobile swipe burst via `page.touchscreen.swipe()` × 10 with 200ms
    intervals. Assert no duplicate-image visual artefact (use
    screenshot comparison at mid-animation; can be tolerant).

The mobile screenshot test is the hardest; if too flaky, fall back to
asserting that `commitStripReset` was called with consistent panel
content (could be exposed via a test-only window hook).

### Manual smoke matrix

Each session should be manually smoke-tested on real hardware before
commit:

| Session | Manual test |
|---|---|
| 1 | Existing flows unchanged, no console errors |
| 2 | DevTools Network shows cancelled requests during burst |
| 3 | DevTools Network shows quiet period during burst, then a tight cluster after release |
| 4 | FullscreenPreview held-arrow on slow network feels like ImageDetail held-arrow |
| 5 | Desktop ImageDetail no longer rendering side panels (DevTools Elements tab confirms) |
| 6 | All existing manual flows still work |

---

## 7. Risk register

| Risk | Mitigation |
|---|---|
| `img.src = ""` doesn't actually cancel on iOS Safari | Verify in dev. If it doesn't, fall back to leaving the request and just dropping the JS reference + relying on `fetchPriority` to deprioritise. Symptom: connection pool stays full on iOS during bursts. |
| Cancellation cancels a request that the user actually swipes back to | Acceptable. The browser HTTP cache may still have a partial response; worst case it re-fetches. Net win because the *current* center got priority. |
| Cadence threshold tuning is wrong for some real-world device | All thresholds are top-of-file consts. Easy A/B with localStorage override flag during tuning. |
| Session 5 desktop simplification regresses something subtle in StableImg's load path | Only Session 5 carries this risk. It is gated behind a confirmation question — escape hatch is to render `<StableImg>` always (mobile + desktop) and only land Sessions 1–4 + 6. |
| Hook-order error in Session 5 step 3 (conditional listener) | Use ref-then-effect pattern explicitly; review checklist in the session. |

---

## 8. Resolved questions (answered by user during workplan review)

1. **Tunable constants — starting values acceptable?** Yes. Not measured;
   rely on tuning after Session 3 via the localStorage override
   mechanism (Session 1 step 4).
2. **Constants location?** `src/constants/tuning.ts` (existing convention),
   not a new file. Imported into `image-prefetch.ts`.
3. **Session 5 desktop simplification?** Agreed — but with explicit
   no-regression requirement. Desktop is the primary user surface; if
   the simplification regresses anything, revert and ship without it.
   See Session 5 box.
4. **Split `image-prefetch.ts` into `traversal-session.ts` + `prefetch.ts`?**
   No. One file. Session is a leaf concern of prefetch.

---

## 9. For future agents — how to pick this up

1. Read this entire doc, then `swipe-carousel-review.md`, then
   `worklog-current.md` (in that order). Skim
   `touch-gestures-handoff.md` only if working on Sessions 5+.
2. `git status` to see whether Tier 0 (§A) is committed or still in
   working tree.
3. `git log --oneline mk-next-next-next` to see how far the work has
   progressed.
4. Before each session, re-read its section in this doc. Do NOT
   improvise across session boundaries — one session = one PR-ish
   scope.
5. Update the §3 session status (✅ when done) as you commit each.
6. Manual smoke-test on real hardware where possible. The bugs this
   work targets do not reproduce in DevTools alone — they need real
   network and real touch.
