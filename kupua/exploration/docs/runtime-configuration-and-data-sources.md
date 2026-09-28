# Kupua Runtime Configuration and Data Sources

> **U10-A characterization, post-U9 recheck, 27 September 2026.** Initial source
> pass: `b2acc260f`. Current source/test assertions rechecked at `2aad7ddba`, including
> U9-A `804ca1191` and U9-B `887814ccc`. AI, discovery, publication and their affected
> consumers/recommendations below describe the implemented path, not a pending plan
> ([U9-A as built][u9a-built], [U9-B as built][u9b-built]).
> This recheck ran no tests, browsers or live-system probes and made no production
> changes or Git mutations. Previously recorded U9 execution is identified as R4-R6,
> not a fresh run or universal certification. This report is not blanket implementation
> approval: only B1 is selected for U10-B by the [owning unit note][u10b-unit]; executor
> intake confirmation still applies.

## 1. Decision Summary

**The premise is supported, with important limits.** Current page responses already
feed `extractEnrichment` -> caller-owned publication -> `deriveImage` /
`useEnrichedImage`; standalone detail supplies a request-owned overlay. This is
not the deleted background enrichment loop. API AI now uses the same decoder and
replaces the shared map on accepted publication; direct AI and API absence clear
it. Bulk selection hydration still does not publish overlays ([API AI mapper][api-ai-map],
[AI publication][ai-store], [adapter:82][extract],
[search-store.ts:2473][fresh], [ImageDetail.tsx:244][standalone],
[adapter:182][mget]). No Section 0 halt is warranted.

**Decision criterion, clarified by the operator:** the architectural goal is no
browser-direct Elasticsearch access. Computation placement is a correctness,
latency, payload, request-count and maintenance decision, not "server is better
because the field exists." Current direct-mode support is a migration/fallback
constraint, not the end-state architecture. API mode now constructs only
`ApiDataSource`, including AI; direct mode remains explicitly supported
([datasource factory][source-factory], [U9-B unit note][plan-u9b]).

- **Request-neutral local work can be avoided:** derivation calculates cost twice
  (directly and inside validity), builds validity and calculates syndication status
  before complete overlays replace those outputs. Field-wise lazy fallback could
  preserve outputs while skipping that work; no measured frame-time benefit is
  claimed ([derive:92][derive], [validity-map.ts:67][validity]).
- **Configuration skew, not demonstrated slowness:** ticker values/sub-counts
  survive, but clauses/colours are discarded by both ordinary-count and AI mapping
  and would be erased again by polling merges. Three UI paths rejoin local definitions. Consuming returned
  metadata can fix that mismatch without another request; changing only the mapper
  would be incomplete ([api:124][api-count], [AI mapper][api-ai-map], [search:760][poll],
  [StatusBar:204][status-tickers], [FacetFilters:389][facet-tickers],
  [typeahead:327][typeahead-tickers]).
- **Do not expand scope to use every field:** image links/actions have no current
  editing consumer; canonical media delivery belongs to U7; selection enrichment
  remains excluded. Retaining more data without a consumer is not a performance win
  ([derive:92][derive], [image-urls:50][thumb], [plan:142][plan-sequence],
  [backlog:421][kup030]).
- **Do not erase required fallbacks:** direct cost already supports `overquota`
  from a startup quota snapshot. Partial overlays, direct images and selection
  cost summaries still need local derivation. Server lease/status semantics and
  client date-based semantics are not interchangeable ([cost:35][cost],
  [quota-store:28][quota], [Image.scala:46][server-status],
  [syndication:42][client-status]).
- **U9 closes the evidenced AI retention path:** accepted API AI publication now
  replaces enrichment exactly, including successful empty and quiet absent results;
  direct AI clears it. Tests exercise changed same-ID values, cancelled/superseded
  completion and ordinary return. Recorded browser checks also observed replacement.
  This is not an epoch/TTL guarantee for every cached selection
  ([AI publication][ai-store], [U9 transition tests][test-ai],
  [recorded browser checks][u9-browser], [backlog][kup030]).
- **Performance evidence now exists for the U9 count decision:** recorded three-run
  comparisons found no pool-count publication delay in the sampled TEST workflows.
  API AI took about 1.8-2.2 s versus direct 0.22-0.29 s; that bounded comparison is
  not an attributable derivation cost or universal capacity result. Keep M2a focused
  on the material API request cost; do not promise that B1 removes it ([timing record][u9-timing]).

**Selected U10-B direction (operator, 27 September):** implement only B1's field-wise
derivation skipping before U8, under the [unit note][u10b-unit]. Keep direct and
missing-field fallback outputs unchanged; make no new request or ownership change.
Ticker metadata (B2), warning-copy precedence (B3) and other section-8 proposals are
unselected follow-ups, not this unit or additional deployment prerequisites. They may
be assigned future unit IDs after separate decisions. Discovery readiness and AI
overlay replacement are completed U9 work, not remaining U10-B items.

## 2. Evidence Scope And Reading Rules

**C = code evidence; T = existing test-source assertions; R = previously recorded
execution.** T is not a new execution or proof that every consumer follows the
tested route. Neither U10-A nor this recheck executed an application/test/runtime probe. Their only execution
is read-only repository inspection and documentation validation. R is qualified
by the original record, not promoted to current universal correctness.

Source references below enumerate the inspected ownership boundaries. Test ledger
T1-T18 records the relevant assertions and limits, not whole-suite certification.

| Boundary | Inspected evidence / limit |
| --- | --- |
| Server entities | POST page/window/mget construction, singleton GET, canonical writer, lean projection, cost, validity, status, alias extraction; not a fresh comparison with deployed configuration. [ImageQueryController:65][query-pages], [MediaApi:177][get-image], [ImageResponse:58][server-image], [ES:732][lean] |
| Counts/discovery | Configured extra counts, POST counts, explicit GET AI response, root capability and shared readiness; new direct pool-count and UI tests. No new deployed capability query. [ES:55][ticker-config], [CollectionResponse:9][extra-count], [API AI mapper][api-ai-map], [MediaApi:112][root], [discovery tests][test-discovery] |
| Client transformation | Real current API/direct adapters, optional overlays, derivation and hook, quota/config/media helpers; dormant `GridApiDataSource.getImageDetail` is not the active standalone path. [adapter:45][map], [api:142][api-detail], [legacy adapter:50][legacy-detail] |
| Publication/consumers | Search, fill, both extensions, seek, centered focus and cursor restore; grid/table, resident/standalone detail, multi-image summary, selection cache, ticker UI/poll/typeahead and discovery initialization. See sections 5-6 for independent evidence. |
| History | Exact read-only `git show 38eb1d003` plus durable removal/revival records. Historical assumptions are not present-day source contracts. [changelog:5333][history-drop], [changelog:2879][history-revive], [changelog:2738][history-cleanup] |
| Existing runtime evidence | Earlier KUP-029/030/page records plus U9 gates, controlled browser checks and bounded timing comparison. Old retention evidence is historical; U9 replacement is separately evidenced. [backlog][kup030], [changelog:752][history-publication], [U9 as built][u9b-built], [browser/timing][u9-browser] |
| Explicitly not covered | Fresh TEST/runtime data, every permission/configuration combination, selection freshness redesign, measured derivation CPU/frame savings, MLT, U7 delivery, KUP-037 or production migration. U9's inherited GET limitations remain explicit, not certified away by fixture coverage ([U9 review limits][u9-review-limits]). |

### 2.1 Completeness Is Scoped

**Canonical image contract (I):** successful decoded POST search-after/window/mget
images use the same `ImageResponse.create` envelope. Scalar cost, validity/reasons,
persistence and status are written there; usages, leases and collections are
embedded from the indexed image. This is not a live read of each satellite service
or a snapshot guarantee across requests ([query:65][query-pages],
[query:215][query-mget], [ImageResponse:58][server-image],
[ImageResponse:327][server-writes]). Singleton GET uses the same builder but its
own visibility/read path ([MediaApi:804][get-image-source]).

**Explicit AI contract (AI):** `GET /images` with `useAISearch=true` and `aiQuery`
uses canonical entities with only `embedding` omitted by the response writer.
Unlike POST L below, this is not the lean source projection. Kupua reuses the page
decoder/extractor, keeps response order via descending ordinals, and maps server
`total` to `aiPoolTotal`, not the pageable store total ([server AI rendering][server-ai-render],
[projection][ai-projection], [API AI mapper][api-ai-map]). This does not fix inherited
GET restrictions: GRID-014/015/016 remain documented limitations; in particular,
do not infer all authorization/filter parity from canonical entity construction
([accepted review limits][u9-review-limits]).

**Lean contract (L):** POST reads omit `embedding`, `originalMetadata` and bulk
`fileMetadata` from the source projection, re-add configured alias leaves, and
strip dropped fields before decoding the image. Consequently a serialized empty
`originalMetadata` or null embedding is not evidence that the original record had
none. `fileMetadata` is link-only without `include`; the active client does not
request expansion ([ES:732][lean], [Image.scala:80][image-reader],
[ImageResponse:390][server-filemetadata], [adapter:166][singleton-api]).

**Execution completeness is not field completeness:** POST readers reject timeout
or failed-shard execution; malformed individual hits can still be omitted by
`resolveLeanHit`. Mget also omits hidden/unreadable images, and any client chunk
failure rejects the whole lookup rather than reporting its outstanding IDs missing
([ES:1079][complete], [ES:1250][server-mget], [adapter:182][mget]). The mapper uses
casts, not a runtime schema validator; a successful malformed payload is not
certified by TypeScript ([adapter:45][map], [adapter:82][extract]).

**Missing is not false or empty:** overlay `false`, `{}` and `[]` are meaningful;
`undefined` means that field was not supplied and `??` selects the fallback.
Separately, normalization currently defaults absent embedded usages/collections
to `[]` and leases to `{leases: []}`. That is mapper behavior, not proof that an
incomplete/malformed entity authoritatively asserts no relationships
([derive:92][derive], [adapter:45][map], [tests:129][test-extract]).

## 3. Configuration Layers And History

### 3.1 Current Layers

| Layer | Current owner | Consequence / planned M2a contrast |
| --- | --- | --- |
| UI/CQL vocabulary | Compiled `gridConfig` object: organisation, warnings, feature vocabulary, agency ingredients, ticker definitions and alias catalogue. [grid-config:35][config] | Not fetched from the root. API execution can use different server configuration; M2a must compare used controls, not infer configuration from sampled images. |
| Mode/proxies | Shell exports `VITE_USE_MEDIA_API`; Vite loads development env and defines `/api`, `/es`, `/s3`, `/imgproxy`. [start:639][start-mode], [vite:110][vite] | Current proxy target is local media-api. U8/M2a is the planned deployed-TEST API topology, retaining existing media delivery until U7 ([plan:142][plan-sequence]). |
| Scala configuration | Development loader reads local `.grid` files plus optional extra configuration; deployed paths use a separate file list. [GridConfigLoader:13][config-loader] | This is server configuration loading, not a browser configuration API. No private configuration files were read for this characterization. |
| Root discovery | API-mode startup and the route effect share one root promise; `apiAiSearchAvailable` waits for it and consumes `ai-search`. `clientConfig` stays undefined. [main][main-init], [route:70][init-route], [discovery][discovery], [capability consumer][api-capability] | Capability is gated by server AI configuration and dense-vector mappings. Failure is intentional session-scoped absence, not a retry race or Bedrock rescue; no alias/config catalogue follows ([root:112][root], [discovery tests][test-discovery]). |
| Quota snapshot | Main calls `fetchQuotas`; plain module map, no subscription, refresh interval or expiry. [main:17][main-init], [quota:28][quota] | Required by current local cost/validity and direct filters. Optional API failure leaves no exceeded suppliers; that is a fallback assumption, not authoritative proof of remaining quota. |

### 3.2 What 38eb1d003 Removed, And What Replaced It

