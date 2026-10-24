# Usages — Findings & Workplan Notes

> Written 2026-06-07. Orientation doc for building the Usages panel section in
> kupua's image detail / selection panel.
>
> Sources: `usages-notes-for-workplan.md`, `kahuna-image-detail-inventory.md`,
> Scala models in `common-lib/model/usage/`, ES `Mappings.scala`,
> kupua `types/image.ts`, `dal/grid-api/types.ts`, `derive-enriched-image.ts`,
> `stores/selection-store.ts`, `constants/tuning.ts`.

---

## 1 — What kupua already has

| Feature | Where |
|---|---|
| `usages[]` fetched from ES for every search hit | `dal/es-config.ts` — `usages` is in `SOURCE_INCLUDES` |
| `usages[]` also fetched for all selected images (including out-of-buffer) | `selection-store.ts` → `ensureMetadata` → `dataSource.getByIds` → `_mget` (same includes whitelist) |
| LRU cache cap for selection metadata | `SELECTION_METADATA_LRU_CAP = 5000` in `constants/tuning.ts` — matches max selection size |
| Print icon on grid cell + table (red if recent ≤7 days) | `ImageGrid.tsx:238`, `field-registry.tsx:352` |
| Digital icon on grid cell + table (red if recent ≤7 days) | `ImageGrid.tsx:240`, `field-registry.tsx:356` |
| `enrichedUsages` (ES value; API path never called in production) | `derive-enriched-image.ts:134` |
| No Usages tab or panel section yet | — |

**Key property:** the complete `usages` array — including all `printUsageMetadata`,
`digitalUsageMetadata`, and other sub-objects — is already fetched from ES for
every visible and every selected image. No additional network call is needed to
power either the single-image Usages tab or the multi-select summary.

---

## 2 — Data model (ES-authoritative)

Usages are stored as a **nested array** on the image document.

Each usage item (from `Mappings.scala:337` and `Usage.scala`):

| Field | Type | Notes |
|---|---|---|
| `id` | string | Typically `composer/{id}_{hash}` or `indesign/{id}` |
| `title` | string | Server-computed at write time (see §2.1); stored in ES |
| `platform` | keyword | See §3 |
| `media` | keyword | Always `"image"` for Grid |
| `status` | keyword | See §3 |
| `dateAdded` | date | When this usage was first recorded |
| `dateRemoved` | date | When removed (only on `removed` status) |
| `lastModified` | date | Last status change |
| `references[]` | object | `{ type, uri?, name? }` — links back to CMS. Types: `frontend`, `composer`, `print`, `indesign` |
| `digitalUsageMetadata` | object | Present when `platform = "digital"` |
| `printUsageMetadata` | object | Present when `platform = "print"` |
| `downloadUsageMetadata` | object | Present when `platform = "download"` |
| `syndicationUsageMetadata` | object | Present when `platform = "syndication"` |
| `frontUsageMetadata` | object | Present when `platform = "front"` |
| `childUsageMetadata` | object | Present on `derivative`/`replaced` platform usages |

ES rollup fields (copy_to from nested, for query/filter only, not returned in `_source`):
`usagesPlatform`, `usagesStatus`, `usagesLastModified`.

### 2.1 — Platform-specific metadata fields

**`digitalUsageMetadata`** (`DigitalUsageMetadata.scala`):
| Field | Type |
|---|---|
| `webUrl` | URI |
| `webTitle` | string |
| `sectionId` | string (e.g. `"culture"`, `"sport"`) |
| `composerUrl` | URI? |

**`printUsageMetadata`** (`PrintUsageMetadata.scala`):
| Field | Type |
|---|---|
| `sectionName` | string |
| `issueDate` | date |
| `pageNumber` | int |
| `storyName` | string |
| `publicationCode` | string |
| `publicationName` | string |
| `sectionCode` | string |
| `edition` | int? |
| `size` | `{ x: int, y: int }`? |
| `layoutId` | long? |
| `orderedBy` | string? |
| `notes` | string? |
| `source` | string? |

**`downloadUsageMetadata`** (`DownloadUsageMetadata.scala`):
| Field |
|---|
| `downloadedBy` — Guardian staff username |

**`syndicationUsageMetadata`** (`SyndicationUsageMetadata.scala`):
| Field |
|---|
| `partnerName` — e.g. `"Capture"` (photo sales) |
| `syndicatedBy?` |

**`frontUsageMetadata`** (`FrontUsageMetadata.scala`):
| Field |
|---|
| `addedBy` |
| `front` — name of the front (e.g. `"uk"`) |

**`childUsageMetadata`** (`ChildUsageMetadata.scala`):
| Field |
|---|
| `addedBy` |
| `childMediaId` — Grid image ID of the replacement/derivative |

### 2.2 — References

`references[]` are the back-links to the CMS:
- **`frontend`** → published article URL (e.g. `https://www.theguardian.com/…`)
- **`composer`** → Composer article URL (e.g. `https://composer.…/content/…`)
- **`print`** / **`indesign`** → print layout systems

