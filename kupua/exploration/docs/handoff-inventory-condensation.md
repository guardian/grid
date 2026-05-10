# Handoff — Inventory Condensation

**Produced:** 10 May 2026
**For:** Sonnet High (Claude)
**Estimated session:** one focused session, ~2-4 hours
**Mode:** docs-only, no code changes
**Cwd discipline:** kupua-only, do not touch files outside `kupua/`

---

## Background

Three inventory docs landed (A from kupua docs, B from kahuna, C from
Grid backend) totalling 568 lines. They were research input for an
architectural decision that has now been made (see "Decision already
taken" below). Keeping all three as standalone docs is noise — they
overlap, contradict each other in places, and the answers they were
written to support are now committed to.

This handoff is to **condense the three inventories into one focused
addendum to `enrichment-strategy.md`**, then **delete the three raw
inventories**.

## Decision already taken (so you understand what to keep)

Background enrichment via `?ids=` is being dropped. Going forward:

- **TS-replicate from ES baseline** wherever feasible. Cost (already
  done), validity (already done), overquota (next — fetch
  `/usage/quotas` once on boot), `isPotentiallyGraphic` (next — port
  kahuna's keyword scan + widen `SOURCE_INCLUDES` for the XMP flag),
  persistence reasons (12 ES-derivable per Inventory C), `actions[]`
  permission gating (boot-time `GET /session` cache + state checks
  from ES, no per-image fetch).
- **API enrichment becomes a fallback** for genuine TS gaps that
  matter to user-visible behaviour, fired on user intent only (e.g.
  signed S3 URL on download click). NEVER a background loop, NEVER
  auto-fire on detail-open.
- **Out of scope for kupua right now:** every BBC-only feature
  (`enableWarningFlags` overlay, `showSendToPhotoSales`, photo-sales
  syndicate flow, `usePermissionsFilter`/`interimFilterOptions`,
  `usageInstructions`, custom org config injections,
  `recordDownloadAsUsage`, `useReaper`, `agencyPicksIngredients`,
  AI/vector search, more-like-this).
- **Out of scope, period:** upload paths, Witness, telemetry, photoshoot
  typeahead, metadata templates, feature switch panel, Pinboard.

What we DO want preserved from the inventories: a focused list of
what's TS-feasible and what genuinely requires the API, anchored to
file:line citations so a future agent knows where to look.

## Sources to read (in order)

1. `kupua/exploration/docs/inventory-A-from-docs.md` (231 lines, 108 rows)
2. `kupua/exploration/docs/inventory-B-from-kahuna.md` (171 lines, has
   §0 correction note explaining systematic earlier errors — read it)
3. `kupua/exploration/docs/inventory-C-from-backend.md` (166 lines, 54
   new rows; has Extends/Contradicts section that supersedes A and B
   in some places)
4. `kupua/exploration/docs/00 Architecture and philosophy/enrichment-strategy.md`
   — the doc you'll be appending to.
5. `kupua/exploration/docs/00 Architecture and philosophy/field-catalogue.md`
   — the existing canonical field list. Don't duplicate. If a row in
   A/B/C is already in field-catalogue.md, drop it from your output.

## What to produce

A single new section appended to `enrichment-strategy.md`, titled
**"§E Inventory takeaways (10 May 2026)"**, structured exactly as below.
No more than ~150 lines. Tight prose, no narrative, citations only when
they add value.

### §E.1 — Confirmed TS-feasible (close the gap, drop the API call)

A flat list of capabilities currently rendered (or pending render) via
`?ids=` enrichment that could be served from ES + TS compute, with
the data source path for the TS implementation.

Format (one row per capability):
```
- **Capability name** — TS path: `<es-field>` + <compute-rule>.
  API equivalent currently: <field on enrichment payload>.
  [citation: Inv-X §section]
```

Inclusion rules:
- MUST be currently fired by `useEnrichment` OR planned for Cluster 1
  cell/detail rendering.
- MUST have a complete ES + TS path (no missing data, no impossible
  compute). If "Hard" or "Impossible-without-server" in any inventory,
  EXCLUDE.
- MUST NOT be in `field-catalogue.md` already as Have-full.

Estimated count: 8-15 rows. If you produce 30, you're including
trivial fields. If you produce 3, you missed candidates — re-read.

### §E.2 — Genuine API-only gaps (keep adapter ready, fire on intent)

Capabilities that genuinely require the API for user-visible value.
Fire only on user action; document the trigger.

Format:
```
- **Capability** — Trigger: <user action>. Endpoint: <route>.
  Why API-only: <reason from inventory>. [citation]
```

Inclusion rules:
- TS-feasibility must be `Hard` (server-state-only, secret-required,
  cross-service-aggregate, write-fanout, audit-log) OR `Impossible-
  without-server`.
- Capability must matter to a feature kupua intends to ship (don't
  list every endpoint that exists on Grid).
- Acceptable triggers: "user clicks download", "user opens
  selection-mode action menu", "user clicks delete confirm", etc.
  No background timers, no on-mount auto-fires.

Estimated count: 5-10 rows.

### §E.3 — Out of scope for the Guardian deployment

Bullet list, ≤20 items, of capabilities the inventories surfaced that
are dead in Guardian PROD/TEST per `clientConfig`. One line each, with
the gating flag named.

Format: `- <capability> — gated off by \`<flag>\`. [citation]`

This section exists so a future agent doesn't accidentally re-discover
these and waste time evaluating them. They are not on the kupua roadmap.

### §E.4 — Inventory contradictions resolved

A short list of places where A, B, and C disagreed, with the
resolution. Format:

```
- <topic> — A claimed X, C contradicts: Y. Authoritative: <which one>. [citation]
```

Estimated count: 5-8 rows. Examples already known:
- Inventory A had 4+ rows wrongly marked "Don't-have" when kupua's
  direct-ES DAL handles them (B §0 correction note explains why this
  systematic error happened).
- Inventory A claimed persistence reasons need "S3 bucket checks";
  Inventory C reads the actual Scala and finds 12 ES-derivable rules.
- Inventory A classified `isPotentiallyGraphic` as `Both`; Inventory C
  shows it's a runtime ES script field, never stored.
- Inventory A says metadata-search/label-search live on a satellite
  service; Inventory C shows they're on media-api routes.

### §E.5 — Backlog items extracted

A short list of features the inventories surfaced as worth doing
later, with priority hint. Format:

```
- <feature> — value: <one line>. Effort: trivial/moderate/hard.
```

Examples to consider:
- Image seen/seenSince tracking (kahuna localStorage feature).
- Scroll-position service (kahuna in-memory).
- "New images" polling banner.
- Print/digital usages icons on cells (TS, free from search-hit data).
- Staff-photographer thumbnail border.
- Archiver status icon.
- CQL deep-path support (e.g.
  `has:"fileMetadata.xmp.pur:adultContentWarning"`).
- `is:under-quota` predicate (now feasible once quota table is
  fetched on boot).

≤15 items.

## What to delete after §E lands

- `kupua/exploration/docs/inventory-A-from-docs.md`
- `kupua/exploration/docs/inventory-B-from-kahuna.md`
- `kupua/exploration/docs/inventory-C-from-backend.md`
- `kupua/exploration/docs/inventory-handoff-A-docs.md`
- `kupua/exploration/docs/inventory-handoff-B-kahuna.md`
- `kupua/exploration/docs/inventory-handoff-C-backend.md`

Do this AFTER you've written §E and verified all citations point at
preserved docs (the inventories will be gone — citations should
reference `field-catalogue.md`, `grid-api-contract-audit-findings.md`,
or kahuna/Grid source files directly).

## What to update afterwards

- `kupua/AGENTS.md` — Component Summary row for `enrichment-strategy.md`
  if applicable; backlog and known-issues if your §E.5 surfaces new items.
- `kupua/exploration/docs/changelog.md` — append a small "Inventory
  condensed and superseded" entry under current phase heading.

## Push-back clause

If you read the inventories and conclude that the structure I've
proposed for §E is wrong (e.g. a different cut would serve better),
write Section 0 explaining why and STOP. Don't proceed to write the
condensation against a structure you don't agree with.

If you find that §E grows past ~200 lines no matter how you cut it,
that's a signal the condensation isn't actually possible — the three
inventories are doing real work. STOP and report.

## What done looks like

- `enrichment-strategy.md` has a new §E section, ≤150 lines.
- All five sub-sections present and populated within their estimated
  row counts.
- Three raw inventories + three handoffs deleted.
- AGENTS.md updated.
- Changelog entry appended.
- A vitest run + e2e are NOT required for this docs-only work. Skip
  the test mandate.
- Do NOT commit. Leave changes in working tree for user review.

## Anti-goals

- No new architectural recommendations beyond what's in this handoff.
  The decision is made.
- No grand restructure of `enrichment-strategy.md`. Append-only.
- No editorial-value column.
- No "we should also build X" suggestions inside §E.1-§E.4. That's
  what §E.5 is for.
- No copying the full row-by-row tables from the inventories. The
  point is to compress.
