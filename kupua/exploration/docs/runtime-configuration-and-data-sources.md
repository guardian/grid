# Kupua Runtime Configuration and Data Sources

> **U10-A characterization, 27 September 2026.** Inspected working-tree source at
> `b2acc260f`, including the operator's pre-existing documentation amendments.
> **Pre-U9:** U9-A/B are still unimplemented here; post-U9 evidence is explicitly
> pending, not certified by this report ([plan:140][plan-sequence],
> [api-data-source.ts:82][api-ai]). The operator authorized this sequencing exception.
> No production changes, tests, browsers, live TEST access or Git mutations were
> performed for U10-A. This document is the characterization, not U10-B approval.

## 1. Decision Summary

**The premise is supported, with important limits.** Current page responses already
feed `extractEnrichment` -> caller-owned publication -> `deriveImage` /
`useEnrichedImage`; standalone detail supplies a request-owned overlay. This is
not the deleted background enrichment loop. Bulk selection hydration and current
AI do not publish equivalent overlays ([adapter:72][extract],
[search-store.ts:2470][fresh], [ImageDetail.tsx:244][standalone],
[adapter:172][mget], [search-store.ts:2196][ai-store]). No Section 0 halt is warranted.

**Decision criterion, clarified by the operator:** the architectural goal is no
browser-direct Elasticsearch access. Computation placement is a correctness,
latency, payload, request-count and maintenance decision, not "server is better
because the field exists." Current direct-mode support is a migration/fallback
constraint, not the end-state architecture ([plan:192][plan-u9b]).

- **Request-neutral local work can be avoided:** derivation calculates cost twice
  (directly and inside validity), builds validity and calculates syndication status
  before complete overlays replace those outputs. Field-wise lazy fallback could
  preserve outputs while skipping that work; no measured frame-time benefit is
  claimed ([derive:97][derive], [validity-map.ts:67][validity]).
- **Configuration skew, not demonstrated slowness:** ticker values/sub-counts
  survive, but clauses/colours are discarded by mapping and would be erased again
  by polling merges. Three UI paths rejoin local definitions. Consuming returned
  metadata can fix that mismatch without another request; changing only the mapper
  would be incomplete ([api:130][api-count], [search:775][poll],
  [StatusBar:204][status-tickers], [FacetFilters:389][facet-tickers],
  [typeahead:327][typeahead-tickers]).
- **Do not expand scope to use every field:** image links/actions have no current
  editing consumer; canonical media delivery belongs to U7; selection enrichment
  remains excluded. Retaining more data without a consumer is not a performance win
  ([derive:112][derive], [image-urls:50][thumb], [plan:146][plan-sequence],
  [backlog:422][kup030]).
- **Do not erase required fallbacks:** direct cost already supports `overquota`
  from a startup quota snapshot. Partial overlays, direct images and selection
  cost summaries still need local derivation. Server lease/status semantics and
  client date-based semantics are not interchangeable ([cost:35][cost],
  [quota-store:39][quota], [Image.scala:46][server-status],
  [syndication:42][client-status]).
- **Do not close U9 by documentation:** same-ID ordinary overlays survive AI
  completion. Existing synthetic tests demonstrate effective-cost divergence;
  recorded live evidence demonstrates retention but no sampled display divergence.
  U9-B owns replacement and pool metadata, including absence behavior
  ([U6z test:1055][test-ai], [backlog:416][kup030], [AI workplan:272][u9-overlay]).

**Recommended U10-B shape:** after U9-B, recheck only the affected owners, then
select field-wise derivation skipping as a small request-neutral change; separately
consider the bounded ticker contract/UI change for correctness. Server reason-copy
precedence is an independently selectable display correction. No endpoint change,
enrichment rewrite or speculative links/configuration work is justified here.
Section 8 names files, tests, costs and rejected alternatives.

## 2. Evidence Scope And Reading Rules

**C = code evidence; T = existing test-source assertions; R = previously recorded
execution.** T is not a new execution or proof that every consumer follows the
tested route. U10-A executed no application/test/runtime probe. Its only execution
is read-only repository inspection and documentation validation. R is qualified
by the original record, not promoted to current universal correctness.

Source references below enumerate the inspected ownership boundaries. Test ledger
T1-T14 records the relevant assertions and limits, not whole-suite certification.

| Boundary | Inspected evidence / limit |
| --- | --- |
| Server entities | POST page/window/mget construction, singleton GET, canonical writer, lean projection, cost, validity, status, alias extraction; not a fresh comparison with deployed configuration. [ImageQueryController:65][query-pages], [MediaApi:175][get-image], [ImageResponse:58][server-image], [ES:732][lean] |
| Counts/discovery | Configured extra-count construction and serialization, POST counts, legacy GET AI pool response, root links; no deployed capability query. [ES:55][ticker-config], [ES:444][ticker-server], [CollectionResponse:9][extra-count], [MediaApi:633][server-ai], [MediaApi:112][root] |
| Client transformation | Real current API/direct adapters, optional overlays, derivation and hook, quota/config/media helpers; dormant `GridApiDataSource.getImageDetail` is not the active standalone path. [adapter:35][map], [api:148][api-detail], [legacy adapter:50][legacy-detail] |
| Publication/consumers | Search, fill, both extensions, seek, centered focus and cursor restore; grid/table, resident/standalone detail, multi-image summary, selection cache, ticker UI/poll/typeahead and discovery initialization. See sections 5-6 for independent evidence. |
| History | Exact read-only `git show 38eb1d003` plus durable removal/revival records. Historical assumptions are not present-day source contracts. [changelog:5295][history-drop], [changelog:2841][history-revive], [changelog:2700][history-cleanup] |
| Existing runtime evidence | Bounded KUP-029/030 record and older page-publication validation, with topology/version limits retained. Not a new performance campaign or current server-policy audit. [backlog:408][kup029], [backlog:416][kup030], [changelog:714][history-publication] |
| Explicitly not covered | Fresh TEST/runtime data, post-U9 implementation, every permission/configuration combination, natural frequency of stale-display divergence, measured derivation CPU/frame savings, MLT, U7 delivery, KUP-037 or production migration. These are not implied by the inspected fixtures. |

### 2.1 Completeness Is Scoped

**Canonical image contract (I):** successful decoded POST search-after/window/mget
images use the same `ImageResponse.create` envelope. Scalar cost, validity/reasons,
persistence and status are written there; usages, leases and collections are
embedded from the indexed image. This is not a live read of each satellite service
or a snapshot guarantee across requests ([query:79][query-pages],
[query:215][query-mget], [ImageResponse:94][server-image],
[ImageResponse:328][server-writes]). Singleton GET uses the same builder but its
own visibility/read path ([MediaApi:798][get-image-source]).

**Lean contract (L):** POST reads omit `embedding`, `originalMetadata` and bulk
`fileMetadata` from the source projection, re-add configured alias leaves, and
strip dropped fields before decoding the image. Consequently a serialized empty
`originalMetadata` or null embedding is not evidence that the original record had
none. `fileMetadata` is link-only without `include`; the active client does not
request expansion ([ES:732][lean], [Image.scala:80][image-reader],
[ImageResponse:389][server-filemetadata], [adapter:156][singleton-api]).

**Execution completeness is not field completeness:** POST readers reject timeout
or failed-shard execution; malformed individual hits can still be omitted by
`resolveLeanHit`. Mget also omits hidden/unreadable images, and any client chunk
failure rejects the whole lookup rather than reporting its outstanding IDs missing
([ES:1079][complete], [ES:1250][server-mget], [adapter:172][mget]). The mapper uses
casts, not a runtime schema validator; a successful malformed payload is not
certified by TypeScript ([adapter:35][map], [adapter:72][extract]).

**Missing is not false or empty:** overlay `false`, `{}` and `[]` are meaningful;
`undefined` means that field was not supplied and `??` selects the fallback.
Separately, normalization currently defaults absent embedded usages/collections
to `[]` and leases to `{leases: []}`. That is mapper behavior, not proof that an
incomplete/malformed entity authoritatively asserts no relationships
([derive:106][derive], [adapter:49][map], [tests:215][test-extract]).

## 3. Configuration Layers And History

### 3.1 Current Layers