For digital usages, `digitalUsageMetadata.webUrl` and `.composerUrl` overlap with
`references[type=frontend].uri` and `references[type=composer].uri` respectively.
They carry the same URLs but the metadata object is more structured. Prefer metadata
object for display; use references as fallback links.

---

## 3 — Platform and status taxonomy

### Platforms (Scala authoritative: `UsageType.scala`)

| Platform value | Scala type | Description | Build for? |
|---|---|---|---|
| `print` | `PrintUsage` | Newspaper / magazine | ✅ Primary |
| `digital` | `DigitalUsage` | Web articles / apps | ✅ Primary |
| `download` | `DownloadUsage` | Direct download by staff | ✅ Config-gated (Guardian off by default) |
| `syndication` | `SyndicationUsage` | Photo sales (Capture/BBC) | ❌ Out of scope (photosales only) |
| `derivative` | `DerivativeUsage` | Used to create another image | ⚠️ Versions concept — see §6 |
| `replaced` | `ReplacedUsage` | Was replaced by another image | ⚠️ Versions concept — see §6 |
| `front` | *(not in UsageType.scala)* | Guardian Fronts (homepage placement) | 💭 Exists in ES; see §5 |

Note: `front` and `child` appear in `grid-api/types.ts` as `UsageType` variants and
in ES mappings but are absent from `UsageType.scala`. This is a known discrepancy —
see `usages-notes-for-workplan.md`. `front` platform usages are real in production data.

### Statuses (Scala authoritative: `UsageStatus.scala`)

| Status | Meaning |
|---|---|
| `pending` | Scheduled / not yet live |
| `published` | Live on site |
| `removed` | Taken down |
| `downloaded` | A download was recorded |
| `syndicated` | Syndicated to partner |
| `derivative` | A derivative was created |
| `replaced` | Image was replaced |
| `failed` | Processing failed |
| `unknown` | Status unknown (fronts — see §5) |

**Type debt:** `kupua/src/dal/grid-api/types.ts:198` has
`UsageStatus = "pending" | "published" | "removed" | "cancelled"` — wrong and
incomplete. Missing `syndicated`, `downloaded`, `derivative`, `replaced`, `failed`,
`unknown`. `"cancelled"` does not exist in Scala. Needs fixing before the Usages
panel ships. (Also noted in `usages-notes-for-workplan.md`.)

---

## 4 — What to build: single-image Usages panel section

### Data path
- **No new network call needed.** `image.usages` is already present on every image
  loaded from ES (via `SOURCE_INCLUDES`). Direct-to-ES is the baseline; future
  media-api path would enrich from the same source (thrall writes usages to ES).
- Kahuna uses a separate HATEOAS fetch to the `media-usage` service. We don't need
  this for display — ES already has the authoritative data. The media-usage service is
  where writes happen (thrall → Kinesis → media-usage → ES). Reading is fine from ES.

### Display design (mirrors Kahuna `gr-image-usage.js` + `gr-image-usage-list.html`)

Group usages by **status** — this is what Kahuna does, and it is the right grouping for
editorial users: they care whether an image is published, pending, or taken down.
Platform is shown as a per-row icon within each group.

#### Status groups and display labels (mirrors `usageTypeToName` in Kahuna)

| Status value | Display label | Notes |
|---|---|---|
| `published` | Published | |
| `pending` | Pending publication | |
| `removed` | Taken down | |
| `syndicated` | Syndicated | not in Kahuna's switch — add it |
| `downloaded` | Downloads | config-gated — only shown when download usages exist |
| `unknown` | Front | fronts only — see §5 |
| `derivative` | (omit or show raw) | rare; keep for completeness |

Group order: Published → Pending publication → Taken down → Syndicated → Downloads → Front.
Omit any empty group. Within each group, sort by `dateAdded` descending (most recent first).
Each group header shows the count: "Published (2)".

#### Per-row rendering (same within every group)

Each usage row contains:

1. **Platform icon** — shown when platform is `print` or `digital`; red (`icon-warning`) when
   `dateAdded` is within 7 days:
   - `print` → `local_library` icon
   - `digital` → `phonelink` icon
   - `syndication`, `download`, `front` → no icon in Kahuna; kupua may add one

2. **Title text** — use the stored `title` field from ES (`Mappings.scala:338` — `sStemmerAnalysed("title")`).
   This field is assembled server-side by `usageTitle()` in kahuna's usages service, which derives it as:
   - **digital**: `references[type='frontend'].name` → the article headline (e.g. "Delivery pain for UK dad…")
   - **print**: `references[type='indesign'].name` → the InDesign record string (e.g. "2026-06-08, Guardian, UK (News), Page 9")
   - **front**: `"${frontUsageMetadata.front}, ${frontUsageMetadata.addedBy}"`
   - **download**: `downloadUsageMetadata.downloadedBy`
   - **syndication**: `references[type='syndication'].name` → partner name (e.g. "eyevine").
     Kahuna shows "No title found." because it looks for `type='frontend'` which doesn't exist here.
     Kupua improvement: use `syndicationUsageMetadata.partnerName` directly if title absent.
   - Fallback: `"No title found."`

   The stored `title` field in ES already contains this computed string — use it directly. Only
   reconstruct from metadata if `title` is absent (e.g. very old records before server-side title was added).

