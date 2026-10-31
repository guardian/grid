# Draft comment for Chromium issue 40717572

> Not yet posted. Following is an agent-assisted narrative; review before
> submitting. https://issues.chromium.org/issues/40717572

---

The mechanism flackr@ diagnosed in comment 12 also fires on desktop, with
no iframe and no pull-to-refresh. Same codepath, different input origin.
Worth flagging because the issue title scopes this to Android.

**Repro (macOS Chrome, current main).** Two nested vertical scrollers.
Inner: `overflow-y: auto; overflow-x: hidden`, content fits horizontally.
Cursor over inner. Open a tab where browser swipe-nav is unavailable in
one horizontal direction (e.g. forward on a fresh tab). Two-finger
trackpad scroll diagonally toward that direction. Vertical delivery to
the inner scroller is suppressed for the rest of the gesture. Safari and
Firefox deliver vertical to the inner scroller in the same setup.

**Codepath (current main, `cc/input/input_handler.cc`).**
`FindNodeToLatch` ([L2328](https://source.chromium.org/chromium/chromium/src/+/main:cc/input/input_handler.cc;l=2328))
walks ancestors at `ScrollBegin` for the first `CanConsumeDelta`
([L2426](https://source.chromium.org/chromium/chromium/src/+/main:cc/input/input_handler.cc;l=2426))
true. Inner scroller fails the leading-axis check via the scroll-range
clamp in `ComputeScrollDelta`
([L1983](https://source.chromium.org/chromium/chromium/src/+/main:cc/input/input_handler.cc;l=1983)).
Walk reaches the viewport; the viewport special case
([L2334](https://source.chromium.org/chromium/chromium/src/+/main:cc/input/input_handler.cc;l=2334))
latches it unconditionally. Subsequent `ScrollUpdate`
([L341](https://source.chromium.org/chromium/chromium/src/+/main:cc/input/input_handler.cc;l=341))
routes via `ScrollLatchedScroller`
([L2524](https://source.chromium.org/chromium/chromium/src/+/main:cc/input/input_handler.cc;l=2524))
without re-running `FindNodeToLatch`, so vertical delta goes to the
viewport for the rest of the gesture.

**Asymmetry around browser swipe-nav:** when nav is available, macOS
consumes the horizontal NSEvent component before cc sees it; `ScrollBegin`
gets a vertical-only delta; the latch binds correctly. When nav is
unavailable, the horizontal component reaches cc and drives the walk
past the inner scroller.

**Self-contained repro with per-event diagnostics:** [attach
`scroll-latch-repro.html`].

(Aside: VS Code's `scrollPredominantAxis` option in
[`scrollableElement.ts`](https://github.com/microsoft/vscode/blob/main/src/vs/base/browser/ui/scrollbar/scrollableElement.ts)
zeroes the smaller-magnitude wheel axis and `preventDefault`s, which
keeps cc from running `FindNodeToLatch` for that event; default since
2020.)