The inspected commit deleted `useEnrichment` and its tests, removed its route mount,
and widened `SOURCE_INCLUDES`; it changed derivation documentation, not the merge
algorithm. The removed mechanism was a debounced, visible-first `?ids=` background
loop with sequential offscreen batches and cancellation, not the current response
overlay pipeline ([removal record:5333][history-drop]). The commit also adjusted
E2E comments/docs; it did not delete the enrichment store or `deriveImage`.

That widening initially listed names such as `cost`, `valid`, `persisted` and
`actions`. It did not manufacture those fields in ES. The current allowlist instead
supplies rights, leases, usages and other baseline inputs; its old explanatory
comment still overstates server-computed baseline data ([es-config:56][source-fields]).
Local cost/validity, quota snapshot and date-based syndication derivation supply
the current direct path ([cost:35][cost], [validity:67][validity],
[syndication:42][client-status]).

D3 later revived overlays from already-returned canonical page entities. The
adapter returns a map and does not publish it; commit-to-view owners set/upsert it.
The later removal of unused `enrichByIds` did not remove that replacement
([revival record:2879][history-revive], [cleanup record:2738][history-cleanup],
[adapter:244][decode], [probe test:583][test-probe]). U6a added the independent
singleton overlay owner ([ImageDetail:244][standalone], [singleton tests:264][test-detail]).

Several historical comments are therefore not contracts: "overquota is API-only,"
"99% authoritative," "mirror-search supplies lease summaries," and "root discovery
is consumed by intent-driven detail" do not describe the current call paths. Root
discovery now has a real AI-capability consumer, not the old detail consumer. The
implementation evidence in rows 02, 13, 29-33 and T5/T14 controls the characterization,
not those comments ([derive:8][derive-comments], [metadata:196][metadata],
[discovery:37][discovery], [legacy adapter:50][legacy-detail]).

## 4. Ownership Matrix

This is one matrix split into field groups for readability. **A** complete server
authority within the stated successful response/workflow; **B** workflow-specific
or partial server authority; **C** required direct/absence fallback; **D** available
but discarded/rejoined locally; **E** unavailable without a server contract.
Multiple letters identify distinct aspects, not an averaged confidence score.
In particular, A for an indexed list does not mean real-time satellite completeness.

Owner abbreviations are defined with exact code in section 5: **P** committed page
and accepted AI-result map, **S** singleton state, **H** selection metadata cache, **Q** count/poll state,
**R** root singleton. Consumers: **G** grid, **T** table, **D** detail/metadata,
**M** multi-image detail, **F** filters/typeahead. T1-T18 are the test ledger below.
An API read failure follows section 5's workflow behavior, not an implicit switch
to direct ES. "Fallback" below concerns the current image/field, unless stated otherwise.

### 4.1 Image Policy And Relationships

| # / Field / Class | Server wire source and completeness | Extraction; publication/lifetime | Consumers | Direct-mode fallback; API absence | Existing tests and exact limit | Duplicate work in successful API mode |
| --- | --- | --- | --- | --- | --- | --- |
| 01 Cost: free/conditional/pay **B,C** | I: `data.cost`; server merges root and user-edited rights specifically for cost, then applies server costing config. [ImageResponse:207][server-cost] | `extractEnrichment.cost`; P or S; H does not publish it. [extract:82][extract], [mget:182][mget] | G/T badges, D warnings, M cost buckets. [G:217][grid], [T:349][badges], [D:196][metadata], [M:311][multi-cost] | `calculateCost(image.usageRights, vendored config)` for absent overlay cost; never infer free from a failed API read. [derive:92][derive], [cost:35][cost] | T1/T2 cover precedence and partial fallback; not all permissions/configs or rendered workflows. | Cost executes directly and again in validity before server cost wins. Safe skip candidate only per field/group; section 7. |
| 02 Overquota **B,C** | I/AI: cost may be overquota using server quota/config; validity quota is separately checked. [CostCalculator:12][server-cost-policy], [ImageExtras:29][server-validity] | Same cost overlay, not a separate Boolean. P/S freshness is request freshness, not a lease on future quota truth. [extract][extract] | Same G/T/D/M; M may use a shared cached overlay on a hydrated image. [multi-cost][multi-cost] | Direct mode CAN calculate overquota from `quotaMap`; unavailable quota falls back to no exceeded supplier. Not full live parity. [cost:35][cost], [quota:24][quota-read] | T2/T7; T10 now proves old same-ID overquota is replaced by current AI cost. No live quota-change timing proof. | Local quota lookups still run beneath complete server cost/validity. Do not remove startup quota read: fallback consumers remain. |
| 03 `valid` **B,C** | I: Boolean from checks plus actual write permission/lease overrides; independent of whether reasons are nonempty. [ImageResponse:58][server-image], [ImageExtras:29][server-validity] | P/S optional Boolean; `false` is preserved by `??`. [derive:92][derive] | D validity banner; derivation also runs in G/T/M even where the Boolean is not displayed. [metadata:196][metadata], [grid][grid], [table][table], [multi-cost][multi-cost] | Client validity assumes write permission and date-checks leases. Do not replace it with `true` merely because API data is absent. [validity:67][validity] | T1/T2 assert false wins; T7 is local policy, not permission parity. | Full validity map and reduction still run. A lazy map is needed if either `valid` OR `invalidReasons` is absent. |
| 04 `invalidReasons` membership **B,C** | I: all failing checks, including overridden ones, not just blockers. [ImageExtras:84][server-reasons] | P/S object; server `{}` replaces local reasons. [derive:92][derive] | D warning list; not a substitute for `!valid`. [metadata:196][metadata] | Local map when missing; API failure is not an authoritative empty map. [validity:149][validity-reasons] | T1/T2 cover overlay replacement and fallback; T7 covers local override semantics only. | Map construction, reason-object construction and validity reduction happen even with both overlay fields supplied. |
| 05 Reason descriptions **D,C** | Server custom descriptions override server defaults. [ImageExtras:84][server-reasons] | Strings retained unchanged by extractor. [extract][extract] | D then uses `VALIDITY_DESCRIPTIONS[key]` before server text, replacing custom text for known keys. [ImageMetadata:289][reason-copy] | Local descriptions required for local derivation; an unknown server key displays its supplied description. [validity:44][validity-copy], [reason-copy][reason-copy] | T1 proves string extraction, not banner text. No inspected mounted banner test establishes custom-copy precedence. | Local lookup is cheap; issue is message correctness, not a demonstrated performance bottleneck. |
| 06 `usageRights` root **B** | I writes `image.usageRights`, with custom usage restrictions; do not describe this as a guaranteed request-time merge of all edit overrides. Cost performs its own merge. [ImageResponse:327][server-writes], [ImageResponse:293][server-restrictions], [ImageResponse:207][server-cost] | Same `data.usageRights` supplies normalized image AND overlay; no reconstruction in mapper. [map][map], [extract][extract] | D effective rights; G/T borders/badges; M reconciliation uses cached raw images while cost uses derive. [metadata][metadata], [table][table], [multi-rights][multi-rights] | Direct uses source rights. Absent overlay retains image rights, not `{}`. [derive][derive] | T1/T2; R1 ordinary same-entity equality is bounded evidence, not global rights correctness. | Overlay assignment duplicates a reference, not a rights merge. Do not invent a rights reconciliation rewrite. |
| 07 Edited/original rights **A within I/L** | I carries `userMetadata` edits and `originalUsageRights`; user override data can be absent. [server-writes][server-writes], [ImageResponse:233][wrap-edits] | Edits unwrapped separately; no automatic overlay onto root rights. P/S/H image lifetime. [map:45][map] | D/G/T/M consume selected normalized fields; rights label specifically uses row 06, not an automatic edit merge. [metadata:196][metadata], [multi-rights][multi-rights] | Direct projection is narrower; absent override means not supplied, not a command to clear root rights. [source-fields][source-fields] | T1 normalization preserves unset overrides; not proof every historic indexed root has edits applied. | No client merge to delete; `mergeReconciledFields` in old adapter is also identity-only. [argo:82][argo-identity] |
| 08 `noRights` presentation flag **C,B** | No separate canonical wire flag in I/AI; client checks category. [server-writes][server-writes], [derive:92][derive] | Always computed from baseline image, not overlay rights. P/S/H-derived. | G/T cost badge and M bucket. [badges][badges], [multi-cost][multi-cost] | Required cheap derivation; ordinary and AI API root/overlay now share each response's rights source. General selection-cache freshness is still separate. [api-ai-map][api-ai-map] | T2 intentionally asserts baseline-only behavior; KUP-029 ordinary premise is refuted (R1), KUP-030's AI retention is closed by T10/R4. | One category check. Not a justified independent repair or optimization. [kup029][kup029], [kup030][kup030] |
| 09 `persisted.value` and reasons **B** | I: `imagePersistenceReasons`, Boolean plus reasons; not deletability. [ImageResponse:49][persistence], [ImageResponse:226][persisted-wire] | Extracted P/S. H scalar survives raw spread but `deriveImage` assigns overlay-only `persisted`, so no own-overlay hydration guarantee. [map][map], [derive:92][derive] | G/T archive icon; no corresponding M persisted summary shown by `CostSummarySection`. [grid][grid], [badges][badges], [multi-cost][multi-cost] | No local derivation in this pipeline. Missing overlay means unavailable icon/data, not persisted=false. | T1/T2/T5 preserve true/reasons; no full configuration/deletion matrix or all-consumer display test. | No local persistence-policy calculation to remove. |
| 10 `syndicationStatus` **B,C** | I: `Image.syndicationStatus`: rights, usage, lease presence; both allow+deny resolves to review. [Image.scala:46][server-status] | P/S overlay wins; H lacks own overlay. [extract][extract], [derive][derive] | G/T badge. D separately derives rights/lease warnings, not a promise to duplicate the badge state. [grid][grid], [badges][badges], [metadata:196][metadata] | Client uses active dates and gives active deny priority; not identical to server existence checks. [client-status][client-status] | T2 overlay wins; local syndication tests are not cross-server equivalence proof. Small discriminator: both lease types plus expired/future dates. | Local status and lease scans run before server status wins. Skip only the unused local status, not D's separate lease warnings. |
| 11 Embedded usages **A indexed; B consumers** | I always serializes indexed usages as doubly embedded entities; no satellite refresh guarantee. [ImageResponse:376][embedded] | Mapper unwraps into `image.usages`; extractor separately unwraps into overlay.usages. P/S/H raw, P/S overlay. [map][map], [extract][extract] | G/T prefer `enrichedUsages`; detail `UsagesSection` receives raw `displayImage.usages`; sidebar does likewise. [grid:217][grid], [badges][badges], [detail:869][detail-usages], [route:402][sidebar-usages] | Direct indexed usages; missing overlay retains raw list. Missing wire relationship currently normalizes to [], not proven authoritative absence. | T1 full relationship fixture; no proof of real-time usage completeness or every displayed platform. | Doubly unwrapped twice per entity; icon platform/recent-date scans are presentation work not supplied as canonical flags. Not a new network request. |
| 12 Embedded leases **A indexed; C display** | I contains lease records including stored `active`; not an always-current wall-clock claim. [embedded][embedded], [ImageExtras:29][server-validity] | Raw normalized `image.leases`; no lease overlay extraction. P/S/H. [map:45][map] | D lease cards/counts/warnings; M active/pending aggregation. [metadata:196][metadata], [multi-rights:401][multi-rights] | Both modes use `isLeaseActive` dates for these displays. Missing raw list normalizes empty, subject to I/L caveat. [client-status:42][client-status] | T1 preserves full records; T2's fabricated summary is not a producer test. No certified time-driven rerender. | Date-based display scans are deliberate client semantics, not waste just because stored `active` exists. Keep. |
| 13 Lease summary/counts/allow flag **C** | No `leasesSummary` scalar emitted by I; lease records allow client derivation. Old background extractor computed one, current extractor does not. [server-writes][server-writes], [extract][extract], [history-drop][history-drop] | Optional type survives, but P/S never supply it from current mapper. [enrichment:24][overlay-type] | D has raw-list fallback; G/T cost leased styling and M cost gradient read only the summary. M's separate lease rows use raw records. [metadata][metadata], [badges:349][badges], [multi-cost:311][multi-cost] | Do not treat absent summary as authoritative "no lease". No direct summary producer. | T2 injects a summary and tests pass-through only. T1 exact extractor assertion contains no summary. Consumer gap needs a mounted raw-lease fixture. | Current API path is not calculating this summary twice. Adding one is a behavior change, not redundant-work removal; no new server scalar is inherently necessary. |
| 14 Embedded collections: membership/path/date **A indexed** | I embeds path, pathId, description, colour, actionData; indexed membership, not collection-tree transport. [ImageResponse:376][embedded], [CollectionResponse:450][collection-wire] | Collection `.data` normalized into image; P/S/H. Wrapper URI/remove action lost. [map:45][map] | G badges, registry-driven T/D/M collection fields and dates. [G:340][grid-collections], [registry:769][registry-collections] | Direct projection supplies path/pathId/date, not a complete tree. Failed image request does not mean no collections. [source-fields][source-fields] | T1 preserves multiple collections and action dates; no KUP-037 scope certification. | Path labels are presentation; no parallel collection membership fetch added by this mapper. |
| 15 Embedded collection colour **D,C** | I `collections[].data.cssColour` from server collection helper. [collection-wire][collection-wire] | Retained by `.data` mapping. P/S/H. | G instead joins `collectionColours[pathId]` from loaded tree, then `#555`. [G:340][grid-collections], [G:651][grid-colours] | Current tree/default fallback also serves direct mode. Wire omission is not "no colour configured." | T1 preserves colour, not rendered colour precedence or tree inheritance parity. | Rejoin exists, but tree serves other workflows; preferring entity colour would not by itself remove the tree request. Not a free transport win. |
| 16 Per-image actions **B; D unused** | I envelope `actions`, permission/tier filtered; absence of delete is not derived from persisted. Singleton also returns actions. [ImageResponse:165][server-actions], [MediaApi:177][get-image] | Extractor reads envelope, P/S retain; H drops envelope actions. [extract][extract], [mget][mget] | `deriveImage` passes through; inspected G/T/D/M renderers do not execute them. [derive][derive], [grid][grid], [badges][badges], [metadata][metadata], [multi-cost][multi-cost] | No manufactured actions when absent; authorization remains server-side. | T1 asserts correct envelope location; T5 singleton retains actions. No editing workflow covered or authorized. | No client action-policy computation to remove. Extra retention alone has no present observable benefit. |
| 17 Per-image links and nested resource controls **D** | I envelope links include validity/write-gated relations, optimized media, usages/leases/file metadata; nested collections/edits have controls too. [ImageResponse:147][server-links], [embedded][embedded] | Page/singleton decoders pass only data and actions into retained shapes; `.data` unwrapping discards nested control envelopes. [map][map], [singleton-api][singleton-api], [decode][decode] | No current relation-driven consumer in G/T/D/M; active APIs use fixed proxy paths. [api-detail][api-detail], [thumb][thumb] | Direct mode lacks server controls. Missing/dropped link cannot establish denied permission. | T5 supplies a `crops` link but does NOT assert retention. Add nonmatching envelope/data link controls only if a consumer is selected. | No redundant computation identified; retaining unused links increases retained data without eliminating requests. Defer. |