3. **Date** — `dateAdded` rendered as relative time ("25 minutes ago", "in 10 minutes"),
   with the full `d MMM yyyy, HH:mm` on hover. Kahuna uses `moment.fromNow()`.

4. **Reference links** — small icon links from `references[]`, shown only when `reference.uri` exists:
   - `type === 'frontend'` → Guardian globe SVG icon → links to `references[].uri` (guardian.com article)
   - `type === 'composer'` → Composer "C" SVG icon → links to `references[].uri` (composer.gutools.co.uk)
   - Other types (`indesign`, `syndication`, `print`) → no link (no `uri` present)

   Kupua should include the same SVG icons for parity. Print usages show no reference links (indesign
   references have no URI). Syndication usages show no reference links.

#### Note: photosales vs plain syndication
Photosales (Capture / BBC partner) has `syndicationUsageMetadata.partnerName === "Capture"` and
is handled by the separate photosales panel in Kahuna (BBC-only, out of scope for kupua).
All other syndication usages should appear in the Syndicated group. No photosales guard needed —
just display all `platform === "syndication"` rows normally.

**Empty state:** "No usages recorded" when `usages` is empty or undefined.

**Section header:** "Usages (N)" where N = total count; shown as the title of the
`AccordionSection` — see §9 Step D for wiring.

### What Kahuna does differently
- In Kahuna, Usages is a **tab** in the image detail panel. Kupua has no tabs — the
  equivalent is a standalone `AccordionSection` in the RHS panel, at the same level as
  the existing "Details" section (and how Collections and Filters are parallel sections
  in the LHS). It is **not** embedded within the Details section.
- Kahuna fires a separate HATEOAS fetch; kupua reads from ES directly (already loaded).
- Kahuna shows a `title` field computed server-side and stored in ES. Kupua uses the
  same stored `title` field directly. `Mappings.scala:338` confirms `sStemmerAnalysed("title")`
  is a stored field. Fall back to metadata reconstruction only if `title` is absent.

---

## 5 — Fronts usages

`platform = "front"` usages exist in production data. They have `frontUsageMetadata`
with `{ addedBy, front }` (where `front` is the front name, e.g. `"uk"`), and
`status = "unknown"` because the Fronts tool doesn't differentiate live vs draft.
Kahuna maps `status = "unknown"` → group label "Front". The stored `title` field
(computed server-side) contains `"${front}, ${addedBy}"`.

No reference links — front references carry no URI. No platform icon in Kahuna.

**Note:** fronts change frequently; an image that was on a front yesterday may not be today.
The section is informational only — it records that the image was placed on a front, not
that it is currently on one.

---

## 6 — Derivative / replaced (versions) — explicit non-goal

`platform = "derivative"` and `platform = "replaced"` usages carry `childUsageMetadata`
with `{ addedBy, childMediaId }` — `childMediaId` is the Grid ID of the replacement or
derived image.

