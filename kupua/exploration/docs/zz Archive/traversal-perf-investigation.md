# Image Traversal Performance Investigation

> Running document. Findings, research, experiments, results.
> Started 1 Apr 2026.

## The Problem

User feels image traversal (arrow keys in detail/fullscreen view) is slower
than it used to be. Especially during moderate-speed browsing (200-500ms per
image), images don't feel instant like they used to.

## Research Findings

### Three Eras of Prefetch Logic

| Era | Commit | Mechanism | Pipeline? | Cancellation? |
|-----|--------|-----------|-----------|---------------|
| 1 | `6c2b36464` | No prefetch. Just `<img src=...>` | No | No |
| 2 | `0f25d90f9` | Fire-and-forget `new Image().src` on every step. 2 back + 3 forward. Never cancelled. | **Yes — rolling** | No (intentional: "aborting a partially downloaded image can leave the cache entry incomplete") |
| 3 | `85673c0d4` (current) | `fetch()` + `AbortController`, debounced 400ms. Aborts in-flight on navigation. | **No — killed by debounce** | Yes |

**Era 2→3 regression hypothesis:** The 400ms debounce means prefetches *never
fire* during normal-speed flicking (200ms per image). The rolling pipeline that
kept the next 3 images warm is gone. At moderate speed, every image is now a
cold ~400ms imgproxy fetch instead of a cache hit.

**Complicating factor:** The main `<img>` element's `src` changes on every
arrow press in all eras. This fires a browser-managed HTTP request to imgproxy
for every intermediate image regardless of prefetch strategy. Era 3's abort
only stops *prefetch* requests, not these *main image* requests. So the "clean
pipe for the landing image" rationale was only partially effective.

### Direction Awareness

Current prefetch is position-fixed: always [i-2, i-1, i+1, i+2, i+3].
During forward flicking, i-2 and i-1 are already cached (just came from
there). Wasted slots.

### Web Prior Art

**PhotoSwipe** (24k★, most popular web lightbox):
- Config: `preload: [1, 2]` — [backward, forward]
- Direction-aware: `updateLazy(diff)` where `diff` is position change sign
- Forward: load [i+1, i+2], then [i-1]. Backward: reversed.
- Fire on every navigation (no debounce)
- Never cancels in-flight loads. LRU cache (min 5 items), evicts oldest.

**immich** (65k★, modern web photo manager):
- Progressive 3-tier: thumbnail → preview → original
- Direction-aware cancellation: on move forward, destroy *previous*-preloader
- Only preloads 1 ahead + 1 behind (progressive quality compensates)
- `AdaptiveImageLoader`: UI shows thumbnail instantly, swaps to higher quality
  as each tier completes

**Browser APIs:**
- `fetchpriority="high"` on `<img>`: tells browser this image wins scheduling
  ties vs background prefetches. Chrome 101+, Firefox 132+, Safari 17.2+.
  Zero cost, silent fallback.
- `<link rel="prefetch">`: low-priority hint. Good for "might need soon."
  Broad support. Can remove from DOM to hint cancellation.
- `fetch(url, { priority: "low" })`: explicit low priority. Chrome 101+.
- `<link rel="preload" as="image">`: high priority — wrong for prefetches.

### What Else Fetches During Traversal?

- `<img src=...>` — imgproxy request, one per arrow press (browser-managed)
- Prefetch `Image()` or `fetch()` — up to 5 per step (Era 2) or 0 (Era 3)
- Metadata: **no network** — rendered from the `image` object already in store
- Standalone fetch (`getById`): only when image not in store (not during normal traversal)
- ES requests: zero during traversal

### Open Questions

1. **Does `<img>` src-change contention actually matter?** When you change
   `<img src=...>` 20 times rapidly, how many HTTP requests actually reach
   imgproxy? Chrome may cancel the previous request, but imgproxy may have
   already started processing. Need to measure.
2. **Does the rolling pipeline (Era 2) make landing image slower due to
   contention?** Or is the pipeline benefit (cache warming) worth more than
   the contention cost?
3. **How much does `fetchpriority="high"` help** when competing with
   background prefetches?

---

## Experiment Plan

### Approach

We cannot A/B test different code paths simultaneously. Instead, we make
small code changes, run E4 (detail traversal) and E5 (fullscreen traversal),
compare JSON results across runs.

**Cache control is critical.** We must clear browser cache before each run.
imgproxy has no result cache (processes fresh each time), so the concern is
only browser HTTP cache.

All runs use the same: TEST cluster, corpus pinned to `STABLE_UNTIL`, same
viewport (1987×1110, DPR 1.25), same image start position (image index 3),
same traversal steps (fast=12, rapid=20).

