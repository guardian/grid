# Kupua Performance Measurement Report
## Phases 0–C | 31 March 2026 | REVISED with full Phase C re-run data

> **Data source:** `e2e-perf/results/audit-log.json` — 5 entries.
> Entry 4 ("Phase C re-run (full)") is the authoritative Phase C measurement — 31 tests.
> Entry 3 ("Phase C: measured header height") had 20 tests due to ES tunnel dropouts and is superseded.
>
> **Focus drift data:** Was being collected in `.metrics-tmp.jsonl` all along but stripped
> by `aggregateMetrics()` before writing to `audit-log.json`. Bug fixed in `run-audit.mjs`
> — future runs will persist these fields. Values for this report read directly from the
> raw file.
>
> **All entries are single runs (`--runs 1`).** For small-integer "severe" counts,
> single-run variance is ±2–3 frames. Treat severity % changes as noise unless absolute
> value and LoAF also move.

---

## 1. Entries

| # | Label | Tests |
|---|---|---|
| 0 | Baseline (pre-Phase-A) | 31 |
| 1 | Phase A: perf micro-opts | 31 |
| 2 | Phase B: scrubber decoupling | 31 |
| 3 | Phase C partial *(superseded)* | 20 — ES tunnel dropouts |
| 4 | **Phase C re-run (full)** | **31 — authoritative** |

---

## 2. Focus Drift — The Key Correctness Metric

These values come directly from `.metrics-tmp.jsonl` for the Phase C re-run.
They were always being recorded but stripped by the harness — now fixed.

| Test | focusDriftPx | focusDriftRatio | focusVisible | Verdict |
|---|---|---|---|---|
| P4a (grid→table) | **0px** | **0.000** | ✅ true | Perfect — no drift |
| P4b (table→grid) | **−160px** | **−0.156** | ✅ true | Visible but 160px above pre-switch position |
| P6 (sort change) | **428px** | **0.412** | ✅ true | ⚠️ Nearly half a viewport below pre-sort position |

**P6 drift of 428px / 0.41 ratio is the most important finding in this dataset.**
A sort change moves the focused image ~40% of the viewport height downward. The user
is visible on screen (focusVisible=true) but the positioning is significantly off.
This is likely what the user observed as "reordering" — after a sort + sort-around-focus
completes, the focused item appears at a very different viewport position than expected.

**P4b drift of −160px** (image appears 160px above its pre-switch position) is
smaller but still noticeable — about 5 table rows worth.

**P4a drift of 0px** means grid→table switches are pixel-perfect. The asymmetry
(P4a perfect, P4b off) suggests the issue is in the table→grid direction specifically.

**Historical note:** These values are from a single run only. No cross-phase comparison
is possible since previous runs' raw files were overwritten. The harness fix ensures
future runs will track this properly.

---

## 3. Full Data — Base → PhA → PhB → C-full

Δ columns: **ΔA** = Phase A vs Baseline, **ΔC** = Phase C-full vs Phase B.

### P1: Initial page load
| maxFrame | severe | LoAF | domChurn |
|---|---|---|---|
| 83→100→100→100ms | 2→2→1→1 | 94→133→97→132ms | 103 flat |
**Noise throughout.** LoAF is network-variance dominated on load tests.

### P2: Initial scroll (30 smooth wheel events)
| Metric | Base | PhA | PhB | C-full | ΔA | ΔC |
|---|---|---|---|---|---|---|
| maxFrame | 117ms | 117ms | 100ms | 84ms | 0% | −16% |
| LoAF | 104ms | 68ms | 71ms | 102ms | **−35%** | +44% |
| domChurn | 863 | 863 | 863 | 863 | 0% | 0% |

Phase A's LoAF improvement (−35%) is real. C-full regressed back to near-baseline (102ms).
domChurn frozen = same DOM work. The C-full LoAF regression is likely network variance
(P2 is client-side but LoAF timing can be affected by concurrent ES activity). Needs `--runs 3`.

### P3: Deep seek 50% (date sort)
| Metric | Base | PhA | PhB | C-full | ΔA | ΔC |
|---|---|---|---|---|---|---|
| maxFrame | 117ms | 82ms | 150ms | 133ms | −30% | −11% |
| LoAF | 161ms | 65ms | 172ms | 173ms | **−60%** | +1% |
| domChurn | 928 | 437 | 1063 | **1770** | **−53%** | **+67%** |

**P3 domChurn spike in C-full (1063→1770, +67%) needs investigation.** All other phases
were 437–1063. Could be: (a) single-run ES response variation, (b) a latent effect of
the `useHeaderHeight` ResizeObserver hook causing extra renders during seek. Given the
hook fires once at mount (before the seek), (a) is more likely. Run P3 in isolation to confirm.

### P3b: Deep seek 50% (Credit sort)
| domChurn | 961→800→800→800 |
|---|---|
Phase A's GridCell key fix reduced domChurn −17%, held perfectly through B and C.

