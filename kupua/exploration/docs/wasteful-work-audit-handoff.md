# Kupua Wasteful-Work Audit — Handoff

**Status:** Audit phase. NO CODE CHANGES. Report-only.
**Created:** 2026-05-21
**Auditor model:** Sonnet 4.6 High (Medium acceptable; High preferred at same price).
**Goal:** Produce a ranked list of places where the app does **more work than
it needs to** — oversized fetches, fields requested but never read, eager work
that could be lazy, recomputation in hot paths, polling/intervals that outlived
their purpose, listeners not cleaned up, redundant renders.
**Anti-goal:** General "code smell" reports, refactor proposals, dead code,
new abstractions. If a finding isn't of the shape "the app currently does X
work; it actually needs Y work; Y < X," it doesn't belong here.

---

## Why this audit exists

A recent fix discovered the app was fetching ~1MB per request where ~50KB
sufficed. That's a 20× over-fetch sitting in the hot path. The user wants to
know what else of this shape is hiding in the codebase.

This is the highest-value audit on the docket because every finding has
**potential user impact** (latency, jank, bandwidth, battery) — not just
code-cleanliness impact.

---

## What this audit is and is not

**This audit is:** a hunt for **wasteful work** — operations where the cost
paid exceeds the benefit delivered. Each finding must be expressible as:
> "Today we do X. We only need Y. Y costs less than X by approximately Z."

**Categories of wasteful work to hunt for:**

1. **Oversized fetches** — request body or response asks for more than the
   caller reads (extra `_source` fields, unbounded `size`, unneeded
   aggregations, full image when thumbnail would do).
2. **Over-fetching by frequency** — same data fetched on every render /
   every keystroke / every scroll tick when it could be cached, debounced,
   or fetched once.
3. **Eager work that could be lazy** — work done on mount / on every state
   change when it's only needed on user action.
4. **Redundant recomputation** — pure-ish computation re-run on every render
   when input hasn't changed (missing `useMemo`/`useCallback` *only* where
   the cost is measurable, not as a stylistic point — see anti-goals).
5. **Excessive re-renders** — components that re-render on store changes
   they don't read; selectors that return new references each call.
6. **Polling / intervals** — `setInterval`/`setTimeout` chains that fire
   without subscribers, or that outlive the component that started them.
7. **Listener / observer leaks** — `addEventListener`, `IntersectionObserver`,
   `ResizeObserver`, `AbortController` with no corresponding teardown.
8. **Duplicated work across components** — two components independently
   computing the same derived value, or two hooks running the same effect
   in parallel.
9. **Wasted network round-trips** — sequential requests that could be
   parallel; requests fired then immediately discarded; cache misses where a
   cache exists but isn't consulted.
10. **Image/asset waste** — full-resolution image loaded when a thumbnail
    would do; image loaded then never displayed; same image refetched
    because of cache-busting in URLs.

**This audit is not:**
- A refactor proposal. "X should be restructured" goes in the out-of-scope
  appendix.
- A dead-code report. Use the dead-code audit.
- A bug report. If the work is wrong (produces incorrect output), that's a
  bug — out of scope.
- A "code smell" / "more elegant" review.
- A test-coverage report.
- An architectural critique.
- **A theoretical micro-optimisation report.** No "this is O(n) and could
  be O(log n)" unless you can name a real input size that makes it matter.
  No "useCallback would help here" unless the absence causes measurable
  re-renders of an expensive child.

---

## Push-back clause (read first, act on it)

If after 30 minutes of reading you believe the audit's premise is wrong —
e.g. "the code is already lean and the 50KB/1MB find was a one-off," or
"the high-yield findings all live in one subsystem and the audit should be
narrowed to it," or "I cannot assess this without profiling and you've
forbidden running the app" — **stop and write a Section 0 explaining why,
then halt.** Do not produce a padded full audit. The user values "no, and
here's why" over compliance.

---

## Strict rules

- **NO source changes.** None.
- **NO running tests autonomously.**
- **NO Playwright runs.**
- **NO running the app, no profiling.** Static analysis + reading code only.
  This is a deliberate constraint — it forces you to find waste that's
  visible from the code, which is the easier, higher-confidence kind.
- **Cite file:line for every claim.** Unsourced claims are forbidden.
- **Quantify the waste** wherever possible. "Reduces request body from
  ~30 fields to ~5 fields" beats "reduces request size." If you can't
  quantify, lower confidence by one tier.
- **Name the trigger.** "Fires on every keystroke in CQL input" beats
  "fires often."
- **No commits, no pushes.**
- **Findings document is the only deliverable.**

---

## Required deliverable

A single markdown file:
`kupua/exploration/docs/wasteful-work-audit-findings.md`

Structure below. Be terse. Tables over prose. No padding.

---

## Section 0 (optional) — Push-back

Only present if you're invoking the push-back clause. If you write this
section, do not write the others.

## Section 1 — Methodology actually used

