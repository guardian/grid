# Kupua Bug-Hunt Audit — Handoff

**Status:** Audit phase. NO CODE CHANGES. Report-only.
**Created:** 2026-04-28
**Auditor model:** Sonnet 4.6 High (Medium acceptable, High preferred at same price).
**Goal:** Produce a ranked, actionable bug list the user can work through one-by-one.
**Anti-goal:** Refactor proposals, style notes, dead-code reports, "code smells."
Those belong in separate audits. **If you find yourself writing one of those,
stop and put it in an appendix labelled "Out of scope — for separate audit."**

---

## What this audit is and is not

**This audit is:** a systematic hunt for bugs that a Guardian editorial user
could plausibly hit in normal or near-normal usage, ranked so the user can
work top-down through the list.

**This audit is not:**
- A refactor proposal. Even if you spot a screaming refactor, it goes in the
  out-of-scope appendix with one line of description, no implementation plan.
- A dead-code report. Same treatment.
- A test-coverage report. Same.
- A style/idiom review. Same.
- A "the architecture should be different" essay. Same.

**Why the strict scoping:** the user wants a bug list they can act on. Each
sentence about something else is a sentence not spent finding a bug. The
position-preservation audit succeeded because every section served one
decision; this audit succeeds if every finding is a bug the user can fix.

---

## Push-back clause (read first, act on it)

If after 30 minutes of reading you believe this audit's premise is wrong —
e.g. "the codebase is in good shape, this is going to produce noise," or
"the high-value bugs all live in one subsystem and the audit should be
narrowed," or "I cannot do this without running the app and you've forbidden
that" — **stop and write a Section 0 explaining why, then halt.** Do not
produce a half-hearted full audit. The user explicitly values "no, and
here's why" over compliance.

---

## Strict rules

- **NO source changes.** None.
- **NO running tests autonomously.** May *suggest* tests at the end.
- **NO Playwright runs** without user approval per session.
- **Cite file:line for every claim.** Unsourced bug claims are forbidden.
  If you cannot point at the line, the bug is not real enough to report.
- **No commits, no pushes.**
- **Findings document is the only deliverable.**

---

## Required deliverable

A single markdown file:
`kupua/exploration/docs/bug-hunt-audit-findings.md`

Structure described below. Be terse. Tables over prose. Cite file:line
everywhere. No padding.

---

## Section 0 (optional) — Push-back

Only present if you're invoking the push-back clause. If you write this
section, do not write the others.

## Section 1 — Methodology actually used

**Required.** 5-15 lines. State:
- Which files you read end-to-end vs scanned vs skipped, and why.
- Which subsystems you went deep on vs sampled.
- What heuristics you used to decide "this is a bug" vs "this is intended."
- Anything you couldn't assess (e.g. "couldn't verify without running ES").

This section exists so the user knows where the gaps in coverage are and
can commission a follow-up audit for the unscanned areas.

## Section 2 — Bug inventory (the main deliverable)

A single table, **sorted by severity descending, then by frequency-class
descending**. Every row is a bug.

| # | Title (≤8 words) | File:line(s) | Severity | Frequency-class | Trigger conditions | User-visible symptom | Affected scroll modes | Confidence | Repro hypothesis |
|---|---|---|---|---|---|---|---|---|---|

**Column definitions — use these exactly:**

- **Severity:**
  - **S1 — User-visible breakage:** wrong data shown, lost work, lost
    position with no recovery, app stuck, feature unusable.
  - **S2 — User-visible degradation:** flicker, brief wrong content,
    laggy interaction, focus jumping, scroll jumping, visible jank
    on common operations, recoverable confusion.
  - **S3 — Latent / contributory:** bug exists but is masked, or only
    surfaces in combination with another bug, or is a foot-gun for future
    edits. Include only if you can name a plausible scenario that would
    expose it.

- **Frequency-class** (objective, code-derived — do NOT estimate user %):
  - **F-Always:** fires on every search / every render / every scroll.
  - **F-Common:** fires on a routine action (sort, filter, click image,
    open detail, popstate, density toggle).
  - **F-Edge:** requires a specific combination (e.g. two-tier + phantom
    + sort change) but each ingredient is itself common.
  - **F-Rare:** requires a sequence or timing window that's hard to hit.

- **Trigger conditions:** terse list. e.g. "two-tier mode + phantom
  anchor + sort change + bufferOffset > 0".

- **User-visible symptom:** one sentence describing what the user sees or
  experiences. If you can't write this sentence, the bug is S3 at most.

- **Affected scroll modes:** subset of {scroll, two-tier, seek, all, n/a}.

- **Confidence:**
  - **High:** you traced the code path end-to-end and the bug is
    mechanically present.
  - **Medium:** you traced most of it, one assumption remains unverified.
  - **Low:** you suspect it from pattern but did not fully trace. Include
    Low-confidence bugs only if they're S1 or F-Always — otherwise drop.

- **Repro hypothesis:** the minimum sequence of user actions to trigger,
  or "needs investigation" if you cannot construct one. The fix agent will
  use this as the starting point.

**Volume guidance:** I expect **15-50 bugs total**. If you find <10, you
either undersearched or the codebase is genuinely clean (call it in
Section 1). If you find >60, you're including things that aren't bugs
(probably style/refactor opinions); tighten the criterion.

