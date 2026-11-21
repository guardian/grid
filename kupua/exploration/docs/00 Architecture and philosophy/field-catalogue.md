# Field Catalogue

> **Authoritative per-field reference for Kupua.** Lists every field Kahuna
> exposes (in single-image view, table, info panel, multi-select panel,
> filters) and Kupua's status against each. Used as:
>
> - The checklist for the field-parity session that brings Kupua to Kahuna
>   feature parity (every Kahuna-displayed field must eventually exist in
>   Kupua — Kahuna fields are not getting added often, so this catalogue
>   doesn't drift in practice).
> - The selection feature's per-field reconciliation table (S4 in
>   `selections-workplan.md`).
> - The reference for future editing work (Phase 3+) — the table will gain
>   editing columns then.

> **Status (2026-05-02):** Exhaustive rewrite complete. 46 rows covering all
> Kahuna display contexts. Scope: display only — editing columns are a separate
> session.

- Last full rewrite: Claude Sonnet 4.6 (Sonnet High), 2026-05-02
- Fields catalogued: 46 total
- Kupua `implemented`: 37 rows (incl. location child rows)
- Kupua `missing`: 9 rows (labels, photoshoot, lease_summary, cost_state, syndication_rights, domain_metadata, identifiers ×2, usageInstructions)
- Resolved decisions (2026-05-02): see §"Resolved decisions"

> **Note on alias fields:** Alias fields are config-driven (from `grid-config.ts`).
> The 7 classified here are those with `displayInAdditionalMetadata: true` in the
> default config. If the Grid instance has a different `fieldAliases` config, additional
> alias fields will need to be classified before Phase S4.
>
> **Alias field policy (decided 2026-05-01):** All alias fields are uniformly
> `reconcile` / `showWhenEmpty: false`, hardcoded in the `ALIAS_FIELDS` builder in
> `field-registry.ts`. No new properties are needed on `FieldAlias` in `grid-config.ts`
> for now. In a later phase, `FieldAlias` could gain optional `multiSelectBehaviour` and
> `showWhenEmpty` properties so Grid operators can tune per-field behaviour via config
> without a code change — but that complexity is not justified until there is a concrete
> need for a non-default alias.
> Kahuna suppresses alias fields entirely in multi-select (Info panel only shows them
> for single images). Kupua intentionally improves on this — showing reconciled alias
> values is low-cost and more useful.
> This is an intentional deviation; documented in `deviations.md` §28.

## Schema

13 columns per row. Column semantics:

| Column | Values | Purpose |
|---|---|---|
| **Field id** | code-style identifier (e.g. `metadata_byline`, `usageRights_category`, `lease_summary`) | Stable key. Matches `field-registry.ts` where implemented. Invented for Kahuna-only fields using the dotted ES path or component name. |
| **Label** | human label (e.g. "Byline") | UI label as shown in Kahuna; Kupua differences noted in Notes. |
| **Category** | `editorial` / `rights` / `technical` / `location` / `chip` / `lease` / `workflow` / `identifier` / `summary` | Coarse grouping for the summary tables. |
| **ES presence** | `yes` / `partial` / `no` / `derived` | Does the field exist in Elasticsearch as Kupua queries it? `derived` = computed server-side outside ES (e.g. `cost`). |
| **ES path** | dotted path (e.g. `metadata.byline`) or `n/a` | The ES source path. |
| **Kahuna context(s)** | comma-list: `single-panel`, `multi-panel`, `info-panel`, `table`, `filter` | Where Kahuna renders it. |
| **Kahuna multi-select behaviour** | `reconcile-scalar` / `reconcile-chip-array` / `summary-only` / `show-if-all-same` / `always-suppress` / `not-applicable` / `composite-segments` | What Kahuna does in multi-select. |
| **Kupua status** | `implemented` / `partial` / `missing` / `intentionally-omitted` | Kupua's display status. `intentionally-omitted` = decided not to implement (rare; rationale in Notes). |
| **Kupua contexts** | comma-list, same vocabulary as Kahuna contexts, or `none` | Where Kupua renders it today. |
| **Parity status** | `matches` / `kupua-improves` / `kupua-omits` / `pending-implementation` / `divergent-by-design` | Summary verdict. |
| **multiSelectBehaviour** | `reconcile` / `chip-array` / `always-suppress` / `show-if-all-same` / `summary-only` | The S4 classification, per arch §8. |
| **showWhenEmpty** | `true` / `false` / `n/a` | Important-empty signal for editor flagging (Phase 3+ relevance). |
| **Notes / rationale** | prose, ≤2 sentences | Citations to findings docs (`[findings.md §N]` or `[pills.md §N]`); `[GAP: ...]` flags incomplete parity. |

