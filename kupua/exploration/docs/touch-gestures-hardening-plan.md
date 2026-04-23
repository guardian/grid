# Touch Gestures — Hardening Plan

> Written after fixing two mobile gesture bugs (swipe-to-dismiss URL-stale
> + pinch-zoom anchor drift) and a regression introduced while fixing the
> first one (fullscreen swipe-dismiss left image area empty).
>
> Goal: shrink the surface area of the three touch hooks
> (`useSwipeCarousel`, `useSwipeDismiss`, `usePinchZoom`) so a whole class
> of bugs becomes structurally impossible — rather than adding more
> Playwright tests that only catch failures we already know about.
>
> Status: not started. Backlog item. Pick up when next touching gesture
> code or when a third bug shows up in this area.

## Why this rather than more tests?

The three touch hooks share an architecture: imperative DOM mutation,
mutable refs, hand-written state machines, multi-branch cleanup paths
(commit / spring-back / interrupted / unmount), and coordinate math.
They've grown organically. Each has subtle invariants that aren't enforced
anywhere in code:

- "Don't fire `onDismiss` before `transitionend` fires if `onDismiss`
  side-effects can interrupt the transition" (the regression we just hit).
- "Reset every inline style on every exit path."
- "`scaleRef` is the source of truth other gestures read."
- Coordinate math correctness (the pinch-anchor bug).

Tests can verify *individual* invariants but won't catch a new
combination. Headless browsers handle the Fullscreen API and real touch
sequences poorly, so e2e coverage of these hooks is thin and flaky by
nature. The high-leverage move is to make the code less able to be wrong.

Two refactors, both small, both independently valuable.

## Refactor 1 — `animate()` helper for transient inline-style animations

### Problem

Each touch hook hand-writes the same pattern:

```ts
el.style.transition = "transform 200ms ease-out, opacity 200ms ease-out";
el.style.transform  = "...";
el.style.opacity    = "0";
el.addEventListener("transitionend", () => {
  el.style.transition = "";
  el.style.transform  = "";
  el.style.opacity    = "";
  // …more cleanup…
  callback();
}, { once: true });
```

Failure modes:

1. **`transitionend` doesn't fire** when the transition is interrupted
   (mid-animation style change, element removed from DOM, layout-forcing
   API call like `exitFullscreen()`). Cleanup never runs; inline styles
   stick; element appears broken (this was the fullscreen-empty regression).
2. **No cancellation** — gesture restarts have to manually clear pending
   listeners and styles, easy to miss.
3. **Cleanup duplication** — same style-reset blocks copy-pasted across
   commit / spring-back / fallback branches; drift over time.
4. **Order-of-operations confusion** — when to fire the user callback
   relative to transitionend, when to set styles, when to read final
   geometry.

### Proposed

A ~30-40 line helper:

```ts
interface AnimateOptions {
  to: Partial<CSSStyleDeclaration>;
  duration: number;
  easing?: string;       // default "ease-out"
  onComplete?: () => void;
  signal?: AbortSignal;  // cancel mid-flight
}

interface AnimateHandle {
  cancel(): void;        // immediate stop; does NOT call onComplete
  finish(): Promise<void>;
}

function animate(el: HTMLElement, opts: AnimateOptions): AnimateHandle;
```

Guarantees:

- `onComplete` fires **exactly once**: via `transitionend`, OR via a
  `setTimeout(duration + 50ms)` safety net, OR via an explicit `cancel()`
  (which suppresses `onComplete`), OR via `AbortSignal`. Never zero
  times, never twice.
- Inline styles applied via `to` are recorded; cleanup is automatic on
  `cancel()` and on `finish()`.
- Re-entry safe: starting a new animation on the same element auto-cancels
  the previous one.

Where it goes: `kupua/src/hooks/lib/animate.ts` (or `src/lib/animate.ts`
if reused outside hooks). Pure function — no React, no refs.

Call sites that benefit immediately:

- `useSwipeDismiss`: commit branch (3 sub-paths), spring-back branch.
  Replaces ~80 lines of cleanup with single-source-of-truth.
- `useSwipeCarousel`: commit slide, snap-back.
- `usePinchZoom`: snap-back, double-tap zoom in/out, momentum end.

Tests: pure unit tests for the helper itself (mock `transitionend`,
verify `onComplete` fires exactly once across all paths). Each call site
is then trivially correct: "did I pass the right `to` styles?" — the only
remaining question.

### Invariants this would have caught

The fullscreen-empty regression: calling `cbDismiss` mid-animation would
just be `handle.finish().then(cbDismiss)` — and `finish()` is guaranteed
to resolve via the safety setTimeout even when `transitionend` doesn't
fire. Or, equivalently: `animate(..., { onComplete: cbDismiss })` —
trivially right.

