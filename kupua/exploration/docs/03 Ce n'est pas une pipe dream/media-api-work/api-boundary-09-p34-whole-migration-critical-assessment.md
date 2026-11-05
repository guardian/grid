# P34: Independent Critical Assessment of the Whole Kupua API Migration

23 September 2026. Packet `P34`, role `critical-path-review`, execution class `strong-independent`.
Operator-authorized, report-only. Assessed at HEAD `c0d659b8ab5b0ffe60644782b7fc6b61d952328b`
(branch `mk-next-next-next`, 60 dirty/untracked paths, all preserved). No P34 registration,
assignment or artifact existed before this report; nothing else was written. Coordinator
registration, if any, is separate. This report does not authorize implementation.

**Operator decisions after this report (23 September):** F1 accepted (do not wait for #4957; the
shared helper is the consistency contract). F2 accepted in modified form: build without PIT, keep
the PIT-ready choices, add PIT later only after measurement. F4 dissolved: D3 is in draft and
moldable on this branch. F6 accepted: laptop, then TEST, then hosting. Build locally first and
split into PRs late. The resulting [API build plan](../api-build/api-build-00-plan.md) is the
active execution document; this report remains unchanged below as evidence.

**Status: COMPLETE for the deciding question, with explicit coverage limits in section 6.**
Decisive source facts were read directly; helper evidence is labelled as inherited.

## 1. Verdict in Plain English

**The migration is feasible, and candidate 11 is the right architectural baseline.** Its central
decision is correct: move data operations to Grid as a small set of bounded, typed, authenticated
reads; keep Kupua's interaction engine (buffer, collectors, focus, history, traversal) in the
browser; reuse Grid's query policy and canonical image writer; do not build sessions, Dynamo
state, Thrall interlocks or universal snapshots. The proposed endpoint family is close to the
smallest set that real consumers need. Replacing it with legacy `GET /images` would change
ordering and envelope semantics; a generic ES proxy would give up server authorization.

**But its sequencing and two of its gates make the route longer and heavier than necessary.**
Three corrections matter most:

1. **The core is currently parked behind a Grid PR that it does not need.** The next unit waits
   for PR #4957 (usage-search semantics) and a prototype "query alignment" pass. If every new
   server read reuses D3's own admission and query construction, the reads agree with each
   other *by construction*, whether or not #4957 has merged. The disagreement that gate protects
   against already exists in today's hybrid mode, and moving rank/window server-side *reduces* it.
   Usage-negative and print-code queries are edge cases of an independent Grid correction. They
   should block usage-query parity claims, not the core.
2. **The PIT lifecycle (S4) is not required for API-only operation.** Kupua already browses
   correctly without a PIT in local mode, when PIT opening fails and after expiry. New uploads are
   excluded by the existing "frozen until" cap, not by the PIT. The unresolved PIT admission,
   lifecycle and capacity questions can therefore leave the critical path entirely, provided the
   operator accepts PIT-less API-only browsing.
