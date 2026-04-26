# Position Preservation & Intermediate-Flash — Audit Handoff

**Status:** Audit phase. NO CODE CHANGES from this work.
**Prerequisite reads:**
- `position-preservation-rearchitecture-handoff.md` (the naive rearchitecture plan)
- `preexisting-bugs-found-during-history-work.md` § Bug 2 (intermediate flash)
**Created:** 2026-04-26
**Goal:** Gather the data needed to decide whether the proposed rearchitecture
should proceed, be reshaped, or be abandoned — **and** whether the
intermediate-flash bug family should be folded into the same fix.

---

## Why these two are audited together

The user's instinct ("these feel related") is engineering-correct. Both bug
families live in the same dual-path architecture in `useScrollEffects.ts`:

- **Anchor path (focused or phantom):** atomic. Effect #7 saves a ratio and
  returns; `search()` keeps `loading: true` and the old buffer visible;
  `_findAndFocusImage` swaps the buffer + bumps `sortAroundFocusGeneration`;
  Effect #9 positions scroll in the same `useLayoutEffect` frame as the
  re-render. **Zero intermediate frames.**
- **No-anchor path:** eager. Effect #7 sets `scrollTop = 0` *before* `search()`
  even fires. The user sees old buffer at scrollTop=0 for ≥1 frame (Bug 2).
  Phantom drift bugs cluster on the same side — fragile geometry, one-shot IDs,
  ratio plumbing.

The rearchitecture decision **directly determines whether Bug 2's code path
keeps existing**:

- If "always set `focusedImageId`" wins → `preserveId` is never null → the
  flashing `else` branch is unreachable → Bug 2's code path is *deleted by
  construction*. The §4 sort-relaxation question (phantom + sort change → reset
  to top?) becomes a UX decision, not a flash bug.
- If the rearchitecture is killed → Bug 2 needs its own targeted fix
  (`_scrollResetGeneration`, Option B in the bug doc), which is the same
  atomic-generation pattern sort-around-focus already uses. That hardens the
  dual-path rather than unifying it — but it leaves the structural fragility
  in place.

Either way, the same audit data answers both questions. Auditing them
separately would duplicate work and risk a fix to one breaking the other.

---

## Why this audit exists (rearchitecture skepticism)

The naive plan proposes "always set `focusedImageId`, gate visual focus on
`getEffectiveFocusMode()`". The first agent (writing this handoff) is
skeptical of the plan's framing for four reasons:

1. **The motivating bugs are already fixed.** Phantom drift Bug A (coordinate
   mismatch) and Bug B (anchor-walk cascade) shipped fixes via a minimal
   geometry-coordinate alignment in `build-history-snapshot.ts` and a
   "don't overwrite phantom snapshot on departure" guard in
   `useUrlSearchSync.ts`. The case for the refactor is now maintainability,
   not user-visible bug repair.
2. **`focusedImageId` carries user-intent semantics across many sites.** The
   plan lists 24 divergence points. The real count of consumers that read
   `focusedImageId !== null` and *mean* "user explicitly chose this" is
   plausibly larger, and each one is a silent UX-regression risk after the
   refactor.
3. **The plan punts on the perf-critical question.** Always-setting
   `focusedImageId` to track viewport requires either updating it on every
   scroll frame (Zustand re-render storm risk in two-tier mode) or keeping
   one-shot semantics in disguise (the same fragility, renamed). The plan
   doesn't pick a side. This is the question that should govern the whole
   decision.
4. **Big-bang refactors of an app's heart, motivated by maintainability
   rather than user value, on code that just stabilised, are the textbook
   "wait for the next concrete bug" situation.**

The audit is to either (i) reinforce the case for the refactor with concrete
data or (ii) cheaply kill it. Either outcome is valuable.

---

## What I want back, in this exact format

A markdown file `position-preservation-audit-findings.md` in the same docs
directory, with the following sections **in order**. Be terse. Cite file paths
and line numbers. No prose padding.

### Section 1 — Phantom drift: is the bug still real?

**Method.** Re-run `e2e/smoke/phantom-drift-diag.spec.ts` against the TEST
cluster across **all three scroll modes** (scroll/two-tier/seek) using the
stable corpora pinned in `AGENTS.md`. Capture before/after position deltas
across:

- D1: Phantom anchor, single back/forward cycle
- D2: Explicit anchor, single back/forward cycle
- D3: Phantom anchor, **5 consecutive** back/forward cycles (the original
  anchor-walk reproducer)
- D4: Sort change + back/forward
- D5: Filter change + back/forward

If the diag spec doesn't already cover D3-D5 across all three modes, extend
it (test code only — no source changes). User must approve the Playwright
runs (port :3000 free + TEST cluster permission).

