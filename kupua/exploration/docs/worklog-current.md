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

Click-to-search fix: `_externalQuery` latch in orchestration/search.ts was never cleared after programmatic query changes (metadata click, table cell Shift/Alt-click), permanently blocking CQL input debounce. Fixed in useUrlSearchSync.ts; two E2E tests added.

## Session Log

- 2026-04-23 — Fresh agent. Traced metadata click → cancelSearchDebounce → _externalQuery latch. Found it was never cleared due to CqlSearchInput generation-bump remount preventing the matching debounce callback from firing.
- Confirmed systemic: all 4 click-to-search paths affected (metadata plain/Shift/Alt, table Shift/Alt).
- Fix: `setExternalQuery(null)` in useUrlSearchSync after search() fires. 1 line, 352 unit tests pass.
- Added 2 E2E tests (Click-to-search describe block in ui-features.spec.ts). Verified test fails without fix. 21/21 pass with fix (prev table test skipped → rewrote to Shift+click "By" column cell).
- Committed as "Click-to-search fix".
