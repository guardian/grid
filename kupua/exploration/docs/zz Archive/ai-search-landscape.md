# AI Search Landscape — What Exists, What's In Flight, and What Kupua Can Do

_Researched 20 May 2026, updated 24 May. Based on local codebase. #4738 merged 22 May; PRs #4744, #4507, #4554, #4550, #4539 still open._

---

## 1. The Pipeline: What Has Been Built

### Ingest (image-embedder-lambda)

Every incoming image triggers the pipeline:

1. **Trigger**: Thrall publishes image events to SQS
2. **Image fetch**: Lambda reads the image from S3 (with optional pre-downscaled cached copy)
3. **Bedrock call**: Image bytes sent to AWS Bedrock, model `global.cohere.embed-v4:0`, 1536-dim float output
4. **Two write paths**:
   - **S3 Vector Store** (`image-embeddings-{stage}`, index `cohere-embed-v4`): full 1536-dim float32 vector stored with image ID as key
   - **Elasticsearch** (via Kinesis → Thrall): vector **truncated to 256 dims** using matryoshka property before writing to `embedding.cohereEmbedV4.image`
5. **Backfiller**: EventBridge-triggered Lambda that queries ES for images _without_ embeddings (using `must_not exists embedding.cohereEmbedV4.image`), enqueues them to SQS in batches of 2000. Skips if queue > 4000 items. Targets free images only.

### ES Mapping (common-lib `Mappings.scala`)

```
embedding:
  cohereEmbedEnglishV3.image  — 1024 dims, cosine, Int8HNSW, m=16, efConstruction=100  (legacy, not being written)
  cohereEmbedV4.image         — 256 dims, cosine, Int8HNSW, m=16, efConstruction=100   (active)
```

The Int8HNSW quantisation trades a little recall for ~8× storage reduction. Both fields are indexed for KNN.

### Text-Query Embedding (media-api Bedrock.scala)

