# Phase 3 D3 — `POST /images/search-after` — Final Code Review

**Reviewed:** 2026-06-15 (uncommitted working tree, branch `mk-next-next-next`)
**Reviewer:** fresh agent session, report-only (no code changed, no tests run by me)
**Scope:** the first media-api Scala endpoint built for kupua, plus the TypeScript DAL
wiring that routes `searchAfter` through it — in its **current post-fix state**.
**Inputs consulted:** the first review (`phase-3-d3-searchafter-code-review.md`), the
workplan, the conventions reference (`media-api-conventions.md`), the agent instructions
(`.github/instructions/media-api.instructions.md`), the worklog (`worklog-current.md`),
the blur-graphic follow-up (`post-phase-3-d3-searchafter-blur-graphic-work.md`),
`deviations.md`, and the actual diff/code in both `media-api/` and `kupua/src/`.

> **Relationship to the first review.** The first review (2026-06-12/13) raised F-1…F-6
> and several test gaps. This final review (a) **verifies each of those was genuinely
> closed in the current code**, then (b) surfaces what the first review could not — the
> changes made *since* it was written (the lean projection, the partial-`fileMetadata`
> strip, and the 2026-06-15 removal of the graphic-image Painless script). The new
> findings here (`N-*`) are the value-add; the verification table is the safety net.

---

## Section 0 — Premise check

The premise holds. The implementation matches the revised workplan (Option B: client
sends the authoritative ES sort clause; no `createSort` involvement on the cursor path;
`buildFilterOpt` reuse from PR #4752; the `hitToImageEntity` lift; mandatory null-zone
handling; `StranglerAdapter` pass-through). Every first-review finding has a
corresponding code change in the working tree. The endpoint is functionally proven
end-to-end (curl + manual `--use-media-api`, per the worklog).

**No reason to halt.** The remaining issues are one **intentional small Kahuna improvement**
that must be owned explicitly (`N-1`), one **inert/half-wired feature surface** (`N-2`, graphic
blur), one **governance gap** (`N-3`, the POST decision), and a cluster of minor warts. None
break the happy path.

**Verdict:** Materially improved since the first review — the headline F-1 clobber is
properly fixed by data-driven enrichment at commit-to-view points, and the
partial-`fileMetadata` parse trap is handled cleanly. **The Scala side is close to
`main`-PR ready** once the team accepts the `N-1` Kahuna sort improvement (flagged in the
PR doc) and signs off on `N-3` (POST). The TS side is solid; its only open item is the
deliberately-deferred blur feature (`N-2`).

---

## Section 1 — Verification: are the first review's findings actually fixed?

Severity legend (by **code behaviour**, not user importance): **S1** breakage in a
normal flow · **S2** divergence/degradation in a real flow · **S3** latent/edge-only.

