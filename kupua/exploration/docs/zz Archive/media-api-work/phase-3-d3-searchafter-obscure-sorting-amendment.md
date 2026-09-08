# D3 searchAfter obscure-sorting amendment

**Date:** 8 September 2026
**Prototype commit:** `c697cc148` on `mk-next-next-next`
**PR:** guardian/grid#4849 (`mk-api-1of9-searchAfter`)
**Status:** Slice D harvested as `1a0f17842`; final Slice J Scala follow-up pending harvest.

## Why this amendment exists

Kupua now accepts one semantic sort and emits resolved Elasticsearch clauses with automatic
`uploadTime` and `id` suffixes. That containment makes generic secondary states unreachable from
the UI, but D3 is an independent API boundary and must reject unsupported requests deliberately.
Before this amendment, duplicate fields and residual nulls were not rejected, unresolved Kupua
aliases could reach Elasticsearch, and wrong JSON types for `sort` or `sortValues` could be
interpreted as absent values. The last case could silently restart at page one.

This is defensive rejection hardening, not feature expansion. D3 still serves only the resolved
one-semantic-sort contract; it does not implement recursive nullable sort phases.

## What changed

- Added strict body parsing for the resolved sort array and mixed scalar cursor. Malformed JSON
  returns `400 invalid-params` before the data layer is called.
- Rejected duplicate sort fields and unresolved `usagesDateAdded` / `dateAddedToCollection`
  aliases before Elasticsearch.
- Preserved the supported leading-primary null reduction, then rejected any residual null.
- Preserved the existing deliberate cursor/sort arity rejection as `422`.
- Made object-form parsing reject malformed optional `missing`, `mode` and `nested.path` values
  instead of silently dropping them.

The amendment does not change `createSort`, ordinary `GET /images`, source shaping, routes, PIT
architecture, or the intentional truncation of PIT `_shard_doc` values. Existing production
Grid/Kahuna requests do not call the amended D3 path. The one previously documented change to
ordinary ascending Added to collection sorting is untouched.

## Failing-first and review evidence

The first focused `ElasticSearchTest` run failed all five new method-level cases. Residual null and
duplicate requests did not return `InvalidUriParams`; unresolved aliases reached Elasticsearch
and failed as unmapped fields. Strict request-parser tests then failed because no pure D3 body
validator existed. `SortsTest` separately proved that malformed optional object properties were
silently accepted.

An independent contained review returned a production-containment PASS. Its concrete findings
were addressed where they belonged to this amendment: cursor element errors now describe invalid
elements accurately; populated and leading-null cursors have positive parse coverage; and both
new malformed nested-option branches are exercised. A controller harness was not introduced
because no such test surface exists and the workplan explicitly rejects building one solely for
this slice.

## Validation

- `TZ=UTC sbt "media-api/testOnly lib.elasticsearch.SortsTest"`: 14/14 passed.
- `TZ=UTC sbt "media-api/testOnly lib.elasticsearch.ElasticSearchTest"`: 75/75 passed.
- Diff checks and touched-file diagnostics were clean.
- Live TEST in `--use-media-api` mode covered Last used and Added to collection in both directions:
  initial and forward pages were non-empty and disjoint, backward paging reconstructed the prior
  page, cursors retained three slots, and leading-null reduction returned remapped full cursors.
- Synthetic malformed bodies for wrong sort type, wrong cursor type, invalid cursor elements,
  duplicate fields, unresolved alias and residual null all returned deliberate `400` or `422`
  responses with the expected error class.

No live image identity, sort value or metadata value was retained in files or notes.

## Deferred D3 envelope hardening

Present-but-wrong JSON types for `pitId`, `reverse` and `seekToEnd` still collapse to their
absent/default values through permissive parsing. Kupua emits the correct types, so this does not
block the obscure-sorting amendment or affect its supported requests. It should nevertheless be
fixed before D3 carries production traffic, because malformed reverse or end requests could be
served with the wrong direction and a malformed PIT ID could fall back to a live search.

This is D3 request-envelope work. It does not belong to D8's PIT lifecycle endpoint, and it should
not enlarge D7/D8/D9 while those independent endpoints are being built.

## PR-branch transfer

The six-file prototype commit must be harvested onto `mk-api-1of9-searchAfter` only after that
branch's conflicts with `main` are resolved. The final D3 production and test files on the PR
branch must be compared with the prototype branch exactly. Update the GitHub PR description from
the amended `phase-3-d3-searchafter-scala-pr.md` only after that parity check and focused Scala
validation on the PR branch. Never push through an agent.

Slice D was transferred with exact stable patch parity after merging current main and resolving
one import-only conflict. Slice J later added two further D3 corrections: serialize Elasticsearch
Long missing sentinels as null, and reject unsupported non-zero offset. Those two Scala files need
the same separate-checkout transfer, focused validation and user-controlled push before the PR is
again fully current.