### 4.2 Media, Aliases And Configuration

| # / Field / Class | Server wire source and completeness | Extraction; publication/lifetime | Consumers | Direct-mode fallback; API absence | Existing tests and exact limit | Duplicate work in successful API mode |
| --- | --- | --- | --- | --- | --- | --- |
| 18 Thumbnail URL **D,C** | I optional thumbnail with secure URL; builder chooses configured CloudFront or signed URL. [ImageResponse:58][server-image] | Asset retained in normalized image; P/S/H. [map][map] | G/T/detail media helpers use `getThumbnailUrl`, not returned URL. [image-urls:50][thumb] | ID-based local S3 proxy when enabled; otherwise undefined. Not a server-data absence verdict. | T1 preserves assets; T5 media failure tests use mocked URLs and cannot prove canonical delivery. | Server URL is already produced; client builds proxy path. Switching is U7, not an automatic speed improvement. |
| 19 Full/source URL **D,C** | I `source.secureUrl` is signed source media; not a promise that full original is suitable for screen display. [ImageResponse:58][server-image] | Retained P/S/H but unused by current full-image builder. [map][map], [full:215][full] | Detail/fullscreen use transformed image URLs; see current builder options. [full][full] | Imgproxy size/DPR/orientation/format policy, or undefined without proxy/bucket. | T1 proves retention only; no payload/latency parity measurement for original versus transformed asset. | Local URL construction is cheap and avoids blindly requesting originals. Keep until U7's delivery decision. |
| 20 Optimized/crop assets and media links **B,D** | I optimized PNG is optional; exports are serialized; optimized/download relations carry distinct transforms/gates. [server-image][server-image], [server-links][server-links], [server-writes][server-writes] | Data assets retained; envelope optimized/download links discarded. P/S/H. | Current full/zoom builders independently choose transformations. [full][full] | Existing local delivery remains baseline. Missing optimized media does not imply missing original. | T1 preserves optimized/export data, not server-link execution or image quality. | Do not replace transformation work with a raw URL on "server authority" grounds. U7 owns this comparison. |
| 21 Alias values **A per returned value; B keyset** | `data.aliases` projects configured paths present on that image; absent normal fields omitted, match-via-existence aliases explicitly false if absent. [ImageResponse:425][aliases-server] | Spread retains JSON values, including false/0/empty/null; registry prefers non-null alias then direct raw path. P/S/H. [map][map], [registry:969][aliases-client] | Known registry fields in T/D/M, cursor code and content-warning heuristic. [aliases-client][aliases-client], [graphic:46][graphic] | Direct raw paths where projected. Unknown/missing alias key is not proof the server lacks that configuration. | T1 JSON preservation; T9 server presence/existence tests and client raw-path tests; not full deployment catalogue coverage. | Value formatting and fallback path lookup, not re-extraction of an available scalar. Retain. |
| 22 Alias catalogue/labels/options **E; C current config** | No catalogue in I or root. Per-image values omit labels, ES paths, hints, display policy and absent ordinary aliases. [aliases-server][aliases-server], [root][root] | Registry/typeahead built from compile-time `fieldAliases`. [config:163][config-aliases], [aliases-client][aliases-client] | T/D/M columns, CQL hints/search/sort vocabulary. | Current config required in both modes. Cannot infer catalogue or defaults from an empty page or image sample. | T9 exercises a chosen config, not discovery. Small check: configured field absent from every fixture still needs its label/path. | Not redundant computation: missing contract. Any runtime config resource is a separate design decision. |
| 23 Core metadata and edited metadata **A within I/L** | I serializes root metadata and separately wrapped edits; lean reads omit original metadata, not current metadata. [server-writes][server-writes], [lean][lean] | Mapper unwraps edited labels/metadata/photoshoot/archived, retains root metadata; P/S/H. [map:45][map] | Registry-driven G/T/D/M. Root display does not reconstruct original+edits. [grid][grid], [registry-collections][registry-collections] | Direct allowlist is narrower; fields outside it are unavailable, not empty by authority. [source-fields][source-fields] | T1 empty edits, root fields and no mutation; does not certify every deployment-specific metadata field. | No duplicate metadata merge; old `mergeReconciledFields` is identity. [argo-identity][argo-identity] |
| 24 Expanded file metadata **B** | Singleton can include file metadata on explicit include; POST L strips bulk metadata before canonical writing, retaining alias leaves separately. This is workflow omission, not universal lack of a server contract. [server-filemetadata][server-filemetadata], [lean][lean] | Mapper handles expanded/link-only/absent distinctly, but current image reads send no include. P/S/H image property can be undefined. [map][map], [singleton-api][singleton-api] | Existing alias fields cover selected additional metadata, not the full original file payload. [aliases-client][aliases-client] | Direct only selected paths. No automatic follow-up fetch on undefined. | T1 covers expanded, empty-expanded, link-only and absent mapper shapes, not actual expanded POST completeness. | None to remove. Do not add per-image metadata requests to make a matrix cell look complete. |
| 25 Content-warning classification **C,B inputs** | POST lean wrapper does not supply a classification Boolean; configured alias may provide one input. [lean][lean], [graphic:46][graphic] | Client reads raw XMP or alias plus metadata and preference; no current overlay field. [graphic][graphic], [overlay-type][overlay-type] | G blur; shares client helper semantics. [grid:217][grid] | Required client heuristic in both modes; missing alias does not establish no configuration. | T9 alias fixture tests concern presence semantics, not live config completeness. | Existing client computation has no equivalent returned POST Boolean to replace it. Keep; not an enrichment rewrite. |
| 26 Presentation/config vocabulary **E,C** | No runtime `clientConfig` at current root. [root][root] | Local organisation/categories/agency ingredients/warning text/download/reaper/image-type flags. [config][config] | F hints and predicates; D warning copy; G/T styling. [typeahead-tickers][typeahead-tickers], [metadata:196][metadata] | Keep local settings until an explicit config source exists. API absence is not evidence that each flag is false. | Current fixture/config tests do not certify deployed configuration equality. M2a remains the bounded comparison. | Client presentation and direct-query policy are real work, not duplicate server output merely because related filters exist. |

### 4.3 Counts, Discovery And AI

