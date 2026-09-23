# Grid Usage-Search Investigation

## 1. Verdict and Affected Classes

**Grid's usage searches can return the wrong images because exclusions and hidden filters are combined incorrectly, and some supported fields resolve to the wrong indexed data.**

**Each exclusion should remain effective when another exclusion, including a hidden default, is added. Positive usage filters should continue to describe the same usage record.**

**Status, 22 September 2026:** the standalone Grid repair is implemented and locally validated in [PR #4957](https://github.com/guardian/grid/pull/4957), awaiting human review/merge. It has not been integrated into this prototype; D3, mapper/direct-ES alignment and migration acceptance remain open. Section 4 owns the submitted contract, section 5 the current follow-up, and section 6 the separate Grid-main validation record. This status update grants no further implementation, live-system or Git authority.

**Evidence boundary:** sections 2-3 are preserved evidence about the unchanged 20 September revision, with the subsequently selected target comparisons. Their historical observed/target columns are not an updated prototype result matrix. The later Grid-only repair checks in section 6 do not establish D3 or hybrid acceptance.

**Local backend characterization complete, 20 September 2026.** Actual Scala parser/builder checks and isolated Elasticsearch 8.18.3 tests reproduced the failures below. The final matrix checked exact IDs and totals through 248 authenticated controller calls (119 GET, 129 D3). Production code was unchanged. These local results do not identify the deployed TEST/PROD revision or configuration; inherited live evidence remains narrower.

The defensible classification is:

- **GRID-001, automatic-default grouping:** reproduced for every model platform value, every non-replaced model status, reference URI/name, both added-date directions and correctly aliased orderedBy. For a non-replaced status, the scalar status cannot equal both that status and replaced, so the negative conjunction excluded nothing on the fixtures. Other predicates excluded only their intersection with replaced usages. Field/analyzer/configuration qualifications are below.
- **Working exclusions exist:** a lone `-usages@status:replaced` does not receive a duplicate replaced default. A lone negative usage predicate also works as image-level exclusion when explicit replaced intent suppresses the automatic condition and no other user negative is grouped with it. Ordinary non-usage negatives do not enter the usage group.
- **GRID-008, field resolution:** section and publication already have broken positive controls under the declared mappings; an ineffective negative is not sufficient evidence of GRID-001. `orderedBy` is configuration-dependent, not universally broken.
- **KUP-011, default intent:** raw substring detection in GET and the Kupua mapper can contradict quoted replaced intent or mistake literal text/prefixes for intent. Bare D3 has parsed intent detection; composed mapper-to-D3 can still be wrong.
- **Operator-selected behavior:** each negative usage chip independently excludes an image if any usage matches it, consistent with ordinary negative filters. Positive usage chips must still match the same usage record. A negative chip also applies image-wide when positive chips are present. This intentionally changes the existing multiple-negative usage grouping; old assertions describe that implementation, not the desired contract. Grid maintainer review and implementation approval remain separate.

**Submitted standalone Grid boundary:** PR #4957 makes negative usage clauses independent in the existing builder, corrects replaced-intent detection without changing deleted-access policy, and repairs the agreed mapped fields. Its two commits contain Grid code/regressions and Kahuna serialization tests only; help changes were removed at the operator's request. No prototype D3 work was imported. After acceptance and merge, assess and adapt the prototype to what actually lands, with separate authorization for integration and follow-up edits.

## 2. Supported Syntax and Evidence Matrix

### Syntax and Canonical Requests

[Both Kahuna input modes](../../../kahuna/public/js/search/structured-query/structured-query.js#L47) serialize through [renderQuery](../../../kahuna/public/js/search/structured-query/syntax.ts#L104). The CQL input [converts polarity and literal values](../../../kahuna/public/js/components/gr-cql-input/syntax.ts#L24); inclusion has no wire prefix, exclusion has ASCII `-`. Thus displayed `+has:crops -usages@platform:print` normally sends `has:crops -usages@platform:print`. A directly supplied leading `+` is not evidence about that canonical request.

[fieldFilter/maybeQuoted](../../../kahuna/public/js/search/query-filter.js#L7) removes embedded double quotes and quotes values containing whitespace or a colon. A chip with value `"replaced"` therefore normally sends unquoted `replaced`; a URL/reference containing a colon is quoted. Raw API quoted cases still matter, but must not be claimed as normal UI outputs. CQL [operators and groups are disabled](../../../kahuna/public/js/components/gr-cql-input/syntax.ts#L7). The legacy chooser restricts offered keys; CQL's generic field AST and the backend grammar are wider than the suggestion list.

The [results caller](../../../kahuna/public/js/search/results.js#L557) forwards canonical query and explicit filters to [mediaApi.search](../../../kahuna/public/js/services/api/media-api.js#L41), which sends GET `q`. [Routes](../../../media-api/conf/routes#L16) select `imageSearch` or D3 `searchAfterImages`; this is not a frontend-generated Elasticsearch query.

The [grammar](../../../media-api/app/lib/querysyntax/QuerySyntax.scala#L60) permits only `usages` as an `@` parent. Six named text keys use `Phrase` for quoted and unquoted values. It also admits nested `<`/`>` date constraints. Arbitrary raw nested paths, other `@` parents, `>=`, `<=`, OR and grouping are not supported nested syntax. Executed parser checks confirmed ordinary-field fallback for `collections@path`, `usages@unknown`, `usages@added`, `usages@>=added` and a leading `+usages@platform`; these are not nested clauses or a promise of HTTP rejection. GET/D3 returned HTTP 200 and no hits for the tested positive unknown-field/leading-plus forms. [Parser.parse](../../../media-api/app/lib/querysyntax/Parser.scala#L20) itself falls back to an empty condition list on parse failure; malformed-input policy is not redesigned here.

| Key/class | UI exposure and admitted values | Actual resolution and qualifications |
| --- | --- | --- |
| `usages@platform` | Suggested: print, digital; download and `Added to Photo Sales` are configuration-dependent suggestions. | `usages.platform`, keyword. Models additionally represent syndication, derivative and replaced platforms. The grammar accepts arbitrary strings, not an enum validator. The exact phrase `Added to Photo Sales` becomes `syndication` in the SingleField phrase builder. |
| `usages@status` | Suggested: published, pending, removed. | `usages.status`, keyword. Model vocabulary also includes syndicated, downloaded, derivative, replaced, failed, unknown. String admission does not imply every string has indexed witnesses; preserve keyword casing, not an invented case-insensitive status contract. |
| `usages@reference` | Suggested and documented as a URL filter. Quoted multiword names also parse. | Multi-field phrase query over `usages.references.uri` (keyword) and `usages.references.name` (stemmed text). Executed URI and alpha-beta adjacency controls worked; this does not exhaust every analyzer/case/stemming variant. |
| `usages@section` | Recognized backend key, not in the fixed suggestion list. | Multi-field query on unprefixed `sectionId`, `sectionCode`. Mapped print fields are `usages.printUsageMetadata.sectionName/sectionCode`; digital sectionId is a different leaf. No automatic parent prefix or SingleField alias hook is applied. |
| `usages@publication` | Recognized backend key, not in the fixed suggestion list. | Unprefixed `publicationName`, `publicationCode`, instead of mapped print leaves. Same positive-control defect as section. |
| `usages@orderedBy` | Recognized backend key, not in the fixed suggestion list; unrelated to sort `orderBy`. | SingleField `orderedBy`, then configured alias lookup. Absent alias misses the mapped print leaf; an alias to `usages.printUsageMetadata.orderedBy` can already work. Other configured redirects can change the target; effective deployed configuration remains unobserved. |
| `usages@>added`, `usages@<added` | Suggested and documented as after/before usage dates. Both signs are allowed. | Parsed `dateAdded` resolves in QueryBuilder to `usages.dateAdded`. Inclusive gte/lte: `>` ends at tomorrow's midnight; `<` starts at epoch. Two positive bounds constrain the same usage. Not strict comparison operators. |
| Other grammar-admitted nested date names | `date`, `uploaded`, `taken` also enter the generic nested DateConstraintMatch rule; not suggested usage keys. | Resolve to image upload/taken fields inside a usages nested context, not known usage leaves. No documented meaningful usage-date interpretation was found. Classify as ambiguous grammar acceptance, not silently as added-date aliases. `usages@added:...` without a comparator is not NestedDateMatch. |

Inventory evidence: [suggestions](../../../kahuna/public/js/search/structured-query/query-suggestions.ts#L146), [platform suggestions](../../../kahuna/public/js/search/structured-query/query-suggestions.ts#L263), [help](../../../kahuna/public/js/search/syntax/syntax.html#L99), [named-field resolution](../../../media-api/app/lib/querysyntax/QuerySyntax.scala#L142), [date resolution](../../../media-api/app/lib/querysyntax/QuerySyntax.scala#L193), [ImageFields](../../../common-lib/src/main/scala/com/gu/mediaservice/lib/ImageFields.scala#L39), [usage mapping](../../../common-lib/src/main/scala/com/gu/mediaservice/lib/elasticsearch/Mappings.scala#L277), [platform model](../../../common-lib/src/main/scala/com/gu/mediaservice/model/usage/UsageType.scala#L5), [status model](../../../common-lib/src/main/scala/com/gu/mediaservice/model/usage/UsageStatus.scala#L5), [alias resolution and phrase translation](../../../media-api/app/lib/elasticsearch/QueryBuilder.scala#L20). Configuration declarations are not observed deployed aliases.

### Evidence Rules and Main Fixture

**S** = inspected source; **T** = existing test assertion; **C** = executed Scala parser/builder or mocked mapper check; **X** = executed local controller plus Elasticsearch membership/total check; **L** = inherited bounded live observation. These labels describe evidence about the unchanged implementation, not proof of the proposed fix.

**How to read the tables:** "Observed current" columns are measured results on the 20 September local revision, unless explicitly marked otherwise. "Target after fix" columns specify desired behavior, not successful repair results. Positive and single-negative expectations were specified independently before execution; the independent multiple-negative targets and print-section-name target were selected afterwards. The observed results are unchanged. A passing characterization of faulty behavior is not a passing regression test for a repair.

Use valid image constructors with synthetic uploader, ordinary authorized tier, aligned document/source IDs, no deletion, no free/persistence filter, explicit `q`, length covering the fixture and `countAll=true`. Use the declared mappings and empty field aliases unless an alias case specifies otherwise; do not infer deployed settings from these fixtures. Fixed UTC clock for date cases. The following are the exact synthetic IDs; every usage has one scalar platform and status, as in [Usage](../../../common-lib/src/main/scala/com/gu/mediaservice/model/usage/Usage.scala#L7).

| ID | Usage records |
| --- | --- |
| N | None |
| D | digital/published |
| P | print/published |
| R | digital/replaced |
| X | print/replaced |
| O | print/removed |
| S | print/pending AND a separate digital/published record |
| M | print/published AND a separate digital/replaced record |
| B | print/published AND a separate digital/published record |

`U={N,D,P,R,X,O,S,M,B}`; normal eligible set `E={N,D,P,O,S,B}`. Keyword `keep` is present only on D, P and R. Other ordinary fixture metadata does not contain the literal special-clause text used below. No existing corpus membership is assumed.

| Canonical query/class | Target after fix, not yet verified | Observed current GET | Observed current bare D3 | Current mechanism and limit |
| --- | --- | --- | --- | --- |
| Empty `q` | E | E | E | One generated negative usage clause. Absent GET q is a separate control below. |
| `usages@platform:print` | P,O,S,B | P,O,S,B | P,O,S,B | Positive usage AND single replaced negative; M is suppressed at image level. |
| `-usages@platform:print` | N,D | U minus X | U minus X | NOT nested(print AND replaced), GRID-001. Also inherited L for one witness. |
| `-usages@platform:digital` | N,P,O | U minus R,M | U minus R,M | Same defect for non-print. |
| `usages@status:published` | D,P,S,B | D,P,S,B | D,P,S,B | Meaningful positive status control; also inherited L for one witness. |
| `-usages@status:published` | N,O | U | U | Scalar published AND replaced impossible. |
| `-usages@status:pending` | N,D,P,O,B | U | U | Same status equivalence class. |
| `-usages@status:replaced` | E | E | E | Explicit negative suppresses duplicate automatic condition; working exclusion. |
| `usages@status:replaced -usages@platform:print` | R | R | R | Explicit replaced intent; one remaining image-level negative. |
| `usages@platform:print usages@status:published` | P,B | P,B | P,B | Same-record positive AND. S fails; M fails generated suppression. |
| `usages@platform:print usages@platform:digital` | Empty | Empty | Empty | Contradictory scalar conditions on one record, not a negation defect. |
| `-usages@platform:print -usages@status:replaced` | N,D | U minus X | U minus X | Two independent user exclusions are the selected target. M discriminates split records; neither negative may be weakened by the other. |
| `-usages@platform:print -usages@status:removed` | N,D | U | U | Independently exclude print, removed and automatically hidden replaced usages. The current three-child conjunction is impossible. |
| `-usages@platform:print -usages@platform:digital` | N | U | U | Each negative is an image-level exclusion. The current same-record print AND digital conjunction is impossible. |
| `usages@platform:print -usages@platform:digital` | P,O | P,X,O,S,B | P,X,O,S,B | Positive and negative groups are separate existential tests; automatic negative weakens the latter. |
| `keyword:keep -usages@platform:print` | D | D,P,R | D,P,R | Ordinary filter remains conjunctive; R proves default leakage independently of P. |
| `keyword:keep` / `-keyword:keep` | D,P / N,O,S,B | D,P / N,O,S,B | D,P / N,O,S,B | Ordinary non-usage exclusion does not join the usage group. |

Reversed mixed-sign and two-user-negative cases, plus quoted print/published values, returned the same observed sets. No exhaustive permutation product was needed. Predicate owner: [makeQuery](../../../media-api/app/lib/elasticsearch/QueryBuilder.scala#L112); raw/parsed default owners are detailed in section 3. The positive [Kupua grouping assertion](../../src/dal/adapters/elasticsearch/cql.test.ts#L156) remains a preservation control; its grouped-negative neighbor will need an intentional behavior-change update, not assertion weakening.

### Every-Key Positive and Negative Controls

For each non-status key, parameterize this six-image fixture with the row's matching predicate Q: F0 no usages; F1 matching published usage; F2 nonmatching published usage; FR1 matching replaced usage; FR2 nonmatching replaced usage; FM matching published plus a separate nonmatching replaced usage. Thus **positive expected={F1}; single negative expected={F0,F2}**. A field-resolution failure cannot be disguised as a passing negative.

All keys below have canonical prefix `usages@`; negative cases prepend `-`. Each observed result applies separately to GET and bare D3 (X), not merely to one shared builder call.

| Key/value Q; matching and nonmatching fixture values | Target positive / negative after fix | Observed current GET and bare D3, positive / negative | Current mechanism and limit |
| --- | --- | --- | --- |
| `platform:print`; print / digital | F1 / F0,F2 | F1 / F0,F1,F2,FR2,FM | Grouped default defect; also inherited print witness L. |
| `platform:digital`; digital / print | F1 / F0,F2 | Same | Non-print exclusion defect. |
| `platform:download`, `syndication`, `derivative`, `replaced`; selected value / print | F1 / F0,F2 for each value | Same for each value | Scalar platform vocabulary, not status. Quoted Photo Sales phrase also matched the syndication fixture with the same negative failure. |
| `reference:"https://example.test/usage/a"`; that URI / `/usage/b` | F1 / F0,F2 | Same | Quoted and unquoted backend forms both passed the positive control and failed the exclusion expectation. No new browser canonicalization observation. |
| `reference:"alpha beta"`; name alpha beta / alpha gamma beta | F1 / F0,F2 | Same | Executed adjacency control. Case/stemming variants are not exhaustively measured; Kupua's best-fields AND is not the oracle. |
| `section:SEC1`; print sectionCode SEC1 / SEC2 | F1 / F0,F2 | Empty / all six | GRID-008 wrong paths, plus weakened default. |
| `section:"Morning Section"`; print sectionName Morning Section / Evening Section | F1 / F0,F2 | Empty / all six | Name support is the operator's 21 September target. The measured empty result does not establish that the old grammar promised name matching; it named sectionId/sectionCode instead. |
| `publication:PUB1`; print publicationCode PUB1 / PUB2 | F1 / F0,F2 | Empty / all six | Both code and quoted publicationName controls failed positively; wrong paths are distinct from grouping. |
| `orderedBy:DESK1`; print orderedBy DESK1 / DESK2 | F1 / F0,F2 | No alias: Empty / all six. Canonical alias: F1 / F0,F1,F2,FR2,FM | Correct configuration repairs the positive lookup, not the automatic-negative defect. Effective deployed alias remains unobserved. |
| `>added:2020-06-15`; dateAdded 2020-06-16 / 2020-06-14 | F1 / F0,F2 | F1 / F0,F1,F2,FR2,FM | Fixed UTC clock 2026-09-20. Range includes an upper bound at tomorrow. |
| `<added:2020-06-15`; dateAdded 2020-06-14 / 2020-06-16 | F1 / F0,F2 | Same | Lower bound epoch, upper bound inclusive midnight, not the entire upper day. |

The conflicting-alias control used `alias-print` with print orderedBy DESK1 and `alias-digital` with digital sectionId DESK1. An orderedBy alias to the digital path returned only `alias-digital` positively, as that configuration specifies; the negative returned both images instead of just `alias-print`. This proves configurable resolution and the separate negative/default defect, not a universal built-in orderedBy meaning.

Status needs a different fixture because a scalar status cannot be simultaneously Q and replaced: S0 no usage; S1 selected non-replaced status; S2 another non-replaced status; SR replaced; SM selected status plus a separate replaced record. For **each** published, pending, removed, syndicated, downloaded, derivative, failed and unknown, expected positive={S1}, negative={S0,S2}; actual GET and bare D3 positive={S1}, negative=all five (X). For replaced itself, expected and actual positive={SR,SM}, negative={S0,S1,S2}. The main fixture also executed `usages@status:not-a-status`: HTTP 200/empty positively, U negatively, instead of the default-eligible E. An unknown literal is not the model's valid `unknown` status, and nested CQL does not use the top-level UsageStatus enum decoder.

Date boundary fixture: T0 no usages; TL one published usage at 2020-06-14; TE at 2020-06-15T00:00Z; TH at 2020-06-16; TF at 2099-01-01. Fixed UTC clock 2026-09-20. Expected `>added:2020-06-15`={TE,TH}, negative={T0,TL,TF}; `<added:2020-06-15`={TL,TE}, negative={T0,TH,TF}. Actual GET and D3 returned the correct positive sets but **all five** for either negative (X). Two positive bounds returned {TE,TH}; separate `range-hit` versus `range-split` controls proved the bounds must share a record. Quoted ISO, quoted `15 June 2020` and `15/06/2020` produced the same tested sets. Equality follows existing inclusive builder semantics, not the UI words "before/after". Calendar aliases have parser coverage, not new engine coverage here. Crucially, date-only parsing uses the server's default timezone: an initial UTC test assumption failed with +01:00, then the declared fixed-UTC fixture was corrected. Do not generalize the fixture timezone to deployed Grid.

### Intent, Ordering and Composition Discriminators

Use the main U fixture and nonmatching ordinary descriptions.

| Canonical input/class | Target after fix | Observed current GET / bare D3 / composed D3 | Current mechanism and limit |
| --- | --- | --- | --- |
| `usages@status:replaced` | R,X,M | R,X,M / R,X,M / R,X,M | Lowercase explicit-intent control, X. |
| `usages@status:"replaced"` and single-quoted variant | R,X,M | Empty / R,X,M / Empty | GET/mapper substring guard inserts a contradictory negative, X. Normal Kahuna chip editing may canonicalize to the preceding row. |
| `-usages@status:"replaced"` | E | E / E / E | Duplicate equivalent negatives are redundant, not contradictory, X. Not all quoted forms fail. |
| `-description:"usages@status:replaced"` | E | U / E / E | GET raw substring omission; bare/composed D3 parsed insertion, X. Literal text is not usage intent. |
| `-usages@status:replacedx` | E | U / U / U | GET substring suppression; D3 impossible replacedx AND replaced conjunction, X. Same result, different causes. |
| Leading display `+` in direct `+usages@platform:print` | Not a canonical chip-equivalence case | Empty / Empty / not exercised | Ordinary-field parser fallback, C/X. Earlier discarded direct-call observations are not canonical positive-control failures. |
| Omitted GET/D3 `q`, compared with explicit empty `q` | Preserve the existing distinction for this patch | U / E / not applicable to the mapper's explicit-q body | X on these nondeleted fixtures. GET skips Parser.run for absent q; D3 inserts defaults. Explicit empty q returned E on both. |

[Current mapper](../../src/dal/grid-api-search-adapter.ts#L115) injects both defaults into q before POST; [bare decoder](../../../media-api/app/lib/elasticsearch/ElasticSearchModel.scala#L155) cannot identify them as generated. Twenty mocked calls checked exact real-mapper bodies for ten inputs in first-page/continuation modes. Their ten complete first-page bodies were then paired with Scala controller/ES cases, alongside naked GET and D3. This is an executed cross-language contract check (C/X), not an end-to-end browser request. Continuation serialization was checked, not engine pagination in these new cases.

### Inherited Executed Evidence

[Earlier GET observations](bug-reproduction-evidence.md#grid-001-kahuna-get) restricted to one known print/published witness: positive platform and status each returned it; corresponding negatives each returned it when zero was expected. [Positive section/publication controls](bug-reproduction-evidence.md#grid-008-kahuna-get) returned zero despite populated matching code leaves. [Sequential Kupua/local-D3/TEST observations](bug-reproduction-evidence.md#grid-001-and-grid-008-kupua-d3) repeated those six cases; D3 buffer/rendered membership was observed. These are L, not a verified deployed revision or a universal key/platform matrix. The replaced-witness follow-up found no witness and remains inconclusive. No live identities or code values are reproduced here.

## 3. Current Mechanisms and PR History

### PR History and Regression

The history distinguishes an original missing capability from a later regression in its implementation. This account comes from the complete three-file #4519 diff, its discussion, historical parser/builder source and local read-only mainline history. Historical versions were not newly executed; dates below are merges into main, not independently verified deployment dates.

| Stage | Verified change | Consequence |
| --- | --- | --- |
| Before [#4519](https://github.com/guardian/grid/pull/4519) | The PR description explicitly records that usage exclusions did not work. The prior grammar had `NegatedFilter` for ordinary filters, but no corresponding negative nested rule. | Negative usage syntax was not recognized as a nested exclusion. This problem predates automatic replaced suppression. |
| **9 September 2025:** [#4519 merged](https://github.com/guardian/grid/commit/2cb2766393d106da4efa9b49233a0a2aecbad23a) | Commit `1d0f75c73f69e2820cc2cb952199935efcba3e22` added `NegatedNestedFilter`, the `NegationNested` condition and an outer `withNot` in QueryBuilder. It extracted the existing positive nested-query grouping into `listOfNestedToQueries` and reused it for negatives. | The single-exclusion code path now correctly expressed `NOT existsUsage(A)`. However, the reused helper grouped all negative conditions for a parent with AND before negating: `NOT existsUsage(A AND B)`. It did not independently exclude A and B. |
| **4 March 2026:** [#3998 merged](https://github.com/guardian/grid/commit/4016ef1d4e9135b811c3485e45b21df1a4b495bb) | The parent/child-image work added `usages@status:replaced` to the parser's automatically hidden conditions, appending its negative form to eligible user query text. Its [PR description](https://github.com/guardian/grid/pull/3998) explicitly relies on #4519 for this suppression. | A user entering one negative usage chip now usually supplied two negative usage conditions to the earlier grouping code: the visible condition and the hidden replaced condition. This broke the single-exclusion behavior that #4519 had enabled. |

The decisive owners are the [#4519 grouping helper and outer negation](https://github.com/guardian/grid/blob/1d0f75c73f69e2820cc2cb952199935efcba3e22/media-api/app/lib/elasticsearch/QueryBuilder.scala#L97), the [parser at that revision](https://github.com/guardian/grid/blob/1d0f75c73f69e2820cc2cb952199935efcba3e22/media-api/app/lib/querysyntax/Parser.scala#L5), which only automatically hid deleted images, and the [parser after #3998](https://github.com/guardian/grid/blob/4016ef1d4e9135b811c3485e45b21df1a4b495bb/media-api/app/lib/querysyntax/Parser.scala#L5), which also hid replaced usages. The replaced-default commit was authored in August 2025 on its feature branch; the March 2026 mainline merge, not that author date, determines the sequence here.

For example, `-usages@platform:print` became `-usages@platform:print -usages@status:replaced`, meaning **exclude only an image with one usage that is both print and replaced**. A print/published usage survived. With `-usages@status:published`, one usage would have to be both published and replaced, so the exclusion matched nothing on valid scalar-status records. The current local matrix reproduced both consequences.

**Coverage gap:** [#4519 changed three production files and no tests](https://github.com/guardian/grid/pull/4519/files). The contemporary parser/builder tests inspected covered ordinary negation and positive nested queries, not this new negative composition. Passing CI therefore did not establish correct behavior when another negative usage condition was added.

**Argument for a bounded Grid PR:** restore the user-visible exclusion capability explicitly intended by #4519 while preserving the intentional replaced-image suppression introduced by #3998. This is not a Kupua-only requirement or a proposal to remove replacement hiding. The operator has now selected independent minus-chip behavior, so generated and user-authored exclusions can follow the same rule. That choice comes from the agreed contract and consistency with ordinary filters, not from historical code alone. The history neither proves every exclusion failed at every historical point nor explains the independent section/publication field-resolution defects.

### Boolean Meaning

Let `existsUsage(Q)` mean at least one usage on the image satisfies Q. The **current** [makeQuery](../../../media-api/app/lib/elasticsearch/QueryBuilder.scala#L112) builds:

- Positive usage conditions: `existsUsage(P1 AND P2 ...)`.
- Negative usage conditions: `NOT existsUsage(N1 AND N2 ...)`.
- Both signs: the positive existential AND the negative existential's negation; they are not one shared record variable.

With generated replaced suppression R, current `-Q` becomes `NOT existsUsage(Q AND R)`. **The selected target, not implemented**, is `NOT existsUsage(Q) AND NOT existsUsage(R)`. Each deliberate negative will follow that same independent rule: `NOT existsUsage(A) AND NOT existsUsage(B)`. This intentionally replaces the current negated conjunction, and does not mean `existsUsage(NOT A)`. One matching negative will be enough to exclude the image, even if another usage satisfies positive chips. Positive clauses will remain `existsUsage(P1 AND P2 ...)` on one record.

The model's scalar platform/status makes repeated different positive values contradictory on one record. Images with different records satisfying each property are not counterexamples to that same-record rule. The local Grid GET/D3 matrix proved this positive correlation, independently of Kupua. [Scala builder tests](../../../media-api/test/lib/elasticsearch/QueryBuilderTest.scala#L172) and [Kupua tests](../../src/dal/adapters/elasticsearch/cql.test.ts#L156) supply existing shape controls; the selected rule preserves positive grouping and intentionally changes the negative assertion. Ordinary negative conditions are independently appended by [Grid](../../../media-api/app/lib/elasticsearch/QueryBuilder.scala#L140) and [Kupua](../../src/dal/adapters/elasticsearch/cql.ts#L602). The exact four-image `-keyword:cat -keyword:dog` engine comparison has not yet been run; it is a named regression control, not retrospective execution credit.

### Defaults, Resolution and Authorization

[GET SearchParams.apply](../../../media-api/app/lib/elasticsearch/ElasticSearchModel.scala#L323) invokes [Parser.run](../../../media-api/app/lib/querysyntax/Parser.scala#L10) only when q exists. Parser.run adds `-is:deleted` and `-usages@status:replaced` using raw case-sensitive substring checks before parsing. The usage default can merge with user usage negatives; the non-nested deleted default does not join that nested group. Quoted values and literal/prefix text expose a separate intent-detection problem.

[D3 SearchParamsBody.fromJson](../../../media-api/app/lib/elasticsearch/ElasticSearchModel.scala#L143) normalizes parsed intent and avoids duplicates, but appends missing defaults to the same AST list. Correct intent detection alone therefore does not fix GRID-001. [Kupua's mapper](../../src/dal/grid-api-search-adapter.ts#L115) obscures provenance before either server path can recover it; its explanatory comment does not match the actual server default behavior. [Direct Kupua](../../src/dal/es-adapter.ts#L460) already composes the usage default separately, but retains substring checks. Its different reference/date interpretation is not Grid's semantic authority.

[QueryBuilder's MultipleField branch](../../../media-api/app/lib/elasticsearch/QueryBuilder.scala#L65) does not resolve aliases or add nested prefixes. Section/publication therefore target absent leaves under the declared mapping. SingleField orderedBy goes through [configured aliases](../../../common-lib/src/main/scala/com/gu/mediaservice/lib/config/FieldAlias.scala#L8), including alias-or-absolute-path lookup; obtain only a sanitized absent/canonical/conflicting answer for the deployed alias. No real configuration has been inspected.

Other filtering remains independent: [Kahuna free-only default](../../../kahuna/public/js/search/results.js#L582), explicit dates/IDs/uploader/rights and [buildFilterOpt](../../../media-api/app/lib/elasticsearch/QueryBuilder.scala#L154), principal-derived [tierFilter](../../../media-api/app/lib/elasticsearch/SearchFilters.scala#L61), and controller admission. [GET execution](../../../media-api/app/lib/elasticsearch/ElasticSearch.scala#L380) applies the resulting predicate before hits, totals and ticker aggregation. [D3 execution](../../../media-api/app/lib/elasticsearch/ElasticSearch.scala#L754) also applies it before hits/totals, with distinct cursor/PIT/projection rules.

Authorization is not an optional default. Preserve [GET admission](../../../media-api/app/controllers/MediaApi.scala#L584), [D3 parsed positive-intent scoping](../../../media-api/app/controllers/MediaApi.scala#L876), and existing [controller policy tests](../../../media-api/test/controllers/MediaApiTest.scala#L73). The known permission-sensitive GET intent boundary must be privately triaged before changing deleted-intent acceptance; no live private/deleted probes or new public exploit detail follow. The proposed usage correction must not generalize its new intent rule to deleted queries.

### Other Nested Searches and Actual Shared Consumers

| Surface inspected | Relationship to this mechanism and preservation requirement |
| --- | --- |
| `usages@` grammar and QueryBuilder | Only supported `@` parent. All six text keys and nested date constraints share same-parent/sign grouping; field correctness is a separate precondition. |
| Collections, crops/exports, leases/leasedBy, ordinary dotted fields | Declared as [ObjectField, not NestedField](../../../common-lib/src/main/scala/com/gu/mediaservice/lib/elasticsearch/Mappings.scala#L212). [ImageFields](../../../common-lib/src/main/scala/com/gu/mediaservice/lib/ImageFields.scala#L51) and CollectionRule route them as ordinary conditions. They do not join automatic usage negatives. This is not a certification of every multi-object co-occurrence semantic. |
| GET image search | SearchParams -> Parser.run -> makeQuery -> filters/execution. Direct beneficiary, including ID-restricted searches and all pages with the same q. |
| GET AI prefilters/filter-pool counts | [AiQueryParts.from](../../../media-api/app/lib/elasticsearch/ElasticSearchModel.scala#L49) moves non-text conditions intact into filterConditions; [buildAiFilter](../../../media-api/app/controllers/MediaApi.scala#L595) calls makeQuery. Inherits the same usage composition; preserve ranking signals and all request/policy filters. No AI/model execution is needed for characterization of this composition. |
| Ticker counts | [extraCountAggregations](../../../media-api/app/lib/elasticsearch/ElasticSearch.scala#L442) parses each configured clause separately. Shared parser changes affect these subfilters, within the main search scope. Test an ordinary clause and a synthetic negative-usage clause; do not presume deployed ticker configuration. |
| Metadata/label/date aggregations | [SuggestionController](../../../media-api/app/controllers/SuggestionController.scala#L25), [AggregationController](../../../media-api/app/controllers/AggregationController.scala#L15), [AggregateSearchParams](../../../media-api/app/lib/elasticsearch/ElasticSearchModel.scala#L231) and [aggregateSearch](../../../media-api/app/lib/elasticsearch/ElasticSearch.scala#L655) share Parser.run/makeQuery for q. Completion suggesters use a different path. Preserve absent-q behavior and response contracts. |
| Supplier image-usage listing | [UsageController](../../../media-api/app/controllers/UsageController.scala#L109) parses q, but [imageUsagesBySupplier](../../../media-api/app/lib/elasticsearch/ElasticSearch.scala#L569) extracts only positive added-date ranges and builds its own nested predicate. Negatives are not executed through makeQuery here. Its end-of-upper-day adjustment differs from generic CQL. Preserve that extraction; do not advertise this endpoint as a general negative-search API. |
| Print issue filters | [SearchFilters.printUsageFilters](../../../media-api/app/lib/elasticsearch/SearchFilters.scala#L66) uses fully prefixed print leaves in one positive nested query. Not GRID-008's named CQL resolution and not the automatic-negative grouping mechanism. |
| Supplier/quota queries | [usageForSupplier/quotaCountBySupplier](../../../media-api/app/lib/elasticsearch/ElasticSearch.scala#L464) explicitly build nested usage predicates. No Parser.run default merging in those predicates; quota grouping is not proposed for change. |
| Persistence and nested sorting/null-zone checks | [PersistedQueries](../../../common-lib/src/main/scala/com/gu/mediaservice/lib/elasticsearch/PersistedQueries.scala#L25), [sort decoding](../../../media-api/app/lib/elasticsearch/sorts.scala#L38) and [D3 null-zone exclusion](../../../media-api/app/lib/elasticsearch/ElasticSearch.scala#L785) build their own predicates/options. No same-mechanism defect shown; preserve them. No independent audit of every such operation is claimed. |

Application-source searches located all Parser.run and makeQuery consumers listed above. This is a bounded query-consumer trace, not whole-repository coverage. Supplied P28/P30 findings were checked against these owners; P30's D3-only boundary is not adopted.

## 4. Proposed Fix and Compatibility

### One Selected Implementation Direction

This direction is **implemented in the open Grid PR, not yet accepted/merged or integrated into the prototype**. It retains the existing query language and condition/request structures, preserves positive same-record grouping, and compiles every negative usage condition independently at image level. The rule applies to user-written and generated exclusions alike. The descriptions below specify the submitted contract, not instructions to restart the implementation.

The earlier alternatives of tagging defaults or carrying separate default lists are not selected. They add representation changes without being necessary for this rule; preserving the old grouped user negatives is no longer the goal. Exact code factoring remains subject to the selected main revision and Grid review.

### Field Contract for the Proposed Repair

The operator's latest requirement is **print section code or human-readable print section name**. The earlier suggestion of print code plus digital section ID was different; a digital ID must not be treated as a synonym for a name. The initial field repair below does not silently include digital IDs. If they are also required, obtain an explicit scope decision before adding them. Nor does this scope authorize removing working digital-ID support discovered on main: preserve and flag that behavior, then confirm the contract before changing it.

| Search key | Proposed matching fields | Status and preservation requirement |
| --- | --- | --- |
| `usages@section` | `usages.printUsageMetadata.sectionCode` OR `usages.printUsageMetadata.sectionName` | Operator-requested code/name target. Code resolution is a reproduced defect; name support is an explicit behavior addition, not a previously working feature being preserved. Multiword names are quoted; retain normal keyword casing. |
| `usages@publication` | `usages.printUsageMetadata.publicationCode` OR `usages.printUsageMetadata.publicationName` | Restore the two alternatives already named by the grammar, using their actual mapped locations. |
| `usages@orderedBy` | Existing applicable configured redirect; otherwise `usages.printUsageMetadata.orderedBy` | Preserve configured behavior and add a correct absent-override fallback. Confirm the implementation with absent/canonical/conflicting alias tests; do not override configuration silently. |

The OR above is internal multi-field matching for one chip's value, not new user query syntax. Negative forms exclude an image when any usage matches that chip through any of its supported fields. Ordinary top-level aliases and unrelated fields are unchanged.

Owning changes in the submitted Grid-main PR:

1. **QueryBuilder.makeQuery:** retain `listOfNestedToQueries` grouping for positive conditions; pass each negative condition through singleton nested construction and append it independently with `withNot`. Reuse the existing leaf builder and alias handling. Keep normal negatives, positive scoring and makeQuery(Nil)=matchAll unchanged. The intentional compatibility change is multiple user-written usage exclusions, including repeated fields and date bounds.
2. **Parser.run:** decide replaced intent from actual parsed usage conditions, not a substring. Quoted `replaced` is the same intent; literal text and replacedx are not. Keep the existing GET deleted-default/admission rule unchanged. Choose the smallest factoring that retains GET absent/empty-q and malformed-input behavior; do not turn this into a parser or authorization rewrite. Independent negatives solve grouping even when defaults remain in the condition list; parsed intent addresses the distinct contradiction/omission defect.
3. **Nested field resolution in QuerySyntax/QueryBuilder:** implement the field contract above in nested context, without rewriting ordinary top-level fields. Do not copy Kupua's unmapped print sectionId alternative or remove multi-field matching wholesale. The same value must match a supported code or name; adding two positive usage chips must still require the same usage record.
4. **Kahuna:** existing syntax/serialization tests now cover both input modes, repeated negatives and canonical quoting. No frontend runtime workaround or second query engine was added. Help text is unchanged at the operator's request.
5. **Shared consumers on main:** local regressions cover GET parameter decoding to Elasticsearch, AI filter-pool counts, built-in tickers and metadata/date aggregation. These are not full controller/authentication, AI-ranking or browser tests. The selected main revision had no D3 endpoint; no prototype-only code or test helpers were imported.

**Compatibility controls:** preserve positive same-record matching, ordinary negative behavior, quoted/literal replaced intent, deletion authorization, aliases, existing date/reference interpretation, sorting, offsets, totals, extra counts and ordinary execution routing. Explicitly replace the old grouped-negative expectations with the selected independent-exclusion sets; do not weaken positive or unrelated assertions. Do not heuristically strip user text that resembles a default.

**Cost:** no necessary extra HTTP request, ES round trip, index field or reindexing. The number of nested exclusion clauses grows with the number of negative usage conditions, rather than collapsing into one conjunction. Matching/caching work can change, including ticker subqueries; performance is unmeasured. No performance concession or campaign is authorized.

### Prototype Follow-Up After the Grid Merge

**D3:** `ElasticSearch.searchAfterQuery` already uses the shared QueryBuilder, so importing the accepted Grid change may fix its grouping without a D3-specific Scala patch. Recheck `SearchParamsBody.fromJson` against whatever parser/default helpers actually merge; it already has parsed intent handling. D3 may need an adaptation, or only regression tests. Do not assume that an endpoint amendment is required, and do not write new D3-specific code/tests before the Grid PR is accepted and merged.

**Kupua API mapper:** `apiSearchAfter` currently inserts defaults before POST. The independent-negative backend rule would repair grouping even for those bodies, but quoted positive replaced intent can still be contradicted by the injected text. After the upstream contract is settled, send original q where the server owns defaults and verify actual mapper-to-D3 composition, not just naked POST. Keep authorization and all other request/response contracts unchanged.

**Kupua direct ES:** change `mergeUsagesNestedClauses` to keep positive grouping but leave each negative usage clause separate. Its automatic default is already separate; `buildQuery` still needs parsed replaced-intent detection instead of raw substring checks. Align affected field paths with the accepted Grid decisions, preserving any intentional ordinary alias behavior. Existing reference/date interpretation differences remain explicitly scoped; this is not automatic approval for a whole CQL rewrite.

The Grid PR can be useful independently. Prototype alignment must check hits, counts and positional consumers together before claiming consistent hybrid behavior. Start a fresh result generation/count when query meaning changes; do not reuse old membership totals as if the set were unchanged. These are later acceptance requirements, not permission to alter D3 or Kupua now.

## 5. Regression Plan, Migration Closure and Grid PR Boundary

### Grid-Only Validation and Prototype Acceptance

The relative [parser](../../../media-api/test/lib/querysyntax/ParserTest.scala), [builder](../../../media-api/test/lib/elasticsearch/QueryBuilderTest.scala), [ES](../../../media-api/test/lib/elasticsearch/ElasticSearchTest.scala), [controller](../../../media-api/test/controllers/MediaApiTest.scala) and [AI query-part](../../../media-api/test/lib/elasticsearch/AiQueryPartsTest.scala) links refer to this prototype, not the submitted PR tree. The permanent Grid-only regressions are in [PR #4957](https://github.com/guardian/grid/pull/4957/files), built from main's own test homes. The table records their bounded result; section 2's original characterization matrix remains unchanged. Prototype acceptance still requires its own mapper/D3/direct-ES checks after the upstream contract is accepted.

| Required check | Target assertion | Evidence status |
| --- | --- | --- |
| Ordinary keywords | Four images: K-cat, K-dog, K-both, K-neither. `-keyword:cat -keyword:dog` retains only K-neither under the same baseline filters. | Equivalent four-image Grid-main fixture passed with exact IDs/totals. The corresponding Kupua control remains pending. |
| Single usage negative | On the main fixture, `-usages@platform:digital` retains N,P,O. | Corresponding Grid-main fixture passed; this is not a new D3/prototype result. |
| Multiple usage negatives | Print/replaced retains N,D; print/removed retains N,D with automatic replaced suppression; print/digital retains N. | Corresponding Grid-main fixtures passed, including order and repeated-negative controls. |
| Positive same-record matching | Print + published retains P,B and rejects split-record S. Two positive date bounds must share one record. | Preserved in Grid-main regressions, including split-record date/code/name controls. |
| Mixed signs | Print + negative published retains only O on the main fixture, because any published usage excludes the image. | Corresponding Grid-main status/platform fixtures passed with exact IDs/totals. |
| Default intent | Quoted/plain replaced intent agree; literal clause text and replacedx do not suppress the default. Retain explicit-negative and empty/absent-q behavior without broadening deleted handling. | Parser and GET-decoder/ES regressions passed. This is not authorization-boundary acceptance; deleted-intent concerns remain separately scoped. |
| Section code/name | Independently match a code and a different human-readable name; include code-only and name-only witnesses and positive/negative controls. Both must use the actual print metadata leaves. | Independent Grid-main code/name witnesses passed. Name support is an intentional addition; digital-ID inclusion was not added. |
| Publication and orderedBy | Restore publication code/name lookup; retain orderedBy overrides and test its correct fallback. | Grid-main code/name and absent/canonical/conflicting-alias regressions passed. Effective deployed aliases remain unobserved. |
| Ordering and consumers | Reorder clauses, repeat fields, combine ordinary filters, and check hits/totals plus affected AI/ticker/aggregation composition. | Grid-main checks passed for ordering/offsets/totals, reference/date semantics, built-in tickers, AI filter counts and metadata/date aggregation. No full controller/browser, AI-ranking or prototype acceptance follows. |

The Grid repair used failing-first tests and the full relevant gates recorded in section 6. Further amendments must retain that approach. Later prototype work must intentionally update Kupua's grouped-negative assertion and run its applicable unit/build/E2E gates. If upstream reviewers change the contract or factoring, follow what is accepted rather than forcing this proposal onto the prototype; do not weaken behavior assertions.

### Read-Only Main Recheck

The initial recheck and main-based implementation are complete: section 6 records the selected base and submitted commits. The next recheck starts with PR #4957's actual review/merge state and, after merge, the accepted main revision. No branch switch is needed to inspect it. Local `main` or `origin/main` may be stale; record freshness rather than treating a cached ref as current. Existing objects or an immutable GitHub revision can be read without checkout changes; fetching missing objects requires separate permission.

Compare the accepted owners, callers, mappings/alias declarations, test harness and dependencies with the submitted repair. Reuse this investigation where unchanged; inspect only relevant differences. Source continuity and local Grid tests do not establish deployment, effective configuration or prototype acceptance. Do not recreate a repair that has already landed.

Preserve all uncommitted prototype work. Do not switch, stash, reset, stage or commit it to make inspection convenient. Any requested upstream amendment belongs in the separately authorized Grid-main checkout, not this prototype; integration after merge also needs explicit Git authorization.

### Remaining Checks and Delivery Order

| Remaining item | Bounded answer needed before the affected implementation |
| --- | --- |
| Upstream acceptance and integration | PR #4957 is awaiting human review/merge. After acceptance, recheck what actually landed and obtain separate authorization to fetch/integrate it into the prototype; merge and deployment are distinct states. |
| Ordinary-negative comparison | The exact four-category ordinary-negative Grid regression passed. Retain it and add the corresponding Kupua control during authorized prototype alignment. |
| Agreed usage semantics | Independent negatives and positive same-record controls passed on Grid-main fixtures. Verify the accepted contract through actual mapper/D3 and direct-ES consumers, including counts and positional reads; Grid-only results do not close that join. |
| Field contract | The submitted code/name repair and orderedBy fallback preserve configured redirects. Follow the reviewed/merged contract; digital section IDs remain a separate scope decision. |
| Kahuna input path | Both input-mode serialization controls and the full Kahuna tests/build passed. Runtime frontend and help text are unchanged; no new browser acceptance is claimed by those checks. |
| D3 adaptation | Wait for Grid acceptance and merge, then inspect the final shared changes. Determine whether D3 Scala needs adaptation or simply inherits the repair; pair its tests with actual mapper bodies. |
| Direct-ES alignment | Later apply the selected negative rule and replaced-intent correction in Kupua, align agreed fields, and run its relevant unit/build/E2E gates. Test-only and implementation permissions remain distinct. |

**Submitted PR:** one Grid PR, #4957, with separate commits for exclusions/default intent and mapped print fields. Maintainers may request changes or a split; the open proposal is not an accepted upstream contract. Further amendments or publication are not authorized by this record.

**Branch ownership and sequence:**

1. Grid backend/Kahuna implementation and permanent tests are on the main-based `mk-excluding-usages` branch in the separate Grid checkout and in PR #4957. Further upstream amendments belong there only with explicit approval. No permanent Scala repair tests or shared implementation have been copied to the prototype.
2. Wait until that Grid PR is accepted and merged. Only then undertake new D3-specific implementation/tests on the prototype, adapting the accepted code rather than a speculative pre-review version. Any eventual D3 PR/amendment depends on its then-current upstream status.
3. Kupua direct-to-ES implementation/tests belong on the prototype. They can technically be developed independently once behavior is settled, but doing them alongside post-merge D3 alignment avoids needless divergence and rework. This is recommended sequencing, not a claim that a direct-only fix requires a new API capability.

Accepted shared Grid code may later be integrated into the prototype with separate Git authorization; it should not be independently reimplemented there. A single Grid PR does not imply that every prototype follow-up or migration gate is complete.

### Next-Agent Entry

This section is the execution handoff inside the single research document; no separate prompt/report is required.

1. Follow the fresh-agent protocol. Read the applicable directives, [Kupua context](../../AGENTS.md), [shared worklog](worklog-current.md), this document and the [media-api instruction source](03%20Ce%20n'est%20pas%20une%20pipe%20dream/media-api-work/media-api-91-instructions-for-agents.md). Confirm the current task and exact permissions; past implementation/test/Git approvals are not standing authority. Do not reopen the full review corpus without an identified gap.
2. Distinguish section 2's unchanged-code characterization from section 6's later Grid-main repair validation. Start from the existing PR and permanent main-based tests, not the removed throwaway characterization tests or the historical filtered command. Neither evidence set establishes repaired prototype behavior.
3. Check PR #4957's current state read-only. Until acceptance and merge, do not start new D3-specific implementation/tests or import the proposed patch into the prototype. Requested upstream amendments need their own approval and the Grid-only checkout; keep prototype code and research artifacts out of that PR.
4. After merge, inspect the accepted code and relevant main changes, then obtain explicit permission for fetch/integration. Preserve uncommitted prototype work. Recheck local test isolation before any test-generated writes; no non-local ES writes, full app startup or live acceptance follows automatically.
5. Determine what D3 inherits before proposing endpoint changes. Pair any mapper/default adaptation with actual request-body, membership and total controls; align affected direct-ES and positional consumers with the accepted meaning. Unrelated Kupua fixes can proceed under separate approval; direct-only usage fixes do not technically require a new API, but must not silently diverge from the accepted contract.
6. Keep the pre-existing deleted-intent/permission concern separate. The operator has responded to its automated PR review comment and is awaiting human assessment. No parser-only authorization amendment or live deleted-image probe is authorized; retain restrained references in the canonical backlog rather than adding reproduction payloads here.
7. Record upstream merge, deployment, prototype integration and validated consumer acceptance as distinct facts. Close only the work actually completed; no whole-ID, S2 or API-only closure follows from the Grid PR alone. Do not stage, commit, publish or push by inference.

### Closure and Standalone PR

| Issue/gate | Effect of recommended backend correction after successful tests | Residual boundary |
| --- | --- | --- |
| GRID-001 | Makes every usage exclusion independent, including generated defaults, for GET and shared builder consumers. Deliberate multiple-negative behavior is intentionally corrected too. | D3 inheritance and prototype composition must be checked after the Grid merge. Direct ES still needs its own negative-grouping change; no whole-ID closure from a Grid-only test result. |
| KUP-011 | Parsed replaced intent repairs the usage-specific GET subset; bare D3 intent behavior is retained. | Kupua mapper/direct builder and permission-sensitive deleted-intent cases remain separate. Do not close the whole ID. |
| GRID-008 | Tested mapped-code/publication repairs can close their Grid subset; the requested section-name behavior must be labelled as an intentional addition. Negation alone cannot repair field lookup. | OrderedBy compatibility and prototype field alignment still need verification. Digital-ID support is not silently included; any deferred field work remains open. |
| S2 admitted query/default composition and mapped-code gate | Supplies an independently useful backend building block. | D3 mapper, every activated window/key/rank consumer, mapped codes and policy still need equivalent admitted meaning; no gate closure by shared code alone. |
| Current hybrid / API-only migration gates | No API-only, performance-parity or new-operation readiness claim. | Direct ES positional branches remain distinct; future activation must check their join, not delay unrelated GET value. |

The standalone Grid PR is a bounded existing-query repair with regression tests, not a prototype migration patch. It excludes Kupua production changes, prototype-only D3 implementation, new endpoints, authorization repairs, quota semantics, sort changes and migration infrastructure. No new Condition wrapper or request model was introduced. The operator published the PR; further branch, commit, amendment or publication actions require separate authority.

## 6. Executed Checks, Limits and Operator Decisions

### Upstream PR Status: 22 September

- [PR #4957](https://github.com/guardian/grid/pull/4957) is open, awaiting human review/merge. The Grid-only implementation was built in a separate checkout from main `0805fc4c4b9c4c88febaf901cb874d314e759dd6`, on `mk-excluding-usages`. That main had no D3 endpoint; no prototype source or D3 test helpers were imported.
- The operator-approved local commits are `0df0774dc433aef93d141946dd49c228a959521f` (exclusions/replaced intent) and `97d75a934cff841ee7f33e5e105f4c3ba48d7101` (mapped print fields). The operator, not the agent, published the PR. Their combined contents matched the reviewed local patch; the requested help-text removal, normal harness configuration and unchanged manifests were verified.
- Failing-first checks reproduced three exclusion failures, eight replaced-intent failures and six field-resolution failures before their respective corrections. A separate malformed-separator regression exposed and corrected a final-parsing-order mismatch. Existing preservation assertions were retained. The visible default list and final parse remain, with parsed intent specific to replaced usages.
- Full Grid-main **media-api tests: 269/269 passed**. The 19 grouped new ES cases use synthetic data and the real GET parameter decoder followed by Elasticsearch, asserting exact IDs/totals. They cover usage composition, intent, reference/date behavior, mapped code/name alternatives, alias configurations, paging/count controls, metadata/date aggregation, built-in ticker counts and AI filter-pool counts. This is not full controller/authentication execution or AI ranking.
- Full **Kahuna tests: 44/44 passed**; lint had no errors and the production build passed. Existing lint/bundle-size warnings remained. Both input modes have canonical serialization controls; no runtime frontend or help change remains. After the full backend gate, the only backend edit was an explanatory comment, followed by **84/84 parser tests** passing.
- Two independent cold source reviews found no material issue within scope. An optional nested orderedBy boolean-alias regression was noted; the current implementation preserves the existing hook, but that particular regression was not added. These reviews are not maintainer acceptance or a security audit.
- Local ES 8.18.3 used disposable Testcontainers. External execution preflights rejected routing overrides and checked a local Unix Docker endpoint; runtime logs confirmed localhost, and container cleanup was verified. No local-only destination restriction or lifecycle change remains in the submitted harness. No live authorization probe or production performance acceptance is claimed.
- The automated PR review raised a related pre-existing deleted-intent concern. The operator has responded and is awaiting human feedback. Deleted-default/admission behavior remains unchanged; any coordinated permission-aware repair needs separate assessment and authorization. No sensitive reproduction details are added here.
- **Still open:** upstream acceptance/merge, deployment, prototype integration, D3 inheritance/composition checks, mapper/direct-ES alignment and all affected migration gates. The next work follows section 5. Today's authorization is current documentation/status routing only, not another product or Git operation.

The 20 September execution record and 21 September decision snapshot below retain their historical scope. Their then-future preparation steps are superseded by the current status and handoff above, not rewritten as repair evidence.

### Recorded Execution: 20 September

- Inspected revision: `0efb6e225ea62a5bc33c7fdf9cd92726ccda7196`. At the characterization baseline, read-only Git inspection found no staged changes or uncommitted/untracked files under media-api, Kahuna, common-lib or Kupua source. This is a recorded baseline, not a guarantee of a later worktree's state. D3 was the locally present implementation, not an inferred TEST deployment revision.
- Pre-existing tracked changes: development nginx template, Kupua AGENTS, human directive copy, active media-api index, shared worklog and package manifest. Preserve these and existing untracked research; no Git mutation is authorized.
- Intake covered applicable directives, AGENTS, worklog, GRID-001/GRID-008/KUP-011 backlog/reproduction evidence, relevant P28 cases and P30 reasoning. Historical reports and registers 06/07 remain untouched.
- Operator authorized the four named existing test files, normal generated test/cache outputs and disposable local Testcontainers writes. Subsequent clarification made the Scala edits throwaway on this branch unless later selected for an approved current-main PR. No branch/commit/PR authority follows.
- Executed database-free Scala surface: **176 passed**, including 28 new parser and 16 new builder characterizations plus existing parser, builder, controller and AI tests. One initial date assertion lacked explicit UTC setup; that fixture error was corrected and the identical four suites passed. No assertion was weakened or production behavior changed.
- Executed final ES surface: **7 grouped characterizations passed**, comprising **119 GET + 129 D3 = 248** successful controller searches with exact ID-set and total assertions. Docker context was a local Unix socket; routing overrides were absent and the suite guard verified the newly created container endpoint. Testcontainers ES version was 8.18.3, with synthetic fixtures and declared mappings. No TEST/PROD/index-tunnel access occurred. Zero Testcontainers existed before the first run or after the final run; cleanup was verified.
- Controller calls used the existing FakeRequest/authentication-provider and image-response test helpers with a synthetic admitted principal. The real decoders, query builder and Elasticsearch executed; no browser, full running Grid server, live identity or end-to-end production authentication claim follows.
- Executed mapper surface: **20 mocked real-mapper request-body checks passed**, ten inputs each in first-page and continuation mode. Ten first-page golden bodies were exercised against local D3. Full Kupua units **1655/1655** and TypeScript/Vite build passed while the temporary mapper checks were present. Existing native-config/chunk-size warnings remained; no browser/E2E or performance run was required for these test-only additions.
- Cleanup gates passed: the four original database-free Scala suites **132/132**, original adapter tests **57/57**, and full original Kupua units **1635/1635**. Read-only comparison verified all four test files byte-identical to revision `0efb6e225ea62a5bc33c7fdf9cd92726ccda7196`; source diffs and index were empty for the inspected product/test scope. Normal generated build/cache/report files remain; no throwaway test code remains on this branch.
- No application startup, new live browser/TEST check, production edit or Git mutation occurred. Existing GET/TEST and local-D3/TEST observations retain their original revision/witness limits. No repaired query implementation, full media-api repair gate, new engine pagination, effective deployed alias, performance result or production-wide incidence is claimed.
- Documentation checks cover the six-section structure and local references; these are separate from executed query evidence. The matrix, fixtures, exact commands and bounded outcomes here are the durable evidence, not a raw log/transcript registry.
- Read the applicable media-api conventions sections 14-15. Their historical testing comments are not evidence that the now-present controller tests are absent.

**Historical commands:** `sbt -batch -no-colors 'media-api/testOnly lib.querysyntax.ParserTest lib.elasticsearch.QueryBuilderTest controllers.MediaApiTest lib.elasticsearch.AiQueryPartsTest'` and `sbt -batch -no-colors 'media-api/testOnly lib.elasticsearch.ElasticSearchTest -- -z usage-search-characterization'`. The temporary characterization groups no longer exist in the source tree. Runs used foreground pipefail/tee, with no concurrent commands or polling. The [build settings](../../../build.sbt#L47) produced normal targets/logs/reports under the operator's test-only permission; no Grid app or live backend was started.

**Test safety retained for the handoff:** the inspected [runner](../../../common-lib/src/test/scala/com/gu/mediaservice/testlib/ElasticSearchDockerBase.scala#L12) defaults to its own Elasticsearch 8.18.3 Testcontainers instance, but ES6_TEST_URL overrides that destination and disabling USE_DOCKER_FOR_TESTS falls back to port 9200. [Suite setup](../../../media-api/test/lib/elasticsearch/ElasticSearchTest.scala#L119) creates/aliases/purges its test index. Our temporary guard required the actual URL to equal the new local container endpoint before setup. Reinspect the selected main runner and establish equivalent isolation before any authorized test run; never point it at a tunnel or TEST/PROD.

**Test retention, completed:** all four temporary test-file edits, including the helper extension and isolation guard, were removed and verified byte-identical to the baseline. The future Grid branch must recreate appropriate regressions from the fixture matrix; assertions about bad current behavior are not the repaired contract. The old test-only permissions and generated outputs do not authorize new source edits or runs today.

### Decision Snapshot: 21 September

**Agreed target:** independent image-level exclusions, positive same-record matching, and print section searching by code or human-readable name. The earlier code/digital-ID suggestion was not the same requirement. Digital-ID support is outside the agreed initial scope unless explicitly added. Publication code/name lookup and orderedBy override preservation have the proposed contract in section 4, subject to Grid review.

**Agreed delivery boundary:** Grid-main work precedes new D3-specific implementation/tests; those wait for the Grid PR to be accepted and merged. D3 and Kupua adaptations belong on the prototype. Aim for one Grid PR, splitting field work only if review/scope makes that necessary. This is behavioral and delivery agreement, not implementation or Git permission.

**Historical stop on 21 September:** the design-record task ended at documentation only. Separately authorized Grid-main implementation and the operator's PR publication followed, as recorded above. The current stop is awaiting human review/merge; section 5 governs future intake and permissions. No prototype implementation or additional Git action is authorized by this update.

**Optional later Kahuna phase:** `--use-TEST` is useful for real witnesses, but not necessary for deterministic fixtures. Read the embedded-browser playbook first; obtain the existing URL, backend stage and bounded read-only scope. Proposed initial budget: at most 12 primary search requests, reusing a positive witness to check print and one non-print platform, status, and one reference/date class with positive/negative controls. Count setup requests within the budget; stop and ask if no suitable witness is available. Observe normal UI canonical q and response, record only sanitized aggregate/membership outcomes, restore observers and close only the agent-owned tab. No services/authentication changes, corpus scan, private/deleted probes, identities, credentials or signed URLs in files.