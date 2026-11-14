# Chromium Scroll-Latch Issue

> 28 May 2026. Cross-engine code-citation-backed write-up of the latch bug
> that motivated commit `a4fa028e6` (reverted) and `8d021c4d2` (this amend
> series). Supersedes all earlier framings in this doc.

## TL;DR

Three engines, three behaviours, one bug:

| Engine | Latch model | Result for diagonal gesture over `overflow-y: auto; overflow-x: hidden` |
|---|---|---|
| **Blink** (Chromium) | Pick first axis-eligible ancestor at gesture begin via `CanConsumeDelta`; commit for whole gesture | Grid fails (zero x-range); walk reaches viewport; viewport special-case latch; vertical delta routes to viewport which has nothing to scroll. **Bug.** |
| **WebKit** (Safari) | Defer latching until accumulated delta finds an axis-eligible target; re-evaluate per continuation event | Grid keeps failing eligibility for the x lean; never latches; when delta tips to vertical, latches grid; correct. |
| **Gecko** (Firefox) | `WheelTransaction`: pick per-axis targets at transaction start, then commit | x target = root (or none), y target = grid; vertical scrolls grid; correct. |

All three are single-element latches. None do "per-axis latching after the
gesture starts" — that prior framing in this doc was wrong. What differs is
**when and how often the latch decision is made**.

## How the bug actually fires in Chromium

Reproducible on a plain MacBook trackpad. Open a tab where browser swipe-nav
is **not** available in one horizontal direction (e.g. forward on a fresh
tab). Hover over a vertical scroll container. Two-finger scroll diagonally
toward the unavailable nav direction. Vertical scroll dies.

Mechanism, with code citations from current Chromium `main`:

1. **Wheel begin**: `FindNodeToLatch` in
   [cc/input/input_handler.cc:2328](https://source.chromium.org/chromium/chromium/src/+/main:cc/input/input_handler.cc;l=2328)
   walks ancestors from the hit-tested element looking for the first node
   where `CanConsumeDelta` returns true.
2. **`CanConsumeDelta`** at
   [cc/input/input_handler.cc:2426](https://source.chromium.org/chromium/chromium/src/+/main:cc/input/input_handler.cc;l=2426)
   uses `delta_x_hint` and `delta_y_hint` at gesture begin, then
   `ComputeScrollDelta` at
   [cc/input/input_handler.cc:1983](https://source.chromium.org/chromium/chromium/src/+/main:cc/input/input_handler.cc;l=1983)
   applies `UserScrollableDelta` (per-axis user-scrollable filter) AND
   clamps to scroll range. A container with `overflow-x: hidden` and an
   element at its scroll origin has zero horizontal range → consumable
   delta is zero → returns false.
3. **Walk continues** up the chain. None of the intermediate ancestors
   are scrollable in our layout. The walk reaches the viewport.
4. **Viewport special case** at
   [cc/input/input_handler.cc:2334](https://source.chromium.org/chromium/chromium/src/+/main:cc/input/input_handler.cc;l=2334):
   when the walk reaches a viewport node, it stops and returns the
   viewport's scroll node *without* checking `CanConsumeDelta` again.
   The viewport is latched.
5. **Subsequent `ScrollUpdate`** at
   [cc/input/input_handler.cc:341](https://source.chromium.org/chromium/chromium/src/+/main:cc/input/input_handler.cc;l=341)
   uses `CurrentlyScrollingNode()` directly and routes via
   `ScrollLatchedScroller` at
   [cc/input/input_handler.cc:2524](https://source.chromium.org/chromium/chromium/src/+/main:cc/input/input_handler.cc;l=2524).
   **`FindNodeToLatch` is not re-run.** All subsequent deltas in the
   gesture (including the vertical ones the user actually wants delivered
   to the grid) go to the latched viewport.
6. **Viewport has nothing to scroll vertically** (everything is inside the
   grid). Vertical delta silently consumed. Grid frozen until the user
   pauses and starts a new gesture.

## Why the macOS-with-forward-nav-available case looks fine

When forward-swipe IS available, macOS consumes the horizontal component in
the NSEvent / pull-to-refresh layer before it reaches cc. cc then sees a
vertical-only delta on `ScrollBegin`. `FindNodeToLatch` walks from the grid,
`CanConsumeDelta` for y is true (grid can scroll vertically), grid latches,
vertical delivers correctly.

This is why the bug only surfaces in the "no horizontal consumer" direction.

## How WebKit avoids it

[Source/WebCore/page/scrolling/ScrollLatchingController.cpp](https://github.com/WebKit/WebKit/blob/main/Source/WebCore/page/scrolling/ScrollLatchingController.cpp):

- `shouldLatchToScrollableArea` uses `deltaIsPredominantlyVertical` to gate
  latch eligibility. A horizontal-leaning gesture refuses to latch an
  element with no horizontal scrollbar.
- On gesture continuation: if not yet latched, re-evaluate against
  *cumulative* delta. The moment the cumulative delta tips into an axis the
  candidate element CAN scroll, latch.

Result: in the same scenario, the grid is never latched on the horizontal
lean; once the user's vertical motion accumulates enough, the grid latches
and scrolls.

## How Gecko avoids it

`WheelTransaction` ([dom/events/WheelHandlingHelper.cpp](https://github.com/mozilla/gecko-dev/blob/master/dom/events/WheelHandlingHelper.cpp)
+ flags `PREFER_ACTUAL_SCROLLABLE_TARGET_ALONG_X_AXIS` /
`_Y_AXIS` in `EventStateManager.cpp`): at transaction start, Gecko can
resolve different scroll targets per axis. The y target is the grid; the x
target may be the root or nothing. Once committed, axis doesn't matter, but
the per-axis split at start means the y target was correct from the first
event.

## Why our `overflow-x-[clip]` mitigation didn't help

`SingleAxisScrollContainers` is a Blink runtime feature that's **off by
default** in shipping Chromium. With it off, mixed-axis `overflow-x: clip`
is rewritten to `hidden` before populating cc scroll-node flags. See
[style_resolver_test.cc:727](https://source.chromium.org/chromium/chromium/src/+/main:third_party/blink/renderer/core/css/resolver/style_resolver_test.cc;l=727)
— the test explicitly asserts `clip → EOverflow::kHidden` in the
feature-off case.

Even if the feature were on, both `hidden` and `clip` produce zero
horizontal scroll *range*. `ComputeScrollDelta` clamps to range before
returning, so `CanConsumeDelta` for x returns false in both cases. Walk
escapes either way.

The `overflow-x-[clip]` swap in `8d021c4d2` was reverted to `overflow-x-hidden`
in the second amend of this commit (no behaviour change, removes misleading
CSS).

The 6ab3d72f2 ImageDetail success that motivated the swap remains
unexplained by this model — either ImageDetail had a structurally different
chain, or the apparent fix was due to a concurrent change. Not pursued here.

## What our `a4fa028e6` (original push) actually did

It set `overscroll-behavior: contain` (both axes) on the grid. Per
[cc/input/input_handler.cc:2360](https://source.chromium.org/chromium/chromium/src/+/main:cc/input/input_handler.cc;l=2360)
behaviour and per the W3C spec, non-`auto` `overscroll-behavior` cuts
scroll-chaining at the element — it forces the latch to bind to that node
even when `CanConsumeDelta` would otherwise have failed it. So the grid
caught the gesture before the walk reached the viewport, and vertical
events landed on it.

But this comes for a heavy price: `overscroll-behavior: contain` also
disables horizontal swipe history navigation. Documented MDN behaviour.
That's the regression that motivated the amend.

## Mitigation options (none implemented)

None of these are landed; this is a thinking-out-loud section. The bug
fundamentally needs the latch to bind to the grid instead of escaping to
the viewport. Options:

1. **Give the grid a 1px horizontal scroll range** so `CanConsumeDelta` for
   x returns true and the latch binds. Visibly twitches by 1px on every
   horizontal-leaning gesture (i.e. on every gesture that currently
   triggers the bug). Ugly. Not doing it.
2. **`overscroll-behavior-x: contain`** (axis-specific). Tested
   empirically 28 May 2026. Fixes the latch but breaks horizontal swipe
   history navigation over the grid — history nav still works over app
   chrome but not when the cursor is over the grid. Same trade-off as
   full `contain`, just scoped narrower. Rejected.
3. **JS wheel interception** — listen for wheel on the grid, if
   `deltaY != 0` apply to grid's `scrollTop` ourselves and `preventDefault`
   so cc never gets the event and `FindNodeToLatch` never runs. This is
   how **VS Code** (Microsoft, since Feb 2020, default on) ships their
   custom scroll handling: their `scrollPredominantAxis` option in
   [`scrollableElement.ts`](https://github.com/microsoft/vscode/blob/main/src/vs/base/browser/ui/scrollbar/scrollableElement.ts)
   zeroes the smaller-magnitude axis per wheel event then `preventDefault`s
   ([PR #70047](https://github.com/microsoft/vscode/pull/70047)). They
   framed it as matching macOS NSScrollView's "predominant axis"
   behaviour; the cross-axis latch is killed as a side effect. Six years
   in production. See **"JS wheel interception — implementation"** section
   below for full code and trade-off analysis.
4. **Live with the bug** until upstream fixes 40717572. Workaround: pause
   the gesture and start a new one. Visible in our docs/help, not in
   product.

## Industry workarounds (third-pass research, 28 May 2026)

After understanding the mechanism, a targeted search for production
workarounds turned up exactly one: VS Code's `scrollPredominantAxis`
(above). Notable absences:

- **Virtualizer libraries** (TanStack Virtual, react-window,
  react-virtualized, react-virtuoso, virtua) — none ship a workaround.
  All use native DOM scroll. All would exhibit the bug in a nested
  layout on Chrome/Electron.
- **GitHub Desktop, Slack, Discord, Element Web, Figma, Linear** — no
  shipping workaround found in any of them. The symptom is real and
  reproducible in all of them; they just live with it.
- **Chromium gerrit** — no CLs touching `FindNodeToLatch` /
  `ScrollLatchedScroller` / `CanConsumeDelta` since 2020 (search:
  https://chromium-review.googlesource.com/q/file:cc/input/input_handler.cc+ScrollLatchedScroller).
  `blink-dev` / `input-dev` / `paint-dev` mailing list archives:
  zero hits for these function names.

So: VS Code solved this for themselves six years ago. Everyone else
either doesn't know, doesn't care, or accepts the trade-off. Chromium
core has not touched the codepath in five years despite the bug being
open and now (Apr 2026) on the broad "Rendering Core 2026 Fixit"
hotlist. There is no fix coming soon; the only practical fix is the
VS Code-style JS interception.

## Upstream tracker

[Issue 40717572](https://issues.chromium.org/issues/40717572) — open, P2,
hotlist `Rendering Core 2026 Fixit`. Diagnosed by flackr in 2020 for the
iframe pull-to-refresh surface. No design doc, no patch, no owner, no
activity since 2023.

Lineage:
- [Issue 41198470](https://issues.chromium.org/issues/41198470) — fixed
  Jan 2016 (M47). Introduced single-element latching to match Safari.
  Imported the single-element model but not WebKit's deferred re-evaluation
  or Gecko's per-axis-at-start resolution.
- [Issue 41007025](https://issues.chromium.org/issues/41007025) — confirms
  Apple Magic / Mighty Mouse are classified as precise-delta touchpad-class
  devices, so they trigger this bug more viscerally than tick-wheel mice.

## JS wheel interception — implementation

### Arguments for

- **Only known viable fix** that preserves browser history-swipe navigation.
  Every CSS-only approach either has no effect (`clip`) or kills history nav
  (`overscroll-behavior: contain` / `overscroll-behavior-x: contain`).
- **Six-year production track record** in VS Code (default on since Feb
  2020, never backed out). If it caused serious issues, Microsoft would
  have heard.
- **Narrowly scoped.** Only fires for `wheel` events on the grid scroll
  container. Does not intercept: programmatic scroll (`scrollTo`,
  `scrollTop = X`, `scrollIntoView`), keyboard scroll (Arrow/PageDown/Home
  — fires `keydown`, not `wheel`), scrollbar drag (fires `scroll`, not
  `wheel`), touch scroll (`touchmove`), or any scroll on other elements.
- **No upstream fix coming.** Issue 40717572 has no owner, no proposal, no
  CL activity on the relevant codepath since 2020. The "Rendering Core 2026
  Fixit" hotlist is a broad sweep, not a commitment.

### Arguments against

- **Moves grid scroll from compositor thread to main thread.** Native
  scroll runs on the compositor (a separate thread that can't be blocked by
  JS). Our hand-rolled scroll runs on the main thread. If the main thread
  is busy (e.g. during search-response processing when the virtualizer is
  recalculating), wheel events queue behind other work and scroll judders.
  Testable: scroll during an active search landing.
- **Magic Mouse edge case.** Magic Mouse can produce `|deltaX| > |deltaY|`
  on gestures that feel vertical. With `scrollPredominantAxis` logic, those
  frames are treated as "pure horizontal" and vertical delta is dropped.
  Net effect: scroll occasionally feels "draggy" on Magic Mouse long
  vertical motions. VS Code closed this wontfix
  ([#99237](https://github.com/microsoft/vscode/issues/99237)). For us,
  Magic Mouse users are the most affected by the bug today, so fixing 95%
  of their problem and leaving 5% cosmetic drag is a net win.
- **Dead code if Chromium fixes upstream.** If 40717572 is ever fixed, the
  workaround becomes unnecessary. Not harmful, just dead weight. Easy to
  remove: `git log --grep "scroll-latch"` finds it.

### Implementation

For kupua's grid: a `useEffect` hook on the grid scroll container. The grid
is vertical-only, so logic is simpler than VS Code's two-axis version.

```ts
/**
 * Chromium cross-axis scroll-latch workaround.
 *
 * Chromium's FindNodeToLatch (cc/input/input_handler.cc:2328) picks a
 * single latch target at gesture begin using the combined (x+y) delta
 * hint. If the leading axis is horizontal and the element under the
 * cursor has zero horizontal scroll range (overflow-x: hidden), the
 * walk escapes to the viewport and all subsequent vertical delta in
 * the same gesture is lost.
 *
 * Fix: intercept wheel events on the grid container. If the event is
 * predominantly vertical, apply deltaY to scrollTop ourselves and
 * preventDefault so the compositor never runs FindNodeToLatch for it.
 * Pure-horizontal events pass through so browser history-swipe nav
 * still works.
 *
 * Precedent: VS Code scrollPredominantAxis (default on since Feb 2020).
 * https://github.com/microsoft/vscode/pull/70047
 *
 * See: exploration/docs/zz Archive/chromium-scroll-latch-issue/
 */
useEffect(() => {
  const el = parentRef.current;
  if (!el) return;

  const onWheel = (e: WheelEvent) => {
    // Let pinch-zoom through (ctrl+wheel = pinch on trackpad).
    if (e.ctrlKey) return;

    // Predominantly vertical: intercept.
    if (Math.abs(e.deltaY) >= Math.abs(e.deltaX)) {
      el.scrollTop += e.deltaY;
      e.preventDefault();
    }
    // Predominantly horizontal: let through for history-swipe nav.
  };

  el.addEventListener('wheel', onWheel, { passive: false });
  return () => el.removeEventListener('wheel', onWheel);
}, []);
```

### What this does NOT affect

| Input | Event type | Intercepted? |
|---|---|---|
| Trackpad / Magic Mouse / scroll wheel | `wheel` | **Yes** (only on grid, only predominantly-vertical) |
| `scrollTo()`, `scrollTop = X`, `scrollIntoView()` | none (direct DOM) | No |
| Arrow / PageDown / Home / End / Space | `keydown` | No |
| Scrollbar drag / click | `scroll` | No |
| Touch swipe | `touchmove` | No |
| Browser history swipe (horizontal-dominant) | `wheel` | No (passes through) |
| Pinch zoom (ctrl+wheel) | `wheel` | No (early return) |

## Artefacts in this folder

- `repros/scroll-latch-repro.html` — standalone HTML with live per-wheel
  diagnostics, toggleable `overflow-x` variants. Reproduces the latch on
  any pointing device.
- `repros/40717572-comment-draft.md` — draft comment for the upstream
  tracker, evidence-only. Not yet posted.
