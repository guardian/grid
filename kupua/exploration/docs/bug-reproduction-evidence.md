# Bug Reproduction Coverage and Evidence

20 September 2026. Complete routing of the 35 current entries in [the canonical backlog](bug-backlog.md).
The outcome index reflects the recorded browser sessions and explicitly dated client regression results below, not a new source audit or browser rerun.
Executed observations and complete accounting retain their individual limits. They change no migration
classification, repair priority or permission.
All browser-beneficial entries are included, not just an initial eight-case shortlist.

## How To Use This Queue

- **Browser-first:** mounted UI, history, geometry or real caller ownership is important evidence.
- **Local-first:** a small helper/contract check is cheaper; browser follow-through can establish
  whether the wrong result reaches the real UI or affects its lifecycle. Do not manufacture a UI
  failure to justify using the browser.
- **Conditional:** useful browser work needs another app/path, a controlled fixture or permission.
- **No browser value:** the failing owner is a backend/operational implementation, not a browser path.
- The outcome index distinguishes executed observations, reused evidence and unexecuted routes.
  Record each attempted outcome as natural UI, controlled live-data, synthetic, not reproduced,
  blocked, or refuted by affirmative evidence. A failed attempt does not refute a bug.

Recorded setups were **Kupua UI -> direct Elasticsearch -> TEST**, then **Kahuna UI -> media-api
GET -> TEST**, then **Kupua UI -> local media-api D3 -> TEST**, exercised sequentially. Kupua's
origin was `https://kupua.media.local.dev-gutools.co.uk/`; its D3 mode retained direct-ES auxiliary
reads and was not API-only. Reconfirm setup and permission for any new session. Neither `TEST`
nor `--use-TEST` identifies the frontend. Distinguish synthetic data reads from media traffic:
the KUP-025 isolation correction below shows why mocking data does not isolate the whole page.

Read the [current browser playbook](embedded-browser-playbook.md), applicable instructions and
the owning backlog entry before an attempt. Use the existing shared interaction helpers and
the smallest relevant source/assertion read. Do not read the migration reports wholesale.

## Current Outcome Index

Each ID appears once. "Reproduced" means the stated oracle at the linked layer, not all variants,
natural incidence, a production failure or a completed repair. Reopen the browser only for a named
remaining ambiguity or post-fix acceptance; the general campaign is complete.

### Kupua

