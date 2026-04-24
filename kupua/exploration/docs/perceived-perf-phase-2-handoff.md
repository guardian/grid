# Phase 2 Perceived-Perf — Handoff for Next Agent

> Companion to [perceived-perf-audit.md](perceived-perf-audit.md).
> That doc completed Phase 1 (instrument + measure). This doc takes
> the 24-Apr-2026 baseline and turns it into prioritised, evidence-led
> Phase 2 work. Phase 2 in the audit doc was a sketch; this is the
> real backlog.
>
> **Discipline rule (from the audit doc, repeated because it's
> easy to forget):** *do not touch code until you can name the
> hypothesis and the metric you expect to move.* Add measurement
> before optimisation if numbers are missing.

## The baseline (median of 3, TEST cluster, 24-Apr-2026)

| ID  | Action            | Ack ms | 1st-pixel ms | Settled ms | Target settle | Status |
|---  |---                |---:|---:|---:|---|---|
| **PP1** | home-logo         | 1   | 609   | 609   | <200  | ❌ **3× over (named pain)** |
| PP2 | sort-no-focus     | 42  | 377   | 377   | <1 s  | ✅ |
| PP3 | sort-around-focus | 42  | 871   | 871   | <2 s  | ✅ |
| PP4 | sort-direction    | 44  | 830   | 830   | <2 s  | ✅ |
| PP5 | filter-toggle     | 42  | —     | 903   | <1 s  | 🟡 borderline |
| PP6 | density-swap      | —   | —     | 204   | <400  | ✅ |
| PP7 | scrubber-seek     | 1   | 987   | 987   | <1 s  | 🟡 borderline |
| PP7b | scrubber-drag    | 1   | 960   | 960   | <1 s  | 🟡 borderline |
| PP7c | scrubber-buffer  | —   | —     | 118   | —     | ✅ |
| PP8 | search warm       | 0   | 1220  | 1220  | <1.5 s | ✅ |
| PP9 | chip-remove       | 0   | 664   | 664   | <1 s  | ✅ |
| PP10 | position-map (bg)| —   | —     | 2577  | n/a   | ⚠ silent — investigate |
| JA1 | search David Young | 0  | 388   | 388   | <1.5 s | ✅ |
| JA2 | open-detail        | —  | —     | 104   | <300  | ✅ |
| JA3 | metadata-click     | 13 | 277   | 277   | n/a   | ✅ |
| JB1 | search avalonred   | 0  | 553   | 553   | <1.5 s | ✅ |
| **JB2** | facet-click subject:sport | 54 | 1216 | 1217 | <1 s? | ❌ **no target row, but 1.2 s feels slow** |
| JB3 | facet-exclude      | 0  | 606   | 606   | <1 s  | ✅ |
| JB4 | scrubber-seek 50%  | 0  | 571   | 769   | <1 s  | ✅ |
| JB5 | fullscreen-exit    | —  | —     | 2     | —     | ✅ |

(Latest dashboard: `e2e-perf/results/perceived-graphs.html` — open in browser.)

## Three real Phase 2 tickets

### Ticket P2-1 — _source filtering: reduce ES response payload for all searches  ✅ DONE

**Origin:** Owner-named pain ("Home logo feels slow"). PP1 baseline: 609 ms.
But the root cause — oversized ES responses — affected **all** searches,
not just Home. Fix scope: all searches.

#### Root cause (verified 24-Apr-2026)

`resetToHome()` blocks on two sequential awaits:
1. `openPit("1m")` — PIT open, pure network RTT (~50-100 ms over SSH tunnel)
2. `searchAfter(params, null, pitId)` — first page of 200 images

The response is **~1-2 MB** because `_source` filtering only excludes
`fileMetadata.exif/exifSub/getty` and `embedding`. Everything else ships:
`usages` (arrays), `exports` (full crop specs), `leases`, `collections`,
`syndicationRights`, `originalMetadata`, `originalUsageRights`, `thumbnail`,
`optimisedPng`, `softDeletedMetadata`, `source` (full asset), `identifiers`.

**Grid view uses ~8 fields per image.** The other ~80-90% of payload is
dead weight for first paint. JSON.parse of 1-2 MB is heavy enough that
there's a `scheduler.yield()` after it to avoid long-task jank.

