# Justified density: refactor handoff and documentation amendments

**Current state:** justified density and bounded seam balancing are implemented in development;
Grid remains the default. Next focus is scoped refactoring, not more seam work or new controls.
Production remains excluded pending licensing clearance. Implementation history belongs in the
[changelog](changelog.md), not here. Late-thumbnail evidence and R7 remain intact for possible
separate investigation.

## Fresh-agent handoff — refactors

Read [AGENTS](../../AGENTS.md), [worklog](worklog-current.md), this plan and the implementation/proof
links for the selected refactor. Verify the worktree; preserve unrelated changes outside Kupua.
The previous app was stopped for local tests, but process ownership and live-access permission
must be re-established, not inherited. No performance campaigns/dry runs, commits or pushes are
authorised by this handoff.

### Start here

1. Propose one bounded slice from §4. Recommended order: **R1 destination-seek policy → R3 narrow
   browser helpers → R6 measurement-led geometry work**, with R6 implementation conditional on
   evidence. Confirm the slice before code changes; this order is not blanket approval.
2. State the duplicate responsibility removed, retained owner, benefit to Grid/Table as well as
   Justified, preserved behaviour and independent proof. Reject a wrapper around unchanged
   branches or a speculative framework. A concrete defect outranks structural tidiness.
3. Keep the current preservation policies, true/temporary-edge distinction, resource bounds and
   production gate. The parked 36/37px policy, minor interior engine underfills, semantic grouping,
   sizing UI and thumbnail delivery are **not prerequisites or incidental fixes**. If a refactor
   genuinely depends on one, stop and seek a separate decision.
4. Validate the smallest discriminators first, then the required unit/build/browser surfaces.
   Shared geometry or continuity changes require the full regression surface. Do not widen
   tolerances, merge distinct readiness conditions or change performance measurement boundaries.

### Mandatory gate after EVERY refactor

Commission **three independent, read-only cold reviews after each completed refactor**, not one
review round after a batch:

- **Correctness and test adequacy:** regressions, preservation contracts and discriminating proof.
- **Architecture and refactor value:** ownership, actual duplication removed, UX trade-offs and
  whether a simpler approach would suffice.
- **Static performance and measurement readiness:** work/retention bounds, invalidation and
  credible measurement needs; no automatic profiling or live campaigns.

Keep reviewers independent; collect all three reports before making review-driven fixes.
Resolve actionable findings and rerun affected validation before starting the next refactor;
escalate scope/policy decisions to the operator. Passing tests do not replace this gate.

### Finish the refactor sequence

Integrate the proposed owning-document amendments in §5 **after refactor work**, reconciling them
with the final implementation rather than copying stale wording. Do not expand the owning guides
now. Completed snapshot-ownership and availability-name repairs are constraints to retain, not
refactors to repeat. Use the [browser playbook](embedded-browser-playbook.md),
[safeguards](infra-safeguards.md) and [performance README](../../e2e-perf/README.md) for execution rules.

## 1. Implementation map

| Responsibility | Owner |
| --- | --- |
| Packing and ratios | [justified-layout](../../src/lib/justified-layout.ts) |
| Stable blocks, estimates and bounded dimension context | [windowed-justified-layout](../../src/lib/windowed-justified-layout.ts) |
| Width admission and cross-density snapshot | [JustifiedGrid](../../src/components/JustifiedGrid.tsx) |
| Shared cells, interactions and width reflow | [ImageGrid](../../src/components/ImageGrid.tsx) |
| Geometry registry and supported window contracts | [scroll-geometry-ref](../../src/lib/scroll-geometry-ref.ts) |
| Placement lifetimes and geometry correction | [useScrollEffects](../../src/hooks/useScrollEffects.ts) |
| Search/history capture | [search-continuity](../../src/lib/search-continuity.ts), [build-history-snapshot](../../src/lib/build-history-snapshot.ts) |
| Data publication, alignment and seek preparation | [search-store](../../src/stores/search-store.ts), [useDataWindow](../../src/hooks/useDataWindow.ts) |
| Spatial keyboard interaction | [useListNavigation](../../src/hooks/useListNavigation.ts) |
| Availability, fixtures and normal datasource selection | [resident-preview](../../src/lib/resident-preview.ts), [DAL factory](../../src/dal/index.ts), [sample datasource](../../src/dal/resident-sample-data-source.ts) |
| Controls and density preference | [StatusBar](../../src/components/StatusBar.tsx), [ui-prefs-store](../../src/stores/ui-prefs-store.ts), [search route](../../src/routes/search.tsx) |

