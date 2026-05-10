# Implementation handoff: tier collapse (now)

**Status:** transient — delete after work lands.
**Mode:** implementation. Sonnet Medium is sufficient.
**Date:** 9 May 2026.

## Context (read this — do not re-debate)

Tier 1 was already restructured to use `enrichByIds` (worklog: "Tier 1 restructure"). Both lanes now share one mechanism. The remaining structural difference is purely scheduling: viewport at 300ms, full buffer at 3000ms, no other distinction.

Earlier we kept two lanes because of a hypothetical HTTP/1.1 connection-starvation argument (TEST `/api` is on h1.1, browsers cap at 6 conns/origin, 5 enrichment chunks could compete with detail-panel/satellite-proxy traffic). On reflection, that argument doesn't hold up for kupua specifically:

- Kupua's only `/api` traffic is enrichment + detail-panel + satellite proxies. ES baseline goes through a different tunnel; thumbnails go to S3/CloudFront. The "competing traffic" is sparse — detail panel only fires on user click.
- Worst-case under collapse + HTTP/1.1: a detail-panel fetch initiated mid-fast-scroll waits ~0.8s behind queued enrichment chunks. Annoying, not broken. The current Restructure architecture has the same degradation when Tier 1 happens to be in flight.
- The structural cost of two lanes (extra hook, extra debounce constant, extra cache key, dual mental model) is paid every time someone reads the code. The runtime benefit is paid never (in measurable terms).

**Verdict: collapse to single lane at 300ms, regardless of HTTP/2 status.** When HTTP/2 lands later, no additional kupua change required.

## Pre-flight (informational, not blocking)

Quick devtools sanity check before phase 1 — **do not halt on results, just record them in worklog**:

1. Open TEST in browser, devtools → Network tab.
2. Open the detail panel on an image. Note the `Origin` / domain on:
   - `/api/images/<id>` (image detail)
   - `/grid-leases/...` (satellite proxy)
   - `/grid-usage/...` (satellite proxy)
3. Note whether they share an origin with `/api/images?ids=...`.

Most likely outcome: satellite proxies are on the same browser origin (Vite dev proxy paths under one `localhost:3000`) but go to different upstream services. They share the HTTP/1.1 6-connection budget at the browser/dev-proxy edge but not at the upstream-service edge. This is the worst case and it's still fine — see "Context".

Record findings in `worklog-current.md`. Proceed regardless.

## Phases

### Phase 1 — Collapse Tier 1 into Tier 2

**File:** `kupua/src/hooks/useEnrichment.ts`.

**Delete:**
- `useViewportEnrichment` function (entire export).
- `VIEWPORT_ENRICHMENT_DEBOUNCE_MS`, `VIEWPORT_MARGIN` constants.
- The `useVisibleRange` import if no longer used elsewhere in the file.
- Any remaining JSDoc framing of "Tier 1 / Tier 2" / "two-lane".

**Modify `useEnrichment`:**
- Change `ENRICHMENT_DEBOUNCE_MS` from 3000 to **300**.
- Replace the JSDoc block at top of file. New framing: single-lane enrichment via `?ids=`. Mention HTTP/1.1 / HTTP/2 considerations briefly (the connection-budget concern was evaluated and rejected for kupua's traffic profile — link to this doc and the worklog entry).
- The existing logic (extract IDs from buffer, call `enrichByIds`, merge into store) stays in shape — but with two small additions below.

### Phase 1b — Visible-first prioritisation (small, important)

User-visible items must light up before off-screen buffer items. Under HTTP/1.1 + 5-chunk fan-out, this matters: ~0.8s for chunk 0 vs ~2s for chunk 4. We can keep the user-visible parts ahead of the rest with two cheap changes:

1. **Sort IDs visible-first before chunking.**
   - In `useEnrichment` (where IDs are extracted from `useSearchStore.getState().results`), use `useVisibleRange()` to identify which IDs are in the current viewport (+/- a small margin, e.g. 6).
   - Build `idsToFetch` as `[...visibleIds, ...offscreenIds]`. Order matters — chunking is left-to-right.
   - Browser's `fetch()` queue is roughly FIFO under HTTP/1.1, so the first chunk goes out first and returns first.

2. **Merge per-chunk-as-resolved, not after `Promise.all`.**
   - Today `enrichByIds` returns one merged array (Promise.all → flat). To get incremental UI updates, change the contract.
   - Two acceptable implementations — pick one, don't bikeshed:
     - **Option A (preferred):** add an optional `onChunk?: (hits: SearchHitImageData[]) => void` callback. Inside `enrichByIds`, fire the per-chunk fetches and call `onChunk` as each resolves. Keep the final `Promise<merged | null>` return for backward compat / total-failure detection.
     - **Option B:** split into a generator / async iterable. Cleaner shape, but more invasive on call sites.
   - In `useEnrichment`, the `onChunk` callback merges that chunk's hits into the enrichment store immediately (don't wait for siblings).
   - Update `grid-api-adapter.test.ts` to cover: chunks merge progressively, total failure still returns null, partial failure (one chunk null) still returns the rest, abort still works.

