# Inventory handoff A — mine existing docs

**Status:** transient. Delete after work lands.
**Mode:** research. Sonnet High preferred (synthesis quality matters).
**Session goal:** produce inventory rows from EXISTING kupua docs only. Do NOT read Grid source code; that's session B/C. Do NOT add editorial-value judgements.

## Why

Kupua is reconsidering the role of the Grid API. Today every interaction triggers `?ids=` enrichment with HTTP/1.1 starvation acrobatics. The user is questioning whether enrichment is needed at all, given that ~95% of "cost" already comes from ES baseline + the TS port of `calculateCost`. To reason about this, we need a complete inventory of: what Grid offers, where it lives (ES vs API), where kupua already has it, and how feasible TS-replication would be for the API-only items.

This session covers what already-written kupua docs claim. Sessions B and C add primary-source passes (kahuna code, backend code) to catch what the docs miss.

## Sources to mine (read these fully)

1. `kupua/exploration/docs/00 Architecture and philosophy/field-catalogue.md` — every table.
2. `kupua/exploration/docs/01 Research/grid-api-contract-audit-findings.md` — especially §6.7 "Server-computed fields", but read the whole thing for envelopes / endpoints.
3. `kupua/exploration/docs/01 Research/00-kahuna-service-communication-audit.md` — every endpoint kahuna calls.
4. `kupua/exploration/docs/01 Research/kahuna-search-results-cost-signals.md` — UI-side capabilities.
5. `kupua/exploration/docs/03 Ce n'est pas une pipe dream/integration-plan.md` — naive direct-to-ES plan, for context.
6. `kupua/exploration/docs/03 Ce n'est pas une pipe dream/integration-plan-api-first.md` — API-first plan, for context.
7. `kupua/exploration/docs/03 Ce n'est pas une pipe dream/integration-workplan-bread-and-butter.md` — current realistic plan (Cluster 1 already shipped).
8. `kupua/exploration/docs/00 Architecture and philosophy/enrichment-strategy.md` — current enrichment rationale.

Skim only:
- `kupua/exploration/docs/changelog.md` — for what's been built.
- `kupua/AGENTS.md` — context.

## Output

ONE markdown file: `kupua/exploration/docs/inventory-A-from-docs.md`.

Single table. Columns:

| Capability | Source(s) | Lives in | Kupua status | TS-feasibility if API-only | Server-only reason | Citation |
|---|---|---|---|---|---|---|

Column definitions:
- **Capability**: short name (e.g. "cost calculation", "syndication status filter", "lease summary", "delete image", "GraphQL search"). Be granular — one row per distinct thing.
- **Source(s)**: which doc named this. Multiple if cross-referenced.
- **Lives in**: `ES-only` / `API-only` / `Both` / `Other-service` (e.g. cropper, leases, metadata-editor, collections, usage). `Unknown` is a valid value if the docs don't say — flag in citation column.
- **Kupua status**: `Have-full` / `Have-partial` / `Don't-have` / `N/A-write-only` (writes are out of scope until separately decided). Anchor "have" claims to specific kupua source files when the docs name them.
- **TS-feasibility if API-only**: `Trivial` (pure compute, ≤50 LOC) / `Moderate` (50-300 LOC, requires data we have) / `Hard` (requires data we don't have or non-trivial integration) / `Impossible-without-server` (auth, write, multi-service-fanout, secrets, audit-log). Use `N/A` for ES-only and write-only items.
- **Server-only reason**: empty unless `Hard` / `Impossible-without-server`. Categorise: `auth-gated`, `write-fanout`, `cross-service-aggregate`, `secret-required`, `server-state-only`, `compute-needs-data-we-dont-have`, `audit-log`.
- **Citation**: `field-catalogue.md L123` or `contract-audit §6.7.2` etc. EVERY claim needs a cite. Unsourced rows forbidden.

Sort by `Lives in` then `Capability`.

## Rules

- **No editorial-value column.** "Importance" is the user's decision, not yours. Inventory only.
- **No recommendations.** No "should we drop X" sections. Inventory only.
- **No hallucination.** If a doc doesn't say where something lives, write `Unknown` and flag it for sessions B/C to resolve.
- **Granularity preference**: more rows over fewer. Splitting "lease list" from "lease active count" is fine. Lumping "all metadata fields" into one row is not.
- **Out-of-scope appendix (capped at 20 items, one line each)**: anything you find that's interesting but doesn't fit the table — internal Grid quirks, doc inconsistencies, deviations from the original plan, things future readers should know.

## Done criteria

- All 8 sources read (don't skim §6.7).
- Table has 50+ rows. Less = under-granular.
- Every row has a citation. No unsourced claims.
- Out-of-scope appendix present, ≤20 items.
- No commits, no recommendations, no editorial judgement.

## Push-back clauses

- If the user-implied premise is wrong (e.g. you discover the docs DO contain a complete inventory already and this work is redundant): write Section 0 saying so, stop, do not produce a redundant table.
- If a source doc contradicts another: log the contradiction in the appendix with both citations. Do not pick a winner.
