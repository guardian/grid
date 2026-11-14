# Response to Alex's architecture suggestions

> Companion to `Alexs_Arch_Suggestions.md`. Concrete inventories in
> `boundary-inventory-2025-05.md` (Part I — named examples) and
> `boundary-inventory-2025-05-part-ii.md` (Part II — orchestration principle).
> This doc explains what we plan to do **now**, what needs **design first**, and
> what we plan to **not do** — with reasons.

---

## Preface — why this plan is on hold (26 May 2026)

**From the project owner (non-engineer):**

> I am not an engineer. This app grew "organically" by me asking Claude agents
> for ever more functionality. I never looked at the code. I don't understand
> system design. When I try to read the plan it SOUNDS like it makes sense.
> But present me with a competently written plan proposing complete architectural
> madness — and it will SOUND the same to me. I cannot judge if it's good. I
> can't oversee implementation meaningfully. I can't judge its complexity or time.
> From my perspective it can only break things. Or make them slower.

**Honest assessment from the agent that wrote the plan:**

This refactoring delivers value to engineers who don't exist yet. The boundary-
tightening makes the system easier for a *human engineer* to reason about —
"I know ES concerns stop here." But the project owner isn't reasoning at that
level, and AI agents don't care whether `parseCql` comes from the barrel or a
direct import. The code works identically either way.

Risk is asymmetric: the best outcome is "nothing changed from user perspective."
The worst is broken scroll/seek/pagination in subtle ways (works for 50 results,
breaks for 5000) that the owner can't diagnose. A refactoring PR that passes
all tests but introduces a race condition in PIT lifecycle? Undetectable without
an engineer reviewing. An agent "fixing" a failing test by weakening it?
Indistinguishable from a correct fix to a non-engineer.

**Recommendation: don't implement this plan without a human engineer to review.**

- Keep building features. The architecture serves current needs.
- If/when a real engineer joins, hand them this doc and let them decide under
  their supervision.
- The AI search violations (Item 7) — fix when AI search ships to real users.
- `parseOrderBy` consolidation (Item A) — the one item closest to "prevents a
  real bug" (five parsers could diverge). Still optional until it actually does.

The plan is intellectually honest work. It's just work that has no safe executor
right now.

---

## Framing

Alex's doc describes an end-state. Most of it is unlocked by the BFF: "the
browser does not know ES exists" is a deployment, not a refactor. Until the
BFF ships, the ES code *is* the browser code; opacity can only be enforced
by type discipline, not by physical separation.

So we asked a narrower question: **of the boundary-tightening work that
doesn't depend on the BFF, which actually improves the current code AND
survives the BFF move unchanged?**

We ran the question in two passes.

**Part I** inventoried the six concepts Alex named explicitly (cursor
opacity, `orderBy` parsing, store→DAL-internal imports, `took`,
null-zone in route state, bucket typing). It produced a small honest plan
— two items, one PR — because most named concepts turned out to be already
contained at the seam that matters, or to be intentional features.

**Part II** then audited Alex's strongest *principle* — "all orchestration
lives in the DAL" — against the rest of the codebase. That audit found
nine distinct orchestration clusters outside `dal/`, seven of them inside
`search-store.ts`. The store has drifted from "intent layer + buffer" into
"sequencing engine for multi-step ES dialogues". Three of those clusters
have clean, low-risk extractions and meaningfully reduce store complexity.

So the final plan is bigger than Part I's "two small things" but smaller
than a full architectural rewrite: **two boundary-tidies plus three new
DAL intent methods**, all designed to survive the BFF unchanged.

---

## The cross-cutting finding (the headline)

Part II's most important finding isn't a list — it's a pattern.

> The store is a sequencing engine, not a state container.

Seven of nine orchestration clusters live in `search-store.ts`. The store
acts as scheduler for distributed ES workflows (PIT lifecycle, multi-step
seek, parallel forward/backward fetches, fill loops, aggregation bundles),
with module-level abort controllers, generation counters, and cooldown
timestamps interleaved throughout. The store's job *should* be "hold the
buffer and expose intent methods". Alex's principle restates this directly.

This pattern is significant on its own. It is the reason the store is
~3,900 lines. Extracting even three intent methods to the DAL is a real
step toward the right shape.

Three pieces of non-DAL state currently block clean extraction of
*everything* seek- or focus-related:

- `positionMap` (store state, built from a background walk)
- `sortDistribution` (store state, lazy-loaded)
- scroll geometry (module-level `getScrollGeometry()`)

Any DAL method that needs these requires them as parameters, coupling the
DAL contract to store-internal caches. The three extractions proposed
below were chosen because they **don't hit any of these blockers**.

---

## What we plan to do now

### A. `parseOrderBy` consolidation *(Part I)*

`orderBy` is parsed by five distinct implementations outside the DAL
(`sort-context.ts` four variants; `SearchFilters.tsx` local parsers;
`ImageTable.tsx` inline split; `search-store.ts:resortAiBuffer`;
`useUrlSearchSync.ts` AI sort logic), plus the `"-uploadTime"` default
duplicated across four files and a new `"-relevance"` default in a fifth.
Zod treats it as opaque `string`, so a malformed value would reach all
five and diverge.

**Fix.** One `parseOrderBy(orderBy: string): SortOrder` util. Five call
sites collapse to it. Optionally validate at the URL boundary.

**Risk.** Low — equivalence of the five parsers needs verifying before
collapse. Survives BFF unchanged.

### B. Barrel discipline for DAL imports *(Part I)*

`search-store.ts` reaches past `dal/index.ts` into adapter internals:

```
from "@/dal/position-map"           (PositionMap, cursorForPosition)
from "@/dal/null-zone"              (detectNullZoneCursor, remapNullZoneSortValues)
from "@/dal/adapters/elasticsearch/cql"  (parseCql)
```

**Fix.** Add to barrel; update four imports.

**Risk.** Near-zero — five re-exports, four import-line edits.

### C. `loadBufferCenteredAt` and `loadBufferAroundCursor` *(Part II clusters C4, C5)*

Two store methods (`restoreAroundCursor`, `_findAndFocusImage`) both
need the same primitive: "given a target image and its cursor, fetch a
buffer page centred on it via parallel forward + backward `searchAfter`
calls." The primitive currently lives as a 120-line helper in the store
(`_loadBufferAroundImage`) and is the cleanest extraction candidate in
the codebase — it reads no focus state, emits no scroll signals, and the
null-zone handling it does is already in `dal/null-zone.ts` (just
applied manually instead of internally).

**Fix.**
- New DAL method `loadBufferCenteredAt(cursor, params, halfSize, signal, pitId?)` → `SearchAfterResult`. Absorbs the parallel-fetch + null-zone-override pattern.
- New DAL method `loadBufferAroundCursor(imageId, cursor, params, signal)` → `{ hits, bufferOffset, startCursor, endCursor }`. Calls `loadBufferCenteredAt` plus a single `countBefore`; replaces `restoreAroundCursor`'s 3-step orchestration.

The store keeps the column-alignment trim (scroll geometry concern),
the focus assignments, and the fallback-to-`seek` one-liner.

**Risk.** Low. Both callers covered by `search-store-pit.test.ts` and
`search-store-extended.test.ts`. No new abort semantics; existing
`AbortSignal` plumbing stays in the store wrapper.

**Survives BFF?** Yes — `loadBufferCenteredAt` is the right primitive
on either side of the network. BFF would implement it server-side
without the client noticing.

### D. `getIdRangeBetween` for range selection *(Part II cluster C9)*