### Phase 0: Instrumentation ✅

Added to `experiments.spec.ts`:
- **imgproxy request tracking** in probes: counts `/imgproxy/` and `/insecure/`
  entries in `PerformanceResourceTiming`, records count, bytes, cache hits,
  avg duration. New `snapshot.imgproxy` section in JSON output.
- **Browser cache clear before E4** via CDP `Network.clearBrowserCache`
  (E5 already had this). Both E4 and E5 now start cold.
- **"moderate" speed tier** (500ms interval, 10 images): captures the
  prefetch pipeline effect — at this speed, a prefetch has ~500ms to complete
  between steps. If the pipeline works, images should be cache hits.
- **Landing image cache hit detection**: `landingImage.cacheHit` boolean
  from `PerformanceResourceTiming.transferSize === 0`.
- imgproxy stats logged to console and saved in JSON for each speed tier.

### Phase 1: Baseline (current code, Era 3)

Run E4 + E5 with the new instrumentation. Both clear browser cache.
This gives the true cold-cache baseline for the debounced prefetch approach.

**Command** (human runs this while `./scripts/start.sh --use-TEST` is running):
```
cd kupua && npx playwright test --config playwright.experiments.config.ts -g "E4|E5"
```

Expected ~2 min total. 6 speed tiers × 2 experiments. JSONs land in
`e2e-perf/results/experiments/`.

**What to watch for:**
- `imgproxy.requestCount`: how many requests actually fired during traversal?
- `imgproxy.cacheHits`: any cache warming from the debounced prefetch?
- `landingImage.cacheHit`: was the landing image ever pre-warmed?
- Moderate tier: do images render during the 500ms windows? (renderedCount)

### Phase 2: Era 2 Restoration (fire-and-forget, no debounce)

Modify `ImageDetail.tsx`: replace debounced `fetch()` + `AbortController`
with fire-and-forget `new Image().src` on every step (Era 2 approach).
Keep the same 2 back + 3 forward allocation.

Run E4 + E5 with cache cleared. Compare landing image timing and imgproxy
request count against Phase 1.

**Hypothesis:** Landing image time may be similar or slightly slower (more
contention), but the *feel* during moderate browsing is dramatically better
because intermediate images are cache-warm.

### Phase 3: Direction-Aware Pipeline (PhotoSwipe model)

Modify to track last direction. Prefetch in movement direction:
forward → [i+1, i+2, i+3, i+4], [i-1]. Backward → reversed.
Fire in distance order (i+1 first). Fire-and-forget `new Image().src`.

Run E4 + E5. Compare.

**Hypothesis:** Marginal improvement over Phase 2 — the wasted backward
prefetches in Phase 2 don't cost much (they're cache hits, no network).
But the extra +4th forward image might help at moderate speed.

### Phase 4: fetchpriority="high"

Add `fetchpriority="high"` to the main `<img>` element. Can layer on top
of whichever prefetch strategy wins from Phases 2-3.

Run E4 + E5. Compare.

**Hypothesis:** Small improvement on landing image time in Chrome (browser
prioritises the current image's request over prefetch requests in its
network scheduler). No effect in Firefox (not yet supported).

### Phase 5: Combined Best

Apply the best prefetch strategy + `fetchpriority="high"`. Final
measurement.

### What We Measure

For each phase, the key metrics from E4/E5 JSON:

| Metric | Where | Why |
|--------|-------|-----|
| `landingImage.renderMs` | storeState | **THE number** — user-perceived landing latency |
| `landingImage.networkMs` | storeState | imgproxy contribution to landing |
| `landingImage.alreadyRendered` | storeState | Was it a cache hit? |
| `renderedCount` / `steps` | storeState | What fraction rendered during flicking |
| `avgRenderMs` | storeState | Average for images that did render |
| imgproxy request count | snapshot (new) | Total imgproxy requests fired |
| imgproxy cache hit on landing | snapshot (new) | Was landing image prefetch-warmed? |

### What We DON'T Measure (yet)

The "feel" during moderate browsing — whether images appear pre-loaded as
you step through them. This is subjective and best evaluated by the user
playing with each phase manually. The experiments measure fast (200ms) and
rapid (80ms), not the moderate 400-800ms "studying images" pace where the
pipeline matters most.

We could add a "moderate" traversal speed tier (e.g. 500ms per image) to
capture the pipeline effect. At 500ms, Era 2's prefetch timer (0ms, fires
immediately) would have 500ms to complete a prefetch for the next image.
With imgproxy at ~400ms cold, image N+1 might just barely be loaded when
the user arrives. Worth adding to the experiment.

