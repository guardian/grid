# Performance Harness Validity Audit

**Status:** report-only audit, 8 September 2026  
**Scope:** `e2e-perf` runner, persisted metrics, dashboards, and measurement windows  
**Originally audited surface:** 54 final-log keys: 32 jank, 14 short perceived, 8 long-journey  
**Current maintained surface:** 52 keys after evidence-led P10/P12 removal: 30 jank, 14 short perceived, 8 long-journey

## Section 0: Measurement Premise Is Not Yet Reliable

The current logs are useful manual characterization evidence. They are not a
safe automatic regression gate.

Two defects cross the halt threshold:

1. The runner receives Playwright's exit code but discards it, then reads and
   persists whatever metrics were emitted before the failure
   ([child result](../../../e2e-perf/run-audit.mjs#L485-L518),
   [jank caller](../../../e2e-perf/run-audit.mjs#L815-L850)).
2. Neither aggregation path has an expected-ID manifest or per-run completeness
   check. Missing IDs and missing repetitions are silently ignored
   ([jank aggregation](../../../e2e-perf/run-audit.mjs#L537-L626),
   [perceived aggregation](../../../e2e-perf/run-audit.mjs#L299-L354)).

A failed run can therefore produce a green-looking partial historical entry.
Do not use dashboard deltas alone to accept or reject a performance change
until gates G1-G4 below are implemented.

This finding does not invalidate every historical number. It changes their
status: compare named, complete, manually observed runs as characterization;
do not treat the log as an automatically trustworthy time series.

## Measurement Vocabulary

| Mark | Meaning |
|---|---|
| **Direct** | The named action itself is inside the persisted window |
| **Proxy** | A shared downstream path is measured, but not the full interaction |
| **Qualified** | Useful after honoring the stated trigger/window caveat |
| **Blocked** | The persisted row currently mixes or misstates materially different evidence |
| **Diagnostic** | Useful context, not a user-action regression metric |

Jank base fields are CLS, max frame, severe count/rate, p95 frame, DOM churn,
LoAF blocking, and frame count. P4/P6 add focus geometry; P14 adds image landing
fields. Perceived rows aggregate `t_0`-relative action marks and may copy the
latest store timings after settle. The perceived calculator pins only the
starting `t_0` to an action; later phases can be emitted by another action
([calculator](../../../e2e-perf/perceived-short.spec.ts#L67-L125)).

## Jank Ledger

| ID | Trigger and measured window | Regime / dependency | Assessment | Primary caveat |
|---|---|---|---|---|
| P1 | Pre-navigation probes through visible results plus two frames; revision 2 | Seek corpus; ES + images | **Repaired and TEST-verified** | Retains response/DCL/load/FP/FCP milestones; distinct from JA1 perceived latency |
| P2 | 4s rAF `scrollTop += 50`, then 2s tail | Seek corpus; extends + images | Direct synthetic grid scroll | Title says mousewheel, but input is scripted rAF ([test](../../../e2e-perf/perf.spec.ts#L912-L963)) |
| P3 | Date-sort scrubber click at 50%, seek settle, 4s | Seek corpus; ES + images | Direct, qualified broad seek | Position-map setup is excluded; emitted seek metadata is discarded ([test](../../../e2e-perf/perf.spec.ts#L965-L990)) |
| P3b | Credit-sort 50% seek, 4s | Seek corpus; composite/high-cardinality ES path | Direct, high-value qualified seek | Sort setup excluded and emitted sort/seek metadata lost ([test](../../../e2e-perf/perf.spec.ts#L992-L1019)) |
| P4a | Focus, grid to table, 1s | Client layout; images possible | Direct density transition | Focus geometry uses scenario-specific calculation rather than common usable-viewport oracle ([test](../../../e2e-perf/perf.spec.ts#L1021-L1053)) |
| P4b | Existing table to grid, 1s | Client layout + images | Direct density transition | Table mount/setup excluded; row is state-dependent on P4a setup ([test](../../../e2e-perf/perf.spec.ts#L1055-L1089)) |
| P5a | Open left panel, 800ms | Client layout; aggregation may already be warm | Direct panel open | First step in chained panel state ([test](../../../e2e-perf/perf.spec.ts#L1091-L1110)) |
| P5b | Open right while left remains open, 800ms | Client layout | Direct combined-width transition | Not an isolated right-panel baseline ([test](../../../e2e-perf/perf.spec.ts#L1112-L1121)) |
| P5c | Close left while right remains open; revision 2 | Client layout | **Repaired and TEST-verified** | One action; left absent/right present; stable +284px results width; right closes unmeasured afterward |
| P6 | Reverse sort around focus, helper settle, 5s | Seek corpus; multi-request ES + images | Direct, high-value | Long post-settle tail dilutes rates; final visibility is stronger than exact placement ([test](../../../e2e-perf/perf.spec.ts#L1129-L1163)) |
| P7 | Forty-step/30ms thumb drag ending before release; revision 2 | Client continuous drag | **Repaired and TEST-verified** | Lazy distribution preloaded; zero data requests; release/network seek excluded and owned by perceived PP7b |
| P8 | Eighty real wheel events in table, 3s tail | Seek corpus; extend/evict + images | Direct, high-value table scroll | README still describes 40 events; broad tail remains ([test](../../../e2e-perf/perf.spec.ts#L1202-L1240)) |
| P9 | Choose Credit sort, settle, 2s | Seek corpus; full replacement + images | Direct sort replacement | Broad window; no focus by design ([test](../../../e2e-perf/perf.spec.ts#L1242-L1257)) |
| P10 | Legacy manual combination of five unrelated windows | Mixed | **Removed from maintained portfolio and history** | Fabricated composite had zero frame/p95 context; constituent actions retain stronger individual owners |
| P11@20 | Date seek at 20%, 4s | Seek corpus; ES + images | Direct depth-dependent CLS | Repeats generic P3 frame dimensions; unique value is image/CLS depth ([test](../../../e2e-perf/perf.spec.ts#L1335-L1369)) |
| P11@60 | Date seek at 60%, 4s | Same | Direct depth-dependent CLS | Same broad window |
| P11@85 | Date seek at 85%, 4s | Same | Direct depth-dependent CLS | Same broad window |
| P11b@20 | Credit seek at 20%, 4s | High-cardinality seek + images | Direct keyword image/CLS depth | Sort/position metadata is not retained ([test](../../../e2e-perf/perf.spec.ts#L1371-L1396)) |
| P11b@60 | Credit seek at 60%, 4s | Same | Direct keyword image/CLS depth | Same broad window |
| P11b@85 | Credit seek at 85%, 4s | Same | Direct keyword image/CLS depth | Same broad window |
| P12-scroll | Legacy pooled Uploaded/Credit scroll plus unmeasured density tail | Mixed | **Removed from maintained portfolio and history** | Uploaded duplicated P2; TEST Credit attempt scrolled but never evicted (`bufferOffset=0`), so distinct premise was false |
| P13a | Exact detail open to decoded stable high-priority image; revision 2 | Detail image/API | **Repaired and TEST-verified** | Proves identity/route agreement, decode and stable geometry; not compositor paint |
| P13b | Backspace close to visible stable focused destination; revision 2 | History + client restoration | **Repaired and TEST-verified** | Persists vertical/horizontal focused-cell drift and visibility; verified 0px/0px |
| P14a | Ten forward presses at 500ms, landing wait | Image prefetch/decode | Direct normal traversal, high-value | `img.complete` is decode/readiness evidence, not observed paint ([test](../../../e2e-perf/perf.spec.ts#L1627-L1663)) |
| P14b | Fifteen forward presses at 200ms, 3s settle | Image cancellation/prefetch | Direct fast traversal, high-value | Some emitted per-image/scenario data is dropped by aggregation ([test](../../../e2e-perf/perf.spec.ts#L1665-L1685)) |
| P14c | Ten backward presses at 200ms, 3s settle | Image cancellation/prefetch | Direct reverse traversal, high-value | Does not cross a known buffer boundary ([test](../../../e2e-perf/perf.spec.ts#L1687-L1706)) |
| P14d | Twenty forward presses at 80ms, 3s settle | Image cancellation/prefetch | Direct rapid traversal, high-value | Discrete presses, not held-key repeat ([test](../../../e2e-perf/perf.spec.ts#L1708-L1734)) |
| P15a | Exact ImageDetail identity enters native fullscreen and remains decoded/stable; revision 2 | ImageDetail fullscreen API + image | **Repaired and TEST-verified** | Explicitly distinct from FullscreenPreview; no fixed wait |
| P15b | Two exact decoded identity commits while native ImageDetail fullscreen remains active; revision 2 | ImageDetail fullscreen + images | **Repaired and TEST-verified** | Fails unless committed steps equal two |
| P15c | Real `f` toggle; native fullscreen absent, same final identity decoded/stable in windowed ImageDetail; revision 2 | ImageDetail fullscreen -> windowed detail | **Repaired and TEST-verified** | Synthetic Escape did not exit headed Chromium; does not return to list; JB5 owns FullscreenPreview exit-to-list |
| P16a | Exact Category resize handle; drag +100px to stable observed width; revision 2 | Client-only | **Repaired and TEST-verified** | Missing handle/box fails; verified +100px, zero CLS |
| P16b | Double-click same owning header to stable changed auto-fit width; revision 2 | Client-only | **Repaired and TEST-verified** | Missing/unchanged width fails; verified -155px, zero CLS |

## Short Perceived Ledger

Implementation status and per-row completion oracles are tracked in
[the A5 migration ledger](performance-harness-6-a5-migration-ledger.md).

Every row inherits the cross-action phase and post-settle store-timing caveats
described above.

| ID | Trigger and endpoint | Regime / dependency | Assessment | Primary caveat |
|---|---|---|---|---|
| PP1 | Real Grid-logo click to final settle | App reset via `resetToHome()`; ES/media-api + images | Direct Grid-logo reset latency | This is a UI command distinct from keyboard Home. It intentionally removes the pinned `until`, so corpus comparability changes ([test](../../../e2e-perf/perceived-short.spec.ts#L242-L269)) |
| PP2 | Choose exact Width without focus | Seek corpus; search + render | **Direct, correlated A5 migration complete** | Historical File size rows invalid. Revision 2 requires exact Width, store-ready, target-context first-visible and two-frame visual settlement; persists total/regime/routes |
| PP3 | Focus then choose exact Credit sort | Seek corpus; sort-around-focus | **Direct, correlated A5 migration complete** | Revision 2 fails if Credit is absent; requires store-ready, focused-cell first-visible and two-frame visual settlement; persists total/regime/routes |
| PP4 | Focus then reverse direction | Seek corpus; sort-around-focus | **Direct, correlated A5 pilot** | Revision 2 requires one interaction ID, store-ready, first visible focused-cell frame and two-frame visual settlement; persists settled total/regime and sanitized route categories |
| PP5 | Toggle exact Free-to-use checkbox | Search + render | **Direct, correlated A5 migration complete** | Revision 2 requires exact accessible control, correlated store-ready, target filter context first-visible and two-frame visual settlement; successful routes only |
| PP6 | Grid to table | Client layout | **Direct, correlated A5 migration complete** | Revision 2 requires real table row first-visible and table/row geometry stable over next frame; rejects data requests and persists total/regime/routes |
| PP7 | Track click near 50% | Seek path; ES + images | **Direct, correlated A5 migration complete** | Revision 2 requires app-owned `seek` regime, one owned seek, store-ready, real visible/stable content and requested/achieved ratio retention |
| PP7b | Thumb drag to 70%, release | Seek path; ES + images | **Direct, correlated A5 migration complete** | Revision 2 starts at release, requires authoritative seek regime, store-ready, visible/stable content and requested/achieved ratio; continuous drag remains outside window |
| PP7c | Track click near 80% | Buffer tier, client-only | **Direct, correlated A5 migration complete** | Revision 2 requires authoritative buffer mode, preloads lazy distribution outside window, retains requested/achieved ratio, and rejects successful data routes |
| PP8 | Programmatic `queryChange("sport")` | Warm search | **Direct post-CQL, correlated A5 migration complete** | Revision 2 starts after debounce, consumes one interaction into one search generation, handles focus-preserving publication, and requires exact sport context first-visible/visual-settled |
| PP9 | Programmatic empty `queryChange` | Query removal + search | Direct from app event; proxy for chip UI | No actual chip/clear-button interaction ([test](../../../e2e-perf/perceived-short.spec.ts#L612-L647)) |
| PP10 | Automatic background position-map fetch | Indexed corpus; ES | Diagnostic, not user action | Search and map traces can coexist; should not share user-action targets ([test](../../../e2e-perf/perceived-short.spec.ts#L649-L683)) |
| PP6b | Settled scrollable-range midpoint, density click | Seek corpus, client transition | **Direct, correlated A5 migration complete** | Revision 2 allows ordinary setup extension, then freezes position/buffer before a client-only visible/stable density window |
| PP6c | Quiescent post-eviction state, density click | Seek corpus; sequential setup extends | **Direct, correlated A5 migration complete** | Revision 2 requires real eviction, recentres away from buffer edge, waits for both extension directions, then measures client-only density |

## Long-Journey Ledger

| ID | Trigger and endpoint | Regime / dependency | Assessment | Primary caveat |
|---|---|---|---|---|
| JA1 | Cold navigation to fixed small query | Buffer corpus; ES + images | **Direct, correlated A5 migration complete** | Revision 2 starts before navigation using browser epoch time; requires exact lifecycle, buffer regime, real first-visible and two-frame settlement |
| JA2 | Real detail double-click to mount settle | Buffer corpus; image/API | Direct detail-open acknowledgment | Settle mark is mount rAF, not decoded image readiness ([test](../../../e2e-perf/perceived-long.spec.ts#L331-L372)) |
| JA3 | Real metadata-value click to search | Buffer to larger corpus; ES + images | Direct, valuable compound journey | Header/scenario description has drifted; exact trigger is one field ([test](../../../e2e-perf/perceived-long.spec.ts#L375-L400)) |
| JB1 | Cold navigation to fixed medium query | Indexed corpus; ES; position map separate | **Direct, correlated A5 migration complete** | Revision 2 starts before navigation using browser epoch time; requires exact lifecycle, indexed regime, real first-visible and two-frame settlement |
| JB2 | Open Browse/Filters, then click sport after it loads | Indexed/dynamic; aggs then search | Direct facet-to-results only | First panel and aggregation latency are setup outside cleared trace ([test](../../../e2e-perf/perceived-long.spec.ts#L440-L473)) |
| JB3 | Alt-click first non-sport facet | Dynamic corpus; aggs/search | **Blocked label/action identity** | Arbitrary field is labeled `subject`; expected action is intentionally unpinned ([test](../../../e2e-perf/perceived-long.spec.ts#L475-L505)) |
| JB4 | Click scrubber at 50% | Dynamic buffer/indexed/seek path | **Blocked semantic mixture** | Can persist scroll or seek under one label; long schema omits seek breakdown ([test](../../../e2e-perf/perceived-long.spec.ts#L507-L531)) |
| JB5 | From grid, enter **FullscreenPreview**, clear trace after 20 traversals, then exit to list | FullscreenPreview exit + conditional list restoration | Direct preview exit only | Preview entry and all traversal are outside the measured window; this is not ImageDetail fullscreen ([test](../../../e2e-perf/perceived-long.spec.ts#L533-L563)) |

## Non-Reportable And Prototype Surfaces

| Surface | Current status | Decision |
|---|---|---|
| P10 | Historical `report:false` composite only | Removed; constituent actions remain independently measured |
| P12 density cycles | Removed with P12 | Habitual E2E remains the correctness owner |
| SS0-SS4 | Deleted in D-Zero; never entered audit-log/dashboard manifests | Not coverage. The prototype directly mutated selection state, contained a placeholder out-of-buffer case and disconnected observers before asynchronous delivery. Reconsider only for a real bulk-selection decision. |
| E1-E6 | Separate tuning experiments and JSON files | Keep separate from regression portfolio; run only for a named experiment ([experiments](../../../e2e-perf/experiments.spec.ts#L1206-L1625)) |

## Runner And Environment Findings

| Finding | Consequence | Required disposition |
|---|---|---|
| Nonzero Playwright exit ignored | Fixed in A1: every jank/short/long child must exit zero before emitted metrics are parsed | **G1 implemented; successful-child path browser-verified** |
| No expected-ID/sample manifest | Fixed in A2: explicit manifests cover all 54 final-log IDs; every repetition requires each selected ID exactly once | **G2 implemented and browser-verified** |
| `enforceClusterGate()` checks auth file and static cutoff only | Fixed in A3 for adapter mode and stable run environment; per-metric settled corpus/tier remains A5/G7 | **G3 run environment implemented and browser-verified** |
| RTT probe accepts network/non-2xx failures and always probes direct ES | Context metric may be misleading, especially in media-api mode | Validate status and label route; retain as context only ([probe](../../../e2e-perf/run-audit.mjs#L190-L217)) |
| Jank viewport was `1987x1110` and config declared DPR twice (`1.25`, then `2`) | Explicitly reset to the laptop-fitting maintained profile `1720x960 @2`, matching short/long perceived suites | Legacy jank history is non-comparable; take a fresh baseline after A5/stabilization |
| Runner/config descriptions disagree on headed mode and selected specs | A3 now fingerprints effective headed state (`true` in the verified jank run); prose/config cleanup remains before a named baseline | Correct docs/config deliberately; do not change execution mode incidentally |
| Invalid temp JSON lines are silently dropped | Fixed in A1: malformed nonblank rows throw with source path and 1-based line before persistence | Focused pure tests pass; browser dry-run pending |
| Invalid existing log JSON becomes empty history | Fixed in A4: malformed/wrong-shaped history aborts; selected siblings stage before replacement and roll back together on runtime failure | **G4 implemented and dry-run verified** |
| Run metadata omits mode/base URL/browser/OS/effective DPR | Fixed in A3 with requested/observed mode verification and exact repetition matching | Run-level environment implemented; per-metric route/tier remains A5/G7 |

## Aggregation And Dashboard Findings

- Jank aggregation preserves only the base fields, focus geometry, and selected
  P14 landing fields. It drops emitted seek duration/position, sort metadata,
  velocity, blank/flash diagnostics, request counts/bytes, and some traversal
  summaries ([aggregator](../../../e2e-perf/run-audit.mjs#L537-L626)).
- `p95Frame` is a percentile inside one action window and is then medianed
  across runs. It is not a cross-run p95. Perceived fields do calculate a
  cross-run p95.
- Dashboards do not display sample completeness. The jank chart visually spans
  missing entries, which can hide absent runs
  ([jank schema](../../../e2e-perf/results/audit-graphs.html#L105-L145)).
- The perceived dashboard has a fixed numeric allowlist and omits
  `seekMeasures`; entry-level RTT is not a selectable metric
  ([perceived schema](../../../e2e-perf/results/perceived-graphs.html#L165-L195)).
- Store timings copied after settle are diagnostics. A client-only action can
  inherit timing from a previous request; they must not be treated as caused by
  every row that carries them.

## Reliability Gates

Implement these before adding broad scenario coverage or using the dashboard as
a regression gate.

| Gate | Acceptance condition |
|---|---|
| G1 - process integrity | **Implemented in A1; successful-child path browser-verified.** Any selected Playwright child exits nonzero -> run fails; no JSON/JS/Markdown history changes |
| G2 - completeness | **Implemented and browser-verified in A2.** Exact expected ID manifest per suite/filter; every ID appears exactly once per repetition; sample counts persisted and displayed |
| G3 - environment | **Run environment implemented and browser-verified in A3.** Requested/observed mode, app origin, browser/version, OS/architecture, viewport/screen/effective DPR, headed state, CPU throttle, cache class, workers, cutoff and git state persist and repetitions match exactly. Per-metric settled total/tier and actual routes remain A5/G7 |
| G4 - durable writes | **Implemented in A1/A4 and dry-run verified.** Malformed temp/existing JSON fails closed; selected siblings stage before replacement and roll back together on runtime failure. Multi-file crash atomicity is not claimed because POSIX has no multi-rename transaction |
| G5 - semantic identity | **A5 and Phase B repair decisions complete.** P10/P12 removed; retained jank rows name one actual action |
| G6 - completion oracles | **A5 and Phase B repairs complete.** P1/P5c/P7/P13/P15/P16 use action-specific boundaries |
| G7 - metric retention | **A5 and Phase B repairs complete.** Scenario, boundary, P1 bootstrap and P14 attribution fields are retained and validated |

## Portfolio Decisions After Gates

**Retain as core:** P2, P3/P3b, P4a/b, P6, P8, P9, P11/P11b depth CLS,
P14a-d, PP1-PP5, PP7/PP7b, PP8 as explicitly post-CQL search latency,
PP6b/c, JA3, JB1/JB2, and a corrected JB5 exit.

**Repair before trusting:** None among the named Phase B rows. P1/P5c/P7/P13/
P15/P16 and all listed perceived rows are repaired and verified; P10/P12 were removed.

**Separate diagnostic or remove:** P10, PP10, and unreported selection stress.
Selection deserves a replacement user-level measurement surface, not promotion
of the current prototype.

## Latest-Run Stability Assessment

The most recent before/after comparison does **not** demonstrate a
sort-performance regression. It does expose three benchmark-contract defects.

### JB2: Stable Trigger, Ambiguous Attribution

The semantic input is stable: `uploader:avalonred`, then the authored
`subject:sport` control
([scenario](../../../e2e-perf/perceived-long.spec.ts#L403-L473)). The supplied run
comparison was:

| Signal | Before | After |
|---|---:|---:|
| ES `took` | 28ms | 30ms |
| Search fetch | 277ms | 678ms |
| Facet aggregation fetch | 195ms | 249ms |
| Settled | 345ms | 1486ms |

Stable ES execution points away from a query regression. Roughly 400ms belongs
to fetch/transport variance; remaining time plausibly includes exact
position-preservation work now completed before atomic publication.

One qualification matters: a stricter test-side `waitForStoreSettled()` cannot
inflate a trace timestamp already emitted. The helper waits for store and one
rAF, but `computeMetrics()` reads the app's existing marks
([wait/calculator](../../../e2e-perf/perceived-long.spec.ts#L97-L138),
[wait](../../../e2e-perf/perceived-long.spec.ts#L200-L218)). The behavior boundary
changed in product orchestration, not because Playwright waited longer.

The present trace vocabulary is still too optimistic: sort-around-focus emits
`t_first_useful_pixel` and `t_settled` together when buffer state is published,
before the separate DOM scroll effect and browser paint
([marks](../../../src/stores/search-store.ts#L1771-L1789)). Treat these as
`t_store_ready` until a browser-observed frame confirms useful pixels and stable
geometry.

**Disposition:** isolate JB2 from Journey B, keep facets preloaded, use a fixed
anchor/viewport placement, and pair every repetition with the identical query
change without position preservation. That matched control separates shared
request/render noise from anchor-preservation cost.

### JB3: Historical Rows Are Non-Comparable

JB3 selects the first rendered non-`sport` facet, reads only its key, labels it
as a `subject`, and intentionally accepts whichever trace action appears first
([scenario](../../../e2e-perf/perceived-long.spec.ts#L475-L505)). Historical runs
therefore selected different data (`-subject:agency` versus
`-subject:Avalon`). This is a different query and potentially a different field,
result count, tier, aggregation shape, and position path.

**Disposition:** mark historical JB3 comparisons invalid. Start directly from
the exact post-JB2 query and target one authored `data-facet-field` plus
`data-facet-key`. If the fixed control is absent or changes the expected tier,
fail the scenario; never choose a substitute.

### P14: CLS Event Attribution Is Unstable

P14b and P14d both enter the same fast-prefetch branch: their 200ms and 80ms
cadences are below the 350ms threshold. They also run sequentially in one detail
session, sharing decoded images, cache, layout and predecessor state
([scenario](../../../e2e-perf/perf.spec.ts#L1627-L1728)). A large quantized CLS
event has historically moved among P14 variants. In the supplied comparison,
P14d CLS changed `0.0058 -> 0.1612` while max frame and DOM churn were unchanged
and the landing image was already rendered/cache-hit. P14b already carried the
same shift class before and after.

The current landing clock also starts only after the three-second settle sleep;
zero means “complete by the time we finally looked,” not zero latency from the
last key ([landing sequence](../../../e2e-perf/perf.spec.ts#L1665-L1728)).

**Implemented and characterized.** Every cadence is now a separate
Playwright test/fresh browser context. A fixed pinned query/order/start rank
produces an in-memory expected sequence; every key must commit the exact next
route/render identity, but no identity is persisted. CLS/jank begins at the
first key, `p14:t_stop` is marked at final identity commit, and landing timing
starts from that commit. Raw CLS events retain only traversal/landing phase,
semantic role, previous/current rectangle and aspect-ratio class. Aggregation
reports occurrence rate plus conditional magnitude and fails if scenario/cache
contracts or committed step counts differ. Seven direct-ES TEST repetitions
showed a distinct P14d cancellation/landing distribution: 1-4 of 20
intermediates rendered versus P14b's 5-8 of 15, deterministic DOM churn of
1,099 versus 833, generally slower landing, and 0.169-class CLS in 2/7 P14d
runs versus 0/7 P14b runs. **Decision: retain P14d as core.**

## Stable Scenario Contract

Apply this before the next named baseline, not just to JB2/JB3/P14.

### Fixed Input

- Commit a safe scenario alias, canonical query, cutoff, sort, fixed control
  field/key/polarity, expected result regime, and contract revision.
- Keep exact image/anchor identities in an untracked local fixture manifest or
  secure environment input. Validate at startup and fail closed.
- Never persist image IDs, image paths, signed URLs, metadata values, auth
  material, or response bodies in logs.
- A pinned `until` blocks new uploads, not edits/deletions. Validate total/tier
  and required controls each run rather than assuming the corpus is immutable.

### Causal Correlation

- Assign every interaction an `interactionId`, target search generation, and
  canonical context hash.
- Carry them through search, aggregation, position lookup, publication, DOM
  application and trace phases.
- Never associate a later phase merely because it occurred after `t_0`; the
  current perceived calculator can consume phases from another action.

### Honest Boundaries

| Boundary | Required observation |
|---|---|
| `t_0` | Real click/key handler before navigation/state mutation |
| `t_ack` | First visible busy/status acknowledgment |
| `t_store_ready` | Final target generation atomically published |
| `t_first_visible_frame` | First rAF containing target-context, non-skeleton visible content; decoded image when that is the useful result |
| `t_visual_settled` | Expected anchor/identity, no status/skeleton, stable usable-viewport geometry for two frames |

Aggregation refresh, position-map construction, image prefetch and other
background work need separate spans rather than delaying every user-visible
settled boundary.

### Environment And Route Fingerprint

Persist scenario contract/revision, query and cutoff, settled total and derived
tier, view/focus mode/sort, adapter mode, actual per-operation routes,
browser/version, OS/architecture, viewport/screen/effective DPR, headed state,
CPU throttle, cache class, worker count, git SHA and dirty-diff hash.

This is essential in strangler mode: `searchAfter` may use media-api while
counts, aggregations, PIT, maps and shallow offset paging remain direct ES
([adapter](../../../src/dal/strangler-adapter.ts#L41-L66)).

### Repetitions And Statistics

- Retain every raw repetition; do not keep only medians.
- Use seven repetitions for median plus MAD characterization. Do not call a
  seven-sample statistic p95.
- Require at least 20 independent repetitions before publishing a p95
  threshold.
- Never aggregate across differing fingerprints, routes, tiers, controls,
  cache classes, or incomplete runs.
- Admit a core metric only when its boundary is user-visible, input/path fixed,
  repetitions complete, and a threshold drives a decision.

### Other Dynamic Scenarios To Stabilize

- PP1 drops the pinned cutoff during Grid-logo reset.
- PP2/PP3 can choose fallback sort options; PP5 chooses the first checkbox.
- PP7c allows totals above the actual buffer threshold.
- PP6b/c derive depth from mutable `scrollHeight`; PP6c may include a
  timing-dependent extension.
- JA3 targets a persisted live image identity and a broad metadata selector.
- JB4 intentionally mixes indexed scroll and seek under one label.
- JB5 chooses the first image after mutable JB3/JB4 state.
- P11 still chooses ranks from mutable real data. P13/P14/P15 now validate
  in-memory identities from fixed ranks and persist no identity.
- P12 was removed after its replacement premise failed on TEST.
- P16 now fails closed on missing or ineffective controls.

## Stabilization Order

1. Reliability gates G1-G4: fail closed, expected IDs/repetitions, environment,
   atomic writes.
2. Fixed scenario manifest and complete route/tier fingerprint.
3. Interaction/generation correlation and honest visible-frame/settled marks.
4. Repair JB3 and mark historical rows non-comparable.
5. Isolate JB2 with a matched no-anchor control.
6. **Complete:** isolate P14 cadences, start landing timing at `t_stop`, retain
  raw CLS events, and retain P14d as core from seven-run evidence.
7. **Complete:** reclassify P1, P5c and P7; named Phase B repair/removal
  decisions now precede historical pruning and the next baseline.

## Done Criteria

- All 54 final-log keys above have exactly one ledger row.
- P10 and SS/E experiments are not misrepresented as reportable user coverage.
- Reliability blockers are separated from scenario-level caveats.
- No historical baseline has been deleted or reinterpreted as controlled proof.
- No threshold or optimization recommendation is made from incomplete runs.
