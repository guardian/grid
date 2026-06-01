# TypeScript Errors To Fix

Catalogued 2026-06-01. All errors present before / independent of the B2 fusion
refactor unless noted. Fix Group A first (introduced by B2); rest are pre-existing.

---

## Group A — Introduced by B2 refactor ✅ FIXED

| File | Line | Error |
|------|------|-------|
| `src/dal/es-adapter.ts` | 829 | `FilterAggRequest` used but not in import list |
| `src/stores/search-store.ts` | 1896 | `countWithTickers(decorated, signal)` — interface only takes 1 arg; signal dropped |

---

## Group B — `handleLongPressStart` source + test type mismatch

Root cause: `AddRangeEffect` requires `targetGlobalIndex: number` and
`targetSortValues: SortValues` (non-nullable), but Map.get returns
`number | undefined` and extractSortValues can return `null`.
Test uses `vi.fn()` which resolves to `Mock<Procedure | Constructable>` — too broad for
the typed `(effect: AddRangeEffect) => void`.

| File | Lines | Error |
|------|-------|-------|
| `src/lib/handleLongPressStart.ts` | 55 | `targetGlobalIndex`: `number \| undefined` not assignable to `number` |
| `src/lib/handleLongPressStart.ts` | 56 | `targetSortValues`: `SortValues \| null` not assignable to `SortValues` |
| `src/lib/handleLongPressStart.test.ts` | 108,117,133,157,184,203 | `handleRange: vi.fn()` not assignable to typed callback |

Fix: either widen `AddRangeEffect.targetGlobalIndex` to `number | null` and
`targetSortValues` to `SortValues | null`, matching how the range logic already
handles missing cursors; or guard with fallback values before passing. Test fix:
cast `vi.fn()` to the correct signature or use `vi.fn<[AddRangeEffect], void>()`.

---

## Group C — History snapshot tests

| File | Line | Error |
|------|------|-------|
| `src/lib/history-snapshot.test.ts` | 10 | `newCountSince?: string \| null \| undefined` — field is `string \| null` (no `undefined`) |
| `src/lib/build-history-snapshot.test.ts` | 1 | `afterEach` imported but never used |

Fix: remove `undefined` from test fixture type / use `null`; remove unused import.

---

## Group D — Syndication tests

| File | Lines | Error |
|------|-------|-------|
| `src/lib/syndication/calculate-syndication-status.test.ts` | 28, 36 | `leases` not on `Partial<{ lastModified?; leases? } \| undefined>` — `Partial` of a union flattens unexpectedly |

Fix: change test fixture type to `Partial<NonNullable<SyndicationInfo>>` or cast explicitly.

---

## Group E — Search store tests

| File | Line | Error |
|------|------|-------|
| `src/stores/search-store-pit.test.ts` | 34 | `waitFor` imported but never used |
| `src/stores/search-store.test.ts` | 1849 | Unsafe `as Image[]` cast — intermediate image shape missing `uploadedBy`, `source` |

Fix: remove unused import; add missing required fields to test fixture (or cast via `unknown`).

---

## Group F — Selection store readonly/indexing issues

Root cause: `FIELD_REGISTRY` returns `readonly FieldDefinition[]` but several
selection-store methods pass it to functions expecting mutable `FieldDefinition[]`.
Test: mock localStorage keyed by string literal can't be indexed by `"kupua-selection"`.

| File | Lines | Error |
|------|-------|-------|
| `src/stores/selection-store.ts` | 266,279,290,460,487,490,537,541,570 | `readonly FieldDefinition[]` not assignable to `FieldDefinition[]` |
| `src/stores/selection-store.test.ts` | 388 | `"kupua-selection"` can't index mock localStorage type |

Fix: add `readonly` to the parameter types of the receiving functions, or spread
(`[...FIELD_REGISTRY]`) at the call sites. Test: cast `mockStorage` to
`Record<string, string>` or add the key to the mock type.

---

## Group G — Hooks null-safety (22 errors, 4 files)

All refs are `querySelector` / `useRef.current` results typed as `Element | null`.
Fix pattern is early-return guards or non-null assertions where the logic already
guarantees non-null (inside event handlers registered only after the element exists).

| File | Lines | Error |
|------|-------|-------|
| `src/hooks/useLongPress.ts` | 85, 121 | `el` possibly null |
| `src/hooks/usePinchZoom.ts` | 198,200,203,207,227,231,248,265,500 | `img` / `container` possibly null |
| `src/hooks/useSwipeCarousel.ts` | 192,240,246,247,269,284,285,287,303,315,316,320,321,323 | `strip` / `container` possibly null |
| `src/hooks/useSwipeDismiss.ts` | 143,144,145,174,178,189,191,192,204,229,230,233,255,256,257,331,338,339,340,369,374,382,385,386,387,391,392,402,403,404,405,411,414,417 | `container` / `wrapper` / `transformEl` possibly null |

---

## Group H — Misc components and libs

| File | Line | Error | Notes |
|------|------|-------|-------|
| `src/components/ImageMetadata.tsx` | 121 | `{ startDate?; endDate? }` not assignable to `Lease` | `Lease` type gained required fields |
| `src/components/MultiImageMetadata.tsx` | 75 | `ReconciledView` not found | Stale name — type was renamed |
| `src/components/MultiImageMetadata.tsx` | 137,200,204,206,207,213,214,236,262,268 | Stale property names (`chips`, `total`, `line`, `topValues`, `value`) on `FieldReconciliation` | Component not updated after type refactor |
| `src/components/MultiValue.tsx` | 74 | `{}` not assignable to `string` | Likely `value ?? ""` needed |
| `src/hooks/useUrlSearchSync.ts` | 344 | `{}` not assignable to `string` | Same pattern |
| `src/lib/cost/calculate-cost.ts` | 27 | `UsageRights` not exported from `@/types/image` | Either add export or import from the correct path |
| `src/lib/derive-enriched-image.ts` | 134 | `Usage[] \| Usage[] \| undefined` — duplicate branch in union | Redundant union arm, TS flags it |
| `src/lib/derive-enriched-image.test.ts` | 152 | `hasActiveAllowLease` missing from test fixture | Type gained new required field |
| `src/lib/field-registry.tsx` | 423 | `imageTypes` not on grid config type | Config type missing property or wrong key name |
