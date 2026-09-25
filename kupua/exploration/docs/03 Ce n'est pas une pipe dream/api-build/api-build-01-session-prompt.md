# API Build: Session Prompt

Paste everything below the line into a new chat, replacing `<UNIT>` with a unit ID from
[the plan](api-build-00-plan.md) section 4 (for example `U2`). Add any extra notes at the end.

---

You are a fresh executing agent for **unit `<UNIT>`** of the Kupua API build.

**Intake (before any edit):**
1. Say "Hi, I'm a fresh agent." Read `kupua/AGENTS.md`, `kupua/exploration/docs/worklog-current.md`
   and `kupua/exploration/docs/03 Ce n'est pas une pipe dream/api-build/api-build-00-plan.md`
   in full. For Scala work, also read `.github/instructions/media-api.instructions.md`.
2. Read only what plan section 9 lists for this unit, plus the current source you will change
   and its existing tests. Do not read the research registers, packet reports or archives unless
   the plan points you to a specific section. Candidate 11 is a reference: where it conflicts
   with the plan, the plan wins (see "Known conflicts" in plan section 9).
3. Check `git status`/HEAD and note the pre-existing dirty files; preserve them. Check (read-only)
   how far the branch is behind `main` in the directories you will touch; if behind, propose a
   merge before any edit (and recheck just before committing). Run `git diff main -- ':!kupua'`
   and reconcile it with the plan's section 7 table of existing Grid code; report any unlisted
   difference. Then run the unit's baseline gate once and record the count.
4. Check the unit note's limits and shapes against the Kupua code that will call the endpoint;
   report mismatches now, not after building.
5. State in a few lines: the unit's scope, the files you expect to touch, the existing tests
   likely affected, and anything unclear. Ask me to confirm. Do not edit before I confirm.

**Scope discipline:**
- Only this unit. If you find something else worth fixing, tell me and add one line to plan
  section 11 (Parked Observations); don't fix it and don't read that section for work.
- Additive Grid changes only: no behavior change to existing routes, `GET /images`,
  `createSort`, `prepareSearch`, getters or `ImageResponse.create`. Use the shared helper
  (plan section 3); if it doesn't exist yet and this isn't U1, stop.
- Keep plan section 2's invariants. Never lower the 1k/65k/5k/200 limits to make something fit.
- Every read goes through `_search` (never `_count`); public tuples never contain `_shard_doc`;
  the optional `pitId` path stays possible.
- Direct-ES and current hybrid modes must keep working.
- Grid code serves any caller: do not name Kupua (or any consumer) in new Scala code, comments,
  test names or error messages, and do not encode one consumer's field choices. Describe Grid
  behavior only when it's not clear from the code. Leave existing comments alone; the operator prunes them separately.

**Method:**
1. Write the failing test(s) first and show they fail for the right reason. For endpoints,
   include the cross-check the plan names (for example window(k) equals D3 at k). A compile
   failure on a new API is not enough on its own: show at least one runtime failure for any
   refusal or change to existing behavior. Controls in agreement tests must not depend on
   behavior an open upstream PR changes (for example #4957).
2. Implement the smallest change that passes. Commits are branch-only: one Scala commit per
   endpoint (so the later PR split is mechanical), Kupua separately, docs last. Each commit must
   build and pass on its own; check split commits whose tree was never tested in a temporary
   worktree (for the last commit, an empty `git diff HEAD` against the tested tree suffices).
3. Run the gates in plan section 5. Before E2E, ask me whether ports 3000/3030 are free.
   Use `set -o pipefail; ... 2>&1 | tee "$TMPDIR/kupua-test-output.txt"` for Kupua npm scripts
   (unsandboxed), and don't run anything else while a suite runs. Scala runs the same way:
   `TZ=UTC sbt ... 2>&1 | tee "$TMPDIR/..."`, unsandboxed (Docker), then grep the summary.
4. If a test breaks, work out whether the test or the change is wrong before touching assertions.
5. For Scala endpoints, before handoff: temporarily break each core rule of the endpoint once
   (for example a predicate, a refusal, a nested wrapper), confirm a test fails, revert, and list
   what was and was not caught. Strengthen tests that miss. Review fixes also get failing-first
   tests, or this check covers them. Also test the request with each client-supplied attribute
   the endpoint relies on omitted (for example sort `mode`, `nested`, `missing`, optional fields).
   Recipe: snapshot the files and restore by copy (never `git checkout` over uncommitted work),
   confirm byte-identical restores, group only non-overlapping breaks in one run, and if a break
   crashes the runner, count it caught and rerun the rest of that group.

**Questions to me:** I am not an engineer. Every question explains the consequences in plain
language and ends with your recommendation. Record my answer in the unit note straight away.

**Welcome extras (ask first; they complement the gates, never replace them):**
- **Throwaway characterization tests or scripts**, to confirm a hypothesis before changing code
  (for example what a query actually matches). Local Elasticsearch/Docker only, delete them
  afterwards, and record the result in the worklog.
- **Checks in the embedded VS Code browser**, especially in API mode: does browsing, seeking,
  focus and traversal look right, and do requests go to media-api rather than `/es`? Read
  `kupua/exploration/docs/embedded-browser-playbook.md` first and append lessons after. Prefer
  page snapshots over screenshots. The browser and E2E both need port 3000, so ask me which mode
  is running. TEST data needs my permission for the session. Never copy identities or cookies
  into files.

**Stop and ask me** if: the unit needs a change to existing Grid behavior; authorization differs
between endpoints; the plan's contract doesn't fit the real consumer; you're about to weaken a
preservation test; results disagree without explanation; a cost looks material; or you've tried
one approach that failed and the next needs assumptions.

**Never:** push, open PRs, commit without my explicit OK, write outside `kupua/`, `media-api/`
and tests without asking, **write to** non-local Elasticsearch (ever), read from TEST without my
permission for this session, or write secrets or cookies to any file. The repository is public.

**Worklog:** add a check-in line to the worklog at start and append key decisions and findings as
you go (short). Move durable decisions into the unit note. Reset the worklog to its scaffold
before the commit that stages Kupua docs; never commit it non-empty.

**Completion:**
1. Summarize what changed, the test results (failing-first plus final gates) and anything
   deferred. Before the handoff, do plan section 8 items 2-4 (unit note "as built", section 7
   table, parked observations), so the reviewer sees them in the diff.
2. Give me a **handoff facts** fenced block (easy to copy) for the cold reviewer (`api-build-02-review-prompt.md`):
   - unit ID;
   - base commit and how to see the diff (for example `git diff <base>` or the file list, if
     uncommitted);
   - files touched;
   - tests added or changed;
   - the exact gate commands you ran, with results;
   - known behavior changes for existing callers;
   - section 7 rows added or changed, and one plain sentence on the effect on production Grid
     and Kahuna (even "none");
   - the break-and-revert check results;
   - commits made, or the proposed commit grouping if uncommitted;
   - what you deliberately did not do.

   Facts only: do not say what the reviewer should focus on or what you think is fine.
3. When I bring back review findings, fix only the material ones (or explain why not), rerun the
   affected gates, then propose commits grouped by the problem they solve, and wait for my OK.
4. After committing, do the rest of plan section 8 (the single completion checklist).
5. Stop. Do not start the next unit.

**Unit-specific notes from the operator:** (optional)
