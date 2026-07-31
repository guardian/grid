# Fix design — buffer-tier grid-density column shift after sort-around-focus / restoreAroundCursor

Date: 2026-07-31
Status: **RESOLVED — fixed and verified same day, in a follow-up session.** See
"Resolution" section immediately below for what was actually implemented (the root
cause differed slightly from this doc's original §5 speculation — the actual site
was found via one more round of live instrumentation).

---

## Resolution (added after the fix, this doc otherwise left as originally written)

**Actual root cause, pinned down precisely:** the async offset-correction callback
inside `_findAndFocusImage` (`search-store.ts`, the `dataSource.countBefore(...).then(...)`
block) computed `correctedOffset = exactOffset - buf.targetLocalIndex` and set
`bufferOffset` directly — with **no column-alignment trim at all**, unlike the other
two sites that already had one (`_loadBufferAroundImage`'s own initial landing, and
`seek()`, which even had a comment: *"Same trim logic as `_loadBufferAroundImage`"*).
Buffer tier never has a position map, so this async-correction branch is the
**normal**, not edge-case, path for any buffer-tier sort-around-focus with explicit
focus — explaining why the bug was so consistently reproducible.

**Fix implemented:** extracted the previously-duplicated trim math (which existed
inline, slightly differently, in both `_loadBufferAroundImage` and `seek()`) into one
shared, independently unit-tested pure function, `alignBufferStart()` in new file
`kupua/src/lib/buffer-column-align.ts`, and used it at all three sites — including the
one that was missing it. This satisfies the "generic, not scenario-specific" bar: a
future fourth call site reuses the same tested primitive instead of re-deriving its
own copy. A second, smaller bug was found and fixed in the same pass: trimming
`results` without also recomputing `startCursor` from the new first item left
`bufferOffset` permanently stuck a few items above 0 (subsequent `extendBackward()`
calls keep re-fetching and discarding the same already-buffered items).

**Verification:** TDD failing-test-first (`search-store-extended.test.ts`, sweep of
6 adjacent target IDs × 2 column counts, subscribed to every `bufferOffset`
transition rather than time-sampled — 5/6 failed pre-fix reproducing the exact bug,
all 12 pass post-fix), full unit suite (960/960), full e2e suite (242/242, run
unsandboxed per user request), and 3 separate live embedded-browser repros post-fix
(bufferOffset trajectories like `824→624→424→224→24→0`, all cleanly divisible by 4;
cell position pixel-stable throughout). **Scope correction from this doc's original
§3 table:** two-tier and table density are genuinely structurally immune (confirmed
by code — global-index virtualization / `columns=1`), but **seek/deep-seek tier is
not** — it shares the exact same `offsetIsEstimate` code path and the exact same
(now-fixed) missing trim; this doc's earlier "seek tier: clean" conclusion only ever
established that `_topUpScrollModeBuffer` doesn't run there, not that the landing
itself was aligned. Not separately live-verified with a repro that also exercises
scrolling near the buffer edge afterward (which is what would expose an inherited
misalignment there, the way `_topUpScrollModeBuffer`'s automatic walk-to-zero did for
buffer tier) — the fix applies there regardless, since it's the same shared code.

**Not implemented / not needed:** §4.1's more invasive "carry remainder across
`extendBackward` calls" design was unnecessary once the true precondition-violation
site was fixed. **Correction (post-review) to this section's original claim:**
`extendBackward`'s existing audit-#9 trim-skip-guard is **not** provably
unreachable — that claim rested on two unstated assumptions, neither guaranteed: (1)
that ES always returns exactly the requested page size (PIT drift or deletions
between the landing's `countBefore` and the top-up's final fetch could return fewer
hits than requested even from an aligned, non-zero `bufferOffset`), and (2) that
`columns` doesn't change between the landing and the top-up's final closing prepend
— but `getScrollGeometry().columns` is a live mutable ref, updated on every render,
and a window resize or Browse/Details panel toggle during the ~0.5–1.5s settle
window changes it. Both are real, narrow, low-frequency windows (order of hundreds
of milliseconds, requiring an unlucky resize/short-page exactly mid-settle) —
reviewed and deliberately left as an accepted, documented trade-off rather than
implementing §4.1's more invasive design for it. If this symptom is ever reported
again with a resize/panel-toggle in the repro steps, this is where to look.

---


