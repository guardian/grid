# Simplification 2: One Image Contract and Clear Publication Ownership

Prepared 11 November 2026. **Status: parked until the operator selects this work
after the current editing milestone.** This document is a design and execution
brief, not permission to change the application or contact live systems.

The preferred predecessor is [API-only retirement](simplification-01-api-only.md).
Starting earlier is possible, but preserving two real data modes may defeat the
intended subtraction. The operator must explicitly select that exception; an
executor must not solve it by inventing another compatibility framework.

The separate [browsing brief](simplification-03-browsing-engine.md) is not part of
this implementation. The editing prerequisite means an operator-chosen stable
checkpoint, not completion of every future editing feature. This brief has its
own kickoff and handoff prompts; no permanent coordinator is required.

## Outcome

Make the application-facing image contract and the path by which accepted reads
reach their consumers substantially easier to understand and change.

Today, normalized image bodies, search enrichment entries, attached overlays,
selection metadata, standalone detail and freshness evidence cooperate. Their
different purposes are not all redundant. The goal is to remove unnecessary
representations, precedence decisions and repeated publication coordination,
while retaining the genuinely different lifetimes and authorities.

Success is not an `AppImage` rename, an extra `data` wrapper, a new global cache or
a shorter mapper. A future server-derived field should not require understanding
several independent merge paths before it can be displayed consistently in Grid,
Table, detail and a selection.

## Execution State

Keep this as current state, not an append-only history of sessions.

| Field | Current Value |
| --- | --- |
| Status | Parked; not authorized |
| Editing prerequisite | Rebase against the completed editing milestone before designing the replacement |
| API-only prerequisite | Preferred; predecessor not yet executed |
| Selected unit | None |
| Active writer | None |
| Accepted code baseline | Establish at kickoff, including relevant uncommitted work |
| Selected representation/publication design | None; do not assume the old AppImage proposal is selected |
| Approved scope and exceptions | None |
| Last accepted result | Research and this brief only |
| Validation against current code | None |
| Open decisions or blockers | Actual subtraction and authority/lifetime model need a current-code design |
| Next action | Read-only B0, then operator confirmation of the proposed unit |

Use [worklog-current.md](worklog-current.md) for temporary progress. The current
state block and a filled chat handoff are sufficient to resume; do not create a
second progress ledger. Durable mechanics belong in the owning architecture/API
guide and code-change history in [changelog.md](changelog.md), according to the
standing instructions. Planning alone does not belong in the changelog.

## Evidence and Limits