| Layer | Current owner | Consequence / planned M2a contrast |
| --- | --- | --- |
| UI/CQL vocabulary | Compiled `gridConfig` object: organisation, warnings, feature vocabulary, agency ingredients, ticker definitions and alias catalogue. [grid-config:35][config] | Not fetched from the root. API execution can use different server configuration; M2a must compare used controls, not infer configuration from sampled images. |
| Mode/proxies | Shell exports `VITE_USE_MEDIA_API`; Vite loads development env and defines `/api`, `/es`, `/s3`, `/imgproxy`. [start:639][start-mode], [vite:110][vite] | Current proxy target is local media-api. U8/M2a is the planned deployed-TEST API topology, retaining existing media delivery until U7 ([plan:143][plan-sequence]). |
| Scala configuration | Development loader reads local `.grid` files plus optional extra configuration; deployed paths use a separate file list. [GridConfigLoader:13][config-loader] | This is server configuration loading, not a browser configuration API. No private configuration files were read for this characterization. |
| Root discovery | Search-route effect -> singleton -> `/api` fetch; records relations, never populates `clientConfig`. [route:70][init-route], [discovery:49][discovery] | Root links are operation/resource descriptions, not organisation/alias/label catalogues. U9's proposed `ai-search` relation is absent from the current root ([root:112][root], [AI plan:213][u9-capability]). |
| Quota snapshot | Main calls `fetchQuotas`; plain module map, no subscription, refresh interval or expiry. [main:16][main-init], [quota:39][quota] | Required by current local cost/validity and direct filters. Optional API failure leaves no exceeded suppliers; that is a fallback assumption, not authoritative proof of remaining quota. |

### 3.2 What 38eb1d003 Removed, And What Replaced It

The inspected commit deleted `useEnrichment` and its tests, removed its route mount,
and widened `SOURCE_INCLUDES`; it changed derivation documentation, not the merge
algorithm. The removed mechanism was a debounced, visible-first `?ids=` background
loop with sequential offscreen batches and cancellation, not the current response
overlay pipeline ([removal record:5295][history-drop]). The commit also adjusted
E2E comments/docs; it did not delete the enrichment store or `deriveImage`.

That widening initially listed names such as `cost`, `valid`, `persisted` and
`actions`. It did not manufacture those fields in ES. The current allowlist instead
supplies rights, leases, usages and other baseline inputs; its old explanatory
comment still overstates server-computed baseline data ([es-config:56][source-fields]).
Local cost/validity, quota snapshot and date-based syndication derivation supply
the current direct path ([cost:35][cost], [validity:67][validity],
[syndication:66][client-status]).

D3 later revived overlays from already-returned canonical page entities. The
adapter returns a map and does not publish it; commit-to-view owners set/upsert it.
The later removal of unused `enrichByIds` did not remove that replacement
([revival record:2841][history-revive], [cleanup record:2700][history-cleanup],
[adapter:234][decode], [probe test:583][test-probe]). U6a added the independent
singleton overlay owner ([ImageDetail:244][standalone], [singleton tests:264][test-detail]).

Several historical comments are therefore not contracts: "overquota is API-only,"
"99% authoritative," "mirror-search supplies lease summaries," and "root discovery
is consumed by intent-driven detail" do not describe the current call paths. The
implementation evidence in rows 02, 13, 29-30 and T5 controls the characterization,
not those comments ([derive:8][derive-comments], [metadata:208][metadata],
[discovery:30][discovery], [legacy adapter:50][legacy-detail]).

## 4. Ownership Matrix

This is one matrix split into field groups for readability. **A** complete server
authority within the stated successful response/workflow; **B** workflow-specific
or partial server authority; **C** required direct/absence fallback; **D** available
but discarded/rejoined locally; **E** unavailable without a server contract.
Multiple letters identify distinct aspects, not an averaged confidence score.
In particular, A for an indexed list does not mean real-time satellite completeness.

Owner abbreviations are defined with exact code in section 5: **P** committed page
map, **S** singleton state, **H** selection metadata cache, **Q** count/poll state,
**R** root singleton. Consumers: **G** grid, **T** table, **D** detail/metadata,
**M** multi-image detail, **F** filters/typeahead. T1-T14 are the test ledger below.
An API read failure follows section 5's workflow behavior, not an implicit switch
to direct ES. "Fallback" below concerns the current image/field, unless stated otherwise.

### 4.1 Image Policy And Relationships

