# Phase 1 Handoff — Media-API Capability Inventory

## Why this audit exists

Before we add any new endpoint to media-api, we MUST know with certainty what it
already does. Today's `searchByAi` example proved the danger of skipping this:
we classified it as a missing gap, then discovered media-api has had the exact
capability (`GET /images?useAISearch=true&vecWeight=...`) all along. We almost
shipped a workplan to build something that exists.

This audit produces the **definitive, exhaustive inventory** of media-api's
current HTTP surface, so Phase 3 can join it against kupua's needs (Phase 2)
and derive the **minimal** set of true gaps.

## Mindset

- **Inventory, not critique.** No "this is badly designed" notes. No refactor
  proposals. Just: what exists, what params it accepts, what it returns.
- **Cite-or-it-didn't-happen.** Every claim needs a `file:line` citation in
  `media-api/`. Unsourced claims are forbidden.
- **Exhaustive over selective.** If a query param is parsed in the controller,
  it goes in the matrix — even if it looks irrelevant. Phase 3 decides
  relevance, not you.
- **Read-only.** No code changes. No commits. No test runs. Findings doc is
  the only deliverable.

## Push-back clause (READ THIS)

If at any point you conclude:
- The audit premise is wrong (e.g. media-api has no usable HTTP surface, or
  routes are dynamically generated, or the controller delegates everything
  to a single opaque handler such that endpoint-level inventory is meaningless), OR
- The scope as defined is impossible to bound within a single session

Write **Section 0: Premise Check** at the top of the findings doc explaining
why, and STOP. Do not produce a half-done inventory.

## Scope: in and out

### IN scope
- `media-api/conf/routes` — every route
- `media-api/app/controllers/MediaApi.scala` — every action method that the
  routes file points to
- `media-api/app/lib/elasticsearch/ElasticSearch.scala` — every public method
  the controllers call (NOT internal helpers, NOT the elastic4s DSL builders
  unless they materially shape the response)
- `media-api/app/lib/elasticsearch/SearchFilters.scala` — to understand what
  filter types are already supported server-side
- Any param-parsing helpers the controller uses (e.g. `MediaApiParameters`,
  query-string codecs)

### OUT of scope
- Authentication, permissions, panda — assume requests are authenticated
- Caching layers, metrics, logging
- Any non-image controller (UsageApi, CollectionsApi, etc.) unless the routes
  file shows them serving image-search-adjacent data kupua needs
- Internal ES query construction details (we care about the API surface, not
  the elastic4s DSL)
- Performance characteristics
- Comparison to kupua — Phase 3 does that

## Deliverable shape

Write to: `kupua/exploration/docs/03 Ce n'est pas une pipe dream/phase-1-media-api-capability-inventory-findings.md`

### Section structure (mandatory)

**Section 0 — Premise check (only if needed; otherwise omit)**

**Section 1 — Routes table**
Every route in `conf/routes` as a row:

| Method | Path | Controller action | Notes |
|--------|------|-------------------|-------|

Include even health/admin routes — mark them as such in Notes. Skip nothing.

**Section 2 — Endpoint detail (one subsection per image-relevant endpoint)**

For each endpoint, a fixed template:

```
### GET /images (or whatever)

**Action:** `MediaApi.imageSearch` at `media-api/app/controllers/MediaApi.scala:NNN`

**Query parameters accepted:**
| Name | Type | Default | Purpose (one line) | Parsed at |
|------|------|---------|--------------------|-----------|

**Request body:** (if any) — shape and validation

**Response shape:** Top-level fields, with nested types where non-obvious.
Cite the case class / writer definition.

**Pagination model:** offset / search_after / PIT / none. Cite where applied.

**Aggregations returned:** Always-on aggregations (list them) and
conditional aggregations (and what triggers them). Cite the agg-builder.

**Filter capabilities:** What CQL operators / `is:` filters / field filters
the underlying ES query supports for this endpoint. Cite the filter-builder
or query-builder method.

**Special modes:** Any boolean params that materially change behaviour
(e.g. `useAISearch`, `countAll`). One line each.

**Embeddings/AI:** If this endpoint touches embeddings/Bedrock, document
the flow (request → embedding source → ES query type → response).
```

