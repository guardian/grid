# Embedded Browser Playbook

Operating guide for agents driving Kupua in VS Code's integrated browser.
Read this short entry point before browser work, then only the reference sections
needed for the task. Kahuna has its own optional reference.

## Mandatory Core

- **Permission and scope:** confirm the app, backend stage and authorised task.
  Real TEST/CODE/PROD reads need session-specific operator permission. A shared tab
  is not permission to probe live infrastructure. Coordinate server/tunnel lifecycle
  with the operator; do not start, stop, restart or reconfigure it yourself.
- **Read-only live systems:** never mutate non-local ES or live images. Bound any
  diagnostic by actions, requests and elapsed time; stop when the question is
  answered or repeated failures/unexpected work appear. Kupua's vetted POST reads
  are reads; HTTP method alone does not establish safety.
- **Verify the running app:** reuse the operator-shared page ID and origin. Check
  the actual datasource and routes, not just a mode label or hostname. After a
  server switch or code edit, reload when necessary and verify served source and
  the running action. See [runtime identity](browser-playbook/state-and-readiness.md#runtime-identity).
- **Visual evidence requires foreground:** call `page.bringToFront()` and check
  `document.visibilityState` before frame/geometry probes, including after reload.
  If still hidden, ask the operator to foreground the browser editor. Hidden-tab
  DOM observations are not foreground paint or performance evidence.
- **Keep sensitive data out of output:** keep image identities, metadata, tuples,
  request bodies and identity-scoped URLs in page memory. Return booleans, counts,
  coarse route classes, timings and geometry. Never emit credentials, cookies,
  emails, signed URLs or raw traces/HARs into this public repository. Snapshot and
  navigation tools repeat URLs: avoid them while an identity-scoped URL is active.
- **Reuse existing interactions:** inspect relevant methods in
  [shared helpers](../../e2e/shared/helpers.ts) before inventing scrubber, seek,
  density, sort or detail drivers. Helpers are TypeScript test code, not necessarily
  pasteable into the browser bridge. Check current source rather than copying old
  internal action signatures.
- **Establish the right baseline:** these browsers are agent-only. No operator
  app-preference backup is required. Preserve history/cache state when it is the
  subject of the test; reset only relevant app state for independent controls.
  Never clear authentication data wholesale.
- **Own cleanup:** use bounded jobs and `finally` to release holds, restore original
  method descriptors, remove routes/listeners/observers and undo cache/emulation
  changes. Verify cleanup before closing a page. Reload does not remove a
  context/page init script; discard its owned context when needed.

## Find the Technique

| Need | Read |
|---|---|
| Choose a tool; write a browser snippet; find a control | [Controls and selectors](browser-playbook/controls-and-selectors.md#tools-and-execution-realms) |
| Type CQL; chips; suggestions; modifier clicks | [CQL](browser-playbook/controls-and-selectors.md#cql-input-and-suggestions) |
| Grid/table hits; tickboxes; selection; keyboard; scrubber | [Results controls](browser-playbook/controls-and-selectors.md#results-and-selection) |
| Detail, traversal or native fullscreen | [Detail and fullscreen](browser-playbook/controls-and-selectors.md#detail-and-fullscreen) |
| Verify datasource, stale code, debug hooks or tier | [Runtime identity](browser-playbook/state-and-readiness.md#runtime-identity) |
| Set a cold baseline; preserve history/cache; isolate preferences | [State baselines](browser-playbook/state-and-readiness.md#state-baselines) |
| Wait for query, refill, density, detail or decoded media | [Action-specific readiness](browser-playbook/state-and-readiness.md#action-specific-readiness) |
| Measure visible anchors, placement or responsive clipping | [Geometry](browser-playbook/state-and-readiness.md#geometry-and-identity) |
| Record painted transitions or gate a race | [Instrumentation](browser-playbook/instrumentation.md#observers-and-painted-transitions) |
| Local fixture isolation; synthetic IDs; failure injection | [Fixtures](browser-playbook/instrumentation.md#isolated-fixtures-and-media) |
| Attribute requests, bytes, cache or backend work | [Network](browser-playbook/network-and-performance.md#request-observation) |
| Frame timings, profiling or matched comparisons | [Performance](browser-playbook/network-and-performance.md#performance-comparisons) |
| Bounded direct datasource queries; exact rank checks | [DAL probes](browser-playbook/network-and-performance.md#bounded-dal-probes) |
| Operate or compare the legacy frontend | [Kahuna only](browser-playbook/kahuna.md) |

## Reference Boundaries

This playbook owns **operating techniques**, not product guarantees or evidence of
current bugs. Check the owning architecture guide for expected behaviour and the
existing investigation for findings. A synthetic/store/DAL probe is not an ordinary
UI reproduction; a held completed response is not pending backend work; a live
functional check is not a performance certificate.

Automated suites and infrastructure setup belong in the [E2E handbook](../../e2e/README.md)
and [performance handbook](../../e2e-perf/README.md). Browser work does not replace
their gates or authorise running a campaign.

## Maintaining This Playbook

**Update only for a new reusable operating technique or a correction to existing
guidance. No update is required merely because a browser session happened.**

- Do not add session descriptions, dated outcomes, pass matrices, bug diagnoses,
  campaign measurements, task IDs as headings, or "nothing found" entries.
- Merge a lesson into its owning topic. Do not append a chronological entry or
  create a second recipe for the same problem. Remove superseded/false guidance.
- Describe when to use the technique, prerequisites, procedure, a discriminating
  success check, pitfalls and cleanup. Include a small snippet only when useful.
- State applicability: tool/backend limitations, development-only hooks, focus or
  pointer modes and synthetic versus natural input. Qualify unverified mechanisms;
  a past successful observation does not establish a universal rule.
- Link existing evidence when provenance is necessary; keep the evidence there.
  Do not create an archive of session prose just to preserve it.
- Keep this entry point short and update its task routing when adding a topic.
  Give reference headings stable, descriptive anchors.

Acceptance test: **can another agent apply this lesson without knowing the
original session or bug number?** If not, extract the technique or leave the
material in its owning investigation/worklog, not here.