## 2. Boundaries to retain

- One shared renderer, geometry registry and scroll-correction owner. Fixed arithmetic and
  variable-window operations stay explicit; never invent columns or average-row geometry.
- Preserve transition-specific identity, coordinate and placement authority. Mounted geometry
  and commit-only cross-density dimension snapshots have different lifetimes. Detailed contracts
  and durable proof lessons are queued in §5, not invitations to redesign these owners.
- Packing remains ordered and uncropped, using oriented dimensions with square fallback.
  Defaults: 48-image technical blocks; target height 190px at widths >=600px, otherwise 130px;
  4px spacing and 0.5 height tolerance. Non-final endings balance at most three trailing rows,
  trying shorter suffixes only when needed; natural true-final rows remain untouched.
- Indexed boundaries are exact; seek ordinals derive from overlapping identities, not estimated
  ranks. Query/no-overlap replacement invalidates context. Temporary buffer edges are not result
  edges. Current dimension retention is buffer length +94; no larger reads or catalogue cache.
- Preserve configurable defaults: resident threshold 1,000, indexed threshold 65,000 and buffer
  capacity 1,000. These bounds do not certify frame time or aggregate heap usage.
- Keep the separate +36px/+37px header-policy reproductions unchanged; a shared cause is unproved.
  Minor engine-cap underfills also remain separate. Neither warrants relaxing preservation tests.
- Normal DEV offers justified without another switch. The installed
  `@immich/justified-layout-wasm@0.4.3` artifact includes AGPL-3; development use is approved,
  production clearance is not. Preserve the DEV import gate and production Grid fallback.

## 3. Verification and performance coverage

Latest baseline (15 October 2026; commands run from repository root with foreground tee):

| Command | Result |
| --- | --- |
| `npm --prefix kupua test` | 2,998 passed / 89 files. |
| `npm --prefix kupua run build` | Passed; no production WASM assets. Existing large-chunk advisory remains. |
| `npm --prefix kupua run test:e2e -- kupua/e2e/local/justified-windowed.spec.ts --retries=0 --max-failures=1` | 16 passed after cold-review follow-ups, including both temporary-tail append witnesses; no retries. |
| `npm --prefix kupua run test:e2e -- --retries=0 --max-failures=1` | Full seam-implementation baseline before the parameter rename/additive browser proof: 466 passed, no skips/retries, 7.6m. |

Focused packing/window validation passes 31 tests, including 160 seeded ordinary-ratio/width
cases. Freeze source/configuration during browser runs; even comment edits can trigger reloads.
These results are the refactor baseline, not a reason to skip validation after ownership changes.

Proof entry points:

- [Packing](../../src/lib/justified-layout.test.ts) and [windowed layout](../../src/lib/windowed-justified-layout.test.ts): ratios, mapping, partial/true edges, overlap-derived ordinals and bounded dimension retention.
- [Mounted scroll controls](../../src/hooks/useScrollEffects.test.ts): non-uniform capture/placement, delayed geometry/prepend and newer-seek ownership; retain fixed-density controls.
- [Resident journeys](../../e2e/local/justified-density.spec.ts): density/panels, spatial keys, selection, history/header policy, detail/fullscreen and responsive geometry.
- [Windowed journeys](../../e2e/local/justified-windowed.spec.ts): indexed and forced-seek, delayed maintenance, forward/backward eviction at capacity, pending seek/density, history/viewers, empty query and real edges.
- [Density controls](../../e2e/local/density-controls.spec.ts): toggle/no-op semantics, painted icon geometry and narrow keyboard accessibility.
- Existing [history](../../e2e/local/browser-history.spec.ts), [browse-density](../../e2e/local/browse-density.spec.ts), [forced-seek](../../e2e/local/forced-seek.spec.ts), [selection](../../e2e/local/selections.spec.ts) and store suites remain controls, not redundant history to delete casually.

