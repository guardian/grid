# Main search doesn't cancel stale in-flight requests — investigation + workplan

> **Status: IMPLEMENTED (11 August 2026).** `search()`'s `searchAfter` call now
> passes the `_rangeAbortController` signal and is genuinely network-cancelled
> when superseded. See §10 for the outcome and live verification evidence, and
> `changelog.md`'s 11 August entry for the full narrative.
> A separate, unrelated bug found mid-investigation (nested `<button>` in
> `PanelLayout.tsx`'s `AccordionSection`) has already been fixed and landed
> in the `mk-next-next-next` typeahead commit — that part is DONE and is
> **not** part of this workplan.

## 0. Read this first if you're a fresh agent

This doc is the durable record for one specific, still-open issue. `worklog-current.md`
only has a short pointer to it (worklog gets wiped per AGENTS.md's session lifecycle;
this doc doesn't). If your own analysis later contradicts something below, **update
this doc**, don't just proceed silently — the next agent needs the corrected picture,
not two conflicting ones.

If the premise turns out to be wrong on closer inspection (e.g. you can't reproduce the
timings below, or the fix turns out to already exist), **stop and say so** rather than
inventing a fix to keep momentum.

## 1. The problem, with evidence

User-reported symptom: typing a `has:"fileMetadata.xmp.photoshop:Source"`-style query
slowly, with several natural pauses (not remembering the exact field path), **with the
Filters panel open**, made the app show nothing — no thumbnails, no aggregations — for
several seconds after the user stopped typing.

Live-reproduced in the embedded browser against real TEST data (`kupua.media.local.dev-gutools.co.uk`,
~1.3M docs, seek tier):

- **A single clean pause** mid-typing (debounce fires, then resume before the response
  lands): total settle time ~1.0–1.3s after typing stops. Not great, not the reported bug.
- **A realistic 3-pause pattern** (matching the user's actual console log — pauses after
  `fileMetadata`, after `.`, after `xmp.`), Filters panel open: **`maxConcurrentMainSearch`
  hit 4** (four full search cascades — each its own PIT open/close + search +
  sort-around-focus — running at once), and the store was **still not settled after 18+
  seconds** of polling.
- The user's own console log's repeated `DELETE .../es/_pit 404 (Not Found)` lines are
  the visible fingerprint of this: two overlapping, uncancelled searches each try to
  close what they think is "the old PIT"; the second 404s because the first already
  closed it. The 404 is already caught (`es-adapter.ts`'s `closePit()`, deliberate,
  documented) — it's a symptom, not a crash.

## 2. Root cause

`search()` in `search-store.ts` (the action that runs on every query change) calls:

```
dataSource.searchAfter(params, null, null)   // <- no signal, 3 args only
```

No `AbortSignal` is passed. Every *other* caller of `searchAfter` in this file (extend,
seek, range-walk) correctly passes one via `_rangeAbortController.signal` or similar.
Protection against a stale response is client-side only: a `_searchGeneration` counter,
bumped at the top of `search()`, causes the store to silently discard a late-arriving
response if a newer search has since started. That protects *correctness* (you never
see the wrong result flash up) but does nothing for *cost*: the abandoned request keeps
running server-side and client-side, competing for the same limited browser connections
and CPU as the request you actually want. Confirmed empirically (see §1) that a stale
request always completes with `200 OK`, never gets network-aborted, when superseded this way.

Contrast: `fetchAggregations()` (the Filters-panel aggregation fetch) already does this
correctly — `_aggAbortController.abort()` is called before every new fetch, and a live
`net::ERR_ABORTED` was captured confirming real cancellation. `search()`'s gap is the
odd one out, not the norm for this codebase.

## 3. Why the fix should be mode-agnostic (verified, not assumed)

Checked both `ImageDataSource` implementations before proposing anything, specifically
because this must work identically in direct-ES and `--use-media-api` mode:

- **`ElasticsearchDataSource.searchAfter`** (`es-adapter.ts`, `_searchAfterImpl`) already
  has an `AbortError` handler: `catch (e) { if (e instanceof DOMException && e.name ===
  "AbortError") return { hits: [], total: 0, sortValues: [] }; }`. This path already
  exists and is already exercised today by the other (correctly-signalled) callers.
- **`StranglerAdapter.searchAfter`** (`strangler-adapter.ts` line ~48) takes the same
  `signal` param and forwards it straight through to `apiSearchAfter`
  (`grid-api-search-adapter.ts` line ~85), which passes it to the real
  `fetch("/api/images/search-after", { signal, ... })` (line ~131-135).

**Conclusion: both backends already understand cancellation.** The gap is one call site
in mode-agnostic store code. Fixing it there fixes both modes simultaneously by
construction — no media-api endpoint changes needed, and there is no reason to expect
divergent behaviour between modes once fixed. (Still: §6 says verify both live, don't
just trust this reasoning.)

## 4. Explicit scope decision

**In scope:** wire a signal into `search()`'s `dataSource.searchAfter(...)` call
(search-store.ts, the `Promise.all` that also opens the PIT and fires
`countWithTickers`), using the same pattern as `_rangeAbortController` elsewhere in the
same file (abort-old-then-create-new, captured into a local `const signal` before any
`await`, per the existing `INVARIANT` comments in that function about generation checks
needing to happen after every `await`).

**Out of scope, deliberately, for this pass:** `openPit()` and `countWithTickers()` in
that same `Promise.all` have **no `signal` parameter in their type signatures at all**
(checked `dal/types.ts`), in either backend. Cancelling `searchAfter` alone kills the
expensive part (the actual scored search); these two smaller calls would still complete
on every pause. Making them cancellable too is a bigger, separate change (new params on
the `ImageDataSource` interface, touching both implementations). **Do not silently
expand scope to include them** — if it turns out the PIT-open race is still a problem
after the `searchAfter` fix, come back and treat that as its own follow-up, not a
same-PR expansion.

**Explicitly not touched:** AI search branch (bypasses PIT/pagination entirely, separate
code path), scroll/extend/seek (already correct today), aggregation fetch (already
correct today).

## 5. TDD plan

1. **Write a failing test first**, store-level, mode-agnostic (that's the point — it
   should pass identically regardless of which `ImageDataSource` is injected): fire
   `search()` twice in quick succession against a fake data source whose `searchAfter`
   can be made to hang; assert the *first* call's request is actually aborted (its
   `signal.aborted` is `true`, or the fake source's call receives an abort event) when
   the second `search()` starts — not just that its result gets discarded.
2. Confirm the test fails for the right reason before touching `search-store.ts`.
3. Implement the minimal fix.
4. Run the full existing unit suite (`npm --prefix kupua test`) — PIT lifecycle,
   sort-around-focus, and generation-counter behaviour are heavily covered already; if
   any of those break, that's the signal to slow down and understand why before patching
   over it.
5. **Identify tests likely to need updating before writing the fix**, not after: grep
   the existing suite for assertions about `search()` behaviour on rapid repeated calls,
   PIT open/close ordering, or `_searchGeneration` — list them, decide per-test whether
   they need updating (behaviour changed on purpose) or are just newly-exercised
   (should still pass unmodified).

## 6. Browser verification (both modes — don't skip either)

- **Local, direct-ES** (default `./kupua/scripts/start.sh`): repeat the 3-pause repro
  from §1. Confirm `maxConcurrentMainSearch` drops to 1 (previous requests actually
  cancelled) and total settle time comes back down from 18+s to roughly the single-pause
  baseline (~1-1.3s).
- **`--use-media-api` mode** (`./kupua/scripts/start.sh --use-TEST --use-media-api`):
  same repro, same assertions. This is the part that actually answers "does it apply to
  both modes" — verify it live, don't just trust §3's reasoning.
- **Regression sanity-check** on things that already cancel correctly today and must
  stay that way: scrubber drag-seek, infinite scroll extend, image detail prev/next
  traversal, Filters-panel aggregation fetch.

## 7. Perf test — optional, after, only if useful

`e2e-perf` already exists for this. Worth running before/after **only if** the fix lands
and a concrete before/after number is wanted for the record — not required to validate
correctness (the TDD + browser verification above already does that).

## 8. What "done" looks like

- Failing test written first, confirmed failing for the right reason, now passing.
- Full unit suite green.
- Both direct-ES and `--use-media-api` live repros show cancellation actually happening
  (not just faster — genuinely fewer concurrent requests, verified via Network tab or
  the same request-tracking approach used in this investigation).
- `openPit`/`countWithTickers` scope decision (§4) still holds, or an explicit new
  decision is recorded here about why it changed.
- This doc updated with the outcome; `changelog.md` gets the narrative entry once the
  fix actually lands (this doc is pre-implementation, changelog is post-implementation).

## 9. Open question for the human before implementing

Is the `openPit`/`countWithTickers` partial-cancellation gap (§4) acceptable as a
follow-up, or does it need to be in scope from the start? Default assumption above is
"acceptable follow-up" — flag if that's wrong.

**Resolved:** yes, acceptable as a follow-up (user confirmed), with the caveat that
evidence of its impact should be gathered while doing this work rather than deferred
blind — see §10.

## 10. Outcome (11 August 2026)

Implemented as scoped in §4: `search()`'s `dataSource.searchAfter(...)` call now passes
`signal` (the existing `_rangeAbortController.signal`, reusing the abort-old-then-new
pattern already used elsewhere in this file). The catch block was hardened to swallow
both stale-generation and `AbortError` rejections silently, since the media-api path
(`apiSearchAfter`) throws a real `AbortError` on cancellation rather than the direct-ES
path's internal catch-and-return-empty-result behaviour (see §3).

**TDD:** new unit test in `search-store.test.ts` asserts the *first* call's `AbortSignal`
is actually fired (`signal.aborted === true`) when a second `search()` supersedes it —
confirmed failing before the fix (no `signal` argument at all), passing after. Full unit
suite green throughout.

**Live verification, both modes, both confirmed working:**

- **Direct-ES:** repeated the exact 3-pause repro from §1. Post-fix: store settles in
  ~1ms after typing stops (vs 18+s pre-fix), and 3 of 4 superseded `searchAfter` calls
  show a genuine `net::ERR_ABORTED` in the browser's actual network layer — not just
  client-side discard.
- **`--use-media-api` (StranglerAdapter):** same repro. A dev-server-restart-induced
  auth-session expiry (401 `authentication-failure`) blocked getting a full successful
  result, but this was orthogonal to the fix — confirmed present identically in both the
  reverted-fix and restored-fix code, so it didn't block the actual comparison. With the
  fix temporarily reverted: 4 `searchAfter` calls fired, 0 aborted (every stale request
  ran to completion — reproduces the original bug exactly). With the fix restored: same
  repro, 3 of 4 aborted, confirmed via real `net::ERR_ABORTED` events. Confirms the fix
  is genuinely mode-agnostic, as §3 predicted.

**§4 follow-up gap — measured, not just asserted:** monkey-patched `openPit` and
`countWithTickers` the same way and reran the repro. Both **completed to 100% every
time**, including calls that were clearly superseded by a later pause — unlike the now-
mostly-cancelled `searchAfter`. This is a live, reproducible demonstration that the §4
gap is real and has the same shape as the bug just fixed, not a theoretical concern.

**Update (12 August 2026) — §4 resolved differently than originally recommended.**
A follow-up spike (raw latency measurement, both local ES and over the TEST SSH tunnel)
found that `openPit`/`countWithTickers` typically complete (4–17ms local; ~130–190ms over
the tunnel) *faster* than a realistic typing pause — meaning in today's dev/TEST
environment, adding client-side `AbortSignal` cancellation to these two calls would
rarely have anything genuinely in-flight to interrupt. The "100% completion" measured
above turned out to be calls that had **already finished** before being superseded, not
calls that failed to cancel while still in flight — a materially different (and smaller)
problem than `searchAfter`'s.

**What was actually built instead:** `search()` now explicitly closes a superseded
search's own PIT (`if (_searchGeneration !== myGeneration) { if (newPitId)
dataSource.closePit(newPitId); return; }`) rather than leaving it to expire on its
`keepAlive` ("1m"). This directly targets the real, Elastic-confirmed resource cost of
PIT accumulation at scale (open PITs block segment merges and hold heap; see Elastic's
own Point-in-Time docs) without any interface changes, any orphan-PIT race (we always
have the id in hand), and works identically in both direct-ES and `--use-media-api`
modes today (confirmed: `StranglerAdapter.openPit`/`closePit` both still forward straight
to `this.es.*`, unaffected by media-api mode). Verified via unit test
(`search-store-pit.test.ts`, asserts a stale search's PIT gets closed with the correct
id) and live against real TEST data in direct-ES mode (5 `closePit` calls fired during
the 3-pause repro; one closed a PIT id that did not match the currently-stored state
`pitId` — the signature of this new code path firing, distinct from the pre-existing
"close the previous settled search's PIT" mechanism).

**New finding, relevant to the planned media-api PIT endpoints** (see
`03 Ce n'est pas une pipe dream/media-api-work/phase-3-d7-d8-d9-workplan.md`):
`strangler-adapter.ts` shows `openPit`, `closePit`, and `countWithTickers` are **not
routed through media-api at all today** — they fall straight through to `this.es.*`
(direct ES), regardless of `--use-media-api` mode.

**Revised recommendation (supersedes the original "give openPit/countWithTickers a
signal param" ask above):** adding `AbortSignal` support to `openPit`/`countWithTickers`
on the TS side is no longer considered urgent or clearly valuable — today's evidence
says it would rarely fire. But the reasoning behind that conclusion is itself
latency-dependent (measured against dev/TEST timing, not 2000-user production load with
JVM GC pauses and ES thread-pool queueing), so it's downgraded to "cheap, no-regret,
worth doing eventually" rather than dropped. Two concrete, low-cost asks for whoever
builds the media-api PIT endpoints:
1. Accept a `signal` param on the Scala/TS surface for `openPit`/`countWithTickers`
   consistent with the rest of the interface — cheap to include now, expensive to retrofit
   later, even if it goes unused for a while.
2. **More concretely required:** the D8 `DELETE /images/pit/:pitId` endpoint must handle
   being called on a PIT id that's unfamiliar, already-expired, or was never used for a
   real search — the store's new stale-PIT-close behavior means `closePit` now fires in
   more scenarios than before, including PITs that were opened and immediately
   superseded. This should be a graceful no-op/idempotent close, not an error — mirrors
   the already-accepted, already-caught `DELETE .../_pit` 404 behavior on direct-ES today.