Kahuna comparison: page size 50, goes through media-api (which returns a
curated subset), no PIT. Instant route change, results fill in async.

#### Approach: switch from excludes (blacklist) to includes (whitelist)

Current `SOURCE_EXCLUDES` in `es-config.ts` is a blacklist that misses
most heavy fields. Replace with `SOURCE_INCLUDES` — only fetch what
Kupua actually renders. As new features (badges, columns) are built,
add their fields to the includes list. Self-documenting.

#### Field tiers (what to include)

**Tier 1 — Grid cell render (minimum for first paint)**

| Field | Used by |
|---|---|
| `id` | Thumbnail URL, identity, position map |
| `uploadTime` | Date line, sort label |
| `lastModified` | Alt date line, sort label |
| `metadata.description` | Primary label |
| `metadata.title` | Fallback label |
| `metadata.byline` | Tooltip |
| `metadata.credit` | Tooltip, sort label |
| `metadata.dateTaken` | Alt date line, sort label |

**Tier 2 — Table default columns + sort labels**

| Field | Used by |
|---|---|
| `metadata.imageType` | Table column, sort label |
| `metadata.copyright` | Table column |
| `metadata.source` | Table column |
| `metadata.specialInstructions` | Table column |
| `metadata.subjects` | Table column |
| `metadata.peopleInImage` | Table column |
| `metadata.subLocation` | Location column |
| `metadata.city` | Location column |
| `metadata.state` | Location column |
| `metadata.country` | Location column |
| `uploadedBy` | Table column, sort label |
| `uploadInfo.filename` | Table column |
| `source.dimensions` | Dimensions column, sort label |
| `source.orientedDimensions` | Dimensions column |
| `usageRights.category` | Table column, sort label; future cost badge |

**Tier 3 — Detail panel, hidden table columns, imgproxy rotation**

These are INCLUDED in `SOURCE_INCLUDES` alongside T1+T2 (35 fields total).
They cover everything kupua currently renders across all surfaces.

| Field | Used by |
|---|---|
| `metadata.suppliersReference` | Detail panel + hidden table column |
| `metadata.bylineTitle` | Detail panel + hidden table column |
| `metadata.keywords` | Detail panel + hidden table column |
| `source.size` | Detail panel + hidden table column |
| `source.mimeType` | Detail panel + hidden table column + sort-by-type |
| `source.orientationMetadata` | imgproxy rotation (full-size image display) |
| `fileMetadata.colourModel` | Detail panel alias column |
| `fileMetadata.colourModelInformation` | Detail panel (cutout + bitsPerSample aliases) |
| `fileMetadata.iptc.Edit Status` | Detail panel alias column |
| `fileMetadata.icc.Profile Description` | Detail panel alias column |
| `fileMetadata.xmp.Iptc4xmpExt:DigitalSourceType` | Detail panel alias column |
| `fileMetadata.xmp.Iptc4xmpCore:Scene` | Detail panel alias column |

**NOT included — not currently used by any kupua surface:**

| Field | Add when |
|---|---|
| `syndicationRights` | Future syndication badge |
| `leases` | Future lease overlay |
| `collections` | Future collection badge |
| `identifiers` | Opt-in |
| `persisted` | Future archived badge |

#### media-api comparison (Phase 3 context)

media-api fetches **full `_source`** from ES — no filtering. It then adds
computed fields that don't exist in raw ES:
- `cost` — from `usageRights` via `CostCalculator` (needed for cost badge)
- `valid` / `invalidReasons` — metadata completeness (needed for alert overlays)
- `persisted` + reasons — computed from exports/usages/collections
- `syndicationStatus` — from `syndicationRights` + `leases`
- `isPotentiallyGraphic` — ES script field on `metadata.keywords`
- **Signed URLs** — `source.secureUrl`, `thumbnail.secureUrl` (replaces S3 proxy)

Same fields for search and individual image. Only projection: `?include=fileMetadata`.

**Implications for this ticket:** Our `_source` includes whitelist is a
Phase 2 optimisation only. Post-media-api (Phase 3), the response shape
changes — signed URLs mean we need `thumbnail` back, computed fields
(`cost`, `valid`, `persisted`) arrive for free. Keep the mechanism simple,
easy to rip out. Don't build infrastructure that assumes direct-ES forever.

**Never needed (always exclude / never include)**

