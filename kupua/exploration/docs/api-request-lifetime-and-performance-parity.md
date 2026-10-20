# API Request Lifetime and Performance Parity

**Investigation, 20 October 2026.** Operator-authorized assessment of KUP-041 and
optimisations that might have been left behind when Kupua moved to media-api.
The original investigation made no product changes and ran no Scala tests or performance
campaign. A later, separately authorized bounded browser observation used local media-api
with operator-identified TEST. The separately authorized S4a and S4b repairs and their
validation are recorded below; KUP-040 and the server-side candidates remain unimplemented here.
**Assessment target: local media-api mode.** Direct ES is a retiring source reference,
not a performance baseline or repair target. The single deployed media-api campaign is a
separate checkpoint, not a repeated deployed baseline or a substitute for local evidence.

## 1. Decision Summary

**Fix the demonstrated wasted requests in Kupua first. No Scala change currently earns
the definitely-worth-fixing category on the available impact evidence.** The browser controls
below are completed observations, not a list of experiments left for the next agent.
"Worth fixing" means a small, justified request-efficiency repair, not an emergency or a
promise of a measured frame-time/ES-CPU improvement. S4a and S4b are now repaired under separate
operator approval; the remaining implementation choices are not authorized by this assessment.

**Which API?** Kupua's facets/counts use new POST endpoints; its AI and singleton detail use
existing GET routes. Changing Kupua's callers does not change Kahuna. A shared Scala GET
change can affect Kahuna; a Kupua-only opt-in projection would not automatically benefit it.
Kahuna's [caller](../../../kahuna/public/js/services/api/media-api.js#L41) and local `main`
at `c27bdae84` establish source applicability, not the binary/configuration deployed in PROD.

### Definitely Worth Fixing

| Fix | Concrete Benefit | Existing media-api / Kahuna | New Endpoints / Kupua | Change Location |
| --- | --- | --- | --- | --- |
| S4a: reuse an equivalent pending facet batch when Browse opens — **repaired** | Original hover/open sent two equivalent requests, cancelling the first after about 71 ms. Equivalent dispatched work is now shared; warm reopen remains cached. | No GET contract or Kahuna behaviour change. | API-composed held-response regression proves one dispatch rather than replacement, with counts and expanded reuse preserved. No post-fix live-browser or backend CPU/latency measurement. | Kupua search-store admission only; no Scala. See repair validation below. |
| S4b: reuse scope-bound suggestion buckets and stop reset-time suggestion work — **repaired** | Original fresh credit prefixes repeated identical 50-bucket reads; Home sent five obsolete option reads. Equivalent pending and completed option work is now reused, and retired/resetting editors cannot admit reads. | No Kahuna behaviour change; this is Kupua's CQL ownership/resolver path, not a shared-server cache. | Owner/API-composed tests prove avoided repeated reads, rights restoration and 50/100 separation; mounted Clear/Home controls retain counted suggestions and suppress obsolete work. No post-fix live-API or backend-cost measurement. | Kupua typeahead/resolver/lifecycle code; no Scala or global cancellation manager. See repair validation below. |
| S2 / KUP-040: do not poll an impossible arrival interval | Deterministically remove reads that cannot find arrivals: about six scheduled reads/minute foreground or two/minute hidden, plus visibility ticks, while the interval is impossible. Small hygiene fix, not a claimed browsing speedup. | No change to Kahuna's polling or existing GET semantics. | Avoid unnecessary POST count reads; retain notifications for eligible intervals. Already supported by KUP-040's source and recorded API evidence. | Kupua polling admission; no Scala. |

### Maybe Worth Fixing

| Opportunity | Benefit Required to Justify It | Existing media-api / Kahuna | New Endpoints / Kupua | Decision |
| --- | --- | --- | --- | --- |
| F1 / KUP-041: server-side cancellation, including owned counts (S1a) | Material residual work after genuine abandonment, beyond the redundant reads above. Browser abort counts and socket lifetime do not establish ES CPU savings. | Shared Future/client limitation also affects existing GETs, but benefit requires an actual disconnect; do not assume Kahuna aborts every superseded search. A shared-client change can affect other Grid consumers too. | Kupua already sends browser aborts for new POST reads and its GET AI/detail work; server lifetime ownership is missing. | Scala/Play/execution work, not yet justified as a broad implementation. Measure residual backend work before choosing its architecture. |
| F2: yield between API JSON parsing and publication | A relevant local-API trace or bounded before/after check shows better responsiveness. Saved long frames alone do not establish the cause; yielding removes neither JSON parsing nor server work. | No effect on Kahuna's Angular schedule or existing server behaviour. | Could smooth arrivals from both POST and GET reads in Kupua. | Small Kupua-only candidate; not a fix for repeated aggregations and not yet a promised improvement. |
| F3: skip embedding for lexical-only AI (`vecWeight=0`) | A whole cold Bedrock dependency/failure mode is avoidable, but only for this narrow supported mode; no default positive-weight AI benefit. | Shared text-AI GET would benefit Kahuna's zero-weight requests if that shared branch is fixed. Legacy compatibility must be explicit. | Kupua AI uses the same existing GET with `aiQuery`, not a new POST endpoint. | Narrow Scala candidate if the mode is worth supporting; not a general AI performance project. |
| F5 source reduction / F6 lean singleton reads | Actual AI or standalone payload/decode cost warrants compatibility work. No general traversal saving: resident detail skips the singleton read. | Existing GET consumers require their fields. An opt-in lean variant protects them but gives Kahuna no automatic benefit; a default change needs broader review. | New image-returning POSTs are already lean. Only Kupua's existing-GET AI/detail paths are candidates; singleton rerouting also needs GET/search semantics checked. | Conditional contract work, not a blanket source projection or immediate migration task. |

**Do not spend standalone performance work on:** F4's earlier pool-count launch (no measured
critical-path delay), S3's cancellation of reusable metadata (no established waste), S1b's
ordinary poll serialization (no observed normal overlap), or F5's unused hit tracking alone
(no material bottleneck established). Warm facet reopen and resident density already reuse data.

