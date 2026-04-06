# Copilot Instructions — Kupua Directives

> These directives apply when working on the `kupua/` project within this repo.
> Full context lives in `kupua/AGENTS.md`; this file extracts the rules that
> Copilot must always follow so they are loaded automatically regardless of
> which file is open.

**Directive: AGENTS.md is a living snapshot, not a history log.** After completing any
task that adds, removes, or changes features, architecture, files, or key decisions:
(1) Update the relevant sections of `kupua/AGENTS.md` (What's Done, What's Next,
Project Structure, Key Architecture Decisions) with the **current state** — what exists
and how it works, not how it was built. Keep it concise.
(2) Append the detailed narrative (bug fixes, implementation steps, reverted experiments,
root-cause analysis, dates) to `kupua/exploration/docs/changelog.md` under the current
phase heading. This keeps AGENTS.md lean for fresh sessions while preserving full history.

**Directive:** Performance is crucial. If any requested change is likely to seriously impact
performance, do not proceed without checking with the user first — explain the potential
impact, suggest mitigations, and consider alternative approaches.

**Directive:** When introducing code that intentionally departs from Grid/kahuna behaviour
or from library defaults/conventions, add an entry to `kupua/exploration/docs/deviations.md`
explaining what, why, and the trade-off.

**Directive:** Never write or modify any file outside the `kupua/` directory without
explicitly asking the user for permission first. This agent's scope is kupua only.
No exceptions.

**Directive:** Do not commit after every change. It's fine to modify many files over a long
session without committing. **Never commit without explicitly asking the user first.**
If you think a commit is warranted but the user hasn't asked, suggest it and wait for
confirmation. When the user approves, batch changes into sensible chunks grouped by the
problem they solve — not by individual file edits. Never push to remote.

**Directive: REAL SYSTEMS ARE DANGEROUS.** Kupua can be configured to connect to real
Elasticsearch clusters (TEST/CODE/PROD) via SSH tunnels. These clusters serve the entire
Guardian editorial team. **Never** write code that issues write operations (index, delete,
bulk, update, create) against a non-local ES. **Never** weaken or bypass the safeguards
in `es-config.ts` or `load-sample-data.sh` without explicit user approval. **Never**
hardcode real cluster URLs, index names, or credentials in source code. If a task
requires modifying safeguard configuration, stop and explain the risk before proceeding.
See `kupua/exploration/docs/infra-safeguards.md` for the full safety framework.

**Directive:** Think about UX/UI as well as tech. When the user proposes a feature or
interaction pattern, constructively argue about it — raise concerns about usability,
consistency, accessibility, and user expectations, not just technical feasibility.
Don't just implement what's asked; reason about whether it's the right thing to build.

**Directive: Push back. Hard.** The user STRONGLY prefers that you argue against
doing things when the complexity, risk, or marginal value doesn't justify the work.
The biggest failure mode is following instructions too literally — implementing
exactly what's asked without questioning whether it should be done at all. Say "no,
and here's why" when appropriate. Say "this isn't worth it because…" when it isn't.
The user considers this the single most valuable behaviour the agent can have.

**Directive: Commit messages.** Never pass multiline commit messages via `git commit -m`
in the shell — special characters and line breaks get mangled by zsh quoting. Instead:
write the message to a temp file (e.g. via a heredoc or the file-creation tool), then
run `git commit -F <file>`, then delete the temp file and `git commit --amend --no-edit`.

**Directive: Directive sync rule.** The directives exist in two places:
`.github/copilot-instructions.md` (what Copilot auto-loads) and
`kupua/exploration/docs/00 Architecture and philosophy/copilot-instructions-copy-for-humans.md` (the
committed copy for humans and fresh clones). If you add, remove, or change
a directive, update BOTH files to keep them identical. **However:**
`.github/copilot-instructions.md` is gitignored and must **NEVER** be
staged or committed — it lives outside `kupua/` and is the user's local
config. Only `copilot-instructions-copy-for-humans.md` (inside `kupua/`)
is committed. When committing, **never `git add` anything in `.github/`**.

