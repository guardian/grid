# Deployment Measurement and Dashboard Evidence (Archived 25 October 2026)

25 October 2026. Supporting evidence, **not an execution plan or implementation
permission**. Start with the [current workplan](deployment-probe-audit-workplan.md).
The [matrix's current reconciliation](deployment-probe-audit-matrix.md#current-follow-up-reconciliation)
owns audit-unit status; its original audit remains a dated snapshot.

## Perf Validation Simplification

**25 October 2026 — one bounded validation-only pass.** Existing evidence had suite
results but no comparable local validation durations; campaign timings were not used
as validation baselines. Runtime cost is chiefly browser/observer work; maintenance
cost is chiefly duplicated source spelling, refresh cross-products and fixture setup.

| Removed/consolidated group | Retained control / ownership |
| --- | --- |
| Exact acknowledgement prose and dashboard colour/topology source spelling | Correlated phase calculations; live dashboard comparison labels, series and selected delivery-pair refusal tests. Prose/palette spelling is not a required contract. |
| Topology assignment regex; duplicate final-report-order regexes | Actual environment fixture must publish topology; actual completion callbacks execute redacted → private reporting on success/failure, only after completion. Private-file permissions, deletion, redaction and auth controls remain. |
| Middle refresh rate across readiness/degradation/setup cases; focus correlation × rate product | Each observer retains 60/240Hz elapsed-deadline checks; each correlation condition runs independently at 120Hz; all missing/context/error/geometry/deadline controls remain. PP1 retains 30/120Hz. |
| Repeated AST parsing/transpilation of the same actual functions | One cached declaration/compiled function; every case still gets a fresh VM and fixture state. No simulated replacement producer. |
| Repeated synthetic baseline reload journeys and signed-guard assertions | One **censored-current / healthy-baseline** contributor/side/reload path plus real baseline/summary/statistic ownership, keyboard/Back and signed invalid/false/negative controls. Every adverse state still renders. |
| Zero-denominator/negative-numerator browser permutations | Full malformed traversal model matrix remains; browser over-total and empty-population refusal, invalid/unsupported, censored and valid-zero controls remain. |
| Density script spelling (tooltip, pair condition, one-campaign wording, no-innerHTML shape) | Browser tooltip/keyboard, incompatible-pair, single-campaign and literal-markup/no-script regressions. Local-script/independent-history contract remains textual. |
| Enumerated Node filenames and dashboard + harness final composition | Full harness discovers only `validation/*.test.mjs` including dashboard-data; focused native Node alias accepts flags before explicit filenames. All established names remain. |

Transactional publication/rollback, clocks/correlation, null/zero/invalid distinctions,
degradation/censoring, revisions, exact record/side/statistic ownership, producer wiring
and supported legacy-history controls remain. No healthy-zero detector was retired.

Same checkout/environment, sequential foreground runs, native external TMPDIR,
`/usr/bin/time -p`; **one baseline, initial final gates, then only required review-repair
reruns—not a calibrated speedup estimate**:

| Root npm command | Before | After | Final result |
| --- | --- | --- | --- |
| `npm --prefix kupua run test:perf-harness` | 5.63s wall / 5.211s Node | Final 3.92s wall / 3.622s Node (pre-review 3.97s wall) | 425 passed, exit 0 (baseline 450) |
| `npm --prefix kupua run test:perf-fixtures` | 60.36s wall / 59.7s Playwright | Final 60.12s wall / 59.5s Playwright (pre-review 60.29s wall) | 160 passed, exit 0 (baseline 162); no material runtime change |
| `npm --prefix kupua run typecheck:perf` | Not re-baselined | Final 2.26s wall (pre-review 2.24s) | Passed, exit 0 |

Each command used `set -o pipefail; /usr/bin/time -p … 2>&1 | tee
"$TMPDIR/kupua-test-output.txt"`. Immediate slices caught/fixed an extra brace and
an HTML extraction boundary matching a comment; no weakened assertions, safety/timeout
changes or blind retries. Applicable final gates ran once, then again only after the
review repairs below. Actual-renderer `test:perf-app` was not rerun: its fixtures/helpers
were untouched; no product suite, campaign, live access, dependency or Git mutation.

**Fresh read-only deletion review** used exact pre-pass snapshots and completed
validation, without rerunning tests. It found two lost unique controls: healthy-baseline
inspection when current is censored, and actual legacy audit-script inclusion.
Both were restored: the single synthetic reload journey now uses censored current;
the externally required script inclusion check remains, while ingestion now executes
the actual projection and asserts that zero-lookup audit evidence reaches the perceived
history. Immediate two-test offline and one-test browser slices passed, then affected
harness/browser/compiler gates above passed. No broader cleanup or second review run.

**Remaining costs:** browser fixture startup/navigation and native observer controls
still dominate; D9's decoded-stop control alone was ~4.7s in the baseline. Keep these
unique controls on their existing gates, rather than silently dropping or making them
opt-in. The mixed harness still models distinct producer functions; splitting it or
unifying those models merely for file size would not reduce ownership. No app-gate
or campaign runtime saving is claimed. Stop here; further cleanup is not authorized.

## Scrolling and Layout History Design Slice

**25 October 2026 — operator-authorized; now integrated as each workflow's History view.**
[Performance dashboard.html](../../../e2e-perf/results/Performance%20dashboard.html) `mode=history` answers two questions:
is this metric moving in the right direction, and how does this topology compare?

- **Scope:** D1/D2 Grid/Justified/Table × four metrics (frame p95, pending visible slots,
  achieved results/s, stop → decoded media). Local direction/phase/statistic controls.
  Other density, rendering and responsiveness records are not charted.
- **Membership:** all 17 density entries become single-entry points through the shared
  `build()` with a generated registry; no manual registration or label grouping. Compare's
  explicit cross-family checkpoints are unchanged. Density entries all record
  dataMode/topology/delivery, so the operator-confirmed inference rules for older
  audit/perceived entries (absent dataMode → direct ES, topology local except recorded
  deployed-test, canonical delivery only from 24 Oct 08:30) were not needed here. Two
  pre-environment perceived pairs are labelled as media-api runs (8 May, 13 June) and remain
  open exceptions for any future family.
- **Encodings:** colour = topology (Okabe-Ito: direct ES, local API, TEST API, grey unknown);
  shape = media delivery (circle proxy, triangle canonical, square unrecorded); C = white
  solid diamond + label, B = white dashed circle + label; density = chart column, never colour.
  Hidden environments never hide C or B.
- **Honesty:** x is campaign order. A line joins only consecutive same-environment,
  same-`contractKey`, same-field-scope values whose environments pass the existing guard;
  absent/invalid/partial/censored breaks it. Revision dividers label r2/r3/r4; r2/r3
  whole-journey fields are labelled, not presented as the selected phase. Exact zeros are
  marked `0`; no-value states sit in a separate strip with reasons. No interpolation, raw
  trials, intervals or better/worse wording (no approved noise band).
- **Selection:** Current follows the newest entry unless pinned; Baseline defaults to the
  registered proxy density member and an explicit choice stays pinned. Point, metric table,
  phase, statistic, environments and both selections live in the hash (reload/Back).
  C−B reuses `recordPair`; same-campaign, contract, validity and environment failures withhold.
  Registered-member points link to Compare evidence; others show the complete saved record.
- **Synthetic:** nine entries cloned from three real entries, labelled throughout: r2→r4
  change, missing Table record, exact zero, unrecorded environment, sparse TEST canonical,
  censored recovery, partial pending, invalid Grid capture, same-environment C/B.

Real observations: Table forward frame p95 fell from ~137–154ms (r2) to 58–62ms (r4);
r3/r4 phases are not comparable to r2. Canonical Table stopped recovery is partial (withheld).
Checks: three new offline History tests (join rule, pin/reload/Back/keyboard, withheld C−B);
closure `typecheck:perf` pass, 447 harness checks, 159 browser fixtures. Desktop and 390px
inspected; no page overflow. Not reviewed: screen reader, touch, other browsers, other workflows.
Open decisions: whether History selections should drive Compare; extending to Search/Image.

**Overview trend lines.** Each hero card may show an unlabelled sparkline (topology colour,
links to that history). Values walk back from the checkpoint over the same data mode and
topology, stopping at the first `recordPair` refusal or missing value; drawn only when >3.
Canonical TEST today: PP7 3, PP3 2, D1 2, P13c 1, so none render. An injected local probe
showed PP3 (6) and PP7 (17). Min–max scaling exaggerates small changes; shape only.

**Search and Image History (tracked list).** History now covers all three workflows for the
tracked list in the prototype README only. Selections are per family (density, short, long,
rendering). Entries before tracked fields existed are trimmed and counted (26 short/long,
42 rendering). Pre-environment entries use the operator-confirmed inference, drawn hollow and
never joined. Real observations, descriptive only: direct ES PP3/PP7 settle ~1.0s vs local API
~1.3–1.5s; canonical P13c 1,374ms is r3 versus ~250ms r2 history (contract change, refused);
JA2 canonical 6,474ms is far above sub-second local/direct history on the same r2 contract.
Two new offline tests cover per-family pins/reload, r2/r3 and inferred no-join, and the shared
traversal gate. Legacy dashboards remain; retirement needs separate approval.

**Between-campaign spread from existing history (no new campaign).** Consecutive
comparable same-topology entries (shared `trend` walk), relative step |Δ|/median:

| Topology · metric | n | Median | Range | Median step | Max step |
| --- | --- | --- | --- | --- | --- |
| Local PP3 settle | 9 | 1,381ms | 1,193–1,465 | 5.4% | 11.4% |
| Local PP7 settle | 17 | 1,277ms | 1,031–1,649 | 13.0% | 38.2% |
| Local PP11 settle | 15 | 1,673ms | 1,518–1,781 | 5.3% | 12.5% |
| Local JA1 / JB1 / JB4 | 15/15/17 | 1,079 / 1,066 / 831ms | — | 8.6 / 6.5 / 2.1% | 24.9 / 21.8 / 9.7% |
| Local JA2 | 20 | 870ms | 656–1,349 | 20.5% | 51.8% |
| Local P13c / P14b landing | 17/18 | 275 / 135ms | 240–350 / 121–426 | 7.8 / 6.7% | 25.5 / 217% |
| Direct ES PP3 / PP7 / JA2 | 5 each | 916 / 1,001 / 857ms | — | 7.3 / 12.0 / 3.5% | 12.7 / 19.7 / 11.3% |

These steps include real code changes between campaigns, so they are an upper bound on
noise, not a calibrated band. Density has fewer than four comparable runs per topology.
Consequences: PP3 canonical−proxy −43ms (−4%) is within ordinary local step size;
JA2 canonical 6,474ms is ~7× the local median and far above any observed local value.
PP7 and JA2 are inherently noisier (median steps 13–20%) than JB4/PP11 (2–5%).

## Whole-dashboard Acceptance Review

**25 October 2026 — bounded review of working-tree code, saved histories and local pages.**
Review only: no fixes, new observations, threshold approval or legacy retirement.
The lead reconciles separate read-only measurement/coverage and navigation reviews;
prior completion reports are context, not acceptance evidence.

### Accept

- The compact graph-led design and summary → exact-evidence architecture remain useful.
  Current canonical charts expose slow detail/traversal, Table recovery failure and
  density differences without pooling progress, media readiness and frame clocks.
- All **78 current / 70 baseline records** are retained. Links extracted from actual
  rendered summaries (including collapsed details) were followed in isolated Chromium;
  all **148 exact-record identities matched**, without exact-route page errors. Proxy
  coverage selected the proxy checkpoint as current: this is not a claim of 70 direct
  baseline marks within the fixed pair (Images/Search/Scrolling directly expose 0/16/20
  baseline IDs). Coverage is record reachability, not a chart for every field or a claim
  of good outcomes. Recovery/cross-links add no repetitions; Scrolling's 37 linked IDs
  include its 31 owners plus six Search/Image cross-links.
- Membership remains the explicit four-entry canonical checkpoint versus three-entry
  proxy assembly, not a shared campaign inferred from labels. Current-minus-baseline
  remains descriptive; source/content/cache differences prevent delivery-causation claims.

| Family / kind | Canonical timestamp (UTC) / records | Proxy timestamp (UTC) / records |
| --- | --- | --- |
| rendering / rendering | 2026-10-24T08:30:42.035Z / 34 | 2026-10-24T00:14:11.263Z / 34 |
| responsiveness / short | 2026-10-24T08:33:51.333Z / 15 | 2026-10-23T23:29:50.826Z / 15 |
| responsiveness / long | 2026-10-24T08:36:16.196Z / 8 | Explicitly absent / 0 |
| density / density | 2026-10-24T08:49:53.477Z / 21 | 2026-10-24T04:32:34.673Z / 21 |

**Complete scenario receipt** (each literal ID appears once below; the owning workflow
has a canonical record/field destination):

| Owner / section | Exact current IDs |
| --- | --- |
| Search — startup | P1, JA1, JB1 |
| Search — actions / complementary rendering | PP1, PP2, PP3, PP4, PP5, PP8, PP9, JA3, JB2, JB3, P6, P9 |
| Search — seeking / complementary rendering | PP7, PP7b, PP7c, JB4, D5-grid, D5-justified, P3, P3b, P7 |
| Search — restoration / refresh / background | PP11; D11-grid, D11-justified; PP10 |
| Scrolling — browsing / recovery | D1-grid, D1-justified, D1-table, D2-grid, D2-justified, D2-table, D8-grid, D8-justified, D8-table |
| Scrolling — complementary browsing | P2, P8, P17 |
| Scrolling — transitions / reflow | D3-grid, D3-justified, D6-grid, D6-justified, P4a, P4b, P11@20, P11@60, P11@85, P11b@20, P11b@60, P11b@85, P16a, P16b, PP6, PP6b, PP6c |
| Scrolling — maintenance | D7-grid, D7-justified |
| Images — detail / list return | P13a, P13b, P13c, JA2, D4-grid, D4-justified |
| Images — traversal | P14a, P14b, P14c, P14d |
| Images — fullscreen / return | P15a, P15b, P15c, JB5 |
| Images — selection / panels | P5a, P5b, P5c, P18, P19 |

Search/Scrolling/Images total **28/31/19 current** and **22/31/17 baseline**.
The baseline contains every listed ID **except JA1, JA2, JA3, JB1, JB2, JB3, JB4,
JB5**; no older long entry is substituted. Fullscreen/selection and complementary
rendering records intentionally use links rather than new summary charts. Table D7,
per-image compositor paint and broader editing/upload workflows are not measured here,
not missing saved IDs; P1's navigation paint milestones are a different diagnostic.

Shared-model checks preserve healthy-only PP3/PP4 timings beside all-outcome counts,
null/partial/censored recovery, genuine zero and signed/false guards. PP10 remains
background-only and ungraded. D11 uses saved within-repetition differences with separate
isolation/media gates: current 4/4 versus baseline 2/4 paired contributors, not a
subtraction of aggregate arm medians. Density v1 parity and required-input gates hold.
Revision refusals and absent long coverage retain current values. Qualifying n=4 p95
is an observed maximum, not a population tail; frame-p95 remains an observation metric.
These verified paths do **not** excuse the exact-rendering defects below.

### Blocking fixes

**Historical acceptance finding (before correction): acceptance was withheld pending
bounded presentation/navigation corrections.** These are dashboard defects, not
requests to repair known producers. No fixes were made during the review. All four
reproductions below are retained; their bounded fixes and regression results are now
[recorded as resolved](#four-blocker-dashboard-correction). This does not close legacy
findings, approve thresholds or certify the underlying producers.

1. **Registered proxy-current Overview crashes.** Open
   `index.html#checkpoint=proxy-baseline&baseline=none&view=overview`.
   Historical P13c r2 has no completion-count contract; `assessment.js:96` dereferences
   `completion(record).unavailable` when completion is null (via `overview.js:87`).
   Smallest correction: tolerate absent historical outcome contracts without inventing
   counts. Browser-confirmed: hash navigation can leave the previous main content stale
   after `Cannot read properties of null (reading 'unavailable')`. Regression: render
   Overview for both real registered checkpoints and assert new content/absence of errors.
2. **Historical exact outcomes claim an unsupported boundary/population.** Inspect
   proxy-side P13c or P14a–d; for example
   `#checkpoint=recorded&baseline=proxy-baseline&view=images&scenario=P14b&side=baseline`.
   `dashboard.js:79–80` applies revision-3 outcome text to r2: undefined counts, and
   P14 a 15,000ms horizon despite its historical five-second contract. Smallest correction:
   field/revision-aware outcomes with explicit unavailable counts and the saved boundary.
   Browser-confirmed on fixed-pair baseline P13c/P14b. Regression: actual r2 exact
   outcome text, not only cross-revision delta refusal.
3. **Exact traversal presentation bypasses cadence qualification.** Use the unchanged
   `traversal-invalid` initializer in `validation/dashboard-navigation.spec.ts:9,57`
   and open `#checkpoint=recorded&baseline=none&view=images&scenario=P14b`.
   Browser-confirmed headline: **“3 / 15 median loaded within cadence”**, despite
   Unrated and explicit chart refusal. `traversal-zero-total` at the same route shows
   **“3 / 0”** and `style="width:Infinity%"`. Both produce no page errors or remote
   requests. VM execution also confirms unsupported-headline and negative/over-total
   variants; these additional variants were not separately browser-replayed.
   Locations: `dashboard.js:153–158`, cadence headline at 185. Smallest correction:
   reuse `ASSESSMENT.traversalEvidence()` for both exact chart and headline; rejected
   values remain raw evidence with reasons. Regression: extend existing traversal
   controls to exact rendering, preserving valid zero, poor and censored outcomes.
4. **Plotted statistic and exact statistic can differ across tabs.** Browser-confirmed
   with the real canonical/proxy pair:
   - Clean Overview → Grid frame-p95 maximum **74.9ms** routes with
     `statistic=median`; exact headline shows **50.25ms**.
   - Scrolling → select p95 → Overview → Grid median **50.25ms** retains
     `statistic=p95`; exact shows **74.9ms** and **+24.9ms C−B**, not the shown
     median's **+0.45ms** change.
   - With p95 selected, Grid smoothness **17.4/100** links to limiting
     `lateFrameP95Ms` **108.5ms p95**, although its calculation uses **95.7ms median**.
   Locations: shared inheritance `dashboard.js:126`, Overview links `overview.js:80–84`,
   index components `scroll-summary.js:58–74`. Smallest correction: explicit statistic
   ownership—median/reference/delta links select median, tail links p95, and index
   components their calculation statistic—without changing formulas, side or pair.
   Regression: those three sequences, baseline-side equivalents and reload/Back.

### Deferred improvements and scope

- Retain legacy pages alongside this dashboard: arbitrary historical campaigns/trends,
  broader diagnostic metric/filter exploration, rendering log scale and density
  within-campaign layout comparisons remain legacy capabilities. Historical D9/D10
  remain history, not missing current scenarios or an execution-revival requirement.
  No complete replacement recommendation follows from record reachability.
- Composite provenance says fingerprints are unavailable while the header discloses
  differing owning-entry fingerprints. Record comparisons use actual owners; this is
  nonblocking wording inconsistency. Prefer “see owning-entry fingerprints”; do not
  change eligibility to tidy the text.
- Provisional grades remain unapproved. P14 U1 first-readiness/cadence timing and U2
  resource/cache inference, U3 capability, U5 status correlation, U6 diagnostic
  attribution, U12 foreground, U18 detector sensitivity and startup epoch alignment
  remain documented measurement limitations, not newly proven producer regressions.
  DOM geometry, loaded, decoded and compositor image paint remain different; the
  latter is unmeasured by these canonical journeys.
- No application/probe audit, producer repair, campaign/profile/checkpoint change,
  raw-sample reconstruction, hosted/M6 or delivery-causality certification, live/API
  access, private-log inspection, infrastructure/dependency work or Git mutation.
  PP3 safeguards and deferred RTT are unchanged.

### Review validation and handback

- `npm --prefix kupua run test:perf-dashboard`: **31 passed**; existing model controls,
  not proof of complete rendering coverage (the defects above are counterexamples).
- `npm --prefix kupua run test:perf-fixtures -- dashboard-navigation.spec.ts`:
  **62 passed**. The earlier full 149-fixture / 446-harness totals were not rerun here.
- `npm --prefix kupua run typecheck:perf`: **passed, exit 0**.
- Additional isolated local-file Chromium checks verified all 148 exact identities;
  summary returns, same-field links, baseline ownership, fixed C−B, reload/Back;
  missing-record/baseline-removal/restoration; same-checkpoint refusal; and D11's
  originating-Scrolling return. At 390px, page-width containment and actual Tab access
  through checkpoint, baseline and all four tabs passed with visibility reported visible.
  Existing adverse fixtures cover missing/invalid/unsupported/degraded/censored and
  signed/zero conditions. Focused browser reproductions confirm all four blockers;
  passing retained tests do not cover these previously missing assertions.
- Shared local-page checks used a clean disk reload of the real 78/70 pair, inspected
  Overview/Image/Scrolling values, outcomes and expandable qualifications, and opened
  all three retained legacy pages. No shared data/HTML mutation or synthetic injection.
  The browser still reported hidden after `bringToFront`; ordinary clicking timed out.
  DOM/static screenshot observations are not foreground paint, physical-device,
  native-picker popup, cross-browser, screen-reader or exhaustive accessibility certification.
- Final shared-page disk reload verified real canonical/proxy **Overview**, 78/70 labels,
  two checkpoint options / three baseline options, real 50.25/74.9ms Grid frame values
  and 3/15 traversal, with no synthetic fixture/date marker. No rewritten HTML,
  duplicate controls or injected nulls were left behind; legacy tab restored to density.

**Historical recommendation / operator decision (superseded only by the bounded
correction below):** retain the accepted design and legacy pages;
commission one correction unit for blockers 1–4 with the specified regressions, then
recheck those paths. Do not grant whole-dashboard acceptance yet. Defer wording polish
and further views; once blockers are verified, move to the separately approved shorter-
useful-campaign workstream, not indefinite dashboard expansion. This review does not
approve campaign execution, grading thresholds or producer repairs.

### Four-blocker dashboard correction

**25 October 2026 — operator-authorized bounded correction, now locally verified.**
The four [original acceptance findings](#blocking-fixes) above remain historical
reproductions, not outstanding claims against the corrected working tree. This unit
changes dashboard presentation/navigation and offline regressions only. It does not
repeat the complete record-reachability audit or extend whole-dashboard acceptance
beyond these four paths.

| Resolved blocker | Correction and discriminating regression |
| --- | --- |
| 1 — proxy-current Overview crash | `assessment.js` tolerates null P13c completion. Actual canonical/proxy model findings and browser-rendered proxy Overview pass; r2 completion remains null and contributes no invented outcome finding. |
| 2 — historical exact outcomes | `dashboard.js` uses available completion contracts, displays explicit unavailable historical counts and retains the r2 P13c saved boundary with an unrecorded horizon. P14 r2 states its historical 5,000ms observation contract; r3 states the actual 15,000ms contract, not a claimed new saved field. Both proxy-current and fixed canonical/proxy baseline-side P13c and all four P14 routes are checked. Revision comparison refusals remain. |
| 3 — unqualified exact cadence | Exact P14 headline and chart reuse `ASSESSMENT.traversalEvidence()`. Invalid, unsupported, zero-total, over-total, negative and empty fixtures have no numeric cadence headline/bar; reasons and raw fields remain inspectable. Valid zero retains `0 / 15` and a zero-width bar, poor cadence retains `3 / 15` and 20%, and fully censored landing outcomes remain explicit/adverse rather than deadline latencies. |
| 4 — statistic ownership | Overview median/reference/delta links explicitly select median, nested-density tails select p95, and density-v1 limiting/all-component links select their calculation median. Local Scrolling charts still select their own statistic. Real current/baseline keyboard paths verify Grid 74.9/50ms tails, 50.25/49.8ms medians and fixed +0.45ms C−B, plus limiting `lateFrameP95Ms` 95.7/91.75ms medians rather than inherited p95. Reload, Back, selected field/side and local p95 return state are retained. Index formulas and comparison eligibility are unchanged. |

#### Regression-first and final validation

All commands ran from the repository root, foreground, with `set -o pipefail` and
`2>&1 | tee "$TMPDIR/kupua-test-output.txt"`. Initial implementation validation set
`TMPDIR` to `$PWD/kupua`; the first model invocation used the equivalent
`tee kupua/kupua-test-output.txt`. The final coordinator harness rerun restored the
native external temporary directory required by existing private-handoff fixture
safeguards. These are offline synthetic tests, not private-log inspection or live
capture. No dependencies were installed.

**Failing first, before source fixes:**

- `npm --prefix kupua run test:perf-dashboard -- --test-name-pattern='real registered checkpoints'`:
  **31 passed / 1 failed**, reproducing the null-completion dereference. This npm
  script places the option after its file, so Node ran all 32 tests, not just one.
- `npm --prefix kupua run test:perf-fixtures -- dashboard-navigation.spec.ts --grep 'bounded corrections|traversal-invalid|traversal-unsupported|traversal-zero-total|traversal-over-total|traversal-empty'`:
  **8 failed**, exposing stale proxy Overview, wrong tail-statistic routes and
  unqualified exact cadence headlines. The proxy/outcome test was then split so
  a crash could not hide its independent historical-wording assertion.
- `npm --prefix kupua run test:perf-fixtures -- dashboard-navigation.spec.ts --grep 'historical exact outcome contracts'`:
  **1 failed**, independently reproducing `undefined/4` historical P13c outcomes.

**Final gates and fresh review:**

- `npm --prefix kupua run test:perf-dashboard`: **32 passed**, rerun after fresh review.
- `npm --prefix kupua run test:perf-fixtures -- dashboard-navigation.spec.ts --grep 'bounded corrections|traversal-'`:
  **12 passed**, rerun after fresh review. A test-only focus race found during
  validation was corrected by awaiting the destination's route-focus before pressing
  Enter; source navigation was not changed to accommodate the test.
- `npm --prefix kupua run test:perf-fixtures`: **156 passed** (including all **69**
  dashboard-navigation cases), full suite rerun after fresh review.
- `npm --prefix kupua run typecheck:perf`: **passed, exit 0**.
- `npm --prefix kupua run test:perf-harness`: **447 passed, 0 failed; exit 0** on
  the final coordinator rerun with native `TMPDIR`. Initial implementation validation
  had 443 pass / 4 fail because its repository-local `TMPDIR` correctly triggered
  “Private PP3 diagnostics must stay outside the repository”. Removing that test
  environment override resolves all four failures without code or safeguard changes;
  no private logs were inspected and no real diagnostic capture was performed.
- A fresh substantive **read-only code-review agent found no substantive findings**.
  It inspected the actual scoped rendering/gating/routing source and tests (not the
  unrelated large worktree), independently passed the 32 model controls and checked
  historical/count/statistic ownership in memory. It did not independently rerun
  browser focus/Back/reload or the full harness; the implementer's reruns above cover
  the browser paths. No implementation was delegated further.

#### Files changed by this unit

- `results/assessment.js`, `dashboard.js`, `overview.js`, `scroll-summary.js`.
- `validation/dashboard-data.test.mjs`, `validation/dashboard-navigation.spec.ts`.
- `research/deployment-probe-audit-workplan-evidence.md`,
  `deployment-probe-audit-workplan.md`, `deployment-probe-audit-matrix.md`.
- `kupua/exploration/docs/changelog.md` (implementation/rationale only).

The first three bullets are relative to `kupua/e2e-perf/`; research paths in the
third bullet share its `research/` directory. Session worklog was maintained then
reset to its scaffold after durable notes moved here; generated local logs/caches
were removed. All unrelated pre-existing changes, including AGENTS, remain untouched.

#### Real local pages, scope and remaining limits

Separate clean-disk local-file pages remain open: canonical **Overview** with the
fixed proxy baseline, and proxy-current **Overview** with no baseline. Both render
real histories with no page errors or HTTP requests; no synthetic initializer, DOM
replacement or HTML rewrite was applied. Canonical keyboard Enter on the real Grid
maximum opened 74.9ms/p95, then reload/Back returned to Overview. Proxy disk reload
rendered its actual historical 256ms detail without the former crash. The live
application tab was never touched. The coordinator also disk-reloaded the original
shared local canonical/proxy Overview: real 78/70 coverage, no synthetic marker, and
its 74.9ms tail link explicitly selects p95. Changed JS/TS editor diagnostics are clean.
Shared local pages reported hidden; static/DOM checks are not foreground visual claims.
Isolated existing fixture contexts provide actual keyboard/current-and-baseline
navigation regressions.

No app/src tests or campaigns ran: no app, producer, history, profile, checkpoint,
dependency, threshold, live/API, private-log, infrastructure or Git changes were
part of this unit. AGENTS needs no update because architecture and routing are
unchanged. U7/U14 close only these bounded new-dashboard paths; legacy lossy imports,
latest-finite outcomes, D11 media-only censor presentation and retirement remain
partial/open as recorded in the matrix. U1/U2, provisional thresholds, diagnostic
provenance wording, native-picker behavior, compositor paint, physical-device,
cross-browser and exhaustive accessibility limits are unchanged. Next work requires
separate operator agreement; this unit stops before campaign work.

## Search and Navigation Summary Integration

**25 October 2026 — operator-confirmed six-group map; bounded saved-history integration.**
Search & Navigation now lands on a graph-led summary using the same complete canonical
adapter, chart primitives and exact-evidence layer. Overview, Scrolling and Image
Workflows remain in place. No new checkpoint, history/schema change, producer repair,
scoring policy or campaign was introduced. The approved real pair remains 78 canonical
records versus the assembled 70-record proxy baseline, with long responsiveness absent.

### Exact Coverage and Boundaries

| Summary activity | Canonical membership / distinct measurements |
| --- | --- |
| Startup / initial results | JA1 buffer and JB1 indexed store/visible/settled clocks; complementary P1 navigation milestones/frame evidence |
| Queries / filters / Home / sorting | PP1/2/3/4/5/8/9, JA3/JB2/JB3; P6/P9 rendering evidence expandable, never pooled |
| Arbitrary-position navigation | PP7 click, PP7b drag release, PP7c buffer, JB4 indexed; separate D5 Grid/Justified placement/decode; P3/P3b/P7 frames |
| History / preservation | PP11 original deep-anchor Back restoration; PP9 chip-removal preservation stays in its action row, cross-linked rather than duplicated |
| Refresh under media load | D11 Grid/Justified quiet/busy arms and saved signed data/placement/media paired deltas |
| Background publication | PP10 fixed-indexed map publication and entry count; no foreground visual completion or action grade |

These are **28 Search-owned records**, each retaining family/kind/timestamp/scenario/
revision identity and its unmodified raw object. JA3/JB2/JB3 remain Search-owned query
changes even when entered from metadata/facets. Density transitions remain Scrolling-
owned; detail/traversal remain Image-owned. Complementary observations are not counted
as extra repetitions of the action they illuminate.

- Local action-phase/regime controls scope queries, seeks and restoration. Startup,
  density seek and D11 keep their own clocks. Selected field, group, phase/regime,
  statistic and baseline side round-trip through reload/Back and summary returns.
- PP3/PP4 timing has healthy contributors only; total outcomes add accepted degradation.
  Existing aggregation omits optional `degradedCount` when zero. Mixed samples retain
  healthy timing with all-outcome counts. Zero healthy contributors withhold timing,
  including stale finite fields. No older success is substituted. A baseline outcome
  remains independently inspectable, but cannot become a paired timing bar for an
  all-degraded current field.
- Status null is not instantaneous feedback; focused-sort status correlation remains
  unresolved. PP8 starts after debounce. Acknowledgement is not visible completion.
  Store/request timings and JB2 matched-control attribution retain U6 limits; route
  membership is not proof of freshness/ownership.
- D11 consumes saved busy−quiet deltas calculated **within repetitions**, never a
  difference of aggregate arm medians. Isolation and decoded-media censor gates are
  independent. Current complete paired fields remain numeric; baseline partial 2/4
  contributors remain disclosed without a numeric baseline or C−B paired-field delta.
  Arm clocks retain their independent availability. C−B, where eligible, compares the
  same saved field across checkpoints, not an isolated delivery effect.
- PP10 exposes publication/count evidence only. Injected finite foreground values are
  rejected as inapplicable. P1 shift support is unverified (U3): a raw evidence link is
  shown rather than promoting its stored zero to a numerical healthy summary.
- Existing provisional PP3/PP7 settlement rules are reused, not extended to every action.
  Invalid/missing evidence cannot earn a grade; counts, acknowledgement and diagnostics
  are not settlement grades. Signed displacement/false guards and real zeros remain.

### Saved-Record Cross-checks

Timings are milliseconds; median/p95 are saved aggregates with actual field contributors.
At the recorded four contributors, the nearest-rank p95 is the observed maximum, not a
population-tail estimate. Loaded/stable, decoded media, DOM geometry and paint differ.

| Record / field | Current | Approved baseline | Qualification / C−B |
| --- | --- | --- | --- |
| PP3 settlement median / p95 | 1,114 / 1,206 | 1,157 / 1,198 | Median −43 (−3.72%); p95 +8; baseline tail link owns the baseline observation |
| PP4 settlement median / p95 | 984 / 1,104 | 1,088 / 1,147 | Healthy-only median −104; no new timing-grade rule |
| PP7 settlement | 1,114 | 1,160 | −46; requested/achieved ratios retain their seek contract |
| PP8 settlement | 1,078 | 1,174 | −96; after-debounce clock, not typing-to-results |
| PP11 settlement / anchor drift | 1,171 / 0px | 1,247 / 0px | Timing −76; genuine computed geometry zero, not detector-sensitivity proof |
| JA1 / JB1 settlement | 1,025 / 1,020 | Absent | No older long family borrowed; epoch alignment remains an assumption |
| JB4 indexed settlement | 775 | Absent | Distinct indexed navigation; no fabricated store phase |
| PP10 publication / map entries | 1,447 / 21,627 | 1,289 / 21,627 | Publication +158; background only; visual fields null/inapplicable |
| D11 Grid data / placement / media paired medians | −2.9 / −21 / −17.05 | Null / null / null | Current 4/4; baseline 2/4 available, 2/4 unavailable; no baseline numeric pair |
| D11 Justified data / placement / media paired medians | −32.1 / −47.95 / −89.9 | Null / null / null | Same contributor qualification; signed negatives preserved, not proof of benefit or image causality |

Source fingerprints/content/cache differ. Matching contracts do not isolate canonical
media delivery as a cause. Existing environment/revision/route/field restrictions remain;
unverified rendering revisions refuse comparison while keeping current observations.

### Validation, Review and Limitations

| Existing local gate / check | Final result / boundary |
| --- | --- |
| `npm --prefix kupua run test:perf-dashboard` | **31 passed** in model implementation; six added Search interpretation/ownership/route controls |
| `npm --prefix kupua run test:perf-harness` | **446 passed**, including all dashboard model checks and retained measurement controls |
| `npm --prefix kupua run test:perf-fixtures` | **149 passed**, including 15 new Search browser cases and retained Overview/Image/Scrolling/legacy density fixtures |
| `npm --prefix kupua run typecheck:perf` | **Passed; compiler pipeline exit 0** |
| Local browser / fixture navigation | Real file-based canonical/proxy summary and exact evidence; desktop/mobile, keyboard focus, baseline side, maximum-field identity, nested D11 p95, reload/Back and local selection checked |
| Fresh substantive read-only review | Found selected-diagnostic grading bypass; repaired and regression added; follow-up reported **no significant issues in the reviewed changes** |

The fresh reviewer demonstrated that replacing a displayed record's primary field let
PP3 acknowledgement/sample counts earn the settlement threshold, even with settlement
missing. Grading now uses the canonical action's explicit settlement field independently
of the display selection; exact Search views omit grades on non-settlement fields.
The negative control retains finite acknowledgement with null settlement/tail, checks
summary Unrated and no acknowledgement/count grade through reload/focus. PP3/PP4 outcome
wording also reads the actual settlement clock, not the selected diagnostic field.

Controls cover healthy/mixed/all-degraded PP3/PP4; stale finite fields at zero healthy
population; optional status null; background PP10 with injected false foreground values;
D11 invalid isolation, media-only censor and invalid capture with raw access; signed/false
preservation, real zero, missing selected field, incompatible revision, missing long,
side ownership, C−B, and exact-field/summary-return keyboard navigation at mobile width.
Synthetic examples are startup fixtures only, clearly labelled; production membership is
unchanged. HTTP service requests are blocked and asserted absent in browser fixtures.

Initial focused test corrections were a floating-point assertion and a multi-row locator,
not weakened measurement guards. A retained Overview all-degraded fixture expected a
paired healthy baseline bar despite zero current healthy contributors; it now checks
that the established contributor guard withholds the numeric pair while preserving the
adverse current outcome and separate baseline inspection. The full retained suite passes.

Remaining limits: U5 status correlation, U6 diagnostic attribution, U18 displaced-anchor
sensitivity, U3 capability evidence and D11 foreground producer gap are not repaired.
Other prior U-units, provisional thresholds, small samples, unmeasured compositor paint,
startup epoch alignment and uncontrolled source/content/cache remain. Desktop/mobile
checks are local fixtures, not physical touch/trackpad, screen-reader or cross-browser
certification. Embedded-browser foreground state could not be confirmed during the extra
manual check; no additional foreground paint/performance certification is claimed.
PP3 safeguards and deferred RTT are unchanged. No live/private-log access, campaign/dry
run, app/producer/infrastructure/dependency change, history rewrite or Git mutation
occurred. Stop for operator review; the next proposed unit is a bounded whole-dashboard
consistency/coverage review, not further feature expansion or another campaign.

## Scrolling and Layout Summary Integration

**25 October 2026 — operator-confirmed section map; saved-history presentation only.**
The existing graph-led Overview/Image Workflows design is retained. Scrolling & Layout
now lands on a summary, not a default individual record. The only selected real pair
remains the four canonical entries (78 records) versus the confirmed proxy assembly
(70, long responsiveness absent). No history membership/contract revision was changed.

### Coverage and Interpretation

The audit section-4 map routes **31 records** to Scrolling: D1/D2/D8 all three densities;
D3/D6/D7 Grid/Justified; P2/P8/P17; P4a/P4b, P11/P11b at 20/60/85, P16a/P16b;
and PP6/PP6b/PP6c. D5 seeking and D11 refresh/contention are Search-owned cross-links;
D4 list return is Image-owned. Their complete presentations are not duplicated.

- Browsing leads with independent achieved/requested rate, count-based pending slots
  and frame-p95 charts. Density, ordinary/constrained workload, direction, load phase
  and median/p95 are local URL state. D8 remains forward-only; reversal is D2's separate
  recorded leg, never a fourth increasing-load phase or a fallback to middle.
- Ordinary D1/D2 and constrained D8 stopped recovery have separate panels. Data-ready
  and decoded-media clocks share a start and are not added. Each endpoint preserves its
  contributors/censors and cohort flags. Current partial recovery remains null; a
  baseline outcome can be inspected independently even when numeric comparison is refused.
- Density v1 progress/smoothness/sampled-stability indices reuse the legacy weakest-
  component formulas and required contracts/inputs, not a new scoring policy. Canonical
  and proxy scores, reasons and limiting components are checked against the retained
  legacy implementation. Missing/invalid input or censored recovery withholds the
  affected index. Neutral ranks only include compatible densities with a finite index;
  a sole eligible density is not ranked. The indices' whole ordinary-journey scope is
  independent of the local chart filters. No total Kupua score or paint score is added.
- D3/D6 placement and decoded readiness remain separate. Supporting P4/P11/P16/PP6
  clocks, signed displacement, false visibility and width evidence are expandable,
  not pooled. D7 shows frames/eviction/prepend work and names absent Table coverage.
- Shared field interpretation now checks relevant phase capture, observer support,
  geometry comparators and complete field populations before charting/assessment/pairing.
  Saved raw objects remain unchanged and inspectable. Healthy zero is not missing,
  unsupported, invalid, partial or censored. These display gates do not repair producers.

### Verified Saved Anchors and Descriptive Changes

Values below are medians across four saved observations, not reconstructed trials.
Frame-p95 is first computed inside each observation; the table summarizes that metric.

| Exact record/field | Canonical current | Proxy baseline | C−B / qualification |
| --- | --- | --- | --- |
| D1-grid middle achieved results/s | 99.61162755 | 99.70421789 | −0.09259034 results/s; requested 100 |
| D1-grid middle frame-p95 | 50.25ms | 49.8ms | +0.45ms; +0.90% |
| D1-grid middle pending slots | 3.59914161% | 0.42292265% | +3.17621896 percentage points |
| D2-grid reversal frame-p95 | 54.7ms | 54.2ms | +0.5ms; baseline-side inspection retains this field, not middle |
| D1-grid stopped data / decoded media | 47.2 / 391.25ms | 45.65 / 364.35ms | Independent clocks; +1.55 / +26.9ms |
| D1-table stopped media | Null; 3/4 complete, 1/4 unavailable | 4/4 complete | Partial current aggregate withheld; baseline counts/ownership retained, no numeric pair |
| D8-table stopped media | Null; 0/4 complete | Null; 0/4 complete | No zero/deadline latency or numeric delta; 4,000ms is the cap |
| D3-grid placement / decoded media | 227.8 / 236.65ms | 194.3 / 202.55ms | Separate clocks; not a stacked total |
| D6-grid placement / decoded media | 108.4 / 129.55ms | 121.9 / 131.35ms | Separate clocks; changed-width observation is not paint |
| D7-grid frame-p95 / evictions | 32.9ms / 1 | 25.05ms / 1 | D7 foreground limitation remains; no producer certification |

Current ordinary indices (Grid / Justified / Table): progress **11.9 / 6.6 /
unavailable** (Table stopped recovery censored); smoothness **17.4 / 65.7 / 18.2**;
sampled stability **0.4 / 0.1 / 3.2**. These are existing reference-based indices,
not satisfaction grades. Their exact components and limitations are linked on-page.
Sources differ; corpus/cache warmth is uncontrolled. None of these differences isolates
canonical delivery as a cause. Revision, environment, field and population refusals remain.

### Validation and Fresh Review

| Local gate / check | Result and boundary |
| --- | --- |
| `npm --prefix kupua run test:perf-dashboard` | **25 passed**, including 9 added model/field/ownership controls and canonical/proxy legacy-v1 parity |
| `npm --prefix kupua run test:perf-harness` | **440 passed**, offline calculations/contracts only |
| `npm --prefix kupua run test:perf-fixtures` | **134 passed**, including 9 Scrolling browser cases and retained legacy density controls |
| `npm --prefix kupua run typecheck:perf` | **Passed; compiler pipeline exit 0** |
| Actual local-file browser | Clean disk reload with real canonical/proxy selection; desktop first chart row visible, no page overflow; 390px evidence access/keyboard routes tested |
| Focused fresh read-only review | Selected-field fallback found and repaired; follow-up verified missing-field headline/chart/delta refusal and reload/focus; no significant remaining issues in reviewed scope |

The focused browser cases exercise density/direction/reversal/statistic changes, baseline
phase-field ownership and fixed C−B, summary returns, reload/Back/focus, incompatible
contract refusal with current values retained, invalid/unsupported phases, true pending
zero, missing phase, signed negative geometry/false visibility, partial and all-censored
recovery. Synthetic startup records are labelled test fixtures and never registered as
production checkpoints. Browser service requests are blocked and asserted absent.

Fresh review found that an absent selected phase still let the exact view use its default
primary measurement (for example forward reversal link displaying middle 50.25ms). The
exact view now honors the selected field even when absent: unavailable headline, no bar,
no numerical delta, raw Absent row and stable reload/focus. The new regression initially
expected the weaker no-timing message; it was corrected to the existing stronger
`Field absent; numeric comparison withheld` refusal. Earlier browser failures were obsolete
expectations for the removed preview table plus test focus/minus-glyph assumptions; those
were updated to exercise the new summary and retain the validity assertions. Baseline
exact-view comparison also preserves the explicitly selected primary field when resolving
the current counterpart, so reversal does not silently compare middle-phase values.

Remaining limits: small aggregate samples, no raw trials/statistical confidence intervals,
uncertified compositor paint, D7/D11 foreground producer gaps, uncontrolled source/content/
cache, unverified rendering revisions and P14 U1/U2 remain. Local checks do not certify
producer correctness, physical trackpad/touch behavior, screen readers, native selector
popup key behavior or cross-browser parity. PP3 safeguards and deferred RTT are unchanged.
Search summary expansion, new thresholds/checkpoints, legacy retirement and campaigns
require separate authorization. No app/producer, infrastructure, history, dependency,
live/private-data or Git mutation occurred.

## Historical Proxy Baseline and Review Corrections

**24 October 2026 — bounded saved-history integration, operator-confirmed membership.**
The two review corrections were completed before proposing a historical baseline. The
operator explicitly confirmed the following three separately executed checkpoints;
this is an assembled baseline, **not one atomic campaign** and not a label/latest-entry join.

| Baseline family / kind | Exact save timestamp (UTC) | Included IDs | Observations per ID |
| --- | --- | --- | --- |
| audit / rendering | 2026-10-24T00:14:11.263Z | 34 | 4 |
| perceived / short | 2026-10-23T23:29:50.826Z | 15 | 4 |
| density / density | 2026-10-24T04:32:34.673Z | 21 | 4 |
| perceived / long | **Explicitly absent** | 0 | — |

The registered `proxy-baseline` contains **70 included records** versus the current
four-entry canonical checkpoint's **78**. The older 23 October long run is deliberately
not included. Missing long coverage is visible in the shared header and provenance;
JA2/JB5 have no baseline observation. Missing/ambiguous registered members are still
reported and never replaced from another timestamp. Registration adds only adapter
membership; canonical JSON/JS histories remain unchanged, and full raw records retain
family/kind/timestamp/scenario/revision identity and selected-side ownership.

### Corrections and Discriminating Controls

- **Failing first:** with P14b `captureValid=false`, interpretation rejected the measurement
  but `ASSESSMENT.findings` still produced the raw 3/15 conclusion. The new regression
  failed on that conclusion before the repair. A shared traversal-evidence gate now owns
  valid counts/population, finding selection, cadence percentages and visible summary text.
  Invalid/unsupported captures remain visible as unassessed reasons with raw-record links,
  with no assessable finding, percentage or performance priority. Valid zero loaded counts,
  valid poor performance and valid censored outcomes remain measured states.
- **Fresh review found a coupled grading bypass:** zero denominator, zero observations or
  counts beyond the denominator could still earn a reassuring raw-count grade. Traversal
  grades now use the same gate. Unit presentation controls use the real traversal grader,
  not an always-Unrated test substitute; browser startup fixtures exercise zero-total,
  over-total and empty populations through both Overview and exact evidence.
- **Fullscreen wording:** the summary now says “Not charted in this summary; saved
  observations are available below” when those records exist. It links to the complete
  saved observations. Absence in a selected checkpoint is labelled separately. No return
  charts, timing fields, producer observations or synthetic samples were added.

### Compatibility and Descriptive Comparison Limits

The three matched entry environments pass the existing guard: deployed TEST media-api,
proxy versus canonical delivery, recorded browser/version/viewport/DPR/CPU/cache/cutoff
compatible. Source fingerprints **differ** for every matched family; content/cache warmth
is uncontrolled and the cutoff does not freeze the corpus. No isolated delivery effect,
statistical significance or population-tail claim follows from the comparison.

Primary-record contract checks permit 13 rendering, 15 short and 21 density pairs. This
**does not certify every field as available**. Existing per-field population, capture and
network-topology restrictions still run before plotting. In particular:

| Case | Current / baseline evidence | Display restriction |
| --- | --- | --- |
| PP3 settlement | 1,114 / 1,157ms | Descriptive C−B −43ms (−3.72%); same record contract |
| PP7 settlement | 1,114 / 1,160ms | Descriptive C−B −46ms (−3.97%) |
| P13c | revision 3 / revision 2 | Refused: scenarioRevision, cacheClass, completionBoundary, detailObservationLimitMs |
| P14a–d | revision 3 / revision 2 | Refused: scenarioRevision; current cadence/landing values remain |
| 16 rendering records, e.g. P2 | unverified scenario revision | No numeric pair despite available raw observations |
| JA2/JB5 | no long baseline member | No borrowed earlier success or baseline plot |
| D8 Table media readiness | null / null; both 0/4 completed | Outcome counts remain; no deadline/zero latency or numeric delta |

Exact evidence uses the selected record's owning entry, not a checkpoint-level guessed
source. Inspecting baseline PP3 retains C=`recorded`, B=`proxy-baseline`, `side=baseline`
and the baseline timestamp/record identity. Deltas remain C−B, including in the evidence
view; reload and Back retain field, side and pair. Legacy dashboards are retained.

### Local Validation and Independent Review

| Command / check | Final result / scope |
| --- | --- |
| `npm --prefix kupua run test:perf-harness` | **431 passed**, including 16 dashboard interpretation/presentation regressions; offline contracts only |
| `npm --prefix kupua run test:perf-fixtures` | **125 passed**, including real-baseline direction/ownership/refusal tests, traversal invalid/unsupported/malformed/zero controls and retained legacy fixtures |
| `npm --prefix kupua run typecheck:perf` | **Passed, pipeline exit 0** |
| Clean local-file navigation/reload | Real sidecars and new registry loaded from disk; canonical current and proxy baseline selected; no DOM/script rewrite or synthetic production history |
| Browser interaction/layout | Real compatible PP3 C−B, baseline field identity/reload/Back, current P14 values beside revision refusal, missing long, null recovery and fullscreen saved-record wording; desktop/mobile checked |
| Fresh read-only review | Found traversal-grade bypass; fix verified in follow-up with **no remaining high-confidence findings in the bounded scope**; reviewer ran all 16 dashboard unit checks, inspected browser cases but did not rerun browser suite |

Validation ran from repository root through the existing npm scripts with pipefail/tee;
no dependencies were installed. Test-only startup fixtures use the actual local-file page.
One new browser expectation initially used the wrong missing-family phrase, then was
corrected to the existing reason; that was not a relaxation of comparison eligibility.
The unit runner also needed native-array comparisons across VM contexts after the second
checkpoint was added. Final gates above passed after the reviewer-driven grading repair.

Remaining limits: P14 U1/U2 clocks/cache interpretation, legacy U7/U13/U14 presentation,
unsupported paint, small samples, unverified revisions and provisional grades are not
closed by this unit. PP3 safeguards and deferred RTT are unchanged. No campaign/dry run,
live service, private-log inspection, infrastructure/app/producer change, history rewrite,
schema migration, dependency installation or Git mutation occurred. Stop here for operator
review before further checkpoint registration or workflow expansion.

## Canonical Dashboard Integration

**24 October 2026 — bounded local integration, not a campaign or producer certificate.**
Operator approved the existing compact Overview -> Image Workflows -> exact evidence
direction, only the documented four-entry checkpoint, and visibly provisional grades.
The [page](../../../e2e-perf/results/Performance%20dashboard.html) loads all three canonical sidecars through
the [shared adapter](../../../e2e-perf/results/dashboard-data.js); curated/synthetic design inputs are
not production history. The 78 records retain their raw objects, revisions, contracts
and owning entry provenance. Histories and producers were not edited by this unit.

Checkpoint membership names family/kind/timestamp and exact expected scenario sets.
Tests cross-check those sets against maintained manifests and all three sidecars against
canonical JSON. Missing, ambiguous or unexpected members are disclosed, never inferred
from labels or replaced by independently latest entries. At that initial integration checkpoint, no historical cross-family baseline was
registered; the later confirmed baseline is documented above. Legacy dashboards retain
historical access.

Shared interpretation distinguishes publication/coverage, capture validity, app outcomes,
field timing populations and comparison eligibility. Responsiveness healthy `sampleCount`
is not its all-outcome denominator when `degradedCount` exists. Density assessments retain
the relevant revision/capture/lag/overflow gates and complete-field sample requirements.
Raw null, zero, false, absent, partial and unsupported fields remain inspectable. Declared
readiness endpoints stay absent rather than falling back to frame timing. P13c clocks,
P14 U1/U2 limits and JA2 loaded/stable wording remain distinct; no cache/decode/paint
guarantee or threshold approval was inferred.

All workflow evidence links share `side=baseline`, preserving checkpoint/baseline and
C−B direction. Selected-side membership, baseline scroll panels, missing fields, reload,
Back, summary returns and same-field focus are tested. P13a/b and uncharted fullscreen,
selection/panel records remain reachable without inventing new latency charts.

### Validation and Review Boundary

| Local check | Result / scope |
| --- | --- |
| `test:perf-harness` | 426 passing offline checks, including 11 dashboard data/interpretation checks |
| `test:perf-fixtures` | 116 passing browser fixtures, including 18 new integration walkthroughs; legacy dashboard controls retained |
| `typecheck:perf` | Compiler completed, pipeline exit 0 |
| Visual/interaction | Desktop Overview and mobile Image Workflows inspected; automated 320px table scrolling, keyboard field focus, reload and Back |

Clearly synthetic cases use the actual local-file page with test-only startup data;
none is offered as production history. Controls cover healthy, mixed, all-degraded,
censored, unsupported, absent fields/family, invalid captures, incompatible revisions,
signed/false guards, zero baselines and three/five/forty contributors. Larger-population
p95 retains p95 wording rather than becoming an invented observed maximum.

Fresh read-only reviews identified and drove repairs to density gates/populations,
unsupported outcome claims, baseline ownership, image workflow mapping, absent-endpoint
substitution, nullable percentage formatting and population-aware visible labels. A
follow-up verified the final three findings resolved within their stated boundaries.
No whole-product, historical-campaign, producer-correctness or accessibility certification
follows. Native picker popup keystrokes remain host-dependent; role selection and ordinary
keyboard links/focus are covered. Existing legacy U7/U13/U14/U15/U16 limitations remain.

Negative approaches retained here for future diagnosis: initial sandboxed Node execution
exited 255 without a summary, then worked after operator permission changes. Exact
`getByLabel("Baseline")` did not match the populated nested label; the role locator did.
Bootstrap/lifecycle guesses did not resolve that mismatch. Embedded file resources also
retained an earlier script version until cache-busted in-memory review loading; fresh
Playwright executions, not that stale view, supply the automated evidence. No private
logs, live services, infrastructure changes, campaigns, Git writes or history salvage
were used. Documentation checks found two pre-existing missing justified-plan links
outside edited routing; they were left untouched.

## Latest Saved Canonical Checkpoint

Read-only parsing of public canonical histories on 24 October 2026 establishes:

| Family | Save timestamp (UTC) | Scenario IDs | Observations per ID |
| --- | --- | --- | --- |
| Rendering | 2026-10-24T08:30:42.035Z | 34 | 4 |
| Short responsiveness | 2026-10-24T08:33:51.333Z | 15 | 4 |
| Long responsiveness | 2026-10-24T08:36:16.196Z | 8 | 4 |
| Density | 2026-10-24T08:49:53.477Z | 21 | 4 |

All four entries are labelled `deployment checkpoint - canonical media`: 78 IDs,
312 scenario observations, **not 312 independent trials**. Long responsiveness is
now published; earlier successful-but-withheld long executions remain historical.
All three public JS sidecars structurally equal their canonical JSON. Histories now
contain 75 rendering, 113 responsiveness and 17 density entries. Completeness was
checked against the maintained manifest and active density contracts; individual
metric availability is not inferred from scenario-level sample counts.

Recorded setup: laptop development app, media-api / deployed-test / canonical,
headed Chromium 151.0.7922.34, 1720x960 screen and viewport, DPR2, one worker,
no CPU throttle, uncontrolled browser cache and 15 February 2026 cutoff. All four
entries record dirty `293b29f3b`, working-tree fingerprint `6315b7a73b5cba68` and
app-source fingerprint `b584b82db7e335c9`. Matching fingerprints do not cover
untracked file contents or establish identical content/cache warmth. Density's
21 records are seek tier. This is M5, **not M6 hosted-build evidence**.

The first-to-last canonical save span is 1,151.442 seconds (19m11s). It excludes
rendering execution before its save and compiler/startup work: **not total campaign
runtime or a forecast**. No private report was read to establish a new runtime.
Earlier report-backed proxy durations below remain configuration-specific evidence.

### Outcomes, Not a Health Certificate

| Signal | Saved result | Interpretation / limit |
| --- | --- | --- |
| P13c returned-media detail | 4/4 ready, 0 censored/failed; median decoded/stable readiness 1,374ms; metadata 253ms | Revision 3, not guaranteed warm media; clocks are not additive |
| P14a normal forward | Median 10/10 within cadence; landing 430ms | 4/4 final landings completed within 15s; U1/U2 interpretation limits remain |
| P14b fast forward | Median 3/15 within cadence; landing 6,653ms | Same 4/4 completion horizon; completion does not mean responsive traversal |
| P14c fast backward | Median 2/10 within cadence; landing 2,695ms | Same limited landing clock |
| P14d rapid forward | Median 4/20 within cadence; landing 6,172ms | Same limited landing clock |
| Short PP3 / PP4 | 4 healthy observations each; settlement medians 1,114 / 984ms | No recorded degradation; unresolved transport fault is not disproved |
| Long JA2 detail entry | Settlement median 6,474ms; four-observation p95/max 18,056ms | Loaded image + stable geometry, not an explicit decode oracle (U16) |
| D1 middle forward frame-p95, Grid / Justified / Table | 50.25 / 17.55 / 62.35ms | Median of within-observation frame statistics; not action latency or universal score |
| Same step achieved results/s | 99.61 / 111.30 / 96.30 | Requested 100; equal requested demand is not equal achieved motion/work |
| Same step pending visible slots | 3.60% / 1.90% / 41.13% | Per-observation median; Justified observed maximum 83.23% shows median alone is insufficient |
| D8 constrained stopped-media recovery | Grid 4/4, median 2,021ms; Justified 4/4, median 2,487.2ms; Table 0/4 | Table latency null, sampleCount 0 / unavailableCount 4; not zero or a 4s latency |
| D11 within-repetition comparisons | Grid 4/4 and Justified 4/4 valid; media delta medians -17.05 / -89.90ms | Prior proxy 2/4 isolation result is not the latest result; negative deltas are not causal speedup proof |

P13c/P14 are revision 3; old revision 2 media/landing series must not be joined as
if semantics were unchanged. Revision 3 retained slow/censored outcomes but did
**not** resolve the original U1 first-readiness/ready-at-boundary or U2 resource/cache
findings. Current code still observes landing after final cadence and uses zero
transfer size as cache evidence; saved `landingCacheHit=true` is not a certified
browser/CDN cache hit. No claim of isolated delivery speedup follows from unmatched
proxy/canonical history, changed source, codecs, signing or uncontrolled caches.

The responsiveness import still hardcodes P13c warm-media wording and drops
completion/censor metadata and `completionBoundary`. This is a confirmed current
presentation divergence, not a second independent measurement. Its repair belongs
to U14's canonical-record view with U7's outcome requirements.

### Reproduction and Coverage of This Assessment

Read the public `entries` arrays in [rendering](../../../e2e-perf/results/audit-log.json),
[responsiveness](../../../e2e-perf/results/perceived-log.json) and [density](../../../e2e-perf/results/density-log.json).
Select the exact timestamps above, inspect `metrics` / `perceived`, scenario revision,
record sampleCount and each density metric's median/p95/sampleCount/unavailableCount.
Compare parsed JSON with the assignment payload in the matching public JS sidecar.
Use [manifest definitions](../../../e2e-perf/harness-validation.mjs) and
[active density definitions](../../../e2e-perf/density-reporting.mjs), not history labels, for coverage.

Current source spot-checks: [P14 observation/resource evidence](../../../e2e-perf/perf.spec.ts),
[responsiveness projection and latest-finite selection](../../../e2e-perf/results/perceived-graphs.html),
[comparison restrictions](../../../e2e-perf/results/campaign-comparison.js) and
[recorded repair rationale](../changelog.md).
This is not a fresh audit of every U1-U18 implementation or every metric.
No tests, campaigns, browser/live-system actions or private-log inspection occurred.
Existing uncommitted code and histories were preserved.

<a id="frozen-pre-reconciliation-workplan-snapshot"></a>
## Earlier Implementation and Campaign Evidence

Duplicated planning sections have been removed. The retained assessments below
record earlier measurements, repairs and negative controls; their then-current
recommendations are historical, not execution authority. The current workplan
owns decisions and next actions.

### Canonical Traversal Evidence

The failed operator attempt remains the first rendering repetition (21 passed,
P13c/P14b failed), with no canonical histories published. Later bounded browser
diagnostics establish browser aborts, not upstream cancellation. A 1150x919/DPR2
probe's final image loaded after 8.3 seconds: request sending began in about 3ms,
then waited about 8.27 seconds for headers. Its request was not cancelled; earlier
visible requests were cancelled or completed. This is not proof of transform CPU,
source-fetch latency or an imgops-versus-imgproxy ratio.

At campaign screen and viewport 1720x960/DPR2, the same target's prefetch and visible
URLs matched exactly both before and after reload: w=2580, h=1440, q=85, r=0.
An earlier mismatch in the smaller resized tab is not representative campaign
evidence. The subsequent rank-3, fifteen-step/200ms canonical replay loaded 5/15
images within cadence; its final image loaded after 3.65 seconds, JPEG about 212KB,
returned 959x1440 from a 2195x3293 source. The effective desktop DPR multiplier is
1.5, not 2. The final successful request again spent most time waiting for headers.
Some setup/early images were cached: this is not an independent baseline or a
completed paired-delivery comparison. No app cancellation defect is established.

The [signing assessment and PR #5075 recommendations](../01%20Research/imgproxy-research.md#24-october-2026-canonical-delivery-and-pr-5075)
own the request-signing mechanism, observed comparison limits and concrete review
criteria. Fresh metadata can re-sign source URLs within one expiry bucket;
resident traversal does not. PR #5075 embeds freshly presigned sources and adds
an API/ES URL-resolution path, unlike current local Kupua's stable S3 identity.
Signing is not inherently cache-busting: deterministic HMAC and rotating nested
source credentials are distinct. No isolated-transformer or deployed-PR performance is claimed.

The [paired fast/slow data](../../../e2e-perf/research/traversal-delivery-2026-10-24.json) contains three valid
fast repetitions and one slow pass per arm over the verified same cohort. Imgops
loaded 3/45 within cadence with mean final load4355.6ms; imgproxy-docker 3.31.1
loaded23/45 with mean42.2ms. Both slow passes loaded/decoded16/16; successful body
totals were5,055,967 versus2,402,006bytes (52.5% fewer). Version3.31.1 is operator-
reported; Docker tag was latest and binary version flag unavailable. JPEGq85 versus
local AVIF/default quality and uncontrolled upstream/decoded state prevent a pure
transformer or cold-upstream conclusion. Schema2 retains raw header-event marks
and separate derived header-complete offsets after four proxy clock inversions.
Data arithmetic/cohort/schema/safety checks and independent read-only review passed.

The operator-requested 4.0.19 upgrade arm is appended without changing the original
two arms or their summary. It loaded33/45 within fast cadence (runs12/11/10), with
mean final58.0ms; slow16/16 body total2,623,447bytes (+9.2% versus3.31.1), mean
header wait647.6ms and post-load decode confirmation29.8ms. All native geometry,
ordered cohort and observed AVIF output dimensions match the previous proxy arm.
Version is operator-reported and its Docker image ID is recorded. Preservation
fingerprint, row/cohort/cache/timing/privacy and derived-aggregate checks passed.

### U10 Completed Boundary

The [shared comparison helper](../../../e2e-perf/results/campaign-comparison.js) and the paired-mode
labels in [rendering](../../../e2e-perf/results/audit-graphs.html) and
[responsiveness](../../../e2e-perf/results/perceived-graphs.html) now distinguish matching recorded
source fingerprints from verified identical source and explicitly state that untracked
file contents are not covered. Differing/unavailable fingerprint labels are qualified
too. Generation, historical records, comparison eligibility and campaign execution
are unchanged; no PP3 behavior or safeguards were modified. This is fingerprint
coverage wording, not a claim that the audit missed uncommitted research inputs.

[Harness regressions](../../../e2e-perf/validation/harness-validation.test.mjs) failed first on the
old wording, then passed with unchanged eligibility assertions for differing/missing
source evidence. [Dashboard navigation](../../../e2e-perf/validation/dashboard-navigation.spec.ts)
and [density fixtures](../../../e2e-perf/validation/density-fixtures.spec.ts) assert the qualified
label. Local validation used `test:perf-harness`, `typecheck:perf` and
`test:perf-fixtures`; no campaigns or live access. The sandboxed Node attempt emitted
no summary and was not counted; offline harness validation completed unsandboxed.
An independent read-only reviewer found no issues within the supplied U10 boundary,
not a review of all pre-existing dirty changes.

Retained limitation: the two older paired-mode helpers can call equal literal
`unknown` hashes matching; their decision logic was intentionally not changed.
Fingerprint equality still does not establish identical source. No stronger hashing,
history migration, instrumentation change or transport fix is claimed.

### U11 Completed Boundary

The [trace header](../../../src/lib/perceived-trace.ts) and active
[component reference](../00%20Architecture%20and%20philosophy/component-detail.md#perceived-performance-instrumentation-libperceived-tracets)
now describe the existing gate: automatically enabled in DEV; non-DEV browser opt-in
only for localStorage value `"1"`, evaluated at module initialization. No production
bundle-elimination/zero-cost guarantee or hosted-harness parity follows. Executable
tracer code and instrumentation policy are unchanged.

[Gate regressions](../../../src/lib/perceived-trace.test.ts) cover DEV/non-DEV with
absent/`0`/`1` flags, marks, buffer/browser-helper exposure, and both directions of
post-import flag changes. A header-contract assertion failed first on the false
documentation, while behavioral cases passed; after correction, the focused and
full unit surfaces passed. Performance typecheck and editor diagnostics were clean.
Independent read-only review found the component-reference contradiction, which was
corrected and re-reviewed successfully. No component, hook, store or scroll behavior
changed, so no product E2E surface was triggered by this unit.

Limits: these are jsdom checks with stubbed DEV, not a production build or real-browser
reliability check. No no-window/inaccessible-storage behavior was certified, and no
campaign, live access or transport investigation occurred. Preserve PP3 safeguards
and defer RTT removal. U8 was subsequently completed below; the early checkpoint still
requires separate approval, not completion of all audit repairs.

### U8 Completed Boundary

[Diagnostic revision 2](../../../e2e-perf/focused-sort-degradation.mjs) redacts media identities at
request capture, summary/emission and ordinary formatting boundaries. The compatible
focused-ID field is always null; operation paths use conservative, position-specific
known names and placeholders. The formatter also redacts old in-memory identity-bearing
operations/failure text and contains malformed URL normalization. Its shared output
feeds both console and persisted run reports. [Declarations](../../../e2e-perf/focused-sort-degradation.d.mts)
match the new diagnostic revision. No stable identity hashes were added; the subsequently
approved PP3-only private exception is separate from these ordinary diagnostic records.

Retained evidence: UTC action start, fallback reason/phase/time, warning categories,
request ordering, route/category, sent/header/outcome timings, capture overflow,
stall markers and concurrent completions. This supports bounded correlation, not
exact-image reproduction. PP3/PP4 acceptance, campaign continuation, failure boundaries,
medians, historical records, workload revisions and campaign order remain unchanged.
The transport investigation remains paused, and RTT removal remains deferred.

[Privacy controls](../../../e2e-perf/validation/focused-sort-degradation.test.mjs) and
[report-sink checks](../../../e2e-perf/validation/harness-validation.test.mjs) failed first on the
old ID-retention behavior. Independent review found legacy raw-failure emission and
malformed-operation exceptions; both were reproduced by failing controls, repaired
and re-reviewed with no blockers. Final local validation: 392 offline harness checks,
performance typecheck and editor diagnostics passed. No source application behavior
changed; no campaigns, browser/live sessions, private logs, commits or historical
artifact rewrites occurred. This is not a general hostile-object sanitizer or a
certification of every campaign output; scenario/operator labels remain trusted metadata.

Next: obtain the early campaign checkpoint decision below. No more audit repair is
automatically a prerequisite. Known U5/U7 interpretation limits still apply; a clean
local validation result is not a live reliability or transport-fix claim.

### PP3 Private Exception and Dashboard Check

The operator explicitly approved PP3 degraded/fallback media IDs in the campaign-end
debug summary and private temporary logs until debugging is complete, then deletion.
The short-suite emitter writes only PP3 to a bounded external 0700/0600 handoff; the
runner collects/removes it after child completion/error, independently of successful
metric parsing. IDs already emitted survive later handled child failure. A separate
final section runs on campaign success/failure. Ordinary formatter/metrics, PP4 and
history remain redacted. The run report is now a private external temporary file;
the operator must also keep `tee` private. No transport capture or investigation resumes.

Failing-first private-channel controls were added, then actual emitter and fake-child
controls verified PP3-only separation, child failure/error cleanup, and cleared inherited
handoff configuration on long runs. The prior final-handler assertion was updated to
require both ordinary and private reporting paths. Independent review found no remaining
blockers. The final promise-finally cleanup form passed all 397 harness checks. Abrupt
parent termination can leave a handoff or omit the final summary; failures before the
existing degraded emitter runs have no private ID. No campaign/live reliability is certified.

At operator request, inspected all three saved local dashboards, not live app tabs.
Density was readable in a 390px screenshot; rendering/responsiveness loaded data and
chart canvases, and metric/comparison controls responded without horizontal overflow.
The browser remained hidden and a chart screenshot failed, so this is not complete
visual/paint verification. Shared tab returned to density. Existing density history
still exposes constrained/censored outcomes. This inspection is not a new measurement.

### Current Campaign Assessment

Assessed on 24 October 2026: **deployment checkpoint - short suite**, canonical save
`2026-10-23T23:29:50.826Z`, four repetitions, deployed TEST media-api with proxy media.
Recorded source is dirty `293b29f3b`; headed Chromium 151, 1720x960, DPR 2, one worker,
no CPU throttle, uncontrolled browser cache and the pinned 15 February cutoff.

- **Complete and healthy within this slice:** all 15 expected scenario IDs, four healthy
  samples each (60 total), zero recorded PP3/PP4 degradation. Each repetition reports
  15 passed and two intentionally opt-in restore diagnostics skipped. No auth stop or
  nonzero Playwright exit appears in the matching private report.
- **Observed duration:** 202.67 seconds from runner-report creation to canonical save,
  excluding npm's compiler preflight. The four child runs total 198.5 seconds
  (51.6 / 48.4 / 48.8 / 49.7 seconds). This is useful runtime evidence for this short
  profile, not an estimate for full/density campaigns or a reliability guarantee.
- **Evidence agrees:** all 27 phase summaries recoverable from numeric scenario log
  lines reproduce the saved rounded median and observed-max/p95. Last-repetition
  JSONL has all 15 IDs and no degradation. Perceived/rendering/density JS sidecars
  match canonical JSON; Markdown includes the new record. Canonical history contains
  no detailed focused-ID/request/warning diagnostics. The private report is mode 0600;
  zero degraded PP3 outcomes means the private-ID exception was not exercised live.

Foreground settlement below is milliseconds, **median / observed maximum**. With
four observations the saved nearest-rank p95 equals the maximum, not a population tail.

| Scenario | Settlement | Scenario | Settlement |
| --- | --- | --- | --- |
| PP1 home | 868 / 1129 | PP2 sort without focus | 664 / 680 |
| PP3 focused sort | 1157 / 1198 | PP4 focused direction | 1088 / 1147 |
| PP5 filter | 770 / 850 | PP6 density | 211 / 261 |
| PP6b mid-buffer density | 210 / 213 | PP6c post-eviction density | 242 / 246 |
| PP7 seek click | 1160 / 1263 | PP7b seek drag | 1089 / 1130 |
| PP7c buffered scroll | 132 / 142 | PP8 warm search | 1174 / 1238 |
| PP9 chip removal | 1093 / 1127 | PP11 history restoration | 1247 / 1376 |

PP3's four settlements are 1158/1155/1064/1198ms; PP4's are 1081/1063/1095/1147ms.
PP9/PP11 recorded zero anchor drift, and achieved seek ratios track requested ratios.
Background PP10 publication is 1289 / 1936ms, with 21,627 map entries matching its
result total; it is not a foreground visible/settled result. PP9 producer acknowledgement
is 400 / 414ms, a distinct clock rather than proof of visual-feedback delay.

**Dashboard finding, independently confirmed; repaired locally on 24 October 2026:** starting in full history and selecting
the latest/prior short pair leaves six old JA/JB cards visible with acknowledgement
subtitles and 133-entry history arrays, even after changing to visual settlement.
The selected short charts and their median/p95 values were correct. The defect was in
[render's selected-ID reconciliation](../../../e2e-perf/results/perceived-graphs.html#L628): old cards
and Chart instances absent from the new `allIds` are never visited/removed. Toggling
Long off/on explicitly clears/rebuilds the charts and was verified to remove the stale
cards without losing the selected pair. No product/dashboard code was changed during
the original assessment. The subsequent authorized repair reconciles the Chart map
against selected scenario IDs before updating cards, destroying and removing absent
charts/cards from either grid, including when the selected entries are empty.

The mixed short/long regression in the existing
[dashboard tests](../../../e2e-perf/validation/dashboard-navigation.spec.ts) failed first with both
long-only cards retained after selecting two short campaigns and changing the metric.
It now verifies removal in both grids, exactly-once destruction of abandoned Charts,
and selected metric labels and exact selected-campaign data for retained cards.
Local gates passed: 406 harness checks, 87 browser fixtures and unsandboxed performance
typecheck with explicit pipeline exit 0; editor diagnostics clean. Independent read-only
review found no issues within this patch. The Chart stub certifies lifecycle calls and
configuration, not actual Chart.js disposal/paint; return-to-history and empty-selection
transitions are not separately covered by the new case. No campaigns, live systems,
measurement semantics, histories or PP3 safeguards were changed. General onboarding
and documentation routing are unchanged, so AGENTS needs no additional task narrative.

All three saved dashboards loaded without page errors in the checked navigation paths.
Responsiveness shows the new record; rendering and density correctly remain at their
prior campaigns because this was short-only. The new foreground chart values and all
14 p95 values match canonical data. Background publication is separated; missing
banner timings are not drawn as zero. Density's existing constrained/censored outcomes
remain visible, and its overview drilldown/tooltip scopes workload, phase, density and
sample denominator correctly. The shared tab was restored to the original density
overview/campaign pair and 390x844 viewport. Static mobile screenshots and DOM checks
show no horizontal overflow; desktop DOM checks were also performed. The embedded
browser remained hidden, so static Chart updates/pixel checks are not foreground paint
or live performance certification.

**Limits that remain:** status timings are all null; U5's PP3/PP4 ownership defect means
this cannot establish absent/instant banners. The saved 1ms RTT is the separate ES
attempt diagnostic, not deployed-API latency (U9 remains deferred). Store/seek timings
are separate clocks and are not additive action decomposition. The prior short record
used local API and different clean source; the comparison correctly reports changed
topology and differing recorded fingerprints, but cannot isolate deployment cost or
establish improvement/regression. Cache/content warmth is uncontrolled and untracked
file contents are outside fingerprint coverage. This clean four-repeat run does not
resolve the earlier transport failure, exercise its laptop/local-API tunnel path,
validate private PP3 failure output, certify the quiet-auth-stop live path, measure
long journeys/density/sustained scrolling, or establish M6 hosted-build support.

Operator's continuation instruction supersedes the earlier one-slice recommendation:
first fix/validate the stale-card defect, then provide four-run commands for rendering,
long responsiveness and density, excluding the already completed short suite. Keep
deployed TEST API/proxy delivery and existing workload/repetition order. Pure selection
logic confirms two existing invocations suffice: default existing suite selects only
rendering; `--suite combined --long-perceived-only` selects long responsiveness and
density, with neither rendering nor short. Do not add a new selection flag, use
`--full`, revive retired probes or broaden into a topology/delivery matrix. Freeze
files across both runs, retain each unique private run report, inspect both canonical
results and all dashboards after completion, then recommend the next bounded unit
and obtain its applicable confirmation. The short suite's observed runtime is not a
budget estimate for these remaining families.

### Remaining-Campaign Assessment

Assessed on 24 October 2026 using operator-saved local evidence. No agent campaigns,
dry runs, live-system access or measurement-code changes. Both unique private runner
reports and numbered terminal logs were retained outside the repository, mode 0600.
Future command handoffs must supply distinct tee filenames instead of leaving numbering
to the operator. The agent terminal TMPDIR differs from the operator's: locate private
reports using the recorded path, not assumptions about the tool environment.

**Rendering completed:** canonical save `2026-10-24T00:14:11.263Z`, four repetitions,
23 passed tests each, 34 metric IDs with four observations each (136 metric observations,
not 136 tests). Actual selection was rendering only. Setup: laptop development app,
deployed TEST API/proxy, dirty `293b29f3b`, headed Chromium 151, 1720x960, DPR 2,
one worker, no CPU throttle, uncontrolled browser cache. Report creation to save was
719.191 seconds excluding compiler preflight, not a future duration guarantee.

- All three JS sidecars match canonical JSON. Latest rendering Markdown's 374 checked
  frame/network cells match JSON with formatting/CLS rounding, sparse-frame suppression
  and unavailable network values preserved. Recomputed 216 core numeric aggregates
  from 108 printed PERF REPORT blocks agree within printed precision. Those blocks
  cover 27 IDs; they do not reconstruct every variant or full-precision raw record.
- Six median frame counts are below 30: P5c, P13b, P15a/b/c and P16b. Their severe
  rates are suppressed, not trustworthy high/zero rates. Seventeen metric records have
  unavailable transfer bytes from zero-size/restricted-or-ambiguous capture, not
  measured zero transfer or cache proof.
- Focus remains visible but median drift is nonzero: P4a/P4b +160/-160px, P6 +278px.
  P14a/b/c/d median rendered counts are 10/10, 12/15, 4/10 and 2/20; landing render
  times are 418/136/303/357ms. These descriptive outcomes are not a clean-health claim
  or evidence that deployment caused them.
- Dashboard scan checked 325 latest-series values against JSON, normalizing boolean
  flags to 0/1. Selected prior/local and latest/deployed campaigns correctly warn of
  changed topology, differing source fingerprints and uncontrolled warmth. Markdown's
  automatic "No regression detected" is only a configured metric-pair threshold
  verdict: its generator does not gate on campaign environment/source. Independent
  interpretation review confirmed that this is not controlled deployment non-regression
  evidence. No reporting-code repair was authorized. Rendering frame p95 is a within-run
  statistic aggregated across repetitions, not responsiveness's four-sample observed max.

**Combined failed closed:** actual selection was long plus density, neither short nor
rendering. All four long repetitions passed (two tests/eight emitted metric records
each, 32 records). Density repetition one passed scroll-forward in 42.787s, then failed
scroll-backward in 61.435s; seven workload tests did not run. Each workload test contains
density iterations, so these are not individual density-sample counts. The extra
top-level error only records the configured stop after one failure. No auth stop or
degraded summary was recorded; incomplete density is not a healthy campaign.

Failure is in [restoreDensitySource](../../../e2e-perf/density-browser.ts#L89), before the affected
iteration's measured journey: Table placement did not stabilize on the elected identity
within the existing deadline. The generic message cannot distinguish missing/offscreen
anchor, lost focus, callback/container absence, blocking state or unstable geometry,
nor identify the failing destination-density iteration. It does not establish a decoding,
transport, authentication or backward-scroll performance cause. The private error-context
artifact contains only test/error text, no page snapshot or restoration-state witness.
Independent read-only failure review found no basis to change the timeout or identity guard.

Deferred publication correctly withheld both new long and density histories after density
failed. Responsiveness still ends at the earlier short checkpoint; density remains at the
prior local-API campaign. Temporary metric files were removed by existing cleanup. Retain
private reports but do not salvage them into canonical history or silently resume/retry.
The earlier rendering save is a separate successful transaction.

**All dashboards inspected:** rendering controls, availability and numeric series checked;
responsiveness history-to-short-pair selection and visual-settlement change removes all
long cards, with 14 foreground values matching JSON and two selected points per chart.
Density retains historical constrained/censored outcomes and denominator/compatibility
wording. D7 blank-area DOM charts show 22.40%/29.16%, matching canonical Grid/Justified
medians. After the operator foregrounded the shared local tab, all three reported visible;
desktop/mobile DOM checks at 1440/390px found no horizontal overflow. Rendering and
responsiveness canvases have painted pixels; mobile screenshots of rendering controls,
a responsiveness chart and density controls were readable. This is saved-dashboard
rendering evidence, not live performance or general reliability certification. Shared tab
returned to density overview at 390x844. Neither live app tab was accessed.

**Diagnostic-only unit subsequently approved and completed:** harness-only, identity-free source-restoration
failure diagnostics with local adverse controls. Capture bounded workload/repetition/
destination context, seek-branch choice, source/focus equality booleans, buffer/DOM
membership, placement blockers, intersection/scroll geometry and stability progress.
Exclude identities, metadata, URLs and raw app errors. Preserve deadline, elected identity,
PP3 boundaries and transactional publication. Validate discrimination/redaction with existing
local fixtures. No product fix, reporting-verdict repair, new selection flag, history salvage
or operator reproduction is included without further approval. See the completed boundary below.

The earlier 60 healthy short samples, unresolved PP3 failure and U5/U9 limits remain.
Different source snapshots cannot establish controlled deployment effects or M6 support.

### Restoration Failure Witness Completed Boundary

The [placement helper](../../../e2e-perf/density-browser.ts) now appends a revision-1, final-state
witness only after its existing placement deadline expires. It records source/focus
equality booleans, buffer/DOM membership, blocking flags, anchor intersection, bounded
finite geometry and the final stability counter. Allowlisted workload, destination and
stage plus bounded one-based repetition identify the failed restoration; seekRequested
reports the actual branch and scrollRequested means the scroll helper was invoked,
not that its optional callback acknowledged or completed placement.

[Density setup](../../../e2e-perf/density.spec.ts) passes context for initial source establishment
and each layout iteration. Successful placement polling, deadline and elected-identity
requirements remain unchanged. Snapshot reads happen only on timeout; no ongoing
observer, extra API request, new measurement, history field or PP3 exception was added.
No IDs, query/metadata, URLs, raw data errors or arbitrary context strings enter the
witness. Earlier selection/seek/import/idle failures keep their existing behavior and
may not reach this placement witness; page/context destruction can also prevent it.

Eight [adverse browser controls](../../../e2e-perf/validation/density-fixtures.spec.ts) failed first
on the absent witness, then passed for missing container/anchor, lost focus, loading,
navigation, pending focus, offscreen anchor and unstable geometry. A ninth control
checks context rejection and verifies successful settlement skips timeout-only reads.
[Harness controls](../../../e2e-perf/validation/harness-validation.test.mjs) execute resident/seek
restoration branches and the actual campaign context expressions. Independent review
found that the runner already supplies a one-based repetition; its diagnostic-only
off-by-one was reproduced with a failing test and corrected without changing rotation.
Follow-up review found no blockers. Final local gates: 408 harness checks, 96 browser
fixtures, unsandboxed performance compiler pipeline exit 0 and clean editor diagnostics.

This is a terminal snapshot, not causal history or a fix for the operator failure.
Synthetic controls do not establish live reproduction, general reliability or transport
cause. Application source, campaign selection/order, thresholds, history and transaction
safeguards are unchanged. No product E2E or perf-app run was needed for this harness-only
change; no live/campaign execution occurred. General AGENTS onboarding/routing remains
unchanged, so no task narrative was added there.

The operator approved one repeat of the same four-run combined invocation, retaining
numbered private tee log 4 and its unique runner report. The result is assessed below;
no further campaign authority follows. No reduced reproducer or retry loop is established.

### Diagnostic Reproduction Assessment

The repeat report created `2026-10-24T02:01:17.419Z` confirms four long repetitions
passed again (two tests each, reported durations 18.8/17.4/18.0/17.1s). First density
repetition passed forward, then failed backward during Table source restoration before
the Grid iteration. Seven workload tests did not run. The extra error is the configured
stop-after-one-failure notice. Both new histories remain correctly withheld. Private
runner report and numbered tee log 4 are mode 0600; no raw identity-bearing artifact
was copied into the repository or chat.

The witness is useful: source, elected anchor and focus agree; anchor is buffered;
no seek was required; Table exists; no loading, navigation, pending focus, detail route
or data error is present. Yet the anchor is absent from the Table DOM after the scroll
helper was invoked (scrollTop 6638.5, scrollHeight 32036, viewportHeight 876). This is
unfulfilled placement of a resident identity, not evidence of a backend/decoding failure
or measured backward-scroll performance. Scroll dispatch is not an acknowledgement.

Local inspection finds that store-idle checks do not establish density-mount placement
completion. Density mount has deferred placement work; the scroll-to-focus callback is
optional/unacknowledged. Independent read-only review challenged a simple later-overwrite
theory: setting focused identity increments focus intent even for the same ID, which
retires many stale settled-placement snapshots. A readiness gap is real, but missing
callback timing, ineffective scroll or competing placement is not yet distinguished.
Do not call the race or a product defect proved from this terminal snapshot.

Long was repeated because its previous successful execution had not been published,
and the approved repeat retained the combined invocation's selection/order/transaction.
It did not fail. Repeating it was not necessary merely to interpret the density witness;
the lead should have made that cost and distinction explicit before command handoff.
Do not spend another campaign on that question or change transaction semantics to
salvage long history. A future density-only decision requires an explicit operator choice,
not a claim that the current selection model requires repeating successful long forever.

**Subsequently approved local unit:** extend the existing isolated app
restoration fixture with an elected resident identity outside the rendered Table window,
across a pending density mount, for same and changed focus IDs. Compare existing ordering
with the existing density-restore generation handshake before focus/one center request,
waiting for an increment only on a genuine density switch. If it discriminates, make
the smallest harness-only readiness repair while preserving seek choice, exact identity,
deadlines, workload order and publication. If local evidence does not reproduce the
problem, stop and report; if product placement ownership is implicated, request separate
approval. No live systems, operator rerun, timeout increase or repeated generic diagnostic
expansion is included. The resulting negative controls are assessed below; no repair
was justified. Assessment-only work adds no changelog entry or AGENTS narrative.

### Local Restoration Controls: Negative Result

The approved [isolated app controls](../../../e2e-perf/validation/density-app-fixtures.spec.ts) use
the actual renderers with 70,000 mock results and blocked service traffic. They elect
a source, switch to Justified, scroll elsewhere within the resident buffer, and assert
the source is buffered but absent from rendered rows. Both unchanged-focus and
changed-focus variants then restore Table successfully using the unchanged harness.
Placement checks require the elected identity to intersect the viewport with stable
geometry, not exact pixel centering. No media or application identity leaves the fixture.

Both controls passed before any repair; the complete isolated perf-app surface passed
all 23 tests. Unsandboxed performance compiler verification explicitly returned pipeline
exit 0, and editor diagnostics were clean. Independent read-only review found no
blocking test issues and confirmed the limited conclusion: these scenarios did not
reproduce the operator's failure. The tests are retained as coverage, not failing-first
proof of a synchronization fix. No harness/application behavior, waits, guards, campaign
selection, history, publication or PP3 policy was changed. No live systems or campaigns
were accessed; no speculative readiness change followed the passing controls.

Crucial gap: natural scheduling does not guarantee the restoration call overlaps the
pending two-frame density-mount work or precedes scroll-callback registration. Controller
round trips may let that work finish first. The same-ID focus setter also advances focus
intent and can retire stale settled placement. Passing local controls do not refute the
operator witness, prove a race absent or establish an API/deployment cause.

This unit stops at that negative result as agreed. A further bounded local timing control
would need to establish and deliberately exercise the mount/callback ordering, without
altering the app's placement contract. That requires a new operator decision; another
operator campaign, generic diagnostic expansion or product fix is not a substitute for
this missing discrimination. General AGENTS onboarding/routing remains unchanged.

### Deterministic Timing Investigation Boundary

The operator approved local ordering controls and explicitly emphasized that the
application itself, especially deployed-media-api behavior, must remain a candidate
and is more important to fix than the perf harness. The new
[four actual-renderer controls](../../../e2e-perf/validation/density-app-fixtures.spec.ts) independently
hold scroll-callback registration or deferred density-mount completion, with same and
changed focus. Instrumentation is applied only to loopback-served fixture modules;
service traffic is blocked and data is mock. Application and harness files are unchanged.

Observed and asserted registration-held boundary: one dispatch, zero callback entries,
one valid queued registration and advanced density-restore generation. Changed-focus
placement times out with the identity focused/buffered but absent from Table DOM.
Unchanged focus can recover via the application's separate density handoff, so absence
of the callback does not universally imply placement failure. Same-focus outcome is
recorded, not asserted to be a failure. For mount-held cases, one callback entry restores
the anchor before generation advances, with deferred mount work still queued. Release
followed by a NEW restore/centering request succeeds in every case; this is not
autonomous recovery or proof of the first dispatch's durability.

The first fixture attempt incorrectly kept StrictMode replay registrations after
cleanup; the gate now invalidates queued callbacks on unregistration. A second
assumption that same-focus must fail was contradicted by actual app handoff behavior
and removed with the changed-focus failure and final placement assertions retained.
Independent review requested explicit generation assertion and setup-poll cleanup;
both were corrected, focused controls passed, and follow-up review found no blockers.
Full local validation: 27 isolated app fixtures passed, unsandboxed performance
compiler pipeline exit 0 and clean editor diagnostics. No application source change
means ordinary product unit/E2E and additional harness/dashboard gates were not
triggered by this fixture-only investigation.

Interpretation limits are central: the imposed registration hold proves a possible
missed-dispatch mechanism, not that it occurred naturally in the deployed failure.
Generation completion is not a universal callback-readiness guarantee, so adding only
that wait is not justified as a fix. Local post-dispatch success does not clear deployed
API adapter/state, actual data, geometry or app behavior. The existing failed operator
witness lacks callback-entry and physical-scroll application evidence. Neither an app
nor a harness root cause is established, and neither was repaired speculatively.

Next recommended decision is app-first, not another perf campaign: authorize a bounded
manual read-only check using the shared Kupua app in the operator's deployed-TEST
setup. Verify actual datasource/topology before interaction; at most ten minutes,
one search, one arbitrary-position seek, one density roundtrip and up to three image
traversals. Stop at unexpected or repeated failure. Keep identities/metadata and URLs
in browser memory, report only bounded aggregates, and do not mutate Grid, reauthenticate,
alter configuration, start infrastructure or run campaigns. This real-system permission
was subsequently granted for the bounded check below, not further exploration.
An observed application defect takes priority but still
requires its own reproduction and scoped fix approval. No further synthetic controls
are automatically a prerequisite for that app check.

### Bounded Native Deployed-API App Check

The operator granted use of the shared Kupua tab for the proposed read-only app check,
not a performance campaign. Only that app tab was used. The operator explained the
reload that removed initial temporary state; no reload-related app defect was inferred.
Runtime was foreground-visible with `ApiDataSource`; the existing local environment
endpoint reported media-api, deployed-test topology and proxy delivery. These identify
adapter/configuration, not independently verified per-action remote routing.

Completed native actions: one CQL search, one scrubber drag to about 40%, one
Grid-to-Table-to-Grid roundtrip, detail entry, two forward image traversals and return.
The search published 270,398 results; the seek advanced generation and published a
300-image window at offset 110,407, with visible results. Initial unfiltered runtime
had about 1.33 million results, but the exercised seek was in the searched set, not a
new million-result traversal certification. No extra search/seek/density or detail
actions were used, and the check ended within its recorded remaining deadline.

A hit-tested native click focused one visible identity. In Table, that exact identity
remained focused, was present in both the position map and actual result array, was
rendered, and intersected the viewport below the header. Grid return likewise retained
focus, result membership and visibility. Each density restore generation advanced;
geometry checks, not generation alone, established visibility. Detail traversals changed
identity twice; return focused and displayed the last detail identity. No store error was
observed. At final idle state, 12 viewport-intersecting images were complete with positive
natural width, none failed. This is final readiness, not uninterrupted decoding/paint or
precise positional-ratio/centering evidence.

The temporary resource classifier matched no expected /api, /es or /bedrock routes;
the retained resource buffer contained 250 entries including 35 fetch/XHR entries in its
unclassified group. Consequently, its zeros are unavailable route evidence, not proof
that ES traffic was absent or that each action used a particular remote path. No extra
live probe was issued to repair the collector. Temporary observer and retained identity
references were removed. Reports retain only aggregates; no media identities, signed
URLs, credentials or raw live artifacts were copied into repository documents.

Independent read-only interpretation review supports only this bounded native-workflow
success. It does not clear deployed-API app reliability, transport or the harness. The
original sustained backward workload, Justified-to-Table transition and forced source
centering were not exercised. No app/harness fix, canonical campaign result, reauth,
infrastructure/configuration change or Grid data mutation occurred. The browser playbook
was not modified; these session findings belong here, not in reusable operating guidance.

Recommended next bounded decision: a targeted read-only native Justified-to-Table check
after backward browsing, with contract-aware observations of resident focus, actual
result membership, viewport anchor and applied placement. Native density behavior must
be assessed against the existing focus/viewport contract, not a forced-center assumption.
Any new live actions need operator confirmation. If an app defect is established,
prioritize its scoped reproduction/fix over making a performance test pass. Otherwise
retain app and harness hypotheses without prescribing another campaign or unproved wait.

### Sequence-Matched Seek-Tier Reproduction

The operator rejected generic smoke checks and unnecessary small interpretation reviews,
and asked for the actual failing scenario in the shared tab with explicit tier awareness.
Important correction: pressure workloads include Grid, Justified AND Table. With the
runner's one-based repetition index 1, rotation is Justified, Table, Grid. Thus failure
restoring before Grid follows the TABLE backward journey; it need not involve a density
mount at all. Earlier Justified-to-Table/mount hypotheses did not cover that boundary.
Do not reuse that incorrect two-layout assumption in future tests or interpretation.

One bounded browser reproduction used the actual deployed-TEST ApiDataSource/proxy,
explicit focus, pinned empty search through 15 February 2026, and 1720x960/DPR2 with
matching screen geometry. Actual result total was 1,209,427 and rendered regime was
seek throughout. Source was elected via the maintained Table scrubber/anchor setup at
about 40%. The maintained browser-side captureDensityJourney executed Justified then
Table backward load ladders (30/100/200 results/s, three seconds each), 1.5-second
reversal and four-second recovery, disabling browser cache only during each journey.
This was one diagnostic sequence, not a runner campaign/dry-run or canonical sample.
Request-probe bookkeeping and the campaign's fresh-context/prior-test history were not
reproduced; do not claim a complete controlled performance-equivalent campaign replay.

Both preceding journeys completed three phases, no recorded interruption, and no
data/media recovery censoring. Justified admitted five backward reads, evicted the
source, and source restoration before Table sought successfully. Table admitted four
backward reads and left 1,000 results with the source still resident at local index 900.
The subsequent restore-before-grid reproduced the placement timeout: source present
in BOTH imagePositions and actual results, focus matching, no seek needed or store
error, source absent from rendered Table rows. Final scrollTop stayed at 7328.5 with
scrollHeight 32036 and viewportHeight 876. A bounded pass-through observer recorded
no Table scrollTo call for this failed dispatch; it changed no scroll arguments.

Runtime inspection found two existing resource/module URLs for orchestration/search.ts:
the timestamped instance imported by the running hook and the bare instance dynamically
imported by the helper. Their module namespaces, scrollFocusedIntoView functions and
registerScrollToFocused functions are distinct. Comparing them did not change the
runtime store. The callback registry is module-local; importing an unregistered instance
can silently invoke an empty registry. This concretely exercises the existing browser
playbook's disconnected-import warning; no new playbook/session entry was warranted.

The positive control called centering through the app-loaded timestamped instance,
without changing focus or buffer state. It requested scrollTop 28416.5; the browser
applied 28416.5 (maximum at write 31201), and the maintained exact-identity stable
intersection guard passed. Focus identity remained unchanged and in results, with no
store error. The earlier bare dispatch produced no scroll write. This identifies a
concrete harness module-binding defect for the reproduced seek-tier failure, not an
app geometry failure in that control. It does not clear other app/API defects, indexed
tier behavior, prior PP3 failures or the separately supplied backend reset logs. The
operator is investigating those logs separately; raw personal/infrastructure fields
and CSV contents were not copied here.

Browser cache/viewport/DPR settings and temporary scroll observer were restored; helper
observers and retained source/anchor/control references were removed. No non-local data
writes, reauth, infrastructure edits, campaign history, or product/harness code changes
occurred. Shared tab remains on the pinned Table search after successful active binding
control. No additional operator campaign or repeat-until-failure loop was requested.

**Subsequently approved and completed repair unit:** add a local failing-first regression
with distinct versioned app and bare orchestration instances, then bind the two density
helper centering sites (restoreDensitySource and prepareDensityRecovery) to the mounted
app's registration rather than importing another module instance. Prefer a narrowly
scoped DEV bridge owned by callback registration; loading an unrelated module must not
overwrite the active bridge, and cleanup must respect ownership. Verify available
indexed/seek local cases without inferring cross-tier live coverage. Preserve deadline,
identity/seek semantics, workload order and transaction boundaries. Run affected local
and required source-change gates, then obtain meaningful independent CODE review.
This is a concrete dispatch repair, not permission for a broader harness refactor,
silent fallback, history migration, product scroll-policy change or another live campaign.

### Mounted-App Centering Repair Completed Boundary

[Scroll-to-focus registration](../../../src/lib/orchestration/search.ts) now publishes
the actual mounted callback as `__kupua_scrollFocusedIntoView__` in DEV only. Publication
happens at registration, not module evaluation: merely importing a second instance
does not overwrite the active bridge. Unregistration deletes it only if that instance's
previous callback still owns the bridge, protecting a newer instance from stale cleanup.
Existing module-local fullscreen centering remains unchanged; non-DEV and no-window
execution publish no bridge.

Both [density centering sites](../../../e2e-perf/density-browser.ts), source restoration and recovery
setup, call the registered bridge without dynamically importing orchestration. Absence
is an explicit setup failure, not an imported no-op, retry loop or accepted degradation.
No production scroll behavior, placement threshold, elected identity, seek decision,
tier coordinate rule, workload order, new scenario/selection flag, PP3 boundary or
transactional publication rule changed. The bridge does not certify hosted/M6 support.

Failing-first [ownership control](../../../e2e-perf/validation/harness-validation.test.mjs) loaded
two independent registries sharing one window; missing bridge publication failed
before repair. It now covers import isolation, replacement ownership, stale cleanup,
DEV/non-DEV/no-window behavior and both helper bodies' no-fallback dispatch. The real
[hook lifecycle check](../../../src/hooks/useScrollEffects.test.ts) verifies mounted
centering and bridge removal on unmount.

[Actual-renderer regressions](../../../e2e-perf/validation/density-app-fixtures.spec.ts) force the
mounted hook to use a versioned orchestration instance while loading an unrelated bare
instance. Indexed and seek cases failed with the old helper: target focused, resident
and unrendered. The initial indexed fixture's global-height displacement was corrected
to buffer-aware geometry before counting that failure. Both cases pass after the two
helper changes and exercise recovery setup as well. These are local mock-data tier
checks, not live indexed-tier validation. Existing timing probes were deliberately
updated to gate the entire callback registration/bridge publication and assert explicit
unavailability; they no longer assume a missing registration must reach the placement
timeout. Mount-held controls still prove the app callback can place before restore
generation advancement.

Final validation: 410 offline harness checks, 96 synthetic/browser dashboard fixtures,
29 actual-app fixtures, 505 local product E2E tests, and unsandboxed perf compiler with
explicit pipeline exit 0. Full unit verification passed 3,220 tests. Its first run had
one five-second API-startup timeout in main.test.tsx with 3,219 passing; that unchanged
file passed six tests in isolation, then the unchanged full suite passed. No assertion,
timeout, test environment override or unrelated startup code was altered. Product E2E
waited until the operator freed ports 3000/3030 rather than reusing the live API app.
Independent substantive code review found no issues; residual test limits are that the
unit lifecycle case is not itself StrictMode-wrapped and replacement ownership models
HMR via separate registries/versioned app fixtures, not a real hot-update campaign.

Normal onboarding/changelog were updated. No live post-fix reproduction, operator
campaign, backend change, history rewrite, staging or commit occurred. The separately
reported backend count reset and PP3/U5/U9 limitations remain outside this repair.
The operator's app was stopped for E2E and needs restarting in the intended deployed
API/proxy mode before further live work; do not silently reuse a local test server.

Next recommendation requires confirmation: four repetitions of density ONLY using the
existing --suite justified selection, with a new numbered private log and unique runner
report, frozen source/configuration and established auth/stopping rules. Short and
rendering are already saved. Long execution passed on both failed combined attempts,
but deferred publication withheld its canonical entry; publishing new long evidence is
a separate operator decision, not a reason to repeat it while debugging density. No
automatic resume, sample salvage or change to combined transaction semantics follows.

### Normal E2E Centering Follow-Up

On explicit operator request, the remaining bare-import centering caller in
[justified-windowed.spec.ts](../../../e2e/local/justified-windowed.spec.ts) now uses the
same mounted callback bridge. This is a test-only follow-up: no further app or perf
source change. The Grid/Justified stopped-prepend cases temporarily observe the bridge
and require exactly one invocation, restoring the original only if they still own the
temporary binding. All four selected cases failed first with zero bridge invocations
under the old import, then passed after replacement with retries disabled.

Only those normal E2E tests ran, in the justified-indexed and justified-seek projects;
no unit/perf/full-E2E rerun or live action was performed. Project names are not additional
tier evidence: these existing cases install a 70,000-result mock source. Actual local
indexed/seek module-identity coverage remains the prior explicitly asserted app fixtures.
App DEV bridge overhead remains constant-time registration/cleanup and explicit-call
lookup, with no added frame loop, scroll listener, render or network request. It is very
unlikely to be distinguishable on existing dashboards; no isolated overhead benchmark
was performed. Correcting formerly skipped centering can change campaign observations
because setup is now performed, not because the bridge has measurable frame-time cost.

### Post-Fix Density Checkpoint Assessment

Assessed after the operator's completed density-only run, canonical save
`2026-10-24T04:32:34.673Z`, label **deployment checkpoint - density**. All four child
runs report nine passed workload tests; canonical history has all 21 maintained IDs,
four scenario observations each (84 total, not 84 independent trials). No missing or
unexpected IDs, auth stop or child failure is recorded. The repaired placement setup
completed across all repetitions; this does not establish universal reliability or
resolve PP3/backend transport faults. No agent campaign, live app/infra or new tests
were used in this saved-results assessment.

Recorded setup is laptop dev app, deployed TEST media-api/proxy, headed Chromium 151,
1720x960, DPR 2, one worker, no CPU throttle, uncontrolled browser cache, pinned
15 February cutoff, dirty `293b29f3b` and app-source fingerprint `9acc06e77d334550`.
All records are **seek tier**; this is not live indexed-tier validation. Runner-report
creation to canonical save was 795.998 seconds (13m16s), excluding compiler preflight,
not a duration promise for another campaign. Source-total aggregate median/max is
1,209,392; the date cutoff does not freeze corpus edits/deletions or cache warmth.

**Evidence accounting:** all three JS sidecars exactly match their canonical JSON.
Saved density Markdown exactly equals buildDensityMarkdown(fullHistory), and private
numbered tee log 5 contains the exact generated single-entry aggregate. The unique
private runner report retains child output, not that parent summary; its absence there
is not a numeric mismatch. Both private files are mode 0600 and remain outside the
repository. Per-repetition raw metric JSONL is removed by existing cleanup, so no claim
of independent full-precision median replay from all raw samples is made. Nine paired
Grid/Justified comparison records are saved. No history rewrite or partial-run salvage.

**Ordinary forward load at 100 results/s:** medians of per-observation values below;
frame-p95 is computed within each observation, not campaign action latency or average FPS.

| Density | Achieved results/s | Slow-frame interval (ms) | Visible slots pending |
| --- | --- | --- | --- |
| Grid | 99.7 | 49.8 | 0.42% |
| Justified | 100.4 | 17.3 | 0.45% |
| Table | 96.3 | 62.4 | 29.95% |

Justified has substantially better frame cadence within this campaign; it is not an
overall winner. Equal requested results/s does not guarantee equal pixel motion,
visible workload or delivery cost. At forward 200 results/s, median pending slots
reach about 54% Grid, 60% Justified and 77% Table. At backward 200, achieved rates
fall to roughly 152/162/154 results/s with about 670/576/629ms blocked in the
three-second step. Useful data motion and visible picture readiness are distinct.

**Stopped recovery and transitions:** ordinary forward/backward endpoints decoded
within the four-second limit across the recorded samples. Under constrained delivery
(80ms latency, 4Mibit/s), Grid and Justified have 4/4 decoded stable landings, median
1,982.6ms and 2,737.5ms respectively. Table has **0/4** decoded landings within
4,000ms, all four media latencies unavailable, despite median data readiness 46.85ms.
That is a substantive media-recovery limitation, not zero latency or missing data
publication; the responsible layer remains unknown. No failed visible-image endpoint
is recorded. Captured media request-failure totals match cancellation totals and must
not be called backend errors. Table's small thumbnail area must not conceal pending slots.

Scrubber destination placement medians are about 1.32s Grid/1.29s Justified; decoded
viewport medians 1.71s/1.68s. Table-to-image placement, detail return and width-change
medians are about 87-194ms, with decoded endpoints about 96-203ms. D7 eviction has
median blank-area estimates 24.34% Grid/31.81% Justified. These are descriptive clocks,
not additive action decomposition or proof of controlled deployment effects.

**Interpretation limits retained:** D11 quiet/busy refresh endpoints publish and decode,
but each layout has two valid/two invalid comparisons. Pending-data-at-dispatch counters
show the intended isolation was not consistently achieved. Paired delta sampleCount=2,
unavailableCount=2 and aggregate medians are correctly withheld; do not subtract arm
medians or treat invalid comparison as a failed UI refresh. Request-clock/overflow and
interruption counters checked were zero; that is not complete infrastructure health.

Retained-geometry maxima remain concerning signals (including about 1,185px Justified
backward displacement and 256px Grid/31px Table resize), not established painted jumps.
The sampler compares both cell and image boxes, including unready images, compensates
commanded input and captures no pixels. Do not dismiss an app problem or prescribe a
stability fix from those aggregates alone. Four-repetition p95 is the observed maximum,
not a population-tail estimate. The older baseline used local API and a different source
snapshot; compatible contracts and displayed deltas do not isolate deployment effects.
Untracked contents are outside fingerprint coverage. U5/U9 and unresolved PP3 remain.

**Historical judgement, not just an attribution caveat:** comparison with the previous
compatible revision-4 local-API campaign is useful and should be presented explicitly.
Both campaigns have four repetitions in seek tier, but source and topology differ.

| Metric | Previous local API | Deployed API checkpoint | Descriptive change |
| --- | --- | --- | --- |
| Grid forward middle-step frame-p95 | 42.9ms | 49.8ms | About 16% worse |
| Justified, same step | 17.3ms | 17.3ms | Essentially unchanged |
| Table, same step | 58.3ms | 62.4ms | About 7% worse |
| Grid seek to decoded viewport | 1.44s | 1.71s | About 19% slower |
| Justified seek to decoded viewport | 1.52s | 1.68s | About 11% slower |
| Constrained decoded landings, Grid / Justified / Table | 1/4 / 3/4 / 0/4 | 4/4 / 4/4 / 0/4 | Better Grid/Justified; Table still censored |

The earlier compatible local campaign also measured about 45.9/17.1/58.4ms for
Grid/Justified/Table at the middle forward load. The large Grid/Table frame gap thus
predates the deployment transition. Against the existing 33.4ms frame reference,
Justified is good at that step while Grid/Table are not smooth; that reference is not
a universal user-acceptance SLO. Overall: no broad deployment collapse, some slowing
on top of substantial pre-existing limitations, and improved constrained recovery for
two layouts. Deployment is a plausible contributor, particularly to added seek latency;
source/setup/cache differences prevent isolating its contribution, not making history
irrelevant. These four-repeat descriptive changes are not significance estimates.

**Dashboard verification:** new campaign selected with prior baseline explicitly
qualified for topology/source differences. Ordinary middle-step frame values display
49.8/17.3/62.4ms with 4/4 denominators; the Grid backward pending chart displays 60.76%,
matching JSON. Table constrained recovery shows 0/4/unavailable with no false zero or
deadline-valued chart. D11 overview comparison remains unavailable. Density overview,
drilldown and metric controls worked; desktop 1440px/mobile 390px had no horizontal
overflow and mobile chart screenshot was readable. Rendering still ends at its saved
checkpoint; responsiveness at the earlier short checkpoint, with 14 correct two-point
foreground charts and no stale long cards. Shared local results page returned to the
new density overview at mobile width, visible. No live app tab was used.

One substantive independent interpretation review agreed with accepting the checkpoint
while retaining frame-gap attribution, D11 validity, media-recovery and geometry/paint
limits. The measured journey-sampler max cost (about 0.4-0.5ms) does not by itself
explain the frame gap; other instrumentation/asynchronous costs remain possible.

**Available app-first follow-up, pending confirmation; not a density execution gate:** review of existing
evidence behind the ordinary-rate Grid/Table frame gap, considering delivery, achieved
progress, observer costs and render work without presuming the cause. Consult existing
canonical/research evidence before any new local experiment; propose a discriminating
check only for a named unanswered question. No campaign rerun, universal score,
dashboard redesign, automatic app optimization or new prerequisite D11/stability repair.
A separately bounded Table stopped-media investigation is an alternative if image
availability is the operator's immediate priority. Code/live work requires its own
applicable approval. No changelog or AGENTS narrative is added for assessment-only work.

### Canonical Full Attempt: First Rendering Failure

**Historical assessment:** the following records the original failure before the
P13c returned-media and P14 censored-outcome repairs. Its warm-only guard and
proposed reproduction were superseded by the completed work in the current
checkpoint; they are not outstanding implementation instructions.

The operator selected canonical delivery as the intended direction and requested a
full four-repeat checkpoint before P2 simplification. The supplied command used the
existing --full/--canonical-media flags with deployed TEST API and a new private tee
log 6. This is a laptop development-app target, not the Kahuna-hosted build. Canonical
delivery changes returned renditions/format/cache paths as well as transport; it is
not merely bypassing a proxy. The operator reports traversal looked abysmal.

Runner report creation `2026-10-24T04:58:52.640Z`; first rendering repetition ended
after about 3.3 minutes with 21 passed and two failed tests. P13 failed at P13c's
warm-rendition identity guard; P14b failed the final rendered-landing requirement.
No later repetition, short, long or density family proceeded. Canonical JSON histories
were correctly not updated. Existing saved entries remain the proxy rendering, short
and density checkpoints. Runner report and tee log 6 are mode 0600 outside the repo.
No raw logs, identifiers, URLs or credentials are copied into this document.

The failed run's temporary rendering JSONL contains 33 records, including P13a/b but
not P13c. P14 emits diagnostics before its landing assertion, so the failed P14b row
is useful diagnostic evidence, NOT a valid baseline to aggregate or publish. Do not
salvage partial records into canonical history.

| Traversal | Previous proxy four-run median rendered count | Canonical failed attempt | Canonical final landing |
| --- | --- | --- | --- |
| P14a normal forward, 500ms cadence | 10/10 | 10/10 | Met load criterion |
| P14b fast forward, 200ms cadence | 12/15 | 3/15 | Did not render within 5s |
| P14c fast backward, 200ms cadence | 4/10 | 1/10 | 4,577ms |
| P14d rapid forward, 80ms cadence | 2/20 | 2/20 | 3,095ms |

This is a substantial observed traversal-readiness deterioration, not a claim of
statistical significance from a failed single observation. All recorded committed
steps matched expected sequence length and imageLookupCount was zero: metadata was
resident, not evidence of absent image traffic. Frame-p95 was about 9ms in those
observations, which does not explain multi-second image readiness by itself. P14b's
saved landingRenderMs=5000 is a timeout marker with landingRendered=false; its zero
network field is not measured zero latency. Other network/cache annotations derive
from Resource Timing/prefix matching and can be ambiguous for cross-origin canonical
media; do not infer actual cache hits or physical delivery causes from them alone.
The P14 criterion checks expected identity and a complete, nonzero-size image, not
exact compositor paint. Desktop side panels are gated off in the current app; the
broad P14 selector still merits verification in a targeted reproduction.

P13c requires a nonresident metadata lookup followed by the exact previously warmed
currentSrc. The failure proves that string differed, not whether image identity,
format, dimensions/quality/rotation or signing changed. Those two URL values were not
retained, so the cause is not recoverable from the error message alone. Signing-only
differences can change browser cache keys; stripping parameters would not establish
warm-media comparability. Do not relax this guard simply to finish canonical coverage.

Source inspection: detail and prefetch use the shared getFullImageUrl builder with
screen/native caps. Canonical mode prefers media-api's returned optimisedPng template
and quality 85, following the current Kahuna-parity policy, rather than the proxy path's
AVIF/WebP processing. That is a concrete delivery difference to inspect, not proof that
PNG payload size, signing, prefetch, decode or the app is responsible. No format/quality,
prefetch, assertion, deadline or acceptance change was made during this assessment.

Next bounded discriminator requires a shared canonical-app tab and applicable live
permission: reproduce P13c and one P14b sequence, retaining URLs/identities in browser
memory only. Compare signing versus rendition/geometry and observe safe request size,
type, completion/cancellation and decode/readiness stages. Stop at failure rather than
rerunning a suite. Use the exact maintained cadence/identity contract, consider app and
harness causes, and prioritize a demonstrated app/delivery defect. This is not permission
for an agent campaign, raw capture, new selection flags or a speculative quality fix.

### Early Confidence Checkpoint Recommendation

The operator's stale-cookie control established that auth detection stops PP1 before
the remaining 14 tests, but exposed duplicate interruption/cleanup errors and a root
exit130 stack that buried the command. The follow-up parent output filter recognizes
only the fixed auth marker, preserves preceding progress, and suppresses the subsequent
child cascade. It retains the nonzero rejection and ends with the concise auth message
and exact renewal command. Ordinary failures and PP3 final diagnostics keep their
existing behavior. Independent stream decoders preserve split UTF-8; small per-stream
marker-prefix buffers handle split markers without unbounded buffering.

Failing-first controls cover split markers, ordinary diagnostics, UTF-8 and final output.
The actual no-browser list+teardown reporter control passes its output through the
parent filter and requires the command last with no interruption stack. Independent
review's Unicode defect was reproduced by a failing control, repaired and re-reviewed.
This is locally verified output behavior, not a new live-auth or performance result.

Installed Playwright's `PLAYWRIGHT_NO_COPY_PROMPT` guard disables automatic page
snapshot capture but does not prevent every `error-context.md`: errors/code frames can
still generate that file. No live artifact was inspected or deleted; do not infer page
snapshot contents from its filename, and keep generated diagnostic artifacts private.

The runner now stops for missing auth state and observes existing required app/API
responses for HTTP 401/419 or confirmed built-in `/login` redirects. The shared fixture
emits a fixed safe marker; the existing reporter gracefully interrupts the Playwright
child and prints the exact one-line codegen command with the literal
`[enter path to your cookie file]` placeholder. No cookie data or response URL is printed
by the guard. No live auth probe, automatic browser launch, `--reauth` option or
partial-campaign resume was added. Nonzero exit gates still prevent further repetitions
and history commit; PP3 stalls/fallbacks and other errors keep their existing meanings.

The command is restored prominently in [the README](../../../e2e-perf/README.md#authentication-state)
and setup guide, with tests preventing accidental removal. The operator rejected newly
introduced shell-wide umask instructions; those were removed, while explicit runtime
private-file modes and unrelated existing startup-script settings remain unchanged.
Local validation covers narrow classification, chunked markers, guard cleanup, missing
state, and an actual dummy Playwright run that stops before its next test. Browser
controls use an ephemeral loopback server; the initial mocked-redirect DNS failure was
a fixture defect, corrected without weakening assertions. These checks do not certify
live authentication/provider behavior. No real cookie file, campaign or live app was accessed.

The first operator attempt stopped at compiler preflight with TS5097: shared
`proxy-target.ts` imports `hosted-config.ts` explicitly, but the independent
[perf tsconfig](../../../e2e-perf/tsconfig.json) lacked the app config's `noEmit` and
`allowImportingTsExtensions`. The exact failure was reproduced unsandboxed, both
options were added without changing source imports, and the same compiler command
then passed unsandboxed with explicit exit 0. Previous sandboxed typecheck output
missed this defect and must not be counted as reliable compiler validation. No
campaign ran in this repair; the operator can rerun the unchanged command.
