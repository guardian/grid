# Handoff — Browser history audit (discovery only, no implementation)

## What this is

A **read-only discovery task**. You will compile an exhaustive inventory of every code path in `kupua/src/` that touches browser history, and produce a structured audit table that the user (and a future implementation session) can use to make decisions.

**You are not implementing anything.** No code changes. No fixes. No "while I'm here" cleanups. The output is one section appended to `kupua/exploration/docs/browser-history-analysis.md`.

## Why this exists

The user wants to tighten kupua's browser history model before doing snapshot-based position-preservation work. Before any tightening can be planned, we need to know exactly what's there — including blind spots the existing analysis doc doesn't enumerate. The doc currently lists five known baseline items; this audit may surface more (or merge/split/disprove some), and will produce the full call-site inventory that decisions can be made against.

## Read first (in order)

1. **This file.**
2. [browser-history-analysis.md](./browser-history-analysis.md) — the whole doc. Pay particular attention to:
   - "Guiding philosophy" — the test you apply when judging each call site.
   - "History entry rules" table — the *claimed* current state. Verify it.
   - "Other custom behaviours worth knowing" — `suppressNextRestore`, sessionStorage offset cache, dev globals, display-only keys.
   - "Baseline tightening — prerequisites for any position-preservation work" — the 5 items the user already knows about. Your audit must cover these *and* find anything else.
3. The five files listed under "Key files" in the analysis doc. Read them in full.
4. [e2e/local/browser-history.spec.ts](../../e2e/local/browser-history.spec.ts) — the existing 5 history tests.

## The task

Find every code path in `kupua/src/` that mutates browser history, directly or transitively. For each, fill out a row in the audit table (template below). Then write a short narrative summary of patterns, inconsistencies, and likely-but-undecided baseline items.

### What counts as "touches history"

- Direct: `navigate(...)`, `useNavigate()`, `router.navigate(...)`, `history.pushState`, `history.replaceState`, `history.back`, `history.forward`, `history.go`, `window.location` assignments.
- Indirect via TSR: `<Link>`, `<Navigate>`, `redirect()` in loaders/route configs.
- Indirect via kupua helpers: `useUpdateSearchParams()`, `resetToHome()`, anything that delegates to the above.
- Mount-time URL synthesis (e.g. the default-injection redirect in `useUrlSearchSync`).
- Programmatic focus / scroll changes — *only* if they also touch URL. Plain focus/scroll moves are out of scope.

### What's out of scope

- Don't audit non-history Zustand actions, hooks, or component state.
- Don't audit perf code, ES query construction, or buffer logic.
- Don't audit dev-only routes or experiments under `e2e-perf/` or `exploration/`.

## Audit table template

Append a new section to [browser-history-analysis.md](./browser-history-analysis.md) **immediately after the "4. Logo-reset relies on popstate-by-default" subsection of "Baseline tightening"**. Header:

```markdown
### Audit table — every history-touching call site

(Compiled <date> by <agent model>. Read-only audit — no decisions made.)
```

Then a markdown table with these columns:

| Site | File:line | Trigger (user action or condition) | Push or replace | Marks user-initiated? | What "useful view" it represents (per philosophy) | Today's back/forward behaviour | E2E test coverage | Inconsistency / question flagged |

Column notes:

