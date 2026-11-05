# Kupua Performance Dashboards

All saved-history dashboards live here. Start with [the Performance dashboard](Performance%20dashboard.html);
the [rendering](audit-graphs.html), [responsiveness](perceived-graphs.html) and
[density](density-graphs.html) pages retain their broader historical controls.

Open [Performance dashboard.html](Performance%20dashboard.html) directly in a browser. No server, framework, installation,
application session or live service is needed. The accepted graph-led layout now reads
the three real history sidecars through [dashboard-data.js](./dashboard-data.js).
The curated copy and synthetic design fixtures are not loaded by this page.

Without checkpoint/baseline URL selections, the dashboard opens on the newest
complete registered campaign and its chronological predecessor. Explicit selections
are preserved. A single campaign has no baseline; without campaigns, the curated
recorded checkpoint remains the fallback. Existing comparison-eligibility checks apply.

## Keyboard and Focus

Left/Right traverse the seven supported scrolling direction/load-phase choices in
History or the visible Compare browsing section: Forward gentle/reference/stress,
then Backward gentle/reference/stress/reversal, wrapping at either end. Forward/Reversal
is skipped because reversal data is recorded only for backward D2. Constrained Compare
browsing has only the three forward phases. Density, workload and statistic stay fixed.
Native controls, selected text, evidence views and focused History points keep their
own keyboard behavior; arrows on a History point move between campaigns.

In Search & Navigation's visible Queries, filters, Home & sorting section,
Left/Right cycle Action phase in dropdown order, wrapping at either end. The
regime and comparison selections stay fixed; History and other sections are unaffected.

Tab enables a thin focus ring; pointer input clears it. Programmatic landmark focus
does not draw a surrounding box. Compare controls run left to right as Direction,
Workload, Load phase, Statistic, Density.

## Canonical integration boundary

The approved units keep Overview -> Search & Navigation / Scrolling & Layout / Image
Workflows summaries -> exact evidence.
It registers the four canonical entries (78 records) and one operator-confirmed assembled
proxy baseline (70 records; long responsiveness absent), without modifying any history. Exact expected
scenario sets are cross-checked against maintained manifests; missing or ambiguous
members stay missing and unexpected records are disclosed. Other historical entries
remain available through the retained legacy dashboards, not silently joined by label.

Raw record objects and entry provenance survive intact. Shared interpretation separates
capture validity, outcomes, field contributors, null/zero/absence and comparison eligibility.
Rendering/response revisions, routes and clocks remain distinct; density charts retain
the relevant capture gates and complete-field population checks. Environment comparison
uses the existing real guard and then the actual owning records' contracts. The baseline
is three separately executed checkpoints, not one atomic campaign or a latest-by-label join.
Synthetic comparisons remain test-only.

All evidence routes use `side=baseline` while checkpoint, baseline and C−B direction stay
fixed. All three workflow summaries add group returns; Search owns seeking, D11
refresh/contention and explicitly separate PP10 background publication. Stable IDs include family, kind, timestamp,
scenario and revision (`unknown` where historically absent). Full records and every saved
field remain inspectable. Fullscreen, resident-detail/list-return and selection/panel
records are reachable without inventing new summary charts or latency fields.

Grades remain visibly provisional, not acceptance thresholds. P13c's clocks are separate;
P14 retains U1/U2 limits; JA2 is loaded/stable, not explicit decode. Existing density
indices are not inferred from Overview's sampled forward-step assessments; the Scrolling
summary separately reuses the complete legacy v1 calculation and gates.

## Workflow History (tracked metrics)

Each workflow tab in [Performance dashboard.html](Performance%20dashboard.html) has **Compare | History** views
(`mode=history`; summaries and Overview trend lines link to it). Only **tracked**
metrics get history; the list lives once, in `WORKFLOWS` in [history.js](history.js):

