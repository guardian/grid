# API boundary research: operator brief and sequence

**Date:** 18 September 2026.
**Status:** Research commissioned; no architecture or implementation selected.
**Decision:** What division of work between Kupua and trusted APIs preserves Kupua's
capabilities and performance with the smallest necessary production-Grid change and acceptable
operational risk?

## Sequence and file ownership

All five documents belong in this folder. The `api-boundary-` prefix distinguishes this
research from the endpoint inventory and the completed D3 readiness work. Numbers express
execution order, not endpoint numbers. Use the named files, not additional master plans or
`final-v2` variants.

| File | Owner and purpose |
|---|---|
| [api-boundary-00-brief.md](api-boundary-00-brief.md) | Shared operator constraints, research permissions and sequencing. |
| [api-boundary-01-code-first-prompt.md](api-boundary-01-code-first-prompt.md) | Instructions for a fresh source-first design assessment. |
| `api-boundary-02-code-first-findings.md` | First agent's findings, recommendation and experiment evidence; created by that agent. |
| [api-boundary-03-adversarial-prompt.md](api-boundary-03-adversarial-prompt.md) | Instructions for a second fresh agent to challenge and reconcile the first report. |
| `api-boundary-04-reconciled-recommendation.md` | Second agent's evidence-based disposition and recommended next decision; created by that agent. |

Run 01 first. Run 03 in a separate fresh session after 02 exists. Neither agent executes the
other stage or implements its recommended migration. Missing report files are intentional;
do not create empty placeholders or present these prompts as completed research. If an output
already exists, establish whether this is a continuation or an explicitly requested replacement.

These are ordinary Markdown task handoffs, not installed VS Code slash commands. The
[active integration index](media-api-00-index.md) still owns current integration scope.
This series can recommend changing a plan; it cannot approve that change itself.

## Operator constraints

1. **Capabilities and performance are the product.** Preserve the current browsing experience,
   not merely the ability to return search results. Replacing it with ordinary pagination,
   disabling deep navigation or selection, lowering useful limits, or silently slowing an
   interaction is not an acceptable way to reduce backend work. A method being optional in a
   TypeScript interface is not permission to remove its user-visible capability.
2. **Change mechanisms, not the acceptance floor.** Client restructuring, different algorithms,
   API reuse and different server boundaries are legitimate candidates. Each must account for
   user-visible behavior, request work, payload, memory and latency. Fewer routes or fewer Scala
   lines alone do not demonstrate improvement. Minimise production-reachable semantic changes,
   review and maintenance burden, and shared resource impact rather than just counting lines.
3. **Start with the hard consequential question.** The operator chose D3 deliberately, despite
   an earlier suggestion to start elsewhere. Choose the uncertainty that could invalidate the
   architecture or account for substantial backend complexity. Do not prescribe a counts-first
   sequence simply because counts look small. Cheap checks remain useful; easy endpoints must
   not postpone the difficult decision indefinitely.
4. **The current baseline has one semantic sort.** User-controlled secondary sorting was
   intentionally removed because it did not perform well even with direct ES. Do not restore it
   for historical parity; automatic ordering tie-breakers are different and remain necessary.
   The operator also considers keyword-mapping-based sorts shaky. Investigate the actual
   mechanisms and high-cardinality behavior; this is not approval to remove those sorts. A
   problem already present in direct mode must be distinguished from API overhead.
5. **Feature reductions require a separate operator decision.** If evidence shows that a
   capability or performance requirement cannot be met within the proposed boundary, say so.
   Explain the trade-off and alternatives in a separately labelled decision item. Do not count
   that reduction as an achieved saving, use it in the recommended preserved-capability design,
   or infer approval from the secondary-sort decision.
6. **Index migration is deliberately unsupported for now.** The operator describes it as
   roughly two days every three years; this is context, not verified operational frequency.
   Temporary Kupua unavailability is accepted. Do not import migration-transparent operation,
   atomic exclusion, detection deadlines, Thrall interlocks or a production migration redesign.
   Any eventual maintenance mechanism is a separately named deployment decision.
7. **Preserve accepted compromises without inventing stronger promises.** Separate exact
   operations on their declared data view from cross-operation snapshot consistency. Preserve
   exact map/rank behavior, current bounded range selection, and accepted approximate special-date
   presentation. Neither universal snapshot exactness nor weaker ordinary navigation follows
   automatically from moving requests behind APIs. Existing defects are not sacred, but fixes
   and stronger guarantees need their own rationale and explicit scope.
8. **The final deployed mode has no browser ES access.** Hybrid development may remain useful,
   but fallback to browser ES cannot prove API-only completion. Naming a raw ES proxy `/api`
   does not establish a trusted authorization or bounded-work boundary. Media delivery, config,
   optional satellites and AI must be accounted for without silently widening this into a
   one-URL or writable-client programme.
9. **Existing Grid behavior and authorization stay protected.** Read-only requests still use
   shared CPU, heap, signing resources and ES capacity. An additive route is not automatically
   operationally isolated. A separate service is a candidate only with its actual auth,
   deployment, ownership and load costs included; new infrastructure is not preapproved.
10. **D3 is evidence, not a new readiness assignment.** Its agreed amendments are complete and
    human review remains separate. Do not restart the completed review or hold it for this
    research. If a candidate genuinely needs a D3 contract change, identify exactly why, its
    client impact and review cost; do not make the change or assume all proposed alternatives
    must preserve today's internal abstractions.

