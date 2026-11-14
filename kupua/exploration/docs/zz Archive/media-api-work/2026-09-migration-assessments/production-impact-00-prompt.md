# Prompt — Production-impact assessment of the additive Kupua/media-api plan

> **Archived, 15 September 2026: completed historical prompt, do not execute.** Its capability
> horizons included migration and writable behavior beyond the current read-only prototype task.
> Preserve the assessment evidence; do not treat its programme gates as current instructions.
> Current scope: [media-api index](../../../03%20Ce%20n'est%20pas%20une%20pipe%20dream/media-api-work/media-api-00-index.md).

**Recommended model:** Opus 4.6 or the strongest available architecture/research model.  
**Mode:** Read-only compatibility audit. No implementation, tests, live systems or profiling.

Paste the prompt below into a fresh agent session.

---

You are a fresh production-compatibility researcher working in the Grid repository. Your task is
to determine whether Kupua can become backend-served instead of direct-to-Elasticsearch while
preserving the programme's original constraint:

> Backend changes are strictly additive and isolated to new Kupua-facing media-api capabilities.
> Existing production behavior, contracts, availability, security and performance do not get
> worse. A very small shared change is admissible only when current production also benefits, the
> old behavior is demonstrably defective, and regression risk is low and bounded.

The PIT/index-migration conflict has already shown that one apparently small endpoint can imply a
Grid-wide production redesign. Do **not** spend this session re-adjudicating migration. Use it as
the known baseline case, then search systematically for every **other** production behavior,
service boundary or operational property that defeats, constrains or materially enlarges the
additive plan.

Examples include, but are not limited to: deletion and restore, other writes, permissions,
visibility tiers, asynchronous mutation flows, external services, signed/enriched image responses,
query/sort parity, counts and positional semantics, service topology, shared Elasticsearch and JVM
capacity, and behavior during ordinary indexing. Do not invent blockers because they sound
plausible. The phase of the moon is out of scope unless current source cites it.

This session serves a decision: **is the original additive programme still viable, for which
Kupua capability horizon, and with what honest limitations?** It is not a workplan session.

## Required output

The only research deliverable is:

`kupua/exploration/docs/zz Archive/media-api-work/2026-09-migration-assessments/production-impact-01-findings.md`

Use that filename exactly, including the space after `ZZ2-`. Do not edit product code, tests,
existing plans, routing documents or other findings. Maintain `worklog-current.md` only as required
by repository protocol. Do not create side reports, inventories or scratch findings on disk.

Target **4,000–7,000 words excluding evidence matrices and bounded appendices**, with a hard
**12,000-word maximum for the entire file**, including tables and appendices. Prefer compact tables
over repetitive prose. Detail should follow evidence and decision value, not file count.

## One mindset

Production-impact compatibility audit only.

Do not design the final architecture, choose snapshot transport, write endpoint pseudocode, produce
an implementation sequence, estimate delivery dates, or fix anything. You may describe the
smallest valid unblock far enough to classify its impact and prove that it is genuinely small. Do
not turn every finding into a speculative redesign.

The subject is broader than media-api code but narrower than “audit all of Grid.” Trace only a
production capability that intersects:

1. a feature Kupua has now;
2. an active capability in the broad migration plan, including current D3 and planned D7–D9; or
3. the minimum write/delete abilities without which Kupua could not credibly evolve beyond its
   current read-only prototype.

Pure Kahuna features with no Kupua analogue or plausible backend-migration dependency are out of
scope. Pure visual/frontend quality is out of scope. Group repeated fields, endpoints and services
into capability families; do not produce one finding per method or component.

## Premise challenge and halt

First test the audit premise.

The current and archived planning record appears to say that Kupua integration should use new,
additive media-api routes and leave existing Kahuna behavior unchanged. Verify this from the named
sources. If that original constraint is not actually supported, write **Section 0** with the exact
contradicting evidence and stop. Do not audit against an invented promise.

Also halt in Section 0 if current source cannot distinguish these three states well enough to
classify impact:

- existing production-reachable behavior;
- implemented but unreviewed/no-production-caller Kupua code such as current D3;
- planned-only capability.

Do not halt merely because deployed versions, traffic, latency or capacity are unknown. Those
become explicit measurement gates. Do not claim current deployment facts from a working branch.
If the premise passes, include a compact cited **original-scope provenance** subsection in Section
2; Section 0 remains halt-only.

## Definitions and evidence bar

Use these categories consistently. “Additive” and “non-production-affecting” are not synonyms.

Apply them on **two axes**:

- **Contract/reachability impact:** A0, A1, P, R or U.
- **Runtime production impact:** `none evidenced`, A2 or U.

A route may be **A0 contractually and A2 operationally**. Do not collapse those into one label. A
horizon verdict follows the highest unresolved contract or runtime gate.

### A0 — isolated additive

A new route or code path with no existing production caller and no change to existing request or
response semantics, shared query behavior, mappings, aliases, writes, authorization, defaults or
deployment topology. Existing callers cannot reach it. Shared extractions are strictly behavior-
preserving. Runtime load introduced when Kupua enables the route is still assessed separately.

### A1 — bounded shared improvement

A small change to a production-reachable path is A1 only if **all** are established:

- current behavior is defective or unnecessarily wasteful from source/test evidence;
- existing callers and compatibility expectations are traced;
- the new behavior benefits production independently of Kupua;
- security, availability and data semantics cannot weaken;
- performance/capacity neutrality has existing cited evidence;
- rollback is isolated and deterministic;
- one service owns it, with no persistent schema, migration protocol or fleet-wide coordination.

If any condition is unknown, do not call it “strictly never worse.” If contracts remain isolated
but a future resource measurement is required, classify runtime impact A2 and label it
**Measurement-needed**. If shared semantics or coordination may change, classify contract impact P
or U. A candidate may graduate to A1 only after its gate passes.

### A2 — additive code with operational production impact

Existing contracts remain unchanged, but enabling Kupua adds material traffic, PIT/search contexts,
CPU, allocation, signed-URL work, downstream requests, payload, file descriptors, retained segments
or failure coupling to shared production infrastructure. This may be acceptable after measurement,
but it is not zero-impact merely because the route is new.

### P — material production change

The capability requires changing existing production semantics, shared reads/writes, authorization,
index mappings/settings, aliases, migration/cutover, durable state, deployment topology, service
coordination or operational procedures. P is not automatically wrong; it means the work needs an
independent production case and cannot be hidden inside the additive Kupua programme.

### R — reduced/deferred capability

The additive boundary can survive only by disabling, degrading, deferring or keeping direct-ES for
part of Kupua. State the exact product/operational limitation and whether it is coherent rather than
calling it a fix.

### U — unresolved

Source cannot distinguish the category. Name the cheapest static check, deterministic fixture,
measurement or team decision that resolves it. “Needs more research” is not enough.

For every material conclusion label it **Proven**, **Inferred**, **Measurement-needed**, or
**Unknown**. Every factual claim needs a current `file:line` citation or an authoritative external
URL and version. A claim of “no production impact” requires a reachability and resource argument,
not absence of an obvious caller.

## Three capability horizons

Return a separate verdict for each horizon; do not let a future write blocker make the current
read-only prototype sound unusable, or let current read success conceal a dead-end product.

1. **H0 — current built Kupua:** current user-visible workflows and current direct-ES/media-api
   strangler behavior.
2. **H1 — active backend migration:** the current broad plan, implemented D3, planned D7–D9 and
   dependent D1/D2/D4/D5/D6/C-items needed to remove normal direct-ES reads.
3. **H2 — credible writable Kupua:** minimum mutation parity needed for Kupua not to remain a
   permanent read-only prototype. At minimum assess single and bulk metadata edits, collections,
   crops/exports, usages, leases, soft delete, hard delete, restore/undelete, permission/action
   discovery, optimistic concurrency, idempotency and partial failure. This is a viability audit,
   not a request to plan all Kahuna parity.

## Source authority

Use this order:

1. **Current source and tests** for actual behavior.
2. **Current production-reachable call graph and deployment configuration** for impact. Distinguish
   a route existing from a route having production callers.
3. **Current Kupua source** for capabilities and semantics actually built.
4. `../../../03 Ce n'est pas une pipe dream/media-api-work/media-api-01-capability-inventory.md` for the active broad migration inventory. Treat
   status banners as newer than the historical body, but verify both against source.
5. Current D3 code and its active PR/sort/performance evidence, plus the active D7–D9 plan, as
   implemented/planned evidence rather than deployed production behavior.
6. Active decision 04 and the scope reassessment as the known migration case and scope question,
   not authority for non-migration findings.
7. Archived plans may be cited **only** to establish or refute the original additive/back-compat
  premise. Do not use them as evidence for current behavior, classifications, blockers, unblocks
  or rejected technical approaches.

Do not infer “deployed” from source presence. If local `main`, branch ancestry or PR evidence cannot
establish deployment, label it **Unknown**. Do not fetch remotes merely to make the label disappear.

You may consult authoritative Elasticsearch, Play, Pekko, elastic4s or AWS documentation when exact
dependency behavior matters. Cite URL and version.

## Safety and execution limits

- No test execution, profiling, builds, live requests, runtime logs, TEST/CODE/PROD access or real
  user data.
- Never inspect or reproduce credentials, cookies, signed URL query strings, authorization headers
  or private configuration.
- No product code or plan edits.
- No general code-quality, DRY, performance or security audit. Record an issue only when it changes
  the compatibility verdict for a scoped Kupua capability.
- No user-impact priority ranking. Rank by contract breakage, data correctness, production
  reachability, operational coupling and evidence confidence.

## Required reading and bounded workflow

The audit is large enough to require disciplined routing. Do not read every file in every service.

### Phase 1 — governing context, read in full

- `.github/copilot-instructions.md`, `kupua/AGENTS.md`, and `kupua/exploration/docs/worklog-current.md`.
- Active `../../../03 Ce n'est pas une pipe dream/media-api-work/media-api-00-index.md`.
- `../../../03 Ce n'est pas une pipe dream/media-api-work/media-api-01-capability-inventory.md`.
- `../../../03 Ce n'est pas une pipe dream/media-api-work/d3-search-after-02-pr.md`.
- `../../../03 Ce n'est pas une pipe dream/media-api-work/d3-search-after-03-sort-options.md`.
- `../../../03 Ce n'est pas une pipe dream/media-api-work/media-api-02-next-endpoints-d7-d8-d9-workplan.md`.
- `../../../03 Ce n'est pas une pipe dream/media-api-work/d3-search-after-04-performance.md` where it supplies measured production cost.
- `../../../03 Ce n'est pas une pipe dream/media-api-work/media-api-90-conventions.md` and `../../../03 Ce n'est pas une pipe dream/media-api-work/media-api-91-instructions-for-agents.md`.
- `grid-index-migration-04-architecture-proposal.md` and
  `grid-index-migration-05-scope-reassessment.md`.
- `../integration-plan-api-first.md`, especially its additive principle and claimed service
  boundaries.

For original-scope provenance only, read these archived sections:

- `zz Archive/media-api-work/phase-3-d3-searchafter-workplan.md`, “Production-Kahuna safety.”
- `zz Archive/media-api-work/ref--media-api-gap-closure-feasibility.md`, every “Backcompat note.”
- `zz Archive/media-api-work/phase-3-d3-searchafter-post-pr-review.md`, the decision not to turn an
  additive PR into an existing-API behavior change.

### Phase 2 — build two bounded inventories

Build inventories in memory; only the final report is written.

**Kupua inventory:** 25–50 capability families, not hundreds of UI elements. Start from
`kupua/src/dal/types.ts`, all datasource implementations, `search-store.ts` call sites, routes,
`AGENTS.md` component summary and component-detail. Include selection, collections, image detail,
fullscreen/traversal, field catalogue, CQL/typeahead, filters/facets, AI, history/restore,
position/rank/range, enrichment, signed media, and every currently reachable write intent. Mark
each H0, H1, H2 or multiple.

**Production inventory:** trace only owners intersecting those capability families. Start from:

- `media-api/conf/routes`, controllers, `ElasticSearch.scala`, `ElasticSearchModel.scala`,
  `sorts.scala`, `ImageResponse.scala`, auth/authorization and component wiring;
- all Kahuna and non-Kahuna call sites for the relevant existing routes;
- common-lib query/filter, migration-status, alias and image/message models;
- Thrall mutation and migration consumers;
- image-loader, cropper, metadata-editor, leases, usage, collections, persistence/S3 and other
  services only when a scoped workflow crosses them;
- deployment/config surfaces only for instance topology, permissions, routing and optional service
  availability.

Stop expanding a call graph when you reach the component that owns the behavior or a stable external
contract. Record that boundary. Do not read unrelated internals “for completeness.”

You may use at most four read-only subagents with non-overlapping scopes: Kupua capability graph;
production reads/auth; writes/deletion; operations/deployment. They must return evidence to the
primary agent and create no files. The primary agent owns cross-checking and the sole report.

### Phase 3 — compatibility matrix first

Before writing prose findings, classify every Kupua capability family against production:

| Capability family | Horizon | Kupua source/callers | Production owner/path | Existing contract | Planned gap | Contract impact A0/A1/P/R/U | Runtime impact none/A2/U | Existing prod callers | Resource evidence/gate | Cheapest valid unblock | Confidence |

Target **25–50 rows**. Do not split rows merely to hit the bound. If more than 50 are necessary,
group by one contract and list exceptions inside the row. Every active broad-plan item across
**A/B/C/D**, including completed/client-only items and D1–D9, must map to at least one row, as must
every current `ImageDataSource` method; related methods may share a row. Completed B items and
related A items may share one compact row and need no dossier unless they affect a horizon verdict.

Only after the matrix is complete should you write blocker dossiers. This prevents one surprising
area, such as migration or deletion, from consuming the whole session.

### Phase 4 — trace only discriminating evidence

For A0/A1 contract claims, inspect existing callers and tests that could disprove isolation or
compatibility. Assess runtime impact independently. For A2, inspect the hottest resource-producing
operation and existing measurements. For P, trace
the first production boundary that must change. For R, prove the reduced mode remains internally
coherent. For U, name one cheapest resolution.

Stop when every matrix row has a defensible category and every P/U row has one discriminating
evidence path. Do not keep exploring merely to collect more examples.

## Mandatory questions

### 1. Is migration unique?

Treat D3/D8 migration as the known P-class baseline. Identify every other capability that is also P
or U under the strict additive constraint. Explicitly answer whether migration is:

- the sole material production blocker;
- one of a small number of blockers; or
- evidence that the overall additive premise fails broadly.

Do not reopen CAS/token or `CutoverReady` design. Trace migration only where another workflow such
as deletion, update, getter consistency or service shutdown interacts with it.

### 2. Additive code versus operational production impact

For every high-frequency/new endpoint, assess both semantic isolation and shared runtime cost:

- media-api CPU/allocation and autoscaling;
- Elasticsearch query cost, PIT count, retained segments, heap and file descriptors;
- response enrichment, signed URLs, imgops/S3 calls and payload;
- downstream API fan-out, timeout and graceful-absence behavior;
- request caps, concurrency and abuse resistance;
- deployment/IAM/config changes.

An A0 route may still be A2 when enabled. Do not call hypothetical capacity a blocker without
evidence; mark it Measurement-needed and name the measurement.

### 3. Deletion and restore deep dive

This is mandatory because Kupua is currently read-only but cannot remain credible if deletion is
structurally impossible. Trace, without designing UI:

- action/permission discovery and hidden-versus-forbidden behavior;
- media-api soft-delete, hard-delete, undelete/restore and any bulk form;
- message publication, Kinesis processing, Thrall eligibility checks and per-index behavior;
- protected/in-use images, usages, exports/crops, leases and metadata persistence;
- S3/original/thumbnail/PNG cleanup and any retained metadata;
- asynchronous acknowledgement, idempotency, optimistic concurrency, retries, partial failure and
  audit/logging;
- migration interaction only as needed to classify deletion independently;
- whether Kupua can invoke existing production contracts unchanged, needs a new isolated endpoint,
  or requires existing semantics to change.

State separately what is possible for one image, many images and restore. If an existing endpoint
is safe to reuse, that is a positive finding, not a gap.

### 4. Other write viability

At capability-family level, repeat the compatibility test for metadata edits, multi-edit conflict
semantics, collections, crops/exports, usages, leases, syndication/rights, and any mutation already
represented by current Kupua controls or required for minimum parity. Determine whether media-api
already exposes an authenticated command, whether Kupua can call it unchanged, and which downstream
services/events own completion.

Do not audit every Kahuna button. Focus on whether the backend-serving strategy has a dead end.

### 5. Read/query parity outside migration

Assess filters/CQL, configured aliases, all sort families, special dates/null zones, exact totals,
tickers, facets/typeahead, AI, collections, single/multi image reads, visibility, action links,
position maps, ranks, ranges, history/re-anchor and ordinary indexing races. Distinguish:

- semantic parity required for correctness;
- approximate presentation that can remain approximate;
- Kupua-only behavior that belongs client-side;
- current production limitation Kupua may honestly inherit;
- production behavior that would have to change.

### 6. Authentication, authorization and information disclosure

Trace Panda/auth principal handling, access tiers, visibility filters, per-image actions, hidden IDs,
bulk result omission, write permissions and any CSRF/CORS/proxy assumptions. A new route is not A0
if it weakens existing access semantics or leaks existence through counts/errors.

### 7. Optional services and deployment modes

Kupua must work across its documented local/direct/media-api modes and tolerate absent Grid APIs as
specified by current directives. Determine which capabilities depend on optional services,
production-only config, instance-local state, sticky routing or credentials unavailable to the
intended deployment. Classify graceful degradation separately from hard incompatibility.

### 8. Current plan integrity

Map the broad plan's A/B/C/D classifications and D1–D9 status onto both impact axes. Identify stale
“small/additive” assumptions, missing production callers, duplicated ownership, or capabilities that
do not actually serve current Kupua call sites. Current source wins.

This is not permission to reopen the general migration or DRY audits. Only plan defects discovered
while answering production compatibility belong in the main report.

## Finding rules and volume

After the full matrix, produce **5–25 material blocker/constraint dossiers**. If evidence supports
fewer, say so; do not fragment one cause to reach a quota. Each dossier must contain:

1. classification and horizon;
2. exact Kupua workflow/call sites;
3. existing production owner, behavior and callers;
4. why the additive boundary passes or fails;
5. failure mode if ignored, stated as code/data/contract behavior;
6. smallest valid unblock or honest reduction;
7. whether current production benefits independently;
8. microservices/configuration touched;
9. existing tests that prove something and what they do not prove;
10. evidence label, confidence and cheapest remaining check.

Define **easy A0** and **easy A1** separately. Easy A0 must prove isolated reachability and bounded
ownership, with A2 assessed independently. Easy A1 must satisfy every A1 criterion above. Do not
infer either from a low line count. Cap easy-unblock dossiers at **12** and include:

- exact existing contract preserved or defect corrected;
- why current callers cannot regress;
- static change footprint: service owners, file families, persistent state, coordination and
  rollback boundary; no effort or delivery estimate;
- focused static/test/measurement evidence an implementation plan would need.

Do not write implementation steps or pseudocode.

If your later analysis refutes an earlier finding, delete or rewrite the earlier finding. Never
leave a claim and its contradiction in the report.

## Verdicts required

Choose exactly one verdict for each H0/H1/H2:

1. **Viable under A0 only.**
2. **Viable under A0+A1, with named bounded changes.**
3. **Viable only with A2 measurements and explicit capacity acceptance.**
4. **Viable only with one or more P-class production programmes.**
5. **Viable only as a named reduced/deferred mode.**
6. **Not established; one named evidence gap prevents a verdict.**

Then make one overall programme recommendation. Do not return a tie. If two paths are viable,
select the one proportionate to a prototype and name the trigger that would justify the larger path.
Implementation cost is evidence, but production risk and original scope are first-class constraints.

## Appendices and release valve

The main report is the production-impact audit. Incidental observations have strict caps:

- **Appendix A — active-plan inconsistencies:** at most 20 one-line, cited items. Include only
  contradictions, stale source assumptions or call-site omissions discovered during this audit.
- **Appendix B — unrelated production defects:** at most 10 one-line, cited items. No fixes or
  severity theatre. Omit anything speculative.
- **Appendix C — untraced surfaces:** required, maximum 20 source-family rows, never a file dump.

Do not let an appendix finding expand the main scope unless it changes an H0/H1/H2 verdict.
Sections 7–13 synthesize and cross-reference matrix rows and dossier IDs; they must not restate the
same evidence narrative.

## Required output structure

0. **Premise challenge** — only if halting.
1. **Decision card** — H0/H1/H2 verdicts, overall recommendation, confidence, largest blockers,
   easiest wins and next decision.
2. **Constraint definition** — A0/A1/A2/P/R/U and what “never worse” can and cannot prove.
3. **Source/deployment status map** — production-reachable, unreviewed D3, planned-only, unknown.
4. **Capability compatibility matrix** — 25–50 rows covering all scoped Kupua families and plan
   items.
5. **Material blocker dossiers** — 5–25, ordered by classification then evidence confidence.
6. **Easy additive/shared unblocks** — detailed A0/A1 dossiers, maximum 12.
7. **Deletion and restore assessment** — single, bulk and restore verdicts.
8. **Other write-readiness assessment** — grouped mutation families and service flow.
9. **Read/query/auth/deployment constraints** — non-migration cross-cutting conclusions.
10. **Operational impact of additive traffic** — A2 evidence and exact measurement gates.
11. **Current migration-plan assessment** — every A/B/C/D and D1–D9 family reclassified for
    production impact.
12. **Scoped alternatives** — full additive, additive+A1, measured A2, reduced mode and P-programme;
    one recommendation, no implementation workplan.
13. **Microservice footprint** — for each viable path, which of media-api, common-lib, Thrall,
    image-loader, cropper, metadata-editor, leases, usage, collections, auth/config/infra or other
    proven owners would change, and whether the path is production-reachable.
14. **Residual unknowns/team decisions** — owner and cheapest resolution for each.
15. **Appendix A — active-plan inconsistencies** — capped.
16. **Appendix B — unrelated production defects** — capped.
17. **Appendix C — source coverage and untraced surfaces**.
18. **What done looks like** — self-check against this prompt.

## Anti-goals

- No implementation workplan, code, tests, commits, endpoint pseudocode or task estimates.
- No re-adjudication of decision 04's migration architecture or CAS-versus-token mechanism.
- No assumption that a new route has zero production impact once traffic is enabled.
- No assumption that touching shared code changes behavior; prove reachability and semantics.
- No assumption that existing Kahuna behavior is correct merely because it is production.
- No “benefits production” label without an independently useful, evidenced production outcome.
- No weakening of auth, visibility, hidden-ID, deletion safety or data-integrity semantics to keep a
  change additive.
- No claim that current read-only Kupua is DOA because future writes are P-class; report horizons
  separately.
- No claim that H0 success proves H2 viability.
- No broad audit of every microservice, every Kahuna feature, every field or every UI component.
- No archive document treated as current design.
- No unsourced claims, fabricated traffic/capacity, or user-impact priority ranking.

## Completion standard

The report is complete only if a reviewer can answer, without reopening the repository:

- Is the original additive/non-regression premise genuinely documented?
- Apart from migration, which exact capabilities violate or threaten it?
- Is “additive code” operationally safe under production traffic, or merely API-compatible?
- Can current Kupua H0 run behind media-api without material production change?
- Can the active H1 direct-ES removal plan do so?
- Can Kupua ever support deletion, restore and the minimum H2 write set under that boundary?
- Which existing production contracts can Kupua reuse unchanged?
- Which gaps are A0, genuinely easy A1, measurement-gated A2, material P, honest R or unresolved U?
- Which microservices would change under each viable path?
- Are there small changes worth doing for production independently of Kupua?
- Which current plan assumptions are stale or internally inconsistent?
- What single programme path is recommended now, and what evidence would justify escalating it?

---

**Expected output file:**
`kupua/exploration/docs/zz Archive/media-api-work/2026-09-migration-assessments/production-impact-01-findings.md`