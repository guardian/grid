# media-api Instructions for Implementing Agents

> **Deployed copy:** `.github/instructions/media-api.instructions.md` (local-only, in `.git/info/exclude`, never committed).
> That file has `applyTo: media-api/**` frontmatter so Copilot loads it automatically.
> When you update this doc, copy changes there too.
> **Instructions are not yet final** — see item 19 re open questions.

See `media-api-conventions.md` for full detail and file:line cites.

1. **Class declaration.** Extend `BaseController` with `ArgoHelpers`. Constructor
   injection only — no `@Inject`. Wire the new class in `MediaApiComponents.scala`.
   Cite: `MediaApi.scala:37`, `MediaApiComponents.scala:34`.

2. **Route ordering.** Specific paths before generic. `POST /images/search-after`
   must appear *before* `GET /images/:id` in `conf/routes`. Cite: §2 of conventions.

3. **POST + `auth.async(parse.json)` for cursor/body-heavy reads (adopted by D3).** Simple
   reads still use GET + URL query strings via `SearchParams.apply(request)` + `getQueryString()`.
   But cursor/filter-heavy endpoints (compound `sortValues`, large ID lists) use POST with a JSON
   body parsed via `auth.async(parse.json)` — established by `POST /images/search-after` (deviations
   §27), in line with 6 other Grid services. **Team sign-off still pending (N-3).** Model
   implementations: `leases/MediaLeaseController.scala:97`; `MediaApi.searchAfterImages`.

4. **Every handler opens with a logMarker.** Pattern:
   `MarkerMap("requestType" -> "...", "requestId" -> ..., "imageId" -> ...) ++ RequestLoggingFilter.loggablePrincipal(request.user)`.
   Declare as `implicit val logMarker`. Cite: `MediaApi.scala:160-163`.

5. **All authenticated routes use `auth.async { request => ... }`.** Cite: `MediaApi.scala:157`.

6. **Always check `isVisibleToAccessor` before returning image data.** Syndication
   tier → 404, not 403. `case Some(image) if isVisibleToAccessor(request.user, image)`.
   Cite: `MediaApi.scala:210-214`.

7. **Argo responses.** Single item → `respond(data, links)`. List →
   `respondCollection(data, offset, total, ...)`. Error → `respondError(status,
   "kebab-key", "message")`. Define error responses as private defs near class top.
   Cite: `ArgoHelpers.scala:17,28,58`, `MediaApi.scala:134-138`.

8. **Never construct image JSON manually.** Call `imageResponse.create(id, source,
   writePermission, deletePermission, deleteCropsOrUsagePermission, include, tier)`.
   Handles S3 URLs, thumb URLs, validity, aliases. Cite: `ImageResponse.scala:52`.

9. **Search results: wrap each hit in `EmbeddedEntity`.** Mirror `hitToImageEntity`
   in `imageSearch()`. Cite: `MediaApi.scala:556-565`.

10. **New result/param case classes go in `ElasticSearchModel.scala`.** Suffix
    convention: `*Params`, `*Results`. Cite: `ElasticSearchModel.scala:16,55`.

11. **Always use `prepareSearch(query)` in the ES layer.** Never call
    `ElasticDsl.search(imagesCurrentAlias)` directly — `prepareSearch` handles
    migration-aware index routing. Cite: `ElasticSearch.scala:440`.

12. **Always use `executeAndLog(request, "description")`.** Wraps execution with
    logging and metrics. Cite: `ElasticSearch.scala:332`.

13. **Timeout.** `withSearchQueryTimeout` is applied inside `prepareSearch`. Apply
    manually to any `SearchRequest` built outside it. Cite: `ElasticSearch.scala:437`.

14. **elastic4s style: fluent DSL.** `boolQuery() must ... filter ...`. Wildcard-import
    `ElasticDsl._`. Cite: `ElasticSearch.scala:9-13`.

15. **Logging.** Always `logger.info(logMarker, s"...")` — never bare form without
    marker. `info` for business events, `error` for failures. Cite: `MediaApi.scala:460`.

16. **No `var`.** Immutable data structures throughout. Cite: PR #4201 review.

17. **Tests.** `AnyFunSpec` with `Matchers`. ES integration tests extend
    `ElasticSearchDockerBase`. Mocking via `MockitoSugar`. File naming `XyzTest.scala`.
    New ES query logic needs an integration test. Cite: `ElasticSearchTestBase.scala:16`.

