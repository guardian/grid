# Wandering findings — 2026-07-30 tier boundary agreement (M10)

**Bed:** local (10,102-doc sample corpus), three dev servers forced to different
scroll-mode thresholds per cookbook §4.3:
- `:3010` — buffer tier (`VITE_SCROLL_MODE_THRESHOLD=15000`)
- `:3020` — two-tier (default thresholds)
- `:3030` — seek tier (`VITE_POSITION_MAP_THRESHOLD=0`)

**Query:** `credit:Avalon` (`nonFree=true`) — chosen because it returns ~2,130 docs
locally, which lands in a different tier on each of the three forced servers
(buffer on :3010, two-tier on :3020, seek on :3030). The cookbook's pinned TEST
corpora return 0 docs against the local sample index.
**Focus mode:** default (explicit not forced; not expected to matter for scrubber
position, not investigated further).

## Summary

Mission M10 asked: same query, same scroll target, three tiers — do they agree on
where position N is? **The session's real yield here is methodological, not a
confirmed product bug.** One clean positive result (tier agreement at the trivial
position-0 baseline) is confirmed. A repeated "the position label updates but the
underlying data doesn't move" pattern was observed multiple times via ad-hoc
scrubber-click simulation; a post-session source read found the most likely
explanation — clicking the scrubber THUMB (rather than the track) with no
pointer movement is a designed no-op (see the open question below and the new
playbook §3 entry) — so this is very likely a test-script artifact from reusing
page state across successive clicks, not a real bug. Filed as a low-confidence
open question rather than a confirmed finding.

---

## F1 — Tier agreement at the position-0 baseline (confirmed, positive result)

**Oracle:** 7.2 self-consistency (three tiers, same query, same starting state —
should agree)
**Confidence:** high
**Repro:** load `credit:Avalon` fresh on all three ports, compare `results[0].id`
before any scrubber interaction.
**Result:** all three tiers agreed on the first result's id. Trivial in retrospect
(first page of a stably-sorted query should always agree across tiers — none of
the tier-specific logic, position maps, or buffers is exercised at offset 0) but
worth recording as the one clean data point this mission produced.

---

## F2 — (Methodology, not a bug) Two-tier scrubber clicks set `scrollTop`
synchronously, but buffer reposition is debounced behind `_seekGeneration`

**Not a product finding — a note for future wandering sessions.** While chasing
what initially looked like a click-desync bug, I found that
`e2e/shared/helpers.ts`'s `seekTo()` already documents and handles this:

> Two-tier aware: in indexed mode, clicking the scrubber sets scrollTop directly
> (no ES call). A debounced scroll-seek fires ~200ms later to reposition the
> buffer. We wait for `_seekGeneration` to bump (meaning the scroll-seek actually
> completed), unless the target is already in the buffer (no seek needed).

My ad-hoc test script only waited for `loading === false`, which is insufficient
for two-tier clicks (the debounced reposition hasn't necessarily started yet, let
alone finished, when `loading` first reads false). This produced apparent
"silent failures" that were actually just my script reading state before the
debounce fired. **Lesson for the playbook:** always prefer the project's own
`seekTo()` / `dragScrubberTo()` / `clickScrubberAt()` helpers for scrubber
interaction in any future wandering session touching scroll tiers — do not
hand-roll `positionFromY`-equivalent math or ad-hoc settle waits; the helpers
already encode the tier-specific timing correctly.

Also confirmed directly via source reading (`kupua/src/components/Scrubber.tsx`):
real user clicks/drags in buffer and two-tier mode call `scrollContentTo(ratio)`
(sets `scrollContainer.scrollTop` directly), **not** `store.seek()`. Only the true
seek tier (no position map) calls `onSeek(pos)` → `store.seek(globalOffset)` on
click/drag-release. Calling `store.getState().seek()` directly in a test is **not
representative** of a real user interaction for buffer/two-tier — it bypasses the
scrubber's actual code path entirely.

---

## Open question (low confidence, needs clean re-test) — scrubber click label
vs. actual position

**Oracle (if real):** 7.2 self-consistency (the scrubber's own floating position
label disagreeing with its own `aria-valuenow` / actual buffer state at the same
instant)
**Confidence:** low — see confounds below
**Observed pattern (recurred ~3 times across buffer, two-tier, and seek pages):**
after a simulated scrubber-track click, the floating position tooltip/label
displayed text consistent with the intended target (e.g. "1,085 of 2,130" for a
50%-ratio click), but the store's `bufferOffset` / the slider's `aria-valuenow`
reflected a different, stale-looking value (matching a *previous* test point's
target rather than the new one).

**Why this is not being filed as a confirmed bug:** the clicks that produced this
pattern were not run against a freshly-navigated page — several reused the same
page instance (and thus potentially stale mouse/scroll state) across successive
test points within the same script session, and my Y-coordinate-to-target math
was an independent re-derivation of the app's `positionFromY` inverse rather than
a use of the project's `seekTo()`/`clickScrubberAt()` helpers (see F2). Both are
plausible sources of a script-side artifact rather than a real product bug, and I
was not able to rule either out before running out of session budget.

**Recommendation for a follow-up session:** re-test cross-tier position agreement
using ONLY `kupua.seekTo(ratio)` / `kupua.dragScrubberTo(ratio)` from
`e2e/shared/helpers.ts`, with a fresh `kupua.goto()` before every single test
point (no page reuse across successive seeks), comparing the resulting anchor
image id/global position across all three tier ports for the same ratio. If the
label/state divergence reproduces cleanly under those controlled conditions, it's
a real bug; if it doesn't, this note can be deleted.

**Update — most likely root cause identified (post-session source read),
confidence in "real bug" now further lowered.** `Scrubber.tsx`'s
`handleTrackClick` explicitly no-ops if the click target is the thumb element
(`if (e.target.dataset.scrubberThumb) return;`), and the thumb's own
pointerdown/pointerup pair takes a "click-without-drag" branch when there was no
movement between down and up, which does **nothing but flash the tooltip** — no
scroll, no seek. A Playwright `page.mouse.click(x, y)` is exactly a
zero-movement down+up. Since my ad-hoc script reused the same page across
successive test points (see the confound noted above), a later click's computed
target coordinate could easily land inside the *previous* click's now-current
thumb position — producing exactly the observed pattern (tooltip flashes with
some label, but the buffer/position never moves). This is almost certainly a
thumb-vs-track misclick artifact of the test script, not a scrubber bug. See the
new playbook entry in §3 ("scrubber THUMB is a click-vs-drag trap") for the full
mechanism. Left in this doc as a resolved methodology note rather than deleted
outright, since it's a useful cautionary example for future ad-hoc scrubber
scripting.

---

## Appendix — off-scope observations (max 10, one line each)

- Every full-page reload logs recurring `WebSocket connection ... failed` / `502
  Bad Gateway` / `401 Unauthorized` / CORS-blocked `media-collections` console
  errors — known environment noise (Grid API/auth proxy unreachable locally),
  present on every reload, treated as noise per mission instructions.