This picks up immediately after the two commits already on `mk-next-next-next`
(`5cf570e1d` "Fix scrubber stuck in seek-mode…", `34c168e41` "Fix sort-around-focus
scroll clobbered by scroll-mode buffer top-up…"). Those fixed a *different* bug
(`_bufferSelfCorrecting` / effect #8 clobbering scroll back to 0). **That fix is
confirmed still working correctly** — every repro in this doc's investigation showed
no `effect8` reset firing. This is a **second, distinct, pre-existing bug** that the
prior fix's own top-up mechanism now reliably triggers.

---

## 1. Symptom (user-reported)

Buffer tier (total ≤ `SCROLL_MODE_THRESHOLD`, default 1000), grid density, focus an
image, change sort order (toggle direction or pick a new field). The focused image is
correctly re-centred at first, then ~0.5–1.5s later (while the buffer quietly finishes
loading in the background) it visibly shifts sideways by roughly one column. Sometimes
the shift is barely perceptible, sometimes it's large enough to move the image off
the edge of the viewport, sometimes there's no shift at all (just a re-render flash).

## 2. Root cause — confirmed, reproduced twice with instrumentation

> **Superseded — see Resolution above.** The actual fix landed in
> `_findAndFocusImage`'s async offset-correction callback, not in `extendBackward()`
> as originally diagnosed here. This section is left as originally written for
> archaeological value (it's what the investigation looked like in the moment), but
> don't treat `extendBackward()` as the fix site — it was never modified.

**File:** `kupua/src/stores/search-store.ts`, `extendBackward()`, lines ~2509–2560.

```ts
const fetchCount = Math.min(PAGE_SIZE, bufferOffset);           // line 2509
...
const geo = getScrollGeometry();
if (geo.columns > 1 && result.hits.length % geo.columns !== 0) { // line 2542
  const excess = result.hits.length % geo.columns;
  if (result.hits.length > excess) {                             // line 2550 — THE BUG
    result.hits = result.hits.slice(excess);
    result.sortValues = result.sortValues.slice(excess);
  }
  // else: trim silently SKIPPED — unaligned batch committed as-is
}
```

This trim exists to keep every *already-buffered* item's column stable: prepending `N`
items to the front of the buffer shifts every existing item's `localIndex` (and hence
its rendered column, `localIndex % columns`) by `N`. If `N % columns !== 0`, **every
item in the grid silently changes column**, not just the new ones. The trim is
supposed to prevent this by always prepending a multiple of `columns`.

The `if (result.hits.length > excess)` guard was added 28 Apr 2026 (`changelog.md`
"audit #9") to fix a *different*, older bug: when the trim would empty the batch to
`[]`, `startCursor` never advanced and the last few items became permanently
unreachable. The fix's own stated rationale — *"there are no earlier items to cause
column misalignment anyway"* — is **incorrect**: it only reasons about items before the
new batch. It does not account for the fact that every item **already in the buffer**
still shifts by the unaligned batch size. This is exactly the mechanism this doc's
investigation caught live.

### 2.1 Live confirmation (numbers from actual instrumented runs, now removed from source)

Run A (misaligned — visible shift, screenshotted):
```
topup-extendBackward before=195 after=3     ← 195 items fetched, trimmed to 192 (aligned, 192%4=0), 3 left over
topup-extendBackward before=3   after=0     ← 3 items fetched, excess=3%4=3, guard `3 > 3` is FALSE → trim skipped, unaligned batch committed
```
Screenshot before/after this second call showed the focused cell sliding exactly one
column (columns=4 in the tested viewport).

Run B (aligned by coincidence — no visible shift):
```
topup-extendBackward before=456 after=256   (200, divisible by 4 — clean)
topup-extendBackward before=256 after=56    (200, divisible by 4 — clean)
topup-extendBackward before=56  after=0     (56, ALSO divisible by 4 — clean, no shift)
```
This matches the user's report of inconsistent symptoms exactly: whether the *final*
remaining gap happens to be a multiple of the current column count determines whether
the bug is visible at all.

### 2.2 Confirmed trigger sites (both call the same vulnerable code)

| Trigger | Call chain | Confirmed live? |
|---|---|---|
| Sort toggle, explicit focus | `sortAroundFocus()` (line ~1898) → `_findAndFocusImage` → (isInBuffer branch, line 1585) or (`_loadBufferAroundImage`, line 1202) → `void _topUpScrollModeBuffer(get)` (line 1028) → `extendBackward()` | Yes, twice |
| Image-detail reload restore | `restoreAroundCursor` → `_loadBufferAroundImage` → `void _topUpScrollModeBuffer(get)` → `extendBackward()` | Yes, once (aligned this run — same code, not yet caught mid-shift) |
| **Ordinary scroll near the buffer's start edge** | `useDataWindow.ts` `reportVisibleRange` → `extendBackward()` directly (lines ~409, ~435), **completely independent of the top-up mechanism** | **Not live-tested this session** — found by code reading only. Flagged as likely also vulnerable; see §5 open item. |

The third row matters: `extendBackward()` is the shared choke point. A fix scoped only
to `_topUpScrollModeBuffer`'s caller would leave ordinary backward-scrolling exposed to
the identical bug. **Fix `extendBackward()` itself, not its callers.**

## 3. Scope — confirmed unaffected (do not touch, do not add tests beyond a quick regression check)

All confirmed live, this session, with screenshots/instrumentation:

| Surface | Why it's immune | Confirmed how |
|---|---|---|
| Two-tier (1000 < total ≤ 65000) | `_topUpScrollModeBuffer` bails (`myTotal > SCROLL_MODE_THRESHOLD` guard, line ~1031); virtualizer uses **global** index (`toVirtualizerIdx`, `useScrollEffects.ts` ~line 45), so `bufferOffset` changes never move an item's column | Live repro: sort toggle on a 12,520-doc two-tier query, no `topup-START` log ever fired, position stable |
| Seek tier (total > 65000) | Same — topup never runs | Live repro: sort toggle on the full 1.32M-doc corpus, no shift |
| Home/logo reset | Clears filters → lands in seek tier | Live repro |
| Table density | `ImageTable.tsx` registers `geometry.columns = 1` (line ~770); `x % 1` is always `0`, so the trim guard and effect #4's compensation are trivially no-ops/exact | Live repro: same sort-toggle scenario in table view, 5-step topup, zero pixel drift |
| Panel toggle (Browse/Details), explicit **or phantom** focus | Completely separate mechanism (`ImageGrid.tsx` `captureAnchor` + column-count-change `useLayoutEffect`, ~lines 449–614) that never touches the fetch/buffer layer at all | Live repro: both explicit-focus and phantom-focus panel opens, viewport row (`y`) stayed pixel-identical |
| Phantom focus + **sort-only** change | Effect #7 in `useScrollEffects.ts` explicitly gates viewport-anchor promotion on `!sortOnly` — no scroll preservation is attempted at all, by design | Confirmed via code + user's own live observation (resets to top, expected) |

**Do not generalize the fix to two-tier, seek, or table density paths.** They don't
need it and any change there is pure regression risk for zero benefit.

## 4. Recommended fix

> **Superseded — see Resolution above.** Neither §4.1 nor §4.2 below is what was
> actually implemented; the real fix was simpler (align the async-correction landing
> itself via a new shared `alignBufferStart()` utility) and didn't require touching
> `extendBackward()` at all. Left as originally written for archaeological value.

### 4.1 Primary fix — `extendBackward()`, make the trim unconditional (no skip escape hatch)

The skip-guard exists to avoid resurrecting audit #9 (permanent block when the trim
would empty the batch). But "commit an unaligned batch" is not the only alternative to
"discard it and get stuck forever" — the actual fix for audit #9 should have been
**advance the cursor without corrupting alignment**, not **accept misalignment**.

Concretely: when `result.hits.length <= excess` (the batch is smaller than one column's
worth), the batch cannot be aligned on its own — but it *can* still be **merged into the
buffer without ever exposing a partially-shifted intermediate state**, by folding it into
the buffer directly when it's the batch that reaches `bufferOffset === 0` and there's
nothing earlier to protect against misaligning:

- If, after committing this batch, `newOffset > 0`: **do not skip the trim.** Instead,
  don't commit yet — hold the fetched (unaligned) items and let `bufferOffset` advance
  the cursor (`startCursor`) so the *next* `extendBackward` call fetches the next
  chunk **and combines it with the held remainder before applying the trim to the
  combined set**. This guarantees every *committed* prepend is a multiple of `columns`,
  with no items ever permanently lost (fixes audit #9 correctly) and no misalignment
  ever surfacing (fixes this bug).
- If, after committing this batch, `newOffset === 0` (this genuinely is the last
  possible fetch — nothing remains before it): committing it *as-is* is provably safe
  **only if `bufferOffset` (before this call) was already a multiple of `columns`** —
  because then `fetchCount === bufferOffset` is also a multiple of `columns`
  automatically, and `excess` is `0` (the buggy branch is never entered in the first
  place). See §5 — this precondition needs to be independently guaranteed, which is
  why this is not sufficient as a standalone fix.

**Simpler alternative if the above "carry a remainder" design is too invasive:** make
`extendBackward` refuse to close the final gap in a way that ever produces
`result.hits.length % geo.columns !== 0` for a *non-empty, non-total-closing* batch, by
changing `fetchCount` itself:

```ts
// Instead of: const fetchCount = Math.min(PAGE_SIZE, bufferOffset);
// Round the *target* down so the count we ask for is always alignable:
const remainder = bufferOffset % geo.columns; // geo from getScrollGeometry()
const fetchCount = bufferOffset <= PAGE_SIZE
  ? bufferOffset               // closing the gap entirely — see precondition above
  : PAGE_SIZE - ((PAGE_SIZE - remainder) % geo.columns); // keeps (bufferOffset - fetchCount) aligned
```

This is more surgical but only works if §5's precondition (bufferOffset always enters
`extendBackward` already congruent to 0 mod columns) holds — otherwise it's polishing
the wrong invariant. **Do §5 first.**

### 4.2 Precondition fix — bufferOffset must be congruent to 0 (mod columns) at every landing site

This is the actual root invariant. Trace (algebra, not yet instrumented-confirmed to
the exact line):

- A fresh page-1 `search()` landing always starts `bufferOffset = 0` — trivially a
  multiple of any `columns`.
- `extendForward()`'s own eviction already rounds up to a multiple of columns
  (`search-store.ts` ~line with `Math.ceil(rawEvict / cols) * cols`) — correct, no
  action needed there.
- `_loadBufferAroundImage()` (line 1202, trim at 1238–1259) computes `bufferStart` via
  `rawBufferStart + trim` where `trim` is explicitly `(cols - (rawBufferStart % cols)) %
  cols` clamped to available backward hits — **this is correct by construction**,
  *provided* it has enough backward-fetched items to cover the trim (it requests
  `Math.floor(PAGE_SIZE / 2)` = 100 backward, so this should only fail within ~3 items
  of the absolute start of the result set — an edge case, not the common one observed).
- **If `4.1`'s fix is applied to `extendBackward` alone, and `bufferOffset` is provably
  always a multiple of `columns` on entry to every `extendBackward` call, the terminal
  skip-guard branch becomes unreachable** — the fix in §4.1's "simpler alternative"
  collapses to being sufficient, and §4.1's more invasive "carry remainder" design is
  unnecessary. This is the cleanest possible fix — confirm the precondition first.

**Open question (see §5): during the live investigation, `_topUpScrollModeBuffer`'s own
`topup-START` log occasionally captured a `bufferOffset` that was NOT a multiple of the
observed `columns` (e.g. 801, 395, with columns=4) even before `extendBackward` had run
at all this session on that page.** This session did not fully pin down which call sets
that value, or whether it's `_loadBufferAroundImage` misbehaving under some condition
(e.g. running out of backward hits to trim), the `isInBuffer` branch inheriting a stale
pre-sort `bufferOffset` that had already drifted from a much earlier interaction, or
something else. **This must be resolved before implementing 4.1's "simpler
alternative"** — otherwise the fix will just move the same bug to a different, less
frequently observed trigger.

## 5. First task for the next session — pin down the precondition violation

Before writing any fix code, re-establish exactly where `bufferOffset` first becomes
non-canonical. This is fast to do with the same technique already proven this session
(≈15–20 minutes):

1. Start the local dev server (`npm --prefix kupua run dev` or reuse whatever's
   running on `:3000` — check with `lsof -iTCP -sTCP:LISTEN -n -P | grep 3000` first).
2. Add **one** temporary debug line at the top of `extendBackward()` (right after the
   `bufferOffset <= 0` guard, before `fetchCount` is computed), and one at the top of
   `_loadBufferAroundImage()`'s call site inside `_findAndFocusImage` (right after
   `set({ ...bufferOffset: buf.bufferStart... })`, line ~1683), and one right where the
   `isInBuffer` branch is entered (line 1585 area):
   ```ts
   (window as any).__debug__ = (window as any).__debug__ || [];
   (window as any).__debug__.push({
     t: Date.now(), tag: "<site-name>",
     bufferOffset: <value>, columns: getScrollGeometry().columns,
     aligned: <value> % getScrollGeometry().columns === 0,
   });
   ```
   (`getScrollGeometry` is already imported in `search-store.ts`.)
