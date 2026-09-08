# Obscure sorting interactions — report-only design audit

> **Status:** Audit brief awaiting a fresh reviewer.
> **Deliverable:** Complete the report sections in this file. Do not create a
> second findings document.
> **Mode:** Read-only. Do not modify product code, tests, configuration, or other
> documentation. Read-only file inspection and `git diff`, `git show`, `git log`,
> and `git blame` are allowed. Do not run tests, start or stop servers, drive the
> browser, or access TEST/CODE/PROD infrastructure.

## 1. Decision this audit must enable

Choose the smallest defensible product and API contract for secondary sorts,
missing values, nested sorts, and null-zone pagination.

The preferred outcome is to **remove, reject, or constrain obscure combinations**.
Do not design generic recursive null-zone pagination unless the evidence proves
that a materially used workflow requires it and no simpler restriction is sound.
Checked-in UI reachability, tests, shared-URL compatibility and Git history are
the available usage proxies. No telemetry is expected; absent stronger evidence,
prefer restriction over added protocol complexity.

The immediate merge question is:

> Is media-api D3 `POST /images/search-after`, as currently committed on this
> branch and opened in PR #4849, sound for the sort/cursor requests Kupua can
> actually emit? If not, what is the smallest tightly reasoned amendment or
> explicit rejection contract required before merge?

The secondary question is:

> Should the current uncommitted direct-ES O3 change be committed, narrowed, or
> discarded once that contract is chosen?

## 2. Prefilled problem statement — verify, do not trust

These are starting claims, not conclusions. Every retained claim in the report
must be verified against current code and cited with `path:line`.

1. Commit `fd5fb4c30` fixes direction-independent placement of a primary field's
   missing-value tail during deep seek. It does not implement secondary-sort
   pagination and is not under reconsideration here.
2. Before the current uncommitted O3 change, direct ES detects a null primary
   cursor and falls back to `[uploadTime, id]`, dropping explicit secondaries.
   This can degrade ordering but avoids passing their missing values to ES.
3. The current uncommitted O3 change instead removes only the null primary sort
   and cursor slot. It preserves ordinary explicit secondaries and remaps
   returned tuples, but a missing secondary may leave another `null` in
   `search_after`, which Elasticsearch 8 rejects.
4. Media-api D3 already follows the "remove only the primary" rule. It includes
   nested-primary existence handling, but may share the secondary-null failure.
5. D3 validates cursor length but apparently does not reject `null` values after
   the primary slot with a deliberate client error.
6. Kupua's grid view exposes only a primary sort dropdown and direction button.
   Secondary sorting has no visible standalone control.
7. In table view, Shift+clicking a sortable header can emit a URL such as
   `orderBy=-uploadTime,credit`, but the URL update occurs only after the sort
   lifecycle settles and the gesture is not obvious from the header's accessible
   surface.
8. Table headers expose ordinary fields including Credit, Source, Taken,
   Uploaded, Width and Height. They do not expose Last modified, Usage date, or
   Added to collection in the observed default table.
9. The top sort dropdown can construct a secondary through Shift+click, including
   special date sorts, but this gesture is obscure. Special date sort aliases
   appear to expand correctly only when they are the entire `orderBy` value.
10. The UI prevents selecting the same field as both primary and secondary, but
    `orderBy` is an unrestricted URL string, so duplicate fields remain possible
    through manual/shared URLs.
11. The live browser check on 6 September 2026 restored the app to
    `/search?nonFree=true` after observing `-uploadTime,credit`. No image identity
    or live response payload was written to disk.

If three or more of these claims are materially false, write **R0 —
Premise correction**, explain the corrected problem and give the next audit
question the evidence supports, then stop. A premise-correction-only report is a
valid completed deliverable and is exempt from the remaining report sections and
checklist items. Do not force the requested taxonomy onto a different system.

## 3. Scope

### Tier 1 — required

- `kupua/src/dal/null-zone.ts`, including the current uncommitted diff.
- `kupua/src/dal/adapters/elasticsearch/sort-builders.ts` and its tests.
- Direct consumers in `kupua/src/dal/es-adapter.ts` and
  `kupua/src/dal/strangler-adapter.ts`.
- Sort construction in `kupua/src/components/SearchFilters.tsx` and
  `kupua/src/components/ImageTable.tsx`.
- URL acceptance in `kupua/src/lib/search-params-schema.ts`.
- D3 implementation in
  `media-api/app/lib/elasticsearch/ElasticSearch.scala` and request parsing or
   controller validation directly required to establish its contract.
- The D3 controller, route, request model/JSON readers, error recovery, and their
   tests where required to distinguish a deliberate 4xx from an accidental 5xx.
- D3 Elasticsearch integration tests under
   `media-api/test/lib/elasticsearch/ElasticSearchTest.scala`.
- Relevant D3 PR/workplan/review documents under
  `kupua/exploration/docs/03 Ce n'est pas une pipe dream/media-api-work/` and its
  `zz Archive/media-api-work/` archive.

### Tier 2 — only if needed to resolve a Tier 1 question

- Field registry metadata and sort UI E2E tests.
- Mock data-source parity.
- Git history for the exact null-zone and multi-sort lines.

### Out of scope

- Keyword-distribution completeness and high-cardinality seek (O1).
- Deep-seek direction parsing and histogram coverage (O4/O5), except where a
  proposed restriction would make either unreachable.
- General Elasticsearch, DAL, media-api, performance, or accessibility audits.
- Implementing fixes, writing tests, changing docs other than this report, or
  proposing a generic sorting abstraction.
- Live infrastructure inspection. Existing checked-in fixtures and tests only.

Out-of-scope observations may appear only in a final appendix of at most five
one-line items. Unsourced observations are forbidden.

## 4. Required reasoning

### A. Reachability matrix

Build one compact matrix of **behaviorally distinct classes**, not every field
pair. Aim for 6–12 rows. Include:

- primary-only ordinary sort;
- ordinary secondary whose value is always present;
- ordinary nullable secondary;
- nested/special primary;
- nested/special secondary;
- duplicate fields from a manual URL;
- reverse pagination only if it changes the verdict.

For each class state: UI reachability, URL reachability, direct-ES behavior,
D3 behavior, failure mode, and evidence. Do not infer field nullability from its
TypeScript type alone when mappings, fixtures, or query behavior give stronger
evidence.

### B. D3 soundness

Answer each question explicitly:

1. Can a normal Kupua interaction produce a D3 request that fails because a
   non-primary cursor value is null?
2. Does D3 return a deliberate 4xx for every unsupported shape, or can raw ES
   failure escape as a 5xx?
3. Is D3's nested-primary handling sound for currently emitted special sorts?
4. Does Option B's client-supplied raw ES sort clause imply that D3 must support
   arbitrary nullable chains, or may the endpoint define and validate a narrower
   cursor contract?
5. What exact PR amendment, if any, is required before merge? Name files and test
   cases, but do not write code.

Distinguish these outcomes carefully:

- **Supported and correct**;
- **Unsupported but deliberately rejected with a stable 4xx contract**;
- **Unsupported and capable of accidental 5xx, duplication, omission, or loop**.

Do not call the second outcome a bug merely because it lacks generality.

### C. Minimal product restriction

Evaluate only these candidate policies, plus at most one reviewer-proposed
alternative:

1. Remove secondary-sort interaction entirely and accept only one semantic user
   sort plus automatic `uploadTime,id` fallbacks.
2. Allow secondaries only from an explicit allow-list of fields proven present
   for every matching image.
3. Keep secondary UI but deliberately drop all explicit secondaries when the
   primary null zone begins, documenting degraded ordering there.
4. Keep the current behavior but reject any cursor with null beyond the first
   slot using a deliberate 4xx and a clear client fallback.
5. Implement correct multi-phase pagination across multiple nullable fields.

For each policy give: correctness, direct-ES/D3 parity, user-visible cost,
implementation blast radius, migration/shared-URL impact, and whether it belongs
before D3 merge. Reject policy 5 if it requires multiple query phases or new
cursor state unless strong usage evidence justifies that cost.

Here, a **semantic user secondary** means a second field explicitly chosen in
`orderBy`. It does not include ES clauses required to implement one semantic
sort, nor automatic `uploadTime` fallback and unique `id` tiebreaker clauses.

### D. Current O3 disposition

Choose exactly one:

- **Commit as-is**;
- **Narrow before commit**;
- **Discard and restore prior behavior**;
- **Hold pending one named D3 decision**.

Explain whether the independently found nested-primary direct-ES correction can
stand alone, should accompany O3, or should be discarded because the chosen
restriction makes it irrelevant.

## 5. Evidence rules

- Every factual claim needs a `path:line` citation. Git-history claims also need
  a commit hash.
- Cite current code, not stale line numbers copied from this brief.
- Label any claim that depends on Elasticsearch behavior and tie it to existing
  code comments, tests, or authoritative checked-in documentation. Do not browse
  the web.
- Do not treat an existing test as proof of a case it does not exercise.
- If analysis later refutes an earlier finding, delete or rewrite the finding;
  do not leave both versions in the report.
- Low-confidence concerns belong only in the capped appendix unless they can
  cause a 5xx, omission, duplication, or infinite pagination for a reachable
  request.

## 6. Completed report

### R0 — Premise correction

Not required. Fewer than three of the eleven starting claims are materially
false. Claim 7 needs one correction: table-header sorting is delayed by a fixed
250 ms to distinguish a double-click, not by search-lifecycle settlement
(`kupua/src/components/ImageTable.tsx:1088-1094,1174-1192`). Claim 8 describes
default visibility, not capability: Last modified and Last used are sortable but
default-hidden (`kupua/src/lib/field-registry.tsx:644-685`). Claim 11 is
corroborated by the current session record
(`kupua/exploration/docs/worklog-current.md:123-126`). Neither correction changes
the audit question.

### R1 — Executive decision

**Original hypothesis: amend before merge.** D3 deliberately returns 422 for an
invalid sort shape or cursor length, but a well-shaped cursor containing a
non-primary `null` is converted to JVM `null`, sent to Elasticsearch, and can
escape the controller as an accidental 5xx
(`media-api/app/lib/elasticsearch/ElasticSearch.scala:793-799,888-894`;
`media-api/app/controllers/MediaApi.scala:887-890`;
`kupua/exploration/docs/deviations.md:465-472`).