| # / Field / Class | Server wire source and completeness | Extraction; publication/lifetime | Consumers | Direct-mode fallback; API absence | Existing tests and exact limit | Duplicate work in successful API mode |
| --- | --- | --- | --- | --- | --- | --- |
| 01 Cost: free/conditional/pay **B,C** | I: `data.cost`; server merges root and user-edited rights specifically for cost, then applies server costing config. [ImageResponse:206][server-cost] | `extractEnrichment.cost`; P or S; H does not publish it. [extract:72][extract], [mget:172][mget] | G/T badges, D warnings, M cost buckets. [G:239][grid], [T:349][badges], [D:198][metadata], [M:311][multi-cost] | `calculateCost(image.usageRights, vendored config)` for absent overlay cost; never infer free from a failed API read. [derive:97][derive], [cost:35][cost] | T1/T2 cover precedence and partial fallback; not all permissions/configs or rendered workflows. | Cost executes directly and again in validity before server cost wins. Safe skip candidate only per field/group; section 7. |
| 02 Overquota **B,C** | I: cost may be overquota using server quota/config; validity quota is separately checked. [CostCalculator:12][server-cost-policy], [ImageExtras:54][server-validity] | Same cost overlay, not a separate Boolean. P/S freshness is request freshness, not a lease on future quota truth. [extract][extract] | Same G/T/D/M; M may use cached ordinary overlay on a hydrated image. [multi-cost][multi-cost] | Direct mode CAN calculate overquota from `quotaMap`; unavailable quota falls back to no exceeded supplier. Not full live parity. [cost:64][cost], [quota:24][quota-read] | T2/T7; T10 gives synthetic stale same-ID overquota. No live quota-change timing proof. | Local quota lookups still run beneath complete server cost/validity. Do not remove startup quota read: fallback consumers remain. |
| 03 `valid` **B,C** | I: Boolean from checks plus actual write permission/lease overrides; independent of whether reasons are nonempty. [ImageResponse:94][server-image], [ImageExtras:29][server-validity] | P/S optional Boolean; `false` is preserved by `??`. [derive:107][derive] | D validity banner; derivation also runs in G/T/M even where the Boolean is not displayed. [metadata:219][metadata], [grid][grid], [table][table], [multi-cost][multi-cost] | Client validity assumes write permission and date-checks leases. Do not replace it with `true` merely because API data is absent. [validity:67][validity] | T1/T2 assert false wins; T7 is local policy, not permission parity. | Full validity map and reduction still run. A lazy map is needed if either `valid` OR `invalidReasons` is absent. |
| 04 `invalidReasons` membership **B,C** | I: all failing checks, including overridden ones, not just blockers. [ImageExtras:84][server-reasons] | P/S object; server `{}` replaces local reasons. [derive:108][derive] | D warning list; not a substitute for `!valid`. [metadata:219][metadata] | Local map when missing; API failure is not an authoritative empty map. [validity:149][validity-reasons] | T1/T2 cover overlay replacement and fallback; T7 covers local override semantics only. | Map construction, reason-object construction and validity reduction happen even with both overlay fields supplied. |
| 05 Reason descriptions **D,C** | Server custom descriptions override server defaults. [ImageExtras:84][server-reasons] | Strings retained unchanged by extractor. [extract][extract] | D then uses `VALIDITY_DESCRIPTIONS[key]` before server text, replacing custom text for known keys. [ImageMetadata:289][reason-copy] | Local descriptions required for local derivation; an unknown server key displays its supplied description. [validity:44][validity-copy], [reason-copy][reason-copy] | T1 proves string extraction, not banner text. No inspected mounted banner test establishes custom-copy precedence. | Local lookup is cheap; issue is message correctness, not a demonstrated performance bottleneck. |
| 06 `usageRights` root **B** | I writes `image.usageRights`, with custom usage restrictions; do not describe this as a guaranteed request-time merge of all edit overrides. Cost performs its own merge. [ImageResponse:345][server-writes], [ImageResponse:292][server-restrictions], [ImageResponse:206][server-cost] | Same `data.usageRights` supplies normalized image AND overlay; no reconstruction in mapper. [map][map], [extract][extract] | D effective rights; G/T borders/badges; M reconciliation uses cached raw images while cost uses derive. [metadata][metadata], [table][table], [multi-rights][multi-rights] | Direct uses source rights. Absent overlay retains image rights, not `{}`. [derive][derive] | T1/T2; R1 ordinary same-entity equality is bounded evidence, not global rights correctness. | Overlay assignment duplicates a reference, not a rights merge. Do not invent a rights reconciliation rewrite. |
| 07 Edited/original rights **A within I/L** | I carries `userMetadata` edits and `originalUsageRights`; user override data can be absent. [server-writes][server-writes], [ImageResponse:232][wrap-edits] | Edits unwrapped separately; no automatic overlay onto root rights. P/S/H image lifetime. [map:35][map] | D/G/T/M consume selected normalized fields; rights label specifically uses row 06, not an automatic edit merge. [metadata:204][metadata], [multi-rights][multi-rights] | Direct projection is narrower; absent override means not supplied, not a command to clear root rights. [source-fields][source-fields] | T1 normalization preserves unset overrides; not proof every historic indexed root has edits applied. | No client merge to delete; `mergeReconciledFields` in old adapter is also identity-only. [argo:82][argo-identity] |
| 08 `noRights` presentation flag **C,B** | No separate canonical wire flag in I; client checks category. [server-writes][server-writes], [derive:101][derive] | Always computed from baseline image, not overlay rights. P/S/H-derived. | G/T cost badge and M bucket. [badges][badges], [multi-cost][multi-cost] | Required cheap derivation; ordinary API root/overlay share the same rights source. Different-source overlays remain possible through AI/cache lifetime. | T2 intentionally asserts baseline-only behavior; KUP-029 ordinary-path premise is refuted (R1), KUP-030 remains separate. | One category check. Not a justified independent repair or optimization. [kup029][kup029] |
| 09 `persisted.value` and reasons **B** | I: `imagePersistenceReasons`, Boolean plus reasons; not deletability. [ImageResponse:49][persistence], [ImageResponse:225][persisted-wire] | Extracted P/S. H scalar survives raw spread but `deriveImage` assigns overlay-only `persisted`, so no own-overlay hydration guarantee. [map][map], [derive:118][derive] | G/T archive icon; no corresponding M persisted summary shown by `CostSummarySection`. [grid][grid], [badges][badges], [multi-cost][multi-cost] | No local derivation in this pipeline. Missing overlay means unavailable icon/data, not persisted=false. | T1/T2/T5 preserve true/reasons; no full configuration/deletion matrix or all-consumer display test. | No local persistence-policy calculation to remove. |
| 10 `syndicationStatus` **B,C** | I: `Image.syndicationStatus`: rights, usage, lease presence; both allow+deny resolves to review. [Image.scala:46][server-status] | P/S overlay wins; H lacks own overlay. [extract][extract], [derive][derive] | G/T badge. D separately derives rights/lease warnings, not a promise to duplicate the badge state. [grid][grid], [badges][badges], [metadata:229][metadata] | Client uses active dates and gives active deny priority; not identical to server existence checks. [client-status][client-status] | T2 overlay wins; local syndication tests are not cross-server equivalence proof. Small discriminator: both lease types plus expired/future dates. | Local status and lease scans run before server status wins. Skip only the unused local status, not D's separate lease warnings. |
| 11 Embedded usages **A indexed; B consumers** | I always serializes indexed usages as doubly embedded entities; no satellite refresh guarantee. [ImageResponse:375][embedded] | Mapper unwraps into `image.usages`; extractor separately unwraps into overlay.usages. P/S/H raw, P/S overlay. [map][map], [extract][extract] | G/T prefer `enrichedUsages`; detail `UsagesSection` receives raw `displayImage.usages`; sidebar does likewise. [grid:248][grid], [badges][badges], [detail:874][detail-usages], [route:402][sidebar-usages] | Direct indexed usages; missing overlay retains raw list. Missing wire relationship currently normalizes to [], not proven authoritative absence. | T1 full relationship fixture; no proof of real-time usage completeness or every displayed platform. | Doubly unwrapped twice per entity; icon platform/recent-date scans are presentation work not supplied as canonical flags. Not a new network request. |
| 12 Embedded leases **A indexed; C display** | I contains lease records including stored `active`; not an always-current wall-clock claim. [embedded][embedded], [ImageExtras:38][server-validity] | Raw normalized `image.leases`; no lease overlay extraction. P/S/H. [map:53][map] | D lease cards/counts/warnings; M active/pending aggregation. [metadata:208][metadata], [multi-rights:409][multi-rights] | Both modes use `isLeaseActive` dates for these displays. Missing raw list normalizes empty, subject to I/L caveat. [client-status:42][client-status] | T1 preserves full records; T2's fabricated summary is not a producer test. No certified time-driven rerender. | Date-based display scans are deliberate client semantics, not waste just because stored `active` exists. Keep. |
| 13 Lease summary/counts/allow flag **C** | No `leasesSummary` scalar emitted by I; lease records allow client derivation. Old background extractor computed one, current extractor does not. [server-writes][server-writes], [extract][extract], [history-drop][history-drop] | Optional type survives, but P/S never supply it from current mapper. [enrichment:24][overlay-type] | D has raw-list fallback; G/T cost leased styling and M cost gradient read only the summary. M's separate lease rows use raw records. [metadata][metadata], [badges:389][badges], [multi-cost:325][multi-cost] | Do not treat absent summary as authoritative "no lease". No direct summary producer. | T2 injects a summary and tests pass-through only. T1 exact extractor assertion contains no summary. Consumer gap needs a mounted raw-lease fixture. | Current API path is not calculating this summary twice. Adding one is a behavior change, not redundant-work removal; no new server scalar is inherently necessary. |
| 14 Embedded collections: membership/path/date **A indexed** | I embeds path, pathId, description, colour, actionData; indexed membership, not collection-tree transport. [ImageResponse:377][embedded], [CollectionResponse:449][collection-wire] | Collection `.data` normalized into image; P/S/H. Wrapper URI/remove action lost. [map:58][map] | G badges, registry-driven T/D/M collection fields and dates. [G:340][grid-collections], [registry:769][registry-collections] | Direct projection supplies path/pathId/date, not a complete tree. Failed image request does not mean no collections. [source-fields][source-fields] | T1 preserves multiple collections and action dates; no KUP-037 scope certification. | Path labels are presentation; no parallel collection membership fetch added by this mapper. |
| 15 Embedded collection colour **D,C** | I `collections[].data.cssColour` from server collection helper. [collection-wire][collection-wire] | Retained by `.data` mapping. P/S/H. | G instead joins `collectionColours[pathId]` from loaded tree, then `#555`. [G:343][grid-collections], [G:651][grid-colours] | Current tree/default fallback also serves direct mode. Wire omission is not "no colour configured." | T1 preserves colour, not rendered colour precedence or tree inheritance parity. | Rejoin exists, but tree serves other workflows; preferring entity colour would not by itself remove the tree request. Not a free transport win. |
| 16 Per-image actions **B; D unused** | I envelope `actions`, permission/tier filtered; absence of delete is not derived from persisted. Singleton also returns actions. [ImageResponse:164][server-actions], [MediaApi:184][get-image] | Extractor reads envelope, P/S retain; H drops envelope actions. [extract][extract], [mget][mget] | `deriveImage` passes through; inspected G/T/D/M renderers do not execute them. [derive][derive], [grid][grid], [badges][badges], [metadata][metadata], [multi-cost][multi-cost] | No manufactured actions when absent; authorization remains server-side. | T1 asserts correct envelope location; T5 singleton retains actions. No editing workflow covered or authorized. | No client action-policy computation to remove. Extra retention alone has no present observable benefit. |
| 17 Per-image links and nested resource controls **D** | I envelope links include validity/write-gated relations, optimized media, usages/leases/file metadata; nested collections/edits have controls too. [ImageResponse:146][server-links], [embedded][embedded] | Page/singleton decoders pass only data and actions into retained shapes; `.data` unwrapping discards nested control envelopes. [map][map], [singleton-api][singleton-api], [decode][decode] | No current relation-driven consumer in G/T/D/M; active APIs use fixed proxy paths. [api-detail][api-detail], [thumb][thumb] | Direct mode lacks server controls. Missing/dropped link cannot establish denied permission. | T5 supplies a `crops` link but does NOT assert retention. Add nonmatching envelope/data link controls only if a consumer is selected. | No redundant computation identified; retaining unused links increases retained data without eliminating requests. Defer. |

### 4.2 Media, Aliases And Configuration

