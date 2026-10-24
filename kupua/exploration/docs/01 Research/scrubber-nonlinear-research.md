# Non-Linear Scrubber Drag Mapping — Research & Analysis

> **Created:** 2026-03-27
> **Purpose:** Research and design for replacing the scrubber's linear drag
> mapping with a non-linear curve to enable fine-grained browsing at scale.
> Referenced from `search-after-plan.md` limitation #8.

## 1. Problem Recap (with numbers)

| Dataset | Total | Track height (~800px) | Linear: items/pixel |
|---------|-------|-----------------------|---------------------|
| TEST    | 1.3M  | ~800px                | **~1,625 items/px** |
| PROD    | 9M    | ~800px                | **~11,250 items/px** |

The minimum achievable pointer movement is 1px (or sub-pixel on Retina,
but `pointermove` reports integer-rounded `clientY` deltas). A single
pixel of drag movement currently maps to thousands of items. Fine-grained
browsing (e.g. "move 5 images forward") is physically impossible with
the current linear mapping.

---

## 2. Two Fundamentally Different Approaches

### Approach A: Non-linear position-to-position mapping (recommended)

Transform `positionFromDragY()` so that the Y→position curve is
non-linear, centred on the grab point. Small movements near the grab =
slow position changes. Large movements = accelerating position changes.

**Key characteristic:** The **thumb stays under the cursor** at all
times. The thumb's visual position on the track accurately reflects the
non-linear ratio, so you see it accelerate as you drag further.

### Approach B: Relative-delta accumulation (velocity-based)

Don't map Y position → result position at all. Instead, accumulate pixel
deltas and convert them to position deltas using a non-linear sensitivity
curve.

```
positionDelta = sign(pixelDelta) * f(|pixelDelta|) * scaleFactor
newPosition = clamp(currentPosition + positionDelta, 0, total-1)
```

**Key characteristic:** The **thumb decouples from the cursor**. A 100px
drag might only move the thumb 20px (if most of that was slow browsing).
Like mouse acceleration in an OS — the pointer doesn't track 1:1 with
your hand.

### Why Approach A is better here

- Thumb staying under cursor is the fundamental expectation for a
  scrollbar/slider. Approach B breaks this.
- Approach B requires moving the cursor outside the track to reach
  extremes (total-1), which is confusing.
- Approach A is what Google Photos, iOS Photos, and every real-world
  scrubber uses.
- Approach B introduces state (accumulated position) that creates resync
  issues on pointer release.

**Recommendation: Approach A** (position mapping, not velocity accumulation).

---

## 3. Prior Art Deep Dive

### Google Photos (web + mobile)

Google's 2019 engineering talk and observable behaviour reveals:
- **Semantic anchoring** — the scrubber track is divided into
  date-labeled sections. Drag within a section = slow (browsing within a
  month). Cross a section boundary = jump to the next time cluster.
- **On mobile** — a deliberate gesture initiates scrubbing (horizontal
  swipe on the scrubber area, then vertical). On desktop, it's a
  standard vertical drag.
- **The non-linearity comes from the data distribution, not a math
  curve.** Google knows the density of photos per month (server-side
  histograms) and maps the track proportionally to months, not photo
  count. A month with 10 photos occupies the same track space as a month
  with 10,000. This makes the scrubber *inherently* non-linear.
- **Kupua difference:** We don't have histogram data yet (Phase 6 item).
  We need a *pure-math* non-linear curve that works without distribution
  knowledge.

### iOS Photos

- Uses year/month/day zoom levels. Pinch on the timeline toggles between
  levels.
- Within a zoom level, scrolling is proportional to the *time-weighted*
  item count.
- Same principle as Google: distribution-aware, not a math curve.

### YouTube / video players — "drag-away-to-fine-scrub" pattern

