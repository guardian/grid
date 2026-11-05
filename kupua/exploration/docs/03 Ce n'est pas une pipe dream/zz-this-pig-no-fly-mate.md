# This Pig No Fly, Mate

> **Filed under:** Ce n'est pas une pipe dream.
> **Question asked:** "How crazy would it be to turn (some? all?) of this custom
> logic into reusable libraries we could use in multiple projects?"
> **Short answer:** Crazy enough. Read on.

## The honest answer: somewhere between "harder than it looks" and "the wrong unit of reuse"

The instinct is right — the *principles* (Never Lost, density continuum, phantom
focus, click-means-search, action-bar-written-once) absolutely generalise to
"searchbox + list + viewer" apps. That's most internal tooling. But the kupua
*code* is bonded to a specific stack of assumptions, and the bond is tighter
than it appears.

## What's actually in the box, in layers

**L1 — Pure algorithms (genuinely portable, low payoff each).**
`computeScrollTarget`, the neighbour-search fallback, percentile-to-cursor
estimation, position-map binary search, the `isTwoTierFromTotal` decision, EMA
velocity smoothing. ~500 lines total. Trivially extractable, no React, no DOM,
no ES. Each one is small enough that copy-paste-with-attribution is probably
better than a package.

**L2 — The stateful engine (extractable in theory, tied to a backend shape in practice).**
Buffer + cursors + PIT + generations + cooldowns + abort controllers — the
search-store machinery. This is the crown jewel and the trap. It assumes a
backend that gives you:

- Stable point-in-time snapshots (`pitId`)
- `search_after` cursor pagination (not offset)
- A cheap `countBefore` query
- Percentile / composite aggregations for deep seek estimation
- A way to build a sort-keyed position map for medium tiers

Elasticsearch happens to give you all five. Postgres gives you two (cursor +
count, and count is expensive at depth). A REST API behind someone else's
service gives you zero. **The three-tier model only exists because ES has
these exact primitives.** Take them away and you're back to "scroll mode
forever, hope the result set is small."

**L3 — React glue (hardest; many subtle assumptions).**
`useDataWindow`, `useScrollEffects`, the prepend-compensation choreography, the
bidirectional-seek coordination. The audit's coupling map shows ~15
module-level singletons across these files. Module-level state means **one
instance per page** — fine for kupua, hostile to a library. Two
`<ResultBrowser>` instances on one page would share `_seekCooldownUntil`,
`_velocityEma`, `_viewportAnchorId`. Refactoring those into per-instance scope
is doable but invasive, and the singletons exist for real reasons (surviving
component swap during density change).

Also tightly coupled to TanStack Virtual's specific quirks. Swap to a different
virtualizer and the swimming-fix work has to be redone.

**L4 — Components (domain-bound; least reusable).**
`ImageGrid`, `ImageTable`, `Scrubber`, the chip search bar. Image-shaped. Other
apps would replace these wholesale.

## The realistic library shape, if you did it

Three packages, not one:

| Package | Contents | Realistic adopters |
|---|---|---|
| `@gnm/never-lost-core` | L1 algorithms + types for cursor/buffer/anchor. No React, no backend assumptions. | Anyone, in any framework. |
| `@gnm/cursor-buffer` | L2 engine, with a backend-adapter interface (`fetchAfter`, `fetchBefore`, `countBefore`, `seekEstimate`, `openSnapshot`). React-agnostic state machine (XState or Zustand). | Anyone whose backend can implement the adapter. Realistically: ES users, maybe a Postgres-with-effort user. |
| `@gnm/result-browser-react` | L3+L4 with TanStack Virtual, density switching, scrubber, chip search. Headless-ish primitives + opinionated defaults. | React apps willing to adopt the whole UX. |

## Why this is probably a bad use of time right now

Pushing back, hard:

1. **One user is not a library.** Kupua isn't even shipped. You don't know
   which abstractions survive contact with the second user. Extracting now
   bakes in kupua's specific decisions (the 65k threshold, the 1k threshold,
   the hover-pencil edit pattern, the scrubber-as-density-control) as if they
   were universal. They aren't — they're load-bearing for *Guardian image
   search at Guardian scale against Guardian's ES*.

2. **The audit shows the engine is barely understood by its authors.** ~15
   module singletons, 8 generation counters, 5 cooldown sites all reusing one
   timestamp, an invariant ledger where item #4 ("no extends fire against
   wrong virtualizer count after mode flip") has no live transition test.
   That's a codebase still settling. Libraries should crystallise *after* the
   design is stable, not during. Extract now and every kupua bug-fix becomes
   a library breaking change.

3. **The maintenance multiplier is brutal.** Today: edit one repo, run one
   test suite, ship. Library form: edit core, bump version in two consumers,
   deal with the consumer who's pinned to v1.3 because v1.4 changed the
   cooldown semantics. The Guardian doesn't have the staffing model for
   OSS-style library maintenance on internal infra.

4. **The reusable thing is the *thinking*, not the code.** The philosophy
   doc, focus doc, and scroll architecture doc are 90% of the value. A team
   building "searchbox + list + viewer" app #2 benefits enormously from
   reading them and then implementing against their own stack and
   constraints. They benefit much less from inheriting kupua's specific
   singletons and being told "don't touch the cooldown, it's load-bearing."

## What I'd actually do instead

- **Promote the docs, not the code.** `01-frontend-philosophy.md`, the focus
  model, the three-tier write-up — these are publishable as an internal
  "patterns for searchbox-list-viewer apps" doc. That's the genuine reusable
  artefact.
- **Wait for the second user.** When app #2 wants Never-Lost behaviour, *then*
  extract — and let app #2's needs shape the abstraction. You'll discover
  what's accidental vs essential.
- **If you must extract something now, extract L1 only.** The pure algorithms
  are stable, testable, and tiny. They're also the layer with the lowest
  individual payoff, which tells you something about where the value
  actually lives (in the integration, not the parts).
- **Stop calling backend-agnosticism free.** A library that "works with any
  backend" via an adapter usually means "works with ES well, works with
  everything else badly." Be honest about that in the README or don't ship it.

## The one genuinely interesting library idea

Not the scroll engine. The **action-bar pattern** —
`<ActionBar images={targetImages} context={context}/>` where actions accept
arrays and adapt their UI/confirmation/enablement. That's framework-agnostic
in spirit, has obvious value to every CRUD app at the Guardian, and doesn't
require ES or virtual scrolling or any of the heavy machinery. Small, sharp,
broadly applicable. Start there if you start anywhere.