Adopt **policy 1: one semantic user sort plus automatic `uploadTime,id`
fallbacks**. Remove both Shift+click secondary-sort interactions and canonicalise
comma-separated shared/manual `orderBy` values to their first semantic token at
the URL boundary. The present UI makes secondary sorting an undisclosed modifier
gesture, while checked-in E2E proves that the gesture can emit nullable ordinary
secondaries (`kupua/src/components/SearchFilters.tsx:104-139`;
`kupua/e2e/local/ui-features.spec.ts:484-518`).

**Current O3 disposition: Narrow before commit.** Restore the committed
`uploadTime,id` primary-null fallback and retain only the independently correct
nested-primary existence query. The preservation hunk is unsafe for residual
nulls and incompatible with deep seek's fixed `[null, uploadTime, id]` synthetic
cursor (`kupua/src/dal/null-zone.ts:56-68`;
`kupua/src/stores/search-store.ts:3068-3085`).

Broader recursive pagination is not worth building: the only checked-in normal
interaction is hidden behind Shift+click, while both current implementations
reduce only a leading primary-null slot
(`kupua/src/dal/null-zone.ts:42-83`;
`media-api/app/lib/elasticsearch/ElasticSearch.scala:770-799`).

### R2 — Reachability matrix

Here, “URL” means the current unrestricted `orderBy: z.string()` boundary
(`kupua/src/lib/search-params-schema.ts:26-29`). Reverse pagination is not a
separate row: it reverses clause directions and result order but retains the same
single-leading-null reduction and residual-null limitation
(`media-api/app/lib/elasticsearch/ElasticSearch.scala:764-790,859-866`).

| Behavioural class | UI reachability | URL reachability | Direct ES | D3 | Failure mode and evidence |
|---|---|---|---|---|---|
| Ordinary primary, structurally present (`uploadTime`) | Dropdown and Uploaded table header (`kupua/src/lib/field-registry.tsx:632-643`) | Yes | Supported as `[uploadTime,id]` (`kupua/src/dal/adapters/elasticsearch/sort-builders.ts:83-86`) | Supported with the client clause (`kupua/src/dal/grid-api-search-adapter.ts:98-109`) | None in this class; `uploadTime` and `id` are required model fields (`common-lib/src/main/scala/com/gu/mediaservice/model/Image.scala:8-12`). |
| Ordinary nullable primary (`lastModified`, `credit`, `taken`) | Dropdown; sortable table columns, with Last modified default-hidden (`kupua/src/lib/field-registry.tsx:477-518,619-657`) | Yes | Supported: a leading-null cursor removes the primary and uses fallback fields (`kupua/src/dal/null-zone.ts:42-83`) | Supported by the equivalent leading-null reduction (`media-api/app/lib/elasticsearch/ElasticSearch.scala:770-799`) | Primary-null pagination is correct when the surviving fallback values are present. These fields are actually nullable in the authoritative models (`common-lib/src/main/scala/com/gu/mediaservice/model/Image.scala:12-14`; `common-lib/src/main/scala/com/gu/mediaservice/model/ImageMetadata.scala:9-20`). |
| Ordinary present secondary under a present primary (`uploadTime,uploadedBy`) | Shift+click in dropdown/table (`kupua/src/components/SearchFilters.tsx:104-139`; `kupua/src/components/ImageTable.tsx:1123-1170`) | Yes | Server-returned cursor continuation is positional, but deep seek synthesises numeric anchors for every non-`id` secondary (`kupua/src/stores/search-store.ts:887-906`) | D3 receives the same synthetic cursor from the shared store path (`kupua/src/dal/strangler-adapter.ts:48-56`) | `uploadedBy` is a required string field, but the synthetic anchor is numeric (`common-lib/src/main/scala/com/gu/mediaservice/model/Image.scala:8-13`; `kupua/src/stores/search-store.ts:887-906`). No checked-in test proves this pair seek-safe, so it cannot ground an allow-list. |
| Present secondary under a nullable primary (`lastModified,uploadedBy`) | Shift+click in dropdown/table (`kupua/src/components/SearchFilters.tsx:104-139`; `kupua/src/components/ImageTable.tsx:1123-1170`) | Yes | O3 preserves three reduced clauses, but deep seek supplies only `[uploadTime,id]` after primary stripping (`kupua/src/dal/null-zone.ts:56-68`; `kupua/src/stores/search-store.ts:3068-3085`) | D3 rejects the same reduced-sort/cursor length mismatch as 422 (`media-api/app/lib/elasticsearch/ElasticSearch.scala:773-799`; `media-api/app/controllers/MediaApi.scala:887-890`) | Ordinary extension may work while deep null-zone seek is deliberately rejected by D3 and fails at ES in direct mode. This disproves a general “present-secondary” contract. |
| Ordinary nullable secondary (`uploadTime,taken`, `lastModified,credit`) | Yes; checked-in E2E exercises Credit then Source (`kupua/e2e/local/ui-features.spec.ts:484-518`) | Yes | A null outside slot 0 bypasses null-zone detection and is sent to ES; inside a primary null zone O3 preserves it (`kupua/src/dal/null-zone.ts:52-68`; `kupua/src/dal/es-adapter.ts:944-1000`) | D3 likewise recognises only slot 0 and converts surviving `JsNull` to JVM `null` (`media-api/app/lib/elasticsearch/ElasticSearch.scala:770-799,888-894`) | Reachable continuation can produce an ES rejection. Checked-in ES notes record that `null` in `search_after` causes an NPE/500; D3 recovers only `InvalidUriParams` (`kupua/exploration/docs/deviations.md:465-472`; `media-api/app/controllers/MediaApi.scala:887-890`). |
| Special primary only (`usagesDateAdded`) | Dropdown; Last used table column is default-hidden (`kupua/src/lib/field-registry.tsx:659-685`) | Yes | Current nested-primary hunk correctly wraps `exists` using the `usages` path (`kupua/src/dal/null-zone.ts:70-80`) | D3 reads the nested path from the supplied primary sort and excludes populated parents; an integration test covers it (`media-api/app/lib/elasticsearch/ElasticSearch.scala:777-790`; `media-api/test/lib/elasticsearch/ElasticSearchTest.scala:871-906`) | Supported and correct only for the tested primary-only null transition. |
| Special primary only (`dateAddedToCollection`) | Dropdown-only (`kupua/src/lib/field-registry.tsx:1059-1075`) | Yes | Root-level `exists` is appropriate because collections use an object mapping, not `nested` (`common-lib/src/main/scala/com/gu/mediaservice/lib/elasticsearch/Mappings.scala:241-255`) | D3 applies the same root-level path (`media-api/app/lib/elasticsearch/ElasticSearch.scala:780-787`) | Mapping evidence supports the mechanism, but the focused D3 test substitutes `uploadTime,id`; primary-only collection sorting is not integration-proved (`media-api/test/lib/elasticsearch/ElasticSearchTest.scala:1195-1203`). |
| Special sort combined with a secondary | Toolbar Shift+click can choose every dropdown option (`kupua/src/components/SearchFilters.tsx:104-139,216-226`) | Yes | Whole-value special expansion is bypassed after a comma, so a literal alias loses path, `mode`, `missing`, and nested configuration (`kupua/src/dal/adapters/elasticsearch/sort-builders.ts:91-113,115-158`) | D3 faithfully applies that unresolved literal field (`kupua/src/dal/grid-api-search-adapter.ts:98-109`; `media-api/app/lib/elasticsearch/ElasticSearch.scala:759-767`) | Unsupported before the first cursor. The checked-in D3 design records bare aliases as unmapped-field ES failures; absent deliberate validation, D3 can expose that as 5xx (`kupua/exploration/docs/03 Ce n'est pas une pipe dream/media-api-work/phase-3-d3-searchafter-sort-companion-workplan.md:76-82`; `media-api/app/controllers/MediaApi.scala:887-890`). |
| Duplicate semantic fields (`lastModified,lastModified`) | Both UI handlers prevent primary/secondary equality (`kupua/src/components/SearchFilters.tsx:108-128`; `kupua/src/components/ImageTable.tsx:1135-1169`) | Yes | Current O3 removes every matching clause and cursor slot (`kupua/src/dal/null-zone.ts:60-68`) | D3 removes every matching clause but only `sv.tail`, then detects a length mismatch (`media-api/app/lib/elasticsearch/ElasticSearch.scala:773-799`) | UI-unreachable but shared/manual-URL reachable. D3 deliberately returns 422; direct ES and D3 diverge at the primary-null boundary (`media-api/app/controllers/MediaApi.scala:887-890`). |

### R3 — D3 contract and blast radius

1. **Can normal Kupua interaction fail on a non-primary null? Yes.** Both sort
   controls implement Shift+click secondaries, and the table interaction is
   pinned by E2E (`kupua/src/components/SearchFilters.tsx:104-139`;
   `kupua/src/components/ImageTable.tsx:1123-1170`;
   `kupua/e2e/local/ui-features.spec.ts:484-518`). Credit, Source and Taken are
   nullable in the authoritative model
   (`common-lib/src/main/scala/com/gu/mediaservice/model/ImageMetadata.scala:9-20`).
   D3 checks only whether the head is `JsNull`; any later `JsNull` survives to
   `search_after` (`media-api/app/lib/elasticsearch/ElasticSearch.scala:770-799,888-894`).
   Checked-in ES notes identify the resulting null-cursor behavior as an NPE/500
   (`kupua/exploration/docs/deviations.md:465-472`).

2. **No, unsupported shapes do not all receive deliberate 4xx responses.** Empty
   sort clauses, malformed clauses and cursor-length mismatches become
   `InvalidUriParams` and therefore 422
   (`media-api/app/lib/elasticsearch/ElasticSearch.scala:752-799`;
   `media-api/app/controllers/MediaApi.scala:887-890`). A residual null can cause
   `ElasticSearchException`, which that recovery does not catch
   (`common-lib/src/main/scala/com/gu/mediaservice/lib/elasticsearch/ElasticSearchExecutions.scala:17-32`;
   `kupua/exploration/docs/deviations.md:465-472`).
   Separately, a present non-array `sortValues` is parsed with `asOpt` as `None`,
   which silently restarts from page one rather than rejecting the body
   (`media-api/app/controllers/MediaApi.scala:866-876`). The same `asOpt` pattern
   turns a missing or non-array `sort` into `Nil`, which the data layer later
   treats as semantic invalidity (`media-api/app/controllers/MediaApi.scala:866-876`;
   `media-api/app/lib/elasticsearch/ElasticSearch.scala:755-758`).

