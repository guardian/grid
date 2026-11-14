# Grid index migration: historical research sequence

> **Archived, 15 September 2026: not execution guidance.** This sequence served stronger
> migration requirements than the current prototype scope. Its future documents and gates are
> not prerequisites. Preserve the findings; do not resume the programme without explicit approval.
> Current scope: [media-api index](../../../03%20Ce%20n'est%20pas%20une%20pipe%20dream/media-api-work/media-api-00-index.md).

**Date:** 2026-09-14  
**Status:** Active routing document. Documents 01–04 are complete. The production-impact audit
`production-impact-00-prompt.md` is the next action and must
resolve the programme-scope gate before document 05. Documents 05–08 must not be created as empty
placeholders or written before their declared inputs exist.

## Purpose

This file is the single routing authority for the D3/D8 rethink triggered by the PIT/index-
migration research. It answers four questions:

1. Which research or decision session happens next?
2. Which document each session must produce?
3. When the performance/DRY audit may influence planning or implementation.
4. What must remain deliberately unplanned until earlier decisions exist.

The broad migration inventory remains in `../../../03 Ce n'est pas une pipe dream/media-api-work/media-api-01-capability-inventory.md`.
This numbered track owns the D3/D8/read-epoch decision sequence. If another active document
disagrees about that sequence, this file wins until the disagreement is resolved here.

## Governing order

Do not start product-code implementation from document 02 or 04. Decision 04 records the strongest
migration-transparent architecture, but the scope reassessment establishes that it is a production
Kahuna/backend programme rather than the originally additive Kupua endpoint. First run the ZZ2
production-impact audit and choose the programme boundary. Only if the full architecture is
accepted should this track proceed to snapshot transport and coordinated workplanning.

| # | Document | Status / owner | Required outcome |
|---|---|---|---|
| 00 | `grid-index-migration-00-routing.md` | Active; maintained as decisions advance | Canonical sequence, gates and audit routing. |
| 01 | `grid-index-migration-01-research-prompt.md` | Complete | Research brief that produced 02. Evidence of scope, not the current next action. |
| 02 | `grid-index-migration-02-research-findings.md` | Complete; research evidence | Recommended blue-green single-target read epoch, combined first page and opaque snapshot session; held D3 review. Its recommendation was adjudicated by 04. |
| 03 | `grid-index-migration-03-architecture-prompt.md` | Complete | Prompt that produced decision 04. |
| 04 | `grid-index-migration-04-architecture-proposal.md` | Complete; strongest-end-state decision | Selects canonical read/write epoch, `CutoverReady`, held D3 review and semantic browse session. Its production-scale implementation scope is not accepted. |
| ZZ2 | `production-impact-00-prompt.md` | **Run next in a fresh strong research session** | Determine whether migration is the only conflict with the original additive/non-regression scope, assess deletion/minimum writes and operational impact, and recommend the proportionate programme boundary. Produces the sole `ZZ2- PROD-impact-assessment-findings.md` report. |
| 05 | `phase-3-d3d8-pit-migration-05-snapshot-transport-research-prompt.md` | **Blocked pending ZZ2 findings and explicit acceptance of full 04** | If full 04 is accepted, derive a fresh prompt from its exact snapshot/session requirements. If a contained/reduced path is chosen, replace this route with a path-specific plan rather than writing 05. |
| 06 | `phase-3-d3d8-pit-migration-06-snapshot-transport-decision.md` | **Does not exist yet; output of 05** | One evidence-backed mechanism and protocol decision, including concurrency, lost-response, expiry, close, auth binding, multi-instance operation and measured cost. |
| 07 | `phase-3-d3d8-pit-migration-07-workplan-synthesis-prompt.md` | **Write only after 06** | A fresh synthesis prompt built from 02, 04 and 06 plus current code. It must request an implementation plan, not more architecture exploration. |
| 08 | `phase-3-d3d8-pit-migration-08-implementation-workplan.md` | **Does not exist yet; output of 07** | One implementation-ready coordinated plan for D3, D8, read epoch/cutover, Kupua client changes, tests, rollout and rollback. Product-code work starts only after this is reviewed. |

## What documents 05–08 must be

### 05 — snapshot transport research prompt

Document 05 must be written from 04, not copied from 02. It should freeze 04's architecture
and ask only how to realize its snapshot/session contract. At minimum it must require:

- exact supported Elasticsearch and elastic4s behavior;
- shared compare-and-set state versus signed stateless/serialized tokens and any viable simpler
  mechanism left open by 04;
- concurrent forward/backward requests and refreshed PIT-head ownership;
- retries after lost responses, duplicate requests and stale revisions;
- expiry, re-anchor, idempotent close and cleanup after partial failure;
- principal/tier/query/sort/read-epoch binding and replay resistance;
- multi-instance media-api deployment, restart, rollout and rollback;
- deterministic exact-version tests before performance comparison;
- latency, capacity, retained-segment and shared-store cost measurements with stop conditions.

It must produce 06 and must not propose product implementation.

### 06 — snapshot transport decision

Document 06 must select one transport/state mechanism, not leave a tie. It must define the
wire-visible lifecycle and server state model far enough for planning: create, first page,
continue, concurrency, refresh, expiry, restore and close. It must identify evidence still
required during implementation, but no unresolved architecture fork may be delegated to 08.

### 07 — workplan synthesis prompt

Document 07 must be written only after 04 and 06 are accepted. It should tell a fresh planning
agent to consume:

- 02 as research evidence;
- 04 as the architecture authority;
- 06 as the snapshot-transport authority;
- current D3/Thrall/Kupua/media-api code and tests;
- the broad migration inventory;
- the audit routing below.

It must require identification of existing tests asserting old behavior before proposing edits,
failing-first tests per behavioral slice, cross-language contract fixtures, versioned rollout,
rollback, observability, performance/capacity gates and exact validation commands. It produces 08.

### 08 — implementation workplan

Document 08 is the only plan from which product-code work begins. It must be ordered into small,
reviewable, testable slices, likely separating deterministic fixtures, read-epoch/cutover policy,
media-api snapshot/D3 contract, Kupua lifecycle, downstream D1/D2/D4 integration, and rollout.
The planner may choose different slices if 04/06 demand them. Every slice must state:

- behavior and invariant changed;
- files/owners affected;
- failing test written first and why it fails;
- existing tests that encode old behavior;
- focused and full validation surfaces;
- migration/rollback compatibility;
- performance or capacity stop gate where applicable.

## Audit routing

`../../performance-first-dry-consolidation-audit-2026-09-13.md` remains a source audit and
implementation queue. It is not a D3/D8 architecture plan. Do not implement audit work before
04/06/08 merely to “prepare” the code: that can encode a contract the decisions later reject.

### Inputs that 03 and 07 must use

| Audit findings | How they enter the decision track | Do not do independently |
|---|---|---|
| Q5 | Use the complete sort inventory to adjudicate and plan server-owned semantic `orderBy` parity. | Do not create another authoritative client sort registry. |
| Q6 | Use null-zone, reverse, special-sort and tuple-remapping cases as cross-language behavior fixtures. | Do not create a TypeScript abstraction and assume Scala inherits its contract. |
| W6 | Treat complete enrichment publication for every committed D3 image as a client-contract invariant. | Do not hide it inside a cold-path DRY refactor. |
| H6 + S5 | Decide authoritative tuple retention and whether D2 receives IDs or cursors under the chosen snapshot model. | Do not optimize image-derived cursor reconstruction first. |
| H3 + Q4 | Distinguish local UI/cache fingerprints from authenticated server snapshot/session identity and continuation state. | Never trust a client fingerprint, raw `after_key` or client cumulative rank as server authority. |

03 uses these as architecture constraints only. 07 decides where they become implementation
slices. No product code is changed between those steps.

### Independent audit queue after 08 exists

These findings do not depend on the new D3 contract, but wait until 08 exists so architecture
sessions reason over stable source and citations. Execute in this order unless 08 identifies a
new direct dependency:

1. **Small correctness wins:** S2, W1, T1, H2, F4, Q3.
2. **Browser-history identity:** H1.
3. **Selection integrity:** S1 + S3, then S6 + G3.
4. **Request waste:** Q2, then Q1.
5. **Lower-priority CPU/render work:** R1, then V1.
6. **Measure before deciding:** S4, W3, W4, G1, G2, F1–F3, H4, H5.

Independent means the final D3 contract does not control the behavior, not that the work should
interrupt the decision sequence.

### Findings not implemented independently in their original forms

- **Q4:** client-held composite continuation is abandoned; any continuation belongs to the
  migration D5/D6 server contract if those endpoints survive their value gate.
- **Q5:** no authoritative client sort registry; its inventory feeds semantic-sort fixtures.
- **Q6:** no standalone cross-language abstraction before the workplan assigns ownership.
- **S5:** no range-intent rewrite before D2 endpoint ownership is settled.
- **H6:** no compiled image-to-cursor authority; server tuples/session resolution win.
- **W6:** routed into D3 client completeness, not the independent queue.
- **H3:** defer shared projection/fingerprint implementation until 08 separates local cache identity
  from server session identity.

## Stop/go gates

- **Now:** run the ZZ2 production-impact audit. Do not write 05 or product code.
- **After ZZ2:** choose explicitly between the full production programme in 04 and a contained or
  reduced Kupua boundary. Do not let the research agent make implementation changes.
- **If full 04 is accepted:** write 05 from its unresolved transport brief.
- **If a contained/reduced boundary is chosen:** stop the 05–08 sequence and write a new,
  scope-specific planning route; do not dilute `CutoverReady` or reuse 05 by changing its premise.
- **After 06:** accept the mechanism decision, then write 07.
- **After 08:** review the workplan; only then start implementation or the independent audit queue.
- If 05 refutes a requirement in 04 rather than a mechanism, return to architecture adjudication;
  do not bury the contradiction in 06.

## Document disposition

- Keep 01 and 02 as immutable prompt/evidence pair except for corrected filenames and links.
- Keep 03 with its output 04 as a second prompt/decision pair.
- Keep the scope reassessment and ZZ2 prompt/findings as the programme-boundary record between 04
  and any later transport or containment plan.
- Create 05 only from explicitly accepted 04 after ZZ2; create 07 only from accepted 06.
- Keep the consolidation audit at docs root and readable as one source audit with a concise
  execution disposition linking here.
- Treat the current D3 PR description and Option-B implementation as evidence/rollback material
  until 04 and 06 settle the reviewed contract.
- Do not create placeholder 04/05/06/07/08 files to make the directory look complete.