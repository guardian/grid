<\!-- AGENT PROTOCOL
STOP\! If you do NOT see your own "🤖 Agent check-in" entry at the bottom of the
Session Log that YOU wrote in THIS conversation, you are a NEW agent.
Follow the Fresh Agent Protocol in copilot-instructions.md:
  1. Say "Hi, I'm a fresh agent."
  2. Read this file fully.
  3. State what context you have.
  4. Ask: "What should I read before starting?"
  5. Do NOT write or modify any code until the user confirms.
If you DO see your own check-in in your conversation history, carry on.
-->

# Current Task

Usages panel — full implementation across all steps from usages-findings.md.

## Session Log

2026-06-08 — Implemented Usages panel (Steps A–G from usages-findings.md).

**Type fixes (Step A):**
- `dal/grid-api/types.ts`: fixed UsageType (removed "child", added "derivative"/"replaced"), fixed UsageStatus (removed "cancelled", added syndicated/downloaded/derivative/replaced/failed/unknown), added typed metadata sub-interfaces (DigitalUsageMetadata, PrintUsageMetadata, SyndicationUsageMetadata, FrontUsageMetadata, DownloadUsageMetadata, ChildUsageMetadata), added title? to Usage.
- `types/image.ts`: added missing metadata sub-types (syndicationUsageMetadata, frontUsageMetadata, downloadUsageMetadata, childUsageMetadata) + remaining printUsageMetadata fields.
- `lib/derive-enriched-image.ts`: removed `as Image["usages"]` cast (types now compatible).

**SVG assets (Step B):** Inlined in UsagesSection.tsx — no new asset files.

**UsagesSection component (Step C):** Created `src/components/UsagesSection.tsx`:
- `UsagesSection` — single-image display, groups by status order, per-row platform icon + title + relative date + reference links (Guardian globe / Composer C).
- `countDisplayUsages` — exported helper for accordion title counts.
- `MultiUsagesSummary` — multi-image aggregate stats (digital/print counts + recent counts, syndicated, downloads, no-usages). Reads from selection-store + search-store directly (same pattern as MultiImageMetadata cost section).

**Wiring (Step D):**
- `ImageDetail.tsx`: replaced plain `<aside p-3>` with accordion structure (Details + Usages sections). Details section wraps ImageMetadata in `<div p-3>`, Usages section renders UsagesSection directly.
- `search.tsx`: added second AccordionSection ("Usages") to rightPanel, added `FocusedUsages` function (mirrors FocusedImageMetadata image-resolution logic; multi-select → MultiUsagesSummary, single/focused → UsagesSection, no focus → empty state).

**CQL fix (Step E):**
- `cql.ts`: added `buildNestedUsagesQuery` (platform/status/reference/section/publication/orderedBy/<added/>added), added `usages@` handler in `fieldToClause`, added `mergeUsagesNestedClauses` for Kahuna-matching group-and-combine (same-record AND semantics), called in `parseCql`.
- `es-adapter.ts`: added default negation for `usages@status:replaced` (mirrors Kahuna Parser.scala thingsToHideByDefault).

**Multi-select (Step F):** Implemented in `MultiUsagesSummary` in UsagesSection.tsx (not MultiImageMetadata.tsx — kept as separate accordion content).

**Sort by usage recency (Step G):**
- `sort-builders.ts`: added `usagesDateAdded` special-case → nested sort on `usages.dateAdded` with mode:max, missing:_last. Added `usages.dateAdded` to DATE_SORT_FIELDS.
- `field-registry.tsx`: added "Last used" entry to SORT_DROPDOWN_OPTIONS and DESC_BY_DEFAULT.

**Tests:** Added 9 new tests in `cql.test.ts` covering all usages@ sub-fields + AND-combination + negation. 880/880 passing. Zero TS errors.

