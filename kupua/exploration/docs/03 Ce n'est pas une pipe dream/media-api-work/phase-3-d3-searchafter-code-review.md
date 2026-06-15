# Phase 3 D3 — `POST /images/search-after` — Code Review

**Reviewed:** 2026-06-12 (uncommitted working tree, branch `mk-next-next-next`)
**Reviewer:** fresh agent session, report-only (no code changed)
**Scope:** the first media-api Scala endpoint built for kupua, plus the TypeScript
DAL wiring that routes `searchAfter` through it.
**Inputs consulted:** the workplan (`phase-3-d3-searchafter-workplan.md`), the
conventions reference (`media-api-conventions.md`), the worklog
(`worklog-current.md`), the payload-perf findings, and the actual diff/code in both
`media-api/` and `kupua/src/`.

---

## Section 0 — Premise check (did the work match the plan?)

The premise holds. The implementation follows the revised workplan faithfully:
Option B (client sends the authoritative ES sort clause), no changes to Kahuna's
`createSort`/`search()` sort path, the `buildFilterOpt` reuse from PR #4752, the
`hitToImageEntity` lift, mandatory null-zone handling, and the
`StranglerAdapter` pass-through on the TS side. Several implementation details came
out **cleaner** than the workplan sketch (notably reverse handling and the null-zone
remap). The plan's "⚠️ REVERT temp diagnostics + sourceExclude toggle before commit"
note is **stale** — the current code has a permanent, schema-derived lean projection
with no leftover debug logging (see §3.3 and F-7).

