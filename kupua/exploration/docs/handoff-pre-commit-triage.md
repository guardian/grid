# Handoff — Pre-commit Triage of Uncommitted Bread-and-Butter Work

**Produced:** 10 May 2026
**For:** Sonnet High (Claude). Fresh session preferred.
**Mode:** read + propose + (with user approval) commit
**Cwd discipline:** kupua-only. `git add kupua/` from repo root, never `git add -A` / `git add .`
**Estimated time:** one focused session

---

## Why this handoff exists

Two-plus days of bread-and-butter work sit uncommitted on
`mk-next-next-next`. The work is heterogeneous: some of it is
permanent (Phase 0/A scaffolding, TS cost compute, cost UI styling,
drive-by fixes), some is about to be torn out (`useEnrichment`
background loop, connection-starvation gymnastics, visible-first
ordering — see `handoff-drop-enrichment-and-ts-replicate.md`).

If we commit everything as one blob and then strip the enrichment loop,
the useful work ends up living in a commit titled "superseded /
about-to-be-stripped" — confusing forever after. If we strip first
and then commit, we lose the diff that explains "what was here
before nothing".

The fix: split the working tree into a **sequence of small,
purpose-named commits** so that the upcoming strip touches only
the one commit it needs to revert.

## Push-back clauses

1. If `git status` shows the tree is actually small (say <200 LOC of
   diff total) and obviously cleaves into at most 2 commits, do the
   2-commit pair from the previous plan and STOP. Don't manufacture
   complexity.
2. If you find genuinely entangled changes that can't be cleanly
   split (one file mixes enrichment-loop code with permanent
   styling work), STOP and report. Don't reach for `git add -p` to
   force-split — ask the user whether to (a) live with the entanglement
   in one commit named for the dominant intent, or (b) refactor first.
3. If you find ANYTHING that looks like a secret in the diff (panda
   cookie value, AWS key, signed URL, real user email, JWT, internal
   hostname), STOP and alert the user. Do not commit. See AGENTS.md
   secrets directive.

## Inputs to read first

1. `git status` from repo root.
2. `git diff --stat HEAD -- kupua/` — file-by-file change sizes.
3. `kupua/exploration/docs/worklog-current.md` — narrative of what
   landed.
4. `kupua/exploration/docs/handoff-drop-enrichment-and-ts-replicate.md`
   — confirms what's about to be torn out (so you know which files
   belong in the doomed commit).
5. `/memories/session/api-integration-cluster-planning.md` (if
   accessible) — full architectural context.

## What to produce (in order)

### Step 1 — Inventory the diff

For each file with changes, classify into one of these buckets:

- **PERMANENT-SCAFFOLDING** — Phase 0/A foundation (service-discovery,
  write-guard, Argo helpers, error classes, types, adapter skeleton,
  vite.config write-guard plugin).
- **PERMANENT-COMPUTE** — TS cost/validity libs and Guardian config
  snapshot (`src/lib/cost/`).
- **PERMANENT-UI** — Badge primitives, tailwind tokens, grid-cell
  overlays, ImageMetadata Rights section, MultiImageMetadata cost
  summary, anything else cost/validity-styling-related.
- **PERMANENT-BASELINE** — `SOURCE_INCLUDES` changes,
  `es-adapter.ts` shape adjustments for the enrichment baseline.
  (The strip session widens these further; current changes survive.)
- **DRIVE-BY** — Unrelated fixes / improvements made while passing
  through. Group by topic if multiple distinct ones; otherwise one
  "miscellaneous improvements" commit is fine.
- **DOOMED** — `useEnrichment` hook, its tests, the route-level mount,
  enrichment-store wiring that exists ONLY for the background loop
  (NOT the store itself if it'll be reused for single-image fetches),
  connection-starvation mechanisms, three-engineering-asks docs that
  are about to be moot.
- **DOCS** — `kupua/exploration/docs/` changes. Usually one or two
  commits at the end (worklog rollup + architectural decisions).

### Step 2 — Propose a commit plan

Output a numbered list to the user:

```
1. <bucket / topic> — files: a.ts, b.ts (~LOC). Title: "<proposed>".
2. ...
N. Background enrichment + ?ids= adapter wiring [DOOMED — to be
   stripped in next commit]. Files: useEnrichment.ts, ...
   Title: "Background enrichment via ?ids= (kept for diff reference,
   removed in next commit)".
```

Suggested ordering: permanent stuff first (most foundational →
most surface-level), drive-bys next, doomed enrichment last, docs
last-of-last. Reason: when the strip commit lands, the doomed
commit and the strip commit sit next to each other in the log —
maximally readable.

**STOP HERE** and wait for user approval before any `git add` or
`git commit`. The user MUST approve the plan. They may want to
re-order, merge, or split.

### Step 3 — Execute the plan

After user approval:

For each commit, in order:
1. `git status` to confirm what's outstanding.
2. `git add kupua/<paths>` — explicit paths, never `-A` / `.`.
3. `git status` again to verify only intended files are staged.
4. Write commit message to a temp file via heredoc (multi-line
   commit messages must NEVER go via `git commit -m`):
   ```bash
   cat > /tmp/kupua-commit-msg.txt <<'EOF'
   <title>

   <body if needed>
   EOF
   ```
   (Use `$TMPDIR` not `/tmp` — sandbox restriction. See AGENTS.md
   commit messages directive.)
5. `git commit -F "$TMPDIR/kupua-commit-msg.txt"`
6. Delete the temp file.
7. `git log --oneline -1` to verify.

After all commits land:
- `git log --oneline mk-next-next-next ^main -- ':!kupua/'` should
  be the existing tiny coherent list (if any), unchanged.
- `git log --oneline -10` to show the user the new commits.

Do NOT push. The AGENTS.md commit directive requires explicit user
approval per push.

### Step 4 — Update worklog

Move the current `worklog-current.md` "Session Log" content into
`kupua/exploration/docs/changelog.md` under the current phase
heading at top, paired with the commit hashes that landed.
Reset `worklog-current.md` to a fresh "Current Task" header
pointing at the next planned work (likely the inventory
condensation handoff or the strip handoff, whichever the user
runs next).

This is per AGENTS.md "Maintain a session worklog" directive.

## What done looks like

- Working tree clean (or contains only deliberately-deferred work
  with user awareness).
- Commit log has a clean sequence of purpose-named commits.
- Doomed enrichment commit sits last, clearly titled.
- Worklog rolled into changelog with hashes.
- No push.
- User has reviewed the log and confirmed before next session
  proceeds with the strip.

## Anti-goals

- No `git add -A` / `git add .` — will pick up unrelated repo state.
- No `cd kupua && ...` — zsh strips `cd`, leaves cwd at repo root,
  causes test artefacts to land at root. Always `git ... kupua/`
  from repo root.
- No `git push`.
- No multiline `-m` messages.
- No "while I'm in this file let me also fix..." — the triage is
  about partitioning what's already there, NOT writing new code.
- No proceeding past Step 2 without user approval of the plan.
- No bypassing pre-commit hooks (`--no-verify` forbidden per
  AGENTS.md operational safety).