**Deliverable.** Table of measured drift in pixels per scenario, current
codebase. Verdict for each: **fixed / still drifts / regressed**. If
everything is "fixed", flag prominently — that significantly weakens the
refactor's motivation.

### Section 2 — `focusedImageId` consumer survey

**Method.** Find every read of `focusedImageId` (and `_phantomFocusImageId`,
`_focusedImageKnownOffset`) across `kupua/src/`. For each, classify as:

| Category | Meaning today | Risk if always-set |
|---|---|---|
| **A. Anchor-position** | "Where the user is in the list" | None — refactor preserves this |
| **B. User-intent** | "User explicitly picked this image" | HIGH — silent UX regression |
| **C. Visual** | "Render the focus ring" | Low — gate on mode |
| **D. Mixed/ambiguous** | Both meanings entangled | HIGH — needs splitting |

**Deliverable.** Single table:

| File:line | Read site (1-line excerpt) | Category | If category B/D: what would silently change in phantom mode after refactor? |

I expect this table to have **30-60 rows**, not 24. If it's smaller, you
missed sites — search again. Look especially at:
- All click handlers and keyboard handlers
- ImageDetail mount/unmount, FullscreenPreview mount/unmount
- Metadata panel selectors
- All `useSearchStore((s) => s.focusedImageId)` subscriptions
- Snapshot capture, snapshot consumption
- sort-around-focus call sites in `useUrlSearchSync.ts`
- Traversal (`useImageTraversal.ts`)
- Density-switch save/restore in `useScrollEffects.ts`

### Section 3 — The performance question

**The decision.** If we always set `focusedImageId`, when does it update?

**Option P1: every scroll frame** (track viewport center continuously).
- Find every Zustand subscriber to `focusedImageId` (`useSearchStore((s) => s.focusedImageId)` etc.).
- For each, estimate cost-per-update. Flag any that would re-render on every scroll frame.
- **Specifically measure:** would `ImageGrid`/`ImageTable` cell components re-render on every scroll frame? (They likely subscribe to focusedImageId for the ring.)
- Run an existing perf test (`npm --prefix kupua run test:perf -- --runs 3`) **after a minimal prototype** that toggles `focusedImageId` on every scroll event in two-tier mode (1k–65k corpus). Compare jank metrics.
- **Suggest** the perf surface; do NOT run perf tests autonomously per AGENTS directive.

**Option P2: update only at decision moments** (entry to detail, popstate, search context change).
- This is what `_phantomFocusImageId` already does (one-shot).
- If we pick P2, what does the rearchitecture actually win? Enumerate honestly.

**Deliverable.** A short verdict: **P1 viable / P1 has measured perf cost of X / P2 is what we already have / no clear win**. If neither option clearly wins, this audit kills the refactor.

### Section 4 — §4 Relaxation behavioural diff

The architecture doc §4 lists explicit relaxations between explicit and
phantom mode:

- Sort change: explicit → keep image in view; phantom → reset to top
- Scrubber seek: explicit → focus persists durably; phantom → reset
- Disjoint search: both → reset to top

**Method.** Locate the code implementing each relaxation. For each, identify
**which condition currently distinguishes the two modes** (typically
`focusedImageId !== null`). After the refactor, this would need to become
`getEffectiveFocusMode() === "explicit"`. List every such site.

**Deliverable.** Table:

| Relaxation | File:line | Current discriminator | Post-refactor discriminator | Risk if missed |

### Section 5 — Test surface

**Method.** Find every Vitest + Playwright test that asserts on
`focusedImageId`, `_phantomFocusImageId`, or focus ring visibility.
Categorise:

- Tests that would still pass unchanged (anchor-position semantic)
- Tests that would break (user-intent assertion: "phantom mode → focusedImageId stays null")
- Tests that would become meaningless (the phantom path no longer exists)

**Deliverable.** Counts per category + a representative example for each.

### Section 6 — Snapshot/popstate-specific findings

The current snapshot system has (after recent fixes):
- `anchorIsPhantom: boolean` field on `HistorySnapshot`
- "Don't overwrite a phantom snapshot on departure" guard in `useUrlSearchSync.ts`
- Push-time snapshot via `markPushSnapshot` before `navigate()`

**Method.** Walk the full lifecycle of a phantom-anchor snapshot today:
1. Push moment: who computes the anchor? (`buildHistorySnapshot` →
   `getViewportAnchorId()`)
2. Storage: `MapSnapshotStore` LRU + sessionStorage mirror
3. Popstate: `useUrlSearchSync.ts` ~L198, restore via `phantomOnly`
4. Effect #9 consumption via `_phantomFocusImageId` + ratio

