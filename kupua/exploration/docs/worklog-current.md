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

Bug-hunt Batch B from `bug-hunt-audit-findings.md`. Bugs #9 and #8 done.
Next: #16, #12, #14, or #18 (user to direct).

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