| Bug | Current outcome | Remaining limit / next discriminator |
| --- | --- | --- |
| [KUP-001](bug-backlog.md#kup-001) | DONE: bounded client ownership fix tested, cold-reviewed, operator-accepted and committed (`ff932f302`). [Evidence](#kup-001). | Future API logical omission/failure semantics and metadata freshness remain outside this fix; historical reproduction retained. |
| [KUP-002](bug-backlog.md#kup-002) | DONE: bounded client ownership fix tested, cold-reviewed, operator-accepted and committed (`ff932f302`). [Evidence](#kup-002). | API integration, KUP-003 and natural pending-walk UI timing remain separate; historical reproduction retained. |
| [KUP-003](bug-backlog.md#kup-003) | DONE: real-collector interior witnesses and bounded unknown-order retry. [Evidence](#kup-003). | Mounted synthetic transport, not natural UI incidence or S3b API acceptance; truthful progress and one swap retained. |
| [KUP-004](bug-backlog.md#kup-004) | DONE: identity-bound standalone detail. [Current validation](#bounded-client-repairs-kup-004005007008); [historical accounting](#kup-004-and-kup-024-reused). | Mounted synthetic transitions; no new native-fullscreen or future GET/overlay acceptance claim. |
| [KUP-005](bug-backlog.md#kup-005) | DONE: explicit empty AI membership and stale forced-refresh invalidation. [Current validation](#bounded-client-repairs-kup-004005007008); [historical reproduction](#kup-005). | Local composed transport tests, not naturally empty model output or S8/S9 API acceptance. |
| [KUP-006](bug-backlog.md#kup-006) | DONE: browse baseline plus latest accepted cumulative contribution. [Evidence](#kup-006). | Local deferred lifecycle/accounting checks, not immutable metadata, live arrivals or S7 API acceptance. |
| [KUP-007](bug-backlog.md#kup-007) | DONE: expanded request owns publication/finalization. [Current validation](#bounded-client-repairs-kup-004005007008); [historical reproduction](#kup-007). | Deferred store producers, not new expanded-UI/live/API acceptance. Ordinary facets retain their presentation. |
| [KUP-008](bug-backlog.md#kup-008) | DONE: pending completion honors current same-query sort. [Current validation](#bounded-client-repairs-kup-004005007008); [historical reproduction](#kup-008). | Actual local router/rendered order with synthetic AI; no model/ranking/API or measured performance claim. |
| [KUP-009](bug-backlog.md#kup-009) | DONE: explicit incomplete execution discards the whole map; deep no-map consumer checked. [Evidence](#kup-009). | Local synthetic transport and upload-time fallback; no live incidence, all-sort/performance parity or S4 API acceptance. |
| [KUP-010](bug-backlog.md#kup-010) | Blocked: private refusal-test scope absent. [Blocker](#permission-blocked-routes). | Hybrid later became available; availability does not authorize sensitive probing. |
| [KUP-011](bug-backlog.md#kup-011) | Reproduced: synthetic non-sensitive direct builder. [Evidence](#kup-011). | Live D3 comparison lacked a replaced witness; visibility variants were not tested. |
| [KUP-012](bug-backlog.md#kup-012) | DONE: incremental empty-member accounting and cached panel publication. [Current validation](#bounded-client-repairs-kup-022023026012020021); [historical evidence](#kup-012). | Local oracle/store/panel checks; no cache ownership, bulk transport or API snapshot change. |
| [KUP-013](bug-backlog.md#kup-013) | DONE: initiating focus permission and pending-End ownership. [Current validation](#bounded-focus-repairs-kup-013017018027); [historical evidence](#kup-013). | Reverse pending-Home then resident-End was subsequently [reproduced and remains unfixed](#restarted-app-browser-follow-up); no blanket keyboard-ownership closure. |
| [KUP-014](bug-backlog.md#kup-014) | DONE: separate CQL, AI and header action ownership. [Current validation](#bounded-ux-repairs-kup-014015016019); [historical evidence](#kup-014). | Live cancellation and ordinary controls; AI completion synthetic. No model/API or measured performance claim. |
| [KUP-015](bug-backlog.md#kup-015) | DONE: Home continuation, focus and suppression ownership. [Current validation](#bounded-ux-repairs-kup-014015016019); [historical evidence](#kup-015). | Both callers covered locally; live cancelled-read and ordinary Home passed. Existing await-before-density sequence retained. |
| [KUP-016](bug-backlog.md#kup-016) | DONE: reporter-owned indexed timer. [Current validation](#bounded-ux-repairs-kup-014015016019); [historical evidence](#kup-016). | Mounted shared-hook and live cross-context controls; no changed coordinate regime or latency claim. |
| [KUP-017](bug-backlog.md#kup-017) | DONE: saved-density search/input ownership with fresh geometry. [Current validation](#bounded-focus-repairs-kup-013017018027); [historical attempt](#kup-017). | No-saved-state fallback is not newly certified; no delay/coordinate change or measured parity claim. |
| [KUP-018](bug-backlog.md#kup-018) | DONE: original-return ownership and current geometry. [Current validation](#bounded-focus-repairs-kup-013017018027); [historical blocker](#kup-018). | Native original-entry placement remains; broader availability/API composition is separate. |
| [KUP-019](bug-backlog.md#kup-019) | DONE: origin/search/history-owned pending traversal. [Current validation](#bounded-ux-repairs-kup-014015016019); [historical evidence](#kup-019). | Native fullscreen checked locally with isolated media; live detail checked. No broader return-centering or performance claim. |
| [KUP-020](bug-backlog.md#kup-020) | DONE: completion belongs to its issuing map and exact loader. [Current validation](#bounded-client-repairs-kup-022023026012020021); [historical evidence](#kup-020). | Fake load/error/decode/cancellation cases; no bandwidth/jank or rendition-renewal claim. |
| [KUP-021](bug-backlog.md#kup-021) | DONE: terminal thumbnail fallback and image-owned failure/events. [Current validation](#bounded-client-repairs-kup-022023026012020021); [historical evidence](#kup-021). | Real browser URL resolution, fully local media failures; no preview redesign or S10 delivery acceptance. |
| [KUP-022](bug-backlog.md#kup-022) | DONE: direct has aliases and facet targets resolve the same leaf. [Current validation](#bounded-client-repairs-kup-022023026012020021); [historical evidence](#kup-022). | Synthetic contracts plus colourProfile direct-TEST/UI after-check; no deployed server parity or boolean-truthiness change. |
| [KUP-023](bug-backlog.md#kup-023) | DONE: literal-safe AST self-exclusion for registered/deep fields. [Current validation](#bounded-client-repairs-kup-022023026012020021); [historical evidence](#kup-023). | Visible composition/menu/URL checks used synthetic suggestion buckets; no claim those values exist in TEST. |
| [KUP-024](bug-backlog.md#kup-024) | DONE at `3975f07f6`: bounded retained-total/inserted-ordinal repair. [Current evidence](#restore-repair-kup-024-and-kup-025); [historical reproduction](#kup-004-and-kup-024-reused) retained. | New API composition remains unverified; no infinite-loop or universal snapshot claim. |
| [KUP-025](bug-backlog.md#kup-025) | DONE at `3975f07f6`: selected-tuple rank/page repair with operator-accepted conditional cost. [Current evidence](#restore-repair-kup-024-and-kup-025); [historical synthetic case](#kup-025) retained. | Four-sample direct-TEST timings, isolated media and corpus drift limit inference; no media-api performance or metadata-mutation claim. |
| [KUP-026](bug-backlog.md#kup-026) | DONE: registered callbacks read current store caches across remounts. [Current validation](#bounded-client-repairs-kup-022023026012020021); [historical evidence](#kup-026). | Real Clear/Home registration lifetime; datasource hot-swap/API-only initialization remains unresolved. |
| [KUP-027](bug-backlog.md#kup-027) | DONE: obsolete centering cannot cross preview sessions. [Current validation](#bounded-focus-repairs-kup-013017018027); [historical blocker](#kup-027). | Same-exit latest-focus settlement remains valid. Pre-native-entry promise gap, physical Esc/macOS animation and wider S10 remain uncertified. |

### Grid

| Bug | Current outcome | Remaining limit / next discriminator |
| --- | --- | --- |
| [GRID-001](bug-backlog.md#grid-001) | Reproduced: [Kahuna GET/TEST](#grid-001-kahuna-get) and [Kupua local D3/TEST](#grid-001-and-grid-008-kupua-d3). | Known witness survives platform/status exclusion. Cause needs query/controller fixtures; not every usage key or production revision tested. |
| [GRID-002](bug-backlog.md#grid-002) | Blocked: private principal/security scope. [Blocker](#permission-blocked-routes). | Isolated authorization fixtures, no general live probe. |
| [GRID-003](bug-backlog.md#grid-003) | Blocked: invalid-status scope. [Blocker](#permission-blocked-routes). | GET/D3 apps became available; malformed-input probing was not authorized. |
| [GRID-004](bug-backlog.md#grid-004) | Backend alternative, unexecuted. [Route](#non-browser-alternatives). | Mixed SQS entries in the existing queue test; no browser value. |
| [GRID-005](bug-backlog.md#grid-005) | Backend alternative, unexecuted. [Route](#non-browser-alternatives). | Local Sharp narrow-image fixture, no upload or browser needed. |
| [GRID-006](bug-backlog.md#grid-006) | Blocked: local nginx/upstream setup. [Blocker](#permission-blocked-routes). | Prove the actual config path with a capturing local upstream; Kupua imgproxy is not a substitute. |
| [GRID-007](bug-backlog.md#grid-007) | Backend alternative, unexecuted. [Route](#non-browser-alternatives). | Mock read pagination with operation phase disabled; no live cleanup. |
| [GRID-008](bug-backlog.md#grid-008) | Reproduced: [Kahuna GET/TEST](#grid-008-kahuna-get) and [Kupua local D3/TEST](#grid-001-and-grid-008-kupua-d3). | Positive section/publication-code witnesses fail; orderedBy and broader vocabulary remain separate. |

## Bounded Focus Repairs: KUP-013/017/018/027

**22 September 2026: DONE at the four current-client scopes below; committed with operator approval.**
KUP-013 had an earlier reproduction; KUP-017/018/027 were characterized before their
production corrections. Each newly demonstrated failure had an ordinary control.
Original reports, all 35 stable IDs and historical attempts below remain intact.
This does not close API migration, deployment or all composite position-preservation claims.

**Authorized commits:** KUP-013 `4bb055c663ca9f8d0fd06bffc88ef26b4ca43c86`,
KUP-017 `4124967e393cd8c27c0fd22d6af32828e2fb74c9`,
KUP-018 `2c060f9deeea44594497a3ba59076d575ecabf3d`,
KUP-027 `6718aebd0294defbeacd044472455878542d8a5d`.
Exactly 20 distinct source/test/guide/changelog/playbook files were committed; the
playbook belongs to KUP-017. Shared-file partitions were index-only and final committed
bytes match the tested working tree. Mixed AGENTS/backlog/evidence/worklog and unrelated
research/configuration remain unstaged. No push, service change or additional validation
run occurred during commit preparation; the reverse Home->End follow-up remains unfixed.

| ID | Demonstrated failure and bounded repair | Preserved controls and limits |
| --- | --- | --- |
| KUP-013 | Fresh trusted-key shared-app comparison: 820 resident results retained hidden focus; 13252 indexed results replaced it at the tail. Initiating focus permission is now separate from tail scrolling and bound to the existing seek signal. Newer seek/Home and uncommitted failure/abort cannot donate stale intent. | 25 mounted producer/real-store/consumer cases plus grid/table browser placement. Resident/indexed/seek coordinates, explicit/retained-hidden/phantom/no focus, pending mode/focus changes, selection/anchor, native input/fullscreen and one-shot consumption remain. Resident Home reuses the loaded head without another read. Reverse pending-Home then resident-End was subsequently reproduced by the restarted-app follow-up below and remains unfixed. |
| KUP-017 | Local actual leaf-frame query replacement moved the same table from 0 to 2564; a newer wheel position of 320 was overridden to 165029. Saved restoration now checks search generation, record ownership and pending-only scroll-input intent. | 16 queued geometry/lifetime controls and 7 real query/order/wheel/no-op-arrow/focused-arrow cases, plus existing density workflows. Fresh columns/header/viewport/origin, extrema, Strict Mode peek, map-independent coordinates and cooldown survive. Review caught and corrected cancellation by no-op grid Left/Right. No-saved mount fallback remains outside this certification. |
| KUP-018 | Actual local traversal/close/reopen moved the same retained table from 0 to 644. Deferred return now belongs to the original image, search, history entry and post-close focus; valid work resolves current index/row/callbacks at execution. | 23 hook cases and actual reopen/query/resize plus ordinary close controls. Original-entry native placement, immutable entry identity, phantom pulse, Home suppression, callback replacement and missing-target behavior remain. No redirect to a newer focus or universal return guarantee. |
| KUP-027 | Real native Chromium separated exit-promise delivery from the later frame: an old frame moved a newer preview's retained list from 0 to 100. A local preview-owner identity now makes old centering inert after reentry/disposal. | 8 native cases with isolated media; 9 helper/mounted cases distinguish mocked disposal and the 150 ms quiet period / 1000 ms cap from real API evidence. Same-exit latest-focus centering remains valid; the tested late-promise/new-active-preview path already preserved active state/history. The pre-native-entry promise gap, physical Esc and macOS animation remain unverified, not refuted. |

**Verification and review.** Final post-review full units passed 1819/1819 across 72 files;
TypeScript/Vite build passed; full local E2E passed 299/299 including forced-seek in 6.6 minutes.
Runner-owned local ES held 10000 fixtures; no user service was started/stopped by the agent.
The live End pre-check verified the direct adapter and non-local guard, not the remote stage anew.
All other new browser witnesses were local. No synthetic media reached live infrastructure.
Native-event exit used the real exit API directly, not a claim of physical Esc coverage.

The one fresh read-only exact-baseline review found the no-op-arrow cancellation regression.
Both no-focus browser cases failed before correction; the valid focused-arrow control remains.
Its setup click timed out once, so setup now uses the existing focus action on the measured
anchor while the actual key path and placement assertions remain. All 7 cases and all full
gates passed without retries after correction. No second independent review was performed.
The reviewer found no other material delta issue or weakened existing assertion and supported
the other bounded dispositions. Its source-supported reverse Home/End concern was subsequently
reproduced in the browser follow-up below and remains unfixed.

Invalid setup runs were not credited: chat/browser input interference, a document-target unit
key event, missing jsdom fullscreen property, and an outer-rAF gate that only scheduled the leaf.
The full unit gate also caught a new eager keyboard-listener import; the unchanged input-target
predicate now lives in existing pure DOM utilities with its original export preserved. Build
caught one old string-valued pending-intent fixture; its shape changed, not its assertion.
Existing build/router/React warning output is not claimed fixed. No visual baselines or thresholds changed.

Two editor diagnostics remain in unchanged existing E2E code: the
[image-array fixture](../../e2e/local/scrubber.spec.ts#L160) and the
[served-module import](../../e2e/local/ui-features.spec.ts#L919). Both sections match
the starting copies. The application build and executed browser gates passed;
they do not certify a separate E2E-project TypeScript check.

**Performance.** No new campaign or before/after timing diagnostic ran. Expected added work is
small and bounded: request/entry comparisons, one extra map lookup for a valid deferred return,
a preview-owner Symbol and short-lived density input listeners. No new data request, serial
navigation dependency, delay/cooldown, per-frame scan or serialization was introduced. Correctness
can avoid obsolete placement but does not establish a speedup or parity. Existing P4a/b,
PP6/PP6b/PP6c, P13b, P15c and JB5 are the relevant preserved measurement surfaces; existing
PP6c slowdown and P8 watchpoint are neither explained nor resolved by this batch.

**Coordinator requests integrated 23 September at their bounded scopes.** These are additive to
[Batch A's existing handoff](#bounded-client-repairs-kup-022023026012020021), not replacements:

- **E081:** qualify only stored-focus-only windowed End and its missing coverage with the
  initiating-permission/request-owner repair and real producer/consumer evidence. Retain the
  deliberate hidden-focus policy. Record the later controlled live-data reproduction of the
  reverse pending-Home/resident-End boundary separately: it remains unfixed, not closed by Batch B.
- **E068:** qualify saved density restoration and detail-return row/owner clauses separately.
  Preserve true unmount cancellation and fresh-geometry behavior; retain no-saved fallback and
  wider D032 joins. Do not promote this composite claim wholesale to closed/verified.
- **E069:** append the queued scheduler, no-map coordinate and actual same-container placement
  evidence. Keep historical synchronous-rAF provenance, default API blocking and other test limits.
- **E071:** add only the original-return and cross-preview-centering repairs beside the existing
  KUP-019 clause. Remove any actionable implication that same-exit latest-focus lookup is itself
  wrong; retain pre-native-entry timing, native-platform and wider S10/gesture limits.
- **E067 / coverage 06:** update cross-references to these scoped outcomes without reopening the
  KUP-016 implementation or closing all D032 interleavings. Refresh affected source/test/guide
  fingerprints while retaining original receipts; no whole-file verified or dependency promotion.
  Changed code/test homes are the three navigation/scroll/return hooks and their tests,
  FullscreenPreview, fullscreen-exit tests, search-store and its fixture, pure DOM/keyboard helpers,
  and local keyboard/scrubber/UI specs. Current guides, AGENTS, changelog and this evidence are
  updated; the worklog remains session-only. No candidate/register/upstream record was edited.

The four operator-approved fix-based commits are complete, with shared hook/E2E/guide/
changelog hunks partitioned and the pure input-predicate move grouped with KUP-017. The actual
hashes and committed scope are recorded above; no wider Git or implementation authority follows.

### Restarted-App Browser Follow-Up

**22 September 2026, separately authorized validation only.** A fresh agent-owned tab verified
the served markers for all four repairs, ElasticsearchDataSource and the non-local write guard.
The remote stage was not independently reidentified. Reads used the pinned Dublin query with
13252 results; image identities and response payloads remained in-page. No production edits,
response substitution, server-data writes, service changes, automated suites or performance
campaign followed from this check.

- **Repaired hidden-focus End passed:** trusted End reached the visible tail while retaining
  the original focus, selected ID and selection anchor. Clearing selection retained that focus
  and scroll position; the pending intent was consumed.
- **Ordinary controls passed:** Home from the explicitly focused tail reached the visible head
  with first-image focus; subsequent End reached the visible tail with last-image focus.
- **Reverse Home then resident End reproduced, still unfixed:** start at the explicitly
  focused tail; hold delivery of one successful real Home `searchAfter` result. Both Home and End
  were trusted key events with tail focus and unchanged query. After End, the tail remained
  current, but pending edge was still `first`, the Home signal was not aborted, and no second
  `searchAfter` call occurred. Releasing the unmodified result advanced the seek generation,
  set buffer offset and scrollTop to 0, and focused the first visible image instead of the tail.
  This is a controlled async interleaving, not a natural-incidence or latency measurement.
- **Ordinary deep density/detail checks passed:** at global position 6793, grid/table/grid
  retained focus and visibility, with table ratio drift about 0.0051 and grid return drift 0 px.
  Closing the original detail entry retained native placement with 0 px drift. Two resident
  traversal steps followed by close returned position 6795 visibly at 0 px usable-centre offset.
  These controls do not re-prove every deferred race, media delivery or arbitrary-position case.
- **Cleanup verified:** original datasource method and own-property shape restored; key
  observers, probe globals and DOM markers removed; selection empty, no detail/native fullscreen
  and no loading work remained. The agent tab was closed and closure confirmed. No shared tab
  was changed, and no preference was intentionally changed. Native fullscreen was not repeated
  in the integrated browser; the existing local native evidence and its limits remain unchanged.

## Bounded Client Repairs: KUP-022/023/026/012/020/021

**22 September 2026: DONE within six separate current-client boundaries.** Repairs were applied
sequentially in the listed order, against preserved working-tree copies. No shared framework,
backend/default/usage-negation change or focus/geometry batch followed. Historical
per-ID reproductions below remain unchanged; no new migration prerequisite or API-only acceptance
is implied. Six fix-based commits were subsequently authorized; mixed current-status records remain unstaged.

**Authorized commits:** KUP-022 `14f4fddb14d51a7b7784b7a52e3ea6543d6ea477`,
KUP-023 `489bf05a3b1943cdcf214f1a26f34af03b590ae7`,
KUP-026 `384855da3c811e38b42a65f49d6373349c1ffeb0`,
KUP-012 `2d2a1d3693ddb5b87f1373b33713cb3f8343a2d4`,
KUP-020 `74a49305f9996a4bd3c5eca68931f31270d32529`,
KUP-021 `31ff3ea460478d418f56aa1c3632534edeb9e0ec`.
The six commits contain exactly 22 distinct source/test/architecture/changelog/playbook files;
the playbook is included with KUP-021. Every final committed patch matches its verified index,
the final files match the tested tree, and all 79 pre-commit dirty/untracked fingerprints were
preserved. Worklog, AGENTS, backlog/evidence and unrelated project work were excluded. No push.

| ID | Regression evidence | Limits and preserved behavior |
| --- | --- | --- |
| KUP-022 | [CQL predicates](../../src/dal/adapters/elasticsearch/cql.test.ts), [actual count callers](../../src/dal/es-adapter.test.ts) and [facet targets](../../src/dal/adapters/elasticsearch/cql-query-edit.test.ts): ten intended predicate/caller failures plus one facet failure before their corrections; 167 focused neighbors passed. | Config precedence, signs, static/direct/unknown paths and named scalar/multi-field/nested controls. No private config copied; existence still includes indexed false values. |
| KUP-023 | [Actual resolver scopes](../../src/lib/typeahead-fields.test.ts) reproduced 22 intended failures; the first run also contained two mistaken apostrophe expectations, corrected after checking the installed lexer. Final 206 typeahead/query-edit/serializer/caller neighbors passed. | Double quotes are the existing grammar. Literal whitespace, quoted deep keys, repeated/negative/empty chips and unrelated incomplete text are retained. Warm literal-only cache, abort signal, quiet absence and editor state are preserved. |
| KUP-026 | [Real browser registration](../../e2e/local/cql-search-quoting.spec.ts): warm count 101 remained after Clear when current count was 102. Repeated Clear/Home, ticker/category/filter counts and visible dropdown now pass; own-chip/dynamic live-AST and obsolete pending controls passed before and after. All 76 CQL/history neighbors passed. | No customElements reset. A jsdom attempt was discarded because its missing native selection API blocked the fixture. Current-store callbacks do not implement datasource rebinding; no LazyTypeahead or cancellation redesign was needed. |
| KUP-012 | [Full recompute oracle](../../src/lib/reconcile.test.ts) and [cached add/toggle](../../src/stores/selection-store.test.ts): ten intended failures before correction, final 138 checks passed. [Real panel](../../e2e/local/selections.spec.ts) shows Multiple credits with exact 1/3 tooltip, three IDs and no later hydration; nine panel neighbors passed. | Zero/all-empty/all-same/mixed, add order, falsy values, arrays, removal/recompute and unchanged pending/dirty/chip/summary controls. Constant-time transition, not a full-selection scan. |
| KUP-020 | [Fake-loader matrix](../../src/lib/image-prefetch.test.ts): eight intended stale-completion failures, 25 controls before repair. Twelve new cases cover load/error/decode resolve/reject across new sessions and same-session reissue, cancellation, ordinary completion and late decoded-cache reuse. | Final prefetch/cache/traversal/detail neighbors passed. Tracking ownership and cache usefulness remain separate; no cadence/radius/priority/cancellation/cache-policy change or measured bandwidth/jank claim. |
| KUP-021 | [Mounted detail](../../src/components/ImageDetail.test.tsx): three intended relative-fallback, first-layout and obsolete-callback failures before repair. [Chromium media cases](../../e2e/local/ui-features.spec.ts) bounded the old loop at three main-image errors; after repair exactly two lead to unavailable media, followed by successful next-image traversal and Back. Full/thumbnail successes and obsolete-response controls pass; 88 unit neighbors and ten browser neighbors passed. | Every failed media response is locally intercepted before fixtures render. Exact failure request sequence includes a retained-grid thumbnail, detail full image, then one detail thumbnail; it is not three detail attempts. Stable containers and existing decoded-cache policy remain. |

**Shared gates and review:** final type-correct units **1761/1761 across 70 files**, TypeScript/Vite
build, and full local E2E **278/278 including forced-seek** passed. Build exposed readonly alias
fixture assignment and an intentionally unknown-valued test accessor; only fixture typing/setup
was corrected, then focused checks, build and full units repeated. One fresh read-only reviewer
compared all 18 source/test files against the starting copies, found no material product/test issue
or weakened assertion, and identified two stale guide descriptions, now corrected. The reviewer
ran no tests/live operations and wrote no files. No product change followed the full gates/review.

**Bounded browser before/after:** on operator-confirmed direct-ES/TEST, the already-configured
colourProfile alias returned zero versus 731,815 for its raw leaf before repair, using the same
date cap. After the local-test handoff and operator restart, served-source checks passed and both
counts returned 731,815 with equal predicates (two explicit count calls each time). A real editor
`+has:colourProfile` after-check normalized to `has:colourProfile`, displayed 789,242 unpinned
matches and rendered results. These totals are observations, not permanent fixtures or server parity.

Static resolver before-checks lost field-like text inside quoted literals in both orderings; the
same synthetic after-checks retained it. Visible UI follow-through entered the quoted phrase plus
an empty credit chip, inspected its menu and self-excluded aggregation scope, selected a value with
spaces, and confirmed editor/URL preservation. After Clear/remount, a quoted XMP key became one
chip and its selected spaced value remained quoted in the URL. Eight suggestion calls were
intercepted locally; synthetic values were not claimed to exist in TEST. The library emitted a
selection warning after the XMP option click, while the verified query/editor/URL round-trip and
subsequent editing completed. No broader library caret claim follows. The override and probe were
removed; the shared tab remains open on the real colourProfile query. No synthetic media reached TEST.

**Performance limits:** no additional network request is introduced by a repair. Has resolution
adds a small config scan. Static self-exclusion now parses the short query via the established AST
helper, while literal-only warm-cache queries avoid the former false-positive request. Live cache
getters remove wrapper subscriptions/rerenders. Scalar accounting stays incremental; prefetch adds
one map identity check per completion. Detail adds a per-image token and event guard, removes the
effect-driven failure-reset render and terminates repeated failed-thumbnail attempts. These are
structural consequences, not measured latency/frame/bandwidth improvements; no campaign was run.

### Coordinator Integration Requests

Coordinator integration validated on 23 September; the original bounded requests and limits below are retained:

- **E092 / KUP-022 and KUP-023:** qualify only configured direct-client has resolution and literal-safe
  self-exclusion. Retain unrelated matchViaExistence, nested/fuzzy/date/unknown-field and submitted
  usage-search qualifications; no deployed server or effective-mapping parity follows.
- **E086 / KUP-026:** current cache/ticker/filter callback staleness is repaired with real remount
  evidence. First-registration datasource capture and S8/S10 API-only initialization stay unresolved.
- **E080 / KUP-012:** replace the current scalar-accounting defect clause with the tested bounded
  correction; preserve historical inference provenance and unrelated API reconciliation obligations.
- **E074 and its E024 qualification / KUP-020:** completion no longer deletes by ID from a current
  successor map. Retain ID-based cache validity, untracked thumbnail and rendition-renewal limits.
- **E073 / KUP-021:** qualify only ImageDetail's relative-thumbnail termination and media lifetime.
  Preserve KUP-004 evidence, FullscreenPreview error-policy and S10 delivery/renewal qualifications.
- **06 changed paths:** revalidate only the 18 changed source/test paths linked above, including
  `src/components/CqlSearchInput.tsx`, `src/lib/typeahead-fields.ts`, `src/lib/reconcile.ts`,
  `src/lib/image-prefetch.ts`, `src/components/ImageDetail.tsx`,
  `src/dal/adapters/elasticsearch/cql.ts` and `src/dal/adapters/elasticsearch/cql-query-edit.ts`;
  mark changed current docs honestly stale. Preserve historical receipts, IDs and dependency statuses;
  do not promote whole-file/corpus readiness from this bounded review.

## Bounded UX Repairs: KUP-014/015/016/019

**22 September 2026: DONE within the four current-client lifetimes.** These are independent UX
repairs, not new migration prerequisites. Historical reproductions below and all other IDs remain
unchanged. No upstream/backend, safeguard, infrastructure or coordinator-register edits were made.

| ID | Regression evidence | Preserved behavior |
| --- | --- | --- |
| KUP-014 | [Mounted browser producers](../../e2e/local/browser-history.spec.ts): seven intended failures/five controls before repair, plus a separately failing header departure/return case. All 23 new cases pass; seven existing typing/KUP-008 controls also pass. | CQL 300ms, AI 600ms, header 250ms; first-keystroke fresh key, shared typing entry, replacements, subsequent edits, Clear, ordinary completion, late-successor safety and header double-click. |
| KUP-015 | [Home tests](../../src/lib/reset-to-home.test.ts): nine intended failures/four controls before repair; final 15 include actual-helper initial-focus controls. Eleven new [caller cases](../../e2e/local/browser-history.spec.ts) and three existing Home/history controls pass. | Both logos, one search, defaults/selection clearing, current failure navigation, mobile focus policy and awaited table-to-grid data readiness. Suppression releases cannot consume another owner's token. |
| KUP-016 | [Mounted hook tests](../../src/hooks/useDataWindow.test.ts): seven intended failures/14 controls before repair; final 14 mounted cases plus ten existing velocity cases pass, with six anchor neighbors. | Same-query restart, reset/tier exit, reporter-only cleanup, successor callbacks, valid buffer/pagination updates, global/local coordinates and map independence. Scope serialization occurs only when params identity changes. |
| KUP-019 | [Traversal tests](../../src/hooks/useImageTraversal.test.ts): four intended failures/eight controls, then one separately failing same-image history case; final 15 pass. Four new [actual consumer cases](../../e2e/local/ui-features.spec.ts) and three existing traversal controls pass. | Origin-based current-coordinate lookup, prepend movement, forward/backward completion, inactive/unmount boundaries, resident fast path, repeated-arrow policy, proactive extension/prefetch and useful shared store work. |

**Shared gates and review:** final full units **1,677/1,677 across 70 files**, TypeScript/Vite build,
and full local E2E **270/270 including forced-seek** passed. Visual baselines and thresholds are
unchanged. One fresh independent read-only review of the exact starting-copy delta found no material
product/test findings. Its initial Home-focus coverage suggestion was added and validated; the new
changelog indentation was corrected. Only unit fixtures/documentation changed after the full E2E
run; the final runtime bundle is unchanged. Operator-authorized commits are KUP-014 `abfd06c45`,
KUP-015 `9b7e5b8a9`, KUP-016 `e7bd0c426` and KUP-019 `00d92b54e`. Each contains its related
architecture/changelog; KUP-019 also includes the operator-approved campaign artifacts and playbook.
The 29 distinct committed files match the preserved working tree. Mixed project records remain
local and unstaged, including this evidence; no push occurred.

**Live after-checks:** operator restarted the app and authorized bounded direct-ES browser reads.
Served source was revalidated. CQL Back retained the mounted editor and destination; AI cancellation
made zero calls and its ordinary empty-result control used a synthetic, abort-respecting producer;
header same-mounted query supersession and ordinary ascending sort passed. Held Home delivery was
aborted by the newer query; URL/store/editor retained that query, and ordinary Home returned to
offset zero. The indexed Dublin-to-820-result transition cancelled one timer with zero seeks and
kept scrollTop/offset zero; the ordinary Dublin control sought once and rendered deep results.
Held detail extension did not advance the newer mounted image, did not abort shared work, and a
second ordinary pending traversal completed in URL/rendered identity. Identities stayed in-page;
no synthetic image IDs entered live media. All wrappers, timers, globals and temporary DOM markers
were removed, cleanup was checked, and the agent-owned tab was closed.

**Limits:** a supplementary close-return probe after several direct route replacements timed out
waiting for the traversed image to be visible; the page had no explicit focus and retained the prior
list anchor. It is not a passing return-centering check or an isolated batch regression. One normal
UI enter/resident-traverse/close plus grid/table/grid control then retained the image at global
position 5,303. KUP-018 and other deferred return/exit work remain unchanged. Native-fullscreen
interleaving evidence is local Chromium with isolated fixture media, not a new live-fullscreen run.
Initial fixture/reporting mistakes were corrected before crediting their results. That functional
validation phase involved no real-system write or performance campaign; the later operator-run
campaign below is separate. Functional success is not measured performance parity.

**Recorded performance follow-up, 22 September:** the operator subsequently ran "After bugfixes from
migration report", four direct-ES repetitions. Canonical [jank records](../../e2e-perf/results/audit-log.json)
entries 47/48 and [perceived records](../../e2e-perf/results/perceived-log.json) entries 62-65
(zero-based) preserve the 18 September comparison and later short/long campaigns. PP6c settlement
is 255 -> 339 ms (+33%), p95 263 -> 381 ms: a recorded slowdown candidate. P8 blocking is
1,675 -> 1,950 ms (+16%), max frame 147 -> 163 ms, with p95 frame unchanged at 59 ms: a watchpoint.
Recorded browser/origin/viewport/DPR/cache/worker/cutoff setup matches, but dirty source fingerprints
and corpus counts differ; this does not isolate the four UX repairs, establish parity or accept all
slowdowns. The worklog also records some generated comparison rows lacking per-row cacheClass;
retain those comparability limits rather than changing the metrics, thresholds or harness.
Campaign artifacts were committed with KUP-019. This reconciliation ran no campaign; any further
measurement needs separate permission and a precise unanswered question, not another core baseline.

**Original coordinator requests, integrated 22 September at their bounded clauses:** qualify E062 and the input-timer portion of E087
for KUP-014; E063 for Home; E067 for the indexed timer; and only E071's pending-traversal portion
for KUP-019. Retain E071's return/preview-exit qualifications and E068/KUP-017/018/027. Revalidate
E021/E060/E064/E065/E066/E069/E070 consumer/assertion references without promoting API or performance
acceptance. Mark changed fingerprints stale and attach bounded evidence for the six touched
components, four hooks, search store, Home/orchestration helpers and six test files listed by the
working-tree delta. Preserve historical receipts and unrelated dependency statuses; candidate/index
status integration belongs to their coordinator.

## Evidence Recording and Execution Boundaries

- Account for all 35 rows. The three no-browser entries have a justified alternative, not a missing
  browser attempt. Conditional/local-first rows are not excluded merely because setup is harder.
- The general campaign is complete. Future work needs a named unresolved question or post-fix
  acceptance scope, not another pass for a new agent's confidence. Keep per-case attempts bounded.
- Permission is session-specific. Earlier authorization covered the recorded ordinary GET/D3
  follow-up, not future sensitive probes, fixtures or metadata mutation. This record grants no new
  scope. Do not induce real infrastructure errors; isolate media before rendering synthetic IDs.
- Use the original implementation and actual caller. Do not assign the final broken state,
  replace the function being tested or violate the producer's abort contract to manufacture proof.
  A valid synthetic boundary tests a conditional mechanism, not natural incidence in TEST.
- Every executed entry names frontend, request path, backend stage (or no backend), exact
  natural/controlled/synthetic method, prerequisite, observable result, control and cleanup.
- Keep live identities, metadata, tuples and credentials inside the page. Save only redacted
  replay steps, synthetic fixtures/snippets actually run, and aggregate/boolean outcomes. No raw
  logs, screenshots or live payloads in the repository. These checks are not perf measurements.
- Append compact per-ID evidence sections here as checks are performed. Keep unsuccessful attempts
  to one short row. Amend the backlog's existing evidence field with a short outcome/link, not a
  session narrative. Preserve IDs and independent/prerequisite classifications; no fixes implied.
- Record genuinely new candidates once in the canonical backlog only after duplicate/oracle checks;
  otherwise retain the uncertainty in the attempt result. Amend the playbook only for reusable
  technique corrections. No new research packets, schema, validator or general audit is needed.

## Bounded Client Repairs: KUP-003/006/009

**DONE for the bounded current-client repairs (20 September); committed as recorded below.** The operator
confirmed sequential local repairs and stopped the app. Existing S1, KUP-001/002/004/005/007/008
and KUP-024/025 implementation, assertions and records are the preserved session baseline,
not disposable changes relative to HEAD. No Grid/backend, KUP-010/011, live-system or
performance work was performed. All 35 IDs and the historical observations below remain.

| ID | Failing-first discriminator and final focused validation | Contract and limits |
| --- | --- | --- |
| KUP-003 | Real ES collector plus mounted hook and mocked page transport: two intended add/remove failures, 85 controls passed. A reversed guess examined one overshooting hit, omitted the reverse call and lost an interior selection update. Final range/collector/selection neighbors: 181 passed, including 13 new composed cases. | Unknown order plus empty IDs permits one swapped attempt, independent of truthful `walked`. Correct-direction success adds no reads; empty controls remain bounded. Tied/null full tuples, inclusive target, polarity, anchor, cap/lookahead, cancellation and successor busy ownership remain. No new tuple comparator or result shape. |
| KUP-006 | Five intended accounting/order/unavailable-baseline failures, seven controls passed. Final 12 fake-timer/deferred cases and complete search-store homes: 335 passed. | Each poll lifetime captures the awaited browse baseline and adds only its newest accepted cumulative contribution. Repeated/increased/decreased/zero and changed categories/subcounts, overlap, failure, refresh/new search/history, delayed baseline, hidden scheduling and AI no-poll are covered. No added request or freeze/membership change. |
| KUP-009 | Corrected fixture run: 27 intended failures, three controls passed. Final 30 new collector/store cases and full adapter/map/range neighbors: 158 passed. | Explicit timeout or failed shards stop both phases, discard all prior keys and close the refreshed PIT. First/later/terminal and empty/short/full pages, complete/omitted-metadata controls and abort/error cleanup are covered. Actual store deep fallback at 15,000/30,000 keeps global indexed coordinates and usable results. No map retry, per-page total or PIT-to-live continuation. |

**Polling baseline/omission interpretation:** both ordinary search branches await ticker counts
before starting the poll, so late baseline publication cannot race an already-running ordinary
poll. Search/refresh stops the previous lifetime before replacement. A failed baseline stays
`null`, not zero or arrivals-only counts; `newCount` can still publish. `TickerCountResult`
defines omitted subcounts as no sub-aggregation or no returned buckets. Every successful poll
rebuilds from baseline plus that response's supplied categories/buckets, so omissions cannot
retain earlier poll contributions. Missing categories remain baseline-only; no stronger backend
zero/completeness inference is made. The parser and response shape were not expanded. This is
bounded accounting, not immutable metadata or an exact historical snapshot.

**Shared gates and review:** full units **1,635/1,635 across 70 files**, TypeScript/Vite build
passed, full local Playwright **232/232 including forced-seek** completed in **5.3m**. Commands
used the prescribed repository-root npm/pipefail/tee pattern, unsandboxed on Node 22.12.0.
The E2E runner started local Docker ES with 10,000 documents and its own normal/forced-seek
Vite servers after ports 3000/3030 were confirmed free. No manually driven/live browser
session or new E2E spec was needed. Startup/teardown fetch warnings and existing Vite
configuration/chunk-size warnings did not fail gates.

Initial scheduler/import fixture errors were corrected before the stated failing-first results.
Build caught a test-only mock argument type; it was corrected through the DAL interface with
the same assertion, and focused polling/build reran successfully. One fresh independent
read-only review compared all eight changed source/test files to the exact saved starting
copies, found no material issue or weakened assertion, and confirmed preserved ownership,
request budgets, baseline lifecycle and map cleanup/fallback. Its sole non-blocking note was
a stale DAL retry comment; that comment is corrected. Final full units reran at 1,635 after
the type/comment corrections. No review-driven runtime change required another build/E2E run.

**Limits:** failing transport is synthetic, not a cluster incident. The no-map consumer fixture
covers upload-time deep navigation, not every fallback sort or exact landing. Discarding a map
can activate the existing more expensive fallback; no latency/frame parity is established and
no fallback redesign follows. S3b, S7 and S4 migrated acceptance remains open.

**Original coordinator integration requests, integrated 22 September with residual gates retained:**

- **E078 / KUP-003:** qualify the unknown-direction overshoot/retry mismatch with the composed
  interior witnesses and single empty-result reversal. Preserve historical P21 receipts,
  KUP-002 completion, failure presentation, cap/completeness and keyword-collation limits.
- **E088 / KUP-006:** replace the current repeated-addition description only with poll-lifetime
  baseline plus latest accepted cumulative response. Retain the P22 historical statement,
  freeze/metadata limits, unchanged producer contract and separate S7 activation obligation.
- **E033 / KUP-009:** qualify the current-client HTTP-200 timeout/failed-shard exception as
  repaired for explicit evidence in either phase. Preserve report04's original counterexample,
  original P13/P17/P24 receipts and Grid/new-operation execution-policy decisions. Do not
  promote abort/error handling into universal completeness or snapshot consistency.
- **Coverage06:** retain old receipts and refresh only changed fingerprints/scoped execution
  evidence. Exact source/test paths: `kupua/src/hooks/useRangeSelection.ts`,
  `kupua/src/hooks/useRangeSelection.test.ts`, `kupua/src/dal/types.ts`,
  `kupua/src/dal/es-adapter.ts`, `kupua/src/dal/es-adapter.test.ts`,
  `kupua/src/stores/search-store.ts`, `kupua/src/stores/search-store.test.ts`, and
  `kupua/src/stores/search-store-position-map.test.ts`. Durable docs: AGENTS, this evidence,
  backlog, changelog, deviations, selection/scroll/ticker guides and candidate11. No whole-file
  verified promotion, global dependency closure or alteration of prior completion receipts.
- **Operator-authorized commits (20 September):** KUP-003
  `4ae4f337bc4b63392fe97fcd2fd441969a4b8bbb`, KUP-006
  `d99ef3edcaae19c69f54385b960dfe0b6058603a`, KUP-009
  `0efb6e225ea62a5bc33c7fdf9cd92726ccda7196`. Exactly the 13 listed source/test/guide/changelog/
  deviation files were committed. Shared type/changelog changes were partitioned in the index;
  each committed patch matches its verified staged patch, and final snapshots match the saved
  pre-commit hashes. The three new changelog entries were corrected to two-space indentation;
  four DAL comment lines were aligned, with no runtime/assertion change or older-entry rewrite.
  Backlog, evidence, AGENTS, candidate, registers and active shared worklog remain outside these
  commits. Temporary message files were removed; index empty, no push.

## Bounded Client Repairs: KUP-004/005/007/008

**DONE, 20 September 2026.** Four sequential current-client repairs; no Grid/backend change,
live-system work or performance campaign. Historical cases below remain unchanged. S1,
KUP-001/002 and KUP-024/025 are preserved. The operator subsequently authorized four fix-based
commits: KUP-004 `e613e3f34`, KUP-005 `8980056c6`, KUP-007 `2d5a58147`, KUP-008 `e3722e5b8`.
Their combined source/tests, owning AI guide and changelog match the tested final files exactly.
Mixed/untracked research records and the shared worklog remain unstaged; no push occurred.

| ID | Executed regression and result | Preserved contract / limit |
| --- | --- | --- |
| KUP-004 | [ImageDetail.test.tsx](../../src/components/ImageDetail.test.tsx): four intended failures before repair; eight final mounted cases cover transition commit, null/undefined/rejected absence, successful B, rapid/obsolete completion, resident precedence, stable DOM and Back. Neighboring cache/prefetch tests pass. | Ancillary hooks/metadata are mocked and media uses data URIs. Stable containers are checked, not native fullscreen in the new interleaving. Existing local restore/traversal/history assertions pass unchanged; KUP-021 is not repaired. |
| KUP-005 | [es-adapter.test.ts](../../src/dal/es-adapter.test.ts), `KUP-005 result-scoped AI transport`: six initial intended failures and a passing nonempty control; twelve final composed cases cover ticker/static/dynamic/expanded paths, empty/nonempty/non-AI transitions, stale counts and forced refresh during pending AI. | Known-empty membership avoids transport and clears data. Sorted membership keys, ordinary empty IDs and exploratory self-excluding suggestions retain their meanings. Real model output and migrated API composition are not tested. |
| KUP-007 | [search-store.test.ts](../../src/stores/search-store.test.ts), `KUP-007 expanded aggregation ownership`: eleven intended failures and one ordinary control before repair; all twelve final deferred cases pass. Collapse/search/base reset, same/cross-field successors, missing field, late success/rejection/AbortError and cache reuse are checked. | Producers deliberately ignore abort to test ownership. Only one expanded request remains active; ordinary facet presentation is retained. This does not establish new API failure policy or visible expanded-facet natural incidence. |
| KUP-008 | [browser-history.spec.ts](../../e2e/local/browser-history.spec.ts), `KUP-008 pending AI sort ownership`: pending-sort and pending-history cases failed for the captured old order before repair; all four final browser cases pass. Four added store cases cover pending focus/relevance and abort-ignoring supersession. | Real router/sort-only/history callers, rendered order, URL/store agreement, positions, completion and request budgets are checked. Synthetic AI/data and locally intercepted media; no second AI call on sort, no ranking/secondary-sort change. |

**Review and shared gates:** one fresh independent read-only review inspected the exact seven-file
code/test delta against the captured starting baseline. It found one material KUP-005 gap: a forced
base aggregation started during pending AI could overwrite the subsequent empty completion.
An exact-empty composed regression reproduced that gap; cancelling the existing aggregation
generation before empty publication resolved it. The first version of that regression used a
permissive empty-object subset assertion; it was corrected to exact equality before claiming failure
or repair. The reviewer found no other material issue; no second independent review was run.

After that correction: **1,580/1,580 units across 70 files**, **TypeScript/Vite build passed**, and
**232/232 local E2E passed**, including forced-seek and all four new browser cases. Prescribed
foreground npm runners were used from repo root, Node 22.12.0, with runner-owned local ES/Vite.
Build caught new fixture typings that editor diagnostics missed; these were fixed before the final
gates. Existing assertions were not weakened. A new selection control was corrected to use hover
and durable anchor/positioning state, since scroll effects consume transient phantom intent.
Existing Vite configuration/chunk warnings and optional Bedrock-unavailable startup notice remain.
These are local functional gates, not API-only, deployed-model or performance-parity certification.

**Original coordinator integration requests, integrated 22 September at their actual scope:**
- E073: qualify only the KUP-004 standalone-identity clause with the mounted transition evidence;
  retain KUP-021 media fallback, preview fallback and future S6a/S10 delivery/overlay qualifications.
- E084 and E091's P28 empty-ID qualification: record explicit known-empty caller handling and the
  composed no-request/stale-refresh regressions. The ordinary ES empty-ID builder and nonempty live
  filtered-intersection semantics are unchanged; S8/S9 future endpoint composition remains open.
- E085: qualify current expanded-request publication/finalization with the twelve deferred cases;
  retain ordinary-facet presentation and future API policy qualifications.
- E087: qualify only pending AI completion/current sort. Pending input entry ownership is a distinct
  unresolved claim; do not close it or KUP-014 through this repair.
- E090: add executed coverage only for empty-AI, expanded ownership and pending-sort cases. Poll,
  remount, overlayless-transition and wider migration gaps retain their prior status.
- Coverage 06: update stale fingerprints for the changed ImageDetail, AI decorator, search store,
  store/ES tests and browser-history spec; add the new colocated ImageDetail test. Also fingerprint
  the amended backlog/evidence, AGENTS, AI guide, candidate and changelog. Preserve historical
  receipts; neither changed hashes nor whole-suite passes grant whole-file verified coverage.

## Recorded Browser Evidence

The following sections are the executed record, with their original controls and limits. Reuse the dated
[KUP-004](bug-backlog.md#kup-004) and [KUP-024](bug-backlog.md#kup-024) observations: both used
Kupua/direct Elasticsearch/TEST with real responses and controlled caller invocation. The
[GRID-001](bug-backlog.md#grid-001) query observation is a Kupua comparison control only.
Any later evidence belongs under its stable bug ID without overwriting these provenance limits.

## 20 September Complete-Scope Session

All 35 rows accounted for; this is not universal reproduction or closure. Frontend verified as Kupua; running adapter is
`ElasticsearchDataSource`, observed traffic uses `/es/`, and served `IS_LOCAL_ES`
is false. TEST is operator-confirmed, not inferred from that guard or result count.
No media-api search was observed. Only sanitized aggregates and synthetic strings
are recorded. Browser-local fixtures below are authorized by the current operator
prompt; earlier queue permission notes are not additional authorization.

### KUP-005

**Synthetic producer / controlled live-data count reproduction.** Kupua actual
search action -> synthetic empty AI result -> real direct-ES count, TEST. Preconditions:
settled `city:Dublin`, `nonFree=true`, pinned `until=2026-03-04T00:00:00Z`.
Temporarily return `{hits:[], total:0, sortValues:[], took:0}` from `searchByAi`,
honoring an already-aborted signal; observe `countWithTickers` without changing it.
Use `setParams({...baseline, aiQuery:"synthetic membership probe"})`, then `search()`.
Expected count zero; actual loaded/total zero, decorated `ids === ""`, real count
13,257 and nonzero ticker buttons. One resident-image AI-result control counted one
and passed that image's ID restriction. No claim of naturally empty model output.
Both overrides were removed in `finally`; params restored through actions.
The first attempt wrongly passed params to `search(focusId)` and is discarded.
The zero-results text selector did not match; evidence establishes actual count
publication and nonzero ticker rendering, not a specific zero-state label.

### KUP-006

**Current client result:** DONE; baseline-plus-latest accounting and local response ownership
pass the [shared validation and review](#bounded-client-repairs-kup-003006009). The historical
observation below remains pre-fix evidence, not the current accounting rule.

**Synthetic browser publication reproduction.** Kupua real visibility-triggered
poll -> synthetic `countWithTickers` response; no backend for the three poll reads.
Baseline came from direct-ES/TEST `city:Dublin` without a date cap. Choose an existing
agency ticker in-page; return `{count:2,tickerCounts:{[key]:{value:2}}}` twice and
dispatch `visibilitychange` sequentially, awaiting React frames. Same `since`
boundary was used both times. Expected baseline + 2 on both; actual 105 -> 107 -> 109,
with `newCount === 2` and rendered counts present. Zero-delta control retained 109
and set `newCount` to zero. Three calls only; original method restored in `finally`.
No real arrival rate, performance or natural incidence claim.

### KUP-007

**Controlled live-data cache-publication reproduction.** Kupua store expanded-facet
owner -> direct-ES -> TEST, pinned Dublin precondition. Gate delivery of one real
`getAggregations` response for `metadata.credit`, retaining its signal and throwing
AbortError if aborted. Start `fetchExpandedAgg(field)`, wait for the response to
arrive at the gate, call `collapseExpandedAgg(field)`, release and await completion.
Loading was true before collapse; signal remained un-aborted; expanded cache was
repopulated after collapse. Expected absent collapsed cache. Ordinary completion
control populated cache and cleared loading. Two calls; wrapper removed and field
collapsed in `finally`. Mounted expanded-facet presentation was not inspected;
this is not a demonstrated visible failure or a reset/abort-race reproduction.

### KUP-022

**Controlled live-data DAL reproduction.** Kupua actual `parseCql` and direct-ES
`count` -> TEST; effective `cutout` alias confirmed in page. Compare `has:cutout`
with `has:` plus that configured leaf using nonFree and the pinned date cap.
Expected equivalent predicates/counts. Alias predicate did not resolve the leaf;
raw-path control did. Raw-path count 1,094,891 versus alias count zero proves a
populated-leaf witness exists. Exactly two sequential count reads; no wrappers,
no saved leaf or image identities, no mounted result-grid claim.

### KUP-023

**Synthetic actual-resolver reproduction; no backend.** In Kupua's served module,
invoke the `credit` resolver returned by `buildTypeaheadFields` with a capturing
synthetic aggregation boundary returning one valid bucket. Inputs actually executed:
`"literal credit:inside text" credit:outside` and
`credit:outside "literal credit:inside text"`. Both produced `"literal text"`,
losing literal content as well as removing the chip. Control `ordinary credit:outside`
produced `ordinary`. Oracle: retain the quoted phrase and remove only the real chip.
This exercises the original static resolver, not a reimplementation; it does not
prove a mounted suggestion-menu consequence. All objects were local, no cleanup hooks.

### KUP-008

**Synthetic browser reproduction.** Kupua actual router/store, gated `searchByAi`
and synthetic ticker reads; no backend during the branch. Two resident image records
were copied only in-page, with synthetic upload dates 1/2 January 2026 and descending
AI scores 2/1. Navigate to `aiQuery=synthetic sort probe&orderBy=-relevance`, hold
the producer, then router-navigate to `-uploadTime`. Observe current store Uploaded,
release with AbortSignal respected. One AI call, not aborted. Actual URL and rendered
sort button said Uploaded, but store params reverted to Relevance and buffer used
the old relevance order. Expected current Uploaded order. Settled Relevance ->
Uploaded control produced the correct order with no new AI call. The first-image
DOM selector did not match; visible sort-label versus state mismatch is established,
not an independently verified rendered image-order mismatch. Overrides removed in
`finally`; later full navigation discarded fixture state.

### KUP-009

**Current client result:** DONE; explicit incompleteness now returns absent map, and the actual
store's deep fallback is locally exercised with unchanged indexed coordinates. See
[shared validation and limits](#bounded-client-repairs-kup-003006009). Historical browser
follow-through below remains incomplete; the later fixture is separate evidence.

**Synthetic browser publication reproduction, consumer follow-through incomplete.**
Kupua real `fetchPositionIndex` collector and `_fetchPositionMap` store publisher;
no backend. Temporarily supply synthetic open/close PIT reads, one first-page image
with session total 1,200, and synthetic raw key pages to the original collector.
Phase one: one valid ID/full uploadTime-ID tuple, `timed_out:true`, shards total 2,
successful 1, failed 1. Phase two: empty. Both pages are shorter than requested.
Expected no completed map; actual map length one published with loading false and
session total 1,200. Complete-execution control (`timed_out:false`, failed 0,
successful 2) also published. Four raw pages across both runs, capped at four;
synthetic PIT-close calls observed. All method overrides removed in `finally`,
then full navigation discarded synthetic session state. This adds actual browser
publication evidence to the prior helper result. Deep map-seek consumption needs
an offset beyond the shallow threshold and is not established by this tiny fixture.

### KUP-011

**Synthetic direct-builder reproduction; no backend in decisive check.** Kupua
actual `count`/`countWithTickers` query builder with capturing `esRequest` boundary
returning `{hits:{total:{value:0},hits:[]}}`. Plain `usages@status:replaced` omitted
the automatic exclusion; quoted `usages@status:"replaced"` retained both positive
intent and default exclusion. Literal `"literal usages@status:replaced text"`
also suppressed the default. Expected parsed-intent equivalence, not substring
semantics. Three calls; method override removed in `finally`. Initial `_count`
fetch interceptor missed this adapter's `_search` count path and made one real
non-sensitive replaced-usage count before failing to capture; that attempt supplies
no result. No deleted/visibility-sensitive input, D3 path or mounted result claim.

### KUP-001

**Synthetic mounted-selection reproduction.** Kupua actual selection hydration,
synthetic successful `getByIds` omission; no hydration backend. Start with two
resident selected records, gate `hydrate()`, clear, then return only the first.
Expected empty current selection; actual old membership returned (one ID), anchor
remained null, and one rendered Deselect checkbox reappeared. Complete-success and
failed-read controls left zero membership and zero selected checkboxes. Five reads
across setup/hydration, including ordinary metadata ensures. Records stayed in page;
getByIds restored and selection cleared in `finally`. No server deletion or mutation.

**20 September client regression result:** [selection-store tests](../../src/stores/selection-store.test.ts)
now defer the real hydrate action across clear, replacement selection, anchor-only change and
overlapping omission repair. They retain current membership/anchor/cursor/toast ownership while
checking late cache reuse, one revision per changed batch, failed/aborted reads and coalesced current
reconciliation. Three initial regressions failed on unchanged production code by restoring or replacing
membership; they passed after the captured Set/anchor guard. Complete-success, current omission,
anchor fallback and toast dedup controls remain. This does not define API item-error/chunk completeness
or last-started metadata freshness. Shared validation and acceptance state are below.

### KUP-002

**Synthetic mounted range-owner reproduction.** Kupua live ImageGrid `handleRange`
callback obtained through its mounted React owner; no backend. Synthetic cached
anchor outside current positions plus a resident target forces the server-range
branch. Gate a valid two-ID `getIdRange` result, call selection `clear()`, release
only if the original signal remains active. Busy state was entered; clear did not
abort the signal; two IDs and two visible Deselect checkboxes returned. Expected
clear to remain authoritative. Same completion without clear selected anchor plus
two returned images (three), the ordinary control. Both getByIds/getIdRange
overrides restored and selection cleared in `finally`. This covers clear/success,
not successor rejection, search changes or a natural shift-click reproduction.

**20 September client regression result:** [range tests](../../src/hooks/useRangeSelection.test.ts)
mount the actual hook with real stores and a deferred datasource, rather than reimplementing it.
Both add/remove pending walks are cancelled by clear, real add/remove/toggle, anchor change, query,
order, filter and unmount. Superseding success/rejection, completed timing, synchronous buffer/missing-
anchor takeover, current failure/AbortError and reverse-retry cancellation are covered separately.
Controls retain no-op membership, metadata-only completion, detail/density/pagination/buffer changes,
polarity, inclusive target, duplicate IDs, caps and subscription cleanup. The 17 initial ownership
failures on unchanged hook code proved stale membership, busy/timing or feedback publication.
The existing unknown-direction overshoot behavior is characterized, not repaired (KUP-003).

#### Client Ownership Validation (20 September)

- **Implemented/tested:** 137 focused cases (85 store, 52 helper/mounted-hook); full Kupua units
  1,451/1,451; TypeScript/Vite build passed; local Playwright 228/228 including desktop/mobile
  selection survival, late panels, API-shaped retained cursors and forced-seek. All ran through
  prescribed foreground npm/pipefail/tee commands, unsandboxed on Node 22.12.0. E2E used runner-owned
  local Docker ES with 10,000 fixtures and ports 3000/3030, not TEST or live media-api acceptance.
- A jsdom DOMException fixture was corrected to the existing Error-named-AbortError contract before
  the recorded 17-failure range run; build caught and corrected a string-valued `nonFree` fixture.
  Final focused tests reran after that type correction. No existing assertion was weakened.
  Vite configuration/chunk warnings and local E2E startup/teardown fetch warnings were not test failures.
- **Cold-reviewed:** a fresh read-only subagent compared the four complete source/test files to the
  exact initial baseline after the gates. No material issue or required code/test blocker; recommendation
  is two independent fixes, not one shared mechanism. Reverse-retry rejection after a successor starts
  is an optional unexecuted branch-specific regression; its owner guard was source-reviewed.
- **Operator-accepted:** 20 September, after the operator reported a brief app check and explicitly
  accepted both fixes. No detailed browser scenario/setup was supplied, so this is operator acceptance,
  not a new systematic race replay. **Committed:** `ff932f3020d3cf08de1a70d5da0851aa9ae3ac36`,
  one commit as requested. **Status: DONE for KUP-001/002's bounded current-client ownership fixes.**
  No agent live race replay or performance campaign ran. Request counts/parallelism, mutable LRU and synchronous cached paths are structurally preserved,
  not measured parity. Existing P18 measures ordinary cold-except-anchor selection/reconciliation,
  not out-of-buffer cancellation. An operator-authorized comparison may use
  `set -o pipefail; npm --prefix kupua run test:perf -- P18 --runs 3 --label "KUP-001-002 selection ownership" 2>&1 | tee "$TMPDIR/kupua-test-output.txt"`
  from repo root with the handbook's approved direct-mode setup. The operator accepted this batch
  without a new campaign; that does not establish parity or waive separately required future evidence.

**Original coordinator integration requests, subsequently authorized and integrated 22 September:**

- **E077:** qualify only the obsolete captured-membership/no-post-await-owner statement with the
  current Set/anchor guard and this executed evidence. Preserve historical P21 source receipts,
  ensureMetadata's separate contract, no hydration AbortSignal, incomplete/item-error/aborted logical
  read limits and principal-sensitive overlay/S6b decisions. Do not supersede E077 wholesale.
- **E078:** qualify only range-context invalidation and stale busy/finalization with request-local
  ownership and these mounted tests. Retain KUP-003 overshoot/retry, current-owner failure toasts,
  cap versus completeness, null/endpoint and keyword-collation limits. No S3b/API-only closure.
- **E055:** source-revalidate the changed hydration lines; direct ES construction, thrown-failure
  preservation and current-owner successful omission remain unchanged contracts. No new API routing.
- **Coverage 06:** refresh changed fingerprints while retaining historical receipts; append only
  scoped execution/cold-review evidence, not whole-file verified promotion or dependency closure.
  Exact source/test paths: `kupua/src/stores/selection-store.ts`,
  `kupua/src/stores/selection-store.test.ts`, `kupua/src/hooks/useRangeSelection.ts`,
  `kupua/src/hooks/useRangeSelection.test.ts`. Changed durable docs: `kupua/AGENTS.md`,
  `kupua/exploration/docs/00 Architecture and philosophy/05-selections.md`,
  `kupua/exploration/docs/bug-backlog.md`, `kupua/exploration/docs/bug-reproduction-evidence.md`,
  `kupua/exploration/docs/changelog.md`, and under
  `kupua/exploration/docs/03 Ce n'est pas une pipe dream/media-api-work/`,
  `api-boundary-11-candidate-plan.md` and `media-api-00-index.md`.
  `kupua/exploration/docs/worklog-current.md` has session-only additions; never stage its active log.
  Candidate/index current-status qualifications are amended locally; coordinator register integration
  and any receipt reconciliation remain pending. S1 and the historical reports are untouched.
- **Commit scope:** the operator explicitly limited the single commit to the four source/test files
  above, changelog and the pre-existing embedded-browser-playbook changes. The latter were not written
  by this implementing agent. The complete staged/final patch matched the approved six-file diff.
  Backlog, reproduction evidence, candidate 11, AGENTS, selection guide, API index and active worklog
  remain unstaged for later documentation work. Baseline copies remain in ignored dependency-cache storage.

### KUP-003

**Current client result:** DONE; later mounted real-collector fixtures demonstrate the missing
interior add/remove update and validate one swapped attempt with truthful progress. See
[shared validation and limits](#bounded-client-repairs-kup-003006009). This supersedes the
earlier ownership-stage characterization, without rewriting its historical claims below.

**Synthetic composed retry-contract reproduction, visible loss not established.**
Kupua mounted range callback plus original `getIdRange`; no backend. A synthetic
anchor absent from imagePositions/map, explicit uploadTime-ID tuples with anchor
100/target 200, and descending upload sort establish unknown reversed order.
Only `_searchAfterImpl` page production is replaced: first hit tuple 50 is past
the end. Real collector increments walked then returns empty; consumer made one
page call and did not reverse. Empty-first-page control made two calls, reversing
the second cursor to 200. Both retained two endpoints; the fixture has no interior
witness, so no visible missing-range claim follows. One visible selected checkbox
in both cases. Cached metadata/page overrides restored; selection cleared in finally.

### KUP-012

**Synthetic helper and mounted cached-panel reproduction; no backend.** Use three
copied image shapes with synthetic IDs; credit absent on two, `Synthetic Reconcile
Probe` on the third. Original `recomputeAll(twoEmpty)` then `reconcileAdd(valued)`
returned all-same/count 1; full three-record control returned mixed/valueCount 1/
emptyCount 2. Through synthetic `getByIds`, prehydrate all three, select two and
wait for all-empty/count 2, then add the cached third using the real action.
Mounted selection retained all-same/count 1 with three IDs, and the synthetic credit
rendered in the open Details panel. Expected full/incremental equivalence. Override
restored and selection cleared in finally; synthetic metadata cache discarded on
subsequent full navigation. No live metadata changed.

### KUP-013

**22 September Batch B result:** DONE for initiating End focus permission and request ownership;
[validation and remaining reverse-Home boundary](#bounded-focus-repairs-kup-013017018027).

**Controlled live-data keyboard reproduction.** Kupua UI -> direct-ES -> TEST.
Resident control: pinned keyword corpus, total/buffer 820; retain first-image focus,
select it and press real End outside a native input. Focus stayed unchanged.
Windowed case: pinned Dublin corpus, select the retained first focus, press End,
await changed `_seekGeneration` and settlement. Focus changed to the tail although
selection hid effective focus. Clear selection: tail focus was viewport-visible.
Expected the same hidden-focus policy as the resident control. Selection cleared;
in-page identity/generation variables deleted. No response or implementation changes.

### KUP-014

**Three producer cases reproduced.** Kupua actual UI/router/timers; direct-ES/TEST
except AI completion, which used an abort-respecting synthetic empty result and
synthetic zero ticker count. CQL: type `syntheticreprotimer`, confirm the real
300ms debounce exists, immediately Back, then observe old text in URL, store and
rendered editor. AI: enable AI input, fill `syntheticaitimer`, immediately Back;
old AI text returned in URL/store/input and one synthetic search ran. Header:
click Uploaded in table, router-navigate within 250ms to `syntheticheadernewer`
without orderBy; stale ascending order appeared on that newer query and in the
visible sort direction. Ordinary header control toggled back to descending while
retaining the query. Expected superseded timers not to modify destination intent.
No history state rewriting; AI methods restored in finally; CQL inspection global
deleted; timers allowed to finish. CQL/AI have no separate settled-typing control
beyond successful real editor publication; header has the explicit ordinary control.

### KUP-015

**Controlled live-data Home reproduction.** Kupua real Grid-logo click -> direct-ES
-> TEST. Hold delivery of the first successful Home `searchAfter`, preserving its
signal. Navigate to `synthetichomenewer` and confirm URL/store reached it. Its newer
search aborted the held read. Release by throwing AbortError, as the producer
contract requires: old Home still navigated to Home and erased the rendered newer
query. Expected newer intent to win. No late successful response was forced after
abort. Wrapper removed in finally. An ordinary no-competition control remains below.

### KUP-016

**Controlled live-data timer reproduction.** Kupua indexed grid -> direct-ES -> TEST.
Pinned Dublin: move native scrollTop to 40% and gate only callbacks containing
`seekRef.current`, preserving native timer IDs and clearTimeout cancellation.
After the timer becomes due, router-navigate to the pinned 820-result keyword
corpus and await settled top. One old timer remained active. Release only active
callbacks: seek generation changed, bufferOffset became 720 and visible scrollTop
moved from 0 to 14,340. Expected new-query top to remain. First setup attempt rejected
a legitimate reschedule and cleanup had a native-method receiver error; discarded.
Immediate corrective cleanup was verified, then the cancellation-preserving second
attempt succeeded. Timers cleared and both native functions restored in finally.
No performance result. A same-context ordinary control remains below.

### KUP-017

**22 September Batch B result:** DONE for saved-density restoration after local query/wheel
reproduction; [fresh-geometry controls and fallback limit](#bounded-focus-repairs-kup-013017018027).

**Not reproduced in the controlled setup.** Kupua UI/direct-ES/TEST. Scroll Dublin
grid, switch to table and gate only the saved-density second rAF (matching
`saved.sourceScrollTop`). Two Strict Mode callbacks were scheduled; one was cancelled
and one active. Navigate in the mounted table to the pinned keyword corpus, clear
explicit focus through its action, then release the active callback. It ran, but
scrollTop remained 0 before/after. No stale visible movement established; not an
affirmative refutation. Native rAF/cancel restored and pending IDs cancelled in
finally. The required same-query geometry control remains below.

### KUP-018

**22 September Batch B result:** DONE for original-return ownership and current geometry after
actual same-container reproduction; [validation](#bounded-focus-repairs-kup-013017018027).

**Blocked setup, two attempts.** Kupua UI/direct-ES/TEST. Oracle: a deferred old
detail-return frame must not move a newly reopened entry's list. First controlled
router traversal/close did not capture the targeted return callback within 3s;
its frame overrides were restored in finally. Retry using double-click was intercepted
by an already-open detail overlay before any new gate was installed. Relevant
branch and control are unproven; no failure/refutation claimed. Stopped rather than
resetting history to manufacture the interleaving. Later navigation discarded state.

### KUP-019

**Controlled live-data visible reproduction.** Kupua mounted detail -> direct-ES ->
TEST, pinned Dublin with a 200-image window. Open the last buffered image via the
real router and press ArrowRight. Hold one real forward-read completion, preserving
AbortSignal. Change current image to resident index 10 via router without unmounting.
Release: signal was not aborted; old pending direction advanced that newer context
to index 11. Both URL and rendered `data-detail-image-id` matched the unintended
successor. Expected index 10 retained. One read, no traversal walk; wrapper removed
and probe deleted in finally. Resident ordinary traversal control remains below.

### KUP-025

**Synthetic restore-composition reproduction; data reads synthetic, media not isolated.** Kupua actual
`restoreAroundCursor`, synthetic rank/lookup/two-neighbour read boundary; baseline
retained seek-tier total. Saved upload tuple dated 3 January 2020 has synthetic rank
100; current tuple dated 2 January has rank 200. All IDs/metadata shapes are valid
synthetic copies and remain in page. Original action requested rank once with the
saved tuple, both neighbour pages with the refreshed tuple, then published target
ordinal 100. Expected selected-tuple ordinal 200. Unchanged-tuple control published
100 consistently. Page totals retained the session regime to avoid KUP-024 confounding.
Target present in published buffer; no separate visible mislanding claim. Both methods
restored in finally; next full navigation discarded synthetic buffer state.

**Operator correction, later 20 September:** rendered synthetic target/neighbour IDs
escaped to the real thumbnail proxy and caused authorization-denied media reads.
The rank/lookup/neighbour boundaries were synthetic, but the earlier blanket
"no backend in probe" description was wrong. This was a probe-isolation defect,
not evidence of an application authorization bug. No server-data write occurred.
Infrastructure/account details from the operator's logs are deliberately omitted.
Future renderable synthetic-ID probes must intercept their media requests locally
before introducing the fixture and retain interception until it is unmounted.

### Restore Repair: KUP-024 and KUP-025

**DONE, 20 September 2026; committed as `3975f07f608c6eb4b6ce27e2cafa5f3779e430be`.** Production changes are only the existing total-predicate
import and `restoreAroundCursor` in [search-store.ts](../../src/stores/search-store.ts#L3842).
KUP-024 uses the retained published total and the actual inserted ordinal for targeting/focus, adding
no requests. KUP-025 starts saved-rank/lookup concurrently, compares the complete normalized tuple
and conditionally ranks the effective tuple once. Both neighbour pages remain parallel; there is one
landing. Obsolete speculative outcomes are handled immediately and inert; captured module-local search
generation and range signal guard async continuations and catch-side effects. Existing recovery policy,
geometry, DAL, caches and global ownership are unchanged; KUP-010 and wider migration remain separate.

**Validation:** [store tests](../../src/stores/search-store.test.ts) and [PIT tests](../../src/stores/search-store-pit.test.ts)
retain meaningful older assertions. KUP-024 failed first in eight cases with four controls. The clean
KUP-025 failing-first run had 46 failures/18 controls; setup-only undispatched-promise failures were
corrected before implementation. Final focused restore/PIT surface: 120 passed. Full units: 1544/1544;
TypeScript/Vite build passed; full runner-owned local E2E: 228/228, including forced-seek, in 5.2 minutes.
No assertion or threshold was weakened. Node 22.12.0; prescribed foreground npm/pipefail/tee commands,
Playwright unsandboxed after the operator stopped the TEST app. Existing Vite warnings remained.

**Cold review:** a fresh independent read-only reviewer compared all four code/test files with exact
starting copies at `ff932f3020d3cf08de1a70d5da0851aa9ae3ac36` and inspected saved gate/performance results.
No material issue or blocking fix; accepted within this task. Optional limits: the special-date tuple
matrix proves consumer comparison/forwarding, not an independent tied-cohort producer-order oracle;
real search supersession also aborts the range signal, so those tests do not isolate the generation
guard alone. Neither changes the bounded implementation verdict or certifies new backend behavior.

**Accepted performance trade-off:** Kupua at `http://localhost:3000` -> guarded direct Elasticsearch ->
operator-confirmed TEST, not media-api. Four repetitions per case before/after, same `nonFree=true`
query/cutoff `2026-02-15T00:00:00.000Z`, 1720x960/DPR2, fresh Playwright contexts. The opt-in
[restore diagnostic](../../e2e-perf/perceived-short.spec.ts#L49) explicitly calls the real function;
it uses real lookup/rank/pages with a deliberately stale saved tuple, not mutated TEST metadata.
Media interception precedes navigation and serves local placeholders; no synthetic media reaches TEST.
Wrappers/subscriptions are restored in `finally`; Playwright closes only its own contexts.

| Case | Completion median (range), ms: before -> after | Visible-target stable geometry median, ms | Primary DAL calls |
| --- | --- | --- | --- |
| Unchanged tuple | 467.8 (397.6-585.6) -> 486.8 (437.4-614.8) | 476.9 -> 497.6 | 4 -> 4 |
| Changed tuple | 530.5 (501.7-603.6) -> 598.2 (546.6-638.3) | 545.3 -> 609.1 | 4 -> 5 |

Every after run published one landing at the expected ordinal 802. Changed before runs published 783;
their target cell was visible but its ordinal was wrong. A preflight current-tuple rank supplies the
oracle outside the measured action and can warm backend caches. Completion measures the action return;
visible settlement is exact-target visibility with two stable geometry frames, not real image delivery
or prolonged scroll quiescence. Backend caches/load were uncontrolled; totals drifted from 1,225,368
to 1,225,363 despite the cutoff. Four samples and overlapping ranges do not isolate causal latency.
The operator explicitly accepted the observed roughly 68 ms changed-path median increase to obtain
correct placement without broadening helper alignment. It is not a guaranteed penalty, a no-regression
claim, approval of other slowdowns, or evidence for media-api/deployed performance.

PP11/P13 were neighboring controls, four repetitions each, not restore-entry measurements. PP11 median
settlement was 1049 -> 1021 ms (ranges 958-1340 -> 829-1459), zero anchor drift. P13 median max frame was
180/101 -> 175/91 ms for detail enter/exit, zero CLS and unchanged DOM churn. The runner's RTT probe hit
local 9220 and is not TEST latency evidence. Dry runs wrote scratch/report output but no canonical
history. Existing PP scenarios/revisions/schemas and historical comparability are unchanged; the two
explicitly opt-in diagnostics emit aggregate console rows only. Sanitized projections and exact starting
copies are in ignored `node_modules/.cache/restore-baseline-SlvBnt`; labeled full outputs remain in the
session TMPDIR. No live identities, tuples or raw payloads were copied into these records.

**Original coordinator requests, integrated 22 September:** qualify E013/KUP-024 and E014/KUP-025 with this
bounded current-client completion and measured-cost acceptance; preserve their historical source/read
receipts, P31 and original challenge. Keep E017/KUP-010, shared-admission and future S3a/S5/S10 composition
open. Revalidate changed fingerprints for `src/stores/search-store.ts`, its two test homes,
`e2e-perf/perceived-short.spec.ts`, AGENTS, backlog, this evidence, candidate 11, changelog and browser
playbook at actual changed scope; do not promote whole-file verification or close global dependencies.

### KUP-026

**Controlled mounted stale-ticker suggestion reproduction.** Kupua actual Clear
remount and typeahead UI; ordinary direct-ES/TEST baseline, synthetic aggregation
boundary for technique isolation. Warm credit with `SyntheticOldCredit`, Clear,
publish `SyntheticNewCredit` through real `fetchAggregations("force")`, type
`+credit:`. New bucket appeared, old did not: this own-chip path bypasses the cache
and is a non-failing control. Then type `+is:` after remount. Current agency-pick
ticker was 6,440; visible agency-pick suggestion was 0. Only the cold filter fallback
was synthetic (zero deleted/under-quota counts); it does not supply agency-pick.
Expected current ticker callback, not the first unmounted wrapper's value. No deleted
search or security probe occurred. Both temporary aggregation overrides restored
in finally. This supports stale callback presentation, not datasource hot-swap need
or every resolver freezing. Further API-only binding claims remain untested.

### KUP-027

**22 September Batch B result:** DONE for centering crossing preview sessions; valid latest-focus
settlement remains. [Native/mocked evidence and limits](#bounded-focus-repairs-kup-013017018027).

**Blocked by integrated-browser native fullscreen session.** Kupua UI/direct-ES/TEST
baseline. Plan: native preview traversal, gate old exit-settlement frame, change focus,
release and compare current-focus visibility. Native fullscreen entered, but the tool
sequence stalled before installing the gate (`__reproExit` absent). A native exit
request did not release the sequence; no settlement callback or control was observed.
No application failure or refutation inferred. Before closing, all `__repro*` globals
were absent. Agent tab was closed and subsequent deferred lookup returned page-not-found.
No native API replacement or listener was installed by this unfinished probe.

### Ordinary Controls

Fresh Kupua tab, direct-ES/TEST, sequential real actions, no read substitution:
- KUP-015: Grid logo without competing navigation reached Home in URL/store with
  loaded results. This supplies the no-competition control named above.
- KUP-016: indexed Dublin native scroll to 40%, without changing query, advanced
  seek generation, landed between 30% and 50% and exposed seven visible cells.
- KUP-017: same-query keyword grid -> table density change retained the app-owned
  viewport anchor visibly; table scrollTop 199.5. This is the required non-failing
  geometry control, not a performance measurement.
- KUP-019: resident detail ArrowRight advanced exactly one image in URL and rendered
  identity, with no controlled read gate.
Temporary anchor/expected-ID/generation globals were deleted; next navigation
discarded view state. No history, authentication or server data was rewritten.

### KUP-020

**Controlled native-loader tracking reproduction.** Kupua actual prefetch module;
TEST media read path for native Image requests, no ES probe. Two in-page copied image
shapes with synthetic IDs drive a two-record `prefetchNearbyImages` input; the helper
derives media paths from those IDs. Native loaders produced **error**, not load,
events (403 responses); no media-success claim. A temporary Image constructor wrapper
creates real native images, captures their original onload/onerror handlers and holds
native event delivery. Let the real two-second session timeout close the first session,
start another for the same ID, then release the first error handler. Tracking went
from one newer loader to zero. Removing the neighbour afterward left that newer
loader's src intact. Control: a third newly tracked loader was cancelled normally
when the neighbour was removed. Expected old completion to finalize only itself.
Three loaders total; no visible defect, bandwidth or timing verdict. In finally,
remove listeners/property interceptors, blank each src, reset prefetch test state
to cancel its timers, restore native Image and delete probe. No metadata mutation.

### KUP-021

**Locally fault-injected visible fallback reproduction.** Kupua mounted detail;
all probe imgproxy/thumbnail responses intercepted locally, **no backend for the
failed media reads**. Existing image baseline originated from direct-ES/TEST.
Return local 404 for full image and relative `/s3/thumb/` fallback. A document-capture
error observer counts only the main detail image and stops the third error before
React can retry again. Actual: three main-image errors, two thumbnail requests,
relative raw src but absolute element src, broken image still rendered, no
`Image preview not available` text. Expected one thumbnail fallback then terminal
unavailable presentation. Five intercepted requests total (including prefetch),
below the 12-request cap. Control: full-image 404 plus a locally served valid 1x1
SVG thumbnail decoded with naturalWidth 1; four local requests including prefetch.
Both routes and the error listener removed in finally, detail closed via router.
During first cleanup, unrelated ES PIT/search reads returned network failures;
no inference about their cause, no infrastructure investigation or additional live
read probe followed. The control used retained records and local media only.

### KUP-004 and KUP-024: Reused

Previously covered, not repeated. Frontend Kupua -> direct-ES -> operator-confirmed
TEST. [KUP-004's original entry](bug-backlog.md#kup-004) records same-mounted SPA
A -> absent B, real missing result, decoded A/metadata retained, and limits natural
reachability. [KUP-024's original entry](bug-backlog.md#kup-024) records cached-cursor
restore with target absent from the settled viewport, a fresh-PIT control, and the
passing ordinary detail reload/close control. Prior session verified wrapper/state
cleanup and tab closure. These are controlled real-read reproductions, not synthetic
or newly executed evidence in this session.

### Permission-Blocked Routes

Initial direct-only routing is retained here with later scope updates. General TEST
browsing does not authorize private security probes or malformed-input checks.
GRID-001/008 were subsequently authorized and exercised, as recorded below.

| ID | Exact blocker and retained next discriminator |
| --- | --- |
| KUP-010 | Explicit private security scope/isolated refusal fixture still absent. Availability of hybrid D3 does not authorize this probe. |
| GRID-001 | Initial app-path blocker superseded by the authorized sequential Kahuna GET and Kupua D3 checks below. Prior direct-Kupua result remains comparison only. |
| GRID-002 | Private principal/authorization fixtures and security scope absent. No live deleted-read attempt or expanded reproduction details. |
| GRID-003 | GET/D3 apps are now available, but a controlled invalid-status request still requires explicit scope; no malformed request attempted. |
| GRID-006 | No authorized local nginx/capturing upstream or proven caller through that file. Synthetic parameter capture belongs to that setup, not Kupua imgproxy. |
| GRID-008 | Initial path/witness blocker superseded for section/publication by real populated witnesses on GET and D3 below. Effective orderedBy aliases remain untested. |

The remaining security/malformed-input/local-nginx routes are **unexecuted**;
their expected/actual comparison and rendered failure remain untested.

### Non-Browser Alternatives

Retained, not executed (suites and service setup are outside this prompt):
- GRID-004: existing SQS queue mock with mixed Successful/Failed entries and caller accounting.
- GRID-005: existing Sharp resize test with a generated 1x40,000 image and positive pixel-bound oracle.
- GRID-007: script read-phase mock with 10+1 paginated results and mutation phase disabled.
No browser/frontend, no backend, no new fixtures or server writes; control and cleanup
belong to their separately authorized future tests. These are justified routing,
not failed or missing browser attempts.

## Sequential Kahuna and D3 Follow-Up

Later 20 September: operator authorized the running Kahuna/TEST and Kupua hybrid
local-D3/TEST apps, sequentially on the same cluster. No malformed-status or private
security permission follows. Only ordinary read queries below; no writes, service
changes, fixtures that render synthetic IDs, pagination walks or performance claims.

### GRID-001: Kahuna GET

**Controlled live-data query reproduction.** Frontend verified as Angular Kahuna,
not Kupua; observed successful GET `/images`; backend TEST operator-confirmed.
Pinned date `2026-03-04T00:00:00Z`, nonFree enabled. Positive crop/print search had
total 3; exclusion search had total 4,169. Those broad totals alone are not proof.
Keep one positive print/published witness in-page and use the normal router's `ids`
restriction for a one-image oracle. Canonical queries actually used:

- `has:crops usages@platform:print`: total 1, witness returned, UI one match.
- `has:crops -usages@platform:print`: total 1, same witness returned, UI one match;
  expected zero.
- `has:crops usages@status:published`: total 1, witness returned, UI one match.
- `has:crops -usages@status:published`: total 1, same witness returned, UI one match;
  expected zero.

Each decisive navigation had one captured primary GET; response observations changed
neither requests nor results. This confirms **platform and status** exclusion failure,
not just print. The operator's broader "any usage exclusion" hypothesis is not yet
universal runtime evidence; no duplicate ID allocated. Existing default/grouping
source analysis remains the proposed cause, not proof of the deployed revision.

Setup qualifications: router completion preceded response completion; an early empty
capture was discarded. Kahuna's first search is a one-hit summary, not the whole
loaded viewport. A second setup mistake preserved leading `+` in imperative query
calls although the widget canonicalizes it away; positive/negative zero results
from that form were discarded. Two bounded service controls found the ID but not
that malformed combined query; source inspection resolved the syntax mismatch.
Final status-exclusion repeat confirmed response membership and visible match count;
the thumbnail-ID selector found no matching element, so decoded image display is
not independently established. No IDs or witness metadata copied here.

Cleanup: each observer restored original XHR open/send and removed load listeners
in finally; timeouts cleared, in-page witness/helper data deleted. Original send
was not necessarily native in this production app, so native-string checks are
not a cleanup oracle. Kahuna agent tab closed and page-not-found confirmed before
any Kupua probe. Authentication untouched.

### GRID-008: Kahuna GET

**Controlled live-data field-resolution reproduction.** Same Kahuna GET/TEST setup
and one-image witness. Its real print usage had nonempty sectionCode and
publicationCode; the positive platform/status controls above returned that witness.
Pass each actual code, quoted with JSON string escaping inside the page, through
the supported `usages@section:` and `usages@publication:` fields. Each returned
total 0/data length 0 and rendered zero matches. Expected the known matching witness.
These are **positive field-resolution cases**, not evidence about exclusion syntax.
Exactly one captured primary GET per case. Values and identity retained only in
page; same cleanup as GRID-001. No raw-path nested query was invented: the legacy
grammar admits named nested keys, not arbitrary raw-path spellings. No orderedBy
failure or effective-alias conclusion follows. D3 comparison remains separate.

### GRID-001 and GRID-008: Kupua D3

**Controlled live-data browser reproductions.** Frontend Kupua; verified
`StranglerAdapter`, successful `POST /api/images/search-after`, plus ordinary
direct-ES auxiliary reads. This is hybrid mode, not API-only. Operator-confirmed
local Grid/D3 -> TEST, on the same cluster as Kahuna. Kahuna agent tab was closed
before opening Kupua; no concurrent app exercise.

Start with the same pinned positive crop/print query: three images loaded. Retain
one real print/published witness with populated sectionCode/publicationCode inside
the page, then navigate the real router with `ids` restricting each case to it.
Clear explicit focus through its ordinary action before each query to avoid
sort/focus-preservation interference. Observe fetch responses without changing them.

| Query case | Expected | Actual D3/store/rendered outcome |
| --- | --- | --- |
| Positive `usages@platform:print` | Witness matches | One HTTP-200 POST; total/buffer 1; witness cell visible. |
| Negative `-usages@platform:print` | No witness | One HTTP-200 POST; total/buffer 1; same witness cell visible. |
| Positive `usages@status:published` | Witness matches | One HTTP-200 POST; total/buffer 1; witness cell visible. |
| Negative `-usages@status:published` | No witness | One HTTP-200 POST; total/buffer 1; same witness cell visible. |
| Positive `usages@section:` plus known populated code | Witness matches | One HTTP-200 POST; total/buffer 0; witness absent from grid. |
| Positive `usages@publication:` plus known populated code | Witness matches | One HTTP-200 POST; total/buffer 0; witness absent from grid. |

Every case also retained `has:crops`, nonFree and the pinned date. The published-status
pair is an independent exclusion-field control, not a section/publication test.
The section/publication cases are positive field-resolution evidence under GRID-008.
No universal "every usage exclusion" conclusion, raw-path grammar extension or
orderedBy failure is claimed.

One earlier publication attempt did not retain its intended quoted query; its
response is discarded. Rerun only that case with the actual alphanumeric code in
canonical unquoted form, cancelling a pending CQL debounce through the existing
action first. It settled on the intended query and reproduced zero results. Seven
observed D3 requests across these six cases including the discarded attempt; each
per-case observer had a six-request cap. No paging, broad aggregation or synthetic
image fixture was used. Each fetch wrapper was restored in finally.

**KUP-011 live-D3 limit:** one separate actual adapter `searchAfter` read requested
at most one real `usages@status:replaced` image under the pinned date, with a 12-second
abort guard. HTTP 200 returned no witness; no plain/quoted witness comparison was
then attempted. This is inconclusive, not refutation or completed live reproduction.
The existing synthetic direct-builder evidence is unchanged. Timer cleared,
controller aborted and fetch restored in finally; no model or mutation call.

Cleanup readback: no probe globals, no own adapter-method overrides, no probe fetch
wrapper, loading false and no fullscreen. In-page witness/helper data deleted.
Kupua tab then closed and separate page read returned page-not-found. No credentials
inspected; no server/index writes, fixes, suites, builds, Git or service operations.

## Complete Accounting and Remaining Limits

- **Newly reproduced: 23 IDs** -- KUP-001/002/003/005/006/007/008/009/011/012/013/014/015/016/019/020/021/022/023/025/026 and GRID-001/008.
  Reproduced means the stated oracle at the stated layer, not all variants or natural incidence.
  KUP-003 is retry-contract evidence without an interior-selection witness; KUP-007 is
  cache publication without expanded UI proof; KUP-009 is actual browser publication
  without deep-seek consumption; KUP-011/022/023/025 establish builder/DAL/resolver/restore
  invariants, not separate visible failures; KUP-020 establishes loader tracking only.
- **Previously covered: 2** -- KUP-004/024, reused with original qualifications.
- **Not reproduced: 1** -- KUP-017; target frame ran, same-query control passed, not refuted.
- **Blocked: 6** -- KUP-010/018/027 and GRID-002/003/006, exact blockers above.
  GRID-001/008's earlier app-permission blockers were superseded by the sequential GET/D3 follow-up.
- **Non-browser alternatives: 3** -- GRID-004/005/007.
- **Unaccounted or wholly unattempted authorized rows: 0. Affirmatively refuted IDs: 0.**
  **Remaining follow-through:** KUP-009 seek-consumer evidence; KUP-018 return-frame
  setup and KUP-027 native-exit settlement after their blockers are resolved. Additional
  variants and stronger visible claims retain the specific limits in each section.
  Permission-blocked paths and backend alternatives are not silently treated as done.

No product/test/configuration edits, suites, builds, performance campaign, Git action,
service lifecycle operation, subagent or server-data write. No live IDs, metadata,
tuples, signed URLs or credentials were saved in these documents. Native-fullscreen
tab cleanup/closure is recorded above. Final second-tab readback confirmed no
probe/control globals, no own adapter-method overrides, native Image/timer/rAF
functions restored, zero in-flight prefetch loaders, closed prefetch session,
no fullscreen and no detail overlay. Both media-route removals completed. The
second tab was then closed; a separate page read returned page-not-found. Both
agent-owned tabs are closed. Authentication was not enumerated, changed or cleared.