3. **Verify the dev server picked up the edit before trusting any output** — this bit a
   prior session: `curl -s http://localhost:3000/src/stores/search-store.ts | grep -c
   "<your-marker-tag>"` must return `1`, not `0`.
4. In the embedded browser (see `embedded-browser-playbook.md` before starting — it has
   the full technique catalogue): navigate to
   `https://kupua.media.local.dev-gutools.co.uk/search?nonFree=true&orderBy=uploadTime&query=credit:%22Action%20Images%2FReuters%22`
   (buffer tier, 958 docs, confirmed pinned for this investigation), clear
   `localStorage`/`sessionStorage`, reload, wait for `loading === false`, scroll to a
   mid-list position, click a grid cell to focus, clear `window.__debug__`, click the
   sort-direction toggle (`button[aria-label*="Sort ascending"], button[aria-label*="Sort
   descending"]`), wait ~2s, read `window.__debug__` back.
5. Repeat 3–5 times (fresh `page.goto()` + storage clear each time — reusing a page
   risks stale-storage confounds, see playbook §3) to catch a run where the FIRST
   `bufferOffset` write is non-canonical, and read off which `tag` produced it.
6. **Remove the instrumentation before writing the fix** (must never be committed —
   check `git diff --stat` on both files is empty before finishing).