3. **Nested-primary handling is sound only for primary-only special sorts.**
   `usages.dateAdded` is mapped as `nested`, and D3 uses the client-supplied
   nested path in its existence query
   (`common-lib/src/main/scala/com/gu/mediaservice/lib/elasticsearch/Mappings.scala:328-342`;
   `media-api/app/lib/elasticsearch/ElasticSearch.scala:777-790`). The focused
   test proves populated usage parents do not leak into the null zone
   (`media-api/test/lib/elasticsearch/ElasticSearchTest.scala:871-906`).
   Collections are object-mapped, so their root-level query is correct
   (`common-lib/src/main/scala/com/gu/mediaservice/lib/elasticsearch/Mappings.scala:241-255`).
   Neither special is sound when combined with a secondary: whole-value alias
   expansion no longer runs, so the client sends an unresolved literal field
   before any null-zone handling
   (`kupua/src/dal/adapters/elasticsearch/sort-builders.ts:91-113,115-158`).

4. **Option B does not imply arbitrary nullable-chain support.** It was selected
   so the server clause remains field-for-field identical to the clause that
   produced the cursor, avoiding two independently maintained builders
   (`kupua/exploration/docs/03 Ce n'est pas une pipe dream/media-api-work/phase-3-d3-searchafter-sort-companion-workplan.md:17-50,90-108`).
   D3 already imposes shape validation, and its documented PIT contract requires
   a caller-supplied unique final tiebreaker
   (`media-api/app/lib/elasticsearch/sorts.scala:35-61`;
   `kupua/exploration/docs/zz Archive/media-api-work/phase-3-d3-searchafter-post-pr-review.md:122-140`).
   A narrower one-leading-null cursor contract is therefore consistent with
   Option B.

5. **Exact pre-merge amendment.** Keep client-authoritative resolved clauses,
   but make unsupported input deliberate:

    - In `media-api/app/controllers/MediaApi.scala`, parse `sort` and `sortValues`
       strictly. Return 400 `invalid-params` when either present field has the wrong
       JSON type; retain 422 for a well-typed empty sort, malformed sort entry,
       unsupported cursor shape, or cursor-length mismatch. Both fields currently
       use permissive `asOpt` extraction (`media-api/app/controllers/MediaApi.scala:854-879`).
    - In `media-api/app/lib/elasticsearch/sorts.scala`, reject unresolved semantic
       special aliases (`dateAddedToCollection`, `usagesDateAdded`) as
       `InvalidUriParams` rather than sending known non-ES field names. Valid
       primary-only special sorts arrive as resolved paths, never those aliases
       (`kupua/src/dal/adapters/elasticsearch/sort-builders.ts:91-113`).
   - In `media-api/app/lib/elasticsearch/ElasticSearch.scala`, reject any
     `JsNull` remaining in the effective cursor after the optional leading
     primary-null reduction, and reject a reduction that leaves no working sort,
     as `InvalidUriParams` (422). The validation belongs beside the existing
     length check (`media-api/app/lib/elasticsearch/ElasticSearch.scala:770-799`).
   - In `media-api/app/lib/elasticsearch/ElasticSearchModel.scala`, document that
     only index 0 may carry the null-zone sentinel
     (`media-api/app/lib/elasticsearch/ElasticSearchModel.scala:91-103`).

   Required red-first data-layer cases in
   `media-api/test/lib/elasticsearch/ElasticSearchTest.scala`: forward and reverse
   non-primary `JsNull`; `[null,null,uploadTime,id]` after primary reduction;
   duplicate primary sort clauses; and unresolved special aliases. Existing tests
   currently cover only a single
   leading null and safe reverse cursors
   (`media-api/test/lib/elasticsearch/ElasticSearchTest.scala:823-906,938-978`).
   Add a controller/action test under `media-api/test/controllers/` for 400 on
   wrong-type `sort`, 400 on wrong-type `sortValues`, 422 on an unresolved
   special alias, and 422 on a residual-null cursor. The existing focused suite
   exercises the Elasticsearch method directly
   (`media-api/test/lib/elasticsearch/ElasticSearchTest.scala:779-1269`).

The **server amendment is required before merge** because it turns accidental
5xx and silent restart into stable client errors independently of Kupua rollout.
The **Kupua restriction is separate**: remove the two Shift+click branches,
canonicalise URL input to one semantic token, and update the existing secondary
sort E2E (`kupua/src/components/SearchFilters.tsx:104-139`;
`kupua/src/components/ImageTable.tsx:1123-1170`;
`kupua/e2e/local/ui-features.spec.ts:484-518`). A server 422 is a safety net, not
the product fallback; normal Kupua use should not issue the rejected request.

### R4 — Policy comparison

| Policy | Correctness and parity | User-visible cost | Blast radius and shared URLs | Before D3 merge? |
|---|---|---|---|---|
| **1. One semantic user sort** | Correct for the remaining primary-only contract; both adapters retain automatic fallback clauses and primary-null reduction (`kupua/src/dal/adapters/elasticsearch/sort-builders.ts:57-83`; `media-api/app/lib/elasticsearch/ElasticSearch.scala:770-799`) | Removes a hidden modifier gesture and secondary indicators proven by one E2E (`kupua/e2e/local/ui-features.spec.ts:484-518`) | Two UI handlers, URL canonicalisation, focused tests; comma URLs retain their primary token rather than breaking | **Recommended.** Server rejection must land before merge; client restriction may be reviewed separately but must precede enabling D3 for users who can emit secondaries. |
| **2. Allow-list provably present secondaries** | Not correct as stated. Under a nullable primary, even present `uploadedBy` adds a cursor slot that null-zone deep seek does not synthesise; under a present primary, general deep seek supplies a numeric anchor for this string field (`kupua/src/stores/search-store.ts:887-906,3068-3085`) | Preserves a narrow secondary feature, but excludes the nullable metadata fields that make it useful (`common-lib/src/main/scala/com/gu/mediaservice/model/ImageMetadata.scala:9-20`) | Adds a cross-language allow-list, deep-seek work, and shared-URL migration | No; field presence alone is insufficient. |
| **3. Drop secondaries in the primary null zone** | Restores direct-ES's committed degraded ordering, but does not address a non-primary null while the primary is present or an invalid special secondary (`kupua/src/dal/null-zone.ts:52-68`; `kupua/src/dal/adapters/elasticsearch/sort-builders.ts:91-113`) | Ordering changes at the null boundary without visible explanation | Small adapter change, but parity and URL hazards remain | No; insufficient as the product contract. Use only as direct-ES implementation after policy 1 removes semantic secondaries. |
| **4. Reject later nulls with client fallback** | A stable 422 is correct as an API limitation. A defined client fallback must restart under the primary-only clause; continuing an existing multi-sort buffer under a different clause would not preserve cursor meaning. The current client instead throws every non-2xx response (`kupua/src/dal/grid-api-search-adapter.ts:142-148`) | A reachable comma URL can visibly restart and lose its secondary ordering | Retains shared comma URLs, but needs restart orchestration and separate rejection of special aliases | **Runner-up.** The server guard belongs before merge; the fallback is more complex and less legible than policy 1. |
| **5. Recursive nullable pagination** | Could preserve full lexicographic order, but current code handles only one primary-null phase in both adapters (`kupua/src/dal/null-zone.ts:42-83`; `media-api/app/lib/elasticsearch/ElasticSearch.scala:770-799`) | No feature loss | Preserves shared comma-URL semantics without migration, but has the largest blast radius: multi-phase query/cursor state, direct-ES/D3 parity and deep-seek changes | Reject. No checked-in usage proxy justifies it. |

**Recommendation: policy 1. Runner-up: policy 4.** Policy 1 is the only option
that removes all three reachable hazard classes together: nullable ordinary
secondaries, invalid special secondaries, and comma/duplicate shared URLs. Policy
2 is not sound as written because presence does not make current synthetic seek
anchors type- or shape-compatible. Policy 4 can be correct by restarting under
primary-only ordering after a deliberate rejection, but preserves a hidden
interaction only to discard it visibly at an unsupported boundary.

### R5 — O3 and nested-filter disposition

**Choose: Narrow before commit.** The following current uncommitted concepts
should survive:

- Import/use `NESTED_SORT_FIELDS`, build `primaryExistsQuery`, and place that
  query under `must_not` (`kupua/src/dal/null-zone.ts:11-15,70-80`).
- Keep the focused nested-primary regression; it verifies the actual request
  shape (`kupua/src/dal/selections-dal.test.ts:435-465`).

The following concepts should not survive:

- Preserving every explicit secondary in `sortOverride` and
  `strippedCursor` (`kupua/src/dal/null-zone.ts:56-68`). Restore the committed
  `uploadTime,id` fallback introduced by `c1998394b1`, deriving the fallback
  direction from `buildSortClause` as before. This intentionally degraded null-
  zone ordering becomes unobservable after policy 1 canonicalises semantic
  secondaries.
- Remove or rewrite the uncommitted “preserves explicit secondary sorts” test,
  which currently blesses the rejected product contract
  (`kupua/src/dal/selections-dal.test.ts:407-433`).

The nested correction stands alone because policy 1 retains special fields as
primary sorts, `usages.dateAdded` is genuinely nested, and a root-level existence
query cannot exclude parents that contain nested usages
(`common-lib/src/main/scala/com/gu/mediaservice/lib/elasticsearch/Mappings.scala:328-342`;
`kupua/src/dal/null-zone.ts:70-80`).

### R6 — Implementation sequence and stop points

1. **Media-api contract amendment, before D3 merge.** Add red-first data-layer
   tests for forward/reverse later-null cursors and null-after-primary reduction,
   duplicate-primary clauses and unresolved special aliases; add controller/action
   tests for wrong-type `sort`/`sortValues` and their 400 bodies plus 422
   unsupported-shape bodies. Ownership:
   `media-api/app/controllers/MediaApi.scala`,
   `media-api/app/lib/elasticsearch/ElasticSearch.scala`,
   `media-api/app/lib/elasticsearch/ElasticSearchModel.scala`,
   `media-api/app/lib/elasticsearch/sorts.scala`, and focused tests. **Stop** if a
   failing test shows Elasticsearch accepts a later null without error; that
   falsifies the central cursor premise and requires a contract reassessment.
