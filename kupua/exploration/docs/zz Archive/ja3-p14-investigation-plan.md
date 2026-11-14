# JA3 + P14 Investigation Plan (transient)

> **Status:** transient working doc. Archive or delete once JA3 is resolved
> (fixed or explicitly accepted) and P14 has either a fix or a documented
> dead-end. Findings of lasting value go to `changelog.md`; lessons about
> process go to `copilot-instructions.md` or user memory.

> **Why one doc, not two:** JA3 is a focused bisect-and-profile task. P14
> needs profiling infrastructure (React Profiler / render-count markers).
> Whoever stands up that infrastructure for P14 will also benefit JA3's
> profile step, and vice versa. Designing them together avoids building
> the same scaffolding twice.

---

## Part A — JA3 (metadata-click latency regression)

### Premise

Empirical: JA3 (single-image metadata click → detail panel open) was
~287ms in late April, ~988ms in mid-May. ~3.5× regression. The audit's
"long-baseline vs last entry" table showed this; the pre/post wasteful-
work-commit delta (entries 33→34) showed the wasteful-work commits did
**not** move it. So JA3 is an independent regression, unaddressed.

Hypothesis: a single change-point on or around 8 May 2026 introduced new
synchronous work on the metadata-click path. Detail-panel render is the
likeliest location because that's what the test measures.

### Investigation findings (23 May 2026) — regression understood, no action taken

**What JA3 actually measures.** JA3 is not "open detail panel." The test
clicks a metadata value (`colourModel:RGB`) inside the already-open detail
panel, which triggers a full new search (~1.3M corpus, 200 hits), and
measures time to `waitForStoreSettled`. It is a search round-trip benchmark.

**Root cause: SOURCE_INCLUDES widening (commit `38eb1d003`, 10 May 2026).**
The enrichment features added on that date widened the ES `_source` projection
to include `usageRights` (full object), `leases`, `usages` (full with all
sub-objects), `syndicationRights.*`, `collections.*` and several small fields.
Every search hit now carries significantly more data. The colourModel:RGB
corpus is large and includes heavily-used editorial images whose `usages`
arrays can be substantial.

**Why there is nothing to optimise without architectural change.** Every field
added to SOURCE_INCLUDES is genuinely needed — `usageRights` for cost/validity
display, `leases` for validity and syndication, `usages` (full, including
`references` and print/digital metadata) for the detail-panel usage history,
`collections.*` for collection display. Dot-path narrowing of `usages` would
save payload but lose the detail-panel fields. Tiered loading (slim search
payload + mget on focus) would recover JA3 but is non-trivial architectural
work and introduces a loading state on detail open.

**Decision: accept.** The ~1s JA3 is the honest cost of the enrichment feature
set. No fix is warranted until the detail panel is built and we can measure
whether tiered loading is worth the complexity.

**Purely-correctness cleanup (not perf, not urgent).** `deriveImage` fetches
`cost`, `valid` and `invalidReasons` from ES via SOURCE_INCLUDES but never
reads them — it always recomputes from `usageRights` + `leases` (which are
also already fetched). Those three fields are therefore redundant in
SOURCE_INCLUDES: they add a few scalar bytes per hit and the TS recomputation
is correct and intentional (always fresh, not the stale ingest-time Scala
value). They can be removed from SOURCE_INCLUDES in a cleanup commit with no
behavioural change. Similarly, `"actions"` in SOURCE_INCLUDES fetches a field
that is absent from the ES `_source` for image documents (HATEOAS actions are
generated at API request time, not stored) — it contributes zero bytes but is
noise. Both are cleanup-only; neither is worth a dedicated commit.

**Push-back clause:** if the very first step (re-measurement) shows JA3
is no longer regressed, or shows variance so wide that 287→988 is within
noise, **halt** and write a one-paragraph "non-issue" note at the bottom
of this doc. Do not invent work.

### Phase A1 — confirm the regression is real and stable ✅ DONE

Goal: rule out one-off measurement noise before spending time on diagnosis.

**Result (from existing perceived-log entries, 3 runs each, no code changes between):**

| Entry | Label | Date | JA3 settled (ms) |
|---|---|---|---:|
| 25 | After cost, no enrichment | 2026-05-10 | 1210 |
| 27 | After syndication and leases | 2026-05-17 | 1006 |
| 29 | After tickers, before waste elimination | 2026-05-23 | 988 |
| 31 | After Wasteful-Work Audit work | 2026-05-23 | 958 |

Median across the four entries (each already averaged over 3 runs): **~997ms**.
Variance: all four are within a 1.3× band (958–1210). No single outlier.

**Decision: median > 700ms → regression confirmed and stable. Proceed to A2.**

Note: the slight downward trend (1210→958) may be from the F-01
`track_total_hits` fix reducing ES latency on the initial search that
precedes the metadata click, not from any fix to the metadata path itself.

