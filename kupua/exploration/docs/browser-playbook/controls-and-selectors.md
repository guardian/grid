# Browser Controls and Selectors

[Entry point and mandatory rules](../embedded-browser-playbook.md).
Read the sections for the controls being exercised, not this entire reference.

## Tools and Execution Realms

- Use accessibility snapshots to discover controls and current accessible names.
  Use screenshots for visual/layout questions, not state available from a small
  DOM/store read. Names such as Show/Hide change with control state.
- Prefer dedicated browser tools. Use `run_playwright_code` when those cannot
  perform the required interaction/observation. Large grid/table swaps can produce
  huge snapshot diffs; narrowly scripted checks should return facts, not the DOM.
- Snippets are plain JavaScript, including `page.evaluate` callbacks. No TypeScript
  casts, typed generics or annotations.
- The outer runner and page are different realms. Access `document`, `window`,
  `URL`, `TextEncoder` and browser timers inside `page.evaluate`; they may be absent
  in the outer runner/native callbacks. Pass arguments explicitly across evaluate:
  callbacks do not capture outer variables.
- Node-side variables/globals are not durable across bridge calls. Use page memory
  with an explicit marker and cleanup handle for a retained bounded job.
- Do not execute an imported helper's `.toString()` in a different realm: Vite can
  inject module-local dependencies. Adapt the helper or deliberately use its served
  `?raw` source. A missing driver is setup failure, not app failure.

```js
return page.evaluate(() => ({
  visible: document.visibilityState === "visible",
  hasStore: Boolean(window.__kupua_store__?.getState),
}));
```

## Locator Reference

Check current DOM/source when a selector stops resolving. Prefer accessible roles
and stable attributes over Tailwind classes; do not assume `data-testid` coverage.

| Target | Locator |
|---|---|
| Search toolbar | `getByRole('toolbar', { name: 'Search and filter controls' })` |
| Grid scroll viewport | `getByRole('region', { name: 'Image results grid' })` |
| Table | `getByRole('grid', { name: 'Image search results' })` |
| Table rows/cells | `getByRole('row')`, `getByRole('gridcell')` within table |
| Grid cells | `[data-grid-cell]` |
| Result identity | `[data-image-id]`; keep its value in page memory |
| Scrubber | `getByRole('slider', { name: 'Result set position' })` |
| Scrubber track/thumb | `[data-testid="scrubber-track"]`, `[data-scrubber-thumb]` |
| Select/deselect | `[aria-label="Select image"]`, `[aria-label="Deselect image"]` |
| Toast | `getByRole('alert')` |
| Status | `getByRole('status')`; filter to relevant visible content |
| CQL editable | `.ProseMirror.Cql__ContentEditable` |
| CQL popup/options | `.Cql__TypeaheadPopover`, `.Cql__Option` |

Use `getByRole`'s `{ exact: true }` option, not `[exact=true]` in a role selector.
Do not parse page-wide "N of M" text: hidden/stale elements can match. Locate the
visible leaf counter or read the app's coordinate state.

## CQL Input and Suggestions

The `cql-input` host is a shadow-DOM custom element, not a native input. Filling
the host fails. Playwright CSS locators pierce its open shadow root; ordinary
`document.querySelector` and document MutationObservers do not. Explicitly traverse
`element.shadowRoot` for in-page observation.

- For query setup only, use the existing router/URL with canonical query syntax.
  This is not a typing/typeahead test.
- To exercise the editor, click its contenteditable and use real keyboard input.
  Locator `fill()` on the **inner contenteditable** can set text when character-
  by-character behaviour is not the subject.
- Commit each `field:value` chip with Enter before typing the next term. A space
  can keep the caret inside the existing chip value.
- Prefer Clear search. On macOS, select-all is `Meta+a`, not `Control+a`. Within
  chip editing it can select only that value; position the caret outside the chip
  for whole-query clearing. Chip deletion uses `.Cql__ChipWrapperDeleteHandle`.
- For known suggestions, type a short distinguishing prefix, then ArrowDown/Enter
  or click an actionable `.Cql__Option`. Typing the full value can race updates.
  Options need not have `role=option`; exclude `.Cql__Typeahead--pending`.
- Arm observers before typing when measuring popup appearance. Starting after
  `keyboard.type()` can miss its whole lifetime.
- Compare final editor, canonical URL and effective store query. Supplied text
  is not proof of executed scope; normalization/debounce can cause intervening
  reads. Wait for the intended query and generation.
- Suggestions depend on query scope, field mappings/configured aliases and bounded
  aggregation buckets. No suggestions does not prove absence of a value. Use a
  positive control and inspect current resolver/mapping ownership.
