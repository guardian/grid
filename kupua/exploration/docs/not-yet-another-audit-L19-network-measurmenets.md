# L19: Network Workload Characterisation

**5 October 2026. Operator-authorised browser characterisation; no application changes.**
This document supplements the [L19 reassessment](not-yet-another-audit-ledger.md#tier-and-startup-cost-reassessment-l19).
It records a bounded comparison of local Kahuna and API-backed Kupua, identifies
candidate improvements, and preserves the limits needed to extend the work.
It is not a production benchmark, capacity model, implementation approval or
argument for removing a tier.

## Decision Frame

The four questions are useful, but must remain distinct:

1. Can Kahuna do its own work more efficiently without losing production workflows?
2. Can Kupua avoid unnecessary work while preserving browsing, continuity and useful enrichment?
3. What differs under comparable operations, and which differences buy additional capability?
4. What do residency, map acquisition and navigation measurements establish about Kupua's tiers?

**Initial recommendation:** investigate provisional startup scopes before changing
tier boundaries. Kupua's list responses are leaner per returned row, but its larger
initial window and medium-result maps purchase capabilities with additional decoded
data and server work. Neither fewer requests nor a smaller compressed response is
an adequate success criterion. Kahuna changes are a separate production-change lane;
they do not automatically become Kupua migration requirements.

## Provenance And Method

### Environment

- Repository HEAD observed at orientation: `31d5deda06844904991a9bccba419747ef765500`.
  Unrelated worktree changes, including the Kupua package lock, were preserved.
  Served client hashes and server revisions were not independently certified.
- Operator-described topology: both frontends use locally running Grid media-api
  against TEST data. Kupua uses additive endpoints available locally; Kahuna uses
  legacy endpoints. The underlying ES route, tunnel and index configuration were
  not independently fingerprinted. This is not deployed-API evidence.
- Pages: `https://kupua.media.local.dev-gutools.co.uk` and
  `https://media.local.dev-gutools.co.uk`.
- Fixed viewport: **2560 x 1440 CSS pixels, DPR 2**, representing a default-scaled
  27-inch 5K Retina iMac. Resizing initially reset DPR to 1; the operator restored
  2 and subsequent captures verified it. Viewport-only emulation is not hardware emulation.
- Kupua served Vite development modules. Kahuna served a compiled bundle;
  its production/minification status was not verified. Static-asset totals must
  not be interpreted as a production frontend comparison.
- Both pages remained open, with the partner usually hidden and still capable of
  polling. Runs were sequential exploratory samples, not isolated-client or
  concurrent-load experiments. Cache warming, live data and network variation remain.
- All-rights controls used `nonFree=true`; free-only controls used `nonFree=false`.
  Pinned controls used `until=2026-10-05T00:00:00Z`. Default descending upload order
  was retained. Kahuna reported `usePermissionsFilter=false`; exact principal/tier
  equivalence between the two ingress paths was not independently established.
  Server authorisation was not bypassed.

### Capture Boundaries

Chromium CDP HTTP-cache bypass was exercised on both targets and restored to normal
caching in `finally`. Cookies, authentication and saved preferences were not cleared.
Consequently:

- **Warm reload** retains browser caches and preferences but recreates the app.
- **Cache-bypassed reload** forces browser retrieval; it is not a fresh user,
  empty application storage, cold media-api, cold ES or cold CDN experiment.
- **In-session scrolling** retains the app's resident rows and map.

Most search comparisons were full URL entries, not interactive typing or opening a
suggestion menu. This includes bootstrap and CQL registration work. Scroll controls
used direct scroll-container movement, not physical wheel/drag input. Detail was
URL entry, not clicking a resident image or traversing a buffer boundary.

Native request/response/loading events supplied starts, status, response wire bytes,
cache flags and browser cancellations. In-page fetch/XHR observers supplied decoded
JSON sizes and returned row/key counts. Raw bodies and URLs remained transient;
only aggregates were retained for reporting. Response cloning and parsing add some
instrumentation work, so the timings are not an uninstrumented performance certificate.

**Units:** tables use decimal KB/MB. Compressed values are encoded response-body
bytes, not request bytes, TLS overhead or a complete connection footprint. Native
wire totals additionally include response headers. Decoded values mean HTTP body
bytes after decompression, not retained JavaScript heap or decoded image bitmap RAM.
Returned rows include probe/repeated rows and need not equal unique resident images.

The screen-readiness proxy required a search control and at least eight visible
images with `complete` and positive `naturalWidth`, over two animation frames in a
visible document. This proves loaded-image/control presence, **not** `img.decode()`
completion, full viewport settlement, hit-test visibility, first-input latency or
jank. The captured `allVisibleDecodedMs` field was not a sufficient full-settlement
oracle and is not used as such. No corresponding scroll/detail latency claim is made.

Startup windows were generally 8-10 seconds; map/discovery samples extended to 12
seconds where stated. Idle windows were 35 seconds, plus a roughly 66-second hidden
Kupua window. Requests straddling a boundary require separate accounting.

### Safety And Exclusions

Kahuna automatically submitted telemetry POSTs to `/event`. Early observed attempts
returned 403; no successful write was observed. Profiling paused when this was found.
A temporary guard then rejected non-GET/HEAD fetch/XHR calls and beacons before
transmission. A retry-cycle check observed one blocked attempt and zero non-read-only
network starts. No edit, upload, crop, delete or collection-mutation control was used.
Telemetry rejection/guard errors are not image-search failures. The browser guard
covers the observed producers, not a certification of every possible form/worker path.
Kupua's vetted POST endpoints are reads and were not blocked merely for using POST.

No raw HAR, cookies, signed URLs, credentials, principal markers, emails or live
payloads were written into this repository. The saved production Grafana HTML informed workload choice, not TEST frequency or capacity claims.

An initial failed native classifier and a premature Resource Timing start filter
were repaired before relying on native media/static totals. Cross-origin Resource
Timing zero sizes were not treated as zero transfers. The malformed specific-label
contrast was also excluded: `+label:"test"` returned zero in Kahuna while Kupua
normalised it. The successful canonical query was **`label:test`**, returning 85
results in both. That is not evidence of an endpoint parity bug.

## 1. Kahuna On Its Own

### Observed Work

With explicit all-rights Home, Kahuna normally made a one-hit counted search followed
by a viewport range of 90 rows with `countAll=false`: 91 returned rows, about 203KB
compressed and 1.26MB decoded. At the fixed viewport, the loaded range covered more
than the initial visible cells. A 2400px scroll then fetched 72 additional rows,
about 158KB compressed and 0.99MB decoded.

Bare `/search` with the retained preferences performed:

1. Free-only counted probe: one row, total 1,176,743.
2. Normalised all-rights counted probe: one row, total 1,329,900.
3. All-rights 90-row range.

The same provisional free-to-all-rights sequence occurred on the exact
`/search?query=has:labels` entry: totals 8,073 then 12,174 before the range read.
This is evidence of avoidable-looking scope discovery, not a root-cause diagnosis
or a claim that every user/default configuration exhibits it.

Kahuna also fetched API discovery twice in normal startup captures. Equal sizes
alone do not prove identical semantics or that either consumer can safely be removed.
Visible and hidden samples continued new-image polling at approximately 15-16 second
intervals. A pinned 212-result hidden search returned zero twice in 35 seconds.

### Candidate Changes

| Candidate | Evidence and benefit sought | Discriminating check before implementation |
|---|---|---|
| Resolve the effective default scope before the first probe | Bare entries perform a free-only probe before the retained all-rights choice | Trace preference/config/URL readiness and first dispatch; verify initially free-only preferences and explicitly supplied flags as controls |
| Combine boundary/count discovery with the first useful range | Initial probe plus viewport range is an existing two-stage protocol, not just two arbitrary requests | Establish which admission boundary, counts and ticker actions the probe supplies; prove a combined response preserves moving-result pagination and reopening position |
| Use a leaner list representation | Matched rows generally require fewer bytes through Kupua's additive list endpoint | Inventory fields consumed by list, editing, selection, export and detail caches; do not remove fields globally from legacy GET consumers without production approval |
| Coalesce API discovery where equivalent | Two successful discovery requests appeared at bootstrap | Compare consumers, representation, identity and freshness requirements; demonstrate that joining pending work does not freeze required configuration |
| Make polling eligibility explicit | Polling continues hidden and on a historical pinned range returning zero | Separate new-upload detection from metadata/count freshness; verify whether a fixed upper bound makes that specific poll impossible to satisfy |

These are investigation candidates, not approved Kahuna changes. A zero result alone
does not make a poll pointless: unpinned searches can receive new data later.

## 2. Kupua On Its Own

### Observed Work

Explicit all-rights Home loaded 200 rows in one counted `/images/search-after`
response, about 170KB compressed and 1.95MB decoded. A separate `/images/count`
response supplied total/ticker data, and collection loading requested
`collections.pathId` buckets with `size=6000`. The ordinary collection aggregation
response was only about 562 bytes compressed/1780 decoded; that is not a measurement
of its ES cost. Discovery, usage configuration and collection-tree reads were
separately classified from image rows and thumbnails.

Bare `/search` first dispatched free-only page/count requests, then dispatched the
all-rights page/count after default normalisation. The first page was browser-cancelled;
both count responses completed. Its readiness proxy was 2.36 seconds in that sample.
Different `free` flags distinguish this from merely assuming every repeated DEV
request is a Strict Mode duplicate. The producer sequence still needs a source trace.

The 2400px Home scroll stayed within the resident 200 rows and required no new
image-data request. Thumbnails and an independent count poll still occurred.

### Feature Ownership, Not Blanket Aggregation Waste

Request shapes identified two different aggregation consumers:

- `collections.pathId`, `size=6000`: collection counts loaded with the collection
  tree, consistent with [collection-store](../../src/stores/collection-store.ts).
- `userMetadata.labels`, `size=50`: label suggestions, consistent with the
  dynamic resolver in [typeahead-fields](../../src/lib/typeahead-fields.ts).
  The label-entry sample included one cancelled attempt and one successful
  1767-byte decoded response.

Under-quota URL entry also produced extra aggregation work, including one cancellation;
its complete request ownership was not retrospectively established. It must not be
called a hidden Filters-panel defect. The operator explicitly values CQL suggestion
counts, and Kahuna does not offer the equivalent faceted panel. No bulk hidden-panel
fetch was identified in these samples; all hidden-panel lifecycle paths were not audited.

The noncanonical label entry had an initial empty page/count before the normalised
85-result search. Its whole-entry latency/work must not be compared as though Kahuna
had entered the same canonical query. Preserve the cost distinction without inventing
a semantic bug from a failed positive control.

### Candidate Changes

| Candidate | Evidence and benefit sought | Discriminating check before implementation |
|---|---|---|
| Resolve defaults before first dispatch | A cancelled free-only page and completed free-only count precede all-rights startup | Trace [home defaults](../../src/lib/home-defaults.ts), [URL sync](../../src/hooks/useUrlSearchSync.ts), route/config readiness and the first search; retain explicit free/all-rights and standalone-mode controls |
| Avoid obsolete count work at its producer | Both provisional counts finish even when the first page is retired | Establish count ownership and publication use; prevent known-obsolete dispatch rather than assuming browser abort stops server work |
| Review page/count protocol together | A counted page and a separate total/ticker read occur at startup | Determine whether their totals and aggregation semantics can share work; a badge/ticker read is not redundant merely because it repeats a total |
| Right-size initial residency/eager fill | 200 initial rows buy request-free nearby scrolling, but exceed the initial viewport | Compare whole short browsing sessions, not first paint; measure first-scroll reads, skeletons and headroom before reducing page size |
| Adjust map acquisition/reuse independently of coordinates | Maps add background work; a loaded map survives window movement | Compare a map-ready and existing no-map path for the same admitted query; define query/sort/boundary/authorisation/freshness/completeness before adding cross-query caching |
| Review historical-range polling | Pinned under-quota search made three zero-result count reads in 35 seconds | Verify the precise new-images predicate and whether explicit `until` makes it unsatisfiable; preserve separately useful refresh/count behaviour |
| Attribute and coalesce suggestion work | Label suggestions and cancellation have a real but feature-specific price | Trace first registration, own-chip exclusion, pending deduplication and cancellation; compare canonical entry with actual typing, not a bulk-panel surrogate |

Start with the first two candidates, not a new universal loader or permanent cache.
Do not gate a useful standalone screen on every optional Grid service merely to
avoid provisional work. No cause, fix, threshold change or stronger persistence
guarantee has been adopted here.

## 3. Comparison

### Search Response Bodies

These totals exclude static assets, media, discovery, collection-tree responses and
most supplementary aggregation/count bodies. Keys are a separate column. They are
not total-session wire footprints or unique-image counts.

| Workload | Resolved results: Kahuna / Kupua | Returned image rows: Kahuna / Kupua | Compressed row bodies: Kahuna / Kupua | Decoded row bodies: Kahuna / Kupua | Kupua keys: count; compressed; decoded |
|---|---|---|---|---|---|
| Explicit all-rights Home | About 1.33M; live totals vary | 91 / 200 | 203KB / 170KB | 1.26MB / 1.95MB | None |
| `trump`, pinned upper bound | 4486 / 4486 | 91 / 200 | 196.8KB / 159.7KB | 1.280MB / 1.977MB | 4486; 165.7KB; 0.547MB |
| Uploads 4 Oct 18:00 to 5 Oct 00:00 UTC | 212 / 212 | 91 / 212 | 199.2KB / 182.2KB | 1.273MB / 2.087MB | None |
| Free-only, pinned upper bound | 1176490 / 1176485 | 92 / 200 | 199.8KB / 158.1KB | 1.282MB / 1.952MB | None |
| `is:under-quota`, pinned upper bound | 1244409 / 1244404 | 91 / 200 | 204.2KB / 170.7KB | 1.287MB / 1.968MB | None |
| `label:test`, successful canonical-scope responses | 85 / 85 | 86 / 85 | 101.7KB / 60.9KB | 1.043MB / 0.885MB | None |

The Kupua label value is the successful response within an entry that was subsequently
normalised; supplementary failed/provisional work is not hidden by treating this row
as a full-entry comparison. For the six-hour control, `since` was
`2026-10-04T18:00:00Z`. Pinned upper bounds were `2026-10-05T00:00:00Z`.

The five-hit discrepancies on broad rights filters remain unexplained by this pass.
Similar URL flags do not certify identical principal, corpus membership, index routing
or admission semantics. Exact keyword/date/label counts and 81 overlapping loaded
thumbnails provide stronger local controls, not universal parity.

**Interpretation:** at Home Kupua returned about 2.2 times as many rows with about
16% less compressed row data, but about 55% more decoded row data. Over the first
2400px scroll, Kahuna added 72 rows/157.9KB compressed/0.989MB decoded; Kupua added
no image rows. Neither conclusion is captured by counting HTTP requests alone.

### Screen Readiness And Other Traffic

| Explicit all-rights Home | Kahuna | Kupua |
|---|---|---|
| Two planned warm reloads | 2.036s, 1.893s | 1.698s, 1.614s |
| Two planned cache-bypassed reloads | 2.474s, 2.478s | 2.406s, 2.058s |
| Additional native-capture checks | Warm 2.136s; bypassed 2.278s | Not a separate paired series |

These are the limited readiness proxy, not confidence intervals, first-input latency
or canonical perceived-performance measures. Runs were not randomised/interleaved and
server/media caches were not made cold. Do not turn these samples into a production
speed-up percentage.

A native bypassed capture attributed roughly 14.83MB response wire traffic to 152
Kupua Vite module requests, versus about 2.17MB to Kahuna static traffic. Warm module
traffic was largely revalidation/cache traffic. This describes build formats, not
which production product has leaner assets.

On the pinned six-hour result list, 81 overlapping, successfully loaded thumbnails
had equal natural dimensions, with typical long edges of 256px. Nine other overlapping
Kupua cells were not loaded at the check. Proxy path suffixes differed; byte-for-byte
asset identity was not proved. Initial thumbnail request cohorts also differed
(roughly 81 Kupua versus 90 Kahuna), so media totals require their own denominator.

### Useful Screen, Background And Idle

Startup rows, maps and idle must not be merged into one settlement wait. For example,
the `trump` key request started during startup and finished after the readiness proxy;
the screen could be useful while map publication was still pending. The twelve-row
small-result remainder was likewise separately observable. A background request can
start before useful paint; report its ownership and start/completion boundaries.

| Idle sample | Observed image API work | Boundary |
|---|---|---|
| Kahuna all-rights Home, visible, final 35s control | Two GET search/count responses, about 15.1s apart | 558 decoded response bytes; ordinary new-data detection, not zero-work idle |
| Kahuna pinned 212-result search, hidden, 35s | Two zero-result GET polls, about 16s apart | Different scope from the Kupua hidden Home sample |
| Kupua all-rights Home, visible, 35s | Three POST count responses, 10s apart | 597 decoded response bytes; POST is a vetted read |
| Kupua all-rights Home, hidden, about 66s | Three count responses, about 30s apart | Totals 1, 1, 2; hidden throttling, not polling cessation |
| Kupua pinned under-quota search, visible, 35s | Three zero-result count responses, 10s apart | Historical range; polling eligibility candidate, not evidence all zero polls are waste |

An earlier Kahuna visible window also included three rejected telemetry POSTs and a
small independent service request. Guarded final controls exclude transmitted telemetry.
Do not use either telemetry errors or different idle scopes to claim relative ES load.

### Server Observability

New endpoints do log. [ImageQueryController](../../../media-api/app/controllers/ImageQueryController.scala)
supplies operation/request markers, and calls such as `search-after`, `image-window`,
`image-keys`, `image-count` and `image-aggregations` use the shared
[executeAndLog implementation](../../../common-lib/src/main/scala/com/gu/mediaservice/lib/elasticsearch/ElasticSearchExecutions.scala).
[Stopwatch](../../../common-lib/src/main/scala/com/gu/mediaservice/lib/logging/Stopwatch.scala)
establishes that its `duration` marker is milliseconds.

A bounded log-tail summary during the pass found search-after durations 297-486ms,
count durations 43-239ms, aggregation durations 51-180ms, and one keys duration
783ms. These are mixed operations in a log window, not paired medians or capacity
results. They measure ES-client execution/round trip, which can include transport
and response handling; they are **not raw ES `took`, CPU, queue occupancy or whole
API response construction/compression time**. Legacy image search also logged.

The browser captures supplied no useful Server-Timing breakdown. Request IDs were
not joined across layers. Therefore subtracting log durations from browser times
would not produce a valid isolated API-processing estimate. A later request-correlated
measurement can use existing logs without publishing principal markers, headers or bodies.

### Detail Limit

One Kahuna-style image path was accepted by Kupua. Kupua loaded a 3240 x 2160 main
image; Kahuna's full-size delivery attempts failed. This is a route/delivery witness,
not a paired full-image bandwidth or speed result. The Kupua URL entry also loaded
its underlying 200-row Home list/count; do not misattribute that work to duplicate
singleton fetching. Resident click-to-open and traversal were not measured. The old
per-image grouping used an ID-prefix classifier and cannot prove identical singleton
requests merely from its grouped count.

## 4. Evidence For Kupua's Tiers

The [scroll architecture](00%20Architecture%20and%20philosophy/03-scroll-architecture.md)
separates result coordinates, drag behaviour, full-row residency and position keys.
This pass supports that separation, not a universal winner.

| Regime | Current witness | What follows / does not follow |
|---|---|---|
| Small, at most 1000 | `label:test`: 85 rows resident; six-hour range: 200 initial plus 12 eager rows, 212 resident, no map | Fully resident browsing is real. The pass did not test near-1000 eager cost or prove that this fill protocol is the simplest acceptable implementation |
| Indexed, 1001-65000 | 4486/4361-result maps each required one keys page; 12174 labelled results required two pages, 433947 compressed/1484301 decoded bytes | Eager acquisition has a measurable price. JSON bytes do not establish retained heap, parse CPU, 65k cost or multi-user capacity |
| Indexed shallow jump | 4361-row map remained resident; jump used one `/window` read, 200 returned rows, no new keys | Map reuse within a query was observed. Since the destination was below 10k, this does not demonstrate the deep cursor advantage |
| Indexed deep jump | 12174-row map; around 93% of scroll extent, buffer offset 11187, 299 resident rows from 100+200 cursor results; no new keys/rank/profile reads | Exact-key cursors avoid extra rank/estimation work on this API path. Headroom and the shared cursor explain why returned and resident row counts differ |
| Legacy counterpart at similar extent | Kahuna offset 11250, one range request, 126 returned rows, 157241 compressed/1491780 decoded bytes | Kupua returned 300 rows, 229248 compressed/2963413 decoded bytes across two reads. There is no demonstrated map speed win here; the windows/headroom are not identical |
| Large, above 65000 | Million-plus Home/rights searches, 200-row initial window, no keys; nearby Home scrolling stayed resident | No map cost at broad startup. Arbitrary-position large-tier seeks, sort distributions and million-scale precision were not characterised by this pass |

**No tier removal is justified by these samples.** A legitimate next result could be
keeping all regimes while reducing provisional work, making eager acquisition more
selective, improving compatible map reuse, or simplifying small-result fill.
All need an explicit preserved-workflow/cost comparison, not a premise that tiers
are excessive. Conversely, showing that a map enables cursor navigation does not
prove eager acquisition is optimal for a user who never leaves the first screen.

Changing `POSITION_MAP_THRESHOLD` is not an isolated cache-cost experiment:
[two-tier eligibility](../../src/lib/two-tier.ts) also controls coordinates and drag
semantics. Test acquisition policy separately from that predicate. Existing no-map
indexed navigation remains a relevant comparator; do not introduce a late coordinate
flip or weaken authorisation/completeness to simplify caching.

## Next Discriminators And Coverage Limits

No next task or implementation is selected. Useful bounded options are:

1. Trace default/preference/CQL readiness to first dispatch and publication, with
   explicit flags and retained-default controls. Name the obsolete requests before
   proposing a small fix; verify the first useful screen is not delayed unnecessarily.
2. For a canonical query above 10k but below 65k, compare existing map-ready and
   no-map navigation under the same admitted ordering, target and cache state.
   Separate up-front keys, navigation reads, returned headroom and user-visible gaps.
3. Assess the small tier near its upper bound using a short browsing session:
   initial page, eager remainder, first scroll, drag and return. Do not optimise only
   the first-screen request count or silently replace fully resident interaction.
4. Join HTTP and ES-client timing for selected existing reads using ephemeral
   correlation IDs; report only safe aggregates. CPU/queue/concurrency require a
   separately agreed scope, not extrapolation from a small JSON response.

Use the existing canonical performance records and their topology/revision limits
linked by L19 before proposing new experiments. This pass did not inspect or replace
every prior performance result. A new check must state the precise unanswered question.

Unmeasured here: actual CQL typing/menu interaction budgets, uploaded-by-me queries,
sort/focus/density transitions, native scrubber drag, sustained wheel velocity, deep
large-tier seek, retained heap/parse CPU, fully settled media, resident detail opening,
image traversal, server-cold caches, deployed APIs, concurrent users and production
capacity. Unit/E2E/perf harnesses were not run; no product change required those gates.

The measurement data was held in browser memory as aggregate `__l19Results` records;
the temporary `__l19Driver` and init-script observers are not a maintained harness.
Kahuna's read-only guard remains active for continuation, and normal browser caching
was restored after each capture. Browser reloads/closure can lose handoff globals;
the safe figures and limits above are the durable checkpoint, not a raw capture archive.

## Kupua API Startup Scope And Polling

**5 October 2026, approximately 20:34-20:37 UTC.** Bounded characterisation of
local API-backed Kupua against operator-authorised TEST data, at HEAD
`31d5deda06844904991a9bccba419747ef765500`. The served mode was `media-api`/`local`,
using `ApiDataSource` and Vite development modules. This is not production,
deployed-API or direct-ES evidence; backend/index fingerprints and served source
hashes remain uncertified. The [small-result assessment](not-yet-another-audit-ledger.md#small-result-source-assessment-5-october-2026)
recommends retention; no tier experiment or product change was performed.

Kupua's current [Home default](../../src/lib/home-defaults.ts) is hard-coded
`nonFree=true`, not derived from the session's `showPaid` permission. Kahuna's
permission-dependent defaults are characterised separately below. Neither these
Kupua controls nor its hard-coded default establish permission-OFF behavior;
Kahuna's limited ON/OFF comparison is recorded below.

Controls covered bare/all-rights entry twice, explicit free-only, the actual Home
logo from settled free-only results, and the pinned historical scope. Two visible
idle windows lasted 35.003s each. Viewport was 2560 x 1440, DPR 2 throughout, with
normal caching, authentication and preferences retained. URL rights controls and
Home's reset changed search scope, not server preferences.

Capture was installed before navigation using reload-verified `page.addInitScript`
registration. Native network events supplied status/cancellation and encoded/wire
bytes; browser observers supplied decoded sizes, safe scope, URL changes and accepted
store publication. Instrumentation adds overhead; timings describe ordering, not
unmodified application speed. Owned wrappers and the temporary activation key were
removed afterward, leaving the registered script inert. No raw payloads, signed URLs,
headers, credentials or identities were saved in the repository.

Kupua had no added browser write guard; server protections remained. Kahuna was
background activity only, hidden with its inherited guard and polling intact: nine
GET search polls roughly 16s apart (197 encoded/279 decoded bytes each), plus three
small unrelated GET reads. This was not an isolated-client or equal-telemetry comparison.

### Producer, Request And Publication Timeline

Times below are milliseconds from each action's start, not latency benchmarks.
`P` is a counted initial page; `C` is baseline count/tickers. Dispatch uses the
browser observer; completion uses native loading-finished/failed events. All completed
page/count reads returned 200. Both provisional pages were browser-cancelled without
a captured response body; their transferred bytes/server cancellation are unknown.

| Entry / effective scope | P dispatch -> completion -> row publication | C dispatch -> completion | Returned rows / total |
|---|---|---|---|
| Bare 1, provisional free-only | 673 -> cancelled 732 -> none | 678 -> 978 | No page body; count 1176739 |
| Bare 1, resolved all-rights | 696 -> 1937 -> 2072 | 703 -> 1004 | 200 / 1329904 |
| Explicit all-rights 1 | 634 -> 1522 -> 1662 | 641 -> 873 | 200 / 1329904 |
| Bare 2, provisional free-only | 584 -> cancelled 639 -> none | 589 -> 810 | No page body; count 1176739 |
| Bare 2, resolved all-rights | 605 -> 1864 -> 2010 | 611 -> 895 | 200 / 1329904 |
| Explicit all-rights 2 | 578 -> 1622 -> 1761 | 584 -> 896 | 200 / 1329904 |
| Explicit free-only | 589 -> 1501 -> 1647 | 596 -> 745 | 200 / 1176739 |
| In-session Home from settled free-only | 43 -> 915 -> 1050 | 45 -> 305 | 200 / 1329904 |
| Historical all-rights under-quota | 689 -> 2054 -> 2199 | 698 -> 1312 | 200 / 1244319 |

Both bare controls initially had all-rights store defaults, then URL sync replaced
params with free-only while the URL flag was absent. URL replacement to `nonFree=true`
occurred at 690/599ms; all-rights dispatch followed at 696/605ms. Safe initiator
frames identified `useUrlSearchSync` through `search-store`, not a CQL request producer.
The [request mapper](../../src/dal/grid-api-search-adapter.ts#L148) treats anything
other than `nonFree=true` as free-only.
The [one-time default guard](../../src/hooks/useUrlSearchSync.ts#L121), together with
DEV effect replay before the asynchronous replacement, supplies a concrete source
explanation consistent with this ordering: a later effect pass can see the changed
ref but still-empty URL. Individual React commits/ref transitions were not instrumented;
production behavior and other entry/default combinations are not certified. This is
different-scope supersession, not simply two identical Strict Mode requests.

Only the resolved pages supplied accepted visible rows and totals. At those same
publications, captured baseline tickers matched the resolved count response; source
confirms that consumer. The two provisional free-only counts completed but supplied
neither accepted rows/total nor a free-only ticker publication in these controls.
They were obsolete for this accepted search, not evidence that every completed count
is unused. [Discovery takeover](../../src/stores/search-store.ts#L2586) can separately
use count metadata; no takeover workflow was exercised here.

The [Home reset](../../src/lib/reset-to-home.ts#L172) retained the document. It set all-rights params at 43ms,
published all-rights rows/baseline tickers at 1050ms while the URL still said
`nonFree=false`, then pushed the all-rights URL at 1217ms. Only one all-rights pair
was dispatched. **The provisional free-to-all-rights sequence was bootstrap-specific
in these controls, not reproduced by this in-session Home path.** This does not cover
every Home departure state or optional-service/default configuration.

### Response Bytes

Exact bytes below sum successful page/count responses only. They exclude cancelled
page bodies, other API work, assets and media; they are not whole-entry costs. Encoded
bodies were gzip and matched native encoded data totals. Response wire totals include
headers, not request bytes or connection overhead. None of these reads used a browser
cache/service-worker response. No recorded page/count read straddled its window; these
scoped totals do not certify absence of every retiring-document or unrelated request.

| Entry | Encoded body bytes | Decoded body bytes | Response wire bytes |
|---|---:|---:|---:|
| Bare 1 | 168536 | 1957626 | 170156 |
| Explicit all-rights 1 | 168330 | 1957293 | 169411 |
| Bare 2 | 168480 | 1958028 | 170100 |
| Explicit all-rights 2 | 168233 | 1957695 | 169314 |
| Explicit free-only | 158223 | 1943198 | 159304 |
| In-session Home | 168266 | 1957695 | 169347 |
| Historical entry | 170993 | 1969613 | 172074 |

Each ordinary Home/free baseline count was 236 encoded/333 decoded bytes; the
historical baseline count was 226/313. Bare entries include two such baseline counts,
not the body of the cancelled free page. Historical startup also had supplementary
aggregation work (including a cancelled read), excluded here; no hidden-Filters
ownership claim or tier work follows. No useful request-correlation header was found
on these measured responses, and no backend-log subtraction was attempted.

### Historical Polling Eligibility

[Kupua's arrival poll](../../src/stores/search-store.ts#L924) retains query, rights
and upper bounds, choosing `since = max(params.since, newCountSince)`. The baseline
comes from accepted search completion or a retained history freeze, not navigation
start. [Upload URL filters](../../../media-api/app/lib/elasticsearch/QueryBuilder.scala#L153)
use [strict `gt`/`lt` bounds](../../../common-lib/src/main/scala/com/gu/mediaservice/lib/elasticsearch/filters.scala#L42):
both endpoints are excluded, so `since >= until` admits no upload time. Source
scheduling is 10s visible/30s hidden, with an immediate visibility-return tick;
only visible windows were measured here. Generation/sequence checks reject stale
publications.

Every poll below was an all-rights POST count read returning 200, zero arrivals and
zero arrival ticker deltas. Each response was **150 encoded/199 decoded bytes**;
each complete window totalled **600 encoded/796 decoded/2756 response-wire bytes**.
There were no captured visibility changes, cancellations or boundary-crossing polls.
Four rather than three polls fit each 35-second window because of its start phase;
the interval was not changed.

| Visible 35-second window | Poll dispatch offsets (seconds) | Effective upload interval | Accepted consumer outcome |
|---|---|---|---|
| Explicit all-rights Home after actual Home | 3.951, 13.952, 23.951, 33.952 | Strictly after 20:35:36.557 UTC on 5 Oct; no upper bound | `newCount=0`; baseline tickers unchanged, timestamp advanced; total stayed 1329904 |
| `is:under-quota`, pinned historical scope | 1.800, 11.800, 21.800, 31.800 | Strictly after 20:36:19.816 UTC on 5 Oct AND strictly before 00:00:00 UTC that day | `newCount=0`; baseline tickers unchanged, timestamp advanced; total stayed 1244319 |

The historical interval is contradictory, not merely a currently quiet query.
The actual request retained `until=2026-10-05T00:00:00Z` while its lower bound came
from the later accepted browse freeze. The poll publishes `newCount` and cumulative
arrival ticker deltas added to the browse baseline, not rows, metadata or `total`.
These historical reads cannot detect arrivals or refresh existing row metadata,
deletions or browse totals. Advancing the ticker-update timestamp alone
does not establish fresh historical metadata. Open-ended Home polls remain eligible
and useful even though these particular four returned zero.

### Conclusion

Obsolete for the observed accepted search: the two provisional free pages/counts.
Ineligible arrival work: the four historical polls with contradictory bounds.
Still useful: accepted page rows/totals, resolved baseline tickers/discovery metadata
and eligible Home arrival detection. Missing attribution remains backend/ES cancellation,
CPU/capacity, detailed React effect ordering, production/default coverage and unrelated
or retiring-document traffic. Response sizes do not quantify those server costs.
The existing loaded-image/control readiness proxy retains its prior limitations;
no new latency, jank or capacity claim is made.

**One recommended next Kupua fix, subject to approval:** prevent unresolved bare-URL scope
from dispatching at the URL/default producer, preserving explicit free-only/all-rights,
in-session Home and useful baseline count/ticker behavior. Do not fix this by globally
disabling Strict Mode, delaying on optional services or removing counts wholesale.
Historical polling eligibility is a separately established follow-up, not a bundled
implementation recommendation. No implementation or further experiment is authorised.

## Kahuna Startup Scope And Polling

**5 October 2026, approximately 21:05-21:07 UTC.** Bounded local Kahuna characterisation
using local media-api against operator-authorised TEST data. HEAD was
`31d5deda06844904991a9bccba419747ef765500`. The initial controls had the live session permission
**`showPaid=true`**, `usePermissionsFilter=false`, and a 2560 x 1440, DPR 2 visible
viewport. In the settled all-rights state, "Free to use only" was unchecked.
The initial series held permission constant; a limited operator-set OFF comparison
is included below. This is request-work evidence, not a speed-up estimate for all
users or every search.

### Method And PR #4710

[PR #4710](https://github.com/guardian/grid/pull/4710) fixed repeated identical searches
caused by mutating routing state during resolution, while preserving detail-return
scroll position and new-image detection. It merged on 29 April and is an ancestor
of this checkout. The served compiled bundle contained its deferred routing-flag reset
and URL-based scroll-key changes; the old resolver deletion was absent. Exact bundle/
source hash equivalence and backend/index revisions were not certified. The remaining
observations below do not establish that #4710 failed or that its original bug returned.

Controls covered bare/all-rights entry twice, explicit free-only, actual Home from
settled free-only, and pinned historical entry, with two visible 35-second idle windows.
One reload preflight verified XHR recording before the first read and controller
observation afterward; eight actions including preflight were used. Normal caching,
authentication and permission settings were retained; no storage was cleared or
server preferences changed. Home's ordinary local-default reset was part of the control.

Native events supplied status, cancellations and wire/encoded/decoded bytes. The
browser recorder captured safe request scope and sampled active controller state every
25ms, reusing controller references rather than repeatedly walking image scopes.
Publication times below are sampled model observations, not paint/input latency;
brief transitions can be missed. Identical response values alone cannot identify which
controller/request supplied them. Instrumentation adds overhead; no new latency,
jank, ES-load or capacity claim follows.

The inherited fetch/XHR/beacon guard remained active, including across reloads.
One telemetry attempt was blocked in the Home document and one in the historical
document; these are not search failures. No mutating controls were used. Kupua stayed
hidden on its existing historical scope and completed two zero-result POST count reads,
about 60s apart (150 encoded/199 decoded bytes each). Partner polling was not suppressed;
these are not isolated-client or equal-telemetry measurements.

### Requests And Active Display

`P` is the one-row counted probe (`length=1`, `countAll=true`); `R` is the 90-row
viewport read (`countAll=false`). All image reads below completed with status 200;
none was browser-cancelled. Times are milliseconds from the action's start.
The viewport response's `total=0` is an uncounted placeholder, not an empty result set:
the displayed total/tickers come from a counted probe.

| Kahuna entry | P scope: dispatch -> completion | R dispatch -> completion | Active metadata / 90-row observation |
|---|---|---|---|
| Bare 1 | Free 364 -> 516; all-rights 421 -> 652 | 714 -> 1812 | All-rights at 688 / 2113 |
| Explicit all-rights 1 | All-rights 289 -> 471 | 541 -> 1579 | 514 / 1869 |
| Bare 2 | Free 265 -> 549; all-rights 287 -> 557 | 603 -> 1449 | All-rights at 589 / 1741 |
| Explicit all-rights 2 | All-rights 359 -> 534 | 607 -> 1354 | 565 / 1643 |
| Explicit free-only | Free 268 -> 477; free 269 -> 621 | 674 -> 1395 | Free at 655 / 1688; individual probe ambiguous |
| Actual in-session Home | All-rights 72 -> 390; all-rights 77 -> 529; free 93 -> 390; all-rights 109 -> 715 | 772 -> 1548 | All-rights at 746 / 1836; individual probe ambiguous |
| Historical all-rights under-quota | All-rights 323 -> 595 | 669 -> 1473 | 636 / 1757 |

Both bare entries first searched free-only, then pushed `nonFree=true` at 424/290ms.
The active display accepted all-rights metadata and viewport rows; no free-only
metadata publication was observed. Counted totals were 1176738 free-only and 1329906
all-rights; the historical total was 1244309. Retired-controller callbacks and
sub-25ms display states were not fully traced, so completion alone is not publication.

Source distinguishes this late scope selection from #4710's transient routing flag:
[results start searching immediately](../../../kahuna/public/js/search/results.js#L312),
while [session/default selection](../../../kahuna/public/js/search/query.js#L683)
can subsequently navigate with a resolved rights flag. The [search builder](../../../kahuna/public/js/search/results.js#L577)
treats anything other than `nonFree=true` as free-only. The live sequence is consistent
with that producer ordering; individual controller-construction initiators were not
correlated from the compiled bundle.

Explicit free-only entry also made an extra probe, despite ending with the Free-only
checkbox checked. Its URL changed from `nonFree=false` to an absent flag at 238ms.
[Source normalisation](../../../kahuna/public/js/search/query.js#L309) performs this
false-to-absent correction when `usePermissionsFilter=false`, without testing
`showPaid`. Thus extra work is not restricted to all-rights destinations in this
ON-permission session, and OFF users must not be assumed exempt without a control.

Home retained the document but generated three all-rights probes and one free-only
probe, with URL pushes through all-rights, absent and all-rights at 89/90/125ms.
Only one final baseline and one 90-row viewport were observed. The three all-rights
responses had matching total/ticker values, so the exact baseline supplier was not
identified. Equality of every request field was not established: this is additional
navigation/scope churn, not proof of four identical searches or a #4710 regression.
[Home/default source](../../../kahuna/public/js/search/query.js#L187) explicitly
accommodates several navigation/filter passes and dropped-rights corrections.

### Response Bytes

These totals cover image probes/ranges only, excluding discovery, session/config,
assets, media and telemetry. Encoded gzip bodies and decoded sizes matched native
data events; no measured image response came from browser cache or a service worker.
Wire totals include response headers, not requests or connection overhead. Recorded
reads did not straddle their windows; unrelated/retiring-document traffic was not
fully inventoried. No useful request-correlation header or backend timing join was found.

| Kahuna entry | Returned image rows | Encoded body bytes | Decoded body bytes | Response wire bytes |
|---|---:|---:|---:|---:|
| Bare 1 | 92 | 205402 | 1272915 | 207024 |
| Explicit all-rights 1 | 91 | 200505 | 1257851 | 201587 |
| Bare 2 | 92 | 205374 | 1273101 | 206996 |
| Explicit all-rights 2 | 91 | 200539 | 1257851 | 201621 |
| Explicit free-only | 92 | 200354 | 1266801 | 201976 |
| Actual Home | 94 | 215034 | 1303601 | 217736 |
| Historical entry | 91 | 204197 | 1287800 | 205279 |

Returned rows include probes and repeats; every final visible list held 90 rows.
A redundant ordinary probe cost about 4.83KB encoded/15.25KB decoded in these samples,
but its server/ES cost was not measured. The intentional counted-probe-plus-viewport
protocol is not redundant merely because it uses two reads: it supplies total/tickers
and then visible rows. Broad historical totals differ from earlier Kupua samples;
do not infer exact principal/query/index parity from these sequential controls.

### Arrival Polling And Controller Retirement

All polls returned 200, zero arrivals and zero ticker deltas. Each body was
**175 encoded/243 decoded bytes**, with 714 response-wire bytes. The active display
kept its existing total/baseline tickers and advanced its last-checked time twice in
each window. No visibility change or boundary-crossing poll was recorded.

| Kahuna visible idle window | Poll dispatch offsets (seconds) | Scope / active-display outcome | Total encoded / decoded / wire bytes |
|---|---|---|---|
| Home, 35.004s | 0.768, 0.909, 8.183, 8.194, 8.320, 8.517, 23.593 | Three free-only and four all-rights polls; only the last two matched active-display updates | 1225 / 1701 / 4998 |
| Historical under-quota, 35.025s | 8.046, 23.122 | Two all-rights polls; both matched active-display updates | 350 / 486 / 1428 |

Home's active polls used `since=2026-10-05T21:05:36.109Z` with no upper bound:
eligible arrival detection, even though these responses were zero. The five other
Home polls completed without a temporally matching active-controller update in the
window. Their burst is consistent with one-shot polls from retired controllers:
[poll scheduling](../../../kahuna/public/js/search/results.js#L434) does not test
`scopeGone` before dispatch; it checks only before scheduling the next cycle after
the response. [Destruction cleanup](../../../kahuna/public/js/search/results.js#L923)
marks the scope gone but does not cancel the scheduled timeout. Precise timer-to-
controller identity was not recorded; do not attribute usefulness by zero-value
equality alone. Active recurrence was about 15.08s, consistent with response-following
15-second scheduling, not seven intentional polls for the current view.

The historical polls sent **equal** lower and upper bounds,
`since=until=2026-10-05T00:00:00Z`. [Kahuna's saved boundary](../../../kahuna/public/js/search/results.js#L283)
uses explicit `until` for a fresh search, unlike Kupua's later browse-freeze baseline.
The shared [strict upload-date filter](../../../common-lib/src/main/scala/com/gu/mediaservice/lib/elasticsearch/filters.scala#L42)
excludes both endpoints, so this interval cannot admit an image. These reads refresh
neither historical rows/deletions nor browse totals; a last-checked timestamp alone
does not establish useful metadata freshness. This eligibility result depends on
the actual bounds, not on the `showPaid` setting or zero counts alone.

### Permission OFF Control

**5 October 2026, approximately 22:38-22:39 UTC.** Three bounded controls used the
operator-changed permission **`showPaid=false`**, verified from fresh controller state
after a normal reload. Home applied the free-only default before measurement; the
checkbox was checked throughout the three controls. Permission and current filter
are distinct: an explicit all-rights URL can leave the checkbox unchecked even with
permission OFF. OFF classification did not rely on the checkbox alone.

The same local target, HEAD, `usePermissionsFilter=false`, visible 2560 x 1440/DPR 2,
normal caching and inherited guard were retained. Recorder preflight verified reads
and controller observation across reload. Only bare entry, explicit `nonFree=false`
and actual Home from settled explicit-free results were measured, once each. Setup
and preflight were excluded. No OFF idle window, keyword/GNM-owned/My uploads control,
permission write, Kupua change or whole-campaign replay was performed.

| Kahuna action | ON counted probes | OFF counted probes | OFF viewport reads |
|---|---|---|---|
| Bare `/search` | 2: free-only then all-rights, reproduced twice | 1: free-only | 1, 90 rows |
| Explicit `nonFree=false` | 2: both free-only | 2: both free-only | 1, 90 rows |
| Actual Home from settled explicit-free | 4: three all-rights, one free-only | 3: all free-only | 1, 90 rows |

All OFF image reads completed 200, without browser cancellation, and all final
displays were free-only with 90 rows and total **1176743**. The intentional protocol
still needs one counted probe and one viewport read. Two/three identical count values
do not identify the accepted baseline supplier for explicit-free/Home; individual
ownership and equality of every request field remain unestablished.

Times below are milliseconds from each action, with sampled model observation rather
than paint timing. `P` is a counted one-row probe, `R` the uncounted 90-row range.

| OFF control | P dispatch -> completion | R dispatch -> completion | Active metadata / row observation |
|---|---|---|---|
| Bare entry | 309 -> 589 | 649 -> 1424 | 623 / 1713 |
| Explicit free-only | 334 -> 487; 335 -> 646 | 705 -> 1558 | 679 / 1845; probe supplier ambiguous |
| Home | 56 -> 301; 61 -> 499; 77 -> 667 | 717 -> 1463 | 693 / 1742; probe supplier ambiguous |

Explicit-free normalised to an absent URL flag at 309ms. Home retained the document
and pushed through `nonFree=false` then absence at 72/74ms. This supports permission-
independent false-to-absent normalisation and Home coordination as remaining paths,
not only a late switch to paid-image inclusion. These observations do not certify
the precise callback responsible or recurrence for every user/action.

| OFF control | Returned image rows, including probes | Encoded body bytes | Decoded body bytes | Response wire bytes |
|---|---:|---:|---:|---:|
| Bare entry | 91 | 190846 | 1249778 | 191928 |
| Explicit free-only | 92 | 195265 | 1263807 | 196887 |
| Home | 93 | 199673 | 1277836 | 201835 |

These are successful image responses only, excluding assets, discovery/session,
media and telemetry. Gzip encoded and decoded sizes matched native events; none
used browser cache/service-worker delivery or crossed its measurement boundary.
Live totals, first images and effective rights differ from the earlier ON series;
do not interpret the byte differences as a measured performance improvement.
One telemetry attempt was blocked in the Home document. Hidden Kupua was preserved
without polling suppression; no partner image-API read started during this short run.
Owned wrappers/key were removed afterward, with inherited instrumentation/guard intact.

### Team-Facing Conclusion

Additional startup/default-navigation work remains observable despite #4710 being
present. With the ON default, bare entry adds a superseded free probe; with the OFF
default applied, the bare control needs only one probe. Explicit-free entry repeats
its probe under both permissions, and Home makes four probes ON / three OFF.
The extra work is therefore **not restricted to paid-default users**, but neither
does this establish duplication on every ordinary search/filter action. Carry-over
polling was measured in the ON Home window; no OFF polling series was run.
Accepted counted metadata, viewport rows and eligible current-view polling remain
useful. Exact duplicate ownership, production rollout, server cancellation/CPU/capacity,
other interaction modes and user-visible speed-up remain unmeasured. Quick settled
filter request checks are recorded below.

**One recommended next Kahuna fix, subject to approval:** settle/coalesce routed
search identity and startup/Home default corrections before constructing the counted-search producer,
preserving explicit free-only/all-rights, Home and detail-return behavior. Do not
remove the useful probe/viewport protocol or declare #4710 ineffective. Poll retirement
and empty-interval eligibility are separate findings, not bundled implementation
approval. No code change, test, tier experiment or commit was performed.

Owned XHR/history wrappers and the temporary activation key were removed; the init
registration is inert without its key. The inherited observer and safety guard were
preserved. Only safe aggregates were retained; no raw HAR, identities, credentials,
signed URLs, headers or live bodies were written to the repository.

## Source Scope Of Extra Search Work

**5 October 2026. Source producer sweep, with quick functional checks below; no new
performance measurements or product changes.** This bounds the likely fixes without claiming that every filter duplicates
requests. The preceding ON/OFF evidence remains specific to its listed controls and
configuration. Other modes and timing-sensitive interactions remain unverified.

There is no inspected path that expands `trump` into an independent main search for
each checkbox. Main requests combine query text with the active flags. Kupua normally
uses a counted page plus parallel count/tickers; Kahuna uses a counted one-row probe
then an uncounted viewport read. These useful protocols apply to ordinary searches,
not just rights changes. Facet/suggestion counts and position-restoration reads have
separate consumers and must not be removed as generic "duplicate searches".

| Surface | Kupua source path / scope | Kahuna source path / scope |
|---|---|---|
| Startup | [Default injection](../../src/hooks/useUrlSearchSync.ts#L121) applies only when all search params are empty. The observed provisional rights sequence belongs to that bare-entry path. A nonempty `query=trump` does not meet that condition; absent `nonFree` still means free-only. | [Results construction](../../../kahuna/public/js/search/results.js#L312) starts the counted probe independently of [session/default resolution](../../../kahuna/public/js/search/query.js#L683). Query text can be retained while rights/uploader defaults settle; this is not exclusively a Free-only checkbox callback. |
| Settled keyword typing | [CQL changes](../../src/components/CqlSearchInput.tsx#L253) ignore unchanged effective queries, then [SearchBar](../../src/components/SearchBar.tsx#L116) debounces 300ms and updates the URL. First-edit history push preserves the same params and ordinarily hits URL-sync dedup, not another search. | [Structured query input](../../../kahuna/public/js/search/structured-query/structured-query.js#L46) uses distinct query text and a 500ms debounce, then changes the filter model. The common filter watcher handles that combined query; no per-checkbox main-query fan-out was found. |
| Free-only / rights | [Toggle](../../src/components/SearchFilters.tsx#L44) submits one URL update, retaining other params. It does not directly call the datasource; normal URL-sync search ownership applies. | Legacy checkbox changes the watched model; permissions callbacks also call the [common navigation helper](../../../kahuna/public/js/search/query.js#L328). False-to-absent normalisation under `usePermissionsFilter=false` does not test `showPaid`, so OFF permission cannot be assumed to eliminate that path. |
| GNM-owned / other `is:` and facet values | [Facet callbacks](../../src/components/FacetFilters.tsx#L194) add/remove a term in the current query and call the same URL updater. No separate GNM-owned search producer was found. | [GNM-owned synchronisation](../../../kahuna/public/js/search/query.js#L235) adds/removes the chip in the shared filter model. The structured-input wrapper mirrors its checkbox before debounced text publication; an intervening digest could expose an intermediate model. This is a timing candidate, not a measured extra request. |
| My uploads / uploader | No named My uploads shortcut was found in the searched Kupua source. [Uploader URL filtering](../../src/lib/search-params-schema.ts#L34) and uploader CQL use the ordinary combined-query path; adding a shortcut is outside this fix. | [Uploader management](../../../kahuna/public/js/search/query.js#L140) combines remembered state, session identity and the selected uploader. Legacy checkbox uses the filter watcher; the permissions-mode [My uploads callback](../../../kahuna/public/js/search/query.js#L419) calls the helper and can also mutate watched filter fields. Overlapping navigation is possible, not certified for each click. |
| Date / sort / collection transitions | [Date changes](../../src/components/DateFilter.tsx#L266) submit related bounds together; [context transitions](../../src/lib/search-params-schema.ts#L75) combine collection/AI sort adjustments before navigation. URL canonicalisation returns before dispatch while replacement is needed. | Date and sort have [separate watchers](../../../kahuna/public/js/search/query.js#L611). The sort watcher checks `lastRequestedOrderBy`; equality suppression protects many echoes. Collection corrections also use the common helper, but these are not one universal pending-target owner. |
| Home | [Home dedup preparation](../../src/lib/reset-to-home.ts#L85) blocks URL sync from racing its direct search. It applies full defaults, awaits useful publication, then navigates; the live control made one intended pair. | [Logo handler](../../../kahuna/public/js/search/index.js#L112) resolves session defaults and navigates, then emits a logo event. [Sort reset listener](../../../kahuna/public/js/components/gr-sort-control/gr-sort-control.tsx#L58) is another callback path, alongside default reapplication and routing corrections. Exact active callback ownership of the measured four probes remains unjoined. |

### Guards And Remaining Attribution

Kupua's [URL-sync equality guard](../../src/hooks/useUrlSearchSync.ts#L167) ordinarily
deduplicates unchanged search params, and filters do not directly invoke `search()`.
Native history restoration is intentionally distinguished from same-query no-ops;
focus/window discovery can legitimately require more reads. This supports a narrow
bare-default ordering repair, not a rewrite of every filter or a guarantee for every
rapid/concurrent interaction. Kupua's hard-coded Home default is not a session-
permission implementation and should not be changed merely to manufacture an OFF test.

Kahuna has real suppression: [onValChange](../../../kahuna/public/js/util/eq.js#L5)
uses deep equality, and `goParamsAlreadyCurrent` skips values already current.
Consequently a model echo is not automatically another HTTP request. However, the
common helper compares current state rather than a shared pending destination, and
its filter object contains UI-only fields such as `orgOwned` and `uploadedByMe` that
are absent from [routed params](../../../kahuna/public/js/search/index.js#L174).
Such comparisons can request navigation even when the semantic URL is unchanged;
the router may still suppress it. Do not equate `$state.go` call counts with searches.

The [AI-toggle watcher](../../../kahuna/public/js/search/query.js#L645) is another
concrete initialisation producer: it calls `$state.go` on its first pass even when
AI is off. Its initialisation flag gates telemetry, not navigation. Together with
rights normalisation, session completion and Home events, this makes coordinated
initialisation a stronger fix boundary than a checkbox-specific patch. It does not
prove which producer caused every observed probe. GNM-owned's early model mirror
likewise depends on Angular digest timing; the [subscription helper](../../../kahuna/public/js/util/rx.js#L30)
does not itself establish an atomic model-plus-text update or immediate navigation.

**Fix scope:** first prevent the established unresolved/obsolete dispatches at their
producer, preserving accepted counts/tickers, explicit filters, typed query,
Home/detail return and position ownership. For Kupua that is bare default ordering;
for Kahuna it is coordination of routed/default state before counted-search admission.
Do not introduce a blanket request suppressor or treat useful typeahead/facet reads
as defects. Other settled filter actions remain source candidates, not measured bugs.

**Permission discriminator:** the bounded OFF comparison above distinguishes the
ON bare-entry scope switch from explicit-false/Home work that persists without paid
defaults. It does not require a Kupua source change or establish one cause for every
request. Normal typing/GNM-owned/My uploads would require separately selected live
interaction controls before any universal claim or wider implementation scope.

### Quick Settled Kahuna Filter Checks

**5-6 October 2026. Functional request checks only**, with `showPaid=false` and
then `showPaid=true`, both using `usePermissionsFilter=false`. Permission was verified
from live controller state; reload and Home applied the operator's ON setting.
From settled Home (free-only OFF, all-rights ON), actual UI actions changed the keyword,
then added GNM-owned, then added My uploads to that combination. Under both permissions,
each issued **one counted probe and one viewport read**, all returning 200 with the
intended combined filters. No extra counted main search was observed. Poll/suggestion
reads were excluded; no latency or byte comparison was collected.

| Kahuna action | OFF counted probes | ON counted probes | Viewport reads per check |
|---|---:|---:|---:|
| Type `trump` | 1 | 1 | 1 |
| Add GNM-owned to `trump` | 1 | 1 | 1 |
| Add My uploads to `trump` + GNM-owned | 1 | 1 | 1 |

Own filter changes were reset to Home, preserving each operator-set permission and
the inherited guard; the final state was ON/all-rights with query/uploader cleared.
These clean settled checks support keeping the demonstrated
repair scope at startup/Home/normalisation, not rewriting ordinary filters. They do
not certify rapid overlapping edits, post-Home timing windows, every
filter combination, or Kupua's live interactions.