| # / Field / Class | Server wire source and completeness | Extraction; publication/lifetime | Consumers | Direct-mode fallback; API absence | Existing tests and exact limit | Duplicate work in successful API mode |
| --- | --- | --- | --- | --- | --- | --- |
| 18 Thumbnail URL **D,C** | I optional thumbnail with secure URL; builder chooses configured CloudFront or signed URL. [ImageResponse:85][server-image] | Asset retained in normalized image; P/S/H. [map][map] | G/T/detail media helpers use `getThumbnailUrl`, not returned URL. [image-urls:50][thumb] | ID-based local S3 proxy when enabled; otherwise undefined. Not a server-data absence verdict. | T1 preserves assets; T5 media failure tests use mocked URLs and cannot prove canonical delivery. | Server URL is already produced; client builds proxy path. Switching is U7, not an automatic speed improvement. |
| 19 Full/source URL **D,C** | I `source.secureUrl` is signed source media; not a promise that full original is suitable for screen display. [ImageResponse:82][server-image] | Retained P/S/H but unused by current full-image builder. [map][map], [full:215][full] | Detail/fullscreen use transformed image URLs; see current builder options. [full][full] | Imgproxy size/DPR/orientation/format policy, or undefined without proxy/bucket. | T1 proves retention only; no payload/latency parity measurement for original versus transformed asset. | Local URL construction is cheap and avoids blindly requesting originals. Keep until U7's delivery decision. |
| 20 Optimized/crop assets and media links **B,D** | I optimized PNG is optional; exports are serialized; optimized/download relations carry distinct transforms/gates. [server-image][server-image], [server-links][server-links], [server-writes][server-writes] | Data assets retained; envelope optimized/download links discarded. P/S/H. | Current full/zoom builders independently choose transformations. [full][full] | Existing local delivery remains baseline. Missing optimized media does not imply missing original. | T1 preserves optimized/export data, not server-link execution or image quality. | Do not replace transformation work with a raw URL on "server authority" grounds. U7 owns this comparison. |
| 21 Alias values **A per returned value; B keyset** | `data.aliases` projects configured paths present on that image; absent normal fields omitted, match-via-existence aliases explicitly false if absent. [ImageResponse:424][aliases-server] | Spread retains JSON values, including false/0/empty/null; registry prefers non-null alias then direct raw path. P/S/H. [map][map], [registry:969][aliases-client] | Known registry fields in T/D/M, cursor code and content-warning heuristic. [aliases-client][aliases-client], [graphic:56][graphic] | Direct raw paths where projected. Unknown/missing alias key is not proof the server lacks that configuration. | T1 JSON preservation; T9 server presence/existence tests and client raw-path tests; not full deployment catalogue coverage. | Value formatting and fallback path lookup, not re-extraction of an available scalar. Retain. |
| 22 Alias catalogue/labels/options **E; C current config** | No catalogue in I or root. Per-image values omit labels, ES paths, hints, display policy and absent ordinary aliases. [aliases-server][aliases-server], [root][root] | Registry/typeahead built from compile-time `fieldAliases`. [config:163][config-aliases], [aliases-client][aliases-client] | T/D/M columns, CQL hints/search/sort vocabulary. | Current config required in both modes. Cannot infer catalogue or defaults from an empty page or image sample. | T9 exercises a chosen config, not discovery. Small check: configured field absent from every fixture still needs its label/path. | Not redundant computation: missing contract. Any runtime config resource is a separate design decision. |
| 23 Core metadata and edited metadata **A within I/L** | I serializes root metadata and separately wrapped edits; lean reads omit original metadata, not current metadata. [server-writes][server-writes], [lean][lean] | Mapper unwraps edited labels/metadata/photoshoot/archived, retains root metadata; P/S/H. [map:35][map] | Registry-driven G/T/D/M. Root display does not reconstruct original+edits. [grid][grid], [registry-collections][registry-collections] | Direct allowlist is narrower; fields outside it are unavailable, not empty by authority. [source-fields][source-fields] | T1 empty edits, root fields and no mutation; does not certify every deployment-specific metadata field. | No duplicate metadata merge; old `mergeReconciledFields` is identity. [argo-identity][argo-identity] |
| 24 Expanded file metadata **B** | Singleton can include file metadata on explicit include; POST L strips bulk metadata before canonical writing, retaining alias leaves separately. This is workflow omission, not universal lack of a server contract. [server-filemetadata][server-filemetadata], [lean][lean] | Mapper handles expanded/link-only/absent distinctly, but current image reads send no include. P/S/H image property can be undefined. [map][map], [singleton-api][singleton-api] | Existing alias fields cover selected additional metadata, not the full original file payload. [aliases-client][aliases-client] | Direct only selected paths. No automatic follow-up fetch on undefined. | T1 covers expanded, empty-expanded, link-only and absent mapper shapes, not actual expanded POST completeness. | None to remove. Do not add per-image metadata requests to make a matrix cell look complete. |
| 25 Content-warning classification **C,B inputs** | POST lean wrapper does not supply a classification Boolean; configured alias may provide one input. [lean][lean], [graphic:46][graphic] | Client reads raw XMP or alias plus metadata and preference; no current overlay field. [graphic][graphic], [overlay-type][overlay-type] | G blur; shares client helper semantics. [grid:243][grid] | Required client heuristic in both modes; missing alias does not establish no configuration. | T9 alias fixture tests concern presence semantics, not live config completeness. | Existing client computation has no equivalent returned POST Boolean to replace it. Keep; not an enrichment rewrite. |
| 26 Presentation/config vocabulary **E,C** | No runtime `clientConfig` at current root. [root][root] | Local organisation/categories/agency ingredients/warning text/download/reaper/image-type flags. [config][config] | F hints and predicates; D warning copy; G/T styling. [typeahead-tickers][typeahead-tickers], [metadata:235][metadata] | Keep local settings until an explicit config source exists. API absence is not evidence that each flag is false. | Current fixture/config tests do not certify deployed configuration equality. M2a remains the bounded comparison. | Client presentation and direct-query policy are real work, not duplicate server output merely because related filters exist. |

### 4.3 Counts, Discovery And AI

| # / Field / Class | Server wire source and completeness | Extraction; publication/lifetime | Consumers | Direct-mode fallback; API absence | Existing tests and exact limit | Duplicate work in successful API mode |
| --- | --- | --- | --- | --- | --- | --- |
| 27 Ticker value **B; A counted scope** | POST count: `tickerCounts[name].value`, exact execution admitted or refused; server configuration controls available aggregations. [ES:55][ticker-config], [ES:1130][server-count] | Value retained; Q initial count plus frozen-baseline/arrival composition. [api-count][api-count], [poll][poll] | StatusBar/F only for locally recognized definitions. [status-tickers][status-tickers], [facet-tickers][facet-tickers] | Direct computes equivalent-shaped counts with local definitions. Missing count result stays null, not zero. [es-count][es-count], [fresh-count][fresh-count] | T8/T11 count/refusal/poll assertions; not live server/client config parity or a frozen multi-request snapshot. | No duplicate local counting in API mode; local display join remains. Initial page+count are separate purposes, not proved redundant. |
| 28 Ticker names/enabled set/order **D,B** | Returned map keys identify configured tickers; no explicit UI ordering/catalogue contract. [ticker-config][ticker-config], [extra-count][extra-count] | Map keys retained, but StatusBar iterates local `tickerDefinitions`, omitting unrecognized returned keys. Q/local module. [status-tickers][status-tickers] | StatusBar/F. | Direct catalogue remains local. An unavailable map is not the same as an explicitly empty map. | T8 uses familiar names; add server-only name, no local-name return, {} and unavailable controls. | Local rejoin can hide available data. Preserve stable presentation ordering without claiming JSON object order is a UI contract. |
| 29 Ticker clause **D** | Server `searchClause` accompanies each value; current constructors use `is:` clauses, generic type is a string. [ticker-config][ticker-config], [extra-count][extra-count] | DAL type omits it; API mapper strips it; poll reconstruction would strip it again. [dal-types:106][ticker-type], [api-count][api-count], [poll][poll] | StatusBar applies local clause; F joins local `is:` mappings. [status-tickers][status-tickers], [typeahead-tickers][typeahead-tickers] | Direct needs local predicate. Missing server clause must not silently become a made-up `is:<name>` filter. | T8 explicitly expects omission; T11 count math does not exercise clauses; T12 remounts do not establish server-defined clauses. | Avoidable join/config skew, not duplicate search execution. Full-clause semantics need a bounded support rule (section 8). |
| 30 Ticker colour **D** | `backgroundColour` accompanies value. [ticker-server][ticker-server] | Same losses as clause; local colour rejoined in both badge and facets. [api-count][api-count], [poll][poll], [facet-tickers][facet-tickers] | StatusBar/F. | Direct local colour; absent API metadata needs explicit fallback, not fabricated server authority. | T8 wire has a colour but expected DAL result excludes it. No inspected rendered custom-colour test. | Little CPU benefit; correction would prevent local presentation disagreement with returned metadata. |
| 31 Ticker sub-counts **A bounded buckets; B composition** | Optional map: top nine suppliers plus `other`; not all supplier identities or a configuration catalogue. [ES:65][ticker-config], [ES:450][ticker-server] | Retained; Q merges baseline plus arrival maps; tooltip sorts positive entries. [api-count][api-count], [poll][poll], [StatusBar:36][ticker-tooltip] | StatusBar tooltip. | Direct terms aggregation supplies matching shape. Absent sub-counts do not mean no matching images. | T8/T11 assert maps/merge ownership; no proof top-N identity changes yield a complete recomputed supplier distribution. | Client sorting and merging express presentation/lifetime, not replacement of a server-provided full distribution. Keep bounded semantics. |
| 32 Root HATEOAS links **D,B** | Root `links[]`; mixes unconditional resource relations and conditional ones. No clientConfig. [root][root] | R stores rel->href once; search route initializes it. Current active page/singleton adapters use hardcoded proxy paths; `imageUrl` also uses a fixed path. [init-route][init-route], [discovery][discovery], [singleton-api][singleton-api] | No application call site found for getLink/getLinks/getClientConfig; legacy adapter only uses imageUrl. [legacy-detail][legacy-detail] | Initialization failure is swallowed; `initialised=true` prevents retry. Concurrent callers do not await a shared pending promise. | T14 old adapter tests exercise URL/error behavior, not root loading/retry/concurrency or a current consumer. | One otherwise-unused discovery request currently remains; do not delete/rebuild it while U9 is about to own its first capability consumer. |
| 33 Root conditional capabilities **B,D** | Loader gated by upload permission, archive by archive permission, capiUsages by config; other relations are not universal permission grants. [root:119][root] | Stored but unused as above. | No current generic capability UI. Pending AI gating is row 38. | Failed/not-loaded discovery and successful root omission are indistinguishable through getLink alone; do not call both authoritative denial. [discovery:100][discovery] | T14 lacks the three-state readiness distinction. Proposed minimal check: delayed success, failure, successful omission. | No client capability-policy duplicate identified. Never replace server authorization with relation presence. |
| 34 Quota snapshot/control **C,B** | Optional `/api/usage/quotas` store of exceeded suppliers. [quota:28][quota] | Main fetches once; module map reads synchronously, no reactive invalidation; separate from P. [main-init][main-init], [quota][quota] | Cost/validity fallback; direct under-quota query support remains a distinct use. [cost][cost], [validity][validity], [cql:443][quota-query] | Failure keeps current map (initially empty); false means fallback interpretation, not verified quota headroom. | T7 tests map/fetch logic, not alignment with image-response quotas or rerender after delayed startup. | Full-overlay reads of map can be skipped with derivation; removing the request is not justified for mixed fallback consumers. |
| 35 AI fixed-set membership/rank/total **B,C current; post-U9 pending** | Legacy server GET has canonical ranked entities; current Kupua does not use it for AI. Planned U9 uses server order. [server-ai][server-ai], [u9-rank][u9-rank] | Current ES AI returns <=200 hits, `__aiScore`, synthetic tuples, no overlay; store total=hits.length. [es-ai:1107][es-ai], [ai-store][ai-store] | Shared G/T/D/M and ordinary total display. | Current direct ranking remains; API mode delegates to it pre-U9. No claim of browser-ES elimination yet. | T10 asserts current delegation; T13 empty completion is current behavior, not U9 adapter proof. | Returning canonical API hits would eliminate browser ES/Bedrock only when U9 is implemented; not a U10 cleanup. |
| 36 AI pool total **D current client omission; post-U9 pending** | Server legacy AI response carries pool total, distinct from returned hit count; filters-only response has separate filteredPool metadata. [MediaApi:633][server-ai] | Current DAL/store has no `aiPoolTotal`; published total is hit count. Planned U9 adds distinct result/store field. [ai-store][ai-store], [u9-pool][u9-pool] | Current StatusBar displays fixed-set count, not Best k of N. [status:162][status-total] | Post-U9 direct path must repurpose its existing count request for prefilter-pool scope. Current count is returned-ID scoped. [ai-store:2276][ai-store], [u9-client][u9-client] | T10/T13 current totals; post-U9 pool/nonempty/empty/absence/cache tests pending. | Planned API consumption removes a client count request; direct pool count has broader server cost, assigned U9 timing comparison, not assumed faster. |
| 37 AI pool tickers and current AI enrichment **B current; post-U9 pending** | Server legacy GET already emits pool tickers and canonical image enrichment. [server-ai][server-ai] | Current AI publishes no overlay and sends returned-ID-scoped count through app datasource. Same-ID P overlay may survive; no TTL/generation tag. [ai-store][ai-store], [overlay-store][overlay-store] | G/T/D/M may consume retained overlay; StatusBar/F see top-hit-scoped counts today. | Current direct path same fixed-set count policy; missing AI overlay does not clear earlier entries. | T10 explicitly demonstrates retained overquota and unchanged hydration map; R2 limits live conclusions. No post-U9 certification. | U9 plans complete current AI overlay replacement and direct server tickers, dropping API post-AI count. Not a second U10 enrichment project. [u9-overlay][u9-overlay], [u9-pool][u9-pool] |
| 38 AI availability and graceful absence **C current; E pending contract** | Current root has no `ai-search`; U9-A proposes gated relation. [root][root], [u9-capability][u9-capability] | Current main probes Bedrock for both modes; U9-B plans mode-aware capability and nullable AI result. [main-init][main-init], [u9-absence][u9-absence] | AI input subscribes to Bedrock availability; current failed search sets error and can toast on 503. [AiSearchInput:82][ai-availability], [ai-store:2293][ai-store] | U9 absence must clear current AI result/pool/tickers/overlay safely, without ES rescue. This is a planned contract, not current behavior. | Existing AI error/source tests do not validate nonexistent API nullable path; delayed root, absent relation, refusal and stale completion checks remain U9 work. | Avoid browser Bedrock probe in future API mode; decide readiness/caching in U9, not a generic discovery framework. |