Once the source of the initial misalignment is found, decide between:
- Fix it at the source (make that specific site always land a canonical `bufferOffset`)
  → then `extendBackward`'s "simpler alternative" fix (§4.1) is sufficient on its own.
- If multiple sources exist and can't all be practically fixed → implement the more
  invasive "carry remainder across calls" design in `extendBackward` (§4.1, first
  bullet) as a universal safety net that's correct regardless of what `extendBackward`
  is handed.

**Either way, `extendBackward`'s trim must end up provably never committing an
unaligned batch except when doing so is mathematically forced (i.e. never) — that's
the "generic, not scenario-specific" bar the fix needs to clear.**

## 6. TDD procedure

Write tests **before** touching implementation. Use `search-store.test.ts` and/or
`search-store-extended.test.ts` (both already have `registerScrollGeometry` harness
support with configurable `columns` — see repo memory `kupua-search-store-test-harness.md`
for the existing test-store setup pattern).

### 6.1 Step 1 — failing test proving the bug (property-based, not a magic-number regression test)

Do **not** write a test that asserts one specific before/after offset pair (e.g.
"3→0 with columns=4") — that's exactly the "guard for something super-specific" pattern
the user explicitly does not want. Instead assert the **invariant**:

> After any sequence of `extendBackward()` calls driven by `_topUpScrollModeBuffer` (or
> called directly in a loop until `bufferOffset === 0`), for every item currently in
> `results`, `(imagePositions.get(item.id) - bufferOffset) % columns === item's
> original/expected column` — equivalently and more simply: **`bufferOffset % columns
> === 0` must hold after every single `extendBackward()` call that leaves
> `bufferOffset > 0`, and must also hold at `bufferOffset === 0`.**