2. **Kupua single-sort boundary.** Add failing URL/UI tests proving a comma value
   canonicalises to its first token and Shift+click no longer appends a secondary;
   then update `SearchFilters`, `ImageTable`, the URL normalization boundary, and
   the existing E2E at `kupua/e2e/local/ui-features.spec.ts:484-518`. **Stop** if
   shared URLs must preserve secondary semantics; choose policy 4's explicit
   restart contract or reopen policy 5 rather than inventing an unproved
   presence-only allow-list.
3. **Narrow direct-ES O3.** Retain the failing nested-primary query-shape test,
   restore the `uploadTime,id` null-zone override, and delete the test that
   requires explicit-secondary preservation
   (`kupua/src/dal/selections-dal.test.ts:407-465`). **Stop** if direct ES and D3
   no longer produce the same supported one-sort clause/cursor shapes.
4. **Cross-adapter contract check.** For every registry primary sort, assert one
   semantic token produces the same resolved client clause for direct ES and D3;
   retain the existing wire-shape suite as the starting point
   (`kupua/src/dal/adapters/elasticsearch/sort-builders.test.ts:264-301`). Do not
   add recursive cursor cases unless a policy decision re-enables secondaries.

### R7 — Residual risks

| Risk | Why accepted | Observable trigger for reconsidering |
|---|---|---|
| Old/shared comma URLs lose their secondary token | Canonicalising to the first token preserves the visible primary ordering and avoids a broken request; the current schema otherwise accepts arbitrary strings (`kupua/src/lib/search-params-schema.ts:26-29`) | User report or checked-in workflow requiring the secondary semantics |
| A future non-Kupua client wants multiple semantic sorts | D3 currently has one caller and Option B was selected around Kupua's clause builder (`kupua/exploration/docs/03 Ce n'est pas une pipe dream/media-api-work/phase-3-d3-searchafter-sort-companion-workplan.md:90-108`) | A second client proposal with concrete nullable-field requirements |
| `dateAddedToCollection` lacks a focused mapped-field D3 null-zone test | Its object mapping makes the current root `exists` form correct (`common-lib/src/main/scala/com/gu/mediaservice/lib/elasticsearch/Mappings.scala:241-255`) | A collection fixture is added to the media-api integration index, or first pagination defect report |
| Raw client sort and semantic `orderBy` can disagree | Option B deliberately makes the raw clause authoritative; the amendment constrains known unsafe cursor and unresolved-alias shapes (`kupua/exploration/docs/03 Ce n'est pas une pipe dream/media-api-work/phase-3-d3-searchafter-sort-companion-workplan.md:90-108`) | External caller, new semantic alias expansion, or parity-test failure |
| D3 still relies on a unique final tiebreaker it cannot infer | This is an existing measured caller precondition; Kupua appends `id` (`kupua/src/dal/adapters/elasticsearch/sort-builders.ts:201-204`; `kupua/exploration/docs/zz Archive/media-api-work/phase-3-d3-searchafter-post-pr-review.md:122-140`) | Any caller-supplied clause without `id` or another proven-unique final field |

### Appendix — Out-of-scope observations

None.

---

## 7. Empirical follow-up handoff — execute before accepting R1–R7

> **Status:** Required. The report above is a code-reading design recommendation,
> not the final product decision.
> **Fresh-agent mode:** Investigation and test authoring are allowed. Browser
> driving against the local app and local Docker Elasticsearch is allowed.
> Product fixes, media-api changes, commits, pushes and live TEST/CODE/PROD access
> are forbidden during this follow-up.
> **Output:** Append the completed evidence and revised decision under Section 8
> of this file. Do not overwrite R0–R7; they are the hypothesis being tested.

### 7.1 Orientation for the fresh agent

You are investigating whether Kupua must remove semantic secondary sorting, or
whether a small and coherent supported subset can remain. Do not begin from the
report's policy-1 conclusion. Your job is to try to **falsify complete removal**
without inventing recursive/multi-phase nullable pagination.

The current worktree contains an uncommitted experiment called O3. It is known
broken. O3 preserves explicit secondary sort clauses after entering a primary
null zone, but deep seek still constructs `[null, uploadTime, id]`; the app then
sends a two-value `search_after` against a three-field reduced sort and ES returns
400. A local browser reproduction on 6 September 2026 established:

| Configuration | Midpoint scrubber result |
|---|---|
| `-lastModified` | Succeeded; settled near 634,880 of 1,324,028 |
| `-uploadTime,credit` | Succeeded; settled near 674,412 |
| `-lastModified,credit` with O3 present | Briefly moved, reset to 0; ES said `search_after has 2 value(s) but sort has 3` |

This proves O3 is unsafe. It does **not** prove committed pre-O3 secondary sorts
are safe, and it does **not** prove all secondaries should be removed.

Treat these as three distinct, immutable baselines throughout:

1. **HEAD:** `fd5fb4c30e7c0b6ba3f45ae142b74590551076b0`, with no O3 diff.
2. **O3 experiment:** the known-broken negative control at blob
   `b6ddc84bacdaf64beea100c4fb24f24dc430cf90` for `null-zone.ts` and blob
   `1627fdb6d905b3b157ae9ed699f266efba8e190b` for
   `selections-dal.test.ts`. Do not silently substitute a later working-tree
   version.
3. **D3:** the implementation at HEAD, pinned by blob
   `548fc2322543c32f0fd77d082658834939925a79` for `ElasticSearch.scala` and
   `fff26cf621c07fbf94d05640a5677f81f2c2986d` for `MediaApi.scala`. PR #4849 is
   context, not the revision identifier.

Never report a result without naming which baseline produced it.

### 7.2 Safety and worktree protocol

1. Follow the fresh-agent and test directives in `kupua/AGENTS.md` and
   `.github/copilot-instructions.md` before doing anything else.
2. Read `kupua/exploration/docs/worklog-current.md` and inspect `git status`.
   The worktree is intentionally dirty; do not revert unrelated user changes.
3. Do not mutate the current dirty worktree to obtain HEAD. Ask the user for
   explicit permission to create a temporary Git worktree under `$TMPDIR`
   (outside `kupua/`) at the pinned HEAD. If permission is declined, stop: code
   reading alone cannot produce the required HEAD browser evidence.
4. Apply one identical **investigation-test-only patch** to the isolated HEAD
   worktree. Do not apply O3 there. O3 already has a pinned browser failure and
   needs at most one focused unit negative-control run, not the full matrix.
   Preserve test changes as a patch under `kupua/exploration/docs/` before any
   worktree removal. Never stash, clean, force-remove a worktree, use
   `git reset --hard`, or use `git checkout --`.
5. The currently shared app is **not an evidence baseline**: its 1.3M-result
   backend and served source revision were not pinned, and O3 was present during
   the recorded reproduction. Do not reuse it for HEAD results. Before any
   browser investigation, prove the serving worktree/revision and that the Vite
   proxy targets local ES on port 9220 with fewer than 50,000 documents.
6. Before any Playwright run, warn the user that port 3000 must be free, ask
   whether the app is running there, and wait. The current app may be running;
   it must be stopped before starting the pinned HEAD server or Playwright.
7. Use only the existing local Elasticsearch corpus on port 9220. Record its
   document count before and after every phase and stop if it changes. Do not
   reload, replace or augment local fixtures without explicit user approval.
8. Run Kupua commands from repo root as
   `npm --prefix kupua ... 2>&1 | tee "$TMPDIR/..."`.
   Do not hide live output with `tail`, `head` or `grep` after `tee`.
   Media-api uses sbt, not npm: the focused ES surface is
   `TZ=UTC sbt "media-api/testOnly lib.elasticsearch.ElasticSearchTest"`; use
   the relevant discovered controller test class for HTTP checks. Do not run the
   full `media-api/test` surface during investigation.
9. Production code changes are forbidden. Uncommitted Kupua investigation tests
   are allowed in the isolated worktree. Before modifying any file under
   `media-api/`, including tests, ask the user for explicit permission because
   the standing Kupua scope does not grant it.
10. Do not commit. This follow-up is evidence collection and test design only.

### 7.3 Corrected field-presence hypotheses

Do not infer current indexed completeness from the legacy Scala model alone:

- `Asset.mimeType` and `Asset.dimensions` are `Option`; the model contains a FIXME
  saying they require backfill before becoming mandatory
  (`common-lib/src/main/scala/com/gu/mediaservice/model/Asset.scala:9-12`).
- Kupua correctly **displays** Width/Height from `orientedDimensions` when
   present, falling back to `dimensions`. Sorting intentionally uses raw
   `source.dimensions.width/height` plain integer fields
   (`kupua/src/lib/field-registry.tsx:298-304,850-889`;
   `kupua/src/dal/adapters/elasticsearch/sort-builders.ts:122-129`). The raw sort
   replaced an unusably slow orientation-invariant pixel-count Painless sort, so
   it is a performance trade-off rather than proof that display and sort values
   agree (`kupua/exploration/docs/changelog.md:11165-11205`).
- `Image.usageRights` is required in memory, but missing JSON defaults to
  `NoRights`, and `NoRights` writes as `{}` with no `category` leaf
  (`common-lib/src/main/scala/com/gu/mediaservice/model/Image.scala:97-103`;
  `common-lib/src/main/scala/com/gu/mediaservice/model/UsageRights.scala:155-174`).
  "No rights" therefore argues against assuming `usageRights.category` exists
  in every indexed document.
- `uploadTime`, `uploadedBy`, and `id` are required in the authoritative Image
  model (`common-lib/src/main/scala/com/gu/mediaservice/model/Image.scala:8-14`),
  but only indexed data and correct synthetic anchor types can establish a safe
  secondary-sort contract.

**Read-only current-backend observation, 6 September 2026:** against the active
search index used by the user-started app, aggregate `_count` queries found
1,330,788/1,330,788 documents with raw Width, raw Height, MIME type and File
size; zero documents had `source.size <= 0`; 399 had oriented dimensions and all
399 also had raw dimensions; Category existed on 1,181,302/1,330,788 documents.
No index name, field value or identity was retained. This strongly rebuts the
stale optional-model premise for that corpus, but it is **not** the pinned HEAD
local-test baseline and must not be promoted to a permanent index invariant.

