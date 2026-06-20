# Phase 3 Handoff — Minimal Gap Derivation

## Why this audit exists

Phase 1 inventoried media-api's current capabilities (32 routes, full
`SearchParams` vocabulary, CQL grammar, `is:` filter registry, KNN/hybrid AI
search, aggregation catalogue). Phase 2 catalogued kupua's data needs as
expressed through the 20-method `ImageDataSource` interface, separating
abstract product needs from ES-shape implementation accidents.

Phase 3 **joins** the two and derives the **minimal** set of media-api
changes required. Every kupua need must be classified into exactly one of
five buckets:

- **A — Already satisfied.** Media-api as-is, no client-side change beyond
  swapping adapter.
- **B1 — Client refactor: shape-leak elimination.** Media-api already has the
  capability; kupua's current call uses an ES-specific shape that must be
  transformed at the adapter layer (e.g. `sortOverride` → derived from
  `orderBy`, raw `extraFilter` → eliminated). No server work. Source list:
  Phase 2 §4 (consolidated ES-shape-leak list, already enumerated).
- **B2 — Client refactor: method consolidation / fusion.** Two or more DAL
  methods serve essentially the same abstract need with different shapes
  and can collapse into one method (and therefore one media-api endpoint).
  Reduces the DAL surface and the eventual adapter size. Source list:
  Phase 2 §5 (already enumerated) PLUS up to 3 additions if you spot
  obvious overlaps Phase 2 missed (see operational rule below).