---

## Experiment Results

### Phase 0: Instrumentation ✅

### Phase 1: Baseline (cache-contaminated) — 1 Apr 2026

Browser cache was cleared once before E4, but **not between speed tiers**.
Speed tiers run sequentially (moderate → fast → rapid) and traverse
overlapping images (all start near image 3, going forward). Result: later
tiers got massive cache warming from earlier tiers.

**E4 (detail view):**

| | Moderate (500ms, 10) | Fast (200ms, 12) | Rapid (80ms, 20) |
|---|---|---|---|
| Landing renderMs | **200ms** | **0ms** ← cache! | **385ms** |
| Landing cacheHit | false | **true** | false |
| imgproxy requests | 60 | 15 | 21 |
| imgproxy cache hits | 50/60 (83%) | **15/15 (100%)** | 19/21 (90%) |
| imgproxy avgMs | 121ms | **0.5ms** | 77ms |
| Rendered / total | 8/10 | **12/12** | 13/20 |

**E5 (fullscreen, cache cleared before E5 block but not between tiers):**

| | Moderate (500ms, 10) | Fast (200ms, 12) | Rapid (80ms, 20) |
|---|---|---|---|
| Landing renderMs | **651ms** | **0ms** ← cache! | **429ms** |
| Landing cacheHit | false | **true** | false |
| imgproxy requests | 60 | 15 | 22 |
| imgproxy cache hits | 51/60 (85%) | **15/15 (100%)** | 19/22 (86%) |
| Rendered / total | 7/10 | **11/12** | 14/20 |

**Key observations:**
- E4-fast and E5-fast are **entirely cached** — 100% cache hit rate, 0ms
  landing. This is cross-tier contamination from moderate warming the same
  images. **Useless as a baseline.**
- E4/E5-moderate landing images (200ms/651ms) are the most trustworthy
  numbers — they ran first after cache clear.
- E4/E5-rapid landing images (385ms/429ms) are partially contaminated:
  images 0-12 were cached from moderate+fast, only images 13-19 were cold.
  The landing image (position ~20) was cold — so landing time is valid,
  but `renderedCount` is inflated.

**Fix applied:** Added per-tier cache clearing (CDP `Network.clearBrowserCache`
before each speed tier). Phase 1b re-run needed.

### Phase 1b: Baseline (per-tier cache clearing) — 1 Apr 2026 ✅

Browser cache cleared before EACH speed tier. True cold-cache results.

**E4 (detail view):**

| | Moderate (500ms, 10) | Fast (200ms, 12) | Rapid (80ms, 20) |
|---|---|---|---|
| **Landing renderMs** | **138ms** | **542ms** | **437ms** |
| Landing networkMs | 129ms | 532ms | 414ms |
| Landing cacheHit | false | false | false |
| imgproxy requests | 59 | 17 | 22 |
| imgproxy cache hits | 50/59 (85%) | 11/17 (65%) | 19/22 (86%) |
| imgproxy avgMs | 115ms | 290ms | 144ms |
| Rendered / total | 8/10 | **3/12** | **3/20** |
| Swapped not rendered | 2 | **9** | **17** |

**E5 (fullscreen):**

| | Moderate (500ms, 10) | Fast (200ms, 12) | Rapid (80ms, 20) |
|---|---|---|---|
| **Landing renderMs** | **28ms** (!!) | **482ms** | **376ms** |
| Landing networkMs | 21ms | 470ms | 366ms |
| Landing cacheHit | false | false | false |
| imgproxy requests | 58 | 17 | 22 |
| imgproxy cache hits | 50/58 (86%) | 11/17 (65%) | 19/22 (86%) |
| imgproxy avgMs | 99ms | 280ms | 141ms |
| Rendered / total | 9/10 | **3/12** | **3/20** |
| Swapped not rendered | 1 | **9** | **17** |

**Per-image pattern at moderate speed (E4):**
```
[0] 90ms RENDERED    ← cache hit (near grid viewport)
[1] 91ms RENDERED    ← cache hit
[2] 89ms RENDERED    ← cache hit
[3] 453ms RENDERED   ← COLD: first imgproxy fetch
[4] 337ms RENDERED   ← cold but slightly faster (tunnel warm?)
[5] 536ms RENDERED   ← cold
[6] skipped          ← didn't finish in 500ms window
[7] 520ms RENDERED   ← cold, barely made it
[8] 483ms RENDERED   ← cold
[9] skipped          ← didn't finish
```

**Key findings:**