**File size history hypothesis:** the current registry displays `source.size`
but has no `sortKey` (`kupua/src/lib/field-registry.tsx:887-902`). Source history
examined so far shows no implemented `fileSize` sort token; the capability report
and perceived-perf scenario call it sortable, but the latter silently falls back
to another option when "File size" is absent
(`kupua/exploration/docs/03 Ce n'est pas une pipe dream/kupua-00-capabilities-report.md:535-562`;
`kupua/e2e-perf/perceived-short.spec.ts:266-286`). Treat this as possible stale
documentation or omitted wiring, not as evidence that a working sort was removed.
Tomorrow's agent must finish the history check before proposing restoration.

Measure these hypotheses on local indexed data before classifying fields:

| Semantic field | ES field | Required measurement |
|---|---|---|
| Uploaded | `uploadTime` | total versus exists count; value/sort type |
| Uploader | `uploadedBy` | total versus exists count; value/sort type |
| Width | `source.dimensions.width` | total versus exists count; relationship to `orientedDimensions` |
| Height | `source.dimensions.height` | total versus exists count |
| File type | `source.mimeType` | total versus exists count |
| File size | `source.size` | total versus exists count; count `<= 0`; mapping/value type |
| Category | `usageRights.category` | total versus exists count; report as missing category, not inferred NoRights count |
| Credit | `metadata.credit` | total versus exists count |
| Source | `metadata.source` | total versus exists count |
| Taken | `metadata.dateTaken` | total versus exists count |
| Last modified | `lastModified` | total versus exists count |

Use aggregate counts only, plus mappings/field capabilities for ES value types.
Do not write any **real/source** index name, real image ID,
uploader/credit/source value, credential, raw document, cursor value or response
payload to disk. Deterministic synthetic test index names, fixture IDs and values
created solely for local tests are allowed inside tests but not needed in the
report. The report may say only `local port-9220 sample corpus` and contain
counts, percentages, lengths and redacted type vectors such as
`[null, string, number, string]`.

### 7.4 Questions the empirical follow-up must answer

Answer all of these with executable evidence:

1. Under committed pre-O3 direct-ES behavior, which secondary-sort classes work
   for initial load, ordinary extension, reverse extension, midpoint seek, End,
   and range selection?
2. At a nullable primary's transition into its null tail, does committed code:
   degrade ordering, omit/duplicate documents, return 400, or continue safely?
   Distinguish synthetic deep-seek cursors from real server-returned cursors.
3. Can any useful secondary be supported without recursive null handling?
   Candidates must be evaluated by actual indexed presence **and** cursor anchor
   type/shape, not model type alone.
4. Do Width, Height, File type, File size, Category, Uploader or Uploaded form a useful
   allow-list? If a field is incomplete, quantify how incomplete locally and
   identify the exact failure boundary.
5. Are special date aliases broken only as secondaries, or does any normal UI
   route resolve them correctly before D3 receives the sort?
6. Does D3 behave correctly for every request shape Kupua emits under committed
   pre-O3 behavior? Where unsupported, does it return deliberate 4xx or
   accidental 5xx/silent restart?
7. Is removing the Shift+click UI sufficient, or must comma-separated `orderBy`
   URLs also be rejected/canonicalised to protect D3 and direct ES?
8. What is the smallest product restriction that leaves no known reachable hard
   failure? Report technical feasibility separately from whether the hidden
   Shift+click interaction is useful or understandable. Do not rank retention or
   removal before collecting evidence.
9. Was File size sorting previously implemented and deliberately removed, merely
   documented, or accidentally omitted from the registry? If adding it is a
   plain `source.size` integer alias, state that separately from secondary-sort
   policy; do not implement it in this follow-up.

### 7.5 Required field-pair matrix

Do not test every permutation or every operation for every pair. Start with
these representative **classes** on HEAD. A class advances to browser/D3 work
only if the preceding gate leaves it technically viable:

| Class and starting pair | Why it discriminates | Gate-A treatment |
|---|---|
| Required keyword: `-uploadTime,uploadedBy` | Tests string-valued synthetic anchors without a missing-value hypothesis | Full HEAD contract test |
| Complete numeric: `-uploadTime,width` | Tests native integer secondary; current backend reports complete raw dimensions | Full HEAD contract test; run the same pure/request checks for Height, then behavioral Height only if it differs |
| Complete keyword: `-uploadTime,mimeType` | Tests a low-cardinality keyword reported complete on the current backend | Full HEAD contract test |
| Incomplete rights: `-uploadTime,category` | Tests NoRights/missing category semantics | Presence plus focused null-boundary contract; do not promote to survivor without evidence |
| Incomplete metadata: `-uploadTime,credit` | Known successful midpoint on the unpinned app but nullable continuation control | Focused null-boundary contract |
| Nullable primary: `-lastModified,<best survivor>` | Tests primary-null transition with the strongest viable secondary from rows above | Choose only after earlier rows; do not default to Credit |
| Existing UI pair: `-credit,source` | Existing E2E proves construction, not pagination | Initial-load control plus one continuation/null-boundary test |
| Special secondary: `-uploadTime,usagesDateAdded` | Tests whether special alias expansion works after a comma | Pure builder/request test only unless unexpectedly valid |

File size is not an existing pair because it has no current sort token. Complete
its history/mapping assessment separately. If it appears to be a safe plain
integer sort candidate, record a proposed `source.size` primary/secondary test
for later implementation; do not alter the matrix or product code now.

For each executed case record only:

- resolved ES sort clause;
- cursor length and redacted JavaScript/JSON type vector;
- whether the operation reaches a primary or secondary missing-value boundary;
- HTTP/ES status and concise error reason;
- landed global position or page identity-set invariants;
- HEAD, O3 or D3 baseline.

Do not record actual image IDs in the report. Tests may use local deterministic
fixture IDs already checked into the repository.

### 7.6 Test ladder

Each phase is gated. Stop when a phase decides a class; do not carry known-dead
classes into later phases. The target is 12–24 result rows across the whole
follow-up. Stop at 24 and decide from the representative mechanisms already
proved.

#### Gate A — static, history and aggregate triage

No test changes yet.

1. Verify the pinned revisions and blob hashes from Section 7.1.
2. Prove the app/backend baseline before any browser use. The current shared app
   is excluded. Use only a server started from the isolated HEAD worktree and
   local port-9220 corpus.
3. Record local corpus document count, mapping/field-capability type and exists
   count for all Section 7.3 fields. Record Width and Height separately.
4. Finish File size archaeology. Determine whether `fileSize` was ever wired in
   product source, why `source_size` lacks a `sortKey`, and whether stale docs and
   the fallback perf scenario created a false memory of removal.
5. Inspect `buildSortClause` for the representative pairs without changing it.

**Gate A exit:** drop a field from allow-list candidacy if it is incomplete and
would require another null-zone phase, has no valid resolved ES field, or merely
duplicates an automatic fallback. Continue with at most three survivor classes,
plus one incomplete control and one special-alias control.

#### Gate B — pure, store and deterministic local-ES tests

Add tests before relying on the browser. Tests may remain uncommitted as the
investigation artifact. Apply the same investigation-test patch only to the
isolated HEAD worktree.

1. Add table-driven `buildSortClause` tests for Gate A survivors and controls,
   including Width and Height separately and the special-secondary alias.
2. Extract or expose no production helper merely for testing unless unavoidable.
   Prefer store tests that capture `searchAfter` arguments from the existing data
   source harness.
3. Add deep-seek store tests above 65,000 results for each survivor class and the
   chosen nullable-primary pair. Assert synthetic cursor length, redacted value
   types and resolved sort length. A captured request proves client construction,
   not ES acceptance.
4. Add direct-ES request-contract assertions:
   whenever `search_after` is present, its length equals `sort.length`, and each
   value type matches the mapped field type. A fetch mock cannot prove ES accepts
   the cursor.
5. To claim correct ordering, omission or duplication behavior across a null
   boundary, use a deterministic synthetic index on local port 9220 with exact
   expected tuples. Ask the user before creating it. Use a unique clearly local
   index, write only fixed non-sensitive test documents, and delete only that
   index after preserving tests. If permission is declined, report those claims
   as unverified; browser spot checks are not a substitute.
6. Test forward and reverse continuation only for the strongest survivor and
   the incomplete control. Test midpoint and End cursor construction only for
   survivors and the nullable-primary pair.
7. Use the pinned O3 blobs for one negative-control test reproducing the known
   sort/cursor arity mismatch. Do not run O3 through the whole matrix.

**Gate B exit:** a class survives only if cursor shape/type is valid for initial,
continuation, midpoint and End paths without recursive null handling. Advance at
most two survivor classes to Gate C. If none survive, skip Gate C and proceed to
the minimal D3 guard question in Gate D.

#### Gate C — survivor-only local direct-ES browser investigation

Start the app from the isolated pinned-HEAD worktree against the unchanged local
port-9220 corpus. Prove both facts before recording results. Do not reuse an
existing server merely because it owns port 3000.

For each of at most two survivors:

1. Initial sort settles with no store error.
2. Scroll far enough to cause at least one forward extension; verify no 4xx/5xx,
   reset or exact-fixture boundary violation.
3. Exercise one reverse extension.
4. Click scrubber at 50% and press End, then move upward.
5. Run range selection only if Gate B found that `getIdRange` is part of the
   survivor's supported contract.

Capture response status and concise ES reason in memory or redacted notes. Never
persist full request/response bodies or image identities. Restore the app to
`/search?nonFree=true` at the end.

**Gate C exit:** browser evidence may refute a survivor, but cannot prove complete
ordering without Gate B's deterministic fixture. Advance only surviving emitted
request shapes to Gate D.

#### Gate D — D3 emitted-contract check

Production media-api code remains read-only. Ask the user before adding tests
under `media-api/`. Use the pinned D3 blobs and focused sbt surface from Section
7.2. No `media-api/test/controllers/` directory currently exists; do not invent a
broad controller harness merely to complete this investigation. If HTTP behavior
cannot be proved cheaply, specify the exact missing action test and retain the
uncertainty.

Exercise only:

1. One Kupua-emitted cursor for each Gate C survivor.
2. The committed fallback-only leading-primary-null cursor.
3. One residual-later-null cursor proving whether D3 deliberately rejects or
   accidentally fails.
4. One reverse form only if reverse changes the result.
5. The special-secondary alias only if Kupua can still emit it under the revised
   policy candidate.

