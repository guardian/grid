# Docs Inventory Handoff (Session 1 of 3 — Sonnet)

**Date written:** 7 May 2026.
**Author:** Opus (planning agent), with mk.
**Audience:** A fresh Sonnet session, called as a research subagent.
**Mindset:** Mechanical inventory. No analysis. No proposals. No edits.
Deliverable is a single tabular findings document.

> **This is Session 1 of a 3-session arc.** Session 2 (Opus, no edits)
> reads your inventory and produces a consolidation plan. Session 3+
> (Sonnet, one merge per session) executes the plan. Your job is the
> table — not the plan, not the merges.

---

## Why this exists

`kupua/exploration/docs/` has accumulated ~30–60 markdown files over
~6 weeks of fast iteration. Some are canonical references actively
used; some are research artefacts written once and never touched
again; some are handoffs whose work is long-since done; some are
old plans superseded by newer ones. The tree needs a consolidation
pass. The pass needs an inventory first.

You build the inventory. You don't decide anything. mk and the next
agent will use your output to plan the actual consolidation.

---

## Scope

**In scope:** every `.md` file under `kupua/exploration/docs/`,
including the four subdirectories:
- `00 Architecture and philosophy/`
- `01 Research/`
- `03 Ce n'est pas une pipe dream/`
- `zz Archive/`

…and the loose files at the docs root.

**Out of scope:**
- Any `.md` outside `kupua/exploration/docs/` (e.g. `kupua/AGENTS.md`,
  `kupua/README.md`, root-level `README.md`). They have their own
  audience and don't belong in this consolidation.
- Anything non-`.md` (`.DS_Store`, screenshots, etc.).

---

## What the deliverable looks like

A single markdown file with **one big table** (one row per `.md`
file in scope) followed by a **short summary section** (described
below). That's it. No prose analysis. No recommendations.

### The table — columns

| Column | Values | Notes |
|---|---|---|
| **Path** | repo-relative path | e.g. `kupua/exploration/docs/01 Research/grid-api-contract-audit-findings.md` |
| **Folder** | `00-arch` / `01-research` / `03-future` / `zz-archive` / `root` | One of five buckets. |
| **Filename prefix** | first word/token of filename, normalised | E.g. `kahuna`, `kupua`, `grid`, `selections`, `scroll`, `position`, `bulk-fetch`. Identifies system OR component. Pull from filename, don't infer. |
| **Lines** | integer | `wc -l` |
| **Created (git)** | ISO date | `git log --diff-filter=A --follow --format="%aI" -- <path> \| tail -1`. The first commit that introduced the file. |
| **Last modified (git)** | ISO date | `git log -1 --format="%aI" -- <path>`. Most recent commit touching the file. |
| **Last modified (mtime)** | ISO date | Filesystem mtime. Catches uncommitted edits. If different from git last-modified, note it. |
| **Doc type** | `living-reference` / `research-artefact` / `plan` / `handoff` / `worklog` / `changelog` / `unclear` | See definitions below. |
| **Topic** | 1–3 words | What the doc is about. E.g. "Kahuna image-detail UI", "ES position-map walks", "selections phase S4", "API enrichment". |
| **Audience** | `agent` / `human` / `both` | Who is this written for? Most are `both`; flag the exceptions. |
| **Apparent status** | `canonical` / `superseded` / `done-handoff` / `stale-suspected` / `archive-current` / `unclear` | See definitions below. |
| **Lift candidates (archive only)** | `Y / N` + 1-line note, OR `—` for non-archive | For `zz-archive/` rows ONLY: does this contain a specific finding/table/diagram that would strengthen a current canonical doc? Default `N`. Bar is HIGH. |
| **Notes** | ≤2 sentences | Anything else worth flagging — explicit references to/from other docs, broken links, obvious overlaps with other rows. |

### Doc-type definitions

- **`living-reference`** — updated as the system changes. Examples:
  `field-catalogue.md`, `infra-safeguards.md`, `deviations.md`,
  architecture overviews. Test: would touching the codebase invalidate
  a claim in this doc?
- **`research-artefact`** — snapshot of what was true when written;
  not maintained. Examples: the Kahuna audits in `01 Research/`.
  Grid backend changes slowly so these stay roughly accurate.