1. **Cache clearing works.** Fast and rapid tiers no longer show inflated
   cache hit rates. Fast: 11/17 (65%) vs Phase 1's 15/15 (100%).
   Rapid: 19/22 (86%) — the 19 cache hits are images 0-2 (near grid
   viewport, thumbnails cached on page load) and some `<img>` requests
   from the traversal that completed and stayed in cache for re-polling.

2. **Landing image at fast/rapid is now 376-542ms** — pure imgproxy cold
   latency. This is the real number. No pipeline warming it.

3. **Landing image at moderate is suspiciously fast: 138ms (E4), 28ms (E5).**
   This is image 10 (E4) / image 10 (E5). At 500ms per image × 10 images
   = 5000ms total traversal. During that 5s, the debounced prefetch (400ms)
   likely fired at least once — possibly when the user "settled" on an
   early image long enough. The landing image may have been warmed by a
   prefetch OR by an earlier `<img src=...>` request completing for a nearby
   image. E5-moderate at 28ms is almost certainly a cache hit despite
   `cacheHit: false` — `transferSize` may not report 0 for service-worker
   or memory-cache hits in all cases.

4. **Moderate: 8-9/10 rendered** vs fast/rapid: **3/12 and 3/20**. At
   moderate speed, most images render — the 500ms window is just barely
   enough for imgproxy's ~400-540ms. At fast (200ms), only the first 3
   (cached from grid view) render. At rapid (80ms), same 3.

5. **imgproxy request counts: 59 (moderate) vs 17 (fast) vs 22 (rapid).**
   Moderate fires many more because the debounced prefetch (400ms) actually
   fires between steps (500ms > 400ms). That's ~5 prefetch batches × ~10
   images each = ~50 prefetch requests + ~10 `<img>` requests ≈ 59 total.
   Fast/rapid: debounce never fires, so it's just `<img>` requests +
   the one prefetch batch after the user stops.

6. **This confirms the regression hypothesis.** At moderate speed, Era 3's
   debounce fires and provides some warming (hence 138ms/28ms landing).
   At fast speed, the debounce NEVER fires — zero prefetch pipeline — and
   landing is 482-542ms cold. Era 2's rolling pipeline would have warmed
   fast-speed browsing too.

**Post-1b addition:** Added `slow` tier (1000ms, 8 images) to map the full
debounce gradient. At 1000ms per image the 400ms debounce fires every step
— every image should be prefetch-warm. This gives four points on the curve:

| Tier | Interval | Debounce fires? | Predicted landing |
|------|----------|-----------------|-------------------|
| slow | 1000ms | every step | ~0ms (cache hit) |
| moderate | 500ms | sometimes | 28-138ms (partial) |
| fast | 200ms | **never** | 482-542ms (cold) |
| rapid | 80ms | **never** | 376-437ms (cold) |

### Phase 1c: Full gradient (with slow tier) — 1 Apr 2026 ✅  **← THIS IS THE BASELINE**

**E4 (detail view):**

| | Slow (1000ms, 8) | Moderate (500ms, 10) | Fast (200ms, 12) | Rapid (80ms, 20) |
|---|---|---|---|---|
| **Landing renderMs** | **0ms** ★ | **120ms** | **500ms** | **410ms** |
| Landing cacheHit | **true** | false | false | false |
| Landing alreadyRendered | **true** | false | false | false |
| imgproxy requests | 48 | 59 | 17 | 22 |
| imgproxy cache hits | 41/48 (85%) | 51/59 (86%) | 11/17 (65%) | 19/22 (86%) |
| imgproxy avgMs | 120ms | 111ms | 275ms | 149ms |
| Rendered / total | **8/8 (100%)** | 8/10 | **3/12** | **3/20** |
| Swapped not rendered | **0** | 2 | **9** | **17** |

**E5 (fullscreen):**

| | Slow (1000ms, 8) | Moderate (500ms, 10) | Fast (200ms, 12) | Rapid (80ms, 20) |
|---|---|---|---|---|
| **Landing renderMs** | **0ms** ★ | **109ms** | **519ms** | **413ms** |
| Landing cacheHit | **true** | false | false | false |
| Landing alreadyRendered | **true** | false | false | false |
| imgproxy requests | 48 | 60 | 17 | 21 |
| imgproxy cache hits | 40/48 (83%) | 51/60 (85%) | 11/17 (65%) | 19/21 (90%) |
| imgproxy avgMs | 77ms | 122ms | 261ms | 131ms |
| Rendered / total | **8/8 (100%)** | 8/10 | **3/12** | **3/20** |
| Swapped not rendered | **0** | 2 | **9** | **17** |