For each, distinguish method-level `InvalidUriParams`, controller 4xx, raw ES
failure and accidental 5xx. Do not infer HTTP behavior from an
`ElasticSearchTest` that calls the method directly.

Wrong-type JSON, duplicate manual clauses and general API hardening are a separate
D3 validation backlog unless one is emitted by the retained Kupua contract. They
must not expand this empirical follow-up into a general endpoint audit.

#### Gate E — minimal Playwright contract, only after a product decision

Playwright is warranted only to pin reachable product behavior that browser
driving confirmed. Before running it, follow the required port-3000 warning and
wait for the user to stop the app.

Add at most these focused E2E cases:

1. One retained secondary pair completes initial sort, midpoint seek and End
   without store error or reset.
2. One rejected/removed combination cannot be constructed through UI, while a
   pasted comma URL follows the chosen explicit policy.
3. If secondaries remain, one forward-extension boundary preserves ordering and
   does not duplicate visible IDs; assertions may use fixture identities inside
   the test but not the report.

Do not run the full E2E suite during investigation. Run it only after a later
approved product fix, per the normal component/store test directive.

### 7.7 Required comparisons and falsifiers

The follow-up must not merely collect failures. Use these decision rules:

#### Retain unrestricted secondaries only if all are true

- Every UI-emittable pair has a defined cursor contract across all tested
  operations.
- No pair needs recursive/multi-phase null handling.
- Direct ES and D3 agree on supported behavior and deliberate rejection.

This outcome is expected to be unlikely.

#### Recommend an allow-list only if all are true

- At least one non-redundant secondary field is complete in the pinned local
   corpus and either has an explicit no-missing-value invariant or is protected by
   a simple client policy that does not require recursive null handling.
- Synthetic seek anchors have the correct field type and full cursor shape.
- Initial, extend, reverse, midpoint and End behavior pass on HEAD and can be
  represented by D3 without recursive null handling.
- The allow-list can be owned in one client location; do not propose duplicated
  cross-language field lists merely to preserve the feature.

#### Recommend operation-specific disabling only if all are true

- Ordinary browsing under the pair is correct and demonstrably useful.
- Unsupported seek/range operations can be disabled visibly before issuing a
  request, without silently changing order or restarting.
- The resulting UX is less surprising than removing the hidden secondary gesture.

#### Recommend complete removal only if any is true

- No non-redundant pair survives the required operation matrix without recursive
  null handling or type-invalid synthetic anchors.
- The only surviving pairs duplicate automatic fallback/tiebreaker behavior.
- A simple allow-list cannot be expressed without coupling Kupua and D3 to
  separate field taxonomies.

These are technical feasibility rules, not a product-value ranking. E5 must
separately state whether the surviving gesture is understandable/useful enough
to retain; absence of telemetry is uncertainty, not evidence for either side.

#### Mandatory halt conditions

- If the served app revision/backend or D3 blobs cannot be proven, stop before
   browser/API claims and report the missing evidence.
- If the local corpus document count changes between baselines or phases, stop;
   results are no longer comparable.
- If evidence cannot be recorded using only aggregate counts, lengths and
   redacted type vectors, stop rather than leaking values or identities.
- Stop at 24 pair/operation result rows. Do not widen the matrix to chase
   confidence after representative mechanisms have been established.
- If HEAD already hard-fails a common reachable pair before any missing-value
  boundary, stop expanding the matrix and isolate that mechanism first.
- If O3 and HEAD differ outside null-zone entry, the baseline setup is wrong;
  stop and repair the comparison.
- If local corpus completeness conflicts with model optionality, report both;
  do not promote a local observation into a global invariant.
- If correct retention requires recursive/multi-phase pagination, do not design
  it. Record that fact and evaluate allow-list/removal.
- If D3 changes are required, specify them but do not edit media-api in this
  follow-up.

### 7.8 Required Section 8 output

Append the following after this handoff. Every claim needs `path:line`; command
and browser results need the exact baseline, command/interaction, result count or
status, and date. No secrets or identities.

#### E1 — Baseline integrity

- HEAD hash and relevant committed null-zone behavior.
- Exact O3 diff classification: preservation hunk, nested-filter hunk, tests.
- How baseline isolation was achieved.

#### E2 — Indexed field-presence table

For every field in Section 7.3: total, exists count, missing percentage, mapped
type, generic corpus label (`local port-9220 sample corpus` only), and whether
completeness is a local fact or an architectural invariant. Include File size
non-positive count and raw-versus-oriented dimension coverage.

#### E3 — Pair/operation result matrix

One row per distinct pair/operation/baseline result. Target 12–24 rows, not every
permutation. Include sort/cursor length and redacted type-vector verdict.

#### E4 — Direct ES versus D3 contract

State which cases are supported, deliberately rejected or accidentally fail.
Separate method-level and HTTP-level evidence.

#### E5 — Revised product decision

Choose exactly one:

- retain unrestricted secondaries;
- retain an explicit allow-list;
- retain browsing but disable named operations;
- remove semantic secondary sorting.

Name the exact surviving fields/operations. Explain whether R1 is confirmed,
narrowed or refuted. State technical feasibility separately from the UX/product
case for preserving the hidden Shift+click gesture.

#### E6 — O3 disposition

Choose: discard entirely; retain nested-filter hunk only; replace with a named
narrow behavior; or hold. O3 preservation may not be called correct without a
passing deep-seek cursor-shape test and null-boundary continuation test.

#### E7 — D3 pre-merge action

Give one verdict: safe as-is; amend with named validation only; or block. For an
amendment, list exact failing tests first and the smallest ownership boundary.
Do not bundle Kupua UI policy into the media-api diff unless the evidence proves
the server cannot define a safe independent contract.

#### E8 — Test artifacts and residual uncertainty

List tests added, commands run, browser cases driven, results not run and why,
plus at most five uncertainties that could change E5/E7.

#### E9 — File size sort finding

State whether File size sorting was implemented then removed, documented but
never wired, or accidentally omitted. Give the smallest future test/fix boundary
if `source.size` is a viable plain-integer sort. Keep this independent of E5/E7.

### 7.9 What done looks like

- [ ] HEAD and O3 results are never conflated.
- [ ] O3 is treated as a broken experiment, not the desired contract.
- [ ] Width, Height, File type and Category were measured, not assumed present.
- [ ] File size completeness/history was assessed separately from existing sorts.
- [ ] Synthetic seek and real continuation cursors were tested separately.
- [ ] Direct ES method/request behavior and D3 HTTP behavior were distinguished.
- [ ] At least one serious attempt was made to falsify complete removal.
- [ ] No recursive pagination design was produced.
- [ ] One revised product decision and one D3 merge verdict were given.
- [ ] No more than 24 pair/operation result rows were produced.
- [ ] No product/media-api fix or commit was made.
- [ ] The local app was restored and no sensitive values were written to disk.

## 8. Empirical follow-up results

### E1 — Baseline integrity

- **HEAD / pre-O3 direct ES:** the separate checkout `/Users/mkarpow/code/grid-pre-o3` was pinned at `99555be1218ef182265fc14d8d748065303e4ee9` on 6 September 2026. Its pinned `null-zone.ts` replaces a primary-null sort with the direction-derived `[uploadTime,id]` fallback and strips the primary cursor slot (`kupua/src/dal/null-zone.ts:42-83` at that baseline; Section 7.1 requires this baseline).
- **O3 negative control:** the dirty `/Users/mkarpow/code/grid` checkout remained at `fd5fb4c30e7c0b6ba3f45ae142b74590551076b0`; its uncommitted O3 production and test changes were not modified. The O3 browser reproduction on the TEST-backed app sent a reduced three-field sort with a two-value synthetic cursor and received ES 400 (`kupua/src/dal/null-zone.ts:56-68`; `kupua/src/stores/search-store.ts:3068-3085`).
- **D3:** the local media-api process was served from the main checkout, while the pre-O3 Kupua frontend was served from `/Users/mkarpow/code/grid-pre-o3` on the authenticated `kupua.media.local.dev-gutools.co.uk` host. Browser requests reached `/api/images/search-after`; the main checkout was not edited.

### E2 — Indexed field-presence table

The local port-9220 `images` corpus was below the Section 7.3 50,000-document gate: `_cat/indices` reported 10,102 documents on 6 September 2026. Aggregate `_count` probes returned 10,000 counted documents for the queried view; this mismatch was retained as an observation rather than treated as a corpus invariant. No source values, image IDs, index names, or response bodies were written to the report.

| Semantic field | ES field | Exists count / counted corpus | Missing percentage | Mapped value class | Completeness conclusion |
|---|---|---:|---:|---|---|
| Uploaded | `uploadTime` | 10,000 / 10,000 | 0% | date | Local fact; model-required fallback candidate |
| Uploader | `uploadedBy` | 10,000 / 10,000 | 0% | keyword | Local fact; model-required field |
| Width | `source.dimensions.width` | 10,000 / 10,000 | 0% | integer | Local fact for raw sort field |
| Height | `source.dimensions.height` | 10,000 / 10,000 | 0% | integer | Local fact for raw sort field |
| File type | `source.mimeType` | 10,000 / 10,000 | 0% | keyword | Local fact |
| File size | `source.size` | 10,000 / 10,000 | 0% | long/integer family | Local fact; zero values were `<= 0` |
| Category | `usageRights.category` | 736 / 10,000 | 92.64% | keyword | Incomplete; not an allow-list survivor |
| Credit | `metadata.credit` | 9,929 / 10,000 | 0.71% | keyword | Incomplete control |
| Source | `metadata.source` | 9,822 / 10,000 | 1.78% | keyword | Incomplete control |
| Taken | `metadata.dateTaken` | 9,667 / 10,000 | 3.33% | date | Incomplete control |
| Last modified | `lastModified` | 4,074 / 10,000 | 59.26% | date | Nullable primary control |

Raw width and height existed together on all 10,000 counted documents; oriented width and height existed together on 4. These are local observations, not architectural invariants. The model still declares asset dimensions, MIME type and size optional and carries a backfill FIXME (`common-lib/src/main/scala/com/gu/mediaservice/model/Asset.scala:9-12`).

### E3 — Pair/operation result matrix

All browser rows below were run on 6 September 2026. Cursor values are reported only as type vectors; actual values and identities were not retained.