| ID | First-review issue | Claimed fix | Verified in current code? |
|----|--------------------|-------------|---------------------------|
| **F-1** S2 | Enrichment-overlay clobber: `apiSearchAfter` wrote the store with set/upsert chosen by cursor-presence; probe calls (null cursor) replaced the whole overlay | Move the write out of the adapter; return `enrichment` in the result; write at commit-to-view points only | ✅ **Confirmed.** `apiSearchAfter` now only *returns* `enrichment` ([grid-api-search-adapter.ts](kupua/src/dal/grid-api-search-adapter.ts#L154-L163)); the store is written exclusively at commit points — `setEnrichment` at the fresh-search commit ([search-store.ts](kupua/src/stores/search-store.ts#L2078)), `upsertEnrichment` at fill/extend/seek ([#L934](kupua/src/stores/search-store.ts#L934), [#L2234](kupua/src/stores/search-store.ts#L2234), [#L2396](kupua/src/stores/search-store.ts#L2396), [#L1522](kupua/src/stores/search-store.ts#L1522), [#L3398](kupua/src/stores/search-store.ts#L3398)). Probe call sites ([#L1260](kupua/src/stores/search-store.ts#L1260), [#L1279](kupua/src/stores/search-store.ts#L1279), [#L3554](kupua/src/stores/search-store.ts#L3554)) never write. `SearchAfterResult.enrichment?` is optional ([types.ts](kupua/src/dal/types.ts#L156)) so direct-ES returns `undefined` → store stays empty → dual-mode safe. |
| **F-2** S2 | Soft-deleted / replaced-usage suppression lost on the API path | Append `-is:deleted` and `-usages@status:replaced` to `q` unless opted in | ✅ **Confirmed.** [grid-api-search-adapter.ts](kupua/src/dal/grid-api-search-adapter.ts#L96-L99) mirrors the ES adapter's `includes()` guard. Documented as deviations.md §31. |
| **F-3** S2/S3 | `hasRightsAcquired` silently dropped | Map through body → `SearchParamsBody.fromJson` → `syndicationRights.rights.acquired` filter | ✅ **Confirmed.** Sent at [grid-api-search-adapter.ts](kupua/src/dal/grid-api-search-adapter.ts#L130-L131), parsed at [ElasticSearchModel.scala](media-api/app/lib/elasticsearch/ElasticSearchModel.scala#L150), filtered at [QueryBuilder.scala](media-api/app/lib/elasticsearch/QueryBuilder.scala#L161-L164) and included in the accumulation list ([#L211](media-api/app/lib/elasticsearch/QueryBuilder.scala#L211)). |
| **F-4** S3 | `payType` sent but ignored by direct-ES (divergence + contradictory cost filter) | Stop sending `payType` | ✅ **Fully resolved.** Not sent by kupua; `SearchParamsBody.fromJson` now sets `payType = None` (was parsing it vestigially). |
| **F-5** — | `include` always empty | Closed as moot | ✅ **Correct.** `usages`/`leases`/`collections` are unconditional in `imageResponseWrites`; `include` only gates `fileMetadata` expansion, which the lean projection intentionally omits. |
| **F-6** S2 | PIT request routed through `prepareSearch` (migration dedup filter shrinks results mid-migration) | Bypass `prepareSearch` for the PIT branch | ✅ **Confirmed.** [ElasticSearch.scala](media-api/app/lib/elasticsearch/ElasticSearch.scala#L575) uses `ElasticDsl.search(Nil).query(effectiveQuery).pit(...)` with `withSearchQueryTimeout` still applied, and a thorough why-comment. |

**Test gaps the first review flagged** — null-zone round-trip, reverse, cursor-mismatch
→ 422, and `pathHierarchy` both-orders — are all present in
[ElasticSearchTest.scala](media-api/test/lib/elasticsearch/ElasticSearchTest.scala#L480-L666).
A new `searchAfter with fileMetadata field aliases` describe block
([#L668](media-api/test/lib/elasticsearch/ElasticSearchTest.scala#L668)) guards the
partial-`fileMetadata` strip. **All first-review concerns are closed.**

---

## Section 2 — New findings (changes made *since* the first review)

### N-1 — Production Kahuna `search()` gains the `-dateAddedToCollection` ascending sort token — **RESTORED as an intentional Kahuna improvement (2026-06-15)**

The workplan's Production-Kahuna safety note is explicit: *"Do NOT touch `sorts.createSort`,
`sorts.dateAddedToCollectionDescending`, or the `dateAddedToCollectionFilter` /
`collections.pathHierarchy` logic in `search()`. Under Option B the new endpoint does not
call `createSort` at all."* The cursor endpoint honours that — it never calls
`createSort`. **But a new case was added to Kahuna's own `search()` sort match:**

[media-api/app/lib/elasticsearch/ElasticSearch.scala](media-api/app/lib/elasticsearch/ElasticSearch.scala#L296-L299)
```scala
val sort = params.orderBy match {
  case Some("dateAddedToCollection")  => sorts.dateAddedToCollectionDescending
  case Some("-dateAddedToCollection") => sorts.dateAddedToCollectionAscending   // ← NEW
  case _ => sorts.createSort(params.orderBy)
}
```
plus a new `dateAddedToCollectionAscending` in
[sorts.scala](media-api/app/lib/elasticsearch/sorts.scala#L23).

**Original framing (and why it was imprecise):**
1. `search()` serves **production Kahuna** `GET /images` — exactly the code the workplan's
   safety note ring-fenced. True.
2. The cursor endpoint does **not** need it — it sorts via the client-sent clause
   (Option B). The case was *introduced* to make an integration test pass, and that test
   exercised `ES.search()` rather than `searchAfter`. Also true.
3. The first take called this "production code changed to satisfy a test." That framing
   was **only half right.** The same change is *also* a genuine, correct improvement to
   Kahuna: previously `-dateAddedToCollection` fell through to `createSort` →
   `parseSortBy` → `fieldSort("dateAddedToCollection")` on an unmapped field **with no
   `unmappedType`** → ES error / no-op. The new branch maps it to a valid ascending sort
   on `collections.actionData.date` (with `unmappedType`). So `-dateAddedToCollection`
   went from *broken* to *working*. It is a behaviour change, but a corrective one.

**The asymmetry that forced the decision.** `QueryBuilder` Change 2 (widening the
`dateAddedToCollection` pathHierarchy filter to also match the `-dateAddedToCollection`
token) is **needed by kupua** and was kept. Reverting only the sort half (N-1) while
keeping the filter half left an *incoherent partial* in Kahuna: for a manually-typed
`?orderBy=-dateAddedToCollection`, the collection filter fires but the sort silently falls
back to default (uploadTime). That is arguably worse than either clean end state
(fully-working, or fully-absent). (Reachable only by direct API call — see Resolution below.)

**Resolution (Option 1 — restore + own it).** The `case Some("-dateAddedToCollection") =>
sorts.dateAddedToCollectionAscending` line is restored in `ElasticSearch.scala`, and
`dateAddedToCollectionAscending` (ASC, `unmappedType("date")`) restored in `sorts.scala`.

**Important nuance discovered post-revert:** Kahuna's `getOrder()` in `media-api.js`
transforms any unrecognised `orderBy` token to `-uploadTime` before the request reaches
media-api — so `-dateAddedToCollection` is **stripped by the JS layer** and never arrives
at this sort match from the Kahuna UI, even via manual URL editing. This change is a
**direct API caller improvement** (curl, REST clients, future integrations), not a Kahuna
UI change. Kupua is also unaffected here (uses Option B sort via POST body, bypassing
`parseSortBy`). We left the server-side contract more correct; the Kahuna JS is a
separate concern. Tests: the searchAfter filter test (`dateAddedToCollection both orders
apply pathHierarchy filter`) stays as cursor-path coverage for Change 2; a new
`search()`-based block (`dateAddedToCollection sort (Kahuna search path)`) covers the
restored sort token for both directions (asserts no ES error → full corpus returned).

---

### N-2 — ~~Graphic-image blur is now fully inert in both modes, and ships a dead enrichment field~~ — **Deferred to follow-up blur work**

The 2026-06-15 decision removed the `isPotentiallyGraphic` Painless script from
`searchAfter` (measured +30ms ES `took`/page). The server will **never** send
`isPotentiallyGraphic` via this endpoint — detection is client-side, driven by the silent
`adultContentWarning` field alias. The N-2 scaffolding concern (dead field in
`extractEnrichment`/`EnrichmentFields`, inert overlay consumer in `ImageGrid.tsx`) is
consciously deferred to the follow-up blur implementation described in
`post-phase-3-d3-searchafter-blur-graphic-work.md`, where item 0 (remove
`isPotentiallyGraphic` from the enrichment layer entirely) is now the explicit first step.
The blur doc has been updated accordingly.

---

### N-3 — The GET-vs-POST decision (the instructions' "critical blocker") was resolved unilaterally — **Governance, must confirm**

`media-api.instructions.md` item 22 and conventions §15.1 call the GET-vs-POST choice for
cursor endpoints *"the critical blocker — it determines the controller pattern for all
cursor endpoints"* and flag it as requiring **team input**. The implementation chose
**POST with `auth.async(parse.json)`** ([MediaApi.scala](media-api/app/controllers/MediaApi.scala#L785))
and documented it as a new convention (deviations.md §27). The choice is reasonable
(Grid-wide pattern; auto-400 on wrong content-type) and well-argued — but it is a
**precedent-setting architectural decision** that the instructions explicitly reserved for
the team. This review can't sign that off; flag it so the human does before the `main` PR.
No code change implied — just confirmation.

---

### N-4 — ~~Minor warts~~ — **DONE (2026-06-15)**

- ~~**Vestigial `payType` parse.**~~ **Fixed.** `SearchParamsBody.fromJson` now sets `payType = None` — dead plumbing removed, same behaviour.
- ~~**Untyped response envelope.**~~ **Fixed.** Added private `SearchAfterResponse` case class + `OWrites` in `MediaApi.scala`; handler now uses `Json.toJson(SearchAfterResponse(...))`. Wire format unchanged; compiler now checks all five response fields.
- **Non-local `return` inside a `Future`-composing method.** Left as-is — works correctly; risk is theoretical (return fires before any async boundary); not worth the refactor.
- **`jsonToSort` silently ignores extra keys.** Left as-is — silent truncation is the right behaviour for a malformed path that cannot originate from `buildSortClause`; a 422 would be over-engineering a dead path.
- ~~**`deviations.md` has two `### 28.` headings.**~~ **Fixed.** Second section's `### 28. Alias and Additional-Metadata fields...` renumbered to `### 30.` (filling the existing gap in that section's sequence).

---

## Section 3 — Leg A (Scala) detail — current state

### 3.1 `ElasticSearch.searchAfter` — [#L524-L612](media-api/app/lib/elasticsearch/ElasticSearch.scala#L524)
Strong. Filtered query reuses `buildFilterOpt` exactly as `search()` does; null-zone
detection / primary-field strip / `must_not exists` / cursor-length validation / post-fetch
remap are a faithful port of `null-zone.ts`. Reverse handling reverses only the outer
hit/sortValues sequences (not each per-hit cursor) — correct. The PIT branch
([#L575](media-api/app/lib/elasticsearch/ElasticSearch.scala#L575)) bypasses `prepareSearch`
with an excellent why-comment. `total` is correctly zeroed when `countAll=false`
([#L606](media-api/app/lib/elasticsearch/ElasticSearch.scala#L606)), which also dodges the
`trackTotalHits(false)` NPE the worklog hit on the client side.

### 3.2 Lean projection + partial-`fileMetadata` strip — [#L495-L521](media-api/app/lib/elasticsearch/ElasticSearch.scala#L495)
The schema-derived projection (`Image` field names − the three giants + alias leaf paths)
is self-maintaining and well-commented. The genuinely subtle bit — that the slim
projection yields a **partial** `fileMetadata` that `Image`'s reader rejects — is handled
by `resolveSearchAfterHit` ([#L513](media-api/app/lib/elasticsearch/ElasticSearch.scala#L513)),
which strips the dropped fields from a *copy* before `validate[Image]` while keeping the
full source for alias extraction. Kept deliberately separate from the production
`resolveHit`/`mapImageFrom`. This is the best-engineered part of the change; documented as
deviations.md §32 and guarded by two regression tests.

### 3.3 `sorts.scala` — [#L30-L60](media-api/app/lib/elasticsearch/sorts.scala#L30)
`jsonToSort` (flat + nested-object shapes), `reverseSorts`, `sortModeOf` are clean and
match `buildSortClause` output. (`dateAddedToCollectionAscending` removed — N-1 resolved.)

### 3.4 `MediaApi.searchAfterImages` + `hitToImageEntity` lift — [#L771-L824](media-api/app/controllers/MediaApi.scala#L771)
The lift is behaviour-preserving (both `imageSearch` call sites updated to the curried
form). Validation chain is correct: `fromJson` → `BadRequest`, then `SearchParams.validate`
→ 422, then `InvalidUriParams` recovered to 422. `logMarker` first, `executeAndLog`,
`imageResponse.create`, kebab error keys — all per conventions. (`auth.async(parse.json)`
is the `N-3` governance item; the untyped `Json.obj` is `N-4`.)

---

## Section 4 — Leg B (TS) detail — current state

- **`grid-api-search-adapter.ts`** — `mapApiImageToImage` and `extractEnrichment` unwrap
  the Argo shapes correctly (doubly-nested usages, single-entity leases, collection array;
  `actions` at the entity level). The single-pass build of the enrichment map + hits array
  ([#L148-L153](kupua/src/dal/grid-api-search-adapter.ts#L148)) is a fine perf tidy. Filter
  mapping now covers F-2/F-3 and drops F-4. (`isPotentiallyGraphic` extraction is the `N-2`
  dead field.) Note: `ids` is a comma-separated **string** on both sides
  (TS `ids?: string` → JSON string → Scala `str("ids").map(_.split(","))`) — **verified
  consistent**, not a bug.
- **`strangler-adapter.ts`** — clean pass-through; the prototype-method + constructor-bind
  pattern is the deliberate fix for the Vite native-class-field ordering bug. All 18
  `ImageDataSource` methods delegated; optional methods conditionally bound.
- **`enrichment-store.ts`** — `setEnrichment` (replace) vs `upsertEnrichment` (merge,
  early-return on empty) are correct primitives; the set/upsert *decision* now lives at the
  store's callers (the F-1 fix), classified by semantic operation, not cursor presence.
- **`index.ts` / `search-store.ts`** — `createDataSource()` keyed on `VITE_USE_MEDIA_API`,
  single call-site swap; direct-ES remains the standalone default per the graceful-absence
  directive.

---

## Section 5 — Conventions adherence (vs `media-api.instructions.md`)

| Convention | Status |
|---|---|
| Route ordering: `POST /images/search-after` before `GET /images/:id` | ✅ [routes#L16](media-api/conf/routes#L16) before [#L17](media-api/conf/routes#L17) |
| `logMarker` first; `MarkerMap(...) ++ loggablePrincipal` | ✅ |
| `prepareSearch` (non-PIT) + `executeAndLog` | ✅ (PIT branch deliberately bypasses `prepareSearch` — F-6, documented) |
| `imageResponse.create` for enrichment (never hand-build image JSON) | ✅ via `hitToImageEntity` |
| New `*Params`/`*Results` case classes in `ElasticSearchModel.scala` | ✅ `SearchAfterParams`, `SearchAfterRawResults` |
| Kebab error keys; 422 for `InvalidUriParams` | ✅ |
| `AnyFunSpec` + `ElasticSearchDockerBase` integration tests | ✅ |
| No `var`; immutable structures | ✅ |
| `OWrites` for result case classes (item 20) | ✅ `SearchAfterResponse` private case class + `OWrites` added in `MediaApi.scala` — N-4 resolved |
| `auth.async` **without** `parse.json` (item 3 / §15.1) | ✖ **deviation** — adopts `auth.async(parse.json)`; the reserved team decision (`N-3`), documented §27 |

---

## Section 6 — Test coverage assessment

**Present (Scala, [ElasticSearchTest.scala](media-api/test/lib/elasticsearch/ElasticSearchTest.scala#L480)):**
first-page total/cursor, cursor pagination disjointness, null-zone round-trip, reverse
(position 0), cursor-length-mismatch → 422, `dateAddedToCollection` both-orders
pathHierarchy, and the two field-alias partial-`fileMetadata` regression guards.
**Present (TS):** `extractEnrichment` field-path coverage, `upsertEnrichment` semantics,
the extract→`deriveImage` contract test (per worklog: 924/924).

**Gaps worth noting (not all blocking):**
- ~~**Reverse *cursor continuation***~~ — **now covered.** `reverse cursor continuation` test
  walks two reverse pages with a cursor and asserts exact corpus slices (`fullIds.takeRight`
  / `dropRight.takeRight`), catching any off-by-one in the reverse frontier.
- ~~**`seekToEnd` + null-zone interaction**~~ — **now covered** by the `seekToEnd + null-zone`
  guard test (confirms the two head-of-clause transforms coexist without error; the benign
  Scala/TS ordering difference is documented in deviations.md §33).
- **PIT branch** untested — **out of scope.** PIT gets a dedicated media-api endpoint much
  later; for now PITs are operated by kupua's direct-ES path, so there is nothing kupua-facing
  to exercise here yet.
- **The graphic-flag tests were deleted** with the script (correct), leaving **no test for
  the client-side blur path** — consistent with `N-2` (the path isn't wired yet).

> **Full test surface run on current tree (2026-06-15):**
> - Scala integration tests (`TZ=UTC sbt "media-api/test"`): **168/168 passed** ✅
> - TS unit tests (`npm --prefix kupua test`): **924/924 passed** ✅
> - Playwright e2e (`npm --prefix kupua run test:e2e`): **240/240 passed** ✅
>
> All three surfaces green. **Note:** the run above predates the N-1 *restore* (the original
> run was on the N-1-reverted tree). After restoring the `-dateAddedToCollection` ascending
> sort + adding the `search()`-path test, re-run `TZ=UTC sbt "media-api/test"` to confirm
> (the searchAfter and TS/Playwright surfaces are unaffected by the restore).

---

## Section 7 — What "done" looks like for this review

This review is complete when the user has decided:
1. ~~**`N-1`**~~ — **RESOLVED (Option 1 — restore).** The `-dateAddedToCollection` ascending sort is restored in `search()` + `sorts.scala` and owned as an intentional, manual-URL-only Kahuna improvement (flagged in the Scala PR doc). Filter coverage (searchAfter) kept; new `search()`-path test added for both sort directions.
2. ~~**`N-2`**~~ — **Deferred.** Scaffolding cleanup + client-side wiring tracked in `post-phase-3-d3-searchafter-blur-graphic-work.md` (item 0 is now the explicit first step).
3. **`N-3`** — get team sign-off on POST + `auth.async(parse.json)` as the cursor-endpoint
   pattern (the instructions' reserved decision).
4. ~~Re-run the full test surface (Section 6) on the *current* tree before any commit.~~ — **DONE** (on the pre-N-1-restore tree): 168/168 Scala · 924/924 TS · 240/240 Playwright. Re-run the Scala surface after the N-1 restore.

The endpoint is functionally proven and the first review's findings are all closed. The
outstanding items are **team acceptance of the `N-1` Kahuna improvement, a half-finished
feature (`N-2`), and a governance sign-off (`N-3`)** — not re-architecture.

### Appendix — out-of-scope observations (≤ one line each, not acted on)
- `mapApiImageToImage` spreads `...d` then overrides usages/leases/collections — safe today; relies on the API not returning a conflicting flat field.
- `apiSearchAfter` computes `enrichment` even for probe calls that discard it — wasteful but harmless (the F-1 fix accepts this).
- Probe `searchAfter` calls send `countAll: true` (null cursor) — an extra `trackTotalHits` cost per probe; dev-only, minor.
- `nextSortValues = finalSortValues.lastOption` returns `None` on an empty page — correct end-of-stream signal.
- The `is:deleted` / `usages@status:replaced` `includes()` guards also match the negated forms (`-is:deleted` contains `is:deleted`) — consistent with the ES adapter, no double-append.