| # / Field / Class | Server wire source and completeness | Extraction; publication/lifetime | Consumers | Direct-mode fallback; API absence | Existing tests and exact limit | Duplicate work in successful API mode |
| --- | --- | --- | --- | --- | --- | --- |
| 27 Ticker value **B; A counted scope** | POST count: `tickerCounts[name].value`, exact execution admitted or refused; server configuration controls available aggregations. [ES:55][ticker-config], [ES:1130][server-count] | Value retained; Q initial count plus frozen-baseline/arrival composition. [api-count][api-count], [poll][poll] | StatusBar/F only for locally recognized definitions. [status-tickers][status-tickers], [facet-tickers][facet-tickers] | Direct computes equivalent-shaped counts with local definitions. Missing count result stays null, not zero. [es-count][es-count], [fresh-count][fresh-count] | T8/T11 count/refusal/poll assertions; not live server/client config parity or a frozen multi-request snapshot. | No duplicate local counting in API mode; local display join remains. Initial page+count are separate purposes, not proved redundant. |
| 28 Ticker names/enabled set/order **D,B** | Returned map keys identify configured tickers; no explicit UI ordering/catalogue contract. [ticker-config][ticker-config], [extra-count][extra-count] | Map keys retained, but StatusBar iterates local `tickerDefinitions`, omitting unrecognized returned keys. Q/local module. [status-tickers][status-tickers] | StatusBar/F. | Direct catalogue remains local. An unavailable map is not the same as an explicitly empty map. | T8 uses familiar names; add server-only name, no local-name return, {} and unavailable controls. | Local rejoin can hide available data. Preserve stable presentation ordering without claiming JSON object order is a UI contract. |
| 29 Ticker clause **D** | Server `searchClause` accompanies each value; current constructors use `is:` clauses, generic type is a string. [ticker-config][ticker-config], [extra-count][extra-count] | DAL type omits it; ordinary count AND AI mapper strip it; poll reconstruction would strip it again. [ticker-type][ticker-type], [api-count][api-count], [api-ai-map][api-ai-map], [poll][poll] | StatusBar applies local clause; F joins local `is:` mappings. [status-tickers][status-tickers], [typeahead-tickers][typeahead-tickers] | Direct needs local predicate. Missing server clause must not silently become a made-up `is:<name>` filter. | T8 and T15 explicitly expect omission; T11 math and T12 remounts do not establish server-defined clauses. | Avoidable join/config skew, not duplicate search execution. Full-clause semantics need a bounded support rule (section 8). |
| 30 Ticker colour **D** | `backgroundColour` accompanies value. [ticker-server][ticker-server] | Same losses as clause in count, AI mapping and poll; local colour rejoined in badge and facets. [api-count][api-count], [api-ai-map][api-ai-map], [poll][poll], [facet-tickers][facet-tickers] | StatusBar/F. | Direct local colour; absent API metadata needs explicit fallback, not fabricated server authority. | T8/T15 wire fixtures have colours but expected results exclude them. New StatusBar tests cover pool wording/denominator, not custom server colour. | Little CPU benefit; correction would prevent local presentation disagreement with returned metadata. |
| 31 Ticker sub-counts **A bounded buckets; B composition** | Optional map: top nine suppliers plus `other`; not all supplier identities or a configuration catalogue. [ES:55][ticker-config], [ES:444][ticker-server] | Retained; Q merges baseline plus arrival maps; tooltip sorts positive entries. [api-count][api-count], [poll][poll], [StatusBar:36][ticker-tooltip] | StatusBar tooltip. | Direct terms aggregation supplies matching shape. Absent sub-counts do not mean no matching images. | T8/T11 assert maps/merge ownership; no proof top-N identity changes yield a complete recomputed supplier distribution. | Client sorting and merging express presentation/lifetime, not replacement of a server-provided full distribution. Keep bounded semantics. |
| 32 Root HATEOAS links **B; D unused relations** | Root `links[]` includes gated `ai-search`; no clientConfig/catalogue. [root][root] | R retains one shared `Promise<boolean>` and rel->href map; main and route calls coalesce. API paths remain proxy-relative constants; capability presence is consumed, its href is not expanded for the AI request. [discovery][discovery], [api-capability][api-capability], [api-ai-map][api-ai-map] | Main -> mode-aware AI availability -> AI input. Other root relation accessors still do not drive generic UI/routing. [main-init][main-init], [ai-availability][ai-availability] | False init means failed root; true plus missing link means successful omission. Both hide AI; no retry until reload, no Bedrock fallback in API mode. | T14 directly covers delayed/coalesced readiness, success without relation, failed/unreadable root and session no-retry. It is not a runtime root schema validator. | Root now has a necessary capability consumer. Duplicate callers share one request; do not remove it as unused startup work. |
| 33 Root conditional capabilities **B; D others unused** | Existing upload/archive/capi gates plus AI enabled AND dense-vector-mapping gate. Relations are not universal permission grants. [root][root] | AI gate awaits R and checks relation presence; existing other conditional links remain stored. [api-capability][api-capability] | Mode-aware AI input; no new generic permission UI. | Failure and successful omission are distinguishable at init level but intentionally yield the same unavailable UI. Missingness is not an authorization decision. | T14 root/consumer tests, T18 server enabled/dense combinations and T17 cold-start isolation. Existing other permission combinations are not re-certified. | One root read; no browser Bedrock health probe in API mode. Authorization still belongs to server operations, including the recorded inherited limitations. |
| 34 Quota snapshot/control **C,B** | Optional `/api/usage/quotas` store of exceeded suppliers. [quota:28][quota] | Main fetches once; module map reads synchronously, no reactive invalidation; separate from P. [main-init][main-init], [quota][quota] | Cost/validity fallback; direct under-quota query support remains a distinct use. [cost][cost], [validity][validity], [cql:443][quota-query] | Failure keeps current map (initially empty); false means fallback interpretation, not verified quota headroom. | T7 tests map/fetch logic, not alignment with image-response quotas or rerender after delayed startup. | Full-overlay reads of map can be skipped with derivation; removing the request is not justified for mixed fallback consumers. |
| 35 AI fixed-set membership/rank/total **A response order; C direct ranking** | Explicit `aiQuery` GET ranks AI text separately from hard `q` filters; canonical response omits embeddings, not other fields. Response order is the available rank contract. [server-ai-render][server-ai-render], [ai-projection][ai-projection], [u9a-built][u9a-built] | API mapper assigns every decoded hit `__aiScore = n-index` and synthetic tuples; store rejects nonfinite ordinals, preserves latest supported same-query sort, total=hits.length. [api-ai-map][api-ai-map], [ai-store][ai-store] | G/T/D/M use the fixed set; no AI PIT, extend, position map or arrivals poll. | Direct retains Bedrock/ES ranking and real scores. API mode constructs no ES datasource or rescue path. [source-factory][source-factory], [es-ai][es-ai] | T10/T15/T17 cover ordering, local re-sort, latest sort, one API request and cold-start isolation. Not identical ranking across algorithms or all server permissions (T18/R6). | API browser ES/Bedrock work is removed; ranking still costs work on media-api. R5, not function-call counts, bounds the measured comparison. |
| 36 AI pool total **A supplied pool; B availability** | AI response `total` describes prefilter pool, not hit count. Separate server filters-only guidance exists; normal Kupua nonempty text uses ranked path. [server-ai-render][server-ai-render], [server-ai][server-ai] | `AiSearchResult.aiPoolTotal` -> store alongside hits; ordinary search start and AI error clear it. [api-ai-map][api-ai-map], [ai-store][ai-store], [pool-clear][pool-clear] | StatusBar shows Best k of N only after first settlement with nonempty hits; never combines cached count with a pool label. [status-total][status-total], [status-pool-cache][status-pool-cache] | Direct counts undecorated prefilter once, starting before embedding, awaiting alongside ranking. Count failure preserves hits but leaves pool metadata absent. [es-ai][es-ai] | T10/T13/T16 cover common metadata, count overlap/failure/abort, empty and reload UI. Response field presence is not universal count correctness; R6 retains limitations. | No API follow-up count. Direct count is one wider-scope request, sent even if embedding later fails. R5 measured no count bottleneck only for the recorded samples. |
| 37 AI pool tickers and enrichment **A accepted result; D ticker metadata** | AI envelope contains canonical per-image fields and `actions.tickerCounts` for the pool. [server-ai-render][server-ai-render], [extra-count][extra-count] | API decoder supplies current map; accepted publication replaces P, then hits/pool/tickers publish together in search-store. Separate stores are not a new transaction guarantee. Clause/colour still stripped. [api-ai-map][api-ai-map], [ai-store][ai-store] | G/T/D/M see current API AI overlays. StatusBar uses pool denominator; F ticker-backed counts use pool, but facets remain returned-ID scoped. [status-tickers][status-tickers], [test-ai][test-ai] | Direct AI has no overlay and clears P; null API result clears P/pool/tickers. Successful empty result clears P but retains returned pool metadata. | T10/T15 assert exact replacement, false/empty values, same-ID changes, empty/absent/stale paths and unchanged selection hydration. R4 adds bounded live replacement evidence; no selection TTL guarantee. | Store follow-up AI count removed in both modes. Local baseline derivation still runs beneath complete current overlays, so B1 remains applicable. |
| 38 AI availability and graceful absence **B,C** | Root advertises gated `ai-search`; accepted explicit AI GET is implemented. [root][root], [u9a-built][u9a-built] | API main awaits capability; direct main probes Bedrock; both feed `aiSearchAvailable`. Mapper returns null on non-2xx, transport failure or unreadable JSON; abort rejects. [main-init][main-init], [api-capability][api-capability], [api-ai-map][api-ai-map] | AI input uses mode-aware flag. Current-generation null publishes empty/error-free state, no warning/toast; cancelled work publishes nothing. [ai-availability][ai-availability], [ai-store][ai-store] | Direct Bedrock failure retains the existing error/toast behavior. Unexpected decoder/ordinal errors are not the quiet-null contract; parseable malformed payloads are not universally validated. | T10/T14/T15/T17 cover normal refusal/absence/readiness/abort cases; R4 records bounded browser counterparts. Not every malformed response or authorization combination. | One coalesced root request and one API AI request; no browser Bedrock/ES fallback. No generic discovery rewrite needed. |

## 5. Independent Workflow And Lifetime Coverage

**Owners:** P is `enrichment-store.data`, an ID-only in-memory Map: replacement
sets the entire map; upsert overwrites an ID's whole overlay object, not just its
present fields; an empty upsert is a no-op. It has no query key, TTL or eviction hook
([enrichment-store.ts:74][overlay-store]). S is `ImageDetail` state keyed by requested
image ID with cancellation; H is selection's reusable metadata cache, whose membership
repair is guarded independently from late metadata reuse ([standalone][standalone],
[selection:590][hydrate]). Q is search-store count/poll state with generation and
accepted-sequence guards ([poll][poll]). R now coalesces initialization into one
`Promise<boolean>`; failure is cached for the session by decision, not mistaken
for a successfully loaded empty root ([discovery][discovery], [test-discovery][test-discovery]).

