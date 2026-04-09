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

# Worklog — Current Task

Secondary sort in toolbar dropdown + SVG arrows in table headers. Unify sort UX across table and toolbar.

## Session Log

- 🤖 Agent check-in. Continuing from previous turn in same session.
- Replaced Unicode ↑/↓ in table column headers with Material Icons SVGs (w-3 h-3, 12px). Secondary double-arrows: two SVGs with -mr-0.5 (~1px gap).
- Reworked SearchFilters.tsx SortControls: parses secondary sort, shows arrows in dropdown, supports shift+click (same logic as table handleSort).
- Updated ui-features.spec.ts: sort indicator assertions now check for svg elements instead of text arrows.
- User feedback: primary arrows too large (w-3.5→w-3), secondary arrows need more spacing (-mr-1.5→-mr-0.5). Applied to both table and dropdown.
- All 203 unit tests pass. Visual baselines regenerated (4/4 pass).
- Changelog entry added.