**Directive: Run tests in the foreground.** When running `npx playwright test`,
`./scripts/run-e2e.sh`, or any test command, run it in the **foreground** (blocking
call, not background). Do NOT pipe through `tail`/`head`. Do NOT use `sleep` to poll.
The list reporter streams each result live (~70s total run). The user wants to watch
results accumulate in real time.

**Directive: Smoke tests against real ES.** `e2e/smoke/manual-smoke-test.spec.ts` and
`e2e/smoke/smoke-scroll-stability.spec.ts` run against a live Elasticsearch cluster (TEST)
via `./scripts/start.sh --use-TEST`. The agent **may** run these tests directly,
after seeking EXPLICIT permission from the human user once per-session, using
`node scripts/run-smoke.mjs <number>` (or Playwright commands against the smoke config)
when the user confirms that TEST is available and `start.sh --use-TEST` is running.
All smoke tests are **read-only** and auto-skip when connected to local ES
(`total < 100k`), so accidental local runs are harmless. The agent may also use
Playwright `--debug` or `page.pause()` for interactive browser diagnosis when
that would speed up debugging, similarly after excplicit human consent once per-session.
**Never** issue write operations against real ES —
this is a read-only privilege.

**Directive: Smoke → local feedback loop.** The primary purpose of manual smoke tests is
NOT just to validate fixes on real data — it is to **improve local test coverage** so
the same class of bug is caught without manual testing in the future. After every smoke
test session, the agent must try hard to backport learnings into the local test suite.
Concretely: (1) **Amend existing local tests** — add stronger assertions, capture
telemetry (console logs, timing, page counts), tighten tolerances, assert on code paths
taken (not just outcomes). (2) **Improve helpers and env config** — add new helper
methods to `KupuaHelpers`, adjust env variables (`.env`, `.env.development`), tune
Docker ES settings (`load-sample-data.sh`), or add synthetic edge-case data (e.g. docs
with missing fields) so local ES better approximates real-world data shapes.
(3) **Add new local tests** if the existing ones can't be modified to cover the gap.
The goal: every smoke test failure should produce at least one local test improvement
that would have caught (or would in the future catch) the same bug class locally. If a
particular failure truly cannot be reproduced locally (e.g. requires 1M+ docs), document
why in the test comments and ensure the smoke test itself covers it permanently.

**Directive: Dev server conflict.** Before running `npx playwright test` (any config),
warn the user if port 3000 might be in use. The local test suite starts its own Vite
dev server — if the user's manual `npm run dev` or `./scripts/start.sh` is still
running on port 3000, tests will fail with `ERR_CONNECTION_REFUSED` or bind errors.
Say: "I need to run the test suite — please stop any running dev server on port 3000
first." Wait for confirmation before proceeding.

**Directive: Visualise experiment results.** When presenting perf experiment findings
(from `e2e-perf/results/experiments/`), generate a standalone HTML dashboard with
Chart.js and open it in the browser. Include: grouped bar charts for key metrics,
a scatter plot if there are two continuous variables, a raw data table, and a written
verdict. The dashboard is **disposable** — don't keep it in the repo or build generic
scaffolding. Generate it fresh each time from the JSON data. The user likes pictures.

**Directive: Habitual testing.** After any code change to `src/`:
- Run `npm test` (unit + integration, ~5 seconds). This is non-negotiable.
- After changing component structure, hooks, store subscriptions, or anything
  that affects rendering: run `npx playwright test` (E2E, ~70 seconds). Ask
  the user to stop any running dev server on port 3000 first.
- Never run perf tests (`run-audit.mjs`) or smoke tests (`run-smoke.mjs`)
  habitually — those are manual, purpose-driven.

**Directive: Ask rather than spiral.** If the agent has attempted a fix or approach and
it didn't work, or if there are multiple plausible interpretations of a request with
meaningfully different implementation costs, **ask the user** instead of guessing and
iterating. One clarifying question is almost always cheaper than two wrong attempts.
This does NOT mean ask before starting — take action when the path is clear. It means:
when you're uncertain between approaches that diverge significantly, or when a first
attempt failed and the next one requires assumptions about user intent, stop and ask.

