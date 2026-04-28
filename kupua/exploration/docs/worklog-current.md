<!-- AGENT PROTOCOL
STOP! If you do NOT see your own "🤖 Agent check-in" entry at the bottom of the
Session Log that YOU wrote in THIS conversation, you are a NEW agent.
Follow the Fresh Agent Protocol in copilot-instructions.md:
  1. Say "Hi, I'm a fresh agent."
  2. Read this file fully.
  3. State what context you have.
  4. Ask: "What should I read before starting?"
  5. Do NOT write or modify any code until the user confirms.
If you DO see your own check-in in your conversation history, carry on.
-->

# Current Task

Bug-hunt Batch B from `bug-hunt-audit-findings.md`. Bugs #9, #8, and #16 done.
Next: #12, #14, or #18 (user to direct).

## Session Log

### 28 April 2026 — Bug #9 fixed

- Read `extendBackward` in `search-store.ts:2215-2240` and `scroll-geometry-ref.ts`.
- Confirmed bug: `excess = result.hits.length % columns` equals `result.hits.length`
  when `result.hits.length < columns` → `slice(excess) = []` → early return →
  `startCursor` not advanced → infinite discard loop on subsequent extends.
- Fix: `if (result.hits.length > excess)` guard before the trim body in `extendBackward`.
- Test: `seek(102)` with columns=1 → `bufferOffset=2`, switch to columns=3, call
  `extendBackward()`, assert `bufferOffset=0` and buffer grew by 2.
- Failed before fix. 404/404 after. Changelog + audit findings updated.

### 28 April 2026 — Bug #8 fixed

- Read `useReturnFromDetail.ts` end-to-end, `ImageDetail.tsx` mount path, and
  `position-preservation-reference.md`.
- Confirmed bug: guard `if (previousFocus === null) return` at line ~73 fires for every
  phantom-mode close because `focusedImageId` is always null in phantom mode.
  `setFocusedImageId(wasViewing)` and phantom pulse are never reached.
- Position-preservation-reference site #3 note already marked this guard "No longer
  needed" but it was never removed.
- Fix: `useReturnFromDetail.ts` — add `&& getEffectiveFocusMode() !== "phantom"` to
  the guard. Explicit-mode resetToHome protection unchanged.
- New test file `src/hooks/useReturnFromDetail.test.ts` (5 tests, jsdom). Two phantom
  tests failed before fix, all 5 pass after. Full suite 409/409 green.

### 28 April 2026 — Bug #16 fixed

- Read `restoreAroundCursor` in `search-store.ts:~3450-3580`,
  `ImageDetail.tsx:130-220`, and `useReturnFromDetail.ts`.
- Confirmed bug: `restoreAroundCursor` never sets `focusedImageId`. On detail close,
  `useReturnFromDetail`'s guard `previousFocus === null` fires → `setFocusedImageId`
  never called → no scroll centring. Affects explicit mode only; phantom mode already
  worked after bug #8 fix (different guard path).
- Decision: only explicit mode should set `focusedImageId`. Phantom mode's invariant
  is that `focusedImageId` is always null — setting it would break the phantom UX.
  `search-store.ts` cannot call `getEffectiveFocusMode()` without a circular dep
  (`ui-prefs-store.ts` already imports `search-store.ts`), so the caller decides.
- Fix: added `setFocus?: boolean` param to `restoreAroundCursor` type + impl.
  On success, spreads `{ focusedImageId: imageId, _focusedImageKnownOffset: exactOffset }`
  only when `setFocus === true`. `ImageDetail.tsx` passes
  `getEffectiveFocusMode() !== 'phantom'` (static import, already had `useUiPrefsStore`).
- 2 new tests in existing `restoreAroundCursor` describe block. First failed before fix,
  second passed before fix (confirming phantom invariant). 411/411 green after.

### 28 April 2026 — Bug #14 fixed

- Read `extractSortValues` in `image-offset-cache.ts`, `extendForward` eviction path
  (`search-store.ts:~2114-2118`), and `extendBackward` eviction path (`~2274-2279`).
- Confirmed bug: both paths do `extractSortValues(...) ?? null` and assign the result
  to `newStartCursor` / `newEndCursor`. If extraction returns null (e.g. empty sort
  clause key), the cursor is overwritten with null. Next call to the opposite-direction
  extend is permanently blocked by `if (!startCursor) return` / `if (!endCursor) return`.
- Trigger note: the audit says "sort field path undefined on the boundary image" but
  `extractSortValues` only returns null when `parseSortField` finds an empty clause key.
  Missing field VALUES push null into the array and return a valid SortValues. Fix is
  still correct and necessary for defensive correctness.
- Fix: symmetric on both paths — `newStartCursor = evictedStart ?? state.startCursor`
  and `newEndCursor = evictedEnd ?? state.endCursor`. Preserve last good cursor.
- Test: new file `search-store-eviction-cursor.test.ts` with `vi.mock` on
  `@/lib/image-offset-cache` to inject null returns. Both tests failed before fix, both
  pass after. Updated existing misleading comment in `search-store-extended.test.ts`.
- 414/414 green after fix.
