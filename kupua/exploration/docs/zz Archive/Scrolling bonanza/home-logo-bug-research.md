# Home Logo Bug — Research Log

## Bug Description
Fresh app, 1.3M results. Seek deep via scrubber. Click Home logo.
**Expected:** Grid shows index 1 at top-left, scrollTop=0.
**Actual:** Grid lands at ~index 170-198, scrollTop=6969. Buffer has 400 items (should be 200). First 200 are stale images from 2022, second 200 are correct 2026 images.

## Confirmed Facts (from diagnostics)

### Fact 1: The causal chain
```
Logo onClick handler (synchronous):
  1. resetSearchSync()
  2. resetScrollAndFocusSearch()
     → el.scrollTop = 0
     → el.dispatchEvent(new Event("scroll"))    ← SYNCHRONOUS
       → handleScroll()
         → reportVisibleRange(0, ~50)
           → startIndex=0 ≤ EXTEND_THRESHOLD, bufferOffset > 0
           → extendBackward() fires             ← THE ROOT PROBLEM
             → await searchAfter(PIT-based)     ← yields
  3. store.setParams(...)
  4. store.search()
     → _rangeAbortController.abort()            ← too late for the 404 race
     → search fetches first page...
```

### Fact 2: The PIT-404 retry escapes abort
- extendBackward's fetch hits 404 (PIT was closed by search())
- The 404 response arrives BEFORE the abort signal propagates
- The catch clause retries without PIT
- signal?.aborted check was added but signal is NOT aborted at check time
  (fetch resolved with 404 before abort signal fired — microtask race)
- The retry succeeds and returns 200 stale items

### Fact 3: The prepend corrupts the buffer
- search() completes: buffer = 200 correct items at offset 0
- extendBackward retry completes ~300ms later: PREPENDS 200 stale items
- Buffer = 400 items. Items 0-199 from 2022, items 200-399 from 2026
- imagePositions map has collisions (200 errors)
- Prepend scroll compensation: scrollTop += ceil(200/9) * 303 = 6969

### Fact 4: Home key works, logo doesn't
- Home key calls seek(0) which bumps _seekGeneration and sets cooldown
- Logo calls resetScrollAndFocusSearch() + search() — no cooldown set

### Fact 5: Bug is cross-browser (Chrome + Firefox)

## Hypotheses Tested

### H1: Seek cooldown not refreshed at data arrival (PARTIALLY CORRECT)
**Test:** Restored `_seekCooldownUntil = Date.now() + 500` at seek data arrival.
**Result:** FAILED. The cooldown expires 500ms after data arrives. If the user waits >500ms before clicking logo, the cooldown has expired and extendBackward fires anyway.
**Learning:** Cooldown was never the right defense for the logo click path — it only protects against extends during the ~500ms after a seek. The logo click can happen at any time.

### H2: Abort check before PIT retry (PARTIALLY CORRECT)
**Test:** Added `if (signal?.aborted) return empty` before the retry.
**Result:** FAILED. The abort signal is not yet aborted when the catch clause runs. The 404 response resolves before search()'s abort() fires due to microtask ordering: the fetch promise resolves before synchronous code after the yield runs.
**Learning:** Can't rely on the abort signal to prevent the retry — microtask race.

### H3: abortExtends() before synthetic scroll (FIX ATTEMPT 3)
**Insight:** The problem is that `extendBackward` fires SYNCHRONOUSLY from the synthetic scroll event — before `search()` has any chance to abort anything. The abort controller and cooldown are module-private, so external callers can't suppress extends.
**Fix:** Expose `abortExtends()` on the store. It aborts the range controller, creates a new one, sets a 2-second cooldown, and clears in-flight flags. Call it from the logo onClick BEFORE `resetScrollAndFocusSearch()`. Now when the synthetic scroll fires `extendBackward`, the cooldown guard blocks it synchronously.
**Why 2 seconds:** The cooldown must survive long enough for search() to complete and replace the buffer. 500ms was too short for H1; 2 seconds is generous.
**Defense in depth:** The `signal?.aborted` check in es-adapter (H2) is kept. The `_seekCooldownUntil` refresh at data arrival (H1) is kept. Belt, suspenders, and duct tape.

## Resolution

**Option B was chosen** — set a guard BEFORE the synthetic scroll that
`extendBackward` checks. Implemented as `abortExtends()` (H3), then
generalised:

- `resetScrollAndFocusSearch()` now calls `abortExtends()` internally
  (Layer 1 — covers logo clicks and any future caller)
- `search()` now sets a 2-second cooldown (Layer 2 — covers metadata
  clicks, filter changes, CQL query changes via URL sync)
- H1 (seek cooldown refresh) and H2 (`signal?.aborted` check) kept as
  secondary defense layers

All 5 layers are documented in **`buffer-corruption-fix.md`** (same
directory) with full analysis of consequences and side effects.

### Bonus: deep-seek visual stability
The cooldown in `search()` (Layer 2) also eliminates the reordering flashes
previously visible during deep seeks — extends no longer race with the
seek's buffer replacement, so cells don't get prepended and evicted in
rapid succession.
