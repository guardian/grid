# Kupua — Extracted Principles

## Guiding Philosophy

- **One ordered list, many densities.** Every view (table, grid, single-image, zoom) is a different density of the same list — not separate pages. Transitions feel like zooming, not navigating.
- **Context is sacred ("Never Lost").** Focus, selection, edit state, and scroll position must survive every density change and view transition. The user should never feel lost.
- **Click means search; edit is deliberate.** Clicking a metadata value is a search action by default. Editing requires an explicit mode switch (hover-pencil, button). The two must never conflict.
- **Selection ≠ focus.** Focus is single/ephemeral (keyboard nav); selection is multi/persistent (batch ops). They are orthogonal — changing one never clears the other.
- **Discovery complements search.** Search answers "show me X"; discovery (facets, histograms, clustering) answers "what's here?" Both are entry points into the same result set.
- **Not "kahuna in React."** A rethinking of how editors interact with a 9M-image library, informed by Lightroom, Google Photos, Finder, and spreadsheets — constrained by Guardian editorial needs.

---

## Architectural Principles

- **Three-layer separation.** (1) View components (React/TanStack/Tailwind), (2) Application logic (hooks/stores/services — pure TS, no view-library coupling), (3) Data access (DAL interface + adapters). Each layer is independently replaceable.
- **Extension surface.** Kupua exposes stable, documented APIs for third-party panels, actions, and fields — without forking. Internal store shape is not a public contract; public selectors via `extensions/hooks.ts` are. Panels and actions are registered via a registry with declared position, visibility conditions, and state dependencies.
- **URL is the source of truth.** Every search, filter, sort, viewed image, and view mode is bookmarkable and shareable. Browser back/forward always works.
- **Dual-path data access.** Direct ES for reads (fast, flexible, supports custom aggregations); Grid API for writes (metadata editing, crops, leases). The ES read path stays; writes go through a `GridApiDataSource` adapter.
- **Actions written once.** Each action (crop, delete, download, etc.) is a single context-adaptive component receiving an `images[]` array. No duplication across views. The action bar is orthogonal to view density.
- **Performance is the core value proposition.** 60fps virtualised scroll, sub-frame buffer management, no new render cycles from store splits, no new network round-trips from refactoring. Any change likely to hurt performance requires explicit approval.
- **Shared metadata panel.** One panel component adapts to context (single image, multi-select, batch-edit). Mounted independently of view components — never destroyed by density changes.
- **State replacement, not route transition.** Image prev/next replaces the URL param (no push). The search page stays mounted; overlay uses `opacity-0` not unmount. No controller teardown/rebuild.

---

## Non-Negotiable Rules

### Feature parity (must ship)
- **Multi-select with batch metadata editing** — core editorial workflow
- **Click-to-search from metadata values** — core discovery workflow
- **Edit mode for metadata** — at least kahuna's hover-pencil capability
- **Collections** — browse, add, remove; tree structure
- **Usage rights management** — categorise, set rights, set leases
- **Crops** — view, create, download
- **Keyboard navigation** — arrows, enter, escape, home/end, pgup/pgdn
- **URL reflects state** — every state is bookmarkable
- **Fullscreen** — presentation and detailed inspection

### Safety (never violate)
- **Never write to non-local ES.** No index/delete/bulk/update against real clusters. Safeguards in `es-config.ts` must not be weakened without explicit approval.
- **Never touch files outside `kupua/`.** The agent's scope is kupua only — no exceptions without user permission.
- **Never commit without asking.** Batch changes by problem solved, never push to remote.
- **Never run smoke tests against real ES.** Only the human developer may invoke manual smoke tests against TEST/PROD.
- **Never hardcode real cluster URLs, index names, or credentials** in source code.

### Process (always follow)
- **Push back hard.** Argue against work when complexity/risk/marginal-value doesn't justify it. "No, and here's why" is the most valuable response.
- **Think UX, not just tech.** Raise concerns about usability, consistency, accessibility — don't just implement what's asked.
- **Document deviations.** Any intentional departure from Grid/kahuna or library conventions gets an entry in `deviations.md` with what, why, and trade-off.
- **Performance-gate changes.** If a change likely impacts performance, explain the risk and suggest mitigations before proceeding.
- **Smoke → local feedback loop.** Every smoke test failure must produce at least one local test improvement that catches the same bug class.