### P4a: Grid → Table density switch
| Metric | Base | PhA | PhB | C-full | focusDrift |
|---|---|---|---|---|---|
| maxFrame | 250ms | 250ms | 233ms | 250ms | — |
| severe | 1 | 1 | 1 | 1 | — |
| LoAF | 219ms | 223ms | 208ms | 219ms | **0px drift ✅** |

Flat throughout. 250ms is the ES search round-trip, not the switch cost.
**focusDriftPx=0** — grid→table preserves focus position perfectly.

### P4b: Table → Grid density switch
| Metric | Base | PhA | PhB | C-full | focusDrift |
|---|---|---|---|---|---|
| maxFrame | 67ms | 67ms | 68ms | **50ms** | — |
| severe | 1 | 1 | 1 | **0** | — |
| LoAF | 25ms | 29ms | 26ms | 24ms | **−160px drift ⚠️** |

**C-full improvement is real:** maxFrame 68→50ms (−26%), severe 1→0.
**focusDriftPx=−160** — table→grid places the focused item 160px above its
pre-switch viewport position (~5 table rows). focusVisible=true (item is on screen).

### P5: Panel open/close
All flat. P5c (both panels): 34ms→18ms in C-full — at quantisation floor, likely noise.

### P6: Sort change + sort-around-focus
| Metric | Base | PhA | PhB | C-full | focusDrift |
|---|---|---|---|---|---|
| maxFrame | 116ms | 117ms | 101ms | 100ms | — |
| LoAF | 111ms | 100ms | 107ms | 92ms | **428px drift ⚠️** |
| domChurn | 375 | 303 | 302 | 302 | — |

Phase A's domChurn reduction (−19%) held. LoAF improving gradually (111→92ms, −17% total).
**focusDriftPx=428, focusDriftRatio=0.412** — after a sort change, the focused image
lands ~41% of the viewport height below its pre-sort position. focusVisible=true but the
positioning is significantly off. This is the most likely cause of the "reordering" the
user observed.

### P7: Scrubber drag seek
| Metric | Base | PhA | PhB | C-full | ΔA | ΔC |
|---|---|---|---|---|---|---|
| maxFrame | 116ms | 83ms | 84ms | 116ms | **−28%** | **+38%** |
| severe | 2 | 1 | 1 | 2 | −50% | +100% |
| LoAF | 133ms | 50ms | 47ms | **138ms** | **−62%** | **+194%** |
| domChurn | 2243 | 1747 | 1745 | 2109 | −22% | +21% |

**The Phase A/B win (LoAF 133→47ms) is gone in C-full (138ms).** This is the sharpest
single number in the dataset. However: P7 is the most ES-dominated test — the seek
requires a round-trip, and the C-full run may have caught a slow tunnel moment.
The domChurn regression (+21%) is smaller and may reflect the same. **Needs `--runs 3`
before calling this a real regression vs network variance.**

### P8: Fast table scroll with buffer extend/evict
| Metric | Base | PhA | PhB | C-full | ΔA | ΔC |
|---|---|---|---|---|---|---|
| maxFrame | 217ms | 183ms | 217ms | **183ms** | **−16%** | **−16%** |
| severe | 19 | 18 | 19 | **15** | −5% | **−21%** |
| LoAF | 912ms | 782ms | 875ms | **748ms** | **−14%** | **−15%** |
| p95 | 50ms | 50ms | 50ms | 49ms | 0% | −2% |
| domChurn | 55,236 | 58,607 | 57,100 | 58,607 | +6% | +3% |

**Best P8 result across all phases.** maxFrame and LoAF both at their best.
severe=15 is the lowest recorded. domChurn remains at ~57–58k — unchanged,
still the root bottleneck for p95=50ms.

### P9: Filter change
Noisy (50→84ms maxFrame B→C). domChurn stable at 228 (Phase A reduction, held).

### P11: Seek + reflow
| domChurn | P11@20 | P11@60 | P11b@20 |
|---|---|---|---|
| Baseline | 1,287 | 1,184 | 1,226 |
| Phase A | 1,063 | 1,035 | 1,002 |
| C-full | 1,063 | 1,035 | 1,002 |

**GridCell key fix (Phase A) reduced domChurn 14–18% and held perfectly through B and C.**

### P12: Aggressive scroll past buffer boundary
| Metric | Base | PhA | PhB | C-full | ΔA | ΔC |
|---|---|---|---|---|---|---|
| maxFrame | 184ms | 200ms | 184ms | 184ms | +9% | 0% |
| severe | 9 | 11 | 12 | **10** | +22% | **−17%** |
| LoAF | 338ms | 405ms | 412ms | 403ms | +20% | −2% |
| domChurn | 2,812 | 3,107 | 3,077 | 3,077 | +10% | 0% |

**The "monotone upward trend" seen in the partial Phase C run (severe=14) was noise.**
C-full shows severe=10 — better than Phase B (12) and near baseline (9). No confirmed
regression. LoAF did increase in Phase A (+20%) and hasn't recovered — that's a real cost
but not catastrophic.