| Workflow | Image / overlay publication and consumer evidence | Empty, failed or stale distinction / exact evidence limit |
| --- | --- | --- |
| Fresh ordinary search | First page and count run in parallel; after generation check, page overlay replaces P, then results publish. [search:2321][fresh-count], [search:2473][fresh] | Successful empty page has an empty Map and clears P. Missing overlay from a direct result does not clear P. Failure sets error and retains prior committed results, not ES rescue. T3/T4; no universal successful-payload schema validation. |
| Scroll-mode fill | Each nonempty page with cursor upserts P before append; abort checked after await. [search:1055][fill] | Empty page or missing next cursor breaks before overlay publication; failure does not mean remaining data is empty. No overlay pruning with buffer growth. T3 publication plus source; add a field-specific fill fixture for stronger display certification. |
| Forward extension | Current range signal guards response; nonempty page upserts then appends/evicts images. [search:2595][forward] | Empty response leaves P unchanged; eviction removes images/positions, not their overlays. Refused/unavailable read retains committed buffer/P (T4). |
| Backward extension | Merges normal backward page and optional valued-end boundary page, then upserts at commit. [search:2729][backward] | Aborted/failed pair is not partial success; trimmed/evicted image entries need not be removed from P. T3/T4 and boundary source, not every field/lease state rendered. |
| Seek: shallow, mapped, deep | Page adapter carries map; both contributing directions are combined, committed seek upserts P. [search:3117][seek-pair], [search:3627][seek-pair-deep], [search:3810][seek-commit] | Cancellation tests cover mapped/deep pages; no publication from discarded pages. P still contains earlier-page entries. T3/T4 distinguish stale completions from cache lifetime. |
| Sort-around-focus: target in first page | Uses fresh-search replacement path; field owner is that committed page. [search:2378][fresh-focus], [fresh][fresh] | Same failure/empty rules as fresh ordinary search, not a separate background enrichment. |
| Sort-around-focus: centered target | Probe entry for chosen target plus forward/backward maps form one buffer result; only commit upserts. Initial page is withheld. [search:1371][around], [search:1852][focus-commit] | Missing/failing/timed-out focus can commit first-page fallback using replacement, not upsert. T3 directly tests target, both neighbors, cancellation and fallback; not all policy fields. |
| Cursor/history restore | Fresh target lookup supplies target overlay; selected tuple/rank and neighbor pages complete before guarded upsert. [search:3955][restore] | Abort AND search-generation guards; missing target does not synthesize overlay absence. Failure may fall back to API seek. Retained cursor is not retained policy truth. T3/T4. |
| Grid rendering | One `useEnrichedImage(image)` per cell, memoized by image/overlay identity; derived badges/borders, raw media/collections. [G:217][grid], [hook:27][hook] | Missing overlay computes fallbacks. No independent policy refetch or time/quota subscription supplied by this hook. T1/T2 are not mounted all-badge coverage. |
| Table rendering | Each row derives once; custom field renderers get enriched image, ordinary raw values use original row. [T:279][table], [registry:349][badges] | Do not call every table value overlay-driven. Same identity memoization; T1 mapping/registry tests do not certify every visible column. |
| Resident detail and sidebar | Resident image wins, so no singleton fetch. Metadata reads P; usages section reads raw image usages. [detail:200][resident], [detail:869][detail-usages], [route:402][sidebar-usages] | Same-ID P can outlive its producing query. T5 asserts no singleton while traversing resident images; metadata handoff tests do not render the real warning/badge UI. |
| Standalone detail | App datasource GET returns image+overlay; S passes own overlay without publishing into P. Hook chooses own overlay as a whole, not a field merge with P. [singleton-api][singleton-api], [standalone][standalone], [hook][hook] | Wrong response ID is absent; old requests cancelled/ignored; all component lookup failures become requested-ID-bound unavailable state. If no own overlay is supplied, hook can consult P. T5 covers identity and precedence. |
| Multi-image detail | Cost summary derives each cached image with P by ID; rights/leases/reconciled fields use raw cached images. [multi-cost][multi-cost], [multi-rights][multi-rights] | Mixed P coverage is possible; no own singleton overlay for out-of-buffer selection. A generated `leasesSummary` test fixture does not prove current leased-cost styling. T2/T6, with mounted gap in G4. |
| Selection mget / hydration | App datasource posts IDs in chunks of 200, at most four in flight. H receives normalized images only; neither `ensureMetadata` nor `hydrate` writes P. [mget][mget], [selection:538][ensure], [hydrate][hydrate] | Failure preserves membership / leaves metadata pending. Successful omission may repair membership only for captured Set+anchor; late image metadata remains reusable. No selection-enrichment expansion. T6/T10. |
| Ordinary -> AI -> ordinary | Ordinary fresh page replaces P; accepted API AI replaces P with exactly its map; direct AI replaces it with empty. Returning ordinary uses fresh replacement or centered-page upserts. [fresh][fresh], [ai-store][ai-store], [focus-commit][focus-commit] | T10 changes same-ID cost/validity/persistence and verifies exact map membership, no AI count/PIT/ES/Bedrock request, and ordinary return. R2 is historical; R4 records post-U9 live replacement. Selection hydration still does not publish an overlay. |
| Empty ordinary / successful empty AI | Ordinary empty page replaces P with empty. Successful empty AI also empties P and facets, but preserves the response's supplied pool total/tickers; it is not API absence. [fresh][fresh], [ai-store][ai-store] | T10 explicitly tests pool total 0 and a supplied ticker map with no hits; it proves retention semantics, not the fixture's count realism. StatusBar suppresses Best-of wording for no hits (T16). |
| Null API AI / failed direct pool count | API transport/refusal/unreadable JSON -> null -> current empty state with P empty, pool null and tickers {}. Direct count failure instead leaves ranked hits with pool/tickers unavailable. [api-ai-map][api-ai-map], [ai-absent][ai-absent], [es-ai][es-ai] | T10/T13/T15 distinguish these outcomes. Valid JSON with an invalid shape or a missing ordinal may enter the error path; no claim all exceptions are quiet absence. |
| Refused / unavailable ordinary reads | Adapter classifies errors; current main image paths reject, never substitute an overlay-less ES result. [adapter:210][read-failure], [api:156][api-pages] | Store may expose error while preserving committed state; literal "every failure returns null" is NOT the present ordinary-page contract. T4 explicitly tests nonempty retained state and first-page error. Do not silently change recovery under U10. |
| Stale completion | Search generation, range signals, focus signals and S cancellation own different operations. AI checks generation AND captured signal before replacing P; direct adapter rechecks abort after its non-abortable pool count settles. [ai-store][ai-store], [es-ai][es-ai], [restore][restore], [standalone][standalone] | T3/T5 protect existing page/singleton paths; T10/T13 cover U9 stale/abort-only publication. A cancelled pending count may still finish work, but cannot publish accepted AI state. No general cache epoch or cross-store transaction is claimed. |
| Optional counts/discovery absence | Initial ordinary count failure -> null tickers; polling retains accepted values. Root read resolves false on failure and is not retried until reload; successful omission resolves true without the link. [fresh-count][fresh-count], [poll][poll], [discovery][discovery] | T8/T11 cover counts; T14 now proves coalescing and readiness distinction. Both unavailable capability cases hide AI, without Bedrock fallback; no automatic recovery retry is promised. |

### 5.1 Selection: Deliberately Absent Versus Merely Not Consumed

Mget still invokes the canonical builder, so cost/validity/persistence/status are
not deliberately absent **on the wire**. `mapApiImageToImage` spreads those runtime
properties into an `Image`, but `getByIds` returns neither envelope links/actions
nor a separate overlay. `deriveImage` then explicitly assigns local cost/validity/
status and overlay-only persistence/actions. Existing P entries can change that
outcome; H itself does not freshen them ([query-mget][query-mget], [mget][mget],
[derive][derive], [test-ai][test-ai]).

The lean projection deliberately omits bulk original/file metadata and vectors;
aliases preserve selected file-metadata values, not the whole payload. Normalized
rights, edits, usages, lease records, collections, assets and available syndication
rights remain in the image ([lean][lean], [map][map], [test-map][test-map]). This is
a metadata hydration boundary, not evidence that no server cost/actions exist and
not authorization to expand selection enrichment ([backlog:421][kup030]).

## 6. Existing Tests And Executed Evidence

All T entries are **read, not run in U10-A or this recheck**. References name existing homes for
future focused discriminators. A fixture is not an endpoint completeness proof.

| ID | Existing test evidence | Exact limit / update implication |
| --- | --- | --- |
| T1 | [grid-api-search-adapter.test.ts:129][test-extract], [235][test-merge], [390][test-map], [583][test-probe]: extraction, full/partial precedence, empty edits, expanded/link-only metadata, alias JSON values, relationship/assets retention, tuples and no probe publication. | Synthetic responses; not all endpoints/configs, no runtime schema validation or mounted UI. Exact enrichment object excludes summary/links. Proposed link/summary additions would change that assertion. |
| T2 | [derive-enriched-image.test.ts:27][test-derive], [hook tests:12][test-hook], [enrichment-store.test.ts:10][test-overlay-store]: fallback/override semantics, baseline-only noRights, own-overlay precedence, map replace/upsert. | They assert outputs, not absence of wasted computation. Lease summary is injected, not produced by the adapter. noRights assertion must remain unless a separately justified semantics change is selected. |
| T3 | [search-store.test.ts:1004][test-publication]: target and both neighboring overlays, mapped/deep backward seeks, abandoned probes/pages, missing/failure/timeout first-page fallback. | Mock datasource marks only selected fields. Proves publication wiring for named paths, not every field, every consumer, all frame-level coherence or post-U9 AI. |
| T4 | [search-store-api-mode.test.ts:300][test-restore-abort], [562][test-count-publication], [737][test-failures]: composed API/store cancellation, count publication/absence, first-page and extension/seek failures retaining state. | Controlled transport, not live timeout/permission incidents or complete UI field coverage. Tests intentionally require errors rather than false empty ordinary success. |
| T5 | [api-data-source.test.ts:195][test-singleton], [ImageDetail.test.tsx:209][test-detail-identity], [264][test-detail], [hook tests:12][test-hook]: GET normalization, wrong-ID/404/refusal/unavailable/cancellation, A-B-C-A identity, own overlay handoff, no resident singleton. | Component tests use a metadata stub; they prove ownership/handoff, not real banner text or every field's rendering. Singleton fixture contains links without asserting their preservation. |
| T6 | [api-data-source.test.ts][test-mget], [U9 hydration control][test-ai]: 200-ID/four-flight normalization, omitted ID, empty request, whole-lookup failure/cancellation, hydration leaves the accepted AI overlay map unchanged. | Does not certify all selected display fields or live missingness. No extra selection policy is implied by retaining late metadata. |
| T7 | [quota-store.test.ts:37][test-quota], [validity-map.test.ts:76][test-validity]: startup/map failure controls and quota reason controls, including excluded-collection overquota. [derive tests:27][test-derive] cover local fallback. | Local quota/config fixtures, not comparison against current server configuration or delayed quota re-render. Removing quota use requires more than a complete page overlay fixture. |
| T8 | [api-data-source.test.ts:607][test-count], [ImageQueryControllerTest.scala:691][test-server-count]: wire metadata, empty ticker map, incomplete/refused count handling; client expects only value/subCounts. | Server controller harness injects raw count results; client fixture strips metadata intentionally. Does not render unknown ticker names or prove deployed clauses/colours agree. |
| T9 | [ImageResponseTest.scala:98][test-alias-server], [field-registry.test.ts:153][test-alias-client], [graphic-image-blur.test.ts:129][test-graphic], [image-offset-cache.test.ts:101][test-alias-cursor]. | Configured value/existence projection and chosen client paths; not a runtime catalogue, all deployments or a licence to infer alias metadata from images. |
| T10 | [search-store-api-mode.test.ts][test-ai]: current real API adapter/store over controlled transport; ordinary -> AI -> ordinary exact overlay replacement, false validity/persisted values, empty usages, successful empty versus null absence, latest sort, superseded work, no AI count/PIT/ES/Bedrock, and direct/API metadata fixture parity. Hydration leaves P unchanged. | Replaces the old U6z retained-overlay assertion. Controlled transport is not live rank/config/permission parity; successful empty fixture deliberately tests supplied metadata preservation, not plausible counts. R4 supplies distinct browser evidence. |
| T11 | [search-store.test.ts:152][test-poll]: baseline+arrival counts/sub-counts, repeated polls, newer completion wins, failures, unknown versus zero baseline. | Payloads have no clause/colour metadata. Ticker normalization must add preservation assertions without weakening count math or request-count assertions. |
| T12 | [e2e/local/cql-search-quoting.spec.ts:123][test-cql-e2e]: current count callbacks across repeated Clear/Home remounts. | Existing browser test source only; not executed here, not a server-defined ticker catalogue/clause/colour test. Reuse this workflow if ticker controls change. |
| T13 | [es-adapter.test.ts][test-direct-pool] holds ranking/embedding/count independently, asserts one undecorated count, overlap before embedding completion, count failure preserving hits and abort after waiting for count. [search-store.test.ts][test-ai-store-controls] asserts atomic pool publication, ordinary clear, missing-ordinal error and abort-only no-publication. [Empty completion][test-ai-empty] leaves missing pool/tickers null without transport. | Separate adapter/store controls cover the cold-review cancellation defect; counts themselves take no abort signal, so no-publication does not mean server work was cancelled. Not universal timing evidence; R5 is bounded execution. |
| T14 | [service-discovery.test.ts][test-discovery] and [grid-api-instance.test.ts][test-capability]: delayed shared root, multiple callers, true-without-relation versus false-on-failure, refused/unreachable/unreadable root, no retry, capability waiting for route init. | Actual new discovery consumer is tested. Does not certify every root schema or generic relation consumer. Legacy [getImageDetail tests][test-legacy] still do not describe active standalone detail. |
| T15 | [api-data-source.test.ts AI section][test-api-ai]: effective `q`, separate text, filters/vecWeight, ordinal order, pool total/tickers, canonical field extraction including false/empty, success-empty, 403/422/500/503/transport/unreadable JSON -> null and abort rejection. | Wire fixtures, not full server semantic/authorization proof. Explicitly expects ticker clause/colour stripping. Parseable but malformed response shapes are outside these absence cases. |
| T16 | [StatusBar.test.tsx][test-pool-ui]: Best k of N, ordinary wording, no Best-of for empty hits, pool rather than hit-count ticker denominator, no cached-count/fresh-pool pairing before settlement. | Mounted UI test, but uses a local ticker definition. Does not prove server-only ticker names, returned clause/colour use, or all cross-mode configuration. |
| T17 | [main.test.tsx][test-main-api] imports actual startup with controlled transport and asserts no ES construction, one root read, no Bedrock call, unavailable AI flag and shared API datasource for selection/collections. [Factory][source-factory] constructs only the selected datasource. | API cold-start ownership proof over fixtures, not every deployed service/cookie combination. Separate T14 covers advertised availability; do not infer it solely from this failed-root startup case. |
| T18 | [MediaApiAiSearchTest.scala][test-server-ai] tests explicit text/hard filters, pool total/tickers versus hit length, omitted/empty q exclusions, empty text guidance, conflict, weights, projection, unchanged no-AI path, GET rights-flag non-effect plus POST contrast, and all four enabled/dense capability combinations. | Server-side fixtures and composed reads, not closure of inherited GRID-014/015/016 or every tier/config. The U9-A recorded execution is R6, not a run in this recheck. |