For each step, identify what would simplify if `focusedImageId` were always
set, and what new constraint would replace what's removed.

**Deliverable.** A diagram or step-list of "before vs after" for the
snapshot lifecycle. Include any subtle behavioural change you spot (e.g.
"phantom snapshot's anchor is currently picked at push time *before* the new
navigation; after refactor it would be the focusedImageId at the same
moment — is that the same image?").

### Section 7 — Intermediate-flash inventory

**Context.** `preexisting-bugs-found-during-history-work.md` § Bug 2
documents one flash (sort-only, no-focus, deep buffer → 1 frame of old
first-page). Almost certainly there are siblings. Find them all.

**Method.** Walk every code path that triggers a buffer/state transition and
identify which ones can produce ≥1 frame where the user sees content that
is neither the pre-state nor the post-state. For each candidate, classify by
root cause:

| Root cause family | Pattern |
|---|---|
| **F1. Eager scroll reset** | `useLayoutEffect` resets `scrollTop=0` before `search()` fires (Bug 2 archetype) |
| **F2. Non-atomic Zustand sets** | Two `set()` calls with potential render between them (Bug 2 sub-issue: `setParams` then `search`) |
| **F3. Density-switch rAF chain** | Effects #10 mount/unmount across two rAFs — any frame where geometry mismatches paint |
| **F4. `bufferOffset → 0` window** | The Effect #8 guard *exists* to prevent a flash; audit whether it covers all entry points |
| **F5. PIT/buffer race** | First-page result arrives before `_findAndFocusImage` finishes — brief expose of position-0 |
| **F6. Loading state gap** | Old buffer + `loading=false` + new params (the user thinks they're looking at fresh results, but it's stale) |
| **F7. Other** | Document and classify |

**Sites to audit explicitly:**
- Sort dropdown change (no focus, no phantom anchor) — Bug 2
- Sort dropdown change (with phantom anchor) — should be flash-free, verify
- Filter change without focus
- Query typing (debounced) — every keystroke or only the settled one?
- Scrubber seek — first paint of seek target buffer
- Scrubber drag (rapid) — multiple seeks in flight
- Logo click / Home key — "go home" path (Effect #8 guard)
- Density toggle (table↔grid) — Effects #10 rAF chain
- Popstate without snapshot (e.g. logo-reset entry)
- Popstate with snapshot (the recently-fixed path)
- Browser reload with sessionStorage snapshot
- Detail → list → detail (mount/unmount of overlay)
- Fullscreen enter/exit
- Two-tier mode: `bufferOffset` slide via extends — any visible jump?
- Switch from buffer mode to two-tier mode (total crosses 1k threshold mid-session?)
- ImageDetail close — `restoreAroundCursor` race vs scroll restoration
- New images poll → user clicks ticker → buffer reload (verify pre/post only)

**Method per site:** prefer reading the code path end-to-end and reasoning
about frame ordering. Where unclear, sketch a frame-by-frame timeline (like
Bug 2's). Where the bug is reproducible, **note the repro** but do NOT add
flash-detection tests in this audit phase (that's implementation work).

**Deliverable.** Single table:

| Site | Repro known? | Root-cause family | Severity (1–3) | Affected scroll modes | Notes |

Follow with a short summary: how many flash sites total, how many in family
F1 (Bug 2's family), how many would be deleted-by-construction by the
rearchitecture (i.e. live in the no-anchor path).

### Section 8 — Flash interaction with the rearchitecture

For each flash site found in Section 7, mark:

| Site | If P1 (always-set) wins | If P2 / status quo | Bug-2 Option B (`_scrollResetGeneration`) addresses it? |
|---|---|---|---|

The answers feed directly into the verdict. If ≥80% of flash sites are in
family F1 *and* are deleted-by-construction by P1, that's a meaningful point
in the rearchitecture's favour that the original plan didn't articulate.
Conversely, if most flashes are F3/F4/F5 (density, buffer, PIT race), the
rearchitecture doesn't help them — they need their own fixes regardless.

**Deliverable.** The table above + a one-line summary of the F1-vs-other
ratio.

### Section 9 — Atomicity primitives audit

Kupua already has one working atomic-handoff primitive
(`sortAroundFocusGeneration` + Effect #9) and one defensive after-the-fact
guard (`bufferOffset → 0` in Effect #8). Bug 2's proposed fix
(`_scrollResetGeneration`) would add a third.

**Method.** List every existing generation/counter/ref-based atomic primitive
in the codebase that exists to prevent flashes or coordinate buffer/scroll
swaps. For each:

| Primitive | File:line | What it coordinates | Add new generation, or fold into an existing one? |

**Deliverable.** The table + a recommendation: should new flash fixes use a
fresh generation per category, or is there an opportunity to consolidate
(e.g. a single `_bufferSwapGeneration` that all post-swap effects watch)?
Flag if consolidation would conflict with the rearchitecture.

### Section 10 — Honest verdict

After Sections 1-9, write **one paragraph each** answering:

> **Q1 (rearchitecture):** Given what you found, should the
> position-preservation rearchitecture proceed? If yes, in what reduced
> form? If no, what should we do instead with the phantom-path fragility?

> **Q2 (intermediate flash):** Should the flash family be fixed in the same
> work as the rearchitecture (one coherent change), separately (Option B
> `_scrollResetGeneration` per Bug 2 doc), or are they substantially
> different problems that just look related?

> **Q3 (sequencing):** If both Q1 and Q2 say "yes, proceed", which goes
> first and why? (The wrong order can make the second one harder.)

Then a short list of **concrete next steps**, ordered by value/risk.

---

## Strict scope rules for the auditor

- **NO source changes.** Only test code changes if needed to extend the
  diagnostic spec, and only with user approval per AGENTS directives.
- **NO running perf tests autonomously** — only suggest them per AGENTS
  directive table.
- **Playwright runs require user approval per session** (port :3000, TEST
  cluster).
- **Do not commit anything.**
- **Report only.** Findings document is the only deliverable.

## Files the auditor should expect to read

Primary:
- `src/stores/search-store.ts` (3,580 lines — `_findAndFocusImage`, `search()`, focus state)
- `src/stores/ui-prefs-store.ts` (focus mode + coarse pointer)
- `src/hooks/useScrollEffects.ts` (effects #7, #9, #10 — ratio save/restore)
- `src/hooks/useUrlSearchSync.ts` (popstate restore, phantom promotion)
- `src/lib/build-history-snapshot.ts`, `src/lib/history-snapshot.ts`
- `src/hooks/useDataWindow.ts` (`getViewportAnchorId`)
- `src/components/ImageGrid.tsx`, `ImageTable.tsx` (click handlers, focus ring)
- `src/hooks/useListNavigation.ts` (kbd nav)
- `src/hooks/useImageTraversal.ts` (prev/next from detail)
- `src/components/ImageDetail.tsx`, `FullscreenPreview.tsx`
- `src/components/ImageMetadata.tsx` / metadata panel selectors

Architecture context:
- `exploration/docs/00 Architecture and philosophy/02-focus-and-position-preservation.md`
- `exploration/docs/position-preservation-rearchitecture-handoff.md` (the naive plan)
- `AGENTS.md` (Component Summary, Stable Test Corpora)

Tests:
- `e2e/smoke/phantom-drift-diag.spec.ts`
- `e2e/local/browser-history.spec.ts`
- `e2e/local/keyboard-nav.spec.ts`
- `e2e/local/scrubber.spec.ts` (flash-relevant: scroll-mode, seek transitions)
- `src/stores/search-store.test.ts`
- `src/lib/build-history-snapshot.test.ts`

Flash-specific context:
- `preexisting-bugs-found-during-history-work.md` § Bug 2 (the seed bug + Option B fix sketch)
- `useScrollEffects.ts` Effect #7 (eager scroll-reset — the F1 archetype)
- `useScrollEffects.ts` Effect #8 (`bufferOffset→0` guard — existing flash prevention)
- `useScrollEffects.ts` Effect #10 (density-switch rAF chain — F3 candidates)
- `search-store.ts` § `search()` else-branch ~L1830 (where `_scrollResetGeneration` would be bumped)

---

## What the synthesising agent (after audit) needs

Once findings land, a third session merges them into the rearchitecture
handoff. That session needs:

- A clear yes/no/reduced-scope from Section 10 Q1 (rearchitecture)
- A clear answer from Section 10 Q2 (flash: same-work vs separate)
- A sequencing answer from Section 10 Q3
- A perf-tested answer to P1 vs P2 (Section 3) — this drives Q1
- The full B/D-category list from Section 2 — this is the migration scope for Q1
- The drift measurements from Section 1 — this confirms or denies Q1's motivation
- The flash inventory from Sections 7–9 — this drives Q2 and may strengthen Q1

If Sections 1 and 3 both come back negative ("drift fixed", "perf cost
unacceptable") AND Section 8 shows the flash family is mostly *not*
deleted-by-construction by the rearchitecture, the rearchitecture handoff
should be archived and Bug 2's Option B should be implemented standalone.

If the flash inventory shows F1 dominates and overlaps heavily with the
phantom-path code that the rearchitecture deletes, the rearchitecture's case
strengthens significantly — because it would now solve two bug families with
one change instead of one.