**The debounce cliff is clear:**

| Tier | Interval | vs 400ms debounce | Landing | Pipeline works? |
|------|----------|-------------------|---------|-----------------|
| slow | 1000ms | 600ms headroom | **0ms** | ✅ every image prefetched |
| moderate | 500ms | 100ms headroom | **109-120ms** | ⚠️ barely — most images render but landing not always warm |
| fast | 200ms | **-200ms deficit** | **500-542ms** | ❌ debounce never fires |
| rapid | 80ms | **-320ms deficit** | **410-437ms** | ❌ debounce never fires |

**Consistent across 3 runs (1b + 1c):** fast landing = 482-542ms, rapid
landing = 376-437ms, slow = 0ms. Very stable. This is a clean baseline.

### Phase 2: Direction-aware pipeline + fetchPriority (combined)

Phases 2-4 from the original plan combined into a single change — they're
independent, low-risk, and there's no value in measuring them separately
when the baseline is this clear.

**Changes made to `ImageDetail.tsx`:**
1. Replaced Era 3 debounced `fetch()` + `AbortController` with Era 2-style
   fire-and-forget `new Image().src` — fired on every navigation, no debounce.
2. Direction-aware allocation (PhotoSwipe model): 4 ahead + 1 behind.
   Direction tracked via `directionRef`, set in `goToPrev`/`goToNext`.
3. `fetchPriority="high"` on the main `<img>` element.

**Command:**
```
cd kupua && npx playwright test --config playwright.experiments.config.ts -g "E4|E5"
```

**Expected:** Fast/rapid landing times should drop dramatically — the
rolling pipeline will warm images 1-4 ahead on every step, so the landing
image should often be a cache hit or nearly loaded.

### Phase 2 results — Run 1 (partial, 1 Apr 2026)

E5-fast and E5-rapid fell back to local ES (TEST tunnel dropped mid-run).
Those two results are invalid. E4 (all 4 tiers) + E5 slow/moderate valid.

### Phase 2 results — Run 2 (complete, 1 Apr 2026) ✅

Full clean re-run with stable TEST tunnel. All 8 tiers valid.

**E4 (detail) — Phase 2 vs Phase 1c baseline:**

| | Slow 1000ms | Moderate 500ms | Fast 200ms | Rapid 80ms |
|---|---|---|---|---|
| **Landing (Phase 2)** | **0ms** ★ | **0ms** ★ | **0ms** ★ | **0ms** ★ |
| Landing (baseline) | 0ms | 120ms | 500ms | 410ms |
| **Δ** | — | **−120ms** | **−500ms** | **−410ms** |
| alreadyRendered (P2) | true | true | true | true |
| Rendered/total (P2) | 8/8 | **10/10** | **12/12** | **13/20** |
| Rendered/total (base) | 8/8 | 8/10 | 3/12 | 3/20 |
| imgproxy reqs (P2) | 15 | 13 | 14 | 20 |
| imgproxy reqs (base) | 48 | 59 | 17 | 22 |
| imgproxy cache hits (P2) | 7/15 | 3/13 | 2/14 | 2/20 |
| imgproxy avgMs (P2) | 329ms | 380ms | 399ms | 377ms |
| imgproxy avgMs (base) | 120ms | 111ms | 275ms | 149ms |

**E5 (fullscreen) — Phase 2 vs Phase 1c baseline:**

| | Slow 1000ms | Moderate 500ms | Fast 200ms | Rapid 80ms |
|---|---|---|---|---|
| **Landing (Phase 2)** | **0ms** ★ | **0ms** ★ | **0ms** ★ | **290ms** ⚠️ |
| Landing (baseline) | 0ms | 109ms | 519ms | 413ms |
| **Δ** | — | **−109ms** | **−519ms** | **−123ms** |
| alreadyRendered (P2) | true | true | true | **false** |
| Landing cacheHit (P2) | true | true | true | **false** |
| Rendered/total (P2) | 8/8 | **10/10** | **12/12** | **6/20** |
| Rendered/total (base) | 8/8 | 8/10 | 3/12 | 3/20 |
| imgproxy reqs (P2) | 14 | 15 | 14 | 18 |
| imgproxy cache hits (P2) | 6/14 | 5/15 | 2/14 | **0/18** |
| imgproxy avgMs (P2) | 261ms | 293ms | 344ms | **608ms** |

**Key findings:**

1. 🎉 **Landing image: 0ms for 7 of 8 tiers.** The pipeline works
   beautifully at slow, moderate, and fast speeds — in both detail and
   fullscreen. Every landing image was `alreadyRendered: true`.

