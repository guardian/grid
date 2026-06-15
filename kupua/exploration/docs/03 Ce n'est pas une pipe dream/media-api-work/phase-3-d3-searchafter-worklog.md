Phase 3 D3 — `POST /images/search-after` endpoint (Leg A: Scala, Leg B: TypeScript).
Workplan: `media-api-work/phase-3-d3-searchafter-workplan.md`. Sort rationale: `...-sort-companion-workplan.md`.

Note: No S3 config changes needed. Play's CSRF filter does not check application/json POSTs by
default (json is not in the default blacklist). The local application.conf we added was unnecessary
and has been deleted. Initial CSRF 403s during curl testing were auth/origin issues, not CSRF.

2026-06-12 — Starting Leg A (Scala). Implementing in order:
sorts.scala → ElasticSearchModel.scala → ElasticSearch.scala → QueryBuilder.scala → MediaApi.scala → routes.

Leg A files written:
- sorts.scala: added reverseSorts (flip asc/desc on each FieldSort), jsonToSort (deserialise flat and nested-object sort entries), orderOf, sortModeOf helpers. New imports: FieldSort/NestedSort/SortMode from elastic4s sort package + Play JSON.
- ElasticSearchModel.scala: added SearchAfterParams, SearchAfterRawResults case classes; SearchParamsBody object with fromJson (inline readOrderBy per Q3, JSON primitives for length/offset). Added JsObject/JsValue to imports.
- ElasticSearch.scala: added searchAfter() method (buildFilterOpt call + null-zone detection + cursor validation + PIT/non-PIT branch via prepareSearch + sort-value helpers). Added sortValueToJsValue/sortValuesToJsValues/jsValueToAny/remapNullZoneSortValues private helpers. New imports: FieldSort, JsNull/JsNumber/JsString/JsValue, duration wildcard.
- QueryBuilder.scala: widened dateAddedToCollection filter to also match "-dateAddedToCollection" (asc order from kupua). One-line change.
- MediaApi.scala: lifted hitToImageEntity to private method (curried: request + include params); updated 2 call sites in imageSearch(). Added searchAfterImages() action (auth.async(parse.json), parses body, calls elasticSearch.searchAfter, responds with JSON obj of data/total/sortValues/nextSortValues/pitId).
- conf/routes: added POST /images/search-after before GET /images/:id.

Compile attempt #1: 17 errors. Fixes applied:
- sorts.scala: fs.order is SortOrder not Option (== not .contains); NestedSort takes Option[String] path
- ElasticSearch.scala: hit.sort is Option[Seq[AnyRef]] not Array — use .getOrElse(Seq.empty).take(); sortValuesToJsValues takes Seq not Array; Sort import missing; foldLeft needed explicit [(Seq[JsValue],Seq[JsValue])] type annotation; duplicate imports from bad replace
- MediaApi.scala: imageResponse.create needs implicit logMarker (added to hitToImageEntity signature); tuple destructuring type annotations caused erasure errors (use typed result val instead); getIncludedFromParams only accepts AnyContent request (inlined); scala.util.Right shadowed by model.Right (converted pattern match to .fold)

Compile attempt #2: 3 errors. Fixes applied:
- MediaApi.scala: auth.async block missing closing }; val body missing from refactored code

Compile attempt #3: SUCCESS. All 10 Scala sources compiled clean.

Curl verification (2026-06-12):
- Page 1: total=1319205, sortValuesCount=5, firstSortValues=[1781269086799, "bc0f..."], pitId=null (expected — no PIT sent)
- Page 2 (cursor): total=1319201, sortValuesCount=5, firstSortValues=[1781268671037, ...] — timestamp < cursor value (desc order continues) ✓
Leg A complete and verified.

Starting Leg B (TypeScript DAL wiring).

Leg B files written:
- vite.config.ts: added GRID_API_READ_VIA_POST whitelist for POST /images/search-after (bypasses write guard without needing VITE_GRID_API_WRITES_ENABLED)
- src/dal/grid-api-search-adapter.ts: new — apiSearchAfter() function, builds POST body from SearchParams (sort clause via buildSortClause, all filter fields mapped, free filter from nonFree param), maps response to SearchAfterResult. PITs forwarded to server (both kupua and local media-api --use-TEST connect to the same TEST ES cluster, so PIT IDs are valid across both).
- src/dal/strangler-adapter.ts: new — StranglerAdapter implements ImageDataSource, delegates all methods to ElasticsearchDataSource except searchAfter (routes to apiSearchAfter)
- src/dal/index.ts: added createDataSource() factory (StranglerAdapter when VITE_USE_MEDIA_API=true, else ElasticsearchDataSource); added StranglerAdapter export
- src/stores/search-store.ts: replaced `new ElasticsearchDataSource()` with `createDataSource()` (the only searchAfter call site)

