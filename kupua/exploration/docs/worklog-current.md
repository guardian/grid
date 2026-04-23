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

Wrapping up typeahead value suggestions + aggregation counts session. All aggr
work done, tests passing. Ready to commit.

## Session Log

- Continued from prior session (Bug #2 selfCausedChangeRef already committed in 06c5a0ead)
- Implemented typeahead value suggestions with ES aggregation counts for all fields
  - Store cache sharing via `aggregationsRef` + `getAggregations` getter
  - `mergeWithCounts()` helper merges static/dynamic values with bucket counts
  - `storeBuckets()` reads from store's agg cache first, falls back to single-field ES call
  - `mapBucketKey` param for fileType ("image/jpeg" → "jpeg") count matching
  - CQL's native `TextSuggestionOption.count` renders counts flush-right
  - Shadow DOM style injection for `.Cql__OptionCount` (opacity: 0.7, margin-left: 1.5em)
- `showInKeySuggestions` flag + `hiddenFieldIds` in LazyTypeahead — fields with value resolvers but hidden from key suggestions (e.g. alias fields)
- Updated mapping-enhancements.md: added §0 "The Problem" + 6 amendments
- **Caret position reset on tab switch — REVERTED, UNSOLVED.** See handoff below.
- **Mobile autofocus suppression — REVERTED.** `(pointer: coarse)` guard worked
  but needs to be wired up to Home view too (not just CqlSearchInput). Separate session.

## Handoff: Caret position reset on tab/window switch

**Problem:** When the user places the caret mid-text in the CQL search box, then
switches browser tabs (or Alt+Tabs to another app) and returns, the caret resets
to position 0 (start of text). This is cosmetic — no data loss — but annoying.

**Root cause:** Browsers clear the DOM selection when a tab hides. ProseMirror's
`focusin` handler calls `forceFlush()` → `selectionFromDOM()`, which reads position 0
from the cleared DOM and writes it to PM state. This happens synchronously inside
PM's focusin handler — BEFORE any external event handlers (visibilitychange, focus)
run. The PM instance lives inside CQL's shadow DOM (open).

**Three approaches tried, all failed:**

1. **Check shadowRoot.activeElement on return, restore via PM API.** Failed because
   `shadowRoot.activeElement` is `null` when returning — browser clears it on blur.

2. **Continuous save via `selectionchange` + microtask restore.** Used
   `document.addEventListener("selectionchange", ...)` to continuously save the
   Range while CQL had focus. On return, called `el.focus()` then `Promise.resolve().then()`
   to restore the saved Range. Failed — `selectionchange` may not fire for selections
   inside shadow DOM consistently across browsers, and the microtask timing didn't
   reliably run after PM's focusin handler settled.

3. **Save on exit (visibilitychange:hidden + window.blur), restore on entry
   (visibilitychange:visible + window.focus) with double-rAF.** Saved Range.cloneRange()
   on the way out, restored with `requestAnimationFrame(() => requestAnimationFrame(...))`
   on the way in. Failed — likely the browser clears the selection BEFORE
   `visibilitychange:hidden` fires, so the saved range was already stale/position-0.

**Possible next approaches (not attempted):**

- **Intercept PM's focusin handler.** Could monkey-patch or override PM's view
  `handleDOMEvents.focusin` to skip `selectionFromDOM()` when returning from a
  tab switch. Requires reaching into PM internals inside the shadow DOM — fragile.
- **Use PM's `setSelection` API.** After PM settles, use `view.dispatch(view.state.tr.setSelection(...))` to restore the saved PM position. Requires access to the PM EditorView instance, which CQL doesn't expose.
- **Save PM position (not DOM Range).** Instead of saving a DOM Range (which gets
  invalidated), save the PM document position (integer offset). On return, use PM
  API to restore. Same problem — no access to PM internals from outside CQL.
- **Upstream fix in @guardian/cql.** Add a `preserveCaretOnBlur` option or have CQL
  itself save/restore PM selection across focus loss. This is probably the right fix.

**Decision:** Reverted all caret code. The problem is cosmetic and the fix likely
belongs in @guardian/cql itself. Will tackle separately.
