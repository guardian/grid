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

Bug-hunt Batch B from `bug-hunt-audit-findings.md`. Bug #9 done.
Next: #16, #8, #12, #14, or #18 (user to direct).

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