Unit tests: 898 passing, 0 failures.

End-to-end testing (2026-06-12, --use-media-api mode):
- Bugs found and fixed:
  1. StranglerAdapter: class field initializers ran before constructor param assignments (Vite native class fields) → converted to prototype methods, bound optional methods in constructor
  2. CORS rejection: kupua.media.local.dev-gutools.co.uk not in media-api corsAllowedDomains → override Origin header in Vite proxy to media.local.dev-gutools.co.uk
  3. Image data shape: API usages/leases/collections are Argo-wrapped entities, Image type expects plain arrays/objects → added mapApiImageToImage() in grid-api-search-adapter
  4. Seek 500: r.result.totalHits NPE when countAll=false (trackTotalHits(false) → ES omits total) → guard with `if (params.searchParams.countAll.getOrElse(true))`

All features verified working:
- Initial load: images render ✓
- Scroll pagination: cursor advances correctly ✓
- Seek (scrubber): seeks to position and renders images ✓
- Performance: slower than direct-ES (expected — imageResponse.create ×200/page + extra hops in dev). Not a production concern.

Playwright e2e (2026-06-12, default ES mode — regression check):
- 240/240 tests passed. Zero failures. Full suite green.
- Unit tests also confirmed green: 898/898 (45 files).

Payload/perf investigation (2026-06-12, --use-media-api mode):
- Root cause of ~3s Home reload: response payload size × dev SSH-tunnel bandwidth.
  NOT the query (ES took ~90-160ms), NOT route-mixing, NOT co-location. fileMetadata
  (970KB) + embedding (630KB) dominate the 2122KB/page _source. Prod's fast ES link
  makes this a dev-only artefact (= why real Kahuna isn't slow).
- Measured 3 projections (full 2122KB/~3100ms, Option-1 embedding+originalMetadata
  1320KB/1970ms, all-stripped +fileMetadata 344KB/~800ms). fileMetadata is the elephant;
  Option 1 alone (~37% faster) not worth shipping. Full findings + tables + enrichment
  explanation + alias nuance: media-api-work/phase-3-d3-searchafter-payload-perf-findings.md
- Enrichment dependency: stripping `thumbnail` crashes imageResponse.create (addSecureThumbUrl
  picks the path). Any projection must keep thumbnail/source/optimisedPng/metadata/usageRights.
- ~~⚠️ TEMP diagnostics + sourceExclude toggle still in ElasticSearch.searchAfter — REVERT before commit.~~ DONE (see line 166).

Next steps before commit:
- More edge case testing in --use-media-api mode (keyword sorts, dateAddedToCollection, reverse, null-zone)
- Scala unit/integration tests for searchAfter()
- Perf baseline: `npm --prefix kupua run test:perf -- --perceived-only --runs 3 --label "search-after-media-api"`
  (AGENTS directive: suggest after touching search-store.ts / scroll paths)
- Commit prep: two commits — Scala-only PR to main; TS-only stays on mk-next-next-next branch
  ⚠️ user instruction: "Absolutely no committing yet!"

Zombie-enrichment orientation (2026-06-12) — decided to fold into D3 (Option B: before commit):
- The OLD background enrichment (useEnrichment, ?ids= loop) was DELETED 10 May 2026 (changelog
  Session A). Replaced by direct-ES + widened SOURCE_INCLUDES + TS-replication (calculate-cost,
  validity-map, quota-store, graphic-image-blur). enrichment-strategy.md §F documents the pivot.
- VERIFIED current zombie state: `setEnrichment` (the only overlay writer) is called ONLY in tests
  → the enrichment-store overlay is NEVER populated in the app → `deriveImage(image, undefined)`
  always returns pure ES baseline → `isPotentiallyGraphic` (overlay-only) is always undefined
  (grid blur effectively off). `GridApiDataSource.getImageDetail`/`enrichByIds`, `service-discovery`,
  `grid-api-instance` (initGridApi, still booted in search.tsx), `dal/grid-api/argo.ts` adapter side —
  all dormant (only tests / a boot call that populates nothing).
- ALIVE & permanent: `dal/grid-api/types.ts` (Cost/SyndicationStatus/etc, widely imported),
  `deriveImage` (ES-baseline branch), `useEnrichedImage`, `enrichment-store` (read, never written),
  `lib/cost/*`, `graphic-image-blur.ts`.
- KEY INSIGHT ("consume the zombie"): `deriveImage`/`useEnrichedImage`/`enrichment-store`/
  `EnrichmentFields` is a well-formed, tested MERGE SEAM with nothing plugged in. media-api
  search-after hits are FULLY ENRICHED by imageResponse.create (server-authoritative cost/valid/
  persisted/actions/isPotentiallyGraphic) — exactly what the dead loop tried to fetch piecemeal.
  So: feed the overlay FROM the search-after response (media-api mode); TS-replication stays as the
  standalone floor (direct-ES mode) — dual-route is PERMANENT per the graceful-absence directive.
- RECOMMENDED design: revive the overlay merge (Option a) — search-store populates enrichment-store
  from search-after server fields; delete only the dead FETCH machinery (getImageDetail/enrichByIds/
  service-discovery/grid-api-instance/argo adapter). Keeps the merge seam + direct-ES path intact.
  (Alternative b: bypass overlay, fields ride on Image, delete whole overlay layer — more churn,
  loses the clean seam.) PENDING USER CONFIRMATION.
- STILL PENDING: empirical ES check — does `_source` projection excluding fileMetadata.xmp still let
  the isPotentiallyGraphic script read fileMetadata.xmp.pur:adultContentWarning? (one reload).
- Projection design (server-owns-semantics, Option-A-equivalent) recorded in payload-perf-findings.md.

DECISIONS (2026-06-12, user-confirmed):
- Q1 → (a) OVERLAY-REVIVE. StranglerAdapter populates enrichment-store from search-after server
  fields (cost/valid/persisted/actions/isPotentiallyGraphic); deriveImage stays route-agnostic
  (baseline ⊕ overlay, unchanged). No extra round-trips. Keeps the single merge point clean.
- Q3 → dual-route NOT permanent in principle but direct-ES removal is far off. Centralise route
  logic: StranglerAdapter = the one route-switch home; deriveImage = the one merge home. Design so
  direct-ES CAN die later; don't optimise for it now. Performance is king.
- Q4 → NOT actually verified yet. The ~2242ms reload used the Option-1 toggle (keeps fileMetadata,
  no script field) → tested nothing about script/projection interaction (just confirmed Option 1 slow).
  MUST verify as FIRST impl step: add isPotentiallyGraphic script field + lean projection (drops
  fileMetadata.xmp bulk) together, reload, check flag on a known-graphic image. Guard silent false.
- Cleanup backlog written: media-api-work/zombie-enrichment-cleanup-backlog.md.

READY TO IMPLEMENT (Option B: fold into D3 before commit). Impl order:
  1. (server) add isPotentiallyGraphic script field to searchAfter + lean projection (aliases ∪
     enrichment-floor, drop fileMetadata bulk); reload → VERIFY Q4 (flag correct under projection).
  2. (server) cost/valid/persisted/actions already ride in the enriched hit via imageResponse.create.
  3. (TS) StranglerAdapter.searchAfter populates enrichment-store from hits' server fields.
  4. (TS) consolidate mapApiImageToImage → argo.ts (or defer per cleanup doc).
  5. tests (Scala + TS) + contract test (mapped response == direct-ES derivation) + e2e + perf.

IMPLEMENTATION PROGRESS (2026-06-12):
- Field-selection DECISION (user): Option A via SCHEMA DERIVATION, not a hardcoded list. The _source
  doc IS the JSON of the Image case class, so the field names are read off the class. Projection =
  classOf[Image].getDeclaredFields names − {embedding, originalMetadata, fileMetadata} ++
  config.fieldAliasConfigs.elasticsearchPaths. Only literal = the 3-giant drop-set. Over-inclusion is
  harmless (ES ignores unknown _source include paths). Reasoning recorded in payload-perf-findings.md
  ("Server (Scala) — self-deriving from the schema") for showing engineers.
- DONE (Scala, ElasticSearch.searchAfter): added private vals imageSourceFields (reflection),
  searchAfterDropFields, searchAfterGraphicScriptField; replaced the temp sourceExclude+diagnostics with
  the real sourceInclude(projectionIncludes.head, .tail:_*) + storedFields("_source") + scriptfields(graphic). All
  [compile fix: elastic4s sourceInclude sig is (first: String, rest: String*) — splat the tail, not the whole Seq]. All
  TEMP diagnostics REMOVED. isPotentiallyGraphic now computed server-side + returned (resolveHit already
  surfaces it). cost/valid/persisted/actions ride in the enriched hit via imageResponse.create.
- PENDING verify (user reload, media-api mode): Home renders + fast (~800ms via executeAndLog) + no crash
  + alias display values present. NOTE: graphic blur won't show YET — kupua's deriveImage reads
  overlay?.isPotentiallyGraphic and the overlay isn't populated until the TS step.
- VERIFIED (2026-06-12 reload): Home 938ms (was ~3100ms fullfat), renders, no crash. Win banked —
  barely above direct-ES. Schema-derived projection works in production-shaped code.
  TEMP diagnostics + sourceExclude toggle REMOVED — the lean projection is now permanent and clean.
- NEXT (TS): StranglerAdapter.searchAfter populates enrichment-store from hits' server fields
  (cost/valid/persisted/actions/isPotentiallyGraphic) → deriveImage overlay branch lights up (Q1=a).
  Then consolidate mapApiImageToImage → argo.ts (or defer). Then tests + contract test + e2e + perf.

TS OVERLAY-REVIVE DONE (2026-06-12):
- enrichment-store.ts: added `upsertEnrichment(entries)` (merge by id) alongside `setEnrichment`
  (replace). search-after fills the buffer incrementally, so first page of a fresh search REPLACES
  the overlay; extends/seeks (carry a cursor) MERGE into it.
- grid-api-search-adapter.ts: added `extractEnrichment(entity)` (pulls cost/valid/invalidReasons/
  persisted/usageRights/actions/isPotentiallyGraphic/syndicationStatus/usages from each hit) and
  feeds the overlay in apiSearchAfter (setEnrichment on first page, upsertEnrichment on extend).
  No deriveImage change — it already merges baseline ⊕ overlay (Q1=a, route-agnostic).
- Unit tests: 898/898 green (vitest, separate from dev server — no port conflict).
- PENDING verify (user, media-api mode): reload + run `has:"…pur:adultContentWarning"` or scroll to a
  graphic image → graphic blur should NOW appear (overlay populated). Also server cost/valid/persisted
  now authoritative (e.g. overquota badge possible).
- ✅ E2E RUN (2026-06-12, default ES mode, dev server stopped, 1 worker): 240/240 passed (8.6m),
  zero failures. Touched-path specs (scrubber, two-tier, focus-preservation, drift-flash, selections)
  all green. No regression from the enrichment-store / extractEnrichment changes.
- ✅ TS unit tests written (2026-06-12): upsertEnrichment (6 tests), extractEnrichment (12 tests incl. all
  field paths + critical actions-at-entity-level path), contract test (extractEnrichment → deriveImage).
  921/921 vitest passing (46 files).
- ✅ Scala integration tests written (2026-06-12): 4 new tests in ElasticSearchTest.searchAfter describe:
  first-page total/cursor, cursor pagination (page 2 distinct from page 1), isPotentiallyGraphic=true
  (graphic-image-1 fixture with pur:adultContentWarning), isPotentiallyGraphic=false (test-image-8).
  Added graphic-image-1 to ElasticSearchTestBase.images; fixed has:fileMetadata count (1→2).
  33/33 Scala tests passing.
- PENDING: perf test (suggest only, don't auto-run): `npm --prefix kupua run test:perf -- --perceived-only --runs 3 --label "search-after-media-api"`

CODE REVIEW WORK (2026-06-12/13):
- Code review completed (phase-3-d3-searchafter-code-review.md). Findings addressed:
- F-1 (enrichment clobber): moved enrichment store write OUT of apiSearchAfter. Added
  optional `enrichment` field to SearchAfterResult; ElasticsearchDataSource.searchAfter
  returns enrichment=undefined (dual-mode safe). Callers write overlay at commit-to-view
  points only: setEnrichment on fresh-search, upsertEnrichment on extend/seek.
  Probe-style calls (null cursor + ids lookup) never write → clobber eliminated.
- F-2: -is:deleted and -usages@status:replaced appended to q in apiSearchAfter unless
  user opted in (mirrors es-adapter.ts default suppressions).
- F-3: hasRightsAcquired mapped through to POST body + SearchParamsBody.fromJson +
  syndicationRights.rights.acquired term filter on server.
- F-4: payType removed from apiSearchAfter (disabled in Kahuna, vestigial in kupua).
- F-5: CLOSED as moot. imageResponseWrites always writes usages/leases/collections
  unconditionally. include only gates fileMetadata expansion. Empty include is correct.
- Additional Scala tests added: null-zone round-trip, reverse, cursor-mismatch→422,
  dateAddedToCollection pathHierarchy both orders.
- sorts.scala fix: dateAddedToCollectionDescending/.Ascending both now carry
  .unmappedType("date"). ElasticSearch.scala handles -dateAddedToCollection as a
  special case (was falling through to parseSortBy with wrong field name).
- deviations.md §27 (auth.async(parse.json)) + §28 (Vite Origin spoof) added.
- Stale worklog warning (REVERT temp diagnostics) struck.
- Test results: 166/166 Scala ✅  924/924 TS unit ✅  240/240 Playwright ✅
- F-6 (PIT via prepareSearch migration filter): FIXED (2026-06-13). Not "document only"
  — it's a correctness bug during migrations. searchAfter now bypasses prepareSearch when
  a pitId is present: uses ElasticDsl.search(Nil).query(effectiveQuery).pit(...) so the
  migration dedup filter is NOT applied. Compiles clean. Severity upgraded S3→S2.
- Commits: NOT done. Waiting on user approval. Plan: Scala-only → main; TS stays on
  mk-next-next-next.

⚠️  Ordering note: gap derivation (phase-3-minimal-gap-derivation-findings.md §7 obs 5) says
D8 (PIT endpoints) should precede D3 (searchAfter). We built D3 first. This works because:
kupua still manages PITs directly via the ES adapter (openPit/closePit hit ES directly).
searchAfterImages() accepts pitId as a parameter and is PIT-agnostic. When D8 is implemented
(POST /images/pit + DELETE /images/pit/:pitId), kupua switches its PIT lifecycle calls to those
routes; D3 itself needs no changes.

2026-06-13 — Lean one-pass writer + single-pass TS loop (from perf backlog).
- ImageResponse.scala: new `createForBrowse(...)` method. Produces identical Argo
  EmbeddedEntity to `create()` but replaces 12-step chained .transform chain with
  one `imageResponseWrites` call + per-subobject patch + single `++` merge. Skips
  editorial `imageLinks` (browse clients don't read them); keeps `actions`. Same
  signing, same enrichment fields (cost/valid/persisted/syndicationStatus/aliases).
- MediaApi.scala: `searchAfterImages` now calls `imageResponse.createForBrowse`
  directly instead of `hitToImageEntity`. Also hoists
  `canUserDeleteCropsOrUsages` (request-constant) out of the per-hit loop (B-2b).
- grid-api-search-adapter.ts: replaced two-pass (for-loop + .map().filter().map())
  with single for-loop building enrichment map and hits array together. All existing
  `extractEnrichment` + `mapApiImageToImage` functions unchanged; tests all pass.
- Results: media-api compiles clean. 924/924 TS unit tests pass. Needs manual
  --use-media-api test + E2E run before commit.
Summary: B-1 (no gzip) closed — nginx + CloudFront already gzip everywhere.
Measured 4-point instrumentation (ES took/transport, per-hit create accumulator,
per-hit sign nanoTime, client fetch/parse/map marks). Key numbers (200 hits, TEST
tunnel): ES took ~225ms, ES transport ~540ms (tunnel — not fixable), envelope 137ms
(createMs=129ms, serialise=8ms), client parse=12ms, map=0ms. Within create:
signing=~29ms (22%), transform chain + validity/persistence/aliases/links=~100ms
(78%). Findings: (1) dev tunnel is the wall — no code fix; (2) envelope IS real on
prod (~57% of request time on fast link); (3) signing not the main culprit;
(4) Play JSON 12-transform chain is the mechanism cost — a lean one-pass Argo writer
would cut envelope to ~30-40ms; (5) Argo structure itself is not the problem;
(6) client side negligible. Backlog: lean response writer (M, ~100ms win), skip
presigning for kupua (S, ~29ms win). All instrumentation REVERTED. Compiles clean.
Nothing committed.

2026-06-13 — Added `--use-media-api` flag to perf harness (`e2e-perf/run-audit.mjs`).
Passes `KUPUA_PERF_BASE_URL=https://kupua.media.local.dev-gutools.co.uk` + `KUPUA_PERF_AUTH_FILE` (path to `.panda-auth.json`) to Playwright spawns. All three perf configs (`playwright.perf.config.ts`, `playwright.perceived-short.config.ts`, `playwright.perceived-long.config.ts`) override `baseURL` and inject `storageState` when those env vars are set. Removed browser-based `probeCluster()` (was failing); `enforceClusterGate()` is now synchronous (auth-file existence check only). Fixed `e2e/shared/helpers.ts`: the `/api/**` → 503 route intercept is now skipped when `KUPUA_PERF_AUTH_FILE` is set. Updated `e2e-perf/README.md` with full `--use-media-api` docs. Feature confirmed working end-to-end.

2026-06-13 — search-after `field.aliases` / partial-fileMetadata fix (DONE).
Problem: with `field.aliases` configured (paths into `fileMetadata`), `searchAfter`'s
slim `_source` projection returned a PARTIAL `fileMetadata` (alias leaves only). `Image`'s
reader requires `iptc`/`exif`/`exifSub`/`xmp` (non-nullable), so `readNullable[FileMetadata]`
failed on the partial object → every hit `JsError` → empty grid. The uncommitted workaround
reinstated the WHOLE `fileMetadata` blob whenever an alias touched it (>2× per-scroll latency).
- Evaluated the proposed `storedFields` approach and rejected it (couples to ES mapping
  `store:true`, xmp `JsValue` stringification risk, more plumbing). Chose strip-before-validate
  instead: keep the slim+alias-paths projection, strip the dropped fields from a COPY of the
  source before `validate[Image]`, keep the FULL source in the wrapper for
  `extractAliasFieldValues`.
- Verified blast radius via Explore subagent: only `fileMetadataEntity` (gated on
  `?include=fileMetadata`, which kupua never sends) reads the parsed `fileMetadata`. Aliases,
  validity, cost, persistence, syndication, `isPotentiallyGraphic` (ES script field) all safe.
- ElasticSearch.scala: removed `fieldsNeededForAliases`/`effectiveDropFields` workaround;
  projection back to `imageSourceFields.filterNot(searchAfterDropFields) ++ alias paths`. Added
  private `resolveSearchAfterHit` (folds over `searchAfterDropFields` stripping each from
  `source.as[JsObject]` before validate; wrapper keeps full source). searchAfter hit loop now
  calls it instead of shared `resolveHit`. Production `resolveHit`/`mapImageFrom` UNTOUCHED.
- Tests: ElasticSearchTest.scala — new `ESWithFieldAliases` instance (config with aliases into
  `fileMetadata.xmp.org:ProgrammeMaker` + `fileMetadata.iptc.Caption Writer/Editor`, both on the
  indexed test-image-8 fixture) + `describe("searchAfter with fileMetadata field aliases")`:
  (1) all images returned incl. test-image-8 (regression guard — fails if strip removed);
  (2) alias leaves present in wrapper source, non-aliased leaves (Caption/Abstract, exif) absent,
  parsed `instance.fileMetadata` empty. Compiles clean; NOT yet run (needs sbt + Docker ES).
- Docs: deviations.md §32 added; companion workplan marked DONE.
- NOT committed. NOT run (Scala tests need `sbt test` with Testcontainers ES).

2026-06-14 — perf deep-dive

Phase 3 D3 — perf deep-dive into WHY `--use-media-api` is ~3× slower than direct-ES in dev.
Wrote `media-api-work/phase-3-d3-searchafter-perf-deep-dive.md` (evidence-based, corrects the
prior perf-review's "it's all the tunnel" interpretation). Investigation only; nothing committed.


- ROOT CAUSE of the "same tunnel, why slower" paradox: media-api↔ES leg is UNCOMPRESSED while
  direct-ES (browser fetch) is GZIPPED. Measured wire sizes (200 hits, real cluster): media-api
  lean projection 373KB→70KB (5.3×), direct-ES 308KB→63KB (4.9×). elastic4s JavaClient never sets
  setCompressionEnabled(true). Same tunnel, ~5× the bytes.
- LIVE A/B (user applied 1-line ES-client gzip patch to running media-api, sbt hot-recompile,
  felt it, reverted via IDE undo): Home reload ~988ms → ~486ms. Matched byte-model prediction
  (985→547). common-lib/...ElasticSearchClient.scala `lazy val client` — patch = build RestClient
  directly with .setCompressionEnabled(true) + JavaClient.fromRestClient (JavaClient.apply has no hook).
- SCRIPT FIELD A/B (curl ×25, ES `took` only, no jitter): isPotentiallyGraphic Painless
  params['_source'] read = +30ms mean (33→63ms). NOT the ~130ms the prior cross-session compare
  inferred. Decomposed the 89→225ms cross-session gap: +30 script, +28 trackTotalHits(true) page-1,
  +2 sourceInclude, ~70 cluster-load noise. Corrected perf-review B-6 over-attribution.
- INFRA TOPOLOGY (read editorial-tools-platform CFN, outside repo): media-api + ES same primary
  VPC/region; ES behind INTERNAL ELB with plain HTTP listener (no compression layer). So prod
  media-api↔ES is ALSO uncompressed — but fast link → gzip latency win is DEV-ONLY; bandwidth/GC
  win is also-prod but minor. Grounds the prior doc's guessed "2-5ms".
- DOC verdicts: gzip latency=dev-only (100% sure); script field=also-prod ~30ms; lean envelope
  writer (F5)=THE prod lever (~55ms, dominant once transport→~ms on prod); trackTotalHits=product
  req, don't touch; route mixture contention=dev-only artefact.
- All instrumentation reverted. ES-client patch reverted by user. Nothing committed.

- GRAPHIC-BLUR DECISION (2026-06-15): Painless script removed from searchAfter entirely
  (was added in original D3 impl; measured at +30ms ES took also-prod — params['_source'] forces
  full stored-doc read per hit). Simpler + faster: full client-side via isImagePotentiallyGraphic()
  (already exists, tests passing), which also adds keyword scan the script never had. XMP field
  accessed via a silent fieldAlias (both display flags false → invisible in UI; auto-included in
  server projection via fieldAlias config). No cookies needed. Removed: searchAfterGraphicScriptField val,
  .scriptfields() + .storedFields() calls, hit.fields extraction in resolveSearchAfterHit (→
  JsObject.empty). Deleted two Scala tests that asserted on the script result. Added silent alias
  to kupua/src/lib/grid-config.ts. All 33 Scala tests pass. Full rationale + implementation
  steps in post-phase-3-d3-searchafter-blur-graphic-work.md.

  - N-1 RESOLVED (2026-06-15, Option 2a): reverted the Kahuna `search()` sort-match edit
  (`case Some("-dateAddedToCollection") => sorts.dateAddedToCollectionAscending` removed from
  `ElasticSearch.scala`; `dateAddedToCollectionAscending` removed from `sorts.scala`). The
  change had been introduced solely to make an integration test pass — the test used `ES.search()`
  instead of `searchAfter` to avoid a mapping issue, then required `search()` to handle the asc
  token. Rewrote `dateAddedToCollection both orders apply pathHierarchy filter` in
  `ElasticSearchTest.scala` to use `ES.searchAfter(...)` with a plain uploadTime/id sort clause
  (no mapping risk) so no production code needed touching. All 149 Scala tests pass (17 ParserTest
  / QueryBuilderTest failures are pre-existing BST timezone issue, unrelated to this work).
  Final review doc updated: N-1 marked DONE.

- N-4 RESOLVED (2026-06-15): addressed all five minor warts from the final review.
  (1) payType: `SearchParamsBody.fromJson` now sets `payType = None` — dead plumbing removed.
  (2) Typed response: added private `SearchAfterResponse` case class + `OWrites` in
  `MediaApi.scala`; response shape unchanged on the wire, compiler now checks all five fields.
  (3) Non-local return: left as-is — works correctly, risk theoretical, not worth refactor.
  (4) jsonToSort silent truncation: left as-is — correct behaviour for a path that cannot
  originate from buildSortClause; 4xx would be over-engineering a dead path.
  (5) deviations.md duplicate §28: second section's §28 "Alias fields" renumbered to §30
  (filling the existing gap). F-4 in verification table also updated to fully-resolved.
  Review doc: N-4 section updated with outcomes; F-4 row updated.

- SECTION-6 TESTS ADDED (2026-06-15): two new searchAfter integration tests in
  `ElasticSearchTest.scala`. (1) `reverse cursor continuation` — fetches the full forward
  corpus as ground truth, then walks two reverse pages with a cursor (cursor = returned
  per-hit `sortValues.head`, the frontier kupua actually uses for backward extend), asserting
  exact slices `fullIds.takeRight(3)` then `dropRight(3).takeRight(3)` — catches reverse
  off-by-one. (2) `seekToEnd + null-zone` — crash/regression guard: adds `seekToEnd = true`
  to the null-zone cursor path; both transforms touch the clause head but combine to a no-op
  (missing:"_first" lands on the stripped primary; tiebreakers are never null). PIT branch
  left untested by decision (dedicated media-api PIT endpoint comes later; PITs currently run
  via kupua's direct-ES path). Discovered + documented a benign Scala/TS ordering divergence
  in the seekToEnd/null-zone interaction → deviations.md §33 (no code change; fixing it is
  high-risk for zero current benefit, and it vanishes if direct-ES is ever retired). Section 6
  of the review doc updated to mark both gaps closed. Tests not yet run (need sbt + Docker ES).

- FULL TEST SURFACE GREEN (2026-06-15):
  Scala integration tests (TZ=UTC sbt "media-api/test"): 168/168 passed ✅
    (includes 39 ElasticSearchTest tests — both new Section 6 tests + all prior)
  TS unit tests (npm --prefix kupua test): 924/924 passed ✅
  Playwright e2e (npm --prefix kupua run test:e2e): 240/240 passed ✅
  All test surfaces green on the post-N-1/N-4/Section-6 tree.
  Review doc Section 6 note + Section 7 item 4 updated to reflect results.

CURRENT STATE: All review findings resolved. Work is commit-ready pending:
  - N-3: team sign-off on POST + auth.async(parse.json) pattern (no code change needed)
  - Explicit user approval to commit (per AGENTS directive — never commit without asking)

- N-1 RE-DECIDED → RESTORED (2026-06-15, Option 1): on reflection the original N-1 premise
  ("production code changed to satisfy a test") was only half right — the dateAddedToCollectionAscending
  case is ALSO a genuine corrective fix (without it, `-dateAddedToCollection` errors/no-ops on an
  unmapped field). Reverting only the SORT half while keeping QueryBuilder Change 2 (the FILTER
  half, which kupua needs) left an incoherent partial in Kahuna: a hand-typed
  ?orderBy=-dateAddedToCollection would filter to collection images but silently default-sort.
  Decision: RESTORE the ascending sort (sorts.scala dateAddedToCollectionAscending + ElasticSearch.scala
  `case Some("-dateAddedToCollection")`) so the token is coherent, and OWN it explicitly in the Scala
  PR doc as a small, intentional, manual-URL-only Kahuna improvement (UI never emits the negated token).
  Tests: kept the searchAfter filter test (Change 2, cursor path); ADDED a new
  `describe("dateAddedToCollection sort (Kahuna search path)")` with two ES.search() tests (both sort
  directions return full corpus without ES error → proves the unmappedType ascending case is wired).
  Updated: review-final N-1 section (premise corrected + resolution rewritten), Section 0/verdict,
  Section 7 checklist; changelog (sorts.scala + N-1 summary, test count 14→16); Scala PR doc (new
  "One small, intentional Kahuna change" section). PENDING: re-run TZ=UTC sbt "media-api/test"
  (searchAfter/TS/Playwright surfaces unaffected by the restore).
  ✅ VERIFIED: TZ=UTC sbt "media-api/testOnly lib.elasticsearch.ElasticSearchTest" → 41/41 passed
  (was 39; +2 for the new Kahuna search-path tests). N-1 restore + new tests green.
- FINDING (2026-06-15): User tried editing Kahuna URL to -dateAddedToCollection and saw no change.
  Root cause: Kahuna's getOrder() in kahuna/public/js/services/api/media-api.js transforms any
  unrecognised orderBy token to `-uploadTime` before the request reaches media-api. So
  `-dateAddedToCollection` never arrives at the Scala sort match from the Kahuna UI (even via URL
  edit). N-1 is therefore a direct-API-caller improvement only, not a Kahuna UI change. Docs (PR
  doc + review-final) updated to reflect this. Decision: keep N-1 (code is more correct; Kahuna
  JS is a separate concern not touched here).