**Required.** 5-15 lines. State:
- Which files you read end-to-end vs sampled vs skipped, and why.
- Which subsystems you went deep on.
- How you decided "this is wasteful" vs "this is the right amount of work."
- What you couldn't assess (e.g. "couldn't verify response shape without
  running ES").
- Whether you cross-referenced perf docs (`e2e-perf/`, perceived-perf,
  jank reports) for known hot paths.

## Section 2 — Wasteful-work inventory (the main deliverable)

A single table, sorted by **Severity desc → Frequency-class desc → Confidence desc**.

| # | Title (≤10 words) | File:line(s) | Category | Severity | Frequency-class | What's done today | What's actually needed | Quantified waste | Confidence | Fix shape (≤1 line) |
|---|---|---|---|---|---|---|---|---|---|---|

**Column definitions — use these exactly:**

- **Category:** one of the 10 categories listed above (use the number,
  e.g. "C1 oversized fetch", "C5 excess re-render"). If a finding doesn't
  fit, it probably doesn't belong in this audit.

- **Severity** (code-criterion, not user-impact guess):
  - **W1 — Large waste on hot path:** ≥10× over-cost OR ≥100ms latency
    contribution OR runs on every scroll/render/keystroke with non-trivial
    cost. The 50KB/1MB find was W1.
  - **W2 — Meaningful waste on common path:** 2-10× over-cost on a
    routine action (search, sort, click, filter). Or small per-call but
    fires frequently.
  - **W3 — Small but easy:** under 2× over-cost OR fires only on rare
    actions. Include only if the fix is mechanical (≤10 lines).

- **Frequency-class** (objective, code-derived — do NOT guess user %):
  - **F-Always:** every render / every scroll / every search.
  - **F-Common:** routine action (sort change, filter change, image click,
    detail open, density toggle, popstate).
  - **F-Edge:** specific combination (e.g. two-tier + sort change) where
    each ingredient is itself common.
  - **F-Rare:** specific sequence or timing window.

- **What's done today:** ≤2 lines. The current behaviour. Cite file:line.

- **What's actually needed:** ≤2 lines. The minimum work to deliver the
  same user-visible outcome.

- **Quantified waste:** the gap between today and needed, in concrete
  units. Examples:
  - "Request body 28 fields → 4 fields (~85% reduction)"
  - "Recomputes on every keystroke; input changes ~1× per second"
  - "Fires on every scroll event (~60Hz); only needed on scroll-end"
  - "Re-renders entire ImageGrid on selection change to any image; only
    selected/deselected images need re-render"
  - "Sequential A then B; A and B are independent → parallel saves ~RTT"

  If you cannot quantify, write "qualitative only — [brief reason]" and
  lower confidence by one tier.

- **Confidence:**
  - **High:** you traced the code path end-to-end and the waste is
    mechanically present and quantifiable from the code.
  - **Medium:** you traced most of it, one assumption remains
    (e.g. "assuming this selector is called per-render, which is the
    default Zustand behaviour without `useShallow`").
  - **Low:** suspicion from pattern. **Drop unless W1 + F-Always.**

- **Fix shape:** one line, no implementation. "Drop `_source.usages` from
  the panel-list query." "Wrap the selector in `useShallow`." "Move the
  `IntersectionObserver` creation out of the render-time `useEffect`
  body." **Do not write the fix.**

**Volume guidance:** I expect **10-30 findings total**. The 50KB/1MB find
suggests at least a handful exist; if you find <5, you either undersearched
or the codebase is genuinely lean (say so in Section 1). If you find >40,
you're including style opinions ("could useMemo this") that aren't
quantified waste; tighten the criterion.

## Section 3 — Waste clusters

For each cluster of ≥2 findings sharing a likely root cause or fix:

| Cluster name | Finding #s | Suspected shared cause | Fix shape (one line) |

Examples: "All ES list queries over-fetch `_source` — single helper that
selects fields would fix 4 findings." Do not invent clusters of 1. Do not
write the fix.

## Section 4 — Areas not audited

Explicit list of subsystems/files/scenarios you did NOT cover, one-line
reason each.

## Section 5 — Suggested first three fixes

Of the W1 findings, name the 3 you'd fix first and why (highest impact /
lowest risk / unlocks other findings). 5-15 lines max. Do not write the
fixes.

## Appendix A — Out-of-scope observations

Drop here, one line each:
- Refactor opportunities
- Dead code (separate audit)
- Bugs (separate audit)
- Theoretical micro-optimisations without quantified waste
- Architectural concerns

**Cap at 30 items.**

---

## Where to look (priority order)

You don't have to cover everything. Spend budget on highest-likely-yield
areas first. If you run out of budget, stop and declare the rest in
Section 4.

**Tier 1 — highest yield expected (hot paths, network, recent additions):**

- **ES request construction:** `src/dal/es-adapter.ts`, especially
  `_source` field lists, `size` parameters, aggregation requests. The
  50KB/1MB find was here.
- **Distribution / null-zone / scrubber queries:** `src/dal/null-zone.ts`,
  `lib/sort-context.ts`. These fire on sort change and scrubber drag.