## Section 3 — Bug clusters

**Why:** if 5 bugs share a root cause, fixing the root cause is
higher-leverage than fixing 5 symptoms. The fix agent needs to know.

For each cluster of ≥2 bugs sharing a likely root cause:

| Cluster name | Bug #s from Section 2 | Suspected shared root cause | File:line of suspected root |

Do not invent clusters of 1. Do not propose the cluster fix here — that's
refactor work and out of scope. Just identify the cluster.

## Section 4 — Areas not audited

Be explicit. List subsystems, files, or scenarios you did NOT cover, with
one-line reasons. The user uses this to decide on follow-up audits.

## Section 5 — Suggested verification steps

For S1 bugs only, suggest the cheapest way to confirm or refute. Examples:
"Add a Vitest covering condition X," "Manual repro: do A, B, C, observe D,"
"Run existing test e2e/foo.spec.ts which probably already exercises this."
**Do not write the tests.** Just suggest.

## Appendix A — Out-of-scope observations

Drop here, with one line each:
- Refactor opportunities (the audit will commission these separately)
- Suspected dead code (separate audit)
- Test-coverage gaps that are not tied to a specific S1/S2 bug
- Architectural questions

Cap at 30 items. If you have more, you've spent too much time outside the
remit.

---

## Where to look (priority order)

You don't have to cover everything. Spend budget on the high-bug-density
areas first. If you run out of budget, stop and declare the rest in
Section 4.

**Tier 1 — likely highest bug density:**
- `src/stores/search-store.ts` — 3.5k lines, the heart. Especially:
  `search()`, `_findAndFocusImage()`, `extend()`, `seek()`, focus state
  transitions, generation counters.
- `src/hooks/useScrollEffects.ts` — Effects #7-#10, ratio save/restore,
  density-switch rAF chains.
- `src/hooks/useDataWindow.ts` — `getViewportAnchorId`, position-map,
  buffer-offset arithmetic.
- `src/hooks/useUrlSearchSync.ts` — popstate, snapshot restore, phantom
  promotion.

**Tier 2 — high coupling, easy to break:**
- `src/lib/orchestration/*` — search orchestration.
- `src/lib/build-history-snapshot.ts`, `src/lib/history-snapshot.ts`,
  `src/lib/reset-to-home.ts`.
- `src/hooks/useImageTraversal.ts`, `useListNavigation.ts`.
- `src/components/ImageGrid.tsx`, `ImageTable.tsx` (click handlers, focus
  ring, virtualization integration).
- `src/components/ImageDetail.tsx`, `FullscreenPreview.tsx` (mount/unmount
  races).

**Tier 3 — sample only unless something points you here:**
- `src/components/ImageMetadata.tsx`, scrubber, ticker, density toggle.
- `src/stores/ui-prefs-store.ts`.
- ES query construction, pagination tokens.

**Things to specifically look for** (not exhaustive — use judgement):
- **Race conditions:** in-flight request + state change, two `set()` calls
  with render between, rAF chains where a frame can paint mid-chain.
- **Stale closures:** effects/callbacks reading captured state that has
  moved on.
- **Atomicity gaps:** generation counters that are bumped late, missed,
  or not consulted.
- **Off-by-one:** anywhere with `bufferOffset`, position-map indices,
  page boundaries, two-tier seam.
- **Wrong loading semantics:** `loading=false` while old data still
  visible, or `loading=true` blocking a recoverable interaction.
- **State-machine impossibilities:** combinations of flags that the code
  doesn't handle but the UI can produce.
- **Snapshot lifecycle bugs:** snapshot written at the wrong moment,
  overwritten by a guard that doesn't fire, restored from the wrong key.
- **Focus/scroll desync:** focus state and scroll position telling
  different stories.
- **Memory/listener leaks:** effects without cleanup, event listeners
  attached but never removed, AbortController never aborted.

**Things explicitly out of scope:**
- TypeScript type weakness that isn't a runtime bug.
- "This function is too long."
- Naming.
- "We could split this into a hook."
- Anything you can only describe as "would be cleaner if."

---

## Files to read first

- `kupua/AGENTS.md` — Component Summary, known issues, key decisions.
- `kupua/exploration/docs/00 Architecture and philosophy/component-detail.md`
- `kupua/exploration/docs/00 Architecture and philosophy/02-focus-and-position-preservation.md`
- `kupua/exploration/docs/changelog.md` — recent fixes (don't re-report
  things already fixed; if a bug looks fixed, verify before listing).
- `kupua/exploration/docs/preexisting-bugs-found-during-history-work.md`
  — known bugs; don't re-list these unless you find a new aspect.
- `kupua/exploration/docs/deviations.md` — intentional departures, don't
  flag these as bugs.

---

## What "done" looks like

- Section 2 has 15-50 rows, sorted, every row has file:line.
- Section 1 honestly states coverage gaps.
- Section 4 names what was skipped.
- Appendix A is ≤30 items.
- No section contains a refactor proposal disguised as a bug.
- The user can open the doc, scan Section 2, and start fixing.

If after producing Section 2 you realise your bug-criterion was wrong
(e.g. half the rows are arguably intended behaviour), say so at the top
of Section 2 and offer to redo with a tightened criterion. Better to flag
it than to ship a noisy list.