| Baseline / mode | Pair and operation | Resolved sort / cursor shape | Result |
|---|---|---|---|
| HEAD / pre-O3 direct ES / local | `-uploadTime,width`, initial + midpoint scrubber | `[uploadTime desc,width desc,id asc]`; real and synthetic vectors were numeric/date, numeric, string | HTTP 200; landed `5,113 / 9,998`; no ES error |
| HEAD / pre-O3 direct ES / local | `-uploadTime,uploadedBy`, initial + midpoint scrubber | `[uploadTime desc,uploadedBy asc,id asc]`; real continuation string vector | HTTP 200; landed `5,113 / 9,998`; no ES error |
| HEAD / pre-O3 direct ES / local | `-lastModified,credit`, null-zone scrubber | reduced `[uploadTime desc,id asc]`; two-value fallback cursor | HTTP 200 from ES; scrubber remained at `1 / 1,324,129` in the TEST-backed run |
| HEAD / pre-O3 direct ES / local | `-lastModified,width`, null-zone scrubber | reduced `[uploadTime desc,id asc]`; three-value cursor retained secondary | HTTP 400: `search_after has 3 value(s) but sort has 2`; scrubber did not land |
| HEAD / pre-O3 direct ES / local | `-credit,source`, End control | ordinary multi-sort path | Reached `9,989 / 9,998` in the limited control; no error, not proof of full continuation |
| HEAD / pre-O3 direct ES / TEST | `-lastModified,credit`, scrubber midpoint/lower null zone | reduced `[uploadTime desc,id asc]`; two-value fallback cursor | HTTP 200 but repeated clicks remained at `1 / 1,324,129`; this is a client landing/reset failure, not an ES cursor rejection |
| D3 / pre-O3 Kupua / TEST | `-uploadTime,width`, midpoint | client sort `[uploadTime,width,id]`; forward and reverse cursor vectors `[number,number,string]` / real reverse `[number,string,string]` | Both HTTP 200; landed `673,209 / 1,324,145` |
| D3 / pre-O3 Kupua / TEST | `-lastModified`, midpoint + End | primary-only clause with leading-null reduction; cursor vector `[null,number,string]` | Midpoint forward/reverse HTTP 200, landed `633,077 / 1,324,147`; End HTTP 200, landed `1,324,137 / 1,324,147` |
| D3 / pre-O3 Kupua / TEST | `-lastModified,width`, null-zone scrubber | client clause `[lastModified,width,uploadTime,id]`; cursor vector `[null,number,string]` | HTTP 422: `sortValues length 2 must equal sort clause length 3`; scrubber stayed at `1 / 1,324,146` |
| D3 / pre-O3 Kupua / TEST | `-uploadTime,uploadedBy`, midpoint | client clause `[uploadTime,uploadedBy,id]`; synthetic numeric versus real string secondary vectors | Forward and reverse HTTP 200; landed `673,209 / 1,324,147` |
| D3 / pre-O3 Kupua / TEST | `-credit,source`, midpoint | client clause `[credit,source,uploadTime,id]`; synthetic cursor had three values | HTTP 422; scrubber stayed at `1 / 1,324,147` |
| D3 / pre-O3 Kupua / TEST | Focused image missing `lastModified`; sort transition from `-lastModified,width` to `-uploadTime,width` | Initial D3 request for `[lastModified,width,uploadTime,id]`; focused image retained through URL-driven sort change | HTTP 200; detail remained open and the focused image remained addressable. Open-detail scrubber clicks were intercepted, so null-zone focus landing is unverified |
| O3 / dirty direct ES / TEST | `-lastModified,credit`, scrubber null-zone seek | reduced `[credit,uploadTime,id]`; two-value synthetic cursor | ES HTTP 400; exact reason was sort/cursor arity mismatch; scrubber reset to `1 / 1,324,082` |

The direct-ES and D3 responses therefore differ in failure status, not in supported cursor shape: direct ES exposes the malformed pre-O3 synthetic cursor to Elasticsearch, while D3 rejects the same length mismatch as 422.

### E4 — Direct ES versus D3 contract

- **Supported and correct in the tested shape:** primary-only `-lastModified` through D3, and complete-primary ordinary secondary pairs `-uploadTime,width` and `-uploadTime,uploadedBy` through both direct ES and D3 for initial/midpoint operations. D3 also completed the tested reverse form for these supported shapes.
- **Unsupported but deliberately rejected:** D3 returned 422 for `-lastModified,width` and `-credit,source` when the pre-O3 synthetic cursor did not contain all four effective sort positions (`media-api/app/lib/elasticsearch/ElasticSearch.scala:793-799`; `media-api/app/controllers/MediaApi.scala:887-890`).
- **Unsupported and raw-ES failing:** pre-O3 direct ES sent the three-value `-lastModified,width` cursor against the two-field null-zone override, and Elasticsearch returned 400. The dirty O3 negative control preserved the secondary sort and likewise returned ES 400 with a different arity shape (`kupua/src/dal/null-zone.ts:52-68`; `kupua/src/stores/search-store.ts:3068-3085`).
- **D3 status depends on the emitted shape:** malformed cursor-length cases were converted to 422, but the unresolved `usagesDateAdded` special alias used as a secondary produced an accidental HTTP 500. Residual wrong-type parsing was not exercised over HTTP in this tranche; the controller currently extracts `sort` and `sortValues` with permissive `asOpt` (`media-api/app/controllers/MediaApi.scala:854-879`).

### E5 — Revised product decision

**Do not choose between removal and constrained retention from this tranche alone.** The evidence rules out **unrestricted** semantic secondary sorting, but it does not prove that all secondary sorting must be removed. Three product scenarios remain explicit decision candidates:

1. **Removal:** one semantic primary plus automatic `uploadTime,id`; no semantic secondary is emitted or accepted.
2. **Simple one-null-zone policy:** a semantic secondary applies while the primary has a value; when the primary enters its null zone, the client and server switch together to `[uploadTime,id]` and discard semantic secondaries. This requires fixing the synthetic seek transition, defining/rejecting later-null secondary cursors, and canonicalising or deliberately rejecting comma URLs.
3. **Ideal recursive policy:** preserve semantic ordering through every nullable boundary. This requires multi-phase pagination/cursor state and is not justified by the current usage proxies; no implementation should begin without a separate design decision.

The technically observed facts are: primary-only nullable sorting works through D3; complete ordinary secondaries work when the primary remains present; pre-O3 nullable-primary secondary seeks can send an incompatible cursor and fail direct ES with 400; D3 rejects the same shape with 422; a real later-null `credit` continuation on a filtered D3 corpus returned 200; and a special date alias used as a secondary produced an accidental 500 because it remained unresolved. Thus R1 is **narrowed**: policy 1 is the smallest currently safe contract, policy 3 is rejected pending evidence, and policy 2 remains technically plausible but needs an explicit client/API contract and focused implementation tests before selection. The hidden Shift+click gesture is reachable, but its product value remains unproven.

### E6 — O3 disposition

**Retain nested-filter hunk only.** Discard the O3 preservation hunk that keeps explicit secondaries in `sortOverride` and `strippedCursor`; it creates the reproduced 400 arity failure and is not supported by the pre-O3 synthetic cursor contract. Retain the nested-primary existence correction and its focused regression, because nested `usages` requires a nested existence query (`kupua/src/dal/null-zone.ts:70-80`; `media-api/app/lib/elasticsearch/ElasticSearch.scala:777-790`).

### E7 — D3 pre-merge action

**Conditional on E5; do not merge the current contract without choosing one.** For **removal**, D3 needs no recursive-null amendment: retain the existing length guard, add/document a single-primary contract test, and reject unresolved special aliases rather than allowing the observed 500. For the **simple one-null-zone policy**, D3 must explicitly implement and test the same fallback transition as the client: primary-null requests must use `[uploadTime,id]`, while later-null secondary cursors must be either deliberately rejected with stable 422 or covered by a separately chosen allow-list. For the **ideal recursive policy**, D3 would need a new cursor-phase contract and multi-phase implementation; that is out of scope and should block merge rather than be improvised. Independent of E5, the observed `usagesDateAdded` secondary produced HTTP 500 from the unresolved client alias, so alias validation or client-side rejection is required before claiming D3 is safe for every currently emittable sort.

### E8 — Test artifacts and residual uncertainty

- **Commands:** read-only Git baseline/status checks; local Elasticsearch `_cat/indices`, `_count`, `_mapping`, and aggregate existence probes. One explicitly approved temporary synthetic index was created, seeded with eight fixed documents, queried, and deleted; the real `images` index was never modified.
- **Browser cases:** pre-O3 direct ES local and TEST controls; pre-O3 Kupua through D3 for `-uploadTime,width`, `-uploadTime,uploadedBy`, `-lastModified`, `-lastModified,width`, and `-credit,source`; dirty O3 TEST negative control for `-lastModified,credit`. The app was restored to `/search?nonFree=true` after the D3 tranche.
- **Not run:** media-api controller tests, because no test files were added and the existing HTTP evidence was sufficient for the tested emitted shapes; full E2E/unit suites, because this was browser evidence collection and no product change was made.
- **Additional D3 evidence:** a 16,069-result TEST query filtered to missing `credit` produced a real continuation cursor with type vector `[number,null,string]`; forward traversal returned no error. Conversely, `-uploadTime,usagesDateAdded` sent the unresolved literal alias and returned HTTP 500. These results weaken any blanket claim that every later null fails, but strengthen the requirement to distinguish ordinary nullable fields from unresolved special aliases.
- **Position preservation:** a focused image selected from a `-has:lastModified` population remained open after a URL-driven transition from `-lastModified,width` to `-uploadTime,width`; the initial D3 request returned 200. The open detail overlay intercepts scrubber clicks, so this does not prove focused-image restoration after a null-zone scrubber seek. A dedicated automated focus-preservation test remains warranted for whichever product scenario is selected.
- **Grid focus preservation:** with detail closed, a single-click-selected card from the `-has:lastModified` population was sorted from `-lastModified` to `-uploadTime` through D3 on 6 September 2026. The sort-around-focus lifecycle ran, the card remained selected, but the scrubber settled at `1 / 1,210,215` rather than preserving the selected image's prior global position. This is user-visible position degradation under a missing-primary population; no image identity was retained in the report.
- **Local direct-ES focus follow-up:** after switching the pre-O3 checkout back to local direct-ES, the app did not render result cards for the attempted `-uploadTime,width` control; local auxiliary services returned connection/502 errors. No direct-ES position-preservation claim is made from that attempt. Earlier local direct-ES cursor and status evidence remains valid because it was captured while the local result set was available.
- **Local direct-ES confirmation:** after the local app recovered, the `-lastModified,width` scrubber seek was repeated on 6 September 2026 with 9,998 matches. It again sent a three-value cursor against the two-field `[uploadTime,id]` fallback, received ES 400 (`search_after has 3 value(s) but sort has 2`), and did not produce a clean requested landing. The earlier temporary local-service failure did not explain the cursor defect.
- **Identity-set follow-up:** a local `-uploadTime,width` virtual-scroll control reached `41 / 9,998`, but the response listener attached after the initial page requests and captured no page identities; no overlap/disjointness claim is made. The nullable-primary `-lastModified,width` case was nevertheless re-run with captured redacted cursor vectors and reproduced two ES 400 responses for the three-value cursor against the two-field fallback.
- **Deterministic synthetic-index test:** with explicit approval, a uniquely named local index was created from the pre-O3 checkout, seeded with eight fixed synthetic tuples, queried, and deleted on 6 September 2026. The real `images` count was 10,000 before and after; the synthetic index returned 404 after deletion and its temporary cursor artifact was removed. In the primary-null subset, the simple fallback `[uploadTime,id]` returned two disjoint pages covering all four null-primary documents and reverse traversal returned the prior boundary. Preserving the semantic secondary produced an additional nullable cursor slot (`[secondary,uploadTime,id]`) including `[null,uploadTime,id]`; this demonstrates the contract difference but does not prove recursive multi-null correctness.
- **Residual uncertainties:** exact local corpus count differs between `_cat/indices` and `_count`; D3 HTTP behavior for later-null cursors is covered by the filtered `credit` case but not every nullable field; range-selection and real forward-extension identity invariants were not exhaustively tested; E5 requires an explicit product decision before a single final E7 verdict can be selected.