18. **Comments: ~2 per 100 LOC.** Only for non-obvious *why*. No Scaladoc on private
    methods. Cite: §9 of conventions.

19. **Never use `Await.result`.** All Future composition via `.map`/`.flatMap`. No `EitherT`. Cite: §5 of conventions.

20. **Play JSON for new result case classes.** Companion object, `OWrites` only (never `Reads` unless the endpoint parses a JSON request body — see item 22 / §15.1). Pattern:
    ```scala
    case class MyResults(hits: Seq[...], total: Long)
    object MyResults {
      implicit val jsonWrites: OWrites[MyResults] = Json.writes[MyResults]
    }
    ```
    Place alongside existing types in `ElasticSearchModel.scala`. Cite: `ElasticSearchModel.scala:23,29,35`.

21. **`resolveHit` turns a raw `SearchHit` into `Option[SourceWrapper[Image]]`.** Never parse `hit.sourceAsString` manually. Use `resolveHit` (private to `ElasticSearch`) or mirror its pattern exactly. Cite: `ElasticSearch.scala:153`.

22. **Before writing any code,** read §14-15 of `media-api-conventions.md`. **§15.1 (GET vs POST)
    is RESOLVED** — D3 adopted POST + `auth.async(parse.json)` (pending team sign-off, N-3). Argo
    format (§15.4) and PIT availability (§15.5) are also resolved. Remaining open questions for
    team input: testing bar (§15.2), sort-value serialisation (§15.3), cluster PIT overhead (§15.6),
    `_source` filtering (§15.7).

---

## Post-D3 standing constraints (Scala mechanics for future cursor/image endpoints)

> Added 2026-06-20 after D3 shipped. Design-level rationale is in
> `phase-3-minimal-gap-derivation-findings.md` (status banner); this is the Scala spelling.

23. **Option B sort handling — every cursor endpoint, never `createSort`.** The client (kupua
    `buildSortClause`) sends the fully-resolved ES sort clause in the request body. Deserialise it
    with `sorts.jsonToSort` (flat `{field:"asc"}` and nested-object
    `{field:{order,missing,mode,nested}}` shapes), apply verbatim, and use `sorts.reverseSorts` for
    reverse pagination. Do **not** call `sorts.createSort` on a cursor path — it serves Kahuna and
    must not change. Read `orderBy` only for the `dateAddedToCollection` companion `pathHierarchy`
    filter (both token orders).

24. **PIT consumers bypass `prepareSearch`.** When a `pitId` is present, build the request as
    `ElasticDsl.search(Nil).query(q).pit(...)` (still apply `withSearchQueryTimeout`) — the migration
    dedup filter from `prepareSearch` must NOT be applied to a PIT (it shrinks results mid-migration).
    When D8 builds `POST /images/pit`, open the PIT across both `imagesCurrentAlias` and the running
    migration index. Cite: `ElasticSearch.searchAfter` PIT branch; `phase-3-d3-searchafter-scala-pr.md`.

25. **Image-returning endpoints reuse the lean projection + strip-before-validate.** `_source` is the
    schema-derived `Image` field set minus `{embedding, originalMetadata, fileMetadata}` plus
    `fieldAliasConfigs` paths. Because that yields a *partial* `fileMetadata` that `Image`'s reader
    rejects, strip the dropped fields from a copy of `_source` before `validate[Image]` while keeping
    the full source for alias extraction (`resolveSearchAfterHit`). Keep this separate from the
    production `resolveHit`/`mapImageFrom`. Cite: deviations §32.

26. **Shared building blocks from D3.** `SearchParamsBody.fromJson(body, tier)` (POST body →
    `SearchParams`) and the lifted private `hitToImageEntity(request, include)` (hit → enriched
    `EmbeddedEntity`) are reused by all new POST/image endpoints (D7/D9). New `*Params`/`*Results`
    case classes go in `ElasticSearchModel.scala` with `OWrites`.

27. **Branch/PR discipline.** One Scala commit per gap (even when building several in one session) so
    each cherry-picks cleanly onto `main` as its own PR. One PR doc per Scala commit
    (`phase-3-d3-searchafter-scala-pr.md` is the template). See `media-api-worknotes.md` for the
    extraction recipe.
