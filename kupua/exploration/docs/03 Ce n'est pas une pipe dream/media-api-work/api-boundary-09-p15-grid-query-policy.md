# P15: Grid Query Policy and Migration Decisions

## 1. Deciding Answer and Decision Table

**Accept this bounded reading packet with named implementation blockers, not as migration approval.** All 34 assignments are accounted for: 28 full source/assertion files (5,401 lines), two full documents, and four explicitly scoped document/report reads. Reuse Grid's query/filter, tier and image-visibility policy. Do not replace it with the browser's approximation or alter legacy GET parsing to make it resemble Kupua. New read capabilities need a common authenticated POST query scope, including parsed default-hide intent and deleted-image uploader restrictions before hits, counts or aggregations execute. D3 already demonstrates that scope; `SearchParamsBody` alone does not supply all of it.

Keep the current one-semantic-sort policy and completed D3 Option B transport. A future semantic server builder must be Kupua-specific and shared by its positional operations, never a rewrite of legacy `sorts.createSort`. Do not label existing AI or aggregation endpoints equivalent merely because they have similarly named operations. The bounded additions are authorized count/ticker and contextual facet surfaces, ordinary positional/PIT capabilities handled with P17, and visible bulk image reads handled with P16. None requires index migrations, durable sessions, Thrall changes or a universal snapshot.

This is a proposal for coordinator-owned **PROVISIONAL integration 10**. P01-P14 remain intact. Incomplete corpus coverage is permitted for that checkpoint and is not comprehensive closure. Source facts, assertions read, documentation and inferences are separated below. No implementation or tests were performed.

| Relevant preserved-plan item | Decision | Exact Grid work | Exact Kupua work | Existing callers | Performance implications and blocker |
| --- | --- | --- | --- | --- | --- |
| Shared foundation; D3 query plumbing | **Reuse, with explicit scope** | Reuse POST parser plus D3's positive-deleted-intent authorization transformation and `QueryBuilder.buildFilterOpt`; centralize only the new-read scope if multiple endpoints need it. Preserve GET `SearchParams.apply`, `Parser.run` and `imageSearch` behavior. | Send one normalized query/filter request to all migrated producers; stop independently injecting substring-based defaults in the API mapper. Preserve direct-ES development separately. | No GET contract change; no global parser replacement. | Reuses policy, not a latency claim. Blockers: query fixtures and principal-aware hits/count/facet equivalence, F01-F03. |
| D7 count/tickers | **Keep endpoint; reuse counting and ticker machinery** | Add the bounded count route using the authorized POST scope, exact total intent and existing ticker/subcount mapping. Include required runtime mappings when syndication review policy uses them. Existing `countMatchingFilterWithExtraCounts` accepts a prebuilt filter, not a principal or full scoped request. | Route polling through the API; select and document initial total/ticker ownership; derive `countAll` from explicit intent rather than cursor absence. Failure must not publish a successful zero. | Leave GET's counts, ticker envelope and AI filter-pool count behavior unchanged. | Size-zero avoids hit enrichment, but exact counts/aggs still do ES work. No timing inferred. Blockers: initial ownership and runtime-filter parity, F03/F06. |
| C1/C2 contextual facets and named `is:` counts; old A `getAggregation` | **Add scoped capability; do not blindly reuse GET** | Add full-context terms/named-filter/nested-parent-count support with tier/deleted scope; validate supported full field paths and sizes, including existing configured/dotted workflows. Reuse `IsQueryFilter`, not client DSL. Do not use `metadataField()` on already-qualified paths. | Route contextual facets, typeahead and collection counts through the correct owner; preserve cancellation and per-field data absence. Do not confuse number of buckets with result count. | Existing metadata/edits/date GET routes remain unchanged. | Batched aggs share a request but are not free; preserve useful limits. Blockers: field/configuration contract, count scope and named-deleted authorization, F03/F04. |
| D3 Option B; D1/D2/D4-D6 ordering | **Keep transport now; separate semantic builder only when justified** | Retain current D3 sort decoding. If moving semantics server-side for positional additions, create a separate Kupua builder with one semantic token, configured expansion, automatic upload-time/ID suffixes, selected-max special dates and null-tail behavior. | Retain URL canonicalization and opaque authoritative response tuples. Remove browser ES sort construction only as the selected server contract replaces it; do not reconstruct lean-image tuples. | Never modify/call legacy `sorts.createSort` to implement Kupua order. Preserve its GET collection/taken conventions. | No automatic performance gain from moving code. Rank/map/distribution costs remain operation-specific. Blockers: static/configured/special sort fixtures and tuple agreement, F05; P17 lifecycle join. |
| A `searchRange`; shallow seeks through `searchAfter` | **Change the zero-server-work assumption** | Provide an explicitly scoped bounded shallow-page path with Kupua ordering and real response tuples, or an equivalent capability selected with P17. Current D3 rejects nonzero offsets. | Remove the positive-offset direct-ES dispatch in eventual API-only mode; preserve offset landing and caller publication, without fabricating tuples from GET images. | No need to mutate GET ordering/envelope. | Preserve the existing shallow/deep split; no claim that cursor walking is a cheap substitute. Blocker: P17 chooses the bounded route, F05/F06. |
| D9 ID reads | **Keep visible bounded bulk reads; reuse visibility/enrichment** | Apply `isVisibleToAccessor` before returning each requested image; hidden and missing IDs remain indistinguishable. ID hydration is not query-scoped target lookup. Do not use `lookupIds` as an authenticated bulk policy. | Route selection's actual datasource owner; distinguish failed/cancelled fetch from successful missing-ID omission; one commit-to-view enrichment owner. Normalize ID inputs consistently. | Existing single-image GET and migration-aware getter unchanged. | Bulk limits/envelope shape need P16 evidence; no linear timing extrapolation from source or old estimates. Blocker: P16 response/selection integration and F02/F04. |
| A `searchByAi` (historical identical-algorithm/client-only claim) | **Refute equivalence; reuse infrastructure conditionally** | Keep existing Grid AI unchanged. For Kupua, either explicitly accept its different ranking semantics or add a bounded compatibility operation using existing server embedding/query infrastructure. Separate AI text from ordinary CQL filter text and apply the same authorized scope. | Preserve flat useful result bound, loaded-hit total, relevance/uploaded reorder and no ordinary paging/PIT. Map filter-pool totals separately if exposed. Route health/cancellation explicitly. | Do not silently change Kahuna's blend, totals, similar-image or filters-only behavior. | Current server blend runs separate ranked searches plus filter counts and fetches an embedding before its zero-weight branch; not the current client algorithm. No latency conclusion. Blocker: explicit ranking/health/filter contract decision, F07. |
| D8 and positional execution completeness | **Keep ordinary lifecycle; separate completeness from snapshots** | P17 owns authenticated PIT/continuation and endpoint-local execution-completeness policy. Do not treat HTTP success or short pages as proof of complete ES execution. | Preserve absence on discarded maps and session-total coordinates; partial execution cannot become an exact position map. | No shared migration routing or global snapshot changes. | Existing measured core stays baseline. No rerun or new measurement requested. Blockers: corrected E033, P17; F08. |