### E9 — File size sort finding

**Classification: documented/displayed but never wired as a current sort token, not deliberately removed.** The current registry exposes `source_size` as a formatted detail/hidden-table field but has no `sortKey` (`kupua/src/lib/field-registry.ts:887-902`). The exact pre-O3 registry history shows the same field without a `sortKey` before and after the dimension-sort removal commit `128937471`; that commit removed the scripted pixel-count/dimension sort and added raw Width/Height field sorts, but did not add or remove a `fileSize` sort token (`git show 128937471`). The capability report lists `fileSize` as sortable, but no matching implementation token appears in the tracked `sort-builders.ts` history. `source.size` was added to the ES source allowlist by `5c59f4d24` for payload availability (`kupua/src/dal/es-config.ts:109`), not as sort wiring. Local ES shows `source.size` present on all 10,000 counted documents, with zero values `<= 0` and a numeric mapping family. The smallest future boundary is a focused `source.size` alias/builder test plus one primary-sort request; this is independent of the secondary-sort decision and was not implemented during the follow-up.

## 9. Policy impact trace

This section records the projected implementation blast radius for the three remaining product scenarios. It is a code-impact analysis, not a product decision; all three estimates assume no unrelated refactor.

### 9.1 Remove semantic secondary sorting

- **UI construction:** remove the Shift+click branches in the toolbar and table handlers. Those branches currently create, toggle, and replace comma-separated `orderBy` values (`kupua/src/components/SearchFilters.tsx:104-139`; `kupua/src/components/ImageTable.tsx:1123-1170`). The ordinary primary click and direction toggle remain.
- **URL/shared links:** `orderBy` is currently an unrestricted string (`kupua/src/lib/search-params-schema.ts:20-30`). Add one normalization boundary that keeps the first semantic token or deliberately rejects comma values; otherwise pasted/shared `primary,secondary` URLs continue to reach the DAL.
- **DAL/store:** no recursive null-zone work is needed. Existing primary-only null-zone fallback and synthetic `[null,uploadTime,id]` construction remain the supported shape (`kupua/src/dal/null-zone.ts:42-83`; `kupua/src/stores/search-store.ts:3068-3085`). The sort builder continues to append automatic `uploadTime,id` (`kupua/src/dal/adapters/elasticsearch/sort-builders.ts:57-83`).
- **D3:** the endpoint can retain its existing length validation for the narrowed client contract (`media-api/app/lib/elasticsearch/ElasticSearch.scala:770-799`). It still needs a deliberate response for unresolved special aliases, because the observed `usagesDateAdded` secondary reached a 500; ownership is request validation/sort parsing, not recursive pagination (`media-api/app/controllers/MediaApi.scala:854-890`; `media-api/app/lib/elasticsearch/sorts.scala:35-61`).
- **Focus/position:** the hidden secondary sort no longer invokes sort-around-focus with a multi-sort clause. Primary-only position behavior remains separately testable; the observed scrubber reset under missing-primary transitions is not automatically fixed by removing the UI gesture.
- **Migration/tests:** update the secondary-sort E2E that currently proves Shift+click construction (`kupua/e2e/local/ui-features.spec.ts:484-518`), add URL canonicalization/rejection coverage, and retain primary-only null-zone tests. Old shared comma URLs need an explicit compatibility rule.
- **Estimated blast radius:** two UI handlers, URL normalization, focused tests, and a narrow D3 alias guard. Lowest protocol risk.

### 9.2 Simple one-primary-null-zone policy

- **Semantic contract:** use `[primary,secondary,uploadTime,id]` while the primary cursor is present; on a primary-null cursor, filter to primary-missing documents and switch both sort and cursor to `[uploadTime,id]`. The synthetic seek path must construct the fallback shape rather than carrying arbitrary secondary slots (`kupua/src/stores/search-store.ts:3068-3085`).
- **DAL ownership:** `detectNullZoneCursor` currently removes only the primary and preserves all remaining clauses (`kupua/src/dal/null-zone.ts:52-83`). The simple policy requires restoring/retaining the fallback-only override and remapping only the fallback tuple. The nested existence correction can remain independently (`kupua/src/dal/null-zone.ts:70-80`).
- **Later-null secondary:** this policy does not define recursive handling. A secondary `null` while the primary is present must therefore be rejected, restricted by an explicit allow-list, or accepted as a documented degraded ES behavior. The filtered D3 `credit` case returned 200 with `[number,null,string]`, so a blanket “all later nulls fail” rule would be inaccurate; the contract must say which fields/shapes are supported.
- **D3 parity:** D3 currently removes only the primary and validates the reduced length (`media-api/app/lib/elasticsearch/ElasticSearch.scala:770-799`). To implement the simple policy, it must mirror the client’s fallback-only primary-null reduction or the client must send a pre-reduced `[uploadTime,id]` clause/cursor. The latter conflicts with Option B’s client-authoritative clause invariant unless the request explicitly carries the reduced clause.
- **Focus/position:** sort-around-focus, deep seek, `getIdRange`, forward extension, reverse extension, and cursor remapping all consume the shared null-zone helpers; changing the fallback shape has cross-path blast radius (`kupua/src/dal/null-zone.ts:1-4`). Existing evidence already shows scrubber position can reset even when the fallback request succeeds.
- **Migration/tests:** add failing-first tests for primary-null multi-sort shape, synthetic seek cursor length, real fallback continuation, reverse fallback continuation, range selection, and focused-card position. Shared comma URLs can preserve the feature only if their later-null behavior is defined.
- **Estimated blast radius:** medium-to-high across client DAL/store, D3 parity, and position/range tests. This is the smallest retention policy, but it is not a UI-only change.

### 9.3 Ideal recursive nullable pagination

- **Cursor protocol:** preserve the full semantic chain through successive null boundaries. A cursor needs phase information or an equivalent derivable contract for `[primary=null,secondary=value,...]`, then `[primary=null,secondary=null,...]`; current helpers detect only `cursor[0] === null` (`kupua/src/dal/null-zone.ts:42-68`; `media-api/app/lib/elasticsearch/ElasticSearch.scala:770-799`).
- **Client architecture:** deep seek currently synthesizes one primary value plus neutral anchors for every remaining clause (`kupua/src/stores/search-store.ts:887-906`), while null-zone seek hardcodes `[null,uploadTimeEstimate,""]` (`kupua/src/stores/search-store.ts:3068-3085`). Both would need phase-aware cursor generation, filtering, remapping, count-before, reverse, and range-selection logic.
- **D3/API:** Option B’s raw clause authority would need a documented multi-phase cursor contract, strict validation of every nullable slot, and matching Scala integration/controller tests. This is a protocol expansion, not a local sort fix (`kupua/exploration/docs/03 Ce n'est pas une pipe dream/media-api-work/phase-3-d3-searchafter-sort-companion-workplan.md:20-50`; `media-api/app/controllers/MediaApi.scala:866-890`).
- **Special/nested fields:** special aliases must expand correctly inside comma chains before recursive pagination can even begin; current builder behavior expands special aliases only as whole values (`kupua/src/dal/adapters/elasticsearch/sort-builders.ts:91-113`).
- **Focus/position:** every phase transition would affect scrubber interpolation, count-before, sort-around-focus, reverse traversal, and selection range identity guarantees. The current observed scrubber reset is evidence that these consumers are already sensitive to cursor/position shape.
- **Migration/tests:** requires a new deterministic matrix covering every nullable phase in both directions, direct ES/D3 parity, URL/shared-cursor compatibility, and likely new cursor state persisted across buffer/history boundaries.
- **Estimated blast radius:** very high and architecturally open-ended. No current usage evidence justifies starting this work during the D3 merge.

### 9.4 Decision-useful comparison

| Scenario | Feature retained | Main code ownership | D3 change | Shared-URL impact | Risk |
|---|---|---|---|---|---|
| Remove secondaries | None | UI + URL boundary | Narrow alias/shape validation | Define comma-URL normalization | Lowest |
| Simple one-null-zone | Secondary before primary null only | UI, null-zone DAL, seek/store, position/range consumers | Mirror fallback or define reduced-clause contract | Preserve only with explicit later-null rule | Medium/high |
| Ideal recursive | Full nullable chain | Store, DAL, cursor protocol, D3, focus/range | New multi-phase API contract | Largest compatibility surface | Very high |

The trace supports a staged decision: reject unrestricted current behavior and O3 as-is; choose removal unless the product explicitly values secondary browsing enough to fund the simple policy’s cross-path fixes; defer ideal recursion to a separate design proposal.