`useRangeSelection.ts` currently calls `getIdRange(fromCursor, toCursor)`
and, when the result is empty (anchor's sort direction unknown), retries
with swapped cursors. The swap-and-retry is pure ES sequencing — no UI
state, no focus, no scroll. This is exactly Alex's `selectRange(a, b)`
example.

**Fix.** Add `getIdRangeBetween(params, cursorA, cursorB, signal)` →
`{ ids, walked }` to the DAL. It handles direction detection internally.
Hook keeps the `anchorSV` resolution (which reads from
`selectionStore.metadataCache`) and the `safeApplyResults` call.

**Risk.** Low. Single file change in the hook. Covered by
`useRangeSelection` Playwright spec.

**Survives BFF?** Yes. Maps to a single BFF HTTP request.

### E. Null-zone auto-trigger into `fetchSortDistribution` *(Part II cluster C8)*

The route currently watches `sortDistribution.coveredCount < total` in a
`useEffect` and fires `fetchNullZoneDistribution`. The route shouldn't
know about `coveredCount` at all. (Part I Item 5 argued *against* moving
the tick computation; this is the narrower companion finding —
**triggering** is the part that should move, **deriving the ticks** is
the part that stays.)

**Fix.** `fetchSortDistribution` internally fetches the null-zone
distribution when `coveredCount < total`. Result type becomes
`{ primary, nullZone? }` (or two separate store fields populated in one
call). Route effect deleted.

**Risk.** Low. Pure read on a DAL result field already lives in the
store; the auto-trigger semantics just need to fire after the primary
distribution lands rather than after the route re-renders.

**Survives BFF?** Yes. Single round-trip from the client.

### Bundling

A + B + C share files (`search-store.ts`, `dal/index.ts`). D and E touch
different files (range-selection hook, route effect, DAL contract).
Suggested split:

- **PR 1**: A + B + E (boundary-tidy + one auto-trigger move)
- **PR 2**: C + D (new DAL intent methods; bigger contract change)

Either way, both PRs land before any of the design-first work below.

### Test surface

- All Vitest (`npm --prefix kupua test`) — mandatory after every PR.
- All Playwright (`npm --prefix kupua run test:e2e`) — mandatory; C and D
  touch scroll/focus/range-selection paths.
- Perceived perf (`npm --prefix kupua run test:perf -- --perceived-only`)
  before/after C and E — both touch `search-store` paths instrumented for
  perceived traces.

---

## What needs design first (not yet)

### F. `seekToImage` *(Part II cluster C3, partial extraction)*

The pure ES traversal inside `_findAndFocusImage` (searchAfter by id →
countBefore → loadBufferCenteredAt → optional background countBefore
correction) could become a single DAL method. **The blocker** is the
neighbour-fallback branch: when the target image is gone from the index,
the function uses `prevNeighbours` (a snapshot of the pre-search buffer)
to find a survivor. That state is UI-owned, not DAL-owned.

**Decision needed before coding.** Does `seekToImage` accept
`prevNeighbours` as an optional parameter (DAL contract widens), or does
the fallback stay in the store (DAL method becomes "find by id, return
404-ish if gone, caller decides")? Both are defensible; pick one.

### G. `getFacetsWithFilterCounts` *(Part II cluster C7)*

Bundling facet aggregations and `is:` filter counts into one DAL method
is safe and saves a round-trip, but the filter-agg request construction
currently does `parseCql("is:deleted")` etc. — the same `parseCql` import
that A/B/C move through the barrel. Item C7 should land *after* the
barrel work, so the bundling and the CQL boundary are tidied together
rather than touching adjacent code twice.

---

## What we're not doing

### Part I leftovers

- **Cursor brand type (Item 1)** — opacity already holds at runtime
  (zero array indexing outside `dal/`). Brand would be theatre. Two-line
  `@/dal/types` → `@/dal` redirect folded into PR 1.
- **`took` removal (Item 4)** — it's a deliberate dev timing display in
  `SearchBar.tsx`, not a leak.
- **Tick computation move (Item 5)** — store owns data, route owns the
  cached derivation. Moving the derivation into Zustand makes
  memoization worse because the `results` buffer changes identity on
  every extend.
- **Bucket key discriminant (Item 6)** — date/keyword buckets never mix
  in the same consumer today. Formalise at BFF wire-contract design.

### Part II clusters deferred to BFF

- **C1 — PIT lifecycle** — the most entangled cluster. Five major store
  methods explicitly thread `pitId` + `_pitGeneration`. The BFF will
  naturally absorb PIT lifetime into a server-side session; designing a
  client-side session abstraction now means designing something we'll
  throw away.
- **C2 — `seek()` deep-seek algorithm** — reads five pieces of store
  state, emits three scroll signals, runs up to 50-iteration binary
  searches. Would need a parallel design doc. Out of scope for this
  round.
- **C6 — `_fillBufferForScrollMode`** — the page loop progressively
  appends so users see images appearing during the fill. That's a UX
  feature, not a sequencing leak. An async-iterator DAL method could
  preserve it but is a more invasive contract change. Wait for BFF
  streaming story.

---

## One additional finding from outside the audits

`src/lib/image-offset-cache.ts:extractSortValues` imports `buildSortClause`
and `parseSortField` from `@/dal` and uses them to **construct an ES sort
clause inside a lib helper**. This is the most architecturally interesting
smell flagged in either audit: a lib helper, not the store, calling DAL
helpers to assemble ES syntax. It's a generalisation of Item 3's pattern
(store reaching into adapter internals) but moved one layer further out.

Not in any planned PR because the fix is less mechanical (the helper may
want to become a DAL method, or `extractSortValues` may want to move into
`dal/`). Flagged as the natural next item once the planned work lands.

Part II's appendix flagged two related smells:

- `collection-store.ts` and `selection-store.ts` each instantiate their
  own `new ElasticsearchDataSource()` — two independent DAL instances
  exist at runtime, bypassing any future dataSource-injection contract.
- `lib/orchestration/search.ts` is named for orchestration but mostly
  holds I/O-free coordination helpers (debounce, scroll reset registry,
  history snapshot helpers). The naming oversells the role.

Both worth tracking but neither in scope for this round.

---

## Post-plan update: AI search (c96c8cb8e, 25 May 2026)

The AI search commit landed after this plan was written. It introduces seven
new boundary violations (catalogued as Item 7a–7g in the Part I inventory).
They fall into three categories:

### New `orderBy` parsing instances (7a, 7b)

`resortAiBuffer` in search-store.ts and `useUrlSearchSync`'s AI sort logic
both parse `orderBy` strings inline (`startsWith("-")`, `.slice(1)`,
equality checks against `"-relevance"`). This **widens Item 2's scope** from
"three implementations to consolidate" to five. The `parseOrderBy`
consolidation in PR A now covers more call sites but the fix is identical.

**Impact on plan:** PR A's scope increases slightly (two more call sites to
update when `parseOrderBy` lands). No design change needed.

### Reverse boundary violation: DAL imports lib/ (7c)

`es-adapter.ts` imports `getEmbedding` from `@/lib/bedrock-proxy-client` —
the DAL adapter directly depends on a browser HTTP client for a non-ES
service. This inverts the dependency direction (normally: store/lib → DAL,
not DAL → lib).

**Why it exists:** Pragmatic — the DAL method needs an embedding vector
before it can build the KNN query. The alternative (inject the embedding
function, or have the store fetch the embedding and pass it in) was deemed
over-engineering for a dev-only prototype.

**When to fix:** Before AI search ships. The correct shape is either:
(a) `searchByAi(params, embedding, signal)` — store/hook fetches the
embedding and passes it to the DAL method, or (b) the embedding client is
injected into the data source constructor alongside the ES URL.

### ES envelope field leakage: `__aiScore` and synthetic cursors (7d, 7e)

`_score` from the ES KNN response crosses the DAL boundary renamed as
`__aiScore` on the `Image` type. The store reads it for client-side re-sort.
Additionally, `searchByAi` manufactures fake `SortValues` arrays to fit the
`SearchAfterResult` contract — cursors that are never used for pagination.

**Why it exists:** AI results need re-sorting without an ES round-trip
(re-running KNN with a different sort makes no sense — the result set is
fixed). The score is the sort key for "relevance" order. Synthetic cursors
prevent null-reference errors in store code that assumes cursors exist.

**When to fix:** The correct fix is a separate return type for AI results
(`AiSearchResult`) that carries `relevanceRank: number` as a domain field
and doesn't pretend to have cursors. The store's AI branch already skips
all cursor-dependent paths (extend, seek, PIT), so a different type is
honest about what the data actually is.

### Orchestration outside DAL: `decorateParamsForAggregations` (7f)

A `lib/` helper constructs `params.ids` to scope ES aggregations to the
AI result set. This is query-construction knowledge living outside `dal/`.

**When to fix:** When the aggregation path is refactored (related to
Item G / cluster C7). The DAL's `getAggregations` should accept an optional
`scopeToIds: string[]` parameter. This is a one-method signature change.

### Verdict

None of these block the planned PRs (A through E). The AI code path is
a branch entered only when `params.aiQuery` is truthy — the existing
search/scroll/seek paths are untouched. These violations are
**fix-before-ship** debt, tracked in the inventory, and should be resolved
as part of AI search maturation before the feature leaves dev-only status.

---

## What "done" looks like for this round

- Two PRs land: A+B+E first, then C+D.
- All unit + e2e tests green; perceived-perf doesn't regress on the
  paths touched by C and E.
- This doc updated with merged SHAs and any deviations from the plan.
- The store is meaningfully narrower: three orchestration clusters
  (C4, C5, C9) and one auto-trigger (C8) moved into the DAL; one
  boundary-leak utility (`parseOrderBy`) consolidated.
- No new abstractions invented to anticipate the BFF.

The shape after this round: the store still owns PIT lifecycle, the
deep-seek algorithm, the fill loop, focus state, scroll signals, and
abort coordination — all things genuinely entangled with the buffer or
the UI. The DAL gains four new compound intents
(`loadBufferCenteredAt`, `loadBufferAroundCursor`, `getIdRangeBetween`,
auto-null-zone-aware `getSortDistribution`) alongside the existing
`searchAfter` / `countBefore` / `getIdRange` primitives.

That's a real step toward Alex's "express intent, DAL does the work"
shape, achievable without the BFF, and structured so that the BFF
migration absorbs the remaining clusters (C1, C2, C6) naturally.

---

## Needs an engineer to turn it into a real workplan

This doc is a plan-for-Alex (what + why). It is **not** a workplan a coding
agent can execute end-to-end. Before either PR can be handed off to a
Sonnet (or any agent), an engineer needs to make a handful of design
decisions that a non-engineer cannot meaningfully arbitrate. Listed below
so they're visible, not so they're answered here.

### PR 1 — three open decisions

1. **Shape of `SortOrder`.** Primary only, or primary + optional
   secondary? Where does the type live (`lib/sort-order.ts`,
   `dal/types.ts`, somewhere else)? Where does the default `-uploadTime`
   live — in the type, the parser, or the URL Zod boundary? Three places
   encode that default inconsistently today. **Update:** a fourth
   (`-relevance`) now exists for AI mode; does `SortField` include
   `"relevance"` or is it handled separately?
2. **Equivalence proof for the five current parsers.**
   `sort-context.ts`'s four variants, `SearchFilters.tsx`'s locals,
   `ImageTable.tsx`'s inline split, `resortAiBuffer`'s prefix strip, and
   `useUrlSearchSync`'s AI sort checks need to be tabulated input-by-input
   and confirmed equivalent before collapse. This is a read-and-prove
   task, not a refactor.
3. **`fetchSortDistribution` result shape after E.** Two store fields
   (`sortDistribution` + `nullZoneDistribution`) populated from one DAL
   call, or one combined result type? Does the public
   `fetchNullZoneDistribution` store method stay or fold in?

PR1 is otherwise reasonable for a Sonnet High pass with a tight
workplan.

### PR 2 — four open contract questions

1. **`loadBufferCenteredAt` exact signature.** Inputs, return shape
   (trimmed vs. un-trimmed for column alignment), and whether the target
   image hit is an input or derived from the cursor.
2. **Null-zone internalisation scope.** Internalise null-zone handling
   in the new DAL methods only — accepting that `searchAfter` (still
   public) doesn't — or push it into all relevant DAL methods at once?
3. **`getIdRangeBetween` vs. existing `getIdRange`.** Add alongside or
   replace? If alongside, the DAL surface grows; if replace, all
   existing `getIdRange` callers and tests change in the same commit.
4. **`_pitGeneration` interaction.** The current
   `_loadBufferAroundImage` callers wrap the helper with generation-
   counter guards. Does the new DAL method accept a generation token,
   does the store wrap with the same guard, or do we punt the
   generation pattern entirely to the BFF-deferral list?

PR2 needs a short design doc (~1 page) pinning these down before any
agent handoff. The questions are interlinked enough that answering them
piecemeal during implementation will produce a worse contract than
answering them up-front.

### Both PRs — test-impact pre-audit

Before either PR is implemented, an engineer (or a research-mode
subagent under engineer direction) should grep the existing test files
for assertions on the behaviour being moved, list them, and decide for
each: update in the same commit (and how), or expect to still pass
unchanged. Skipping this step risks the failure mode where an agent
"fixes" a breaking test by weakening the assertion, which masks real
regressions until later.

### Why this section exists

The author of this doc is not an engineer. The decisions above can be
discussed at the principle level (already done above), but the
*specific* design calls — where a type lives, what a signature looks
like, whether a guard pattern is preserved or punted — require an
engineer's judgement. Handing PR1 or PR2 to a coding agent without that
judgement applied first would produce code that compiles, tests that
pass, and architectural choices that nobody made deliberately.

The right next step is for an engineer to take this doc as input and
produce two execution-ready workplans (one per PR), each with: the
design decisions above answered, a test-impact list, file-by-file
change inventory, and explicit acceptance criteria. Those workplans are
what an agent can execute reliably.