2. ⚠️ **E5-rapid is the exception: 290ms landing, 0 cache hits, 608ms
   avg imgproxy latency.** This is the contention signal we hypothesised.
   At 80ms/step in fullscreen, the 20 steps fire 100 `Image()` objects
   (5 per step). Zero imgproxy responses were served from cache. The avg
   imgproxy latency doubled (608ms vs ~300ms in other tiers), indicating
   imgproxy was overloaded processing concurrent requests.

3. **E4-rapid: 0ms landing, but E5-rapid: 290ms.** Same speed, same step
   count. The difference: fullscreen images are larger (fill viewport vs
   constrained detail panel). Larger images = more imgproxy processing
   time per request = more contention at the same request volume.

4. **Rendered count improved across the board.** Fast: 12/12 (was 3/12).
   Moderate: 10/10 (was 8/10). Even E5-rapid improved from 3/20 to 6/20.

5. **E4-rapid: 13/20 rendered** — same as Run 1. Consistent. The detail
   view pipeline handles rapid speed well because the images are smaller.

6. **imgproxy request counts are consistent** across both runs (~14-20
   per tier). Much lower than baseline (48-59), confirming browser
   request dedup from `Image()` objects.

**The contention gradient is now clear:**

| Tier | Interval | E4 Landing | E5 Landing | E5 imgproxy avgMs |
|------|----------|------------|------------|-------------------|
| slow | 1000ms | 0ms ★ | 0ms ★ | 261ms |
| moderate | 500ms | 0ms ★ | 0ms ★ | 293ms |
| fast | 200ms | 0ms ★ | 0ms ★ | 344ms |
| rapid | 80ms | 0ms ★ | **290ms** ⚠️ | **608ms** |

imgproxy latency rises smoothly from slow→fast (261→344ms, +32%). But at
rapid, it jumps to 608ms (+77% vs fast). The non-linear jump at rapid
confirms request contention — imgproxy is saturated.

**E4-rapid escapes** because detail-view images are smaller (less
processing per request). E5-rapid hits the wall because fullscreen images
are ~2-3× larger.

### Should we add a throttle?

**The case FOR:**
- E5-rapid landing is 290ms instead of 0ms. A throttle (skip prefetches
  if <100ms since last nav) would suppress ~80 of the 100 `Image()` objects,
  leaving only the `<img>` requests to compete. This might bring E5-rapid
  landing closer to 0ms.

**The case AGAINST:**
- 290ms is down from 413ms baseline — still a 30% improvement.
- The rapid tier (80ms/step, 20 images) is an extreme scenario. Real users
  holding the arrow key on macOS get ~33ms repeat rate (System Preferences
  default fastest), but the test gaps between key events add processing
  overhead that slows the effective rate. Real-world rapid flicking is
  probably 60-100ms/step — right at the boundary.
- E4-rapid (same speed, detail view) is 0ms. The problem is E5-specific.
- A throttle adds code complexity for one edge case in one view mode.
- The 290ms is not terrible — it's sub-300ms, which is within the
  "feels instant" perceptual threshold for most users.

**Verdict:** The data shows a real but marginal contention effect at the
extreme end. Worth noting, not worth optimising. Ship the pipeline as-is.

---

## Conclusions

### The regression was real

Era 3's 400ms debounce killed the prefetch pipeline at any browsing speed
faster than ~500ms/image. This caused a cliff: images rendered instantly at
slow (1000ms) browsing, but took 400-540ms cold at fast (200ms) and rapid
(80ms) — pure imgproxy latency with no cache warming.

### The fix works

Restoring fire-and-forget `new Image().src` on every navigation (Era 2
approach) + direction-aware allocation + `fetchPriority="high"` brings
landing image time to **0ms across 7 of 8 test tiers**. The one exception
(E5-rapid, fullscreen at 80ms/step) shows 290ms — down from 413ms, a 30%
improvement limited by imgproxy contention under extreme concurrent load.

### Throttle analysis — is there a "free lunch" value?

The user argues: images aren't optimised yet. Future changes (AVIF, DPR-aware
sizing, JPEG XL progressive) will make files larger. If imgproxy latency
grows from ~300ms to ~500ms+, the contention cliff currently at E5-rapid
(80ms/step) could creep into E5-fast (200ms/step) or even E5-moderate.
Should we add a throttle now as insurance?

**How the pipeline works — the math:**