Concrete test shape:
```ts
it.each([2, 3, 4, 5, 6])(
  "extendBackward never leaves bufferOffset misaligned to columns=%i",
  async (columns) => {
    registerScrollGeometry({ rowHeight: GRID_ROW_HEIGHT, columns, isTable: false });
    // Seed a buffer-tier store (total ≤ SCROLL_MODE_THRESHOLD) landed at some
    // non-zero, DELIBERATELY misalignment-prone offset (e.g. total=958,
    // seeded bufferOffset picked so total % columns and PAGE_SIZE % columns
    // interact adversarially — try a few odd totals, not just 958).
    ...
    while (state().bufferOffset > 0) {
      await actions().extendBackward();
      expect(state().bufferOffset % columns).toBe(0); // <-- the actual contract
    }
  },
);
```
Run this against current `main`/`mk-next-next-next` first — **confirm it fails for the
right reason** (assert the failure message shows a non-zero remainder, not an unrelated
crash) before writing any fix code.

### 6.2 Step 2 — confirm existing audit #9 regression test still passes after the fix

`search-store-extended.test.ts` — describe block **"extendBackward column-trim guard
(audit #9)"** (added 28 Apr 2026). This test explicitly asserts the *old* bug (permanent
block) doesn't regress. The fix in §4.1 must keep this passing — re-read it before
implementing, since if the fix changes `extendBackward`'s calling contract (e.g. batches
now span multiple calls before landing), this test's assertions about "one call, offset
reaches 0" may need updating to "N calls, offset reaches 0 eventually, no permanent
block." **If it needs changing, that's a signal the fix design changed observable
behaviour — update the test deliberately, don't just make it pass by weakening the
assertion.**

