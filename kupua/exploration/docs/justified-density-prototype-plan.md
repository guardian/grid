# Justified density: refactor handoff and owning contracts

**Current state:** justified density and bounded seam balancing are implemented in development;
Grid remains the default. R1's bounded shared seek policy and R3's narrow browser selection guard
are implemented and reviewed. **R6's bounded unused-estimate removal is implemented, validated
and accepted by all three independent cold reviews. No broader indexed rewrite is justified.**
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

1. **R1, R3 and the approved R6 slice are complete.** Preserve their uncommitted changes; do not
  reopen them, continue helper consolidation or expand into caches, measurement invalidation or
  representation changes. No next implementation or performance campaign is authorised. Select
  further work only on operator instruction; research is not blanket implementation approval.
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

### Owning documentation

The proposed amendments were integrated after R1 and the helper contract updated after R3;
§5 routes to their owners.
Update those guides after any later refactor rather than duplicating their contracts here.
Completed snapshot-ownership and availability-name repairs are constraints to retain, not
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
| Shared destination headroom/carry and requested true end | [destination-seek](../../src/lib/destination-seek.ts); geometry-specific lookup/shrink/clamping stay with their callers |
| Spatial keyboard interaction | [useListNavigation](../../src/hooks/useListNavigation.ts) |
| Availability, fixtures and normal datasource selection | [resident-preview](../../src/lib/resident-preview.ts), [DAL factory](../../src/dal/index.ts), [sample datasource](../../src/dal/resident-sample-data-source.ts) |
| Controls and density preference | [StatusBar](../../src/components/StatusBar.tsx), [ui-prefs-store](../../src/stores/ui-prefs-store.ts), [search route](../../src/routes/search.tsx) |

## 2. Boundaries to retain

- One shared renderer, geometry registry and scroll-correction owner. Fixed arithmetic and
  variable-window operations stay explicit; never invent columns or average-row geometry.
- Preserve transition-specific identity, coordinate and placement authority. Mounted geometry
  and commit-only cross-density dimension snapshots have different lifetimes. §5 routes to
  the detailed contracts and durable proof lessons, not invitations to redesign these owners.
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

Latest R1 validation (16 October 2026; commands run from repository root with foreground tee):

| Command | Result |
| --- | --- |
| `npm --prefix kupua test` | 3,011 passed / 89 files, including additive review controls. |
| `npm --prefix kupua run build` | Passed; no production WASM assets. Existing large-chunk advisory remains. |
| `npm --prefix kupua run test:e2e -- kupua/e2e/local/justified-windowed.spec.ts --retries=0 --max-failures=1` | 16 passed; no retries. |
| `npm --prefix kupua run test:e2e -- --retries=0 --max-failures=1` | 468 passed; no skips/retries. Production code unchanged by subsequent test-only review controls. |

Packing/window validation includes 160 seeded ordinary-ratio/width cases; the focused fixed
and variable seek suites pass 49 tests. Freeze source/configuration during browser runs;
even comment edits can trigger reloads.
These results are the refactor baseline, not a reason to skip validation after ownership changes.

R3 validation (16 October 2026): 11 focused selection controls, 165 pure harness checks,
30 synthetic browser fixtures, two isolated app journeys and build passed. Fresh E2E/perf
compiler diagnostic identities and multiplicities remain exactly 93/35, not clean compilation.
The first full E2E run stopped at KUP-017 focused-left visibility (231 passed, one failed,
two interrupted, 234 unrun). The exact witness then passed unchanged in isolation and a
complete unchanged rerun passed all 468 without retries. The first failure's cause remains
unestablished; it is neither a claimed repair nor a proven pre-existing defect. R3 changed no
application source, so the R1 unit result above is retained evidence, not a new R3 unit run.

R6 validation (16 October 2026; root-level commands with foreground pipefail/tee):

| Command | Result |
| --- | --- |
| `npm --prefix kupua run test -- src/lib/windowed-justified-layout.test.ts -t 'construction-local justified estimates'` | Before implementation: all 10 new controls failed as expected (nine extra-pack counts and one eager call-order mismatch); 26 unrelated tests excluded by selector. |
| `npm --prefix kupua run test -- src/lib/windowed-justified-layout.test.ts src/lib/justified-layout.test.ts src/stores/reverse-compute.test.ts src/hooks/useScrollEffects.test.ts` | After implementation: 639 passed across four files, including all new controls. |
| `npm --prefix kupua run test` | 3,021 passed / 89 files. |
| `npm --prefix kupua run build` | Passed; no production WASM assets. Existing large-chunk advisory remains. |
| `npm --prefix kupua run test:e2e -- kupua/e2e/local/justified-windowed.spec.ts --retries=0 --max-failures=1` | 16 passed; no retries. |
| `npm --prefix kupua run test:e2e -- --retries=0 --max-failures=1` | 468 passed; no skips/retries. |

