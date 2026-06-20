# B2-Hunt Handoff — Method Consolidation Audit

## Why this audit exists

Phase 2 produced §5 "Methods that may be redundant or fusible" with three
fusion candidates, but a naive read by the user instantly spotted a fourth
that §5 missed: the aggregation cluster (`getAggregation`,
`getAggregations`, `getFilterAggregations`, `countWithTickers` all return
shaped counts). That single miss invalidates the bounded-list assumption
behind Phase 3's bucket B2.

This audit closes the hole **before** Phase 3 runs, so Phase 3 inherits a
complete fusion list rather than a partial one with an "additions cap" hack.

The user's strong directive: **client refactor is MASSIVELY preferred to
server extension**. Every fusion found here potentially eliminates a future
media-api endpoint and shrinks the current direct-to-ES code today.

## Mindset

- **You are looking for fusion opportunities, not improvements.** "These
  two methods could fuse" is the question. "This method could be improved"
  is not. Resist the drift.
- **The gate is `does fusion regress performance or functionality?`** If
  yes → not a fusion. If no → fusion candidate, log it. This binary gate
  is the only thing keeping the audit bounded.
- **One pass, one session.** No "let me dig deeper into method X" rabbit
  holes. The 20-method interface groups into ~7 clusters; you have one
  pass through each cluster.
- **Cite Phase 2 §2 entries.** Every fusion claim must reference the two
  (or more) Phase 2 method subsections it joins. Format: "Fusion: §2.6
  `getAggregation` + §2.7 `getAggregations` + §2.8 `getFilterAggregations`."

## Push-back clause (READ THIS)

Stop and write **Section 0: Premise Check** if any of:

- The 7-cluster grouping below is wrong (e.g. a method genuinely doesn't
  fit any cluster, or two clusters need merging). Explain and propose
  revised clustering, then stop.
- More than 8 fusions found (probably means you're forcing fusions where
  there are none — the user wants real fusions, not exhaustive pairing).
- A fusion looks attractive but you cannot verify the no-regression gate
  without reading source code. Source reads are allowed in this audit
  (see scope) but if a single fusion requires >100 lines of reading to
  evaluate, it's too deep \u2014 record it as "needs separate evaluation"
  and move on.

## Scope: in and out

### IN scope

- `phase-2-kupua-dal-needs-findings.md` — primary input (§2 method
  catalogue + §5 existing fusion list)
- `phase-1-media-api-capability-inventory-findings.md` — for checking
  whether media-api already exposes a unified shape that constrains
  fusion direction
- `kupua/src/dal/types.ts` — interface signatures (small file, read in full)
- `kupua/src/dal/es-adapter.ts` — **targeted reads only**: when evaluating
  a fusion, read the relevant method implementations to check for
  performance hot paths, special-case logic, and shape divergences that
  would block fusion. Hard rule: ≤ 100 lines of source read per fusion
  evaluation. If more is needed, defer.

### OUT of scope

- Re-auditing call sites (use Phase 2 + findings-4)
- Reading components, hooks, stores deeply (surface citation only if
  needed to confirm a UI feature)
- Designing the fused method's signature in detail (rough shape only;
  exact API design belongs in a follow-up implementation session)
- Writing code
- Evaluating B1 (shape-leak elimination) — that's Phase 3's job
- Evaluating bucket-C or D — that's Phase 3's job
- Estimating implementation effort beyond S/M/L

## The 7-cluster grouping (your starting point)

Audit one cluster at a time, in this order:

| # | Cluster | Methods | Phase 2 §5 status | Initial intuition |
|---|---------|---------|-------------------|-------------------|
| 1 | **Aggregations** | `getAggregation`, `getAggregations`, `getFilterAggregations`, `countWithTickers` | **Missing from §5** | Strong fusion suspect — all return shaped counts |
| 2 | **Search/paging** | `search`, `searchRange`, `searchAfter`, `countBefore` | Partial (`search` ↔ `searchAfter` in §5) | Complete the pairwise — `searchRange` and `countBefore` not evaluated |
| 3 | **Fetch** | `getById`, `getByIds` | Not in §5 | Trivial — `getById(id)` ≡ `getByIds([id]).then(r => r[0])` |
| 4 | **Seek/position** | `estimateSortValue`, `findKeywordSortValue?`, `getKeywordDistribution?`, `getDateDistribution?`, `fetchPositionIndex?` | Partial (keyword pair in §5) | Multiple sub-fusions possible |
| 5 | **Range walk** | `getIdRange` | Not in §5 | Likely standalone — verify no overlap with `searchAfter(noSource:true)` |
| 6 | **Snapshot** | `openPit`, `closePit` | Not in §5 | Lifecycle pair, not fusion candidates — skip after one-line confirmation |
| 7 | **AI / count outliers** | `searchByAi?`, `count` | Partial (`count` ↔ `countWithTickers` in §5) | Verify `count` fusion; verify `searchByAi` is standalone |

If you finish a cluster in <5 minutes thinking it has no fusion, that's
fine — write "no fusion" with one-line justification and move on. Cluster
1 (aggregations) deserves the most time; cluster 6 the least.

## Deliverable shape

Write to: `kupua/exploration/docs/03 Ce n'est pas une pipe dream/b2-hunt-findings.md`

### Section structure (mandatory)

**Section 0 — Premise check (only if needed; otherwise omit)**

**Section 1 — Executive summary**

A single table of confirmed fusions:

| # | Fusion | Methods collapsed | Net surface reduction | Regression risk | Independent value |
|---|--------|-------------------|----------------------|------------------|-------------------|

- **Net surface reduction**: e.g. "4 → 1", "2 → 1"
- **Regression risk**: None / Low / Medium / High, with one-word reason
- **Independent value**: "Yes — simplifies es-adapter today" or "No — only
  meaningful for future adapter"

This table is the actionable output. A reader who reads only Section 1
gets the answer.

**Section 2 — Cluster-by-cluster evaluation (7 subsections)**

For each cluster, fixed template:

```
### Cluster N — [name]

**Methods in cluster:** Comma-separated list.

**Phase 2 §5 coverage:** What §5 already said. If §5 missed it, say so.

**Pairwise / N-way fusion candidates evaluated:**

For each candidate within the cluster, write a paragraph:

  **Candidate: A + B [+ C]**
  - Abstract shared need (1 sentence)
  - Inputs delta (what diverges between methods)
  - Outputs delta (what diverges between methods)
  - Performance gate: would fusion force any call site to do more work
    than it does today? (cite the call site's current semantics from
    Phase 2 §2 or findings-4)
  - Functionality gate: does any unique behaviour in one method vanish
    in fusion? (e.g. "method A returns early on first match; method B
    walks all values — fusion forces all callers to walk all values
    unless an opt-in flag preserves the early-exit path")
  - Verdict: **FUSION CONFIRMED** / **FUSION REJECTED** / **DEFERRED
    (reason)**
  - If confirmed: rough shape (one sentence, NOT a designed signature)
    and dependency on media-api capabilities from Phase 1 (if any)

**Cluster conclusion:** How many fusions confirmed.
```

**Section 3 — Source-code dives performed**

For each Phase 2 method you opened es-adapter.ts to verify, log:
- Method, file:line range read
- What you were checking
- What you found

This is the audit trail proving the no-regression gate was actually
applied (not handwaved). Hard cap: 10 dives total. If you need more,
something is wrong with the cluster grouping.

**Section 4 — Phase 2 §5 reconciliation**

For each of Phase 2 §5's three existing fusion candidates:
- Confirmed? Rejected? Refined?
- If refined: how, and why

This protects against silent disagreement with §5.

**Section 5 — Things considered but rejected (with reasons)**