## Research and experiment permissions

Experiments are encouraged when they can discriminate between designs. This is research with
evidence, not a ban on running code and not permission for a production implementation.

- Follow the fresh-agent protocol and applicable repository instructions. Inspect the worktree
  and preserve other sessions' changes. Maintain the session worklog; never discard active notes
  without checking. No staging, commits, branch changes or remote-mutating Git commands. Other
  local Git mutations, including fetch, require permission; local status/diff/history reads do not.
- Product source and existing tests may be read across Grid. Without additional approval, write
  only your assigned report, the session worklog, and necessary scratch experiments under
  `kupua/exploration/experiments/api-boundary/`. Name scratch files
  `api-boundary-02-e01.<ext>` or `api-boundary-04-e01.<ext>` according to stage, incrementing the
  experiment number. Retain only small, sanitised evidence needed to reproduce a material claim.
- Do not edit active Kupua source/tests/configuration or any Grid implementation as an incidental
  experiment. When a decisive check needs such an edit, present the smallest temporary change,
  its file list, checks and cleanup, and ask first. Any edit or build/test operation that writes
  outside `kupua/` needs explicit permission. Never alter ES safeguards or mappings as a shortcut.
- Local fixtures and focused existing checks are allowed through documented runners. Identify
  the hypothesis and expected discriminating observation before execution. Do not run a broad
  suite merely to decorate a report. Product changes, if separately approved, still require all
  applicable regression gates; temporary status does not waive them.
- The operator can start the app in `--use-TEST` or `--use-media-api` mode. Ask for the needed
  mode and obtain session-specific permission for a bounded read-only TEST experiment before
  using it. Do not start, stop, restart or reconfigure their app/tunnel yourself. Confirm the
  served mode and source rather than inferring them from the hostname or an old browser tab.
  A local media-api connected to TEST is not deployed media-api and is not all-local isolation.
- No shared-cluster writes, migrations, settings changes, schema changes, fixture insertion,
  unbounded enumeration or load testing. PROD/CODE access requires separate explicit permission;
  ordinary TEST permission does not cover it. Specify an action/request/time bound and stop on
  an unexpected load increase, repeated failures or a result that already answers the question.
- Before a browser session, read the short [browser playbook entry point](../../embedded-browser-playbook.md),
  only task-relevant reference sections and relevant [interaction helpers](../../../../e2e/shared/helpers.ts).
  Follow its mode, foreground, state and cleanup rules. A narrow owning-topic update is allowed
  only for new reusable operating knowledge or a correction, never a session description or
  routine outcome entry. No playbook update is required otherwise.
  Prefer accessibility snapshots for interaction and screenshots only for visual evidence.
- Before tests, read the relevant operating sections of [the E2E handbook](../../../../e2e/README.md)
  or [performance handbook](../../../../e2e-perf/README.md). Warn and confirm the required free
  ports before Playwright; coordinate live-browser and E2E modes. Use documented npm scripts
  from repository root with `set -o pipefail; ... 2>&1 | tee "$TMPDIR/kupua-test-output.txt"`.
  Use foreground execution and the required sandbox permissions. Do not poll, interrupt, narrate
  progress or send another terminal command while a test is running; await completion. Formal
  jank/perceived-performance campaigns still need explicit operator commissioning under the
  existing rules. Bounded browser observations are not a capacity campaign.
- This is a public repository. Never persist credentials, cookies, authorization headers, signed
  URLs, real user emails, non-public hosts or raw live request/response bodies. Keep live image
  identities inside browser memory; report aggregates, synthetic labels and pass/fail comparisons.
  Redact before output reaches a file, not afterwards. Do not capture unsanitised HAR/trace/log
  artifacts. If a secret is written, stop and alert the operator.

For every experiment record: question, source/ref, actual mode/topology, corpus/size description,
actions and bounds, cold/warm state, control, observations, and what they do and do not establish.
Distinguish perceived interaction time, ES time, API processing and transport. Use repeated paired
observations when making comparative latency claims, not a single warm-cache success. No invented
performance budget, extrapolated production capacity verdict or assumption that a tiny local
fixture proves high-cardinality behavior. Ask the operator where a material acceptance threshold
needs a decision. If an experiment cannot run, name the reason and keep its claim unverified.

## Independence and evidence

Stage 01 is **source-first, not safety-blind**. It reads this brief, its prompt, applicable
instructions, AGENTS and the current worklog. The active index's Current reality and Boundaries
sections supply scope; do not follow its architecture/workplan links in this stage. Browser and
test handbooks are permitted operating references, not architecture authority. The prompt defines
the remaining reading boundary. Disclose automatically loaded or unavoidable planning context;
do not claim a literally documentation-free assessment when it was not one.

Stage 03 can read the first report and existing decisions, checking claims against current code
and proportionate experiments. Neither stage treats an archived proposal as an accepted product
requirement. Source facts, observed behavior, operator decisions and proposed improvements must
remain visibly different. Agreement between reports is not independent verification.

No changelog entry is appropriate for this research. A recommendation becomes implementation
scope only after an explicit operator decision; update the existing owning plan then, rather than
creating parallel implementation authorities now.