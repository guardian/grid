# Embedded Browser Playbook — Driving Kupua from VS Code

> **Created:** 2026-07-30
> **Status:** First shakedown session complete (2026-07-30). Core loop verified working.
> **Purpose:** Accumulated technique notes for any agent driving kupua through the
> **embedded VS Code browser** — exploratory bug hunting, reproducing a
> user-reported bug, or verifying a fix by hand.
>
> This is about *how to operate the app*, not *what is wrong with it*. Technique
> goes here; bug findings belong in their own docs.

## How to use this file

Read it before a browser session. Append to it after every browser session —
even a short one, even one that found nothing. Entries are cheap; a wasted turn
rediscovering that a selector doesn't work is not.

Mark every entry with its status:

- **[V]** Verified — I did this and it worked
- **[F]** Failed — I did this and it did not work; here's what to do instead
- **[?]** Unverified — inferred from source, not yet exercised

Downgrade or delete entries that turn out to be wrong. Do not leave known-false
notes in place with a correction bolted on.

---

## 1. Session setup

**[!] Check `kupua/e2e/shared/helpers.ts` BEFORE hand-rolling any interaction
helper (scrubber clicks/drags, seeks, density switches, sort changes, etc.).**
This was found late (M10 session) after already re-deriving several pieces of
it from scratch. The project's own e2e suite already has battle-tested,
tier-aware helpers (`kupua.goto()`, `gotoWithParams()`, `seekTo(ratio)`,
`dragScrubberTo(ratio)`, `clickScrubberAt(ratio)`, `getStoreState()`,
`assertPositionsConsistent()`, and more) that correctly handle timing subtleties
(e.g. two-tier's debounced `_seekGeneration` bump — see §3) that are easy to get
wrong from first principles. Skim this file at the start of any session that
will touch scroll/scrubber/seek behaviour — it's cheaper than reproducing its
logic by trial and error.

**[V] Store hooks exist and all resolve on TEST.** `window.__kupua_store__`,
`__kupua_selection_store__`, `__kupua_getViewportAnchorId__`,
`__kupua_getVisibleImageIds__`, `__kupua_getKupuaKey__`, `__kupua_router__` are all
`function`/`object` (not `undefined`) against the live TEST deployment at
`kupua.media.local.dev-gutools.co.uk`. This is a dev build even though it's serving
real data. Do not assume prod-hardening from the URL alone — check the hooks.

**[V] Store shape (probed via `Object.keys(store.getState())`).** Useful fields
for "where am I": `total`, `loading`, `bufferOffset`, `results` (array, `.length`
useful), `focusedImageId`, `_phantomFocusImageId`, `dataSource`, `params`. Noise for
our purposes: the large block of `_seek*`, `_extend*`, `_prepend*`,
`_forwardEvict*` internal generation counters — useful only if debugging the
engine itself, not for "where is the agent right now". `dataSource` was an empty
object `{}` in the scroll tier — don't rely on it to name the tier; infer tier from
`total` against the documented thresholds instead.

**[V] `loading: false` is a valid poll condition.**
`page.waitForFunction(() => window.__kupua_store__.getState().loading === false)`
returned promptly once the corpus had settled after a reload. No fixed sleep needed.

**[V] The embedded browser is a persistent user session — confirmed.**
`localStorage.clear(); sessionStorage.clear()` followed by a reload produced a
clean `ui-prefs` (read back as `null`). **Do this before EVERY reload you're
treating as "a fresh page load" — not just once per mission.** A `page.goto()`
to a URL already visited in this tab does NOT reset storage; a per-search
`kupua:histSnap:*` sessionStorage entry survives it and silently restores the
prior scroll/anchor position, which produced a false "confirmed bug" in the M7
session (see §3, "Reused-page storage confound").

**[?] Even `localStorage.clear(); sessionStorage.clear()` immediately before a
`page.reload()` did NOT always produce a position-0 landing in the seek tier,
after a direct `store.getState().seek(N)` call earlier in the same tab.** Seen
once (2026-07-31): cleared both storages, reloaded, waited for `loading ===
false`, and `bufferOffset` came back at ~499,906 (matching the earlier seek
target) instead of 0. `sessionStorage` after the reload did contain a fresh
`kupua:histSnap:*` key and TanStack Router's own `tsr-scroll-restoration-v1_3`
key, both clearly rewritten post-clear, not stale survivors — so the source of
the carried-over position was not pinned down (candidates: `history.state`,
which is native browser session-history state and is NOT touched by
`Storage.clear()` at all, is the most likely suspect but this wasn't
confirmed). Not filed as a product bug — the docs' own "reload gives back the
same place" guarantee (oracle 7.2) makes this arguably correct/intentional
behaviour, just surprising given the standard storage-clearing recipe didn't
defeat it this time. **Practical workaround, not a fix:** if a mission
genuinely needs a guaranteed position-0 seek-tier baseline in a tab that has
ever called `seek()` directly before, don't fight it — open a brand-new
page/tab (`open_browser_page` with `forceNew: true`) instead of reloading the
same one. Worked immediately in the same session.

**[V] Console collectors survive client-side route changes, die on reload.**
Armed once, then survived two SPA navigations (grid→table, table→grid, both via
click — URL changed by a router push, no full navigation). Drained cleanly with
no errors recorded. A subsequent `navigate_page` `reload` wiped `window.__wander__`
back to `undefined`. Re-arm after reload/back/forward; no need to re-arm after a
click-driven route change within the SPA.

**[V] Expect recurring `WebSocket`/`502`/`401` console noise on every full
reload — this is environment noise, not a bug, and not worth investigating.**
Seen on every reload this session regardless of what triggered it (fresh nav,
mid-detail reload, reload right after an un-settled scroll): `WebSocket
connection ... failed`, `502 Bad Gateway`, `401 Unauthorized`. Looks like Vite
HMR-over-HTTPS-proxy noise plus a Grid API auth/gateway quirk in this dev-on-TEST
setup, unrelated to search/scroll/anything under test. Don't burn a turn
chasing it, and don't let it pollute a findings doc as a real observation —
this is known, recurring noise, not worth re-reporting.

---

## 2. Selectors

**[?] `data-testid` coverage is sparse.** Only two are known in source:
`scrubber-track` and `toast`. Do not expect a testid to exist; check first.

**[V] ARIA roles are the reliable route** — confirmed for every row below.

| Target | Selector | Status |
|---|---|---|
| Search bar | `role=toolbar[name="Search and filter controls"]` | [V] present |
| Grid scroll container | `role=region[name="Image results grid"]` | [V] confirmed real scroll container |
| Table | `role=grid[name="Image search results"]` | [V] confirmed real, resolves in table view |
| Table rows / cells | `role=row`, `role=gridcell` | [V] 42 rows / 943 cells resolved in table view |
| Scrubber | `role=slider[name="Result set position"]`, or `[data-testid="scrubber-track"]` | [V] both resolve, exactly 1 each |
| Tickbox (select image) | `[aria-label="Select image"]` / `[aria-label="Deselect image"]` | [V] toggles correctly — **but hidden until the row is hovered**; `locator.click()` alone times out on "not visible", must `.hover()` the row first (or `click({ force: true })`) |
| Toast | `role=alert` | [V] confirmed — see below for how to trigger one on demand |
| Status counters | `role=status` (aria-live — content changes without DOM churn) | [V] "N matches" counter observed live |

**[V] Trigger a toast on demand via `window.__kupua_toast_store__` — no need to
find a real trigger action.** `page.evaluate(() => window.__kupua_toast_store__.info('msg'))`
(also `.warning`, `.error`, `.success`, `.announcement`) fires a real
`role="alert"` toast immediately. Useful for verifying toast selectors/timing
without hunting for whatever app action happens to surface one. Toasts
auto-dismiss on their own timer — don't assume a `Dismiss notification` button
click will still find it if you waited first; check `role=alert` count before
trying to dismiss.

**[V] Grid cells carry `data-grid-cell`.** `page.locator('[data-grid-cell]').count()`
returned 56 with zero ref-hunting — the most reliable way to enumerate/target cells.

**[?] Tailwind classes are not stable selectors.** Do not target them.

---

## 3. Known traps

**[V] Vertical scrolling works via direct `scrollTop` assignment — the KAD #9
proxy-div trap is horizontal-only.** The real vertical scroll container is
`[role="region"][aria-label="Image results grid"]` (a plain `div` with classes
`overflow-y-auto ... hide-scrollbar overscroll-y-contain`). Setting
`el.scrollTop += N` via `page.evaluate` moved the viewport and changed the anchor
image ID immediately — no wheel/keyboard simulation needed. Did not test the
horizontal proxy in this session; still `[?]` if you need it.

**[V] The CQL search input is a shadow-DOM custom element — `type_in_page` fails
on it, but real typing works via a Playwright locator + keyboard.** `<cql-input>`
has an *open* shadow root wrapping a ProseMirror editor. `type_in_page`
(`locator.fill`) throws: *"Element is not an `<input>`... does not have a role
allowing [aria-readonly]"*. Two working alternatives, pick based on what you're
testing:
- **Just loading a query, not testing the widget itself:** navigate with
  `?query=...` in the URL — equivalent to typing, settles immediately, no shadow
  DOM to fight.
- **Actually need to exercise typing/typeahead/chip behaviour:** `page.locator('.ProseMirror.Cql__ContentEditable').click()`
  then `page.keyboard.type(...)`. Playwright's CSS locators pierce *open* shadow
  roots automatically — no `>>>` or special syntax needed. This is real keyboard
  input and drives the debounced query update like a user would.

**[V] Clear the box with the "Clear search" button — fastest, one click.**
`role=button[name="Clear search"]` empties the query (chip and free text) in one
click. **Keyboard select-all-and-clear also works, but only with the right
modifier: use `Meta+a` (Cmd+A), not `Control+a`.** This was a self-inflicted bug
earlier in this session — the embedded browser runs on macOS, and the CQL
editor's ProseMirror keymap follows the platform convention (`Mod-a`, which
resolves to Cmd on Mac), so `Control+a` silently does nothing useful here.
`page.keyboard.press('Meta+a')` then `Backspace` clears everything in one shot
**if the cursor is positioned after/outside any chip** (e.g. click near the
right edge of the input). If the cursor lands *inside* an existing chip's value
(clicking directly on chip text opens it for editing), the first `Meta+a`
selects only that chip's value — press it a second time (now that the chip has
collapsed to plain prefix text) to select and clear the rest. To delete a chip
without entering its edit mode, click its `.Cql__ChipWrapperDeleteHandle`.