### Phase A2 — narrow the change-point with git archaeology

Goal: find the commit (or small set of commits) that caused the jump,
without running git bisect. Bisect on a 60-second perf test is overkill
for a window we already roughly know.

Steps:

1. List commits to the metadata-click render path in the suspect window:
   ```
   git --no-pager log --since=2026-05-06 --until=2026-05-12 --stat -- \
     kupua/src/components/ImageDetail.tsx \
     kupua/src/components/ImageMetadata.tsx \
     kupua/src/components/MultiImageMetadata.tsx \
     kupua/src/components/ImageDetailPanel.tsx \
     kupua/src/lib/cost/ \
     kupua/src/lib/syndication/ \
     kupua/src/lib/lease/ \
     kupua/src/lib/derive-enriched-image.ts \
     kupua/src/hooks/useEnrichedImage.ts \
     kupua/src/store/search-store.ts
   ```
   Adjust paths if names have moved; use `git log --follow` on uncertain ones.
2. Expect 3–20 commits. Read each diff. Look for:
   - New synchronous derivation in render (heavy `.map`/`.reduce` over
     full result set, JSON parse, regex against large strings).
   - New `useEffect` with no deps array, or deps that change every render.
   - New context provider wrapping the detail panel.
   - New per-cell work newly executed on detail open (e.g. enrichment
     that used to be lazy now eager).
   - Newly-added third-party imports loaded synchronously.