3. **The real first upstream dependency is D3 itself (PR #4849), which is not merged.** Every
   new route reuses D3-introduced internals. The plan should state that explicitly and define
   how follow-up PRs stack, rather than naming #4957 as the gate.

**Unnecessarily complicated:** per-operation hybrid activation (each new endpoint enabled
separately beside direct-ES reads, multiplying composed-validation states); PIT open/close routes
and their admission design; the post-merge alignment unit as a gate; S10 bundling "zero browser
ES" with "hosted multi-user deployment".

**Decide next:** (a) whether the core may proceed on D3's shared builder without waiting for
#4957; (b) whether API-only v1 may be PIT-less; (c) whether new server routes may stack on the
unmerged D3 branch; (d) later, the hosting model for other users.

**Authorize first:** one Scala-only, inactive unit: extract D3's admission and query construction
into shared helpers under behavior-preservation tests, and add `POST /images/window` using them,
with tests proving `window(k)` equals D3's walk at position `k`. No client switch in that unit.

**Confidence split.** Architecture and sequencing conclusions: high, grounded in current source.
Runtime and performance: **unproved**. The existing 12 September campaigns show hybrid D3 mode
roughly 300-400 ms slower on network-bound actions in the local-media-api/tunnel topology.
API-only adds further sequential hops (rank, profiles) that nobody has measured. That calls for
one later bounded comparison, not a new baseline or a blocker.

## 2. Current-System and Plan-Comparison Matrix

### 2a. Running architecture (source-grounded)

- **Factory:** `createDataSource()` always constructs `ElasticsearchDataSource`, wrapping it in
  `StranglerAdapter` only when `VITE_USE_MEDIA_API=true` ([index.ts:34-40](../../../../src/dal/index.ts#L34)).
  The search store uses that factory ([search-store.ts:1960](../../../../src/stores/search-store.ts#L1960)).
- **Hybrid dispatch:** the Strangler sends only `searchAfter` to D3, and only if it is not a
  cursor-less positive-offset request. Those go directly to ES ([strangler-adapter.ts:47-84](../../../../src/dal/strangler-adapter.ts#L47)).
  PIT expiry retries D3 without a PIT; `unavailable` falls back to direct ES; refusals throw.
  All other methods delegate to ES unchanged ([strangler-adapter.ts:27-45](../../../../src/dal/strangler-adapter.ts#L27)).
- **Browser ES outside the factory:** selection constructs its own ES datasource
  ([selection-store.ts:358](../../../../src/stores/selection-store.ts#L358)), used for `getByIds`
  ([:555](../../../../src/stores/selection-store.ts#L555)) and `getIdRange` via
  [useRangeSelection.ts:242](../../../../src/hooks/useRangeSelection.ts#L242). Collections also
  construct one ([collection-store.ts:116](../../../../src/stores/collection-store.ts#L116)) for
  boot-time default-free counts ([:135](../../../../src/stores/collection-store.ts#L135)). The CQL
  element's first-registered resolver captures a datasource (inherited: P29 and candidate section 6
  S7/S8; not re-read here).
- **Startup:** PIT open (skipped entirely when `IS_LOCAL_ES`), first page (D3 in hybrid) and
  tickers run in one `Promise.all`; PIT failure means "proceed without"
  ([search-store.ts:2313-2338](../../../../src/stores/search-store.ts#L2313)).
- **Freeze:** every extend/seek/fill applies `until = newCountSince`. The code comment states
  that PIT makes this redundant only while alive, and that the cap protects PIT-less operation
  ([search-store.ts:850-878](../../../../src/stores/search-store.ts#L850)).
- **Position map:** opens a dedicated PIT and returns `null` if opening fails. The map is
  optional ([es-adapter.ts:1986-2100](../../../../src/dal/es-adapter.ts#L1986); AGENTS KAD #12).
- **Sort-around-focus:** D3 `ids` lookup ([search-store.ts:1577](../../../../src/stores/search-store.ts#L1577)),
  then direct-ES `countBefore` ([:1709](../../../../src/stores/search-store.ts#L1709),
  [:1728](../../../../src/stores/search-store.ts#L1728)), then centred pages. In hybrid mode this
  already mixes server and client predicates.
- **Deep seek:** `estimateSortValue` → page → `countBefore`, plus keyword composite walks. All
  are direct ES today ([search-store.ts:3243-3465](../../../../src/stores/search-store.ts#L3243)).
- **Standalone detail:** `dataSource.getById` goes to ES `_mget` even in hybrid mode
  ([ImageDetail.tsx:250-265](../../../../src/components/ImageDetail.tsx#L250),
  [es-adapter.ts:730-733](../../../../src/dal/es-adapter.ts#L730)).
- **Unused surfaces:** `searchRange` and `count` have no production caller
  ([es-adapter.ts:698-705](../../../../src/dal/es-adapter.ts#L698); grep across `src`).
- **Development-only facilities:** relative `/api` (media-api), `/s3` thumbnails, `/imgproxy`
  full images and `/bedrock` embed/health all rely on Vite proxies or middleware
  ([vite.config.ts:144-168](../../../../vite.config.ts#L144),
  [image-urls.ts:53](../../../../src/lib/image-urls.ts#L53),
  [service-discovery.ts:24](../../../../src/dal/grid-api/service-discovery.ts#L24),
  [bedrock-proxy-client.ts:19](../../../../src/lib/bedrock-proxy-client.ts#L19)). The collections
  service defaults to `localhost:9010` ([collection-store.ts:184](../../../../src/stores/collection-store.ts#L184)).
  Quota uses the existing media-api usage route ([quota-store.ts:43](../../../../src/lib/cost/quota-store.ts#L43)).
- **D3 server:** rejects `offset != 0`, validates Option B clauses and reuses
  `makeQuery` + `buildFilterOpt` (tier filter included) + runtime mapping. It applies a raw PIT
  only as a snapshot selector (`search(Nil).pit`) and otherwise uses migration-aware
  `prepareSearch`. It drops `_shard_doc`, validates a lean projection and silently drops
  undecodable hits together with their tuples
  ([ElasticSearch.scala:754-880](../../../../../media-api/app/lib/elasticsearch/ElasticSearch.scala#L754)).
  The controller adds the deleted-search uploader restriction
  ([MediaApi.scala:867-885](../../../../../media-api/app/controllers/MediaApi.scala#L867)).
  The body decoder **also appends Grid's hide-by-default conditions unless mentioned**
  ([ElasticSearchModel.scala:158-163](../../../../../media-api/app/lib/elasticsearch/ElasticSearchModel.scala#L158);
  [Parser.scala:5-17](../../../../../media-api/app/lib/querysyntax/Parser.scala#L5)).
- **Legacy GET:** `createSort` has no unique tiebreaker and uses legacy tokens
  ([sorts.scala:9-18](../../../../../media-api/app/lib/elasticsearch/sorts.scala#L9)). It is not a
  substitute for ordered windows. `lookupIds` is unused and has no tier filter
  ([ElasticSearch.scala:170-181](../../../../../media-api/app/lib/elasticsearch/ElasticSearch.scala#L170)).
- **D3 merge status:** not in the last-fetched local `origin/main` (22 September). Route and
  commit ancestry were checked read-only without fetching; AGENTS says "human review remains".

### 2b. Workflow coverage matrix

Status: **I** = inspected in current source by P34; **H** = inherited (candidate/P-reports/helpers,
not re-verified); **U** = unresolved boundary.

| Workflow | Current owner and transport | Candidate 11 target | P34 assessment | Status |
|---|---|---|---|---|
| First page / total | D3 (hybrid) or ES; parallel with PIT and tickers | D3 + S1; S7 count separate | Keep. No count fusion needed. | I |
| Extend fwd/back, eviction | D3 with raw PIT from browser | D3 + S4 context | Keep D3, **PIT-less in API-only** (F2) | I |
| Shallow seek / Home within 10k | Direct ES (positive-offset bypass) | S2 window | Keep; first server unit (section 4) | I |
| End / null tail | D3 `seekToEnd` | D3 | Keep unchanged | I |
| Deep seek, scalar | ES percentile → D3 page → ES rank | S5 + S3a | Keep; part of coherent core switch | I |
| Deep seek, keyword | ES composite walk/distribution | S5 keyword-page | Keep, after scalar; PROD cardinality already limits value | I/H |
| Sort-around-focus, restore | D3 `ids` lookup + ES `countBefore` + centred pages | S3a rank | Keep; retains KUP-024/025 contracts | I |
| Position map 1k-65k | ES dedicated PIT walk | S3b keys + S4 map context | **Live keys, no PIT**; map remains optional (F2) | I |
| Range selection | ES live walk from selection's own datasource | S3b + injection | Keep; injection required | I |
| Density/history/traversal | Client-only over buffer | Unchanged | Unchanged | H |
| Standalone detail | ES `_mget` via `getById` | S6a GET reuse | Keep; small and independent | I |
| Selection hydration | ES `_mget` via own datasource | S6b D9 mget | Keep; cap/cost measurement-gated | I/H |
| Counts/tickers/poll | ES `size:0` + filter aggs | S7 D7 | Keep | I/H |
| Facets, typeahead | ES aggs; CQL first-bound datasource | S8 aggregations | Keep; first-registration binding needs API datasource at startup | H/U |
| Collection counts/tree | Own ES + dev service URL | S8 + base URL | Keep | I |
| AI health/search | `/bedrock` proxy + ES KNN | S9 compatibility | Keep, after core; must not gate startup | H |
| Config/aliases bootstrap | Module-evaluation config; `/api` discovery | S10 pre-import bootstrap | Split into S10a/S10b (F6) | H/U |
| Media delivery | `/s3`, `/imgproxy` dev proxies | S10 canonical links + renewal | S10a uses canonical links; transform parity is a named check | I/H/U |
| Migration windows | Unsupported (operator) | Unsupported | Multi-user deployment needs an agreed gate | H/U |

### 2c. Plan generations compared

| Idea / assumption | Origin | Status | Reason (current consumers, contracts, priorities) |
|---|---|---|---|
| Migrate search as well as detail/writes ("API-first", HATEOAS root, additive only) | April API-first plan (helper-read) | **Retain as intent** | Zero-browser-ES is still the target. Additive-only still matches the operator's rule. |
| Keep ES search forever; migrate only reads/writes around it | April bread-and-butter plan (helper-read) | **Superseded** | Deployable API-only Kupua is now required. |
| `searchRange` → `GET /images` offset | Inventory 01 row 2 | **Rejected** | No caller; GET lacks tiebreaker and tuples ([sorts.scala:9-18](../../../../../media-api/app/lib/elasticsearch/sorts.scala#L9)). |
| AI via existing `GET ?useAISearch` "identical algorithm" | Inventory 01 row 20 | **Rejected** | Algorithms differ (P29, inherited). Compatibility operation retained. |
| D7 → D9 → D8 order; D8 before maps/ranges | Workplan 02 | **Superseded** | No engineering dependency; maps/ranges can be live. |
| D8 multi-index PIT | Workplan 02 / inventory | **Rejected** | Duplicate identities during migration; migration unsupported. |
| Semantic browse session, durable admission, Thrall interlock | API-only assessment 01; architecture 04 | **Rejected for scope** | Stronger guarantees; production blast radius ([05 scope reassessment](../../zz%20Archive/media-api-work/2026-09-migration-assessments/grid-index-migration-05-scope-reassessment.md)). |
| "Option C: migrations unsupported, accept ordinary page/PIT race" | Scope reassessment 05 | **Retain; extend (F2)** | Its accepted race already treats PIT consistency as best-effort. That supports PIT-less API-only. |
| Pinned-PIT "Option A" fail-closed gates | Scope reassessment 05 | **Rejected** | Only needed for availability during migration; not required. |
| Core API failure is not data absence | API-only assessment 01, section 2.2 | **Retain as later decision** | Needed when API-only activates; the graceful-absence directive then needs narrowing for core reads (F7). |
| Typed window/keys/rank/profiles/count/aggs/mget/AI; client collectors; singleton GET | Candidate 11 | **Retain** | Each has a real consumer (2b); none mirrors an unused method. |
| S4 ordinary PIT open/close + admission | Candidate 11 | **Defer** (F2) | Not needed for accepted behavior; its unresolved security/capacity question leaves the critical path. |
| Section 15 alignment before S2 | Candidate 11 | **Demote** (F1) | It is correctness work for an independent Grid fix and direct/hybrid mode, not a consistency prerequisite. |
| S2 → S3 → S4 → S5 incremental hybrid activation | Candidate 11 | **Change** (F3) | Land servers inactive; activate one coherent ordered-read mode. |
| S10 deployed delivery + API-only | Candidate 11 | **Split** (F6) | Zero-ES on a laptop against deployed TEST is achievable without hosting decisions. |
| Withhold incomplete windows; nullable primary results; no global policy | Candidate 11 | **Retain** | Local and proportionate. |

## 3. Critical Findings

### F1. The core is sequenced behind an independent Grid correction it does not need

- **Class:** plan defect (sequencing). **Confidence:** high on source; operator decision required.
- **Unsupported assumption:** new reads and D3 might disagree unless #4957 is merged and the
  prototype is aligned first ([candidate section 15](api-boundary-11-candidate-plan.md#15-post-merge-prototype-query-alignment-workplan);
  [section 6 S2](api-boundary-11-candidate-plan.md#6-reviewable-slices-and-why-this-order); P29 C1).
  C1's counterexample is "*corrected* window/key/rank … could exclude a witness that *unchanged*
  D3 includes" ([challenge section 2](api-boundary-12-plan-challenge.md#c1-join-new-query-admission-to-d3-before-activating-a-shared-browse-path)).
  That premise holds only if new reads use a different query construction from D3.
- **Evidence:** D3 builds its query from `SearchParamsBody.fromJson` (defaults appended from
  `Parser.run("")` unless mentioned), `makeQuery` and `buildFilterOpt`
  ([ElasticSearchModel.scala:158-163](../../../../../media-api/app/lib/elasticsearch/ElasticSearchModel.scala#L158),
  [ElasticSearch.scala:770-773](../../../../../media-api/app/lib/elasticsearch/ElasticSearch.scala#L770)).
  If window, rank, keys, profiles and count call the *same* functions, they agree with D3 either
  before or after #4957, because #4957 changes that shared builder. For the default path, the only
  negated nested condition is the replaced-usage default, so GRID-001's grouping has nothing to
  merge ([QueryBuilder.scala:113-148](../../../../../media-api/app/lib/elasticsearch/QueryBuilder.scala#L113)).
  GRID-001, GRID-008 and KUP-011 affect only user usage negatives, print code/name chips and
  literal/quoted special text. The mixed state C1 guards against **already operates** in
  `--use-media-api` mode: D3 lookup plus direct-ES rank ([search-store.ts:1577-1730](../../../../src/stores/search-store.ts#L1577)),
  and D3 pages plus a direct-ES shallow window ([strangler-adapter.ts:56-63](../../../../src/dal/strangler-adapter.ts#L56)).
- **Consequence:** the core API work (operator priority 1) waits on external human review of a
  PR that corrects independent query semantics. Moving rank/window server-side is the fastest way
  to *remove* the disagreement; gating it on alignment is backwards.
- **Correction:** one shared admission/query function is the consistency contract. Gate only
  *usage-query parity claims* on #4957 import and KUP-011 mapper cleanup. Run section 15 as a
  parallel correctness unit, not before S2.
- **Cheapest discriminator:** a Scala integration test where default-query and GRID-001-witness
  results through D3, window and rank agree with each other (consistency), without asserting the
  witness is correct (correctness). Compose it from captured real mapper bodies, following the
  usage investigation's golden-body pattern.

### F2. PIT lifecycle is treated as necessary, but current accepted behavior does not depend on it

- **Class:** plan over-requirement, plus an external decision. **Confidence:** high on source;
  medium on drift impact (unmeasured).
- **Assumption challenged:** "PIT open/close … Necessary to remove browser lifecycle traffic"
  (P29 capability table; candidate [section 3](api-boundary-11-candidate-plan.md#3-concrete-api-capabilities)
  PIT row and [S4](api-boundary-11-candidate-plan.md#6-reviewable-slices-and-why-this-order)).
- **Evidence:** local mode never opens a browse PIT and the habitual E2E suite runs that way;
  PIT failure proceeds without one ([search-store.ts:2313-2318](../../../../src/stores/search-store.ts#L2313)).
  Expired PITs already retry live ([strangler-adapter.ts:72-76](../../../../src/dal/strangler-adapter.ts#L72)).
  Continuations exclude new uploads through `until`, independently of PIT
  ([search-store.ts:850-878](../../../../src/stores/search-store.ts#L850)). Page one is already
  PIT-less and rank/ranges are live by design ([candidate section 2](api-boundary-11-candidate-plan.md#2-ownership-and-invariants)).
  D3 continues correctly without a PIT ([ElasticSearch.scala:817-825](../../../../../media-api/app/lib/elasticsearch/ElasticSearch.scala#L817)).
  Scope reassessment option C, which the operator adopted, explicitly accepts the ordinary
  page/PIT race. Inventory 01 section 3 separates cursor pagination from snapshot consistency.
- **Security premise also overstated:** the PIT branch still applies the full query, filters and
  tier policy; the PIT selects only the snapshot. In API-only mode only server-opened PITs exist.
  The residual risk is resource use and migration-era targets, not disclosure (structural
  inference, medium confidence).
- **Consequence:** S4 keeps an unresolved admission/lifecycle/capacity design, two routes and
  D3 interoperability on the API-only critical path for a guarantee Kupua already treats as
  best-effort. PIT-less browsing also *removes* one current inconsistency: live rank against PIT
  pages.
- **Correction:** API-only v1 is PIT-less. `openPit` resolves `null`; browse continuations use
  D3 without a PIT; maps use live key pages or stay absent. Keep D3's PIT branch for hybrid. Add
  S4 only if an observed drift problem justifies it.
- **What changes for users:** a document whose sort key or membership changes mid-session can
  duplicate, skip or shift a map offset by one. Uploads cannot, because of the freeze.
- **Discriminator:** a store-level test that edits or deletes a document between pages in
  PIT-less mode and asserts no crash plus bounded duplication handling. Then operator browsing.

### F3. Per-operation hybrid activation multiplies composed states

- **Class:** plan defect (activation design). **Confidence:** medium-high.
- **Evidence:** each slice may activate beside remaining direct-ES reads
  ([S2-S5](api-boundary-11-candidate-plan.md#6-reviewable-slices-and-why-this-order)), and each
  intermediate needs its own membership/total/rank join (section 3 activation dependency). The
  pure API datasource arrives only at S10 ([section 4](api-boundary-11-candidate-plan.md#4-reuse-production-effects-and-client-changes)).
  There is one caller (the operator's laptop; [index](media-api-00-index.md#current-reality)).
- **Correction:** let server routes land inactive as small PRs. Add one client datasource mode
  that sends *all* ordered reads (D3, window, rank, scalar/keyword profiles, keys) to Grid at once.
  Non-coordinate owners (facets, counts, collections, AI) may remain direct during development.
  That creates one composed state to validate instead of four or five.

### F4. D3 is the unnamed first upstream dependency

- **Class:** missing prerequisite / external decision. **Confidence:** high.
- **Evidence:** D3 is absent from the last-fetched `origin/main` (read-only ref check). New
  endpoints reuse D3's `SearchParamsBody`, lean projection/strip and lifted `hitToImageEntity`
  ([media-api instructions item 26](media-api-91-instructions-for-agents.md);
  [ElasticSearch.scala:727-746](../../../../../media-api/app/lib/elasticsearch/ElasticSearch.scala#L727)).
- **Consequence:** every Grid slice either waits for #4849 or stacks on it. Neither is stated.
  Growing D3's PR would delay it; stacking unreviewed PRs raises the review burden.
- **Correction:** name #4849 merge (or explicit approval to stack) as the prerequisite. Keep D3's
  PR frozen. Add follow-ups as separate small PRs.

### F5. The recorded API-mode latency penalty is real, and new hops are unmeasured

- **Class:** missing evidence (not a blocker). **Confidence:** measured values high; attribution low.
- **Evidence:** on 12 September, direct ES versus hybrid D3 settled times were PP1 570 → 970 ms,
  PP3 868 → 1247, PP7 933 → 1284 and PP8 1013 → 1378. Client-only PP6 was 265 → 264
  ([perceived-log.md:1098-1118](../../../../e2e-perf/results/perceived-log.md#L1098),
  [:1151-1171](../../../../e2e-perf/results/perceived-log.md#L1151)). Topology is confounded
  (different origins, local JVM, https, tunnel, uncontrolled cache). Candidate
  [section 8](api-boundary-11-candidate-plan.md#8-evidence-checks-and-local-blockers) treats this
  as a baseline with limits but does not state the magnitude or name the new critical-path hops.
- **Structural inference (unmeasured):** API-only moves rank into sort-around-focus and restore,
  and moves percentile/keyword/rank into deep seek. Those are chains of 2-3 sequential hops.
  Non-enveloped hops should cost far less than image pages; that remains inference. D9 at 5,000
  selected images implies about 25 enveloped requests. The historical ~137 ms per 200 hits was a
  laptop measurement; do not extrapolate linearly.
- **Precise unanswered question:** in the same topology as the 12 September media-api baseline,
  what do PP3/PP4/PP7/PP8 cost once rank and profiles move server-side, and in deployed TEST?
  Run it once, after the core switch exists, using the existing harness.

### F6. S10 conflates two milestones

- **Class:** plan defect (scoping). **Confidence:** medium-high.
- **Evidence:** hard-coded relative development paths and default service URLs are listed in 2a.
  The candidate couples pre-import bootstrap, Kahuna-hosted entry, CORS/CSP, rendition renewal and
  "API-only activation" ([S10](api-boundary-11-candidate-plan.md#6-reviewable-slices-and-why-this-order)).
- **Correction:** **S10a** means zero browser ES and zero dev media proxies from the laptop against
  deployed TEST media-api, using canonical signed thumbnails/imgops links. That is configuration
  work, with no Grid hosting change. **S10b** covers hosted multi-user deployment: host choice, entry
  and bootstrap, origins, and an agreed migration/maintenance gate. S10b needs a separate
  operator decision; S10a defines API-only completion.

### F7. Core-read failure semantics must change at API-only activation

- **Class:** decision / directive scope. **Confidence:** medium.
- **Evidence:** the graceful-absence directive (null → render without data) is development-phase.
  The Strangler's `unavailable` → ES fallback must not exist in API mode
  ([strangler-adapter.ts:77-81](../../../../src/dal/strangler-adapter.ts#L77)). API-only
  assessment 01 section 2.2 argued that core failure is not absence. The candidate says "no
  fallback in eventual API-only mode" but keeps the directive wording.
- **Correction:** at the core switch, keep D3's existing throw → store error path for core reads
  and apply nullable results only to enrichment and optional owners. Record the directive's
  revision then. No new user-facing policy is needed now.

### Confirmed as sound (no revision)

The endpoint justifications hold:

- **Window:** D3 rejects offsets ([ElasticSearch.scala:758-759](../../../../../media-api/app/lib/elasticsearch/ElasticSearch.scala#L758)),
  and GET lacks tiebreakers and tuples.
- **D9:** D3 with `ids` would apply hide-by-default filters, so it cannot give ID-only hydration
  ([ElasticSearchModel.scala:158-163](../../../../../media-api/app/lib/elasticsearch/ElasticSearchModel.scala#L158)).
  `lookupIds` is unfit.
- **Singleton GET reuse:** smallest correct detail path.
- **No routes for `searchRange`/`count`:** no production callers.
- **Option B:** retained without a second builder.
- **Restore contracts and accepted ~68 ms cost:** preserved.
- **KUP-029/030:** deferral respected.

## 4. Recommended Minimal Migration Path

**Keep:** candidate section 1 thesis and extension rule; Option B with server admission; typed
window/rank/keys/profiles/count/aggregations/mget/AI; client collectors and bounds (1k/65k/5k);
singleton GET; canonical `ImageResponse.create`; S1; no sessions/Dynamo/Thrall/snapshots;
migrations unsupported; KUP-029/030 deferred.

**Change:** (1) consistency comes from one shared server admission/query path, and #4957/section 15
gate only usage-query parity (F1); (2) API-only v1 is PIT-less (F2); (3) one coherent ordered-read
client mode instead of per-endpoint hybrid activation (F3); (4) D3 merge or stacking is the named
upstream prerequisite (F4); (5) split S10 into S10a/S10b (F6).

**Remove from the critical path:** S4 PIT open/close and its admission design; section 15 as a gate;
per-slice hybrid join matrices. **Defer:** S4 (only if drift evidence arises); D9 cap selection
(to S6b); S9 AI; S10b hosting; keyword-profile optimization; D7 startup fusion (never required).

**Order:**

| Step | Unit | Lands inactive? | Real prerequisite |
|---|---|---|---|
| U1 | Shared admission/query extraction + `POST /images/window` (Scala) | Yes | D3 merged or stacking approved |
| U2 | `POST /images/rank` on the same helpers (Scala) | Yes | U1 |
| U3 | Scalar + keyword profile operations (Scala) | Yes | U1 |
| U4 | `POST /images/keys` (source-free; map live + range) | Yes | U1 |
| U5 | Client ordered-read mode: pure API implementation for D3/window/rank/profiles/keys; PIT-less | Switch (dev flag) | U1-U4; operator PIT-less decision |
| U6 | S6a singleton GET; S7 count; S8 aggregations/collections; S6b mget; selection/collection/CQL injection | Per owner | U5 pattern |
| U7 | S10a zero-ES laptop against deployed TEST; canonical media links | Switch | U6; deployed TEST routes |
| U8 | S9 AI; S10b hosting decision | Later | Operator decisions |
| ∥ | Section 15 usage-parity alignment (after #4957 merge) | Parallel | Upstream merge |

**First bounded unit (U1), in detail.** Scala-only; no client change.

1. Extract D3's controller admission (body decode, deleted-search uploader restriction,
   validation) and ES query construction (query, filters with tier, runtime mapping, Option B
   clause validation) into shared private helpers.
2. Keep D3 behavior byte-identical. The existing D3 tests stay unchanged.
3. Add `POST /images/window`: offset/length with `offset + length` within the result window,
   D3's lean projection and image writer, paired tuples, total per `countAll`, and raw hit count
   so decode drops are visible.

**U1 acceptance:**

- `window(k, n)` IDs and tuples equal positions `[k, k+n)` of a D3 cursor walk on a fixture
  containing ties, nulls, reverse ordering and a special sort.
- Deleted-intent and tier controls give identical results through D3 and window.
- A window exceeding the result window returns 422.
- Default and GRID-001-witness queries agree between D3 and window (consistency only).

**U5 acceptance:**

- Real mapper golden bodies match across D3/window/rank for the same params.
- API mode constructs no `ElasticsearchDataSource` in the factory, selection or collections, and
  never takes the ES fallback (KUP-010 spies).
- Direct-mode unit/E2E suites stay unchanged.
- Operator browsing on TEST (per-session permission).
- One PP3/PP4/PP7/PP8 comparison against the 12 September media-api baseline (F5).

**Rollback boundaries:** U1-U4 are unused routes, so revert is enough. U5/U7 sit behind a mode
flag; switching modes starts a fresh browse generation and retires cursor/map/history coordinates
without clearing selection (candidate section 13 cutover guidance). Never mix old and new query
meanings in one generation.

## 5. Bug Dispositions and Coordinator Requests

| Item | Evidence | Disposition | Isolated test |
|---|---|---|---|
| Mapper comment says the server does not inject hide-by-default conditions; it does | [grid-api-search-adapter.ts:115-121](../../../../src/dal/grid-api-search-adapter.ts#L115) vs [ElasticSearchModel.scala:158-163](../../../../../media-api/app/lib/elasticsearch/ElasticSearchModel.scala#L158) | **Existing KUP-011** qualification. Client injection is redundant for D3 and is the sole source of contradictory-text risk there. | Capture the mapper body for a quoted literal containing a default token; assert the server-side structured query equals the no-injection variant. |
| Legacy GET offset pages have no unique tiebreaker | [sorts.scala:9-18](../../../../../media-api/app/lib/elasticsearch/sorts.scala#L9) | **Observation only**, low-confidence incidence; possibly known ("buggy-but-load-bearing" in sort options). Grid-only, not a migration gate. No ID proposed unless coordinator judges it new. | Multi-shard fixture with tied `uploadTime` across a page boundary; compare the union of pages with the full set. |
| `lookupIds` unused and without tier filter | [ElasticSearch.scala:170-181](../../../../../media-api/app/lib/elasticsearch/ElasticSearch.scala#L170) | Observation; reuse hazard for D9 (already noted in inventory 01). Not a bug. | — |

No authorization-sensitive payloads were produced; KUP-010 private-triage boundaries are unchanged.

**Coordinator requests (proposals, not edits):**

1. Candidate sections 1/6/15: record F1 as a proposed amendment (shared admission is the
   consistency contract; #4957 gates usage parity only) for operator decision.
2. Candidate sections 3/6: record the F2 PIT-less API-only decision request and the proposed S4
   deferral.
3. Candidate section 6: add D3 (#4849) merge or stacking policy as a named prerequisite (F4);
   split S10 into S10a/S10b (F6); add F3's coherent ordered-read mode.
4. Backlog KUP-011/GRID-001/GRID-008: reword the dependency from "S2 activation" to "usage-query
   parity claim", pending the operator's decision on F1. Add the KUP-011 qualification above.
5. Candidate section 8: state the F5 magnitudes and the single post-switch comparison question.
6. Register P34 receipts (section 6) only after coordinator checks; do not promote coverage.

## 6. Evidence, Coverage and Limits

**Executed:** file reads, grep, SHA-256/line counts, read-only `git rev-parse`/`status`/`show`/
`merge-base` against local refs (no fetch). Five read-only helpers were used without writes or
terminal access; their outputs are labelled below. Two helper reports contained errors, which
were corrected by direct reads: `getById` does have a caller, and one helper overstated archive
file lengths. I independently verified every decisive claim in sections 3-4. No tests, builds,
benchmarks, browser/live/API calls, credentials or Git mutations.

**Not covered:** P30/P31/P32/P33 and P02-P28 report bodies (used only through candidate/challenge
text); D3 readiness findings; CQL first-registration capture; AI algorithm difference; bootstrap
module evaluation; imgops/transform parity; deployed configuration; the complete
api-only-assessment 01 and production-impact 01 bodies. These are inherited or unresolved as
marked in 2b; none changes the verdict.

**Receipts.** Ranges are inclusive. Every line outside the listed union is uninspected by P34
itself. `helper` means inherited from a read-only helper, not P34 reading credit.

```json
[
  {"path":".github/copilot-instructions.md","sha256":"09b9b2a20456687fd3e69d3f0efbedb27572374492eea786d69d9dd95d97cb2b","method":"full-text","ranges":[[1,166]],"note":"Attached directives."},
  {"path":".github/instructions/media-api.instructions.md","sha256":"7fade059be91be752d9b85d6d80cbcc509042b6823467a0a1775de0ce1dc7a84","method":"full-text","ranges":[[1,191]]},
  {"path":"kupua/AGENTS.md","sha256":"038f630c7059b724dfe5fa583ee241314e1fd1f81a8612a220bf69c49c644514","method":"full-text","ranges":[[1,231]]},
  {"path":"kupua/exploration/docs/worklog-current.md","sha256":"8aa07154454e74a4a2641a8c79b18365dae87d72d8f9e5ef7582a905d8303d2b","method":"full-text","ranges":[[1,230]],"note":"Not edited."},
  {"path":"kupua/exploration/docs/03 Ce n'est pas une pipe dream/media-api-work/api-boundary-11-candidate-plan.md","sha256":"5ac66587e5cd3a8e63edfc4836190a87ad5eebee32ba366abe1a6024ac2926bb","method":"full-text","ranges":[[1,1059]],"note":"Final line lacks trailing newline; read via byte tail."},
  {"path":"kupua/exploration/docs/03 Ce n'est pas une pipe dream/media-api-work/media-api-00-index.md","sha256":"5c49b5cf173e1c58bcdb01a8120baa84b8894b4bd02f5f33d4cf9639a8685d9b","method":"full-text","ranges":[[1,167]]},
  {"path":"kupua/exploration/docs/03 Ce n'est pas une pipe dream/media-api-work/api-boundary-12-plan-challenge.md","sha256":"5f76ef943c38f6020ef7f437ea93045a97fc7ee997067ba91999020207aeaeee","method":"full-text","ranges":[[1,433]],"note":"Matches protected hash; no drift."},
  {"path":"kupua/exploration/docs/03 Ce n'est pas une pipe dream/media-api-work/media-api-01-capability-inventory.md","sha256":"96e1b3abe7f09a1c57ac0ca0e3ffe38a915c5b9387fd6a4caedaa3afed0063ce","method":"full-text","ranges":[[1,1265]]},
  {"path":"kupua/exploration/docs/03 Ce n'est pas une pipe dream/media-api-work/media-api-02-next-endpoints-d7-d8-d9-workplan.md","sha256":"f927cb1e3ce61cb03f5cf262f73100490c037d92f855f406bbfa355016c81a65","method":"full-text","ranges":[[1,463]]},
  {"path":"kupua/exploration/docs/03 Ce n'est pas une pipe dream/integration-workplan-bread-and-butter.md","sha256":"0351166cc089bb457e8339f483ff5c36bc34d551169b701a801f1b07a7560f6e","method":"helper","ranges":[[1,1509]],"note":"Helper-reported full read; P34 read none."},
  {"path":"kupua/exploration/docs/03 Ce n'est pas une pipe dream/integration-plan-api-first.md","sha256":"7bd7026d8cdea85b7d537da9310a0a5b3f5c67daf8b36ef6abbd63efc5f47612","method":"helper","ranges":[[1,1083]],"note":"Helper-reported full read; P34 read none."},
  {"path":"kupua/exploration/docs/zz Archive/media-api-work/2026-09-migration-assessments/grid-index-migration-00-routing.md","sha256":"487e96406e89d22e7daa4a7fc2ef9e1b6c9d217181cd058a955314cd44181a3e","method":"helper","ranges":[],"note":"Helper receipt unreliable (claimed 750 lines of a 177-line file); no credit."},
  {"path":"kupua/exploration/docs/zz Archive/media-api-work/2026-09-migration-assessments/grid-index-migration-04-architecture-proposal.md","sha256":"d6ea757195d2ce0135498be69354d71f2d976074fc794453ff152ab653718189","method":"line-ranges","ranges":[[1,90]]},
  {"path":"kupua/exploration/docs/zz Archive/media-api-work/2026-09-migration-assessments/grid-index-migration-05-scope-reassessment.md","sha256":"94c4ca32bf7c83b15ee0e88216e7b1cba20c52b963f6f8465a552c7bed079c78","method":"full-text","ranges":[[1,222]]},
  {"path":"kupua/exploration/docs/zz Archive/media-api-work/2026-09-migration-assessments/api-only-assessment-01-workplan.md","sha256":"aa3cd4338549d179c07290f3af4fc6141b75cb98877eb67a273d9f1fabcfdd75","method":"line-ranges","ranges":[[1,130]]},
  {"path":"kupua/exploration/docs/zz Archive/media-api-work/2026-09-migration-assessments/production-impact-01-findings.md","sha256":"b8fe91a3647cf5f1e47158579bec16a37a539065690d305d41f4f1765ad06c77","method":"line-ranges","ranges":[[1,140]]},
  {"path":"kupua/exploration/docs/03 Ce n'est pas une pipe dream/media-api-work/d3-search-after-04-performance.md","sha256":"ac51c521c307c9fb8b5b7d2583b193b431e27ee2b80ca5f43038ada7e32b5394","method":"helper","ranges":[[1,439]],"note":"Helper summary only."},
  {"path":"kupua/exploration/docs/03 Ce n'est pas une pipe dream/media-api-work/api-boundary-09-p01-existing-performance.md","sha256":"b5fc71d06d633c2ede5864c01c7fa4d7a24870b2e65826980d5d87ef6571aeba","method":"helper","ranges":[],"note":"Helper cited 1-217 of a 132-line file; no credit."},
  {"path":"kupua/e2e-perf/results/perceived-log.md","sha256":"62106d38cca35a9bf3da084fcee032a3a64ad254d0a45d422fca3133196e9584","method":"line-ranges","ranges":[[1060,1210]]},
  {"path":"kupua/exploration/docs/bug-backlog.md","sha256":"6e1de0efeef4bf70c086a3bb5746cc190a2a3619b45779bb5e9a41f6e8cf2737","method":"line-ranges","ranges":[[33,48],[223,245],[441,465]]},
  {"path":"kupua/src/dal/strangler-adapter.ts","sha256":"530547cf2430d174e84693b3a705a18e5dbee1edd1bb8e90a692cbb0963fa7f3","method":"full-text","ranges":[[1,85]]},
  {"path":"kupua/src/dal/index.ts","sha256":"4c9b5395ad937e15f08a8f29c12cfb3be060a6157fbb2b17a37e72d74f768b0a","method":"full-text","ranges":[[1,41]]},
  {"path":"kupua/src/stores/search-store.ts","sha256":"d10bcd31e251a8f95f0e04181a2e93527ca3501d6597669b5b6c024f4e4f016f","method":"line-ranges","ranges":[[845,880],[1565,1740],[2160,2400]],"note":"Plus grep hits cited individually."},
  {"path":"kupua/src/dal/es-adapter.ts","sha256":"60219025cefe0469a7fc3c1d538f5596ffdc7252efa9d927af5874a6bbf3b60f","method":"line-ranges","ranges":[[695,740],[1975,2120]]},
  {"path":"kupua/src/components/ImageDetail.tsx","sha256":"18701f72e5ca6f8ad876f16345e349b15682f010ff3770112e26de416c6d6a1a","method":"line-ranges","ranges":[[222,280]]},
  {"path":"kupua/src/dal/grid-api-search-adapter.ts","sha256":"39ef336ef8bc666979692d3c48c8e693da786c4dae4266ef892435a1e1ff8d73","method":"line-ranges","ranges":[[95,200]]},
  {"path":"kupua/src/stores/selection-store.ts","sha256":"80b12cd24d0b0e98a79a40ea21499bd4835ef366b39fd565bc77902569a1bfb3","method":"grep","ranges":[[292,292],[358,358],[555,555]]},
  {"path":"kupua/src/stores/collection-store.ts","sha256":"069fecb6ba3a05dda598da3cf1dac181b9faf71a7241046886c0e0c391c8e30f","method":"grep","ranges":[[116,116],[135,135],[184,185]]},
  {"path":"kupua/vite.config.ts","sha256":"1c1b93470cc548574502444ac4782230176da7114c7e90627f23c03fa72a0750","method":"grep","ranges":[[28,28],[68,68],[144,168]]},
  {"path":"kupua/src/dal/grid-api/service-discovery.ts","sha256":"863c7f3fbc345262b7b1e31a5fea53a0de4466018dfa1c258c9a173852e4a240","method":"grep","ranges":[[6,8],[23,24],[54,54]]},
  {"path":"kupua/src/lib/image-urls.ts","sha256":"34d20901d4be59f39a25c2792f167e9e7a678bc28290ac0618a0f44fc69ecc57","method":"grep","ranges":[[19,19],[53,53]]},
  {"path":"media-api/app/lib/elasticsearch/ElasticSearch.scala","sha256":"c563114420f0297cd5c61566258d45608886759a0cee167840a14e0899ce052d","method":"line-ranges","ranges":[[120,200],[690,880]],"note":"Unchanged since P29 receipt."},
  {"path":"media-api/app/controllers/MediaApi.scala","sha256":"859610f8fa50e925082125cb9c7a19f92941725add7a87e771619c160e4f7a26","method":"line-ranges","ranges":[[555,600],[860,912]]},
  {"path":"media-api/app/lib/elasticsearch/ElasticSearchModel.scala","sha256":"4a46deb66ea728cdf93ae16e1cb83bd4fb030cde29558fb5bd6e1778e4a45fbb","method":"line-ranges","ranges":[[100,210]]},
  {"path":"media-api/app/lib/elasticsearch/QueryBuilder.scala","sha256":"d973848aa988c7a050afd2395c084d2329eff653a4b6d6a0cc4003df8aaee321","method":"line-ranges","ranges":[[100,235]]},
  {"path":"media-api/app/lib/querysyntax/Parser.scala","sha256":"5ee61b322086852bbffb31d341f52e4449b486c03317c0e661bb35233db97b22","method":"full-text","ranges":[[1,34]]},
  {"path":"media-api/app/lib/elasticsearch/sorts.scala","sha256":"47470bb47b9e4d41794f7c403239d39edc2d88c947752b2ca932dcc6dab44e4a","method":"line-ranges","ranges":[[1,60]]},
  {"path":"kupua/src/hooks/useRangeSelection.ts","sha256":"240758b2f33b5f7f8f0db8f15140499b86cad2524e25f5b5642a1fdfd6d81a4e","method":"grep","ranges":[[242,242],[269,269]]},
  {"path":"kupua/src/lib/cost/quota-store.ts","sha256":"cc12015360197538e815c76b5976f198424ef63ff10b7b409757dad5e4e1c85b","method":"grep","ranges":[[43,43]]},
  {"path":"kupua/src/lib/bedrock-proxy-client.ts","sha256":"b56b62c2f7e3366aafcfa21d065652b93dd55f2206c1934b3b57c8bd8aeddc13","method":"grep","ranges":[[19,19],[33,33]]}
]
```

**Fingerprint recheck (after writing):** search-store, strangler, mapper, all four Scala sources,
candidate 11, challenge 12, perceived-log and the worklog match the hashes above. No drift. HEAD is
unchanged at `c0d659b8a`. The dirty count went from 60 to 61, and the only addition is this report.
