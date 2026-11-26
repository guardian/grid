# Client-side coverage: `search-chips-results.feature` vs `main`

## Method

- Full e2e suite run once on `dk-add-chips-search-results-tests` with `GRID_ENABLE_COVERAGE=true` (265 tests, all passed).
- No `kahuna/` changes in this PR and `search-chips.feature` only has comment changes, so the **main baseline** is the union of
  client coverage from the 185 pre-existing scenarios. Each of the 77 new scenarios in
  [search-chips-results.feature](search-chips-results.feature) is compared against that baseline.
- Caveat: fixture changes in this PR could marginally alter client paths hit by existing search-chips scenarios versus a real `main` run.
- Two API-only scenarios produce no browser coverage and are excluded.

## Totals (kahuna)

| Metric     | main  | branch | added |
|------------|------:|-------:|------:|
| Functions  | 1459  | 1472   | +13   |
| Branches   | 1238  | 1252   | +14   |
| Statements | 4616  | 4635   | +19   |
| Lines      | 10175 | 10202  | +27   |

## A. Scenarios adding meaningful client search-logic coverage (4)

1. **Label collection and photoshoot constraints intersect with archive persistence** — adds ~11 functions / 12 branches:
   - Label chips: `suggestLabels` ([query-suggestions.ts](../../../kahuna/public/js/search/structured-query/query-suggestions.ts#L266-L270)),
     `case 'label'` ([structured-query/syntax.ts](../../../kahuna/public/js/search/structured-query/syntax.ts#L96)),
     `hasSpace` / `createLabel` / `getLabel` ([query-syntax.js](../../../kahuna/public/js/search-query/query-syntax.js#L1-L27))
   - Collection chips: `case 'collection'` ([structured-query/syntax.ts](../../../kahuna/public/js/search/structured-query/syntax.ts#L97)),
     path cleanup ([query-syntax.js](../../../kahuna/public/js/search-query/query-syntax.js#L37)),
     collection matching ([gr-collections-panel.js](../../../kahuna/public/js/components/gr-collections-panel/gr-collections-panel.js#L176-L178))
   - `'static-filter'` case ([gr-cql-input/syntax.ts](../../../kahuna/public/js/components/gr-cql-input/syntax.ts#L84),
     [structured-query/syntax.ts](../../../kahuna/public/js/search/structured-query/syntax.ts#L109))
   - Collection sort-order switch ([gr-sort-control.tsx](../../../kahuna/public/js/components/gr-sort-control/gr-sort-control.tsx#L66-L75))
   - `orderBy` watcher and early return ([query.js](../../../kahuna/public/js/search/query.js#L579-L581),
     [query.js](../../../kahuna/public/js/search/query.js#L631-L638))
2. **Supplemental metadata values** › `illustrator:"Example Contracted Illustrator"`
3. **Supplemental metadata values** › `illustrator:"Example Staff Illustrator"`
4. **Supplemental metadata values** › `illustrator:"Example Commissioned Illustrator"`

   Items 2–4 cover `listIllustrators` ([query-suggestions.ts](../../../kahuna/public/js/search/structured-query/query-suggestions.ts#L245-L251)).

## B. Incidental client coverage only (server-side tests, 45)

Coverage here comes from rendering new fixture data, not from exercising search logic.

### `keywords` branch in [graphic-image-blur.js](../../../kahuna/public/js/services/graphic-image-blur.js#L49) (34)

Any one of these covers it; collectively they add a single branch.

- Combining city and keyword filters returns only the image matching both
- Excluding a keyword retains the positive city constraint
- Searching the pay-to-use category includes legacy chargeable images
- Configured aliases: `fixtureSubject:sport`, `fixtureReference:search-chips-harbour-daylight-jpeg`, `fixtureHasPerson:true`, `fixtureHasPerson:false`
- Core combination: `leasedBy:grid-e2e-account@guardian.co.uk persisted:leases`
- Date combination: `date:2024-06-15 has:dateTaken`, `date:2024-06-15 -has:dateTaken`
- Persistence reason: `persistence-identifier` (×3), `exports`, `archived`, `photographer-category`, `illustrator-category`,
  `commissioned-agency`, `leases`, `persisted-collection`, `photoshoot`, `labeled`, `edited`
- Supplemental metadata: `category:commissioned-agency supplier:Alamy`, `title:"Search chips edited title"`
- Supplier: AAP, Alamy, Allstar Picture Library, EPA, Getty Images, PA, Rex Features, Ronald Grant Archive, Action Images

### Above plus `showSendToPhotoSales` in [preview/image.js](../../../kahuna/public/js/preview/image.js#L67) (8)

- Persistence reason: `usages`
- Usage query: `usages@platform:download usages@status:downloaded`
- Usage query: `usages@platform:"Added to Photo Sales" usages@status:syndicated`
- Usage query: `usages@status:derivative`
- Usage query: `usages@status:failed`
- Usage query: `usages@status:unknown`
- Usage query: `usages@status:removed usages@reference:"Search Chips Harbour Story"`
- Usage query: `usages@status:removed usages@reference:"https://search-chips.invalid/stories/harbour"`

### No-results telemetry `query || ''` in [telemetry.ts](../../../kahuna/public/js/services/telemetry.ts#L54) (3)

- Deleted image query: `uploader:grid-e2e-account@guardian.co.uk`
- Deleted image query: `is:deleted uploader:grid-e2e-account@guardian.co.uk`
- Deleted image query: `is:deleted uploader:search-chips-other@guardian.co.uk`

## C. No extra client coverage — server-side only (28)

- Agency-pick search uses the configured agency-pick terms
- Reapable search excludes an old image with a persistence identifier
- Platform and status filters must match the same usage
- Quota query: `is:under-quota`, `-is:under-quota`
- Category query: `category:pr-and-third-party`, `category:publisher-photography`
- Supplemental metadata: `fileType:tiff`, `fileType:tif`, `subject:weather`, `by:"Example Contracted Photographer"`,
  `category:contract-photographer`, `category:commissioned-photographer`, `category:Bylines`
- Core combination: `fileType:png has:crops`, `fileType:jpeg -has:crops`, `in:Somerset keyword:daylight`,
  `city:Somerset keyword:daylight`, `location:Harbourside keyword:night`, `is:GNM-owned-photo`,
  `is:GNM-owned-illustration`, `is:GNM-owned`
- Usage status combination: `usages@status:published`, `usages@status:replaced`,
  `usages@status:published -usages@status:replaced`, `usages@status:published usages@status:replaced`,
  `usages@status:replaced -usages@status:published`
- Date combination: `usages@>added:2024-06-15 usages@<added:2024-06-15`

## Summary

| Category | Scenarios |
|---|---:|
| A. Meaningful client search-logic coverage | 4 |
| B. Incidental client coverage only | 45 |
| C. Server-side only | 28 |
| **Total** | **77** |