`[Confidence: H/M/L]` markers appear on rows where a judgement call was required. Low-confidence rows are also surfaced in the §"Needs User Decision" section.

### Row construction rules

- **One row per field.** Composite fields (location) get a single parent row plus indented child-segment rows when Kahuna treats segments independently in reconciliation.
- **Lease records** get one summary row (`lease_summary`, `summary-only`) plus separate rows for any individual lease-derived properties Kahuna exposes outside the per-lease list (e.g. `cost_state` derived from leases + rights).
- **Chip-array fields** (keywords, people, labels, subjects) each get one row, `reconcile-chip-array`.
- **Cost pills** are summarised under `cost_state` (Category: `summary`, ES presence: `derived`). The five states (free / no_rights / pay / overquota / conditional) are documented in Notes rather than as separate rows.

### Categorisation method

1. Walk `gr-image-metadata.html` end-to-end — every `<dt>`/`<dd>` pair, every `<gr-*>` component, every `ng-if`-gated section is a candidate row.
2. Walk `gr-info-panel.html` for cost summary fields.
3. Cross-reference the two findings docs (Appendix A) to fill behaviour columns; cite specific sections.
4. Mark fields not yet in Kupua as `Kupua status: missing` / `Parity status: pending-implementation` (don't propose how to implement — that's a separate session).
5. Mark fields in Kupua but not in Kahuna as `Parity status: kupua-improves` (the seven alias fields and a few promoted-from-Additional-Metadata rows).
6. Mark fields where Kupua and Kahuna do the same thing as `Parity status: matches`.

### Editing — out of scope