```
Step i fires:
  - 1 × <img src=...>  for image[i]     (browser-managed, can't throttle)
  - 5 × new Image().src for [i+1..i+4, i-1]  (our prefetch)

At speed S ms/step, after N steps:
  Total <img> requests:      N
  Total prefetch requests:   N × 5
  Total concurrent requests: up to N × 6  (minus completed ones)
```

The pipeline's value: image[i+1]'s prefetch starts at step i. If it
completes before step i+1 (S ms later), image[i+1] is a cache hit → 0ms.

The pipeline's cost: images [i+2..i+4] are speculative. If the user keeps
moving, i+2's prefetch from step i competes with i+1's prefetch from step
i+1. At fast speeds, the speculative requests stack up without completing.

**The throttle question reframed:**

We're NOT asking "should we debounce?" (we already know debounce kills the
pipeline). We're asking: "should we skip the *speculative* prefetches during
rapid movement while preserving the i+1 prefetch?"

But we can't selectively throttle i+2..i+4 while keeping i+1, because we
don't know at step i whether the user will continue to step i+1. We either
fire the whole batch or nothing.

So a throttle means: "if less than T ms since last prefetch batch, skip ALL
5 prefetches this step. The `<img>` request still fires."

**When does a throttle HURT?**

A throttle hurts when it suppresses a prefetch batch that would have warmed
the landing image. This happens when:

1. User navigates at speed S where S > T (throttle doesn't fire — no effect)
2. User navigates at speed S where S < T, BUT then **stops**

In case 2, the user stops at image N. Image N's `<img>` request fires
(unthrottled). But image N+1's prefetch was suppressed by the throttle
(because step N-1 was <T ms ago). If the user then navigates to N+1,
it's a cold fetch.

However: the user **stopped**. The next step (if any) happens after
the user looks at image N for a while (≫T ms). So the prefetch from the
"stop" step DOES fire (because enough time has passed). The pipeline
resumes.

Wait — there's a subtlety. Let's trace it:

```
Timeline (T=150ms throttle):

t=0     Step 0: fire prefetch [1,2,3,4, -1] ✓  (first step, no throttle)
t=80    Step 1: skip prefetch (80ms < 150ms)
t=160   Step 2: fire prefetch [3,4,5,6, 1] ✓  (160ms > 150ms since t=0)
t=240   Step 3: skip prefetch (80ms < 150ms since t=160)
t=320   Step 4: fire prefetch [5,6,7,8, 3] ✓  (160ms > 150ms since t=160)
...
t=1600  Step 20: user stops. Landing = image 20.

Without throttle: 20 × 5 = 100 prefetch requests
With T=150ms:     10 × 5 = 50 prefetch requests (every other batch fires)
```

At 80ms/step, T=150ms fires every OTHER batch. The i+1 prefetch from step
N fires at step N, N-2, N-4... The nearest fired batch to the landing (step
20) is step 20 or step 18. If step 20's batch fires (because step 18 was
the last fire, and 160ms > 150ms), image 21 is prefetched. If step 20's
batch is suppressed, the last batch was step 18 which prefetched [19..22] —
image 20 is still covered (it was in step 18's +2 slot).

**But the landing image (20) needs to have been prefetched by some EARLIER
batch.** Let's check:

```
Step 16: fires prefetch [17,18,19,20, 15] ← image 20 is prefetched! ✓
Step 18: fires prefetch [19,20,21,22, 17] ← image 20 again ✓
```

So with T=150ms at 80ms/step, image 20 was prefetched at step 16 (t=1280)
and the user arrives at step 20 (t=1600). That's 320ms for the prefetch to
complete. With current imgproxy latency (~300-400ms for detail, ~600ms for
fullscreen), it might or might not be ready.

**The key realisation: there is no "free lunch" throttle value.**

A throttle always trades off:
- **Lower T** → more batches fire → less contention reduction → less help
- **Higher T** → fewer batches fire → more contention reduction → BUT the
  landing image's prefetch was fired earlier, so it had MORE time to
  complete through a less congested pipe

The question is whether "fewer requests, earlier fire" beats "more requests,
later fire." The answer depends on imgproxy's concurrency model:

- If imgproxy processes requests FIFO (queue): fewer requests = shorter
  queue = earlier completion for the ones that matter. Throttle helps.
- If imgproxy processes requests in parallel (thread pool): fewer requests
  = less CPU contention = each request completes faster. Throttle helps.
- If the browser limits concurrent connections (HTTP/1.1, 6 per origin):
  fewer requests = less queuing at the browser level. Throttle helps.

In all three models, a throttle helps by reducing total concurrency. The
question is only: does the "miss" scenario (landing image not covered by
a suppressed batch) ever happen?

**The miss scenario analysis:**

With T=150ms at 80ms/step, batches fire at steps 0, 2, 4, 6, ... The i+4
reach of each batch covers:
```
Step 0  → prefetches [1,2,3,4]
Step 2  → prefetches [3,4,5,6]
Step 4  → prefetches [5,6,7,8]
...
Step 2k → prefetches [2k+1, 2k+2, 2k+3, 2k+4]
```

Image N is covered by step N-4 through step N-1 (the batch where N is
in the [+1..+4] range). With every-other-batch firing, image N is
covered by step max(0, N-4) rounded to the nearest even step.

For N=20: covered by step 16 (fires) or step 18 (fires). ✓ Always covered.

**For ANY N and T, the 4-ahead reach means the landing image is covered
as long as at least one batch fires within the last 4 steps.** With
T=150ms and 80ms/step, a batch fires every 2 steps. 4/2 = 2 batches
always cover the landing image.

**What if step speed is faster? T=150ms at 30ms/step (developer with
fast key repeat):**

Batches fire at steps 0, 5, 10, 15, 20... (every 5 steps, since
5 × 30ms = 150ms). The reach is still 4 ahead. Step 15 covers images
[16,17,18,19]. Step 20 covers [21,22,23,24]. Image 20 is NOT in step
15's reach. Is image 20 covered?

Image 20 is the `<img>` of step 20. The `<img>` request fires anyway
(not throttled). But it's not PRE-fetched. At step 20, the batch either
fires or not:
- If step 20 fires: great, but the prefetch only helps FUTURE images
  (21-24). Image 20 itself relies on the `<img>` request.
- Step 15's batch reached [16,17,18,19] — image 20 NOT covered.

**So at 30ms/step with T=150ms, there's a 1-image gap.** Image 20 was
never prefetched; it relies on the `<img>` request competing with all
other in-flight requests.

Is this worse than no throttle? Without throttle, step 19 fires a batch
that includes image 20 (as i+1). So without throttle, image 20 IS
prefetched — but it was prefetched 30ms before arrival. With 50+ other
requests in flight, that 30ms prefetch almost certainly doesn't complete
in time. The `<img>` request is what actually loads it.

**So the "miss" scenario (no throttle prefetched it, throttle didn't)
only matters if the 30ms head start from the no-throttle prefetch
would have resulted in a cache hit.** At 30ms/step, 30ms head start,
cold imgproxy ~300ms+ — the 30ms is meaningless. The `<img>` request
is what loads the landing image regardless.

**Conclusion: the throttle "miss" only loses the last-step prefetch,
which has near-zero value because it fires so close to arrival that it
can't complete in time anyway.**

### Verdict: a throttle at T ≈ S_fast is "free"

The safe zone for T is:

```
T should be:
  > fastest realistic browsing speed (so it actually suppresses)
  < slowest browsing speed where the pipeline matters (so it never
    suppresses when the user is actually looking at images)
```

Our speed tiers:
  - Fast: 200ms (flicking to find a photo — pipeline valuable)
  - Rapid: 80ms (held key — only landing matters)
  - Real held-key: 30-67ms (macOS default to fast key repeat)

**T = 150ms** works:
  - At 200ms/step (fast): 200 > 150, throttle NEVER fires. Pipeline
    runs at full capacity. Zero cost.
  - At 80ms/step (rapid): fires every other batch. Halves the request
    volume. Landing still covered by 4-ahead reach.
  - At 30ms/step (extreme): fires every 5th batch. Dramatically reduces
    contention. Landing relies on `<img>` (which it would anyway — no
    prefetch completes in 30ms).

**This is NOT a "usual balancing act."** T=150ms has a clean mathematical
property: it never fires at any speed where the user is actually looking
at images (≥200ms), and it reduces contention at every speed where the
user is just scanning (≤100ms). There is no speed where it makes things
worse, because the suppressed prefetches at <150ms/step couldn't complete
in time to be useful anyway.

**One caveat for the future:** if image latency drops dramatically (e.g.
edge CDN, or AVIF at 50KB instead of WebP at 200KB), prefetches COULD
complete in 80ms. At that point T=150ms would suppress useful prefetches
at rapid speed. But if latency is that low, contention isn't a problem
and the throttle wouldn't be needed anyway. The two effects cancel out.

### Implementation

The throttle is 3 lines:

```typescript
const lastPrefetchRef = useRef(0);
// ... inside the prefetch useEffect:
const now = performance.now();
if (now - lastPrefetchRef.current < 150) return;
lastPrefetchRef.current = now;
```

No debounce, no setTimeout, no cleanup. Just a gate.





