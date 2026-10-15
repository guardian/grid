# Justified density: current design, verification and next decisions

**Status: implemented and likely to be retained.** Normal development offers Table,
Grid and Justified; grid remains the default. Latest validated baseline (15 October
2026): **2,984 unit tests / 89 files, production build, and 464 local E2Es passed**,
with no E2E retries or skips. No performance campaign has measured justified yet.
Production inclusion still requires licensing clearance. No commits or pushes authorised.

This is the current technical plan, not an execution diary. Implementation history belongs
in [changelog](changelog.md); process ownership and temporary state belong in
[worklog](worklog-current.md). Preserve existing uncommitted changes. Completed research
and the archived cleanup campaign are not new work or additional implementation gates.

## Continuation boundary

The three approved independent cold reviews have completed. Their bounded corrections
are implemented; §8 records findings and dispositions. Do not commission the same reviews
again or repeat completed research. Preserve all uncommitted work. Runtime ownership and
any unfinished verification belong in [worklog](worklog-current.md).

Next decisions are a separately scoped justified performance-harness slice (§5), licensing
clearance before production inclusion, and only later a bounded seam experiment (§7).
Existing campaigns do **not** cover justified and have **no density-selection CLI switch**.
No campaigns/dry runs, seam/grouping work, parked +36/+37px policy change, increased resource
limits, new infrastructure, commits or pushes are authorised by the completed review mandate.

Keep focus/selection/viewport distinctions and existing query/history/viewer ownership.
Documentation integration remains queued in §9; current edits are limited to this plan,
worklog, implementation changelog and the performance README. No new audit/report files.
Use only verified owned app processes; the Python supervisor is intentional. Its tool handle
can finish while OS children remain alive. Never infer stopped services from that handle,
kill arbitrary listeners, replace the tunnel/resizer or persist runtime secrets.

## 1. Availability, fixtures and licensing

| Mode | Configuration | Behaviour |
| --- | --- | --- |
| Normal development | No layout environment switch | Normal configured datasource and real queries; all three density buttons available. |
| Synthetic fixture | `VITE_JUSTIFIED_PREVIEW=true`; `npm --prefix kupua run dev:justified` | 96 varied synthetic images; simulated matching; SVG media. Server uses port 3040. |
| Real-photo sample fixture | `VITE_JUSTIFIED_PREVIEW=sample` | One capped read of up to 96 images, then in-memory ordering/cursor/range operations; matching simulated; reload resamples. |
| Production build | `import.meta.env.DEV` is false | Justified preference falls back to grid; packing/windowed renderer excluded pending licensing clearance. |

`JUSTIFIED_AVAILABLE` is `import.meta.env.DEV`: the licensing-qualified availability
boundary, **not an extra live-mode switch**. `WINDOWED_JUSTIFIED_ENABLED`
means development without either resident fixture. The old `live` environment value is
unnecessary. Neither constant selects a performance scenario. See the naming refactor below.

The sample datasource coalesces its initial read, uses no PIT/exact full-index count,
times out after 15 seconds and caches failure as an empty sample rather than falling back
to unrestricted reads. No sample metadata is persisted. The cap does not suppress normal
thumbnail/detail or optional enrichment traffic; these fixtures are not network-isolation
or real-query certification. Retain their honest data notices; the ordinary app has no
prototype banner or label.

The installed engine is exactly `@immich/justified-layout-wasm@0.4.3`. Its published
artifact includes AGPL-3; the previously examined upstream source LICENSE is MIT but
metadata/artifact differ. Prototype/development use was explicitly approved; release
clearance was not. Do not relabel the installed artifact MIT or repeat licensing research
without a concrete promotion decision. WASM follows the chosen engine, not a measured
Kupua speed advantage. Do not incidentally upgrade unrelated transitive advisories.

## 2. Implementation map and layout model

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

### Packing and boundaries

- Use oriented dimensions, falling back to square for invalid/missing dimensions; decoding
  images does not determine layout. Retain whole images, ordering and all available items.
