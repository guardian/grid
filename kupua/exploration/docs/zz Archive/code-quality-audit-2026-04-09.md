# Kupua Code Quality Audit — 9 April 2026

**Audience:** The human developer + future AI agents
**Scope:** `kupua/src/` (~22k lines, 55 files)
**Approach:** Report-first. No code changes. User decides what (if anything) to fix.

## Executive Summary

This is a surprisingly clean codebase for a prototype built by one non-engineer with AI agents. The realistic work plan (doc 05) already executed the most impactful structural moves: orchestration extraction, DAL boundary cleanup, tuning constant consolidation. Most of the "obvious" code quality wins are already done.

**What I found that's worth discussing:** 5 real TypeScript errors, a handful of `console.warn` calls that might be better as `devLog`, and some patterns that are unusual but defensible. Most of the things I'd normally flag as "code smells" in a team codebase are non-issues here because **the codebase has exactly one consumer (Claude agents)** — and agent comprehension works differently from human comprehension.

**What I explicitly recommend NOT doing:** file splits, store decomposition, component extraction. Doc 05 already made this argument comprehensively and correctly. I agree with it. The 2,739-line store and 1,303-line table are large by human standards but present zero comprehension difficulty for agents — we read the whole file in one pass and track all state simultaneously. Splitting them would create more files to coordinate, more import paths to get right, and more opportunities for closure bugs, with zero payoff for the actual developers (you + agents).

---

## Category 1: TypeScript Errors (Fix — Low Effort, High Value)

`npx tsc --noEmit` produces **5 errors**. Three are real, two are noise.

### 1a. `search-store.ts:1362` and `search-store.ts:1505` — `Image | undefined` passed where `Image` expected

Both are `extractSortValues(newBuffer[idx], ...)` where `newBuffer[idx]` could be `undefined` (the buffer can have gaps). The `?? null` already handles the `undefined` return, but the *argument* to `extractSortValues` isn't guarded.