## 5. Independent Workflow And Lifetime Coverage

**Owners:** P is `enrichment-store.data`, an ID-only in-memory Map: replacement
sets the entire map; upsert overwrites an ID's whole overlay object, not just its
present fields; an empty upsert is a no-op. It has no query key, TTL or eviction hook
([enrichment-store.ts:74][overlay-store]). S is `ImageDetail` state keyed by requested
image ID with cancellation; H is selection's reusable metadata cache, whose membership
repair is guarded independently from late metadata reuse ([standalone][standalone],
[selection:590][hydrate]). Q is search-store count/poll state with generation and
accepted-sequence guards ([poll][poll]). R is the discovery instance with a Boolean
one-shot initialization flag ([discovery][discovery]).

| Workflow | Image / overlay publication and consumer evidence | Empty, failed or stale distinction / exact evidence limit |
| --- | --- | --- |
| Fresh ordinary search | First page and count run in parallel; after generation check, page overlay replaces P, then results publish. [search:2318][fresh-count], [search:2470][fresh] | Successful empty page has an empty Map and clears P. Missing overlay from a direct result does not clear P. Failure sets error and retains prior committed results, not ES rescue. T3/T4; no universal successful-payload schema validation. |
| Scroll-mode fill | Each nonempty page with cursor upserts P before append; abort checked after await. [search:1044][fill] | Empty page or missing next cursor breaks before overlay publication; failure does not mean remaining data is empty. No overlay pruning with buffer growth. T3 publication plus source; add a field-specific fill fixture for stronger display certification. |
| Forward extension | Current range signal guards response; nonempty page upserts then appends/evicts images. [search:2592][forward] | Empty response leaves P unchanged; eviction removes images/positions, not their overlays. Refused/unavailable read retains committed buffer/P (T4). |
| Backward extension | Merges normal backward page and optional valued-end boundary page, then upserts at commit. [search:2726][backward] | Aborted/failed pair is not partial success; trimmed/evicted image entries need not be removed from P. T3/T4 and boundary source, not every field/lease state rendered. |
| Seek: shallow, mapped, deep | Page adapter carries map; both contributing directions are combined, committed seek upserts P. [search:3114][seek-pair], [search:3624][seek-pair-deep], [search:3807][seek-commit] | Cancellation tests cover mapped/deep pages; no publication from discarded pages. P still contains earlier-page entries. T3/T4 distinguish stale completions from cache lifetime. |
| Sort-around-focus: target in first page | Uses fresh-search replacement path; field owner is that committed page. [search:2375][fresh-focus], [fresh][fresh] | Same failure/empty rules as fresh ordinary search, not a separate background enrichment. |
| Sort-around-focus: centered target | Probe entry for chosen target plus forward/backward maps form one buffer result; only commit upserts. Initial page is withheld. [search:1360][around], [search:1841][focus-commit] | Missing/failing/timed-out focus can commit first-page fallback using replacement, not upsert. T3 directly tests target, both neighbors, cancellation and fallback; not all policy fields. |
| Cursor/history restore | Fresh target lookup supplies target overlay; selected tuple/rank and neighbor pages complete before guarded upsert. [search:3952][restore] | Abort AND search-generation guards; missing target does not synthesize overlay absence. Failure may fall back to API seek. Retained cursor is not retained policy truth. T3/T4. |
| Grid rendering | One `useEnrichedImage(image)` per cell, memoized by image/overlay identity; derived badges/borders, raw media/collections. [G:217][grid], [hook:27][hook] | Missing overlay computes fallbacks. No independent policy refetch or time/quota subscription supplied by this hook. T1/T2 are not mounted all-badge coverage. |
| Table rendering | Each row derives once; custom field renderers get enriched image, ordinary raw values use original row. [T:279][table], [registry:349][badges] | Do not call every table value overlay-driven. Same identity memoization; T1 mapping/registry tests do not certify every visible column. |
| Resident detail and sidebar | Resident image wins, so no singleton fetch. Metadata reads P; usages section reads raw image usages. [detail:200][resident], [detail:869][detail-usages], [route:402][sidebar-usages] | Same-ID P can outlive its producing query. T5 asserts no singleton while traversing resident images; metadata handoff tests do not render the real warning/badge UI. |
| Standalone detail | App datasource GET returns image+overlay; S passes own overlay without publishing into P. Hook chooses own overlay as a whole, not a field merge with P. [singleton-api][singleton-api], [standalone][standalone], [hook][hook] | Wrong response ID is absent; old requests cancelled/ignored; all component lookup failures become requested-ID-bound unavailable state. If no own overlay is supplied, hook can consult P. T5 covers identity and precedence. |
| Multi-image detail | Cost summary derives each cached image with P by ID; rights/leases/reconciled fields use raw cached images. [multi-cost][multi-cost], [multi-rights][multi-rights] | Mixed P coverage is possible; no own singleton overlay for out-of-buffer selection. A generated `leasesSummary` test fixture does not prove current leased-cost styling. T2/T6, with mounted gap in G4. |
| Selection mget / hydration | App datasource posts IDs in chunks of 200, at most four in flight. H receives normalized images only; neither `ensureMetadata` nor `hydrate` writes P. [mget][mget], [selection:538][ensure], [hydrate][hydrate] | Failure preserves membership / leaves metadata pending. Successful omission may repair membership only for captured Set+anchor; late image metadata remains reusable. No selection-enrichment expansion. T6/T10. |
| Ordinary -> AI -> ordinary | Ordinary replaces P; AI bypasses publication; returning ordinary replaces P on fresh path (or overwrites committed IDs on centered path). [fresh][fresh], [ai-store][ai-store], [focus-commit][focus-commit] | Same-ID AI can consume old P even though stale network completions are guarded. T10 synthetic divergence, R2 live retention. Post-U9 replacement pending. |
| Empty ordinary / empty AI | Ordinary empty canonical page replaces P with empty Map. AI empty publishes empty results/counts/facets but leaves P untouched. [fresh][fresh], [ai-store:2234][ai-store] | No visible AI image in that empty set, but cache is not cleared by it. T13 empty transport/count controls are not an overlay-lifetime test. |
| Refused / unavailable ordinary reads | Adapter classifies errors; current main image paths reject, never substitute an overlay-less ES result. [adapter:200][read-failure], [api:162][api-pages] | Store may expose error while preserving committed state; literal "every failure returns null" is NOT the present ordinary-page contract. T4 explicitly tests nonempty retained state and first-page error. Do not silently change recovery under U10. |
| Stale completion | Search generation, range signals, focus signals and S cancellation own different operations. Adapter extraction itself does not touch P. [fresh-count][fresh-count], [restore][restore], [standalone][standalone], [decode][decode] | Tests reject stale probes/paired pages and obsolete singleton completions (T3/T5). That does not certify an epoch-scoped cache or atomic cross-store React rendering. |
| Optional counts/discovery absence | Initial count failure -> null tickers; polling failure preserves accepted values and does not turn arrivals into complete baseline. Root failure -> empty cache with initialization consumed. [fresh-count][fresh-count], [poll][poll], [discovery][discovery] | Explicit zero/{}, unknown/null and stale-but-retained are different. T8/T11 cover counts; no equivalent root concurrency/recovery test found in inspected surfaces. |

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
not authorization to expand selection enrichment ([backlog:422][kup030]).