- Current target heights: **190px at widths >=600px, 130px below**; gap 4px; height tolerance
  0.5. No crop, hidden-final-row, default-size or always-filled-row policy change is approved.
- Independently pack **48-image technical blocks**, unrelated to network pages or dates.
  Indexed boundaries use exact result positions. Seek-mode ordinals follow overlapping
  identities, not estimated global ranks. Changed query or absent overlap discards context.
- A true first/last result block truncates unavailable exterior slots. A temporary loading
  edge does not confer true-start/end authority. Never rechunk from the moving buffer's zero.
- Unknown dimensions use square estimates. Filling them may repack their block; the existing
  scroll owner compensates around an admitted resident identity. Estimates are not a claim
  of exact global pixel positions or complete catalogue knowledge.
- The current model retains ID/ratio entries for its buffer and intersecting boundary blocks,
  bounded by buffer length + 94. Cross-density context holds dimensions/identities, not image
  records. Unloaded indexed blocks share a packing template plus per-block offsets. Assess
  aggregate retained state and work separately in performance review; these bounds alone
  are not a frame-time or heap-performance certificate.
- Defaults remain resident threshold 1,000, indexed threshold 65,000 and buffer capacity
  1,000 (configurable). No larger requests, extra dimension fetches or raised limits were added.

### Shared behaviour rather than a second gallery

Justified supplies layout to the existing image grid: cells, selection, drag/long-press,
image-safety treatment, detail/fullscreen and navigation owners remain shared. Image-only
cells deliberately omit informational metadata/badges, not selection or safety indicators.
Horizontal keys follow result order; vertical keys choose the closest horizontal centre
in the adjacent row, with result-order tie breaking. Page movement uses actual row geometry;
selection/phantom paging must not promote focus.

A single geometry registry serves logical row lookup. Fixed layouts keep arithmetic access;
variable windows expose explicit alignment and destination-seek preparation. Never return
fake columns/average row height to the legacy fixed accessor to bypass unsupported paths.
Browser anchoring and virtualizer size compensation are disabled for justified so they do
not double-apply the scroll owner's correction.

## 3. Preservation contract

Position means **identity, coordinate, logical result edge and authority to place**, not
merely a stored focus ID or scrollTop. Existing policies intentionally differ by transition.

| Transition | Preserve |
| --- | --- |
| Settled density switch | Resolvable buffer-resident focus, otherwise viewport anchor; row-top ratio including header flow, visibility clipping and true-edge policy. Offscreen resident focus can pull the view back; nonresident focus cannot. Selection is not a separate chooser here. |
| Pending browsing + density | Pending destination retains admission authority. Density disposal may retire placement without cancelling useful discovery. Indexed destination and buffer-local departure have different coordinate roles. |
| Query/filter/AI | Capture before publication. Focus/remembered detail identity, otherwise viewport centre; selection is not the query anchor. Preserve ordinary neighbour/top fallback versus finite-AI top relaxation. |
| Sort | Selection anchor can outrank focus as the placement target without replacing remembered focus. Preserve existing explicit/phantom and finite-AI distinctions. |
| Back/Forward | Destination snapshot chooses identity, ratio and focus/NONE in the current density. No departing-neighbour adoption; missing destination keeps existing top/no-focus fallback. |
| Width reflow | Resolvable selection, then focus, then viewport anchor; capture before reflow and retain that operation's anchor. An offscreen selected anchor is not promised to become visible. |
| Detail/fullscreen | Native close without traversal preserves the mounted list without scrolling; traversed return centres through current geometry. Preserve entry identity, missing-target waits and supersession. |
| Prepend/eviction/estimate correction | Retain a resident viewport identity and old/new row-top difference. One correction owner; no simultaneous fixed, browser and virtualizer compensation. |
| Seek/Home/End | Exact index and estimated/buffer-local regimes stay distinct; preserve headroom, reverse-compute/flash avoidance, cursor mapping and separately owned keyboard focus intent. |
| Logo Home/new-images refresh | Deliberate reset published with data. Offset zero is not reset authority; loaded-buffer bottom is not true result end. |