- **Site:** A short stable handle, e.g. `closeDetail`, `enterDetail-grid`, `logo-reset`, `default-injection`, `traversal-onNavigate`, `cqlSearch-debounced`. Use the same handle anywhere else in the doc references it.
- **File:line:** Workspace-relative path with line number, as a markdown link: `[components/ImageDetail.tsx:232](kupua/src/components/ImageDetail.tsx#L232)`. Use the line of the actual `navigate()` call (or equivalent), not the function start.
- **Trigger:** What user action or system condition causes this to fire. E.g. "user clicks ← Back to search", "useUrlSearchSync mounts with empty params", "first traversal step away from entry image".
- **Push or replace:** `push`, `replace`, or `n/a` (for `history.back` etc).
- **Marks user-initiated?:** `yes` (calls `markUserInitiatedNavigation()` directly or via `useUpdateSearchParams`), `no` (raw call, doesn't mark), or `n/a` (popstate-driven).
- **Useful view:** One short sentence applying the guiding philosophy. E.g. "the search context with applied filters" or "an opened image — back should re-show the previous list state". If it doesn't represent a useful view, write "n/a — intermediate" or "n/a — chrome".
- **Today's back/forward behaviour:** What happens on browser back from this entry, and on browser forward back to this entry. Concrete and observed, not theoretical. Run it in the dev server if unsure.
- **E2E coverage:** Test name + file, or `none`. List multiple if covered by several.
- **Inconsistency / question flagged:** Anything that doesn't match the guiding philosophy, or that you can't decide without user input. E.g. "should this push? today it replaces, but it commits a useful view", "depends on whether default-injection on mount should be reachable via forward". Be explicit; this column is what the user reads to make decisions.

### After the table

A "Patterns and questions" subsection — bulleted list of:

- Patterns observed across the table (e.g. "all raw `navigate()` sites currently bypass `markUserInitiatedNavigation()`; only `useUpdateSearchParams` calls it").
- Likely baseline items to add to the "Baseline tightening" section, **as questions for the user, not as decisions**. E.g. "Should `enterDetail` mark user-initiated? Today it doesn't, and the dedup guard absorbs the consequence — but if `image` ever became search-affecting, this would silently break."
- Confirmations or contradictions of the 5 items the user already listed. If item N is correctly described in the doc, say so; if your audit shows it's incomplete or wrong, say that.
- Anything in the analysis doc that is **inaccurate** — verify the "History entry rules" table by inspecting code, not by trusting the doc. The doc was last verified during a previous session and code may have drifted.
- Cross-cutting questions the user needs to answer before baseline implementation can start. E.g. "Should `closeDetail` be `history.back()` regardless of `history.length`, or only when length > 1?"

## Non-negotiables

- **Read-only.** No source-code changes. The only file you may edit is [browser-history-analysis.md](./browser-history-analysis.md), and only to append the audit section (and fix any *factual inaccuracies* you find in the existing content — flag those changes clearly in your final summary).
- **No implementation plans, no recommendations beyond questions.** The audit is for *gathering*, not *deciding*. If you find yourself drafting "here's how to fix X" — stop, rephrase as "X is currently Y; should it be Z?".
- **No skipping sites because they "obviously work".** Every history-touching site goes in the table even if it looks fine. The point is exhaustive inventory.
- **Verify, don't trust.** The analysis doc claims things; check them against the code. If e.g. it says "logo reset uses raw navigate", verify by reading `SearchBar.tsx` and `reset-to-home.ts`.
- **Don't touch anything in "Future polish"** of the analysis doc. That work happens later, in a different session.

## Things you might think are problems but aren't

- **`density` is a display key but pushes.** This is intentional per the guiding philosophy. The `URL_DISPLAY_KEYS` set governs whether a key change triggers re-search, not whether it pushes.
- **`__kupua_router__` and `__kupua_markUserNav__`.** Dev-only globals exposed in `main.tsx`. Used by E2E. Not a bug.
- **`suppressNextRestore`.** A safety valve in `search-store.ts` used by `resetToHome()`. Not history-related per se but appears in the same conversation. Note its existence in your audit; don't pull on it.

## What "good" looks like

- Audit table has at least 6 rows (the doc currently knows of 6 sites; you may find more). 10+ is plausible; 20+ would be surprising and worth re-reading the scope.
- Every row's "Today's back/forward behaviour" column is concrete and observed, not "probably resets" / "should preserve focus".
- Every "Inconsistency / question flagged" entry is phrased as something the user can answer yes/no, or with a short choice between two options.
- The "Patterns and questions" section gives the user a digestible reading order — pattern observations first, then the questions ranked by what most blocks baseline work.
- The new section reads as a peer to the existing "Other custom behaviours worth knowing" section — same depth, same precision, same tone.

## Test discipline

You're not running unit or e2e tests as part of this work (no code changes). You **may** run the dev server to observe back/forward behaviour for the "Today's back/forward behaviour" column. Per `.github/copilot-instructions.md`:

- Stop any dev server on :3000 first if you start one — warn the user, wait.
- Don't run tier-matrix or perf surfaces (irrelevant here).
- Real-ES surfaces: don't touch. This is local-only work.

## When to stop and ask

- If you find yourself wanting to make a code change. Stop, ask why; the answer is almost always "don't".
- If a call site's behaviour can't be determined from code alone and dev-server observation is ambiguous (e.g. interaction with TSR internals).
- If your row count exceeds ~15 — the scope may have crept; check with the user.
- If the audit reveals what looks like a real bug (not just an inconsistency with the philosophy). Flag it; don't fix it.

## Deliverables

1. Appended audit section in [browser-history-analysis.md](./browser-history-analysis.md), placed immediately after the "4. Logo-reset relies on popstate-by-default" subsection of "Baseline tightening".
2. A short final summary (in your reply, not in any file) listing: (a) total sites audited, (b) any factual corrections you made to the existing doc, (c) the top 3–5 questions the user should answer before baseline implementation starts.
3. **Do not delete this handoff file.** The user will delete it after confirming the audit lands cleanly.

## Model choice note (FYI)

This task is being given to you because the user judged the discovery work needed judgement, not just grep — distinguishing intentional from accidental absences, applying the guiding philosophy, spotting blind spots the doc doesn't enumerate. Lean into that. A literal "here are all `navigate()` calls" report is not what's wanted.
