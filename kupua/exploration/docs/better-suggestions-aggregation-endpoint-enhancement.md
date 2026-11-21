# Better suggestions: aggregation endpoint enhancement

**Status: design proposal for review, 5 November 2026.** No implementation, deployment or index migration is authorized by this document. The [API build plan](03%20Ce%20n'est%20pas%20une%20pipe%20dream/api-build/api-build-00-plan.md) owns execution sequencing; this note owns the proposed suggestion behaviour and its unresolved decisions.

## Context and problem

Kupua is a React frontend prototype intended to replace Grid's AngularJS Kahuna. It uses `@guardian/cql` for query chips, with its own suggestion providers and request-lifetime wrapper. An `ImageDataSource` DAL selects media-api or temporary laptop-only direct-ES access. Hosted/API mode never falls back to Elasticsearch. Several new media-api read endpoints were added to preserve existing Kupua workflows; the relevant one is **U6c, `POST /images/aggregations`**.

The current value suggestions have a discovery limitation. Suppose hundreds of unrelated labels are more popular than **Zebra conservation**. Kupua requests a popularity shortlist, then filters those names as the user types. Typing `zeb` cannot discover Zebra if it was absent from that initial shortlist. This is not a CQL parsing problem, nor evidence that the label does not exist.

The proposed change reverses the selection order:

> Select matching field values within the admitted image scope, then return the most popular matches—not matches within a previously selected popularity shortlist.

**Implemented immediate editor option:** label entry now reuses today's CQL-quality suggestions through the shared `createLabelSuggestionProvider`, without any backend change. The editor uses explicit accessible-library scope (`nonFree: "true"`, no selected IDs or browsing filters), while query-chip suggestions retain their current-search scope. Case-insensitive prefix matching preserves popularity within the existing bounded shortlist; missing less-popular matches is accepted for this version. Selection replaces only the active comma-separated token and preserves other input. Failures leave free entry usable. This proposed enhancement improves discovery; it is not a prerequisite for providing the existing level of suggestions. Live mutation remains outside this proposal.

## Current implementation

The path is `CqlSearchInput` → `LazyTypeahead` → providers in `typeahead-fields.ts` → DAL → `ApiDataSource.getAggregations` → media-api.

Metadata and Refine fields reuse those providers through
[`useTypeaheadSuggestions`](../../src/hooks/useTypeaheadSuggestions.ts), which owns
their debounce, bounded display list and cancellation/stale-result suppression.
It prefix-filters fixed arrays only; dynamic provider results retain their matching,
order, spelling and counts. A future contains matcher must not be narrowed again in
this UI loader. Scope and matching remain provider/DAL responsibilities, not hook
options. CQL retains its AST-aware request/publication lifetime in `LazyTypeahead`;
Labels retains its target-bound comma-token lifetime. Neither needs to adopt the
React field loader for backend improvements to reach its shared providers.

- Data-derived providers apply a case-insensitive **prefix** filter locally. Their independent requests usually ask for 50 values. They may instead accept the search store's cached facet buckets, normally 10. Query scope is retained, with the field's own CQL clauses removed when fetching options to avoid self-filtering. The entered fragment is not sent as a bucket-name predicate.
- This affects labels, credits, sources, suppliers, photoshoots, uploaders, crop authors, keywords and successful arbitrary-field aggregation suggestions. Fixed/configured choices are different: their vocabulary is not chosen by popularity. Collections search the loaded tree. Categories use the API catalogue when available, otherwise the shortlist approach.
- `CqlSearchInput` wraps providers as function resolvers. `LazyTypeahead` controls request lifetime and publishes their returned value options without its own value reordering; its local prefix-priority sorting is for field keys. The installed CQL function-resolver path also returns the provider result directly. The shortage originates in Kupua's providers, not an assumed restriction imposed by CQL.
- The request mapper defaults to free-only unless explicitly told otherwise. “Library-wide” therefore needs a deliberately constructed scope, not an assumption that empty frontend parameters mean unrestricted counts.

U6c accepts image-search parameters plus `fields: [{field, size?}]`, optional named `is:` counts and an optional PIT. Each field uses a terms aggregation on its verbatim path. There is no value-name predicate. Counts represent images holding a value, within the admitted scope; multi-valued images can contribute to several values. Size defaults to 10 and is bounded at 10,000. Nested paths are refused; non-aggregatable fields fail. Authentication, query defaults and shared search admission remain authoritative.

U6c migrated the existing provider behaviour; its acceptance criteria did not require discovery outside the shortlist. The enhancement replaces that candidate-selection behaviour, not the chip editor, ordinary CQL image search or the whole DAL.

## Proposed contract and placement

Extend **U6c**, not U3b's sort-profile/keyword-page operation. U6c already owns field-value selection and counts; an optional per-field literal matching specification is a natural extension. These are shared Grid capabilities introduced for Kupua, not a reason to embed Kupua-specific UI policy in media-api.

Keep the existing field, size and image-scope concepts. Add a small typed matching contract—text, match mode and case policy—and consider a bounded list of exact values to exclude. Naming and wire shape are not settled. Do not expose raw regular expressions, scripts or Elasticsearch DSL. Requests omitting the new options must retain existing behaviour.

Proposed semantics:

- **Prefix and contains:** support both deliberately. `zeb` can match `Zebra conservation` by prefix; `ebr` can match it by substring. Contains also finds words later in a multiword value. Default mode per consumer remains a decision.
- **Literal input:** punctuation has no query-language meaning. Multiple words form a contiguous string, not reordered tokens. Escaping belongs at the server's matcher boundary, not in CQL string construction.
- **Case-insensitive matching:** desired, with original values returned unchanged. Case variants remain distinct values with separate counts; matching does not merge or rename them. Unicode semantics must be specified rather than equating case handling with ASCII-only alternatives.
- **Ordering:** image count descending, with a deterministic key tie-break. Do not silently introduce prefix-first or exact-match boosts. Ordinary ES distributed count/ranking limitations are accepted; exhaustive exact ranking is not a new requirement.
- **Scope:** use the existing admitted image scope. Proposed consumer policy is current-search scope for query chips, excluding their own field conditions, and accessible-library scope for label entry. Entry must not accidentally inherit selected image IDs or unrelated browsing filters. Scope and count meaning must agree.
- **Exclusions:** if already-entered values are excluded, apply that exclusion before the result limit. Whether existing image labels should also be excluded belongs to the editor; partially applied labels can still be useful choices.
- **Empty input:** a small popular list. Subsequent input starts a matching request; it must not merely narrow that initial list.
- **Failure:** preserve the distinction between no matches and unavailable suggestions. Keep editing usable; no automatic datasource fallback or global notification requirement.

Elasticsearch's native [terms aggregation value filtering](https://www.elastic.co/guide/en/elasticsearch/reference/8.18/search-aggregations-bucket-terms-aggregation.html#_filtering_values) is the initial implementation candidate. It filters values entering aggregation, including substring patterns. It is not an image-level label query: filtering images alone still admits their nonmatching, co-occurring labels into an unfiltered aggregation.

This can remain in the branch-added aggregation request/execution path plus frontend wiring, without changing legacy endpoints, ordinary CQL search or existing mappings for basic matching on label-style keyword fields. That boundary is justified by ownership, not a prohibition on making a necessary shared change. It does not imply performance isolation from other Grid users.

## Decisions, open questions and mapping relationship

**Settled constraints:** no typo tolerance or synonyms; standard ES counting approximations are acceptable; preserve original selectable values and authorization; no direct ES access in API mode. Labels are the first consumer of a reusable capability, not an audit or implementation of every editable field.

**Direction proposed, not a frozen contract:** matching before popularity limiting; optional matching on U6c; prefix and contains modes; case-insensitive suggestions. Consumer defaults, scope, exclusions and resource limits need agreement.

**Accents:** currently leaning towards deferral, not approved for implementation. Accent equivalence is distinct from casing: matching `É` with `é` does not require matching either with `e`. Any adopted equivalence should be a defined rule for supported textual fields, not a whitelist of particular names. Original spelling and value/count identity must survive.

Case alternatives can be expressed in one matcher without duplicate requests, duplicate indexed values or reindexing. This establishes a mechanism, not a validated Unicode/performance contract. Broader accent equivalence might use query-time rules or a separately indexed normalized representation. The latter requires explicit population of existing documents and a solution for associating matched values with their original spellings—especially on multi-valued fields. Merely filtering images through a folded subfield and aggregating every raw value would reintroduce co-occurrence errors.

The [mapping enhancement proposal](mapping-enhancements.md) addresses a different limitation: text-only fields lack the whole-value representation needed for these suggestions. Bylines should retain their analysed parent and gain an appropriate keyword subfield, populated for existing images. The generic backend should then serve that field without another endpoint change, but Kupua must configure its suggestion path and resolver: `by:` is currently explicitly resolver-less. Keep search, aggregation/suggestion and sort paths distinguishable. A mapping change alone does not wire the UI or enable wildcard CQL.

Normalizing an aggregation field changes its returned keys and can merge values; preserving display spelling and separate counts is not automatic. No mapping migration or reindex is part of this label proposal. The mapping document's broader cost estimates are not estimates for this enhancement.

## Cost, alternatives and acceptance

Contains matching and broad scopes can make each request expensive even when only ten results are returned. Case handling adds matcher work. Test representative cardinalities, short fragments, cold/warm execution and concurrent typing before selecting minimum input lengths, delays or caps. In particular, do not carry the general endpoint's 10,000-value allowance unexamined into interactive matching. A timeout remains failure, not a smaller successful list.

Reuse existing request ownership/coalescing where suitable. Cache identity must include field, text, mode, case policy, exclusions and scope. Never answer a narrower query solely from a previously truncated result. Obsolete results must not publish. API and laptop direct-mode behaviour need an explicit compatibility decision; direct access is not a recovery path for failed API requests.

Alternatives considered:

- **Reuse or enlarge the popular shortlist:** valid for the immediate editor, but does not solve discovery; a larger limit only moves the cutoff.
- **Bounded alphabetical keyword paging:** existing backend capability, but multiple reads and client ranking, case/range complications, and popular candidates missed after an early stop. Not the preferred interactive contract.
- **ES [completion](https://www.elastic.co/guide/en/elasticsearch/reference/8.18/search-suggesters.html#completion-suggester) / [search-as-you-type](https://www.elastic.co/docs/reference/elasticsearch/mapping-reference/search-as-you-type):** useful native features, but not a drop-in answer for distinct values ranked by image counts under arbitrary current filters. Completion uses indexed weights; search-as-you-type returns matching documents and word-prefix behaviour, not automatically arbitrary substrings or distinct value counts. Both introduce indexing considerations.
- **A separate vocabulary index or per-document runtime normalization:** additional maintenance or query cost; not justified before measuring the existing-value approach.

The decisive regression is rare Zebra surviving hundreds of unrelated popular values, including a contains match. Focused acceptance should also establish case/literal handling, exclusion before limiting, scope/count consistency, co-occurring-value rejection, stale-request suppression, unavailable versus empty results, comma-token preservation and unchanged requests without matching options. Verify the actual mapper/provider path, not only hand-written backend requests. Source reasoning is not deployment or performance evidence; no live-system validation was performed for this proposal.

## Source map

- **Providers and scope:** [typeahead-fields.ts](../../src/lib/typeahead-fields.ts#L101), [label resolver](../../src/lib/typeahead-fields.ts#L338), [fallback](../../src/lib/typeahead-fields.ts#L599); [facet sizing](../../src/constants/tuning.ts#L213).
- **CQL integration:** [CqlSearchInput](../../src/components/CqlSearchInput.tsx#L164), [LazyTypeahead](../../src/lib/lazy-typeahead.ts#L160). Installed CQL source inspected: `@guardian/cql/src/lang/typeahead.ts`, `TypeaheadField.resolveSuggestions`; [manifest](../../package.json#L55) declares `^1.8.6`.
- **Entry consumer:** [LabelEditor](../../src/components/LabelEditor.tsx#L46); [editing scope](gradually-growing-teeth.kupua-edits-steps.md#step-3-build-one-useful-disconnected-editor-and-an-operation-receipt).
- **DAL and transport:** [ApiDataSource.getAggregations](../../src/dal/api-data-source.ts#L81), [request mapper](../../src/dal/grid-api-search-adapter.ts#L132), [mode/failure contract](../../src/dal/grid-api/README.md).
- **Backend:** [controller/admission](../../../media-api/app/controllers/ImageQueryController.scala#L193), [request types](../../../media-api/app/lib/elasticsearch/ElasticSearchModel.scala#L313), [aggregation execution](../../../media-api/app/lib/elasticsearch/ElasticSearch.scala#L1197), [label mapping](../../../common-lib/src/main/scala/com/gu/mediaservice/lib/elasticsearch/Mappings.scala#L264).
- **Owning plan:** [U6c contract](03%20Ce%20n'est%20pas%20une%20pipe%20dream/api-build/api-build-00-plan.md#L637). Record an approved contract change there; do not turn this proposal into a second execution sequence.