## 2. Material Original-Source Findings

### F01. GET, POST and browser query defaults are distinct

**Source:** [ElasticSearchModel.scala](../../../../../media-api/app/lib/elasticsearch/ElasticSearchModel.scala#L145) parses POST `q` with `Parser.parse`/`normalise`, recognizes parsed positive/negative intent, and appends only unmentioned defaults. GET [SearchParams.apply](../../../../../media-api/app/lib/elasticsearch/ElasticSearchModel.scala#L322) calls `Parser.run` only when `q` exists. [Parser.scala](../../../../../media-api/app/lib/querysyntax/Parser.scala#L5) instead uses case-sensitive raw substring checks before parsing and turns a parse failure into an empty condition list. These are not interchangeable entry points.

D3 [searchAfterImages](../../../../../media-api/app/controllers/MediaApi.scala#L867) additionally scopes parsed positive `is:deleted` to the principal's uploader identity unless authorized; this happens before ES. Legacy [imageSearch](../../../../../media-api/app/controllers/MediaApi.scala#L584) tests `Option[String].contains("is:deleted")`, an exact whole-string match, in the ordinary-search branch. Preserve that legacy behavior while reusing the stronger POST policy for additions, not as a recommendation to replicate the GET check.

**Client source/inference:** [API mapper](../../../../src/dal/grid-api-search-adapter.ts#L103) independently appends default-hide strings via raw `includes`; [direct builder](../../../../src/dal/es-adapter.ts#L461) adds raw-substring-based ES exclusions. Quoted or uppercase positive deleted intent can therefore acquire a contradictory negative clause before POST parsing. Removing duplicate mapper default injection lets the server own parsed defaults; direct-mode parity remains an explicit decision, not silently changed by an API migration. This is a source-derived conflict, not an executed reproduction.

**Assertions read:** [MediaApiTest.scala](../../../../../media-api/test/controllers/MediaApiTest.scala#L73) covers positive deleted intent with whitespace, combined terms, uppercase and quotes, ordinary versus privileged users, absent/negative intent and restricted-machine POST denial. Its successful responses are mocked empty searches; it captures parameters, not real visibility/count results. The mapper-to-controller composition is not exercised by those assertions.

**Validation limit:** POST `asOpt` fallbacks and `Parser.parse` returning an empty list do not establish strict malformed-input rejection; `SearchParams.validate` checks negative offset and upper length, not every field/type/grammar case. New routes need explicit bounded request/error contracts. This is not a proposal to change legacy GET or reopen D3's deferred broader strictness work.

### F02. A read-only operation is not automatically an allowed HTTP method

**Source:** [ApiAccessor.scala](../../../../../common-lib/src/main/scala/com/gu/mediaservice/lib/auth/ApiAccessor.scala#L29) allows all methods for Internal, GET only for ReadOnly, and GET only on the media API host and `/images` path prefix for Syndication. [ApiKeyAuthenticationProvider](../../../../../rest-lib/src/main/scala/com/gu/mediaservice/lib/auth/provider/ApiKeyAuthenticationProvider.scala#L40) applies that check before producing the machine principal. [Authentication](../../../../../rest-lib/src/main/scala/com/gu/mediaservice/lib/auth/Authentication.scala#L48) prioritizes inner-service, then API, then user authentication; a present invalid/unauthorized API credential does not fall through to user authentication. Users and inner-service principals expose Internal accessors, but that is not proof of deployed provider configuration.

[Authorisation](../../../../../rest-lib/src/main/scala/com/gu/mediaservice/lib/auth/Authorisation.scala#L62) grants internal machines/inner services the broad permission shortcut; users pass uploader-or-permission checks, restricted machines do not. [PermissionsAuthorisationProvider](../../../../../rest-lib/src/main/scala/com/gu/mediaservice/lib/guardian/auth/PermissionsAuthorisationProvider.scala#L46) delegates user permissions to its provider. Do not equate authentication, method access, deleted-search scope and per-image visibility.

**Decision:** for the current human-user migration, reuse the chain without widening it. If restricted-machine access to new POST reads is required, obtain an explicit endpoint-scoped authorization design and assertions that deny mutation routes and other hosts/paths. Never solve this by allowing all POSTs for ReadOnly/Syndication. Existing assertions deliberately deny those D3 requests. Source/test reading does not establish that every principal or deployment has been exercised.

### F03. Tier scope must reach counts and aggregates, not only returned images

[QueryBuilder.buildFilterOpt](../../../../../media-api/app/lib/elasticsearch/QueryBuilder.scala#L154) combines dates, IDs, uploader, cost, rights, persistence, usage and syndication with `searchFilters.tierFilter(params.tier)`. [SearchFilters](../../../../../media-api/app/lib/elasticsearch/SearchFilters.scala#L62) restricts Syndication search to the queued policy. [SyndicationFilter](../../../../../media-api/app/lib/elasticsearch/SyndicationFilter.scala#L81) contains status-specific rights/lease/usage/date conditions and a configuration-dependent runtime term. D3 and ordinary search attach its conditional runtime mapping; a new count endpoint must not copy only the filter and omit that execution prerequisite.

[MediaApi.isVisibleToAccessor](../../../../../media-api/app/controllers/MediaApi.scala#L162) is a separate per-image guard; single-image reads return not-found on hidden images. Its underlying rights-model predicate is a P16 join, not proven equivalent to every search-status filter here. `hitToImageEntity` enriches; it is not itself a visibility filter. Therefore authorization must be applied before search totals/buckets and before bulk hydration response mapping.

The existing [count helper](../../../../../media-api/app/lib/elasticsearch/ElasticSearch.scala#L368) performs size-zero exact counting and reuses ticker/subcount mapping, but accepts only an optional already-built query. The existing [aggregate path](../../../../../media-api/app/lib/elasticsearch/ElasticSearch.scala#L630) accepts `AggregateSearchParams`, builds CQL only, and returns bucket count as `total`. Its controllers authenticate but do not supply tier-bearing `SearchParams`. Do not reuse that entry point for authorization-sensitive full-context facets. This finding concerns suitability for additions, not an authorized repair of legacy routes.

### F04. Query parity is a fixture matrix, not a parser-name claim

| Contract | Actual source comparison | Migration consequence / assertion needed |
| --- | --- | --- |
| Free/default and rights | Client applies free-only unless `nonFree === "true"`; mapper sends `free:true` only in that case. Server omission means no cost filter. Server free policy is configuration-derived supplier/category logic. Acquired-rights false means NOT true, including missing. | Preserve omission versus false and active default semantics. Check configuration equivalence; do not make paid-only out of `nonFree=true`. |
| Top-level versus CQL dates | Client six top-level bounds use exclusive `gt/lt`, date-only UTC normalization. Shared Grid `filters.date` is exclusive. Server grammar builds inclusive CQL ranges and calendar aliases; client `fieldToClause` lacks that general date grammar and passes nested date bounds directly. | Preserve the established top-level contract; document/test supported CQL differences and timezone/calendar edges rather than changing shared date helpers. |
| IDs | Client comma-splits and trims, querying the source `id`; POST comma-splits without trimming; Grid `filters.ids` uses ES document IDs. | Normalize whitespace/empty IDs consistently and establish document-ID/source-ID equality for the supported data. Hydration and query-constrained focus lookup remain distinct. |
| Configured aliases | Server resolves alias or underlying path and supports `matchViaExistence` true/false; client resolves the alias but performs ordinary match/phrase operations. Client `has:` uses static `getFieldPath`, not configured alias resolution. | Define authoritative alias semantics and parity cases for alias, raw path, boolean case, negation and `has:`. Do not infer actual deployment config from test fixtures. |
| Free text | Server `MatchFields` includes configured queryable identifiers and config-driven fuzzy/cross-fields behavior; client uses a static list and cross-fields. | Reuse Grid policy only with explicit compatibility disposition. Similar field names do not prove result equivalence. |
| Nested usages | Both group positive and negative nested clauses by polarity; client uses term/best-fields forms where server nested exact values feed phrase queries. | Preserve same-record semantics and parent counts; assert against actual mappings before claiming identical matching. |
| Collections | Both lowercase hierarchy values. Server may add an orderBy-dependent collection term filter; legacy collection sort direction differs from Kupua's ordinary minus-means-desc convention. | Keep collection filtering/order semantics explicit; do not borrow the legacy special-sort convention. |
| `is:` | Server registry includes configured reapable/agency/ownership/quota/deleted behavior. Client supports a subset; unknown `is:` returns non-negated match-none even if the input was negative, whereas server negation wraps the registry's match-none. | Named count/filter additions should reuse server policy, with explicit supported names, negative-unknown and quota/config fixtures. |
| Previously ignored fields | Client `buildQuery` does not implement `persisted` or `payType`; API mapper omits them. POST parser supports persisted but explicitly drops payType and AI mode. | Do not start honoring ignored URL fields accidentally. Keep compatibility dispositions separate from useful-feature additions. |

Originals: [client CQL](../../../../src/dal/adapters/elasticsearch/cql.ts#L85), [client query](../../../../src/dal/es-adapter.ts#L461), [server grammar](../../../../../media-api/app/lib/querysyntax/QuerySyntax.scala#L33), [query builder](../../../../../media-api/app/lib/elasticsearch/QueryBuilder.scala#L22), [field paths](../../../../../common-lib/src/main/scala/com/gu/mediaservice/lib/ImageFields.scala#L62), [date/ID helpers](../../../../../common-lib/src/main/scala/com/gu/mediaservice/lib/elasticsearch/filters.scala#L25). Exact hashes and read ranges are in section 3. [QueryBuilderTest](../../../../../media-api/test/lib/elasticsearch/QueryBuilderTest.scala#L190), [ParserTest](../../../../../media-api/test/lib/querysyntax/ParserTest.scala#L95) and [client CQL assertions](../../../../src/dal/adapters/elasticsearch/cql.test.ts#L97) establish asserted forms, not a cross-engine parity suite or runtime results.

### F05. Preserve one semantic sort and protect legacy callers

[URL canonicalization](../../../../src/lib/search-params-schema.ts#L126) keeps only the first valid token and limits AI to relevance/uploadTime. [Kupua sort construction](../../../../src/dal/adapters/elasticsearch/sort-builders.ts#L94) expands physical clauses, adds deterministic suffixes and selected-max special dates; this low-level comma support is not multiple semantic sort permission. [Legacy sorts](../../../../../media-api/app/lib/elasticsearch/sorts.scala#L9) instead default to upload-time descending alone, expand taken differently, and supply special collection helpers used by ordinary GET [search](../../../../../media-api/app/lib/elasticsearch/ElasticSearch.scala#L380).

Original shared caller: [Kahuna media-api service](../../../../../kahuna/public/js/services/api/media-api.js#L41) uses GET search links, normalizes legacy sort tokens, forwards existing filters and exposes metadata/label suggestions. [UsageController](../../../../../media-api/app/controllers/UsageController.scala#L109) also consumes GET SearchParams for validation/pagination. [SuggestionController](../../../../../media-api/app/controllers/SuggestionController.scala#L25) and [AggregationController](../../../../../media-api/app/controllers/AggregationController.scala#L15) use the shared grammar. These are concrete reasons to keep changes additive, not a claim all callers were inspected.

The D3 decoder checks sort shapes, duplicate fields, unresolved special aliases and cursor arity; it does not enforce the URL's one-semantic-sort policy or construct canonical suffixes. [SortsTest](../../../../../media-api/test/lib/elasticsearch/SortsTest.scala#L10) asserts decoder shapes/rejections, not every supported semantic sort. A new semantic API must validate at its own boundary, with fixtures across pages/ranks/maps/ranges; neither trusting a URL nor modifying the shared builder is sufficient.

### F06. Query ownership joins the store and view contracts

P09/P10/P13 route the requirement for coherent ordered hits, tuple alignment, stable session total and stale-work suppression; their reports are not original-source proof. Original [StranglerAdapter](../../../../src/dal/strangler-adapter.ts#L47) bypasses D3 for positive-offset shallow requests and otherwise distinguishes unavailability, explicit expiry and refusal. D3 [searchAfterQuery](../../../../../media-api/app/lib/elasticsearch/ElasticSearch.scala#L754) rejects nonzero offsets. A legacy GET replacement would not supply Kupua's sort tuples/order without additional work.

The mapper derives `countAll` from cursor absence rather than explicit `trackTotalHits`; D3 returns zero when counting is disabled and subset totals when filters narrow the query. Keep initial/session totals distinct from continuation/subset counts. Do not let migration of request ownership also move scroll geometry, focus publication or history state into Grid. The bounded core joins in section 5 remain open.

**Original caller/consumer join:** [initial store request](../../../../src/stores/search-store.ts#L2268) starts PIT, first page with `trackTotalHits:true`, and ticker count in parallel, with a generation check before publication. [Polling](../../../../src/stores/search-store.ts#L717) uses `since`, checks its generation after awaiting, adds ticker deltas and ignores failure; its freeze helper chooses the earlier upload-time bound. [View predicate](../../../../src/hooks/useDataWindow.ts#L343) selects indexed coordinates from the store total, not map readiness. [AI publication](../../../../src/stores/search-store.ts#L2164) sets total from loaded hits, preserves generation ownership and scopes ticker requests to those hit IDs. These bounded originals support the P09/P10/P13 join, not re-verification of every focus/history/scroll workflow. In particular, server AI filter-pool tickers cannot silently replace Kupua's loaded-result tickers.

### F07. Existing Grid AI is useful infrastructure, not equivalent behavior

[MediaApi AI](../../../../../media-api/app/controllers/MediaApi.scala#L590) splits parsed free text/similar-image ranking from filter conditions, uses tier-aware request filters, supports filter-only pool counts, rejects conflicting ranking signals, and gates on config. Its ordinary deleted-uploader transformation is not applied to that AI branch. [ElasticSearch AI](../../../../../media-api/app/lib/elasticsearch/ElasticSearch.scala#L186) uses OR lexical matching and separate lexical/semantic fusion for intermediate weights, with whole-filter-pool counts. The controller defaults weight to 0.85 and fetches an embedding before the hybrid method selects the zero-weight path.

The current [Kupua producer](../../../../src/dal/es-adapter.ts#L1134) takes separate `aiQuery`, defaults weight to 1, skips embedding at zero, uses AND lexical matching and a max-score probe/boost blend for intermediate weights. It returns a bounded flat hit list, synthetic compatibility tuples and hit-list length as total. This refutes the historical inventory's identical-algorithm/no-server-work premise, but not the possibility of deliberate reuse. Preserve Kahuna semantics. The exact server fusion helper, embedding/health deployment and AI caller lifecycle are outside this packet; no ranking quality, capacity or deployed behavior claim follows.

### F08. Completeness must not become a universal-snapshot demand

The centrally corrected E033 is controlling evidence: thrown errors/observed abort discard collected map entries, but [report 04 F1](api-boundary-04-reconciled-recommendation.md#L25) and [R6](api-boundary-04-reconciled-recommendation.md#L226) already record HTTP-200 timed-out/failed-shard short pages yielding a non-null map. The current [collector](../../../../src/dal/es-adapter.ts#L1986), read through line 2193, still checks thrown errors/abort and short-page exhaustion without inspecting those execution flags. P13's original blanket wording is not adopted. The historical synthetic execution is read evidence, not a rerun or proof of live occurrence. Ordinary endpoint-local execution completeness is a necessary qualification for exact maps/counts; it does not imply shared snapshots between page one, map, rank and presentation distributions. No fixture, test or measurement rerun is requested. P17 owns the lifecycle/execution join for provisional integration.

## 3. Exact Coverage Receipts

All ranges are inclusive and 1-based; SHA-256 identifies content, not correctness. All assigned paths were ordinary files at fingerprint inspection. The 28 source/assertion files were read continuously to EOF, including comments, test setup and assertions: **5,401 lines**, no unread assigned source/test lines. Large files were read in contiguous chunks (MediaApi 1-360/361-660/661-912; CQL 1-330/331-623; ParserTest 1-310/311-612). Active index and preserved workplan are full reads. Relevant inventory/report sections were scoped reads, not whole-file credit. The four partial receipts explicitly retain their complements. Searches outside listed spans were routing only.

Assigned receipt proposals (coordinator applies; no central register changes here):

```json
[
	{"path":"media-api/app/controllers/MediaApi.scala","sha256":"859610f8fa50e925082125cb9c7a19f92941725add7a87e771619c160e4f7a26","method":"full-text","ranges":[[1,912]],"unread":[]},
	{"path":"media-api/app/lib/elasticsearch/ElasticSearchModel.scala","sha256":"4a46deb66ea728cdf93ae16e1cb83bd4fb030cde29558fb5bd6e1778e4a45fbb","method":"full-text","ranges":[[1,429]],"unread":[]},
	{"path":"media-api/app/lib/elasticsearch/QueryBuilder.scala","sha256":"d973848aa988c7a050afd2395c084d2329eff653a4b6d6a0cc4003df8aaee321","method":"full-text","ranges":[[1,239]],"unread":[]},
	{"path":"media-api/app/lib/elasticsearch/SearchFilters.scala","sha256":"b499d32bd514773ada5265618f7feab2c978d1554bb99d9037dcc0dbbf4eb10a","method":"full-text","ranges":[[1,90]],"unread":[]},
	{"path":"media-api/app/lib/elasticsearch/IsQueryFilter.scala","sha256":"4d06533f44ddf6dd5fc48ff7b4cb78e8664dcb9f8d0dc9fa1931385201cca121","method":"full-text","ranges":[[1,77]],"unread":[]},
	{"path":"media-api/app/lib/elasticsearch/SyndicationFilter.scala","sha256":"b8bde04bf72c33eddd9240a348e048f36932bfa40c236394320a5000e9ec9330","method":"full-text","ranges":[[1,133]],"unread":[]},
	{"path":"media-api/app/lib/elasticsearch/sorts.scala","sha256":"47470bb47b9e4d41794f7c403239d39edc2d88c947752b2ca932dcc6dab44e4a","method":"full-text","ranges":[[1,96]],"unread":[]},
	{"path":"media-api/app/lib/elasticsearch/MatchFields.scala","sha256":"e856a64c71406f792607a3a92cce8856787005bfc47d412fceaa2aef559fde28","method":"full-text","ranges":[[1,19]],"unread":[]},
	{"path":"media-api/app/lib/querysyntax/QuerySyntax.scala","sha256":"17bd6ea1f5f8052b923a3da6788eea3ee7f2397167bde94d8bdff8b4ad62bfa7","method":"full-text","ranges":[[1,294]],"unread":[]},
	{"path":"media-api/app/lib/querysyntax/Parser.scala","sha256":"5ee61b322086852bbffb31d341f52e4449b486c03317c0e661bb35233db97b22","method":"full-text","ranges":[[1,34]],"unread":[]},
	{"path":"media-api/app/lib/querysyntax/DateRangeParser.scala","sha256":"5c69ef960104c530db50d666ccc7207f31cb787401031eca8e9d4de851a6e4e7","method":"full-text","ranges":[[1,32]],"unread":[]},
	{"path":"media-api/app/lib/querysyntax/model.scala","sha256":"86ef7478045d1ecfcac23de757567001f43a3b9247004038cc308663cb0d9581","method":"full-text","ranges":[[1,27]],"unread":[]},
	{"path":"rest-lib/src/main/scala/com/gu/mediaservice/lib/auth/Authentication.scala","sha256":"284aa6ecc4763e5710c724b1e7c2df8ebe6eafc32bdbd18d8e4e8ebcc213645e","method":"full-text","ranges":[[1,132]],"unread":[]},
	{"path":"rest-lib/src/main/scala/com/gu/mediaservice/lib/auth/Authorisation.scala","sha256":"412390856cb828b36eb8319c7197c8f98e47e52bc14bc58fba3028e16957ec01","method":"full-text","ranges":[[1,88]],"unread":[]},
	{"path":"rest-lib/src/main/scala/com/gu/mediaservice/lib/auth/provider/AuthenticationProvider.scala","sha256":"f33487f20419ef181ed76f05df4621e91cfba582d4e509587dabe960efbec6d9","method":"full-text","ranges":[[1,126]],"unread":[]},
	{"path":"rest-lib/src/main/scala/com/gu/mediaservice/lib/auth/provider/ApiKeyAuthenticationProvider.scala","sha256":"9793bc83f0c6d4dc6cbd2d739800edd9d32fcb07c549511d1975ec98fbc0b4e0","method":"full-text","ranges":[[1,73]],"unread":[]},
	{"path":"rest-lib/src/main/scala/com/gu/mediaservice/lib/auth/provider/AuthorisationProvider.scala","sha256":"f827cc2cd03eb48238c1f8424607f5130f09acbd9b713dd9b09535e34164fe2d","method":"full-text","ranges":[[1,35]],"unread":[]},
	{"path":"rest-lib/src/main/scala/com/gu/mediaservice/lib/guardian/auth/PermissionsAuthorisationProvider.scala","sha256":"e3afe608f1e0c59549d89c4623332cd9372d064c1afdb530b8600454d3ae7335","method":"full-text","ranges":[[1,69]],"unread":[]},
	{"path":"common-lib/src/main/scala/com/gu/mediaservice/lib/auth/ApiAccessor.scala","sha256":"53c8829943797c8a898af56f237f2cc89d71d5dbc4e6f3b0fbb7d410cda8f87e","method":"full-text","ranges":[[1,34]],"unread":[]},
	{"path":"media-api/test/lib/elasticsearch/QueryBuilderTest.scala","sha256":"393d0f1939193580c3c709d00b67f3207b2df2b5d0acffe29b58ce39dac40de2","method":"full-text","ranges":[[1,369]],"unread":[]},
	{"path":"media-api/test/lib/elasticsearch/SortsTest.scala","sha256":"6d46ae4827928192fa393584ade6a5958bde2a850b94bf7f73921c07a7b9d852","method":"full-text","ranges":[[1,93]],"unread":[]},
	{"path":"media-api/test/lib/querysyntax/ParserTest.scala","sha256":"1bf3bb2a6c859651f74c9b9142f196c31bac01f29808627b7e4412e10a44897c","method":"full-text","ranges":[[1,612]],"unread":[]},
	{"path":"media-api/test/controllers/MediaApiTest.scala","sha256":"a812035e493f739d7542c866d971867c51505d68f28c8752dba3cb81c049dc11","method":"full-text","ranges":[[1,151]],"unread":[]},
	{"path":"rest-lib/src/test/scala/com/gu/mediaservice/lib/auth/AuthenticationTest.scala","sha256":"a7be49836f54b8315f83a4c7f563f52badf2cde41fee86c78fa8c0085f478042","method":"full-text","ranges":[[1,256]],"unread":[]},
	{"path":"rest-lib/src/test/scala/com/gu/mediaservice/lib/auth/ApiKeyAuthenticationProviderTest.scala","sha256":"d56b85ed155cddfef0a35e132de3e5a1decf085e8d14ae160c4904cbe7639ba8","method":"full-text","ranges":[[1,87]],"unread":[]},
	{"path":"rest-lib/src/test/scala/com/gu/mediaservice/lib/auth/AuthorisationTest.scala","sha256":"7d341b9cfb8a7a3512f2498b6c4d067f23ea31a6b62f1f19f3e452523bef17e9","method":"full-text","ranges":[[1,72]],"unread":[]},
	{"path":"kupua/src/dal/adapters/elasticsearch/cql.ts","sha256":"636a39cd8f0767f0a44f19fc5b494b6fd412df5e6ee3c0c480e4af2c571cb165","method":"full-text","ranges":[[1,623]],"unread":[]},
	{"path":"kupua/src/dal/adapters/elasticsearch/cql.test.ts","sha256":"71ac5f00d04fd0184894b70103d0fd5d71b847b32362cc323a9242d79640d908","method":"full-text","ranges":[[1,199]],"unread":[]},
	{"path":"kupua/exploration/docs/03 Ce n'est pas une pipe dream/media-api-work/media-api-00-index.md","sha256":"84d80ec7e7d8bcb17d263d54883bcbe2e2cc117b9264daab88af9dc39b05234c","method":"full-text","ranges":[[1,91]],"unread":[]},
	{"path":"kupua/exploration/docs/03 Ce n'est pas une pipe dream/media-api-work/media-api-01-capability-inventory.md","sha256":"c16cc0be5448393df78978cd962b7b60ab953f2c74804f06e7ae9ed57794f83e","method":"line-ranges","ranges":[[1,82],[243,505],[951,980],[1109,1149]],"unread":[[83,242],[506,950],[981,1108],[1150,1261]],"note":"Current checklist, full historical matrix, query/count/facet/ID and AI comparisons, C/D catalogue. Other historical detail is not recredited."},
	{"path":"kupua/exploration/docs/03 Ce n'est pas une pipe dream/media-api-work/media-api-02-next-endpoints-d7-d8-d9-workplan.md","sha256":"86dbaa4406fd0c75402487922b9b1e32cb1e4803e6b7e7929716b5a7bdcf9220","method":"full-text","ranges":[[1,457]],"unread":[],"note":"Preserved comparison input, not permission to execute its historical commands or migration gates."},
	{"path":"kupua/exploration/docs/03 Ce n'est pas une pipe dream/media-api-work/api-boundary-09-p09-core-store.md","sha256":"243170a57c38e4404e2424df002e2af7a14f5f8dc5b465d3ec66e72608afbc0c","method":"line-ranges","ranges":[[1,205]],"unread":[[206,359]],"note":"Deciding answer and findings as routing, plus visible receipt/context text; no borrowed original reading credit."},
	{"path":"kupua/exploration/docs/03 Ce n'est pas une pipe dream/media-api-work/api-boundary-09-p10-core-view.md","sha256":"47e2fc887ad3b0c2916cabd8ffb2b231d9a3a2a268b009f2e3e721e75990ad08","method":"line-ranges","ranges":[[1,190]],"unread":[[191,213]],"note":"Deciding answer, view contracts and routing; no independent whole-view verification."},
	{"path":"kupua/exploration/docs/03 Ce n'est pas une pipe dream/media-api-work/api-boundary-09-p13-data-producers.md","sha256":"2a86eac5c0eea42c2dc4a5d703488ef38643d01d14472ad8b337a4d7e25974c1","method":"line-ranges","ranges":[[1,195]],"unread":[[196,376]],"note":"Producer findings and visible receipts as routing. C05 complete-map wording expressly qualified by corrected E033 and original collector/report04."}
]
```

Bounded supplemental original receipts. Their purpose is the shared-caller/query/contract join, not an extension to whole-corpus review. Fully read small helpers/callers are identified as such; all larger-file complements remain unread:

```json
[
	{"path":"media-api/app/lib/elasticsearch/ElasticSearch.scala","sha256":"c563114420f0297cd5c61566258d45608886759a0cee167840a14e0899ce052d","method":"line-ranges","ranges":[[1,468],[600,933]],"unread":[[469,599]],"note":"Query, AI, counts, legacy aggregation/sort and D3 execution callers; supplier usage middle excluded."},
	{"path":"media-api/app/controllers/AggregationController.scala","sha256":"ba958a2c8c070cf5eaf10824b4717c1effcc2d943184de1603e36a9d752d77fd","method":"full-text","ranges":[[1,26]],"unread":[]},
	{"path":"media-api/app/controllers/SuggestionController.scala","sha256":"03e42afb8ca94ef0955f5393b7ae02981c41e91e640992de187b1125221630b6","method":"full-text","ranges":[[1,53]],"unread":[]},
	{"path":"media-api/app/controllers/UsageController.scala","sha256":"2a72c37435f0522649928c577ef6e9d9068722f4e56d1ace63580949cd271f30","method":"line-ranges","ranges":[[95,133]],"unread":[[1,94]],"note":"Concrete shared GET SearchParams validation/paging caller."},
	{"path":"media-api/conf/routes","sha256":"41f6a46e1191725f69eca39835ed1c02f8a7fec4c0a139bbaff367080188eaac","method":"full-text","ranges":[[1,53]],"unread":[]},
	{"path":"common-lib/src/main/scala/com/gu/mediaservice/lib/ImageFields.scala","sha256":"4d629da6f62257b5613211b0d633a9f9b5fc5d090ca3a99628ed9c41278b33f9","method":"full-text","ranges":[[1,72]],"unread":[]},
	{"path":"common-lib/src/main/scala/com/gu/mediaservice/lib/elasticsearch/filters.scala","sha256":"03276e7840d448bad32ef60ed9d160f7256e568e53cb6966c1e13461692740ce","method":"full-text","ranges":[[1,94]],"unread":[]},
	{"path":"kahuna/public/js/services/api/media-api.js","sha256":"694f4f981a46c5e6772403da636f43792bc569aca40565cf3f2ed2d03b59f9f0","method":"full-text","ranges":[[1,153]],"unread":[]},
	{"path":"kupua/src/dal/grid-api-search-adapter.ts","sha256":"05e675e63ce4a50a94f010d09a2f0e2861274bc04e56584ccc2d52451b05bbeb","method":"full-text","ranges":[[1,198]],"unread":[]},
	{"path":"kupua/src/dal/strangler-adapter.ts","sha256":"530547cf2430d174e84693b3a705a18e5dbee1edd1bb8e90a692cbb0963fa7f3","method":"full-text","ranges":[[1,85]],"unread":[]},
	{"path":"kupua/src/dal/es-adapter.ts","sha256":"7ddcd36711bd5fc5a8edd6e2e35270bd51a554e210bf7ace8db2b194ed4573f5","method":"line-ranges","ranges":[[457,595],[1114,1278],[1972,2193]],"unread":[[1,456],[596,1113],[1279,1971],[2194,2340]],"note":"Full inline query body; AI return tail after 1278 not read, total/tuple fields seen; complete map collector. Other producer paths remain P13 evidence."},
	{"path":"kupua/src/dal/adapters/elasticsearch/sort-builders.ts","sha256":"f443558619cab45e01d604ff50fb5bcf8e3ef465e92c74dc2346049f52b64e09","method":"full-text","ranges":[[1,252]],"unread":[]},
	{"path":"kupua/src/lib/search-params-schema.ts","sha256":"2e471270b29ed7ce940adf8ec437cc827f9fb673c4c8f98080c6d807c2eac6f6","method":"full-text","ranges":[[1,184]],"unread":[]},
	{"path":"kupua/src/stores/search-store.ts","sha256":"f1e85ce469d9aaa54f365f950a273aecfc4ebb22ef6dbcd63ddfb105b540b872","method":"line-ranges","ranges":[[717,847],[2159,2325]],"unread":[[1,716],[848,2158],[2326,4312]],"note":"Poll/freeze, AI publication and initial ordinary request/generation ownership; full restore/focus not re-read."},
	{"path":"kupua/src/hooks/useDataWindow.ts","sha256":"a9ffe7106e04b64312ec6def9ca4ee8ac0f7be206368e728f57a327e88269df6","method":"line-ranges","ranges":[[329,346]],"unread":[[1,328],[347,507]],"note":"Total-owned coordinate predicate only."},
	{"path":"kupua/exploration/docs/03 Ce n'est pas une pipe dream/media-api-work/api-boundary-04-reconciled-recommendation.md","sha256":"e94214d6207006a39a68f7bce48b730964b0877585a22e353b629e21b44df0e6","method":"line-ranges","ranges":[[1,43],[212,240]],"unread":[[44,211],[241,245]],"note":"F1/R6 prior recorded execution, read but not rerun; other historical recommendations not current authority."}
]
```

Required administrative context (excluded from application-coverage credit):

```json
[
	{"path":".github/copilot-instructions.md","sha256":"765de30857a0cc81cff1219d8fad37b4971ccab88c97d2b127f85326eee261c7","method":"full-text","ranges":[[1,154]],"unread":[]},
	{"path":".github/instructions/media-api.instructions.md","sha256":"0bcceb19a34ad34d957c5d3e3065ba7b5e061fa1d3c681d4939bab26be21635b","method":"full-text","ranges":[[1,152]],"unread":[]},
	{"path":"kupua/AGENTS.md","sha256":"deee38530977bf1c6d2b0a7af84a7ed32069f48d17f514a08e1182b95da9d076","method":"full-text","ranges":[[1,226]],"unread":[]},
	{"path":"kupua/exploration/docs/worklog-current.md","sha256":"783c1bc51248461eaf492f409b521a464175f74e9d5ca73f8d4d190619b606a5","method":"full-text","ranges":[[1,48]],"unread":[]},
	{"path":"kupua/exploration/docs/03 Ce n'est pas une pipe dream/media-api-work/api-boundary-05-review-protocol.md","sha256":"755278dfb5277098515103444541a6cb32b2266130a2d75a8f91aea247e84c49","method":"full-text","ranges":[[1,315]],"unread":[]},
	{"path":"kupua/exploration/docs/03 Ce n'est pas une pipe dream/media-api-work/api-boundary-08-review-prompt.md","sha256":"03f2b9aac8906c0a67e9c5e5ecf10dc5209d65d8e4b99b7052b65bdc919370d8","method":"full-text","ranges":[[1,189]],"unread":[]}
]
```

Registers were parsed mechanically, with semantic inspection limited to P15's assignment projection; selected claims E016/E017/E030/E033/E036/E038/E039 (statement/kind/status/limits); selected dependency questions D018/D024/D027/D029/D030/D031; and check output. Full register content/source arrays are not claimed as read. Oversized terminal projections were not credited for hidden text. The displayed packet ID/report/question and a second structured extraction confirmed all 34 assignments. No handoff-named document was explicitly referenced by the current AGENTS routing; archived collections of handoffs were not expanded.

**Unread limits:** actual deployment/provider wiring, private auth data, live configuration, mappings, server fusion/embedding internals, image-rights implementation, full selection/collection/history/restore owners and all other source/test/doc/history remain outside these receipts. P16/P17 and existing dependencies own those joins; this packet does not create a new coverage campaign. No credential path or operational workflow was inspected. No metadata or prior-report prose was promoted to full original-source reading.

## 4. Qualified Evidence Dispositions and New Claim Proposals

| Existing evidence | P15 disposition |
| --- | --- |
| E016 | Support the inspected mapper/Strangler portion from originals: shallow positive-offset bypass, typed expiry/unavailability/refusal. Factory construction was not re-read, so do not expand this to whole-client routing verification. |
| E017 | Retain unchanged as a conditional source inference. Full restore catch/seek source was not re-read here; F02's authorization policy makes it an API-only integration concern, not a live bypass finding. |
| E030 | Qualify its unread-parser/server limitation with P15's full CQL/grammar/filter/auth reads and F01-F04. Keep actual configuration/model parity unresolved and ignored-parameter dispositions explicit. Do not overwrite P13's original receipt limits. |
| E033 | Support the centrally corrected statement from current collector source and report04 F1/R6. Withdraw no prior evidence; do not restore an unconditional complete-map claim. Prior synthetic execution is not P15 execution or live occurrence. |
| E036 | Preserve the direct-client claim; qualify server reuse with F07's different weight/lexical/fusion/total/ticker semantics. Store loaded-result ticker scope is now directly joined. No new latency/ranking-quality claim. |
| E038/E039 | Retain test-read qualifications. P15 did not re-read those original assertion files; the newly assigned Scala/CQL assertions are separate evidence, not independent verification of P13's tests. |
| All other earlier E records and measured campaigns | Unchanged/unassessed by P15. Existing measured core is baseline; no fresh performance interpretation or replacement evidence. |

New proposals below have **no assigned E IDs**. Original path/hash/line triples are explicit; scope and limits remain attached. They support the decision table, not a standalone global plan:

```json
[
	{
		"kind":"source","status":"supported",
		"statement":"POST parsed default intent plus controller-level deleted-uploader scoping is distinct from legacy GET parsing; new query-bearing read endpoints need both policy stages.",
		"scope":"F01/F03: reusable policy for additions, not legacy GET repair.",
		"sources":[
			{"path":"media-api/app/lib/elasticsearch/ElasticSearchModel.scala","sha256":"4a46deb66ea728cdf93ae16e1cb83bd4fb030cde29558fb5bd6e1778e4a45fbb","lines":[145,210]},
			{"path":"media-api/app/controllers/MediaApi.scala","sha256":"859610f8fa50e925082125cb9c7a19f92941725add7a87e771619c160e4f7a26","lines":[859,912]},
			{"path":"media-api/app/lib/elasticsearch/QueryBuilder.scala","sha256":"d973848aa988c7a050afd2395c084d2329eff653a4b6d6a0cc4003df8aaee321","lines":[154,239]}
		],
		"limits":["Malformed-input strictness and cross-engine parity not proven.","No counts/facets endpoint implemented or tested by P15."]
	},
	{
		"kind":"source","status":"supported",
		"statement":"Restricted machine accessors reject POST before D3 handler execution; human/internal-machine/inner-service policy must not be generalized to every principal.",
		"scope":"F02: permitted methods and permission shortcuts.",
		"sources":[
			{"path":"common-lib/src/main/scala/com/gu/mediaservice/lib/auth/ApiAccessor.scala","sha256":"53c8829943797c8a898af56f237f2cc89d71d5dbc4e6f3b0fbb7d410cda8f87e","lines":[21,34]},
			{"path":"rest-lib/src/main/scala/com/gu/mediaservice/lib/auth/provider/ApiKeyAuthenticationProvider.scala","sha256":"9793bc83f0c6d4dc6cbd2d739800edd9d32fcb07c549511d1975ec98fbc0b4e0","lines":[40,63]},
			{"path":"rest-lib/src/main/scala/com/gu/mediaservice/lib/auth/Authorisation.scala","sha256":"412390856cb828b36eb8319c7197c8f98e47e52bc14bc58fba3028e16957ec01","lines":[62,88]}
		],
		"limits":["Provider deployment/configuration unread; no live principal exercised.","No blanket POST allowance proposed."]
	},
	{
		"kind":"inference","status":"supported",
		"statement":"The API mapper's raw substring default injection can contradict quoted/uppercase parsed positive intent; move POST default ownership to the server and make direct-mode parity explicit.",
		"scope":"F01: request-construction composition, source-derived rather than executed.",
		"sources":[
			{"path":"kupua/src/dal/grid-api-search-adapter.ts","sha256":"05e675e63ce4a50a94f010d09a2f0e2861274bc04e56584ccc2d52451b05bbeb","lines":[103,122]},
			{"path":"media-api/app/lib/elasticsearch/ElasticSearchModel.scala","sha256":"4a46deb66ea728cdf93ae16e1cb83bd4fb030cde29558fb5bd6e1778e4a45fbb","lines":[158,175]},
			{"path":"kupua/src/dal/adapters/elasticsearch/cql.ts","sha256":"636a39cd8f0767f0a44f19fc5b494b6fd412df5e6ee3c0c480e4af2c571cb165","lines":[402,413]}
		],
		"limits":["No mapper-to-server runtime reproduction.","Does not reopen the completed D3 amendment batch or authorize a product fix."]
	},
	{
		"kind":"source","status":"supported",
		"statement":"Legacy aggregate endpoints use CQL-only AggregateSearchParams and bucket-count totals; authorized full-context facets require an additive contract, while exact count/ticker machinery is reusable under an already-authorized filter.",
		"scope":"F03 and C1/C2/D7 comparison.",
		"sources":[
			{"path":"media-api/app/lib/elasticsearch/ElasticSearchModel.scala","sha256":"4a46deb66ea728cdf93ae16e1cb83bd4fb030cde29558fb5bd6e1778e4a45fbb","lines":[226,242]},
			{"path":"media-api/app/lib/elasticsearch/ElasticSearch.scala","sha256":"c563114420f0297cd5c61566258d45608886759a0cee167840a14e0899ce052d","lines":[368,378]},
			{"path":"media-api/app/lib/elasticsearch/ElasticSearch.scala","sha256":"c563114420f0297cd5c61566258d45608886759a0cee167840a14e0899ce052d","lines":[630,675]}
		],
		"limits":["Existing GET disclosure/security assessment not completed or repaired.","No deployment configuration, mapping parity or production cost verified."]
	},
	{
		"kind":"source","status":"supported",
		"statement":"Kupua URL policy is one semantic sort despite physical multi-clause transport; legacy GET sort construction has different defaults and collection conventions and is a protected shared caller path.",
		"scope":"F05: preserve existing policy and segregate any future server builder.",
		"sources":[
			{"path":"kupua/src/lib/search-params-schema.ts","sha256":"2e471270b29ed7ce940adf8ec437cc827f9fb673c4c8f98080c6d807c2eac6f6","lines":[126,159]},
			{"path":"kupua/src/dal/adapters/elasticsearch/sort-builders.ts","sha256":"f443558619cab45e01d604ff50fb5bcf8e3ef465e92c74dc2346049f52b64e09","lines":[94,207]},
			{"path":"media-api/app/lib/elasticsearch/sorts.scala","sha256":"47470bb47b9e4d41794f7c403239d39edc2d88c947752b2ca932dcc6dab44e4a","lines":[9,27]},
			{"path":"kahuna/public/js/services/api/media-api.js","sha256":"694f4f981a46c5e6772403da636f43792bc569aca40565cf3f2ed2d03b59f9f0","lines":[41,94]}
		],
		"limits":["No second semantic sort authorized.","All static/configured/special positional parity is a pre-implementation assertion requirement, not established by decoder tests."]
	},
	{
		"kind":"source","status":"supported",
		"statement":"Current Grid and Kupua AI are not algorithm/total/ticker equivalents; existing server infrastructure may be reused only with explicit behavioral disposition.",
		"scope":"F07: refutes the preserved historical identical-algorithm/client-only premise.",
		"sources":[
			{"path":"media-api/app/controllers/MediaApi.scala","sha256":"859610f8fa50e925082125cb9c7a19f92941725add7a87e771619c160e4f7a26","lines":[590,776]},
			{"path":"media-api/app/lib/elasticsearch/ElasticSearch.scala","sha256":"c563114420f0297cd5c61566258d45608886759a0cee167840a14e0899ce052d","lines":[186,363]},
			{"path":"kupua/src/dal/es-adapter.ts","sha256":"7ddcd36711bd5fc5a8edd6e2e35270bd51a554e210bf7ace8db2b194ed4573f5","lines":[1134,1278]},
			{"path":"kupua/src/stores/search-store.ts","sha256":"f1e85ce469d9aaa54f365f950a273aecfc4ebb22ef6dbcd63ddfb105b540b872","lines":[2164,2238]}
		],
		"limits":["Fusion helper internals, embedding/health deployment and ranking quality unread/unmeasured.","No automatic ranking change, feature removal or fresh performance campaign."]
	},
	{
		"kind":"test-read","status":"supported",
		"statement":"Assigned assertions cover parser/query forms, alias existence behavior, sort decoder rejection, authentication outcomes/provider precedence and D3 deleted-scope/machine-method behavior; they are not an executed cross-engine or all-principal suite.",
		"scope":"F01-F05 assertion evidence, including mock limitations.",
		"sources":[
			{"path":"media-api/test/controllers/MediaApiTest.scala","sha256":"a812035e493f739d7542c866d971867c51505d68f28c8752dba3cb81c049dc11","lines":[24,120]},
			{"path":"media-api/test/lib/elasticsearch/QueryBuilderTest.scala","sha256":"393d0f1939193580c3c709d00b67f3207b2df2b5d0acffe29b58ce39dac40de2","lines":[1,369]},
			{"path":"media-api/test/lib/querysyntax/ParserTest.scala","sha256":"1bf3bb2a6c859651f74c9b9142f196c31bac01f29808627b7e4412e10a44897c","lines":[1,612]},
			{"path":"media-api/test/lib/elasticsearch/SortsTest.scala","sha256":"6d46ae4827928192fa393584ade6a5958bde2a850b94bf7f73921c07a7b9d852","lines":[1,93]},
			{"path":"rest-lib/src/test/scala/com/gu/mediaservice/lib/auth/AuthenticationTest.scala","sha256":"a7be49836f54b8315f83a4c7f563f52badf2cde41fee86c78fa8c0085f478042","lines":[1,256]},
			{"path":"rest-lib/src/test/scala/com/gu/mediaservice/lib/auth/ApiKeyAuthenticationProviderTest.scala","sha256":"d56b85ed155cddfef0a35e132de3e5a1decf085e8d14ae160c4904cbe7639ba8","lines":[1,87]},
			{"path":"rest-lib/src/test/scala/com/gu/mediaservice/lib/auth/AuthorisationTest.scala","sha256":"7d341b9cfb8a7a3512f2498b6c4d067f23ea31a6b62f1f19f3e452523bef17e9","lines":[1,72]},
			{"path":"kupua/src/dal/adapters/elasticsearch/cql.test.ts","sha256":"71ac5f00d04fd0184894b70103d0fd5d71b847b32362cc323a9242d79640d908","lines":[1,199]}
		],
		"limits":["No test executed; no pass count.","Fixtures/provider mocks do not establish deployed principal behavior or count/visibility parity.","Unassigned assertions may cover additional cases; none are declared absent project-wide."]
	}
]
```

**Required assertions before each selected implementation, not new executions now:** shared filter scope across hits/counts/tickers/facets/rank/map/range; positive/negative/quoted/uppercase and malformed default intent; ordinary/privileged users plus the deliberately supported machine/inner-service set; hidden-ID omission without count leakage; runtime syndication filter prerequisites; free/rights/date/ID/alias/nested/unknown-value parity; one-sort static/configured/special tuples including null/reverse/End; exact initial totals versus untracked/subset totals; timeout/failed-shard completeness; refusal versus optional absence; AI filters/weight/cap/loaded-total/ticker/health semantics. Scope these to the selected endpoint and its actual callers; do not demand a universal new suite or restart D3 readiness.

## 5. Precise Coordinator Integration and Dependencies

1. Integrate P15 receipts only after matching current hashes; full declared source/assertion reads mean `read`, never `verified`. Preserve every prior receipt and stale state outside those exact bytes/ranges. Do not repair closure or change validator/schema.
2. D018/D029: carry F01-F04's authenticated POST scope and compatibility matrix into provisional 10. Name the intended principal audience; restricted-machine POST support requires an explicit policy decision. Hits, exact counts, tickers, named-filter counts and ID lookups must share appropriate visibility/deleted scope without changing legacy GET.
3. D027/D029 plus P17: preserve one semantic sort, authoritative tuple alignment, shallow-page behavior and initial versus continuation count intent. Keep any future semantic builder separate from legacy `sorts.createSort`; do not require replacing completed D3 Option B first.
4. D024/D030: resolve live configuration/mapping parity for identifiers, aliases, cost/quota/syndication and the intentional AI ranking/total/health contract. Do not silently enable ignored fields or treat source defaults as deployed configuration.
5. P16: join D9 visibility, hidden/missing omission, response normalization, aliases, batch limits and one enrichment-publication owner with the actual selection datasource. P15 does not choose the response envelope/cap.
6. D031/coordinator: record the parity and auth assertions above as pre-implementation requirements for the chosen capability, not a request to run suites now. Keep E033's HTTP-200 exception and P09/P10/P13's remaining core joins visible. Stop after P15-P17 and PROVISIONAL integration 10 for operator review; no further dispatch follows from this report.

## 6. Checks and Limits

Verified `packet P15` returned P15, its exact deciding question, `strong` execution class, 34 assignments and this output path. Current read-only Git HEAD is `0e79a4dec637e3eaf05bb252c2ec7f95e8e68c8d`. The report path did not exist before creation. No other file was written; no register/worklog/routing changes, code, tests, builds, performance runs, services, browser, credentials, Git mutation or delegation. D033 remains separate/nonblocking and its approved external credential link was not accessed.

Executed administrative checks: initial in-memory Node report check passed six-section structure and all 42 draft local links. Current `api-boundary-review.mjs check` returned **zero errors**, `readyForSynthesis:false`, 1,803 inventory entries, 130 read, 29 partial, 3 stale and 20 open dependencies. Warnings identify AGENTS revalidation/change and the stale directive-copy/changelog entries. Those values precede coordinator integration of P15; no closure was repaired. Read-only Node fingerprint extraction confirmed 34 assignments and 28 full source/assertion files totaling 5,401 lines. The final report receipt/link recheck is reported in the handoff; it validates bookkeeping, not comprehension.

Source/test reading is not execution, complete corpus coverage, production capacity or authentication-provider deployment proof. Existing measured core remains the baseline; this report neither reruns it nor derives latency from source size or request counts. The report's source performance implications are limited to query shape, enrichment avoidance and where existing runtime/AI work occurs. The current index's recorded-measurement topology limits remain intact; no numerical performance estimate has been imported from an unread campaign.