**R1:** the maintained KUP-029 entry records equality for 100 ordinary API images
and 20 controlled same-ID images, refuting its independent ordinary-path premise;
that is not every configuration or a claim of server policy correctness
([backlog:413][kup029]).

**R2:** the KUP-030 entry records a real controlled-overlap transition retaining all
20 overlays, with 0/20 changed rights/cost presentation in that sample. Synthetic
U6z cost divergence and live retention are different evidence. Natural wrong-display
incidence, other fields and selection consequences remain unproved
([backlog:421][kup030]). These are **pre-U9 historical observations**, not the current
AI publication behavior. U9's changed tests and R4 separately support closing that
path; general selection freshness is not part of the closure.

**R3:** the older page-publication record reports tests and bounded live checks,
but includes the then-existing ES rescue path; current API mode no longer has that
ordinary fallback. Reuse it only as historical evidence for the named behaviors,
not current recovery authorization or a new performance baseline
([changelog:752][history-publication], [api:156][api-pages], [T4][test-failures]).

**R4, recorded U9-B validation:** the as-built record reports final 2145 unit tests,
build and 299 E2Es passing after two failing-first cold-review fixes. Its bounded
API-mode TEST browser check covered cold AI startup, filtering/weights, local sorts,
detail traversal, return/table switch, exactly 200 current AI overlay entries and
ordinary return. It also records quiet 422/503/root failure, no Bedrock fallback and
no late publication after Home cancellation. Direct-mode checks observed an emptied
overlay and the retained Bedrock-error toast. This recheck did not repeat those
runs; 200 is that run's result size, not proof of every field/tier/device
([U9-B validation record][u9b-built], [browser record][u9-browser]).

**R5, recorded performance/configuration evidence:** three same-query runs per mode
reported API AI about 1.8-2.2 s versus its count-only 0.06-0.13 s, and direct AI
0.22-0.29 s versus count about 0.08 s, for the recorded broad/filtered checks.
The record concludes the parallel pool count did not delay publication there;
the API request was roughly eight times slower. This is not a ranking-equivalence
benchmark, causal CPU profile, before/after U9 regression proof or capacity guarantee.
It supplies no timing for `deriveImage`. The same record found agency-pick counts
6,443 direct versus 6,110 API (organisation-owned equal), attributed there to
compiled versus server configuration. B2 metadata retention does not change those
aggregation predicates; keep that comparison with M2a rather than claiming equal
numbers from a shared result type ([timing/configuration record][u9-timing]).

**R6, server correctness limits:** U9-A records Scala 767/767 and accepted re-review
after the explicit missing-q exclusion repair. It deliberately retains GET's
rights-filter non-effect (GRID-014) and inherited deleted-search/tier visibility
issues (GRID-015/016); U9-B later records a live deleted-search count discrepancy.
Do not call canonical fields, a capability link, or passing fixtures proof of
universal authorization/filter correctness. These have separate operator-owned
dispositions and are not silently bundled into U10-B. The recorded migration-state
duplicate-count difference is likewise not a supported-snapshot guarantee
([U9-A record][u9a-built], [review limits][u9-review-limits],
[recorded deployment observations][u9-observations]).

## 7. Correctness And Performance Assessment

### 7.1 Exactly What Can Be Skipped

For a **complete, currently selected overlay**, local `calculateCost`,
`buildValidityMap`, `deriveInvalidReasons`, `deriveValid` and
`calculateSyndicationStatus` produce values discarded by the merge. The read-only
quota lookup, config lookup and clock reads have no publication/network effect.
Skipping those unused outputs changes work, not the selected field values
([derive:92][derive], [cost][cost], [validity][validity], [client-status][client-status]).

The safe proposal is **field-wise**, not `if API mode`, not `if overlay exists`,
and not truthiness. Compute cost only if overlay cost is nullish; construct one
validity map if either validity output is missing, and use each supplied output
independently; calculate status only if absent. Preserve `false`, `{}` and `[]`.
Keep baseline `noRights`, rights selection, raw leases and independent detail
warning computations exactly as they are. Partial overlays must yield today's
outputs, including the baseline-rights semantics of the fallback
([derive][derive], [test-merge][test-merge], [test-derive][test-derive]).

Lazy fallback does **not** establish provenance: an arbitrary stale complete
overlay would still win. U9 now solves the evidenced ordinary-to-AI case at accepted
result publication. Preserve that replacement and its tests; do not reopen it or
silently prefer local values. Selection/cache lifetimes remain distinct
([ai-store][ai-store], [test-ai][test-ai], [hydrate][hydrate]).

The hook memoizes by image/overlay reference, so these costs occur on derivation,
not every React render. Multi-image cost summary calls derive for each image when
that section renders. There is no measured CPU, frame or latency saving in this
assessment; do not extrapolate function-call reduction to a browsing-speed claim
([hook:27][hook], [multi-cost:311][multi-cost]). The smallest discriminator is spies
plus equality controls, not a broad performance campaign.

### 7.2 Request And Payload Ledger

| Candidate / existing behavior | Request/payload effect supported by code | Decision |
| --- | --- | --- |
| Lazy fallback under current overlays | No endpoint, request or wire-payload change; skips already-discarded local outputs. [derive][derive] | Best bounded work-reduction candidate; quantify calls first, do not promise milliseconds. |
| Ticker metadata consumption | Fields already on count wire; no new request. Small additional retained metadata; avoid repeated local joins and lost metadata on poll. [api-count][api-count], [poll][poll] | Correctness/ownership improvement, not a proven latency gain. Must be end-to-end and coexist with U9 pool semantics. |
| Retaining links / executing discovered relations everywhere | Retention alone removes no request; relation execution changes routing, expiry/template/proxy behavior. [server-links][server-links], [discovery][discovery] | Reject generic rewiring without a named existing workflow benefit. |
| Removing quota or root startup fetch | Quota has fallback consumers; root now drives API AI availability and its callers already share one read. [main-init][main-init], [discovery][discovery], [api-capability][api-capability] | Neither is unused. Removal would change behavior, not just save redundant work. |
| Media URL substitution | Could change asset size, quality, auth and cache path; signed original is not equivalent to bounded imgproxy output. [full][full], [server-image][server-image] | U7 comparison, not a free use-server-field win. |
| Mget's unused canonical policy fields | Server currently constructs canonical entities whose policy output is not published as selection overlay. [query-mget][query-mget], [mget][mget] | Potential later payload/server-work question, not permission for selection expansion or a lean endpoint now. Measure/contract before deciding computation placement. |
| U9 pool metadata | API now consumes returned counts with no follow-up request. Direct starts its one wider-scope count before embedding and awaits it with hits; it may finish despite cancellation/embedding failure. [api-ai-map][api-ai-map], [es-ai][es-ai] | Implemented, not a U10 candidate. R5's bounded timing check is complete and did not find a count bottleneck; do not re-propose it as unmeasured. Larger API request cost remains a separate M2a question. |

## 8. Selected U10-B And Follow-ups

**B1 only is selected for U10-B.** The [build-plan unit note][u10b-unit] owns the
execution boundary, preservation rules and gates. The remaining entries below are
retained as evidence-backed follow-up candidates, not an implementation checklist.
U9's actual types/publication are rechecked. Preserve supported direct mode during
migration; eventually eliminating browser ES does not require eliminating useful
client presentation computation.

### 8.1 Free / Mechanical Wins

**M1: truthful types/comments, alongside work on the owning files.** Correct stale
claims about overquota, the deleted mirror loop, lease summaries, singleton actions
and current discovery use in the derivation/store/discovery/API type comments.
The old GET `SearchResponseActions` types describe ticker arrays/sub-count arrays,
where Scala serializes a keyed map. U9 uses its own `AiSearchApiResponse` with a map;
it does not make repairing that dormant legacy model an unfinished U9 requirement
([AI response type][ai-response-type], [types:416][legacy-ticker-types],
[CollectionResponse:9][extra-count], [get-image][get-image]).

Files: [derive-enriched-image.ts][derive], [enrichment-store.ts][overlay-type],
[service-discovery.ts][discovery], [grid-api/types.ts][legacy-ticker-types],
[es-config.ts][source-fields]. Observable behavior: none. Existing tests: no
runtime assertions should change for comment-only edits; a type correction must
preserve real map fixtures in T8/T15. New
discriminator: a typed fixture with a nonlocal ticker name and keyed sub-counts.
Requests/performance: unchanged. Direct/API parity: unchanged. Do not make this a
standalone cleanup campaign or migration gate.

### 8.2 Bounded Client Changes Needing Focused Tests

**B1: lazy local derivation, selected as the entire U10-B scope.** Implemented
28 September; see the [unit note][u10b-unit] "as built". Files:
[derive-enriched-image.ts][derive] and its [existing tests][test-derive]; use the
current hook/adapter/store tests as integration neighbors. Observable behavior:
identical selected fields with fewer policy calls under complete overlays.
Existing tests requiring updates: normally none of the output expectations;
baseline-only noRights and partial-overlay tests must remain unchanged. Add spies
proving zero cost/validity/status calls for a complete overlay, and one-at-a-time
missing fields with false/empty controls. Include absent overlay, missing reasons
with supplied false valid, missing valid with supplied {}, expired leases and quota
state. New tests must fail against current eager derivation for the right reason.
Requests/payload: zero delta. Performance: fewer calls/allocations, speedup unmeasured;
do not present this as a remedy for the materially larger API request time in R5.
Parity: preserves existing direct, partial-overlay and selection fallbacks; does not
claim their semantics equal server policy. Do not add memoization/framework layers.

**B2: one end-to-end ticker metadata contract, an unselected later-unit candidate
for configuration correctness.** Files: [dal/types.ts][ticker-type],
[api-data-source.ts][api-count], [es-adapter.ts][direct-tickers],
[search-store.ts poll merge][poll], [StatusBar.tsx][status-tickers],
[FacetFilters.tsx][facet-tickers], [typeahead-fields.ts][typeahead-tickers], and
[apiSearchByAi][api-ai-map] / its [AI result type][ai-result-type]. Normalize direct results using local
definitions and API results using returned metadata; presentation need not branch
on transport mode. Cover the returned enabled set without claiming it is a complete
`is:` vocabulary or alias catalogue. Preserve metadata through polling and define
stable UI ordering. The current server emits single `is:` clauses; accepting future
arbitrary CQL requires a parser-backed rule, not stripping `is:` or substituting the
ticker name. Stop for design if that broader clause support is needed.

Observable behavior: server-defined name/clause/colour appears and clicks select
the counted predicate; unknown/empty/unavailable remain distinct; U9 pool denominator
rules remain intact. Existing tests needing updates: T8's exact stripped map,
T11's metadata-free poll expectations, T4 count publication and T10/U9 AI count
assertions; T12 remount workflow must remain valid. New discriminators: server-only
name; same name with different clause/colour from local config; no returned ticker
despite local definition; {} versus failed count; false/zero values; successive
poll and stale completion; direct normalized equivalent; ordinary/AI/ordinary
metadata reset. Test badge, facet and typeahead consumers, not only mapping.
Update T15's stripped AI ticker expectation as well as T8; preserve T16's pool
denominator/cache behavior and T10's exact overlay replacement. Do not restore
the removed post-AI count. R5's observed cross-mode count difference is not fixed
by passing clause/colour through; configuration/predicate alignment is a separate
decision, not an implied output of B2.
Requests: no new discovery/count calls; preserve existing call-count tests.
Performance: small retained metadata and less joining, not an established speedup.
Direct/API parity: common display contract, deliberately different configuration
sources; no change to query semantics or ticker aggregation scope here.

