# AI Search - Post-U6z Media-API Convergence Plan

> **Status:** U9-A (`804ca1191`) and U9-B are built locally (27 September 2026);
> as-built notes live in the API build plan. U9-C remains deferred pending separate
> team approval; no merge or deployment authorization follows from this plan.
> **Revised:** 27 September 2026 against current Kupua, Guardian media-api `main`,
> Kahuna, and the bounded `eelpie/grid` `thrall-embedding` draft evidence.
> **Active build units:** U9-A then U9-B in the API build plan, both built locally.
>
> Current architecture/background: [AI search guide](00%20Architecture%20and%20philosophy/08-ai-search.md).
> Active migration sequence: [API build plan](03%20Ce%20n'est%20pas%20une%20pipe%20dream/api-build/api-build-00-plan.md).

## 1. Decision Summary

Kupua should route text AI search through media-api, but not by folding its two
query inputs into media-api's single `q` string.

The minimal shared contract is an **additive `aiQuery` query parameter** on the
existing authenticated `GET /images` AI path:

- `q` is the complete CQL/filter query.
- `aiQuery` is the semantic ranking text.
- `useAISearch=true` continues to engage the existing AI endpoint initially.
- `vecWeight` continues to control lexical/semantic blending.
- When `aiQuery` is absent, media-api executes today's legacy behavior unchanged.

That absence rule is the Kahuna safety boundary. Kahuna cannot currently send
`aiQuery`; it sends only `q`, `useAISearch` and `vecWeight`. Its text AI, empty-AI
guidance, More Like This, totals, tickers and error behavior therefore stay on the
existing path unless Kahuna later opts into a separate change.

More Like This (MLT) is a **separate shared product slice**. Kupua has no MLT UI
today. The useful idea from eelpie's draft is that `similar:<id>` is a
self-identifying image-ranking signal and the rest of `q` is a hard filter. That
model can make `similar:<id> text` useful instead of returning 422, but the fork's
embedding pipeline, response shape and 1,000/5,000 KNN tuning must not be copied
wholesale.

## 2. Current State After U6z

### 2.1 Kupua

In media-api mode, every non-AI read now uses `ApiDataSource`. `searchByAi` is the
sole development fallback and still delegates to the direct-ES adapter:

1. Kupua's Vite Bedrock proxy embeds `aiQuery`.
2. The direct ES adapter runs the current single-request AI query.
3. The store publishes a complete in-memory result set of at most 200 images.
4. Counts/tickers/facets are scoped separately to those returned IDs.

Kupua deliberately has two independent URL inputs:

```text
query=<CQL and hard-filter text>
aiQuery=<semantic ranking text>
```

This distinction is useful and must survive migration.

### 2.2 Guardian media-api main

The existing AI endpoint is:

```text
GET /images?useAISearch=true&q=...&vecWeight=...
```

`AiQueryParts.from(structuredQuery)` currently classifies:

- unfielded words/phrases in `q` as semantic ranking text;
- `similar:<id>` as image ranking;
- all other CQL conditions as KNN pre-filters;
- text plus `similar:` as conflicting ranking signals (422);
- filters without ranking as `NoRankingSignal` and filter-pool guidance.

Text AI uses the existing parallel lexical + semantic search and `HybridResult`
fusion. The response already contains canonical image entities, server enrichment,
pool total and pool-scoped ticker counts. The result set is fixed at at most
`ai.search.resultLimit` (default 200), with no AI pagination.

### 2.3 Kahuna

Kahuna has one query editor and an AI checkbox. Its media-api client sends:

```text
q=<query editor contents>
useAISearch=<checkbox>
vecWeight=<optional value>
```

It does not know or send `aiQuery`. AI results are treated as one fixed set, and
Kahuna displays the server's `Best k of N` total and pool tickers. MLT currently
navigates to `q=similar:<id>&useAISearch=true`.

## 3. Minimal Non-Invasive Text-AI Contract

### 3.1 Request behavior matrix

| Request | Required behavior |
| --- | --- |
| no `useAISearch=true` | Ordinary search. Ignore `aiQuery` for routing. |
| AI on, `aiQuery` absent | Exact current legacy `AiQueryParts.from(q)` behavior. |
| AI on, nonempty `aiQuery` | Rank by `aiQuery`; treat all non-`similar:` conditions parsed from `q`, including unfielded text, as hard filters. |
| AI on, explicit empty `aiQuery=` | No explicit text ranking signal; return filter-pool guidance rather than silently reverting to legacy text ranking. |
| `aiQuery` plus `similar:` | 422 conflicting ranking signals. |
| `length=0` | Existing no-embedding/no-search short circuit. |

The explicit branch means:

```text
q=credit:EPA storm&aiQuery=wildlife
```

ranks semantically by `wildlife` inside the hard-filtered pool matching both
`credit:EPA` and ordinary text `storm`.

### 3.2 Media-api implementation boundary

Keep the new parameter local to `MediaApi.imageSearch`:

- Read raw `aiQuery` from the authenticated GET request.
- Do **not** add it to shared `SearchParams`.
- Do **not** add it to POST body parsing used by Kupua's ordinary endpoints.
- Do **not** add it to ordinary pagination links or the root HATEOAS search
  template in the first change.
- Keep the existing `AiQueryParts.from(conditions)` method unchanged for the
  absent-param legacy branch.
- Add a small explicit-ranking constructor/helper that accepts parsed `q`
  conditions plus explicit text.

For the explicit branch:

1. Trim `aiQuery`; nonempty text becomes `semanticQuery`.
2. Preserve a valid `similar:<id>` as `similarImageId` so text+image remains a
   deliberate conflict.
3. Treat every other parsed `q` condition, including `AnyField` words and
   phrases, as `filterConditions`.
4. Reuse `buildAiFilter`, `semanticSearchByText`, hybrid fusion and count/ticker
  calculation unchanged.
5. Render explicit-`aiQuery` image entities without `embedding`; keep the
  absent-param legacy renderer byte-compatible for Kahuna.

This is intentionally not a shared parser rewrite. One new optional parameter
selects one new interpretation; absence preserves the production Kahuna path.

### 3.3 Existing request filters

Date, uploader, cost, validity, export and syndication filters continue through
`SearchParams` and `buildAiFilter`.

Legacy GET `/images` ignores `hasRightsAcquired` (GRID-014), while Kupua's
direct AI currently honors it. **Revised operator decision, 27 September:** U9-A
does not add a branch-specific escape hatch. Both absent-`aiQuery` legacy
requests and explicit-`aiQuery` requests continue ignoring the flag through the
shared GET parser. U9-B may carry the generic URL parameter, but it has no effect
in media-api AI mode. The new POST image-query endpoints already honor the field
through their request bodies; GRID-014 owns any future shared GET fix and must
cover ordinary GET, legacy AI and explicit-`aiQuery` AI together.

This is a manual/external-URL correctness and mode-parity limitation: neither
Kahuna nor Kupua exposes a normal control for the parameter, and no usage is
measured. `syndicationStatus` remains independent and sufficient by itself;
clients must not derive or add the rights flag from a status. U9-A's eventual PR
description must disclose the deliberate non-fix and the working POST contrast.

### 3.4 `vecWeight` contract

`vecWeight` remains an optional float in `[0, 1]`:

- `0` = lexical ranking;
- `1` = semantic ranking;
- intermediate values = existing server fusion.

Kupua has no URL-compatibility obligation: there are no external users or
bookmarked Kupua AI URLs to preserve. **Operator decision, 27 September:**
validate in the media-api request mapper, not by rewriting the URL:

```text
valid finite value in [0,1] -> forward unchanged
absent, empty, non-numeric or out of range -> omit from the media-api request
```

When omitted, media-api's current default `0.85` is authoritative in media-api
mode. Explicit valid values reach media-api unchanged and select lexical,
semantic or fused ranking as they do today. The URL parameter itself is left
as typed. Direct/local mode keeps its existing parsing (absent means `1.0`,
out-of-range values clamp), so an invalid URL value ranks slightly differently
in the two modes. That small divergence is accepted: direct mode is expected to
retire, and no normal control produces invalid values.

`vecWeight=0` currently still reaches the embedding lookup before
`hybridSearch` short-circuits to lexical search. Avoiding that unnecessary
embedding is a useful server optimization, not a prerequisite for correctness.

### 3.5 Why Kahuna is protected

No Kahuna code change is required for text-AI migration. The compatibility test
is simple and falsifiable:

> For every request without `aiQuery`, request parsing, selected AI mode,
> response body/status and side effects are unchanged.

In particular, preserve:

- legacy unfielded `q` as ranking text;
- filters-only `NoRankingSignal` guidance;
- current `similar:` image search;
- current text+`similar:` 422;
- `length=0` short circuit;
- Kahuna's `Best k of N` and pool ticker semantics;
- media-api's default `vecWeight`.

### 3.6 Media-api capability and explicit response projection

Kupua cannot keep using the browser Bedrock health check after media-api owns AI.
Advertise an additive HATEOAS `ai-search` capability from media-api's root/index
response only when `config.aiSearchEnabled` and its embedding implementation are
available. Existing Kahuna clients ignore an unknown relation; the ordinary
`search` URI template remains unchanged.

The capability tells Kupua whether to show text AI in media-api mode. It does not
carry query text, model details or vectors.

For explicit-`aiQuery` responses, extend the shared `ImageResponse` rendering
boundary with a projection that omits `embedding` after server-side ranking and
fusion. Do not delete fields ad hoc in the controller. The default renderer used
by legacy Kahuna requests remains unchanged, so this payload improvement is opt-in
with the new parameter.

## 4. Kupua U9 Client Work

### 4.1 Adapter ownership

Implement `apiSearchByAi` in the current media-api adapter surface, reusing:

- existing authenticated `/api/images` transport;
- `mapApiImageToImage`;
- `extractEnrichment`;
- current query/filter serialization helpers where their GET semantics match.

Bind it from `ApiDataSource` in media-api mode and remove `searchByAi` from
`DEVELOPMENT_FALLBACK_METHODS` only after composed tests prove no Bedrock or ES
browser request remains.

Direct/local mode retains its existing direct-ES ranking implementation and
Bedrock health gate. U9-B does align its result metadata with media-api mode:
reuse the existing post-AI `countWithTickers` request without returned-ID
decoration so it reports the prefilter pool total and pool-scoped tickers, then
publish the same `aiPoolTotal`/`tickerCounts` contract in both modes. This
replaces the current top-200-scoped count; it does not add another count request
or change direct ranking. Any later retirement is a separate cleanup decision;
do not expand the fallback in the meantime.

### 4.2 Request mapping

Kupua sends:

```text
GET /api/images
  ?useAISearch=true
  &q=<complete effective CQL query>
  &aiQuery=<AI widget text>
  [&vecWeight=<validated value in [0,1]>]
  &length=200
  &<supported request filters>
```

The effective `q` retains the two default-hide clauses used by ordinary reads.
Encoding must preserve CQL punctuation and quoted text exactly.

`hasRightsAcquired`, if present in generic URL/request serialization, remains an
intentional no-op on this GET path until GRID-014 is fixed at the shared parser.
Do not add U9-only parsing or filtering for it.

### 4.3 Result mapping and enrichment

The AI endpoint returns the same Argo envelope and enrichment fields as ordinary
GET search, but the explicit branch omits the unused embedding vector. Map both
image and enrichment from each entity and publish the AI result's complete
enrichment map with the result commit. This removes KUP-030's
cross-provenance overlay retention by construction: the current AI response owns
both baseline and overlay for every returned ID.

**KUP-030 is not a separate repair unit.** Retain its reproduction as acceptance
evidence for U9-B, and close it only when the composed media-api AI path proves
current-result enrichment ownership across ordinary -> AI -> ordinary transitions.

A missing/hidden/unreadable result remains omitted according to media-api's
existing response contract; do not infer absence from a partial failed request.

In media-api mode the accepted AI search generation owns the shared enrichment
map as a replacement, not an upsert. A nonempty success publishes exactly the
returned IDs' current overlays; a successful empty result or current-generation
null/refused/unavailable publication replaces it with an empty map. Aborted or
superseded completion must not mutate it, and the next ordinary result replaces
it normally. Direct/local AI has no API overlay to publish. This result-lifetime
rule does not add enrichment to selection hydration or change its cache policy.

### 4.4 Fixed-set invariant, total and tickers

AI returns `k` ranked hits plus the full filtered pool total `N`, with no
pagination. Preserve Kupua's fixed in-memory set without a broad SearchContext
refactor:

- publish store `total = hits.length` so no PIT, seek, extend, map or polling can
  start;
- add `aiPoolTotal?: number` and `tickerCounts?` to the AI result contract;
- add `aiPoolTotal: number | null` to search-store state;
- set it atomically with a successful AI result and clear it at the start of
  every non-AI search, Home transition and failed/absent AI publication;
- render `Best <total> of <aiPoolTotal> matches` when present, while ordinary
  result wording remains unchanged;
- consume server pool-scoped ticker counts directly;
- suppress a ticker equal to `aiPoolTotal ?? total`, because AI tickers describe
  the pool rather than only the returned hits;
- stop the media-api AI path from issuing the current ID-decorated count request.

Pool-scoped tickers differ from Kupua's current top-200-scoped tickers. Kupua has
no compatibility burden here, and using the server result is simpler and avoids
an extra request. Label the scope honestly; do not describe it as top-200 data.
Status-bar reload caching must either store/restore both values together or avoid
showing an AI pool label until the first post-reload search settles; never combine
a cached ordinary total with a fresh/stale AI pool total.

**Operator decision, 27 September:** U9-B aligns both API and direct/local modes
with Kahuna's pool semantics. Render wording such as
`Best 200 of 10,216,960 matches`; ticker badges show their absolute pool count.
Do not add per-ticker denominators or wording such as
`15 of 2,345,120 GNM-owned` in this unit. API mode consumes the values already
returned by media-api and sends no ID-decorated count request. Direct mode
repurposes its one existing post-AI count request to use the undecorated
prefilter scope, so the store and StatusBar do not branch by mode. Because that
direct count now aggregates over the pool rather than at most 200 IDs, include
it in U9-B's targeted completion-timing comparison; do not add a second count or
broader performance campaign.

### 4.5 Relevance sorting

Media-api returns the authoritative ranked order but no score. Kupua supports
Uploaded -> Relevance in-memory re-sorting, so assign an internal ordinal score
from response position (strictly descending, never sent back to the server).
Relevance re-sort must reproduce the original server order exactly.

Eelpie's draft does not provide an alternative score contract. Its MLT request
sorts ES hits by `_score` and ID, then converts them to `(id, image)` before the
normal image response; its hybrid path likewise drops fused, lexical and semantic
scores when constructing `SearchResults`. Neither Guardian nor eelpie currently
serializes ranking scores to clients. Do not attempt to reconstruct a meaningful
cross-algorithm scalar from ES/fusion internals: response ordinal is the only
authoritative client relevance key unless media-api later adds an explicit rank
or score contract.

Every mapped AI hit must receive the ordinal; a missing value is a contract
failure, not `0`-score fallback behavior.

Preserve the completed KUP-008 ownership rule. If Relevance/Uploaded changes
while the same AI query is pending, completion keeps the captured query/result
scope but applies the latest currently supported sort without another AI request.
If query scope changed, the normal search-generation guard rejects the old
completion. U9 must not restore captured `orderBy` or params over newer URL/store
intent.

Synthetic sort tuples remain non-pageable and are protected by
`total === hits.length`. Do not feed them to cursor APIs.

### 4.6 Mode-aware availability and graceful absence

Replace the current global Bedrock-only gate with a mode-aware AI availability
source:

- media-api mode: consume the media-api `ai-search` capability relation;
- direct/local mode: retain the existing `/bedrock/health` probe;
- unavailable capability: hide the AI input without probing browser Bedrock.

U9-B is the first real consumer of root discovery, so readiness is part of this
unit. API-mode availability must await one shared in-flight initialization;
concurrent callers cannot observe an empty relation map while the root request is
still pending. A successful response without `ai-search` and a failed/non-2xx
root request both hide AI, but tests distinguish those outcomes. Root failure is
graceful absence for the current app lifetime and retries only on reload. Do not
add a general discovery framework, fetch Kahuna `clientConfig` or fall through to
Bedrock.

The datasource contract becomes:

```typescript
searchByAi?(params, signal): Promise<SearchAfterResult | null>
```

`ApiDataSource.searchByAi` returns `null` for transport failure, refusal or any
non-2xx response under the current graceful-API-absence rule. It never delegates
to ES. The store owns null publication for the current search generation:

- `results = []`, `total = 0`, `aiPoolTotal = null`;
- counts/tickers/aggregations are empty;
- the media-api result-owned enrichment map is empty;
- `loading = false`, `error = null`;
- no toast or console warning.

Client-side conflict prevention should make an explicit 422 exceptional, but the
development-phase non-2xx rule still maps it to absence rather than fallback.
Direct/local `ElasticsearchDataSource.searchByAi` may continue to return only a
real result or throw; it does not use the nullable absence path.

## 5. More Like This: Separate Shared Improvement

### 5.1 Current Guardian behavior and the Kahuna failure

Guardian main routes MLT through AI mode:

```text
q=similar:<id>&useAISearch=true
```

A `similar:` chip plus unfielded text is parsed as image ranking plus text
ranking and returns 422 `ConflictingRankingSignals`. Kahuna surfaces that server
failure rather than presenting a useful controlled outcome. The server conflict
is intentional under the current single-`q` model; the user experience is still
poor.

An immediate Kahuna-only containment can catch that 422 and show the server
message clearly. That is independent of the better shared MLT design below.

After U9-A/B, reproducing today's Kahuna-like MLT in Kupua requires only Kupua
client work. Media-api already accepts
`q=similar:<id>&useAISearch=true`, resolves the source image and its compatible
embedding server-side, and returns an empty result when the image has no such
embedding. Kupua needs an MLT control plus URL/store/adapter support for AI mode
without `aiQuery`; it does not need an embedding vector in the image response.
With Kahuna's current global feature gate, the control can therefore appear for
an older unembedded image and lead to zero results, while adding unfielded text
still produces the existing 422. Section 5.5 considers per-image capability
signalling that avoids both exposing vectors and offering a known-empty control.

### 5.2 What eelpie's draft does

Evidence scope: `eelpie/grid` default `main` is 63 commits behind Guardian main
and has no fork-only AI commits. The relevant code is draft PR #20 on
`thrall-embedding`, based on another fork branch. It is not merged or production
evidence.

The draft makes MLT an ordinary-search ranking signal:

- Kahuna navigates to `q=similar:<id>` without `useAISearch=true`.
- media-api extracts the source image's active embedding.
- `QueryBuilder` removes the `similar:` condition from the lexical query.
- every remaining `q` condition becomes a hard KNN filter.
- results sort by similarity score, then ID.
- the MLT control appears only when the response contains a Gemini embedding.

Consequently:

```text
similar:<id> maori
```

means image KNN filtered by `maori`; there are no two ranking signals and no
422.

The draft also changes MLT search tuning from Guardian's fixed AI path:

| Concern | Guardian current MLT | eelpie draft MLT |
| --- | --- | --- |
| maximum returned set | 200 | KNN `k=1000` |
| ANN candidates | about 400 at k=200 | 5000 |
| minimum similarity | none | configurable, default 0.80 |
| paging shape | fixed set | ordinary `from/size` within KNN set |
| activation | `useAISearch=true` | `similar:` is self-identifying |

Text AI remains capped at 200 and keeps the existing two-request fusion. The
draft does not solve Kupua's separate text-ranking/filter-query contract, and it
does not expose ES or fused scores in its API response.

### 5.3 Potentially useful ideas

The following ideas are worth carrying forward independently:

1. `similar:` should be a self-identifying image-ranking signal.
2. Remaining `q` conditions should filter the image-KNN pool.
3. MLT availability should be image-specific, not only a global feature flag.
4. A configurable minimum similarity can suppress obviously weak matches.
5. Stable score/ID ordering is useful when equal scores occur.
6. Embeddings can be persisted for reindex reuse rather than recomputed.
7. A provider interface can separate search behavior from Bedrock/Gemini choice.

The embedding model itself may also be promising: the draft uses Gemini
Embedding 2 at 768 dimensions with retrieval query/document task types, and
builds image embeddings from a normalized image plus title and description.
That may improve semantic quality, but no relevance benchmark in the draft
proves it.

### 5.4 Problems and non-transferable choices

Do not adopt the branch wholesale:

- It is a large draft combining AI, Gemini/GCP, JDK 25, libvips, cropper,
  ingestion, storage and reindex changes.
- Its 1,000/5,000 MLT tuning is far more expensive than Guardian's 200/400 and
  has no accepted latency/recall evidence.
- Re-running approximate KNN for ordinary pages is not a proven stable snapshot.
- Kahuna receives the full 768-value embedding merely to decide whether to show
  MLT.
- The new SQS consumer deletes/acknowledges the message before the asynchronous
  embedding, persistence and update publication complete; failures can be lost.
- It logs message bodies, metadata and full embeddings.
- It requires a new 768-dimensional mapping and a full backfill.
- Its testing checklist is empty and media-api MLT coverage is incomplete.
- Switching providers and embedding dimensions is a separate production/model
  decision, not a prerequisite for better MLT query semantics.

### 5.5 Recommended shared MLT path

Treat MLT as a later server/client slice after text AI migration:

1. Add an ordinary-search `similar:` path that treats all remaining `q` as hard
   filters, preserving authorization and current search filters.
2. Start with the existing bounded result budget (at most 200, conservative
   candidates). Raise it only after a specific recall/latency question is
   measured.
3. **Preferred capability contract:** emit a conditional HATEOAS
  `more-like-this` link on a visible image entity only when media-api knows that
  image has a usable embedding for the configured active similarity profile.
  This is a link rather than an action because it describes safe GET/navigation.
  Absence tells any client to hide the control.
4. Keep the relation semantic and model-opaque. A small server-side descriptor
  for each supported profile owns its ES vector field, expected dimensions and
  extractor; one configuration value selects the active profile. Guardian can
  select Cohere V4, eelpie can select Gemini Embedding 2, and another Grid
  installation can select a later implementation without changing the relation
  or either client.
5. Do not require multi-model migration machinery. The cheapest model change is
  to generate the new embeddings, add their supported server descriptor, then
  switch the configured active profile when coverage is acceptable. Images
  without a compatible vector simply omit the link until they are embedded.
6. Do not send vectors, provider/model names, field paths or dimensions to
  clients. Configuration alone proves only deployment support; the server must
  also check the individual image's active-profile vector before adding the
  link.
7. Kahuna can follow the relation and stop setting `useAISearch=true` for MLT.
  `similar:+text` then becomes useful rather than exceptional. Kupua uses the
  same relation and URL/query contract; neither client implements model logic.
8. Keep legacy `useAISearch=true&q=similar:<id>` working during transition so
  old Kahuna URLs are not broken.

Full image responses already load enough source state to make the capability
decision before projecting the response. Lean Kupua endpoints deliberately omit
embeddings, so they must obtain only a lightweight active-profile availability
signal: initially a bounded detail/capability read when detail opens is the
simplest choice. If list/grid controls are later justified, derive the signal in
the lean hit or use one batched capability lookup; measure that path before adding
cost to browsing. A materialized profile marker is a future optimization, not an
index-migration prerequisite. A generic capability boolean is possible but less
expressive than a server-owned link because it makes each client reconstruct the
request.

Kupua already receives existing per-image links and actions from the new
media-api endpoints, but its adapter currently retains actions and drops links.
U9-C must preserve `entity.links` alongside enrichment, surface the MLT control
only when `rel=more-like-this` is present, and use the supplied href without
interpreting embedding details. Resident search images need either the relation
on their lean entity or the bounded detail/capability read above; direct URL entry
must follow the same client contract.

## 6. Delivery Sequence

### U9-A - Additive media-api text contract

Server-only; local implementation authorized, team review required before main:

- smallest controller-local Scala change, isolated in its own independently
  green commit; no adjacent parser/search/refactoring cleanup;
- controller-local optional `aiQuery`;
- explicit query-part classification;
- deliberate `hasRightsAcquired` non-fix owned by GRID-014;
- additive `ai-search` capability relation;
- explicit-branch image projection without embeddings;
- existing prefilter-pool total/ticker computation and response shape unchanged;
- legacy absent-param behavior tests;
- no Kahuna search behavior or legacy image-response change.

### U9-B - Kupua media-api AI client

Kupua-only plus composed API fixtures:

- `apiSearchByAi` through `ApiDataSource`;
- request mapping including validated optional `vecWeight`;
- canonical image/enrichment mapping;
- fixed-set/pool-total/ticker handling;
- pool-total/ticker parity in direct/local mode without a ranking rewrite;
- server-order relevance restoration;
- mode-aware availability and nullable graceful absence;
- no browser Bedrock/direct-ES traffic in media-api mode;
- remove the final fallback only after validation.

### U9-C - Shared MLT contract (separate approval)

- ordinary `similar:` server semantics;
- conditional HATEOAS capability;
- conservative tuning and targeted performance/recall evidence;
- Kahuna controlled error handling and later opt-in;
- Kupua MLT UI only after the server contract is accepted.

Do not combine U9-C with the text-AI server PR. Kahuna is live; keeping the
backward-compatible text contract review small is the safest route.

## 7. Discriminating Tests

### 7.1 Media-api text contract

- No `aiQuery`: unfielded `q` remains ranking text exactly as today.
- No `aiQuery`: filters-only, MLT, text+MLT conflict and empty behavior retain
  current status/body/side effects.
- Explicit `aiQuery`: embeds only `aiQuery`.
- Explicit `aiQuery`: unfielded words and phrases in `q` remain hard filters.
- Explicit `aiQuery`: structured chips and request filters narrow the pool.
- Explicit empty `aiQuery=` returns filter-pool guidance and does not embed.
- Explicit `aiQuery` plus `similar:` returns 422 before embedding/search.
- Missing `useAISearch=true` follows ordinary search despite `aiQuery`.
- `length=0` performs no embedding, KNN or filter-count request.
- `vecWeight` 0, 1 and an intermediate value retain their ranking modes.
- Explicit `aiQuery` retains the existing prefilter-pool total and ticker scope;
  U9-A adds no alternative top-200 count path.
- Explicit-`aiQuery` image entities omit `embedding`; legacy absent-param image
  entities retain their current response shape.
- Root/index advertises `ai-search` only when server AI is usable; the existing
  Kahuna search relation is unchanged.
- Legacy, legacy-AI and explicit-`aiQuery` GET requests all ignore
  `hasRightsAcquired`; the new POST endpoints remain the working control and
  GRID-014 owns any future shared fix.

### 7.2 Kupua client

- The request preserves encoded `q`, sends separate `aiQuery`, and forwards an
  explicit valid `vecWeight`; absent/invalid values are omitted from the
  request (the URL is not rewritten) so media-api owns the default.
- Media-api mode issues no `/bedrock` or `/es` AI request.
- Media-api mode uses server capability for visibility; direct mode still uses
  `/bedrock/health`.
- API capability reads await coalesced root initialization; delayed concurrent
  callers cannot publish false absence, failed/non-2xx root is session absence,
  and successful missing relation is covered separately.
- Returned images and enrichment are current-result owned; old same-ID overlays
  cannot survive.
- Nonempty AI success replaces enrichment with exactly its returned map;
  successful empty and current null/refusal/unavailability replace it with an
  empty map; aborted/superseded completion leaves the current map untouched.
- Server order survives Relevance -> Uploaded -> Relevance.
- Every returned hit has an ordinal relevance key; missing rank metadata fails
  the mapping/fixture instead of silently sorting as zero.
- Pending same-query completion honors the latest Relevance/Uploaded choice
  (KUP-008) without a second request; superseded-query completion cannot publish.
- Pool total is displayed separately while store total remains `hits.length`;
  AI -> ordinary/Home/failure transitions clear it atomically.
- API and direct/local modes show the same `Best k of N matches` wording and
  absolute pool-scoped ticker counts; no per-ticker denominator is rendered.
- API mode issues no follow-up count request; direct mode replaces its existing
  ID-decorated count with one undecorated prefilter-pool count rather than adding
  another request.
- Pool tickers are consumed without the old ID-decorated count request and use
  pool total for equal-total suppression.
- No PIT, polling, seek, extension or position-map work starts.
- Refusal/unavailability returns null and publishes an empty, non-error AI state
  without toast, warning or direct-ES fallback.

### 7.3 MLT

- Legacy `useAISearch=true&q=similar:<id>` remains valid during transition.
- Ordinary `q=similar:<id>` ranks by image embedding.
- Bare text and structured chips beside `similar:` are hard filters, not a
  second ranking signal.
- Missing/invisible source image or missing active embedding returns the agreed
  empty/absence result without leaking existence.
- HATEOAS relation appears only when MLT is actually usable.
- Clients never receive the embedding vector merely to determine capability.
- Candidate/result limits and minimum similarity are covered at their exact
  configured boundaries.

## 8. Performance, Privacy and Payload

Performance remains a decision input, not an automatic campaign:

- media-api text hybrid runs lexical and semantic searches plus a pool
  count/ticker query;
- AI response rendering uses the heavy Argo image envelope for at most 200 hits;
- embeddings are needed server-side for fusion but are useless in the browser;
- explicit-`aiQuery` rendering strips embedding fields at the shared
  `ImageResponse` boundary; legacy Kahuna rendering remains unchanged;
- do not make ordinary lean endpoint projection configurable to add vectors
  back;
- run a targeted perceived-performance comparison only after U9-B exists, with
  a named question about end-to-end AI completion.

Semantic query text currently appears in URLs and media-api logging/cache keys.
The additive parameter does not create the general issue, but it makes the
boundary explicit. Avoid logging raw query text and full vectors in any new code;
cache normalization/expiry and response stripping should be reviewed with the
server PR.

## 9. Remaining Approval Gates

U9-A and U9-B may be built and validated locally. The following gates still
apply beyond that local implementation:

1. Team agreement before merging or deploying the additive media-api `aiQuery`
  parameter and its absence-preserves-Kahuna contract.
2. Team agreement before merging or deploying the additive `ai-search`
  capability relation and explicit-branch vector-free response projection.
3. Separate approval for ordinary-search MLT semantics and Kahuna opt-in.
4. A later, evidence-backed embedding-provider/model decision; eelpie's Gemini
   draft is evidence to evaluate, not an implementation dependency.

## 10. Anti-Goals

- No global reinterpretation of `q` for existing clients.
- No Kahuna code change in the text-AI server PR.
- No `aiQuery` field in shared `SearchParams` or ordinary POST bodies.
- No temporary folding of Kupua filter text into semantic ranking.
- No batch hydration of direct-ES AI results as the target architecture.
- No expansion of direct-ES ranking or embedding behavior; U9-B's bounded pool
  metadata parity is the only direct-mode change.
- No SearchContext framework.
- No automatic `useAISearch` retirement.
- No eelpie pipeline/model/tuning transplant.
- No 1,000-result MLT without measured need.
- No vector payload sent merely to expose availability.

## 11. Current File Map

| Surface | Current files |
| --- | --- |
| media-api AI controller | `media-api/app/controllers/MediaApi.scala` |
| AI query classification / GET params | `media-api/app/lib/elasticsearch/ElasticSearchModel.scala` |
| Hybrid/KNN/filter/count implementation | `media-api/app/lib/elasticsearch/ElasticSearch.scala`, `HybridResult.scala`, `QueryBuilder.scala` |
| Server tests | `media-api/test/lib/elasticsearch/AiQueryPartsTest.scala`, `HybridSearchTest.scala`, controller tests |
| Kupua API client | `kupua/src/dal/grid-api-search-adapter.ts` |
| Kupua datasource binding | `kupua/src/dal/api-data-source.ts`, `kupua/src/dal/index.ts` |
| Kupua AI store path | `kupua/src/stores/search-store.ts` |
| Result contracts | `kupua/src/dal/types.ts` |
| AI availability | `kupua/src/main.tsx`, `kupua/src/lib/grid-api-instance.ts` (`apiAiSearchAvailable`), `kupua/src/dal/grid-api/service-discovery.ts`, `kupua/src/lib/grid-config.ts`, `kupua/src/components/AiSearchInput.tsx` |
| Pool-total display | `kupua/src/components/StatusBar.tsx` |
| Direct-mode AI (ranking and parallel pool count) | `kupua/src/dal/es-adapter.ts`, `kupua/src/lib/bedrock-proxy-client.ts` |
| Current aggregation decorator | `kupua/src/lib/ai-search-params.ts` |
| Kupua AI UI/URL | `kupua/src/components/AiSearchInput.tsx`, `kupua/src/lib/search-params-schema.ts` |
| Kahuna AI request/UI | `kahuna/public/js/services/api/media-api.js`, `kahuna/public/js/search/query.js`, `kahuna/public/js/search/results.js` |
| Kahuna MLT | `kahuna/public/js/components/gr-more-like-this/` |

This plan supersedes the previous pre-U6z StranglerAdapter-based slicing and its
proposed temporary free-text degradation. It authorizes local U9-A/U9-B work only
under the active API build plan; it does not authorize U9-C, merge or deployment.

## 12. U9a PR notes

Reviewer-facing material for the eventual media-api PR (build-plan section 7, PR 9). Built
locally on 27 September 2026; team review still gates merge and deployment.

### 12.1 What the PR does

Adds one optional query parameter, `aiQuery`, to the existing authenticated `GET /images` AI
path, plus a root `ai-search` link and a response option that omits the embedding vector. With
`useAISearch=true`, `aiQuery` is the text to rank by and **everything** in `q`, including plain
words, is a filter. Today `q` has to carry both, so a client cannot say "rank by *wildlife* among
images matching *storm* and `credit:EPA`". Nothing else changes.

### 12.2 Why it is safe for production

The safety argument is structural: a request only reaches new code if it carries a parameter no
current client sends.

1. **Kahuna never sends `aiQuery`.** Its media-api client sends `q`, `useAISearch` and
   `vecWeight` only. Without `aiQuery` the controller takes the exact line it takes today,
   `params.aiQueryParts` (the unchanged `AiQueryParts.from`). After that point the two branches
   share every existing step: the `length=0` short-circuit, filter building, text and
   similar-image search, lexical/semantic fusion, the pool count and tickers, and the 422 mapping.
2. **No shared model changes.** `SearchParams` has no new field. `aiQuery` is read directly from
   the request inside `imageSearch`, so it cannot leak into POST bodies, pagination links,
   ordinary search, `toStringMap` or any other controller.
3. **Response shape is opt-in.** `ImageResponse.create` and `imageResponseWrites` take a trailing
   `includeEmbedding` flag that defaults to `true`. Every existing caller (ordinary search,
   legacy AI, `GET /images/:id`, `ImageQueryController`) keeps the default and produces
   byte-identical JSON. Only the explicit branch passes `false`, which removes exactly one key.
4. **The root response is additive.** `ai-search` is appended after the existing links, and only
   when `ai.search.enabled` is on and Elasticsearch has dense-vector mappings (otherwise AI search
   already returns empty results). The `search` link and its template are unchanged, and clients
   look links up by name, so Kahuna ignores the new one.
5. **No new query shapes, costs or limits.** The explicit branch builds its filter with the same
   `buildAiFilter` and runs the same `hybridSearch`/pool-count requests. Embedding cache, `k`,
   candidate counts, the 200-result cap and the 0.85 `vecWeight` default are untouched. The
   request count per search is the same. Payload shrinks, because vectors are no longer sent.
6. **Refusals happen before any work.** `aiQuery` with any valid `similar:<id>` returns the existing
   422 before embedding or searching, so the new branch never runs image similarity (More Like
   This stays a separate PR). An empty `aiQuery=` returns the existing filter-pool guidance
   without embedding. `length=0` short-circuits exactly as before.
7. **Authorization is unchanged.** Same `auth.async` action, same tier filtering through
   `buildFilterOpt`, and the same `isVisibleToAccessor` check for the similar-image source (which
   the explicit branch never reaches).
8. **Default exclusions cannot be skipped.** Deleted and replaced images are hidden only by the
   `-is:deleted -usages@status:replaced` clauses the parser adds to `q`. Legacy AI cannot return
   ranked hits without `q`, but the new branch could, so it parses an absent `q` as empty and
   always gets those clauses. A test with highly ranked deleted and replaced fixtures covers
   omitted and empty `q`, for hits, pool total and tickers (found by cold review, fixed failing-first).

### 12.3 Pre-existing defects preserved, not fixed

Two existing `GET /images` AI-search authorization/visibility gaps were found during U9-A and
confirmed as pre-existing by the independent cold review. Both are reachable today through legacy
`useAISearch=true` requests from any client. The explicit branch reuses the same filter and
rendering steps, so it **inherits them exactly**: it neither fixes nor widens them, and requests
without `aiQuery` are unchanged. They were deliberately left alone. Fixing them changes live Grid
behaviour for Kahuna, so it needs its own approval, tests and PR, and should cover legacy and
explicit AI together rather than just the new parameter. Both are recorded in build-plan section 11
and the backlog ([GRID-015](bug-backlog.md#grid-015), [GRID-016](bug-backlog.md#grid-016)) for
triage. Neither has been reproduced by running code; both come from source reading.

1. **Deleted-image search bypasses the uploader restriction in AI search.** Ordinary GET limits
   `is:deleted` searches by callers without delete permission to their own uploads
   (`canViewDeletedImages` sets `uploadedBy`). The AI branch never applies that restriction, and
   also skips `SearchParams.validate`. A caller without delete permission could therefore rank
   and count other users' deleted images, for example `useAISearch=true&q=is:deleted <text>`
   (legacy) or `q=is:deleted&aiQuery=<text>` (explicit). A fix would apply the same deleted-search
   admission before AI ranking and pool counts, with own/other/privileged-user tests.
2. **Syndication-tier results skip the per-image visibility rule.** For syndication callers, search
   results rely on the tier filter, which treats a missing `syndicationRights.published` as
   allowed. `isVisibleToAccessor` (used by `GET /images/:id` and the similar-image source) requires
   rights acquired **and** a past publication date. An image with acquired rights, an allow lease
   and no publication date could therefore be returned, with signed URLs, in syndication-tier AI
   results. From the source, ordinary GET search results share the same gap. A fix would align the
   tier filter with `isAvailableForSyndication` (or re-check returned images), with a syndication
   principal fixture for this case.

### 12.4 Other deliberate non-changes

- **`hasRightsAcquired` is still ignored on every `GET /images` path**, including the new branch
  ([GRID-014](bug-backlog.md#grid-014)). No escape hatch was added; one shared GET fix should
  cover ordinary, legacy-AI and explicit-AI requests together. The branch's POST image reads
  already honour it, and a test shows that contrast.
- Without `q`, ordinary `GET /images` and legacy AI filter-pool counts still include deleted and
  replaced images, as today; only the new ranked branch adds the default exclusions.
- `vecWeight=0` still requests an embedding before the lexical-only short-circuit, as today.

### 12.5 How it was verified

- **Preservation first.** Tests for every behaviour without `aiQuery` were written and passed
  against unmodified code: text ranking, filters-only and empty-query guidance, similar-image
  search, the text+similar 422, `length=0`, the three weight modes, pool total and tickers
  independent of `length`, rights non-effect and embedding rendering. The recording embedder
  checks the exact text embedded, or that nothing was embedded. Where no Elasticsearch work may
  happen, a mocked client proves none did. The same tests still pass afterwards.
- **New behaviour failed first.** The explicit-branch and capability tests failed at runtime
  (ranked by `q`, ran similar-image search, no link) before the implementation.
- **Mutation checks.** Eight deliberate breaks were each caught and then reverted byte-for-byte:
  bare words not filtering, requests without `aiQuery` routed through the new classifier, the
  conflict check removed, vectors rendered on the explicit branch, vectors dropped from legacy
  responses, the link advertised without dense vectors, GET honouring `hasRightsAcquired`, and a
  pool total replaced by the returned-hit count.
- **Suite.** `TZ=UTC sbt "media-api/test"`: 767/767 across 15 suites (742 before, plus 25 new).
  The new controller suite uses its own Elasticsearch container and a real `ImageResponse`. The only
  change to existing tests is one Mockito stub gaining a matcher for the new optional argument;
  no existing assertion changed.

### 12.6 Reviewer-run checks

`TZ=UTC sbt "media-api/testOnly controllers.MediaApiAiSearchTest lib.elasticsearch.AiQueryPartsTest lib.ImageResponseTest"`,
then the full `TZ=UTC sbt "media-api/test"`. Reading the `MediaApi.scala` diff should confirm
that an absent `aiQuery` selects `params.aiQueryParts` and the default renderer.
