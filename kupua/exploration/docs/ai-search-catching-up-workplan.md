# AI Search — Catching Up With Main (Workplan)

> **Status:** Plan. No code written yet. Awaiting execution.
> **Audience:** Executing agents (Sonnet). Written by Opus after a read-only
> analysis of kupua's AI client code and media-api `main` (2026-07-25).
> **Companion / background:** [`00 Architecture and philosophy/08-ai-search.md`](00 Architecture and philosophy/08-ai-search.md)
> (kupua's current AI design — note the staleness corrections in §10 below),
> and the media-api migration plan
> [`03 Ce n'est pas une pipe dream/media-api-work/phase-3-minimal-gap-derivation-findings.md`](03 Ce n'est pas une pipe dream/media-api-work/phase-3-minimal-gap-derivation-findings.md).

---

## §1 The one thing to understand first (the reframing)

Kupua added AI search early, while media-api's AI search was still in flux.
Media-api has since **converged** on a materially better design, and both
features we want are **already built, tested, and in production on `main`**:

- **Hybrid text search (two parallel requests + client-side score fusion)** —
  [`fusedLexicalAndSemanticSearch`](../../../media-api/app/lib/elasticsearch/ElasticSearch.scala)
  + [`HybridResult.scala`](../../../media-api/app/lib/elasticsearch/HybridResult.scala).
  Runs lexical + semantic in parallel, fills each hit's missing cosine score
  client-side (`VectorUtils`), min-max normalises (arxiv 2210.11934),
  `fuseAndRank`s. Default `vecWeight` **0.85**.
- **More Like This (image-to-image KNN)** —
  [`semanticSearchByImage`](../../../media-api/app/controllers/MediaApi.scala):
  `getImageById` → pull `embedding.cohereEmbedV4.image` → pure KNN. Triggered by
  a `similar:<imageId>` chip in `q`. **No Bedrock needed.**

Both reach a client through **one existing endpoint**:
`GET /images?useAISearch=true&q=…&vecWeight=…`.

**Therefore: DO NOT port `HybridResult`/`semanticSearchByImage` into kupua's ES
adapter.** That would be substantial new direct-to-ES code we are actively
migrating away from (see the migration plan). Instead, **route kupua's AI search
through media-api's existing endpoint.** Hybrid and MLT then arrive for free —
zero new Scala, zero throwaway TypeScript.

This also means the whole workplan is **independent of media-api gap-closure
ordering** (D3 search-after, PIT, aggregations, etc.). AI search uses a
different, already-shipped endpoint. It works whether gap closure lands before
or after this work.

---

## §2 Current state (both sides)

### Kupua client (today)
- [`src/dal/strangler-adapter.ts`](../../src/dal/strangler-adapter.ts) routes
  **only** `searchAfter` to media-api (`POST /images/search-after`). Everything
  else — **including `searchByAi`** — binds to the direct-ES adapter.
- [`src/dal/es-adapter.ts`](../../src/dal/es-adapter.ts) `searchByAi` (line ~1132):
  Bedrock embedding via [`bedrock-proxy-client.ts`](../../src/lib/bedrock-proxy-client.ts),
  then a **single-request** probe-hybrid KNN directly against ES. Attaches
  `__aiScore`. This is the diverged, older algorithm.
- [`src/stores/search-store.ts`](../../src/stores/search-store.ts) AI branch
  (line ~1840): engages when `!!params.aiQuery`; sets `total = hits.length`
  (the invariant that suppresses pagination/PIT/position-map); calls
  `decorateParamsForAggregations` + `countWithTickers` to scope tickers to the
  ≤200 result IDs; `resortAiBuffer` (line ~3649) re-sorts in memory by `__aiScore`.
- [`src/lib/ai-search-params.ts`](../../src/lib/ai-search-params.ts): the
  aggregation **decorator** (scopes tickers/counts by `ids=`).
- URL model: `aiQuery` (separate widget param), `query` (CQL), `vecWeight`,
  `useAISearch` all exist in
  [`src/lib/search-params-schema.ts`](../../src/lib/search-params-schema.ts).

### Media-api `main` (today)
- `GET /images?useAISearch=true` → [`performAiSearchAndRespond`](../../../media-api/app/controllers/MediaApi.scala).
- Parses the single `q=` string into
  [`AiQueryParts`](../../../media-api/app/lib/elasticsearch/ElasticSearchModel.scala):
  bare words → `semanticQuery` (ranking); `similar:<id>` → `similarImageId`
  (ranking); **everything else → `filterConditions` (pre-filter)**.
- `buildAiFilter` composes chip filters **and** request filters (date/cost/
  validity) into the KNN pre-filter. **Filters ARE applied** (see §10 — the
  migration doc's "filters ignored" note is stale).
- Returns `total` = **full filtered pool** ("Best k of N"), `hits` = `k`
  (`k = min(length, aiSearchResultLimit=200)`), plus `extraCounts` (tickers) and
  `filterPoolCounts`, all computed over the whole pool via
  [`countMatchingFilterWithExtraCounts`](../../../media-api/app/lib/elasticsearch/ElasticSearch.scala) —
  in parallel with the ranking search. **No pagination, no cursor.**
- Three response shapes to handle:
  - **Ranked** (`Right(parts)`): normal hits + total(pool) + extraCounts.
  - **`NoRankingSignal`**: filters but no ranking → empty hits + pool count
    (server prompts "add a query"). *Kupua avoids triggering this — see §5.*
  - **`ConflictingRankingSignals`**: `similar:` + text together → **422**.

---

## §3 Plan shape

Three slices, executed in order. Each is independently shippable and testable.

| Slice | What | Depends on | Bedrock? |
|---|---|---|---|
| **1 — MLT via media-api** | `similar:<id>` chip → `GET /images?useAISearch=true`. Kahuna-compatible. | StranglerAdapter (exists), endpoint (exists) | **No** |
| **2 — Text hybrid via media-api** | route `aiQuery` text through the same endpoint; get two-request fusion for free | Slice 1 plumbing | Yes (embedding) |
| **3 — Free-text pre-filter gap** | decision + (maybe) a media-api enhancement so free text can pre-filter *and* AI-rank simultaneously | Slice 2 | — |

**Why MLT first:** it needs no Bedrock (higher availability), and — crucially —
its ranking signal (`similar:` chip) lives *inside* `q`, so there is **no
separate AI text to reconcile against the filter query**. Slice 1 therefore
sidesteps the entire §3-slice-3 gap. Text hybrid (Slice 2) is where the
ranking-vs-filter ambiguity first bites.

---

## §4 Slice 1 — More Like This via media-api

**Goal:** clicking "more like this" on an image runs an image-KNN search via
media-api, Kahuna-URL-compatible, no Bedrock.

### 4.1 URL / chip model (Kahuna-compatible)
- MLT is represented as a **`similar:<imageId>` CQL chip inside `query`**, plus
  `useAISearch=true` — matching Kahuna
  ([`gr-more-like-this.html`](../../../kahuna/public/js/components/gr-more-like-this/gr-more-like-this.html):
  `query: similar:<id>, useAISearch: true`). A Kahuna MLT link must open in kupua.
- This is a deliberate exception to §5 of `08-ai-search.md` ("AI is not a CQL
  chip"). That rule was about the **typed** AI query (cursor placement,
  composition mode, live editing). A `similar:` chip is **atomic and never
  edited** — you click to get it, you remove it. None of the §5 objections apply.
- Result: text AI stays a kupua param (`aiQuery`); image AI is a Kahuna-compatible
  chip. This asymmetry (typed=param, atomic=chip) is intentional and consistent.

### 4.2 Steps

1. **Verify the CQL grammar exposes `similar:`.** Check kupua's CQL editor/parser
   (the `cql` lib used by [`SearchBar.tsx`](../../src/components/SearchBar.tsx))
   recognises `similar:<value>` as a chip field. It should, via shared common-lib
   (media-api's `SimilarField` implies the grammar knows it). If not, add it as a
   recognised field. *No free-text-in-chip editing is required — it is set
   programmatically.*

2. **AI-engage detection.** In
   [`search-store.ts`](../../src/stores/search-store.ts) the AI branch currently
   triggers on `!!params.aiQuery` (line ~1845). Extend to
   `!!params.aiQuery || hasSimilarChip(params.query)`. Add a small
   `hasSimilarChip(query)` helper (targeted parse of the CQL string / reuse the
   CQL parser). **Guard the conflict:** if both an `aiQuery` text and a `similar:`
   chip are present, block client-side (disable/clear one) — the server returns
   422 `ConflictingRankingSignals`.

3. **`searchByAi` override in the strangler.** In
   [`strangler-adapter.ts`](../../src/dal/strangler-adapter.ts), stop binding
   `searchByAi` from the ES adapter when in media-api mode; instead assign a new
   `apiSearchByAi` (see step 4). (Standalone/direct-ES behaviour is the deferred
   decision in §7 — for now, keep the ES `searchByAi` as the fallback when
   `VITE_USE_MEDIA_API` is false.)

4. **New client: `apiSearchByAi`** in
   [`grid-api-search-adapter.ts`](../../src/dal/grid-api-search-adapter.ts),
   mirroring `apiSearchAfter`:
   - Build `q` = `params.query` (which already contains the `similar:<id>` chip)
     **plus** the two default-hide clauses (`-is:deleted`,
     `-usages@status:replaced`) exactly as `apiSearchAfter` does.
   - Call `GET /api/images?useAISearch=true&q=<q>&length=<k>` with the standard
     filter params (date range, uploadedBy, syndicationStatus, free/nonFree,
     hasRightsAcquired, hasExports) as query-string params. **GET passes the
     `/api` write-guard unchanged** (confirmed in
     [`vite.config.ts`](../../vite.config.ts) — only non-GET is gated).
   - `vecWeight`: omit for MLT (pure image KNN; server ignores it for
     `similar:`).
   - Map the Argo response with the **same** `mapApiImageToImage` +
     `extractEnrichment` helpers already in that file (the AI endpoint uses the
     same `hitToImageEntity` shape).
   - Return a `SearchAfterResult` with `hits` = the `k` results, and:
     - `total` — **see §6 (the "k of N" invariant).** For Slice 1, use the
       **adapter-clamp**: return `total = hits.length` and stash the pool `N`
       separately (new optional field, e.g. `aiPoolTotal`).
     - `tickerCounts` — read from the response `extraCounts` (already
       pool-scoped). Surface them on the result so the store can use them
       **directly**, skipping the decorator/`countWithTickers` round-trip (§6.2).
     - `sortValues` — synthetic, as today (never fed back to ES; safe under the
       `total === hits.length` clamp).

5. **Store: consume server tickers, skip the decorator in media-api mode.** In
   the AI branch (line ~1913), when the AI result already carries
   `tickerCounts` (media-api path), set them directly and **do not** call
   `decorateParamsForAggregations` + `countWithTickers`. Keep the decorator path
   only for the direct-ES fallback. (This is the first concrete retirement of the
   decorator concern — see §6.2 and §8.)

6. **MLT UI affordance.** Add a "more like this" control on the image detail
   view ([`ImageDetail.tsx`](../../src/components/ImageDetail.tsx)) — and
   optionally a hover action on the grid tile — that navigates to
   `query = "<existing filters> similar:<id>"`, `useAISearch = true`, clearing any
   `aiQuery` text (conflict guard, step 2). Gate visibility on media-api mode
   (MLT does not exist in standalone/direct-ES — §7).

### 4.3 Slice 1 acceptance
- Clicking MLT on an image shows visually-similar images, ranked.
- Existing CQL chips + date/cost filters narrow the MLT pool (server pre-filter).
- A Kahuna URL `?query=similar:<id>&useAISearch=true` opens and works in kupua.
- "Best k of N matches" shows `N` = pool (from `aiPoolTotal`), `k` = hits.
- Tickers reflect the pool (server `extraCounts`) — no client decorator call.
- No pagination/PIT/position-map is triggered (invariant preserved via clamp).

---

## §5 The empty-page UX — preserved, for free

We keep kupua's UX (and reject Kahuna's "stare at an empty page"):

- **AI widget open, no text, no `similar:`** → kupua does **not** engage AI; it
  runs a normal search. Images stay on screen.
- **Add a CQL filter, still no AI ranking signal** → normal filtered search.
  Images stay on screen.
- Kupua only calls `useAISearch=true` when there **is** a ranking signal
  (`aiQuery` text or a `similar:` chip). Consequently the server's
  `NoRankingSignal` branch (the source of Kahuna's empty page) is **unreachable
  from kupua by construction.** Nothing to implement — it falls out of the
  "engage AI only with a ranking signal" rule already in §4.2 step 2.

---

## §6 The "k of N" invariant (the real integration work)

Media-api returns `total = pool (N)` but `hits = k` with **no pagination**.
Kupua's store gates scroll-tier / extend-seek / position-map / new-images-poll on
the invariant **`total === hits.length`**. The server response **breaks that
invariant directly** (N ≫ k). Two ways to handle it:

- **(i) Adapter-clamp (Slice 1 default).** The adapter reports
  `total = hits.length` to the store (invariant untouched, **zero store
  pagination changes**) and stashes the pool `N` on a separate field
  (`aiPoolTotal`) for the "Best k of N" label. Smallest possible first step.
- **(ii) Minimal `isComplete` / id-set flag (promote when justified).** Introduce
  an explicit "this result set is complete, do not paginate" signal on the
  result; the store gates on **that** instead of `total === hits.length`, and
  `total` can carry the true pool `N`. Cleaner, but only worth it once a **second
  caller** (text hybrid, Slice 2) shares the need.

**Recommendation:** ship Slice 1 with **(i)**. Promote to **(ii)** in Slice 2
when text hybrid arrives and a second call site justifies the abstraction. This
keeps "does the flag earn its place?" honest.

### 6.2 What this means for the decorator and SearchContext
- The aggregation **decorator** ([`ai-search-params.ts`](../../src/lib/ai-search-params.ts))
  exists to re-query ES with `ids=` to scope tickers to the ≤200 hits. In
  media-api mode the server returns `extraCounts` over the full pool **in the AI
  response** — so the decorator's whole job evaporates. Slice 1 stops calling it
  in the media-api path (§4.2 step 5). It stays only for the direct-ES fallback.
- The **full `SearchContext` refactor** documented in
  [`zz Archive/ai-searchContext-future-abstraction.md`](zz Archive/ai-searchContext-future-abstraction.md)
  is **not** built. Its two justifications split under migration: (a) the
  aggregation-scoping half is retired by migration itself (above); (b) the
  synthetic-`sortValues` / non-paginatable-set half is covered by the far smaller
  **(ii)** flag. The archived doc gets a one-line "superseded by media-api
  migration; see this workplan" note — no more (it is already in Archive).

---

## §7 Slice 2 — Text hybrid via media-api

**Goal:** `aiQuery` text runs the two-request hybrid on the server (default
`vecWeight` 0.85), replacing kupua's diverged single-request probe hybrid.

### 7.1 Steps
1. Extend `apiSearchByAi` to send the AI text. **This is where the
   ranking-vs-filter ambiguity appears** — see §8 for the exact `q` construction
   and its trade-off. MVP: fold `aiQuery` text into `q` as the ranking query
   (documented degradation for free-text pre-filter — §8).
2. Thread `vecWeight` through (`params.vecWeight ?? 0.85` — note the default
   changes from kupua's current 1.0 to match `main`).
3. **Promote the invariant handling to (ii)** (§6): introduce the `isComplete`
   flag now that text hybrid is a second caller.
4. `resortAiBuffer` (store line ~3649) currently sorts by `__aiScore`. Server
   hybrid results are pre-ranked; decide whether kupua still needs client-side
   relevance re-sort (it does, for the sort dropdown's "Relevance" option, but
   the score now comes from the server — carry a server-provided score onto the
   hit instead of the ES `_score`).
5. Consider retiring / dev-gating the Bedrock proxy + ES `searchByAi` per §7-below
   standalone decision.

### 7.2 Acceptance
- `aiQuery` text returns server-side two-request hybrid results.
- Sort dropdown "Relevance" re-sorts in memory correctly.
- Filters (chips, date, cost) narrow the pool (server pre-filter).
- `vecWeight` URL override still works (default 0.85).

---

## §8 Slice 3 — Free-text pre-filtering (the gap) — DECISION REQUIRED

### 8.1 The problem, precisely
Kupua **today** (direct-ES) lets free text in the CQL box act as a **pre-filter**
on the AI pool (a BM25 `must`), *distinct* from the AI ranking query — this is
one of kupua's UX advantages over Kahuna. But media-api's `AiQueryParts` splits
ranking-vs-filter by **syntax**: bare words in `q` are **always** the ranking
query; there is no channel for "free text that filters but does not rank." So
routing via media-api **regresses** this capability: free text in the CQL box,
while AI is active, would fold into the ranking query (semantics shift: hard
narrow → soft influence) or be dropped.

Note: this primarily affects **text hybrid** (Slice 2). MLT (Slice 1) is
unaffected *as long as* `q` carries only the `similar:` chip + structured chips.
But the same parser rule bites a plausible user action: bare text alongside a
`similar:` chip is read as a *second ranking signal* and rejected with a **422**.
This is not hypothetical — it reproduces live today:

```
?query=similar:b3c0d0e870259fdc09bae48ef40d6082011f40d8 maori&nonFree=true&useAISearch=true
→ 422 Unprocessable Entity (ConflictingRankingSignals)
```

The server's own message is "the two *rankings* can't be merged" — it is
treating `maori` as a competing ranking, not as a filter. See §8.4 for why
Solution B dissolves this. For the MLT slice meanwhile, keep `q` to `similar:` +
structured chips only; do not pass bare free text alongside a `similar:` chip.

### 8.2 Two solutions — document BOTH in the eventual PR discussion

**Solution A — `text:` filter chip (zero PROD impact).**
Add a CQL field (e.g. `text:"wildlife"`) that `AiQueryParts` routes to
`filterConditions` as a `multi_match`, instead of `semanticQuery`.
- **Pros:** additive; Kahuna never emits it → zero prod behaviour change; ships
  unilaterally.
- **Cons:** inconsistent UX — the *same* text is sometimes a chip, sometimes not;
  the chip has no natural UI affordance; two ways to type text.

**Solution B — separate `aiQuery=` ranking param (PROD-affecting, backward-compatible) — RECOMMENDED if the team agrees.**
Move the ranking signal out of `q` into its own param. One generalised rule does it:
> **When a ranking signal is explicitly designated — an `aiQuery=` param OR a
> `similar:` chip — bare text in `q` is a filter (BM25 must). Only in the legacy
> case (no `aiQuery`, no `similar:` chip) is bare text in `q` treated as the
> ranking query, preserving today's behaviour.**
- `aiQuery=<text>` → semantic ranking. `q` reverts to its normal meaning: the
  full query (chips **and** free text) = the pre-filter pool.
- `similar:<id>` stays a chip in `q` (Kahuna-compatible). Ranking =
  `aiQuery` text **XOR** `similar:` chip; everything else — **including bare
  text** — filters. (This is the clause that dissolves the 422; see §8.4.)
- **Naming:** `aiQuery` — it is exactly kupua's existing URL param, so kupua and
  media-api **converge** on one model (no adapter translation).
- **This also fixes Kahuna's empty-page problem** — *if* Kahuna adopts it.
- **This also retires two currently-degenerate states** — see §8.4.

#### 8.3 Solution B — explicit PROD-impact ledger (take this to the team)

| Change | Required to **not break** Kahuna? | Required for Kahuna to **gain** the empty-page fix? |
|---|---|---|
| media-api: parse `aiQuery`; when present, treat `q` bare text as filter; thread into hybrid/similar | **No** — additive, guarded by param presence; legacy `q`-only path retained verbatim | — |
| Kahuna front-end: send filter text in `q` + ranking text in `aiQuery` | **No** (legacy path keeps working) | **Yes** — a Kahuna **JS** change (not an ES/contract change) |

**The honest pitch:** one additive, backward-compatible media-api param unlocks
kupua's free-text pre-filtering **and** offers Kahuna a route out of the
empty-page UX — but Kahuna only *benefits* if it also updates its front-end to
split the two inputs. Nothing here forces a change on Kahuna; the legacy contract
is preserved. Since PROD only just built AI search, the team may welcome this.

**Recommendation:** pursue **B** if the team agrees (cleaner, convergent,
unlocks a Kahuna win); keep **A** as the fallback kupua can ship unilaterally.
**Do not build either speculatively** — free-text-pre-filter-while-AI-active is
likely a rare interaction. Slice 2 ships with the documented fold-into-ranking
degradation; this slice is a separate decision on its own merits.

### 8.4 Robustness bonus: Solution B retires two degenerate states

Beyond the free-text-pre-filter feature, the generalised reclassification rule
(§8.2/B) turns two currently-broken interactions into predictable, useful ones.
Both are reachable by a plausible user action — adding text while a `similar:`
chip is active:

| State | Today | Under Solution B |
|---|---|---|
| `similar:` + text, **AI ON** | **422** `ConflictingRankingSignals` (server treats text as a second *ranking*) | Text reclassified as **filter** → image-similarity results, narrowed by text. No conflict — nothing to "merge". |
| `similar:` + text, **AI OFF** | Silent **zero results** (`similar:` is an unrecognised field in normal search, matches nothing) | The self-identifying `similar:` chip (§8.5) engages image-KNN regardless of the flag → sensible results. |

Live repro of the first row (2026-07-25):
`?query=similar:b3c0…40d8 maori&nonFree=true&useAISearch=true` → **422**.

**Why it dissolves rather than gets "handled":** the 422 exists because bare text
is the *only* channel for text ranking today, so text-next-to-`similar:` looks
like two rankings. Give ranking explicit homes and bare text is freed to always
mean filter — the premise behind the error is gone, so the error ceases to exist.

**Honest caveat for the team pitch:** the 422 today is *intentional* (a
deliberate, message-bearing rejection), not a bug — the visible "bomb" is the
client mishandling the 422, which a client could fix on its own. So frame this as
**"B converts two deliberately-degenerate states into predictable behaviour,"**
not as bug-fixing. The combo (image-similarity + text pre-filter) is niche, but
"produces sensible results" beats "422 / silent zero." This is a
**robustness/predictability** argument about the shared product — arguably
stronger than the free-text-pre-filter feature argument, and independent of it.

### 8.5 Downstream of Solution B: `useAISearch` becomes retirable (future)

`useAISearch=true` exists **only** to disambiguate one thing: bare text in `q`
could mean a *normal* BM25 search OR a *semantic* search. That ambiguity is the
flag's entire job. Solution B removes it structurally:

- With `aiQuery=<text>`, `q=tigers` is unambiguously a normal search and
  `aiQuery=tigers` is unambiguously AI. The server can **infer** AI-text mode
  from `aiQuery` presence.
- A `similar:<id>` chip is already self-describing (it is meaningless in normal
  search). The server can infer image-KNN mode from the chip alone. This also
  reinforces the framing that **MLT is a divorced feature**, not a sub-mode of
  "AI search" — it has no text, no Bedrock, and self-identifies.

So post-Solution-B, `useAISearch` is **derivable** as
`!!aiQuery || hasSimilarChip(q)` and could be retired. Two caveats:

1. **kupua doesn't need it even now.** kupua already infers engagement
   client-side (§4.2 step 2) and sends `useAISearch=true` purely to satisfy the
   *current* server contract. The moment the server infers, kupua just stops
   sending it — no kupua-side cost.
2. **Full retirement is coupled to Kahuna, via one residual job.** The flag's
   *only* irreducible remaining function (post-B) is expressing "AI mode active,
   **no** ranking signal yet" — which is precisely Kahuna's empty-page state
   (`NoRankingSignal`). Kupua explicitly rejects that state (§5). So the flag can
   be fully retired only once Kahuna abandons the empty-page mode — the **same**
   Kahuna-JS coupling as Solution B's optional upgrade (§8.3). Kill the empty
   page, and `useAISearch` has no job left.

**Verdict:** a clean-up, not a capability; strictly downstream of Solution B; not
scheduled. Recorded here so it isn't re-discovered later.

---

## §9 What we explicitly do NOT do

- **Do not** port `HybridResult` / `fusedLexicalAndSemanticSearch` /
  `semanticSearchByImage` into kupua's ES adapter (§1).
- **Do not** expand the direct-ES `searchByAi` (no adding two-request hybrid or
  image-KNN to [`es-adapter.ts`](../../src/dal/es-adapter.ts)).
- **Do not** build the full `SearchContext` abstraction (§6.2).
- **Do not** change Kahuna's AI behaviour or the media-api legacy `q`-only AI
  contract (§8 Solution B is strictly additive).
- **Do not** block hybrid+MLT on the free-text-pre-filter gap (§8).

---

## §10 Doc-staleness corrections (verified against `main`, 2026-07-25)

Do not trust these older docs on these points:
1. **`08-ai-search.md` §3.1** describes media-api's hybrid as a "max-score probe"
   (PR #4738). **Stale.** `main` is the **two-request parallel fusion** with
   client-side cosine fill-in (`HybridResult`, arxiv 2210.11934), default
   `vecWeight` **0.85**. Its advice to "align kupua's TS with the probe approach"
   is now wrong: don't align in TS — use the server.
2. **The migration findings doc** (and Phase 1 §6.1) say `useAISearch=true`
   **ignores filters**. **Stale.** `main`'s `buildAiFilter` composes chip filters
   **and** request filters into the KNN pre-filter. Filters are applied.
3. **`08-ai-search.md`'s `total === hits.length`** description reflects kupua's
   *direct-ES* implementation. Via media-api, `total` = **pool (N)** — see §6.

Action for the executor: after Slice 1, add a short "superseded by
`ai-search-catching-up-workplan.md`" banner to `08-ai-search.md` §3.1 and to the
archived `ai-searchContext-future-abstraction.md`. Do not rewrite them.

---

## §11 Testing

- **Unit:** adapter mapping (`apiSearchByAi` → hits/total-clamp/tickers), conflict
  guard, `hasSimilarChip`, invariant clamp/flag. `npm --prefix kupua test`.
- **e2e note:** MLT-via-media-api is **media-api-mode only** by construction
  (we don't expand direct-ES). Playwright e2e runs standalone per the AGENTS
  directive, so full MLT e2e needs either a **mocked** `apiSearchByAi` in the DAL
  or a media-api-mode run (`--use-media-api`, gated, manual). Prefer a mock-level
  test for CI; keep a manual media-api-mode smoke for real verification.
- **Perf flag:** the AI `GET` path uses the **heavy Argo envelope**
  (`imageResponse.create`), not D3's lean projection. Bounded for ≤200 hits, but
  worth a perceived-perf check after Slice 2. See §11.1 for the AI-specific
  detail.

### 11.1 AI-specific perf notes (for Slice 2 + the team pitch)

> Context and measurements:
> [`phase-3-d3-searchafter-perf-deep-dive.md`](03 Ce n'est pas une pipe dream/media-api-work/phase-3-d3-searchafter-perf-deep-dive.md).
> (Perf levers are currently scattered across that doc, the perf-review, and here
> — acknowledged; consolidate later.)

**AI is the heaviest server path in Grid, for two compounding reasons:**
1. **2× the hits.** `fusedLexicalAndSemanticSearch` fires two ES requests
   (lexical k=200 + semantic k=200) → up to **400 hits** fetched before fusion
   trims to k.
2. **Vectors on the wire.** Both sides run `resolveHitAndFillInSemanticScore`,
   which reads each hit's `embedding.cohereEmbedV4.image` (256 floats, ~4–5 KB/hit
   as JSON) to compute client-side cosine. So the AI path **must include the
   embedding in `_source`** — the one field D3's lean projection deliberately
   drops (`searchAfterDropFields = Set("embedding", …)`,
   [`ElasticSearch.scala`](../../../media-api/app/lib/elasticsearch/ElasticSearch.scala) ~596).

> **Not a conflict — separate code paths.** The AI requests
> (`semanticRequest`/`lexicalRequest`, ~202/225) apply **no** source projection
> and fetch full `_source` (embeddings included); only the unrelated `searchAfter`
> method applies `searchAfterDropFields`. D3's drop therefore **cannot** affect AI.
> The AI embedding concern is the *opposite* one — over-inclusion in the
> **browser** response (Consequence B), fixed at the render layer, not the fetch
> layer. Do **not** make D3's projection request-configurable to "add embeddings
> back": that would reintroduce the B1 ES-shape-leak and defeat the payload win,
> and no client needs vectors anyway.

**Consequence A — ES-client gzip (PR #4784) favours AI most.** Because the
media-api↔ES leg for AI is the fattest, most vector-laden transfer anywhere
(~4–5 MB uncompressed; vectors gzip ~5–6×), the efficiency win (bandwidth/heap/GC)
is largest here — consistent with the reviewer's own note on #4784. The **prod
latency** win is still likely small (the intra-VPC link is fast), but AI is the
one query shape whose payload might poke *above* the noise floor that swallowed
the normal-search delta in the deep-dive's Arena B. Plausible, **unproven** — a
targeted Arena-B run with an AI query shape would settle it. Not a blocker; a
data point for the team.

**Consequence B — candidate improvement: strip embeddings from the AI
*browser* response.** The vectors are needed **server-side for fusion** but are
useless to any client, yet `imageResponse.create` serialises them
(`"embedding" -> writes(image.embedding)`,
[`ImageResponse.scala`](../../../media-api/app/lib/ImageResponse.scala) ~353). So
the AI response ships ~200 × ~4–5 KB of dead vectors to the browser — and once
kupua routes AI via media-api, kupua downloads them too. Fix: drop `embedding` at
the **response-render** layer for the AI path (keep it server-side for fusion) —
the AI analogue of D3's fetch-level drop, applied at render instead. **Shared win
(Kahuna + kupua), verify then propose.** Higher-value and more targeted than the
gzip lever.

**Consequence C — the envelope lever applies to AI too.** AI still runs
`imageResponse.create` ×k, so the shared **lean `create()` transform-chain
single-pass** fix (deep-dive F5, ~30–40 ms/page, benefits all bulk callers) helps
AI as much as browse. Nothing AI-specific to do here beyond noting it stacks with
Consequence B.

---

## §12 Open decisions / checkpoints (for the human)

1. **Standalone/dev AI story** *(deferred, laid out both ways).* When AI routes
   via media-api, does AI in standalone/dev (Setup C, Playwright, local
   no-media-api) (a) **disappear** — retire the Bedrock proxy + ES `searchByAi`
   (graceful-absence, cleanest, least code), or (b) **keep the existing
   single-request direct-ES hybrid as a dev-only fallback** (do not expand it)?
   Decide before Slice 2 finishes.
2. **Invariant handling promotion (i)→(ii).** Confirm the promotion to the
   `isComplete` flag happens in Slice 2 (§6).
3. **Tickers scope** *(deferred).* Via media-api the default is **pool-scoped**
   tickers (Kahuna's model, free). Kupua's current is 200-scoped. Keep the
   free pool-scoped default, or recompute client-side to preserve 200-scoped?
   Decide after main functionality is built.
4. **Free-text pre-filter (§8).** Choose Solution A (unilateral) vs B
   (recommended, needs team buy-in for the additive param; needs Kahuna JS change
   only if Kahuna wants the empty-page fix). Separate decision, non-blocking.
5. **Pre-flight safety check.** Before starting: confirm no in-flight AI PR
   against `ElasticSearch.scala` / `MediaApi.scala` / `HybridResult.scala` on
   `main` (divergence-from-main is what bit us last time). `main` currently looks
   converged and tested.

---

## §13 File map

| File | Role in this work |
|---|---|
| [`src/dal/strangler-adapter.ts`](../../src/dal/strangler-adapter.ts) | Add `searchByAi` override → `apiSearchByAi` in media-api mode |
| [`src/dal/grid-api-search-adapter.ts`](../../src/dal/grid-api-search-adapter.ts) | New `apiSearchByAi`; reuse `mapApiImageToImage` / `extractEnrichment` |
| [`src/stores/search-store.ts`](../../src/stores/search-store.ts) | AI branch (~1840): similar-chip detection, conflict guard, server tickers, invariant clamp/flag; `resortAiBuffer` (~3649) |
| [`src/lib/ai-search-params.ts`](../../src/lib/ai-search-params.ts) | Decorator — stop calling in media-api path (kept for direct-ES fallback) |
| [`src/dal/types.ts`](../../src/dal/types.ts) | `SearchAfterResult` gains `aiPoolTotal?` (i) then `isComplete?` (ii); `tickerCounts?` on AI result |
| [`src/components/ImageDetail.tsx`](../../src/components/ImageDetail.tsx) | MLT affordance → sets `similar:` chip + `useAISearch` |
| [`src/components/SearchBar.tsx`](../../src/components/SearchBar.tsx) | Verify CQL grammar renders `similar:` chip |
| [`src/lib/search-params-schema.ts`](../../src/lib/search-params-schema.ts) | `aiQuery`, `useAISearch`, `vecWeight` already present |
| [`vite.config.ts`](../../vite.config.ts) | GET `/api?useAISearch=true` already allowed (no change) |
| [`es-adapter.ts`](../../src/dal/es-adapter.ts) `searchByAi` (~1132) | Direct-ES fallback — do NOT expand; fate decided in §12.1 |
| media-api (reference only, no changes for Slices 1–2) | [`MediaApi.scala`](../../../media-api/app/controllers/MediaApi.scala), [`ElasticSearch.scala`](../../../media-api/app/lib/elasticsearch/ElasticSearch.scala), [`HybridResult.scala`](../../../media-api/app/lib/elasticsearch/HybridResult.scala), [`ElasticSearchModel.scala`](../../../media-api/app/lib/elasticsearch/ElasticSearchModel.scala) (`AiQueryParts`) |
| media-api (Slice 3, §8 only) | `AiQueryParts` (`text:` chip) **or** `SearchParams` + `performAiSearchAndRespond` (`aiQuery` param) |