**B3: prefer server-supplied validity reason copy, an unselected display correction.**
Files: [ImageMetadata.tsx][reason-copy], [validity-map.ts][validity-copy] only if a
shared fallback helper is genuinely needed, and the nearest metadata rendering
test home. Observable behavior: known keys can display server custom descriptions;
local derivation retains local descriptions. Existing T1/T2 extraction/merge tests
should not change; T5 stubs metadata and therefore cannot validate this fix.
New discriminator: mount real metadata with a known key whose server message differs
from local copy, an unknown key, no overlay, and an empty-description decision.
Do not alter valid/reasons membership or warning severity. Requests: unchanged.
Performance: negligible; this is correctness, not optimization. Parity: same source
preference rule, locally generated reasons still work. Needs operator selection,
not a new gate on API transport.

### 8.3 Design Or Server-Contract Decisions

**D1: runtime configuration catalogue, only if concrete skew justifies it.** Files
would include [grid-config.ts][config], [field-registry.tsx][aliases-client],
[typeahead-fields.ts][typeahead-tickers] and a separately approved server resource.
Observable behavior: authoritative labels/options/feature vocabulary before consumers
initialize. Existing T9/config and T12 registration tests would need re-evaluation;
new checks must include a configured-but-never-populated alias, partial/failing
config, startup races and consistent cursor/sort mappings. A fetch adds startup
latency/failure ownership unless bootstrapped/cached. Compare that cost with keeping
a small deployment-specific client config. No such endpoint/change is authorized.

**D2: image controls/media relations, deferred to a named workflow/U7.** Files:
[grid-api-search-adapter.ts][map], [enrichment-store.ts][overlay-type],
[image-urls.ts][full] and the eventual consumer, not all UI code. Observable behavior
and required links must be specified first. T1/T5 would need retention assertions;
new controls must distinguish permission omission from unavailable discovery and
cover templates, proxy routing, expired URLs and transformed media. Retention alone
adds memory; execution may change requests/payload substantially. Direct mode needs
its current absence/media fallback. No link execution, editing UI or U7 work here.

