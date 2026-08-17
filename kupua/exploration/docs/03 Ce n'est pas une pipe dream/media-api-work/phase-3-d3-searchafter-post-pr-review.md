# D3 searchAfter — post-PR Copilot review: triage, decisions, plan

**PR:** [guardian/grid#4849](https://github.com/guardian/grid/pull/4849) — `mk-api-1of9-searchAfter` → `main`
**Review:** Copilot AI, 10 comments, all severity *Medium*, against commit `38ae5b4`.
**Status:** triaged 2026-08-17. **Batch A done** on `mk-next-next-next` (not yet ported to the
PR branch). Batch B and C outstanding.

Work is done on `mk-next-next-next` (where tests and the running app exist), then
ported to the PR branch. See §4–§5.

---

## 1. Triage at a glance

| # | Comment (short) | File | Verdict | Batch | State |
|---|---|---|---|---|---|
| 1 | PIT `_shard_doc` tiebreaker dropped by `.take(sortLen)` | `ElasticSearch.scala` | Unverified claim, untestable path today — **run the experiment** | B | open |
| 2 | Missing `syndicationReviewQueueFixMapping` runtime mapping | `ElasticSearch.scala` | **Real** parity gap with `search()` | A | ✅ done |
| 3 | Null-zone `existsQuery` not nested-aware | `ElasticSearch.scala` | **Real** parity bug (kupua's own client does it right) | B | open |
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

**Status:** agreed approach — run the experiment before deciding.

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

## 5. Porting to the PR branch

Per `media-api-worknotes.md`, and its 2026-07-25 caveat: `main` has independently refactored
the same files, and a plain cherry-pick of D3's original commit already conflicts. Assume
the **harvest** recipe, verify with `merge-tree` first:

```bash
git merge-tree --write-tree --merge-base=<commit>^ origin/main <commit>
```

Non-zero / `CONFLICT` → don't replay the patch; check the reconciled file states out of
`mk-next-next-next` onto a branch built from the PR head, commit, push. Every commit must
touch **only** files under `media-api/` — verify with `git diff --stat` before pushing.

---

## 6. Replying to the review comments

Each Copilot comment is resolved individually on the *Files changed* tab. Convention for
this PR:

- **Fixed (Batch A/B):** reply naming the commit that fixes it and the test that covers it,
  then *Resolve conversation*. Copilot's own suggested changesets should not be committed
  blind — several are close but not identical to what we'll write.
- **Won't fix / not a regression (#6):** reply with the cite showing the GET path is
  identical, offer the follow-up PR, then resolve.
- **Deferred to the team (#9, #10):** reply linking this doc's §3, leave the conversation
  **open** so a human reviewer sees the open question. Do not resolve.

Copilot is not a required reviewer — its comments do not block merge. Resolving is about
signal to the human reviewer, not about satisfying the bot.