Pairs/groups you evaluated and rejected. One line each. Important: this
proves you considered the options, not just the obvious ones. Hard cap: 15.

**Section 6 — Coverage gaps and uncertainties**

Anything you couldn't evaluate within budget. For each:
- What's uncertain
- What would resolve it (separate session? user input? code archaeology?)
- Provisional verdict pending resolution

**Section 7 — Anti-goals appendix (≤15 items, one line each)**

Improvements / refactors / design observations that are NOT fusions but
came up. Strict cap. Phase 3 will ignore.

## What "done" looks like

Self-check:
- [ ] All 7 clusters have a Section 2 subsection with a cluster conclusion
- [ ] Cluster 1 (aggregations) has the deepest analysis — minimum 4
      pairwise evaluations (the four-method cluster)
- [ ] Every "FUSION CONFIRMED" has both gates explicitly evaluated
      (performance + functionality)
- [ ] Section 1 table contains every confirmed fusion
- [ ] Section 3 logs ≤ 10 source dives (if any)
- [ ] Section 4 reconciles all three of Phase 2 §5's existing entries
- [ ] No code written; no commits; no test runs
- [ ] No signatures designed in detail

## Volume expectations (falsifiability)

- Cluster 1: 4–8 pairwise evaluations (the four-method aggregation cluster
  produces C(4,2)=6 pairs plus possible 3- and 4-way fusions)
- Clusters 2, 4: 2–5 evaluations each
- Clusters 3, 5, 6, 7: 1–2 evaluations each
- Total confirmed fusions: 3–8 (matches Phase 3 handoff's B2 catalogue
  expectation)
- If you confirm 0 fusions: premise check
- If you confirm >8: premise check (probably forcing)
- Total document length: 600–1200 lines

## Operational rules to prevent drift

1. **Build Section 1 last.** Don't pre-commit to fusions before working
   through the clusters.
2. **Time-box each cluster.** Aggregations cluster: longest. Snapshot
   cluster: shortest (likely one line: "lifecycle pair, not fusion").
3. **The no-regression gate is the only thing keeping this audit
   bounded.** Apply it to every candidate. If you can't apply it without
   reading >100 lines of source, the candidate goes to Section 6 as
   deferred, not into the fusion list.
4. **Avoid the "everything is potentially fusible" trap.** Any two
   methods returning data can theoretically be unified. The question is
   whether unification is *desirable* (reduces surface without
   regressing) \u2014 not whether it's *possible*.
5. **When reading es-adapter.ts, look for these specific signals as
   blockers to fusion:**
   - Different ES indices / endpoints touched
   - Different caching characteristics
   - Different cancellation/abort semantics
   - Early-exit / streaming paths that don't fit a unified return type
   - Different request-size or response-size scaling characteristics
6. **B2 is about kupua client improvement, not future media-api shape.**
   A fusion is valuable if it simplifies `es-adapter.ts` today. The
   media-api endpoint shrinkage is a bonus, not the criterion.

## Why this CAN be delivered as a single session

The problem space is bounded:
- 20 methods, naturally grouped into 7 clusters
- One question per cluster: "fusion candidates here?"
- One gate per candidate: "no regression?"
- Existing inputs (Phase 1 + Phase 2) are detailed enough that most
  evaluations don't need source reads

The output is finite and shape-known: Sections 1–7 with the templates above.

## Out-of-band notes

- Model recommendation: Sonnet High. The work is judgement under
  constraint (the gates), not bulk reading.
- The push-back clauses are real. If clustering is wrong, write Section 0
  and stop \u2014 the user wants to know before Phase 3 inherits a bad input.
- Read-only. Targeted source reads allowed within the per-fusion 100-line
  budget. No code changes, no commits, no test runs.
- After this audit completes, the user will decide whether to:
  (a) update Phase 2 §5 in place with the new fusion list, or
  (b) leave Phase 2 §5 alone and feed this doc directly to Phase 3.
  Either way, Phase 3 dispatches *after* this audit.