**D3: lease/status display parity or selection freshness.** Files:
[derive-enriched-image.ts][derive], [calculate-syndication-status.ts][client-status],
[ImageMetadata.tsx][metadata], [MultiImageMetadata.tsx][multi-cost] and, only with
expanded permission, [selection-store.ts][hydrate]. Observable behavior choices
include summary generation, lease-time treatment and old same-ID cache policy.
Existing T2 summary injection/noRights tests and T6/T10 non-enrichment expectations
cannot be rewritten casually. Smallest discriminators: raw active/future/expired
leases with no summary; both syndication lease types; same-ID selected image before/
after new result generation. Client scans may be cheaper and fresher than another
request; server snapshot may encode different accepted policy. Establish intended
semantics first. Selection enrichment stays excluded from U10-B. The operator's
direction is to reconsider already-returned selection fields during a future
[KUP-035 investigation](bug-backlog.md#kup-035), while keeping field reuse, data
ownership and the full-reconcile stall as distinct questions, not an automatic
combined fix. KUP-029 is refuted on its
ordinary premise and KUP-030's evidenced AI path is now closed. Neither supplies
approval for an independent cache/rights redesign ([kup029][kup029], [kup030][kup030]).

**D4: lean hydration/server work, future evidence only.** If profiling later shows
canonical mget computation/payload is material, compare a separately agreed lean
contract with reusing the present canonical response. Candidate files are
[ImageQueryController.scala][query-mget], [ImageResponse.scala][server-image] and
[api mapper][mget]; existing server admission/completeness and T6 whole-lookup
failure tests must survive. New discriminator must compare required hydrated fields
and authorization/omission semantics, not just payload bytes. Request count need
not increase; server CPU and payload effects are unmeasured. No server change is
proposed as U10-B, and this is not a pretext to enrich selection.

### 8.4 Rejected Cleanup Ideas

- Delete direct calculators because API mode exists: breaks partial/H/direct paths;
  transport removal and computation placement are separate decisions ([derive][derive], [hydrate][hydrate]).
- Restore the background enrichment loop or add per-image enrichment reads: duplicates
  returned page data and adds traffic without resolving ownership ([history-drop][history-drop], [decode][decode]).
- Retain every link/action "for completeness": no current consumer benefit; do not
  turn a data inventory into an editing/delivery implementation ([server-links][server-links], [legacy-detail][legacy-detail]).
- Infer configuration from aliases/tickers on sampled images: values and enabled
  response subsets are not complete configuration catalogues ([aliases-server][aliases-server], [ticker-config][ticker-config]).
- Replace raw date-based lease display with stored `active`, or trust missing
  summary as false: changes semantics and conceals absent data ([metadata][metadata], [client-status][client-status]).
- Unify every lifetime behind a new enrichment framework, or globally clear caches
  to extend KUP-030's closure: U9 already replaces its own accepted result map;
  selection has different reuse rules ([ai-store][ai-store], [hydrate][hydrate]).
- Remove baseline count/poll work or quota loading as "duplicate": these have
  distinct scopes/consumers. No request is redundant merely because nearby data
  exists ([fresh-count][fresh-count], [poll][poll], [quota][quota]).
- Scrape Kahuna or expose private config to remove compile-time values: no suitable
  public runtime catalogue follows from the current root ([root][root], [config-loader][config-loader]).
- Bundle MLT, U7, KUP-037, stronger snapshot/index-migration guarantees or a broad
  performance campaign: outside this evidence scope ([plan-sequence][plan-sequence]).

## 9. Resolved Contradictions And Smallest Remaining Checks

Proposed checks below are **not executed or newly authorized**. Reuse existing
evidence before commissioning new runtime work.

| ID | Resolved fact or explicit unknown | Smallest discriminator / owner |
| --- | --- | --- |
| G1 | Core premise supported; background hook removal did not remove current overlays. Overquota is not API-only; summary/legacy type comments remain stale. Root now has its AI consumer. | Resolved from current code, historical diff and T1/T2/T7/T14. No new browser reproduction needed for these source facts. |
| G2 | Output-equivalent lazy derivation is supported for supplied fields; meaningful frame/latency gain is unknown. | B1 call spies plus old-output parity matrix. Only if worthwhile afterward, propose a bounded named timing check; no broad campaign. |
| G3 | Returned ticker metadata is still lost in ordinary count, new AI mapper, poll and UI joins. R5 records a separate count/predicate configuration difference. | B2 differing metadata fixture through every consumer and transition. Do not confuse display metadata repair with changing the actual aggregation predicate or commission another experiment for the already-recorded difference. |
| G4 | Current extractor produces no lease summary; injected-summary tests do not prove G/T/M leased-cost behavior. | Mounted raw-lease fixture contrasting D raw-list fallback with G/T/M cost styling. Design choice, not automatic scope expansion. |
| G5 | General ID cache still has no epoch/TTL guarantee, but the evidenced ordinary-to-AI retention is closed by exact accepted-result replacement. Selection consequences remain outside that fix. | T10 already supplies different same-ID, empty/absent/stale controls; T13 adds abort-only protection and R4 records live replacement. Preserve them; no new AI retention experiment is needed to repeat this evidence. |
| G6 | Resolved: discovery coalesces/awaits one read and distinguishes success-without-link from failure; AI consumes it. Session-scoped no-retry is explicit. | T14 covers the former readiness gap and R4 covers failed-root UI absence. New retry/recovery behavior would need a new requirement, not cleanup of a presumed bug. |
| G7 | Per-image aliases are values, not a complete catalogue. | Existing server alias test with no matching fields plus a configured field label demonstrates why sampling fails. Real catalogue design requires a separate contract, not more sampled images. |
| G8 | Successful I says what a decoded image contains, not every original field, live satellite state or all malformed-response behavior. | Reuse T1/T4/T6 and lean projection. Add one missing embedded-data fixture only if a consumer needs to distinguish absent versus explicit empty; do not introduce a generic validator framework by default. |
| G9 | API reason descriptions can be replaced by local text; root usageRights is not universally re-merged at response time. | B3 differing-message render; for rights, a root/user-edit mismatch fixture through real server builder plus client map. This does not reopen refuted ordinary noRights provenance. |
| G10 | Resolved for inspected U9 path: pool metadata, capability, no-vector explicit projection, quiet API absence and current AI enrichment are implemented. Generic payload validation and inherited GET limitations are not resolved by that claim. | T10/T13-T18 plus R4-R6 replace the old pending evidence. M2a remains deployment-specific validation, not permission to rebuild or re-prove U9 indiscriminately. |
| G11 | Canonical media/unused-control benefits and costs are unknown. | U7 or a separately selected control owns quality/payload/auth/caching comparison. Do not use a single URL fixture as proof of faster or equivalent delivery. |

## 10. M2a Checks And Future Direction

M2a remains the planned deployed-TEST API check while retaining local media delivery;
U8/M2a precede U7. No M2a access or execution follows from this document
([plan:142][plan-sequence]). Record both revisions and check:

1. Implemented root `ai-search` capability, readiness and mode-aware absence agree
   with the deployment, not just a local fixture (rows 32-33, 38; G6/G10).
2. Aliases actually used by display/search/cursors are accepted and projected;
   keep values separate from the still-local catalogue (rows 21-22).
3. Ticker values, clauses, colours and sub-count scope correspond; if B2 is not
   selected, explicitly retain the local-join limitation (rows 27-31).
4. Organisation/agency/syndication/warning vocabulary differences remain visible
   as configuration/semantics findings, not inferred universal parity (rows 10, 26).
5. Current committed page and singleton policy fields follow the workflow matrix;
   selection and stale-but-retained state are not mislabeled complete (section 5).
6. U9 API mode makes no browser ES/Bedrock reads, has correct pool metadata and
   current AI overlays, and preserves the fixed-set invariant and empty/refused/
   unavailable/stale behavior (rows 35-38; owning [U9 plan][u9-client]).
7. Reuse existing applicable measurements with their revision/topology limits;
  R4-R6 now contain the U9 browser, timing and configuration comparison. Request
  only the smallest missing deployment-specific check. This report adds no performance gate.

A runtime config resource is one possible future answer for vocabulary, not an
automatic prerequisite. Compare its startup/cache/maintenance cost with compile-time
configuration for the intended deployments. Keep operations permission-aware and
server-authorized, and keep inexpensive presentation computation client-side when
that is faster/cleaner without losing correctness. Do not publish private config,
credentials, signed media URLs or user data as evidence.

## Evidence References

[plan-sequence]: 03%20Ce%20n'est%20pas%20une%20pipe%20dream/api-build/api-build-00-plan.md#L142
[plan-u9b]: 03%20Ce%20n'est%20pas%20une%20pipe%20dream/api-build/api-build-00-plan.md#L933
[api-ai]: ../../src/dal/api-data-source.ts#L75
[api-count]: ../../src/dal/api-data-source.ts#L124
[api-detail]: ../../src/dal/api-data-source.ts#L142
[api-pages]: ../../src/dal/api-data-source.ts#L156
[map]: ../../src/dal/grid-api-search-adapter.ts#L45
[extract]: ../../src/dal/grid-api-search-adapter.ts#L82
[singleton-api]: ../../src/dal/grid-api-search-adapter.ts#L166
[mget]: ../../src/dal/grid-api-search-adapter.ts#L182
[read-failure]: ../../src/dal/grid-api-search-adapter.ts#L210
[decode]: ../../src/dal/grid-api-search-adapter.ts#L244
[derive-comments]: ../../src/lib/derive-enriched-image.ts#L8
[derive]: ../../src/lib/derive-enriched-image.ts#L92
[overlay-type]: ../../src/stores/enrichment-store.ts#L24
[overlay-store]: ../../src/stores/enrichment-store.ts#L74
[hook]: ../../src/hooks/useEnrichedImage.ts#L27
[cost]: ../../src/lib/cost/calculate-cost.ts#L35
[validity]: ../../src/lib/cost/validity-map.ts#L67
[validity-copy]: ../../src/lib/cost/validity-map.ts#L44
[validity-reasons]: ../../src/lib/cost/validity-map.ts#L149
[quota-read]: ../../src/lib/cost/quota-store.ts#L24
[quota]: ../../src/lib/cost/quota-store.ts#L28
[quota-query]: ../../src/dal/adapters/elasticsearch/cql.ts#L443
[ai-availability]: ../../src/components/AiSearchInput.tsx#L82
[client-status]: ../../src/lib/syndication/calculate-syndication-status.ts#L42
[main-init]: ../../src/main.tsx#L17
[config]: ../../src/lib/grid-config.ts#L35
[config-aliases]: ../../src/lib/grid-config.ts#L163
[source-fields]: ../../src/dal/es-config.ts#L56
[thumb]: ../../src/lib/image-urls.ts#L50
[full]: ../../src/lib/image-urls.ts#L215
[graphic]: ../../src/lib/graphic-image-blur.ts#L46
[aliases-client]: ../../src/lib/field-registry.tsx#L969
[registry-collections]: ../../src/lib/field-registry.tsx#L769
[badges]: ../../src/lib/field-registry.tsx#L349
[grid]: ../../src/components/ImageGrid.tsx#L217
[grid-collections]: ../../src/components/ImageGrid.tsx#L340
[grid-colours]: ../../src/components/ImageGrid.tsx#L651
[table]: ../../src/components/ImageTable.tsx#L279
[metadata]: ../../src/components/ImageMetadata.tsx#L196
[reason-copy]: ../../src/components/ImageMetadata.tsx#L289
[multi-cost]: ../../src/components/MultiImageMetadata.tsx#L311
[multi-rights]: ../../src/components/MultiImageMetadata.tsx#L401
[resident]: ../../src/components/ImageDetail.tsx#L200
[standalone]: ../../src/components/ImageDetail.tsx#L244
[detail-usages]: ../../src/components/ImageDetail.tsx#L869
[sidebar-usages]: ../../src/routes/search.tsx#L402
[ensure]: ../../src/stores/selection-store.ts#L538
[hydrate]: ../../src/stores/selection-store.ts#L590
[fresh]: ../../src/stores/search-store.ts#L2473
[fresh-count]: ../../src/stores/search-store.ts#L2321
[fresh-focus]: ../../src/stores/search-store.ts#L2378
[fill]: ../../src/stores/search-store.ts#L1055
[around]: ../../src/stores/search-store.ts#L1371
[focus-commit]: ../../src/stores/search-store.ts#L1852
[forward]: ../../src/stores/search-store.ts#L2595
[backward]: ../../src/stores/search-store.ts#L2729
[seek-pair]: ../../src/stores/search-store.ts#L3117
[seek-pair-deep]: ../../src/stores/search-store.ts#L3627
[seek-commit]: ../../src/stores/search-store.ts#L3810
[restore]: ../../src/stores/search-store.ts#L3955
[ai-store]: ../../src/stores/search-store.ts#L2208
[poll]: ../../src/stores/search-store.ts#L760
[status-tickers]: ../../src/components/StatusBar.tsx#L204
[status-total]: ../../src/components/StatusBar.tsx#L162
[ticker-tooltip]: ../../src/components/StatusBar.tsx#L36
[facet-tickers]: ../../src/components/FacetFilters.tsx#L389
[typeahead-tickers]: ../../src/lib/typeahead-fields.ts#L327
[ticker-type]: ../../src/dal/types.ts#L106
[direct-tickers]: ../../src/dal/es-adapter.ts#L388
[es-count]: ../../src/dal/es-adapter.ts#L720
[es-ai]: ../../src/dal/es-adapter.ts#L1110
[legacy-ticker-types]: ../../src/dal/grid-api/types.ts#L416
[legacy-detail]: ../../src/dal/grid-api/grid-api-adapter.ts#L50
[argo-identity]: ../../src/dal/grid-api/argo.ts#L82
[discovery]: ../../src/dal/grid-api/service-discovery.ts#L37
[init-route]: ../../src/routes/search.tsx#L70
[start-mode]: ../../scripts/start.sh#L639
[vite]: ../../vite.config.ts#L110
[config-loader]: ../../../common-lib/src/main/scala/com/gu/mediaservice/lib/config/GridConfigLoader.scala#L13
[query-pages]: ../../../media-api/app/controllers/ImageQueryController.scala#L65
[query-mget]: ../../../media-api/app/controllers/ImageQueryController.scala#L215
[server-image]: ../../../media-api/app/lib/ImageResponse.scala#L58
[server-writes]: ../../../media-api/app/lib/ImageResponse.scala#L327
[server-cost]: ../../../media-api/app/lib/ImageResponse.scala#L207
[server-cost-policy]: ../../../media-api/app/lib/usagerights/CostCalculator.scala#L12
[server-validity]: ../../../media-api/app/lib/ImageExtras.scala#L29
[server-reasons]: ../../../media-api/app/lib/ImageExtras.scala#L84
[server-restrictions]: ../../../media-api/app/lib/ImageResponse.scala#L293
[persistence]: ../../../media-api/app/lib/ImageResponse.scala#L49
[persisted-wire]: ../../../media-api/app/lib/ImageResponse.scala#L226
[wrap-edits]: ../../../media-api/app/lib/ImageResponse.scala#L233
[server-status]: ../../../common-lib/src/main/scala/com/gu/mediaservice/model/Image.scala#L46
[image-reader]: ../../../common-lib/src/main/scala/com/gu/mediaservice/model/Image.scala#L80
[embedded]: ../../../media-api/app/lib/ImageResponse.scala#L376
[collection-wire]: ../../../media-api/app/lib/ImageResponse.scala#L450
[server-actions]: ../../../media-api/app/lib/ImageResponse.scala#L165
[server-links]: ../../../media-api/app/lib/ImageResponse.scala#L147
[server-filemetadata]: ../../../media-api/app/lib/ImageResponse.scala#L390
[aliases-server]: ../../../media-api/app/lib/ImageResponse.scala#L425
[get-image]: ../../../media-api/app/controllers/MediaApi.scala#L177
[get-image-source]: ../../../media-api/app/controllers/MediaApi.scala#L804
[root]: ../../../media-api/app/controllers/MediaApi.scala#L112
[server-ai]: ../../../media-api/app/controllers/MediaApi.scala#L637
[lean]: ../../../media-api/app/lib/elasticsearch/ElasticSearch.scala#L732
[complete]: ../../../media-api/app/lib/elasticsearch/ElasticSearch.scala#L1079
[server-mget]: ../../../media-api/app/lib/elasticsearch/ElasticSearch.scala#L1250
[server-count]: ../../../media-api/app/lib/elasticsearch/ElasticSearch.scala#L1130
[ticker-config]: ../../../media-api/app/lib/elasticsearch/ElasticSearch.scala#L55
[ticker-server]: ../../../media-api/app/lib/elasticsearch/ElasticSearch.scala#L444
[extra-count]: ../../../common-lib/src/main/scala/com/gu/mediaservice/lib/argo/model/CollectionResponse.scala#L9
[history-drop]: changelog.md#L5333
[history-revive]: changelog.md#L2879
[history-cleanup]: changelog.md#L2738
[history-publication]: changelog.md#L752
[kup029]: bug-backlog.md#L413
[kup030]: bug-backlog.md#L421
[u9-capability]: ai-search-catching-up-workplan.md#L228
[u9-client]: ai-search-catching-up-workplan.md#L243
[u9-overlay]: ai-search-catching-up-workplan.md#L304
[u9-pool]: ai-search-catching-up-workplan.md#L319
[u9-rank]: ai-search-catching-up-workplan.md#L374
[u9-absence]: ai-search-catching-up-workplan.md#L407
[test-extract]: ../../src/dal/grid-api-search-adapter.test.ts#L129
[test-merge]: ../../src/dal/grid-api-search-adapter.test.ts#L235
[test-map]: ../../src/dal/grid-api-search-adapter.test.ts#L390
[test-probe]: ../../src/dal/grid-api-search-adapter.test.ts#L583
[test-derive]: ../../src/lib/derive-enriched-image.test.ts#L27
[test-hook]: ../../src/hooks/useEnrichedImage.test.ts#L12
[test-overlay-store]: ../../src/stores/enrichment-store.test.ts#L10
[test-publication]: ../../src/stores/search-store.test.ts#L1004
[test-restore-abort]: ../../src/stores/search-store-api-mode.test.ts#L300
[test-count-publication]: ../../src/stores/search-store-api-mode.test.ts#L562
[test-failures]: ../../src/stores/search-store-api-mode.test.ts#L737
[test-singleton]: ../../src/dal/api-data-source.test.ts#L195
[test-mget]: ../../src/dal/api-data-source.test.ts#L269
[test-detail-identity]: ../../src/components/ImageDetail.test.tsx#L209
[test-detail]: ../../src/components/ImageDetail.test.tsx#L264
[test-quota]: ../../src/lib/cost/quota-store.test.ts#L37
[test-validity]: ../../src/lib/cost/validity-map.test.ts#L76
[test-count]: ../../src/dal/api-data-source.test.ts#L607
[test-server-count]: ../../../media-api/test/controllers/ImageQueryControllerTest.scala#L691
[test-alias-server]: ../../../media-api/test/lib/ImageResponseTest.scala#L98
[test-alias-client]: ../../src/lib/field-registry.test.ts#L153
[test-graphic]: ../../src/lib/graphic-image-blur.test.ts#L129
[test-alias-cursor]: ../../src/lib/image-offset-cache.test.ts#L101
[test-ai]: ../../src/stores/search-store-api-mode.test.ts#L1036
[test-poll]: ../../src/stores/search-store.test.ts#L152
[test-cql-e2e]: ../../e2e/local/cql-search-quoting.spec.ts#L123
[test-ai-empty]: ../../src/dal/es-adapter.test.ts#L161
[test-legacy]: ../../src/dal/grid-api/grid-api-adapter.test.ts#L160
[u9a-built]: 03%20Ce%20n'est%20pas%20une%20pipe%20dream/api-build/api-build-00-plan.md#L890
[u9b-built]: 03%20Ce%20n'est%20pas%20une%20pipe%20dream/api-build/api-build-00-plan.md#L963
[u9-browser]: 03%20Ce%20n'est%20pas%20une%20pipe%20dream/api-build/api-build-00-plan.md#L1015
[u9-timing]: 03%20Ce%20n'est%20pas%20une%20pipe%20dream/api-build/api-build-00-plan.md#L1032
[u9-review-limits]: 03%20Ce%20n'est%20pas%20une%20pipe%20dream/api-build/api-build-00-plan.md#L1007
[api-ai-map]: ../../src/dal/grid-api-search-adapter.ts#L336
[source-factory]: ../../src/dal/index.ts#L35
[api-capability]: ../../src/lib/grid-api-instance.ts#L35
[server-ai-render]: ../../../media-api/app/controllers/MediaApi.scala#L659
[ai-projection]: ../../../media-api/app/lib/ImageResponse.scala#L327
[test-discovery]: ../../src/dal/grid-api/service-discovery.test.ts#L9
[test-capability]: ../../src/lib/grid-api-instance.test.ts#L8
[test-pool-ui]: ../../src/components/StatusBar.test.tsx#L20
[test-api-ai]: ../../src/dal/api-data-source.test.ts#L725
[test-direct-pool]: ../../src/dal/es-adapter.test.ts#L1320
[test-main-api]: ../../src/main.test.tsx#L53
[pool-clear]: ../../src/stores/search-store.ts#L2147
[status-pool-cache]: ../../src/components/StatusBar.tsx#L89
[ai-absent]: ../../src/stores/search-store.ts#L81
[test-ai-store-controls]: ../../src/stores/search-store.test.ts#L3831
[test-server-ai]: ../../../media-api/test/controllers/MediaApiAiSearchTest.scala#L246
[ai-result-type]: ../../src/dal/types.ts#L157
[ai-response-type]: ../../src/dal/grid-api-search-adapter.ts#L27
[u9-observations]: 03%20Ce%20n'est%20pas%20une%20pipe%20dream/api-build/api-build-00-plan.md#L1409
[u10b-unit]: 03%20Ce%20n'est%20pas%20une%20pipe%20dream/api-build/api-build-00-plan.md#u10-b-skip-unused-fallback-derivation