## Refactor 2 — Pure coordinate-math module for pinch/pan

### Problem

`usePinchZoom` does coordinate math inline inside touch handlers, mixed
with state mutation, gesture state machines, and DOM access:

```ts
translateX = pinchTranslateStart.x + dx1 - dx0 * (scale / pinchScaleStart);
//          ^ missing scale-factor on pinchTranslateStart
//            (the bug we just fixed — invisible from origin, drifts after pan)
```

The math is hard:

- Map screen-space points to image-space points (account for current
  translate + scale).
- Keep an image-space anchor stable under a moving screen point during
  pinch.
- Clamp translate so image edges don't reveal container edges
  (rendered-size, not natural-size, depending on object-fit).
- Convert pan velocity to momentum decay.

All of it is **pure** — given inputs, output is deterministic. But it's
embedded in handlers where it can't be tested in isolation, and where
typos like the missing scale-factor are invisible until a specific
gesture sequence triggers them.

### Proposed

A ~50-line pure module: `kupua/src/hooks/lib/pinch-math.ts`.

```ts
interface Transform { tx: number; ty: number; scale: number; }
interface Point { x: number; y: number; }
interface Rect { width: number; height: number; }

/** Convert a screen-space point to image-space (relative to image centre,
 *  pre-transform). Inverse of the CSS transform. */
function screenToImage(screenPt: Point, containerCentre: Point, t: Transform): Point;

/** Compute the translate needed so a given image-space point lands at
 *  `screenPt` under the new `scale`. */
function translateToAnchor(imagePt: Point, screenPt: Point, containerCentre: Point, scale: number): Point;

/** Clamp translate so image edges don't reveal container background.
 *  Uses RENDERED size (object-contain), not natural size. */
function clampTranslate(t: Transform, rendered: Rect, container: Rect): Point;

/** Compute the rendered (object-contain) size of an image inside a container. */
function renderedSize(natural: Rect, container: Rect): Rect;
```

Then `onTouchMove` becomes a 4-line composition:

```ts
const newScale = clamp(pinchScaleStart * dist / initialDist, MIN, MAX);
const anchor = pinchAnchorImagePt; // captured once at touchstart
const t = translateToAnchor(anchor, currentMid, centre, newScale);
const clamped = clampTranslate({ ...t, scale: newScale }, rendered, container);
applyTransform(clamped);
```

Tests (all `.test.ts`, no DOM):

```ts
test("pinch from origin keeps midpoint stable", () => { /* property test */ });
test("pinch after pan keeps midpoint stable", () => { /* the bug we fixed */ });
test("clampTranslate respects object-contain rendered size", () => { });
test("screenToImage is inverse of transform", () => { /* round-trip */ });
```

The pinch-anchor bug we just fixed would be a one-line property test:

```ts
// For any starting transform and any pinch sequence, the image point
// initially under the midpoint stays under the midpoint after rescale.
```

### Invariants this would have caught

The exact bug we hit: from origin (`pinchTranslateStart = {0,0}`), the
buggy and correct formulas agree. From any non-origin start, they diverge.
A property test with random starting transforms would fail in the first
five iterations.

## Scope guard

These two refactors together:

- **Estimated:** small. The helper is short; the math module is short.
  Each call site becomes shorter, not longer.
- **Risk:** medium. Touching three touch hooks at once on real devices
  needs manual cross-device verification (iOS Safari, Android Chrome,
  desktop touchscreen). Don't ship without that.
- **Anti-scope:** do NOT add more Playwright touch-gesture tests as part
  of this work. They're slow, flaky in headless touch emulation, and
  don't catch the class of bugs this refactor targets. Manual real-device
  testing remains the primary discovery channel for this area.

## When to do this

Triggers — any of:

- Next time a third bug surfaces in any of the three touch hooks.
- Next time a non-trivial change is requested in any of them (rather
  than make it on top of the existing structure).
- A quiet-week opportunity, with real-device test time available.

Do NOT do this speculatively. The current code works. The bugs we hit
were real but recoverable in isolation. The refactor's value is
prevention of *future* combinations, which only matters if more changes
are coming to this area.

## Out of scope (explicitly)

- A general animation framework (Framer Motion, etc.) — overkill, adds
  bundle weight, and the imperative-touch-handler model is the right
  shape for these gestures.
- Replacing the imperative pattern with React-driven state — would tank
  60fps gesture tracking. The imperative pattern is correct here; what's
  wrong is its hand-written cleanup, not the pattern itself.
- E2E tests for the touch hooks. See "Anti-scope" above.