- **`plan`** — describes intended future work. Examples: workplans in
  `03 Ce…/`. Plans are inherently in flight; multiple plans on the
  same topic usually means newer one supersedes older.
- **`handoff`** — a brief written for a (usually past) agent session.
  Most should be deletable post-execution. Filename usually contains
  "handoff".
- **`worklog`** — `worklog-current.md`. There should be exactly one.
- **`changelog`** — `changelog.md`. There should be exactly one.
- **`unclear`** — flag, don't guess. Session 2 will categorise.

### Apparent-status definitions

- **`canonical`** — the one place the workspace currently treats as
  authority on its topic. Most living references will be canonical.
- **`superseded`** — there exists a newer doc covering the same topic
  more completely. mk's example: `migration-plan.md` → `integration-
  workplan-bread-and-butter.md`. Mark BOTH rows: the newer one as
  `canonical`, the older as `superseded`, and cross-reference in
  Notes.
- **`done-handoff`** — handoff brief whose work has been executed
  (check changelog for evidence). Default for handoff-type docs.
- **`stale-suspected`** — created >3 weeks ago, never modified since,
  and you suspect (from a quick scan) the underlying code or design
  has moved. Be conservative; don't over-flag. Living references in
  particular age fast in this codebase.
- **`archive-current`** — for files in `zz Archive/`. Means "this is
  archived as expected; no action needed". Default for archive rows.
- **`unclear`** — flag, don't guess.

### Status-by-folder defaults (apply unless evidence contradicts)

- **Root docs** are *expected* to be in-flight working files (worklog,
  changelog, current-effort plans). But this is theory; some are
  actually superseded relics. Investigate per-file.
- **`00 Arch`** docs default to `canonical` unless superseded.
- **`01 Research`** docs default to `canonical` (research artefacts
  age slowly).
- **`03 Ce…`** docs: per-topic, the **newest is canonical**, older
  ones default to `superseded`. Use git "Created" date to determine
  newest-per-topic when timestamps are close.
- **`zz Archive`** docs default to `archive-current` unless they
  contain something worth lifting.

---

## Method

### Step 1 — File discovery

```bash
find kupua/exploration/docs -name "*.md" -type f | sort
```

Confirm the count matches expectations (~30–60 files). If you see
weird non-`.md` artefacts mixed in, list them in the Notes section
of the summary, but don't act on them.

### Step 2 — Per-file: collect mechanical metadata

For each file, in parallel where possible:

```bash
wc -l "<path>"
git log --diff-filter=A --follow --format="%aI" -- "<path>" | tail -1
git log -1 --format="%aI" -- "<path>"
stat -f "%Sm" -t "%FT%T" "<path>"   # macOS mtime
```

If `git log` returns empty for a file (uncommitted), note "untracked"
in Created and use mtime for Last-modified.

### Step 3 — Per-file: skim content, fill semantic columns

Read the **top of each file** (first ~30 lines) plus enough of the
body to determine: doc type, topic, audience, apparent status,
references to/from other docs.

**Do NOT** read the full content of long docs (>500 lines) just to
fill these columns. Skim. The 30-line header + section headings are
usually enough. The exceptions are:
- Files where the apparent status looks like `superseded` — confirm
  by spot-checking the suspected superseder.
- Files in `zz Archive/` where you're checking for lift candidates —
  read enough to decide Y/N for the lift column.

**Cite sources, don't paraphrase.** When you mark a doc `superseded`,
cite the canonical version in Notes (`superseded-by:
03 Ce.../bread-and-butter.md`). When you mark a handoff `done-
handoff`, cite the changelog entry that closed it if you can find one.

### Step 4 — Spot the obvious overlaps

While building the table, you will inevitably notice "X and Y are
about the same thing". Don't try to deeply analyse — that's Session
2's job. But DO flag obvious overlap pairs/triples in Notes
(`overlaps-with: <path>`). Volume bound: ~5–15 overlap pairs flagged
across the whole table is the sweet spot. If you flag everything,
you've drifted into analysis.

### Step 5 — Write the summary section

After the table, a short summary (≤80 lines) with:

1. **Counts:** total files, by-folder, by-doc-type, by-status.
2. **Newest-in-topic-per-folder:** for `03 Ce…/`, list the topic
   groups you spotted and the canonical (newest) member of each.
3. **Obvious overlap clusters:** the 3–8 strongest pairs/triples you
   flagged. One line each.
4. **Handoffs that look ready to delete:** list of paths you marked
   `done-handoff`. Don't delete anything. Just list.
5. **Anything weird:** files with no clear topic, files in the wrong
   folder by their content, broken references, etc. Cap at 10 items.

That's it. No "recommendations". No "I think we should". The summary
is a TL;DR of the table, not a plan.

---

## Falsifiable expectations / volume bounds

- **Total table rows:** ~30–60. If <20 or >80, double-check `find`
  output.
- **Status distribution:** rough sanity expectation — most rows are
  `canonical` or `archive-current`; a meaningful minority are
  `superseded` or `done-handoff`; small numbers are
  `stale-suspected` or `unclear`. If you have 40+ `unclear` rows,
  you're under-investigating.
- **Lift-candidate rate (archive):** expected very low. If you flag
  >25% of archive files as Y, your bar is too low. The bar is
  "specific finding/table/diagram that fills a real gap in a current
  doc" — not "interesting context".
- **Overlap flags:** 5–15 pairs total across the whole table. Not 50.
- **Summary length:** ≤80 lines. The table is the deliverable; the
  summary is navigation aid.

---

## Push-back clause

If the framing here is wrong — for example:

- The folder taxonomy (`00 Arch` / `01 Research` / `03 Ce…` /
  `zz Archive` / root) doesn't actually fit what you find on disk
  (e.g. `02-...` directory exists with content), OR
- A doc resists categorisation because it spans multiple types
  (e.g. half living-reference + half plan) AND this happens for
  many docs, suggesting the doc-type vocabulary is wrong, OR
- The codebase has changed in a way that invalidates the assumption
  about doc volume

— write a **Section 0** at the top of the deliverable explaining
what's wrong and **stop**. Don't carry on with a flawed framing.

---

## Cite-or-it-didn't-happen

Every status verdict needs a basis. `superseded` claims must cite
the superseder. `done-handoff` claims should cite changelog evidence
where possible. `stale-suspected` claims should cite the basis for
suspicion in 5–10 words.

The table cells will be terse — that's fine — but the Notes column
exists for citations. Use it.

---

## Operating ground rules

- **Read-only.** No edits to any doc. No deletions. No merges. The
  inventory is text-only output.
- **No commits.** mk will commit the inventory as part of the
  consolidation work.
- **kupua/ scope.** You may read other parts of the repo (e.g.
  `git log` on the kupua tree) but write only the inventory file
  inside kupua.
- **No tests, no code changes, no servers started.** Pure inventory.
- **Public repo.** The inventory itself doesn't need redaction (it
  contains paths and dates, not data values), but if a Notes cell
  would have to quote a panda cookie or signed URL or real email
  to make sense, find a different way to phrase it.

---

## What "done" looks like

- [ ] One markdown file with the inventory table + summary section.
- [ ] Every `.md` file in scope appears as exactly one row.
- [ ] Mechanical columns (Lines, Created, Last-modified×2) populated
      for every row.
- [ ] Semantic columns (Doc type, Topic, Audience, Apparent status)
      populated for every row, even if just with `unclear`.
- [ ] Lift-candidates column populated only for `zz-archive` rows;
      `—` for others.
- [ ] Notes column carries cross-references for any `superseded`,
      `done-handoff`, or overlap-flag verdict.
- [ ] Summary section ≤80 lines.
- [ ] No analysis. No proposals. No "we should…".
- [ ] Total length: ~200–400 lines (table size depends on file count).

---

## When you're done

Drop the deliverable as a markdown file at:

```
kupua/exploration/docs/docs-inventory-2026-05-07.md
```

(Date in the filename so future sessions can tell when the snapshot
was taken — this inventory will go stale, fast.)

Don't commit. mk will commit the inventory together with the next
session's consolidation plan and any actual merges.
