# `lib/orchestration/` — Imperative Coordination Functions

This directory holds imperative functions that coordinate behaviour across
multiple components or hooks. They are **not** React hooks — they're plain
functions that access module-level state and are called from event handlers,
effects, or other imperative code.

## Pattern

One file per workflow domain:

- **`search.ts`** — Search debounce cancellation, scroll-reset orchestration,
  URL sync reset. Called by SearchBar, ImageTable, ImageMetadata, ImageDetail,
  useScrollEffects, useUrlSearchSync.

## Future files (not yet created)

- `edit.ts` — Metadata editing coordination (Phase 3+)
- `upload.ts` — Upload workflow coordination (Phase 3+)
- `collection.ts` — Collection management coordination (Phase 3+)
- `crop.ts` — Crop workflow coordination (Phase 3+)

## Rule

Components import from `lib/orchestration/`, never from other components
for imperative functions. The dependency direction is strictly downward:

```
components → hooks → lib → dal
```