**Fix:** Add a null check before the call, or use the non-null assertion `!` with a comment explaining why the guard at that point guarantees the item exists (the `newBuffer.length > 0` check is already there — the issue is that TS can't infer the array index is safe).

**Severity:** Low risk (the length check makes this safe at runtime) but noisy — agents see these errors and may waste time investigating them.

### 1b. `sort-context.ts:674` — unused `intervalMinutes`

Declared but never read. Looks like a leftover from a refactor where sub-hour interval logic was simplified.

**Fix:** Delete the declaration (4 lines, 674–676). Or prefix with `_` if it's intentionally reserved for future use.

### 1c. `CqlSearchInput.tsx:92` — `@guardian/cql` custom element type mismatch

The `CqlInput` class doesn't satisfy `CustomElementConstructor` because newer DOM typings added properties (`ariaActiveDescendantElement`, etc.) that the library hasn't caught up with.

**Fix:** This is an upstream library issue. Suppress with `as unknown as CustomElementConstructor` — it works at runtime, the type system is just behind. Or pin `@types/react` / `lib` versions. Low priority.

### 1d. Test files — unused imports

`reverse-compute.test.ts` has an unused import, `search-store-extended.test.ts` has an unused variable. Trivial cleanups.

---

## Category 2: Type Safety (`as` Casts and `any`)

**Finding: Remarkably few.** Only 3 `as any` in the entire codebase:

| Location | Usage | Verdict |
|---|---|---|
| `Scrubber.tsx:676` | `(window as any).__scrubber_debug__` | Debug-only. Fine. |
| `sort-context.ts:360` | `(window as any).__sort_context_debug__` | Debug-only. Fine. |
| `sort-context.ts:930` | `(window as any).__null_zone_debug__` | Debug-only. Fine. |

All three are `window` extensions for E2E test observability. A cleaner pattern would be to extend the `Window` interface in `vite-env.d.ts`, but it's cosmetic — these are dev-only and DCE'd in production.

**`as HTMLElement` / `as Node` casts:** ~15 across the codebase, all in event handlers (`e.target as HTMLElement`). This is standard DOM event handling in TypeScript — `EventTarget` is deliberately loose. No issues.

**`eslint-disable` comments:** 19 total. All annotated with reasons. The `react-hooks/exhaustive-deps` suppressions are mostly intentional mount-only / unmount-only effects. This is good practice — the comments explain *why* the dep array is incomplete, which is far better than adding spurious dependencies that cause infinite loops.

**Verdict:** Type safety is excellent. `strict: true` + `noUnusedLocals` + `noUnusedParameters` covers the important ground. No action needed.

---

## Category 3: Error Handling

**Finding: Consistently good.** Every `catch` block in `search-store.ts` (14 total) follows the same pattern:

1. Check for `AbortError` (from request cancellation) → return silently (correct — user navigated away)
2. Log with `console.warn` and a tagged prefix (e.g. `[sort-around-focus]`, `[scroll-mode-fill]`)
3. Set error state and/or degrade gracefully

This is a deliberate and well-considered pattern. The `console.warn` calls in the store and `es-adapter.ts` are **intentionally not `devLog`** — per `dev-log.ts` line 11-12: *"`console.warn` for error-path diagnostics should remain as bare `console.warn` — those are valuable in production."*

**One minor observation:** `es-adapter.ts:452` catches PIT close failures (`console.warn("[ES] Failed to close PIT:", e)`). This is fire-and-forget, which is correct — a PIT close failure is harmless (it'll expire naturally). But it logs with `console.warn` which will appear in production. If PIT close failures are common (e.g. during rapid navigation), this could be noisy. Consider `devLog` for this one.

**Missing ErrorBoundary subtrees:** There's a single `ErrorBoundary` component wrapping the app root. No component-level boundaries for graceful degradation (e.g. if `FacetFilters` fails, the search results could still render). This is fine for a prototype — component-level boundaries add complexity and are only worthwhile when users regularly encounter render errors in specific subtrees.

---

## Category 4: React Patterns

### 4a. `useEffect` discipline

47 `useEffect` calls across 15 files. The highest-density files:

| File | useEffect count | useMemo + useCallback count |
|---|---|---|
| ImageDetail.tsx | 7 | 7 |
| useScrollEffects.ts | 5 | 0 |
| ImageTable.tsx | 5 | 21 |
| Scrubber.tsx | 4 | 12 |
| DateFilter.tsx | 3 | 8 |

**ImageDetail.tsx** has the most effects (7), which is expected — it manages prefetch pipelines, position caching, counter state, and fullscreen coordination.

**ImageTable.tsx** has 21 `useMemo` + `useCallback` calls, which is high but appropriate for a virtualised table with sort interaction, column resizing, and click-to-search. Each memoisation prevents a re-render cascade through the virtualiser.

**Verdict:** Effect and memoisation usage is intentional and well-commented. No unnecessary effects found. The `eslint-disable` annotations on exhaustive-deps are all justified.

### 4b. Zustand subscription granularity

Components use inline selectors: `useSearchStore(s => s.results)`, `useSearchStore(s => s.loading)`. This is the correct pattern — each component subscribes only to what it renders. A monolithic `useSearchStore()` without a selector would cause every component to re-render on any state change.

I spot-checked several components and they all use selectors. No issues.

### 4c. The `memo()` wrapper

`ImageTable` is wrapped in `memo()` (line 1 — it's the default export of a `memo()` call). `ImageGrid` is a regular function component. This asymmetry might seem like an oversight, but `ImageTable` has expensive column definition computation that should be skipped when only the scroll position changes. `ImageGrid` is lighter — the virtualiser handles most of the rendering cost. This is fine.

---

## Category 5: Import Consistency

**Finding: Good, with a deliberate pattern.**

- **Within `src/`:** Most imports use the `@/` alias (good — resilient to file moves).
- **Within the same directory:** Relative imports `./` are used (reasonable — same-directory imports are unambiguous).
- **Exception:** `main.tsx` and `router.ts` use `./` relative imports. These are entry-point files with stable locations — using `@/` would be overly formal.

The realistic work plan (Session 2) already cleaned up the cross-component imperative imports. `grep -r "from.*SearchBar" src/components/ | grep -v SearchBar.tsx` returns zero results — confirmed clean.

---

## Category 6: Console.warn vs devLog

**19 bare `console.warn` calls** in production source (excluding tests). Per the dev-log.ts contract, these are intentional — they represent error-path diagnostics that should survive into production.

However, some of these are arguably diagnostic rather than error-path:

| File:Line | Message | Could be devLog? |
|---|---|---|
| `es-adapter.ts:452` | Failed to close PIT | Maybe — fire-and-forget cleanup, noisy if common |
| `es-adapter.ts:559` | PIT expired, retrying without PIT | No — genuine recovery path worth logging |
| `sort-context.ts` (none) | — | All logging via devLog already ✓ |

**Verdict:** 18 of 19 `console.warn` calls are correctly categorised. The PIT close warning (`es-adapter.ts:452`) is borderline.

---

## Category 7: Dead Code

**Finding: Almost none.** Zero `TODO`/`FIXME`/`HACK` comments in source. `noUnusedLocals` and `noUnusedParameters` in tsconfig catch most dead code at compile time.

The only dead code found: `intervalMinutes` in `sort-context.ts:674` (caught by tsc, see Category 1b).

No commented-out code blocks found. No unreachable branches found.

---

## Category 8: Test Coverage

**Files with unit tests:** 6 out of ~45 non-test source files.
**Files without unit tests:** 39 (but many are React components tested via E2E instead).

### What's tested well:

| Area | Tests | Coverage assessment |
|---|---|---|
| Search store (core logic) | 860 + 960 lines (two test files) | Thorough — seek, extend, evict, sort-around-focus, PIT lifecycle |
| Sort builders | 234 lines | Good — pure functions, well-tested |
| CQL query editing | 171 lines | Good — AST manipulation edge cases |
| Field registry | 184 lines | Good — field lookup, sorting, config |
| Image offset cache | 164 lines | Good — session storage round-trip |
| Error boundary | 50 lines | Basic — render error catch |
| DAL contract | 56 lines | Interface shape locking |
| Reverse-compute | 392 lines | Thorough — pure function, many edge cases |

### What relies entirely on E2E:

All React components, all hooks, all routing, all scroll behaviour. This is fine — these are inherently integration-level concerns. Unit-testing a virtualised scroll hook in isolation would be artificial and brittle.

### Potential unit test additions (if desired):

1. **`cql.ts` (477 lines)** — CQL→ES query translator. Pure function, no deps. Highest-value untested pure logic.
2. **`image-urls.ts` (253 lines)** — thumbnail URL generation. Pure function.
3. **`sort-context.ts` (1,038 lines)** — tick generation, label interpolation, binary search. Complex pure logic. Some of this is indirectly tested via E2E scrubber tests.

But: the 121 Playwright E2E tests + 203 Vitest unit tests already provide strong coverage. The E2E tests catch the integration issues that matter most. Adding unit tests for `cql.ts` would be the highest-value addition — it's the most complex pure function without direct test coverage.

---

## Summary: What's Worth Doing

| # | Issue | Effort | Value | Recommendation |
|---|---|---|---|---|
| 1 | Fix 5 tsc errors | 15 min | High (clean build) | **Yes — do it** |
| 2 | Extend `Window` interface for debug globals | 5 min | Low (cosmetic) | Optional |
| 3 | Add `cql.ts` unit tests | 1–2 hrs | Medium (locks complex parser) | Worth doing when touching CQL |
| 4 | `es-adapter.ts:452` warn→devLog | 1 min | Trivial | Optional |
| 5 | File splits / store decomposition | Days | **Negative** (for agent consumers) | **No — per doc 05 rationale** |
| 6 | ESLint / Prettier setup | 30 min | Low (TS strict already covers the important stuff) | Not worth it — agents don't need formatting enforcement |

### The honest bottom line

This codebase doesn't have a code quality problem. It has excellent type safety (TS strict mode, minimal `any`), consistent error handling, good test coverage at the right levels, clean import structure (post-doc-05 cleanup), and well-commented intentional deviations. The 5 tsc errors are the only concrete issues worth fixing.

The things that *look* like problems through a traditional code-quality lens — the 2,739-line store, the 1,303-line table, the lack of ESLint — are either (a) explicitly deferred with good rationale (doc 05) or (b) irrelevant to the actual consumer (agents don't need line-length rules or forced file-size limits to understand code).

