# P30: Common Admission and D3 Compatibility

20 September 2026. Role `bounded-design`; execution class `strong`.
One authorized report-only brief. Recommendations are unapproved; proposed checks are unexecuted.

## 1. Decision

**Recommend a narrow correction of the existing Kupua-facing D3 admission path, shared by each
subsequently activated ordered read.** Keep the existing grammar and query engine. Preserve user
conditions as user conditions; compose automatic suppression independently; retain server-derived
authorization before hits, IDs, totals or ranks; resolve the three supported print-usage keys only
in this selected path. Do not introduce a second CQL parser or change legacy GET by accident.

This addresses P29 C1/C2 and the selected slices of KUP-011, GRID-001 and GRID-008. It is not approval
to implement, a declaration that all those canonical bugs are closed, or permission to activate a
mixed-predicate browse path. S1 and candidate section 7 remain outside the change boundary.

## 2. Material Findings and Recommended Design

### Separate Provenance, Not User Negatives

[The mapper](../../../../src/dal/grid-api-search-adapter.ts#L115) injects default query text.
[The POST decoder](../../../../../media-api/app/lib/elasticsearch/ElasticSearchModel.scala#L160)
recognizes parsed intent but then combines user conditions and defaults in `structuredQuery`.
[QueryBuilder.makeQuery](../../../../../media-api/app/lib/elasticsearch/QueryBuilder.scala#L113)
groups all negative conditions with the same nested parent. It cannot recover their provenance.

The smallest proposed boundary is: send the original `q`; let `SearchParamsBody.fromJson` retain
normalized user conditions only; add a selected `QueryBuilder.makeBrowseQuery` entry point that
calls existing `makeQuery` on those user conditions and composes each missing automatic exclusion
as a separate outer predicate. Route `ElasticSearch.searchAfterQuery` through that entry point.
Do not append generated text or merge generated nested conditions back into the user's list.

Move the decoder's existing intent comparison into that browse composition: ignore polarity when
deciding whether a default was explicitly mentioned, compare `IsValue("deleted")` case-insensitively,
and recognize the parsed `usages.status` phrase `replaced`, including quoted input. Preserve current
status-value casing; this does not introduce case-insensitive keyword matching. Literal description
text is not special-field intent. Reuse a once-computed `Parser.run("")` default list, comparing its
normalized intent with the user's AST, then call `makeQuery(List(defaultCondition))` separately for
each missing default. This avoids another user-query parse and another implementation of the default
ES predicates. An outer conjunction/filter combines those singleton default queries with the user
query; it must never call `makeQuery(userConditions ++ defaults)`.

Explicit positive and negative mentions both suppress the corresponding automatic default. In
particular, deliberately writing `-usages@platform:print -usages@status:replaced` retains one user
negated conjunction. That is intentionally different from typing only `-usages@platform:print` and
receiving automatic replaced suppression. Do not infer provenance by deleting familiar-looking
negative conditions from an old client's payload: those conditions might really be user-authored.

The falsifiable expectation is that `-usages@platform:print` excludes both a print/published witness
and a digital/replaced witness, while two deliberately user-authored negatives retain the existing
same-record negated-conjunction semantics. The nearby assertions in
[cql.test.ts](../../../../src/dal/adapters/elasticsearch/cql.test.ts#L178) are preservation controls,
not assertions to weaken. A composed D3 fixture comparing IDs and first-page total is the smallest
behavior discriminator; it has not been executed.

### Authorization Is a Separate Obligation

Preserve [searchAfterImages](../../../../../media-api/app/controllers/MediaApi.scala#L867)'s parsed
positive-deleted restriction, principal-derived tier and validation. Extract its policy step for
reuse by later browse actions without weakening it for direct-ES parity. Existing
[buildFilterOpt](../../../../../media-api/app/lib/elasticsearch/QueryBuilder.scala#L154) and
[tierFilter](../../../../../media-api/app/lib/elasticsearch/SearchFilters.scala#L61) remain required;
image response actions are not a substitute for membership authorization.

### Preserve the Execution Contract

The selected query replaces only the base admission at
[searchAfterQuery](../../../../../media-api/app/lib/elasticsearch/ElasticSearch.scala#L754).
Keep physical sort clauses, null-zone scoping, live/PIT routing, runtime mappings, projection,
tuple truncation, reversal, error handling and count ownership intact. Common membership does not
promise a common snapshot or make an operation-scoped total the session total.

### Exact Proposed Change Boundary

| Owner | Minimal proposed change and shared-caller effect |
| --- | --- |
| `apiSearchAfter` in [the adapter](../../../../src/dal/grid-api-search-adapter.ts#L105) | Send `q: params.query ?? ""` without injection. Preserve dates, filters, physical sort, `countAll`, transport, cancellation, recovery and S1 normalization. Every D3 request from this function changes together, including continuation and lookup/probe requests. No new client policy flag. |
| `SearchParamsBody.fromJson` in [the model](../../../../../media-api/app/lib/elasticsearch/ElasticSearchModel.scala#L143) | Keep one `Parser.normalise(Parser.parse(q))`, retain it as user-only `structuredQuery`, and remove default appending. Preserve every other decoded member and current malformed/non-string-q fallback. The application-call search found D3's controller call only; existing direct tests are also affected. Change decoder and execution composition together, not in separate active releases. |
| `MediaApi.searchAfterImages` | Extract its existing `.map` policy body into a private `scopeBrowseSearchParams(params, principal)` helper, preserving positive-deleted recognition, uploader override, privileged behavior and principal-derived tier. Keep `SearchParams.validate`, status/error mapping and `auth.async(parse.json)`. Later actions must reuse this decode/scope/validate sequence; a raw decoder or query builder is not an authorized admission API. |
| `QueryBuilder` | Add `makeBrowseQuery(userConditions)` with the missing-default composition above and the three nested print-field rewrites below. Keep `makeQuery`, `makeQueryBit`, ordinary aliases, fuzzy settings and `buildFilterOpt` behavior unchanged for all existing non-browse callers. No new parser, public query language or generic policy mode in the request. |
| `ElasticSearch.searchAfterQuery` | Replace only its base `makeQuery` call with `makeBrowseQuery`. Reuse `buildFilterOpt` with the scoped params. When another operation is added, extract/reuse this base-query/filter composition and the existing conditional syndication runtime-mapping calculation rather than copying a second policy implementation. Leave D3's remaining execution path intact. |
| Client direct builder, `Parser.run`, `QuerySyntax.resolveNamedField`, `ImageFields`, `SearchFilters`, mappings and legacy GET | No production change in the recommended first boundary. They supply preservation evidence and residual-coupling limits. Direct-mode raw detection remains KUP-011; legacy grouping/policy and broader vocabulary are not silently repaired. No new endpoint/window implementation is included. |

For each admitted request, membership is the conjunction of the interpreted user query, independent
automatic defaults, required principal/tier restrictions, existing top-level filters and any explicit
operation scope. Apply it before hits, source-free IDs, totals and count-before ranks. An operation
may additionally restrict IDs, valued/missing phase or the null zone; that difference must be named.
Live routing and PIT contents can legitimately differ in time/target, and D3 intentionally returns
zero when counting is disabled ([execution](../../../../../media-api/app/lib/elasticsearch/ElasticSearch.scala#L830)).
None of those differences excuses a different automatic-default predicate on an unchanged fixture.

### Mapped Print Fields and orderedBy

Use a small browse-only AST rewrite for `Nested(SingleField("usages"), field, value)` and its
`NegationNested` wrapper, before existing grouping. Match the known field forms emitted by
[resolveNamedField](../../../../../media-api/app/lib/querysyntax/QuerySyntax.scala#L142):

| Accepted key | Selected absolute field resolution |
| --- | --- |
| `usages@section` | `usages.printUsageMetadata.sectionCode` plus the existing client alternative `usages.printUsageMetadata.sectionId`; retain the alternative without claiming it is mapped. |
| `usages@publication` | `usages.printUsageMetadata.publicationName` and `usages.printUsageMetadata.publicationCode`. |
| `usages@orderedBy` | `usages.printUsageMetadata.orderedBy`, as a built-in nested key. This is not the `orderBy` sort parameter. |

This matches the [client's current absolute paths](../../../../src/dal/adapters/elasticsearch/cql.ts#L250)
for the supported code cases. Do not rewrite arbitrary MultipleField/SingleField conditions, change
top-level aliases, add a nested prefix to every field, or alter positive/negative same-record grouping.
The [mapping](../../../../../common-lib/src/main/scala/com/gu/mediaservice/lib/elasticsearch/Mappings.scala#L292)
has print `sectionName` and `sectionCode`, not print `sectionId`; digital sectionId is a different
leaf. Recommend preserving code support now and deferring a named vocabulary change. For example,
`usages@section:S30` must match sectionCode S30; a print sectionName WEEK30 alone should not start
matching `usages@section:WEEK30` incidentally. Adding names or switching to digital IDs needs an
operator decision and its own explicit expected set, not another bug ID by default.

**orderedBy needs a narrower finding than publication/section.** It is a SingleField and therefore
does traverse the real [configuration alias resolver](../../../../../media-api/app/lib/elasticsearch/QueryBuilder.scala#L20).
An effective `field.aliases` entry mapping alias `orderedBy` to the canonical absolute leaf can
already make today's D3/GET orderedBy query correct. MultipleField section/publication do not take
that route. Thus the blanket assertion that all three keys always miss is not supported.

Recommend the canonical built-in nested resolution above, independent of whether the short alias
is present, while leaving an ordinary top-level configured alias unchanged. An alias already pointing
to the canonical leaf retains its meaning; a deliberately different `orderedBy` alias would require
explicit approval of the nested-key change. Effective server aliases were not inspected. The examined
client alias declarations are only partial; the cost snapshot is not their source. Ask for a sanitized
answer about that one alias, not private configuration or a new infrastructure investigation.

### Rejected Alternatives

- **Mapper-only removal:** insufficient. The current POST decoder still appends the default into
	the grouping list; direct-mode raw intent checks also remain. Naked POST intent tests do not prove
	the composed browser path.
- **Fix shared Parser/QuerySyntax/`makeQuery`:** fewer edited lines could change legacy GET, AI
	filters and other callers. It is not the smallest approved behavioral boundary, and splitting all
	user negatives would break the preserved controls. No fuzzy setting or ordinary text rewrite follows.
- **Keep corrected new reads beside unchanged D3:** reject activation. D3's retained initial total
	and neighbourhood would describe a different set even without live drift.
- **Isolated compatibility entry:** useful only if actual D3 callers cannot move together or a
	maintainer requires the existing endpoint's behavior frozen. A separate selected cursor entry,
	for example a proposed `POST /images/browse/search-after`, could share the decoder internals,
	browse query helper, scoped authorization and D3 execution/projection/response code; the old entry
	would retain old composition. It needs route/client selection and explicit old/new tests, but no
	duplicate grammar or paging engine. Identical unmarked requests cannot select two meanings: some
	explicit entry selection would then be unavoidable. The documented one-laptop-caller prototype
	does not currently justify that extra wire surface. Recommend the existing route, not a speculative
	version header, client-generated default-provenance signal or general versioned-session framework.

### Rollout and Session Handling

1. Obtain agreement on the semantics and bounded changes, then add characterization/regressions in
	 the existing homes below. Dormant query/policy helpers can land independently. Changing the active
	 decoder to user-only conditions before switching its query composition would remove defaults;
	 changing the mapper alone is also not a completed correction. No implementation is authorized here.
2. Prepare one selected admission across D3 first page/count, every continuation, and each active
	 window/key/rank consumer. Land future server capabilities inactive as useful; wire each to the same
	 base admission before enabling its consumer. No requirement to build the future operations in the
	 first common-admission patch is implied.
3. **Current hybrid is a real constraint, not an exception to the join.** The direct builder's
	 [raw checks](../../../../src/dal/es-adapter.ts#L470) disagree on quoted/non-intent forms and it has
	 no server principal context. A D3 correction plus the old direct positional branches cannot be
	 certified as the agreed browse path. Recommend keeping the corrected composed consumer inactive
	 until every participating branch meets its predicate/policy contract; the separate direct-only
	 prototype may retain its explicitly unfinished issue. If earlier corrected hybrid use is essential,
	 the bounded alternative is parsed-intent metadata from the existing `parseCql` AST traversal plus
	 replacing just `buildQuery`'s two substring guards. That is a separate approval, not a CQL rewrite;
	 it still cannot replace required server authorization or settle unrelated A/B differences. Do not
	 enable a partially compatible path or silently remove supported queries to get around that limit.
4. For the documented coordinated prototype cutover, stop old clients, switch mapper and selected
	 server entry together, then begin a fresh browse generation. Do not resume pre-change cursor
	 neighbourhoods, retained totals, position maps or history restore metadata under the new predicate.
	 A PIT freezes documents, not query meaning. A plain reload can retain browser session state: use a
	 fresh browse/session and retire just the old browse/history/cursor metadata, not selections or UI
	 preferences. Reuse ordinary best-effort PIT cleanup; no new durable session store or cursor format.
5. Recompute first-page membership/count and dependent coordinates before publishing the new generation.
	 Reusing an old tuple as a new seek hint requires fresh admitted lookup/rank, not reuse of its old
	 ordinal/total; otherwise restart at the first page. Rollback also starts a fresh generation. If old
	 clients must stay active, select the isolated alternative before rollout rather than stripping their
	 injected text heuristically. No new release flag is required for the coordinated option.

This is an activation order, not a claim that S2/S3 exist, permission to implement them, or a global
migration gate on unrelated work. It adds no necessary request round trip in the steady-state query
composition. ES work and latency have not been measured; no performance concession is proposed.

### Compact Regression Matrix: Current D3, Unexecuted

These are concrete tests that can be added to **today's D3 test homes**, including failing-first
targets for the proposed correction. They were not run. Use valid synthetic Image/Usage constructors,
an isolated fixture set, `nonFree:"true"`, `orderBy:"uploadTime"`, physical uploadTime-ascending/id-ascending
sort, `length:1`, no other filters and `countAll:true` on the initial request. The IDs below abbreviate
`p30-a` through `p30-j`; uploadTime increases in that order, source/document IDs agree, description is
`fixture`, keyword is `p30`. Nondeleted images belong to synthetic principal `fixture-self`.

| IDs | Relevant witness fields |
| --- | --- |
| a / b | digital/published / print/published. b has print sectionCode S30, publicationCode PUB30, orderedBy DESK30 and sectionName WEEK30. |
| c / d | digital/replaced / print/replaced; d has the same print codes as b. |
| e / f | print/removed / no usages. |
| g / h | soft-deleted, no usages, belonging to fixture-self / fixture-other. |
| i / j | i has two records, print/pending and digital/published; j has digital/removed. |

`rank(x)` below is the expected **future zero-based count-before** for x's actual returned tuple,
not a current D3 capability. Totals describe the full admitted fixture set, not one-hit page length.

| Case and actual `query` input | Recommended ordered IDs; total; meaningful rank | Current-source discriminator or preserved control |
| --- | --- | --- |
| D0: empty string | a,b,e,f,i,j; 6; rank(f)=3 | Both defaults remain effective. Missing/non-string q retains its existing decoded-empty behavior. |
| D1: `-usages@platform:print` | a,f,j; 3; rank(f)=1 | Today's composed D3 predicate predicts a,b,c,e,f,i,j (7), including the b/c witnesses; this is source reasoning, not an executed ES result. |
| D2: `-usages@platform:print -usages@status:replaced` | a,b,c,e,f,i,j; 7; rank(f)=4 | Intentional user-negative grouping: only a single print-and-replaced record is excluded. Do not change this to D1's set. |
| D3: `-usages@platform:print -usages@status:removed` | a,b,f,i,j; 5; rank(f)=2 | Preserve user NOT(print AND removed), separately suppress replaced. In the supplied scalar-status fixture the old three-condition grouping predicts all eight nondeleted images. |
| D4: `usages@platform:print usages@status:published` | b; 1; rank(b)=0 | Positive conditions must share one nested record; split-record i must fail. No generic term-versus-phrase bug inferred. |
| D5: `usages@status:"replaced"`, with `usages@status:replaced` as control | c,d; 2; rank(d)=1 | Quoted and plain parsed intent agree. Current mapper adds a contradictory default only to the quoted form. |
| D6: `is:"deleted"` and `is:DELETED` | ordinary fixture-self: g, 1; privileged with no uploader filter: g,h, 2; ranks 0 and then 1 | Parsed intent suppresses only the automatic deleted exclusion. Current composed mapper contradicts these forms; bare POST tests alone miss that defect. |
| D7: `keyword:p30 is:deleted`, with requested uploader fixture-other | ordinary: g, 1; privileged: h, 1; rank=0 | Separately enforced authorization overrides the ordinary request's uploader, while privileged filtering is retained. Reuse the existing isolated policy fixture; no new live/security reproduction. |
| D8: `-description:"is:deleted"` and `-description:"usages@status:replaced"` | a,b,e,f,i,j; 6; rank(f)=3 | Literal text is not intent. Current POST's parsed defaults are a preservation control; direct-mode raw omission is not the expected API behavior. |
| D9: `-is:"deleted"` and `-is:DELETED` | a,b,e,f,i,j; 6; rank(f)=3 | Explicit negative intent prevents duplicate default generation but is not positive-deleted authorization intent. |
| D10: each of `usages@section:S30`, `usages@publication:PUB30`, `usages@orderedBy:DESK30`; also section+publication together | b; 1; rank(b)=0 | Assert absolute mapped paths as well as membership; d is still excluded by the independent default. For orderedBy test absent alias and canonical-path alias. Section/publication cannot be rescued by the SingleField alias hook. |
| D11: `usages@orderedBy:DESK30` with an intentionally conflicting short alias | b; 1; rank(b)=0 under the recommended built-in rule | Use a separate two-image fixture: b and digital witness z with digital sectionId DESK30, alias `orderedBy` pointing there. Recommended nested result remains b, not z; ordinary top-level alias behavior stays unchanged. This is a decision-dependent compatibility control, not a newly discovered configuration defect. |
| D12: positive-deleted request under the existing ReadOnly/Syndication machine POST-denial fixtures | 403; no IDs/total result and no ES dispatch | Keep route admission separate from parsed intent. Do not interpret denied/no result as total zero or change machine method policy. |

For every successful row, assert the captured mapper `q` equals the exact original input, including
quotes/case and explicit negatives. Pair that complete expected request body with the Scala controller/
ES fixture, not only a hand-written decoder call. A shared golden body checked in both existing test
homes establishes the serialization join; it still is not a browser/HTTP execution claim. Collect D3
continuations at page size one with unchanged scope, authoritative returned cursors and `countAll:false`:
the concatenated IDs must equal the row, without duplicates/omissions. Preserve continuation `total=0`
and retained initial total separately; also retain reverse/PIT/null cursor assertions, without using
those operation scopes as an excuse to change defaults.

### Future Contract Tests: Unbuilt Operations, Unexecuted

| Future contract | Concrete expectation on the same static, equally authorized fixture |
| --- | --- |
| Window | D0 offset 1, length 2 gives b,e; if requesting a base-scope total, it is 6, not 2. D1 offset 1 gives f,j and base total 3. No new route is implemented by this brief. |
| Keys | D0 complete source-free collection gives a,b,e,f,i,j; D1 gives a,f,j. Cursor pages and any explicit phase restrictions compose to the same base set. Test dedicated map-PIT and live-range scope separately, not universal snapshot equality. |
| Count-before rank | Assert the numeric ranks in D0-D11 using the actual returned tuple and the same base query/policy. In particular f ranks 1 under D1 but 4 under deliberate D2. Do not substitute page length, continuation zero total or total membership for rank. |
| Activated join | For each row, D3 initial count, concatenated D3 pages, equivalent complete windows/keys and rank all agree after removing only documented operation-specific restrictions. Include controller authorization and required runtime mappings in every applicable operation, not merely equal CQL strings. No undeployed capability is claimed tested today. |

### Existing Test Homes and Intentional Assertion Changes

- [Adapter wire tests](../../../../src/dal/grid-api-search-adapter.test.ts#L674): add exact q/body
	cases and first/continuation `countAll` assertions. Keep both nonempty-sort assertions and S1
	image/tuple/enrichment/recovery tests intact; no inspected existing q expectation needs weakening.
- [D3 body tests](../../../../../media-api/test/lib/elasticsearch/ElasticSearchTest.scala#L937):
	intentionally replace `structuredQuery shouldBe Parser.run("")`, `should not be empty`, non-intent
	`should contain allElementsOf Parser.run("")`, and the positive-intent assertion containing
	`Parser.run("").last`. They currently assert **where** defaults live. Assert normalized user-only
	AST instead, then assert the full suppression/default behavior in browse-query and controller/ES
	tests. Do not delete the behavioral coverage when changing this representation.
- [Existing controller/ES fixture](../../../../../media-api/test/lib/elasticsearch/ElasticSearchTest.scala#L789):
	extend `withImages`/`assertPage` with D3-specific ordered ID, total and cursor checks. Keep existing
	deleted-scope and ordinary-default expected memberships; do not change shared `assertBothModes`
	expectations to force legacy GET into this correction. New failing cases must pass through the
	actual mapper-body contract and authenticated D3 entry, not only `searchAfter` with handcrafted AST.
- [QueryBuilderTest](../../../../../media-api/test/lib/elasticsearch/QueryBuilderTest.scala#L39):
	add a separate `makeBrowseQuery` group for automatic/default separation and mapped fields. Existing
	`makeQuery(Nil) == matchAll`, nested-status, ordinary multi-field/fuzzy and alias-existence assertions
	stay unchanged. Test the browse entry on the same user AST to demonstrate its intentional difference.
- [Client grouping controls](../../../../src/dal/adapters/elasticsearch/cql.test.ts#L118): preserve
	the single-negative `mustNot`, positive same-record AND and multiple-negative single nested
	`mustNot` assertions at [the grouped control](../../../../src/dal/adapters/elasticsearch/cql.test.ts#L178).
	No CQL generic grouping rewrite is part of this recommendation.
- [Controller policy tests](../../../../../media-api/test/controllers/MediaApiTest.scala#L73): keep
	ordinary uploader override, privileged preservation, no-positive-intent behavior and machine-tier
	no-dispatch assertions exactly as policy expectations. Later operation handlers need equivalent
	coverage when built. Future window/key/rank assertions belong alongside these existing Scala homes;
	missing future tests or capabilities are not bugs.

## 3. Coverage Receipt

All 21 assigned paths are accounted for below. Ranges are inclusive, 1-based actual reads; even a
complete short file is not independently verified. P28's findings and its relevant source receipts
were reused, then the deciding originals re-read only as listed. **All text lines outside the listed
unions and all unlisted JSON fields are explicitly uninspected by this report.** Search snippets were
locators, not whole-line/whole-file review credit; hashing and the negative alias-object projection
are not semantic inspection of other fields. Adjacent unrelated material within a read range was not
promoted into a finding. Supplied directives/memory are orientation, not a new corpus review.

### Assigned-Input Receipts

```json
[
	{"path":"kupua/exploration/docs/03 Ce n'est pas une pipe dream/media-api-work/api-boundary-11-candidate-plan.md","sha256":"d11be44f29d9e2e028745a5bb3895b06752aaf2e12be16d995b4942c97fec46f","method":"line-ranges","ranges":[[74,187],[663,704]],"note":"Common admission, ordered-read promises and accepted C1/C2 scope. Section 7 untouched and not reread; heading searches confer no additional credit."},
	{"path":"kupua/exploration/docs/03 Ce n'est pas une pipe dream/media-api-work/api-boundary-12-plan-challenge.md","sha256":"5f76ef943c38f6020ef7f437ea93045a97fc7ee997067ba91999020207aeaeee","method":"line-ranges","ranges":[[1,175],[397,433]],"note":"Reuse C1/C2 and evidence limits. Adjacent C3/capability material is context only, not a P31 assignment or renewed challenge."},
	{"path":"kupua/exploration/docs/bug-backlog.md","sha256":"e9ab22ada4aa03a6d0e175930cceffa5f1b6a2e401b30121628f52af3ca92078","method":"line-ranges","ranges":[[1,48],[153,164],[319,354]],"note":"Disposition rules, existing KUP-011/GRID-001/GRID-008 occupancy, and GRID-002 for assigned Q5. Adjacent headings/partial next entry are not new findings; no IDs allocated."},
	{"path":"kupua/exploration/docs/03 Ce n'est pas une pipe dream/media-api-work/api-boundary-09-p28-concrete-query-discrepancies.md","sha256":"f15acb8d3022be04ec9f7d2289545b07afb3fbdeca03c19eb6f6e9c13ed104e9","method":"line-ranges","ranges":[[5,22],[28,31],[36,50],[71,120],[200,221]],"note":"Reuse Q2/Q3/Q4/Q5/Q10, relevant prior receipts, refutation and source/engine/config limits. Adjacent table rows are not a new audit or independent validation of their originals."},
	{"path":"kupua/src/dal/grid-api-search-adapter.ts","sha256":"39ef336ef8bc666979692d3c48c8e693da786c4dae4266ef892435a1e1ff8d73","method":"line-ranges","ranges":[[98,180]],"note":"Original q injection, full request-field construction and beginning of failure classification; no S1 mapper revalidation."},
	{"path":"kupua/src/dal/grid-api-search-adapter.test.ts","sha256":"cc1f80c966b73754a53f60e233ec8afa6f1949b8770ef009a1ef8c19e114a917","method":"line-ranges","ranges":[[1,205],[340,380],[665,735]],"note":"Existing fixture constructors, probe params, wire-sort assertions and nearby recovery controls; tests read, not run. Other matched locator lines not credited."},
	{"path":"kupua/src/dal/adapters/elasticsearch/cql.ts","sha256":"636a39cd8f0767f0a44f19fc5b494b6fd412df5e6ee3c0c480e4af2c571cb165","method":"line-ranges","ranges":[[1,160],[225,355],[385,623]],"note":"Parser/field ownership, mapped print keys, is-value normalization and existing AST/grouping traversal. Used to bound a possible direct-mode companion, not to propose a generic rewrite."},
	{"path":"kupua/src/dal/adapters/elasticsearch/cql.test.ts","sha256":"71ac5f00d04fd0184894b70103d0fd5d71b847b32362cc323a9242d79640d908","method":"line-ranges","ranges":[[100,199]],"note":"Single-negative and deliberate same-record positive/negative grouping controls; beginning of file uninspected."},
	{"path":"kupua/src/dal/es-adapter.ts","sha256":"7ddcd36711bd5fc5a8edd6e2e35270bd51a554e210bf7ace8db2b194ed4573f5","method":"line-ranges","ranges":[[450,575]],"note":"Direct buildQuery raw intent checks, separate default predicates and top-level filter composition only. Other producer algorithms reused through prior findings, not recredited."},
	{"path":"media-api/app/lib/querysyntax/QuerySyntax.scala","sha256":"17bd6ea1f5f8052b923a3da6788eea3ee7f2397167bde94d8bdff8b4ad62bfa7","method":"line-ranges","ranges":[[1,180],[277,294]],"note":"Accepted nested/is syntax, exact-match values, field resolution and limited grammar tail. No parser execution or whole grammar review."},
	{"path":"media-api/app/lib/querysyntax/Parser.scala","sha256":"5ee61b322086852bbffb31d341f52e4449b486c03317c0e661bb35233db97b22","method":"line-ranges","ranges":[[1,34]],"note":"Separate parse/normalise/run ownership and existing default list; no function invoked."},
	{"path":"media-api/app/lib/elasticsearch/ElasticSearchModel.scala","sha256":"4a46deb66ea728cdf93ae16e1cb83bd4fb030cde29558fb5bd6e1778e4a45fbb","method":"line-ranges","ranges":[[100,240]],"note":"POST cursor/body parsing, parsed intent and appended defaults; remainder, including legacy decoder, not reread."},
	{"path":"media-api/app/lib/elasticsearch/QueryBuilder.scala","sha256":"d973848aa988c7a050afd2395c084d2329eff653a4b6d6a0cc4003df8aaee321","method":"line-ranges","ranges":[[1,239]],"note":"Existing alias dispatch, nested grouping and complete top-level/tier filter composition; full short source read does not imply executed or independent verification."},
	{"path":"media-api/app/lib/elasticsearch/SearchFilters.scala","sha256":"b499d32bd514773ada5265618f7feab2c978d1554bb99d9037dcc0dbbf4eb10a","method":"line-ranges","ranges":[[1,90]],"note":"Required tier filter and already absolute print-filter leaves; preserve shared helper behavior."},
	{"path":"media-api/app/lib/elasticsearch/ElasticSearch.scala","sha256":"c563114420f0297cd5c61566258d45608886759a0cee167840a14e0899ce052d","method":"line-ranges","ranges":[[730,933]],"note":"D3 execution entry/base query, null scope, live/PIT distinction, runtime mappings, count and tuple/projection preservation; other execution paths not reread."},
	{"path":"media-api/app/controllers/MediaApi.scala","sha256":"859610f8fa50e925082125cb9c7a19f92941725add7a87e771619c160e4f7a26","method":"line-ranges","ranges":[[580,615],[850,912]],"note":"Narrow legacy admission comparison and complete D3 policy/validation/dispatch. App-call search found SearchParamsBody.fromJson at D3 only. Broader GET guards reused from P28, not independently reverified."},
	{"path":"common-lib/src/main/scala/com/gu/mediaservice/lib/ImageFields.scala","sha256":"4d629da6f62257b5613211b0d633a9f9b5fc5d090ca3a99628ed9c41278b33f9","method":"line-ranges","ranges":[[1,72]],"note":"Static field namespaces do not automatically prefix print leaves; short source read only."},
	{"path":"common-lib/src/main/scala/com/gu/mediaservice/lib/elasticsearch/Mappings.scala","sha256":"46838d64c30c8fdc03ca2bb7b21fd5bbf705c312d7a5d9fe8106bc2f268ee933","method":"line-ranges","ranges":[[260,349]],"note":"Print/digital metadata and usage nested mappings; declared mapping, not effective deployed schema."},
	{"path":"media-api/test/lib/elasticsearch/QueryBuilderTest.scala","sha256":"393d0f1939193580c3c709d00b67f3207b2df2b5d0acffe29b58ce39dac40de2","method":"line-ranges","ranges":[[1,235]],"note":"Existing ordinary/fuzzy/nested assertions and beginning of configured existence-alias controls; new browse group proposed, none executed."},
	{"path":"media-api/test/lib/elasticsearch/ElasticSearchTest.scala","sha256":"b17c50aba7054d1f7b880d410ea4274c558d18245d6b07fd61b95ad5c67aa1a1","method":"line-ranges","ranges":[[780,999]],"note":"Reusable controller/ES fixture, policy/default memberships, rights/date/lifecycle controls and exact body-AST assertions requiring revision; no ES or tests run."},
	{"path":"media-api/test/controllers/MediaApiTest.scala","sha256":"a812035e493f739d7542c866d971867c51505d68f28c8752dba3cb81c049dc11","method":"line-ranges","ranges":[[1,151]],"note":"Authentication harness, positive-deleted scope, privileged/no-intent and denied-machine controls; unrelated trailing assertions are not findings."}
]
```

### Supplemental/Orientation Receipts

```json
[
	{"path":"kupua/AGENTS.md","sha256":"9293ded3a8e578b01bca0a4d39f7ce73d4279edc57dfd63d21cfd6867d1aba45","method":"line-ranges","ranges":[[1,227]],"note":"Required routing and documented prototype/caller scope; not fresh Git, runtime or deployment evidence."},
	{"path":"kupua/exploration/docs/worklog-current.md","sha256":"67a9d05192fe36c7f46a13ce443ec158b007bcde71f90fb05dab0b6ad28b8f67","method":"line-ranges","ranges":[[1,73]],"note":"Required coordinator context and two-brief authority; read only, no check-in/reset/update."},
	{"path":".github/instructions/media-api.instructions.md","sha256":"0bcceb19a34ad34d957c5d3e3065ba7b5e061fa1d3c681d4939bab26be21635b","method":"line-ranges","ranges":[[1,152]],"note":"Applicable server instructions read before server originals; no code or convention changes."},
	{"path":"kupua/exploration/docs/03 Ce n'est pas une pipe dream/media-api-work/api-boundary-05-review-protocol.md","sha256":"3cddf1ab34508b9d0f3a424f186ec0af7d40a4ec4d55737445d3e4288262fd4f","method":"line-ranges","ranges":[[1,466]],"note":"Current bounded-design mandate and administrative constraints; historical commands not executed."},
	{"path":"kupua/exploration/docs/03 Ce n'est pas une pipe dream/media-api-work/api-boundary-08-review-prompt.md","sha256":"2d0d0740cd99983d64fc76fdba3abc722002a2d9a1f5806fdaae86ade4f84fdf","method":"line-ranges","ranges":[[1,305]],"note":"Required six-section report, bug-disposition and receipt rules; no other packet selected."},
	{"path":"kupua/exploration/docs/03 Ce n'est pas une pipe dream/media-api-work/api-boundary-06-coverage.json","sha256":"f13035a9adc5ca48e63b41d6219f0666a105adb096bfe95bfaeba265004dd90e","method":"json-pointers","pointers":["/packets/29"],"note":"Only P30 packet projected: ready, strong, bounded-design, exact report path and 21 assignments. Other register fields have no semantic reading credit; no enumeration or register edit."},
	{"path":"kupua/src/lib/grid-config.ts","sha256":"228b010e13d07e71e63d8007c8ea509ed48cbf9d3fc42452799e1135a95db380","method":"line-ranges","ranges":[[128,238]],"note":"Partial client alias declaration lead only; does not establish effective server aliases or absence of another alias elsewhere."},
	{"path":"kupua/src/lib/cost/guardian-config.json","sha256":"60e7fde9a755b884d1dde31fe33a341179a7669a37a0041202e31c690fb68713","method":"line-ranges","ranges":[[1,45]],"note":"Discarded configuration lead: header identifies a usage-rights snapshot, not field-alias authority. A read-only alias-object projection yielded no matches and no field-value reading credit outside this range."}
]
```

## 4. Evidence and Bug Dispositions

**New candidates: none.** No IDs allocated and no repair scheduled. These are dispositions of the
assigned findings and their concrete refutations, not an additional bug hunt. Every active claim is
source-supported/test-read or explicitly qualified inference, **not reproduced**. Human ownership
remains owner-to-confirm. Sensitive entries retain private maintainer/security triage, without new
reproduction detail, contact or publication.

| Candidate, trigger and owner | Expected / actual; original sources | Smallest unexecuted discriminator; canonical disposition requested |
| --- | --- | --- |
| **KUP-011**, existing. Quoted/case-varied special intent or a non-intent literal; Kupua mapper/direct builder, with analogous Grid legacy default construction. | Defaults should follow parsed intent. [Mapper](../../../../src/dal/grid-api-search-adapter.ts#L119), [direct builder](../../../../src/dal/es-adapter.ts#L470) and [Parser.run](../../../../../media-api/app/lib/querysyntax/Parser.scala#L10) use raw substrings; [POST](../../../../../media-api/app/lib/elasticsearch/ElasticSearchModel.scala#L166) cannot remove already injected user-looking negatives. Source/test-read, not composed reproduction. | D5/D6/D8/D9, exact mapper body plus authenticated D3 membership/total. **Update same ID** with paired mapper/decoder/composition boundary and hybrid activation caveat. Keep D3/new-read admission a slice prerequisite; do not close remaining direct/GET forms or demand their unrelated repair before inactive work. |
| **GRID-001**, existing. Automatic replaced suppression with a user-negative usage clause; media-api composition with mapper participation. | Automatic suppression and user exclusion should both apply, while deliberate user-negative conjunction is preserved. [Grouping](../../../../../media-api/app/lib/elasticsearch/QueryBuilder.scala#L113) loses provenance after [default append](../../../../../media-api/app/lib/elasticsearch/ElasticSearchModel.scala#L170). Direct [separate default](../../../../src/dal/es-adapter.ts#L485) and [user grouping control](../../../../src/dal/adapters/elasticsearch/cql.test.ts#L178) distinguish the obligations. Source-derived predicates, no ES witness. | D1 versus D2/D3 with valid scalar-status usage fixtures, IDs and initial totals, later ranks. **Update same ID**: independent automatic composition gates the activated D3/ordered join; no generic nested-negation fix. Legacy GET remains outside this correction, so no whole-ID closure. |
| **GRID-008**, existing. Code-valued section/publication and selected orderedBy input; Grid query resolution/mapped vocabulary. | [Client](../../../../src/dal/adapters/elasticsearch/cql.ts#L250) addresses mapped leaves, whereas [server MultipleField forms](../../../../../media-api/app/lib/querysyntax/QuerySyntax.scala#L154) are unprefixed and bypass [SingleField resolution](../../../../../media-api/app/lib/elasticsearch/QueryBuilder.scala#L65). [Mappings](../../../../../common-lib/src/main/scala/com/gu/mediaservice/lib/elasticsearch/Mappings.scala#L292) establish the code leaves. Source-supported, no executed empty-search incident. orderedBy remains config-dependent, not universally failing. | D10/D11 with emitted paths and IDs/totals; retain explicit vocabulary decision. **Update same ID**: known mapped-code activation prerequisite, qualified orderedBy alias subcase. No new alias bug, new ID, shared grammar repair or incidental sectionName change. |
| **GRID-002**, existing, parked. Equivalent positive-deleted intent through legacy GET under restricted ordinary policy; Grid legacy admission. | Required scope should precede hits/totals. The narrow [GET condition](../../../../../media-api/app/controllers/MediaApi.scala#L584) differs from [D3's parsed scope](../../../../../media-api/app/controllers/MediaApi.scala#L876); reuse P28 Q5's complementary-guard trace, not a fresh full authorization audit. Qualified production-source inference, not missing authentication, deployed incidence or reproduced disclosure. | Retain the existing private isolated controller/ES discriminator. D7/D12 protect D3 without repairing GET. **Retain same ID as independent parked work**, not a P30/S2 prerequisite while legacy admission is untouched. Quoted GET contradiction is not evidence of a policy bypass. |
| **Refuted overstatement attached to GRID-008:** orderedBy always targets an unmapped leaf, regardless of config. | Unlike MultipleField forms, it reaches [resolveFieldPath](../../../../../media-api/app/lib/elasticsearch/QueryBuilder.scala#L23); a canonical-path alias can already resolve it. This source refutes universality, not every target-specific failure. Effective configuration is unknown here. | D10 absent/canonical alias controls and D11 intentional conflict. **Remove the unconditional orderedBy claim from actionable classification** wherever repeated; qualify existing GRID-008 and P28 reuse, preserving original reports. No separate defect/ID. |
| **Refuted grouping/parity claims**, not recorded as separate bugs: all multiple user negatives should be split, or all platform/status term-versus-phrase differences prove different membership. | Existing [grouping assertions](../../../../src/dal/adapters/elasticsearch/cql.test.ts#L156) and [server construction](../../../../../media-api/app/lib/elasticsearch/QueryBuilder.scala#L120) intentionally keep same-record conjunctions. Q3's automatic provenance defect is distinct. Source/test-read refutation; not a blanket reference-text analyzer equivalence claim. | D2/D3/D4. **Keep out of actionable classification**, as P28 already requires; retain GRID-001 only for automatic composition. |
| **Refuted parity claim**, not a separate bug: D3's required deleted-uploader restriction should be removed to match direct ES. | [D3 policy](../../../../../media-api/app/controllers/MediaApi.scala#L878) and [controller assertions](../../../../../media-api/test/controllers/MediaApiTest.scala#L76) require it; [direct code](../../../../src/dal/es-adapter.ts#L473) explicitly lacks that context. Correct API authorization is not a migration regression. | D6/D7/D12, with parsed intent and admission tested independently. **Keep the proposed policy weakening out of actionable classification**; do not conflate it with existing GRID-002. |

Qualify existing **E047/E092** only at the same recorded boundaries: raw composed-default intent,
automatic/default grouping, mapped-code resolution and configuration-dependent orderedBy. Preserve
P29 C1/C2 as activation requirements. No new evidence-claim array is needed. E013/E014/P31 restore,
E017 recovery, E033 partial-execution and all performance records retain their prior limits; this
brief supplies no new evidence or resolution of those independent questions. Missing future tests,
unbuilt operations, proposed stronger guarantees and the deferred section vocabulary are not bugs.

## 5. Coordinator Integration Requests

### Operator Decisions, With Recommended Answers

| Precise decision | Recommended answer and concrete consequence |
| --- | --- |
| Approve correction of the existing D3 entry, or is another actual caller's behavior frozen? | **Correct existing D3**, coordinated with its mapper, given the documented prototype caller. D1 becomes 3 while deliberate D2 stays 7. Select the isolated route only on a concrete caller/release constraint; do not guess that such a constraint exists. |
| May the decoder retain only user AST while the browse builder owns automatic exclusions? | **Yes**, as a paired correction with the named assertion revisions and unchanged authorization. Reject mapper-only cleanup and universal negative splitting. This is a recommendation, not inferred permission. |
| What is the selected target's sanitized `orderedBy` alias mapping, if any, and may explicit `usages@orderedBy` be canonical? | **Pin the nested built-in to print metadata**, preserving an already canonical alias and ordinary top-level alias behavior. A deliberate alternative mapping needs an explicit compatibility decision before activation; no effective config was read. |
| Should `usages@section` add print names or reinterpret section IDs? | **Not in this change.** Preserve S30 code matching; defer whether WEEK30 print-name-only input should match, or whether an ID means a digital section. Neither is an incidental path-prefix fix. |
| Activate corrected D3 in the present mixed hybrid path before all participating predicates agree? | **No.** Land helpers inactive and select a coordinated admission/consumer cutover. If early hybrid activation is required, authorize only the necessary parsed-intent companion and required server-policy routing, with concrete join fixtures; do not waive the gate or infer a global direct/GET repair batch. |

1. Accept P30 as a bounded design receipt only after checking these fingerprints/ranges; integrate
	 its 21 assigned receipts and narrowly relevant supplemental receipts without whole-file verified
	 promotion or claim of complete corpus coverage. Packet completion does not resolve dependencies
	 automatically. Do not dispatch a third investigation for these decisions.
2. In candidate 11 section 12/common admission, record the recommended existing-D3 boundary, unchanged
	 user grouping, separately enforced policy, mapped-code normalization, configuration-qualified
	 orderedBy and paired rollout. Preserve section 7 and the original challenge. **First proposed
	 implementation scope is common-admission/D3 characterization and helper work only**, with active
	 wiring subject to the explicit join gate; it is not a window/restore/legacy GET implementation.
3. Update KUP-011, GRID-001 and GRID-008 using the same IDs and slice-local qualifications above.
	 Retain GRID-002 parked/private-triage; remove any unconditional orderedBy or user-grouping/policy
	 parity overstatement from actionable summaries. New candidates: none; no canonical ID allocation.
4. Apply only the necessary E047/E092 qualifications and routing references. Keep live/PIT/scope,
	 runtime/deployment/config uncertainty and all existing measurements intact. P31 owns restore;
	 this report makes no integration request about its design. No shared document was edited by P30.

## 6. Checks and Limits

Executed only file/search reads, directory metadata, standard Node filesystem/JSON/SHA-256 projections
and report diagnostics/integrity checks. P30 was `ready`, `strong`, `bounded-design`, with 21 assignments;
the exact report path was absent before creation. No unrelated report was overwritten. The captured
29 receipt fingerprints include the unchanged original challenge, candidate, backlog and shared context.

The initial six-section/eight-link document check passed and scoped editor diagnostics were clean.
Its first invocation failed before checking the document because the terminal escaped a JavaScript
operator; an equivalent sandbox-safe rerun passed without source/tooling changes. The alias-object
projection returned no matches in the cost snapshot; that was discarded as an alias-configuration
source, not promoted to proof of effective alias absence. Locator searches confer no semantic credit
for incidental register/fixture hits or unrelated files. No fresh Git enumeration is claimed.

**Post-assembly integrity validation passed:** six sections, exactly two JSON receipt arrays, exact
21-path assignment accounting, eight supplemental/orientation receipts, all 29 current hashes,
42 valid ranges, the P30-only JSON pointer and 43 resolving local links whose line citations fall
within actual read ranges. Scoped editor diagnostics found no errors. This is administrative
validation, not semantic proof or application verification.

The unchanged command `node kupua/exploration/experiments/api-boundary/api-boundary-review.mjs check`
returned **zero errors, 11 warnings, readyForSynthesis:false**, with 20 open dependencies. Warnings
retain AGENTS/index/backlog receipt staleness, AGENTS/human-instruction-copy/index/backlog/changelog
inventory staleness and three historical E054 source hashes. P30 remains `ready` pending coordinator
integration. No register/tooling change, readiness suppression or fresh enumeration occurred.

No proposed discriminator, parser/query function, ES witness, test/experiment/tool suite, build,
performance campaign, app/browser/live request, operational import, credential access or Git command
was performed. Tool-managed output capture is not a repository deliverable. Only this report was
written through apply_patch; S1, P01-P29, measurements, product/test/configuration files, shared
worklog/AGENTS, candidate/backlog/registers/changelog and unrelated changes were not edited.

Source-derived predicates are not reproduction, deployed incidents or performance measurements.
Effective aliases and the operator's vocabulary/activation choices remain explicit decisions, not
reasons to start another investigation. Stop after administrative validation and coordinator handoff.