**[V] Typing two chips back-to-back (e.g. `credit:Avalon keyword:zselect`) needs
an Enter between them, not just a space.** After typing the first field:value,
the caret is still inside that chip's editable value — a following space and
more text just gets appended to the same value (producing the malformed single
chip `credit:"Avalon keyword:zselect"`, zero results), it does not start a new
chip. Fix: type the first term, press **Enter** to commit it, then type the
second term and press Enter again. Two separate real keystroke sequences with a
commit in between, not one continuous `keyboard.type()` call.

**[V] Typeahead value suggestions are aggregation-scoped and can return "No
results" even for real values — this is expected, not a bug.** The suggestion
list reflects the top-N terms-agg buckets for the *current* query context, not
a free client-side prefix search over all data. Editing an existing chip's
value re-runs the aggregation as if that field's own filter weren't applied
(avoiding a self-referential scope), so a rare value that's 100% of the
*current* narrow result set can still show "No results" once you click into
it. Test typeahead against a genuinely high-frequency value (e.g. `football`,
`PA2022`) if you want to see real suggestions rather than debugging a false
"no results" alarm.

**[V] `+field:` typeahead suggestions are ES-aggregation-backed, and the
selection gesture works fine both ways — the earlier "corruption" bug was
about *typing*, not *selecting*.** Typing `+keyword:` opens a real dropdown of
live values with query-scoped counts. Two things confirmed:
1. Suggestions only exist for keyword-mapped ES fields — per
   `mapping-enhancements.md`, byline/city/country/state/copyright/peopleInImage/
   suppliersReference/usageRights.photographer are `text`-mapped with no
   `.keyword` sub-field, so **no suggestions exist for those fields at all**,
   independent of the browser interaction. Don't burn a turn debugging "no
   dropdown" for those fields — check `field-registry.ts` / `typeahead-fields.ts`
   first.
