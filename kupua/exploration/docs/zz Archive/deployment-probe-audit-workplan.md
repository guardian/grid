# Deployment Measurement and Dashboard Workplan (Archived 25 October 2026)

**Current checkpoint — 25 October 2026:** The operator-authorized
[validation simplification](deployment-probe-audit-workplan-evidence.md#perf-validation-simplification)
removed wording/source duplication, refresh cross-products and repeated baseline
navigation; preserved unique controls and established command names. Offline,
browser-fixture and compiler final gates pass. Fresh read-only review identified two
unique controls; censored-current baseline inspection and legacy audit loading are
restored and affected gates pass. Dashboard-data is included in the harness, not an
additional final gate.
This pass stops after review: no product/producer/measurement/workload/history/threshold
changes, campaigns, live access or Git mutations. The prior bounded dashboard
correction, 78 canonical / 70 proxy receipt, absent long baseline and supported legacy
pages stand. Workflow [History views](deployment-probe-audit-workplan-evidence.md#scrolling-and-layout-history-design-slice)
and Overview trends still await operator review; PP3, deferred RTT and producer
limits remain. Any further campaign/dashboard work requires separate agreement.

**Producer changes:**
- **Campaign ID — implemented 25 Oct:** one ID per runner invocation on every family entry;
  a manifest (requested suites/scenarios, runs, filter, topology/delivery, entry refs) is
  published in the existing all-or-nothing transaction to `campaign-log.json`. Complete
  manifests (all requested suites, full repetitions, no filter) become dashboard checkpoints
  automatically. Old logs untouched; historical grouping stays operator-confirmed. Attempt
  journal remains a separate optional unit.
- **Noise — first step done:** between-campaign spread estimated from existing comparable
  history ([evidence](deployment-probe-audit-workplan-evidence.md#scrolling-and-layout-history-design-slice)).
  Wording separates observation, repeatability and causation; SD not promoted. **Pending
  decision:** retain sanitized per-repetition values (with outcome state/order) for tracked
  fields only.

## Purpose and Document Ownership

Deliver shorter useful campaigns and one understandable, trustworthy dashboard.
A non-engineer must see what changed, what failed, whether comparison is valid and
what was not measured; engineers must reach exact evidence.

- **This workplan:** current checkpoint, ordered work, decisions and acceptance criteria.
  Replace stale status; do not append session/campaign narratives.
- **[Matrix reconciliation](deployment-probe-audit-matrix.md#current-follow-up-reconciliation):**
  sole current U1-U18 closure ledger, linked to the dated challenged audit underneath.
- **[Evidence](deployment-probe-audit-workplan-evidence.md):** latest canonical assessment
  and earlier repairs, campaigns and negative controls; duplicated planning text is removed.
- **[Measurement reference](../../../e2e-perf/measurement-reference.md):** maintained contracts;
  [operator guide](../../../e2e-perf/README.md): commands; [changelog](../changelog.md):
  code-change history. Session notes stay in the temporary worklog.

## Verified Starting Point

| Area | Current evidence | Planning consequence |
| --- | --- | --- |
| Canonical M5 coverage | Rendering 34, short 15, long 8, density 21 IDs; four observations each, saves 08:30–08:49 UTC, 24 October; sidecars match | Early confidence checkpoint achieved; no repeat needed merely to start design |
| Measurement outcomes | P14b median 3/15 within cadence and 6,653ms final landing; Table constrained recovery 0/4 | Show slow/censored outcomes; campaign completion is not app health |
| Browsing | Grid/Justified/Table middle forward frame-p95 medians 50.25/17.55/62.35ms | Keep achieved progress, frame cadence and media readiness distinct |
| D11 | Latest canonical comparisons valid 4/4 for each layout, unlike proxy 2/4 | Do not invent an isolation repair prerequisite from superseded evidence |
| Audit closures | U8 ordinary redaction/private exception, U10 wording and U11 gate documentation/tests complete within their bounds | Other units need explicit disposition; P14 revision 3 censoring did not close U1/U2 |
| Presentation | New slice reads full records from the three sidecars; legacy responsiveness retains its lossy P13c import | Keep old links; do not mistake bounded integration for legacy U7/U14 closure |
| Hosting | Evidence is development-app M5; M6 harness unsupported | Hosted measurement remains a separate final workstream |

Exact timestamps, provenance, metric denominators and qualifications are in the
[evidence assessment](deployment-probe-audit-workplan-evidence.md#latest-saved-canonical-checkpoint).
No current full-campaign duration is established by save timestamps. Older proxy
observations were about 3m23 short, 11m59 rendering and 13m16 density, excluding compiler
preflight; they are not a canonical runtime forecast or a promised saving.

## Constraints That Remain in Force

- Preserve healthy, degraded, censored, unsupported, missing and invalid states;
  never turn unavailable latency into zero or the deadline. Separate campaign
  completeness, measurement validity, app outcome and comparison eligibility.
- Preserve independent histories and contract revisions. Presentation deduplication
  is not duplicate-execution removal. No history migration/deletion without approval.
- Keep PP3/PP4 healthy timings separate from accepted degradation; do not hide auth,
  harness, unexpected app or capture failures. Transport failure remains unresolved;
  preserve the complete short-suite order until evidence justifies changing it.
- Do not cut repetitions, weaken guards or trim waits to improve duration. Four
  repetitions do not estimate a population tail; nearest-rank p95 here is the max.
- No universal score, pooled unlike clocks or implied paint/decode coverage. Direct
  ES is contextual comparison history, not a lower bound. Existing comparison guards
  allow topology/delivery treatments, not silent cross-dataMode comparisons.
- No agent campaigns/dry runs, live access, backend capture resumption, server changes,
  commits/pushes or writes outside Kupua follow from this plan. Existing safety and
  test rules apply; operator approval is per bounded unit.

## Ordered Work and Exit Criteria

P0/P1/P2/P3 can make bounded progress together; completing every audit finding or
fixing app smoothness is **not** a prerequisite for design. P4 depends on approved
P3 contracts/layout and the specific evidence it promotes being repaired or limited.

| Phase | Bounded deliverable | Exit / approval boundary |
| --- | --- | --- |
| P0 Decisions | First slice and one exact three-entry proxy baseline approved; long baseline explicitly absent; provisional grades unapproved | Further grouping, profiles, thresholds and retirement remain separate decisions |
| P1 Evidence/display corrections | Resolve canonical P13c projection/outcomes, U7 adverse-state handling and U13 signed/false guards for the first slice; restrict U1/U2 while open | Failing-first controls; full contract/counts survive; misleading claims excluded |
| P2 Campaign simplification | Exact scenario/profile map and evidence-backed runtime budget, starting from the proposal below | Operator approves omissions and setup/order changes before implementation; selection/completeness tests cover the map |
| P3 Dashboard design — selected | Compact Overview and all three workflow summaries; retain typography, density, independent charts/outcomes | No general redesign or threshold ratification follows |
| P4 Bounded integrations — locally validated | Shared canonical field interpretation and side-preserving summary → evidence routes; Search action/paired/background boundaries and retained density v1 | [Search validation/review](deployment-probe-audit-workplan-evidence.md#search-and-navigation-summary-integration) complete; whole-dashboard consistency review proposed, not automatic expansion/retirement |
| P5 Operator checkpoint | Measure only when changed measured paths/profile need new evidence; use the new canonical checkpoint for design now | Explain load, runtime uncertainty, private artifacts and stopping rules; operator runs; no partial-history salvage |
| P6 Hosted M6 | First safe built-app browsing slice, external observations and minimal opt-in interface only if necessary | Separate design/policy/live/deployment approvals; validate local built app before TEST |

### P2 Proposal: Reduce Execution, Not Merely Charts

Start with **two profiles**, not a new mode matrix:

| Proposed profile | Exact retained coverage | Explicit omissions / trade-off |
| --- | --- | --- |
| Routine deployment browsing | Complete short 15; density 21; rendering P13a/P13b/P13c and P14a/P14b/P14c/P14d: **43 IDs** | Omits 27 other rendering IDs and all 8 long IDs; no long startup/indexed journey, JA2 entry or native-fullscreen-exit measurement |
| Full comparison | Existing 34 rendering + 15 short + 8 long + 21 density: **78 IDs** | Broader/costlier checkpoint after relevant changes; not the routine default by inertia |

This is a **proposal, not an implemented profile or approved command**. Existing
suite selectors can retain complete short+density, and a separately filtered rendering
invocation selects P13/P14. P13 is one test emitting three IDs: do not promise P13c-only
execution without changing its contract. Prefer existing selection capabilities over
adding another flag; define completeness/publication expectations explicitly.

Use existing saved duration/setup evidence to estimate the omitted cost. Runtime for
the selected P13/P14 slice is not established here: **no numerical saving claimed**.
Removing duplicate imported charts saves no campaign execution. Changing surrounding
rendering tests/setup can change warmth, so label the profile and retain contracts;
do not assume equivalence to full execution. Keep four repetitions and JB2 balancing
in the full profile. Do not revive D9/D10; their lost steady 24s horizon stays explicit.
U9 RTT removal remains deferred; U17 shared flash removal needs a Table-value decision.

### P3/P4: Selected Design and Bounded Integration

The graph-led [Overview and three workflow summaries](../../../e2e-perf/results/README.md)
are selected. Preserve their visual direction and three levels; do not commission
another design pass or require every U-unit/profile decision before integration.

- **Information architecture:** Overview; Search & Navigation; Scrolling & Layout;
  Image Workflows. Reuse the [audit workflow map](deployment-probe-audit-matrix.md#4-dashboard-and-duplication-map),
  not every old chart in a new container. Overview summarizes/links; it is not a fourth chart grid.
- **Approved concrete slice:** Overview -> Image Workflows summary -> canonical
  P13c/P14/JA2 evidence. Show P14b 3/15 within
  cadence, 4/4 eventual landing completion, 6,653ms with clock limitation, revision 3,
  observation horizon and selected baseline eligibility. Do not call cache hit true
  verified or imply responsiveness from eventual completion. Put P13c returned-media
  readiness and outcomes beside it, consuming its complete canonical record once.
- **Adverse examples:** Table 0/4 recovery with null latency; synthetic all-degraded
  PP3; unsupported observer; missing profile coverage; negative drift/false visibility;
  incompatible revision 2/revision 3; stale/incompatible baseline. U7/U13 must be
  addressed in the slice or those metrics withheld with a precise limitation.
- **Overview questions:** coverage/outcomes first; qualified baseline changes next;
  unanswered/unmeasured questions and exact evidence links always visible. Include
  JA2's loaded/stable 18,056ms observed maximum without relabelling it decoded.
- **Selection and navigation (U14):** checkpoint/baseline/provenance shared;
  `side=baseline` selects evidence without reversing C−B in any workflow. Field,
  group, reload/Back and keyboard focus round-trip. Stable record identity includes family,
  kind, timestamp, scenario and contract revision—not array position or label alone.
- **Cross-family membership:** the four canonical entries and three confirmed proxy
  members in the [baseline evidence](deployment-probe-audit-workplan-evidence.md#historical-proxy-baseline-and-review-corrections)
  are registered explicitly, with scenario sets checked against maintained manifests. Saved families have no shared campaign ID; do not
  infer a transaction/group solely from equal labels or quietly select each family's
  latest unrelated run. No history-schema migration is required for the design.
- **Comparability and uncertainty:** show source/cache/topology caveats, denominators
  and completion counts. Completed-only timing must sit beside all-outcome counts;
  never replace a latest failure with an older finite success or join gaps as healthy.

Acceptance uses real canonical aggregates and clearly synthetic healthy, mixed,
all-degraded, censored, unsupported, missing, invalid and incompatible controls.
Verify field counts, signed/false guards, capture gates, null/zero/absence, baseline
direction and semantic field focus. Full records/revisions/provenance must survive;
no curated copy, synthetic production history, dependencies, server or schema rewrite.
Retain legacy dashboards. Scrolling covers D1/D2/D8, D3/D6/D7 and mapped supporting
records, with D5/D11 Search-owned and D4 Image-owned cross-links. Search covers its
28 mapped records with independent action clocks, degradation, restoration and separate
background diagnostics. New fullscreen/selection charts and further expansion remain excluded.
Detailed validation and review findings belong in the evidence document, not here.

## Repair Disposition and Separate App Work

The [matrix reconciliation](deployment-probe-audit-matrix.md#current-follow-up-reconciliation)
records every U1-U18 status and closure condition. Apply the following rule:
**repair, explicitly limit, or omit a metric before promoting it—not “fix everything.”**

- U1/U2 should be a separately scoped actual-producer repair when trustworthy landing
  timing/cache evidence is required. Agree commit versus motion-stop semantics first,
  use deterministic early-ready/missing/restricted controls, version changed boundaries
  and preserve old series. Existing limited evidence can still inform design.
- U7/U13/U14 and relevant U15/U16 wording/accessibility belong to dashboard delivery.
  P13c projection drift and the repaired stale-card lifecycle are distinct from U7's
  unresolved latest-all-degraded behavior. Do not close the latter by association.
- U3/U4/U5/U6/U12/U18 remain bounded follow-ups, not automatic dashboard gates.
  Restrict unsupported/uncorrelated diagnostics instead of inventing health claims.
- Grid/Table frame cadence, Table stopped-media recovery and canonical detail delivery
  are separate app investigations. Choose one named question only when commissioned;
  first reuse evidence, then propose a discriminator. No speculative optimization or
  delivery/version comparison is a prerequisite for the dashboard.

## M6 Boundary and Completion Discipline

M6 is Kahuna-hosted built Kupua, not a laptop Vite app against deployed services.
Current harness dependencies include the Vite endpoint, source imports and DEV
store/callback globals; non-DEV trace opt-in alone does not supply them. Select a
bounded hosted browsing/position/traversal slice, prefer DOM/network/frame observations,
state unsupported metrics and record deployed build identity independently of laptop
Git. Any minimal read-only observation interface needs explicit privacy/cost/policy
approval; do not expose the store or port all 78 scenarios as a gate. Preserve or
version clocks; prove parity instead of assuming M5/M6 comparability.

Each authorized unit ends with focused regression/required local validation, exact
remaining limits, updated matrix status and a replaced checkpoint here. Code-change
history goes in the changelog; detailed evidence stays outside this plan. No new
historical narrative is added to this file. **Next action:** operator reviews the
[bounded correction and remaining limits](deployment-probe-audit-workplan-evidence.md#four-blocker-dashboard-correction),
then separately agrees the shorter-useful-campaign workstream. Stop before campaign
work or additional dashboard features. Profile, scoring, producer and legacy-retirement
decisions stay separate.