All 17 datasource methods were accounted for; the shared browsing optimisations are not
generally disconnected. The definite fixes prevent requests at the producer. They do not
prove KUP-041's server savings, explain PP3's transport failure or create new migration gates.

## 2. Findings and Discriminating Checks

### F1. Cancellation stops before server-owned ES lifetime

The API mapper passes a caller signal to fetch and checks it before dispatch and after
JSON decoding ([transport](../../src/dal/grid-api-search-adapter.ts#L211),
[JSON completion](../../src/dal/grid-api-search-adapter.ts#L238)). Its absence is not the bug.
The shared store separately owns search, browse, maintenance, focus, facet, expanded-facet,
distribution and position-map cancellation ([owners](../../src/stores/search-store.ts#L594)).

The ordered controller returns `Future[Result]` from each read
([controller](../../../media-api/app/controllers/ImageQueryController.scala#L66)).
`executeAndLog` transforms `client.execute` into another Future; it exposes no per-read
cancellation handle ([execution](../../../common-lib/src/main/scala/com/gu/mediaservice/lib/elasticsearch/ElasticSearchExecutions.scala#L12)).
The client is shared and constructed through elastic4s `JavaClient.fromRestClient`
([client](../../../common-lib/src/main/scala/com/gu/mediaservice/lib/elasticsearch/ElasticSearchClient.scala#L42)).

Installed dependency source was inspected, not inferred from current upstream documentation:

- elastic4s-client-esjava 8.19.1, `com/sksamuel/elastic4s/http/JavaClient.scala`:
  `send(...): Unit` calls `client.performRequestAsync(request, listener)` and discards its
  `Cancellable`. Closing the whole client is not an acceptable substitute.
- Play 3.0.10, `play/api/mvc/Action.scala:72` and
  `play/core/server/PekkoHttpServer.scala:437`: ordinary action execution consumes/parses the
  request, obtains a `Future[Result]`, then converts that result into an HTTP response.
  This inspected path does not supply the action with a consumer-disconnect cancellation
  token while that Future is awaiting ES. Watching request-body completion would observe
  successful parsing, not loss of the response consumer. Watching a response stream only
  after the result is available would miss the expensive wait before that result exists.
- Installed Vite's native proxy path does destroy its upstream request on unfinished
  response close (`vite/dist/node/chunks/node.js:19101`). Local `/api` uses this proxy;
  deployed TEST mode bypasses it ([proxy configuration](../../vite.config.ts#L174)).
  This is source evidence for that installed path, not an end-to-end disconnect test or
  certification of nginx/deployed ingress settings or the optional proxy fetch path.

The [19 October transport evidence](../experiments/es-transport/README.md#separate-issues-not-this-transport-diagnosis)
already records backend lifetime continuing to approximately 30 seconds after browser
focus cancellation at approximately eight seconds in the local media-api investigation.
It does not establish continued ES CPU use for the entire interval.

The same record reports four aggregation cancellations per repetition in passing and failing
windows, but does not establish equivalent request scopes or work remaining at cancellation.
The 8-to-30-second example is a focus read, not 22 seconds of aggregation CPU. F1 could reduce
load/concurrency if slow reads are often abandoned early; it could save little when reads have
already finished. Preventing redundant dispatch (S4) and cancelling genuinely obsolete work
are different interventions. Neither removes the accepted successor's intrinsic query cost.

**Affected operations:** every dispatched POST read, plus singleton GET and AI GET.
AI may dispatch several ES reads, and may start a successor stage after its browser consumer
is gone. Its embedding future is cache-shared between consumers
([cache](../../../media-api/app/controllers/MediaApi.scala#L66),
[stages](../../../media-api/app/controllers/MediaApi.scala#L731)); cancelling one consumer
must not cancel an embedding another caller still needs. Counts have the additional S1 gap.

**Scala conclusion:** real server-side cancellation requires server changes. It is not
possible to repair this by adding browser controllers alone. The exact solution is not
settled: prove a supported early disconnect hook for the selected server/ingress, or choose
an explicitly bounded-work alternative. Retaining a REST handle alone solves only half
the problem. A media-api-local read executor is an option to assess before changing the
shared execution contract for all Grid consumers, not an approved implementation.

Existing ES query timeouts do not supply that lifetime ownership: new POST reads apply the
10-second search timeout, but that is not a hard wall-clock socket deadline or a browser
disconnect hook ([timeout](../../../media-api/app/lib/elasticsearch/ElasticSearch.scala#L87),
[target](../../../media-api/app/lib/elasticsearch/ElasticSearch.scala#L798)). Racing a Future
against a timer without cancelling its work is also insufficient.

**Required proof:** a held synthetic ES response behind the actual incoming server boundary;
cancel before dispatch, during dispatch, while awaiting response and after completion.
Observe the outgoing handle/connection and absence of later stages. Retain unrelated concurrent
and successor requests, callback cleanup, success/failure, auth, compression and pool reuse.
Test direct and local-proxy ingress separately; deployed ingress remains an explicit boundary.
Describe any cancellation as best effort, not proof that every ES task stops immediately.

### F2. API responses lost the post-parse yield

The API transport returns decoded JSON immediately after its abort check
([API JSON](../../src/dal/grid-api-search-adapter.ts#L238));
page decoding, enrichment extraction and the awaited caller's publication follow in promise
continuations ([page decoding](../../src/dal/grid-api-search-adapter.ts#L248)).

The legacy [transport yield](../../src/dal/es-adapter.ts#L656) explains discovery of the
omission, not its present-day performance value. That question belongs to local API
task/response traces, not another direct-ES comparison.
The API position-index loop's inter-page yield is present, but is not an equivalent yield
for each image-page response ([map loop](../../src/dal/api-data-source.ts#L325)).
Saved API campaigns also contain long frames (section 6), making this a plausible focused
responsiveness candidate, not proof of the cause. Yielding does not remove parse CPU or ES
work, and may add scheduling delay; distinguish smoother interaction from faster data arrival.

**Repair/proof:** Kupua-only response-boundary scheduling, preserving pre/post-abort guards.
Hold the yield in a transport test and prove the result/store cannot publish before release;
abort while held and prove no stale decode/publication. Retain the fallback when Scheduler
is unavailable. A subsequent operator-selected trace comparison would establish actual
frame impact; no worker, endpoint change or new performance campaign follows automatically.

### F3. Lexical-only AI unnecessarily embeds

The API correctly transports zero
([mapper](../../src/dal/grid-api-search-adapter.ts#L345)), but `semanticSearchByText` calls
`embeddingCache.get` and awaits it before invoking `hybridSearch`, for every weight
([controller](../../../media-api/app/controllers/MediaApi.scala#L713)). Only inside
`hybridSearch` does weight zero select `lexicalSearch`
([server branch](../../../media-api/app/lib/elasticsearch/ElasticSearch.scala#L345)).

A cold cache therefore performs an unnecessary Bedrock call; even a warm cache imposes
the dependency. An embedding failure can prevent an otherwise lexical-only operation.
This is code-path evidence, not a live failure or a measured frequency. It does not justify
changing the API's accepted ranking semantics.
The value is narrow: positive-weight/default AI receives no benefit, completed cache hits
save little, and no usage evidence establishes how often vecWeight=0 is selected. This may
be a sensible small correctness/dependency repair without being a major performance project.

**Repair/proof:** media-api Scala short-circuit before embedding acquisition. Existing
[AI test helper](../../../media-api/test/controllers/MediaApiAiSearchTest.scala#L151)
already supports `neverEmbedded`; the
[explicit-weight cases](../../../media-api/test/controllers/MediaApiAiSearchTest.scala#L300)
currently check IDs, not avoided embedding work. Extend the owner test: hold/fail the
embedder, request explicit `aiQuery` with zero weight, assert no embedding and unchanged
IDs/pool/tickers/visibility. Keep positive/mixed weights and no-`aiQuery` compatibility
controls. Decide explicitly whether the opt-in path alone changes or legacy AI changes too.

### F5. AI hit reads are not the lean POST readers

Server `lexicalRequest` and
`semanticRequest` set query/size but neither source projection nor hit-tracking intent
([lexical](../../../media-api/app/lib/elasticsearch/ElasticSearch.scala#L206),
[semantic](../../../media-api/app/lib/elasticsearch/ElasticSearch.scala#L230)).
ES default hit tracking is bounded, not an exact full-index count; the separate exact pool
count remains intentional. The ranked hit totals themselves are not used for that pool.

U9's explicit AI response omits embeddings in the writer
([writer selection](../../../media-api/app/controllers/MediaApi.scala#L659)); it does not
omit them from ES responses or their Scala decode. Full `originalMetadata` also remains
on the canonical response ([writer](../../../media-api/app/lib/ImageResponse.scala#L330)).
This limitation was already explicit in the
[U10 characterization](zz%20Archive/runtime-configuration-and-data-sources.md#21-completeness-is-scoped),
not a newly discovered failure of the lean POST implementation.

**Conditional Scala scope:** a source projection needs a selected server contract.
Pure lexical/pure semantic and mixed fusion require
separate cases: mixed fusion calculates similarities from returned image vectors, so dropping
all embeddings before scoring breaks it
([fusion](../../../media-api/app/lib/elasticsearch/ElasticSearch.scala#L299)).
Assert actual emitted request bodies, final IDs/order/pool counts and compatibility. Separate
ES-to-server bytes/decode cost from server-to-browser response bytes; quantify neither by inference.
Source slimming is conditional on measured payload/decode dominance, not a broad server refactor.

### F6. Standalone GET retains heavy data

API `getById` uses existing singleton GET, with proper cancellation
([API lookup](../../src/dal/grid-api-search-adapter.ts#L169)). Its migration-aware getter
fetches full source ([getter](../../../media-api/app/lib/elasticsearch/ElasticSearch.scala#L141));
the default writer includes embedding and original metadata, unlike explicit AI's opt-out
([writer](../../../media-api/app/lib/ImageResponse.scala#L330)). File metadata is link-only
unless expanded, but reading/decoding it from ES still has a cost.

This is known route inheritance, not a missed AbortSignal. An opt-in lean GET preserving
lookup semantics requires Scala. Reusing the existing lean POST mget could avoid a new endpoint,
but would be a client routing decision with real-time GET versus refresh-visible search,
authorization, fields and absence semantics to verify. Do not call that automatically equivalent.
No singleton reroute or blanket legacy GET projection is selected here.
The relevant alternative is media-api's existing
[lean POST mget](../../../media-api/app/lib/elasticsearch/ElasticSearch.scala#L1251),
not investment in a direct-ES lookup.
Resident detail [skips this fetch](../../src/components/ImageDetail.tsx#L254), so slimming it
would not accelerate every traversal. Without lookup frequency/size/wait evidence, this is
a secondary candidate rather than a general browsing-performance fix.

## 3. Shared Gaps, Not Lost API Wiring

| ID | Evidence and exact consequence | Decision and Scala relevance |
| --- | --- | --- |
| S1a Counts cannot be cancelled | `count`/`countWithTickers` accept no signal in the [interface](../../src/dal/types.ts#L293), [direct](../../src/dal/es-adapter.ts#L714) or [API implementation](../../src/dal/api-data-source.ts#L122). The [initial ticker read](../../src/stores/search-store.ts#L2554) and [poll](../../src/stores/search-store.ts#L928) outlive query replacement; generations stop publication, not work. | Add optional signal and real count ownership in Kupua if selected. Server cancellation still needs F1; this does not require a new count endpoint/body. |
| S2 Impossible interval polls | [KUP-040](bug-backlog.md#kup-040) already covers lower bound at/after upper bound. Both adapters receive the same impossible intent. | Cheap shared admission repair, no necessary Scala change. Preserve supported timezone/invalid-date handling and future/open intervals. |
| S4a Pending base facets restart — repaired | At assessment baseline, the [base action](../../src/stores/search-store.ts) cancelled before checking its completed cache. [Browse hover](../../src/components/StatusBar.tsx#L119) followed by [Filters activation](../../src/routes/search.tsx#L103) reproduced equivalent pending cancellation/reissue. Warm and expanded reopen controls sent no reads. | The store now shares equivalent dispatched work before cancellation. Completed caches and the POST contract are unchanged. |
| S4b Suggestions repeat or outlive reset — repaired | At assessment baseline, [cold suggestion resolvers](../../src/lib/typeahead-fields.ts) repeated equivalent reads after successful completion; Home/Clear also emitted obsolete credit reads. Settled rights roundtrip and 50/100-bucket controls establish different scope/request-size boundaries. | Resolver-local pending/completed reuse and editor-lifecycle admission now preserve counted/latest-prefix options, own-chip exclusion and last-consumer cancellation. No Scala change. |

An isolated 20 October probe extracted the actual `fetchAggregations`, `cancelAggregationFetch`
and `aggCacheKey` through TypeScript's AST and executed them with a fixed ordinary-query scope,
one synthetic field, manual debounce timers and held mock DAL reads. Two ordinary calls after
the first dispatch produced two equal-scope requests and aborted the first signal. The old
completion could not publish; the accepted completion populated the cache and a third call
sent nothing. No product/test files or network were involved in that isolated probe. The
subsequent browser check below adds mounted UI witnesses, not backend-cost proof.

**20 October authorized browser observation:** reloaded the shared tab and verified
foreground visibility, ApiDataSource and `media-api/local` runtime topology. The operator
identified TEST; neither that fingerprint nor this check identifies the server binary.
Served raw search-store/typeahead-fields/lazy-typeahead SHA-256 values matched workspace
source, and the running facet action retained the examined cancellation path. A bounded
pass-through fetch/Response.json observer compared complete canonicalized request bodies
in browser memory; it did not clone responses, hold/retry requests or alter signals.

| Ordinary UI action | Aggregation starts | Successful JSON reads | Browser-cancelled fetch/body | Equivalent effective bodies |
| --- | --- | --- | --- | --- |
| Open Browse with persisted-expanded Filters | 1 | 1 | 0 | Single control read |
| Hidden Browse, new rights scope, hover until prefetch starts, then open | 2 | 1 | 1 | Both bodies equal; first was still pending when opened |
| First short credit-value prefix, 120 ms between key events | 4 | 3 | 1 | All four equal |
| Clear between typing sequences, separately accounted setup | 5 | 0 | 5 | All five equal to that suggestion scope |
| Second short credit-value prefix, 180 ms between key events | 4 | 4 | 0 | All four equal; also equal to the earlier suggestion scope |

The hover prefetch was browser-aborted about **71 ms** after dispatch; its replacement's
JSON read completed about **1051 ms** after its own dispatch. The open-only control completed
around **1256 ms**. These are individual observed browser intervals, not paired benchmarks,
ES timings or promised savings. Completed suggestion JSON reads were approximately **45-98 ms**
in the first typing sequence and **63-70 ms** in the repeat. Repetition after completion
means pending-only coalescing would not address the whole suggestion pattern.

There were **16 aggregation starts: nine successful JSON reads and seven cancelled fetches**,
three distinct effective bodies, no observed non-abort aggregation failures and no ES/Bedrock
browser reads. Six successful reads had their signals aborted later; those are **not** extra
network cancellations. The Clear burst is a separate lifecycle witness, not silently included
in typing counts or attributed to an unproved remount root cause. The capture stayed below
the 30-start cap and was stopped manually before its 240-second deadline. It excluded startup,
source verification and final Home cleanup, and was not a frame/performance campaign.

These are agent-paced uses of ordinary controls with unmodified response timing, not a sample
of how often humans hover/open/type, a general incidence estimate or proof of server dispatch
for every aborted fetch. [LazyTypeahead](../../src/lib/lazy-typeahead.ts#L163) cancels prior
passes, but successful bucket reuse is also relevant. A repair must key by the complete
effective scope, fields and sizes, not just field/prefix: own-chip removal, rights, frozen
boundaries and other filters can matter. Do not remove useful counted suggestions or conflate
collections, base/expanded facets and sort profiles. This does not identify the historical
four cancellations or certify AI/dynamic-field/permission scopes not exercised here.

**Completed adjacent controls, same authorized local-API runtime:** the later decision pass
closed the earlier scope-control ambiguity. These are ordinary UI witnesses, not a campaign
or a representative-user sample:

- A fresh base-facet setup completed one 18-field batch. Closing, hovering and reopening
  Browse then sent **zero** aggregations and retained the identical result object/cache key.
  The completed-query cache works; S4's base-facet gap is pending work, not every reopen.
- A resident Grid -> Table -> Grid roundtrip sent **zero** aggregations and retained the
  same result-buffer and query-parameter objects. This does not certify frame timing or all
  density transitions, but argues against blanket cancellation or cache invalidation on density.
- Selecting a populated credit facet sent one option read and one useful changed-query base
  batch. Chip focus sent one equivalent option read. A verified native-keyboard edit changed
  the chip, committed query and matching facet key: one option read reused the earlier
  request body, plus one legitimately different base batch. The four-read fresh-composition
  pattern is not a claim about every existing-chip edit; unverified input attempts were excluded.
- **Rights scope passed:** after each actual checkbox transition, wait for a new settled
  search generation and matching URL/store rights before focusing the chip. All-rights
  requests omitted `free`; free-only sent `free=true` and a different request-body group;
  restoring all-rights restored the original group. Repeated/returned same-scope responses
  had identical 50-bucket payloads. Transition-time predecessor reads were recorded separately,
  not mislabelled stale reads from the settled successor scope.
- **Requested size passed:** Show more issued one distinct 100-bucket credit request and
  returned 100 buckets. Hide/reopen reused that expanded object with no aggregation; Show
  fewer removed the expansion with no aggregation. The 50-bucket suggestion response is not
  interchangeable with the 100-bucket expansion. Do not deduplicate by field name alone.
- **Reset churn passed:** with the credit chip present, Home issued five equivalent option
  reads: four cancelled and one successful 50-bucket JSON read, alongside its useful page/count.
  The earlier Clear witness issued five cancelled reads. Reset-time option work is therefore
  a concrete part of S4b, not an unexercised lifecycle question. No remount root cause is claimed.

The earlier adjacent window captured eight successful aggregations. The final decision pass
captured **13 aggregations: nine successful JSON reads and four cancelled fetches**; all three
settled rights/body-flag checks passed, with no non-abort HTTP/read failure or ES/Bedrock
browser read observed. It stayed below its 40-aggregation/100-API-start and ten-minute safety
bounds and stopped manually. The five-minute guard on the earlier window supplied no rights
conclusion; the synchronized final pass supersedes that limitation. Each observer/global was
removed, native fetch restored, the credit expansion collapsed, Browse hidden and clean
all-rights Home restored. No body, bucket names or identities were retained in the repository.

The initial page and ticker count both request an exact total in both modes. The separate
ticker read supplies useful configured metadata and optional-failure isolation; this investigation
does not authorize removing it as a duplicate. Existing tests intentionally preserve that shape.

## 4. Datasource Coverage

Every interface method was checked against both implementations and its controlling owner.
Signals below mean browser transport cancellation, not certified server cancellation.

| Method | API route / shape | Preserved optimisation or explicit difference |
| --- | --- | --- |
| `searchRange` | Delegates to `searchAfter` | Caller-owned signal; no adapter-global cancellation of additive ranges. |
| `searchAfter` | POST search-after or shallow window | Signal, explicit `countAll`, bounded page, reverse/end/null handling; lean server source; F1/F2 remain. |
| `count` | Delegates to countWithTickers | Size-zero count; no signal in either mode (S1). |
| `countWithTickers` | POST count | Exact total plus ticker batch, size zero; S1/S2, not API-only omissions. |
| `getById` | GET singleton | Signal and request-owned standalone result; F6. |
| `getAggregations` | POST aggregations | One static field/is/usage batch; deduplicated fields/sizes; signal; server hit tracking disabled. |
| `openPit` | No request, returns null | Explicit build-plan decision; no API ES snapshot to leak. |
| `closePit` | No request | Intentional counterpart to no API PIT. |
| `searchByAi` | GET images with explicit aiQuery | Signal, finite 200-hit membership, no browser count/PIT/pagination/ES/Bedrock; F1-F5. |
| `countBefore` | POST rank | Signal, size-zero exact rank; `_search` instead of `_count` deliberately keeps PIT-ready shape. |
| `estimateSortValue` | POST scalar-anchor profile | Signal, scope, compression 200 percentile; server size zero/no hit tracking. |
| `findKeywordSortValue` | POST keyword-page profile walk | Signal, 10k default buckets, 50 pages and 8 s between-page cap, like direct. Not a hard per-read timeout. |
| `getKeywordDistribution` | POST keyword-page profile walk | Signal, 10k buckets x 5 pages, first-page-only valued coverage; same bounded provenance. |
| `getDateDistribution` | POST stats then buckets | Signal through both, adaptive interval, missing/nested semantics; same two-step shape as direct. |
| `fetchPositionIndex` | POST key-page walk | Source-free, no totals, same chunk bound, signal, inter-page yield, discard partial map; no dedicated API PIT by decision. |
| `getByIds` | POST mget | 200-ID chunks, max four flights, caller signal relayed to local controller, sibling fetches aborted after failure; direct uses 1k-ID chunks all at once. |
| `getIdRange` | POST keys | Source-free, signal, 1k chunk and 5k cap plus lookahead, stops past endpoint; shared hook aborts on context/membership change. |

Primary sources: [interface](../../src/dal/types.ts#L283),
[full API implementation](../../src/dal/api-data-source.ts),
[mapper/transport](../../src/dal/grid-api-search-adapter.ts),
[direct implementation](../../src/dal/es-adapter.ts#L633),
[server readers](../../../media-api/app/lib/elasticsearch/ElasticSearch.scala#L905).
The four-flight mget choice was expressly selected and browser-checked in the
[build plan](03%20Ce%20n'est%20pas%20une%20pipe%20dream/api-build/api-build-00-plan.md#L738).
Do not restore unbounded direct-mode concurrency as a presumed optimisation.

## 5. Optimisations Still Connected

| Mechanism | Current controlling evidence | Result |
| --- | --- | --- |
| Datasource isolation | [factory](../../src/dal/index.ts#L38), API method-complete routing tests | API constructs no direct ES datasource and has no ES/Bedrock rescue path. |
| Search typing/default admission | [debounce owner](../../src/lib/orchestration/search.ts#L54), [URL/default owner](../../src/hooks/useUrlSearchSync.ts#L126) | Shared debounce cancellation, initial defaults ordering and same-query/display-only dedup remain. KUP-039 repaired, not a new gap. |
| Foreground versus maintenance lifetime | [owners](../../src/stores/search-store.ts#L594), [search replacement](../../src/stores/search-store.ts#L2344) | Search/browse/focus not accidentally cancelled by every density/refill change; newer queries cancel obsolete owners. |
| Focus deadline | [eight-second combined signal](../../src/stores/search-store.ts#L1703) | Browser cancellation/fallback retained; does not impose that deadline on Scala (F1). |
| Exact totals only when requested | [page mapper](../../src/dal/grid-api-search-adapter.ts#L278), [server page](../../../media-api/app/lib/elasticsearch/ElasticSearch.scala#L928) | Initial page counts; extends/seeks/fills do not request exact page totals. |
| Source reduction and metadata batching | [lean helper](../../../media-api/app/lib/elasticsearch/ElasticSearch.scala#L772), [key request](../../../media-api/app/lib/elasticsearch/ElasticSearch.scala#L1129), [facet request](../../../media-api/app/lib/elasticsearch/ElasticSearch.scala#L1223) | POST projection, source-free maps/ranges and size-zero batched facets retained. API usage rollups avoid repeated nested traversals. |
| Scroll demand/admission | [data-window owner](../../src/hooks/useDataWindow.ts#L404), [extension guards](../../src/stores/search-store.ts#L2814) | Velocity-aware forward lookahead, backward validity, indexed refill debounce, cooldowns and single-flight per direction remain. |
| Bounded buffers/fill | [eviction](../../src/stores/search-store.ts#L2875), [fill/top-up](../../src/stores/search-store.ts#L1206) | 1k buffer, 200 pages, bounded top-up and no duplicate top-up owner remain. |
| Resident/map/distribution fast paths | [resident reuse](../../src/stores/search-store.ts#L3197), [map seek](../../src/stores/search-store.ts#L3322), [cached bucket](../../src/stores/search-store.ts#L3706) | No mode branch bypasses the fast paths; cached bucket avoids another vocabulary walk. |
| Parallel centred reads | [centred buffer](../../src/stores/search-store.ts#L1530), [restore](../../src/stores/search-store.ts#L4343) | Forward/backward overlap, rank/target overlap and unchanged-tuple rank reuse remain. |
| Focus rank avoidance | [position map lookup](../../src/stores/search-store.ts#L1856) | Map hit skips rank; otherwise retained exact rank/centred work. |
| Facet admission/cache | [facet owner](../../src/stores/search-store.ts#L4483) | 500 ms debounce, completed-query cache, slow-success circuit breaker, generation/signal guards; expanded-facet cache/collapse cancellation retained. Warm reopen reused the completed batch in local API UI; S4a now also coalesces equivalent dispatched base work (validated below). |
| Distribution request sharing | [distribution owners](../../src/stores/search-store.ts#L4652) | Same-key pending promise and completed cache; replacement abort and stale guards for primary/null distributions. |
| Lazy suggestions/cache reuse | [typeahead](../../src/lib/lazy-typeahead.ts), [resolvers](../../src/lib/typeahead-fields.ts) | Field intent, own-chip scoping and cached facets/tickers remain. S4b adds bounded scope-bound pending/completed option reuse, successor-before-predecessor handoff and reset/retired-owner admission guards. |
| Selection metadata reuse | [selection owner](../../src/stores/selection-store.ts#L538), [range owner](../../src/hooks/useRangeSelection.ts#L223) | Cache/pending-ID dedup; local/resident range paths and context-bound server walk remain. |
| API fallback derivation | [derivation](../../src/lib/derive-enriched-image.ts#L92) | U10-B skips local cost/validity/status calculation when overlay values exist; not still the old eager duplicate work. |
| Media admission/prefetch | [thumbnail admission](../../src/components/ImageGrid.tsx#L963), [prefetch pipeline](../../src/lib/image-prefetch.ts#L269), [traversal](../../src/hooks/useImageTraversal.ts#L156) | Visible plus two rows eager; shared cadence-aware neighbour prefetch/priority/radius cancellation, warm-cache tracking and proactive extends remain independent of datasource mode. |
| Media sizing | [URL builders](../../src/lib/image-urls.ts#L217) | Existing imgproxy resize/native cap/DPR/format path still shared. Canonical API media delivery is U7, not already complete. |
| Embedding reuse | [server cache](../../../media-api/app/controllers/MediaApi.scala#L66) | API cache coalesces an in-flight embedding per normalized text. Do not cancel a shared server future for one consumer. |

Media cancellation here is browser image-fetch lifecycle, not ES request lifetime. Current
API mode still uses the shared local media URL builders. Carrying sizing/prefetch/cache-key
properties into U7 needs its own accepted delivery checks; no claim is made about an
unimplemented canonical-media path or server-side image-transformation cancellation.

## 6. Evidence Coverage and Validation

**Source scope:** all datasource interface methods and both production implementations;
API mapper/decoder; search-store search/discovery/count/poll/cancellation/fill/extension/seek/
restore/facet/distribution owners; selection hydration and collection admission; standalone
detail; data-window demand; URL/default and search debounce; typeahead/resolvers; traversal,
prefetch, image URL builders and thumbnail admission; current derivation; service discovery;
Vite routing and installed native proxy; ImageQueryController and its shared read builders;
legacy singleton getter/writer; text-AI controller/cache and ranking/pool request builders;
shared ES execution/client and installed elastic4s/Play sources. This is an operation/owner
inventory, not a claim to have reviewed every UI component or every line of the repository.

**Prior evidence consulted:** KUP-038/039/040/041; active API build plan including U3/U5/U6/U9/U10
decisions; 19 October transport evidence; archived rendering yield evidence and U10 data-source
characterization; [L19 request attribution and server observations](zz%20Archive/not-yet-another-audit-L19-network-measurmenets.md#feature-ownership-not-blanket-aggregation-waste).
Historical results retain their original topology/version and measurement limits. Current
source and maintained tests control present-day wiring conclusions.

L19 sampled mixed aggregation ES-client round trips of **51-180 ms** and counts of **43-239 ms**
([measurement boundary](zz%20Archive/not-yet-another-audit-L19-network-measurmenets.md#server-observability)).
These include transport/response handling, not just ES CPU; they are not paired distributions,
current production tails or the work left after abort. Its request attribution separated
collection counts and suggestions and did not identify a bulk hidden-panel fetch in those
samples. The local media-api portion of the [U9 three-run record](03%20Ce%20n'est%20pas%20une%20pipe%20dream/api-build/api-build-00-plan.md#L1044)
put API AI around **1.8-2.2 s** and isolated pool counts around **0.06-0.13 s**, concluding
counts did not delay sampled publication. These records argue against assuming F4 is important.

**Saved local media-api evidence:** the histories present on 20 October contain **12 rendering,
20 perceived-response and eight density entries** explicitly marked `dataMode=media-api`,
`apiTopology=local`. Perceived entries include separate short/long records; these are not
20 independent campaigns. Metadata from the whole histories was inspected to select this
subset, not to use direct-ES results as an impact baseline. Older unrecorded-topology entries
and the single deployed campaign are excluded from the local assessment. Different local
revisions/workloads are not pooled. Selected latest records below are all local media-api,
historical observations rather than controlled fix comparisons:

| Saved record | Relevant evidence | What it cannot establish |
| --- | --- | --- |
| [Rendering history](../../e2e-perf/results/audit-log.json), 19 Oct 01:27:40 UTC, stamp df3287c84, four runs | P1 maxFrame 115 ms, P3 205 ms, P8 233 ms. These are rounded medians of per-run frame maxima, not attributed parsing durations. | Supports investigating responsiveness, not attributing long frames to F2 or estimating its saving. No current-dirty-source equivalence certificate follows from the Git stamp. |
| [Perceived history](../../e2e-perf/results/perceived-log.json), short suite 19 Oct 01:32:13 UTC, same stamp, four runs | PP3 revision 3: store-ready 1344 ms, visual-settled 1505 ms; PP4 revision 3: 1126/1250 ms. Broad data-request/route evidence, not per-aggregation residual CPU. | Cannot subtract fetchDuration to isolate server/parse/render costs or infer which fixes account for those waits. |
| [Density history](../../e2e-perf/results/density-log.json), 19 Oct 01:50:04 UTC, same stamp, four runs | D9-grid revision 1: median two data starts/completions, cancellation median and p95 both zero. The request observer groups data/media rather than individual aggregation ownership. | This workflow is not evidence of frequent cancelled aggregations, and cannot refute cancellations in typing/facet workflows it does not exercise. |

History metric fields supply data/media cancellation totals, not equivalent aggregation
request bodies, post-abort backend completion or ES CPU. The [request observer](../../e2e-perf/network-probe.mjs#L54)
confirms that grouping boundary. Raw labels, request payloads, auth files and identity-scoped
URLs were not retained in repository outputs. Existing histories refine the assessment, but
do not answer whether KUP-041 would yield material aggregation savings. The later authorized
browser observation in section 3 resolves specific repeated-request producers; it does not
supply the missing backend CPU attribution.

**Executed local unit controls:** 1,863 passed across 18 test files, in two foreground runs:

- 1,094 / 15 files: API/direct adapters, mapper, ordered bodies, API-composed store, search
  store, keyword seek, selection store, data window, range selection, lazy typeahead,
  typeahead fields, prefetch, search orchestration and standalone ImageDetail.
- 769 / 3 files: useScrollEffects (including real URL/default owner cases), useListNavigation
  and derive-enriched-image. The first command also named a nonexistent
  `useUrlSearchSync.test.ts`; Vitest selected no such file. Startup claims rely on the actual
  useScrollEffects tests in the second run, not that nonexistent target.

No test files were changed. Existing tests establish their asserted browser/store/request
contracts, not failing-first reproduction of F1-F6 or measured savings. Scala test sources
were inspected for POST request flags/bounds/projection and AI weight/embedding assertions;
Scala tests were not executed. In particular, neither signal-forwarding mocks nor a passing
unit suite certifies cancellation at the incoming-server/outgoing-client boundary.
The later S4 isolated source-action probe and mounted browser observation are separate from
these suite runs. No product/test files were changed or suites rerun for the browser check.
Observer/listener/response-method ownership was released; the retained body-equivalence map
and diagnostic globals were deleted after all browser windows, native fetch restoration was checked, and Home restored
the clean all-rights query in ApiDataSource mode. No raw capture or identity payload was saved.

**Not established:** deployed server revision/configuration equivalence; nginx/production
ingress disconnect propagation; held-response Play/REST cancellation; actual ES task lifetime;
per-finding bytes/CPU/latency/frame savings; Bedrock cancellation; canonical-media delivery;
production load, every auth/config combination or a whole-renderer performance audit.
The authorized browser used existing API-backed reads; no direct ES probe, AWS operation,
deployment, packet/HAR capture, transport patch, benchmark, Git mutation or code repair was
performed. No stronger PIT/migration/session guarantee is proposed.

### S4a Repair Validation (20 October)

The [store](../../src/stores/search-store.ts) retains one pending base-batch key/completion
until its owner finishes or cancellation detaches it. Equivalent non-forced calls await it;
force and changed effective scopes still cancel, including returning to a completed cached
scope. Debounce remains trailing-edge, immediate activation promotes undispatched hover,
and existing expanded-cache, dynamic-isolation and stale-publication rules remain intact.

Failing-first [API-composed tests](../../src/stores/search-store-api-mode.test.ts) held the
media-api aggregation response: both immediate and ordinary repeated calls aborted the first
signal before the repair. They now retain that signal, issue one batch, await completion and
publish field/is/usage counts; completed base and 100-bucket expanded reuse remain intact.
[Owner tests](../../src/stores/search-store.test.ts) additionally cover forced/query/rights/
upload-boundary supersession, late predecessor cleanup, immediate debounce promotion and
shared failure followed by retry. Existing AI membership and dynamic-field tests remain passing.
These are synthetic API transport/store proofs, not a repeated live-API observation.

Commands used (foreground, pipefail/tee; no test retries):

- `npm --prefix kupua run test -- src/stores/search-store-api-mode.test.ts -t 'shares dispatched hover facets'` — two expected pre-repair failures, specifically aborted useful signals.
- `npm --prefix kupua run test -- src/stores/search-store.test.ts src/stores/search-store-api-mode.test.ts -t 'fetchAggregations|API mode: facet aggregations'` — 19 passed after repair.
- `npm --prefix kupua run test` — 3,080 passed in 89 files.
- `npm --prefix kupua run build` — passed; WASM URL/chunk-size warnings remain.
- `npm --prefix kupua run test:e2e -- --retries=0` — initially blocked by sandbox listen permission; after operator policy update, 480 passed and one Justified placement assertion failed. No source/test changes followed that failure.
- `npm --prefix kupua run test:e2e -- --project=justified-indexed justified-windowed.spec.ts --grep 'windowed density, panel, history and traversed detail' --retries=0` — isolated case passed.
- `npm --prefix kupua run test:e2e -- --retries=0` — final full run: 481 passed. The earlier intermittent failure is not proved pre-existing by a baseline run.

Two independent cold read-only reviews of the identical code/test candidate found no
significant issues: A covered correctness/races/scope/lifecycle/counts/workflows; B covered
request efficiency/bounded work/cancellation/maintainability. Neither independently reran
validation. No live system, app-driving instrumentation, Scala change or performance campaign
was used for the repair; no measured ES CPU, latency or frame-time saving is claimed.

### S4b Repair Validation (20 October)

The [resolver](../../src/lib/typeahead-fields.ts) retains up to 32 successful option-read
results per builder, keyed by the defined search parameters after own-chip removal plus
requested fields, sizes and filter requests. Static/alias/filter-backed options and arbitrary
dynamic fields use local readers; no datasource-global cache or facet/store owner was changed.
Failed or aborted reads are not retained. Prefix filtering runs on the accepted buckets, so
counts and options belong to the latest prefix, not the first consumer.

[LazyTypeahead](../../src/lib/lazy-typeahead.ts) attaches successor consumers before retiring
the previous suggestion pass. Obsolete publication rejects immediately; a shared transport is
aborted only when its last consumer leaves. Changed scopes, empty input and explicit disable
still retire obsolete work. [The wrapper](../../src/components/CqlSearchInput.tsx) keeps one
registered custom element but forwards to the mounted owner, disabling its predecessor before
teardown and suppressing intermediate suggestion passes during programmatic value replacement.

Failing-first owner tests observed two reads rather than one for both completed and pending
equivalent buckets. A mounted retired-owner test explicitly invoked its captured callback after
Home with an uncached scope: before repair it dispatched and returned counted suggestions;
after repair it returns no suggestions or reads. This injected callback is a lifecycle control,
not a new claim about the cause of the original five-read live-browser reset burst. Ordinary
mounted Clear/Home controls also prove cancellation, no reset-time replacement option reads,
and useful counted suggestions from the successor editor.

Preservation controls cover literal-safe self-exclusion, latest-prefix counts, scope changes,
all-rights/free-only/restored-all-rights, field separation, bounded eviction, failure/retry,
empty success and late aborted responses. An API-composed control asserts exact POST bodies
and distinct 50-bucket suggestions/100-bucket expansion. These are synthetic transport and
mounted local-fixture proofs, not post-fix live-API or backend CPU/latency measurements.

Final gates (foreground, pipefail/tee; no automatic retries):

- `npm --prefix kupua run test -- src/lib/typeahead-fields.test.ts src/lib/lazy-typeahead.test.ts src/dal/api-data-source.test.ts` — 162 passed.
- `npm --prefix kupua run test` — 3,104 passed in 89 files.
- `npm --prefix kupua run build` — passed; existing WASM URL/chunk-size warnings remain.
- `npm --prefix kupua run test:e2e -- --project=chromium cql-search-quoting.spec.ts --retries=0` — seven passed.
- The two affected Justified cases and the new readiness negative control, repeated four times
  through `test:e2e` — 12 passed without instrumentation.
- `npm --prefix kupua run test:e2e -- --retries=0` — final full gate: 485 passed.
- Separate E2E compiler comparison: HEAD and candidate each report 91 diagnostics, with none
  added. The comparison used in-memory HEAD source overrides; the application build passed.

Two earlier full gates each passed 483 cases and failed one Justified sample: an absent row
represented as Infinity after density replacement, then a resident nullable-placement read.
These failures were investigated rather than classified from their filenames. In the latest
80-case matched source control, resident HEAD/candidate each passed 20; windowed HEAD passed
18/20 and candidate 19/20. Exact HEAD versions of all three changed product modules were
served in memory under the same interception mechanism as candidate, with per-run hashes
verified. The identical windowed assertion failed in HEAD. Synchronous observations found the
generation advanced while the target had no mounted cell, followed by correct placement on
the next frame; CQL did not remount. The same readiness gap appeared once in resident HEAD,
but its original TypeError was not reproduced in these bounded controls. This is not an
untouched full HEAD run or an estimate of relative failure rates.

The operator-approved test-only repair waits for the captured image in the destination density
with nonzero row geometry before the affected sample. It neither scrolls nor waits for desired
coordinates; all original identity, viewport and one-pixel assertions remain. Negative controls
reject wrong-density/wrong-ID and zero-height rows. A preceding throwaway wait trial passed
40/40 matched cases. All temporary loaders, observers and trials were removed before the final
uninstrumented gates; no production density/scroll implementation was changed.

Two independent cold reviews found no significant issues, then two fresh independent reviews
of the expanded ten-file candidate also found no significant issues or assertion weakening.
Both rounds verified identical candidate hashes; reviewers did not implement changes or rerun
gates. New reuse coverage concentrates on credit/keyword/dynamic paths; existing startup/remount
controls and the shared reader additionally cover static/alias/filter-backed wiring. No live
system access, Scala change or performance campaign was used for this repair.

## 7. Recommended Scope Decisions

**The browser-verifiable selection questions are closed.** Warm/expanded reopen, resident
density, existing-chip editing, synchronized rights changes, requested bucket sizes and
Home/Clear behaviour have witnesses above. Acceptance tests written during a repair are
implementation gates, not another open-ended app-driving assignment.

1. **Keep the three small Kupua fixes separate:** pending facet handoff (S4a) and scope-bound
  suggestions/reset admission (S4b) are repaired and validated above. Impossible arrival polling
  (KUP-040) remains next, in its own session/commit. Their owners, avoided reads and
  preservation controls are known. Write failing owner tests and run the required gates;
  no endpoint/Scala change or general cache manager is needed.
2. **Do not start a Scala performance refactor on this evidence.** F1's backend resource
  benefit requires server-correlated residual-work evidence the browser cannot supply;
  F2/F3/F5/F6 remain conditional opportunities in the table. More ordinary browsing will not
  establish ES CPU savings, production incidence or the value of changing shared GET contracts.
3. **Keep caller impact explicit:** the selected client fixes leave Kahuna and existing GET
  semantics unchanged. Any later shared Scala change is a separate decision with legacy-caller
  and shared-client review; a Kupua-only opt-in does not automatically optimise Kahuna.
  Validate selected fixes on local media-api, retain the single deployed campaign as a separate
  checkpoint, and leave the rejected standalone work out of the build queue.

This is a decision-ready assessment, not implementation approval or a new migration gate.