YouTube's progress bar (as of 2024–2026) implements a **perpendicular
distance precision mode**: when the user grabs the seek handle and drags
it horizontally along the bar, the mapping is linear (1:1 with time).
But if the user **drags vertically away from the bar** (downward, away
from the video), the horizontal sensitivity *decreases* proportionally
to the vertical distance. The further down you drag, the more precise
the horizontal seeking becomes — a large horizontal movement maps to a
small time change.

**How it works:**
- Pointer stays captured (via `setPointerCapture`).
- Horizontal delta still maps to time, but the mapping is divided by a
  factor proportional to the vertical displacement from the bar:
  `effectiveDelta = horizontalDelta / (1 + verticalDistance * k)`.
- The scrub handle stays on the bar visually (it doesn't follow the
  cursor vertically) — only horizontal position matters. The cursor
  detaches from the handle vertically.
- A text label shows the precision level ("Normal", "Fine", "Very Fine"
  in some implementations) or just the timestamp changes more slowly.

**Apple/Spotify variant:** iOS media players (Music app, Spotify) show
explicit labels: dragging the scrub handle down reveals "Hi-Speed
Scrubbing", "Half Speed", "Quarter Speed", "Fine Scrubbing" text labels
at increasing vertical distances. The time scrubber moves more slowly the
further you drag down. The handle stays on the horizontal axis — only
horizontal movement seeks, vertical distance controls sensitivity.

**Applicability to kupua:**
- Kupua's scrubber is **vertical** (thumb moves up/down). The
  perpendicular axis would be **horizontal** (left/right).
- The pattern would be: drag the thumb vertically to seek, drag
  horizontally *away from the track* (leftward, into the content area) to
  reduce sensitivity.
- **Pro:** Very intuitive once discovered. Provides arbitrary precision —
  you can fine-tune to single-image granularity at any position.
- **Pro:** Works *in addition to* the non-linear curve, not instead of
  it. The two can be layered.
- **Con:** Undiscoverable. YouTube/Spotify users mostly don't know this
  feature exists. Power-user feature.
- **Con:** Adds complexity to the pointer handling (track 2D position, not
  just Y). Modest — ~10 lines of extra math.
- **Con:** Needs a visual affordance to communicate it. YouTube gets away
  with no affordance because it's a video player and precision seeking
  isn't critical. For a professional tool like Grid, we'd want at least a
  tooltip hint.

**Assessment:** The non-linear power curve (§6) should be implemented
first — it solves the primary problem (fine browsing near grab point)
without any discoverability issues. The perpendicular-distance pattern
could be layered on later as a power-user feature if the curve alone
isn't sufficient. It's worth knowing about but not worth building in the
first pass.

### Slack (message scrubber)

- Channel scrubber uses date-based jumping. No continuous drag — clicking
  dates jumps to them.
- Not directly applicable.

### AG Grid (enterprise virtual grid)

- Server-side row model scrollbar is linear. They cap at ~500k rows
  before recommending pagination.
- No non-linear drag mapping.

### Map applications (Google Maps, Apple Maps)

- Pinch-to-zoom is non-linear — slow near centre, accelerating at
  extremes. **Conceptually similar** to what we need. The math is usually
  exponential: `zoom = baseZoom * 2^(delta / sensitivity)`.

---

## 4. Mathematical Curves — Analysis

### 4a. Power curve: `sign(δ) * |δ|^k`

```
grabRatio = currentPosition / total   (captured on pointerDown)
linearRatio = (adjustedY - rect.top) / maxTop
delta = linearRatio - grabRatio        (range: roughly -1 to +1)
mappedDelta = sign(delta) * |delta|^k  (k > 1)
finalRatio = clamp(grabRatio + mappedDelta, 0, 1)
```

**Properties:**
- `k=1` → linear (no change)
- `k=2` → quadratic. At δ=0.01 (1% of track), mapped = 0.0001 (100×
  slower). At δ=0.5, mapped = 0.25 (4× slower). At δ=1.0, mapped = 1.0
  (same speed).