- **C — Trivial server extension.** A new query parameter, a new aggregation
  alongside existing ones, or wiring an existing internal method to a route
  (e.g. `lookupIds` already exists per Phase 1 §6.3 but isn't routed). Small,
  isolated, low-risk.
- **D — Genuine new capability.** Requires a new endpoint or a substantive
  new code path. This is the only bucket that becomes real backend work.

**Bucket D is the answer to "what must we build on the server."** Buckets
B1 and B2 are valuable work *independent* of any media-api migration —
they shrink kupua's complexity and remove leaky abstractions in the
current direct-to-ES code. Even if media-api integration never happens,
B1+B2 are net positives for kupua-as-it-stands. Phase 3's deliverable
should frame them that way — not as "prerequisites for migration" but as
"refactors worth doing on their own merits that happen to also shrink
the migration surface."

## Mindset

- **Client refactor is always preferred to server extension** — provided it
  does not regress performance or functionality. This is a hard preference,
  not a tiebreaker.
- **Maximise A, B1, B2; minimise C and D.** If you can plausibly classify a
  need as A or B (either flavour), do so. Force the burden of proof onto
  "this requires server work." Today's `searchByAi` reclassification
  (gap → not-a-gap) is the model for A. The aggregation-method cluster
  (`getAggregation` / `getAggregations` / `getFilterAggregations` /
  `countWithTickers` all return shaped counts) is a likely B2 candidate
  Phase 2 §5 did not enumerate — evaluate explicitly.
- **No design.** Do not specify endpoint shapes, parameter names, or
  response payloads for bucket-D items. Phase 3 says "this is needed" and
  "here is the closest existing thing." Endpoint design happens in a
  separate per-gap workplan session, after the user reviews Phase 3.
- **Cite both sides.** Every classification must cite (a) the Phase 2
  method/need it addresses, (b) the Phase 1 capability (or absence
  thereof) it relies on. Format: "Need: §2.4 `countWithTickers`. Media-api:
  Phase 1 §4 (ticker aggs always-on) + Phase 1 §2 `GET /images`
  `extraCounts` response field."
- **Read-only.** No code changes. No tests. No commits.

## Push-back clause (READ THIS)

Stop and write **Section 0: Premise Check** if any of:

- The classification is impossible without inventing endpoint designs (this
  means Phase 1 was incomplete — flag specific gaps in inventory).
- More than 12 needs land in bucket D (the audit premise is that
  media-api covers most of what kupua needs; if 60%+ is genuinely missing,
  the abstraction layer mismatch is bigger than expected and warrants user
  discussion before continuing).
- Fewer than 6 needs land in buckets A, B1, or B2 combined (means kupua
  and media-api have practically nothing in common — also warrants escalation).
- A need straddles two buckets and the split affects the workplan
  meaningfully (call it out; don't pick one arbitrarily).

Push-back is not failure; it's the mechanism by which a wrong premise
gets surfaced before producing a bad plan.

## Scope: in and out

### IN scope

- `phase-1-media-api-capability-inventory-findings.md` — primary input
- `phase-2-kupua-dal-needs-findings.md` — primary input
- `media-api-gap-01-searchAfter-findings-4.md` — call-site matrix (for
  resolving ambiguity about how a need is currently exercised)
- `media-api-gap-closure-feasibility.md` — original 15-gap plan (to
  compare against the new minimal set; flag any gaps in the original plan
  that this audit reclassifies as A or B)

### OUT of scope

- Reading any source code (kupua/ or media-api/). The two findings docs
  are exhaustive enough for the join. If you find them insufficient, that
  is a Phase 1 or Phase 2 coverage gap → write Section 0 and stop.
- Designing endpoint shapes, request/response schemas, parameter names
- Workplan estimation, scheduling, sequencing
- Risk assessment beyond noting which bucket-D items are large vs small
- Testing strategy
- Any consideration of `collection-store` or `quota-store` (Phase 2 §1
  declared these out-of-scope for image data)

## Deliverable shape

Write to: `kupua/exploration/docs/03 Ce n'est pas une pipe dream/phase-3-minimal-gap-derivation-findings.md`

### Section structure (mandatory)

**Section 0 — Premise check (only if needed; otherwise omit)**

**Section 1 — Classification matrix (the single most important section)**

One row per `ImageDataSource` method (20 rows). Columns:

| # | DAL method | Bucket | Phase 2 ref | Phase 1 ref | One-line rationale |
|---|------------|--------|-------------|-------------|--------------------|

Bucket values: `A`, `B1`, `B2`, `C`, `D`, or combinations like `B1+C`
for legitimate straddles (e.g. "client refactor eliminates one shape leak
but still needs a small server extension for the rest"). Rationale must
be ≤ 1 line.

This table is the executive summary. A reader who reads only Section 1
gets the answer.

**Section 2 — Per-method detail (20 subsections)**

For each method, fixed template:

```
### `methodName` — bucket X

**Need (Phase 2 §N.N):** One sentence restating the abstract need.

**Current media-api capability:** What Phase 1 documents as relevant.
Cite specific Phase 1 sections (e.g. "Phase 1 §2 `GET /images` with
`orderBy=newest`, offset-based pagination"). If nothing matches, say so
explicitly: "Phase 1 documents no equivalent capability."

**Classification rationale:** 2–5 sentences. Why this bucket?

**If bucket B1 (shape-leak elimination):** Name the ES-shape leaks from
Phase 2 §4 that get eliminated. Be specific (e.g. "`sortOverride` removed
— adapter derives from `orderBy`; `extraFilter` removed — null-zone
handled server-side, requires bucket-C addition: `missingField` param on
`GET /images`"). Note: B1 work is valuable for the current direct-to-ES
client too — it removes raw ES DSL from the DAL boundary today, not just
as migration prep.

**If bucket B2 (consolidation / fusion):** Name the methods that fuse
and the abstract shared need. Cite the Phase 2 §5 entry (or, if Phase 2
missed it, note this explicitly and add it — see operational rule about
the additions cap). Estimate the surface reduction: how many DAL methods
become one? Note that fusion benefits the current direct-to-ES client by
reducing duplicated query construction in `es-adapter.ts`, not only the
future adapter.

**If bucket C (trivial extension):** State the smallest possible change
in capability terms (NOT design). E.g. "Add support for missing-field
sort to existing `GET /images` orderBy handling" — not "add `missingField=true`
query param." Phase 3 names the gap; later sessions design the fix.

**If bucket D (genuine new capability):** State what media-api lacks.
Reference any internal capability that gets close (Phase 1 §6 lists
"almost-exposed" features that may be relevant). Estimate size as
S/M/L based on whether it reuses existing query infrastructure (S),
needs new query construction (M), or needs new ES features /
infrastructure (L). One-line justification per estimate.

**Pagination/cursor implication:** If the need requires a pagination
model media-api lacks (Phase 1 shows offset-only — no search_after/PIT),
call it out explicitly. This is the single biggest known gap and
several methods will inherit it.
```

**Section 3 — The pagination model gap (special treatment)**

Phase 1 §2 shows media-api uses **offset-based pagination only** — no
`search_after`, no PIT. Phase 2 shows kupua's `searchAfter` is the
single most-used DAL method (22 call sites in `search-store`).

This is the largest single bucket-D item and warrants its own subsection:
- Restate the capability gap precisely
- List every DAL method affected (search, searchRange, searchAfter,
  countBefore, getIdRange, fetchPositionIndex, openPit, closePit at minimum)
- Note whether kupua's needs could plausibly be served by deep-offset
  pagination (probably not — Phase 2 mentions ~10k offset limits and
  >100k result sets) — but state your reasoning, not a recommendation
- Identify whether this is one gap or multiple (e.g. cursor pagination
  is one capability; PIT/snapshot consistency is arguably separate)
- DO NOT design the endpoint. State the capability gap and stop.

**Section 4a — Bucket-B1 catalogue (shape-leak elimination)**

Consolidated list of every ES-shape leak that gets eliminated, the DAL
method(s) it affects, and the simplified shape. Source: Phase 2 §4.
Each item should answer "is this fixable client-side alone, or does it
require a small bucket-C addition to land?" — some leaks (like
`sortOverride`) are pure client work; others (like `extraFilter` for
null-zone) need server cooperation.

**Section 4b — Bucket-B2 catalogue (consolidation / fusion)**

Consolidated list of fusion candidates. Each entry: methods that fuse,
abstract shared need, DAL surface reduction (N methods → 1), and whether
the fusion benefits the current direct-to-ES client independent of
migration. Source: Phase 2 §5 + up to 3 additions you justify.

**Section 4c — Bucket-C catalogue (trivial server extensions)**

Consolidated list of every bucket-C item across all methods. Format:

| # | Extension | Affects DAL methods | Maps to Phase 1 §6 (if internal capability exists) |
|---|-----------|---------------------|---------------------------------------------------|

This is the "low-hanging fruit" list — small server changes that unlock
multiple kupua needs.

**Section 5 — Bucket-D catalogue (the real server work)**

Consolidated list of bucket-D items, sized:

| # | New capability | Size (S/M/L) | DAL methods served | Phase 1 closest existing thing |
|---|----------------|--------------|--------------------|---------------------------------|

Sorted by size descending. Largest first.

**Section 6 — Reclassifications vs the original 15-gap feasibility plan**

The original plan in `media-api-gap-closure-feasibility.md` documents
~15 gaps (numbered 1–18 with skips). For each:
- If this audit classifies the underlying need as A or B → "REMOVED:
  not a real gap because [cite]"
- If still bucket C or D → "CONFIRMED: still needed; size estimate
  [S/M/L]"
- If absent from original plan but found in Phase 2 → "ADDED:
  [name], bucket [C/D]" (Phase 2 explicitly flagged `countWithTickers`
  and `getFilterAggregations` as missing from the original plan)

This is the diff that proves Phase 3 was worth doing.

**Section 7 — Cross-cutting observations**

≤ 10 numbered items. Things that don't fit per-method but matter:
- E.g. "Phase 1 §6.1 shows AI search ignores all filters in media-api;
  kupua's `searchByAi` need (Phase 2) does pass through `params` —
  fixing media-api §6.1 is implicitly required for bucket-A
  classification of `searchByAi`."
- E.g. "Several DAL methods accept a `field` param derivable from
  `params.orderBy`; if media-api endpoints accept `orderBy` and derive
  the field server-side, multiple ES-shape leaks vanish simultaneously."

Each item must have citations.

**Section 8 — Coverage gaps and uncertainties**

Things you couldn't classify confidently. Be explicit. For each:
- What's uncertain
- What would resolve the uncertainty (re-read Phase 1 §X? re-read kupua
  code? ask user?)
- Provisional bucket pending resolution

**Section 9 — Anti-goals appendix (≤30 items, one line each)**

Refactor opportunities, design observations, architecture musings,
performance concerns. Strict cap. Out-of-scope.

## File-tier prioritisation

Both findings docs are Tier 1 — read both end-to-end before starting
classification. The feasibility doc and findings-4 are Tier 2 — read on
demand when resolving specific questions.

If you find yourself reading actual `kupua/src/` or `media-api/app/`
source files: **STOP**. That means a findings doc has a gap — record it
in Section 8 and proceed with the provisional classification you can
make from the existing materials.

## Volume expectations (falsifiability)

- Section 1: exactly 20 rows
- Section 2: 20 subsections, 30–80 lines each
- Bucket distribution expectation (rough): A: 3–8, B1: 4–8, B2: 2–6,
  C: 2–6, D: 2–8 (counts can exceed 20 because methods may land in
  combinations like `B1+C` or `B2+D`)
- Section 3 (pagination): ~50–100 lines (it's the elephant)
- Section 4b (B2 catalogue): 3–8 fusion candidates total. If you spot
  zero beyond Phase 2 §5's three entries, recheck the aggregation
  cluster (`getAggregation`/`getAggregations`/`getFilterAggregations`/
  `countWithTickers`) explicitly — it's the most likely missed candidate.
- Section 5 (bucket-D catalogue): 2–8 items (if 0, premise check; if >10,
  premise check)
- Section 6 (reclassifications): each of the ~15 original gaps gets a
  one-line verdict
- Total document length: 1000–2000 lines

If wildly outside these bounds, write Section 0.

## What "done" looks like

Self-check before declaring complete:
- [ ] Section 1 has exactly 20 rows, each with a bucket assignment
- [ ] Every classification in Section 2 has both a Phase 1 and Phase 2 citation
- [ ] Section 3 explicitly addresses the pagination gap as one or more
      items, not handwaved
- [ ] Section 5 has size estimates (S/M/L) with justifications
- [ ] Section 6 covers every gap in the original 15-gap plan with a verdict
- [ ] No endpoint shapes / param names / response schemas designed
- [ ] No source code (kupua/ or media-api/) was read (or, if any was,
      Section 8 documents why the findings docs were insufficient)
- [ ] No commits, no test runs, no file modifications outside the
      findings doc

## Why this CAN be delivered as a single session

Because it is a **structured join over two finite enumerations**:
- 20 DAL methods (Phase 2 §2)
- 32 media-api routes + ~30 SearchParams fields + ~15 `is:` filters + ~5
  aggregations + 2 KNN methods (Phase 1)

The join is mechanical: for each of the 20 needs, look up the matching
capability. Most cells of the cross-product are obviously empty (e.g. the
photoshoot suggestion endpoint has nothing to do with `searchAfter`). The
real work is judging the few cells that genuinely overlap.

Critically: **no new research**. All facts are in the two findings docs.
Phase 3 is interpretation, not investigation.

## Operational rules to prevent drift

1. **Build Section 1 first** — the classification matrix. Force every
   row to a bucket within ~5 minutes of looking at the two findings docs.
   Resist the urge to expand into Section 2 detail before the matrix is
   complete. The matrix forces commitment.
2. **Then write Section 2 in matrix order** — never skip ahead to "the
   interesting one." Methodical pass prevents systematic bias.
3. **For each method, set a hard read budget:** find the Phase 2
   subsection (one section) and the Phase 1 routes/sections it cites
   (at most 2–3 short reads). If you need more, the findings docs have
   a gap → Section 8.
4. **When tempted to design an endpoint, stop and write "DESIGN
   DEFERRED" in that cell instead.** The Phase 3 deliverable's value
   comes from clean classification, not from speculative endpoint design.
5. **Re-read the "OUT of scope" list whenever you open a source file.**
   That's the drift signal.
6. **B2 additions are hard-capped at 3.** Phase 2 §5 already enumerated
   fusion candidates. You may add up to 3 more if you spot obvious
   overlaps Phase 2 missed (e.g. the aggregation cluster). For each
   addition, write one sentence justifying why it's an obvious fusion
   (similar inputs AND similar outputs AND serving similar abstract
   needs). Do NOT go hunting for fusion opportunities open-endedly — that
   is the 22k-LOC trap. If you find yourself wanting to add a 4th, stop
   and write a Section 8 entry instead ("possible B2 candidate not
   audited due to cap; needs follow-up").

## Out-of-band notes

- Model recommendation: Sonnet High. The work is synthesis + judgement
  under tight constraints, not bulk reading. High will resist the
  designing-endpoints temptation better than Medium.
- The push-back clauses are real. If you write Section 0, that is a
  successful outcome — the user wants to know when the premise breaks.
- Read-only. No code. No commits.