2. **Both `ArrowDown`→`Enter` and clicking a `.Cql__Option` element directly
   cleanly accept a suggestion** — verified: typed `+keyword:foot`, saw
   `football`/`FOOTY`/`FOOTBALL` options, `ArrowDown`+`Enter` produced a clean
   `keyword:FOOTY` chip; repeating with a direct `.click()` on the option
   produced the identical clean result. **The actual corruption trap is typing
   the FULL text of an existing value character-by-character** (e.g.
   `page.keyboard.type()` of the complete phrase "mid length half
   celebration") — this races with the typeahead's live-updating suggestion
   list and can produce a duplicated/garbled chip value and a broken 0-result
   query. Rule: type only a short distinguishing prefix, then select via arrow
   keys or a click — never type a complete known value out in full.

**[V] Click-to-search semantics differ between the metadata panel and the
Filters panel — confirmed against source (`metadata-primitives.tsx`,
`FacetFilters.tsx`) and live-tested for the Filters panel.** In the metadata
detail panel (`useMetadataSearch`): plain click **replaces** the whole query
with `field:value`; **Shift+click appends** it (AND, additive, not yet
live-tested this session — `[?]` for Shift specifically); **Alt+click appends
it negated** (`-field:value`, exclude). In the **Filters/facet panel**
(`FacetFilters.tsx`), there is no whole-query-replace mode at all — every click
is additive/toggle: plain click appends the term if absent, removes it if
already present with the same polarity; **Alt+click** targets the *negated*
form (add negated if absent, flip polarity if the positive form is present,
remove if the negated form is already present). Shift is not read in the
Filters panel. Live-verified: clicking "football" under Keywords appended
`keyword:football` to the query; Alt-clicking it again flipped to
`-keyword:football`.

**[V] `has:field` is real and works as an ES `exists` query — confirmed live.**
`has:credit` → 1,237,117 of the full corpus; `-has:credit` → 14,809 — the two
partition the corpus (matches `fieldToClause` in `cql.ts`: `has` maps straight
to `{ exists: { field } }`, negatable with the leading `-`). `has:peopleInImage`
→ 280,914, confirming it works correctly on a sparsely-populated field too, not
just a near-universal one.

**[V] `OR`, parentheses/grouping, and wildcards are NOT implemented in the app
today — confirmed directly by the user, not inferred.** Do not spend a turn
trying to make any of these work, and do not trust
`search-syntax-enhancement.md`'s coverage of them as describing current
behaviour — it's aspirational/future-facing.

**[V] `is:` filters — confirmed set of known values, unknown values silently
match nothing.** `buildIsQuery` in `cql.ts` hardcodes a fixed list; anything
else falls through to `match_none` (0 results, no error). Live-verified against
the full corpus (`nonFree=true&until=2026-03-04T00:00:00Z`, 1,251,926 docs):

| Query | Total | Notes |
|---|---|---|
| `is:deleted` | 6,762 | `exists: softDeletedMetadata` |
| `is:gnm-owned` | 4,517 | matches the "GNM-owned" Filters facet button exactly |
| `is:agency-pick` | 5,851 | matches the "agency-pick" Filters facet button exactly |
| `is:under-quota` | 1,251,926 | = full corpus total on TEST right now (no supplier is currently over quota) |
| `is:bogus-value` | 0 | unknown value → silent `match_none`, not an error |
| `-is:deleted` | 1,251,926 | **same as the full corpus total, not total-minus-deleted** — soft-deleted docs are already excluded from the default (unfiltered) view, so negating `is:deleted` is a no-op vs. the baseline |

Org-specific `is:` values (`gnm-owned`, `gnm-owned-photo`,
`gnm-owned-illustration`) are derived from `gridConfig.staffPhotographerOrganisation`
(currently `"GNM"`, lowercased) — don't hardcode `gnm-owned` as a universal
value if this playbook is ever used against a differently-configured instance.



**[?] Search input is debounced (~400ms).** Not exercised this session (we only
navigated by URL, which reflects the settled query immediately). Still inferred
from source — poll the store rather than guessing a wait if you do type into it.

**[?] Arrow keys behave differently inside search inputs.** Not exercised this
session.

**[V] Single click on a grid cell sets focus and does not open detail.** Clicked
`[data-grid-cell] >> nth=0` via selector (no ref needed). Verified via the store —
`focusedImageId` became a real image ID and `location.href` was unchanged (no
detail route navigation) — not by screenshot or by guessing from the diff.
`ui-prefs` was `null` (default focus mode) at the time; behaviour not yet checked
in an explicitly-set alternate mode.

**[V] Double-click on `[data-grid-cell]` opens detail (`?image=` in the URL) —
survives reload correctly, including mid-detail reload.** Confirmed via
`location.href` and `store.focusedImageId` both reflecting the detail image
after a fresh reload.

**[V] A synthetic `el.scrollTop = N` assignment needs ≥800ms before the anchor
is "settled" for cross-view-mode preservation (density switch, panel toggle) —
do not trust a 150–300ms wait here.** This bit a whole mission in the
2026-07-30 scroll-batch session: a 150–300ms wait after a single large
`scrollTop` jump made density switching look like it reset position to near-top
(anchor index dropped from ~270 to ~13, reproduced 3 times). Re-running the
*identical* scenario with an 800–1000ms wait after the scroll and 500–800ms
after each density click showed position correctly preserved (drift <5
positions, well within the tolerance the e2e suite already accepts). Root
cause not confirmed (likely a scroll-end debounce that the anchor-preservation
code reads from, separate from `getViewportAnchorId()` itself which *does*
update immediately). **Practical rule: after any programmatic `scrollTop`
write, wait ≥800ms before triggering a view-mode change (density, panel
open/close) if you intend to check position preservation across it.** Waits of
100–150ms between small incremental scrolls (e.g. simulating repeated
PageDown) did not show this problem — it is specifically single large jumps
followed by an immediate mode change that are at risk.

**[?] `loading === false` does not guarantee the results buffer has finished
filling after a rapid double navigation.** Observed once: two `page.goto()`
calls fired back-to-back (no wait between) left `store.getState()` reporting
`loading: false` while `results.length` (600) was still short of `total`
(868); a later read (no explicit extra wait, just the next tool round-trip)
showed `results.length === total`. The store exposes more specific in-flight
flags — `_extendForwardInFlight`, `_extendBackwardInFlight` — that are more
precise than `loading` for "is the buffer still filling" after an interrupted
navigation. Not fully characterised; treat `loading` as sufficient for a single
clean navigation but not as sufficient after deliberately interrupting one
navigation with another.

**[?] Seek is teleport-on-release in the seek tier.** Not exercised this session
(stayed in the scroll tier per instructions).

**[V] `store.getState().seek()` called directly is NOT representative of a real
user scrubber interaction for the buffer and two-tier scroll tiers — confirmed
against `Scrubber.tsx` source.** `ScrubberMode` is derived as
`total <= bufferLength ? "buffer" : positionMapLoaded ? "indexed" : "seek"`, and
`isScrollMode = scrubberMode === "buffer" || scrubberMode === "indexed" ||
twoTier`. When `isScrollMode` is true (buffer & two-tier), a real click/drag
calls `scrollContentTo(ratio)` — it sets `scrollContainer.scrollTop` directly and
never calls `store.seek()` at all. Only the true seek tier (no position map)
calls `onSeek(pos)` → `store.seek(globalOffset)` on click/drag-release. If you
need to simulate scrubber interaction in buffer/two-tier for a wandering
session, **use the project's own `kupua.seekTo()` / `kupua.dragScrubberTo()` /
`kupua.clickScrubberAt()` helpers in `e2e/shared/helpers.ts`** rather than
hand-rolling the `positionFromY` inverse math or calling `seek()` directly — the
helpers already implement the correct click math and (for two-tier) the correct
wait condition below.

**[V] Two-tier scrubber clicks set `scrollTop` synchronously but the buffer
reposition is debounced — `loading === false` alone is NOT sufficient to know a
two-tier click has taken effect.** Confirmed by reading `seekTo()`'s own doc
comment in `e2e/shared/helpers.ts`: clicking the two-tier scrubber sets
`scrollTop` immediately (no ES call), then a debounced scroll-seek fires ~200ms
later to actually reposition the buffer, tracked via `_seekGeneration`. A test
script that only waits for `loading === false` right after the click can read
state before the debounce has fired (or even started), and will see the *old*
`bufferOffset`/`aria-valuenow` — this looks exactly like a silent click failure
but is a test-timing artifact, not a bug. **Wait for `_seekGeneration` to bump**
(see `seekTo()`'s implementation) rather than just `loading`. This cost most of
a session chasing what looked like a real scrubber desync bug before the
real cause (own test script's insufficient wait) was found.

**[!] Always do a truly fresh `kupua.goto()` before each independent scrubber
test point — do not reuse the same page/mouse state across successive seeks
within one ad-hoc script.** Reusing a page across several manual click-simulated
seeks (rather than one `goto()` per test point) makes it hard to tell a stale
carried-over position from a genuine new-click result — this confound is what
ultimately capped the confidence of the M10 tier-agreement finding at "low" for
its open question. If cross-tier position comparison is needed again, prefer
separate fresh page loads per test point over a chain of clicks on one page.

**[V] Reused-page storage confound retracted a "confirmed" bug — clear
`sessionStorage`/`localStorage` before EVERY reload used as a "fresh" test
point, not just between missions.** In the M7 session I reported a "confirmed"
bug (first scrubber click after a fresh load lands ~5% off target) after
reproducing it 3x with geometry explicitly ruled out. It was still wrong: kupua
persists a per-search history-restore snapshot in `sessionStorage`
(`kupua:histSnap:<uuid>` → `{anchorImageId, anchorOffset, viewportRatio}`),
which **survives `page.reload()` and repeat `page.goto()` to the same URL in
the same tab** (only cleared on tab/window close). The whole session reused one
page across many missions/test points on the same query without ever clearing
storage, so every "fresh" reload silently restored a prior test point's
position. A same-session A/B (`localStorage.clear(); sessionStorage.clear()`
before reload, vs. not) reproduced the "biased" result only when storage was
left dirty, and the "accurate" result every time storage was cleared — timing
(0ms vs 4000ms wait before the first click) made no difference in either
condition. **Practical rule: `localStorage.clear(); sessionStorage.clear();`
then `page.reload()` before every test point you're treating as "a fresh page
load", not just once per session** — `page.goto()` to a URL you've already
visited in this tab does NOT give you a clean slate.

**[?] Same target pixel via click vs. drag-from-above vs. drag-from-below can
disagree by ~1–3% in the seek tier — medium confidence, not fully
instrumented.** With storage properly cleared per test point (see previous
entry), the identical scrubber-track pixel still seeked to measurably
different global positions depending on route (`aria-valuenow` 1084 / 1056 /
1088 for click / drag-from-above / drag-from-below on a 2,130-item set) —
exactly reproduced on a 2nd trial. Track/thumb geometry was pixel-identical
across routes, so this isn't a script artifact, but the likely root cause
(`thumbVisibleCount`/`useVisibleRange()` varying by list position, baked into
`positionFromY`/`positionFromDragY` as a fixed denominator) is inferred from
source, not confirmed by directly reading that value (no debug hook exposes
it). Would need direct instrumentation of that value to raise this from a
plausible inference to a confirmed root cause.

**[V] The scroll-to-focus effect's failure generalizes beyond neighbour
fallback — it also fails on a plain sort-order toggle, with no query change
and no fallback involved at all.** Confirmed (F4, reproduced twice, both
toggle directions): focus a mid-list image, toggle sort direction (same
query, same result set — the focused image never leaves the results, it just
moves to a new index). `focusedImageId` correctly stays the same ID,
correctly re-indexes to its mirror position in the re-sorted list, and
`sortAroundFocusGeneration` correctly bumps — but `scrollTop` stays 0 and the
cell is never rendered. Identical symptom shape to the neighbour-fallback bug
(F3) despite a completely different upstream trigger, which strongly points
at a single shared root cause in `useScrollEffects.ts`'s
`sortAroundFocusGeneration`-keyed effect (section "9. Sort-around-focus
generation") rather than in either trigger's own logic. Useful diagnostic
pattern for any future "focus survives but scroll doesn't happen" suspicion:
check all three signals together — `focusedImageId`/index (did it find the
right target?), `sortAroundFocusGeneration` (did the effect even fire?), and
`scrollTop`/DOM presence (did the scroll actually happen?). Bumped generation
+ correct index + `scrollTop: 0` is the fingerprint of this specific class of
bug, not a "the fallback logic didn't work" problem.

**[V] F3/F4's shared root cause is now CONFIRMED (not just theorized) via
temporary runtime instrumentation — a two-effect race in
`useScrollEffects.ts`.** Effect #9 ("Sort-around-focus generation") can fire
*before* the buffer-window data (`imagePositions`/`bufferOffset`) for the new
sort order has settled, computing its scroll target from a stale snapshot
(observed: `imagePositions.get(id)` still returned the item's *pre-sort*
global index at the exact moment the effect ran). Then, as the buffer
continues correcting itself and `bufferOffset` eventually transitions from
some positive value to exactly 0, effect #8 ("bufferOffset→0 guard")
unconditionally force-resets `scrollTop = 0` — with no awareness that a
sort-around-focus scroll is already in flight for the same operation, and
effect #9 never re-fires to correct it (its only trigger,
`sortAroundFocusGeneration`, doesn't bump twice for one operation).

**[V] Technique — runtime instrumentation via a `window`-level buffer, not
`console.log`/`devLog`, when using the embedded browser tool.** Adding
`devLog(...)` calls and reading them via `page.on('console', ...)` did not
work reliably in this session — messages were silently missed regardless of
listener timing. Pushing debug strings into `(window as any).__debug__ =
(window as any).__debug__ || []; (window as any).__debug__.push(...)` inside
the code under investigation, then reading `page.evaluate(() =>
(window).__debug__)` after the interaction, worked perfectly and is more
robust (survives being read at any later point, no listener-timing race).
Remove all such instrumentation before ending the investigation — it must
never be committed.

**[F→V] A long-lived local Vite dev server can silently stop picking up file
edits entirely (not just "flaky HMR") — always verify staleness before
trusting runtime behaviour against edited code.** Discovered when temporary
debug instrumentation added to a file produced zero output: `curl`ing the dev
server's served source directly (`curl -s http://localhost:PORT/src/path/to/file.ts
| grep -c "my-marker"`) showed 0 matches against a marker that was definitely
on disk. The three tier-matrix servers (`:3010`/`:3020`/`:3030`, all
long-running from an earlier mission this session) had all stopped reflecting
disk edits — the served content was ~200 lines shorter than disk and missing
recent structure entirely. **Killing and restarting the affected server fixes
it immediately** (confirmed: `curl`'d content matched disk right after
restart). Non-obvious follow-up trap: even a **freshly restarted** server can
still serve a stale cached copy of the *next* edit made while it's running —
verify with the same `curl` + `grep -c` check after every edit before trusting
instrumentation output, and restart again if it comes back 0. Don't assume
"I just restarted it, it must be fresh" — recheck every time.

**[V] Search-context-change neighbour fallback finds the right ID but doesn't
scroll to it — confirmed real bug, reproduced three times (including once with
proper poll-until-settled verification, ruling out a fixed-wait timing
artifact).** When explicit focus is on an image absent from a narrower query,
the documented behaviour (`02-focus-and-position-preservation.md` §2.3 step 5)
is "find nearest surviving neighbour → focus it → scroll to its new position."
The ID-matching half works (confirmed: the new `focusedImageId` is present in
the new result set at a genuine mid-list index, not index 0 by coincidence),
but `bufferOffset`/`scrollTop` stay at 0 and the focused cell is never
rendered — the user sees the top of the list while focus is silently anchored
off-screen. Root cause (confirmed via source + re-verification, refining an
earlier guess): this is **not** a failure of the "load a buffer around a
distant neighbour" code path — when the narrower query's own total is itself
≤ 1000 (buffer tier), its *entire* result set loads in one page, so the
neighbour is trivially classified as already "in buffer" and no buffer-load is
attempted or needed. The bug is that the shared scroll-to-focus effect (which
reacts to a `sortAroundFocusGeneration` bump) simply doesn't scroll the
viewport when the newly-focused item is off-screen within an already-loaded
result set. To check "is my focused cell actually
visible, not just state-correct" in future sessions: don't trust
`focusedImageId` alone — also check
`document.querySelector('[data-image-id="..."]')` is non-null and
`bufferOffset`/`scrollTop` moved. **When verifying an async multi-step engine
path (recursive fallback, retries, etc.), poll for a stability signal (e.g.
`sortAroundFocusStatus === null` + `loading === false` held for a few
consecutive samples) rather than a single fixed `waitForTimeout` — a fixed
wait risks capturing an intermediate state and produces a false suspicion of
"maybe this was just too short," costing a full re-verification cycle to rule
out.**

**[V] A long-lived, heavily-reused browser tab can silently degrade — clicks,
drags, and even raw `dispatchEvent` pointer sequences on the scrubber stopped
registering (`bufferOffset`/`aria-valuenow` stuck at 0, only the tooltip label
updated) after many dozens of rapid interactions in one tab this session; a
retry on a brand-new tab against the identical URL worked on the first
attempt.** One drag attempt on the stale tab did trigger a real network
request, which came back `net::ERR_ABORTED` — consistent with some kind of
accumulated request/controller state corruption specific to that tab, not a
product bug. If scrubber/grid interactions that worked earlier in a session
stop working with no code changes, don't spend long debugging selectors or
event sequences — first try a fresh `open_browser_page` (or reload via
`about:blank` round-trip) against the same URL before concluding it's a real
finding.

**[V] The scrubber THUMB is a click-vs-drag trap — clicking it without any
pointer movement is a designed no-op, not a bug.** Confirmed directly against
`Scrubber.tsx` source. Two separate handlers are in play: `handleTrackClick`
(fires on clicks anywhere in the track) explicitly returns early if the click
target is the thumb element (`if (e.target.dataset.scrubberThumb) return;`);
and the thumb's own `handleThumbPointerDown`/`onPointerUp` pair takes a
"click-without-drag" branch when `hasMoved` is false, which does **nothing but
call `flashTooltip()`** — no scroll, no seek, the position never changes. A
Playwright `page.mouse.click(x, y)` is exactly a down+up at the same coordinate
with no movement in between, so **if the computed `(x, y)` lands inside the
thumb's current rendered bounds (which sit at the thumb's PREVIOUS position, not
your intended target), the click silently does nothing except flash the
tooltip** — this most likely explains a "label updates, position doesn't
move" pattern seen when repeating ad-hoc clicks on the same page, where a new
click's target coordinate can easily fall within the still-visible thumb left
over from the previous click. **To reliably
move the thumb from a script:** either click a point on the track clearly
outside the current thumb's bounds (check `thumbRef`'s bounding rect first), or
perform a real drag (`page.mouse.move` → `down` → `move` → `up`, matching
`dragScrubberTo()` in `e2e/shared/helpers.ts`) which always works regardless of
where on the thumb you grab it.

**[V] Grid/table keyboard navigation — Arrow Up/Down, PageUp/Down, Home/End all
work, confirmed both against `useListNavigation.ts` source and live for
End/Home/PageDown.** Doc comment at the top of the hook is authoritative:
**no focus**: ArrowUp/Down scrolls exactly one row (snapping to row boundary),
PageUp/Down scrolls one page (row-snapped, never skips a partially-visible
row), Home/End scroll to absolute start/end — none of these set focus.
**With focus**: ArrowUp/Down moves focus by one visual row
(±`columnsPerRow` items), ArrowLeft/Right (grid only) moves focus by ±1 item,
PageUp/Down moves focus by one page, Home/End scroll to start/end **and**
focus the first/last image, Enter opens the focused image. Live-verified on
the two-tier tier server: click a grid cell to give the results region focus,
then `page.keyboard.press('End')` moved `bufferOffset` to near `total` and set
`focusedImageId` to the last image; `Home` reset `bufferOffset` to 0 and
focused the first image; `PageDown` moved `scrollTop` by one page. **This is a
viable, often simpler alternative to scrubber click/drag simulation** for
missions that just need to get to "near the top", "near the bottom", or move a
small number of rows — no thumb/track coordinate math needed at all. Note the
results region must actually have focus first (click a cell, or any element
inside the region) — `isNativeInputTarget` in `keyboard-shortcuts.ts` excludes
native inputs, and `CqlSearchInput` explicitly propagates these same keys
(ArrowUp/Down, PageUp/Down, Home/End, not Left/Right) so they still reach
`useListNavigation` even when focus is in the search box.

---

## 4. Waiting

**[V] `loading === false` on the store is the right poll condition — field name
confirmed, not guessed.**

```js
return page.waitForFunction(() => {
  const s = window.__kupua_store__?.getState?.();
  return s && s.loading === false && s.total != null;
}, null, { timeout: 10000 });
```

Never use a fixed sleep as a substitute for a condition. It will pass locally and
lie to you on TEST, where latency is real.

**[V] The `role=status` "N matches" counter updates live and is a cheap secondary
signal** if you'd rather not evaluate the store — visible in a plain `read_page`
snapshot without any custom hook. Prefer the store poll above when scripting;
this is a fallback for when you're eyeballing a snapshot anyway.

---

## 5. Cost notes

**[V] Ordering confirmed, with a caveat.** `run_playwright_code` state reads
returned small, focused JSON every time. `click_element` on a grid cell or a
role-based button also returned small diffs. But **`click_element` on anything
that swaps the whole results view (grid ↔ table) returned a 70–130KB inline diff**
— nearly as expensive as a full `read_page`, because the entire new DOM subtree
counts as "changed". For big-DOM-swap interactions, do the click, then immediately
follow with a small `run_playwright_code` evaluate for the one fact you need rather
than reading the click's own diff.

**[V] `read_page` was never actually needed this session.** Every ref used came
from the initial `open_browser_page` snapshot or from a role/attribute selector
found via `run_playwright_code`. Selector-based `click_element` calls (e.g.
`role=button[name="Switch to grid view"]`) worked without a fresh ref even after
the DOM had fully changed underneath.

**[V] `screenshot_page` was not needed at all** for any of the technique questions
in this session — every question resolvable via the store or a DOM query was
cheaper and more certain answered that way. Reserve it for genuinely visual
questions per the cookbook.

**[V] Prefer asking the store over reading the page — confirmed.** Every "where am
I" question in this session was answered by `window.__kupua_store__.getState()` or
the `__kupua_get*` hooks, never by parsing a snapshot.

**[!] `run_playwright_code`'s top-level script body runs OUTSIDE the browser —
`document`/`window`/`setTimeout` are NOT defined there, despite feeling like
ordinary async JS.** Confirmed by three separate failures in one session
(2026-07-31):
- Bare `document.querySelector(...)` at the top level of the script →
  `ReferenceError: document is not defined`. Must be inside a
  `page.evaluate(() => { ...document... })` callback — that callback is what
  actually runs in the browser.
- Bare `setTimeout(...)` / `new Promise(r => setTimeout(r, ms))` at the top
  level → `ReferenceError: setTimeout is not defined`. Use
  `await page.waitForTimeout(ms)` instead.
- An outer-scope JS variable referenced *by closure* inside a
  `page.evaluate(() => { ...useOuterVar... })` callback → `ReferenceError:
  <var> is not defined` **inside the callback**, even though it looks like a
  normal JS closure. The callback is serialized and sent across the CDP
  boundary, so closures over the outer script's variables don't survive. Pass
  it explicitly instead: `page.evaluate((x) => { ...use x... }, x)`.
**Practical rule: every DOM read/write and every wait, with no exceptions,
must go through `page.evaluate(...)`, `page.waitForTimeout(...)`, or
`page.waitForFunction(...)` — never bare.** A script that throws partway
through silently discards everything after the failing line, including a
`return` statement you were relying on to see partial progress — so this
class of mistake also costs you the diagnostic output, not just the action.

**[V] `page.setViewportSize({ width, height })` works directly for resize
testing (M3) — no special handling needed.** Confirmed against the live TEST
app: resizing mid-fetch (immediately after firing `store.seek()` or a large
`scrollTop` jump, without awaiting settle first) did not error and the buffer
settled to a sane, duplicate-free state in every case tried (seek, buffer, and
two-tier tiers). Query `page.viewportSize()` to read the current size back.

**[?] Tight race windows inside a specific async engine step (e.g. a resize
landing exactly during an in-flight `extendBackward` fetch) are hard to hit
reliably through this tool — round-trip latency between tool calls is often
slower than the window you're trying to land inside.** Tried 3 times
(2026-07-31): buffer-tier `_topUpScrollModeBuffer`/`extendBackward` calls
fired by a sort-around-focus complete (fully re-populating the buffer) faster
than the gap between "fire the sort click" and "call `setViewportSize`" across
two separate tool invocations — by the time the resize command executed, the
buffer already showed `results.length === total` again. If a specific narrow
race matters, don't try to force it live in the embedded browser — write a
Vitest test with a controllable/delayed mock data source instead, where the
fetch promise can be paused deterministically.

**[V] Detail-traversal (arrow keys in `ImageDetail`) does NOT live-update
`store.focusedImageId` on every arrow press — it only commits on exit back to
the grid.** Confirmed twice (seek tier and buffer tier, 2026-07-31): pressing
`ArrowRight`/`ArrowLeft` 25 times moved the URL's `?image=` param and the
visible detail content correctly at every step, but `store.getState().focusedImageId`
stayed pinned to the image you *entered* detail on throughout the whole
traversal. Only after navigating back to the grid did `focusedImageId` update
to the last-viewed image. **If a mission needs to track position live during
detail-traversal, read `location.href`'s `image` param, not `focusedImageId`.**
Separately, both traversal sessions used exactly one browser history entry for
the entire detail visit — a single "back" press exits detail completely
regardless of how many images were arrowed through (traversal updates the URL
via `replaceState`, not a `pushState` per arrow step). On return, the grid
correctly focused and scrolled to the last-viewed image (not the entry image)
in both tiers — this resolves the cookbook's M4 "open question" for these two
cases: you land on the last-viewed image.

**[!] Pinned TEST corpus totals drift over time even with `until=...` pinning
— reverify before trusting a documented total, don't assume `AGENTS.md`/the
cookbook's numbers are still current.** Observed within a single session
(2026-07-31): `city:Dublin` (two-tier pin) read 14,399 in `AGENTS.md`, came
back as 13,603 then 13,600 across two navigations minutes apart. Separately,
`keyword:zselect` was recorded as 794 (buffer tier) in the 2026-07-30 M9
session and read as 7,065 this session — no longer buffer tier at all. The
`until` bound pins the *query*, not the underlying index contents — TEST
evidently still mutates docs that satisfy an old `until` filter (edits,
deletions, or re-indexing), or the test environment's data isn't as stable an
anchor as it sounds. **Practical rule: read the actual total back from the
store (`s.total`) after settling, don't trust a remembered/documented number,
and don't be alarmed if a self-consistency check's total differs slightly from
a previous session's — only worry if it changes *within* one session's
before/after comparison.**

**[?] Phantom-anchor (unfocused viewport position) restore via browser history
can take 2-3 leave-and-return cycles to "settle" onto a stable image/position
— confirmed in BOTH buffer and seek tiers, not tier-specific.** Observed
2026-07-31: revisiting the exact same history key across three separate
leave-and-return cycles (interleaved with density toggles, a
facet-narrow/detail/back chain, and sort toggles) moved the phantom anchor to
a different specific image on the third visit in both buffer tier (72 → 69 →
68) and seek tier (stable for 2 visits, then shifted to a 3rd image after a
sort→scroll→panel round trip) — then repeated exactly on further visits in
both cases. **This is bounded and self-stabilizing, not compounding** — don't
file it as a bug on a first observation, but DO keep revisiting the same key
2-3 more times before concluding it's stable; a single clean repeat isn't
enough evidence the way it is in two-tier (which gave bit-for-bit identical
restores on every visit with no settling period at all, across a separate
session). Only escalate to a real finding if a future session finds a case
that keeps moving past 3-4 cycles instead of settling, or if it's ever seen to
affect **explicit** focus (unaffected in every trial so far — always exact,
always rendered).