All three independent read-only cold reviews accepted R6 with no actionable findings; all reports
were collected before closing the gate, and no review-driven fixes were required. Correctness
review notes that block-composition references share the packing engine: they are independent
of the lazy selector, not a new oracle for the engine. Architecture/value and static-performance
reviews confirm bounded ownership and operation-count evidence, not runtime/heap improvement.
No profiling, campaigns or live access occurred. E2E used local sample data after the operator
resolved execution access; all three test-server ports were free after teardown. The new passing
run does not diagnose or erase the unexplained R3 failure above.

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

### Scoll blocking

- Slower continuous wheel input: no blocking.
- Faster input: a measured ~190 ms stop at the buffer boundary, despite continued wheel events.
- Scrolling resumed when result data arrived, with zero loaded thumbnails in the rendered cells. Thumbnail loading isn’t the release condition.  

**Why:** with this 1.33-million-result search, scrollable space covers only the loaded buffer. Reaching its edge means physically running out of scrollable content.

The [prefetch logic](file:///Users/mkarpow/code/grid/kupua/src/hooks/useDataWindow.ts#L385) anticipates downward motion using a fixed 400 ms lookahead; upward fetching starts only 50 items before the boundary. Observed fetches took roughly 740–820 ms—enough to outrun that headroom.

**Recommendation:** fetch earlier in both directions, using scroll speed and measured fetch latency, with bounded headroom. Preserve existing prepend/eviction position compensation. This should reduce stalls without rebuilding scrolling.

If uninterrupted movement is required even when data is late, bounded placeholder space could allow it—but trades stopping for empty tiles and adds position-preservation complexity. I wouldn’t start there. Nor would I simply enlarge the entire buffer: that doesn’t fix late fetch triggers.

## 4. Refactor candidates and order

R numbers are stable references, not mandatory phases. **R2 snapshot ownership and R4 availability
naming are already implemented**; retain their contracts instead of reopening them. Every selected
refactor must pass the three-review gate in the handoff before moving to the next.

### R1 — Pure destination-seek preparation

**Bounded shared-policy slice complete.** [prepareDestinationSeek](../../src/lib/destination-seek.ts)
owns numeric headroom adjustment, carry selection and requested true-end targeting for fixed
Grid/Table and variable Justified callers. The store keeps admission/data ownership and the
scroll hook keeps placement. Fixed extrapolation, variable bounded lookup/empty handling and
their different shrink/clamping calculations remain explicit; they are not unfinished policy
unification. The [scroll guide](00%20Architecture%20and%20philosophy/03-scroll-architecture.md#destination-seek-preparation)
owns the current boundary. No sizing controls, reads, retention changes or performance claim.

Independent correctness/proof, architecture/value and static-performance cold reviews approved
the slice with no blocking findings. The optional near-end-request/not-actual-end discriminator
was added to both existing caller suites. Caller-level empty/short/shrink/headroom/true-end
expectations remain independent; null zones, exact/estimated landing and pending/newer browsing
remain covered by the existing regression surface. Further extraction needs a new bounded
justification, not a wrapper around unchanged geometry-specific branches.

### R3 — Shared layout-aware browser helpers

**Bounded selection-guard slice complete.** [getDensityChangeButton](../../e2e/shared/density-selection.ts)
owns exact accessible-button lookup and the pressed-state guard for shared Grid/Table switches,
the windowed Justified wrapper and the performance selector. Each caller retains generation
capture, real clicks, its no-op contract and every readiness wait. A null result means already
pressed, not settled. The [E2E guide](../../e2e/README.md#density-selection-guard) owns the contract.

All three independent correctness/proof, architecture/value and static-performance reviews
accepted this slice with no actionable findings. The extra Node Promise continuation adds
bounded scheduling work, not another browser command or a moved measurement boundary; no
latency-parity claim follows. The initial full-suite failure remains qualified in §3.

Resident region-based no-op semantics, synchronous pending-input clicks, intentional active
toggles, session seeding and placement readers remain separate. Native-return, centred-return
and density-ratio oracles, request holds and cold/warm controls are unchanged. Further helper
sharing is not automatic: establish a genuinely common contract before adding another helper,
and revise workload identities only if the workload actually changes.

### R6 — Indexed geometry cost and representation

**Approved bounded slice complete (16 October).** Lazy, construction-local creation under the
existing unknown/full/non-final predicate passed validation and all three independent reviews.
The eager implementation packed 48 squares even when no block consumed the estimate. Removing
that pack benefits resident/seek and some indexed constructions, including temporary seek
preparation; it does not improve the usual near-threshold indexed path or directly benefit
Grid/Table. No speedup or heap reduction is measured. Broader block reuse, virtualizer invalidation
changes and temporary geometry handoff remain unjustified. Current contracts belong in the
[scroll guide](00%20Architecture%20and%20philosophy/03-scroll-architecture.md#bounded-justified-geometry-costs);
research evidence and approval status belong here, not in architecture documentation.

#### Research evidence and limits

| Inspected source | Finding / retained constraint |
|---|---|
| [ImageGrid:479](../../src/components/ImageGrid.tsx#L479), [useDataWindow:317](../../src/hooks/useDataWindow.ts#L317) | Construction depends on results identity, offset, regime, total, width and query. Ordinary scroll with unchanged dependencies already reuses layout; maintenance publishes new arrays. |
| [Forward publication](../../src/stores/search-store.ts#L2867), [reverse publication](../../src/stores/search-store.ts#L3052), [dimension overlap](../../src/lib/windowed-justified-layout.ts#L43) | Capacity-bound publication repacks known blocks even when interiors are unchanged. Reuse would need correct ratio/width/membership/true-end keys; net runtime value is unestablished. |
| [Estimate selection](../../src/lib/windowed-justified-layout.ts#L79) | Before R6 the square estimate was eagerly packed once per construction. Its only consumer requires an unknown/full/non-final block; every non-indexed visited block is known. Other indexed builds already share one estimate, not one pack per unknown block. |
| [Block lookup](../../src/lib/windowed-justified-layout.ts#L104) | Item lookup is arithmetic; row/top lookup is binary. Full virtualizer estimation performs O(R log B) row-to-block work; no measured bottleneck establishes a representation rewrite. |
| [Resize capture](../../src/components/ImageGrid.tsx#L515), [placement](../../src/components/ImageGrid.tsx#L637), [packing](../../src/lib/justified-layout.ts#L78) | Any Justified width change invalidates packing; target height changes at 600px. Grid columns remain separate. Retained ratios are not retained packed geometry. |
| [Virtualizer wiring](../../src/components/ImageGrid.tsx#L596) | Installed virtual-core 3.17.11 (`src/index.ts:1263,1315,1384,2111`) does not invalidate on estimator identity. `measure()` restarts at zero; Float64 backing has high-water capacity. Same row count does not mean unchanged heights. No safe narrower reset is established. |
| [Temporary seek](../../src/lib/windowed-justified-layout.ts#L166), [store admission](../../src/stores/search-store.ts#L4048), [publication](../../src/stores/search-store.ts#L4141) | Exact offsets bypass preparation. Inexact preparation builds non-indexed geometry and returns index/carry, then publication builds mounted geometry. Reusing that geometry would need matching regime/width/context/authority, not just matching hits. |
| [Committed snapshot](../../src/components/JustifiedGrid.tsx#L15), [correction](../../src/hooks/useScrollEffects.ts#L305) | Commit-only dimensions and mounted geometry have distinct lifetimes. Width/search/seek/sort/reset guards remain with the correction owner. No new retention or placement authority. |

The canonical [density history](../../e2e-perf/results/density-log.json) contains 15 October
`density baseline` (local media-api) and `density baseline, direct` (direct ES), four samples per
scenario, Chromium 151, 1720×960/DPR2 and no CPU throttle. Both are **pre-seam seek-regime**
evidence. Application fingerprint `e01c03e758237dd9` matches; whole-worktree fingerprints and
corpus totals do not. D5 seek and D6 reflow are revision 2; D7 maintenance is revision 3.
Justified D5/D6 placement medians are 1610.05/110.75ms for API and 869.50/124.40ms for direct ES;
D7 medians of per-run frame p95 are 9.7/50.4ms. These are different whole-workload boundaries,
not packing timings, controlled transport overhead or a before/after result. Placement and
visible-media readiness share a start clock. Latest entries/coverage in [jank history](../../e2e-perf/results/audit-log.json)
and [responsiveness history](../../e2e-perf/results/perceived-log.json) were also inspected:
`local media-api After justified` labels do not make their Grid/Table workloads Justified measurements.

Inspected [packing](../../src/lib/justified-layout.test.ts#L12),
[windowed geometry](../../src/lib/windowed-justified-layout.test.ts),
[mounted scroll](../../src/hooks/useScrollEffects.test.ts#L2479),
[windowed reflow](../../e2e/local/justified-windowed.spec.ts#L70) and
[resident geometry](../../e2e/local/justified-density.spec.ts#L241) controls already cover both
sides of 600px, broad discrete crossing, overlap/eviction, true/temporary tails and bounded
dimensions. New R6 controls specifically count packs and cover adjacent-width correctness.
Unmeasured costs remain near-65,000 indexed construction, continuous/599↔600 reflow, aggregate
JS/typed-array/WASM heap and natural-scroll maintenance frequency. Neither existing geometry
proof nor reduced operation counts fills those gaps. No profiling, live driving or campaigns
are authorised or needed for this bounded work-removal claim.

**Decision boundary:** the proven benefit is one avoided 48-square pack per construction lacking
an eligible consumer. No new cache, retention budget, reads, controls, placement owner or narrowed
measurement invalidation follows. Grid columns and Justified target row height remain distinct.
Further work requires a new bounded justification and explicit approval, including any profiling
or campaign needed for runtime claims. §5 routes to authoritative contracts; implementation history
belongs in the changelog.

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

## 5. Owning contracts

The former proposed amendments are integrated into these guides; keep current contracts there
rather than restoring a second copy here. They constrain later refactors without authorising
new controls, stronger preservation policies, larger resource budgets or performance campaigns.

| Topic | Owner |
| --- | --- |
| Geometry/defaults, commit-only snapshots, distinct sizing parameters | [Component reference](00%20Architecture%20and%20philosophy/component-detail.md#justified-density-componentsjustifiedgridtsx-libwindowed-justified-layoutts) |
| Trailing-row objective, true/temporary ends, underfills and trade-offs | [Deviations](deviations.md#balanced-technical-justified-block-endings-15-october-2026) |
| Transition-specific anchors, ratios, carry and parked header policy | [Position guide](00%20Architecture%20and%20philosophy/02-focus-and-position-preservation.md#4-transitions-and-relaxations) |
| Seek preparation and bounded geometry cost | [Scroll architecture](00%20Architecture%20and%20philosophy/03-scroll-architecture.md#destination-seek-preparation) |
| Current-density destination restoration and native/traversed return | [History guide](00%20Architecture%20and%20philosophy/04-browser-history-architecture.md#independent-density) |
| Spatial keys, off-buffer intent and focus permission | [Keyboard guide](00%20Architecture%20and%20philosophy/keyboard-navigation.md#justified-spatial-navigation) |
| Density selection/toggling, pinned controls and future granularity | [Frontend philosophy](00%20Architecture%20and%20philosophy/01-frontend-philosophy.md#density-is-not-view-mode) |
| DEV availability, fixtures, installed-artifact licensing and safety | [README](../../README.md#justified-development-and-fixtures) |
| Independent browser oracles, holds and temporary-tail proof | [E2E handbook](../../e2e/README.md#justified-proof-contracts) |
| Matched-condition comparisons and measurement limits | [Performance handbook](../../e2e-perf/README.md#coverage-limits) |

### Research references worth retaining

- [Immich timeline source at the examined revision](https://github.com/immich-app/immich/tree/cace887201cb4f9bce960676c2816bfd7948e4f6/web/src/lib/managers/timeline-manager): lazy aspect ratios, estimates and day packing. Its retained months, date navigation and compensation are not Kupua's bounded arbitrary-sort contract.
- [Google Photos design article](https://medium.com/google-design/google-photos-45b714dfbed1): segmented geometry and bounded rendering; historical timing is not a Kupua budget.
- [Flickr photolist](https://code.flickr.net/2015/03/24/much-photos/): bidirectional/middle-entry and incomplete-row handling. A geometry package is not the whole scrolling system; hiding unfinished rows is not an approved policy here.

Borrow architectural lessons, not another application's data model or a second scrolling
owner. Completed research does not need repeating merely because another agent starts.