There is no reason to halt. The endpoint works end-to-end (verified by the previous
session's curl + manual `--use-media-api` testing and a green Scala/unit/e2e surface).
The findings below are about **correctness parity between the two DAL routes** and one
**store side-effect design flaw**, not about whether the endpoint functions.

**Verdict:** Solid first endpoint, conventions respected, well-tested at the seams
that were anticipated. **Not commit-ready as-is** — there is one high-impact bug
(F-1, enrichment-overlay clobber) and at least two real filter-parity divergences
(F-2, F-3) that should be resolved or consciously accepted before the TS side ships.
The Scala side (Leg A) is in much better shape than the TS wiring (Leg B); the Scala
endpoint could reasonably go to a `main` PR before the TS clobber bug is fixed.

---

## Section 1 — What was built (architecture)

```
kupua UI  ──► search-store.ts  ──► createDataSource()
                                      │
                  VITE_USE_MEDIA_API ?─┴─ false ─► ElasticsearchDataSource (direct ES)
                                      │
                                      └─ true ──► StranglerAdapter
                                                    ├─ searchAfter ─► apiSearchAfter()
                                                    │                   │ POST /api/images/search-after
                                                    │                   ▼ (Vite proxy → media-api :9001)
                                                    │              media-api: MediaApi.searchAfterImages()
                                                    │                   └─ ElasticSearch.searchAfter()  ─► TEST ES
                                                    └─ all 18 other methods ─► ElasticsearchDataSource
```

**Leg A (Scala):** `POST /images/search-after` parses a JSON body into `SearchParams`,
applies the client-supplied ES sort clause verbatim, performs cursor pagination with
null-zone handling, enriches each hit through `imageResponse.create`, and returns an
Argo-style `{ data, total, sortValues, nextSortValues, pitId }` envelope.

**Leg B (TS):** a `StranglerAdapter` delegates everything to `ElasticsearchDataSource`
except `searchAfter`, which calls `apiSearchAfter`. The API response is mapped back to
the flat `Image` shape, and — new in this work — each hit's server-authoritative
enrichment fields are pushed into the `enrichment-store` overlay ("consuming the
zombie" merge seam).

---

## Section 2 — Findings (severity-tagged)

Severity is by **code behaviour**, not user importance:
- **S1** — breakage / wrong results in a normal flow.
- **S2** — degradation or divergence between the two DAL routes in a real flow.
- **S3** — latent / edge-only / depends on a feature not currently exercised.

Confidence: **High** = verified by reading both sides; **Med** = strong inference,
one assumption unverified.

---

### F-1 — Enrichment-overlay clobber from non-rendering `searchAfter` calls — **S2, High**

`apiSearchAfter` writes the `enrichment-store` as a side effect, choosing
`setEnrichment` (replace-all) vs `upsertEnrichment` (merge) based solely on whether a
cursor was passed:

[kupua/src/dal/grid-api-search-adapter.ts](kupua/src/dal/grid-api-search-adapter.ts#L143-L150)
```ts
const enrichmentStore = useEnrichmentStore.getState();
if (searchAfterValues) enrichmentStore.upsertEnrichment(enrichment);
else enrichmentStore.setEnrichment(enrichment);
```

The heuristic "no cursor ⇒ first page of a fresh search ⇒ replace" is wrong, because
`searchAfter` is **also** called as a metadata-only lookup with a `null` cursor in the
sort-around-focus path:

- [kupua/src/stores/search-store.ts](kupua/src/stores/search-store.ts#L1244-L1249) — a
  single-image lookup `{ ...fp, ids: imageId, length: 1 }` with `null` cursor, used only
  to read that image's `sortValues`.
- [kupua/src/stores/search-store.ts](kupua/src/stores/search-store.ts#L1263-L1267) — a
  neighbour-survival batch check `{ ...fp, ids: prevNeighbours…, length: … }` with `null`
  cursor.

Both pass `searchAfterValues = null`, so in media-api mode they call
`setEnrichment` and **replace the entire visible window's enrichment overlay with one
image (or a handful of neighbours)**. The grid then loses server-authoritative
`cost`, `valid`, `isPotentiallyGraphic`, `persisted`, and `actions` for every visible
image except the looked-up one — `deriveImage` silently falls back to the ES baseline.

This is invisible in the default-ES e2e suite (the side effect only fires in media-api
mode) and easy to miss in manual testing (it only manifests after a sort change that
triggers sort-around-focus, and only on fields the overlay owns). The contract test
([kupua/src/dal/grid-api-search-adapter.test.ts](kupua/src/dal/grid-api-search-adapter.test.ts))
covers `extractEnrichment` thoroughly but **not** the store set/upsert decision against
real call sites.

**Why this is the headline issue:** the side-effect-inside-the-DAL design means every
one of the ~7 `searchAfter` call sites now mutates a global store, and the set/upsert
classification is made at the wrong layer (the adapter cannot know the *caller's
intent* — render vs metadata-lookup).

**DECISION (2026-06-12): Option 1 — move the enrichment-store write out of `apiSearchAfter`.**

Rationale: the side effect is a layering smell regardless of the clobber, and the
render call sites already know whether they're a fresh search (offset 0 / new query) or
an extend. Options 2 (an on/off flag) and 3 (a separate lookup path) were rejected:
Option 2 leaves the design problem in place and relies on every future caller
remembering the flag (silent failure mode); Option 3 builds more new code than the
problem warrants.

**Implementation shape (refined 2026-06-12 after counting call sites):**

**Dual-mode is non-negotiable.** kupua must keep working in BOTH `--use-media-api`
(this endpoint) and `--use-TEST` (direct ES) mode; direct-ES may retire one day but not
yet. The fix must leave the direct-ES path 100% untouched.

Mechanism — **data-driven, not route-aware**:
- Extend `SearchAfterResult` with an optional `enrichment?: Map<string, EnrichmentFields>`.
- `apiSearchAfter` computes the entries (keep `extractEnrichment` exported + tested) and
  attaches them to the returned result. It **no longer writes** `useEnrichmentStore`.
- `ElasticsearchDataSource.searchAfter` returns `enrichment: undefined`. So in direct-ES
  mode there is nothing to write — the store stays empty and the existing
  `deriveImage`-baseline / TS-replication floor is unaffected. This is what guarantees
  dual-mode safety: the write is gated on *presence of data in the result*, never on
  which adapter ran.

**Where to write — commit-to-view points, NOT `searchAfter` call sites.** There are ~21+
`searchAfter` call sites in `search-store.ts` (the seek machinery at L2505–L3166 alone
has ~12), and most are **probes** (position estimation, sort-value triangulation,
neighbour checks) that never render anything. Do **not** try to tag each call site —
that is fragile and will misclassify one. Instead, write the overlay at the few
**commit-to-view points**, where results actually become the rendered `results:` buffer.
The probes are then excluded by construction (they never commit). The commit points:
- fresh-search commit ([search-store.ts#L2060](kupua/src/stores/search-store.ts#L2060)) → `setEnrichment` (**replace**)
- fill loop ([#L932](kupua/src/stores/search-store.ts#L932)), extend-forward ([#L2214](kupua/src/stores/search-store.ts#L2214)), extend-backward ([#L2376](kupua/src/stores/search-store.ts#L2376)) → `upsertEnrichment` (**merge**)
- buffer-around ([#L1108](kupua/src/stores/search-store.ts#L1108)) and seek commit ([#L2622](kupua/src/stores/search-store.ts#L2622)) → `upsertEnrichment` (merge the forward + backward results)
- degrade fallbacks ([#L1219](kupua/src/stores/search-store.ts#L1219), [#L1297](kupua/src/stores/search-store.ts#L1297), [#L1591](kupua/src/stores/search-store.ts#L1591)) reuse an already-committed result — no new write

**Decide set vs upsert by the SEMANTIC operation, never by cursor presence** (cursor
presence was the root of the bug). Rule: **`set` only at the fresh-search commit;
`upsert` at every other commit.** This also repairs a latent inconsistency in the old
heuristic — the End-key seek path ([#L2522](kupua/src/stores/search-store.ts#L2522))
passes a null cursor and would have wrongly *replaced* under cursor-based logic.

**Failure mode is now safe:** a missed commit point yields "no overlay on that path"
(graceful baseline, identical to direct-ES), never a clobber.

> Note: the AI-search commit ([#L1857](kupua/src/stores/search-store.ts#L1857)) uses
> `searchByAi`, a different endpoint — out of scope for F-1. Decide separately whether it
> should populate the overlay.

**Mandatory tests (regression + dual-mode guards):**
1. **Probe-does-not-clobber (failing-first):** a probe-style `searchAfter` (null cursor,
   `ids`-based, media-api mode) leaves the enrichment overlay **unchanged**. Write it
   failing against the current clobbering code, confirm it fails for the right reason,
   then fix.
2. **Dual-mode guard:** in direct-ES mode the result's `enrichment` is `undefined`, so
   committing it writes **nothing** to the store — proves `--use-TEST` is unaffected.
3. Fresh-search **replaces** vs extend **merges** wiring assertions.
These only fire in media-api mode (or assert its absence), so they must exercise the
`StranglerAdapter` / `apiSearchAfter` path — the default-ES e2e suite will not catch them.

---

### F-2 — Soft-deleted & replaced-usage suppression is lost on the API path — **S2, High**

The direct-ES adapter manually injects two default-hide clauses that Kahuna's
client-side query assembly normally adds:

[kupua/src/dal/es-adapter.ts](kupua/src/dal/es-adapter.ts#L479-L488)
```ts
if (!queryStr.includes("is:deleted")) {
  mustNot.push({ exists: { field: "softDeletedMetadata" } });
}
if (!queryStr.includes("usages@status:replaced")) {
  mustNot.push({ nested: { path: "usages", query: { term: { "usages.status": "replaced" } } } });
}
```

`apiSearchAfter` sends the **raw** query string
([kupua/src/dal/grid-api-search-adapter.ts](kupua/src/dal/grid-api-search-adapter.ts#L93))
and media-api does **not** auto-suppress: the `is:deleted` handling is opt-in CQL via
`IsQueryFilter` ([media-api/app/lib/elasticsearch/IsQueryFilter.scala](media-api/app/lib/elasticsearch/IsQueryFilter.scala#L69)),
which only fires when the query explicitly contains `is:deleted`/`is:undeleted`. There
is no `thingsToHideByDefault` equivalent server-side (grep found none).

**Consequence:** in media-api mode, soft-deleted images and images with `replaced`
usages will appear in results, where direct-ES mode hides them. Latent because TEST
data probably has few such images, so manual testing wouldn't surface it.

**Fix:** mirror Kahuna — have `apiSearchAfter` append `-is:deleted` and
`-usages@status:replaced` to `q` before sending (unless the user opted in), so the
server's `Parser.run` produces the same `must_not` clauses. (This keeps the server
generic; the suppression stays a client convention, consistent with how Grid/Kahuna
works.)

---

### F-3 — `hasRightsAcquired` filter is silently dropped on the API path — **S2/S3, High**

Direct-ES applies it
([kupua/src/dal/es-adapter.ts](kupua/src/dal/es-adapter.ts#L545-L557),
`syndicationRights.rights.acquired`). `apiSearchAfter` never sends `hasRightsAcquired`,
and `SearchParamsBody.fromJson` has no field for it — it reads the unrelated
`hasRightsCategory`
([media-api/app/lib/elasticsearch/ElasticSearchModel.scala](media-api/app/lib/elasticsearch/ElasticSearchModel.scala)).
So when this filter is active, media-api mode returns unfiltered results while
direct-ES mode filters.

**DECISION (2026-06-12): map it through.** Investigation confirmed `hasRightsAcquired`
is a genuine, live filter — Kahuna passes `$stateParams.hasRightsAcquired` into search
(`kahuna/public/js/services/api/media-api.js:63`), it's in the active search param
list, and kupua's ES adapter already applies it. It's not a prominent grid checkbox
(it's a syndication-workflow / URL-driven filter; the related
`hasRightsAcquiredForSyndication` drives the per-image "rights acquired" display), but
it is reachable via a kupua URL. Fix: add `hasRightsAcquired` to the `apiSearchAfter`
body (boolean, only when set) and to `SearchParamsBody.fromJson` on the server, mapping
to the same `syndicationRights.rights.acquired` term filter the ES adapter uses. Low risk.

---

### F-4 — `payType` is sent to the server but ignored by direct-ES — **S3, High**

`apiSearchAfter` forwards `payType`
([kupua/src/dal/grid-api-search-adapter.ts](kupua/src/dal/grid-api-search-adapter.ts#L114))
and the server applies a cost filter for it
([media-api/app/lib/elasticsearch/QueryBuilder.scala](media-api/app/lib/elasticsearch/QueryBuilder.scala#L150-L152)).
The direct-ES `buildQuery` does **not** handle `payType` at all (only `nonFree →
FREE_FILTER`). Two issues:
1. **Divergence:** a `payType` value filters in media-api mode but not in direct-ES mode.
2. **Double/contradictory cost filter:** when `nonFree !== "true"` the adapter sends
   `free: true` **and** any `payType`; the server applies `freeFilter` *and* the
   `payType` filter together (QueryBuilder line 148 + line 150). `payType=pay` + `free=true`
   → contradictory → empty page.

Low likelihood from current UI (payType looks vestigial in kupua), but it's a real
inconsistency.

**DECISION (2026-06-12): stop sending `payType`.** Investigation confirmed the pay-type
filter is **disabled in Kahuna itself** — the `<select>` control is commented out
(`<!-- TODO: Decide on correct cost filter model -->`, `// Disabled while paytype
filter unavailable`). Kahuna's live cost control is the single "Free to use only"
checkbox (`nonFree`). So no UI sets `payType`; kupua's ES adapter ignoring it is correct
parity with live Kahuna. Fix: remove the `payType` line from `apiSearchAfter`. (Leaving
the server's `SearchParamsBody` `payType` parse in place is harmless — nothing will
send it — but it can be dropped too for tidiness.)

---

### F-5 — ~~`include` is always empty on the API path~~ — **CLOSED (2026-06-13)**

~~The controller reads `include` from the query string only...~~

**Resolution:** Code inspection of `ImageResponse.scala` shows that `usages`, `leases`,
and `collections` are written **unconditionally** in `imageResponseWrites` — they have
no dependency on the `include` parameter at all. The only thing `include` controls is
`expandFileMetaData` (`included.contains("fileMetadata")`). An empty include list means
`fileMetadata` comes back as a reference link rather than its full payload, which is
exactly the behaviour we want (lean projection). No implicit dependency; no fix needed.

---

### F-6 — ~~PIT request still routes through `prepareSearch` (migration filter)~~ — **FIXED (2026-06-13)**

~~S3, Low~~ → **S2, Fixed.** On further analysis this is a real correctness bug during migrations, not
just a style wart. See §7 obs 5 in gap-derivation findings for the full mechanism.

[media-api/app/lib/elasticsearch/ElasticSearch.scala](media-api/app/lib/elasticsearch/ElasticSearch.scala#L500-L503)
```scala
val baseRequest = params.pitId match {
  case Some(pid) => prepareSearch(effectiveQuery).pit(Pit(pid).keepAlive(1.minute))
  case None      => prepareSearch(effectiveQuery)
}
```
`.pit()` zeroes the index list (elastic4s), so index selection is fine, but
`prepareSearch` also appends a migration `must_not` filter when a migration is
`Running`. With a PIT (which already pins the index generation) that extra filter is at
best redundant and could in principle interact oddly during a migration. The original
sketch deliberately used `ElasticDsl.search(Nil)` for the PIT branch to bypass this.
Not a problem today (TEST isn't mid-migration), but note it. Low.

---

## Section 3 — Leg A (Scala) detail

### 3.1 `ElasticSearch.searchAfter` — the core method
[media-api/app/lib/elasticsearch/ElasticSearch.scala](media-api/app/lib/elasticsearch/ElasticSearch.scala#L463-L562)

**Strengths:**
- Filtered-query assembly reuses the merged `buildFilterOpt` exactly as `search()`
  does — no Kahuna sort code touched. ✔
- Null-zone detection (`sortValues.head == JsNull`), primary-field stripping, the
  `must_not exists` filter, cursor-length validation, and the post-fetch remap are a
  faithful port of `null-zone.ts`. The remap via `foldLeft` over the full clause
  (lines 624-639) is correct and arguably clearer than the TS original.
- Reverse handling is **cleaner than the workplan sketch**: it reverses only the outer
  hit/sortValues sequences and does not (incorrectly) reverse each per-hit cursor array.
- `reverseSorts` flips direction but preserves clause field order, so the remap's
  reliance on `baseSorts` field positions stays aligned under reverse. ✔ (verified)

**Watch items:**
- The cursor-length validation uses `return Future.failed(...)` inside a `.foreach`
  ([line 491-494](media-api/app/lib/elasticsearch/ElasticSearch.scala#L491)). It works
  (non-local return from the enclosing `def`), but a non-local `return` in a method that
  otherwise composes `Future`s is a minor style wart; an `if/else` or `Either` would be
  cleaner. Low.
- `jsValueToAny` maps `JsNumber` to `Long` when `isValidLong`, else `Double`
  ([line 619-622](media-api/app/lib/elasticsearch/ElasticSearch.scala#L619)). Sort
  values that round-trip as JSON numbers are fine here, but be aware that a keyword sort
  whose value happens to be numeric-looking is sent as `JsString` from the client, so
  this branch is only hit for genuine numeric sorts (uploadTime epoch ms). OK.

### 3.2 `sorts.scala` — clause deserialisation
[media-api/app/lib/elasticsearch/sorts.scala](media-api/app/lib/elasticsearch/sorts.scala#L20-L55)

`jsonToSort` handles flat `{field:"dir"}` and nested-object
`{field:{order,missing?,mode?,nested?}}` shapes, matching `buildSortClause` output.
`reverseSorts` and `sortModeOf` are clean. Good. One note: `jsonToSort` assumes
`entry.fields.head` — a sort entry with >1 key would silently ignore the rest. That
can't happen from `buildSortClause`, so acceptable, but a malformed client body would
fail silently rather than 4xx. Low.

### 3.3 `_source` projection
[media-api/app/lib/elasticsearch/ElasticSearch.scala](media-api/app/lib/elasticsearch/ElasticSearch.scala#L536-L548)

Schema-derived include list (`Image` case-class field names) minus the three giants
(`embedding`, `originalMetadata`, `fileMetadata`) plus the configured fileMetadata
alias leaves. This is a thoughtful resolution of the payload-perf finding and is
self-maintaining (no hand-listed fields). The comment correctly notes the
`isPotentiallyGraphic` Painless script reads full stored `_source` regardless of the
projection. Good. This **replaces** the "temp sourceExclude toggle" the worklog warned
about — nothing to revert.

### 3.4 `MediaApi.searchAfterImages` + `hitToImageEntity` lift
[media-api/app/controllers/MediaApi.scala](media-api/app/controllers/MediaApi.scala#L771-L823)

- The `hitToImageEntity` lift is behaviour-preserving; both `imageSearch` call sites
  were updated to the curried `hitToImageEntity(request, include) _` form. ✔
- The handler uses `auth.async(parse.json)` — note the conventions doc explicitly says
  "There is no `auth.async(parse.json)` in MediaApi (POST body parsing done manually
  with `request.body.asJson`)"
  ([media-api-conventions.md §6](kupua/exploration/docs/03%20Ce%20n'est%20pas%20une%20pipe%20dream/media-api-work/media-api-conventions.md)).
  This endpoint **introduces a new convention** (body parser combinator). That's
  defensible (it's the first body-carrying read endpoint), but per the kupua "document
  deviations" directive it should get a short note in `deviations.md`, and ideally a
  one-line code comment explaining why `parse.json` is used here.
- The response is a hand-built `Json.obj(...)` rather than the `SearchAfterResults` +
  `Json.writes` macro the workplan specified. Functionally fine and avoids a throwaway
  case class, but it means `nextSortValues`/`sortValues` shapes aren't type-checked.
  Minor; acceptable.
- Validation chain is good: `SearchParamsBody.fromJson` → `BadRequest` on parse failure,
  then `SearchParams.validate` → `422` on invalid params, then `InvalidUriParams`
  recovered to `422`. Status-code conventions match §7 of the conventions doc. ✔

### 3.5 `QueryBuilder.scala` — the one shared-code change
[media-api/app/lib/elasticsearch/QueryBuilder.scala](media-api/app/lib/elasticsearch/QueryBuilder.scala#L176)

Widening the `dateAddedToCollection` companion `pathHierarchy` filter to also match
`-dateAddedToCollection` is the single intentional shared-code change. It's
behaviour-preserving for `search()` and AI search (neither sends the asc token today),
exactly as the workplan argued. ✔ The blast-radius reasoning is sound.

### 3.6 Scala tests
[media-api/test/lib/elasticsearch/ElasticSearchTest.scala](media-api/test/lib/elasticsearch/ElasticSearchTest.scala#L452-L536)

Covers: first-page total/count, cursor pagination (page-2 disjoint from page-1),
`isPotentiallyGraphic` true/false via the script field, and a new `graphic-image-1`
fixture. The pre-existing `fileMetadata` test was correctly updated for the new fixture
(1 → 2). **Gaps vs the workplan test plan** (worth noting, not blocking):
- ~~No **null-zone** integration test~~ — **added** (null-zone round-trip, line 536).
- ~~No **reverse** test~~ — **added** (line 584).
- ~~No **cursor-length-mismatch → 422** test~~ — **added** (line 613).
- ~~No `pathHierarchy`-fires-for-both-orders assertion~~ — **added** as
  `dateAddedToCollection both orders apply pathHierarchy filter` (line 631). This test
  also required fixing `sorts.scala`: `dateAddedToCollectionDescending` now carries
  `.unmappedType("date")`, and a new `dateAddedToCollectionAscending` variant handles
  `-dateAddedToCollection` in `ElasticSearch.search()`. _(Done 2026-06-13)_
- Keyword-alias / `usagesDateAdded` sort-clause tests: still absent. Not blocking.

~~The null-zone path is the highest-risk untested logic in Leg A~~ — now covered.
166/166 Scala tests pass. _(2026-06-13)_

---

## Section 4 — Leg B (TS) detail

### 4.1 `grid-api-search-adapter.ts`
- `mapApiImageToImage` and `extractEnrichment` correctly unwrap the Argo shapes
  (doubly-nested usages, single-entity leases, collection array). The test file proves
  the field paths — especially the subtle `actions` at the **entity** level vs
  `entity.data` — which is exactly the kind of silent path bug worth pinning. ✔ Strong.
- Filter mapping is **incomplete** relative to `buildQuery` — see F-2/F-3/F-4. The body
  builder maps ~12 fields; the ES adapter's `buildQuery` applies more (default
  suppressions, `hasRightsAcquired`). This is the main correctness weakness of Leg B.
- The enrichment side-effect lives inside the adapter — see F-1.

### 4.2 `strangler-adapter.ts`
Clean pass-through. The prototype-method + constructor-bind pattern (rather than class
fields) is a deliberate fix for the Vite native-class-field ordering bug the worklog
documents — good that it's now structural rather than incidental. Delegation covers all
18 `ImageDataSource` methods; optional methods are conditionally bound. ✔

### 4.3 `index.ts` / `search-store.ts` wiring
`createDataSource()` factory keyed on `VITE_USE_MEDIA_API`, single call-site swap in the
store. Minimal and correct. ✔ Per the graceful-absence directive, direct-ES remains the
default and standalone floor. ✔

### 4.4 `enrichment-store.ts` `upsertEnrichment`
The new merge method and its tests are good (early-return on empty, preserve-on-merge,
overwrite-same-id, replace-vs-extend distinction). The tests are solid; the problem is
*who calls set vs upsert* (F-1), not the store primitive itself.

### 4.5 `vite.config.ts` / proxy
- The write-guard whitelist for `POST /images/search-after` is correctly scoped (POST +
  path prefix) so it doesn't open a general write hole. ✔
- The `Origin` header spoof to `media.local.dev-gutools.co.uk` is a **dev-only CORS
  workaround** and is documented inline. Fine for dev; make sure it never leaks into a
  shipped config (it's in `vite.config.ts`, dev-only, so OK). Worth a `deviations.md`
  line.

---

## Section 5 — Conventions adherence (vs `media-api-conventions.md`)

| Convention | Status |
|---|---|
| Route ordering (specific before `/:id`) | ✔ `POST /images/search-after` before `GET /images/:id` |
| Kebab-case path | ✔ |
| `logMarker` first, `MarkerMap(...) ++ loggablePrincipal` | ✔ |
| `prepareSearch` + `executeAndLog` | ✔ |
| `imageResponse.create` for enrichment (never hand-build JSON) | ✔ |
| Error keys kebab-case, 422 for `InvalidUriParams` | ✔ |
| ScalaTest `AnyFunSpec` + `ElasticSearchDockerBase` | ✔ |
| `auth.async` (no `parse.json`) | ✖ **deviation** — introduces `auth.async(parse.json)`; defensible but undocumented (see §3.4) |
| `respondCollection`/`respond` for responses | ~ uses raw `Ok(Json.obj).as(ArgoMediaType)` instead — deliberate (avoids touching shared `CollectionResponse`), matches workplan §9 |

---

## Section 6 — Pre-commit checklist / open questions

Before the **TypeScript** side ships:
- [x] **F-1**: fix the enrichment-overlay clobber — **Option 1 chosen**. `enrichment`
      returned in `SearchAfterResult`; store written at commit-to-view points only
      (`setEnrichment` on fresh-search commit, `upsertEnrichment` on extend/seek).
      Regression tests: probe-does-not-clobber, dual-mode guard, fresh vs extend wiring.
      _(Done 2026-06-12)_
- [x] **F-2**: soft-deleted / replaced-usage suppression restored. `-is:deleted` and
      `-usages@status:replaced` appended to `q` in `apiSearchAfter` unless opted in.
      _(Done 2026-06-12)_
- [x] **F-3**: `hasRightsAcquired` mapped through — body field + `SearchParamsBody.fromJson`
      + `syndicationRights.rights.acquired` term filter. _(Done 2026-06-12)_
- [x] **F-4**: `payType` removed from `apiSearchAfter`. _(Done 2026-06-12)_
- [x] **F-5**: ~~confirm/test the empty-`include` default produces usages/leases/collections~~
      **MOOT.** Code inspection of `ImageResponse.scala` confirms `usages`, `leases`, and
      `collections` are written unconditionally in `imageResponseWrites` — they are never
      gated by the `include` parameter. The only thing `include` controls is whether
      `fileMetadata` is expanded (`included.contains("fileMetadata")`). Empty include →
      `expandFileMetaData = false` → fileMetadata returned as a link, everything else
      always present. No fix needed. _(Verified 2026-06-13)_

Before the **Scala** PR merges to `main`:
- [x] Add null-zone + cursor-mismatch(422) integration tests — both added in
      `ElasticSearchTest.scala` (null-zone round-trip at line 536, cursor-mismatch at
      line 613). Also added: reverse test (line 584), dateAddedToCollection
      pathHierarchy filter for both orders (line 631). _(Done 2026-06-12/13)_
- [x] Add a `deviations.md` entry for `auth.async(parse.json)` and the Vite Origin spoof
      — §27 and §28 added. _(Done 2026-06-13)_
- [x] Consider the PIT-via-`prepareSearch` migration-filter note (F-6): **FIXED (2026-06-13).**
      Not "document only" — turns out it's a real correctness bug during migrations.
      `searchAfter` now uses `ElasticDsl.search(Nil).query(effectiveQuery).pit(...)` when a
      PIT is present, bypassing `prepareSearch` entirely. `prepareSearch`'s migration dedup
      filter would remove images that have `esInfo.migration.migratedTo` set, causing the
      result set to shrink progressively as migration proceeds. `withSearchQueryTimeout` still
      applied. Comment in code cites gap-derivation §7 obs 5. Severity upgraded: S2 not S3.

Housekeeping:
- [x] The worklog's "REVERT temp diagnostics + sourceExclude toggle" warning struck.
      _(Done 2026-06-13)_
- [ ] Two commits as planned: Scala-only → `main`; TS-only stays on `mk-next-next-next`.
      **Do not commit without explicit user approval** (per AGENTS directive).

---

## Section 7 — What "done" looks like for this review

This review is complete when the user has: (a) decided how to resolve F-1 (the only
behaviour-breaking item that fires in normal use), (b) decided accept-or-fix on the
F-2..F-5 parity gaps, and (c) scoped the missing Scala tests. The endpoint itself is
functionally proven; the remaining work is parity hardening and test coverage, not
re-architecture.

### Appendix — out-of-scope observations (≤ one line each, not acted on)
- `ElasticSearch.scala:412` `val field = "labels" // TODO` is pre-existing (editsSearch), unrelated.
- `dateField` is resolved into `since/takenSince` upstream of `buildQuery`, so not sending it is correct (not a gap).
- `mapApiImageToImage` spreads `...d` then overrides usages/leases/collections — relies on the API not returning a conflicting flat field; safe today.
- `nonFree`/`free` mapping is consistent across both routes (verified: QueryBuilder.scala:148 vs es-adapter.ts:533).
- `hasCrops` true/false → `hasExports` true/false is consistent (QueryBuilder.scala:144 `existsOrMissing` handles both).