## 6. Existing Tests And Executed Evidence

All T entries are **read, not run in U10-A**. References name existing homes for
future focused discriminators. A fixture is not an endpoint completeness proof.

| ID | Existing test evidence | Exact limit / update implication |
| --- | --- | --- |
| T1 | [grid-api-search-adapter.test.ts:129][test-extract], [235][test-merge], [390][test-map], [583][test-probe]: extraction, full/partial precedence, empty edits, expanded/link-only metadata, alias JSON values, relationship/assets retention, tuples and no probe publication. | Synthetic responses; not all endpoints/configs, no runtime schema validation or mounted UI. Exact enrichment object excludes summary/links. Proposed link/summary additions would change that assertion. |
| T2 | [derive-enriched-image.test.ts:27][test-derive], [hook tests:12][test-hook], [enrichment-store.test.ts:10][test-overlay-store]: fallback/override semantics, baseline-only noRights, own-overlay precedence, map replace/upsert. | They assert outputs, not absence of wasted computation. Lease summary is injected, not produced by the adapter. noRights assertion must remain unless a separately justified semantics change is selected. |
| T3 | [search-store.test.ts:1004][test-publication]: target and both neighboring overlays, mapped/deep backward seeks, abandoned probes/pages, missing/failure/timeout first-page fallback. | Mock datasource marks only selected fields. Proves publication wiring for named paths, not every field, every consumer, all frame-level coherence or post-U9 AI. |
| T4 | [search-store-api-mode.test.ts:314][test-restore-abort], [581][test-count-publication], [756][test-failures]: composed API/store cancellation, count publication/absence, first-page and extension/seek failures retaining state. | Controlled transport, not live timeout/permission incidents or complete UI field coverage. Tests intentionally require errors rather than false empty ordinary success. |
| T5 | [api-data-source.test.ts:220][test-singleton], [ImageDetail.test.tsx:209][test-detail-identity], [264][test-detail], [hook tests:12][test-hook]: GET normalization, wrong-ID/404/refusal/unavailable/cancellation, A-B-C-A identity, own overlay handoff, no resident singleton. | Component tests use a metadata stub; they prove ownership/handoff, not real banner text or every field's rendering. Singleton fixture contains links without asserting their preservation. |
| T6 | [api-data-source.test.ts:296][test-mget], [U6z test:1117][test-ai]: 200-ID/four-flight normalization, omitted ID, empty request, whole-lookup failure/cancellation, hydration leaves P unchanged. | Does not certify all selected display fields or live missingness. No extra selection policy is implied by retaining late metadata. |
| T7 | [quota-store.test.ts:37][test-quota], [validity-map.test.ts:76][test-validity]: startup/map failure controls and quota reason controls, including excluded-collection overquota. [derive tests:27][test-derive] cover local fallback. | Local quota/config fixtures, not comparison against current server configuration or delayed quota re-render. Removing quota use requires more than a complete page overlay fixture. |
| T8 | [api-data-source.test.ts:636][test-count], [ImageQueryControllerTest.scala:691][test-server-count]: wire metadata, empty ticker map, incomplete/refused count handling; client expects only value/subCounts. | Server controller harness injects raw count results; client fixture strips metadata intentionally. Does not render unknown ticker names or prove deployed clauses/colours agree. |
| T9 | [ImageResponseTest.scala:98][test-alias-server], [field-registry.test.ts:153][test-alias-client], [graphic-image-blur.test.ts:129][test-graphic], [image-offset-cache.test.ts:101][test-alias-cursor]. | Configured value/existence projection and chosen client paths; not a runtime catalogue, all deployments or a licence to infer alias metadata from images. |
| T10 | [search-store-api-mode.test.ts:1055][test-ai]: actual current adapter/store delegation over controlled transport, fixed-set totals, retained same-ID overquota, unchanged selection overlay map and ordinary replacement. | Pre-U9 characterization deliberately asserts the old behavior. U9 must update it, not carry it forward as acceptance for the replacement. No natural live display divergence proven. |
| T11 | [search-store.test.ts:152][test-poll]: baseline+arrival counts/sub-counts, repeated polls, newer completion wins, failures, unknown versus zero baseline. | Payloads have no clause/colour metadata. Ticker normalization must add preservation assertions without weakening count math or request-count assertions. |
| T12 | [e2e/local/cql-search-quoting.spec.ts:123][test-cql-e2e]: current count callbacks across repeated Clear/Home remounts. | Existing browser test source only; not executed here, not a server-defined ticker catalogue/clause/colour test. Reuse this workflow if ticker controls change. |
| T13 | [es-adapter.test.ts:161][test-ai-empty] and [search-store-api-mode.test.ts:1055][test-ai]: current empty AI count suppression and nonempty transition. | Not an `aiPoolTotal` contract or post-U9 nullable API completion test; those owners do not exist yet. |
| T14 | [grid-api/grid-api-adapter.test.ts:160][test-legacy] exercises the legacy standalone adapter. Active path is [api:148][api-detail]. | Does not prove root discovery is consumed, retried, awaited correctly, or that legacy `getImageDetail` serves today's detail component. No dedicated discovery test found in the inspected current references. |

**R1:** the maintained KUP-029 entry records equality for 100 ordinary API images
and 20 controlled same-ID images, refuting its independent ordinary-path premise;
that is not every configuration or a claim of server policy correctness
([backlog:413][kup029]).

**R2:** the KUP-030 entry records a real controlled-overlap transition retaining all
20 overlays, with 0/20 changed rights/cost presentation in that sample. Synthetic
U6z cost divergence and live retention are different evidence. Natural wrong-display
incidence, other fields and selection consequences remain unproved
([backlog:420][kup030]).

**R3:** the older page-publication record reports tests and bounded live checks,
but includes the then-existing ES rescue path; current API mode no longer has that
ordinary fallback. Reuse it only as historical evidence for the named behaviors,
not current recovery authorization or a new performance baseline
([changelog:714][history-publication], [api:162][api-pages], [T4][test-failures]).

## 7. Correctness And Performance Assessment

### 7.1 Exactly What Can Be Skipped

For a **complete, currently selected overlay**, local `calculateCost`,
`buildValidityMap`, `deriveInvalidReasons`, `deriveValid` and
`calculateSyndicationStatus` produce values discarded by the merge. The read-only
quota lookup, config lookup and clock reads have no publication/network effect.
Skipping those unused outputs changes work, not the selected field values
([derive:97][derive], [cost][cost], [validity][validity], [client-status][client-status]).

