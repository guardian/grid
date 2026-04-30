# Copilot Instructions — Kupua Directives

> These directives apply when working on the `kupua/` project within this repo.
> Full context lives in `kupua/AGENTS.md`; this file extracts the rules that
> Copilot must always follow so they are loaded automatically regardless of
> which file is open.

**Directive: PUBLIC REPO — NEVER COMMIT SECRETS.** The `grid` repository is public on
GitHub. Anything written to disk under `kupua/` (code, docs, audit outputs, sample
responses, even commented-out examples) may be pushed and become permanent public
history. **Never** write the following to any file: panda cookie values, AWS access
keys / session tokens, signed S3 or CloudFront URL query strings (they contain
`AWSAccessKeyId`, `Signature`, `x-amz-security-token`), real user email addresses,
internal Guardian hostnames not already public in the repo, any `Authorization`
header, JWT tokens, panda private keys. When inspecting live infra (TEST/CODE/PROD)
and producing outputs (samples, audit notes, debugging logs), **redact aggressively
before writing to disk** — over-redaction is cheap, leakage is permanent and may
require credential rotation. If unsure whether a value is sensitive, redact. If a
secret has already been written, stop, alert the user, and do not commit.

**Directive: AGENTS.md is a living snapshot, not a history log.** After completing any
task that adds, removes, or changes features, architecture, files, or key decisions:
(1) Update `kupua/AGENTS.md` — keep it lean (~130 lines). Update the Component Summary
table, Context Routing table, Backlog, Known Issues, Key Architecture Decisions, or
Tech Stack as needed. For detailed component descriptions, update
`exploration/docs/00 Architecture and philosophy/component-detail.md` instead.
(2) Append the detailed narrative (bug fixes, implementation steps, reverted experiments,
root-cause analysis, dates) to `kupua/exploration/docs/changelog.md` under the current
phase heading at top (after `DO NOT delete or reorder existing entries. --> line)`.
This keeps AGENTS.md lean for fresh sessions while preserving full history.

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
**Staging:** Always `git add kupua/` from the repo root. Never `git add -A` or
`git add .` — git operates on the whole repo regardless of your cwd.

**Directive: Directive sync rule.** The directives exist in two places that must stay
identical: `.github/copilot-instructions.md` (what Copilot auto-loads) and
`kupua/exploration/docs/00 Architecture and philosophy/copilot-instructions-copy-for-humans.md` (for humans and
fresh clones where `.github/` may be missing). If you add, remove, or change a
directive in one place, copy the change to the other.

**Directive: Tests.** Always run via `npm --prefix kupua run <script>` from repo root — npm scripts set cwd=`kupua/` so configs and artefacts resolve correctly. **Never `cd kupua && ...`** (zsh strips `cd`). **Never `npm --prefix kupua exec`** or bare `npx playwright`/`vitest` — those keep cwd=root and dump `test-results/`/`playwright-report/` there. Tee to absolute `/tmp/kupua-test-output.txt`. Foreground. No `tail`/`head`/`sleep`. Don't re-run a running test — `read_file /tmp/kupua-test-output.txt`. **If `*.txt`, `test-results/`, or `playwright-report/` appear at repo root, you got cwd wrong: stop, delete, retry. Do not commit.**

| Surface | Command | Agent runs | Agent suggests |
|---|---|---|---|
| Unit | `npm --prefix kupua test` | After any `kupua/src/` change | — |
| Playwright e2e | `npm --prefix kupua run test:e2e` | After component/hook/store/scroll change | — |
| Jank perf | `npm --prefix kupua run test:perf -- --runs 3 --label "..."` | Never | After changes affecting frame timing/layout (virtualizer, scroll handlers, render paths) |
| Perceived perf | `npm --prefix kupua run test:perf -- --perceived-only --runs 3 --label "..."` | Never | After touching `search-store.ts`, `useDataWindow.ts`, `useScrollEffects.ts`, `lib/orchestration/`, `lib/reset-to-home.ts`, sort-around-focus / position-map / phantom-focus paths, or perceived trace sites |
| Tier-matrix | `npm --prefix kupua run test:e2e:tiers` | Never | Only when user asks |

Playwright + perf surfaces: stop dev server on :3000 (and :3010/3020/3030 for tier-matrix) first — warn user, wait. Real-ES surfaces: explicit user permission per session, read-only, no writes against non-local ES.

**Directive: Ask rather than spiral.** If the agent has attempted a fix or approach and
it didn't work, or if there are multiple plausible interpretations of a request with
meaningfully different implementation costs, **ask the user** instead of guessing and
iterating. One clarifying question is almost always cheaper than two wrong attempts.
This does NOT mean ask before starting — take action when the path is clear. It means:
when you're uncertain between approaches that diverge significantly, or when a first
attempt failed and the next one requires assumptions about user intent, stop and ask.

**Directive: Fresh agent protocol.** You are a new agent every session. You have
NO memory of prior conversations. On session start: (1) Say "Hi, I'm a fresh agent."
(2) Read `kupua/exploration/docs/worklog-current.md` — it contains the previous
agent's in-progress notes. Also read any file with "handoff" in its name that is
referenced in AGENTS.md. (3) State what context you have (attached files, AGENTS.md,
worklog, any pasted text). (4) Ask: "What should I read before starting? Is there
anything not in the docs I need to know?" (5) Do NOT write or modify any code until
the user confirms you understand the task. Reading files to build context is fine
and encouraged.

**Directive: Maintain a session worklog.** During any non-trivial task, maintain
`kupua/exploration/docs/worklog-current.md`. Format: a "Current Task" header
(1-3 sentences) followed by a "Session Log" (append-only, max ~40 lines of key
decisions, failed approaches, blockers, and findings). This survives agent death
mid-task so the next agent can pick up where you left off. When the user says
the task is done or explicitly starts a new task, or when user asks for a commit, move the
session log content to `changelog.md` and start `worklog-current.md` fresh.
Never delete the file.