- **Aggregations:** anywhere `aggs` are built. Check for over-broad
  buckets or unneeded sub-aggs.
- **Enrichment fetches:** `src/lib/cost/`, `src/lib/syndication/`,
  `stores/enrichment-store.ts` — recent additions, three-layer merge,
  prime over-fetch territory.
- **Image prefetch:** `src/lib/image-prefetch.ts` — full-res vs thumbnail
  decisions, prefetch radius.
- **Image URLs:** `src/lib/image-urls.ts` — variant selection, size hints.
- **CQL typeahead:** `src/lib/lazy-typeahead.ts`, `CqlSearchInput.tsx` —
  fires on keystroke, likely candidate for debounce/cache audit.

**Tier 2 — re-render and recomputation hotspots:**

- **Zustand selectors:** `src/stores/search-store.ts` consumers in
  components. Look for selectors returning new objects/arrays each call
  without `useShallow`.
- **`useDataWindow`:** runs on every viewport change. Check
  `position-map` lookups, anchor recomputation.
- **`useScrollEffects`:** runs on scroll. Check what fires per event vs
  per scroll-end.
- **`ImageGrid` / `ImageTable` cell renderers:** virtualised lists where
  per-cell cost multiplies.
- **`Scrubber.tsx`:** tick computation, tooltip recomputation on drag.

**Tier 3 — lifecycle and leak hotspots:**

- All `useEffect` blocks across `src/hooks/` and `src/components/` for
  missing cleanups (event listeners, observers, abort controllers,
  intervals).
- All `setInterval` / `setTimeout` call sites — grep for them.
- All `new IntersectionObserver` / `new ResizeObserver` — grep for them.
- All `AbortController` — check that `abort()` is called on cleanup.

**Cross-reference with existing perf knowledge:**

- `kupua/exploration/docs/zz Archive/perceived-perf-audit.md`
- `kupua/exploration/docs/zz Archive/Scrolling bonanza/scroll-real-scrolling-profiling-handoff.md`
- `kupua/e2e-perf/` — recent jank reports may name hot paths.
- AGENTS.md "Known Issues" — P8 table fast scroll DOM churn is already
  known; don't re-report, but adjacent waste is fair game.
- `kupua/exploration/docs/changelog.md` — perf fixes already shipped;
  don't re-find them.

**Things to specifically look for:**

- ES queries with `_source: true` or no `_source` filter — likely fetching
  every field for list views.
- ES queries with hardcoded `size` larger than the consumer's window.
- Effects with empty dep arrays that build observers/listeners but no
  matching cleanup.
- Effects with deps that change every render (object literals, inline
  arrays) causing re-fire every render.
- Zustand store usage like `const x = useStore(s => ({ a: s.a, b: s.b }))`
  — returns new object each call → re-render on every store change.
- `useMemo`/`useCallback` deps that include functions/objects defined
  inside the component (defeats memoisation).
- Repeated `JSON.parse`/`JSON.stringify` in hot paths.
- Image URLs that include cache-busting params that change unnecessarily.
- Promises chained sequentially (`await A; await B;`) where A and B are
  independent.
- Polling that doesn't unsubscribe when no consumer is active.
- Aggregations requested for views that aren't visible.

**Things explicitly out of scope:**

- "This could be O(log n) instead of O(n)" without a real n.
- "Should use a `useMemo` here" without showing the child re-renders are
  expensive.
- "Inline this function" — style.
- "Use a smaller library."
- Type-level inefficiency.
- Bundle-size audit (worth doing but is a separate exercise — note in
  Appendix A and move on).

---

## Files to read first

- `kupua/AGENTS.md` — Component Summary, hot paths, known issues.
- `kupua/exploration/docs/00 Architecture and philosophy/component-detail.md`
- `kupua/exploration/docs/00 Architecture and philosophy/02-focus-and-position-preservation.md`
  — focus/position is the trickiest hot path; understand it before flagging
  re-render concerns there.
- `kupua/exploration/docs/changelog.md` — recent perf work; don't
  re-find shipped fixes.
- `kupua/exploration/docs/deviations.md` — intentional departures.
- `kupua/exploration/docs/es-audit.md` — ES-specific guidance.

---

## What "done" looks like

- Section 2 has 10-30 rows, sorted, every row has file:line and a
  quantified-waste statement.
- Every W1 row has a concrete "today / needed / waste" triple.
- Section 1 honestly states what you didn't assess.
- Section 4 names what was skipped.
- Section 5 names a credible "first three fixes."
- Appendix A is ≤30 items.
- No row is a stylistic micro-optimisation in disguise.
- No row is "X should be restructured."
- The user can open the doc, scan Section 2, pick a top finding, and
  brief a fix agent on it.

If you realise mid-audit that your criterion was wrong (e.g. half the
W3 rows are arguably "the right amount of work"), say so at the top of
Section 2 and offer to redo with a tightened criterion. Better to flag
than ship a noisy list.