The safe proposal is **field-wise**, not `if API mode`, not `if overlay exists`,
and not truthiness. Compute cost only if overlay cost is nullish; construct one
validity map if either validity output is missing, and use each supplied output
independently; calculate status only if absent. Preserve `false`, `{}` and `[]`.
Keep baseline `noRights`, rights selection, raw leases and independent detail
warning computations exactly as they are. Partial overlays must yield today's
outputs, including the baseline-rights semantics of the fallback
([derive][derive], [test-merge][test-merge], [test-derive][test-derive]).

This does **not** fix stale provenance: a stale but complete same-ID overlay still
wins. Solve that in the owning result publication (U9), not by recomputing and
silently preferring local values ([ai-store][ai-store], [u9-overlay][u9-overlay]).

The hook memoizes by image/overlay reference, so these costs occur on derivation,
not every React render. Multi-image cost summary calls derive for each image when
that section renders. There is no measured CPU, frame or latency saving in this
assessment; do not extrapolate function-call reduction to a browsing-speed claim
([hook:31][hook], [multi-cost:318][multi-cost]). The smallest discriminator is spies
plus equality controls, not a broad performance campaign.

### 7.2 Request And Payload Ledger

| Candidate / existing behavior | Request/payload effect supported by code | Decision |
| --- | --- | --- |
| Lazy fallback under current overlays | No endpoint, request or wire-payload change; skips already-discarded local outputs. [derive][derive] | Best bounded work-reduction candidate; quantify calls first, do not promise milliseconds. |
| Ticker metadata consumption | Fields already on count wire; no new request. Small additional retained metadata; avoid repeated local joins and lost metadata on poll. [api-count][api-count], [poll][poll] | Correctness/ownership improvement, not a proven latency gain. Must be end-to-end and coexist with U9 pool semantics. |
| Retaining links / executing discovered relations everywhere | Retention alone removes no request; relation execution changes routing, expiry/template/proxy behavior. [server-links][server-links], [discovery][discovery] | Reject generic rewiring without a named existing workflow benefit. |
| Removing quota or root startup fetch | Could remove one startup fetch each, but quota has fallback consumers; root is U9's planned capability source. [main-init][main-init], [init-route][init-route], [u9-capability][u9-capability] | Do not trade correctness or near-term integration churn for speculative cleanup. Reassess only with their owners. |
| Media URL substitution | Could change asset size, quality, auth and cache path; signed original is not equivalent to bounded imgproxy output. [full][full], [server-image][server-image] | U7 comparison, not a free use-server-field win. |
| Mget's unused canonical policy fields | Server currently constructs canonical entities whose policy output is not published as selection overlay. [query-mget][query-mget], [mget][mget] | Potential later payload/server-work question, not permission for selection expansion or a lean endpoint now. Measure/contract before deciding computation placement. |
| U9 pool metadata | Planned API AI uses returned pool counts and removes its post-AI count; direct mode repurposes one existing count over a larger pool. [u9-pool][u9-pool] | Owned by U9; larger direct aggregation may cost more despite unchanged request count. Named U9 timing check remains pending. |

## 8. Bounded U10-B Recommendation

These are proposals for operator selection, **not an implementation checklist
already authorized**. Reconcile U9's actual types/publication first. Preserve the
current supported direct mode during migration; eventually eliminating browser ES
does not require eliminating useful client presentation computation.

### 8.1 Free / Mechanical Wins

**M1: truthful types/comments, alongside work on the owning files.** Correct stale
claims about overquota, the deleted mirror loop, lease summaries, singleton actions
and current discovery use in the derivation/store/discovery/API type comments.
The old GET `SearchResponseActions` types describe ticker arrays/sub-count arrays,
where Scala serializes a keyed map; correct that only when U9 reuses those types,
not by inventing an unused parallel model ([types:416][legacy-ticker-types],
[CollectionResponse:9][extra-count], [get-image][get-image]).

Files: [derive-enriched-image.ts][derive], [enrichment-store.ts][overlay-type],
[service-discovery.ts][discovery], [grid-api/types.ts][legacy-ticker-types],
[es-config.ts][source-fields]. Observable behavior: none. Existing tests: no
runtime assertions should change for comment-only edits; a type correction must
preserve real map fixtures in T8 and any U9 adapter tests then present. New
discriminator: a typed fixture with a nonlocal ticker name and keyed sub-counts.
Requests/performance: unchanged. Direct/API parity: unchanged. Do not make this a
standalone cleanup campaign or migration gate.

### 8.2 Bounded Client Changes Needing Focused Tests

**B1: lazy local derivation, recommended first if U10-B is selected.** Files:
[derive-enriched-image.ts][derive] and its [existing tests][test-derive]; use the
current hook/adapter/store tests as integration neighbors. Observable behavior:
identical selected fields with fewer policy calls under complete overlays.
Existing tests requiring updates: normally none of the output expectations;
baseline-only noRights and partial-overlay tests must remain unchanged. Add spies
proving zero cost/validity/status calls for a complete overlay, and one-at-a-time
missing fields with false/empty controls. Include absent overlay, missing reasons
with supplied false valid, missing valid with supplied {}, expired leases and quota
state. New tests must fail against current eager derivation for the right reason.
Requests/payload: zero delta. Performance: fewer calls/allocations, speedup unmeasured.
Parity: preserves existing direct, partial-overlay and selection fallbacks; does not
claim their semantics equal server policy. Do not add memoization/framework layers.

**B2: one end-to-end ticker metadata contract, separately recommended for
configuration correctness.** Files: [dal/types.ts][ticker-type],
[api-data-source.ts][api-count], [es-adapter.ts][direct-tickers],
[search-store.ts poll merge][poll], [StatusBar.tsx][status-tickers],
[FacetFilters.tsx][facet-tickers], [typeahead-fields.ts][typeahead-tickers], plus
U9 AI mapping/types as implemented then. Normalize direct results using local
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
Requests: no new discovery/count calls; preserve existing call-count tests.
Performance: small retained metadata and less joining, not an established speedup.
Direct/API parity: common display contract, deliberately different configuration
sources; no change to query semantics or ticker aggregation scope here.

**B3: prefer server-supplied validity reason copy, optional display correction.**
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
semantics first. Selection enrichment and independent KUP-029/030 fixes remain
explicitly excluded ([kup029][kup029], [kup030][kup030]).

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
  to claim KUP-030 fixed: U9 owns its result publication; selection has different
  reuse rules ([u9-overlay][u9-overlay], [hydrate][hydrate]).
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
| G1 | Core premise supported; background hook removal did not remove current overlays. Overquota is not API-only; root/summary/type comments are stale. | Resolved from current implementations, historical diff and T1/T2/T7. No browser reproduction needed for these source facts. |
| G2 | Output-equivalent lazy derivation is supported for supplied fields; meaningful frame/latency gain is unknown. | B1 call spies plus old-output parity matrix. Only if worthwhile afterward, propose a bounded named timing check; no broad campaign. |
| G3 | Returned ticker metadata is lost in mapper, poll and local UI joins; live impact depends on config. | B2 deliberately different server/local fixture, then each consumer through refresh/poll/AI transition. No need to read private config to establish the source defect. |
| G4 | Current extractor produces no lease summary; injected-summary tests do not prove G/T/M leased-cost behavior. | Mounted raw-lease fixture contrasting D raw-list fallback with G/T/M cost styling. Design choice, not automatic scope expansion. |
| G5 | Same-ID cache has no generation guarantee; delayed response guards are nevertheless present. Natural wrong-display incidence and selection consequences remain unknown. | Reuse R2/T10. U9 acceptance must publish different same-ID values and assert current overlay, including empty/absent/stale transitions; selection policy remains excluded. |
| G6 | Discovery starts/caches, but accessors are unconsumed and failure is sticky. It is not ready to certify future capability consumers. | In U9, stub delayed root success, simultaneous callers, first failure then retry policy, successful missing relation and no clientConfig. Decide readiness ownership before changing singleton behavior. |
| G7 | Per-image aliases are values, not a complete catalogue. | Existing server alias test with no matching fields plus a configured field label demonstrates why sampling fails. Real catalogue design requires a separate contract, not more sampled images. |
| G8 | Successful I says what a decoded image contains, not every original field, live satellite state or all malformed-response behavior. | Reuse T1/T4/T6 and lean projection. Add one missing embedded-data fixture only if a consumer needs to distinguish absent versus explicit empty; do not introduce a generic validator framework by default. |
| G9 | API reason descriptions can be replaced by local text; root usageRights is not universally re-merged at response time. | B3 differing-message render; for rights, a root/user-edit mismatch fixture through real server builder plus client map. This does not reopen refuted ordinary noRights provenance. |
| G10 | Post-U9 AI pool total/tickers, capability, response projection, graceful absence and result-owned enrichment are unimplemented in inspected source. | Read U9 implementation and its named composed tests once present; update rows 35-38 and workflows then. No prediction is an acceptance result. |
| G11 | Canonical media/unused-control benefits and costs are unknown. | U7 or a separately selected control owns quality/payload/auth/caching comparison. Do not use a single URL fixture as proof of faster or equivalent delivery. |

