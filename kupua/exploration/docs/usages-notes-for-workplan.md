# Usages — Notes for Workplan

Written 2026-06-02. Context: TS sweep highlighted type incompatibilities; deferred until
usages are properly implemented (CQL filters, Usage Details tab, etc.).

---

## Two incompatible `Usage` types

**Type A — ES-stored** (`kupua/src/types/image.ts:103`):
- `platform: string`
- `digitalUsageMetadata?: { webUrl?; webTitle?; sectionId?; composerUrl? }`
- `printUsageMetadata?: { sectionName?; publicationName?; ... }`
- No `syndicationUsageMetadata`, `frontUsageMetadata`, etc.

**Type B — Grid API response** (`kupua/src/dal/grid-api/types.ts:206`):
- `platform: UsageType` (literal union)
- `digitalUsageMetadata?: unknown`
- `printUsageMetadata?: unknown`
- Also has `syndicationUsageMetadata?`, `frontUsageMetadata?`, `downloadUsageMetadata?`, `childUsageMetadata?`

---

## Problems with Type B's `UsageType` literal union

`grid-api/types.ts:196`: `"print" | "digital" | "syndication" | "front" | "download" | "child"`

The Scala authority is `common-lib/…/model/usage/UsageType.scala:6-13`:
`print | digital | syndication | download | derivative | replaced`

- TS union is **missing**: `derivative`, `replaced`
- TS union has **extras not in Scala trait**: `front`, `child`
  (these ARE real ES values — `Mappings.scala:323,332` defines `frontUsageMetadata` and
  `childUsageMetadata` nested fields, and `Usage.scala:22` has `childUsageMetadata` field)

`platform: string` (Type A) is more accurate than the literal union (Type B).

---

## The cast and why it's currently safe

`derive-enriched-image.ts:134`:
```ts
enrichedUsages: (overlay?.usages ?? image.usages) as Image["usages"],
```

The cast papers over Type A vs Type B incompatibility on `digitalUsageMetadata`
(`unknown` vs typed object). It is safe today because:

1. `gridApi` is never called in production code — `enrichByIds`/`getImageDetail` only
   appear in test files. The enrichment store is never populated from API data.
   So `overlay?.usages` is always `undefined`; the cast only ever applies to
   `image.usages`, which is already `Image["usages"]` — it's a no-op at runtime.

2. Even if the API were wired: no consumer reads `digitalUsageMetadata` sub-fields.
   Both consumers narrow to `{ platform: string; dateAdded?: string }`:
   - `kupua/src/components/ImageGrid.tsx:231`
   - `kupua/src/lib/field-registry.tsx:350`

---

## What to fix when usages are implemented properly

1. **Align `platform` type**: `UsageType` in `grid-api/types.ts` is wrong. Options:
   - Widen to `string` (simplest, matches Type A and actual data)
   - Correct the union to match real values: `"print" | "digital" | "syndication" | "download" | "derivative" | "replaced" | "front" | "child"` (exhaustive but fragile if new types added server-side)

2. **Align metadata fields**: Type A has typed `digitalUsageMetadata`; Type B has `unknown`.
   When reading metadata sub-fields (e.g. in a Usage Details tab), one type needs to win.
   Scala `DigitalUsageMetadata.scala:8-12` is authoritative: `webUrl`, `webTitle`, `sectionId`, `composerUrl?`.

3. **Type B is missing metadata variant fields** present in ES: `syndicationUsageMetadata`,
   `frontUsageMetadata`, `downloadUsageMetadata`, `childUsageMetadata` — Type B has them as
   `unknown`; Type A doesn't have them at all. Add to Type A from `Mappings.scala:318-332`
   when building the Usage Details tab.

4. **Remove the cast** in `derive-enriched-image.ts:134` once the types are reconciled.

5. **`references` field**: Type A has `references?: UsageReference[]` (optional).
   Scala `Usage.scala:8` has `references: List[UsageReference]` (required, but can be empty list).
   Treat as optional in TS (ES can omit empty arrays) — already correct in Type A.

---

## Related missing features (triggers for the above work)

- CQL `usages:` / `usagesPlatform:` filters return no results (ES query side issue, separate)
- No Usage Details tab / usage breakdown in detail panel
- `gridApi.enrichByIds` is implemented but never called from production code