**Section 3 — Shared parameter vocabulary**

Many endpoints share parsing helpers. Document:
- `SearchParams` (or equivalent) case class — every field
- CQL parsing entry point — what operators are supported
- `is:` filter registry — list every supported `is:` token and what it resolves to

Cite each.

**Section 4 — Aggregations catalogue**

Media-api builds aggregations centrally. List every aggregation it can return:

| Name | Type (terms/date_histogram/filter/etc.) | Field | Returned when | Cite |
|------|-----------------------------------------|-------|---------------|------|

Include ticker aggregations explicitly.

**Section 5 — KNN / vector search**

Specific subsection because this is high-risk for false gaps:
- KNN field(s) used, dimensions, model
- `knnSearch()` vs `hybridSearch()` — signatures, params (especially blend
  weights), what each returns
- Image-to-image (`similar:<id>`) path — how the stored embedding is fetched
- Embedding source (server-side Bedrock call) — cite the `Embedder` class

**Section 6 — Capability gaps within media-api itself**

Things the controller layer exposes only partially, or that exist in
`ElasticSearch.scala` but are not wired to any route. These are NOT kupua
gaps; they're internal "almost-exposed" capabilities that Phase 3 might
unlock with trivial wiring rather than new logic. Cite each.

**Section 7 — Anti-goals appendix (capped, ≤30 items, one line each)**

Out-of-scope observations you couldn't resist noting: code-quality issues,
suspected bugs, refactor opportunities. Strict cap. Phase 3 will ignore
this section.

## File-tier prioritisation

**Tier 1 (must read in full):**
- `media-api/conf/routes`
- `media-api/app/controllers/MediaApi.scala`
- `media-api/app/lib/elasticsearch/ElasticSearch.scala`

**Tier 2 (read targeted sections):**
- `media-api/app/lib/elasticsearch/SearchFilters.scala`
- `media-api/app/lib/elasticsearch/QueryBuilder.scala` (if exists)
- `media-api/app/lib/querysyntax/` — the CQL parser
- `media-api/app/lib/MediaApiConfig.scala` — for ticker definitions, etc.

**Tier 3 (only if relevant; declare in gaps section if skipped):**
- Response writers / JSON serialisers — only if the response shape is
  unclear from the case class

If you run out of budget, **declare which Tier 2/3 files you skipped** in
a "Coverage gaps" subsection at the end of Section 1. Do not silently omit.

## Volume expectations (falsifiability)

- Section 1: 20–60 routes total in the routes file
- Section 2: 5–15 image-relevant endpoints worth detailed treatment
- Section 3: ~20–40 distinct `SearchParams` fields; ~5–15 `is:` filters
- Section 4: 5–20 aggregations
- Section 5: 2 KNN methods, 1–2 endpoints invoking them

If your counts are wildly outside these bounds (e.g. 3 routes total, or 200
agg types), that is a signal to stop and write Section 0.

## What "done" looks like

Before declaring complete, self-check:
- [ ] Every route in `conf/routes` appears in Section 1
- [ ] Every image-related endpoint has the full template filled in Section 2
- [ ] Every query param is cited to its parsing location
- [ ] Every aggregation in Section 4 has a file:line
- [ ] No "TODO" / "I think" / "probably" left in the doc
- [ ] No fix proposals, no critiques outside Section 7
- [ ] Coverage gaps explicitly declared if any
- [ ] You have NOT written any code, run any tests, or modified any file
      outside the findings doc

## Out-of-band notes

- Use `read_file` with large ranges (read whole files where small enough).
  Parallelise reads.
- For elastic4s DSL: you don't need to understand elastic4s syntax deeply;
  what matters is which ES feature each method invokes (terms, match,
  bool, knn, etc.) and what params it accepts.
- If you find yourself reading `kupua/` files: STOP. This audit is
  media-api-only.
- Model recommendation: Sonnet High. Audit + synthesis work.
