# New-images behaviour: Kahuna vs Kupua comparison

> Created 2026-04-09 — investigation into when new images (uploaded after
> the user's last search) silently appear in results vs require explicit
> user action.

## Background

**Kahuna** freezes the result set by setting `lastSearchFirstResultTime` on every
fresh search and passing it as `until` on every subsequent pagination/loadRange
request. New images are invisible until the user takes an action that triggers a
**new** search (which resets `lastSearchFirstResultTime`).

**Kupua** does _not_ apply an `until` cap. It uses PIT (Point In Time) on
non-local ES for snapshot isolation, but PIT expires after ~5 minutes of
inactivity. After PIT expiry, extend/seek requests hit a live index and may
include newly uploaded images.

## Action comparison table

| User action | Kahuna | Kupua (before)                                 | Kupua (after `frozenUntil`) | Notes |
|---|---|------------------------------------------------|---|---|
| **Initial page load / browser navigate** | ✅ Yes — fresh `lastSearchFirstResultTime` | ✅ Yes — fresh `search()`, new PIT              | ✅ Yes — same, new `frozenUntil` set | All three: clean start |
| **Browser refresh (F5)** | ✅ Yes — controller re-init | ✅ Yes — full page reload                       | ✅ Yes — same | All three: clean start |
| **Type a search query** | ✅ Yes — route reload | ✅ Yes — `search()` via URL sync                | ✅ Yes — same, `frozenUntil` reset | No change needed |
| **Clear search query (✕ button)** | ✅ Yes — route reload | ✅ Yes — `search()` via URL sync                | ✅ Yes — same | No change needed |
| **Click Home / Grid logo** | ✅ Yes — controller re-init | ✅ Yes — `resetToHome()` → `search()`           | ✅ Yes — same, `frozenUntil` reset | No change needed |
| **Change sort order** | ✅ Yes — route reload | ✅ Yes — `search()` via URL sync                | ✅ Yes — same | No change needed |
| **Change date filter** | ✅ Yes — route reload | ✅ Yes — `search()` via URL sync                | ✅ Yes — same | No change needed |
| **Change "free to use" filter** | ✅ Yes — route transition | ✅ Yes — `search()` via URL sync                | ✅ Yes — same | No change needed |
| **Click facet filter** | ✅ Yes — `applyFilter` reloads | ✅ Yes — `search()` via URL sync                | ✅ Yes — same | No change needed |
| **Click metadata value (click-to-search)** | ✅ Yes — navigates | ✅ Yes — `search()` via URL sync                | ✅ Yes — same | No change needed |
| **Click ticker ("N new" button)** | ✅ Yes — route reload | ✅ Yes — `search()` directly                    | ✅ Yes — same, `frozenUntil` reset | The explicit action |
| **Scroll down (extend forward)** | ❌ No — `until` cap | ⚠️ **Maybe** — PIT shields; leaks after expiry | ❌ **No — `frozenUntil` cap** | **🔧 Fixed.** Ticker stays honest |
| **Scrubber drag / seek** | N/A — no scrubber | ⚠️ **Maybe** — expired PIT → live index        | ❌ **No — `frozenUntil` cap** | **🔧 Fixed.** |
| **Scroll back up (extend backward)** | ❌ No — `until` cap | ⚠️ **Maybe** — same PIT gap                    | ❌ **No — `frozenUntil` cap** | **🔧 Fixed.** |
| **Scroll-mode fill (≤1k results)** | N/A | ⚠️ **Maybe** — same PIT gap                    | ❌ **No — `frozenUntil` cap** | **🔧 Fixed.** |
| **Return from image detail** | ✅ Yes — controller re-init | ❌ No — buffer restored                         | ❌ No — same, buffer still frozen | Kupua is faster; frozen buffer is correct |
| **Back (same search context)** | ✅ Yes — controller re-init | ❌ No — SPA restores store                      | ❌ No — same | Kupua is faster; frozen buffer is correct |
| **Back (different search context)** | ✅ Yes — controller re-init | ⚠️ **Yes** — fresh `search()`, `newCountSince` reset | ❌ **No — snapshot restores `newCountSince`** | **🔧 Fixed.** Ticker + results stay frozen to original time |
| **Forward (different search context)** | ✅ Yes — controller re-init | ⚠️ **Yes** — fresh `search()`, `newCountSince` reset | ❌ **No — snapshot restores `newCountSince`** | **🔧 Fixed.** Same mechanism as back |
| **Idle 5+ min, then scroll** | ❌ No — `until` holds | ⚠️ **Yes** — PIT expired, live index           | ❌ **No — `frozenUntil` cap** | **🔧 Fixed.** Key scenario |
| **8-hour session, never click ticker** | ❌ No — `until` holds forever | ⚠️ **Yes (intermittent)** — PIT gaps           | ❌ **No — `frozenUntil` holds forever** | **🔧 Fixed.** Motivated this investigation |
| **Facet filter agg counts** | ❌ No — `until` cap on API | ⚠️ **Yes** — agg query hit live index          | ❌ **No — `frozenUntil` cap** | **🔧 Fixed.** Counts match frozen results |
| **Expanded agg ("Show more")** | ❌ No — `until` cap on API | ⚠️ **Yes** — same live-index query             | ❌ **No — `frozenUntil` cap** | **🔧 Fixed.** Same fix as above |

**Legend:** ✅ = new images included (fresh search). ❌ = new images excluded (frozen). ⚠️ = inconsistent/leaky.

### Monotonic ratchet rule

The `frozenUntil` timestamp on history back/forward is computed as
`max(snapshot.newCountSince, currentStore.newCountSince)` — whichever is
later. This satisfies two rules that initially seem contradictory:

1. **History should not in itself load new images.** Both timestamps are
   in the past, so the boundary never advances to `now`. Images uploaded
   after the later of the two timestamps stay hidden until the user
   explicitly clicks the ticker.

2. **History should never reduce the number of results below what the user
   has already accepted.** If the user clicked the ticker on *any* entry
   (advancing `newCountSince` to T2), going back to an older entry (frozen
   at T1) still uses T2 — the images absorbed via ticker remain visible.

Example:
- H1: "cats", 1000 results, frozen at T1
- Change sort → push H2 (snapshot for H1 captures `newCountSince=T1`)
- On H2: ticker says "50 new" → click → 1050 results, frozen at T2
- Press Back → `max(T1, T2) = T2` → "cats" shows 1050 results ✅
- The ticker correctly counts from T2, not T1

Without the max rule, Back would roll `newCountSince` back to T1, hiding
the 50 images the user already saw and resurrecting the ticker — confusing.

## 🐛 Ticker-consistency bug (current Kupua)

The ticker polls every 10s: "how many docs have `uploadTime > newCountSince`?"
It displays e.g. **"5 new"** — meaning 5 images exist that the user hasn't seen.

But if the PIT has expired and the user scrolls, `extendForward`/`extendBackward`
hit the **live index**, which includes those 5 images. They silently enter the
buffer. The ticker still says "5 new" because `newCount` is only reset by
`search()`.

Result: **the ticker claims images are pending while they're already visible.**
Clicking the ticker re-runs the search, which may shuffle already-visible content
or be a confusing no-op. This is worse than "always frozen" or "always live" — it's
an inconsistent hybrid.

The `frozenUntil` fix eliminates this: extends never include post-freeze images,
so the ticker count always matches reality.

## Key observations

1. **Most actions trigger a fresh search in both apps.** The "frozen result set"
   only matters during continuous scrolling within a single search session.

2. **Kahuna's page-navigation architecture naturally resets more often.** Every
   route transition re-creates `SearchResultsCtrl`, which resets
   `lastSearchFirstResultTime`. Kupua's SPA architecture preserves state across
   more transitions (back-nav, detail-return), which is faster but means fewer
   natural refresh points.

3. **The actual risk window in Kupua is narrow.** PIT provides snapshot isolation
   for the common case (active scrolling). The gap is: user stops scrolling for
   5+ minutes, then resumes. In practice this is uncommon during active work, but
   real during meetings/lunch.

4. **`total` count drift** is the most visible symptom. When new images sneak in
   via a PIT-less extend, `result.total` changes, and the status bar's "X matches"
   counter may tick up or down without user action. The `until` cap fixes this too.

## Clearing the ticker on Home click

Currently, clicking the Grid logo calls `resetToHome()` → `search()`. The
`search()` action already resets `newCount = 0` and `newCountSince = now`
(search-store.ts line 1205). So **the ticker is already cleared on Home click.**

The document title (`(5 new) search | the Grid`) is driven by
`useDocumentTitle.ts`, which reads `newCount` from the store. When `search()`
sets `newCount = 0`, the title updates reactively — no extra work needed.

**Summary: clicking Home already clears both the ticker badge and the page
title.** This is correct and matches Kahuna's behaviour.

## Recommendation

**Implemented.** `frozenParams()` in `search-store.ts` applies
`until: newCountSince` to all extend/seek/fill/restore requests. Every
action that calls `search()` (the entire top section of the table — all
✅/✅ rows) automatically gets a fresh freeze timestamp. The extend/seek
paths (the previously-⚠️ rows) now gain the `until` cap.

Aggregation queries (`fetchAggregations`, `fetchExpandedAgg`) also use
`frozenParams()` so facet counts stay consistent with the frozen result set.
Without this, a new image could bump "Credit A: 7" to "Credit A: 8" in the
filter panel while the results grid still showed only the original 7.

