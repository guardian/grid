# Hosted Rights and Capabilities Review

**Status: source-backed research for review, 1 November 2026. Not an approved
implementation plan.** This retains the findings behind the deferred crop rights
notices and eligibility work without expanding the mock-cropping feature.

**2 November implementation:** the operator selected read-only step 1 of the
[editing plan](gradually-growing-teeth.kupua-edits-steps.md). Image-level resource
retention is implemented as described below; the [API contract](../../src/dal/grid-api/README.md)
also records on-demand user-session permission snapshots. This does not select
KUP-045/046, crop notices/eligibility or any write workflow.

## 1. Scope and Decisions

- Hosted Kupua consumes media-api image responses. Do not introduce a crop-only
  fetch, permission engine, rights store or background enrichment loop.
- The current crop editor remains mock-only: requests are displayed/logged, never
  submitted, and no crop is created or saved. Notices and eligibility are deferred
  to [KUP-047](bug-backlog.md#kup-047), after shared wiring is reviewed and implemented.
- Direct-ES compatibility is deferred. Approximation is accepted; do not add API
  calls to that route to obtain authoritative permissions or quota information.
- No runtime implementation, live verification or service writes are authorized
  by this note. Receiving a capability is not permission to execute it.
- KUP-029 was refuted for the ordinary hosted path; KUP-030 was closed by AI
  enrichment replacement. Do not reopen them from historical review reports.

## 2. Kahuna Reference

The crop toolbar places these notices between ratio controls and Crop. It switches
on `image.data.cost`; the crop controller does not calculate cost locally.

| Cost | Notice | Styling |
| --- | --- | --- |
| `pay` | Pay to use | White text, red background |
| `overquota` | Quota exceeded for this supplier | Same red styling |
| `conditional` | Restricted use | White text, orange background, flag and help icons |
| Other values | No notice | No Free or separate leased notice here |

The notices are rectangular toolbar-height blocks, approximately 50px high, with
14px Open Sans, 10px horizontal padding and 16px icons. Restricted use has a native
`title`: `restricted use: <usageRights.restrictions>`. It does not read
`usageRestrictions` or metadata special instructions. Conditional categories can
exist without restriction text. No dedicated mobile/tap disclosure is implemented.

Sources: [crop template](../../../kahuna/public/js/crop/view.html#L64),
[notice CSS](../../../kahuna/public/stylesheets/main.css#L1351),
[toolbar CSS](../../../kahuna/public/stylesheets/main.css#L738),
[icons](../../../kahuna/public/js/components/gr-icon/gr-icon.css#L1).

## 3. Independent Facts, Not One Allowed Flag

| Signal | Authority and meaning |
| --- | --- |
| Cost | Server restrictions/category/supplier/quota policy; not a permission flag |
| Rights/restrictions | Returned rights and restriction text; do not recompute cost from this text |
| `valid` | Server usability result including applicable permission/lease overrides |
| `invalidReasons` | All failing checks, including overridden ones; nonempty does not mean `valid=false` |
| Lease display | Information about returned leases; color/counts do not grant permission |
| Resource links/actions | Advertised operations/resources for the caller and image; not interchangeable with cost or validity |

Cost priority is explicit restrictions, category default, agency supplier/collection
and quota, then Pay. Quota depends on server quota data and the `usage-quota-ui`
toggle. Cost calculation merges root rights with user overrides separately; the
returned root rights are not a universal guarantee that every historical override
has been re-merged at request time. Consume the server's distinct outputs as supplied.

Write permission here means the uploader or a principal with `EditMetadata`.
That permission or an active allow-use lease can override rights-related validity
failures. Missing credit/description are non-overridable. The internal-tier
`crops` link is advertised when valid; `edits` is separately permission-gated.
Do not infer crop eligibility from cost, reason emptiness, lease tint or an edit link.

Sources: [cost policy](../../../media-api/app/lib/usagerights/CostCalculator.scala#L34),
[cost merge](../../../media-api/app/lib/ImageResponse.scala#L209),
[validity](../../../media-api/app/lib/ImageExtras.scala#L28),
[per-image permissions](../../../media-api/app/controllers/ImageQueryController.scala#L253),
[link policy](../../../media-api/app/lib/ImageResponse.scala#L147).

## 4. Wire Contract and Current Client Loss

| Response family | Existing contract |
| --- | --- |
| `POST /images/search-after` | Canonical image entities with per-image links/actions |
| `POST /images/window` | Same |
| `POST /images/mget` | Same for each visible returned image |
| `GET /images/:id` | Existing canonical singleton, links/actions |
| `GET /images`, ordinary or AI | Canonical image construction; Kupua uses this GET for AI |
| Rank, keys, sort-profile, count, aggregations | No image entities; no image capabilities belong here |

The new image endpoints already share `hitToImageEntity` and `ImageResponse.create`.
No server endpoint, projection or `include=` change is presently indicated for
retaining crop capabilities. Do not modify legacy GET behavior to solve client loss.

The common mapper retains `optimised`/`optimisedPng` media links and the extractor
retains envelope actions. Its `resource` descriptor now preserves optional image URI
and only the `edits`/`crops` links, resolving [KUP-044](bug-backlog.md#kup-044)'s
image-level loss. API omission produces an empty link list, unlike absent enrichment;
replacement never unions removed capabilities back in. Nested resource controls stay
deferred until an editing consumer needs them; no raw response cache is introduced.

An embedded entity supplies `uri`; singleton `uri` is optional. Preserve it when
supplied and retain the existing discovered image-template mechanism where needed.
`ui:image` points to Kahuna, not the media-api source. The per-image `crops` link
identifies the crop-list resource, not the creation POST endpoint. Kahuna creates
via root discovery's cropper service and its `crop` relation. None should be followed
or executed merely to render a notice.

Sources: [new entity builder](../../../media-api/app/controllers/ImageQueryController.scala#L253),
[normalizer/extractor](../../src/dal/grid-api-search-adapter.ts#L45),
[Argo lookups](../../src/dal/grid-api/argo.ts#L41),
[Kahuna cropper client](../../../kahuna/public/js/services/api/media-cropper.js#L19).

## 5. Shared Ownership and UI Coverage

| Owner | Current retained state and preservation requirement |
| --- | --- |
| Search pages and accepted AI results | Guarded result publication owns the per-ID enrichment map; no mapper-side store writes |
| Standalone detail | Requested-ID-bound image and own overlay, cancelled on supersession; do not move it into the search overlay store |
| Selection hydration | Mget enrichment attaches to each image object; the metadata cache retains that object without publishing into the search map |

The hook prefers own overlay, then shared overlay, then attached image enrichment.
Extend this existing path, not a second capability cache. Successful API omission
of a relation differs from an unavailable authoritative result/direct-mode data.
Keep false and empty values; accepted replacements must not union removed capabilities
with old ones. This does not introduce a universal freshness or session guarantee.

| UI | Existing behavior and proposed shared use |
| --- | --- |
| Grid/table badges | Enriched cost, No-rights precedence, Free hidden, restrictions tooltip; lease tint must not redefine cost or authorization |
| Search single-image panel and detail panel | Both use `ImageMetadata`: validity, overridden reasons, restrictions and deletion precedence |
| Multi-selection panel | Server cost from shared/attached enrichment; rights and lease rows also use the retained cohort's image fields |
| Crop editor | Currently receives raw image, no own overlay or rights notice; future wiring must pass the same enriched facts, including cold/deep-linked detail |

Share facts and classification, not necessarily one visual component for all layouts.
Reuse `CostBadge`/tooltip machinery where appropriate. A compact icon, panel banner
and toolbar block can be different presentations of the same facts.

Sources: [hook](../../src/hooks/useEnrichedImage.ts#L26),
[merge](../../src/lib/derive-enriched-image.ts#L93),
[grid badges](../../src/components/ImageGrid.tsx#L394),
[table renderer](../../src/lib/field-registry.tsx#L387),
[single metadata](../../src/components/ImageMetadata.tsx#L197),
[multi cost](../../src/components/MultiImageMetadata.tsx#L339),
[crop handoff](../../src/components/ImageDetail.tsx#L696).

## 6. Findings and Review Dependency

- [KUP-044](bug-backlog.md#kup-044): image URI and `crops`/`edits` retention implemented
  through common enrichment. Future metadata writes may need nested resource controls
  that current value normalization still flattens.
- [KUP-045](bug-backlog.md#kup-045): no current producer of `leasesSummary`, although
  grid/table and multi-cost use it; single metadata instead derives a raw-lease
  fallback. Existing injected-summary tests are not a producer-to-render witness.
- [KUP-046](bug-backlog.md#kup-046): known validity-reason keys prefer local copy over
  server text. This is the previously unselected B3 correction, not a validity-policy change.
- [KUP-047](bug-backlog.md#kup-047): deferred crop notices and eligibility consumer.
  This is a recorded feature gap, not a claim that the mock editor bypasses write authorization.

**Sequence:** KUP-044's image-level common wiring is implemented; select KUP-047
separately to consume those facts in crop notices and eligibility.
KUP-045/046 remain separately selectable shared-display repairs, not automatic
prerequisites or new migration gates. Review decides whether to include them with
the common work or keep them separate.

Before selecting KUP-047, explicitly choose whether an image not advertised as
croppable may still be inspected/framed in the read-only mock. The recommendation
was to keep mock framing available while showing eligibility separately; that is
not yet an approved gating policy. Notices must remain visible beside the action
in normal and fullscreen layouts. Actual creation/saving/export remains unwired.

Review/test questions for later implementation:

1. Is resource retention shared across page/window/AI, singleton and mget, with
   no added requests, changed publication guards or manufactured capabilities?
2. Do existing tests prove allowed-to-absent replacement, own-overlay priority,
   attached-selection lifetime, preserved false/empty values and resident traversal
   without singleton fan-out? Amend existing suites, not a new matrix framework.
3. If KUP-045 is selected, does one common lease-display summary preserve the
   existing date-based display policy without claiming to replace server eligibility?
4. If KUP-046 is selected, do real metadata-rendering tests cover server custom
   wording, unknown keys, local fallback and the chosen empty-description behavior?
5. Does crop presentation use the same returned facts without recomputing server
   costing/permissions or hiding warnings in fullscreen? What read-only eligibility
   treatment was explicitly approved?

Do not weaken write guards or the exact read-POST allowlist. Links are snapshots,
not authorization tokens; future real operations must remain server-enforced.
Do not use download GETs for probes/previews: they can record usage.

## 7. Evidence and Limits

Static source review covered the canonical response/validity/cost/link builders,
new image controller, legacy GET/AI construction, cropper source validation, all
hosted image decoders, Argo helpers, enrichment merge/hook, singleton and selection
owners, grid/table badges, single/multi panels and crop handoff. Relevant existing
tests were read, not executed. No live API, mutation or deployed permission matrix
was tested; current findings are not production-incident or performance claims.

Documentation cross-checks:

- [Active build plan](03%20Ce%20n'est%20pas%20une%20pipe%20dream/api-build/api-build-00-plan.md#L550):
  U6a singleton ownership, U6d selection, U10-B per-field authority. Historical
  selection-without-enrichment statements are superseded by 30 October.
- [P16 canonical response review](03%20Ce%20n'est%20pas%20une%20pipe%20dream/media-api-work/api-boundary-09-p16-image-response.md#L13),
  [P22 ownership review](03%20Ce%20n'est%20pas%20une%20pipe%20dream/media-api-work/api-boundary-09-p22-query-ui-owners.md#L78)
  and [P25 cropper/delivery boundary](03%20Ce%20n'est%20pas%20une%20pipe%20dream/media-api-work/api-boundary-09-p25-delivery-satellites.md#L90).
- [Candidate 11 singleton contract](03%20Ce%20n'est%20pas%20une%20pipe%20dream/media-api-work/api-boundary-11-candidate-plan.md#L246):
  retained envelope metadata with caller-owned publication; not a new execution plan.
- [Archived data-ownership matrix](zz%20Archive/runtime-configuration-and-data-sources.md#L203)
  and [B3 reason-copy finding](zz%20Archive/runtime-configuration-and-data-sources.md#L511):
  historical evidence, reconciled with current source and the later selection change.
- [Current KUP-029/030 dispositions](bug-backlog.md#kup-029): resolved within their
  recorded scopes; no independent reopening follows from this review note.