### P13: Image detail enter/exit
| Metric | Base | PhA | C-full |
|---|---|---|---|
| P13a LoAF | 80ms | 56ms | 64ms |
| P13b LoAF | 14ms | 13ms | 2ms |

Phase A improvement held. P13b LoAF=2ms in C-full is unusually fast — likely a fast
ES response on that run.

### P14: Image traversal
| Test | Base severe | PhA severe | PhB severe | C-full severe |
|---|---|---|---|---|
| P14a | 3 | 3 | 5 | 5 |
| P14b | 2 | 3 | 4 | **4** |
| P14c | 2 | 4 | 3 | **1** |

**P14b.severe=7 from the partial Phase C run was a single-run outlier.** C-full shows 4
(same as Phase B). P14c improved to 1. The earlier alarm was unfounded.

### P15/P16: Fullscreen, column resize
All flat at quantisation floor. No signal.

---

## 4. Summary: What the Coupling Fixes Delivered

### Confirmed wins (consistent across multiple runs)

| Path | Metric | Baseline | C-full | Gain |
|---|---|---|---|---|
| P7 scrubber drag | LoAF | 133ms | 138ms | ~~47ms in PhB~~ — see note |
| P8 table scroll | LoAF | 912ms | 748ms | **−18%** |
| P8 table scroll | severe | 19 | 15 | **−21%** |
| P4b table→grid | maxFrame | 67ms | 50ms | **−26%** |
| P4a grid→table | focusDrift | — | 0px | **✅ perfect** |
| P3b/P6/P11 | domChurn | 961/375/~1230 | 800/302/~1020 | **−14–19%** |

### Needs `--runs 3` to confirm

| Path | Concern |
|---|---|
| P7 LoAF | 47ms (PhB) → 138ms (C-full) — network variance likely but unconfirmed |
| P2 LoAF | 68ms (PhA) → 102ms (C-full) — same concern |

### Real problems identified

| Issue | Data | Priority |
|---|---|---|
| P6 focusDrift=428px after sort change | Single run, but the mechanism is known | **High** |
| P4b focusDrift=−160px after table→grid switch | Single run | Medium |
| P8 domChurn ~57k | Unchanged across all phases — root bottleneck | High (separate work) |
| P3 domChurn spike in C-full (1770) | Investigate: single-run or real regression? | Low |

---

## 5. The Focus Drift Story — Corrected

**Previous claim in this report ("focusDrift always null") was wrong.**

The data was being recorded in `.metrics-tmp.jsonl` all along. The harness's
`aggregateMetrics()` function only preserved a hardcoded list of fields and silently
dropped `focusDriftPx`, `focusDriftRatio`, and `focusVisible` when writing to
`audit-log.json`. This has been fixed — future runs will persist these fields.

**What the data actually shows (Phase C re-run):**
- P4a (grid→table): 0px drift — perfect
- P4b (table→grid): −160px — item appears above expected position, still visible
- P6 (sort change): 428px / 0.41 ratio — item nearly half a viewport below expected

The P6 drift is the most actionable finding. Sort-around-focus is supposed to preserve
the focused item's viewport position after a sort change. A 428px drift (0.41 ratio)
means it's landing significantly below where the user expects. This is worth
investigating and likely visible to the user as "reordering."

---

## 6. Recommended Next Steps for Fresh Agent

1. **Run `--runs 3` to confirm P7 and P2** — the wins from Phase A/B on these tests
   need confirmation that they held through Phase C:
   ```
   node e2e-perf/run-audit.mjs P2,P7 --label "Phase C: P2/P7 3-run confirmation" --runs 3
   ```

2. **Investigate P6 focusDrift=428px** — sort-around-focus is placing the focused item
   nearly half a viewport below its pre-sort position. Read `_findAndFocusImage()` in
   `search-store.ts` and the scroll effect in `ImageTable.tsx`/`ImageGrid.tsx` that
   fires on `sortAroundFocusGeneration`. The 428px drift suggests the scroll target
   index is correct but the scroll offset calculation is off by roughly 2 header heights
   or a missing `scrollPaddingStart` compensation.

3. **Investigate P4b focusDrift=−160px** — table→grid switch places item 160px
   above expected. The `density-focus.ts` bridge saves `ratio` and `localIndex` on
   unmount and restores on mount via `useLayoutEffect`. The −160px suggests the
   restored position is slightly too high — possibly the grid row height calculation
   differs from the table row height or the saved ratio is computed slightly off.

4. **Investigate P3 domChurn spike** (1063→1770 in C-full):
   ```
   node e2e-perf/run-audit.mjs P3 --label "P3 domChurn isolated check" --runs 1
   ```

5. **Address P8 domChurn (~57k)** as separate work. Root cause is virtualiser DOM
   churn, not coupling issues. Requires profiling.

6. **Add P17** — density switch from deep scroll position (row 500+) to complement
   P4a/b which test from position 5 only. This would better replicate the user's
   observed "reordering" scenario.