3. Shortlist up to three suspects. If one is obvious (e.g. a "derive
   enriched cost overlay synchronously on every render" change), go
   straight to A4 with that commit as primary suspect.
4. If shortlist is empty after reading all commits in window: widen
   window to 2026-05-04 → 2026-05-15 and repeat. If still empty,
   the regression is somewhere unexpected (e.g. a dependency upgrade,
   a vite config change, a CSS containment change). Grep `git log` for
   `package.json`, `vite.config.ts`, `tsconfig.json` in the window.

### Phase A3 — confirm by checkout + re-measure (optional, if shortlist > 1)

Only do this if A2 produced 2–3 plausible suspects and reading diffs
doesn't disambiguate. Otherwise skip to A4.

Steps:

1. For each suspect commit, checkout the commit **before** it, run the
   perceived-perf suite once (single run, label clearly), record JA3.
2. Whichever "before" commit has fast JA3 and whose "after" jumps to
   ~988ms is the culprit.
3. Return to `mk-next` immediately after — do not leave the working tree
   on an old commit.

### Phase A4 — profile the suspect to identify the slow code

Goal: turn "this commit caused it" into "this exact function/render is
the bottleneck."

Steps:

1. On `mk-next`, start the dev server.
2. Open Chrome DevTools → Performance tab.
3. Reproduce the JA3 scenario: load home, scroll to a single image,
   click metadata.
4. Record from just before the click to just after the panel renders.
5. In the flame chart, find the long task (likely 200–800ms) on the
   click. Drill down to:
   - Which component rendered (React fiber labels visible if React
     DevTools is also installed).
   - Which JS function dominated (look for self-time leaders).
   - Whether it's one big task or many small ones summed.
6. Cross-reference with the suspect commit from A2/A3.

### Phase A5 — fix or accept

Three legitimate outcomes:

- **Fix:** if the cause is clearly accidental (missed memo, eager work
  that should be lazy, debug code left in), patch it. Re-run perceived-
  perf 3× to confirm. Document in `changelog.md`.
- **Accept:** if the cause is intentional (new feature with real value
  that has real cost), document the trade-off in `deviations.md` and
  leave the regression. Update the perf threshold in
  `kupua-perf-threshold.md` (repo memory) so future agents don't keep
  re-flagging it.
- **Revert + redesign:** if the cause is a feature that's not worth the
  cost, revert and brief the user on what the feature was and what an
  alternative implementation might look like. Do not redesign silently.

### What "done" looks like for JA3

One of:

1. A commit (or short series) on `mk-next` that brings JA3 median back
   under ~400ms, with three confirming perf runs and an entry in
   `changelog.md`.
2. An entry in `deviations.md` explaining why ~988ms is the new normal,
   plus an updated threshold.
3. A "non-issue" note at the bottom of this doc explaining the
   regression was unreproducible.

---

## Part B — P14a / P14b (gradual LoAF growth during selection/facet tests)

### Premise

Empirical: P14a and P14b LoAF metrics roughly doubled over the April→May
window. F-05 C5 (the most plausible audit-suggested fix) did not move
them. The pattern is gradual growth across many commits, not a single
change-point. Static analysis hit its limit.

Hypothesis: the 10-second ticker poll is the re-render trigger (matches
the growth pattern as more data accumulates), but the heavy work on each
poll is not the `imagePositions` subscription (F-05 C5 ruled that out).
Likely candidates: enrichment derivation re-running for every visible
cell when ticker counts update, or facet recomputation, or selection-set
recomputation.

**Push-back clause:** if Phase B1 instrumentation shows fewer than ~10
component re-renders per ticker tick during a P14 run, the ticker
hypothesis is wrong; halt, write findings, and re-open the question
before chasing fixes.

### Phase B1 — build minimal render-instrumentation

Goal: see *which* components re-render *how often* during a P14 test run.
No fixes yet — measurement only.

Two options, pick one:

**Option 1 (lighter, preferred): React `<Profiler>` wrappers.**
- Wrap the top-level suspects (`ImageGrid`, `FacetFilters`, `ImageDetail`,
  `ImageDetailPanel`, `SearchHeader`, cell component) in `<Profiler>`.
- onRender callback writes to a module-level array.
- A keyboard shortcut (or test hook) dumps the array as JSON to the
  console or to `window.__renderLog`.
- Gated by `import.meta.env.DEV` or a query param so it never ships.

**Option 2 (heavier, more info): `@welldone-software/why-did-you-render`.**
- Add as a dev dep.
- Initialise in `main.tsx` behind a flag.
- Logs every re-render with prop diffs to the console.
- Noisier but tells you *why* a re-render happened, not just *that* it did.

Recommendation: start with Option 1. If render counts are ambiguous,
escalate to Option 2.

Estimate: ~50–100 LOC of instrumentation, all behind a dev flag.

### Phase B2 — run P14a/B14b with instrumentation on

Steps:

1. Add a CLI flag or env var to the perf runner that enables the
   profiler.
2. Run:
   ```
   npm --prefix kupua run test:perf -- --runs 1 --label "p14-instrumented" \
     --grep "P14"
   ```
   (or whatever the actual grep pattern is — check the runner.)
3. After the run, dump the render log to a file in `test-results/` or
   `$TMPDIR`. **Do not commit the dump.** Strip any image IDs / paths
   that could be sensitive before pasting into chat.
4. Aggregate: for each component, total render count over the 60s run
   and total cumulative render time.

### Phase B3 — interpret

Decision matrix on the render log:

| Pattern | Interpretation | Next step |
|---|---|---|
| One component renders 50+ times | That's the leak. Find its trigger. | B4 with that component as target. |
| Many components render 5–10 times each on a regular interval | Ticker hypothesis confirmed; the cascade is wider than expected. | B4 with focus on the subscription that wakes them all. |
| Render counts are flat and small | Ticker hypothesis wrong. LoAF is from something other than React rendering (layout thrash, large GC, image decode). | Halt; switch to DevTools Performance recording instead. |
| Renders are bursty, not periodic | It's not the ticker. Probably user-event-driven (Playwright actions cascading). | Halt; re-read the P14 test to understand its actions. |

### Phase B4 — targeted fix or design discussion

If B3 produced a clear culprit:

- Memo / selector-narrow the offending subscription, OR
- Move the heavy work out of render into a `useMemo` with stable deps, OR
- Debounce the ticker-driven update path, OR
- Skip the work when nothing user-visible changed.

Each of these is a small commit with a focused perf re-measurement. Do
not bundle multiple fixes in one commit — you want to attribute the
improvement.

If B3 produced no clear culprit: write findings, present to user, and
decide whether to:

- Invest in heavier instrumentation (Option 2 from B1),
- Accept the regression and bump the P14 threshold, or
- Park the issue and revisit when it crosses a user-visible threshold.

### What "done" looks like for P14

One of:

1. A commit (or short series) on `mk-next` that brings P14a/P14b back to
   their April baselines, with three confirming perf runs and an entry
   in `changelog.md`.
2. A documented dead-end in this doc: "instrumentation showed X, fix
   would require Y which is disproportionate, threshold raised to Z."
3. An explicit decision to escalate to Option 2 instrumentation and
   re-run this plan from B2.

---

## Cross-cutting notes

- **Order:** do JA3 first. Single change-point + concrete user impact +
  clear scope. P14 is open-ended diagnosis work and should not block
  fixing a known regression.
- **Don't combine commits.** If both are fixed, separate commits, separate
  perf runs, separate changelog entries. Bundled commits make it
  impossible to attribute improvements.
- **Don't run another wasteful-work or dead-code audit.** Three audits in
  a row found the codebase lean. The remaining performance work is
  measurement, not static review.
- **Perf-regression process directive:** defer drafting until JA3 is
  resolved. That experience will tell us what the directive needs to
  prevent. Premature otherwise.

## Open questions for the user before starting

1. Confirm entries 33 and 34 in the perceived-perf dashboard are
   pre/post the wasteful-work commits, and share the JA3 and P14
   numbers from entry 34 specifically.
2. Confirm whether instrumentation work (B1) is worth doing at all, or
   whether P14 should be parked until JA3 is resolved.
3. Confirm Chrome DevTools profiling on the dev server is acceptable
   (vs. profiling a production build, which is more representative
   but harder to iterate on).