| Workflow | Tracked metrics (columns) |
| --- | --- |
| Scrolling & Layout | Frame p95, pending visible slots, achieved results/s, stop → decoded media (Grid/Justified/Table; D1/D2, phase) |
| Search & Navigation | Visual settlement: PP3 sort, PP7 seek, PP11 Back; JA1/JB1 startup, JB4 indexed seek |
| Image Workflows | P13c decoded/stable, JA2 loaded/stable; P14b loaded-within-cadence % and final landing (U1/U2-limited) |

**Supporting** records (P4/P11/P16, PP6, P2/P8/P17, D3/D6/D7, D5/D11) stay in Compare and exact
evidence; **diagnostic** fields stay in raw records. Every saved entry is a point; no registration
or label grouping. Current/baseline are pinned per family, independently of Compare;
Compare-only header controls and provenance are hidden in History. Colour = topology,
shape = delivery, hollow = operator-confirmed inferred environment (never joined).
Lines join only consecutive values passing `recordPair`. Only recorded histories are
exposed; synthetic fixtures are not loaded by the dashboard or offered as a dataset.
Rules and checks: [evidence](../../exploration/docs/zz%20Archive/deployment-probe-audit-workplan-evidence.md#scrolling-and-layout-history-design-slice).

History points in registered checkpoints or complete campaigns can open their exact
Compare evidence. Points belonging to the selected Compare pair preserve that pair
and current/baseline side; other registered points open their owning checkpoint with
no inferred baseline. The selected field, statistic and scrolling phase/direction
travel with the link. Unregistered history retains its inspector and complete saved
record without inventing checkpoint membership.

## Search & Navigation summary

The tab now lands on a six-group graph-led summary of **28 Search-owned records**:

| Activity | Canonical membership / boundary |
| --- | --- |
| Startup / initial results | JA1 buffer, JB1 indexed; P1 navigation milestones/frame diagnostics are complementary, not pooled with epoch-based startup clocks |
| Queries / filters / Home / sorting | PP1/2/3/4/5/8/9 and JA3/JB2/JB3; independent action phases and all outcomes; P6/P9 rendering evidence expandable |
| Arbitrary-position navigation | PP7 click, PP7b drag release, PP7c buffer, JB4 indexed; distinct D5 Grid/Justified placement/decode and P3/P3b/P7 frame observations |
| History / preservation | PP11 deep-anchor Back restoration; cross-link PP9's chip-removal guard rather than displaying the same record twice |
| Refresh under media load | D11 Grid/Justified quiet/busy arms and saved signed within-repetition data/placement/media deltas; separate isolation/media censoring |
| Background diagnostics | PP10 map publication and entry count; foreground visual phases and user-action grades inapplicable |

Local action-phase/regime controls scope action, seek and restoration rows. Startup,
D5 and D11 retain their own clocks rather than silently adopting that selection. Phase,
regime, group, field, statistic and selected side survive evidence navigation/reload/Back.
D11 tail links select the nested field's p95, not its median; raw responsiveness tails
retain their separate saved field identity. Baseline inspection never swaps the pair.

[search-model.js](search-model.js) qualifies healthy timing populations, background and
paired boundaries through the shared adapter. [search-summary.js](search-summary.js)
reuses the existing aggregate chart primitives and comparison guards. Mixed PP3/PP4
latencies remain healthy-only with all-outcome counts adjacent; all-degraded outcomes
cannot produce timing or paired baseline bars. Baseline observations remain separately
inspectable through their outcome links. Omitted optional `degradedCount` means zero
under the existing aggregation contract, not a new inferred observation.

Only existing PP3/PP7 provisional settlement rules are reused; other actions receive no
new timing grade. Acknowledgement, counts and diagnostic fields are never graded against
settlement thresholds. Optional status null is not immediate feedback; focused status
correlation and store/matched-control attribution remain unresolved. D11 deltas are never
reconstructed from aggregate arms. Baseline D11's 2/4 paired contributors remain visible
without a numeric delta; current 4/4 values remain. Long baseline absence is unchanged.
P1 shift support is unverified: its raw evidence is linked rather than promoted as a
healthy zero. Paint/decode/stable geometry remain distinct.

Offline controls cover healthy/mixed/all-degraded PP3/PP4, unavailable status, PP10
background-only behavior, D11 invalid isolation/media-only censoring, signed/false guards,
missing phases/long baseline, revision refusal, exact-side tail ownership and keyboard /
mobile navigation. Detailed results and fresh-review findings live in the
[Search integration evidence](../../exploration/docs/zz%20Archive/deployment-probe-audit-workplan-evidence.md#search-and-navigation-summary-integration).
Next proposed work is a bounded whole-dashboard consistency/coverage review, not further
feature expansion or another campaign.

## Scrolling & Layout summary

The tab opens an outcome-first comparison using complete adapter records. Dynamic
headlines describe available directional changes for the selected scope; they do not
infer causation, significance or a universal score. Before/After values link to exact
evidence. Change wording and colour account for each metric's desirable direction;
delivered rate above requested demand earns no additional favourable cue. No baseline,
missing fields and incompatible populations remain explicit, never healthy zeroes.

Supporting charts and technical context sit under a single disclosure. Starting
runway/buffer differences remain beside the comparison. Overview keeps its five
existing summaries. Workflow ownership remains:

| Section | Canonical records / presentation |
| --- | --- |
| Browsing | D1/D2 Grid, Justified, Table; gentle/reference/stress and D2 reversal. Direct blocked-time, delivered-rate, pending-slot and frame-p95 comparisons; supporting charts/stability/request evidence remain expandable |
| Density indices v1 | Existing independent progress, smoothness and sampled-stability formulas across both ordinary directions/all phases/reversal; exact limiting components linked; incomplete inputs/censoring withhold indices |
| Stopped recovery | D1/D2 ordinary and D8 constrained groups; independent data-ready/decoded-media clocks, contributors/censors/cohort guards and actual observation cap |
| Transitions/reflow | D3/D6 plus expandable P4a/b, P11 variants, P16a/b, PP6/6b/6c; unlike clocks remain separate; signed displacement/false visibility survive |
| Window maintenance | D7 Grid/Justified frames and eviction/prepend work; Table coverage gap and known foreground limitation explicit |
| Related records | P2/P8/P17 supporting browsing guards; D5/D11 link to Search; D4 links to Image Workflows without duplicating those presentations |

Local density/direction/workload/phase/statistic controls belong to browsing; density
and statistic also scope recovery/layout/maintenance. Whole-journey indices explicitly
ignore local chart phase/direction/statistic choices. D8 is forward-only; an unavailable
reversal selection stays unavailable, never replaced by the reference phase. The URL
retains local controls, summary group, selected side and exact field through reload/Back.
Every plotted mark/value/outcome links to its canonical record and phase-prefixed field.
Baseline inspection does not swap checkpoint/baseline or reverse C−B. Related-workflow
links retain a route back to this summary.

[scroll-model.js](scroll-model.js) reuses the legacy density v1 calculation and adds the
shared interpretation gates; canonical/proxy formula/component parity is tested against
the retained legacy implementation. [scroll-summary.js](scroll-summary.js) composes the
existing aggregate chart primitives. No new index version, thresholds, raw samples,
producer observations or checkpoint membership is introduced. Invalid/unsupported
captures, missing phases, partial recovery and unavailable fields retain raw-evidence
links but cannot generate reassuring numeric assessment. A missing selected field stays
absent even in the evidence headline/chart/delta. Data/media clocks overlap; DOM geometry,
loaded, decoded and painted remain distinct. D9/D10 remain retired.

Local validation covers canonical/proxy anchors and C−B deltas, baseline field ownership,
phase/direction/statistic changes, summary return/reload/Back, keyboard focus, narrow
screen overflow/evidence access, and adverse synthetic startup fixtures. Detailed final
results/review limits belong in the [scrolling integration evidence](../../exploration/docs/zz%20Archive/deployment-probe-audit-workplan-evidence.md#scrolling-and-layout-summary-integration).

## Registered historical baseline

Select **Recorded · canonical images · 24 Oct** against **Proxy baseline · assembled 23–24 Oct**.
The operator confirmed exactly these members after their files/contracts were verified:

| Family / kind | Timestamp (UTC) | Records |
| --- | --- | --- |
| audit / rendering | 2026-10-24T00:14:11.263Z | 34 |
| perceived / short | 2026-10-23T23:29:50.826Z | 15 |
| density / density | 2026-10-24T04:32:34.673Z | 21 |

Long responsiveness is explicitly absent: no older long run is borrowed. The header shows
70 baseline records versus 78 current records. Matching environments permit selected-pair
inspection, but P13c/P14 r2→r3 and unverified revisions refuse comparison; JA2/JB5 have no
baseline, and Table recovery latency stays null on both sides. Current observations remain
visible. Source fingerprints differ and content/cache warmth is uncontrolled: deltas are
C−B descriptions, not isolated delivery effects. Full membership, checks and review limits
are in the [baseline evidence](../../exploration/docs/zz%20Archive/deployment-probe-audit-workplan-evidence.md#historical-proxy-baseline-and-review-corrections).

Traversal findings, cadence percentages and grades share one evidence gate. Invalid or
unsupported captures retain raw-field links/reasons without a numerical assessment or
performance priority; malformed/empty count populations cannot earn reassuring grades.
Valid zero loaded counts, poor performance and censored outcomes are not hidden.

## Engineering overview

**Measure → compare → inspect.** Visible checkpoint/baseline selectors, compact environment
and coverage badges, numerical workflow grades and actual charts replace the narrative
introduction. Ordinary measured actions stay visible alongside exceptions.

- **Scrolling:** aligned Grid / Justified / Table small multiples for achieved results/s,
  pending slots and frame-p95. Units/scales stay separate. Demand and diagnostic references
  are marked; observed maxima remain visible beside medians.
- **Recovery:** a separate constrained Table endpoint panel, including null latency and
  completion/censor counts. A four-second observation cap is never substituted for latency.
- **Traversal:** four cadence/direction rows; percentage loaded within cadence and eventual
  landing are separate aligned charts, with final outcomes and current grades.
- **Search, seek, detail:** independent latency rows with medians and recorded maxima,
  including slow loaded/stable detail entry. Lookup, metadata and decoded readiness are
  not stacked into a fictitious total.
- **Comparison:** eligible baseline bars and absolute/relative deltas; percentage-valued
  measurements use percentage-point deltas plus relative change. No percentage is invented
  against a zero baseline. Incompatible records retain current values without baseline marks.
- **Evidence:** every data bar, maximum marker and numerical value links to its canonical
  field view. Image baseline marks select the baseline observation using `side=baseline`,
  without reversing checkpoint/baseline direction. Search/scroll use the same side
  contract and selected-side ownership; Scrolling now adds the bounded summary above.

[overview.js](overview.js) renders dependency-free HTML/CSS aggregate charts, using the
existing comparison guard and [assessment helpers](assessment.js). [engineering.css](engineering.css)
provides the dense responsive layout. No sample dots, distributions, confidence intervals
or time-series traces are generated. Maxima are recorded aggregates, not synthetic raw trials.

Grades are visible beside numbers and marked provisional once in the chart key; rules
remain inspectable. The scrolling grade refers to the shown forward step, not a full
browsing index. A narrow profile retains explicit gaps and unrated workflows. Synthetic
labels, source provenance, signed/false guards and exact evidence routes remain intact.
Shared n and expandable method notes replace repeated confidence paragraphs on Overview.

## Image Workflows summary

The Image Workflows tab now lands on a compact summary, not an individual observation.
Overview's **Traversal** and **Detail entry** headings also open the matching summary group.
Existing plotted marks still provide direct access to precise evidence.

The summary reuses Overview's chart/table renderers, typography and C/B conventions:

Uncharted Fullscreen/return and Selection/panels groups are compact disclosures with
saved-record counts. Their group links open the corresponding disclosure. Evidence
and validity qualifications remain available without presenting coverage gaps as
large primary-result panels.

1. **Detail opening:** singleton lookup, metadata readiness, decoded/stable returned media,
   and the separate loaded/stable double-click entry. Clocks remain independent; JA2's
   slow observed maximum stays visible. Completion/censor/error counts have individual links.
2. **Traversal:** normal/fast/rapid forward and fast backward, with cadence percentages,
   separate completed-only landing clocks, final outcome counts and provisional grades.
3. **Fullscreen / return:** saved complete observations are linked below, but their timings
   are not charted in this summary. Test-only synthetic JB5 guards demonstrate signed
   displacement and true/false visibility; no new summary timing fields are invented.
4. **Selection / panels:** explicit unimported coverage gap. No fixture observations were
   added merely to fill this section.

“Not charted in this summary” never means “not measured by the campaign”. The recorded
  summary charts six Image Workflows records; complete records remain available. Synthetic profiles
state their own omissions separately. [image-summary.js](image-summary.js) composes the
summary using the shared detail/traversal components in [overview.js](overview.js); no
canonical histories or fixture observations were rewritten.

### Three-level navigation contract

- **Overview → summary → evidence:** section links select `view=images` with an optional
  `group=detail|traversal|return|selection`. The tab alone opens the complete summary without
  automatically selecting a record. Bars/values/outcomes add the stable canonical ID and field.
- **Baseline evidence:** image routes add `side=baseline`; the toolbar's checkpoint and
  baseline remain unchanged. The exact view explicitly labels the selected baseline and
  current counterpart, while deltas remain C−B. Membership is checked against the selected
  side's checkpoint, not a same-labelled observation in another entry.
- **Return:** “Image Workflows summary” keeps the original pair and focuses the owning group.
  Reload and Back preserve group, record, field and side in the URL. Old current-image
  evidence links still resolve without requiring a new parameter.
- **Missing/blocked:** a missing member stays missing when either selector changes; no older
  success replaces it. Comparison eligibility and per-record contract guards are unchanged.

This is the only new workflow summary in this unit. Overview's accepted layout is retained;
Search & Navigation and Scrolling & Layout now use their bounded summaries above;
their exact evidence remains the deeper layer.

## Proposed scoring rules

No new 0–100 experience index. Visible action grades use **Meets / Watch / Weak / Adverse /
Unrated**, scoped to the named action and marked provisional in the chart key. They are
presentation judgements, not recorded scores or approved user-satisfaction thresholds.
Current grades are independent of baseline deltas. Shared n describes scenario observations;
qualified timing populations and incomplete/degraded outcomes remain beside the values.

| Experience | Proposed interpretation | Status / limitation |
| --- | --- | --- |
| Sampled sort | Median ≤1,500ms; observed max ≤3,000ms | Provisional, not all search |
| Sampled seek / detail | Median ≤2,000ms; observed max ≤4,000ms | Provisional; separate boundaries, never pooled |
| Response grade | Meets within expectation; Watch above median expectation; Weak if median or maximum >2× median expectation | Provisional; no imported maximum means no tail reassurance |
| Traversal grade | ≥80%: Meets; 50–79%: Watch; <50%: Weak | Provisional; each direction/cadence distinct; loaded, not decode or paint |
| Adverse outcomes | Any observed degradation/censoring overrides a successful timing grade | Counts/denominators required; a design priority, not a significance test |
| Scrolling reference step | Delivered demand ≥80%, pending slots ≤20%, blocking ≤5%, frame-p95 ≤33.4ms | Existing pressure-reference v1 diagnostics, not calibrated acceptance targets |
| Retained position | Show signed displacement and false visibility independently; no approved displacement tolerance | Any nonzero displacement remains inspectable; no claim to repair existing detectors |
| Missing / unsupported / invalid | Unrated, with reason | Never zero; never inherit an older success |

Preserve the existing **density north-star v1** contract if integrated: weakest normalized
components across both directions/all phases, with its existing validity and sample gates.
This bounded summary does not calculate those indices or density ranks; the retained
density dashboard owns their full gates. It does not turn a single forward step into a
competing score merely because the complete records are now available.

Current quality is separate from change. Eligible differences are descriptive, with no
approved noise band or significance claim. Four-observation nearest-rank p95 is the observed
maximum. P14 U1/U2 timing/cache limits, P13c cache uncertainty, JA2 loaded-not-decoded wording,
uncontrolled content/cache and untracked-source gaps remain in force.

## Interaction walkthrough

1. Start with **Recorded · canonical images · 24 Oct**. Compare the three scrolling charts,
   Table's separate 0/4 recovery, all four traversal rows and the slow detail-entry maximum.
2. Click a bar, maximum or value. Reload, then Back: checkpoint, baseline and exact field
   round-trip. IDs retain family, kind, timestamp, scenario and revision, never array position.
3. Open Image Workflows, inspect P13c's independent clocks and the four traversal rows,
  and use their field/count links. Other image records are reachable in the group
  disclosures and exact-evidence menu without additional summary charts.
4. Use the summary-return link or Back to restore the group. The native baseline selector
  offers the confirmed three-entry proxy assembly; self-comparison is blocked. The current
  78 records and baseline's 70 included records remain distinct, with long explicitly absent.
5. Automated test-only startup data exercises eligible baseline marks, mixed/all-degraded,
  censored, incompatible, unsupported, absent, invalid, signed/false, zero-baseline and
  larger-population controls. It is not a selectable production campaign. Search/scroll
  baseline reload/Back follows the same pair contract without redesigning those pages.

Tables use real captions/headers and selectable field links. Mobile tables scroll within
labelled focusable regions rather than crushing numbers into narrow columns. Navigation
and evidence links support keyboard activation. Tabs focus the content without scrolling
or moving the navigation; explicit evidence links still scroll to their exact record/field.
Tab labels have no Preview suffix, and workflow content omits duplicate breadcrumbs and
section titles. Provenance uses the same compact body/table typography as Overview and
opens below the navigation, as does the independently toggleable pair-eligibility panel.
No hover-only evidence, localStorage, remote fonts or runtime network fetches. Canonical
history sidecars are loaded locally by the page.

## Review Boundary

The requested engineering presentation uses visible provisional grades, not a hidden
policy demonstration or an app-wide score. Threshold calibration and minimum coverage
for broader workflow claims remain unapproved; the graphs themselves show the measured
aggregates and selected comparison without requiring those policy decisions first.

Only the first integration described above is authorized. No producer fixes, campaigns,
new profiles, hosted-build certification, threshold approval or legacy retirement follow.
U1/U2 and the old dashboards' U7/U13/U14 defects remain limited/open; new-slice controls
do not close them by association. Additional workflow summaries are later bounded units.

## Local Validation

Automated canonical/fixture coverage lives in [dashboard-data.test.mjs](../validation/dashboard-data.test.mjs)
and [dashboard-navigation.spec.ts](../validation/dashboard-navigation.spec.ts).
Use `npm --prefix kupua run test:perf-dashboard` for an immediate model-only check,
not alongside the full gate. Final dashboard gates are `test:perf-harness` (already
includes dashboard-data), `test:perf-fixtures` and `typecheck:perf`, each once after
the final substantive batch, using the repository's foreground pipefail/tee rule.
[Validation ownership and focused commands](../validation/README.md) and the
[bounded simplification evidence](../../exploration/docs/zz%20Archive/deployment-probe-audit-workplan-evidence.md#perf-validation-simplification)
own command selection and current validation results. The
[Search integration evidence](../../exploration/docs/zz%20Archive/deployment-probe-audit-workplan-evidence.md#search-and-navigation-summary-integration)
retains the earlier integration's results, findings and limitations.
The following traversal notes describe the preceding accepted correction/baseline unit.

The traversal raw-count regression failed before repair. Fresh read-only review found
an additional malformed-population grading bypass; its fix and real-grader controls were
verified in follow-up with no remaining high-confidence findings in the narrow scope.
Invalid/unsupported and zero/empty/inconsistent traversal, absent long, r2/r3/unverified
refusals, null recovery and exact baseline-side C−B ownership/reload/Back are covered.
Automated tests navigate fresh local-file pages; synthetic cases exist only at test startup.
The real selected comparison was also cleanly reloaded from disk, not injected into the DOM.

## Historical Manual Design Checks

The pre-integration design iteration was inspected in the VS Code integrated browser:

- Image Workflows opens its four-group summary without a record/sidebar. Recorded Overview
  heading → summary → exact maximum/field was exercised with keyboard activation, reload,
  Back and the explicit summary-return link.
- Eligible mixed/prior image comparisons retain checkpoint, baseline and C−B direction when
  inspecting baseline P13c. Selected-side counts and metadata stay attached to the right
  canonical record; returning/reloading preserves the detail group.
- Mixed P13c and traversal completion counts, all-censored image/landing gaps, incompatible
  dataMode/revision pairs, synthetic signed/false return guards and missing records were
  exercised. A baseline selector change to a checkpoint without JB5 produces missing
  evidence instead of retaining the previous successful guard.
- Image detail, traversal and return chart/table layouts were checked at desktop and
  390/320px mobile widths. Group links focus their section; table arrow-key scrolling and
  precise field focus remain functional without page-wide horizontal overflow.

- All 56 whitelisted recorded environment values matched the four public source entries;
  CPU throttle is 0 throughout, and omitted origin remains null rather than a fixture default.
- Graph values and grades update for healthy-scroll/poor-traversal, mixed completion,
  all-degraded and missing-profile fixtures; ordinary chart rows remain visible.
- At 1366×768, the toolbar, numerical summary and entire first chart row fit in the viewport
  both without a baseline and with the eligible synthetic pair.
- Current and baseline bars, recorded maximum markers and field links were exercised.
  Clicking a baseline mark selects its own canonical record; Image Workflows keeps the pair
  direction fixed, and reload/Back restores the exact field and original pair. Absolute/percentage deltas and a temporary synthetic zero-baseline
  control were checked; zero-baseline percentage change stays unavailable.
- Mixed P13c/P14/PP3 timings disclose their two qualifying observations; partial density
  recovery retains null latency. The original all-degraded, false/signed, unsupported and
  missing-profile controls remain usable.
- Recorded P14b counts, revision and limited timing; P13c failure subset; Table D8 null endpoint.
- Eligible synthetic comparison; incompatible dataMode/revision; no fabricated timing delta
  for all-degraded or censored records; unsupported and missing-profile states.
- Signed negative drift and false visibility remain visible; density medians and adverse
  observed maximum remain accessible.
- Evidence-link keyboard activation, destination focus, reload and Back round-trip.
- Pair disclosure opens/closes with click, Enter and Space, independently of provenance;
  explanations update when the pair changes. Desktop/mobile tab positions and scroll
  remain unchanged through all five sections. Provenance body, notes and tables match
  Overview's 12px body/table size; duplicate section headings and Preview suffixes are absent.
- Desktop and mobile layout inspection: scrolling small multiples align on desktop and
  stack on mobile; selectors remain on one toolbar at 390px and 320px, without page overflow.
  Wide traversal/action tables scroll in labelled focusable regions; arrow-key scrolling
  was checked. The exact evidence tables retain their existing responsive behavior.
- A clean reload of the complete prototype had no page errors or failed requests;
  resources remained local files only.
- Native picker focus is reachable by Tab and programmatic selection works. **Native popup
  value changes via simulated arrow/Space keys could not be verified in this browser host**;
  manual keyboard selection remains a review item. No custom dropdown was introduced just
  to work around automation behaviour.
- JavaScript syntax checks and editor diagnostics: no errors.

No performance campaigns, dry runs, app/E2E suites, live requests, private logs, dependencies,
commits or pushes. No screen-reader, physical mobile/touch or cross-browser certification.
Existing application behaviour and measurement code were not changed. Stop here for operator
presentation review and engineering measurement review; integrate one approved slice next.