When a user types a text query for AI search, media-api calls Bedrock:
- Model: `global.cohere.embed-v4:0`
- `input_type: "search_query"` (distinct from `"search_document"` used for images)
- `output_dimension: 256` (matches what's indexed in ES)
- Result is cached process-locally (Caffeine, max 500 entries, concurrent requests deduped)

---

## 2. Current Search Modes (media-api)

### A. Pure KNN (image-to-image)

Query: `useAISearch=true&q=similar:imageId`

`parseAiSearchMode` detects the `similar:` prefix. Fetches the image's stored `cohereEmbedV4.image` vector from ES, then runs:

```
knn: { field: "embedding.cohereEmbedV4.image", query_vector: [...], k: 200, num_candidates: 400 }
```

No BM25 involved. No `vecWeight`.

### B. Hybrid Search (merged, live since 22 May 2026)

Query: `useAISearch=true&q=dogs playing in snow&vecWeight=0.8`

1. Probe query: runs a `multi_match` BM25 query (BEST_FIELDS, AND operator, AUTO fuzziness) to get `maxBm25Score`. Falls back to 1.0 if no hits. **Not cached** — one extra ES round-trip per AI text search.
2. Main query: `bool { should: [multiMatchQuery(boost=lexicalBoost), knn] }`
3. `lexicalBoost = (lexicalWeight/vecWeight) * (1/maxBm25Score)` — normalises BM25 to [0,1] range so signals are comparable
4. `vecWeight` defaults to 1.0 if absent (pure KNN fallback); bounded [0.0, 1.0]. **Note:** PR description originally said 0.8 default; this was changed to 1.0 during review — meaning hybrid is opt-in via URL param, not the new default behaviour.
5. Edge cases: `vecWeight=0.0` → KNN boost zeroed, pure BM25 via the AI path. `vecWeight=1.0` → multiMatch boost approaches 0, effectively pure KNN (same behaviour as before the PR).
6. Fixed result set: `k=200`, `num_candidates=Math.max(k*2, 100)=400`, no pagination

**Key constraint**: AI search returns a fixed-size ranked list (up to 200). No offset/pagination. Kahuna short-circuits length=0 polling requests. Filter-based search params (date range, uploadedBy, etc.) are **completely ignored** — the AI search path bypasses the standard `performSearchAndRespond` branch entirely.

### C. Regular BM25 Search (unchanged)

The `matchFields` are: id, mimeType, description, title, byline, source, credit, keywords, subLocation, city, state, country, suppliersReference, peopleInImage, specialInstructions, englishAnalysedCatchAll, imageType, labels, identifiers, restrictions.

---

## 3. What Kahuna Has in UI

- **Feature switch**: `enable-ai-search` (server-injected into page, read via `getFeatureSwitchActive`)
- **Toggle checkbox** in search query bar (`useAISearch` state param), hidden unless feature switch active
- **"More Like This" button** on image detail view — generates `similar:imageId` query with `useAISearch=true`. Same feature switch gates it.
- **Placeholder text** changes to "Search for conceptual images using AI search... (no filters available)" when AI mode is active
- **Disables all filter chips** when AI mode is on (filter UI removed entirely)
- **No pagination** in AI mode: result set is loaded once, not lazy-loaded on scroll
- **Telemetry**: `useAISearch` flag sent in search telemetry events
- **Hybrid search (merged, #4738)**: `vecWeight` URL param live — users manually add `&vecWeight=0.4` to tune hybrid blend. No UI control; power-user URL param only. Default is 1.0 (pure KNN), so the user experience is unchanged unless they explicitly opt in.
- **PR #4744 (vibe-coded draft, not ready for review)**: Dual-box UI — one box for semantic concepts, one for entity/lexical terms. Eliminates the toggle entirely. If semantic box is empty → pure lexical. If lexical box is empty → pure KNN. Both filled → **pre-filtered** by lexical, ranked by KNN. Important point raised about the trade-off (pre-filter excludes images without matching metadata). Kupua decides to pre-filter for v1 — post-filter is too lossy at k=200. See `ai-search-workplan.md` §3.2.

---

## 4. What media-api Provides That Direct ES Does Not

| Capability | media-api | Direct ES |
|---|---|---|
| Text → embedding vector | ✅ (Bedrock call) | ❌ (no Bedrock access) |
| Embedding cache | ✅ (Caffeine, 500 entries) | N/A |
| Auth / tier filtering | ✅ (full Grid auth) | ❌ (must implement separately) |
| Image-level access control | ✅ | ❌ |
| `similar:imageId` pattern | ✅ | Can be replicated (embedding is in ES) |
| vecWeight hybrid blending | ✅ (merged) | Can be replicated |
| S3 Vectors query | Could be added | Could be added independently |

**Critical gap (resolved 24 May)**: Text-to-vector conversion requires Bedrock. The browser cannot call Bedrock directly, but Kupua's Vite dev server CAN — the `media-service` Janus credentials have `bedrock:InvokeModel` permission (verified). A Vite middleware proxy at `/bedrock/embed` (same pattern as the S3 proxy) gives Kupua direct access to embeddings without media-api. See `ai-search-workplan.md`.

---

## 5. What Kupua Currently Has

Kupua's `SearchParams` type already has a `useAISearch` field and it's wired into the URL schema. However:

- `buildQuery` in `es-adapter.ts` **does not handle `useAISearch` at all**. The field is declared, parsed from URL, present in the store, but silently ignored when building ES queries.
- Kupua goes direct to ES via proxy, so KNN queries are technically possible from the client.
- **Bedrock access confirmed (24 May):** The `media-service` Janus credentials have `bedrock:InvokeModel` permission. Kupua can call Bedrock from its Vite dev server (same pattern as S3 proxy). See `ai-search-workplan.md` for the design.

---

## 6. Where Kupua Can Leapfrog Kahuna

### 6.1 Image-to-Image Similarity — Direct ES, No Bedrock Needed

**This is the lowest-hanging fruit and Kupua can do it _better_ than Kahuna today.**

For `similar:imageId`, Kupua already has the source image's data in hand (it's displayed). The embedding is in ES at `embedding.cohereEmbedV4.image`. Kupua can:

1. Fetch the source image's embedding directly from ES (using `_source` filtering or a `get` request)
2. Fire a KNN query with that vector

What Kupua can add that Kahuna cannot (without a backend change):
- **Filter + KNN combined**: ES KNN supports a `filter` clause. Kupua can do "images visually similar to this one, AND uploaded in the last 6 months, AND free to use." Kahuna's AI mode throws all filters away.
- **Weighted KNN + sort**: Combine KNN relevance score with upload recency using `function_score`
- **Exclude the source image**: Add `must_not: { term: { id: sourceImageId } }`

### 6.2 Hybrid Search via media-api Proxy

Kupua already proxies through `/api` to media-api for some operations. The simplest route to text AI search:

Call `/api/images?q=dogs&useAISearch=true&vecWeight=0.7` via the existing proxy, get back a list of image IDs, then use those IDs to rehydrate the full image data from direct ES.

This gives Kupua AI text search with no new infrastructure, using the same cache and Bedrock call that Kahuna uses.

What Kupua adds on top:
- **Faceted AI results**: After getting the 200 AI-ranked IDs, run an ES aggregation query over just those IDs to show breakdowns by country, photographer, date range, etc.
- **Re-rank or re-filter within the AI result set**: media-api returns 200 results unfiltered. Kupua can then apply client-side or ES-side filters to the result IDs to implement "AI search + date filter" — something Kahuna can't do without a backend change.
- **Pagination within AI results**: AI search returns 200. Kupua's virtualiser can present these as a scrollable list with its existing UX, rather than Kahuna's "load all at once" approach.

### 6.3 Filtered KNN — The Big Gap in Kahuna

This deserves emphasis. Kahuna disables all filters in AI mode. This is a significant UX regression for power users.

ES KNN supports:
```json
{
  "knn": {
    "field": "embedding.cohereEmbedV4.image",
    "query_vector": [...],
    "k": 200,
    "num_candidates": 400,
    "filter": {
      "bool": {
        "filter": [
          { "range": { "uploadTime": { "gte": "2025-01-01" } } },
          { "term": { "uploadedBy": "joe.bloggs@guardian.co.uk" } }
        ]
      }
    }
  }
}
```

Kupua can implement this _today_ (for the image-to-image path), and via the media-api proxy call now that vecWeight/hybrid is live.

### 6.4 Semantic "Find More Like This Collection"

Kupua has a concept of pinboards/selections. A collection of N selected images represents a "semantic concept" — the average of their embeddings is a meaningful query vector. This is a well-known technique in vector search.

Steps:
1. Fetch embeddings for all N selected images from ES
2. Average the vectors (element-wise mean)
3. KNN query with the averaged vector

This would let users select 5 images that represent "moody outdoor portraits" and find the rest of the archive that matches that vibe. Kahuna has no equivalent.

### 6.5 Matryoshka Sub-Vector Experiments

Cohere Embed V4 uses matryoshka embeddings. The first _d_ dimensions are independently meaningful. Grid stores 256 dims in ES but has 1536 dims in S3 Vectors.

Within the 256 dims already in ES, Kupua could experiment with truncating further (e.g., 64 or 128 dims) for speed. The ES mapping allows any `query_vector` up to the full dims. This could be a useful performance dial at the cost of some recall.

### 6.6 Direct S3 Vectors Query (Alternative/Complement to ES)

S3 Vectors stores the full 1536-dim vectors (ES has 256). The `QueryVectors` operation could give higher recall due to more dimensions.

**Why Kupua can't call it from the browser:** Kupua does not make S3 API calls — it only accesses images via CloudFront/CDN URLs (plain HTTP GET, no credentials). S3 Vectors is a completely separate AWS service requiring SigV4-signed IAM-authenticated requests. You can't call it from browser JS without embedding AWS credentials in the client.

**Current backend state:** S3Vectors.scala's only public method is `deleteEmbeddings`. The `QueryVectorsRequest` type is imported in `Embedder.scala` but unused — dead imports. There is no query path wired to S3 Vectors anywhere in the codebase. The S3 store is currently write-only infrastructure.

**To use it:** Add a `queryVectors(embedding)` method to `S3Vectors.scala` and expose a new media-api endpoint (e.g. `/images/similar/{id}` backed by S3 Vectors). Kupua calls it via the existing `/api` proxy. That's a self-contained backend addition.

**Is 1536 dims vs 256 worth it?** Matryoshka embeddings are specifically designed so leading dimensions capture the most information — recall degrades gracefully with truncation. The practical difference may be modest, and ES already has HNSW indexing. Worth benchmarking before committing to the cross-region (`eu-central-1`) hop that S3 Vectors currently requires.

### 6.7 "Does This Image Have an Embedding?" Status

Kupua can query ES to show which images in a result set have embeddings and which don't. Useful during the backfill period to surface data quality info: "X% of your search results have AI embeddings."

Field: `embedding.cohereEmbedV4.image` — use `exists` query or inspect the image `_source`.

### 6.8 Aggregations on Semantic Search Results

After receiving AI search results (via media-api proxy or direct KNN), Kupua can use ES's `ids` filter + aggregations to compute facets over the result set. For example:
- Top photographers in the semantic result set
- Date distribution of visually similar images
- Usage rights breakdown

Kahuna's results.js does none of this for AI search results.

### 6.9 Kibana-Style Metadata Facets (PR #4507)

PR #4507 (draft) adds `GET /images/aggregations/metadata/{field}` to media-api. This returns top-N values with counts for any metadata field, filtered by a query. This is a superset of what Kupua could do directly in ES with terms aggregations, but via media-api with proper auth.

Kupua can implement this without waiting for #4507 by doing terms aggregations directly in ES, subject to the same Kupua-vs-auth trade-off. The endpoint would make it easier when Kupua moves to the Grid API adapter.

---

## 7. ES Features Worth Researching for Vector Data

### 7.1 `knn` in `bool` (the hybrid approach)
Live in media-api (merged #4738). Can be combined with must/filter/should clauses. Important: KNN inside `bool.should` is supported in ES 8.15+. The hybrid approach media-api uses is the recommended pattern. Note: elastic4s bumped to 8.19.1 as part of this change (ES cluster still 8.18).

### 7.2 `rescore` with KNN
ES supports a two-phase retrieval: retrieve candidates with a coarser query, then re-rank top K with KNN. This could allow Kupua to do "BM25 first, then re-rank by visual similarity" as an alternative to the additive hybrid approach.

### 7.3 `collapse` + KNN
Field collapsing (grouping results by a field, showing only the best match per group) combined with KNN could enable "show me the best visually similar image per photographer" — useful for deduplication in large result sets.

### 7.5 KNN `num_candidates` as a Quality Dial
Increasing `num_candidates` improves recall at the cost of latency. The current default is `max(k*2, 100)`. Kupua could expose this as a quality/speed trade-off dial.

### 7.6 `function_score` + KNN Boost
KNN score is a cosine similarity in [0, 1]. You can blend it with `function_score` decay functions (e.g., boost recency) using script scoring. This gives time-aware semantic search without changing the model.

### 7.7 Quantisation Comparison
Grid uses `int8_hnsw` quantisation. ES also supports `bbq` (better binary quantisation) which is even more compressed. Worth profiling recall vs storage trade-off if the index grows large.

### 7.8 `_explain` API
For debugging and transparency: call `_explain` on a document against a hybrid query to see exactly why it was scored the way it was. Useful for a "why did this image appear?" debug panel in Kupua.

### 7.9 Sparse Vector / ELSER
Not currently in Grid's stack but ES's own ELSER model generates sparse semantic vectors. Could complement dense Cohere vectors for certain query types. Would require a separate index field.

---

## 8. What Media-API Does NOT Currently Expose (but could)

| Missing Feature | Complexity | Value |
|---|---|---|
| Filter-aware KNN (pre-filter in knn clause) | Low (backend change) | High |
| Expose embedding field in image JSON response | Trivial | High for direct Kupua KNN |
| `vecWeight` in image-to-image similarity path | Low | Medium |
| Hybrid search for image-to-image (not just text) | Medium | High |
| S3 Vectors query endpoint | Medium | High (full 1536-dim recall) |
| Aggregations over KNN result set | Medium | High for faceted AI search |
| Multiple-image "average vector" search | Medium | High (collection-based search) |

The biggest one: **Kupua currently cannot access the stored embedding from the image JSON**. The media-api serialises images without the embedding field. To do image-to-image KNN directly in ES, Kupua needs to query ES (which it has access to) and pull `_source.embedding.cohereEmbedV4.image`. This works with current Kupua architecture since it has direct ES access.

---

## 9. Summary: Priority Opportunities for Kupua

| Opportunity | Requires | Effort | Uniqueness |
|---|---|---|---|
| Image-to-image KNN via direct ES (with filter support) | Nothing new | Low | Leapfrog — Kahuna can't filter |
| Hybrid text search via media-api proxy | media-api proxy call | Low | Matches Kahuna (live) |
| Filtered hybrid (lexical + KNN + date/uploader filter) | Backend thread-through | Medium | Significantly ahead of Kahuna |
| Collection → vector → "more like selection" | Direct ES | Medium | Nothing like this exists anywhere |
| Faceted aggregations over AI result set | Direct ES | Medium | Kahuna has no facets in AI mode |
| Re-rank BM25 results by visual similarity | Direct ES | Medium | Novel interaction pattern |
| "Coverage" indicator (% of results with embeddings) | Direct ES | Low | Quality of life |
| Embedding quality / explain debug panel | Direct ES _explain | Medium | Developer/power user feature |

The single most important thing Kupua can do that Kahuna structurally cannot: **combine AI search with the existing filter set**. Kahuna's architecture throws away the filter state when it enters AI mode. Kupua can thread filters through KNN queries natively in ES.
