# Phase 2 Handoff — Kupua Data Needs at the DAL Boundary

## Why this audit exists

We need to know what kupua **actually needs from a data backend** —
abstracted from how `ElasticsearchDataSource` happens to satisfy those needs
today. Without this, Phase 3 can't tell which kupua "needs" are real product
requirements versus accidents of the current ES-direct implementation.

The `searchByAi` example from today's session is the model: the *need* is
"AI/semantic image search returning a ranked result page." The current
*implementation* is "fetch vector from Vite Bedrock plugin, fire KNN at ES."
Media-api already satisfies the need — the implementation just hasn't been
rewired. Phase 3 can only make calls like that if Phase 2 separates need
from implementation cleanly.

## How we keep this bounded (READ THIS)

The risk: "what does kupua need" expands into "audit 22k LOC and rewrite
the architecture." We avoid that by **fixing the scope at the DAL boundary**.

**The `ImageDataSource` interface (20 methods, defined in
`kupua/src/dal/types.ts`) IS the contract.** Every UI need that touches
data flows through one of these 20 methods. If a need doesn't pass through
the DAL, it's not a backend concern and not in scope.

So Phase 2 is: **"For each of the 20 `ImageDataSource` methods, describe
the abstract data need it serves, decoupled from ES."**

That is finite, bounded, and tractable. It is NOT:
- A code review of `es-adapter.ts`
- A re-audit of call sites (today's findings doc already did that)
- A redesign of the DAL
- An evaluation of kupua's architecture

## Mindset

- **One method per row, one need per method.** If a method serves multiple
  needs, split it conceptually but keep it as one row with sub-bullets.
- **"What" not "how".** Describe the need in API-agnostic terms. "Return
  the next N images after a given cursor position, in user-selected sort
  order, with the same filters as the current search" — NOT "ES
  search_after with PIT and sort_override."
- **Cite the need's evidence.** The need is grounded in real UI behaviour.
  Cite the call site (we already have these in today's findings doc) and
  one example of the UI feature it enables (e.g. "infinite scroll forward
  paging in the main grid").
- **Use the existing findings doc.** `media-api-gap-01-searchAfter-findings-4.md`
  is your primary input. It already has the call-site matrix. Don't redo
  that work. Build on it.

## Push-back clause

If at any point you conclude:
- The DAL-boundary scope is wrong (e.g. a major kupua need bypasses the DAL
  entirely — direct fetch calls outside `es-adapter.ts`), OR
- Some methods are so thin/redundant that "abstract need" is meaningless
  for them (e.g. they're just internal optimisations of other methods)

Write **Section 0: Scope Adjustments** explaining what you found and
stop or replan. Do not force every method into the template if a method
genuinely doesn't fit.

Specifically push back if you find that kupua makes direct fetches to ES
or other backends outside the DAL — that would invalidate the premise that
the 20-method interface captures everything. Grep for `fetch(` in
`kupua/src/` outside `dal/` to verify.

## Scope: in and out

### IN scope
- `kupua/src/dal/types.ts` — the interface definition
- `kupua/src/dal/es-adapter.ts` — only the signatures and **observable
  result shapes** of each method, NOT the ES query construction logic
- `kupua/src/dal/null-zone.ts` — the cursor-shape semantics (because
  null-zone is a real product behaviour, not an ES detail)
- `kupua/exploration/docs/03 Ce n'est pas une pipe dream/media-api-gap-01-searchAfter-findings-4.md`
  — call-site matrix (input)
- `kupua/exploration/docs/03 Ce n'est pas une pipe dream/media-api-gap-closure-feasibility.md`
  — original gap analysis (input, for context only)

### OUT of scope
- `kupua/src/stores/`, `kupua/src/components/`, `kupua/src/hooks/` —
  except to verify a UI feature exists when describing a need (one-line
  citations only, no deep reading)
- `kupua/src/dal/grid-api-adapter.ts` if it exists (we're describing
  needs, not the future implementation)
- Performance characteristics of the current implementation
- Comparison to media-api — Phase 3 does that
- Tests
- Any "this could be refactored" observation

## Deliverable shape

Write to: `kupua/exploration/docs/03 Ce n'est pas une pipe dream/phase-2-kupua-dal-needs-findings.md`

### Section structure (mandatory)

**Section 0 — Scope adjustments (only if needed; otherwise omit)**

**Section 1 — DAL boundary verification**
One paragraph confirming the DAL is the complete boundary. Include the
grep result for `fetch(` outside `kupua/src/dal/`. If anything material
is found outside the DAL, document it here and either fold it into the
audit or declare it as a known scope gap.

**Section 2 — Method-by-method need catalogue**

One subsection per `ImageDataSource` method (20 of them). Fixed template:

```
### `methodName` — one-line summary of the need

**Method signature:** Copy from `types.ts` verbatim.

**Abstract need:** 2–4 sentences. What product capability does this serve,
in implementation-agnostic terms? Avoid "ES", "PIT", "search_after", etc.
unless the cursor-shape itself is part of the abstract contract (rare).

**UI features enabled:** Bullet list. Cite one call site per feature
(file:line, no deep reading required — surface citation only).

**Input vocabulary:** What conceptual inputs does this take? Decompose
structured params (e.g. `SearchParams` → "active filters, sort order,
query text, optional AI text, primary date field"). Mark inputs that are
ES-shape-specific (e.g. `pitId`, raw `extraFilter` objects) — these are
candidates for refactoring out before Phase 3.

**Output vocabulary:** What does the UI actually consume from the result?
Not "the full ES response" — the actual fields the caller reads. Cite
one call site that demonstrates which fields are read.

**Cursor / pagination semantics (if applicable):** If the method paginates,
describe the *behavioural* contract: "the next page starts strictly after
the cursor's logical position, in the requested direction, skipping no
items and duplicating no items." NOT the ES mechanism.

**Optional?** Is the method marked `?` in the interface? If so, what
graceful-absence behaviour exists? Cite the absence-handling code.

**Implementation accidents to flag:** Anything in the current
implementation that looks like an ES-shape leak into the interface
(e.g. raw `sortOverride` objects, raw `extraFilter` ES DSL). These
are NOT the need — they are accidents Phase 3 must consider eliminating.
One line each.
```

**Section 3 — Cross-cutting needs**

Some needs cut across methods. List them as numbered items:

1. **Null-zone semantics** — what is the product behaviour, decoupled
   from ES `must_not: exists` mechanics?
2. **Tickers / saved-filter counts** — what is the user-visible feature?
3. **Sort orders** — enumerate the sort options the UI exposes.
4. **Filter vocabulary** — CQL? Free text? Structured? What does the
   user actually compose?
5. **AI/semantic search** — what is the user-facing feature (single
   text query? hybrid blend? image-to-image?)?
6. **Position-in-grid awareness** — `fetchPositionIndex`,
   `estimateSortValue`, etc. — what UI feature do these collectively
   enable?

Add others you discover. Cite each.

**Section 4 — Inputs/outputs that look ES-shaped (red flags)**

Single consolidated list of every place the DAL interface accepts or
returns something that is recognisably ES-DSL-shaped rather than
domain-shaped. These are candidates for client-side refactoring before
Phase 3 — eliminating them shrinks the gap surface.

Examples to look for: raw `sortOverride` JSON, raw `extraFilter` ES
queries, `pitId` strings, ES-style aggregation result shapes leaking
into return types.

**Section 5 — Methods that may be redundant or fusible**

If two methods serve essentially the same need with different shapes
(e.g. `count` and `countWithTickers`), note it here as a single bullet.
Phase 3 may decide that one media-api endpoint covers both. Do NOT
propose the refactor — just note the overlap with citations.

**Section 6 — Coverage gaps**

Anything you couldn't determine within session budget. Be explicit.

**Section 7 — Anti-goals appendix (capped, ≤30 items, one line each)**

Refactor opportunities, code-quality issues, suspected bugs. Strict cap.
Phase 3 will ignore this section.

## Volume expectations (falsifiability)

- 20 method subsections in Section 2 (one per interface method)
- Each method subsection: 15–40 lines
- Section 3: 5–10 cross-cutting needs
- Section 4: 5–20 ES-shape leaks (if zero, recheck — `sortOverride` and
  `extraFilter` already exist; if 50+, you've drifted into impl detail)
- Total document length: 500–1500 lines

If your output is wildly outside these bounds, that is a signal to stop
and write Section 0.

## What "done" looks like

Before declaring complete, self-check:
- [ ] All 20 `ImageDataSource` methods covered in Section 2
- [ ] DAL boundary verified in Section 1 with `fetch(` grep result
- [ ] No method description contains "ES", "search_after", "PIT",
      "elastic", or "_search" outside the "Implementation accidents" line
- [ ] Every "UI features enabled" bullet has a file:line citation
- [ ] No new redesign proposals, no "we should change X" outside Section 7
- [ ] You did NOT re-audit call sites (use today's findings doc)
- [ ] You did NOT read components/hooks/stores deeply — only surface citations
- [ ] You did NOT write any code

## How to keep yourself from drifting (operational rules)

1. **Start by reading `types.ts` and the existing findings-4 doc end-to-end.**
   That gives you the full method list and the call-site matrix. Do not
   start reading `es-adapter.ts` first — you'll get sucked into
   implementation detail.
2. **Write Section 2 method-by-method in order.** When you finish one,
   move on. Resist the urge to "first understand the whole system."
3. **For each method, set a hard read budget:** types.ts signature +
   ~50 lines of es-adapter.ts for the result shape + call-site citations
   from the existing findings doc. If you need more, you're drifting into
   implementation.
4. **If a method takes more than 5 minutes of thinking, write what you
   have and add a Section 6 entry.** Don't perfect-engineer one method
   at the cost of the other 19.
5. **Re-read the "OUT of scope" list every time you find yourself opening
   a component file.** That's the drift signal.

## Out-of-band notes

- The existing findings-4 doc IS the primary input. Reference it
  liberally — don't reproduce its content, link to it.
- Model recommendation: Sonnet High. This requires good abstraction
  judgement (separating need from implementation), not just summarisation.
- Read-only. No code changes. No commits.

## Why this CAN be delivered as a finite list

Because the `ImageDataSource` interface IS a finite list — 20 methods
defined in one file. The interface was designed (whether intentionally or
not) to be the abstraction boundary. Phase 2 is essentially reverse-engineering
the abstract contract from the concrete implementation, which is a
well-defined activity bounded by the interface itself.

The output is genuinely actionable for Phase 3: for each of the 20 rows,
Phase 3 asks "can media-api's current capabilities (Phase 1 output) satisfy
this need, possibly with client-side adaptation?" Three buckets fall out:
- Already satisfied
- Satisfied with client refactor (eliminate the ES-shape leak)
- Genuinely new endpoint required

Only the third bucket becomes work.