These represent **image version relationships**, not editorial usages in the usual sense.
PR [#4525](https://github.com/guardian/grid/pull/4525) proposed a "Versions" UI for
this concept; the feature is stale and not merged.

**For the Usages panel:** do not display derivative/replaced as usage rows. Optionally
show a separate "Versions" notice at the top of the panel when such entries exist
(e.g. "This image was replaced by [ID link]"). Leave that as a stretch goal. The
versions feature needs its own design pass.

---

## 7 — Multi-select: what we can display and performance

### Data availability
- **In-buffer images** (≤1000 items): `usages[]` available directly via search response.
- **Out-of-buffer selected images**: fetched via `selection-store.ensureMetadata` →
  `_mget` → uses the same `SOURCE_INCLUDES` whitelist which includes `"usages"`.
- **LRU cap:** `SELECTION_METADATA_LRU_CAP = 5000` — covers the full selection maximum.

**Conclusion: for any selection up to 5k images, full `usages[]` data including all
metadata sub-objects is available in memory.** No additional fetch is needed.

### What to display for multi-select

For 2–5k selected images, per-usage detail is not useful. The multi-image panel should
show an aggregated summary:

| Metric | How to compute | Cost |
|---|---|---|
| N images with digital usages | `images.filter(img => img.usages?.some(u => u.platform === "digital")).length` | O(5k × avg_usages) |
| N images with print usages | Same for `"print"` | O(5k × avg_usages) |
| N images with recent digital usages (≤7 days) | Filter by platform + dateAdded check | O(same) |
| N images with recent print usages | Same | O(same) |
| Most recent usage date across entire selection | `max(usages[].dateAdded)` | O(same) |
| N images with no usages | `images.filter(img => !img.usages?.length).length` | O(same) |

**Performance assessment:** Guardian images typically have a handful of usages (0–10
per image, occasionally more for heavily-used images). At 5k selections with avg 3
usages each = 15k object iterations. This is a microsecond-level JS computation,
rendered once when the panel is shown. No perf concern.

### Per-image listing for small selections?

For selections of 2–5 images, per-image listing might be useful (e.g. "Image A: 2
digital | Image B: 0 usages | Image C: 1 print"). This is a reasonable enhancement for
the initial multi-select view. For >5 images, collapse to aggregate stats only.

### RECONCILE_FIELDS scope
`usages` is not currently a reconcile field (not in `FIELD_REGISTRY` with a
`multiSelectBehaviour`). Adding a usage summary to the multi-select panel does NOT
require adding usages to `RECONCILE_FIELDS` — the summary is computed in the panel
component directly from `metadataCache`, not via the reconciliation path. This is
correct: usages are not a "field" in the metadata field sense; they're a relationship
list.

---

## 8 — Type debt (before shipping)

From `usages-notes-for-workplan.md` + additional findings:

| Item | Current state | Fix needed |
|---|---|---|
| `UsageStatus` in `grid-api/types.ts:198` | `"pending" | "published" | "removed" | "cancelled"` | Widen to match Scala: add `"syndicated" | "downloaded" | "derivative" | "replaced" | "failed" | "unknown"`, remove `"cancelled"` |
| `UsageType` in `grid-api/types.ts:196` | Missing `"derivative"`, `"replaced"`; has `"front"`, `"child"` | Add `"derivative"`, `"replaced"`. Keep `"front"` (real data). Remove `"child"` (no such platform; child data is in `childUsageMetadata` on derivative/replaced). |
| `digitalUsageMetadata: unknown` in `grid-api/types.ts` | Untyped | Type to match `DigitalUsageMetadata.scala` |
| `printUsageMetadata: unknown` in `grid-api/types.ts` | Untyped | Type to match `PrintUsageMetadata.scala` |
| `Usage` in `image.ts:103` | Missing `syndicationUsageMetadata`, `frontUsageMetadata`, `downloadUsageMetadata`, `childUsageMetadata` | Add optional fields from Mappings. Keep `platform: string` (correct — union would be fragile). |
| Cast in `derive-enriched-image.ts:134` | `as Image["usages"]` papers over type A vs B incompatibility | Remove once types reconciled |

Priority: fix `UsageStatus` and add missing metadata sub-types before building the panel,
since the panel renders status badges and metadata fields.

---

## 9 — Build plan

### Step A — Type fixes (precondition for everything else)

All in `kupua/src/`:

1. **`dal/grid-api/types.ts`**:
   - Fix `UsageStatus` (line 198): remove `"cancelled"`, add `"syndicated" | "downloaded" | "derivative" | "replaced" | "failed" | "unknown"`
   - Fix `UsageType` (line 196): add `"derivative"`, `"replaced"`, remove `"child"`
   - Type `digitalUsageMetadata` on `Usage`: `{ webUrl?: string; webTitle?: string; sectionId?: string; composerUrl?: string }`
   - Type `printUsageMetadata` on `Usage`: see `PrintUsageMetadata.scala` — `sectionName`, `issueDate`, `pageNumber`, `storyName`, `publicationCode`, `publicationName`, `sectionCode`, `edition?`, `size?`, `layoutId?`, `orderedBy?`, `notes?`, `source?`
   - Type `syndicationUsageMetadata`: `{ partnerName: string; syndicatedBy?: string }`
   - Type `frontUsageMetadata`: `{ addedBy: string; front: string }`
   - Type `downloadUsageMetadata`: `{ downloadedBy: string }`
   - Type `childUsageMetadata`: `{ addedBy: string; childMediaId: string }`

2. **`types/image.ts`** (`Usage` interface, line 103):
   - Add optional: `syndicationUsageMetadata?`, `frontUsageMetadata?`, `downloadUsageMetadata?`, `childUsageMetadata?`
   - Keep `platform: string` (not a union — fragile against new server-side values)

3. **`derive-enriched-image.ts:134`**: remove the `as Image["usages"]` cast once types are reconciled.

### Step B — SVG icon assets

Two reference-link icons are needed for usage rows (frontend article link + Composer link).
Source SVGs are in kahuna: `kahuna/public/js/components/gr-icon/icons/frontend.svg` and `composer.svg`.
Copy to `kupua/src/assets/` (or inline as React components in the new `<UsagesSection>` file).
Keep them simple: small inline SVGs, no Angular wrapper needed.

### Step C — `<UsagesSection>` component

New file: `kupua/src/components/UsagesSection.tsx`.

**Props:** `{ usages: Image["usages"] }`

**Logic:**
1. Filter out `platform === "derivative"` and `platform === "replaced"` (versions — §6).
2. Group remaining usages by `status`. Group order: `published` → `pending` → `removed` → `syndicated` → `downloaded` → `unknown` (fronts). Status label map mirrors Kahuna's `usageTypeToName`.
3. Omit empty groups. Sort within each group by `dateAdded` descending.
4. For each group render a `<MetadataSection>` (same primitive as leases uses) with:
   - Header: `"{Status label} ({count})"`
   - List of usage rows per §4 display design

**Per-row:**
- Platform icon: `platform === "print"` → `local_library` icon; `platform === "digital"` → `phonelink` icon. Red when `dateAdded` within 7 days (reuse the existing `sevenDaysAgo` pattern from `ImageGrid.tsx:240`).
- Title text: use `usage.title` (stored in ES). If absent: fall back to `syndicationUsageMetadata.partnerName` for syndication, `references[0].name` otherwise, then `"No title found."`.
- Date: relative timestamp (reuse the `formatLeaseRelative` pattern from `ImageMetadata.tsx` or extract a shared `formatRelativeTime` util). Full date on `title` attribute for hover.
- Reference links: iterate `usage.references`, render anchor only when `reference.uri` exists:
  - `type === "frontend"` → Guardian globe SVG → href to `reference.uri`, `target="_blank" rel="noopener"`
  - `type === "composer"` → Composer SVG → same
  - Other types: skip (no URI)

**Empty state:** `<p>No usages recorded.</p>` when `usages` is empty or undefined.

### Step D — Wire into `search.tsx` as a second RHS `AccordionSection`

Usages is **not** embedded inside the existing "Details" accordion. It is a separate,
parallel `AccordionSection` in the RHS panel — the same relationship as Collections
and Filters in the LHS. `ImageMetadata.tsx` does **not** change.

Current RHS in `search.tsx`:
```tsx
rightPanel={
  <AccordionSection sectionId="right-metadata" title="Details">
    <FocusedImageMetadata />
  </AccordionSection>
}
```

After this step:
```tsx
rightPanel={
  <>
    <AccordionSection sectionId="right-metadata" title="Details">
      <FocusedImageMetadata />
    </AccordionSection>
    <AccordionSection sectionId="right-usages" title={`Usages (${usageCount})`}>
      <FocusedUsages />
    </AccordionSection>
  </>
}
```

Add a `FocusedUsages` function in `search.tsx`, mirroring `FocusedImageMetadata`:
- Same image-resolution logic (focused image → single selected → null)
- Multi-selection branch renders `<MultiImageUsages />`
- Single image renders `<div className="p-3"><UsagesSection usages={image.usages} /></div>`
- Empty state (no image focused): `<div className="px-3 py-4 text-xs text-grid-text-dim">Focus an image to see its usages.</div>`

For the `title` count: compute `usageCount` in the same component scope from the
resolved image (filter out `derivative` and `replaced` before counting, matching
what `UsagesSection` renders). When no image is focused, show `"Usages"`.

Within `UsagesSection`, the status-group headers and rows can use plain divs styled
consistently with the panel — no need to use `MetadataSection` from `ImageMetadata.tsx`
(that primitive is tightly coupled to the metadata field layout). Use `<MetadataSection>`
only if it's extracted to a shared primitive; otherwise style directly.

### Step E — CQL `usages@` fix

In `kupua/src/dal/adapters/elasticsearch/cql.ts`:

Add before the `resolveNamedField` fallback in `fieldToClause`:
```ts
if (key.startsWith("usages@")) {
  return buildNestedUsagesQuery(key.slice("usages@".length), value, negated);
}
```

Implement `buildNestedUsagesQuery(subField, value, negated)`:

| `subField` | Inner query |
|---|---|
| `platform` | `{ term: { "usages.platform": value } }` |
| `status` | `{ term: { "usages.status": value } }` |
| `reference` | `{ multi_match: { query: value, fields: ["usages.references.uri", "usages.references.name"], type: "best_fields", operator: "and" } }` |
| `section` | `{ multi_match: { query: value, fields: ["usages.printUsageMetadata.sectionId", "usages.printUsageMetadata.sectionCode"], type: "best_fields", operator: "and" } }` |
| `publication` | `{ multi_match: { query: value, fields: ["usages.printUsageMetadata.publicationName", "usages.printUsageMetadata.publicationCode"], type: "best_fields", operator: "and" } }` |
| `orderedBy` | `{ match: { "usages.printUsageMetadata.orderedBy": { query: value, operator: "and" } } }` |
| `<added` | `{ range: { "usages.dateAdded": { lte: value } } }` |
| `>added` | `{ range: { "usages.dateAdded": { gte: value } } }` |
| unknown | `{ match_none: {} }` |

Outer wrapper: `{ nested: { path: "usages", query: innerQuery } }`

**Group-and-combine:** multiple `usages@` chips with the same parent must be combined into a single nested query (AND inside nested). Track parsed `usages@` clauses separately, merge before emitting the final ES query. See §10.6 for semantics.

In `es-adapter.ts:buildQuery`, add after the `is:deleted` default negation:
```ts
if (!queryStr.includes("usages@status:replaced")) {
  mustNot.push({ nested: { path: "usages", query: { term: { "usages.status": "replaced" } } } });
}
```

Add tests to `cql.test.ts` for all six sub-field cases plus negation and the default negation.

### Step F — Multi-select panel

In `kupua/src/components/MultiImageMetadata.tsx`, add a Usages sub-section.

Data source: `metadataCache` from `selection-store` (already populated for all selected images). Do NOT use the reconcile path — compute directly.

Display for ≤5 images: per-image rows with counts (`"2 digital, 1 print"`).
Display for >5 images: aggregate stats only:
- N images with digital usages / N with recent (≤7 days)
- N images with print usages / N with recent
- N images with syndicated usages
- N images with no usages at all

No `RECONCILE_FIELDS` change needed.

### Step G — Sort by usage recency (optional enhancement)

In `sort-builders.ts`:
- Add `"usagesDateAdded"` special case → `{ "usages.dateAdded": { order: dir, mode: "max", nested: { path: "usages" }, missing: "_last" } }`
- Add `"usages.dateAdded"` to `DATE_SORT_FIELDS`

In `field-registry.tsx`: add a "Last used" sort option with `sortKey: "usagesDateAdded"`.

---

### Wiring order / dependencies

```
A (types) → C (component) → D (wire into panel)
B (SVG assets) → C
E (CQL fix) — independent, can ship separately
F (multi-select) — depends on A; independent of C/D
G (sort) — fully independent
```

A+C+D is the minimum shippable unit. E+F+G can follow.

---

## 10 — CQL `usages@` filters: root cause and fix

> These are **in scope** and should be fixed as part of or alongside the Usages panel.
> They are currently broken: typing `usages@platform:print` into kupua produces zero results.

### 10.1 — How Kahuna does it

Kahuna's Scala parser (`QuerySyntax.scala`) has a dedicated PEG grammar rule:

```
NestedFilter = rule {
  NestedMatch ~> Nested  |  NestedDateMatch
}
// NestedMatch: ParentField "@" NestedField ":" ExactMatchValue
// AllowedParentFieldName: only "usages"
// AllowedNestedFieldName: "status" | "platform" | "section" | "publication" | "orderedBy" | "reference"
```

`usages@platform:print` → Scala AST: `Nested(SingleField("usages"), SingleField("usages.platform"), Phrase("print"))`
→ ES: `{ nested: { path: "usages", query: { match_phrase: { "usages.platform": "print" } } } }`

The `QueryBuilder` groups all `Nested` conditions by parent, then wraps in `nestedQuery("usages", boolQuery.withMust(...))` — supporting AND combinations (e.g. `usages@platform:print usages@status:published` filters to usages that are BOTH print AND published on the same record).

Kahuna also applies a **default negation**: `Parser.scala:5-7` appends `-usages@status:replaced` to every query (unless already present), hiding "replaced" images by default. This mirrors the `-is:deleted` default.

### 10.2 — What `@guardian/cql` does

`@guardian/cql` (the TS web component kupua uses) does NOT have a `Nested` AST type. Its scanner treats `@` as a plain character, so:

| Input | Scanned tokens | AST |
|---|---|---|
| `usages@platform:print` | `CHIP_KEY("usages@platform")`, `CHIP_VALUE("print")` | `CqlField { key.literal="usages@platform", value.literal="print" }` |

The `@` is just part of the chip key string — no special meaning.

### 10.3 — What kupua does today (broken)

In `cql.ts:fieldToClause`, when `key = "usages@platform"`:
- No special case matches
- `resolveNamedField("usages@platform")` → `getFieldPath("usages@platform")` → falls through every set → returns `"usages@platform"` unchanged
- Produces: `{ match: { "usages@platform": { query: "print", operator: "and" } } }`
- ES does not recognise this field → **zero results, silently**

The typeahead already offers `usages@status`, `usages@platform`, `usages@reference`, `usages@<added`, `usages@>added` as suggestions — so users can type these and see the chips, but they return nothing. The fix is entirely in `fieldToClause`.

### 10.4 — The fix

**In `cql.ts:fieldToClause`**, add a handler for `key.startsWith("usages@")` before the `resolveNamedField` fallback:

```ts
if (key.startsWith("usages@")) {
  return buildNestedUsagesQuery(key.slice("usages@".length), value, negated);
}
```

**`buildNestedUsagesQuery(subField, value, negated)`** returns:
```ts
{ query: { nested: { path: "usages", query: innerQuery } }, negated }
```

where `innerQuery` is determined by `subField`:

| `subField` (after `@`) | Inner ES query | Notes |
|---|---|---|
| `platform` | `{ term: { "usages.platform": value } }` | keyword field — `term` not `match` |
| `status` | `{ term: { "usages.status": value } }` | keyword field |
| `reference` | `{ multi_match: { query, fields: ["usages.references.uri", "usages.references.name"], type: "best_fields", operator: "and" } }` | mirrors Scala `resolveNamedField("reference")` |
| `section` | `{ multi_match: { query, fields: ["usages.printUsageMetadata.sectionId", "usages.printUsageMetadata.sectionCode"], type: "best_fields", operator: "and" } }` | kupua uses correct full paths (Scala has a bug here — bare `sectionId` unresolved) |
| `publication` | `{ multi_match: { query, fields: ["usages.printUsageMetadata.publicationName", "usages.printUsageMetadata.publicationCode"], type: "best_fields", operator: "and" } }` | same fix |
| `orderedBy` | `{ match: { "usages.printUsageMetadata.orderedBy": { query, operator: "and" } } }` | cupua corrects Scala's unresolved bare field |
| `<added` | `{ range: { "usages.dateAdded": { lte: parsedDate(value) } } }` | date: parse value as ISO date |
| `>added` | `{ range: { "usages.dateAdded": { gte: parsedDate(value) } } }` | date: parse value as ISO date |
| *(unknown)* | `{ match_none: {} }` | fail-safe |

**Note on negation of nested queries:** when `negated = true`, `clausesToQuery` puts the whole nested query in `must_not`. This correctly excludes images that have ANY usage matching the condition — same semantics as Kahuna's `NegationNested`.

**In `es-adapter.ts:buildQuery`**, add the missing default negation after the `is:deleted` check:

```ts
// Suppress images with "replaced" usages by default — mirrors Kahuna's
// Parser.scala thingsToHideByDefault: "-usages@status:replaced".
// User can opt in by typing usages@status:replaced explicitly.
if (!queryStr.includes("usages@status:replaced")) {
  mustNot.push({ nested: { path: "usages", query: { term: { "usages.status": "replaced" } } } });
}
```

### 10.5 — Tests needed

Add to `cql.test.ts`:
- `usages@platform:print` → `{ nested: { path: "usages", query: { term: { "usages.platform": "print" } } } }` in `must`
- `usages@status:published` → `{ nested: { path: "usages", query: { term: { "usages.status": "published" } } } }` in `must`
- `-usages@platform:digital` → same nested query in `mustNot`
- `usages@reference:https://www.theguardian.com/foo` → multi_match on references.uri + references.name in `must`
- `usages@<added:2022-01-01` → nested range `lte` on `usages.dateAdded`
- `usages@>added:2022-01-01` → nested range `gte` on `usages.dateAdded`

Add to `es-adapter` integration tests (or document in a note): the `usages@status:replaced` default negation is applied when query string does not contain `usages@status:replaced`.

### 10.6 — AND-combination semantics note

ES nested queries from multiple `usages@` chips are each independent nested queries, ANDed at the top-level `bool.must`. This means:

`usages@platform:print usages@status:published` → finds images where there exists SOME usage that is `print` AND SOME usage (not necessarily the same one) that is `published`.

This matches Kahuna's QueryBuilder behaviour (separate nested queries per condition, not a single nested query with multiple must clauses). If true "same-record" matching is needed (e.g. "has a usage that is BOTH print AND published"), ES would require combining them inside a single nested query. Kahuna does combine multiple `Nested` conditions with the same `parentField` into a single `nestedQuery` — review `QueryBuilder.scala:listOfNestedToQueries`. Kupua should do the same: **group multiple `usages@` chips into a single nested query with multiple `must` clauses inside.**

This is a correctness difference. Group-and-combine is more work but semantically correct. Implement it from the start — the fix is in how `parseCql` assembles the final query.

---

## 11 — Dates, sorting by usage recency, and print title construction

### 11.1 — Date fields on a usage record

Each usage has three date fields:

| Field | Type | Notes |
|---|---|---|
| `dateAdded` | ISO datetime | When the usage record was **first created** — effectively when the image was placed/published. Full datetime precision (ms). Always present. |
| `lastModified` | ISO datetime | When the usage was **last status-transitioned** (e.g. pending → published, published → removed). Equals `dateAdded` for usages that never changed status. Always present. |
| `printUsageMetadata.issueDate` | ISO datetime (midnight-normalised) | The **newspaper publication date** — the date the printed edition came out. Date-only precision (`T00:00:00.000Z`). Present only on `platform = "print"` usages. |

**Key observation from real data:**
- Digital: `dateAdded = "2026-05-27T21:22:33.480Z"` — moment the CMS published the article.
- Print: `dateAdded = "2026-05-28T09:00:08.333Z"`, `issueDate = "2026-05-28T00:00:00.000Z"` — InDesign processed the layout on the morning of publication date.
- For print, `dateAdded` is typically a few hours into the `issueDate` day, sometimes the day before (if the layout was processed early). The two are almost always the same calendar day.

**Top-level rollup field** (ES only, not in `_source`):
`usagesLastModified` — a top-level date field written by thrall via Painless script, set to the `lastModified` of the most-recently-modified usage on the image. Used for the `usages@<added` / `usages@>added` CQL date filters (those actually query `usages.dateAdded` via nested; `usagesLastModified` is used for the search filter `usagesLastModified` range param in media-api). Not returned in `_source` — kupua only sees it in sort values.

### 11.2 — Display: which date to show per row

In the panel, each usage row shows **`dateAdded`** as the relative timestamp ("25 minutes ago", "in 10 minutes"), with full `d MMM yyyy, HH:mm` on hover. This is what Kahuna does. `issueDate` appears only inside the print title string (e.g. "2026-05-28, Guardian, Sport M-F (News), Page 44") — it is part of the `title` field stored in ES, not a separately rendered field.

For the "recent usage" colouring on grid cell icons (red if ≤7 days), the existing kupua logic already uses `dateAdded`. No change needed.

### 11.3 — Sorting images by usage recency (kupua improvement, not in Kahuna)

Three options, evaluated:

---

**Option A — Sort by `usagesLastModified` (top-level rollup)**

```
{ usagesLastModified: "desc" }
```

- ✅ Simple: top-level field, no nested sort syntax needed
- ✅ `usagesLastModified` is already in `DATE_SORT_FIELDS` scope (same epoch-ms format as other dates)
- ❌ Reflects **status changes**, not first use. An image published 2 years ago, whose usage was removed yesterday, sorts above an image published this morning. Misleading.
- ❌ Not in `SOURCE_INCLUDES` — need to add it if used as sort cursor anchor (only needed for `search_after` continuation; ES returns it in sort values regardless).
- **Verdict:** not the right semantic for "when was this image used"

---

**Option B — Nested sort on `usages.dateAdded` (max across all usages)**

```json
{
  "usages.dateAdded": {
    "order": "desc",
    "mode": "max",
    "nested": { "path": "usages" }
  }
}
```

- ✅ Correct semantic: "most recently added usage" = when the image was most recently placed in content
- ✅ Works in ES 8.x; supported by elastic4s
- ✅ `missing: "_last"` default means images with no usages sort to the end — correct
- ✅ Precedent in kupua: `collections.actionData.date` nested sort already uses this pattern (without `mode` — but `mode: "max"` is the right addition for a multi-value nested array)
- ❌ Needs special-casing in `buildSortClause` (same as `dateAddedToCollection`)
- ❌ Needs adding to `DATE_SORT_FIELDS` so `extractSortValues` converts the epoch sort value correctly
- **Verdict: recommended**

---

**Option C — Sort by `printUsageMetadata.issueDate` (nested, print only)**

```json
{
  "usages.printUsageMetadata.issueDate": {
    "order": "desc",
    "mode": "max",
    "nested": { "path": "usages", "filter": { "term": { "usages.platform": "print" } } }
  }
}
```

- ✅ Semantically the most accurate for print: the date the paper was on newsstands
- ❌ Print-only — useless for images with only digital usages; they all sort to the end
- ❌ Date-only precision (`T00:00:00.000Z`) — doesn't distinguish multiple same-day print usages
- ❌ Not useful as a general "sort by usage recency" for a mixed digital/print corpus
- **Verdict: reject for global sort. Could be useful as a column in a future print-only view.**

---

### 11.4 — Practical note: `dateAdded` is good enough for print

For print, `dateAdded` (the timestamp when InDesign processed the layout) is typically
a few hours into the `issueDate` calendar day, occasionally the day before. For sorting
purposes this is indistinguishable from `issueDate` — both give the same ordering between
images. `dateAdded` wins because it covers all platforms.

### 11.5 — Implementation notes for Option B

In `sort-builders.ts`:
- Add `"usagesDateAdded"` as a special-case alias → nested sort clause (like `dateAddedToCollection`)
- Add `"usages.dateAdded"` to `DATE_SORT_FIELDS` so `extractSortValues` coerces the epoch-ms sort value correctly
- `missing: "_last"` ensures images with zero usages sink to the bottom in desc order

In `field-registry.tsx`:
- Add a `sortKey: "usagesDateAdded"` to a "Last used" sort definition
- Expose in the sort dropdown

This is a **kupua-only improvement** — not available in Kahuna. Good discovery UX for editorial users who want to find recently-placed images.

---

## 12 — Out of scope (this feature)

- **Photosales panel (Capture / BBC)** — BBC-specific UI built around `partnerName === "Capture"`, fully out of scope for kupua. Plain syndication usages (other partners) ARE in scope — see §4.
- **Delete All Usages button** — write operation, requires auth/permissions work first.
- **Versions UI (derivative/replaced)** — PR #4525 stale. Separate design work needed.
- **Syndication rights / RCS** — separate system, already tracked elsewhere.