- Check the current parser/config before assuming supported syntax or organisation-
  specific `is:` values. Historical totals/feature lists are not current contracts.

### Metadata and Facet Clicks

Details and Filters have different policies. Use this interaction map for ordinary
operation; check current handlers and executed query if investigating a discrepancy.

| Gesture | Details metadata | Filters/facets |
|---|---|---|
| Plain click | Replace query with the field/value | Add positive term or remove the same positive term |
| Shift-click | Append the field/value | Same as plain click; Shift is not a separate mode |
| Alt-click | Append negated field/value | Add negated term, flip an existing positive term, or remove the same negated term |

Compare canonical query before/after the real click. One panel's gesture does not
establish the other's behaviour; retained selection/focus is a separate check.

## Results and Selection

Measure visible hit targets, not full row centres. A wide table row's centre can
be off-screen. Intersect its thumbnail/cell with the viewport and hit-test using
`elementFromPoint(...).closest('[data-image-id]')`. Placeholder cells may have no
`img`; target the visible thumbnail area instead of requiring media.

Tickboxes may be hidden until hover. Hover the visible parent area, then click the
visible tickbox. For partly visible rows, use its measured visible centre to avoid
Playwright scrolling the entire cell into view. Measure before selection as well
as after panel changes so driver-induced scroll is not blamed on layout. Use real
keyboard down/up for Shift ranges and release modifiers in `finally`. Forced clicks
or store membership changes are synthetic controls, not gesture proof.

Check effective focus mode before click/keyboard tests. Single/double click and
focused navigation differ between Click-to-Focus and Click-to-Open. Coarse pointers
can override stored explicit preference; do not manufacture an explicit touch
matrix by changing storage. Tickbox selection need not clear older focus. Inspect
focus, selection and the selection anchor independently.

### Keyboard and Touch

Use the current keyboard guide/helper for semantics. No-focus scrolling differs
from focused-image movement; table Left/Right may be horizontal while grid has
different applicability. Ensure the right element owns focus and no editor/menu
consumes the key. Home/End and other list keys can have different event phases.

Keep immediate preconditions, trusted input and outcome collection in one tool call
when interleaving matters. Chat typing can reach the integrated browser; discard
contaminated samples. An owned capture listener can record `isTrusted` and focus/
selection equality without returning identities; remove it in `finally`.

Chromium CDP touch emulation and a phone viewport can exercise mounted touch handlers.
Verify coarse-pointer detection/effective mode after reload; emulation is not
physical-device proof. Use native CDP touch for touch evidence; restore emulation/
viewport afterward. If a click times out after applying, inspect before retrying.
Off-screen scroll-into-view can displace outer overflow containers: inspect ancestor
scroll offsets before alleging app reflow.

### Scrubber and Scroll

Inspect [shared helpers](../../../e2e/shared/helpers.ts) for tier-aware track clicks,
drags, seeks and waits. Store `seek()` is not a scrubber gesture: buffer/indexed
controls scroll the viewport, whereas seek-tier release invokes seek.

- A track click inside the current thumb may only flash its tooltip. Hit-test or
  choose a point outside the thumb; use real pointer dragging to test dragging.
- Indexed scrollTop can change before debounced refill starts. Await action-specific
  generation/publication, not immediate `loading=false`.
- Measure rendered thumb geometry as well as CSS/ARIA state: a transition can leave
  the visible thumb moving after logical state changes.
- Vertical scrollTop writes work on the real viewport but are synthetic input.
  Wait for relevant anchor/refill/geometry conditions, not a historical fixed delay.
- Crossing a semantic boundary within resident data may require no read. No new
  request does not establish an ignored gesture or newer command.

## Detail and Fullscreen

Retain stable target identity in memory before opening detail; ordinal locators can
point to different images after virtualization. During traversal, observe the detail
URL/component identity rather than assuming search-store focus updates per arrow.
Verify target visibility/geometry separately on return.

To reach a buffer boundary, compare offset after each real traversal commit and stop
on the first change, not an arbitrary arrow count. At a table tail, sticky-header
geometry can leave the last row out of view; open a visible loaded row and traverse
to the tail instead of clicking off-screen.

Use real app fullscreen controls; check `document.fullscreenElement` separately
from preview state. Native fullscreen can stall integrated-tool sequencing. Discard
unfinished cases, check installed instrumentation and recover/close the owned tab;
repeated competing exit mechanisms do not make tooling failure product evidence.

For rejected-exit fixtures, retain/restore the native method with its receiver and
verify native exit in cleanup. Promise rejection is fault injection, not a naturally
occurring failure. Toast selector checks can use the DEV toast store as a local
fixture, not real failure-path proof; check existence before dismissing auto-expiring
notifications.