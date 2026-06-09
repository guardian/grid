# Phase 3 — D3 searchAfter: Sort Companion (decision record + Option A shape)

**Companion to:** `phase-3-d3-searchafter-workplan.md` ("D3 main").
**Status:** Decision recorded. Option B is the chosen first build; its **build
steps live in D3 main**, not here. This doc is the rationale, the breakage
analysis, the longer-term **Option A** shape, the migration trigger, and the
production-Kahuna safety constraints.

> **Why a separate doc?** The buildable instructions for sorting are inseparable
> from the `searchAfter()` endpoint (same method, same payload), so they live in
> D3 main. But *which* clause-ownership model to use is a real architectural fork
> with an Option A/B choice and a deferred-refactor horizon. That decision record
> doesn't belong buried inside an endpoint plan — it lives here. This doc contains
> **no build steps**; it is allowed to drift slightly because nothing is built
> from it directly.

---

## 0. The hole in one sentence

The D3 endpoint paginates with `search_after`, whose cursor (`sortValues`) is the
verbatim echo of a hit's `sort` tuple. **The cursor's shape (field count + order +
direction) is dictated entirely by the sort clause.** If the server builds a sort
clause that differs in any way from the clause kupua used to derive its cursors,
pagination silently corrupts or trips the length-validation 422. The original D3
draft assumed `sorts.createSort(orderBy)` builds the server clause — but
`createSort` does **not** reproduce kupua's `buildSortClause`, so most sorts break.

---

## 1. The cursor-shape-parity invariant

> **Invariant:** the sort clause the server applies MUST be field-for-field
> identical (count, order, direction, missing/mode/nested options) to the clause
> kupua's `buildSortClause` produced for the same `orderBy`.

This is non-negotiable because:

- kupua's `extractSortValues` (`image-offset-cache.ts`) derives in-memory cursors
  directly from `buildSortClause(orderBy)` — used on eviction, restore, and
  jump-to-image paths, with **zero** ES round-trip.
- The endpoint validates `sortValues.length == effectiveSortClause.length`.
- ES applies `search_after` positionally against the sort tuple.

Any divergence is either a **loud** failure (422, wrong length) or — worse — a
**silent** one (same length, different direction/field → duplicate/missing rows
within tied groups).

Option B satisfies the invariant **by construction** (one builder, on the client).
Option A satisfies it only by a standing test guarantee that two builders stay
identical forever.

---

## 2. What breaks if this doc is not actioned (D3 main built with `createSort`)

Tracing each kupua sort through `appendTiebreaker(createSort(orderBy))` (no
replication of the `search()` special-case match; `createSort` knows only the
`taken → metadata.dateTaken,-uploadTime` replacement):

### Works correctly (2)

| `orderBy` | Why it survives |
|---|---|
| `-uploadTime` / `uploadTime` / *(default)* | uploadTime is primary → kupua adds **no** fallback. Clause `[uploadTime, id]` (2) on both sides; `id≡_id`. Directions align. |
| `-taken` (desc) | Lucky alignment. `createSort` expands `taken`→`metadata.dateTaken,-uploadTime`; with the `-` that yields `[dateTaken desc, uploadTime desc, _id]`, which equals kupua's `[dateTaken desc, uploadTime desc, id]`. |

### Silently wrong — no error, corrupt pagination (1)

| `taken` (asc) | Same 3 fields, same names, **but the uploadTime fallback direction differs**: kupua inherits the primary (`uploadTime asc`); `createSort` hardcodes `-uploadTime` (`uploadTime desc`). Length validates (3=3) → no 422 → duplicates/gaps inside tied-`dateTaken` groups + wrong null-zone order. The most dangerous case. |

### Broken (the rest)