The [April AppImage proposal](03%20Ce%20n'est%20pas%20une%20pipe%20dream/kupua-03-structural-rearchitecture.md#part-c--the-appimage-question)
was deferred because API integration and usable capabilities were still in the
future. That reason has expired. Its particular wrapper and timing estimates
have not thereby become a validated design for today's application.

Shared normalization, API-backed singleton/bulk reads and caller-owned publication
were subsequently implemented. The [image-response review](03%20Ce%20n'est%20pas%20une%20pipe%20dream/media-api-work/api-boundary-09-p16-image-response.md)
has a current-status correction: do not rediscover its repaired September shape
mismatches and call them current defects.

Editing added important distinctions. The [publication plan](gradually-growing-teeth.step-4-publication-plan.md)
and [state guide](00%20Architecture%20and%20philosophy/state-management.md) describe
accepted metadata, independent authority, lean/full projections, retained display
positions and stale-response rejection. Check the code and subsequent editing
steps at kickoff; these documents are not a substitute for current consumers.

The enrichment map's growth/copying is a source-supported concern, but its
performance impact was already classified as a hypothesis in the
[earlier performance workplan](zz%20Archive/performance-opportunities-workplan.md#api-enrichment-lifetime-diagnostic).
Do not sell this whole project as a proven speedup. Nor should lack of a measured
speedup veto a worthwhile maintainability improvement with acceptable cost.
Thumbnail DOM retention studies concern a different lifetime from metadata maps.

## Scope

### In Scope

- Application-facing image/read types and normalization at the existing API boundary.
- How server-derived facts, links and actions accompany a returned image.
- Existing publication and read-acceptance owners for search, selection and detail.
- Retirement of redundant overlay transport, merge precedence and local baseline
  policy where no supported consumer still requires it.
- Bounded retention tied to real consumer lifetimes, not all images ever visited.
- Consumer and test migrations necessary to complete the chosen replacement.

### Out of Scope Unless Separately Approved

- A new media-api JSON format, image writer, endpoint or server policy authority.
- A universal entity cache, cross-tab freshness service, event bus, job framework
  or wholesale state-library replacement.
- New mutation capabilities, changed batch limits, automatic mutation replay or
  a general guarantee of external-edit consistency.
- Navigation/tier redesign, recalculating global rank after every edit, speculative
  PIT adoption, broader payloads or new refresh/polling machinery.
- Removing accepted display defaults simply because they are local calculations.
- New packages, live-system work, infrastructure changes or writes outside `kupua/`.

A substantial coherent prototype is acceptable in this userless application.
The cost and rollback must be explicit, but code size alone is not a veto. Server
authorization, image privacy and shared-service load remain protected.

## Reading Route

Start with [AGENTS](../../AGENTS.md), current instructions and the worklog. Then
trace one accepted image read through its actual consumers; do not start another
whole-repository audit.

| Responsibility | Current Entry Points |
| --- | --- |
| Returned image shapes | [Image](../../src/types/image.ts), [DAL results](../../src/dal/types.ts), [API types](../../src/dal/grid-api/types.ts) |
| Normalization and read issuance | [API mapper](../../src/dal/grid-api-search-adapter.ts), [API datasource](../../src/dal/api-data-source.ts) |
| Overlay transport and derivation | [enrichment store](../../src/stores/enrichment-store.ts), [deriveImage](../../src/lib/derive-enriched-image.ts), [consumer hook](../../src/hooks/useEnrichedImage.ts) |
| Content publication and freshness | [publisher](../../src/lib/image-publication.ts), [freshness evidence](../../src/lib/image-read-freshness.ts), [label operation](../../src/lib/label-operation.ts) |
| Consumers | [search store](../../src/stores/search-store.ts), [selection store](../../src/stores/selection-store.ts), [standalone detail](../../src/components/ImageDetail.tsx), [panel resolution](../../src/routes/search.tsx), [multi-image metadata](../../src/components/MultiImageMetadata.tsx) |
| Commands and authority | [command boundary](../../src/lib/grid-commands.ts), [current API contract](../../src/dal/grid-api/README.md) |
| Existing proof | [API store tests](../../src/stores/search-store-api-mode.test.ts), [enriched-image tests](../../src/hooks/useEnrichedImage.test.ts), [derivation tests](../../src/lib/derive-enriched-image.test.ts), [label-operation tests](../../src/lib/label-operation.test.ts), [detail tests](../../src/components/ImageDetail.test.tsx) |
| Existing performance work | [findings](scroll-horizons-thumbs-and-blocking.md), [campaign guide](../../e2e-perf/README.md), [measurement reference](../../e2e-perf/measurement-reference.md) |

Follow immediate call sites and relevant tests when needed. Do not copy full
server responses, image identities, signed URLs or credentials into a report.

## Design Requirements

### One Contract Does Not Mean One Lifetime

An application image may be present in the browsing buffer, selected off-screen
or open as a full standalone detail. Those owners can legitimately retain data
for different periods. Sharing a representation must not force identical eviction.

Likewise, normalized content, permissions and list coordinates are not one fact.
The design must explain these independently:

| Fact | Required Distinction |
| --- | --- |
| Metadata | A late or below-floor read cannot restore an older own-edit projection |
| Capability | A newer denial can withdraw an old grant even when its accompanying body is rejected |
| Projection | A lean list/mget result must not silently erase full-detail-only metadata |
| Mutation outcome | Acknowledgement, rejection and uncertainty differ; observation is not acknowledgement |
| Availability | Failed reads and omitted IDs are not proof of deletion |
| List identity | Image identity, scan cursor, display position and current server rank are different |
| AI membership | Updating content does not replace list-owned relevance or rerank the finite result pool |

Do not force all these through one timestamp or a universal invalidation flag.
Conversely, separate facts do not automatically require today's separate maps,
WeakMaps and repeated precedence choices. Replace the arrangement where a smaller
one preserves the facts.

### Preferred Direction, Not a Predetermined Type

Prefer a normalized read result whose body, authoritative facts and relevant read
evidence travel together through existing acceptance/publication boundaries.
Keep familiar flat field access where it remains clear; gratuitous nesting and
codebase-wide renaming have no independent value.

A WeakMap used only for issuance evidence may still have a legitimate job. A
second copy of server fields in several places needs a more specific justification.
Do not introduce a new store merely to rename enrichment, or wrap old precedence
rules while leaving every caller responsible for them.

Record the selected shape in B0 with real producer/consumer examples. No final
interface is prescribed here because the editing milestone may change its needs.

## Work Units

### B0: Choose a Replacement That Actually Subtracts

Confirm the editing baseline and Brief 1 status. Read the current normalizer,
publication/freshness owners and their real consumers. Separate historical fixes,
current implementation requirements and genuinely unsettled product decisions.

Prepare one compact before/after table covering page reads, bulk selection reads,
standalone detail, accepted edit readback and capability withdrawal. For each,
show representation, authority, publication owner, retained lifetime and notification.

Compare at most two plausible designs. Include both the old mechanisms removed
and new state/work added. A design that adds a wrapper while keeping all old
coordination fails this brief; refine that design before implementing it.

Name the existing assertions that depend on old layout rather than behaviour,
and the behaviour witnesses that must survive. Do not prebuild a test framework.
Return a recommended design and first complete slice for operator confirmation.

### B1: Prove the Contract on One Complete Read/Publication Slice

Use the existing local API/consumer fixtures. Choose a slice that crosses the
real mapper, acceptance and presentation, rather than only constructing a new
type in a unit test. A bounded prototype may touch several owners if that is
necessary to expose the actual coordination cost.

Demonstrate ordinary accepted data, meaningful empty/negative authority and one
late-read or projection conflict relevant to the replacement. Reuse current
editing witnesses instead of recreating their parsers or inventing malformed
internal producer outputs.

Temporary compatibility is acceptable only with named consumers and a removal
point inside this project. It earns no simplification credit. Do not roll the
new result out everywhere before testing its hardest authority distinction.

### B2: Migrate All Required Image Consumers

Carry the chosen contract through ordinary/AI pages, extension/seek publication,
selection metadata, standalone detail and the existing edit publisher. Keep
image bodies paired with authoritative tuples when filtering or combining pages.

Use the existing publication boundary rather than adding another observer that
republishes every store update. Preserve unchanged object/geometry references
and per-image subscriptions where their reuse is intentional. An off-screen
update must not rebuild or reflow the current browsing window unnecessarily.

Do not mix a missing field, successful empty capability set, rejected body and
failed request into one fallback. Preserve current user-facing failure handling
and legitimate display defaults without inventing a new notification policy.

### B3: Retire Superseded Representation and Retention Machinery

Delete the old overlay/attachment/merge routes that the accepted design replaces.
For any retained independent structure, name its current owner and distinct
lifetime. Removing the search overlay map is a candidate outcome, not permission
to drop permissions or selection metadata that still depend on it.

Keep image retention bounded by actual consumers. In particular, visiting more
images must not silently require keeping all their server facts for the whole
search. Do not fix this by indiscriminately pruning on buffer eviction: selected
and detail owners differ, and freshness protection can intentionally outlive bodies.

Touched-ID floors and authority protection must not be evicted merely to achieve
a memory target. Preserve their explicit existing capacity/admission contract
unless the operator approves a different guarantee.

Retire old tests only where their guarantee is replaced or obsolete. Remove
temporary dual-format bridges before declaring the design adopted.

### B4: Verify the Joined Workflows and Close

Exercise the selected contracts across the resulting consumers, using existing
unit and browser homes. Representative joins include a selected image leaving
the buffer, a full standalone detail receiving lean readback, late reads after
an accepted edit, and capability withdrawal independent of body freshness.

Do not expand these into every permutation of transport, density, sort and
metadata. The purpose is to prove different ownership paths, not a coverage quota.
Review the full owned patch for old and new paths accidentally coexisting.

Demonstrate the promised maintenance benefit with an actual example: where a
server-derived field or publication rule would be changed now, and which former
coordination decisions no longer need updating. Do not implement an unrelated
feature solely to stage that demonstration.

## Proof and Acceptance

### Structural Acceptance

- The selected application contract is used by all required read paths, not only
  a new adapter or one view.
- Accepted publications no longer require the redundant merge/attachment steps
  identified in B0. Retained structures have genuinely different current jobs.
- Server authority is clear; no duplicate client permissions engine or global
  entity cache has appeared as the price of simplification.
- New fields and changes to publication have a more local, explainable impact.
- Temporary migration paths and superseded test scaffolding are removed.

### Behavioural Acceptance

Preserve independent body/capability acceptance, lean/full detail, stale and
unavailable presentation, selection membership and cache notification, immutable
operation targets, unknown mutation outcomes, URL/history and the three coordinate
regimes. Metadata-only changes must not repack unchanged image geometry.

Use a failing-first regression for an actual discovered bug. For structural
parity, prove the relevant current behaviour before replacement and after it.
An assertion about the old map's exact existence is not automatically a product
contract; the authority/lifetime guarantee it witnessed may still be essential.

Follow current standing gates. After source changes run full units; after the
component/hook/store/publication changes run full E2E. Include build and applicable
test/perf TypeScript checks for touched surfaces. From repository root, keep
output live and preserve exit status:

```sh
set -o pipefail; npm --prefix kupua test 2>&1 | tee "$TMPDIR/kupua-test-output.txt"
set -o pipefail; npm --prefix kupua run test:e2e 2>&1 | tee "$TMPDIR/kupua-test-output.txt"
set -o pipefail; npm --prefix kupua run build 2>&1 | tee "$TMPDIR/kupua-test-output.txt"
```

Run separately under the current repository rules. Coordinate existing servers,
ports and active tests; do not restart the operator's app or reconfigure its data.
Local fixture writes are not permission for live image edits.

### Performance and Retention Evidence

Do not claim normalization itself is expensive: prior measured parse/map work
does not support that blanket claim. Protect per-image notification, bounded
buffer copies, visible-row reuse, geometry identity and existing request budgets.

For the selected design, state what retained data is bounded, by which owner,
and what intentionally outlives an image body. A structural bound is different
from a measured heap reduction or a user-visible latency improvement.

Use existing controls/campaign evidence before asking for a new measurement.
If a specific gap blocks the design decision, name that question and the smallest
check that can answer it. Campaigns and dry runs are operator-run, never an
autonomous executor or subagent activity. A nontrivial expected cost requires
operator discussion; hypothetical cost is not a permanent ban on prototyping.

## VS Code Chat Procedure

This brief is executable through ordinary VS Code chats and pasted handoffs.
No coordinator is assumed to remember earlier conversations. Current instructions,
this brief's Execution State, the worklog and the actual worktree are authoritative
inputs; an agent's confident memory is not.

### Roles and Unit Approval

The operator owns scope, product/cost choices and acceptance. A coordinator is
just the session maintaining the selected unit and preparing the next prompt.
It may also implement the unit. An executor owns the approved code change and
verification. A separate reviewer checks that change read-only.

1. Begin with the kickoff prompt below and the normal fresh-agent protocol.
2. The agent reports the current baseline, the proposed B unit, expected
   subtraction and concrete questions. It does not ask the operator to design
   a timestamp model or choose between unexplained class names.
3. The operator confirms one unit and routine local execution permissions.
4. The active writer updates Execution State and the existing worklog, then
   implements and validates iteratively within that scope.
5. At a complete slice or session boundary, produce a filled continuation or
   review handoff. Do not silently begin the next project.

Only one session edits these shared owners at a time. Different chats are not
isolated branches. Check for active work and preserve unrelated changes.

After the agent has explained the unit, the operator can reply:

```text
Proceed with that named unit and its local verification, within the scope you
summarized. No live-system work, dependencies or Git mutations are approved.
```

For a session transfer:

```text
Pause and update the current state. Give me a filled continuation or review
prompt to paste into a new chat; do not start the next unit.
```

### Passing Work Between Chats

The agent, not the operator, fills the handoff: approved outcome, code baseline,
owned paths, current changes, proof performed, gaps and one precise next action.
The operator should be able to paste it unchanged into the next session.

The current state block holds milestones and scope; temporary investigation/test
detail stays in the existing worklog. Keep unfinished-task notes when transferring
a session. On task completion retain durable decisions in the owning guide,
record code history as required, and reset the worklog to its scaffold. Never
discard another active session's notes.

A lost session is recoverable from those documents and the real diff. The new
agent reconciles them read-only before editing. Stale validation, missing files
or unclear ownership require a specific question, not a restart of all research.

### Independent Review and Subagents

Review the actual patch and new files, with its approved design and validation.
Ask especially whether one representation has merely been added alongside the
others, or whether merging data has accidentally merged independent authority.
Findings return in chat to the operator/coordinator; only the active executor
changes code in response.

When the current assignment permits subagents, use a bounded read-only trace or
review, with explicit paths, question, output and stop condition. Honour the
operator's reviewer-model preference. Do not delegate overlapping rewrites of
the publisher, freshness code, stores or fixtures to simultaneous writers.
Do not rely on delegate memory; integrate the useful result into current state.
Do not silently waive standing check-in, worklog or safety instructions.

### Reversible Prototypes and Stopping

The lack of product users permits a coherent, ambitious local replacement and
an honest rejection if it does not earn its complexity. It does not permit live
mutations or loading shared infrastructure as an experiment by default.

Establish an operator-approved recoverable baseline before a risky replacement.
Commits/branches/worktrees require permission; preserve pre-existing changes and
never use a destructive reset. A failed prototype is removed selectively. Record
the reason in the owning decision, not a new session-history document.

Fix local defects within the approved slice and rerun the focused check. Ask
when the next attempt requires a different product promise, authority model,
scope or material cost. Do not spiral into increasingly elaborate compatibility.

## Copy-Paste Prompts

### Coordinator Kickoff

```text
Read current applicable instructions, kupua/AGENTS.md, the existing worklog, and
kupua/exploration/docs/simplification-02-image-publication.md.

Start read-only. Confirm the editing milestone and whether API-only retirement
has been accepted. Rebase B0 against current code. The old AppImage wrapper is
not a selected design, and shared normalization is already implemented.

Propose one concrete representation/publication replacement with actual
deletions. Explain how it preserves content freshness, independent permissions,
lean/full detail and the existing browsing experience. Show a before/after
ownership table and the existing proof to reuse. Do not add a cache framework,
new server format or performance promise. Follow the fresh-agent confirmation
protocol before product edits. Read-only subagents may perform bounded tracing
or independent review; do not create parallel product writers.
No live access, campaigns, Git mutations or implementation is authorized by
this kickoff alone.
```

### Executor Handoff

The coordinator fills every field; the operator pastes the completed message.

```text
Execute only the approved [B unit/title] from
kupua/exploration/docs/simplification-02-image-publication.md.
Read current instructions, AGENTS, the worklog and the brief's Execution State.
First reconcile the current tree with this handoff and confirm understanding.

Approved outcome and permissions: [specific scope and exclusions]
Baseline: [revision, relevant dirty/untracked work, predecessor status]
Selected contract: [where documented; real example; independent authorities]
Owned paths/current patch: [files and state]
Mechanisms to remove: [old paths, precedence or duplicate representation]
Temporary bridge and removal point: [explicit, or none]
Proof to retain/update: [existing tests and their guarantees]
Validation already performed: [commands, results and code state]
Remaining risk/unverified work: [specific]
Next action: [one concrete action]
Stop/ask boundary: [scope, guarantee, cost or safety condition]

Do not change server contracts, add a general entity cache, replay mutations,
run campaigns or touch live data. At completion or context handoff, update
current state and give me a fully filled prompt for the next chat or reviewer.
Read-only tracing/review subagents are permitted within the current unit;
the active executor remains the sole writer.
```

### Independent Review

```text
Review [approved B unit] from simplification-02-image-publication.md read-only.
Read current instructions, AGENTS and the worklog. Inspect the actual owned
diff/new files against [baseline], with [validation summary and known gaps].

Check actual subtraction, independent metadata/capability authority, late reads,
lean/full detail, off-screen selection, immutable operation targets, retained
list geometry and notification/request costs. Does the new representation
replace old coordination or just accompany it? Are necessary tests preserved
without a new exhaustive matrix?

Return severity-ordered findings with source references, missing proof, and an
accept/repair judgement. Do not edit, execute tests/campaigns, use live systems,
change shared planning state or require stronger unrelated product guarantees.
```

### Recover a Lost Session

```text
Resume the investigation/implementation described in
kupua/exploration/docs/simplification-02-image-publication.md.
Read current instructions, AGENTS, Execution State and worklog-current.md.
Inspect the worktree read-only; do not assume the old image design or last
green test summary matches the current editing code.

Report the last accepted unit, chosen representation, partial migrations,
remaining bridges, matching validation, active-writer uncertainty and the
smallest next action. Ask for missing authority or a specific design decision.
Do not reset files, rerun an active test, restart the broad audit or edit before
the current unit is confirmed.
```

### Operator-Friendly Closeout

Report separately: structural simplification, preserved/repaired behaviour,
measured performance (if any), and verification cost/limits. Show one concrete
future maintenance task that is now easier. Supply one filled handoff when
another session is needed; do not leave the operator to assemble the context.

## Finish or Stop

Accept when the agreed redundant representations and publication obligations
are gone, the required independent facts remain correct, and proof covers the
joined consumers. Performance improvement is welcome, not a fabricated condition
for calling the maintainability work useful.

Stop for a design decision if the replacement requires a general cache/freshness
framework, additional live reads, broader payloads, lost permissions/detail,
comparable duplicate state or a new cross-module coordination protocol. Do not
call a wrapper-only patch completion. A rejected design is a bounded result,
not evidence that no future simplification is possible.
