# Browser State and Readiness

[Entry point and mandatory rules](../embedded-browser-playbook.md).

## Runtime Identity

After mode switches, reloads or edits, confirm the actual runtime before input:

1. Check shared origin, foreground visibility and authorised backend stage. Hostname,
   total and a runner's mode label do not identify the backend.
2. Inspect the DEV search store and datasource constructor. `ApiDataSource` versus
   `ElasticsearchDataSource` identifies the client adapter, not the remote stage.
3. Confirm coarse routes for the action. Current API mode routes ordinary and AI
   reads through media-api, with no `/es` or `/bedrock` reads. Validate the collector;
   missing records do not prove no traffic.
4. After edits/service handoffs, compare relevant served `?raw` source hashes with
   workspace source without emitting code/environment values. Check the running
   action or its behaviour too: matching source does not refresh modules in an old
   tab. Reload when HMR/websocket delivery is unavailable.

Do not import stateful modules just to identify the app. After HMR, a bare import
may initialize a disconnected diagnostic instance; this mechanism is not fully
characterised. Prefer existing runtime globals. If import is necessary, preserve
the runtime reference first and verify membership against the rendered app.
Comparing references only after import may be circular.

DEV hooks include search/selection stores, viewport anchor, visible-image IDs,
history key and router. Check existence; production builds can remove them. Read
only needed fields: total, loading, results length, offset, focus and action-specific
generation/status. Do not return identities, live scope, snapshots or full state.

Tier thresholds belong to current source/configuration and architecture. Infer the
coordinate regime from actual total and thresholds, not map readiness or historical
corpus totals. Await the map when the check specifically depends on it.

## State Baselines

Choose explicitly:

- **Independent control:** establish initial query, offset, visible first target,
  relevant preferences, cache/history state and pending work before action.
- **Continuous journey:** preserve mounted app and relevant history/cache across
  actions. Reload/reset/remount can erase the behaviour being tested.

Navigation/reload do not clear storage. Same-origin tabs share localStorage; a fresh
tab is not preference isolation. App preference keys include `kupua-panel-config`
and `kupua-ui-prefs`; density is a per-tab session preference. Check current keys
before changing relevant state. Operator preference restoration is unnecessary,
but matched experiments require the same relevant configuration.

Storage clearing does not clear native `history.state`; reload can restore a deep
viewport. Use real Home when appropriate and assert the first visible cell against
the first buffer item. `bufferOffset > 0` alone does not prove a target is outside
the buffer; check membership in page memory. Never clear auth data as a shortcut.

Selection `clear()` need not clear its metadata LRU. Cold-metadata/warm-cache controls
need a fresh runtime or existing test-only reset. A cold range must verify offset
zero and the rendered anchor, not assume the first virtual cell is global zero.
Keep cached-batch, uncached hydration and ordinary gesture controls separate.

An `until` bound pins query admission, not index contents. Metadata/deletions can
change totals/membership; re-read totals and compare same-scope in-memory controls.
Old counts are not assertions. Transport configuration or duplicate `fromIndex`
records can explain differences; inspect owning evidence before expanding a probe.

## Action-Specific Readiness

`loading=false` is one signal, not a general completion oracle. Pick a condition
that distinguishes the requested action from already-idle or unrelated work.
Use bounded synchronous predicates or in-page async loops, not fixed sleeps.

| Action | Required checks |
|---|---|
| Query setup | Intended canonical query/order/scope, generation where applicable, non-errored publication and visible results or intentional empty state |
| Indexed scrubber/refill | Changed generation when required, accepted publication and target visibility; immediate scroll is not refill completion |
| Seek-tier navigation | Destination ownership, changed generation, published buffer and actual rendered target |
| Density/layout | Current view/effective mode, density acknowledgement, then target/container geometry; acknowledgement does not prove a later setup scroll stuck |
| Detail entry/reload | Requested identity readiness and separately underlying-list readiness when needed |
| Detail return/traversal | Returned target rendered/intersecting the real viewport, plus geometry if placement matters |
| Media | Current source, loaded state, `decode()` completion when required and paint/hit-test boundary |
| Selection hydration | Membership/anchor, metadata completion and visible panel publication; cache health alone does not prove subscription |
| Refresh/fill | First accepted publication separately from later background fill |
| History | Destination key/query, focus/anchor and visible placement; length alone misses replaced forward branches |

Capture counters before input. Subscribe before response release if first publication
matters; a successor's busy flag can obscure an earlier publication. Recheck intended
state after intervening awaits. Resident/no-op actions need not start new reads.

Do not use async `page.waitForFunction` predicates: this bridge has resolved an async
false predicate instead of polling. Use a synchronous predicate:

```js
await page.waitForFunction(() => {
  const store = window.__kupua_store__;
  return Boolean(store && store.getState().total != null);
}, null, { timeout: 10000 });
```

This waits only for store/total existence. Add the action's discriminating conditions;
it does not prove completed search/layout/media. For async decode/multi-frame work,
use an awaited in-page loop with elapsed deadline and cleanup, or the existing
decoded-image helper where suitable.

Timeouts are not automatically product failures. Inspect setup ownership, current
query, hit area, route matching, publication and visibility before retrying. Unknown
tool output may hide a completed action: inspect retained results first. Never credit
interrupted or deadline-released runs.

## Geometry and Identity

Measure the real scroll viewport. The table ARIA grid can span all virtual content;
its scroll ancestor is the viewport. Exclude sticky headers using live rectangles.
Re-read dimensions/columns after panel activation or resize.

- Elect the app-owned viewport or selection anchor appropriate to the contract,
  not the nearest DOM item to centre. Record focus, selection and anchor separately.
- Retain stable identity through reflow/traversal; do not carry `.nth(...)` across
  virtualizer movement. Return equality/geometry, not identity.
- Count viewport-intersecting rows/cells, not overscan. Placeholder slots may lack
  markers: classify virtual-row children by presence of `data-grid-cell`.
- Raw scrollTop/origin can compensate buffer movement while an image stays still.
  Measure target-relative geometry as well as store coordinates.
- Check physical bounds before demanding centring/header-at-top. End-field scroll
  can be clamped while the header remains visible. Distinguish initially partial
  from full visibility.
- Nonzero rectangles do not establish paint. Inspect ancestor opacity/overflow,
  pointer state and tab order; screenshot for visual questions. Driver-induced
  ancestor scrolling is a separate confound.
- Resize with `page.setViewportSize` when appropriate; verify dimensions/DPR afterward.
  Height-only and width-changing controls answer different questions.
- Exclude timestamps from geometry equality signatures. Keep the first successful
  stability boundary instead of overwriting it each frame.

## Reloads and Recovery

In-page probes survive SPA routing but die on full navigation. Re-arm for a new
document; `performance.timeOrigin` can identify it. Init scripts persist across
navigation and require owned-context disposal or explicit cleanup, not just reload.

After CQL registration edits, full reload avoids development custom-element registry
conflicts; this is not product navigation behaviour. Classify recurring websocket/
auth/gateway logs against the path under test: neither chase every line nor dismiss
all failures as noise.

A fresh-tab control can distinguish stale runtime/state from failed interaction, but
success there does not prove corruption in the original tab. Retain limitations.
Server staleness requires operator-coordinated recovery, not an agent restart.