| Sort(s) | Failure |
|---|---|
| `credit`, `source`, `imageType`, `category`, `mimeType`, `width`, `height`, **+ all config `fieldAliases`** | `createSort` never resolves the alias → sorts on bare unmapped field (`credit` not `metadata.credit`) → ES "No mapping found". Also no `uploadTime` fallback → server clause len 2 vs kupua cursor len 3 → 422. Double-broken. |
| any non-`uploadTime` date field besides `taken` (e.g. `lastModified` if exposed) | Field name fine, but server omits the `uploadTime` fallback kupua adds → length mismatch (2 vs 3) → 422. |
| `dateAddedToCollection` **and** `-dateAddedToCollection` | Worst case. `createSort` sorts on bare unmapped `dateAddedToCollection` (real field `collections.actionData.date`); no nested/`missing:_last`, no fallback, **no companion `pathHierarchy` filter**, no asc variant, and a **convention collision** (Scala's legacy token means DESC, kupua's no-dash means ASC). Broken both orders. |
| `usagesDateAdded` (once kupua ships it) | Cannot be expressed as a `createSort` string at all (nested `mode:max`). Broken by construction. |

**Summary:** only the three `uploadTime` variants and `-taken` work; `taken` asc is
silently corrupt; **everything else** — every keyword/numeric alias, both
`dateAddedToCollection` orders, and future `usagesDateAdded` — fails. That is the
entire sort dropdown except "newest/oldest uploaded".

---

## 3. The two options

### Option B — client sends the resolved ES sort clause (CHOSEN, build now)

kupua sends `sort: buildSortClause(orderBy)` (the full clause) in the POST body;
the server deserialises it into elastic4s `Sort`s and applies it verbatim. The
server holds **no** sort knowledge — no alias map, no fallback logic, no
asc-variant, no convention. The existing null-zone code stays generic (head ==
`JsNull`, `primaryField = clause.head`, reverse = flip orders, seekToEnd =
`missing:_first` on head). `orderBy` is still sent, read **only** for the
`dateAddedToCollection` companion `pathHierarchy` filter.

- **Pro:** single source of truth → invariant holds by construction; every current
  and future kupua sort works for free, both nested ones in both orders; least
  Scala now and forever (no parity tests to maintain); **zero** Kahuna-serving
  sort-code risk (never calls/edits `createSort`).
- **Con:** leaks the ES sort DSL through the API; a future non-kupua client would
  have to speak ES sort syntax. The companion `pathHierarchy` filter stays
  kupua-coupled (kupua already builds it in ES-direct mode), so the "API" isn't
  fully ES-agnostic yet.

### Option A — server owns a *semantic* `orderBy` (deferred, end-state)

The API stays semantic (`orderBy: "-dateAddedToCollection"`); the server reproduces
kupua's `buildSortClause` in Scala: alias map (8 fixed + config `fieldAliases`),
the `uploadTime` fallback with date-direction-inheritance + `DATE_SORT_FIELDS`, the
`id` tiebreaker, both nested specials in both orders, the asc variant of
`dateAddedToCollection`, and the convention fix.

- **Pro:** clean, ES-agnostic contract; consistent with the server already owning
  filter-building via `buildFilteredQuery`; correct end-state for multiple clients.
- **Con:** two clause builders that must stay byte-identical forever, enforced only
  by a **standing parity test suite**; the cursor coupling makes drift a *silent*
  pagination corruptor. More Scala now and an ongoing maintenance tax.
- **Hard constraint (see §5):** Option A must be a **parallel** builder. It must
  **NOT** be implemented by fixing `createSort` in place — that method serves
  production Kahuna.

---

## 4. Recommendation: Option B first

1. **Invariant for free.** One builder cannot diverge from itself; A's safety rests
   on perpetual tests.
2. **Complete coverage immediately.** Every alias + both nested sorts + both orders
   work the day D3 ships; `usagesDateAdded` works the day kupua adds it, with no
   second Scala change.
3. **Least Scala, now and forever.** B is "delete `createSort` from the endpoint +
   one deserialiser"; A is "reimplement a tested TS module in Scala + maintain a
   parity guarantee." (B isn't *zero* Scala — it shifts a little complexity to the
   wire format and the `jsonToSort` parser for nested-object entries — but it is
   clearly less total and less ongoing Scala.)
4. **No Kahuna risk in the sort layer.** B never touches `createSort`. A's tempting
   implementation path runs straight through Kahuna-serving code (§5).

A is **deferred, not abandoned.** It is the more correct API end-state once the
sort logic stabilises or a second client appears.

---

## 5. Production-Kahuna safety

media-api serves **production Kahuna**. The endpoint is purely additive; nothing
Kahuna depends on may change.

