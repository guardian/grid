# Kupua backend → main: PR-impact checklist

A living reminder of **what future backend PR descriptions must disclose**, not a
merge diary, implementation plan or proof of compatibility. Include only the items
relevant to the proposed PR's actual diff against current main. Recheck code and
tests before making any claim; old branch commits are not the review boundary.

## Keeping this lean

- Update in place when a non-trivial main integration or backend change alters
  existing-caller behaviour, isolation, authorization, response shape or resource use.
- Do not record import conflicts, unrelated upstream changes, conflict resolutions,
  commit histories, test-run totals or draft PR descriptions. Remove obsolete items.
- Upstream fixes belong to the baseline: disclose our adaptations, not main's work
  as a new Kupua feature. A clean textual merge does not establish compatibility.

## Must disclose when included in the PR

- **Existing AI/API surface:** [MediaApi](../../../media-api/app/controllers/MediaApi.scala)
  adds conditional `ai-search` discovery and opt-in `aiQuery` ranking text to
  `GET /images`. Explain ranking-text versus filter-query meaning, response embedding
  omission for explicit AI requests, and preservation of main's behaviour without
  the opt-in. Include the discovery change even when ordinary search is unchanged.
- **Shared response code:** [ImageResponse](../../../media-api/app/lib/ImageResponse.scala)
  accepts `includeEmbedding`, defaulting to `true`. Identify callers selecting another
  value and show that existing callers retain their response shape.
- **Shared query/model changes:** [SearchParams](../../../media-api/app/lib/elasticsearch/ElasticSearchModel.scala)
  and [QueryBuilder](../../../media-api/app/lib/elasticsearch/QueryBuilder.scala)
  carry/apply `hasRightsAcquired` for POST reads; GET deliberately leaves it unset.
  State that boundary and its legacy regression coverage—not “no shared-code changes.”
- **New endpoint admission:** [ImageQueryController](../../../media-api/app/controllers/ImageQueryController.scala)
  uses main's `deletedImageUploaderScope`; its body decoder uses `Parser.runResult`
  for defaults and rejects malformed queries before dispatch with HTTP 422 and
  `invalid-uri-parameters`. Disclose the replacement of the POST-only composition
  logic and prior malformed-query fallback. Absent POST q still applies defaults;
  unchanged legacy GET absent-q behaviour is not a promise of whole-path parity.
  Kupua's mapper forwards original q, explicitly using empty q when absent; do not
  describe that client contract as changing legacy GET's omitted-q behaviour.
- **New read contracts and cost:** for the included [POST routes](../../../media-api/conf/routes),
  state access controls, input/work bounds, response omissions, incomplete-execution
  handling and PIT lifetime where applicable. Explain extra Elasticsearch work and
  cancellation limitations; new routes still share service resources. Separate lean
  read handling in [ElasticSearch](../../../media-api/app/lib/elasticsearch/ElasticSearch.scala)
  from existing GET response handling.

## Before describing a change as additive

- [ ] Identify every changed path reachable by existing GET/Kahuna callers, including
      discovery, shared models/builders and serializers; name intentional changes.
- [ ] Cite relevant legacy controls and new-path tests. For integration repairs,
      confirm the regression failed first, then passed; report untested boundaries.
- [ ] Obtain a cold review of the proposed diff against current main and its tests,
      specifically checking upstream preservation and existing-caller effects.
- [ ] Distinguish backend acceptance, Kupua API-mode integration and direct-ES parity.
      Direct-ES alignment comes last; do not imply whole-mode parity from API tests.

Issue status and detailed acceptance belong in the [bug backlog](bug-backlog.md),
not here. This checklist is not authorization to merge, implement, commit or use live systems.
