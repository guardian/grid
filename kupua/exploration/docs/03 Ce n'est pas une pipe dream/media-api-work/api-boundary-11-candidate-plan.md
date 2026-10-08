# API Boundary 11: Provisional Migration Candidate

> **23 September 2026: build sequencing superseded.** Executing agents use the
> [API build plan](../api-build/api-build-00-plan.md). This document remains the contracts and
> invariants reference (sections 2, 3 and 5 especially). Operator decisions recorded there
> supersede, below: the implementation pause, gating S2 on PR #4957 and section 15, S4 PIT
> lifecycle as a prerequisite (now deferred until after measurement), per-slice hybrid activation
> and the S10 bundling. Rationale: [P34](api-boundary-09-p34-whole-migration-critical-assessment.md).

**Current provisional planning baseline, 23 September 2026; not implementation approval.**
The operator selected this document, routed by the media-api index, over the older inventory/workplan
as the source of migration direction. Implementation remains paused. The next bounded unit is
[post-merge prototype query alignment](#15-post-merge-prototype-query-alignment-workplan), after
PR #4957 acceptance/merge and separate integration authority; S2 remains the first new Grid capability.

**Operator priority, 23 September:** get search, arbitrary-position scrolling, position preservation
and traversal working through APIs first. KUP-029/030 display/effective-enrichment corrections are
known follow-ups explicitly deferred until after a working API-backed app. They are not gates on
query alignment, the core browsing slices or the initial image-read integration. This deferral does
not waive server authorization, data protection, workflow preservation or performance safeguards.

The operator-commissioned P32/P33 characterization round is integrated with qualifications in
[section 14](#14-p32p33-characterization-integration). It adds read/display/measurement obligations
and retains future-editing knowledge, not editing scope, new experiments or an architecture change.
Current-client KUP-001-009, KUP-014/015/016/019 and KUP-024/025 repairs are DONE at their recorded
scope. Registers 06/07 now incorporate their dated completion evidence without closing future API
acceptance or promoting changed files to verified. The [completion records](../../bug-reproduction-evidence.md)
own exact commits, tests, reviews and observation limits; the [usage investigation](../../grid-usage-search-investigation.md)
owns the submitted Grid PR's separate revision, selected contract and pending human review/merge.
The prototype has not imported that repair. Historical proposals below do not override these later
authorizations or the specifically accepted restore cost; unrelated migration decisions remain open.

**Batch A/B addition:** [six client repairs](../../bug-reproduction-evidence.md#bounded-client-repairs-kup-022023026012020021)
and [four focus repairs](../../bug-reproduction-evidence.md#bounded-focus-repairs-kup-013017018027)
have recorded bounded completion, local gates and review. They are independent client improvements,
not new migration prerequisites. **Reverse keyboard Home -> resident End remains reproduced and
UNFIXED under KUP-013**, distinct from the completed End-initiated repair and logo/resetToHome.
The [restarted-app follow-up](../../bug-reproduction-evidence.md#restarted-app-browser-follow-up)
did not independently reidentify the remote stage. First-registration datasource initialization,
no-saved density fallback, pre-native-entry fullscreen timing, physical Esc/macOS animation and
broader availability/API/deployment composition retain their explicit limits, not blanket defect labels.

**Challenge assessed:** [P29 / report 12](api-boundary-12-plan-challenge.md#L1) is complete and remains
unchanged. Section 12 records source-checked dispositions: C1-C3 accepted at their activation/consumer
scope; AI discovery retained only as a conditional alternative. That assessment was not blanket
implementation authority; subsequent bounded work is distinguished below. Whole-corpus readiness remains false. C1-C3 here are
P29 finding labels, not the completed D3 amendment labels.
[The canonical bug backlog](../../bug-backlog.md#L1) separates slice prerequisites, parked independent
work and unresolved classifications.

The operator accepted [report 10](api-boundary-10-integration-review.md) as useful planning input,
authorized this candidate before comprehensive closure, then authorized decision-critical primary
inspection and integration. **P18-P25 are now integrated** with the retained P01-P17 evidence.
Section 10 accounts for the critical journeys and remaining decisions/verification gaps. The single
bounded P26-P28 evidence-completion pass is integrated in section 11, including concrete query
dispositions and independent bug value; it does not establish accepted query differences. This does
not approve signed handles, stronger failure policies, infrastructure, feature reductions,
general performance concessions or another independent challenge. **Stop after this reconciliation;
no implementation, further packet or challenge 12 follows automatically.**

**S1 completion update, 19 September 2026:** S1 was separately authorized, implemented, reviewed,
accepted by the operator and committed. Section 7 records its commit and validation. The remainder
of the migration stays **PROVISIONAL and unapproved**; later client repairs required their own
authorizations and do not complete the API slices.

**Current-client restore update, 20 September 2026:** KUP-024/025 are DONE within P31's bounded
store/import/test scope, with full local gates, independent cold review and the operator's explicit
acceptance of the observed conditional-rank cost. [Evidence and limits](../../bug-reproduction-evidence.md#restore-repair-kup-024-and-kup-025).
This supersedes only their pending local-repair wording below; no Grid/API migration slice,
common-admission correction or KUP-010 recovery work is authorized or completed. Committed as `3975f07f6`.

The [index](media-api-00-index.md) routes current work. The original [capability inventory](media-api-01-capability-inventory.md)
is capability reference and the [endpoint workplan](media-api-02-next-endpoints-d7-d8-d9-workplan.md)
is historical design input, not a competing work queue. Reports and measurements remain evidence,
with later dispositions taking precedence. Registers [06](api-boundary-06-coverage.json) and [07](api-boundary-07-evidence.json)
retain historical receipts, honest staleness, dependencies and qualified evidence. `readyForSynthesis:false` remains
the correct comprehensive-gate result; this candidate is not a pass of that gate.

## 1. Recommended Direction

**Migrate data operations, not Kupua's interaction engine.** Keep navigation and bounded collectors
in Kupua; give Grid a small set of authenticated, bounded image/query/position operations. Reuse
Grid's policy and canonical responses without changing Kahuna's contracts. Retain transitional
direct/hybrid development, and enable a separate API-only mode only after every active owner has
an API path. Fewer browser ES requests alone are not evidence of deployability.

**Operator-selected API extension rule, 23 September:** minimize implementation and production
blast radius, not route count. Apply this preference in order:

1. Reuse an existing endpoint **unchanged** when it already supplies the required contract.
2. Otherwise **strongly prefer a new, isolated additive endpoint** over extending an established
  production endpoint. Reuse internal primitives only while preserving existing callers' behavior.
3. Changing an established endpoint or shared behavior for the migration is an exception requiring
  explicit justification and separate operator approval, not a shortcut to fewer routes.

The target is no intentional behavior change for existing production callers from Kupua migration
work. New routes still require routing, shared-code, deployment and resource/load checks; additive
does not mean risk-free. **D3 is operator-confirmed as Kupua-oriented with limited exceptions**, not
equivalent to a long-established general production endpoint. Identify and protect those remaining
callers before any separately approved adaptation; do not assume exclusive use or blanket permission.
**PR #4957 is a separately commissioned, independently useful Grid correction**, not authority or
precedent for changing established endpoints merely to accommodate Kupua.

**S1 complete: canonical image normalization on the existing D3 client path.**
It corrects the source-established mismatch without a Grid change and establishes a contract for
later detail and selection reads. Section 7 records its accepted scope, commit and validation.
Neither PIT admission nor a bulk cap was a prerequisite for this task.

**First Grid addition: a bounded shallow image window with the admitted query/sort contract.**
Then prioritize source-free live keys and exact rank, followed by ordinary PIT/map and profile
work. These exercise the contracts supporting arbitrary-position browsing. D7 remains useful, but
count-only work does not settle ordered-window, tuple, response or lifecycle compatibility. Its old
position at the front of the queue is not an engineering dependency.

These choices are recommendations, not a menu left entirely to the operator:

- Keep D3 Option B sort-clause transport during this migration. Validate a bounded supported subset
  for new operations; do not introduce a second semantic sort builder without a demonstrated need.
- Keep PIT-less first page, PIT opening and initial ticker/count work parallel. The first page owns
  the retained exact session total; do not make count fusion or open-before-page-one prerequisites.
  Current initial publication awaits their `Promise.all`: parallel initiation is not progressive
  first-page publication, and moving the optional count transport can affect startup latency.
- Keep map and range collection in Kupua initially. Maps use their own PIT; ranges and ranks retain
  live semantics. No shared snapshot across page one, maps, rank, counts and profiles is promised.
- Reuse existing singleton GET. Add bulk hydration separately; use caller-owned enrichment writes.
- Preserve Kupua's AI ranking/result semantics by default, reusing server embedding/query machinery
  in a compatibility operation. Do not silently adopt the different existing Grid AI algorithm.
- Keep canonical image creation and shipped compression. A replacement writer, link removal or
  background per-image enrichment fan-out is not part of this migration.

Completed primary inspection does not justify an automatic client-fix batch. It replaces vague
"check the callers" gates with the concrete acceptance obligations below. S2 remains the recommended
first new Grid capability; S6a can reuse singleton GET independently, with ID-bound publication.
The completed bounded client repairs do not turn independent UX work into new migration prerequisites
or establish correctness of unbuilt API compositions.

## 2. Ownership and Invariants

| Responsibility | Proposed Owner | Concrete Boundary |
| --- | --- | --- |
| Authentication, permission/deleted scope, allowed fields and ordinary ES target | Grid | Authenticate every request; derive tier from the principal; no client target/index or arbitrary query/aggregation DSL. Apply policy before IDs, totals and buckets are exposed. |
| Search interpretation and image policy | Grid | Reuse POST parsing plus D3 deleted-uploader admission, shared filters/runtime prerequisites, per-image visibility where required and canonical `ImageResponse.create`. |
| Sort construction during transition | Kupua, with Grid admission | Keep the current physical clause and authoritative response tuples. New operations accept only supported field/mode/nested/missing options and bounded tuple shapes, not arbitrary ES scripts. Server admission is not a replacement semantic builder. |
| ES execution and raw page progress | Grid | Execute bounded image/key/count/rank/profile reads; keep image validation cardinality distinct from raw scan progress. Renew contexts and report their actual scope. |
| Interaction state and publication | Kupua | Search generations, cancellation, URL/history, focus, selection membership, visible-window commits, scroll geometry, density changes, image traversal and overlay publication stay client-owned. |
| Bounded multi-request work | Kupua initially | Preserve map phases, range endpoint comparison/cap lookahead, keyword walks and profile interpretation. Grid executes each admitted page/query; do not replace these with unbounded server jobs. |
| Media URLs and service configuration | Existing Grid/deployment facilities plus Kupua adapters | Prefer existing secure assets/imgops/service links. No new proxy/service is assumed; actual deployment compatibility is a named cutover blocker. |

Preserve small scrolling through the configured 1,000 default, indexed coordinates through the
65,000 default independently of map readiness, deeper seek, the bounded image buffer, both paging
directions, null tail and End. Preserve the 5,000 range limit, useful total selection size, the
bounded flat AI result set, all current filters and one semantic sort. These are useful workflow
bounds, not permission to lower limits to meet an unknown service budget.

Authoritative tuples remain paired with images and retained across eviction, history and range
anchors. Internal map continuation may retain PIT-specific tuple components; published tuples and
D3 cursors retain the deliberate `_shard_doc` truncation. Approximate deep landing and special-date
histogram presentation remain approximate; exact parent coverage/rank predicates are not weakened
under that exception. Ordinary live-index drift is accepted, not converted into snapshot machinery.

## 3. Concrete API Capabilities

The route names below are **proposed names**, not implemented or reserved APIs. Keep image responses
canonical Argo entities; use typed results for non-image operations. Place specific routes before
the generic image-ID route. Body-heavy reads use D3's authenticated JSON POST pattern, with team
review of the new routes. Existing restricted-machine method rules remain unchanged.

### Common Contract for New Reads

Use a bounded `query` object covering current CQL, six top-level date bounds, uploader, query-scoped
IDs, free/crop/acquired-rights/syndication filters and the selected order. Preserve absence versus
false and current disabled/ignored parameters; do not accidentally enable `payType` or `persisted`
as a side effect. Distinguish ID-only hydration from query-constrained focus lookup.

**Date preservation:** DateFilter deliberately emits local-calendar instants as ISO timestamps;
date-only request strings separately normalize to UTC midnight. Preserve the six exclusive top-level
bounds and the distinct inclusive CQL usage-date syntax. P32 does not establish a mandatory UTC-day
picker correction. Invalid URL date rendering is independent KUP-028; changing the picker timezone
or end-of-day policy needs an explicit decision, not incidental S2 normalization.

Reuse `SearchParamsBody.fromJson`, D3's controller-level positive-deleted uploader restriction,
`QueryBuilder.buildFilterOpt` and required syndication runtime mappings together. A parser alone
is not authorization. The submitted Grid-only PR now owns the selected usage correction: each
negative condition independently excludes an image, while positives match the same usage record;
parsed replaced intent is separate from unchanged deleted-access policy. This intentionally supersedes
P30's grouped-user-negative, browse-only/default-provenance design. Preserve the historical 248-query
characterization separately from the later main-based repair validation. After human acceptance/merge
and separate integration authority, inspect what D3 inherits before proposing additional helpers or
endpoint changes. The prototype's mapper/direct defaults and positional joins remain unresolved;
removing mapper injection alone does not establish complete hybrid alignment.

**Ordered-path activation dependency (P29 C1 accepted):** a new server capability may land inactive,
but enabling a consumer that combines it with D3 requires one agreed interpretation of the same
effective query scope across the first page, continuations and selected window/key/rank operations.
Current D3's composition cannot remain different while new reads are claimed to share its
total/cursor/ordinal contract. Follow the accepted shared Grid changes after merge, then validate
the remaining mapper/direct-ES and affected API joins; no second D3 path or endpoint-specific patch
is assumed necessary. The selected usage-negative change does not authorize unrelated query,
authorization or fuzzy behavior. Operation-specific
ID/null/date scopes and ordinary live/PIT timing remain explicit; equal query meaning does not
promise one universal snapshot. The composed discriminator must compare membership, total and rank,
not only one endpoint's response shape.

**Mapped-field activation dependency (P29 C2 accepted for the known cases):** current client CQL
supports section/publication code-valued print-usage inputs, and the server grammar accepts them,
but its multi-field resolution does not name the mapped absolute leaves. Resolving those cases is
therefore required before S2 and its dependent reads claim to preserve that admitted syntax, including
the D3 join above; it is not an optional future feature. Use the same GRID-008 entry and characterize
sectionCode/publicationCode plus the selected orderedBy path. The operator-selected submitted contract
also includes print section/publication names and an alias-preserving orderedBy fallback; section-name
support is an intentional addition, not a repaired formerly working feature. Digital IDs are not added.
Local Grid-main witnesses passed, but merge, effective deployed aliases and prototype/API alignment
remain open. This dependency classification itself grants no further implementation authority.

[P23's complete 26-member disposition table](api-boundary-09-p23-query-mapping-s1.md#L15) now owns
the field inventory, including URL-only display fields and dormant pinboard declarations. Its earlier
query-difference language is qualified by [P28's concrete A/B/C cases](api-boundary-09-p28-concrete-query-discrepancies.md#L20):
A is current direct Kupua ES, B includes the current mapper before D3, and C is legacy Grid GET.
**No alleged difference is established as operator-accepted.** A historical simplification note is
not approval of these cases, and current wrong predicates are not compatibility promises to preserve.
Keep dormant fields dormant, retain supported functionality and required authorization, and isolate
any approved correction from unrelated GET behavior. Use the named witnesses/configuration conditions,
not a generic request to choose "query parity". Normal ingestion aligns source `id` and document `_id`,
but the general upsert does not enforce that invariant; list whitespace is a separate concrete case.
Root `lastModified` is an image-event timestamp, not exclusively the last human edit. Effective alias
types/cardinality and keyword collation still need their named deployment/engine evidence.

The positional request carries the current resolved sort-clause subset plus scalar/null tuple
values, one semantic order token, direction and an explicit operation. Validate field/type/mode,
tuple arity, unique deterministic ID suffix, null placement and bounded request sizes. Preserve
configured multi-clause expansions and special-date `mode:max`. Arbitrary query scripts and generic
aggregation bodies are not accepted. This is intentionally Kupua-specific, not an ES-agnostic API.
Shared fixtures connect new operations to the existing TypeScript builder; do not call or modify
Kahuna's `sorts.createSort`. [Sort rationale](d3-search-after-03-sort-options.md#L92), E049.

| Capability / Proposed Route | Request and Result | Reuse and New Server Work | Client Consumer |
| --- | --- | --- | --- |
| Existing `POST /images/search-after` | Retain cursor/reverse/End/null behavior, canonical image entities, paired tuples, current total and PIT fields. | Reuse completed D3 and S1. Any narrow query-meaning correction or selected compatibility path needed by C1/C2 must be separately approved and characterized; completed amendment scope does not prove new-operation membership agreement. No automatic failure-policy or legacy GET change. | Main first-page/continuation and focus/history paths must share the agreed admitted meaning with each newly enabled ordered operation. |
| Shallow `POST /images/window` | Admitted query/sort, nonnegative offset and bounded length; canonical images, paired tuples, offset, explicitly scoped optional total and raw execution/progress information. No PIT/cursor on this offset operation. | New from/size path using D3 lean projection and image writer, not legacy GET ordering/envelope. Keep the shallow threshold, default 10,000, and require `offset + length` within the actual admitted result-window budget. An inactive server capability may land before C1/C2 is resolved; its shared browse consumer may not activate. No deep-offset promise from the creation setting. | Replace the positive-offset ES bypass only after the D3/new-read membership join; retain centring, global origin and first-page/session-total ownership. |
| Keys `POST /images/keys` | Admitted query/sort, valued/missing phase, limit, public tuple frontier and optional map context; return ordered `{id, sortValues}` keys, separate lossless continuation, refreshed context and phase exhaustion/execution outcome. | New source-free search. No image model validation, signing or enrichment. Preserve existing map/range page sizes as compatibility inputs pending actual API work-budget validation; do not substitute 200 enriched images. | Existing two-phase map and live range collectors. Map context required for a map attempt, absent for live ranges. Client retains `(from,to]`, null crossing and cap-plus-one logic. |
| Rank `POST /images/rank` | Admitted query/sort and actual landing tuple; complete live count-before result, not a paging total. | Port existing lexicographic scalar/null/selected-max predicates. Check applicable shard completion locally. No mandatory PIT rank or ID re-resolution round trip. | Deep landing, focus/history rank; keep effective tuple and retained session total coherent. |
| Ordinary context `POST /images/pit/open`, `POST /images/pit/close` | Open a server-selected ordinary single-target context; renew through reads; close an accepted context idempotently. Transport stays an explicit pending contract, not a claimed signed token. | Reuse ES PIT primitives and timeout helper. Add admission/open/close actions without changing migration-aware routing/getters or adding storage. See the slice-specific blocker below. | Browse lifecycle and dedicated map lifecycle; retain parallel first page and permitted browse expiry-to-live retry, never map expiry-to-live. |
| Profiles `POST /images/sort-profile` | A fixed operation enum: `scalar-anchor`, `keyword-page`, `date-stats`, `date-buckets`; admitted query, supported sort/field, optional equality/null scope and bounded operation-specific parameters. Typed percentile, composite-page or histogram results with coverage/completion/provenance. | Port supported percentile/composite/stats/histogram building, not a generic aggregation proxy. Keep parent coverage distinct from child-value bucket mass. | Existing scalar/keyword seek and distribution collectors, null-tail labels/ticks and approximate presentation. Preserve keyword page/time limits and the current stats-then-buckets dependency; no automatic request fusion. |
| D7 `POST /images/count` | Admitted query, exact total and configured ticker/subcount results; no hits. Counts describe the requested interval, not implicitly disjoint deltas. | Reuse size-zero exact counting and ticker mapping under the admitted scope, including runtime prerequisites. | Keep first-page session total separate. Preserve implemented KUP-006 baseline-plus-latest cumulative accounting; S7 still requires migrated producer/consumer acceptance. Do not move browse freeze to make intervals disjoint. Unavailable is not zero. |
| Contextual `POST /images/aggregations` | Admitted query and bounded terms/named-filter/nested-parent requests; results keyed by field/name. Distinguish no ID restriction from an explicitly empty allowed set. Bucket count is not corpus total. | New full-context admission over existing ingredients; validate qualified/configured paths and runtime prerequisites. Retain parent counts without promising all buckets or arbitrary DSL. | Ordinary/expanded facets, warm/cold typeahead and collection counts have different scope/cache owners. Preserve exploratory typeahead rather than imposing universal AI-loaded scope. Keep observed default-free, boot-time collection scope for compatibility unless its correction is separately accepted; it is not all-library/current-search count. |
| Existing `GET /images/:id` | Canonical singleton entity with optional included metadata and wrapper links/actions. No new singleton route. | Reuse visibility and canonical creation; retain cropper's expanded metadata and shared getter. | Return normalized image plus overlay and required envelope links/actions, bound to requested ID and caller lifetime. KUP-004's current-client data/absence/loading identity repair is DONE; preserve it through future GET composition. Quiet absence is not proof of nonexistence and never changes selection membership. |
| D9 `POST /images/mget` | Bounded ID-only list; complete successful result contains visible canonical entities, matched by ID. Hidden and missing are indistinguishable. | New ordinary-target bulk fetch, lean projection/parser reuse, per-found-image visibility before enrichment. Item/decode/request failure must not authorize missing-ID repair under the proposed contract. | Inject selection's owner; preserve completed KUP-001 captured-selection ownership through whole-logical-read/API omission handling. ensureMetadata has different, narrower guards. Adding nullable results or abort signals in transport alone is insufficient. |
| AI `POST /images/ai-search`; capability discovery or a distinct readiness action | Separate AI text/admitted filters/weight/useful bound; flat canonical entities/scores, loaded-hit total, overlays and explicitly defined availability. Empty membership remains empty in dependent counts/facets. | Reuse embedding infrastructure for compatible query semantics. If approved availability means configured/admitted capability, prefer a principal-appropriate link/capability on the existing authenticated root over a new health route/request. Keep a separate readiness action only for a different approved question. Neither option is implemented; the current dev probe actually embeds. | Preserve current sort, loaded scope, overlay and quiet absence contracts. Root configuration is not live model permission/readiness; do not silently replace the current gate or serialize ordinary page-one publication behind AI discovery. |

The profile operation variants are fixed algorithms, not extra user features. Exact pagination of
keyword buckets remains distinguishable from an approximate seek that stopped at its existing work
bound. Numeric width/height still need scalar estimation; a distribution descriptor is not a reason
to classify every described field as a keyword.

Shared query admission must not accidentally share every operation's work budget. Source-free keys
need their own admitted page/tuple/byte bounds and must not inherit the image decoder's 200-hit cap.
Preserve existing useful bounds pending selected resource acceptance; this approves no new cap,
concurrency setting or performance concession.

### Contracts That Need Explicit Slice Approval

**Execution and omission policy:** recommend that new exact count/key/rank/window results represent
incomplete execution explicitly and do not publish it as exact success. A short enriched page is not
exhaustion; raw progress is independent of emitted images. For the initial exact image-window contract,
prefer withholding the window on decode/tuple mismatch to silent compaction or unbounded refill.
That is a proposed endpoint-local semantic change requiring explicit agreement in the relevant
implementation brief, not an approved stronger policy inherited from report 10. No global change to
`ElasticSearchExecutions`, GET or current D3 follows. If that policy is not accepted, window/key/rank
activation needs an alternative with honest coordinate/completion semantics; completed S1 is unaffected.

**Failure versus absence:** retain the current development rule for optional Grid data: unavailable
means `null`, no error toast/warning and no ES replacement of server policy. For new primary reads,
recommend nullable successful-result contracts: `null` means do not publish/repair membership; a
successful complete bulk result may authorize missing-ID reconciliation. Singleton absence need not
distinguish hidden, missing and unavailable to the UI. Keep current D3 refusal/expiry classification
inside its existing transport, and no fallback in eventual API-only mode. Do not manufacture `[]`,
zero, a partial map or confirmed missing IDs from request failure. This does not authorize a new
user-facing error policy or stronger current-mode recovery rules.

The current source is not uniformly compliant with quiet absence: range failures can toast, AI
failures can warn/toast, and the unused singleton adapter mixes `null` and thrown outcomes. Do not
describe the directive as a tested property or copy those behaviors into new APIs by accident.
Transport, caller result handling and user-facing policy must be scoped together in an authorized
slice; no global failure-policy repair is implied.

**PIT admission:** keep raw D3 PIT transport unchanged now. The least-change ordinary candidate is
short-lived, server-opened context use without durable storage, but the review has not established
how arbitrary supplied context IDs can be constrained to the admitted target/principal/purpose.
Do not pretend server-controlled opening alone proves that property. Before exposing new open/close
and map-context reads, determine whether the available mechanism can enforce the selected admission
rule. An integrity-protected stateless wrapper is one alternative if raw transport cannot; it needs
separate approval and an actual key/multi-instance arrangement. Neither signing nor storage is a
default prerequisite for non-PIT work. Accept overlapping successor reads, define refreshed-ID/lost-
response handling and distinguish refused/foreign input from expiry; do not introduce single-use
handles that serialize current forward/backward work.

The selected lifecycle transport must interoperate with D3 browse continuations as well as key pages;
an independently protected key context alone does not finish the shared browse lifecycle. This is a
contract dependency, not selection of a signed handle or approval to change current raw D3 transport.

**Work budgets:** do not select D9's production cap from the ES adapter's 1,000/all-parallel policy.
Use a 200-image request with two in-flight chunks as a bounded *evaluation candidate*, anchored to
existing image-page size, not a proven safe/fast production setting. The precise unanswered question
is whether its envelope CPU, heap, payload and selection completion preserve the current useful
workflow at supported selection sizes. Compare alternatives only if that result requires it. No cap,
concurrency slowdown or new campaign is approved here. Likewise, preserve current key page/collector
bounds while validating new transport/admission costs; do not lower 65k/5k limits as a substitute.

## 4. Reuse, Production Effects and Client Changes

| Surface | Reuse | New Work / Explicit Effect |
| --- | --- | --- |
| Controller/model layer | `auth.async(parse.json)`, D3 admission, typed params/results, Argo helpers and `hitToImageEntity`. | Add only the named actions/routes and typed bounded decoders/results. Any extraction used by D3 needs behavior-preservation tests; no global parser replacement or machine POST grant. |
| ES layer | Query/filter/ticker builders, runtime syndication prerequisites, D3 reverse/null/End and lean projection/strip-before-validation, `executeAndLog`, timeout and PIT primitives. | New bounded methods for window/keys/rank/context/profiles/count/aggregates/bulk/AI compatibility. Per-operation completeness checks are proposed, not a shared-wrapper change. Preserve original projected source for aliases. |
| Canonical image policy | `ImageResponse.create`, alias extraction, validity/cost/rights/persistence, existing singleton visibility. | No second image serializer or global lean/full response change. Bulk needs its own per-image visibility check; `hitToImageEntity` does not supply it. |
| Shared Grid callers | Existing GET search, legacy sorts, aggregate routes, existing AI, singleton/download APIs and satellite links. | No incidental contract change from API migration. The separate pending usage-search PR intentionally changes selected exclusions/print fields, not sorting, envelopes, cropper metadata or authorization. It is not imported into this prototype. New routes still compete for JVM/ES capacity and need load acceptance. |
| Kupua DAL | Existing interface and adapter functions, Argo unwrap/link helpers, tuple retention, direct/hybrid test doubles. | Add a pure API implementation of `ImageDataSource` sharing HTTP/mapping helpers with hybrid. It must not construct ES. Inject the selected datasource into selection and collection as well as the main factory. Do not expose a partially implemented API-only mode. |
| Kupua image reads | Accepted S1 normalizer, `extractEnrichment`, `deriveImage` and cache revisions. | Share normalization when GET/bulk becomes a real consumer; preserve image identity, supplied data/links and existing selection-session publication. Keep overlay replacement/absence and retained-selection questions explicit; do not blindly clear or evict selected overlays. KUP-029/030 corrections are operator-deferred until after a working API-backed app, not new initial-path gates. |
| Kupua request/publication | Existing query/store lifecycle, authoritative tuples, entry/search keys and request guards. | Preserve earlier repairs plus bounded initiating-End permission, saved-density restoration, original detail-return ownership and cross-preview centering. These have distinct owners, not one global epoch. Reverse keyboard Home -> resident End remains reproduced/unfixed; no-saved density and narrower native timing remain uncertified. Preserve retained-total/effective-tuple restore and the open E017/API-only recovery boundary. |
| Delivery/bootstrap | Existing Grid host/config serialization, root service links, secure assets/imgops and optional services. | Recommend an additive Kupua entry under existing Grid hosting with allowlisted bootstrap before importing config-dependent modules; preserve Kahuna's entry. Static-host deployment remains an explicit alternative, not a new service by default. Root discovery runs from the route but supplies no config; the media-api config route is crop-only. Retain rendition links and renew/cache by rendition as well as ID; preserve transform quality and download side effects. |

Original anchors: [D3 action](../../../../../media-api/app/controllers/MediaApi.scala#L867),
[filter builder](../../../../../media-api/app/lib/elasticsearch/QueryBuilder.scala#L154),
[D3 execution](../../../../../media-api/app/lib/elasticsearch/ElasticSearch.scala#L754),
[image writer](../../../../../media-api/app/lib/ImageResponse.scala#L58),
[machine methods](../../../../../common-lib/src/main/scala/com/gu/mediaservice/lib/auth/ApiAccessor.scala#L29),
[API mapper](../../../../src/dal/grid-api-search-adapter.ts#L31),
[selection owner](../../../../src/stores/selection-store.ts#L344),
[media helpers](../../../../src/lib/image-urls.ts#L195),
[discovery](../../../../src/dal/grid-api/service-discovery.ts#L33).

[P25](api-boundary-09-p25-delivery-satellites.md#L15) establishes why bootstrap must precede the
application graph: aliases/registry and table columns are constructed at module evaluation, before
the asynchronous route discovery effect. Returning a thumbnail URL alone does not change the current
feature gate. Existing Kahuna serialization is reusable; scraping its HTML or exposing all server
config is not. Effective host, origins, credentials, login return and CSP/CORS still need agreement.

Canonical preview links are not automatically transform-equivalent to local imgproxy: rotation sign,
optional PNG source, transparency/colour, format, DPR and native limits must match the selected
facility. Requested signature expiry is finite; current decoded/in-flight caches and several effects
are keyed only by image ID. Recommend bounded on-demand singleton renewal with rendition/session
ownership, not per-neighbour metadata fan-out or a new signer. Do not use usage-recording download
routes for preview/prefetch. Current Kupua has no active download command to migrate; preserve Grid's
existing download contract without adding a new user workflow by implication.

[P26](api-boundary-09-p26-configuration-evidence.md#L1) now joins the generator, local ingress,
Kahuna asset/build and Riff-Raff declarations. Existing same-Kahuna hosting already has login,
configuration serialization, assets and an allowed-origin entry. Recommend that reuse, with explicit
API/service base URLs and credentialed transport, rather than assuming the development `/api` proxy
exists there or creating a new proxy/service by default. Kupua's entry, pre-import bootstrap and
asset/package integration are still new work. The local imgops container is not the deployed imgops
AMI/configuration; output capability and effective browser/auth policy remain named owner answers.

[P27](api-boundary-09-p27-ai-producer-build.md#L1) narrows S9 further: the existing image producer
requests nominal V4 document float/1536, publishes its first 256 components to the existing ES V4
field, and text query embedding requests V4 query float/256. Reuse the producer, queue/message,
Thrall update, ES field and existing two-handler artifact/CDK pipeline. No second producer, new
vector database, embedding-on-image-read, backfill activation or index migration is justified by
this migration. S3 Vectors need not become the query backend. Numerical/quality/deployment parity
is not inferred from the nominal contract. Backfill has distinct static eligibility and no declared
periodic rule; producer IAM does not establish query-service model permission.

## 5. Workflow Preservation

| Current Workflow | Migrated Data Path | Acceptance Obligation |
| --- | --- | --- |
| Initial search, small-set fill, forward/backward extension, eviction | Existing D3 plus shared normalizer; explicit session-total/count intent. | Same buffer/tuple ordering and generation ownership; no mandatory serial opening/count hop; aborted/stale work cannot publish. |
| Shallow seek, Home/End, indexed and deep browsing | Window, D3, key maps, live rank and typed profiles. | Keep current route choice and global/local coordinate meaning, null tail, both directions and useful limits. Map-pending indexed coordinates remain valid. No deep offset fallback. |
| Focus, sort-around-focus, traversal, density/grid/table change | Same client focus/window/scroll machinery using returned tuples and rank. | Preserve image identity and visible anchoring; no guessed tuple from display aliases, layout rewrite or accepted performance loss. |
| Back/forward, reload, return from detail, saved anchors | Snapshot restoration uses ordinary search/anchor discovery; detail cached-cursor restoration uses selected tuple/rank/neighbours. Entry key, search key and request generation remain distinct. | Preserve earlier lifetimes plus original-return ownership/fresh geometry and cross-preview-centering repairs. E017, broader availability and unverified native-entry/platform edges remain separate. Keyboard Home -> resident End is reproduced/unfixed, not covered by logo-Home completion. No durable session or blanket history/performance guarantee follows. |
| Selection clicks/ranges, off-buffer panels, hydration/reload | Client selection policy, live keys and bounded visible bulk; existing singleton detail. | Preserve `(from,to]`, 5k cap semantics, null crossing, anchor repair, cache revision and late-result guards. Failed/incomplete hydration cannot remove selected IDs. |
| Search filters, facets/typeahead, collections, poll banner/tickers | Admitted query, contextual aggregates and D7 through every owner. | Preserve CQL/top-level date distinctions, independent/expanded scopes, parent counts and poll freeze/deltas. Optional collection/satellite absence stays quiet. |
| AI health/search/reorder | Compatible bounded AI operation and health. | Preserve current ranking contract by default, loaded-hit total/tickers, flat bound, health gate and cancellation. No silent feature removal to simplify transport. |
| Detail/fullscreen/preview/download and enrichment | Normalized canonical entities plus approved deployed media paths. | Preserve labels/edits/aliases, server overlay precedence, image orientation/zoom/traversal, links and download behavior; no reliance on development-only proxies at cutover. |

No virtualizer, geometry, gesture or history redesign is proposed. Existing P09/P10/P13 findings
are integration obligations scoped to the affected slice, not an instruction to repair every source
risk first. Direct/hybrid behavior remains testable throughout; its availability fallback is not
proof of API-only success.

Current distinctions are part of preservation, not missing features to invent: an incompletely filled
small result can still use seek interaction; indexed coordinates do not wait for a map; off-buffer
keyboard traversal can pend an extend while touch carousel/nav strips require resident neighbours.
Selection retains hidden focus deliberately. KUP-013 now preserves initiating focus permission and
required tail placement for End-initiated work; do not clear focus on selection entry. The reverse
keyboard Home -> resident End case remains reproduced and unfixed, not symmetric ownership closure.
A 5k range walk is not a 5k total-selection limit. Collection ancestor
counts retain accepted sibling overcount, and selected metadata can represent the available cached
cohort rather than every selected ID. Normalized/server policy is not consumed uniformly by all
fields; lease summaries, raw leases, root/nested dates and baseline/overlay clocks remain distinct.

KUP-029/030 remain real source-supported display/overlay questions, but the operator explicitly
defers their correction until after a working API-backed app. Do not hold search, scrolling,
position preservation, traversal or initial image-read integration for these refinements. Preserve
supplied data, completed ownership guards and authorization while moving the transport; do not use
the deferral to clear selected overlays, hide existing workflows or claim effective-display parity.
Later work can choose coherent rights/badge and same-ID supersession rules without a cache framework
or universal freshness guarantee. Quota/lease-clock timing remains a separate decision. Display
badges never grant permission.

## 6. Reviewable Slices and Why This Order

Each row is a separately scoped review/authorization unit, not one approved batch. Scala and client
changes should remain separable for review; no commit/branch/PR operation follows from this plan.
The order below prioritizes consequential contracts. Independent rows may advance when a specific
PIT/deployment decision blocks another; that is not permission to dispatch agents automatically.

| Slice | Scope and Dependencies | Why Here / Completion Gate |
| --- | --- | --- |
| **S1: Valid image normalization - DONE** | Existing D3 client mapper, Image/API alias types, alias display accessor and existing tests. No server dependency. | Accepted and committed on 19 September 2026; section 7 records the commit and validation. Any additional image transport still needs separate authorization. |
| **S2: Admitted shallow window** | New-read admission/window and shallow dispatch using completed S1. Separate inactive server work from shared-consumer activation. | PR #4957 is documented as locally validated but pending human review/merge, with no prototype import. After acceptance and authorized integration, inspect inherited D3 behavior before additional changes; validate mapper/direct and new-read membership/total/rank, mapped fields and `offset + length`. S2 and affected issue IDs remain open; protect authorization and unrelated GET/recovery behavior. |
| **S3a: Exact live rank; S3b: Live key/range pages** | Separate methods/consumers sharing the selected admission; preserve the client live collector. Standalone methods are not blocked by every client integration gate. | KUP-024/025 current-client repairs are DONE; a migrated restore consumer must retain their total/tuple/ownership contracts and pass composed acceptance through S5/S10. No count on every page or mandatory serial lookup/rank. KUP-002 ownership remains DONE (`ff932f302`); KUP-003 bounded unknown-order retry is now DONE with real-collector interior witnesses. Migrated collector acceptance remains open. No map slicing or universal snapshot. |
| **S4: Ordinary lifecycle, then dedicated map consumer** | Context admission/open/refresh/close first; map routing/publication second. Uses key pages and the selected shared admission. | KUP-009 current-client explicit-incompleteness discard is DONE; carry whole-map absence and latest-PIT cleanup into migrated acceptance. Context admission/overlap/loss, new-operation completion policy and D3 interoperability remain bounded gates, not whole-corpus closure or a migration/storage programme. |
| **S5: Profile operations and deep navigation** | Scalar/composite/date operation variants and existing collectors, each reviewed separately; uses admitted scope and rank. | Completes the arbitrary-position/deep path while preserving accepted approximations. Check parent coverage, null boundaries and existing work bounds; do not demand exact special-date buckets. Can proceed while S4 is blocked where it uses live reads. |
| **S6a: Singleton detail; S6b: Bulk selection** | Reuse GET with normalized image/overlay/links and ID-bound commit; bulk adds complete logical reads and current-selection guards. S1 is complete. | Preserve KUP-001/004 plus KUP-012 scalar/cached-panel, KUP-020 issuing-loader and KUP-021 detail-media repairs. These do not settle bulk logical omission, normalized GET/overlay composition, ID-based cache validity, untracked thumbnails, Preview error policy or rendition renewal. Bulk capacity/projection policy still blocks S6b, not singleton reuse. |
| **S7: D7 count/poll; S8: Contextual aggregates/collections** | Separate capabilities after S2 admission. Retain initial total and browse freeze; preserve baseline-plus-latest cumulative polling, empty allowed-ID sets, actual typeahead/facet scopes and collection owner. | Preserve earlier count/facet repairs plus configured direct has, literal-safe self-exclusion and current remount cache/ticker/filter callbacks. CQL datasource capture remains first-registration-bound; S8/S10 initialization or any required runtime rebinding is not repaired by live cache getters. Migrated polling, response semantics and collection scope remain distinct; no startup fusion or hot-swap framework is implied. |
| **S9: AI compatibility** | Existing AI contract behind Grid, then the approved availability/discovery and caller contract. Depends on admitted policy and canonical mapping, not PIT. | KUP-005/008 current-client empty-scope/current-sort repairs are DONE, not producer/API acceptance. Preserve ranking/loaded totals and existing Grid AI. Decide configured/admitted capability versus operational readiness; root discovery may avoid a route only for the former. AI readiness must not join ordinary startup's critical path. |
| **S10: Deployed delivery and API-only activation** | Pre-import bootstrap, actual thumbnail/column gates, rendition-aware URL/cache/effect renewal, optional-service wiring and pure API datasource across all owners. Prepare alongside S2/S6; activate after capability/media/auth acceptance. | Verify the CQL element's first-registered datasource is API-only as well as the factory and independent selection/collection owners; no runtime hot-swap feature is required. Keep embedded relationships; quota is a scheduled snapshot and tree/count absence differs. Hosting, transforms/model access and capacity remain external decisions, not reasons to add infrastructure, drop features or assume slower delivery is acceptable. |

This is deliberately **not D7-first**. S1 is independently valuable today; S2/S3 exercise the hardest
ordered-read compatibility while the blast radius is bounded. Counts can reuse the settled query
scope instead of establishing a parallel interpretation. S4's security/lifecycle unknown is isolated,
and delivery/AI prerequisites are surfaced now rather than discovered during final deployment.

**Restore consumer boundary (P29 C3 accepted):** using a forward-page total to select placement while
publishing the retained session total is not repaired by a correct standalone window/rank endpoint.
Similarly, the candidate's effective-tuple promise requires rank and neighbours to describe its
chosen landing tuple. These are activation gates for the migrated restore consumer, not generic API
strengthening or global S2 blockers. Preserve the unchanged-tuple parallel path where feasible.
The separately authorized current-client correction is now DONE: conditional ranking only after a
changed tuple preserves unchanged startup parallelism, with operator acceptance of the measured
exceptional cost and its limits. Retained indexed totals plus zero/subset pages, map states and
changed/unchanged full tuples have executed regressions. This does not certify the future API join,
change continuation counting, weaken the saved-cursor assertion or infer a universal snapshot.

## 7. First Implementation Task: S1

**DONE (19 September 2026), operator accepted.** Fix-only commit
`61f4b0f2c5c006f78ddfc527cae4d73e9fd9a5b0` (`Normalize canonical media-api image responses`)
contains the six source/test files and the S1 changelog item only. This research document is not
part of that commit. The operator-requested cold, read-only subagent review checked the exact diff,
canonical producers and complete touched tests, found no material findings or acceptance blockers,
and recommended accepting S1 within its valid-canonical-response scope.

Validation of the committed source, using Node 22.12.0 and the prescribed repository-root,
foreground npm commands with `set -o pipefail`, `tee` and unsandboxed execution:

- Failing-first adapter run: the canonical nested-edits regression failed on the unchanged mapper
  for the expected wrapped values; all 46 existing tests passed. The first correction passed 47/47.
- Remaining contracts failed first in the three file-metadata cases and three boolean/zero display
  cases, with 92 passing. Final focused runs passed 57 adapter and 41 field-registry tests (98 total).
- Full `npm --prefix kupua test`: 1,402 tests passed across 69 files.
- `npm --prefix kupua run build`: TypeScript and Vite passed.
- `npm --prefix kupua run test:e2e`: 228 passed, including the isolated forced-seek project, in 5.2m.
  The runner used local Docker ES with 10,000 documents, not a live media-api session.

Existing request, cancellation, recovery, enrichment-precedence and probe-no-store-write assertions
remain intact. Normal E2E is direct-ES regression coverage, not live media-api browser verification;
no live-browser or performance campaign was run. No Scala change, new request/endpoint, response
rejection policy, store write or E013/E014/E017/E033 fix is included. Registers 06/07 and historical
packet reports are unchanged; no comprehensive coverage or migration approval follows.

**Implemented brief:** normalize valid canonical image data returned by the existing `apiSearchAfter`
path into Kupua's existing flat `Image` shape, with failing-first contract tests. No new request,
response rejection, sort/filter logic, endpoint, lifecycle policy or store write.

Before S1, the [mapper](../../../../src/dal/grid-api-search-adapter.ts#L35) spread nested edits unchanged;
[the Image type](../../../../src/types/image.ts#L179) and
[labels accessor](../../../../src/lib/field-registry.tsx#L792) expect flat data.
[Canonical edits](../../../../../common-lib/src/main/scala/com/gu/mediaservice/model/Edits.scala#L57)
wrap archived/labels/metadata/rights/photoshoot individually. Existing
[Argo helpers](../../../../src/dal/grid-api/argo.ts#L28) can unwrap entities. At S1,
`mergeReconciledFields` was a canonical `ImageData` identity helper, not this normalizer;
it was removed by the bounded 8 October retirement in the [active build plan](../api-build/api-build-00-plan.md).
No replacement helper or new return-type contract follows.

**In scope:** one pure normalization implementation adjacent to the current mapper, using existing
unwrap helpers where appropriate. Flatten nested edits, including per-label entities and lastModified;
unwrap expanded file metadata when present; preserve usages/leases/collections and all current base
fields. Keep false, zero, empty collections and absent optional data distinct where the current model
does. Preserve actual alias JSON values and adjust the relevant Image/API alias typings without
stringifying booleans. Retain asset/relationship data and authoritative tuples; do not reconstruct
sort values. Extract a shared module only when another real consumer needs it, not a new framework.

**Out of scope:** singleton/bulk routing or DAL return-type expansion, overlay lifetime changes,
delivery wiring, new runtime validation/rejection, missing-entity compaction, count intent, duplicate
query-default correction, wider optional-asset type redesign, E013/E014/E017/E033 fixes, Scala and
performance work. Those changes are separately owned above. Do not fabricate dimensions or MIME
values to make a type assertion pass; surface a concrete blocker if the scoped valid fixtures require
that wider contract change.

Original acceptance criteria, met within S1's valid-response scope:

1. Add a synthetic canonical nested-edits fixture to the existing
   [search-adapter tests](../../../../src/dal/grid-api-search-adapter.test.ts#L69). First demonstrate
  that labels/archived/metadata normalization fails against the pre-fix mapper for the expected
   reason. Reuse the singleton resource shape retained in the [Argo fixture](../../../../src/dal/grid-api/argo.test.ts#L30)
   and the live [standalone tests](../../../../src/dal/api-data-source.test.ts#L195)
   (the legacy fixture suite was retired on 8 October), not live payloads or credentials;
   no new fixture-data collection is needed.
2. Assert flat labels, archived false, nested metadata/rights/photoshoot and lastModified; populated
   and link-only/absent file metadata; boolean/string alias preservation; unchanged complete
   usages/collections dates, leases, assets, identity and upload/soft-delete metadata.
3. Assert image order/cardinality and response tuple arrays unchanged for valid multi-image forward
   and reverse-shaped responses. Do not add new behavior for link-only top-level hits or incomplete
   responses under this task.
4. Keep existing `extractEnrichment -> deriveImage` precedence, returned enrichment and probe-no-store-
   write assertions. The request-body, cancellation and recovery-classification tests must remain
   unchanged in meaning. Existing sparse enrichment-only fixtures need not become a stricter image
   validation suite; do not weaken assertions merely to pass new types.
5. Use the existing field-access contract to show normalized labels are consumable. No component,
   store, geometry or new network work is necessary. Type-check all affected alias consumers; keep
   display conversion at display boundaries and direct-ES behavior unchanged.
6. Run the focused adapter tests failing-first, then the full required Kupua unit/build surfaces.
   Because this intentionally changes fields rendered by browsing/detail/selection, also run the
   existing relevant E2E surface under the repository's runner/port rules before accepting S1.
   Any added assertions go in suitable existing tests. No performance campaign or live system is
   needed to establish this shape correction; any later performance question needs separate approval.

**Done means:** the known valid-response mismatch is corrected and regression gates pass, not that
all canonical/legacy data, image projection, delivery or API-only migration is certified. All later
slices and the remaining migration proposal still require separate authorization.

## 8. Evidence, Checks and Local Blockers

| Evidence / Unknown | Supported Conclusion and Required Future Check | Blocks |
| --- | --- | --- |
| P16/E053-E055 plus the narrow mapper/type/test reads above | The original source/test-read finding established the mismatch. S1 is now corrected; section 7 records failing-first evidence, local regression gates and the cold source review. Historical reports and registers retain their original scope. | S1 complete. No broader canonical/legacy-data, live-browser or migration certification. |
| P28 Q1-Q16 and later usage investigation, qualifying P23/P24 claims | Preserve P28's concrete distinctions and refutations. The later 248-query unchanged-code characterization and separate Grid-main repair validation are recorded in the single investigation, not retroactive P28 execution. Independent usage negatives, positive correlation and selected print fields supersede P30; unrelated query differences are not accepted by implication. | PR review/merge, prototype integration and S2/positional acceptance remain open. Restricted-machine expansion, deleted-access repair, fuzzy and broader malformed-input policy remain unapproved. |
| P13/P17/P18-P25/E033/E057 completion and positional source | Preserve report04's original counterexample. Later [KUP-009 client regressions and review](../../bug-reproduction-evidence.md#bounded-client-repairs-kup-003006009) prove explicit timeout/failed-shard discard, latest-PIT cleanup and usable deep no-map fallback. Raw-map/frozen-window scopes still differ; no live incidence or universal completeness claim. | New-operation policy, exhaustion/tuple alignment and migrated map/range activation remain open. Completed S1 and shared GET/D3 behavior are unchanged. |
| P17/E058 lifecycle | Separate map PIT, live rank/range and parallel browse startup are current facts. Need a bounded admission/overlap/refreshed-ID/lost-response/close contract and corresponding fixtures; browser abort is not ES cancellation. | S4 and API-only lifecycle, not non-PIT slices. Signing/storage remain unapproved alternatives, not assumed answers. |
| P18-P31/E013/E014/E017 and later completion evidence | Preserve earlier restore/navigation evidence and specifically accepted restore cost. Batch B adds bounded End permission, saved-density, original-return and cross-preview-centering repairs, with recorded queued/browser controls and final post-review gates. | E017/KUP-010 and future API composition remain open. Reverse keyboard Home -> resident End is reproduced/unfixed; no-saved density fallback, pre-native-entry promise timing and physical Esc/macOS animation are not newly certified. These independent repairs are not new migration prerequisites or proof of every interleaving. |
| P16/P21/P23-P25 D9 and D017/D024/D030 | Policy/projection/model/consumer source is now joined. Preserve alias leaves, complete relationships and legitimate omission; current hydration, policy consumers and overlay clocks are not uniform guarantees. Cap/concurrency and agreed publication/outcome behavior still need acceptance. | S6b activation; not a request to redo S1 or infer bulk cost linearly from old per-200 measurements. |
| P22-P29/E050 and D026/D030 AI | Current dev health embeds; configured/admitted capability could be advertised through the authenticated root if that meaning is approved. Neither root flags nor nominal vector compatibility establish live readiness. Preserve zero-weight/current-sort/empty-set semantics. | S9 only. Decide the gate's meaning, then characterize principal/config/discovery outcomes. A distinct readiness action remains an option, not a mandatory new route or an equivalent replacement already approved. |
| P24/P25/E056 and D018/D023-D025 delivery/config | Actual bootstrap/discovery/media/satellite source is now joined. Existing Grid hosting/serialization can supply an allowlisted pre-import handoff; the crop endpoint cannot. Effective origin/auth, transform capability and configuration/model admission remain external, with rendition-renewal behavior unbuilt. | S10 and delivery-dependent acceptance, not all planning. No private config read, new proxy, format loss or performance concession is implied. |
| E002-E006, canonical 12 September paired campaigns and D3 investigation | Existing seek/focus/density/traversal/jank measurements are the baseline. Distinct origins/source identities, uncontrolled cache, local media-api/TEST tunnel and hybrid routes limit attribution. Gzip shipped; the one-pass writer was reverted. | No general planning blocker. New operation/topology/load claims require only their genuinely new checks, not another baseline campaign by default. |

Original performance sources: [perceived history](../../../../e2e-perf/results/perceived-log.json)
entries 54-57, [jank history](../../../../e2e-perf/results/audit-log.json) entries 43-44,
[measurement handbook](../../../../e2e-perf/README.md#L167) and
[D3 investigation](d3-search-after-04-performance.md#L222). Historical envelope/signing costs motivate
source-free keys and bounded bulk work; they do not establish production concurrency. Future capacity
checks must name the selected operation, workload and deployment topology that existing evidence
cannot answer. No new performance run, test against live systems or resource concession is authorized.

For later Grid changes use existing controller/query/ES assertion homes and required local integration
tests. For client slices use existing adapter/store/selection/history tests and the required full
unit/build/E2E surfaces, scaled to the touched workflow. Characterize the failing case first and list
old-behavior assertions before editing. A passing mocked shape test is not a deployment/authorization
or performance result. Any real-system verification requires separate per-session permission.

## 9. Explicit Old-Plan Comparison

| Existing Plan Item | Candidate Disposition | Reason / Difference |
| --- | --- | --- |
| B1/B2 cleanup; removed unused `search` | Keep completed cleanup; no resurrection. | Interface history is not a capability requirement. |
| D3 and Option B | Keep completed scope and wire baseline. | First fix client normalization; no semantic-builder migration or renewed D3 readiness programme. |
| A `searchRange` = existing GET wiring | Replace with bounded shallow-window capability for real callers. | GET ordering/envelope lacks Kupua tuple/coordinate contract; do not add a route just for an unused wrapper. |
| D7-first, then D9 | Replace with S1 normalization, S2 admitted ordered window, then positional spine. D7 is independent after admission. | Retires consequential image/order/query uncertainty before accumulating more transports; no inherited document-number order. |
| D7 startup fusion | Do not require it. | Retain first-page total and parallel timing; exact duplicate work is acknowledged, not silently eliminated. |
| D8 multi-index/no-dedup or compulsory durable session | Reject for this scope; ordinary single-target lifecycle only. | Index migration remains unsupported. Admission/loss handling is local unresolved work, not a storage/Thrall mandate. |
| D1 server-complete map / unconditional current completeness | Keep client collector over typed keys; KUP-009 resolves the current explicit-incompleteness exception, not new-operation acceptance. | Avoid image enrichment and distinguish execution completeness from universal snapshot consistency; preserve E033 history. |
| D2 snapshot-bound range or cached-map slicing | Preserve live capped `(from,to]` walk. | Retains current user behavior without new ID-resolution/snapshot work. |
| D4 same-snapshot rank / old selected-max blocker | Port the existing exact live predicate. | Exact rank construction now exists; check execution and actual landing tuple, not a compulsory snapshot join. |
| D5/D6/C3 universally exact positions/buckets | Preserve explicit approximation and exact coverage/null distinctions. | Do not revive rejected expensive exact special-date histograms or lower useful deep-navigation behavior. |
| C1/C2 and corpus aggregate reuse | New full-context admitted aggregates; no route for unused corpus fallback. | Existing GET bucket totals/context are not equivalent. Include collection's independent owner. |
| D9 singleton forced through bulk; implicit cheap 1,000-ID batches | Existing singleton GET plus separately sized visible bulk. | Reuse real capability, avoid unnecessary server work and false sizing; preserve total selection through chunking. |
| Removed response-shape gap / adapter-side enrichment alternative | Shared normalizer, then result-carried caller-published overlays. | Nested baseline shape and publication ownership are real work, not fixed by another cast. |
| AI identical algorithm / client-only route change | Compatibility operation using existing infrastructure. | Preserve current ranking/loaded-result semantics; existing Grid AI stays unchanged. |
| No-browser-ES means deployable | API-only owners plus explicit media/config/auth and load acceptance. | Current delivery/bootstrap still depends on development facilities; do not hide missing capabilities behind hybrid fallback. |

This comparison amends the recommendation in the new candidate only. It does not rewrite report 10,
the old inventory/workplan, historical evidence, accepted compromises or current product behavior.

## 10. Critical-Path Inspection Checkpoint

P18-P25 completed all 171 registered starting files and followed necessary first-party control,
model, test and owning-document dependencies. Coordinator integration added 585 actual reading
receipts across 382 paths, retaining earlier receipts and P01-P17. All 49 concrete first-party paths
named in packet integration requests had full-reading support for their checkpoint versions;
the journey joins below, not that count alone, supported that checkpoint's bounded conclusion.
Those receipts concern the versions examined then. Later repairs changed fingerprints; the refreshed
inventory retains historical reading and marks affected versions stale, without fresh whole-file
verification. This does not certify every path, permutation, external library or deployed capability.

### Covered Journeys and Evidence

| Journey / Boundary | Joined Primary Evidence | What Remains Unproved or Undecided |
| --- | --- | --- |
| Search identity, Back/Forward/reload, Home and return | Earlier restore/input/logo-Home evidence remains. [Batch B](../../bug-reproduction-evidence.md#bounded-focus-repairs-kup-013017018027) additionally records original-return ownership and fresh geometry, without replacing immutable entry identity or native original-entry placement. | E017/KUP-010 and future API/availability joins remain. The controlled keyboard Home -> resident End follow-up is reproduced/unfixed and is not the logo/resetToHome repair. No universal history or symmetric keyboard-ownership claim. |
| Three-tier scroll, seek, focus, density and Home/End | KUP-016 remains complete. Batch B separately covers initiating-End permission and saved-density restoration with queued scheduling, no-map coordinates and actual same-container placement. One review's no-op-arrow finding was demonstrated/corrected before final gates; no second review occurred. | Reverse Home -> resident End remains reproduced/unfixed with remote stage not independently reidentified. No-saved density fallback is uncertified, not automatically known broken. Preserve fresh geometry, true unmount cancellation and map independence; no geometry API or performance-parity claim. |
| Detail/fullscreen, ordered traversal, gestures and return | Preserve KUP-004/019 and the additional issuing-loader, detail fallback/media-lifetime, original-return and cross-preview-centering repairs. [Batch A](../../bug-reproduction-evidence.md#bounded-client-repairs-kup-022023026012020021) and [Batch B](../../bug-reproduction-evidence.md#bounded-focus-repairs-kup-013017018027) distinguish local native evidence, mocked lifecycle cases and restarted-app controls. | Same-exit latest-focus centering is valid. Pre-native-entry promise timing, physical Esc/macOS animation, Preview error policy, ID cache validity/untracked thumbnails, rendition renewal and future GET/API delivery remain separate. No all-tier/native-platform or universal availability guarantee. |
| Selection, range, hydration and metadata presentation | Preserve earlier ownership/range evidence. KUP-012 now has full-recompute oracle, cached add/toggle and actual panel publication controls for incremental scalar empty-member accounting. | That bounded accounting repair is not a bulk/API reconciliation guarantee. Logical-read/failure, overlay/metadata freshness and future consumer acceptance remain distinct; no full-selection scan, total-selection reduction or measured parity follows. |
| AI, facets/typeahead, poll/tickers and enrichment | Preserve earlier empty-scope/expanded/current-sort/poll evidence. KUP-022/023 configured direct has and literal-safe self-exclusion, and KUP-026 current cache/ticker/filter callbacks across actual remounts, are now bounded repairs with recorded tests/review. | The first registered datasource remains captured; runtime rebinding and S8/S10 API-only initialization are unresolved. Unrelated existence/false, nested/fuzzy/date/unknown-field semantics, model/ranking, overlays and API composition retain their prior limits. |
| Every query field, mapping and policy provenance | [P23](api-boundary-09-p23-query-mapping-s1.md#L15) covers all 26 DAL fields and display fields, registry/config/CQL/editing, mappings/settings, date/ID producers and assertions. P24 closes provider wiring; [P28](api-boundary-09-p28-concrete-query-discrepancies.md#L20) corrects the query-difference framing with actual inputs. | No generic choice to accept query differences. Disposition the named defect/configuration/engine cases, ID-list handling and mapped ordering; do not infer deployed settings or operator acceptance from old reports. Root modified time is not last-human-edit-only. |
| Backend admission, execution and actual shared callers | [P24](api-boundary-09-p24-backend-admission.md#L15): full applicable startup/providers/config/error/query/execution and original controller/ES/auth assertions; actual Kahuna/cropper consumers. [Execution wrapper](../../../../../common-lib/src/main/scala/com/gu/mediaservice/lib/elasticsearch/ElasticSearchExecutions.scala#L12) and [D3 results](../../../../../media-api/app/lib/elasticsearch/ElasticSearch.scala#L858) preserve E033/progress/total qualifications. | Endpoint-local incomplete/omission policy, ordinary target/PIT admission/overlap/loss and work-budget decisions remain unbuilt. Startup can create/alias an index, so it is not a permitted read-only probe. Shared GET/auth/sort/execution behavior stays protected. |
| Bootstrap, media and current optional services | [P25](api-boundary-09-p25-delivery-satellites.md#L15): actual entry/discovery/config consumers, signing/expiry/transforms, quota/tree/lease/usage read boundaries and shared download/cropper contracts. [Route discovery](../../../../src/routes/search.tsx#L70) is real but not bootstrap; [Kahuna serialization](../../../../../kahuna/app/controllers/KahunaController.scala#L52) is an existing facility. | Host/origin/login/CSP/CORS, effective config/model access, reachable transform equivalence and capacity are external decisions. Result-carried links, pre-import configuration and rendition renewal are unbuilt client/host work, not unread source. |

### Existing Measurements, Not Another Baseline

P20 inspected canonical records together with actual scenario/helper code. The 12 September P14
families validate ordered **resident** detail identities at normal/fast/rapid forward/backward
cadences, and P15b validates two decoded resident steps while native fullscreen remains active.
Those are traversal evidence, with their recorded frame/layout costs and timing definitions, not a
universal no-jank claim. [P14/P15 scenarios](../../../../e2e-perf/perf.spec.ts#L2192) and
[P20's exact record/interpretation table](api-boundary-09-p20-detail-traversal.md#L66) preserve
revision, source/origin, uncontrolled-cache and local-media-api/TEST-tunnel limits.

JB5 sends keys before clearing traces; its measurement begins at exit and observes visible list
settlement, not all twenty traversal identities/decodes. Do not substitute it for whole traversal.
Network-boundary, all-tier touch, renewed media and API-only/deployed load are not proved by those
resident records. P20's review itself ran no campaign. Subsequently the operator ran the four-repeat
direct-ES "After bugfixes from migration report" campaign, committed with KUP-019. Against the recorded
18 September setup, PP6c settlement rose 255 -> 339 ms (p95 263 -> 381), a slowdown candidate;
P8 blocking rose 1,675 -> 1,950 ms with p95 frame unchanged, a watchpoint. Dirty source fingerprints,
corpus drift and recorded comparability limits prevent attribution solely to the four UX repairs or
blanket parity/slowdown acceptance. [Current chronology and canonical links](../../bug-reproduction-evidence.md#bounded-ux-repairs-kup-014015016019)
are distinct from the separately accepted roughly 68 ms changed-tuple restore median increase and
its four-sample direct-TEST limits. This reconciliation ran no campaign or test; further checks require
a precise unanswered question and separate authority.

### Remaining Decisions and Gates

The primary-reading gaps identified by P18-P24 now have the named P19-P25 counterparts above.
Remaining **decision-critical choices** are the concrete section-11 query/identity/order cases, new exact
operation outcomes, PIT admission/overlap/loss, bulk/key work budgets, overlay/result ownership and
deployed hosting/media/auth/model capability. Recommendations in sections 1-6 stand; these choices
block their named slices or activation, not all planning. Public source cannot settle private
deployment values, and no credential/live inspection was authorized.

Remaining **verification gaps** concern future API composition, refusal/logical-omission outcomes,
datasource initialization, media renewal, broader availability and unbuilt operations. Saved-density,
original-return and cross-preview-centering scopes are repaired; no-saved density fallback and the
pre-native-entry/physical-native limits remain uncertified, not new bug findings. Reverse keyboard
Home -> resident End is specifically reproduced and unfixed. Later bounded client repairs have
dated execution evidence; they are not still unexecuted source hypotheses.
Original packet test-read limits remain historical, and synchronous-return/API-blocking or other
unaddressed fixture limits still apply. No whole-file, universal UI or deployed acceptance follows.
These gaps authorize neither a new fix batch nor another investigation.

Broader corpus/old-history/build/script work remains visible in registers 06/07. The 23 September
refresh records **507 read, 29 partial, 1,029 inventoried** required-file states out of 1,565; reading
states retain historical receipts and changed versions remain explicitly stale. They are not fresh
coverage credit from repairs, test passes or authorship. All **20 dependency statuses remain unresolved**;
only relevant next actions were qualified. No reclassification or verification promotion occurred,
and `readyForSynthesis:false` remains.
E054 is explicitly superseded for S1; its original pre-S1 sources and receipts remain historical,
so the unchanged validator still warns about those historical fingerprints. E013/E014/E017 and
E033 retain their limitations. D033 remains separate/nonblocking and untouched.

The backlog's P29 full-read receipt describes its reviewed version; the coordinator's subsequent
classification amendments leave it honestly stale. No whole-file verification promotion follows.
The earlier P29 integration used known-file metadata only. This 22 September reconciliation used the
existing inventory command with a fresh read-only Git listing at local HEAD, preserving manual
decisions and all old receipts. Three previously unlisted files were inventoried without reading credit;
no Git mutation, packet allocation or source import occurred.

**Current checkpoint:** decision-critical primary inspection and its consequential candidate
integration are complete within the stated boundaries; this is not whole-corpus, implementation,
runtime-correctness or deployment approval. S1's separate completion note and section 7 are preserved.
No product tests, app/browser/live work, credentials, operational repairs, Git mutations or review-
tooling/directive changes were performed by this stage. The additional bounded-pass outcome follows;
no further implementation, packet or challenge 12 is authorized.

## 11. Bounded Evidence-Completion Outcome

20 September: P26-P28 reused current receipts before following deciding sources. The pass added
129 actual full/partial receipts across 116 paths, without restarting P01-P25, altering S1 or
changing classifications/stale flags to manufacture closure. Earlier reports remain historical.
That pass did not execute query witnesses; later unchanged-code characterization and separate Grid-main
repair validation are now recorded in the single usage investigation. Its selected contract supersedes
older P30 recommendations, without accepting unrelated query differences or closing prototype gates.

### A. Questions Answered and Exact Unknowns

| Question | Repository Answer and Original Evidence | Precisely What Remains |
| --- | --- | --- |
| D023 generator/loader/provider wiring | **Source answer:** defaults, dotenv and core-resource merges feed separate service/common-auth outputs; later loader files override earlier ones and overlay Play. [Generator](../../../../../dev/script/generate-config/generate-config.js#L50), [loader](../../../../../common-lib/src/main/scala/com/gu/mediaservice/lib/config/GridConfigLoader.scala#L13); P26 Q1. No additional generator/helper or shaded-converter runtime work is needed. | **Conditional/owner:** selected target's provider/rights/aliases/fuzziness/host values. No generated/private config was read. A stale nextAction is not a reason to reread completed helpers. |
| Host/bootstrap/ingress/auth | **Source answer:** existing Kahuna login/config/assets/build and allowed-origin facilities are reusable. [Host routes](../../../../../kahuna/conf/routes#L5), [bundle entries](../../../../../kahuna/webpack.config.shared.js#L4), [CORS origins](../../../../../common-lib/src/main/scala/com/gu/mediaservice/lib/config/Services.scala#L83); P26 Q2. | **Unimplemented:** additive Kupua entry, allowlisted pre-import bootstrap, build/package/base-URL integration. **Owner:** same-host selection, effective ingress/path/cookie/CORS/CSP policy. Existing declarations do not implement `/api` proxying or admit an arbitrary new origin. |
| Delivery/signing/transforms | **Source answer:** canonical signer, CDN-or-S3 thumbnails and rotation-aware imgops templates exist. [Writer](../../../../../media-api/app/lib/ImageResponse.scala#L77), [deployment AMI selection](../../../../../riff-raff.yaml#L79); P26 Q3/P25. No new signer is justified. | **Owner/check:** selected imgops AMI/recipe revision and deployed transform config, CDN branch, formats/alpha/colour/rotation, allowed origins and effective cache/credential lifetime. The local container cannot answer deployed transform equivalence. Rendition-aware client renewal remains unimplemented. |
| D025 existing script reads | **Source answer:** Alamy consumes GET nested `data.id`; sample uploader follows the permission-gated root loader link. [Alamy read](../../../../../scripts/src/main/scala/com/gu/mediaservice/scripts/AlamyCleanUp.scala#L42), [loader discovery](../../../../../scripts/sample-images/index.js#L30); P26 Q4. Additive reads can preserve both. | No script-to-POST or lockfile campaign is needed. Preserve GET/envelope/link/auth contracts when implementing. Actual operational execution and unrelated dependency correctness are outside this decision; reopen only if those contracts/dependencies change. The conditional pagination bug is separate. |
| D026 AI producer/index/build | **Source answer:** live and backfill eligibility, V4 image-prefix/text dimensions, queue/IAM/network/env declarations, two-handler zip/CI/deployment and mapping-gated Thrall update are inspected. [Producer](../../../../../image-embedder-lambda/src/embedder/embedder.ts#L105), [prefix publication](../../../../../image-embedder-lambda/src/embedder/thrallEventPublisher.ts#L49), [CDK](../../../../../cdk/lib/image-embedder-lambda.ts#L35); P27. Existing infrastructure is reuse. | **Owner/check:** deployed build/artifact and parameter identity, loader enablement/queue binding, any external backfill schedule, query-principal model admission and effective vectors/coverage. No periodic rule is declared. Compatible ranking/zero-weight/health remains S9 work, not a new producer/backfill programme or prerequisite for ordinary browsing. |

Effective deployment facts are not claimed unknowable in principle: the table names the owner/value
or authorized check needed. External provider/library internals, live corpus auditing and unrelated
operational workflows stay outside this pass because no change or stronger guarantee about them is
proposed; reopen only for a selected contract that requires their evidence.

### B. Concrete Query Dispositions

[P28 Q1-Q16](api-boundary-09-p28-concrete-query-discrepancies.md#L20) remains the technical record:
actual inputs, direct-ES/current-mapper-D3/legacy-GET paths, predicates, prerequisites, evidence
strength and refutations. This candidate does not create another query audit or establish broader
acceptance. The later operator-selected usage contract and pending PR are explicit exceptions to
older undecided design wording, not fuzzy/authorization or general query-change approval.
Refuted top-level-date, keyword-JSON-only, legacy-sort and dormant/current-AI
drift framings are not repair tasks. Concrete bugs and unresolved classifications are indexed below;
access-control-sensitive findings receive restrained private-triage routing, not expanded examples.

### C. Independent Bug Value, Not Migration Prerequisites

[Bug Backlog: Kupua and Grid](../../bug-backlog.md#L1) is the canonical standalone index of triggers,
expected/actual behavior, evidence/reproduction limits, smallest checks, responsible components and
dispositions. Human owners remain owner-to-confirm. KUP-014/015/016/019 are completed independent
client improvements, not newly invented migration prerequisites; other independent work remains parked.
This is not a new fix batch. The slice-local gates retained here
are resolution obligations, not an instruction that every item needs an immediate code fix:

| Affected slice | Canonical entries | Why this slice needs resolution |
| --- | --- | --- |
| S2 admitted query path | [KUP-011](../../bug-backlog.md#kup-011), [GRID-001](../../bug-backlog.md#grid-001), [GRID-008](../../bug-backlog.md#grid-008) | Before consumer activation, join D3 first page/continuations and new ordered reads on admitted meaning and known mapped code fields. Landing inactive server code is distinct; no blanket GET rewrite. |
| Migrated restore consumer | [KUP-024 / E013](../../bug-backlog.md#kup-024), [KUP-025 / E014](../../bug-backlog.md#kup-025) | Current-client repairs are DONE. Preserve their retained-total/effective-tuple contracts when connecting S3a/S5 and before S10 acceptance. No standalone rank/window gate, per-page counting or mandatory serial lookup/rank. |
| S3b ranges | [KUP-002](../../bug-backlog.md#kup-002), [KUP-003](../../bug-backlog.md#kup-003) | Current-client ownership and bounded unknown-order retry are DONE. Migrated integration must preserve truthful progress, one swapped attempt and cancellation; S3b is not complete. |
| S4 maps | [KUP-009 / E033](../../bug-backlog.md#kup-009) | Current-client explicit incomplete-execution discard is DONE. Migrated execution/lifecycle acceptance remains open; retain absence/fallback and total-based coordinates, not universal snapshots or measured parity. |
| S6a / S6b image reads | [KUP-004](../../bug-backlog.md#kup-004), [KUP-001](../../bug-backlog.md#kup-001) | Current-client singleton identity and hydration ownership repairs are DONE. Future GET/overlay identity, bulk logical success/omission and migrated-owner publication remain acceptance gates; S6a/S6b are not complete. |
| S7 / S8 / S9 scoped data | [KUP-006](../../bug-backlog.md#kup-006), [KUP-007](../../bug-backlog.md#kup-007), [KUP-005](../../bug-backlog.md#kup-005), [KUP-008](../../bug-backlog.md#kup-008) | KUP-005/006/007/008 current-client repairs are DONE; carry empty scope, baseline-plus-latest polling, expanded ownership and current sort into future API composition. These API slices remain open. |
| S10 API-only recovery | [KUP-010 / E017](../../bug-backlog.md#kup-010) | Verify the composed recovery cannot issue browser ES. Correct pure-API construction may satisfy this without a separate store repair. Private triage applies to current hybrid concerns. |

**Residual boundaries:** [KUP-026](../../bug-backlog.md#kup-026) cache callbacks are repaired, but
first-registration datasource/API-only initialization is unresolved. [KUP-027](../../bug-backlog.md#kup-027)
cross-preview centering is repaired; narrower native timing/platform and broader composition remain
uncertified, not blanket S8/S10 fix requirements. P29 C2/C3
establish the narrower gates for GRID-008's mapped code cases and KUP-024/KUP-025's restore consumer
above. Restore algorithms and the selected print vocabulary now have their separately recorded
decisions/validation; future API composition and upstream/prototype acceptance still remain.
No bug is fixed by reclassification. Unrepaired independent work remains parked.

Independent Grid policy, input robustness, producer, local imgops and script findings remain in
[the Grid backlog](../../bug-backlog.md#grid); independent client findings remain in
[the Kupua backlog](../../bug-backlog.md#kupua). Sensitive entries require private maintainer/security
triage before any expanded public reproduction or issue. S1 is done; refuted claims, missing tests
alone, unimplemented capabilities and legitimate compromises are not active bugs.

### D. Consequential Plan Changes

- **Grid work avoided:** no replacement configuration/provider framework, generic config service,
  new signer, second image embedder, new vector database, automatic backfill/schedule, native-bundling
  migration, shared GET sort rewrite or top-level-date repair. No script-to-POST or lockfile campaign
  is needed to preserve the selected read contracts.
- **Real work retained:** an additive Kupua host entry/bootstrap and asset/package/base-URL wiring;
  rendition-aware client delivery; query-service model admission and compatible AI/health. Existing
  producer IAM cannot supply the query principal's permission by implication.
- **Current S2 requirement:** carry the selected independent usage exclusions, positive same-record
  matching and agreed print fields through the accepted shared Grid code and prototype consumers.
  Reusing parser/filter names alone is insufficient; no P30-specific helper is presumed necessary.
  Legacy GET Q5 is separately valuable
  triage, not permission to weaken D3 or make every Grid bug a migration prerequisite.
- **Query gates narrowed:** preserve P28's unrelated cases while following the later selected usage
  contract and pending PR. No wholesale query change, stronger failure policy or general performance
  concession is approved. Keep S1, one semantic sort and ordinary-live approximations.

### E. Readiness and Stop

**P29 is complete and has been assessed by the coordinator.** Its original report remains unchanged;
section 12 records dispositions and proposed amendments. No new primary-reading packet or fresh
challenge is needed to settle these bounded source questions, and no implementation is authorized.

Still outstanding: named effective deployment/artifact/configuration answers, upstream acceptance and
prototype alignment, the reproduced unfixed reverse keyboard Home -> resident End case, narrower
density/native-fullscreen and availability limits, future composed API checks, and
approval/design of unimplemented endpoint
outcomes, PIT admission and resource budgets. They block the affected implementation or activation,
not assessment of this provisional plan. Broader corpus incompleteness, historical receipts and all
20 dependency statuses remain visible; the unchanged validator reports `readyForSynthesis:false`.
That comprehensive gate is not relabelled a pass by this recommendation.

**Stop for operator approval.** The independent challenge is evidence, not authority to execute its
suggestions. No recursive campaign, fixes, tests/experiments, live work, credentials, Git operations
or tooling changes follow from this coordinator integration.

## 12. Coordinator Assessment of P29

The complete 433-line [challenge](api-boundary-12-plan-challenge.md#L1) was read and its decisive
originals checked. It assessed the prior candidate version identified by its receipts; its original
text and fingerprints are preserved. These dispositions concern the plan, not new runtime
reproduction, approval of query changes or implementation authority. **Historical assessment:** the
table and checklist below record the pre-repair review state. Later current-client repairs, cost
acceptance and the selected submitted Grid contract are governed by the dated records and sections
8/10/13, not by the older pending/unexecuted wording. The original challenge is unchanged.

| Finding / Proposal | Disposition | Reason and Decisive Evidence | Resulting Limit or Amendment |
| --- | --- | --- | --- |
| C1: D3/new-read query meaning | **Accept.** | [QueryBuilder](../../../../../media-api/app/lib/elasticsearch/QueryBuilder.scala#L113) groups injected/user negatives together; [startup](../../../../src/stores/search-store.ts#L2252) takes its first page/total from the cursor path. Corrected new operations can disagree with D3 even on an unchanged index. | Select and approve one admitted meaning at D3 and the new operations before combined-path activation. Server-only code may land inactive; unrelated GET/direct repairs are not blanket prerequisites. Explicit scope/time differences do not become a universal snapshot guarantee. |
| C2: GRID-008 mapped-code dependency | **Accept for the known mapped cases.** | [Client paths](../../../../src/dal/adapters/elasticsearch/cql.ts#L250), [server keys/resolution](../../../../../media-api/app/lib/querysyntax/QuerySyntax.scala#L104) and [mapped leaves](../../../../../common-lib/src/main/scala/com/gu/mediaservice/lib/elasticsearch/Mappings.scala#L293) establish the code-valued preservation obligation. MultipleField handling neither applies SingleField aliases nor adds the nested prefix. | GRID-008 gates S2 activation and its D3/dependent-read join for those cases. Include selected orderedBy resolution in the discriminator; sectionName/sectionId vocabulary and actual ES execution remain open. No shared grammar rewrite or syntax removal approved. |
| C3: restore total and effective tuple | **Accept the consumer gate.** | [Centred results](../../../../src/stores/search-store.ts#L1393) return page total; [restore](../../../../src/stores/search-store.ts#L3919) selects its target from it while publishing retained total; [the consumer](../../../../src/hooks/useScrollEffects.ts#L482) falls back to a local target. Saved rank/current neighbours also differ, and [the assertion](../../../../src/stores/search-store.test.ts#L2430) tests saved-cursor forwarding, not changed-tuple coherence. | KUP-024/KUP-025 gate migrated restore, not standalone APIs. No reproduced loop, snapshot, per-page count or always-serial rank is inferred. Conditional re-ranking is only a proposed option with unapproved exceptional cost. |
| AI capability-in-discovery alternative | **Partially accept: retain as a conditional simplification.** | The [authenticated root](../../../../../media-api/app/controllers/MediaApi.scala#L110) has principal-dependent links and [discovery](../../../../src/dal/grid-api/service-discovery.ts#L49) reads them. But [dev health](../../../../scripts/bedrock-embed-proxy.mjs#L106) actually invokes the model; there is no present AI capability link or equivalent live-readiness guarantee. | Prefer root advertisement only if the approved gate means configured/admitted capability. Keep the separate readiness alternative until that meaning is decided. Neither may serialize ordinary page-one publication behind AI readiness. |
| Window/key budgets and D3 lifecycle compatibility | **Accept as scoped clarifications.** | Current D3 has image-specific bounds and consumes its supplied PIT; [map collection](../../../../src/dal/es-adapter.ts#L1986) has a different source-free page shape. Reuse does not establish one common page cap or an interoperable new handle. | Admit `offset + length`, separate key/image budgets, and make selected context transport work at D3 as well as keys. No cap reduction, signed handle, durable state or resource concession selected. |
| Remaining capability/sequence and parked-bug dispositions | **Accept retention, not new approval.** | The challenge's selected originals support bounded window/key/rank/profile, singleton reuse and independent-owner direction. They do not prove runtime correctness/deployment or require every parked bug to be fixed. | Keep S2 as the first new Grid contract exercise after admission agreement; S6a remains a separable reuse slice. KUP-026/KUP-027 stay conditional; E017/E033/S1 and measurement limits remain. No criticism is accepted merely because it is independent, and no unexecuted improvement is treated as done. |

### Remaining Decisions and Smallest Proposed Checks

- **Admission and activation:** select the narrowly scoped D3 correction or compatibility path used
  by the migrated consumer. Proposed check: actual mapper/admission/D3 and selected new-read fixtures
  for automatic defaults, explicit-negative controls and mapped print-code cases; compare membership,
  total and rank with separate authorization controls. No new ordinary fuzzy behavior is approved.
- **Restore mechanism:** choose retained-total interpretation and effective-tuple handling without
  forfeiting the unchanged-tuple parallel path by default. Proposed check: indexed retained total,
  nonempty untracked/subset pages, map absent/present, then changed/unchanged target tuples. Conditional
  re-ranking cost and race behavior are neither measured nor approved.
- **AI gate meaning:** configured/admitted capability or operational readiness? Proposed check after
  that decision: principal/configuration root-advertisement and client-discovery fixtures; add mocked
  readiness/failure cases only for a selected distinct readiness contract. No model call here.
- **Existing open scope:** endpoint-local incomplete/omission behavior, PIT admission/overlap/loss,
  key/bulk budgets and effective host/auth/transform/model/artifact/capacity answers remain. These are
  named decisions and unexecuted checks, not permission for new packets/live work. The unchanged
  whole-corpus gate remains false.

**Authorized follow-up completed:** the operator commissioned exactly two report-only design briefs,
P30 on C1/C2 and P31 on C3. Their recommendations and coordinator integration are below. This did not
approve query changes, implementation, tests or another investigation. Section 12's dispositions,
the original challenge and S1 section 7 remain preserved.

## 13. Unapproved Design Briefs

The coordinator's 20 September review accepted both briefs as bounded design evidence, not blanket
implementation approval. P01-P29, the original challenge, S1 and existing measurements are unchanged.
**Current amendment, 22 September:** the separately authorized Grid-only usage repair is proposed in
[PR #4957](https://github.com/guardian/grid/pull/4957), locally validated and awaiting human review/merge.
The current A direction below supersedes P30's usage-search implementation proposal, not its historical
report. Prototype integration/activation remains unapproved; no new bug ID or migration-gate closure follows.

### Recommended Boundaries

**A: Shared usage-search repair, then accepted-contract prototype alignment.**
[P30](api-boundary-09-p30-common-admission-d3-design.md#1-decision) remains the historical design brief.
The operator subsequently selected independent image-level exclusions for every negative usage chip,
including generated defaults, while retaining positive same-record matching. The submitted Grid PR
repairs the existing shared builder/parser and mapped print fields; it does not add a browse-only
query abstraction, new AST/default representation or second endpoint. Its print section code/name
contract intentionally adds name matching; publication code/name lookup and the orderedBy fallback
retain applicable configured redirects. Digital section IDs are not silently added.

The [usage-search investigation](../../grid-usage-search-investigation.md#4-proposed-fix-and-compatibility)
owns the current contract, validation limits and delivery order. New D3-specific implementation/tests
wait for Grid acceptance and merge. Then inspect what the shared changes already fix before adapting
the decoder/mapper; sending original q remains a candidate for removing contradictory client-injected
defaults. No endpoint-specific Scala amendment is assumed necessary. Preserve controller-derived
policy, tier filters, validation and all paging/projection/tuple/count behavior. Direct-ES usage
alignment can be developed independently but should follow the accepted contract; unrelated Kupua
fixes remain separately selectable. No prototype repair is authorized by this documentation update.

**B: [P31 restore correctness](api-boundary-09-p31-restore-correctness-design.md#1-decision).**
**Current-client repair DONE after separate authorization, 20 September; committed as `3975f07f6`.** Changes are
only `restoreAroundCursor`, its existing `isTwoTierFromTotal` import and existing regression homes;
an opt-in diagnostic reuses the short perf fixture without changing campaign history or PP contracts.
Start saved-rank and lookup together; select the returned complete tuple
or the existing saved-tuple fallback. Reuse rank only when the whole tuple agrees, otherwise make one
selected-tuple rank call before the unchanged centred helper. Handle the speculative outcome from
creation; an obsolete result cannot delay or fail the selected work. A selected failure stays a failure.

At current-owner publication, sample the retained total once and target
`buf.bufferStart + buf.targetLocalIndex`, using that same ordinal for explicit focus. Use the retained
total, not page totals or map readiness, to select global versus local coordinates. Preserve tuple/
enrichment commit ownership, range cancellation, search generation, PIT-null precedence and small-set
top-up. There is one landing publication, no provisional old-rank buffer and no new geometry abstraction.
The unchanged path has four primary logical DAL calls; a changed tuple has five. Adapter retries,
generic recovery and top-up are separate. Separate direct-TEST diagnostics measured changed-path
median completion 530.5 -> 598.2 ms across four samples per case; the operator accepted this observed
trade-off with corpus/cache/media limits. [Actual gates, cold review and measurements](../../bug-reproduction-evidence.md#restore-repair-kup-024-and-kup-025)
are not a fixed latency promise, API-only acceptance or approval of a broader slowdown.

### First Implementation Scope and Activation

**Current boundary: await the Grid PR's acceptance and merge before new D3-specific work.**
The standalone GET/shared-builder repair is not an S2 implementation or activation. After an explicitly
authorized integration, inspect inheritance and characterize the remaining mapper/direct-ES joins in
their existing test homes; do not recreate P30's superseded composition. Any affected consumer switch
must retain coherent query meaning, not independently active half-fixes. B's current-client one-store-function
consumer correction is complete; its future API composition still needs acceptance and does not gate standalone rank/window
methods or require new Grid infrastructure. S2 remains the first new Grid capability exercise, not a
reason to omit either consumer's activation requirements.

No enabled browse path may mix incompatible predicates. In the current hybrid, direct positional
branches still have raw-intent and policy qualifications. Importing the Grid repair alone will not
certify hybrid parity: validate the affected mapper/direct-ES and positional consumers before claiming
the join complete. An early or partial hybrid activation requires explicit scope and policy decisions,
not silent filter removal or a general CQL rewrite. No second D3 route is selected by this repair.

For a coordinated prototype cutover, stop old clients and start a fresh browse generation with new
membership/count/coordinates. Retire old cursor/map/history-restore metadata for that browse, not
selections or UI preferences; reload alone can retain session state. Do not reuse old ordinals/totals
under the new predicate. Existing best-effort PIT cleanup suffices; no versioned-session framework,
new cursor format, durable store or snapshot promise is proposed. No cutover was performed here.

### Decisions for the Operator

| Decision and concrete example | Recommended answer or explicitly scoped disposition |
| --- | --- |
| Existing D3 correction or isolated compatibility entry? | Wait for Grid acceptance/merge, then inspect inherited behavior and adapt only remaining D3/mapper differences. No new endpoint is selected or assumed necessary. |
| Automatic versus deliberate negatives? | Operator-selected and implemented in the pending Grid PR: every negative usage condition independently excludes the image; positives remain same-record. This intentionally supersedes P30's grouped-negative target. Keep authorization separate. |
| Print vocabulary and orderedBy aliases? | Operator-selected print section code/name and publication code/name repair, with alias-preserving orderedBy fallback, is in the pending PR. Section-name matching is intentional; digital IDs are not added. Ordinary top-level fields stay unchanged. Local alias fixtures do not establish effective deployed configuration. |
| Enable a corrected but mixed hybrid now? | No. Allow inactive work, then enable only a coherent selected path. An early hybrid companion needs explicit scope/policy approval; no blanket query-parity claim. |
| Saved rank 4,200, returned tuple ranks 6,100? | Approved and implemented for the current client: rank the returned tuple once. Preserve unchanged-tuple parallelism and the missing-tuple fallback. |
| Obsolete saved-rank failure or supersession? | Approved and implemented for the current client: ignore handled unselected outcomes; selected failures retain existing recovery, stale work cannot recover or publish. |
| Conditional fifth call and alignment alternatives? | Operator accepted the observed approximately 68 ms changed-path median increase with four-sample direct-TEST limitations. No geometry expansion, fixed latency promise or broader performance concession. Prototype admission/activation remains separately unapproved despite the authorized upstream Grid work. |

### Canonical Bugs and Proposed Checks

Updated existing **KUP-011, GRID-001, GRID-008** remain exact admission/activation prerequisites;
**KUP-024, KUP-025** current-client repairs are DONE; their contracts still gate migrated restore
composition. No new IDs were added. The preserved P30/P31 reports describe their earlier design state.
GRID-008's unconditional orderedBy-failure overstatement is refuted, not the mapped-code defect.
GRID-002 remains independently scoped for private maintainer assessment; the operator has responded
to the related automated PR review and awaits human feedback. No parser-only authorization amendment
is approved. KUP-010/E017 retains its separate S10 composed-recovery gate. The selected independent
usage-negative rule is an intentional behavior change, not a new bug ID. All current dispositions
are in [the backlog](../../bug-backlog.md#L1); no whole-ID closure follows from PR #4957.

**Prototype usage-search alignment and future-API checks remain pending.** P30's wire/AST/authorized
membership/total/continuation cases remain useful inputs, but replace its grouped-negative and
browse-only default-location expectations with the accepted upstream contract. The original report
is preserved. Earlier unchanged-code characterization and the separate Grid-main repair validation
are recorded in [the investigation](../../grid-usage-search-investigation.md#6-executed-checks-limits-and-operator-decisions);
neither credits a repaired prototype join. The window/key/rank matrix remains for future contracts,
not currently callable operations. P31 provides
retained total 30,000 with zero/subset page totals and both map states, non-indexed controls, whole-tuple
changes/ties/nulls, four/five-call deferred controls, missing/failed targets, stale outcomes, PIT expiry,
explicit/phantom focus and existing small-set fill assertions in the store/PIT test homes. No assertion
is weakened to make a new contract appear correct. The separately authorized P31 current-client
regressions and full unit/build/local E2E gates have passed; see the bounded evidence above for coverage
and remaining limits. No authority for other implementation gates follows.

The remaining AI-gate, operation-outcome, context/budget and deployment decisions are unchanged.
Whole-corpus readiness remains false. **Stop for operator approval; no third investigation, product
change, test/experiment, build, performance campaign, live/browser work or Git mutation follows.**

## 14. P32/P33 Characterization Integration

**23 September, accepted with the bounded qualifications below.** The operator commissioned both
reports outside the registry and confirmed their authors had finished before this coordinator round.
Registration is retrospective at their reported revision `c0d659b8ab5b0ffe60644782b7fc6b61d952328b`,
not an invented earlier coordinator dispatch or acceptance. Independent source/test reads in this
round support only the named contracts; no tests, application imports, live calls or experiments ran.
Original [P32](api-boundary-09-p32-kupua-interaction-and-measurement-contracts.md) and
[P33](api-boundary-09-p33-grid-edit-delete-collection-lifecycles.md) remain unchanged.

### Dispositions and Consequences

| Report scope / claim | Coordinator disposition | Concrete migration consequence |
| --- | --- | --- |
| P32 date selection / A1 | **Reject mandatory-UTC defect framing.** [Local picker conversion](../../../../src/components/DateFilter.tsx#L329) produces timestamps; [date-only normalization](../../../../src/dal/es-adapter.ts#L457) applies to different inputs. Existing exclusive-bound assertions do not choose the picker timezone. | Preserve valid instants, exclusive top-level bounds and separate inclusive CQL syntax. No shared Grid date repair, UTC-picker requirement or incidental S2 behavior change. Local-day versus UTC-day and exact day-end policy stay decisions. |
| P32 A2 / chip deletion | **Accept A2 as KUP-028, qualified to dropdown opening**, not automatic page-load failure. Accept chip/query/history preservation with no new chip defect. [Open-only input rendering](../../../../src/components/DateFilter.tsx#L401), [owned typing](../../../../src/components/SearchBar.tsx#L117), [query-only trace selection](../../../../src/lib/orchestration/perceived-navigation.ts#L1). | Keep draft/save/cancel/clear, completed KUP-014/023/026 scopes and query-only entry ownership. Invalid-date robustness is independently parked, not a new migration gate or a CQL/default bug. |
| P32 B1/B3 effective enrichment | **Accept KUP-029/030 at conditional display/publication scope.** The [baseline-only flag assertion](../../../../src/lib/derive-enriched-image.test.ts#L193) does not establish coherent effective display; [hybrid fallback](../../../../src/dal/strangler-adapter.ts#L77) makes overlay-less same-ID reads possible without hot swapping. | **Operator-deferred, 23 September:** correct after a working API-backed app, not before core browsing or initial image-read integration. Preserve supplied values, selected off-buffer data and authorization in the meantime. No S1 reopening, per-image fan-out or cache redesign. |
| P32 B2 quota/clock freshness | **Qualify, no new bug ID.** [One-shot quota](../../../../src/lib/cost/quota-store.ts#L1) and [reference memoization](../../../../src/hooks/useEnrichedImage.ts#L26) are current mechanisms; required invalidation timing is not established. | Retain the existing owner decision about startup quota arrival and lease boundaries. No periodic refresh, timer or subscription is scheduled, and no new performance concession is accepted. |
| P32 C1/C2 measurement | **Accept KUP-031/032 with corrections.** Ack is synchronous acknowledgement, not painted response; [calculator](../../../../e2e-perf/perceived-metrics.mjs#L24) checks finite start only, not every phase or negative duration. [Tests read](../../../../e2e-perf/harness-validation.test.mjs#L737) establish existing fixture expectations, not this defect's reproduction. | Interpret ack/store/first-visible/settled separately. Require valid declared causal intervals for future evidence; no blanket ordering of independent phases, metric rewrite, historical-row alteration or automatic rerun. This does not explain PP6c/P8 or establish parity. |
| P33 metadata edits / syndication | **Accept separate Dynamo/event/ES owners; qualify completion claims.** [Metadata publisher](../../../../../metadata-editor/app/lib/Edit.scala#L14) and [timestamp-guarded projection](../../../../../thrall/app/lib/elasticsearch/ElasticSearch.scala#L242) are reusable. Syndication has detached source/event work (GRID-009) and detached downstream ES futures (GRID-013). | Existing metadata-editor and canonical singleton/search are reusable future capabilities, not replacements to build inside media-api. No current read slice changes; preserve replacement-versus-patch and accepted-versus-visible distinctions for separately authorized editing. |
| P33 soft/hard delete, undelete and delivery | **Accept distinct lifecycle states, reject the soft-delete completion assertion.** [deleteImage](../../../../../media-api/app/controllers/MediaApi.scala#L370) returns Accepted before its discarded status/publish future completes (GRID-012); [marker scripts](../../../../../thrall/app/lib/elasticsearch/ElasticSearch.scala#L289) have no lifecycle guard (GRID-010). | No current migration change or Thrall interlock. Future editing cannot treat 202 as persistence/visibility proof, collapse soft/hard/reaper states, or bypass existing admission. Keep ordering and failure contracts separate from snapshot/index-migration guarantees. |
| P33 collections | **Accept independent tree/membership/count owners.** [Remove read/filter/write](../../../../../collections/app/controllers/ImageCollectionsController.scala#L46) with [unconditional replacement](../../../../../collections/app/store/ImageCollectionsStore.scala#L49) supports GRID-011, omitted from P33's bug table. | Reuse existing hierarchy/membership facilities if editing is later approved. Today's boot-time/default-free-count scope and accepted subtree overcount remain unchanged; no exact-count, cascade, rename/move or bulk-write feature is added. |
| P33 admission and tree/path questions | **Unresolved/decision-only.** The intended metadata-write permission contract requires private maintainer/security confirmation; tree cascade and membership-path validity lack a source-established expected outcome. | No expanded security reproduction, new confirmed authorization bug ID, permission weakening or write endpoint. Route the questions through P33 and the canonical backlog; no next investigator is assigned. |

The [canonical backlog](../../bug-backlog.md#kup-028) contains every actionable disposition:
KUP-028/029/030/031/032 and GRID-009/010/011/012/013 are new source-only entries. No existing bug ID
is closed, broadened or refuted. All ten remain independent work; their narrow relevance above does
not make Grid-only repairs prerequisites for read-only deployment or approve a repair batch.

### Receipt and Evidence Qualifications

- Original report hashes and receipts remain intact. Register receipts credit only declared ranges
  intersected with the actual file extent, or the stated structured pointers; a `full-text` label
  with a shorter explicit range does not credit the missing tail. P32's URL-hook 430-499 range ends
  at actual line 457; several P33 endpoints exceed EOF and its unread `999` placeholders do not
  establish a real complement. Unread text remains uncredited, not silently treated as verified.
- P33's two supposedly blank hash cells are populated and match current files; the contrary closing
  prose is clerical. P32's temporary long JSONL fingerprint does not match; neither ignored temporary
  output is promoted into canonical/application evidence. Changes to current administrative records
  after intake do not invalidate unchanged source; historical document receipts remain version-bound.
- P32's canonical pointers `/entries/54` through `/entries/57` are September 12 records spanning
  direct ES and media-api, **not September 22 direct-ES evidence**. The later campaign remains at
  `/entries/64` and `/entries/65`, compared with September 18 entries 62/63, in the existing
  [completion account](../../bug-reproduction-evidence.md#bounded-ux-repairs-kup-014015016019).
  Reading either report is not new execution or evidence that the working core needs remeasurement.
- P33's claimed two-total-attempt guarantee is not established: source configures a retry argument
  of two, a 20-second timeout and 1 ms delay through the library helper; exact invocation count needs
  library-contract evidence if a future decision depends on it. The [stream](../../../../../thrall/app/lib/ThrallStreamProcessor.scala#L108)
  recovers terminal failures and marks processed. That outer behavior does not await the detached
  syndication updates. The named ES test contains hard-delete and collection cases, not the claimed
  soft-delete/undelete sequence coverage. Missing tests alone are not bugs.

### Future Editing and Stop

P32 retains display/date/history/measurement knowledge; P33 retains authoritative write sources,
replacement payloads, normal Kahuna polling, event/read-model ordering, soft/hard/reaper distinctions
and independent collection owners. Future editing must consult those reports **with these corrections**.
It is separate capability work requiring separate authority, not S11 or an implicit extension of S6.
Current Kupua remains read-only; reuse existing Grid capabilities rather than adding write APIs here.

Exact unresolved questions for their eventual owners: which calendar/day-end contract should the
picker expose; which effective-rights/overlay supersession rule preserves retained selections; whether
startup quota or lease-clock changes require mounted-cell invalidation; what metadata-write admission
is intended (private triage); and whether tree removal cascades or membership must reference a valid
tree node. Proposed isolated checks in the backlog remain unexecuted. No new research campaign is
needed or authorized merely to finish this round.

Preserve S1, all bounded repairs and previous reconciliations, reproduced/unfixed reverse keyboard
Home -> resident End, first-registration datasource and narrower density/native limits. PR #4957
remains documented pending human review/merge, not imported. Existing measurements and accepted
restore-cost limits stand. No composite dependency is closed and whole-corpus readiness stays false.
Stop for the operator with documentation/register edits unstaged; no product, metric, test, live,
operational, upstream or Git action follows.

## 15. Post-Merge Prototype Query Alignment Workplan

**Planning only.** This is the next bounded implementation unit after PR #4957 is accepted/merged,
the accepted revision is established and the operator separately authorizes integration. The current
migration pause remains. S2 is still the first new Grid capability; this unit is its query-meaning
prerequisite, not a new endpoint, an automatic Git/deployment action or S2 completion.

### Goal and Boundary

Make the affected prototype API and direct-ES paths honor the accepted usage/default/print-field
contract before adding a new ordered read. Inspect inherited D3 behavior first; do not assume
another Scala patch is needed. Limit any demonstrated residual to the existing mapper, direct
CQL/default/field owners and their tests, with separately approved D3 adaptation only if necessary.

Preserve independent negative usage exclusions, positive same-record matching, replaced intent,
print code/name support and configured orderedBy redirects as actually accepted upstream. Keep
authorization separate: matching direct-ES behavior is never a reason to weaken D3 admission.
Preserve paging/count intent, canonical image normalization, physical tuples, Option B sort transport,
expiry/refusal handling, date-bound semantics and existing request-publication guards.

No window/key/rank endpoint, D7 transport, PIT redesign, semantic sort builder, general CQL cleanup,
deleted-access repair, editing workflow, geometry refactor or API-only activation belongs here.
KUP-029/030, quota/clock policy and independent Grid/UX repairs are not prerequisites for this unit.

### What Composed Testing Means

Test the query Kupua actually sends after `apiSearchAfter` maps it, then D3 decoding/execution and
returned results. A hand-written request sent directly to D3 bypasses the mapper and can pass while
the real client is wrong. For example, the historical mapper added contradictory default text to
quoted replaced intent that a bare D3 request interpreted correctly. [The recorded exact-body and
backend comparison](../../grid-usage-search-investigation.md#intent-ordering-and-composition-discriminators)
already demonstrates why these are different checks; it is not acceptance of the future merged tree.

On stable synthetic fixtures admitted by the selected policy, compare intended membership, totals
and ordering through actual mapper-to-D3 and affected direct-ES callers. Thoroughly exercise the
changed query builders: independent negatives, positive correlation, quoted/literal replaced intent,
code-only/name-only print fields and alias overrides. Deliberately update superseded negative-grouping
assertions, not unrelated expectations. Add representative composed checks for genuinely distinct
paths such as continuation/lookup, shallow direct dispatch and rank/key/count consumers; do not
multiply every query variant by every browsing journey. Reuse existing collector/restore/geometry
regressions where their behavior is unchanged.

### Gates and Costs

Confirm approved source boundaries and isolated local test infrastructure before execution. Use
failing-first focused checks, required full Kupua unit/build/E2E gates and relevant Scala gates if
server code changes. Direct-only E2E does not prove mapper/D3 agreement. No live operation is
authorized by this workplan; future execution follows the existing safety and test-runner rules.

Do not add HTTP/ES round trips, serialize startup, introduce per-image enrichment requests or reduce
browsing/selection limits. Correct nested clauses can change ES work: name any concrete cost question
and seek scoped measurement authority where justified, using existing comparable baselines. Do not
require another general campaign or make unrelated harness repairs prerequisites. Interpret any
used metrics by their actual boundary; PP6c/P8 remain qualified watchpoints, not attributed regressions.

### Activation, Rollback and Completion

For the operator-controlled prototype, use a short agreed checklist and existing reset mechanisms:
activate compatible client/server meanings together, start a fresh browse generation and discard
affected old total/cursor/map/history-restore coordinates without clearing selection or UI preferences.
A reload alone is not proof those coordinates were retired. No automated cache migration, versioned
session framework or new deployment system is required. Roll back the compatible combination and
reset affected browsing state again; do not mix old and new query meanings.

Stop for upstream-contract changes, missing authority, authorization divergence, unexplained result
disagreement, wider required scope, weakened preservation tests or material unaccepted cost. Record
the exact integrated revision, bounded diff, discriminating results, full gate outcomes and remaining
limits. Close only the demonstrated portions of KUP-011/GRID-001/GRID-008. Then prepare the shallow-
window workplan under separate authorization; new-window budgets/outcome policy, deployment and
API-only acceptance remain later decisions, not additional work in this alignment unit.