- **Option B is the safe option.** The new endpoint does not call `createSort` and
  only reads the companion-filter logic read-only (lift-and-reuse,
  behaviour-preserving). `createSort`, `dateAddedToCollectionDescending`, and the
  `search()` `pathHierarchy` filter are untouched.
- **Option A carries the Kahuna risk, not B.** `createSort` is *currently wrong*
  (alias non-resolution, no asc variant, dash-convention collision). "Fixing" it in
  place to match kupua would silently change Kahuna's sort behaviour. Therefore:

  > **Option A MUST be implemented as a NEW, parallel sort builder used only by the
  > cursor endpoint. Do NOT modify `createSort` to make A "correct". The
  > buggy-but-load-bearing `createSort` stays as-is for Kahuna.**

  That A requires two coexisting builders (one knowingly wrong, kept for Kahuna) is
  itself a reason A is deferred — it is more work *and* slightly absurd.
- **Shared extractions still need care.** D3 main's `buildFilteredQuery` and
  `hitToImageEntity` lift DO modify Kahuna-serving code; they must be strictly
  behaviour-preserving with existing `search()`/`imageSearch()` tests green. The
  one allowed change — matching both `dateAddedToCollection` tokens inside
  `buildFilteredQuery` — is behaviour-preserving for Kahuna because Kahuna never
  sends the asc token.

---

## 6. When to migrate B → A

Refactor to Option A when **either** trigger fires:

- **The sort logic stabilises** — the alias set, fallback rules, and nested sorts
  stop changing, so a Scala re-implementation won't immediately rot; **or**
- **A second, non-kupua client** needs the cursor endpoint and cannot reasonably be
  asked to speak the ES sort DSL.

Migration shape (general, not line-level — speccing it now is premature):

1. Add a **new** Scala sort builder (parallel to `createSort`; do not touch
   `createSort`) reproducing `buildSortClause`: alias resolution, `uploadTime`
   fallback with direction inheritance + `DATE_SORT_FIELDS`, `id` tiebreaker, both
   nested specials in both orders, `dateAddedToCollection` asc variant, dash-convention.
2. Add a **parity test suite** pinning the new builder's output, field-for-field,
   against kupua `buildSortClause` fixtures for every `orderBy` (the standing
   guarantee that protects the §1 invariant).
3. Switch the endpoint to build the clause server-side from `orderBy`; drop the
   client `sort` field (or keep accepting it transitionally).
4. Update kupua's adapter to stop sending `sort`.

Until a trigger fires, **do not** write the line-level Option A workplan. It will
drift before it is built.

---

## 7. Build sequencing (hard rule)

Option B's build steps live in D3 main and land in **the same two commits** as the
endpoint:

- **Scala** clause-deserialisation (`jsonToSort`, `reverseSorts`, `SearchAfterParams.sort`,
  the both-orders companion filter) → D3's **Commit A**.
- **kupua** `sort: buildSortClause(orderBy)` in the adapter → D3's **Commit B**.

> **Never land the D3 endpoint with `orderBy`-driven server sorting.** Doing so
> ships a build where most of the sort dropdown is silently corrupt or 422s (§2).
> The endpoint and its Option B sort handling are one buildable unit.

---

## 8. Reference

| Source | What |
|---|---|
| `kupua/src/dal/adapters/elasticsearch/sort-builders.ts` | `buildSortClause` — the single source of truth (alias map, uploadTime fallback w/ direction inheritance, id tiebreaker, `dateAddedToCollection` both orders) |
| `kupua/src/lib/image-offset-cache.ts` | `extractSortValues` — derives in-memory cursors from `buildSortClause`; why the §1 invariant exists |
| `media-api/app/lib/elasticsearch/sorts.scala` | `createSort` / `dateAddedToCollectionDescending` — the Kahuna-serving sort code that must NOT change |
| `media-api/app/lib/elasticsearch/ElasticSearch.scala` | `search()` `dateAddedToCollectionFilter` (the companion `pathHierarchy` filter) + the `orderBy match` that picks the special sort |
| `usages-findings.md` §11 | `usagesDateAdded` nested sort shape (`mode:max`, `nested:{path:usages}`, `missing:_last`) |
| `media-api-instructions-for-agents.md` | media-api Scala conventions (additive endpoint, no `var`, fluent DSL, tests) |