- `k=3` → cubic. At δ=0.01, mapped = 0.000001 (10,000× slower). **Too
  aggressive for small values.**

**Problem — boundary reach:** If `grabRatio = 0.5` (grabbed in the
middle), maximum δ is ±0.5. `|0.5|^3 = 0.125`. So the maximum reachable
ratio is `0.5 + 0.125 = 0.625` or `0.5 - 0.125 = 0.375`. **You can
never reach position 0 or total-1.** ❌

**Fix — normalise by available range:**
```
deltaUp = grabRatio            (max possible upward delta)
deltaDown = 1 - grabRatio      (max possible downward delta)
normDelta = delta < 0 ? delta / deltaUp : delta / deltaDown
mappedNorm = sign(normDelta) * |normDelta|^k
finalRatio = clamp(grabRatio + mappedNorm * (delta < 0 ? deltaUp : deltaDown), 0, 1)
```

Now at maximum drag (δ = -grabRatio or δ = 1-grabRatio), normDelta = ±1,
`|1|^k = 1`, so the full range is reached. ✅

**Tuning:** `k=2` seems right. `k=3` is too aggressive (near-zero
sensitivity in the middle). `k=1.5` might be too mild.

### 4b. Sinh curve: `sinh(δ * scale) / sinh(scale)`

```
mappedDelta = sinh(delta * scale) / sinh(scale)
```

**Properties:**
- `scale=1` → nearly linear
- `scale=3` → strong S-shape. Near centre: `sinh(0.01 * 3) / sinh(3) ≈
  0.003` (333× slower). Extremes: reaches ±1.
- `scale=5` → very aggressive near centre

**Advantage over power curve:** `sinh` naturally spans the full -1 to +1
range because `sinh(-scale)/sinh(scale) = -1` and
`sinh(scale)/sinh(scale) = 1`. **No normalisation needed.**

**But** — this assumes δ ranges from -1 to +1. In reality, δ ranges
from `-grabRatio` to `(1 - grabRatio)`. Same boundary problem — same
normalisation fix. ❌→✅

### 4c. Cubic Bezier (CSS-style easing)

- Requires iterative root-finding to evaluate `B^{-1}(t)`
- ~10 Newton-Raphson iterations per `pointermove` — fast but unnecessary
- No advantage over power/sinh curves

**Not recommended.**

### 4d. Exponential: `sign(δ) * (exp(|δ| * scale) - 1) / (exp(scale) - 1)`

Similar to sinh but one-sided. Same normalisation issue. Slightly
different curvature. No clear advantage.

---

## 5. Gotchas & Edge Cases

### 5a. Thumb position ↔ position consistency (THE critical gotcha)

During drag, `applyThumbPosition(pos, ...)` converts position → Y to set
the thumb's CSS `top`. This uses `thumbTopFromPosition()`, which is
**linear**. If `positionFromDragY()` is non-linear, then:

- User drags thumb to pixel Y
- `positionFromDragY(Y)` → position P (non-linear)
- `applyThumbPosition(P)` → `thumbTopFromPosition(P)` → pixel Y' (linear)
- If Y ≠ Y', **the thumb jumps** to Y' instead of staying at Y ❗

**Fix:** During drag, set `thumb.style.top` directly from the raw
pointer Y (not from the reverse-mapped position). The thumb stays under
the finger. The tooltip position follows the thumb (= pointer). The
tooltip *text* shows the non-linear mapped position.
`applyThumbPosition` continues to be used for track clicks and keyboard
— those are linear and have no mismatch.

### 5b. Edge grab — grabRatio near 0 or 1

When `grabRatio ≈ 0`, the normalisation `delta / deltaUp` divides by
near-zero. Need a floor: `deltaUp = max(grabRatio, epsilon)`. Similarly
for `grabRatio ≈ 1`.

### 5c. allDataInBuffer mode (scroll, not seek)

At ≤1000 items in buffer, 800px track gives ~1.25 items/pixel. **Already
fine.** Non-linearity should only apply in seek mode (`total > bufferLength`).