This catalogue documents **display** only. Editing behaviour will gain its own columns when editing work begins (Phase 3+). Some Kahuna editing detail is unavoidable when describing fields (e.g. Subjects' `is-editable="false"` attribute), but Kupua-side editing classification is intentionally absent.

## Catalogue

Sorted by category then field id. Composite fields have a parent row followed by
indented child-segment rows.

---

### Chip fields

| Field id | Label | Category | ES presence | ES path | Kahuna context(s) | Kahuna multi-select behaviour | Kupua status | Kupua contexts | Parity status | multiSelectBehaviour | showWhenEmpty | Notes / rationale |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| keywords | Keywords | chip | yes | metadata.keywords | single-panel, multi-panel | reconcile-chip-array | implemented | single-panel, table, filter | matches | chip-array | false | Editable in Kahuna multi-select; union of chips with partial/full visual (dark vs white pill). [findings.md §2.6, pills.md §2] Kupua shows as list field; multi-panel context pending S4. |
| labels | Labels | chip | yes | userMetadata.labels | single-panel, multi-panel | reconcile-chip-array | missing | none | pending-implementation | chip-array | false | Always shown in Kahuna (no `singleImage` guard); editable chip array. [pills.md §5] ES field is `userMetadata.labels` — separate namespace from `metadata.*`; requires distinct accessor. |
| people | People | chip | yes | metadata.peopleInImage | single-panel, multi-panel | reconcile-chip-array | implemented | single-panel, table | matches | chip-array | false | Editable in Kahuna multi-select; same `element--partial` CSS mechanism as keywords. [pills.md §4] Kupua shows as list field; multi-panel context pending S4. |
| subjects | Subjects | chip | yes | metadata.subjects | single-panel, multi-panel | reconcile-chip-array | implemented | single-panel, table, filter | matches | chip-array | false | Read-only in Kahuna multi-select (`is-editable="false"`). [pills.md §3] Kupua shows as list field. Kahuna subjects editing is blocked in multi-select; Kupua first-class editing would be a deviation. |

---

### Editorial fields

| Field id | Label | Category | ES presence | ES path | Kahuna context(s) | Kahuna multi-select behaviour | Kupua status | Kupua contexts | Parity status | multiSelectBehaviour | showWhenEmpty | Notes / rationale |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| metadata_byline | By | editorial | yes | metadata.byline | single-panel, multi-panel | reconcile-scalar | implemented | single-panel, table | matches | reconcile | true | Shown in Kahuna when non-empty or `userCanEdit`; hidden from non-editors when empty. [findings.md §2.8] |
| metadata_bylineTitle | Byline title | editorial | yes | metadata.bylineTitle | single-panel | reconcile-scalar | implemented | single-panel, table | kupua-improves | reconcile | false | Kahuna shows only in the collapsible Additional Metadata section (single-image; not in `ignoredMetadata` so falls through to `ng-repeat`). Kupua promotes to main panel. |
| metadata_copyright | Copyright | editorial | yes | metadata.copyright | single-panel, multi-panel | reconcile-scalar | implemented | single-panel, table | matches | reconcile | false | Shown when non-empty or `userCanEdit`; hidden from non-editors when empty. [findings.md §2.8] |
| metadata_credit | Credit | editorial | yes | metadata.credit | single-panel, multi-panel, filter | reconcile-scalar | implemented | single-panel, table, filter | matches | reconcile | true | Always shown in Kahuna (no outer `ng-if` guard). [findings.md §2.8 "important empty fields"] |
| metadata_dateTaken | Taken on | editorial | yes | metadata.dateTaken | single-panel, multi-panel | reconcile-scalar | implemented | single-panel, table | matches | reconcile | true | Always shown in Kahuna (no outer `ng-if`). [findings.md §2.8 "important empty fields"] |
| metadata_description | Description | editorial | yes | metadata.description | single-panel, multi-panel | reconcile-scalar | implemented | single-panel, table | matches | reconcile | true | Always shown in Kahuna (no outer `ng-if`). Unique: "Add before / Add after" radio in multi-select edit. [pills.md §12] |
| metadata_source | Source | editorial | yes | metadata.source | single-panel | reconcile-scalar | implemented | single-panel, table, filter | kupua-improves | reconcile | false | Kahuna shows only in collapsible Additional Metadata section (not in `ignoredMetadata`, so falls through to `ng-repeat`). Kupua promotes to main panel. |
| metadata_specialInstructions | Special instructions | editorial | yes | metadata.specialInstructions | single-panel, multi-panel | reconcile-scalar | implemented | single-panel, table | matches | reconcile | true | Always shown in Kahuna. Also: Kahuna shows legacy `usageInstructions` alias above this field when present. [findings.md §2.8] |
| metadata_suppliersReference | Suppliers reference | editorial | yes | metadata.suppliersReference | single-panel | reconcile-scalar | implemented | single-panel, table | kupua-improves | always-suppress | n/a | Kahuna shows only in collapsible Additional Metadata section. Kupua promotes to main panel for single-image. **Multi-select: `always-suppress`** (decided 2026-05-02) — supplier reference is an ID; coincidental matches across a selection are supplier error, not signal. |
| metadata_title | Title | editorial | yes | metadata.title | single-panel, multi-panel | reconcile-scalar | implemented | single-panel, table | matches | reconcile | true | Always shown in Kahuna (no outer `ng-if`). [findings.md §2.8 "important empty fields"] |
| photoshoot | Photoshoot | editorial | partial | metadata.photoshoot (+ photoshoot service) | single-panel, multi-panel | reconcile-scalar | missing | none | pending-implementation | reconcile | false | Always shown in Kahuna (no `singleImage` guard); reconciles to single title or "Multiple photoshoots". [pills.md §13] Requires a photoshoot API service (typeahead, batchAdd/batchRemove) — not a plain ES field. |
| usageInstructions | Usage instructions | editorial | yes | metadata.usageInstructions | single-panel | always-suppress | missing | none | pending-implementation | always-suppress | n/a | BBC-specific: a config-driven read-only note attached to certain `usageRights` entries. Deferred to a future Kupua↔BBC parity session; not S4 scope. |

---

### Identifier fields

| Field id | Label | Category | ES presence | ES path | Kahuna context(s) | Kahuna multi-select behaviour | Kupua status | Kupua contexts | Parity status | multiSelectBehaviour | showWhenEmpty | Notes / rationale |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| identifiers_derivative | Derivative of Media IDs | identifier | yes | identifiers.derivative-of-media-ids | single-panel | always-suppress | missing | none | pending-implementation | always-suppress | n/a | [Confidence: M] Shown in Kahuna's Additional Metadata → Identifiers sub-section (single-image only). Links to source images via special `ui-sref` rendering. |
| identifiers_replaces | Replaces Media ID | identifier | yes | identifiers.replaces-media-id | single-panel | always-suppress | missing | none | pending-implementation | always-suppress | n/a | [Confidence: M] Shown in Kahuna's Additional Metadata → Identifiers sub-section (single-image only). Link to the image this one replaced. |
| imageId | Image ID | identifier | yes | id | single-panel | always-suppress | implemented | single-panel, table | kupua-improves | always-suppress | n/a | Kahuna does not display the image ID in `gr-image-metadata`. Kupua shows it in panel and table for click-to-copy convenience. |
| uploadInfo_filename | Filename | identifier | yes | uploadInfo.filename | single-panel, multi-panel | show-if-all-same | implemented | single-panel, table | divergent-by-design | always-suppress | n/a | Kahuna: shown when `!hasMultipleValues(filename) && filename` — effectively show-if-all-same. [findings.md §2.10] **Kupua: `always-suppress`** (decided 2026-05-02) — filenames are de-facto unique per image; coincidental matches are not useful signal. |

---

### Lease fields

| Field id | Label | Category | ES presence | ES path | Kahuna context(s) | Kahuna multi-select behaviour | Kupua status | Kupua contexts | Parity status | multiSelectBehaviour | showWhenEmpty | Notes / rationale |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| lease_summary | Leases | lease | derived | (leases API — separate per-image endpoint) | single-panel, multi-panel | summary-only | missing | none | pending-implementation | summary-only | n/a | Always shown in Kahuna (no `singleImage` guard). Multi-select: count summary only ("N current + N inactive"). [pills.md §8] Not in ES; fetched via separate leases API. Add-lease works in multi-select; delete/edit limited to single-image. |

---

### Location fields

| Field id | Label | Category | ES presence | ES path | Kahuna context(s) | Kahuna multi-select behaviour | Kupua status | Kupua contexts | Parity status | multiSelectBehaviour | showWhenEmpty | Notes / rationale |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| location | Location | location | yes | metadata.{subLocation,city,state,country} | single-panel, multi-panel | composite-segments | implemented | single-panel, table | matches | reconcile | false | Composite of 4 segments each independently reconciled. Shown when any segment has data or `userCanEdit`. [pills.md §7 D1–D4] |
| ↳ location.subLocation | Sublocation | location | yes | metadata.subLocation | single-panel, multi-panel | reconcile-scalar | implemented | single-panel | matches | reconcile | false | CQL key: "location". Each segment independently reconciled (all-same shown as link, mixed shown as "(Multiple sublocations)"). [pills.md §7 D2] |
| ↳ location.city | City | location | yes | metadata.city | single-panel, multi-panel | reconcile-scalar | implemented | single-panel | matches | reconcile | false | CQL key: "city". [pills.md §7 D2] |
| ↳ location.state | State | location | yes | metadata.state | single-panel, multi-panel | reconcile-scalar | implemented | single-panel | matches | reconcile | false | CQL key: "state". [pills.md §7 D2] |
| ↳ location.country | Country | location | yes | metadata.country | single-panel, multi-panel | reconcile-scalar | implemented | single-panel | matches | reconcile | false | CQL key: "country". [pills.md §7 D2] |

---

### Rights fields

| Field id | Label | Category | ES presence | ES path | Kahuna context(s) | Kahuna multi-select behaviour | Kupua status | Kupua contexts | Parity status | multiSelectBehaviour | showWhenEmpty | Notes / rationale |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| syndication_rights | Syndication Rights (from RCS) | rights | no | n/a (external RCS service) | single-panel | always-suppress | missing | none | pending-implementation | always-suppress | n/a | Single-image only (`ng-if="ctrl.singleImage"`). [pills.md Appendix A.2] Fetched from Guardian's RCS external service — not in ES. No multi-select display in Kahuna. |
| usageRights_category | Rights & Restrictions | rights | yes | usageRights.category | single-panel, multi-panel, filter | reconcile-scalar | implemented | single-panel, table, filter | matches | reconcile | false | Two Kahuna display paths: plain text or BBC-style `usage-rights-summary` React component (config-driven). [pills.md §11] Multi-select: category name or "multiple categories" string. |

---

### Summary fields

| Field id | Label | Category | ES presence | ES path | Kahuna context(s) | Kahuna multi-select behaviour | Kupua status | Kupua contexts | Parity status | multiSelectBehaviour | showWhenEmpty | Notes / rationale |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| cost_state | Cost state pills | summary | derived | usageRights.category + leases | info-panel | summary-only | missing | none | pending-implementation | summary-only | n/a | Five states: free, no_rights, pay, overquota, conditional. [pills.md §11] Pay/overquota/conditional pills show a lease-colouring gradient (% with active `allow-use` lease). Rendered in `gr-info-panel`, above `gr-image-metadata`. |

---

### Technical fields

| Field id | Label | Category | ES presence | ES path | Kahuna context(s) | Kahuna multi-select behaviour | Kupua status | Kupua contexts | Parity status | multiSelectBehaviour | showWhenEmpty | Notes / rationale |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| dimensions | Dimensions | technical | yes | source.orientedDimensions ∥ source.dimensions | single-panel | reconcile-scalar | implemented | single-panel, table | matches | always-suppress | n/a | Composite W×H. Kupua reads `orientedDimensions` (post-EXIF rotation) and falls back to `dimensions` — see `widthFromImage`/`heightFromImage` in `field-registry.ts`. Multi-select: suppressed; if `show-if-all-same` is ever wanted, measure the cost of grouping floats first. |
| source_height | Height | technical | yes | source.orientedDimensions.height ∥ source.dimensions.height | single-panel | always-suppress | implemented | table | matches | always-suppress | n/a | `heightFromImage` reads `orientedDimensions` first, falls back to `dimensions`. Table column only (`detailHidden: true`); redundant with Dimensions in panel. |
| source_mimeType | File type | technical | yes | source.mimeType | single-panel, multi-panel | show-if-all-same | implemented | single-panel, table, filter | matches | show-if-all-same | false | `image/` prefix stripped for display by `formatMimeType` in `field-registry.ts`. Useful for confirming a batch is uniform (e.g. all JPEG). [findings.md §2.10] |
| source_size | File size | technical | yes | source.size | single-panel | always-suppress | implemented | single-panel, table | matches | always-suppress | n/a | Kahuna shows in single-image detail; Kupua matches (panel + `defaultHidden` table column). Multi-select suppressed: byte-for-byte matches across a curated selection are vanishingly rare. |
| source_width | Width | technical | yes | source.orientedDimensions.width ∥ source.dimensions.width | single-panel | always-suppress | implemented | table | matches | always-suppress | n/a | `widthFromImage` reads `orientedDimensions` first, falls back to `dimensions`. Table column only (`detailHidden: true`); redundant with Dimensions in panel. |

---

### Workflow fields

| Field id | Label | Category | ES presence | ES path | Kahuna context(s) | Kahuna multi-select behaviour | Kupua status | Kupua contexts | Parity status | multiSelectBehaviour | showWhenEmpty | Notes / rationale |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| domain_metadata | Domain metadata | workflow | yes | metadata.domainMetadata | single-panel | always-suppress | missing | none | pending-implementation | always-suppress | n/a | BBC-specific: config-driven arbitrary per-field structure (string, datetime, integer, select). [findings.md §2 "gated singleImage"] Single-image only; Kahuna renders as a collapsible labelled section per spec entry. Deferred to a future Kupua↔BBC parity session; when implemented, gate on the same config-presence pattern as `metadata_imageType`. |
| lastModified | Last modified | workflow | yes | lastModified | single-panel | always-suppress | implemented | single-panel, table | kupua-improves | always-suppress | n/a | Not found as an explicit field in `gr-image-metadata.html`. Kupua shows in panel (defaultHidden in table). |
| metadata_imageType | Image type | workflow | yes | metadata.imageType | single-panel, multi-panel, filter | reconcile-scalar | implemented | single-panel, table, filter | matches | reconcile | false | Config-driven: Kahuna gates display on `window._clientConfig.imageTypes` being non-empty. [pills.md §10] **S4 must add the equivalent guard** (decided 2026-05-02) — only render when `gridConfig.imageTypes?.length > 0`. Same guard pattern applies to `domain_metadata`. |
| uploadTime | Uploaded | workflow | yes | uploadTime | single-panel | always-suppress | implemented | single-panel, table | matches | always-suppress | n/a | Kahuna: single-image only (`ng-if="ctrl.singleImage"`). [findings.md §2.10] Kupua matches: not shown in multi-select. |
| uploadedBy | Uploader | workflow | yes | uploadedBy | single-panel, multi-panel | show-if-all-same | implemented | single-panel, table, filter | matches | show-if-all-same | false | Kahuna: shown when `!hasMultipleValues(uploadedBy)` — effectively show-if-all-same. [findings.md §2.10] |

---

### Alias fields

Config-driven from `grid-config.ts` `fieldAliases`. Kahuna shows these in the
collapsible Additional Metadata section (single-image only). Kupua intentionally
promotes them to the main panel, reconciled in multi-select — an improvement.
See Appendix B for the alias policy decision. All alias fields are
`reconcile` / `showWhenEmpty: false` regardless of Kahuna behaviour.

| Field id | Label | Category | ES presence | ES path | Kahuna context(s) | Kahuna multi-select behaviour | Kupua status | Kupua contexts | Parity status | multiSelectBehaviour | showWhenEmpty | Notes / rationale |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| alias_bitsPerSample | Bits Per Sample | technical | yes | fileMetadata.colourModelInformation.bitsPerSample | single-panel | always-suppress | implemented | single-panel, table | kupua-improves | reconcile | false | Kahuna suppresses all alias fields in multi-select (single-image Additional Metadata only). Kupua uniformly reconciles per alias field policy. |
| alias_colourModel | Colour Model | technical | yes | fileMetadata.colourModel | single-panel | always-suppress | implemented | single-panel, table | kupua-improves | reconcile | false | ICC colour model (RGB/CMYK/Greyscale/LAB). Same alias policy. |
| alias_colourProfile | Colour Profile | technical | yes | fileMetadata.icc.Profile Description | single-panel | always-suppress | implemented | single-panel, table | kupua-improves | reconcile | false | ICC profile description string. Same alias policy. |
| alias_cutout | Cutout | technical | yes | fileMetadata.colourModelInformation.hasAlpha | single-panel | always-suppress | implemented | single-panel, table | kupua-improves | reconcile | false | Boolean: has alpha channel. Same alias policy. |
| alias_digitalSourceType | Digital Source Type | workflow | yes | fileMetadata.xmp.Iptc4xmpExt:DigitalSourceType | single-panel | always-suppress | implemented | single-panel, table | kupua-improves | reconcile | false | IPTC CV; flags AI-generated images — "Multiple values" (mixed human/AI) is editorially significant. Same alias policy. |
| alias_editStatus | Edit Status | workflow | yes | fileMetadata.iptc.Edit Status | single-panel | always-suppress | implemented | single-panel, table | kupua-improves | reconcile | false | XMP workflow field (ORIGINAL/NORMAL/UPDATE/CORRECTION/DELETION). Same alias policy. |
| alias_sceneCode | Scene Code | editorial | yes | fileMetadata.xmp.Iptc4xmpCore:Scene | single-panel | always-suppress | implemented | single-panel, table | kupua-improves | reconcile | false | IPTC Scene Code CV; categorises content type. Same alias policy. |

---

## Summary Tables

### By Kupua status

| Status | Count | Field ids |
|---|---|---|
| `implemented` | 37 | usageRights_category, metadata_imageType, metadata_title, metadata_description, metadata_specialInstructions, metadata_byline, metadata_credit, metadata_copyright, metadata_source, metadata_suppliersReference, metadata_bylineTitle, metadata_dateTaken, location, location.subLocation, location.city, location.state, location.country, uploadTime, lastModified, uploadedBy, subjects, people, keywords, dimensions, source_width, source_height, source_size, source_mimeType, uploadInfo_filename, imageId, alias_editStatus, alias_colourProfile, alias_colourModel, alias_cutout, alias_bitsPerSample, alias_digitalSourceType, alias_sceneCode |
| `missing` | 9 | labels, photoshoot, usageInstructions, lease_summary, syndication_rights, cost_state, domain_metadata, identifiers_derivative, identifiers_replaces |
| `partial` | 0 | — |
| `intentionally-omitted` | 0 | — |

### By parity status

| Parity | Count | Notes |
|---|---|---|
| `matches` | 22 | keywords, people, subjects, metadata_byline, metadata_copyright, metadata_credit, metadata_dateTaken, metadata_description, metadata_imageType, metadata_specialInstructions, metadata_title, location + 4 child rows, usageRights_category, dimensions, source_mimeType, uploadTime, uploadedBy |
| `kupua-improves` | 14 | metadata_source, metadata_suppliersReference, metadata_bylineTitle, lastModified, imageId, all 7 alias fields |
| `pending-implementation` | 9 | labels, photoshoot, usageInstructions, lease_summary, syndication_rights, cost_state, domain_metadata, identifiers_derivative, identifiers_replaces |
| `divergent-by-design` | 1 | uploadInfo_filename (Kahuna `show-if-all-same`; Kupua `always-suppress` — coincidental matches not useful signal) |
| `kupua-omits` | 0 | — |

> Note: Technical/source rows now confirmed to render in Kahuna single-image detail (decided 2026-05-02); Confidence-M markers removed.

### By category

| Category | Total rows | Implemented | Missing |
|---|---|---|---|
| chip | 4 | 3 (keywords, people, subjects) | 1 (labels) |
| editorial | 12 | 10 | 2 (photoshoot, usageInstructions) |
| identifier | 4 | 2 (imageId, uploadInfo_filename) | 2 (identifiers_derivative/replaces) |
| lease | 1 | 0 | 1 (lease_summary) |
| location | 5 | 5 | 0 |
| rights | 2 | 1 (usageRights_category) | 1 (syndication_rights) |
| summary | 1 | 0 | 1 (cost_state) |
| technical | 5 | 5 | 0 |
| workflow | 5 | 4 | 1 (domain_metadata) |
| alias | 7 | 7 | 0 |
| **Total** | **46** | **37** | **9** |

> Counts are by table-section in this catalogue, not by the Category column. Two alias rows (`alias_digitalSourceType`, `alias_editStatus`) carry `Category: workflow` after the 2026-05-02 reclassification but remain under the Alias section; the category column is informational only.

**For field parity: Kupua needs 9 fields to reach full display parity with Kahuna.**
Priority order (rough): labels → photoshoot → lease_summary → cost_state → domain_metadata → identifiers → syndication_rights → usageInstructions.

---

## Selection-of-one rule

**A selection of exactly one image renders the same metadata panel as single-image detail — no `multiSelectBehaviour` filtering applied.** This is non-negotiable: the panel that appears when you tick one image must be identical to the panel that appears when you click that image to view its detail. Otherwise ticking a single image would silently hide rows (filename, dimensions, lease list, identifiers) which is jarring and wrong.

Consequence:

- The multi-select rendering path (with `always-suppress` filtering, chip partial/full visuals, `summary-only` lease counts, `show-if-all-same` gating, `Multiple values` placeholders) is gated on `selectionCount >= 2`.
- At `selectionCount === 1`, the panel renders as `ImageMetadata` (the single-image component), full stop. `MultiImageMetadata` either delegates to `ImageMetadata` for the count=1 case or the panel-level branch is `count === 0 ? Empty : count === 1 ? Single : Multi`.
- The `multiSelectBehaviour` column in this catalogue is therefore only meaningful when at least 2 images are selected. At count=1, every field with a value renders.

Documented in arch §8 and selections-workplan S4. See deviations §29 for the supporting rationale on `always-suppress` fields like filename and suppliersReference.

---

## Resolved follow-ups

None open at 2026-05-02. Earlier user-decision items (technical-field Kahuna context; alias categorisation) are resolved inline in the rows above (single-panel context confirmed; `alias_digitalSourceType` and `alias_editStatus` moved to `workflow`).

---

## Appendix A: Files referenced

- `kupua/exploration/docs/01 Research/selections-kahuna-findings.md` — Kahuna selection state, reconciliation algorithm, performance root causes
- `kupua/exploration/docs/01 Research/selections-kahuna-pills-location-leases-findings.md` — per-field chip, location, lease, rights, description, photoshoot behaviour
- `kahuna/public/js/components/gr-image-metadata/gr-image-metadata.html` — Kahuna's metadata panel template (primary source)
- `kahuna/public/js/components/gr-image-metadata/gr-image-metadata.js` — `ignoredMetadata` list, `isUsefulMetadata()`, `identifiers`, `additionalMetadata` construction
- `kahuna/public/js/components/gr-info-panel/gr-info-panel.html` — cost state pills template
- `kupua/src/lib/field-registry.ts` — Kupua's field definitions (source of truth for implemented fields)
- `kupua/src/lib/grid-config.ts` — alias field ES paths and display config

## Appendix B: Resolved decisions

**Alias fields — uniform reconcile (decided 2026-05-01):** Kahuna suppresses all config-driven alias fields in multi-select (they only appear in the Additional Metadata section for single images). Kupua intentionally departs from this: all alias fields are `reconcile` / `showWhenEmpty: false`, meaning they display a reconciled value when the selection agrees and show "Multiple values" when it doesn't. This is better behaviour with negligible cost. Documented in `deviations.md` §28.

**Alias fields in main panel (decided 2026-05-01):** All alias fields are promoted from the Kahuna-style collapsible section to the Kupua main panel. This applies also to `metadata_source`, `metadata_suppliersReference`, and `metadata_bylineTitle` (non-alias fields that Kahuna collapses into Additional Metadata). Kupua treats them as first-class panel fields. Documented in `deviations.md` §28.

**Location composite as single row (decided 2026-05-01):** Location is a single parent row plus child rows in the catalogue, reflecting Kupua's composite field treatment. Kahuna treats each segment independently in reconciliation but groups them visually in one Location section. Kupua matches this structure.

**`show-if-all-same` fields (decided 2026-05-01):** `uploadedBy` and `source_mimeType` are the only fields classified `show-if-all-same`. `uploadInfo_filename` uses `always-suppress` in Kupua — minor deviation from Kahuna, ratified 2026-05-02 (see below).

**`uploadInfo_filename` always-suppress (decided 2026-05-02):** Kahuna shows filename in multi-select when all images share one. Kupua suppresses unconditionally — filenames are de-facto unique per image; coincidental matches are not useful signal. Classified `divergent-by-design`.

**`metadata_suppliersReference` always-suppress in multi-select (decided 2026-05-02):** Same logic as filename — supplier reference is an ID; coincidental matches across a selection are supplier error, not signal. Promoted to main panel for single-image (`kupua-improves`); suppressed in multi-select.

**`metadata_imageType` config guard (decided 2026-05-02):** S4 must gate image type display on `gridConfig.imageTypes?.length > 0`, mirroring Kahuna's `_clientConfig.imageTypes` check. Without the guard, Grid instances that don't use image types see a permanent empty field. Same guard pattern applies to `domain_metadata` (BBC field) when implemented.

**`usageInstructions` and `domain_metadata` BBC-deferred (decided 2026-05-02):** Both are BBC-specific config-driven fields (read-only usage notes; arbitrary per-field structure). Kept in catalogue with `pending-implementation` parity status, but explicitly out of scope for v1 / S4. Will be tackled in a future Kupua↔BBC parity session.

**Selection-of-one renders single-image panel (decided 2026-05-02):** A selection of exactly one image renders the single-image detail panel verbatim — no `multiSelectBehaviour` filtering. Multi-select code path gates on `selectionCount >= 2`. See §"Selection-of-one rule" above.

**Technical fields — Kahuna context resolved (decided 2026-05-02):** `dimensions`, `source_width`, `source_height`, `source_size`, `source_mimeType` are confirmed shown in Kahuna's single-image detail. Kupua reads `orientedDimensions` first (EXIF-corrected) with `dimensions` fallback. Confidence-M markers removed from these rows.

**Alias category for `digitalSourceType` and `editStatus` (decided 2026-05-02):** Both moved from `editorial` to `workflow`. The category column is informational — it doesn't drive UI grouping in v1 and could be revisited if the multi-select panel ever wants section dividers.