### 6.3 Step 3 — sort-around-focus and restoreAroundCursor integration tests

Existing tests already cover both flows in `search-store.test.ts` (search for
`"sort-around-focus"` and `"restoreAroundCursor"` describe blocks) and
`search-store-extended.test.ts` ("fills entire buffer after sort-around-focus outside
first page"). None of them currently assert column-alignment because `columns` wasn't a
concern before. Add one assertion to the existing "buffer positions are correct after
sort-around-focus" test (`search-store-extended.test.ts` ~line 420) checking
`bufferOffset % columns === 0` at the end, using a `columns` value from
`registerScrollGeometry` that's deliberately NOT 1 (existing tests may default to
`columns: 1`, which would trivially hide this whole bug class — verify and change to a
realistic value like 4 if so).

### 6.4 Step 4 — e2e regression (only if the fix changes timing/observable scroll behaviour)

Per the repo's own test-surface directive: run `npm --prefix kupua run test:e2e` after
any component/hook/store change (warn the user about port `:3000` first, per repo
memory `kupua-playwright-warning.md`). Specifically re-check
`kupua/e2e/local/scrubber.spec.ts` (the test added by the prior `_bufferSelfCorrecting`
fix) — it already polls until `results.length >= total` (i.e. `bufferOffset === 0`)
before asserting focus visibility; if this fix changes how many `extendBackward` calls
that takes, the test's own polling should still work unmodified, but re-run it to
confirm.

### 6.5 What "done" looks like

- New property-style test (§6.1) passes for at least `columns ∈ {2,3,4,5,6}` and at
  least 2–3 different `total` values chosen to stress different `PAGE_SIZE % columns`
  and `total % columns` remainders (don't just use 958 — that's this session's incidental
  test corpus size, not a meaningful boundary).
- Audit #9 regression test (§6.2) still passes, updated deliberately if the fix changes
  its assumptions (not silently weakened).
- No `columns > 1` assumption anywhere lets an unaligned prepend/evict through — grep
  `search-store.ts` for `% geo.columns` and `% columns` after the fix to confirm every
  site (there are at least three: `extendBackward`'s trim, `extendForward`'s eviction
  rounding, `_loadBufferAroundImage`'s trim) agrees on the same invariant.
- Full unit suite (`npm --prefix kupua test`) green.
- Full e2e suite green (with the port warning given to the user first).
- Manual re-verification in the embedded browser: repeat §5's repro steps 5+ times,
  confirm zero visible column shift in every run (not just the specific 3-item and
  56-item cases this session happened to catch).
- Table density, two-tier, seek tier, panel toggle (explicit + phantom focus), and
  phantom-focus-sort-only re-spot-checked to confirm still unaffected (§3) — these don't
  need new permanent tests (they were already safe by construction), just a quick
  sanity pass since the fix touches shared code (`extendBackward`) that two-tier/seek
  don't call into it via this trigger, but do call into it via ordinary scrolling.

## 7. Commit scope

Per user direction: commit **only** the fix (source + new/amended tests) — do not
include the other currently-uncommitted files in this working tree
(`dev/nginx-mappings.yml.template`, `kupua/AGENTS.md`,
`kupua/exploration/docs/worklog-current.md`, the various untracked docs). Use
`git add` on the specific fixed files, not `git add kupua/` wholesale, for this commit.
Follow the repo's commit-message directive (heredoc/temp file + `git commit -F`, never
a multiline `-m`).

## 8. Reference

- Prior, related, already-landed fix: commits `5cf570e1d`, `34c168e41` on
  `mk-next-next-next` (confirmed still correct, not touched by this bug).
- Review of that fix: `kupua/exploration/docs/zz Archive/R-2026-07-31-buffer-self-correcting-fix-review.md`
  (uncommitted at time of writing — not this doc's concern, left as-is per commit scope above).
- Audit #9 original fix: `kupua/exploration/docs/changelog.md`, entry "28 April 2026 —
  Bug-hunt Batch B: `extendBackward` column-trim discards final items (audit #9)".
- Position-preservation architecture: `kupua/exploration/docs/position-preservation-reference.md`
  (not read in detail this session — worth a skim before implementing, may already
  document the intended `bufferOffset`/`columns` contract).
- Embedded-browser technique notes: `kupua/exploration/docs/embedded-browser-playbook.md`.
