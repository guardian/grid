# Inventory handoff B — kahuna source pass

**Status:** transient. Delete after work lands.
**Mode:** research. Sonnet High.
**Session goal:** find EVERYTHING kahuna does that isn't already in inventory A. Primary source: kahuna's own code. Goal is coverage; if we miss a Grid feature here, kupua will never know it should replicate it.

## Why

The user gave a concrete example: kahuna sends `&syndicationStatus=blocked` (and other values) as a search-URL parameter. Kupua doesn't handle it. This kind of thing is invisible from API contracts and ES schemas — it only shows up by reading kahuna's actual code. There are almost certainly more such features. We need them all named.

## Inputs

1. **Already-produced inventory A** at `kupua/exploration/docs/inventory-A-from-docs.md`. **Read this first.** Your job is to add to it, not duplicate it.
2. Kahuna source code. Read these in order:
   - `kahuna/app/routes/` — every route file. List every URL parameter accepted, every action exposed.
   - `kahuna/app/scripts/services/` — service layer. Every API call site, every parameter passed.
   - `kahuna/app/scripts/components/` — UI components. Every button, every filter, every keyboard shortcut, every column displayed.
   - `kahuna/app/scripts/directives/` and `kahuna/app/scripts/util/` — utility code. Often hides feature flags and special-case handling.
   - `kahuna/test/` — tests sometimes reveal features the code obscures.

## Output

ONE markdown file: `kupua/exploration/docs/inventory-B-from-kahuna.md`.

Same table format as inventory A (Capability, Source(s), Lives in, Kupua status, TS-feasibility, Server-only reason, Citation). **But ONLY rows that aren't already in inventory A, OR rows that contradict / extend inventory A's claims.**

For rows that extend A: cite both A's row and your kahuna evidence.

Column rules from inventory A apply unchanged. Same anti-rules: no editorial value, no recommendations, no hallucination.

## Specifically look for

- **Search URL parameters kahuna sends but kupua doesn't read.** The `syndicationStatus` example is one; there are more. Grep for `searchParams`, `URLSearchParams`, every place kahuna constructs a search URL or a filter.
- **Filter chips / facet filters** in the UI — every option in every dropdown.
- **Keyboard shortcuts** — kahuna has them; kupua may not have all.
- **Drag-and-drop interactions, multi-select operations, batch actions.**
- **Visual affordances kupua might have missed**: colour codes on borders, icons in corners, tooltips, hover states that reveal hidden info, image badges other than cost.
- **Read endpoints kahuna calls that aren't enrichment**: usage suggestions, autocomplete, image-counter, undelete, restore, image-history, audit log.
- **Write endpoints kahuna exposes** — name them, but flag as `N/A-write-only` (we'll handle writes separately).
- **Sort modes** — every `orderBy` value kahuna can request.
- **Special-case URL routes** — `/` vs `/search` vs `/images/:id` vs `/edits` vs `/usage` etc.
- **Environment-specific or feature-flag-gated capabilities.**

## Done criteria

- Every route file in `kahuna/app/routes/` read.
- Every search URL parameter kahuna sends is named.
- Every UI filter / dropdown / chip is named.
- Every API endpoint kahuna calls that isn't already in inventory A is named.
- 30+ new rows. Less = under-coverage.
- Out-of-scope appendix capped at 20 items.
- No commits, no recommendations.

## Push-back clauses

- If inventory A turns out to already cover kahuna source comprehensively (it shouldn't — A only mines docs, not code): write Section 0 saying so, stop.
- If you find something that contradicts the inventory A claim about where a capability lives (e.g. A says "API-only" but kahuna fetches it from ES): log the contradiction in the appendix with both citations.