## 10. M2a Checks And Future Direction

M2a remains the planned deployed-TEST API check while retaining local media delivery;
U8/M2a precede U7. No M2a access or execution follows from this document
([plan:143][plan-sequence]). Record both revisions and check:

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
   request only the smallest missing check. This report adds no performance gate.

A runtime config resource is one possible future answer for vocabulary, not an
automatic prerequisite. Compare its startup/cache/maintenance cost with compile-time
configuration for the intended deployments. Keep operations permission-aware and
server-authorized, and keep inexpensive presentation computation client-side when
that is faster/cleaner without losing correctness. Do not publish private config,
credentials, signed media URLs or user data as evidence.

## Evidence References

[plan-sequence]: 03%20Ce%20n'est%20pas%20une%20pipe%20dream/api-build/api-build-00-plan.md#L140
[plan-u9b]: 03%20Ce%20n'est%20pas%20une%20pipe%20dream/api-build/api-build-00-plan.md#L192
[api-ai]: ../../src/dal/api-data-source.ts#L82
[api-count]: ../../src/dal/api-data-source.ts#L130
[api-detail]: ../../src/dal/api-data-source.ts#L148
[api-pages]: ../../src/dal/api-data-source.ts#L162
[map]: ../../src/dal/grid-api-search-adapter.ts#L35
[extract]: ../../src/dal/grid-api-search-adapter.ts#L72
[singleton-api]: ../../src/dal/grid-api-search-adapter.ts#L156
[mget]: ../../src/dal/grid-api-search-adapter.ts#L172
[read-failure]: ../../src/dal/grid-api-search-adapter.ts#L200
[decode]: ../../src/dal/grid-api-search-adapter.ts#L234
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
[main-init]: ../../src/main.tsx#L16
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
[fresh]: ../../src/stores/search-store.ts#L2470
[fresh-count]: ../../src/stores/search-store.ts#L2318
[fresh-focus]: ../../src/stores/search-store.ts#L2375
[fill]: ../../src/stores/search-store.ts#L1044
[around]: ../../src/stores/search-store.ts#L1360
[focus-commit]: ../../src/stores/search-store.ts#L1841
[forward]: ../../src/stores/search-store.ts#L2592
[backward]: ../../src/stores/search-store.ts#L2726
[seek-pair]: ../../src/stores/search-store.ts#L3114
[seek-pair-deep]: ../../src/stores/search-store.ts#L3624
[seek-commit]: ../../src/stores/search-store.ts#L3807
[restore]: ../../src/stores/search-store.ts#L3952
[ai-store]: ../../src/stores/search-store.ts#L2196
[poll]: ../../src/stores/search-store.ts#L749
[status-tickers]: ../../src/components/StatusBar.tsx#L204
[status-total]: ../../src/components/StatusBar.tsx#L162
[ticker-tooltip]: ../../src/components/StatusBar.tsx#L36
[facet-tickers]: ../../src/components/FacetFilters.tsx#L389
[typeahead-tickers]: ../../src/lib/typeahead-fields.ts#L327
[ticker-type]: ../../src/dal/types.ts#L106
[direct-tickers]: ../../src/dal/es-adapter.ts#L387
[es-count]: ../../src/dal/es-adapter.ts#L719
[es-ai]: ../../src/dal/es-adapter.ts#L1107
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
[server-writes]: ../../../media-api/app/lib/ImageResponse.scala#L328
[server-cost]: ../../../media-api/app/lib/ImageResponse.scala#L206
[server-cost-policy]: ../../../media-api/app/lib/usagerights/CostCalculator.scala#L12
[server-validity]: ../../../media-api/app/lib/ImageExtras.scala#L29
[server-reasons]: ../../../media-api/app/lib/ImageExtras.scala#L84
[server-restrictions]: ../../../media-api/app/lib/ImageResponse.scala#L292
[persistence]: ../../../media-api/app/lib/ImageResponse.scala#L49
[persisted-wire]: ../../../media-api/app/lib/ImageResponse.scala#L225
[wrap-edits]: ../../../media-api/app/lib/ImageResponse.scala#L232
[server-status]: ../../../common-lib/src/main/scala/com/gu/mediaservice/model/Image.scala#L46
[image-reader]: ../../../common-lib/src/main/scala/com/gu/mediaservice/model/Image.scala#L80
[embedded]: ../../../media-api/app/lib/ImageResponse.scala#L375
[collection-wire]: ../../../media-api/app/lib/ImageResponse.scala#L449
[server-actions]: ../../../media-api/app/lib/ImageResponse.scala#L164
[server-links]: ../../../media-api/app/lib/ImageResponse.scala#L146
[server-filemetadata]: ../../../media-api/app/lib/ImageResponse.scala#L389
[aliases-server]: ../../../media-api/app/lib/ImageResponse.scala#L424
[get-image]: ../../../media-api/app/controllers/MediaApi.scala#L175
[get-image-source]: ../../../media-api/app/controllers/MediaApi.scala#L798
[root]: ../../../media-api/app/controllers/MediaApi.scala#L112
[server-ai]: ../../../media-api/app/controllers/MediaApi.scala#L633
[lean]: ../../../media-api/app/lib/elasticsearch/ElasticSearch.scala#L732
[complete]: ../../../media-api/app/lib/elasticsearch/ElasticSearch.scala#L1079
[server-mget]: ../../../media-api/app/lib/elasticsearch/ElasticSearch.scala#L1250
[server-count]: ../../../media-api/app/lib/elasticsearch/ElasticSearch.scala#L1130
[ticker-config]: ../../../media-api/app/lib/elasticsearch/ElasticSearch.scala#L55
[ticker-server]: ../../../media-api/app/lib/elasticsearch/ElasticSearch.scala#L444
[extra-count]: ../../../common-lib/src/main/scala/com/gu/mediaservice/lib/argo/model/CollectionResponse.scala#L9
[history-drop]: changelog.md#L5295
[history-revive]: changelog.md#L2841
[history-cleanup]: changelog.md#L2700
[history-publication]: changelog.md#L714
[kup029]: bug-backlog.md#L408
[kup030]: bug-backlog.md#L416
[u9-capability]: ai-search-catching-up-workplan.md#L213
[u9-client]: ai-search-catching-up-workplan.md#L228
[u9-overlay]: ai-search-catching-up-workplan.md#L272
[u9-pool]: ai-search-catching-up-workplan.md#L287
[u9-rank]: ai-search-catching-up-workplan.md#L330
[u9-absence]: ai-search-catching-up-workplan.md#L353
[test-extract]: ../../src/dal/grid-api-search-adapter.test.ts#L129
[test-merge]: ../../src/dal/grid-api-search-adapter.test.ts#L235
[test-map]: ../../src/dal/grid-api-search-adapter.test.ts#L390
[test-probe]: ../../src/dal/grid-api-search-adapter.test.ts#L583
[test-derive]: ../../src/lib/derive-enriched-image.test.ts#L27
[test-hook]: ../../src/hooks/useEnrichedImage.test.ts#L12
[test-overlay-store]: ../../src/stores/enrichment-store.test.ts#L10
[test-publication]: ../../src/stores/search-store.test.ts#L1004
[test-restore-abort]: ../../src/stores/search-store-api-mode.test.ts#L314
[test-count-publication]: ../../src/stores/search-store-api-mode.test.ts#L581
[test-failures]: ../../src/stores/search-store-api-mode.test.ts#L756
[test-singleton]: ../../src/dal/api-data-source.test.ts#L220
[test-mget]: ../../src/dal/api-data-source.test.ts#L296
[test-detail-identity]: ../../src/components/ImageDetail.test.tsx#L209
[test-detail]: ../../src/components/ImageDetail.test.tsx#L264
[test-quota]: ../../src/lib/cost/quota-store.test.ts#L37
[test-validity]: ../../src/lib/cost/validity-map.test.ts#L76
[test-count]: ../../src/dal/api-data-source.test.ts#L636
[test-server-count]: ../../../media-api/test/controllers/ImageQueryControllerTest.scala#L691
[test-alias-server]: ../../../media-api/test/lib/ImageResponseTest.scala#L98
[test-alias-client]: ../../src/lib/field-registry.test.ts#L153
[test-graphic]: ../../src/lib/graphic-image-blur.test.ts#L129
[test-alias-cursor]: ../../src/lib/image-offset-cache.test.ts#L101
[test-ai]: ../../src/stores/search-store-api-mode.test.ts#L1055
[test-poll]: ../../src/stores/search-store.test.ts#L152
[test-cql-e2e]: ../../e2e/local/cql-search-quoting.spec.ts#L123
[test-ai-empty]: ../../src/dal/es-adapter.test.ts#L161
[test-legacy]: ../../src/dal/grid-api/grid-api-adapter.test.ts#L160