Local E2Es use ports 3000/3030/3040 and refuse real ES; check ownership before starting them.
Follow the root-level npm-prefix/foreground-tee rules. Preserve independent oracles and existing
pixel/identity assertions rather than multiplying every dimension into a Cartesian suite.

The [performance README](../../e2e-perf/README.md#density-comparisons-and-thumbnail-exposure)
owns scenario contracts and commands. `--suite justified` provides matched density comparisons;
`--full` includes the maintained rendering and perceived suites too. Existing direct-ES and
media-api baselines are pre-seam, seek-regime evidence, not a controlled transport comparison.
No post-seam speedup/regression or aggregate-heap conclusion has been measured. Campaigns and
dry runs remain operator-run; use matched conditions before making performance claims.

### Late thumbnail arrival: initial campaign evidence

The [density history](../../e2e-perf/results/density-log.json) contains the operator's
15 October campaigns `density baseline` (local media-api) and `density baseline, direct`
(direct ES): four repetitions each, all in the seek regime. Application-source fingerprints
match; whole-worktree fingerprints and corpus totals differ. These are within-environment
layout comparisons, not a historical trend, an API-only overhead measurement, or evidence
that this feature regressed Grid relative to its previous implementation.

Medians of per-run observations; pending area is a percentage of the **whole results viewport**.
Decode lead is positive outside the entering edge and negative after entering it. Already-ready
images are excluded from new-readiness events; unavailable lead is not zero latency.

| Environment / scroll condition | Grid pending area | Justified pending area | Grid decode lead | Justified decode lead |
| --- | ---: | ---: | ---: | ---: |
| Direct ES / cache bypass | 1.72% | 1.41% | −132px | −41px |
| Local API / cache bypass | 1.64% | 2.13% | −125px | −75px |
| Direct ES / repeat path | 1.05% | 0.35% | −121px | Unavailable: 3/4 samples |
| Local API / repeat path | 1.15% | 0.23% | −118px | −11px |
| Direct ES / constrained scroll | 15.59% | 26.08% | −408px | −359px |
| Local API / constrained scroll | 15.56% | 31.74% | −413px | −459px |

The constrained window uses 80ms latency and 4Mibit/s download, including possible data refills.
It produces later spatial readiness in **both** densities. Justified does not consistently decode
later than Grid: it displays roughly 35–38 visible slots versus Grid's 24 and devotes more of the
viewport to imagery. Higher pending viewport area therefore does not establish worse per-image
loading efficiency. Decode lead is an observed position, not decode duration or exact paint time.

Table recorded zero layout-shift sums and zero surviving-identity order changes in these scroll
observations, alongside heavy element reuse and much poorer frame-p95 summaries (126–154ms).
Its roughly 2.6% pending viewport area persisted for almost the whole observation: a narrow image
column makes that percentage deceptively small. This does not establish thumbnail-caused CLS,
rule out shifts in other actions, or separate application cost from probe overhead.

**Implication:** investigate image-delivery headroom separately from packing, seam appearance and
placement speed. These measurements provide a useful baseline, not permission for speculative
prefetching, increased resource budgets or a broad helper/architecture rewrite. See R7 below.

## 4. Refactor candidates and order

R numbers are stable references, not mandatory phases. **R2 snapshot ownership and R4 availability
naming are already implemented**; retain their contracts instead of reopening them. Every selected
refactor must pass the three-review gate in the handoff before moving to the next.

### R1 — Pure destination-seek preparation

**First: highest product-maintenance value, with real regression risk.** Fixed reverse arithmetic
and variable `prepareSeek` duplicate headroom, true-end and shrinking-buffer policy. Fixed rows
can extend beyond known geometry; variable lookup clamps and handles empty destinations. Do not
flatten those differences into a fake fixed-row interface.

Centralise only genuinely shared policy behind a pure destination-geometry input/output boundary.
No reads, scroll writes, focus changes or publication: the store keeps admission/data ownership,
and the scroll hook keeps placement. Start with independent empty/short/shrink/headroom/true-end
controls, then extract one policy at a time. Preserve null zones, exact/estimated landing,
prepend headroom, sub-row carry, clamping and pending/newer browsing.

**Promise:** fewer places for Grid/Table/Justified seek behaviour to diverge, with unchanged landing
semantics—not faster seeks or a repaired header policy. Reject the refactor if it merely wraps two
unchanged implementations. Keep existing test oracles independent during this work.

### R3 — Shared layout-aware browser helpers

**Second: improve proof maintenance after the product policy settles.** Map ordinary E2E and
performance consumers before removing duplication. Share stable selectors and explicit
selection/read operations, not a universal “settled” helper. “Select this view” must stay
idempotent and distinct from clicking an active toggle.

**Promise:** consistent test actions across densities without weaker assertions or altered
measurement boundaries. Preserve native-return versus centred-return versus density-ratio
oracles, action-specific readiness, request holds, cold/warm and wrong-density controls. Do not
move waits/setup into timed regions; revise scenario identities if a workload genuinely changes.
Start narrow; duplicated labels alone do not justify a large helper rewrite or a new framework.

### R6 — Indexed geometry cost and representation

**Third, conditional: establish cost before choosing a representation change.** Inspect packing,
shared estimates, block lookup, virtualizer measurement invalidation and destination preparation.
Construction happens on publication/resize; ordinary scroll renders reuse layout. Rebuilding
intersecting blocks, resetting measurement from zero and preparing temporary seek geometry may
amplify work, but no measured regression or leak has been established.

**Promise if justified:** less repeated work or clearer bounded lifetimes without larger reads,
retention budgets or changed placement. There is no speedup/heap promise before evidence. Prefer
removing redundant work or narrowing invalidation to a new cache/prefix-tree architecture. Keep
unknown geometry explicit; never retain catalogue-wide dimensions to make measurements look good.
§5 retains the cardinality model and measurement limitations for later guide integration.

### R5 — Future discrete sizing, not a current implementation step

Grid may vary columns; justified may vary target row height. Retain their shared capture/reflow
contract without fabricating justified columns. Extract sizing-related duplication only if it
already exists and has independent selection/focus/viewport proof. No presets, controls or fluid
zoom framework now. The promise is compatibility with later sizing, not delivering that feature.

### R7 — Thumbnail delivery headroom, not indiscriminate overscan

**Evidence-driven candidate, not implementation approval.** First distinguish result-data arrival,
cell mounting, request start, load completion and decode observation. Current exposure/lead metrics
alone cannot say which stage loses headroom; frame stalls can delay readiness observation too.
Keep identities and media URLs browser-local, and distinguish initial-ready/cached observations.

- Test a small, bounded image-loading lookahead separately from increasing virtualizer overscan.
  More mounted rows also increase rendering/enrichment work; they are not free prefetching.
- Compare the same controlled scroll action, corpus, width and cache/network class. Preserve
  viewport-exposure outcomes while reporting image coverage/counts; do not turn medians of counts
  into per-image success ratios or compare differently defined observation windows.
- Require less late readiness/exposure without regressions in request/byte counts, concurrency,
  cancellation, frame timing, memory retention, selection/history or position preservation.
  Do not raise image-retention, API page or result-buffer limits as an incidental optimisation.
- Investigate Table repaint/reuse and layout-shift attribution separately. Preserve the distinction
  between identity changes in recycled elements, logical ordering and image-caused geometry shifts.

Start with a discriminating local fixture for the suspected stage, then an operator-run matched
comparison. A larger shared-helper unification remains separately deferred; it is not a prerequisite
for understanding thumbnail arrival or a reason to change established measurement contracts.

## 5. Proposed document amendments — integrate AFTER refactors

These are durable contracts and lessons for the owning guides, not a history log or additional
implementation work. Reconcile them with the final code after refactoring, merge into the listed
guides and remove duplicated payload from this plan. Current contracts still constrain refactors.

### Component guide and deviations: geometry, packing and ownership

Owners: [component reference](00%20Architecture%20and%20philosophy/component-detail.md) and
[deviations](deviations.md). Integrate the model/defaults in §2 with these responsibilities:

- Justified supplies geometry to shared cells, selection, drag/long-press, safety treatment and
  detail/fullscreen/navigation owners. Image-only cells omit informational metadata/badges,
  not selection or safety indicators. No second gallery or scrolling lifecycle.
- Mounted geometry belongs to ImageGrid; JustifiedGrid retains bounded ID/ratio snapshots only
  after commit. Abandoned renders must not overwrite committed context. Query/no-overlap
  replacement invalidates it; no retained image records, visited-history cache or global layout.
- Stable blocks are technical, not dates/network pages/groups. Unknown dimensions use square
  estimates; unloaded full indexed blocks share a template. A temporary edge does not authorise
  true-end truncation. Estimates do not promise globally exact pixels at arbitrary entry points.
- Trailing-row balancing minimises item-weighted squared height deviation within 0.5–1.5 times
  the target. Prefer the widest feasible band of at most three rows, then shorter suffixes.
  A preceding extreme panorama must not prevent a feasible smaller-tail repair. Earlier rows
  and true-final blocks stay unchanged; infeasible suffixes retain engine output.
- Interior engine-cap underfills can occur even with ordinary ratios (observed 4–17px at 320px).
  They are not technical seams or missing thumbnails. No guarantee of universally filled rows;
  do not hide results, crop or raise caps to manufacture one. Floating tolerances allow rounding,
  not changed aspect ratios. Narrow portrait selection-target usability needs separate proof.
- Cross-block overlap changes neighbours' invalidation/eviction responsibilities; do not add it
  without a failing discriminator. Consider narrower-first balancing only for a concrete aesthetic
  problem. Semantic grouping and future discrete sizing are independent of technical block size.

### Position, scroll and history guides: transition-specific preservation

Owners: [position](00%20Architecture%20and%20philosophy/02-focus-and-position-preservation.md),
[scroll](00%20Architecture%20and%20philosophy/03-scroll-architecture.md) and
[history](00%20Architecture%20and%20philosophy/04-browser-history-architecture.md).
Position comprises identity, coordinate, logical edge and placement authority; focus, selection
and viewport anchor are distinct. Preserve this transition table rather than promising one
universal restoration rule:

| Transition | Contract |
| --- | --- |
| Settled density switch | Resolvable buffer-resident focus, otherwise viewport anchor; row-top ratio including header flow, visibility clipping and true-edge policy. Offscreen resident focus can pull the view back; nonresident focus cannot. Selection is not a separate chooser. |
| Pending browsing + density | Pending destination retains admission authority. Density disposal may retire placement without cancelling useful discovery. Indexed destination and buffer-local departure have different coordinate roles. |
| Query/filter/AI | Capture before publication. Focus/remembered detail identity, otherwise viewport centre; selection is not the query anchor. Preserve ordinary neighbour/top fallback versus finite-AI top relaxation. |
| Sort | Selection can outrank focus as placement target without replacing remembered focus. Retain explicit/phantom and finite-AI distinctions. |
| Back/Forward | Destination snapshot chooses identity, ratio and focus/NONE in the current density. No departing-neighbour adoption; missing destination keeps top/no-focus fallback. |
| Width reflow | Resolvable selection, then focus, then viewport anchor; capture before reflow and retain that operation's anchor. Offscreen selection is not promised visibility. |
| Detail/fullscreen | Native close without traversal retains the mounted list without scrolling; traversed return centres through current geometry. Retain entry identity, missing-target waits and supersession. |
| Prepend/eviction/estimate correction | Preserve the elected surviving identity using old/new row-top delta, even when its old row splits. Only fall back to an old-row neighbour when that identity is evicted. |
| Seek/Home/End | Exact-index and estimated/buffer-local regimes remain distinct. Retain headroom, reverse-compute/flash avoidance, cursor mapping and separately owned focus intent. |
| Logo Home/new-images refresh | Reset is deliberate intent published with data. Offset zero alone is not reset authority; buffer bottom is not true result end. |

Search/history coordinates exclude header/padding flow; density coordinates include it. Do not
replace both with raw DOM coordinates; detail centring retains Table's usable-height adjustment.
Generation, publication, navigation, history-entry and focus-intent guards have different lifetimes.
One correction owner means native anchoring and virtualizer size compensation stay disabled for
justified. Fixed arithmetic and variable-window alignment/seek operations remain explicit.

Preserve subpixel ratio carry only while target, applied scroll, row geometry, viewport/header and
publication remain unchanged; newer input retires it. It prevents integer-scroll rounding drift,
not decorative state to remove during cleanup.

Cross-reference [existing B19/C27](zz%20Archive/not-yet-another-audit-ledger.md#b19): +36px on native
Back from a true Credit-null tail and +37px in the paired history→Table→density witness are distinct
reproductions, not a proven shared cause. Keep the measured-header oracle. Repair requires a
separate all-density policy decision; do not duplicate the issue or conflate it with shell scroll.

### Keyboard and UI guides: interactions worth preserving

Owners: [keyboard](00%20Architecture%20and%20philosophy/keyboard-navigation.md) and
[frontend philosophy](00%20Architecture%20and%20philosophy/01-frontend-philosophy.md).

- Horizontal keys follow result order; vertical keys choose the nearest horizontal centre in
  the adjacent row, breaking ties by result order. Page movement uses actual geometry.
  Off-buffer row/page intent uses the existing snap-back lifecycle and admitted destination
  geometry; newer input supersedes it. Selection/phantom paging must not promote focus.
- Grid selection is idempotent; clicking active Table/Justified toggles back to Grid. Preserve
  stable accessible names/pressed states and 14px painted icon bounds, not just equal SVG sizes.
- Toolbar summary/tickers scroll in their strip while density/panel/selection controls stay
  pinned. Keep `overflow: clip` on both shell axes: `hidden` still permits programmatic scrolling
  from native Tab. Preserve narrow-width keyboard access rather than hiding unreachable controls.

### Runtime/setup guide: availability and honest fixtures

Owner: [Kupua README](../../README.md), runtime/setup sections. Reconcile AGENTS runtime routing
at integration time; its former configuration guide is archived, not an active implementation plan.

| Mode | Configuration and contract |
| --- | --- |
| Normal development | `JUSTIFIED_AVAILABLE = DEV`; normal configured datasource and real queries, no extra layout switch. |
| Synthetic resident fixture | `VITE_JUSTIFIED_PREVIEW=true`; `npm --prefix kupua run dev:justified` on 3040; 96 varied images, simulated matching and SVG media. |
| Real-photo resident sample | `VITE_JUSTIFIED_PREVIEW=sample`; one capped read of 96 images, then in-memory ordering/cursors/ranges; matching simulated, reload resamples. |
| Production | Grid fallback; inline DEV import gate excludes packing/windowed code and WASM pending licensing clearance. |

`WINDOWED_JUSTIFIED_ENABLED` means DEV without either resident fixture; neither availability
constant selects a performance scenario. The sample coalesces its initial read, uses no PIT or
exact full-index count, times out after 15s and caches failure as empty without unrestricted
fallback. No metadata is persisted. Thumbnail/detail/enrichment traffic can still occur: a capped
sample is not network isolation or real-query certification. Preserve fixture notices.

Retain the exact installed engine version and published-artifact AGPL-3 qualification from §2;
an upstream MIT source file does not override the installed artifact. WASM is the engine choice,
not a measured Kupua speed advantage. Do not reopen licensing without a production decision.
Link the safeguards/playbook: startup scripts are not implicit permission to replace tunnels,
stop another process or create credential files. No live identities or signed URLs in evidence.

### Functional E2E handbook: independent proof and fixture discipline

Owner: [E2E handbook](../../e2e/README.md); proof entry points remain in §3.

- Document the 3000 normal, 3030 forced-seek and 3040 resident-fixture projects; windowed justified
  shares the first two. Preserve fixed-density controls, native keyboard and newer-input tests.
- An acknowledged density or `loading=false` is not final placement/media readiness. Keep native
  detail return, centred return, history restoration and density ratios as distinct oracles.
- Preserve abandoned-render/commit-only snapshot, split-row elected identity, off-buffer spatial
  intent and query/no-overlap invalidation witnesses; unit geometry and browser wiring prove
  different responsibilities.
- Temporary-tail publication proof must start with genuinely unknown dimensions before the first
  justified commit. Hold the real append, observe the real elected viewport identity without
  focus, require nontrivial content-coordinate change and <1px viewport drift, matching scroll
  delta and stable subsequent frames. Keep exact appended IDs/offset/uniqueness checks.
- Install direction-specific holds before maintenance starts; distinguish the longer density-
  disposal cooldown from ordinary search cooldown. Count the operation under test, not unrelated
  forward work; release holds/restore descriptors on failure. Never inflate request budgets to
  disguise arrangement errors.
- Freeze source/configuration during runs. For visual evidence, verify foreground, served source
  and hit-tested targets. Native zoom has host-mediated readiness: use the existing
  [browser controls playbook](browser-playbook/controls-and-selectors.md#native-browser-zoom),
  not immediate keypress samples or CSS zoom as a substitute.

### Scroll/performance guides: cost model and limits of evidence

Owners: [scroll architecture](00%20Architecture%20and%20philosophy/03-scroll-architecture.md) and
[performance README](../../e2e-perf/README.md). Keep detailed cost reasoning in the architecture
guide; the README needs actionable commands, prerequisites and measurement caveats, not narrative.

- Dimensions are at most N+94; each ID map is bounded by N. Up to 22 known blocks intersect a
  default 1,000-image buffer; unknown full blocks share one estimate. Indexed descriptors are
  O(ceil(total/48)), up to 1,355 at 65,000 results; virtualizer storage is O(row count), with
  high-water capacity. Mounted old/new layouts, seek preparation and dimension snapshots can
  coexist. The dimension bound is not aggregate heap proof: include JS, typed arrays and WASM.
- At most three suffix searches each evaluate m(m+1)/2 intervals; conservative bounds are 3,528
  per affected block and 81,144 per default-capacity construction. Full endings exit early.
  Existing block rebuilds, measurement resets from zero and temporary seek preparation can
  amplify publication/reflow cost. These are static bounds/hypotheses, not measured jank/leaks.
- Existing campaigns cover seek-mode outcomes, not near-threshold indexed work, continuous resize,
  the <600px target-height transition or aggregate heap. Fixed-duration frame sampling is not
  action latency; geometry readiness is not decode readiness; completed Resource Timing entries
  are not outstanding/backend request counts. Observer fixtures alone do not prove app setup.
- Page size/capacity and held maintenance checks do not certify natural-scroll request frequency.
  If this matters to a refactor, attribute starts/completions/cancellations/outstanding work by
  direction through forward eviction and reverse prepend; do not infer amplification without it.
- A matched four-repetition density campaign is the smallest useful performance comparison when
  warranted. Keep corpus, backend, regime, width and cache/network profile comparable, with Grid
  controls. Packing changes which images occur per pixel; media differences are not DP timings.

### Research references worth retaining

- [Immich timeline source at the examined revision](https://github.com/immich-app/immich/tree/cace887201cb4f9bce960676c2816bfd7948e4f6/web/src/lib/managers/timeline-manager): lazy aspect ratios, estimates and day packing. Its retained months, date navigation and compensation are not Kupua's bounded arbitrary-sort contract.
- [Google Photos design article](https://medium.com/google-design/google-photos-45b714dfbed1): segmented geometry and bounded rendering; historical timing is not a Kupua budget.
- [Flickr photolist](https://code.flickr.net/2015/03/24/much-photos/): bidirectional/middle-entry and incomplete-row handling. A geometry package is not the whole scrolling system; hiding unfinished rows is not an approved policy here.

Borrow architectural lessons, not another application's data model or a second scrolling
owner. Completed research does not need repeating merely because another agent starts.