### 5d. The "return to grab" feel

Power and sinh curves are symmetric and pass through zero. Dragging back
to the grab point returns to the original position. ✅

### 5e. Performance

All candidate math (`Math.pow`, `Math.sign`, `Math.abs`) is pure
arithmetic, O(1), no allocations. ~5ns per call. No concern at 60fps. ✅

---

## 6. Recommendation

### Chosen approach: Normalised power curve with k=2 (quadratic)

```typescript
/** Non-linear drag sensitivity exponent. Higher = slower near grab point.
 *  k=1: linear (no effect). k=2: quadratic (sweet spot).
 *  k=3: too aggressive. */
const DRAG_CURVE_EXPONENT = 2;

function nonLinearDragRatio(
  linearRatio: number,
  grabRatio: number,
  k: number,
): number {
  const delta = linearRatio - grabRatio;
  const range = delta < 0
    ? Math.max(grabRatio, 1e-9)
    : Math.max(1 - grabRatio, 1e-9);
  const norm = delta / range;  // -1..+1
  const mapped = Math.sign(norm) * Math.pow(Math.abs(norm), k);
  return Math.max(0, Math.min(1, grabRatio + mapped * range));
}
```

**Why quadratic over sinh:**
- Simpler to reason about and tune (one parameter: k)
- Closed-form inverse exists: `sign(x) * |x|^(1/k)` — needed if we ever
  want position → Y
- `Math.pow` is marginally faster than `Math.sinh` (irrelevant, both fine)
- sinh's `scale` parameter is less intuitive to tune

**Why k=2:**
- At the grab point, derivative is zero → near-zero sensitivity for the
  first few pixels of movement. Exactly the "slow browsing" feel.
- At half-range (norm=0.5): `0.5^2 = 0.25` → 4× slower than linear.
- At full range (norm=1.0): `1.0^2 = 1.0` → reaches the boundary.
- On TEST (1.3M, 800px track), moving 1px from grab ≈ 4 items. Target
  was 1–5 items/pixel. ✅

### Thumb rendering during drag

During drag, replace `applyThumbPosition(pos, ...)` with direct DOM
writes that use the raw pointer Y for thumb position and the non-linear
mapped position for tooltip text. This avoids the Y→pos→Y round-trip
inconsistency (gotcha 5a).

### What NOT to do

- **Don't use distribution/histogram data.** Phase 6 feature.
- **Don't apply non-linearity to track clicks.** Click = "go here" — linear.
- **Don't apply non-linearity to scroll mode** (allDataInBuffer).
- **Don't use k > 2.5.** Dead zone too large.
- **Don't accumulate deltas (Approach B).** Cursor-under-thumb is
  essential for a scrollbar.

### Possible future enhancement: perpendicular-distance fine-scrub

The YouTube/Spotify "drag away from the bar" pattern (§3) could be
layered on top of the power curve as a power-user feature. Dragging
horizontally away from the track would reduce vertical sensitivity
further, providing arbitrary precision. Low priority — the power curve
should solve the primary problem. Revisit if user testing reveals that
k=2 still isn't fine-grained enough at extreme scales (9M+).

---

## 7. Testing Checklist

1. **Grab near middle, drag slowly** — should move ~1-5 items per pixel
2. **Grab near middle, drag to top/bottom** — should reach position 0 /
   total-1
3. **Grab near top (grabRatio ≈ 0)** — shouldn't crash (epsilon guard).
   Downward should reach total-1.
4. **Grab near bottom (grabRatio ≈ 1)** — mirror of above
5. **Drag away then back to grab point** — should return to exactly the
   grab position (no drift)
6. **Track click** — still linear, unaffected
7. **Wheel/trackpad scroll** — unaffected
8. **Arrow keys** — fixed step, unaffected
9. **allDataInBuffer mode** — linear, unaffected
10. **Tooltip text** — updates live with non-linear position

