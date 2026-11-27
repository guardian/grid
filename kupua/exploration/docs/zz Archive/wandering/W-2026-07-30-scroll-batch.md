# Wandering findings — 2026-07-30 scroll batch

**Bed:** TEST, scroll tier (958-pinned corpus, observed total 868 at session time —
`until` bound holds the query stable but the live index's row count for this
keyword can still differ slightly session to session; not investigated further,
out of scope).
**URL:** `/search?nonFree=true&query=keyword:"mid length half celebration"&until=2026-03-04T00:00:00Z`
**Focus mode:** explicit (default, `ui-prefs` cleared before each mission)

## Summary

Five missions run (M8, M1, M2, M6, M11). **One low-confidence finding.** Most of
the session's real yield was methodological: an initial "density switch loses
scroll position" observation was chased down and **refuted** — it was a test
artifact (insufficient settle wait after a synthetic `scrollTop =` jump), not a
product bug. See the playbook update for the corrected technique. This refuted
finding is not included below per §10 ("if your own later analysis refutes an
earlier finding, delete it").

---

## F1 — `getViewportAnchorId()` can return an image not present in `getVisibleImageIds()` after a panel toggle

**Oracle:** 7.2 self-consistency (two ways of asking "what's on screen right now"
disagree with each other at the same instant)
**Confidence:** low
**Bed:** TEST, scroll tier
**URL:** `/search?nonFree=true&query=keyword:"mid length half celebration"&until=2026-03-04T00:00:00Z`
**Focus mode:** explicit, no image focused (phantom anchor path)

**Repro**
1. Scroll the grid to a mid-depth position (`scrollTop = 30000`, direct
   assignment), wait ≥800ms for the position to settle.
2. Open the Browse panel (`Show Browse panel`), wait ≥800ms.
3. Open the Details panel (`Show Details panel`), wait ≥800ms.
4. Compare `window.__kupua_getViewportAnchorId__()` against
   `window.__kupua_getVisibleImageIds__()`.

**Expected (per oracle):** the anchor image id should be a member of the visible-ids
array — they are both supposed to describe "what the user is currently looking at".
**Observed:** the anchor's index in the results array (399) falls in a gap between
consecutive visible indices (`[396, 397, 398, 400, 401]`) — visible skips 399
entirely, but the anchor hook names it as the current anchor. Reproduced 3 times
across two different panel-open orderings and two scroll depths, with settle waits
up to 1000ms (ruled out as a timing artifact).

**Caveat lowering confidence:** the magnitude is small (the previously-anchored
image lands only 1 position past the edge of the new visible range after a
column-count-changing reflow), which is within the drift tolerance the existing
e2e suite already accepts for density-driven reflows (`cols*2`, or up to 10
positions — see `e2e/local/scrubber.spec.ts`, "Density switch without focus"
describe block). This may simply be the same accepted geometry-rounding relaxation
applying to panel-driven reflows, in which case the *real* bug (if any) is that the
two hooks use different visibility thresholds/rounding rather than that position
is actually lost. Filing as a question, not a confirmed regression.

**User-facing impact:** if this is more than a hook-reporting quirk, a user who
opens both side panels while scrolled deep in the grid could find the image they
were looking at just outside the visible area — mild disorientation, not data
loss. If it's purely a debug-hook discrepancy, there is no user-facing impact at
all; this is the more likely explanation given the small magnitude.

**Evidence:** store state captured via `run_playwright_code`; console clean
throughout (no errors, warnings, or rejections).
**Repro spec:** `W-2026-07-30-scroll-batch.spec.ts` — see "panel toggle anchor/visible
consistency" test. Not asserted as a hard failure (kept as a diagnostic-only test
per the low confidence) — see spec comments.

---

## Appendix — off-scope observations (max 10, one line each)

- Every full-page reload (regardless of cause) logs recurring `WebSocket
  connection ... failed` / `502 Bad Gateway` / `401 Unauthorized` console errors —
  looks like Vite HMR-over-HTTPS-proxy noise plus a Grid API auth/gateway issue
  unrelated to search/scroll; present on every reload observed this session,
  did not vary with the action taken before the reload.