Search/history capture uses logical row coordinates excluding header/padding flow; density
capture includes header flow. Do not replace both with raw DOM image coordinates. Detail
centres retain table's usable-height adjustment. Generation, publication, navigation,
history-entry and focus-intent guards have different lifetimes: do not substitute one epoch.

Variable-to-fixed density round trips can accumulate integer scrollTop rounding. The
implementation carries the unrounded authored ratio only while target, applied scroll,
row geometry, viewport/header and publication remain unchanged; newer input retires it.
Review these invalidation conditions rather than removing the carry as cosmetic state.

### Parked header offset

[Existing B19/C27](zz%20Archive/not-yet-another-audit-ledger.md#b19) records +36px on native
Back from a true Credit-null tail. The paired fixed-grid/justified history→table→density
witness measures +37px in its viewport. These are distinct reproductions; a shared root
cause is not proved. Preserve the current policy and measured-header oracle, not a widened
tolerance. Repair requires a separately agreed all-density coordinate change. Neither
witness excuses new drift; do not create a duplicate issue.

## 4. Controls and useful lessons

Table / Grid / Justified are independent icon buttons with stable names and pressed states.
Grid selects grid and is idempotent when active; active Table/Justified toggles back to grid.
All three icons have 14px painted bounds. Material's extra viewBox padding needs compensation;
matching SVG element sizes alone does not match visible artwork.

The toolbar's summary/tickers scroll within their own bounded strip; density, panel and
compact selection controls stay pinned. The app shell uses `overflow: clip` on both axes.
**Hidden overflow is still programmatically scrollable:** native Tab to an offscreen
control reproduced whole-shell displacement, so this was not automation-only. Do not
restore `overflow: hidden` as an equivalent clipping style or hide inaccessible controls
without retaining a usable route to them. Native keyboard tests cover 320/393px and selection.

Other lessons worth retaining:

- Necessary Home and publication guards are not clutter. Name the responsibility removed
  before deleting state; retain the existing distinct ownership proofs.
- Engine height caps can leave underfilled rows independently of block seams. Raising the
  cap alone can make giant portraits. Floating-point tolerances permit rounding, not crop
  or changed aspect ratios; an earlier evaluated engine failed this distinction.
- Very narrow portrait cells can make selection targets overhang. Real images rarely show
  the synthetic extremes, but rarity is not native-touch usability proof.
- Density acknowledgement/loading=false is not proof of final painted placement. Use the
  action's actual readiness condition and independent identity/geometry oracle.
- Controlled backward-request holds should count that operation, not unrelated concurrent
  forward maintenance. Do not hide extra requests by relaxing budgets without attribution.
- A hidden shared tab or driver-induced ancestor scroll can confound observations. Verify
  foreground, runtime source and hit-tested targets before calling it a layout defect.

## 5. Verification and performance coverage

Latest baseline (15 October 2026; commands run from repository root with foreground tee):

| Command | Result |
| --- | --- |
| `npm --prefix kupua test` | 2,984 passed / 89 files. |
| `npm --prefix kupua run build` | Passed; no production WASM assets. Existing large-chunk advisory remains. |
| `npm --prefix kupua run test:e2e -- kupua/e2e/local/justified-windowed.spec.ts --retries=0 --max-failures=1` | 12 passed after correcting the maintenance-hold arrangement race. |
| `npm --prefix kupua run test:e2e -- --retries=0 --max-failures=1` | Final frozen-source run: 464 passed, no skips/retries, 7.3m. |

An earlier full attempt was invalidated by a source-comment edit during execution: its
trace showed Vite reconnects during the table-density handshake. The clean run above replaces
that contaminated attempt, without tolerance changes. Freeze source/configuration during tests.

After validation, the owned TEST frontend/proxy were restored without replacing the existing
tunnel/resizer. The shared tab confirmed the read-only non-local ES adapter, 200 buffered images
and four matching served-source hashes. It remained hidden; media was pending, not a verified
fresh thumbnail/paint pass. Earlier foreground functional evidence remains separately qualified.

Proof entry points:

- [Packing](../../src/lib/justified-layout.test.ts) and [windowed layout](../../src/lib/windowed-justified-layout.test.ts): ratios, mapping, partial/true edges, overlap-derived ordinals and bounded dimension retention.
- [Mounted scroll controls](../../src/hooks/useScrollEffects.test.ts): non-uniform capture/placement, delayed geometry/prepend and newer-seek ownership; retain fixed-density controls.
- [Resident journeys](../../e2e/local/justified-density.spec.ts): density/panels, spatial keys, selection, history/header policy, detail/fullscreen and responsive geometry.
- [Windowed journeys](../../e2e/local/justified-windowed.spec.ts): indexed and forced-seek, delayed maintenance, forward/backward eviction at capacity, pending seek/density, history/viewers, empty query and real edges.
- [Density controls](../../e2e/local/density-controls.spec.ts): toggle/no-op semantics, painted icon geometry and narrow keyboard accessibility.
- Existing [history](../../e2e/local/browser-history.spec.ts), [browse-density](../../e2e/local/browse-density.spec.ts), [forced-seek](../../e2e/local/forced-seek.spec.ts), [selection](../../e2e/local/selections.spec.ts) and store suites remain controls, not redundant history to delete casually.

Functional projects use normal 3000, forced-seek 3030 and synthetic fixture 3040 servers;
windowed justified projects reuse the first two. Local E2Es refuse real ES. Use relevant
selectors while iterating and required regression gates after corrections; do not multiply
all dimensions into a Cartesian suite or waive existing pixel/identity assertions.

Bounded foreground TEST checks have exercised real thumbnails, browsing beyond 96 images,
deep seek, nonresident-focus fallback, density/detail return and real filter changes. They
are not endurance, native-device, every-race or performance certification. No live metadata,
identities, signed URLs or credentials belong in repository evidence.

**Performance coverage gap:** existing jank/perceived campaigns initialise grid and include
specific table transitions. They do not automatically exercise justified, and the runner has
no density-selection switch. Naming a campaign “justified” or choosing the view in another
tab changes neither workload. The [performance README](../../e2e-perf/README.md#justified-density-availability-is-not-campaign-coverage)
now makes this explicit. Earlier generic campaign recommendations were insufficient for a
justified comparison; no justified performance result should be inferred from them.

Before campaigns: add explicit justified workloads or a reviewed density parameter, adapt
readiness/geometry observers, and distinguish report identities from historical grid/table
series. Validate locally without running live/perf campaigns. Keep setup outside measurement,
compare matched corpus/width/media state/actions, and preserve old scenario definitions.
Actual jank/perceived campaigns remain **operator-run**, including any dry runs.

**Proposed next slice (separate approval):** a small set of explicit justified scenarios:
warm interior scroll, one publication/eviction, one seek, and width/density reflow. Select
indexed/forced-seek cases rather than multiplying all dimensions. Setup must verify actual
density/regime, source position, placement ownership, viewport and media/cache class outside
the timed boundary. Keep cold lazy-load cost separate. Geometry observers retain anchor
identity in browser memory and distinguish data-ready, geometry-settled and decoded-media
completion. New scenario IDs/revisions and density-tagged series preserve historical reports.
Local adversarial harness fixtures must reject wrong density, stale identity, missing phases,
pending requests and mixed report identities before any campaign. This is substantive harness
work, not a label/selector patch; no performance benefit is promised in advance.

Existing rAF/LoAF/layout-shift/DOM metrics do not measure packing allocations or heap retention;
fixed-duration sampling is not action-to-placement latency, and geometry stability is not
thumbnail decoding. Resource Timing covers completed browser transfers, not outstanding reads
or backend request counts. These measurement limits constrain any proposed comparison.

## 6. Refactors worth assessing

These are candidates, not a cleanup mandate. Each proposal must identify a responsibility
or competing owner removed, the retained owner, benefit to existing densities, migration
cost and preserved proof. Reject wrappers, speculative flexibility and work justified only
by sunk effort. A concrete correctness fix outranks structural tidiness.

### R1 — Pure destination-seek preparation

**Deferred, worthwhile separately:** review found duplication, not a demonstrated landing
defect. Fixed arithmetic permits unbounded reverse rows; variable lookup clamps to available
rows and handles empty destinations explicitly. Merging this now adds fixed-grid regression
risk without correcting a known failure. First specify independent empty/short/shrink/headroom
and true-end controls, then remove the duplicate policy in one bounded slice.


**Problem:** fixed reverse-computation and variable `prepareSeek` both deal with headroom,
true-end selection and buffer-shrink clamping, while store publication/diagnostics surround
them. Review for duplicated policy or future divergence, not merely long functions.

**Candidate:** a pure destination-geometry input/output boundary that centralises genuinely
shared policy while retaining explicit fixed/variable geometry operations. It must perform
no reads, scroll writes, focus changes or publication. The store remains the admission and
data owner; the scroll hook remains the placement owner. Do not create a second lifecycle.

**Value/proof:** simplify independent grid/table behaviour as well as justified. Preserve
exact versus estimated landing, null zones, empty/short buffers, true End, prepend headroom,
sub-row carry and clamping using independent expected results plus pending-browse controls.
Do not proceed if the only result is a wrapper around two unchanged implementations.

### R2 — Explicit ownership of layout snapshots

**Implemented:** packing no longer publishes cross-density context during render. ImageGrid
publishes its committed layout through one callback; JustifiedGrid retains only its bounded
dimension snapshot. A Strict Mode/Suspense witness proved that abandoned query work formerly
erased the committed overlap origin. The two lifetimes remain distinct; they are not duplicate
placement owners. Query/no-overlap replacement still invalidates context.

**Retained boundary:** mounted geometry belongs to ImageGrid; cross-density context belongs
to JustifiedGrid. Do not replace these with a global full-layout cache or retain visited
history. Existing width/overlap/eviction tests and the new publication-boundary witness cover
different responsibilities. Aggregate heap retention remains a separate R6 proof question.

### R3 — Shared layout-aware browser helpers

**Narrow correction implemented:** windowed tests now select idempotently and confirm the
requested region; repeated selection must not advance restoration generation. Broader helper
consolidation is deferred: shared grid/table helpers are also called by performance scenarios.
Moving their waits would alter measurement boundaries; duplicated labels alone do not justify
that churn. Resident/windowed placement oracles stay independent.


**Problem:** grid/table-specific selectors coexist with resident/windowed justified helpers
for choosing density, locating the active viewport and reading placement. Duplication risks
future controls or layout changes leaving one proof family stale.

**Candidate:** share stable selectors and explicit selection/read APIs. Keep “select this
view” distinct from “click its toggle again”. Preserve each caller's readiness, operation
hold and independent oracle; do not merge native-return, centred-return and density-ratio
checks into a generic “settled” wait. Remove redundant helpers only after mapping consumers.

**Value/proof:** benefits fixed grids and future sizing too. Perf callers must not gain extra
setup/action/wait inside measured boundaries. Retain cold/warm, blank/reused/reload and
wrong-density rejection controls; revise scenario identities if a workload actually changes.

### R4 — Availability and fixture naming

**Implemented:** `JUSTIFIED_AVAILABLE` and `WINDOWED_JUSTIFIED_ENABLED` replace the misleading
preview/live constant names. No new flag module or operator switch. Fixture selection remains
separate from density/backend choice; production fallback, inline import tree-shaking, normal
datasource selection and both resident fixtures remain intact.

### R5 — Future discrete sizing, without speculative controls

Grid may later vary columns; justified may vary target row height. Share capture/reflow
contracts, not fabricated “justified columns”. Assess any refactor against these separate
parameters and preserve current defaults. Do not implement controls/presets/fluid zoom now.
Extract a shared operation only if it removes existing duplicate capture/restore work and
retains selection/focus/viewport precedence, not because a hypothetical API looks elegant.

### R6 — Indexed geometry cost and representation

Static review confirms construction/measurement invalidation on publication or resize, not
packing every scroll frame. Every layout currently resets virtualizer measurement; its size
walk starts at zero. Repacking and destination preparation may duplicate work. These are
unmeasured cost hypotheses, not evidence for a larger cache or a prefix-tree rewrite.

Separate cardinalities: for a buffer of N images, dimensions are at most N+94; identity maps
hold at most N each. Known packed blocks are bounded by the intersecting buffer blocks;
unloaded full blocks share one 48-item template. Indexed descriptors are O(ceil(total/48))
(up to 1,355 at the default 65,000 threshold), and virtualizer storage is O(row count), with
allocated high-water capacity. Mounted old/new layouts, temporary seek preparation and the
cross-density dimension snapshot can coexist. The Map bound is not an aggregate heap proof;
future heap evidence must include JS, typed arrays and WASM, plus transient reachability.


Review block construction, prefix lookup, repeated estimation, virtualizer measurement
invalidation and retained snapshots. Distinguish work per publication/resize from per scroll
frame. Consider compact prefix corrections, reusable immutable blocks or narrower invalidation
only when code evidence or measurements identify a meaningful cost. Preserve explicit unknown
geometry and bounded cache eviction; do not gain speed by retaining catalogue-wide dimensions.
This static assessment is useful before campaigns; claims of improvement require matched runs.

## 7. Next seam experiment and grouping boundary

The recurring gaps are currently the last rows of 48-image blocks; extreme-ratio height caps
can create additional gaps. **Exactly 48 and visibly underfilled seams are not requirements.**
Stable bounded work and position preservation are the constraints to retain.

After review/corrections and suitable performance coverage, compare only a small number of
concrete row-aware boundary or bounded-overlap candidates. Use varied ratios and middle-entry
fixtures; measure seam appearance plus append/prepend, eviction, resize, history/density and
newer-input behaviour. Define the retained boundary context, invalidation and request budget
before coding. Do not “solve” gaps by stretching a few images into giant rows, hiding images,
cropping, increasing resource limits or repacking the whole moving buffer.

Semantic groups are independent: a large day can span many invisible technical blocks;
other sorts may support credit/collection groups or no grouping at all. Variable group sizes
are not a reason to expose arbitrary technical batches. Grouping remains deferred.

## 8. Cold-review findings and disposition

Three independent read-only contexts reviewed correctness/test adequacy, architecture/refactor
value and static performance/measurement readiness. All reports were collected before product
edits. The following is the durable disposition, not a new audit campaign.

| Finding | Classification and disposition | Independent proof |
| --- | --- | --- |
| Off-buffer vertical/page keys returned without recovery or newer intent | **Defect, fixed.** Queue row/page intent through the existing snap-back owner; resolve against destination geometry after admission. Fixed destination after density change uses its own geometry. No fabricated columns or second seek lifecycle. | Four keys fail before repair; mounted irregular-row destination expectations, unpublished-total and newer-horizontal-input controls; native indexed/forced-seek browser journeys. |
| Publication correction elected B but used the first surviving identity A in B's old row | **Defect, fixed.** Preserve elected identity when it survives; only fall back to old-row neighbours when it does not. | Split-row witness originally moved by 200px rather than 400px; existing prepend/newer-seek controls retained. |
| Cross-density snapshot mutated during speculative render | **Concern reproduced and fixed.** Commit-only snapshot publication, retaining distinct mounted-layout and cross-density lifetimes (R2). | Strict Mode/Suspense abandoned query render formerly reset origin40 to0; query/no-overlap replacement controls remain. |
| Windowed selector always clicked an already-active non-grid button | **Latent helper defect, fixed.** Idempotent selection and requested-region assertion; no perf-helper timing changes. | Same-target selection leaves restore generation unchanged. |
| Fixture hold sometimes installed while automatic backward work was already running | **Test arrangement race, fixed.** Wait for existing maintenance/cooldown before installing the next-read hold. No request/tolerance relaxation. | Failed trace explicitly reported backward-in-flight refusal; existing exact one-held-call and position oracles retained. |
| Historical preview/live names | **Bounded simplification, implemented** (R4). | Existing fixture/DEV/production preference matrix and production build exclusion. |
| Duplicate seek preparation policy / broader browser helper consolidation | **Deferred structural proposals** (R1/R3), not established user-facing failures. | Require independent edge policy controls / perf consumer boundary mapping before extraction. |
| Publication cost, full measurement invalidation, aggregate retention | **Unmeasured hypotheses/coverage gaps** (R6). No measured slowdown or leak established. No cache/budget increase. | Future operation-count and aggregate lifetime controls; operator timing campaigns only after suitable workloads. |
| Natural-scroll request frequency | **Coverage gap.** Page size/capacity are preserved, but maintenance holds do not prove equivalent native-scroll request frequency. No amplification demonstrated. | Future direction-attributed local scroll observation through forward eviction/reverse prepend; count starts/completions/cancellation/outstanding work separately. |

Future sizing controls/frameworks are deferred (R5); the current column versus row-geometry
separation already accommodates discrete sizing. Reject a second navigation owner, invented
fixed scalars, wholesale continuity rewrite, catalogue-retaining caches and optimisation claims
without measurements. No new semantic groups, seam hiding or parked header-policy repair.

## 9. Operating boundaries and documentation disposition

Use only owned app/helper processes; verify ports and identities before stopping anything.
Warm TEST setup can reuse an existing tunnel on9200 and resizer on3002, discover configuration
in memory, and start only frontend3000/proxy3001. The normal startup script can stop local ES,
replace infrastructure and write a temporary credential file: its existence is not permission
for those side effects. Current process IDs/page handles belong in the worklog, not this plan.
Read the [browser playbook](embedded-browser-playbook.md) and [safeguards](infra-safeguards.md).

Read-only TEST scope is bounded; no writes, harvesting, index migration, new backend contracts,
secret persistence or safeguard changes. Stop repeated failed remote attempts once credential
expiry/unavailability is established and continue independent local work. Do not claim missing
live checks passed, refresh credentials autonomously or replace authentication with a bypass.

Queued owning-document integration (not yet authorised beyond the performance README):

| Owner | Durable payload |
| --- | --- |
| AGENTS/component guide | Implemented shared renderer/geometry/window contracts and current routing; no phase narrative or test-total history. |
| Position/scroll guides | Transition-specific anchors, coordinate spaces, correction authority, subpixel carry and known header-offset exception. |
| Runtime/setup guide | Ordinary DEV availability versus production gate; synthetic/sample commands, data limitations and normal datasource behaviour. |
| Functional E2E handbook | Three-server topology, justified projects and independent-density/native-keyboard proof; no performance claims. |
| Deviations guide | Image-only cells, spatial keys, independent block seams/estimates, single correction authority and licensing-qualified engine choice; what/why/trade-off. |
| Existing B19/C27 record | Cross-reference distinct +36px/+37px reproductions without inventing a duplicate defect or asserting a shared cause. |

## Research references worth retaining

- [Immich timeline source at the examined revision](https://github.com/immich-app/immich/tree/cace887201cb4f9bce960676c2816bfd7948e4f6/web/src/lib/managers/timeline-manager): lazy aspect ratios, estimates and day packing. Its retained months, date navigation and compensation are not Kupua's bounded arbitrary-sort contract.
- [Google Photos design article](https://medium.com/google-design/google-photos-45b714dfbed1): segmented geometry and bounded rendering; historical timing is not a Kupua budget.
- [Flickr photolist](https://code.flickr.net/2015/03/24/much-photos/): bidirectional/middle-entry and incomplete-row handling. A geometry package is not the whole scrolling system; hiding unfinished rows is not an approved policy here.

Borrow architectural lessons, not another application's data model or a second scrolling
owner. Completed research does not need repeating merely because another agent starts.
