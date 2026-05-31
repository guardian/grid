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

3. **GET only for reads (current media-api pattern — may change).** All existing
   search params go as URL query strings via `SearchParams.apply(request)` +
   `getQueryString()`. POST body parsing does not exist in MediaApi yet, but IS
   standard across Grid (6 services, ~25 endpoints use `auth.async(parse.json)`).
   Whether new cursor-based endpoints should adopt the Grid-wide POST pattern is an
   **open decision** — see Appendix A of conventions doc. Model implementation:
   `leases/MediaLeaseController.scala:97`. Cite: `ElasticSearchModel.scala:140+`.

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

22. **Before writing any code,** read §14-15 of `media-api-conventions.md`. Open
    questions requiring team input: **GET vs POST for new endpoints (§15.1)**, testing
    bar (§15.2), sort value serialisation (§15.3), cluster PIT overhead (§15.6), and
    `_source` filtering (§15.7). Argo format (§15.4) is resolved. §15.1 is the
    critical blocker — it determines the controller pattern for all cursor endpoints.