The two changes together: viewport users see badges populate at ~0.8s rather than ~2s, with no penalty in any other dimension. Under HTTP/2 (when it lands), all chunks return roughly simultaneously and the prioritisation costs nothing.

**Estimated extra LOC: ~30 (callback wiring + ID-ordering logic + 2-3 new tests).**

**File:** `kupua/src/routes/search.tsx` (or wherever `useViewportEnrichment` is mounted).
- Remove the `useViewportEnrichment()` call. Keep `useEnrichment()`.

**File:** `kupua/src/hooks/useEnrichment.test.ts`.
- Delete tests for `useViewportEnrichment` if they exist as a separate suite.
- Verify `useEnrichment` tests still pass with the new 300ms debounce. They use fake timers; they may need the timer-advance value updated from 3000 to 300.

### Phase 2 — Tests

**Run after phase 1:**
- Unit: `npm --prefix kupua test 2>&1 | tee "$TMPDIR/kupua-test-output.txt"` — read tee.
- E2E: **warn user about port :3000 first**, then `npm --prefix kupua run test:e2e 2>&1 | tee "$TMPDIR/kupua-test-output.txt"`. Read tee.

Both must pass. Expect: 748 unit tests minus any that tested the deleted `useViewportEnrichment` surface specifically.

### Phase 3 — Docs

- `kupua/exploration/docs/deviations.md` — update entry 21 (currently "two-lane single-mechanism"). Replace with: single-lane `?ids=`-based enrichment at 300ms. The HTTP/1.1 connection-budget concern was evaluated and rejected; see this handoff for reasoning.
- `kupua/exploration/docs/changelog.md` — append narrative under current phase heading.
- `kupua/exploration/docs/worklog-current.md` — session log entry per AGENTS.md directive.
- `kupua/exploration/docs/00 Architecture and philosophy/component-detail.md` — if it mentions `useViewportEnrichment` or two-tier framing, update.
- `kupua/exploration/docs/cluster1-ids-enrichment-research.md` Appendix A — adjust the HTTP/2 row in the "three asks" table. The collapse no longer depends on HTTP/2; HTTP/2 just makes the scheduling marginally better. Reframe accordingly.

## Out of scope

- Do not touch `useEnrichedImage`, `enrichment-store`, `derive-enriched-image`, or any consuming component. Upstream change only.
- Do not change `getImageDetail` — still used by image-detail panel.
- Do not fix the SOURCE_INCLUDES canary. Deferred.
- Do not retune the 300ms further. If it feels wrong empirically, flag — don't iterate alone.
- Do not commit. User batches commits.

## Push-back clauses

- **A test breaks that you can't easily understand:** STOP and ask. Don't weaken the assertion to make it pass.
- **You discover a real concrete reason Tier 1 had a non-obvious purpose** (e.g. specific UI surface that depends on the 300ms cadence and would degrade noticeably under shared 300ms): STOP, surface it. The decision can be revisited.
- **LOC delta is substantially smaller than expected (~80–130 lines removed):** something is off. Flag.

## Done criteria

- `useViewportEnrichment` deleted; single `useEnrichment` at 300ms debounce.
- All vitest tests pass.
- Playwright e2e passes.
- `deviations.md` + `changelog.md` + `worklog-current.md` updated.
- Appendix A of research doc reflects the new collapse-doesn't-need-HTTP/2 reality.
- Nothing committed.

Self-check: read your own diff before declaring done. Confirm ~80–130 lines net deleted. Significant divergence = flag.