| Field | Why |
|---|---|
| `originalMetadata` | Reconciled into `metadata` — no UI reads it |
| `originalUsageRights` | Reconciled into `usageRights` — no UI reads it |
| `fileMetadata.exif/exifSub/getty` | Already excluded |
| `embedding` | 1024-dim float vector — never displayed |
| `thumbnail` | URL built from `id` via S3 proxy |
| `optimisedPng` | Not needed currently |
| `softDeletedMetadata` | Edge case only |

**Future badge fields (NOT included until Kupua builds them)**

| Field | Kahuna badge | Add when |
|---|---|---|
| `userMetadata.labels` | Label tags on cell | Labels feature built |
| `exports` | Has-crops indicator | Crop badge built (only need existence, but ES can't filter array→boolean without script field) |
| `usages` | Print/digital usage icons | Usage badge built (need `platform` + `dateAdded` for recency) |
| `userMetadata.archived` | Archived/library badge | Archive badge built |

Responsibility: whoever builds the badge adds the field to includes.

#### Key design decisions

- **One call for both densities.** Grid+table are always mounted (just
  hidden). Fetching T1-only and deferring T2 would cause empty table
  columns on density switch. Measured: 163 vs 244 KB, 90 ms gap — not
  worth two-call complexity.
- **`metadata.*` wildcard vs specific fields.** Measured: wildcard adds
  30 KB over specific fields (keywords, analysed text). Specific includes
  used.
- **PIT open stays eager for now.** Deferring PIT to first extend saves
  ~50-100 ms but complicates the extend path. Revisit only if
  measurements show it's a significant fraction of total.
- **media-api integration (future).** This entire approach changes when
  Kupua talks to media-api instead of ES directly. media-api returns a
  curated response. Keep the includes mechanism but expect it to be
  replaced. Don't over-engineer.

#### Measurement results (24-Apr-2026, TEST cluster via SSH tunnel)

All queries: `match_all`, `size: 200`, `sort: [uploadTime desc, id asc]`.
Medians of 3 runs. Total: 1,319,769 images.

**Direct to ES (raw, no gzip):**

| ID | Variant | Size | ES took | RTT | Network | Parse |
|---|---|---:|---:|---:|---:|---:|
| M-A | Current excludes | **1476 KB** | 78 ms | **2045 ms** | 1966 ms | 7 ms |
| M-B | + never-needed excluded | **1235 KB** | 75 ms | **1729 ms** | 1654 ms | 7 ms |
| M-C | Tier 1 only (grid) | **163 KB** | 71 ms | **419 ms** | 348 ms | 1 ms |
| M-D | Tier 1+2 specific | **244 KB** | 74 ms | **511 ms** | 437 ms | 1 ms |
| M-D2 | T1+2 wildcard (`metadata.*`) | **273 KB** | 75 ms | **543 ms** | 468 ms | 1 ms |
| M-E | PIT open only | — | — | **131 ms** | — | — |
| M-F | T1+2 + `track_total_hits:1000` | **244 KB** | 69 ms | **512 ms** | 441 ms | 1 ms |

**Through Vite proxy (gzip, what the browser sees):**

| ID | Variant | Gzip size | RTT | ES took | Network |
|---|---|---:|---:|---:|---:|
| M-A | Current excludes | **256 KB** | **592 ms** | 132 ms | 460 ms |
| M-D | Tier 1+2 specific | **61 KB** | **349 ms** | 116 ms | 233 ms |
| M-G | T1+2 + gzip (direct) | **61 KB** | **364 ms** | — | — |

**Analysis:**

1. **Network transfer is the bottleneck.** ES `took` is ~75-130 ms in ALL
   variants. The 1.5s difference between M-A and M-D is pure payload.
2. **Tier 1+2 includes: 4× smaller raw, 4× smaller gzip, ~240 ms faster.**
   592 ms → 349 ms through the proxy. Immediate win.
3. **M-B (more excludes) barely helps:** -16% size. The heavy fields are
   `usages`, `exports`, `leases`, `source` asset — not the ones already
   excluded.
4. **M-C vs M-D (grid vs grid+table): 163 vs 244 KB, 419 vs 511 ms raw.**
   ~80 KB / ~90 ms difference. Not enough to justify two-call complexity.
   **Decision: single T1+2 call for both densities.**
5. **`metadata.*` wildcard adds 30 KB** over specific fields (keywords,
   analysed text). **Decision: use specific includes.**
6. **`track_total_hits` cap: negligible** — 8 ms saved on `took`, 0 on RTT.
   Not worth the scrubber breakage. **Decision: keep `true`.**
7. **PIT open: 131 ms.** ~25% of total search RTT. Lazy PIT (defer to first
   extend) would save this on every search. Separate optimization.
8. **Gzip compression is active** through Vite proxy. 244 KB → 61 KB.
9. **JSON.parse: 7 ms → 1 ms.** `scheduler.yield()` after parse may no
   longer be needed at 61 KB, but harmless to keep.

**Estimated PP1 home-logo improvement:**
- Before: PIT (131 ms) + search (592 ms) = ~723 ms total
  (baseline measured 609 ms — variance is SSH tunnel jitter)
- After T1+2 includes: PIT (131 ms) + search (349 ms) = **~480 ms**
- If PIT deferred: search only = **~349 ms**

#### Decisions locked

- **Switch from `SOURCE_EXCLUDES` to `SOURCE_INCLUDES`** with 35 specific
  fields (Tier 1 grid + Tier 2 table + Tier 3 detail/hidden/imgproxy).
  This covers EVERYTHING kupua currently renders — grid, table, detail
  panel, metadata sidebar, hidden columns, imgproxy rotation. Nothing
  is missing from any surface.
- **The whitelist applies to every ES call that returns `_source`:**
  `search()`, `searchRange()`, `getById()`, and `searchAfter()`. Only
  `fetchPositionIndex` (`_source: false`) and agg/count calls are exempt
  (they don't return document fields at all).
- **Single call for both densities.** 90 ms gap doesn't justify two calls.
- **Specific includes, not `metadata.*`.** 30 KB savings.
- **Keep `track_total_hits: true`.** Negligible cost, scrubber needs it.
- **PIT lazy-open: separate follow-up.** 131 ms is significant but
  changes the extend path. Tackle after _source change ships and
  re-baselines.
- **Responsibility rule:** whoever builds a new feature that needs a new
  ES field adds it to `SOURCE_INCLUDES` in `es-config.ts`. The list is
  self-documenting with tier comments.

**Result (24-Apr-2026).** `SOURCE_INCLUDES` implemented (35 fields),
all perceived-perf tests re-baselined. PP1 home-logo: **609 → 379 ms**
(target <400 — achieved). Every search-based metric improved:

| Metric | Before | After | Delta |
|---|---:|---:|---:|
| PP1 home-logo | 609 | 379 | -230 (38%) |
| PP2 sort-no-focus | 377 | 324 | -53 |
| PP3 sort-around-focus | 871 | 683 | -188 |
| PP4 sort-direction | 830 | 657 | -173 |
| PP5 filter-toggle | 903 | 546 | -357 |
| PP7 scrubber-seek | 987 | 744 | -243 |
| PP8 search warm | 1220 | 903 | -317 |
| PP9 chip-remove | 664 | 387 | -277 |
| JA1 search | 388 | 276 | -112 |
| JB1 search | 553 | 300 | -253 |
| JB2 facet-click | 1216 | 750 | -466 (38%) |
| JB3 facet-exclude | 606 | 348 | -258 |

Non-search metrics (PP6 density-swap, JA2 open-detail, JB5 fullscreen)
unchanged as expected. JA3 metadata-click baseline was anomalously low
(277ms for a search returning ~1.3M results — compare PP8 baseline 1220ms
for same scale); P2-1 value of 949ms is consistent with other search metrics.

---

### Ticket P2-2 — Facet-click 1216 ms → <800 ms

**Status after P2-1:** JB2 already dropped to **750 ms** from _source
filtering alone — target of <800 ms is met. The remaining question is
whether visible button feedback (ack) is worth adding. JB2 ack is 54 ms
(fine), but the 750 ms settle with no intermediate state may still feel
laggy. Revisit only if the user considers it a problem.

**Original motivation.** Largest "felt slow" outlier with no target row
in the audit doc. Facet click on a 21k-result query is a common interaction.
1.2 s was past the boredom threshold.

**Hypothesis (unverified).** Facet click triggers (a) a new search request
with the added `subject:sport` term and (b) an aggregation re-fetch for the
filter panel. Both paint cycles probably gate `t_settled`. Compare with PP9
(chip-remove → search 664 ms) and JB1 (initial avalonred search 553 ms) —
JB2's extra ~600 ms must be the agg fetch or the bigger result set.

**First-step investigation.**
1. Confirm the trace contains both `facet-click` and a downstream `search` t_0.
   Read the raw `e2e-perf/results/.perceived-long-tmp.jsonl` to see the
   sequence.
2. Time the agg fetch separately: add `t_settled` for `aggLoading→false` and
   compare to results `t_settled`. Whichever is later is the bottleneck.
3. Check whether the `data-facet-field` button gets disabled during the
   in-flight search. If not, the user thinks it's broken (no ack) — that's
   the perceived-latency half of the fix.

**Likely solutions.**
- If agg-fetch is the gate: parallelise (already? verify) or defer (don't
  block `t_settled` on aggregations; let them stream in).
- If user-feedback is the gap: dim the clicked facet button + add an inline
  spinner. Doesn't speed it up, just stops it feeling broken.
- If real ES is the floor: defer to the audit doc's "Cache aggregations by
  (query, filter)" idea.

**Decide first what target to set.** Audit doc has no row for "facet click";
`<1 s settle, <100 ms ack` would match the filter-toggle row and be honest.

**Done when.** Median JB2 settle drops below 800 ms; ack ≤100 ms with visible
button feedback.

---

### Ticket P2-3 — Investigate PP10 position-map 2577 ms

**Why third.** Silent background — no user sees the spinner, no banner. But
2.5 s is long, and the audit doc flags it: "affects scrubber tooltip accuracy
if user drags before it loads." The question isn't "is it slow?" (yes) but
"does anything user-facing block on it?"

**First-step investigation (read-only, no fix yet).**
1. Audit every consumer of `positionMapLoading` and `positionMap`. Map out
   which UI states wait on it.
2. Reproduce: load David Young query (538 results). Drag the scrubber within
   the first 500 ms. Does the tooltip show real positions or fall back to
   buffer-extrapolation?
3. Ask: is 2.5 s for a ~21k-result fetch reasonable? Compare with raw ES
   query time (curl the cluster directly).

**Possible outcomes.**
- **No user impact found** → close ticket, document why, move on. The
  baseline number stays high but it doesn't matter.
- **Tooltip fallback is ugly** → audit doc's "Skip position-map for sessions
  that don't need it" idea — defer fetch until first scrubber interaction.
- **ES is genuinely slow at scale** → outside our control; document.

**Done when.** Either resolved or written off with a one-line explanation in
the audit doc.

---

### Ticket P2-4 — Parallel PIT open: save ~131 ms on every search

**Why.** Every `search()` call does `await openPit()` → `await searchAfter()`
sequentially. PIT open is pure network RTT (~131 ms over SSH tunnel). The
first page doesn't use `search_after` cursors — it's a plain
`{query, sort, size}` search that doesn't need PIT for correctness. PIT
only matters for subsequent extends/seeks.

This affects ALL searches (home, CQL, filter, sort, facet, chip-remove).
After P2-1 (_source includes), PP1 is 379 ms. Removing the serial PIT
wait would drop it to ~250 ms. Every other search metric drops ~131 ms too.

#### Approach: `Promise.all` in `search()`

Open PIT and fire the first search in parallel:

```
// Before (sequential, ~480ms):
const pitId = await openPit("1m");        // 131ms
const result = await searchAfter(…, pitId); // 349ms

// After (parallel, ~349ms):
const [pitId, result] = await Promise.all([
  openPit("1m"),                           // 131ms ─┐ overlap
  searchAfter(…, null),                    // 349ms ─┘
]);
```

- First `searchAfter` passes `pitId: null` → goes to `/{index}/_search`
  (index-prefixed, no PIT).
- PIT ID from `openPit()` stored for extends/seeks/fill.
- Cursors are PIT-agnostic — adapter already strips `_shard_doc` tiebreaker
  (es-adapter.ts L556-558).
- If `openPit` fails, extends fall back to non-PIT (existing fallback path).

#### Why this is safe

1. **Cursor compatibility.** Non-PIT sort values work with PIT-based
   `search_after`. ES resolves position by comparing sort values, not by
   PIT provenance. The adapter already strips `_shard_doc` from PIT-based
   cursors for exactly this reason.
2. **Snapshot gap.** The PIT snapshot may be microseconds after the first
   search's snapshot. In theory, an ingest between the two could cause an
   off-by-one at the first extend boundary. On a ~1.3M corpus with ~dozen
   ingests/hour, this is invisible. `frozenParams` (uploadTime cap) already
   handles the dominant case (new uploads).
3. **All downstream code handles `pitId: null` gracefully.** `pitId` is
   typed `string | null` throughout. `_fillBufferForScrollMode`,
   `_loadBufferAroundImage`, seek, and extend all pass through `null`
   without error — es-adapter falls back to index-prefixed requests.
4. **Position map is independent.** `fetchPositionIndex` opens its own
   dedicated PIT — unaffected by this change.

#### Implementation scope

~15-line change concentrated in `search()` in search-store.ts (~L1697-1721).
Nothing else changes. Extends, seeks, fill, position-map all keep working.

#### What to watch

- PIT open failure: should degrade gracefully (search succeeds, extends
  fall back to non-PIT). Verify with a test.
- `result.pitId` from first search will be `undefined` (no PIT used) —
  use `openPit()` result instead. Already the fallback at L1755:
  `pitId: result.pitId ?? newPitId`.
- `_pitGeneration` bump timing: must happen before both are fired, so
  extends from a previous search are invalidated.

**Expected impact:** PP1 379 → ~250 ms. All search metrics drop ~131 ms.

**Done when.** `Promise.all` implemented, unit tests pass, perceived-perf
re-baselined showing ~130 ms improvement on PP1 and all search metrics.

---

## Tickets we're explicitly NOT doing

- **PP3/PP4 sort-around-focus, PP5 filter-toggle, PP7 scrubber-seek,
  PP8 search warm.** All within or close to target. Touching them risks
  regression for marginal gain. Revisit only if a target tightens or a
  baseline run shows drift.
- **PP6/6b/6c density-swap.** Owner reported "this is fine" pre-baseline;
  numbers (204/323/323 ms) confirm. Done.
- **JA2 open-detail, JB5 fullscreen-exit.** Sub-300 ms.
  Stop optimising things that already feel instant.
- **JA3 metadata-click.** Baseline 277 ms was anomalously low (search
  returning ~1.3M results). P2-1 value of 949 ms is consistent with other
  large-search metrics (PP8 903 ms). Not a regression — the baseline was
  a fluke. No action needed.
- **Anything from the audit doc's "Real-latency opportunities" table that
  we haven't measured a need for.** Bundle splitting, smaller PAGE_SIZE,
  predictive prefetch — all speculative until a baseline says otherwise.

## How to work this

1. **Pick one ticket.** Do not parallelise. Each ticket has measurement,
   investigation, hypothesis, fix, re-measure phases.
2. **Re-baseline before starting** — `node e2e-perf/run-audit.mjs
   --perceived-only --runs 3 --label "Pre P2-X check"` — confirms the
   problem still exists and isn't already fixed by something unrelated.
3. **Push back on the user** if a ticket smells wrong (per Directive: Push
   back). E.g. P2-3 may turn out to be a non-problem.
4. **One commit per ticket.** Re-run baseline post-fix with label
   `"P2-X done"` so the dashboard shows the win.
5. **Update this handoff** as tickets close (move to the "completed" list
   below). Update the audit doc's status block when all three are done.

## Completed Phase 2 tickets

- **P2-1 _source filtering** (24-Apr-2026): 35-field whitelist in es-config.ts.
  PP1 609→379ms, JB2 1216→750ms, all search metrics improved 15-40%.

## What success looks like

When all three tickets close, expect:
- ~~PP1 home-logo: 609 → <400 ms~~ **DONE: 379 ms**
- ~~All other search-based metrics: proportional improvement~~ **DONE: 15-40% across the board**
- ~~JB2 facet-click: 1216 → <800 ms~~ **750 ms from P2-1 alone**;
  P2-2 may add visible feedback for further perceived improvement
- PP10 position-map: resolved or written off with rationale

That's the end of Phase 2 as currently scoped. Further work would need a
new Phase 1-style measurement pass on whatever surface the user newly
cares about (e.g. fullscreen traversal, image detail panel scrolling, etc.).
