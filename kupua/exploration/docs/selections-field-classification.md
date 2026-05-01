# Selections — Field Classification
- Audited by: Claude Sonnet 4.6 (subagent) + manual correction on 2026-05-01
- Fields classified: 33 (26 hardcoded + 7 config alias fields)
- Fields needing user decision: 0

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
> This is an intentional deviation; add to `deviations.md` when Phase S4 is implemented.

## Table

| Field id | Label | multiSelectBehaviour | showWhenEmpty | Rationale |
|---|---|---|---|---|
| usageRights_category | Category | reconcile | false | Classifiable rights metadata; Kahuna reconciles this. Hidden when empty — not in Kahuna's important-empty list. (Kahuna: reconcile, findings.md §2) |
| metadata_imageType | Image type | reconcile | false | Editorial metadata; Kahuna reconciles. Hidden when empty for non-editors. (Kahuna: reconcile, findings.md §2.8) |
| metadata_title | Title | reconcile | true | Editorial-important; always shown to flag missing title. (Kahuna: shown even when empty, findings.md §2.8) |
| metadata_description | Description | reconcile | true | Editorial-important; always shown to flag missing description. (Kahuna: shown even when empty, findings.md §2.8) |
| metadata_specialInstructions | Special instructions | reconcile | true | High-priority safety/legal signal; always shown. (Kahuna: shown even when empty, findings.md §2.8) |
| metadata_byline | By | reconcile | true | Editorial-important shoot signal; always shown to flag un-bylined images. (Kahuna: hidden in non-editor view when empty, but structurally important, findings.md §2.8) |
| metadata_credit | Credit | reconcile | true | Legal attribution requirement; always shown to flag missing credit. (Kahuna: shown even when empty, findings.md §2.8) |
| metadata_copyright | Copyright | reconcile | false | Legal metadata; not in Kahuna's important-empty list. (Kahuna: hidden when empty, findings.md §2.8) |
| metadata_source | Source | reconcile | false | Editorial provenance; not in Kahuna's important-empty list. (Kahuna: reconcile, hidden when empty, findings.md §2.8) |
| location | Location | reconcile | false | Composite location (subLocation/city/state/country); useful to reconcile. Not in Kahuna's important-empty list. (Kahuna: per-segment reconcile, findings.md §2.8) |
| metadata_dateTaken | Taken on | reconcile | true | Critical temporal anchor for a shoot; always shown to flag undated images. (Kahuna: shown even when empty, findings.md §2.8) |
| uploadTime | Uploaded | always-suppress | n/a | Technical upload timestamp; varies per image in any batch. (Kahuna: suppressed in multi-select, findings.md §2.10) |
| lastModified | Last modified | always-suppress | n/a | Technical modification timestamp; varies per image. (Kahuna: suppressed by singleImage gate, findings.md §2.10) |
| uploadedBy | Uploader | show-if-all-same | false | Useful only if the entire selection was uploaded by the same person; noise otherwise. (Kahuna: suppressed in multi-select, findings.md §2.10) |
| subjects | Subjects | reconcile | false | Array/chips field; union-display useful in Phase 2. Not in Kahuna's important-empty list. (Kahuna: per-image chips, findings.md §2.6) |
| people | People | reconcile | false | Array/chips field; union-display useful in Phase 2. (Kahuna: per-image chips, findings.md §2.6) |
| metadata_suppliersReference | Suppliers reference | reconcile | false | Technical job-code identifier; useful if the shoot shares a reference. (Kahuna: suppressed by singleImage gate, findings.md §2.10; Kupua promotes to reconcile by analogy to shoot-code fields) |
| metadata_bylineTitle | Byline title | reconcile | false | Editorial metadata extension of Byline; follows Byline treatment. (Kahuna: suppressed by singleImage gate, findings.md §2.10; Kupua promotes by analogy) |
| keywords | Keywords | reconcile | false | Array/chips field; union-display useful. (Kahuna: per-image chips, findings.md §2.6) |
| dimensions | Dimensions | always-suppress | n/a | Display-only composite of width × height; unique per image, non-reconcilable. (Kahuna: suppressed by singleImage gate, findings.md §2.10) |
| source_width | Width | always-suppress | n/a | Technical dimension; varies per image; redundant alongside Dimensions. (Kahuna: suppressed by singleImage gate, findings.md §2.10) |
| source_height | Height | always-suppress | n/a | Technical dimension; varies per image; redundant alongside Dimensions. (Kahuna: suppressed by singleImage gate, findings.md §2.10) |
| source_size | File size | always-suppress | n/a | Technical byte count; varies per image in any batch. (Kahuna: suppressed by singleImage gate, findings.md §2.10) |
| source_mimeType | File type | show-if-all-same | false | Useful to confirm a batch is uniform (e.g. all JPEG); noisy if mixed. (Kahuna: suppressed by singleImage gate, findings.md §2.10; Kupua promotes to show-if-all-same) |
| uploadInfo_filename | Filename | always-suppress | n/a | Unique identifier per file; never reconcilable. (Kahuna: suppressed in multi-select, findings.md §2.10) |
| imageId | Image ID | always-suppress | n/a | Unique identifier; never reconcilable. (Kahuna: never reconciled, findings.md §2.10) |
| alias_editStatus | Edit Status | reconcile | false | XMP workflow field. (Kahuna: suppressed in multi-select entirely. Kupua: intentional improvement — all aliases reconcile uniformly. Kupua-only field.) |
| alias_colourProfile | Colour Profile | reconcile | false | ICC profile string. (Kahuna: suppressed in multi-select entirely. Kupua: intentional improvement. Kupua-only field.) |
| alias_colourModel | Colour Model | reconcile | false | Colour model (RGB/CMYK/etc.). (Kahuna: suppressed in multi-select entirely. Kupua: intentional improvement. Kupua-only field.) |
| alias_cutout | Cutout | reconcile | false | Boolean (has alpha channel). (Kahuna: suppressed in multi-select entirely. Kupua: intentional improvement. Kupua-only field.) |
| alias_bitsPerSample | Bits Per Sample | reconcile | false | Technical bit depth. (Kahuna: suppressed in multi-select entirely. Kupua: intentional improvement. Kupua-only field.) |
| alias_digitalSourceType | Digital Source Type | reconcile | false | IPTC Digital Source Type CV; flags AI-generated images. "Multiple values" (mixed human/AI) is editorially significant. (Kahuna: suppressed in multi-select entirely. Kupua: intentional improvement. Kupua-only field.) |
| alias_sceneCode | Scene Code | reconcile | false | IPTC Scene Code CV; categorises content type. (Kahuna: suppressed in multi-select entirely. Kupua: intentional improvement. Kupua-only field.) |

## Summary

- Reconcile: 23 fields
- Always-suppress: 8 fields
- Show-if-all-same: 2 fields (uploadedBy, source_mimeType)
- **Total: 33 fields**
- Show-when-empty (true): 6 fields (title, description, specialInstructions, byline, credit, dateTaken)
- Needs user decision: 0

## Appendix A: Resolved decisions

**All alias fields — uniform reconcile (decided 2026-05-01):** Kahuna suppresses all config-driven alias fields in multi-select (they only appear in the Info panel for single-image view). Kupua intentionally departs from this: all alias fields are `reconcile` / `showWhenEmpty: false`, meaning they display a reconciled value when the selection agrees and show "Multiple values" when it doesn't. This is better behaviour with negligible cost. Record in `deviations.md` when Phase S4 is implemented.

## Appendix B: Files referenced

- `kupua/exploration/docs/01 Research/selections-kahuna-findings.md`
- `kupua/exploration/docs/00 Architecture and philosophy/05-selections.md`
- `kupua/src/lib/field-registry.ts`
- `kupua/src/lib/grid-config.ts`
