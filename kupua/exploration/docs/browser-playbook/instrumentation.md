# Browser Instrumentation and Controlled Races

[Entry point and mandatory rules](../embedded-browser-playbook.md).
Name the question, action/request/time bounds and owned cleanup. Controlled
interleavings prove behaviour under the intervention, not natural incidence,
backend cancellation or performance.

## Observers and Painted Transitions

Subscriptions identify store publication; DOM/rAF observations identify visible
consequences. Observe both when needed. Do not force a rerender, hide/show a panel
or mutate unrelated state before checking a suspected missing update: that can erase
the defect. Remount is a subsequent control.

Arm a foreground rAF recorder before real input. Keep identities/text signatures
in page memory; sample visible membership, target geometry, loading/status and
action-specific generations. Collapse identical consecutive signatures; return
counts, durations, signed geometry and before/intermediate/after classifications.
Store churn alone does not prove an intermediate painted frame.

Keep setup, input, bounded observation and teardown in one retained job/tool call
where possible. Model/tool overhead otherwise changes the race or leaves artificial
loading. An in-page job can await its own bounded loop and summarize before returning;
raw frame arrays are costly and may be sensitive. Retain completed aggregate results
for readback if the driver later times out.

Validate console/event collectors against a known operation first; bridge delivery
is not always reliable. Use an owned page-memory buffer where needed. Source-level
temporary instrumentation requires authorisation and removal before completion.

## Response Gates and Cancellation

Gate the smallest owning boundary. A real completed response held before publication
preserves its data but proves client ownership only. A pre-dispatch hold is not
network-in-flight work. Observe called, response-ready, delivered, signal outcome,
processing and paint separately.

- Bound the job by elapsed time; release all work in `finally`. Failsafe release
  invalidates controlled proof and must be reported as failed setup.
- Hold only elected calls. Reserve gates for automatic successors before awaiting
  original methods; release by gate identity, not a mutable current-request slot.
  Retain scope/origin/generation in page memory.
- Preserve actual responses, AbortSignals and producer cancellation. Never release
  impossible success after cancellation. A post-abort-check gate cannot prove
  genuine pending transport behaviour.
- Restore original own-property descriptors; delete overrides of inherited methods.
  Clean up wrappers/subscriptions even on observation failure.
- Check composed publications: reverse/tail reads may prepend or merge, not replace.
  Use the correct independent buffer/map oracle, not replacement-only equality.
- Pair gated cases with unwrapped natural and no-competition controls when claiming
  user-facing behaviour. Useful data progression and obsolete placement are separate;
  cancelling intent need not discard all useful reads.

Never return a held action promise from `page.evaluate`: Playwright adopts it and
cannot reach release. A synthetic store setup can start without returning it:

```js
await page.evaluate(() => {
  void window.__kupua_store__.getState().extendForward();
});
```

This is not wheel proof. Observe/release the gate in the bounded driver and handle
rejection/cleanup; never leave fire-and-forget work held after the tool call ends.

## Timer and Frame Gates

Prefer deterministic local tests when browser latency makes a narrow race impractical.
If gating in-browser, inspect current served callbacks: source-string markers are
revision-specific, not stable APIs.

- Track each timer/frame, including rescheduling/Strict Mode cancellation. Return
  native IDs, forward clear/cancel and release only active callbacks. Another queued
  timer is not necessarily a setup error.
- Saved native methods need a bound receiver or `.call(window, ...)`. Restore them
  in nested `finally` even if cleanup/cancellation itself throws.
- Outer rAF source includes nested callback text; a marker can match the scheduler
  instead of the leaf. Require ordinary successful placement, not callback count.
- Pair intent with gate/publication identity. Shared loading/lifecycle counters can
  settle while an unrelated held read remains outstanding.
- New resident commands need not read again. Observe trusted input, placement and
  ownership, not only request counts.

## Isolated Fixtures and Media

Use existing local fixture/datasource machinery, not live missing/deleted images.
Block backend/media paths **before navigation** or before synthetic identities enter
rendering, selection or prefetch. Mock DAL responses alone do not isolate media.

A private context can serve the existing app and `MockDataSource` without altering
the shared live-backed tab. Verify fixture datasource, expected corpus, relevant map
readiness and served source before input. For a late missing-target witness, hold
only the target's one-item `searchAfter` within the bounded job and release the
fixture's own removed-ID response. Distinguish delivery, non-aborted signal, status
processing, focus and painted ring; use trusted keyboard/mouse input. Mark the private
page in page memory rather than relying on outer globals across calls. Verify cleanup
and close its owned context.

Playwright routes run newest-first. Catch-all fixtures must `route.fallback()` for
unmatched traffic so earlier API/health blockers can handle it; `route.continue()`
bypasses those handlers. Keep media stubs until synthetic state unmounts/discards,
then remove owned routes.

For media fallback, distinguish retained-grid thumbnail, detail full image, detail
thumbnail fallback and cache reuse. Count main-image errors separately from requests.
Bound failure delivery before the first error so a broken retry cannot run indefinitely;
use local successful media as a decoding control. Synthetic metadata can generate
different paths; error callbacks are not decoding success.

For failure checks, intercept the actual current route and remove it before recovery.
Direct `_search` matching must account for raw/PIT and index-prefixed paths without
swallowing `_pit` or unrelated calls. API/direct contracts differ; one transport's
fixture does not establish the other's behaviour.

## Cleanup and Evidence Limits

Own handles for fetch/XHR/native methods, routes, subscriptions, observers, marks,
frame/timer jobs, viewport, CDP cache/emulation and temporary attributes. Release
and await owned work before asserting cleanliness. Use real Home/recovery afterward
when valid for the experiment.

Return sanitized cleanup readback **before** closing the page in a separate call.
Closing can discard the final result; undelivered readback is not independent
confirmation. Init scripts persist through reload; discard owned contexts if removal
cannot be made reliable.

Unknown output/timeouts do not justify repeating a potentially completed intervention.
Inspect retained results first. Reject contaminated, hidden, interrupted and deadline-
released samples. Record limitations in owning findings, not session entries here.