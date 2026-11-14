# D3 searchAfter — post-PR Copilot review: triage, decisions, plan

**PR:** [guardian/grid#4849](https://github.com/guardian/grid/pull/4849) — `mk-api-1of9-searchAfter` → `main`
**Review:** Copilot AI, 10 comments, all severity *Medium*, against commit `38ae5b4`.
**Status:** ✅ **COMPLETE — archived 2026-08-18.** All 10 comments actioned and answered on the
PR. Eight resolved (six fixed, one refuted with evidence, one declined as pre-existing); **#9
and #10 remain open on the PR as team decisions** — they are deliberately left unresolved
there so a human reviewer sees them, and the PR is the live venue for them, not this doc.

| Where | Commits |
|---|---|
| `mk-next-next-next` | `73e28fe21` (Batch A Scala), `26bc587f7` (docs), `c7b5f4551` (Batch B Scala), `6eb08e5ae` (docs) |
| `mk-api-1of9-searchAfter` (PR #4849) | `fe882dc88` (Batch A), `594e49eea` (Batch B) — both pushed |

Both ports were plain cherry-picks; `git merge-tree` dry-runs came back clean each time, so
the harvest fallback in `media-api-worknotes.md` was not needed. Full suite green on the PR
branch after each (216/216).

---

## 1. Triage at a glance

| # | Comment (short) | File | Verdict | Batch | State |
|---|---|---|---|---|---|
| 1 | PIT `_shard_doc` tiebreaker dropped by `.take(sortLen)` | `ElasticSearch.scala` | **Refuted** — truncation is deliberate and correct (D-6) | B | ✅ investigated, no code change |
| 2 | Missing `syndicationReviewQueueFixMapping` runtime mapping | `ElasticSearch.scala` | **Real** parity gap with `search()` | A | ✅ done |
| 3 | Null-zone `existsQuery` not nested-aware | `ElasticSearch.scala` | **Real** parity bug (kupua's own client does it right) | B | ✅ done |
| 4 | Validation throws synchronously → 500 not 422 | `MediaApi.scala` | **Real** | A | ✅ done |
| 5 | `jsonToSort` shape assumptions (empty obj, missing `order`) | `sorts.scala` | **Real** | A | ✅ done |
| 6 | `usageStatus`/`syndicationStatus` throw → 500 | `ElasticSearchModel.scala` | **Pre-existing** on GET path — not a regression | C | open (reply only) |
| 7 | `orderOf` treats anything ≠ `"desc"` as ascending | `sorts.scala` | **Real** (silently wrong results) | A | ✅ done |
| 8 | Missing/non-array `sort` → `Nil`, no deterministic order | `MediaApi.scala` | **Real** | A | ✅ done |
| 9 | `offset` parsed but never applied | `ElasticSearchModel.scala` | **Real**, but offset is the *alternative* to cursors | C | open (decision) |
| 10 | `include=fileMetadata` returns empty | `ElasticSearch.scala` | **Real**, by design (lean projection) | C | open (decision) |

Batch A = mechanical, no behaviour change for any existing caller, one commit.
Batch B = real logic bugs, one per session, failing test first.
Batch C = API-contract decisions for the team; reply on the PR, don't fix silently.

---

## 2. Verified facts behind the verdicts

Everything below was checked against source, not taken on the reviewer's word.

**#6 is not a regression.** `SearchParamsBody.fromJson` uses
`strs("usageStatus").map(UsageStatus(_))` and
`str("syndicationStatus").flatMap(SearchParams.parseSyndicationStatus)`
(`ElasticSearchModel.scala:153,156`). `SearchParams.apply(request)` — the existing
`GET /images` path — uses *the same two expressions* (`:325,326`). `UsageStatus.apply`
throws `IllegalArgumentException` on an unknown value; `SyndicationStatus.apply` has a
non-exhaustive match → `MatchError`. So `GET /images?usageStatus=bogus` has returned 500
for as long as media-api has existed. Fixing it here would either make the new endpoint
inconsistent with the old one, or turn an additive PR into a change of existing API
behaviour. Recommend: reply, offer a separate one-line PR if the team wants it.

**#3 is real and reachable.** `boolQuery().withNot(existsQuery(primaryField))`
(`ElasticSearch.scala:629`) is a root-level exists. Kupua's `usagesDateAdded` sort is
`{"usages.dateAdded": {order, mode:"max", nested:{path:"usages"}, missing:"_last"}}`
(`sort-builders.ts:103`), and kupua's own direct-ES adapter already wraps the equivalent
exists check in a `nested` query (`es-adapter.ts:1297-1299`, and again at `:1694`). The
Scala port dropped that. The `FieldSort` carries its nested path, so the fix has the
information it needs.

**#1 is unverified but the code is unexercised.** Every integration test passes
`pitId = None` (`ElasticSearchTest.scala`), and no caller can obtain a `pitId` — the PIT
open/close endpoint is D8, not yet built. So the PIT branch in this PR has never run past
page 1 anywhere. See §3 for how we settle it.

**#4 is the enabler for the rest of Batch A.** `searchAfter` throws synchronously — before
any `Future` is constructed — at three sites: `orderOf`, `sortModeOf`, the `case _` in
`jsonToSort` (all `sorts.scala`), and `throw InvalidUriParams("cannot detect primary sort
field…")` (`ElasticSearch.scala:627`). The `.recover` in `MediaApi.searchAfterImages` is
attached to a Future that is never created, so these become 500s. The cursor-length
mismatch is different — it uses `return Future.failed(...)` and correctly yields 422, which
is why the existing "cursor-mismatch → 422" test passes and hid the rest.

**#9 / #10 — kupua sends neither.** `apiSearchAfter` never sets `offset` and never sends an
`include` query param at all (`grid-api-search-adapter.ts`). Kahuna never calls this
endpoint. So both are pure contract questions with no current caller at risk.

---

## 3. Decisions

### D-1 — #1 PIT `_shard_doc`: settle by experiment, not by argument (RECOMMENDED)

Superseded by **D-6** — the experiment was run. Keeping the reasoning here because the method
(settle by measurement, not argument) is the reusable part.

The question "does ES append `_shard_doc` and then reject a short cursor?" is cheap to
answer: the Docker-backed integration test can open a PIT directly via elastic4s, page
twice, and assert. That test is *also* the test the fix would need. So:

1. Write the two-page PIT test **first**, as a test-only change.
2. If it fails as Copilot predicts → the fix belongs in this PR, because it changes code
   already in #4849 (the `.take(sortLen)` truncation *and* the
   `sv.length != workingSort.length` guard, which would otherwise reject a correct n+1
   cursor). Deferring to D8 would mean knowingly merging broken code into `main`.
3. If it passes → Copilot is wrong; reply with the evidence and close the comment.

Amending the D7/D8/D9 workplan instead is tempting (less work now) but only correct if the
affected code were unwritten — it isn't. Either way, the D8 workplan gets an addendum
noting the cursor contract, since D8 is what makes the PIT path reachable.

**Status:** DONE — see D-6 for the outcome.

### D-6 — the PIT cursor contract: `_shard_doc` is dropped ON PURPOSE (SETTLED, 2026-08-17)

> Read this before touching the PIT branch — including whoever builds D8. It looks like a
> bug from every angle except the one that matters.

**Measured, not argued.** A Docker-backed test opened a PIT and inspected the raw response:
ES 8.18 **does** append an implicit `_shard_doc` tiebreaker — `hit.sort` has 3 values against
a 2-field client clause. So the reviewer's premise is correct.

**But the predicted consequence does not occur.** ES does *not* reject a shorter
`search_after`; it accepts it and compares the client's prefix. A two-page PIT walk works
today, unchanged.

**The tempting "fix" is wrong.** Preserving the tiebreaker (and widening the length check to
`n+1`) was implemented, went green, and was then reverted, because:

1. **Cursors outlive the PIT.** Kupua persists them in the store as `endCursor`/`startCursor`
   and retries *without* a PIT when one expires (`es-adapter.ts` catch on 404/410). A
   `_shard_doc` value in a non-PIT `search_after` is rejected by ES with a 400. Kupua's own
   direct-ES adapter strips the tiebreaker for exactly this reason and says so in a comment
   (`es-adapter.ts:1025-1035`) — the Scala was already consistent with the client.
2. **Synthesised cursors become impossible.** `buildSeekCursorAnchors`
   (`search-store.ts:874`) and the null-zone cursor (`search-store.ts:3071`) are built
   client-side from estimates. A client cannot invent a `_shard_doc` ordinal, so an `n+1`
   requirement would 422 every seek and every null-zone entry.

**The actual contract, now documented in code and pinned by tests:** the cursor is always the
client's sort-clause length. That is safe **provided the client's sort ends in a unique
tiebreaker** — kupua's `buildSortClause` always appends `id`. Violate that precondition and
documents tied on the clause can be skipped at a page boundary; a deliberately non-unique
sort was measured losing 8 of 27 documents. That is a caller requirement, not a server bug,
and the server cannot detect field uniqueness.

**Tests that hold the line:** `PIT: a two-page cursor walk over a point-in-time snapshot`
(asserts ES returns n+1 while our cursor is n — so a future ES change surfaces immediately)
and `PIT: a full cursor walk loses no documents when the sort clause ends in a unique
tiebreaker`.

### D-2 — #10 `include=fileMetadata`: deferred to the team

The lean `_source` projection (`Image` fields minus `{embedding, originalMetadata,
fileMetadata}`, plus `fieldAliasConfigs` leaf paths) is the 1.7 MB → 370 KB per-page win;
the `fieldAliases` passthrough is the deliberate escape hatch for the few leaves kupua
needs. Making full-fat `fileMetadata` available on explicit request is a defensible
addition — but if built, **it must stay dropped by default and be returned only when
explicitly asked for**, so the payload win is never silently lost.

**Status:** undecided. State the design constraint in the PR reply; leave the code alone.

### D-3 — #9 `offset`: leaning "reject, don't implement"

Cursor navigation is the alternative to offset pagination, not a companion to it. Options:
(a) reject a non-zero `offset` with 422; (b) apply `.from()` only when no cursor is present;
(c) document that it is ignored. (a) is the honest contract. **Status:** undecided.

### D-4 — #6: reply only, no code in this PR. See §2. **Status:** recommended, unconfirmed.

### D-5 — pre-existing, unrelated to this review

Still open from the original PR body: POST-for-reads as a convention, and
`auth.async(parse.json)` as the shape for authenticated JSON endpoints.

---

## 4. Batch A — build, test, commit

Five fixes, **one Scala commit**, because #4 is what makes the other four actually surface
as 422s rather than 500s. All are cursor-path-only; none touch `createSort` / `parseSortBy`
(Kahuna's sort path) or `imageSearch`.

| # | Change |
|---|---|
| 4 | Make all `searchAfter` validation failures reach the caller as failed Futures |
| 5 | Validate `jsonToSort` entry shape; malformed → `InvalidUriParams` |
| 7 | `orderOf` accepts only `asc`/`desc`; anything else → `InvalidUriParams` |
| 8 | Require `sort` to be a present, non-empty array |
| 2 | Attach `syndicationReviewQueueFixMapping` when the flag + status match, as `search()` does |

**Compatibility check before committing:** kupua sends `"asc"`/`"desc"` and always sends a
non-empty `sort`, so the new 422s are unreachable from the real client. Confirm by running
kupua with `--use-media-api` against the local media-api, not just by reading.

**Test surface:** the media-api Scala tests (`ElasticSearchTest` is Docker-backed), plus new
cases for each rejection path. New behaviour = new status codes, so check whether any
existing test asserts a 500/passthrough for these inputs before changing them.

---

## 5. Porting to the PR branch — ✅ DONE (both batches, plain cherry-pick)

Per `media-api-worknotes.md`, and its 2026-07-25 caveat: `main` has independently refactored
the same files, and a plain cherry-pick of D3's original commit already conflicts. So the
dry-run was run before each port:

```bash
git merge-tree --write-tree --merge-base=<commit>^ origin/mk-api-1of9-searchAfter <commit>
```

**Both came back clean (exit 0)**, so the default recipe applied and the harvest fallback was
not needed. Each cherry-pick touched only the intended `media-api/` files (verified with
`git diff --stat` against the PR head), and the full suite was re-run on the PR branch after
each — its base differs, since it carries a merge from `main`.

> Do not assume this stays true. Re-run the dry-run for any future port; the caveat that
> caught D3 is about `main` moving, not about these particular commits.

---

## 6. Replying to the review comments — ✅ DONE

Each comment was answered individually on the *Files changed* tab. Convention used, worth
reusing:

- **Fixed (#2, #4, #5, #7, #8, #3):** reply naming the commit and the test covering it, then
  *Resolve conversation*.
- **Investigated and refuted (#1):** reply with the measurement, the reverted attempt, and the
  reasoning, then resolve. See §D-6.
- **Declined as pre-existing (#6):** reply with the cite showing the GET path is byte-identical,
  offering a separate follow-up PR, then resolve.
- **Team decisions (#9, #10):** replied with the options and **left open** deliberately.

Copilot's own suggested changesets were **not** committed blind. Several were close but not
right — notably #4's `Future(...).flatten`, which papers over the synchronous throw instead of
removing it and would have missed the null-zone throw site entirely.

Copilot is not a required reviewer, so resolving is signal to the human reviewer rather than a
merge gate.
