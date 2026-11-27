# TypeScript Errors — Fixed 1 Jun 2026

Catalogued and fixed 2026-06-01. All errors present before / independent of the B2
fusion refactor unless noted.

**Status: ALL FIXED ✅** — 0 TS errors, 871/871 unit tests pass, 240/240 e2e tests pass.

---

## Group A — Introduced by B2 refactor ✅ FIXED

| File | Line | Error |
|------|------|-------|
| `src/dal/es-adapter.ts` | 829 | `FilterAggRequest` used but not in import list |
| `src/stores/search-store.ts` | 1896 | `countWithTickers(decorated, signal)` — interface only takes 1 arg; signal dropped |

---

## Group B — `handleLongPressStart` source + test type mismatch ✅ FIXED

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

Fix applied: widened `AddRangeEffect.targetGlobalIndex` to `number | undefined` and
`targetSortValues` to `SortValues | null` — matching how the range logic already handles
missing cursors. Test fix: added `import type { Image }` and cast `vi.fn()` return value
`as unknown as Image`.

---

## Group C — History snapshot tests ✅ FIXED

| File | Line | Error |
|------|------|-------|
| `src/lib/history-snapshot.test.ts` | 10 | `newCountSince?: string \| null \| undefined` — field is `string \| null` (no `undefined`) |
| `src/lib/build-history-snapshot.test.ts` | 1 | `afterEach` imported but never used |

Fix applied: removed `undefined` variant from fixture type; removed unused `afterEach` import.

---

## Group D — Syndication tests ✅ FIXED

| File | Lines | Error |
|------|-------|-------|
| `src/lib/syndication/calculate-syndication-status.test.ts` | 28, 36 | `leases` not on `Partial<{ lastModified?; leases? } \| undefined>` — `Partial` of a union flattens unexpectedly |

Fix applied: changed fixture type to `Partial<NonNullable<SyndicationInfo>>`.

---

## Group E — Search store tests ✅ FIXED

| File | Line | Error |
|------|------|-------|
| `src/stores/search-store-pit.test.ts` | 34 | `waitFor` imported but never used |
| `src/stores/search-store.test.ts` | 1849 | Unsafe `as Image[]` cast — intermediate image shape missing `uploadedBy`, `source` |

Fix applied: removed unused `waitFor` import; cast via `unknown` intermediate.

---

## Group F — Selection store readonly/indexing issues ✅ FIXED

Root cause: `FIELD_REGISTRY` returns `readonly FieldDefinition[]` but several
selection-store methods pass it to functions expecting mutable `FieldDefinition[]`.
Test: mock localStorage keyed by string literal can't be indexed by `"kupua-selection"`.

| File | Lines | Error |
|------|-------|-------|
| `src/stores/selection-store.ts` | 266,279,290,460,487,490,537,541,570 | `readonly FieldDefinition[]` not assignable to `FieldDefinition[]` |
| `src/stores/selection-store.test.ts` | 388 | `"kupua-selection"` can't index mock localStorage type |

Fix applied: added `readonly` to parameter types of the receiving functions. Test:
cast `mockStorage` to `Record<string, string>`.

---

## Group G — Hooks null-safety (22 errors, 4 files) ✅ FIXED

All refs are `querySelector` / `useRef.current` results typed as `Element | null`.

| File | Lines | Error |
|------|-------|-------|
| `src/hooks/useLongPress.ts` | 85, 121 | `el` possibly null |
| `src/hooks/usePinchZoom.ts` | 198,200,203,207,227,231,248,265,500 | `img` / `container` possibly null |
| `src/hooks/useSwipeCarousel.ts` | 192,240,246,247,269,284,285,287,303,315,316,320,321,323 | `strip` / `container` possibly null |
| `src/hooks/useSwipeDismiss.ts` | 143,144,145,174,178,189,191,192,204,229,230,233,255,256,257,331,338,339,340,369,374,382,385,386,387,391,392,402,403,404,405,411,414,417 | `container` / `wrapper` / `transformEl` possibly null |

Fix pattern: changed `const el = ref.current` to `const el = ref.current!` (non-null
assertion at capture site) while keeping the runtime `if (!el) return` guard above it.
TypeScript does not narrow `const T | null` across closure boundaries — the `!` tells
TS what the runtime guard already guarantees. The residual risk (ref becoming null after
the outer guard but before a closure fires) cannot happen in a synchronous event handler
chain.

---

## Group H — Misc components and libs ✅ FIXED

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

Fixes applied:

- **`ImageMetadata.tsx`**: exported `Lease` from `@/types/image`; used
  `as unknown as Lease` double-cast in `leaseSortKey` (the parameter type doesn't carry
  `id: string` so a direct cast is unsafe).
- **`MultiImageMetadata.tsx`**: added `ReconciledView` to import; replaced stale
  `kind !== "chip-array"` / `kind !== "summary"` / `kind === "mixed"` / `kind === "all-same"`
  checks with direct `rec?.kind === "X"` narrowing — using a separate `kind` variable
  prevents TypeScript from narrowing the `rec` discriminated union.
- **`MultiValue.tsx`**: cast `entry.value as string` (value is `unknown`, formatter
  expects `string`).
- **`useUrlSearchSync.ts`**: changed `searchOnly.orderBy` to `searchParams.orderBy`
  (`searchOnly` inferred as `{}` value type; `searchParams` has properly typed
  `orderBy?: string`).
- **`calculate-cost.ts`**: exported `UsageRights` from `@/types/image` (was unexported).
  Chose `@/types/image` over `@/dal/grid-api/types` because cost calculation operates on
  ES-sourced data. The two types differ: `image.ts` has `category?: string` (optional)
  vs grid-api has `category: string` (required).
- **`derive-enriched-image.ts` line 134**: cast `(overlay?.usages ?? image.usages) as Image["usages"]`.
  The structural incompatibility is in `digitalUsageMetadata`: grid-api types it as
  `unknown`, `image.ts` types it as `{ webUrl?; webTitle?; sectionId?; composerUrl? } | undefined`.
  The field is not consumed anywhere in kupua — it's passed through — so the cast is
  safe in practice. The underlying type divergence between the two `Usage` types remains
  latent and should be addressed when the Grid API DAL is formalised.
- **`derive-enriched-image.test.ts`**: added `hasActiveAllowLease: false` to
  `leasesSummary` fixture; updated the corresponding `toEqual` assertion to include it.
- **`field-registry.tsx` / `grid-config.ts`**: added `imageTypes: [] as string[]` to
  `gridConfig`. The property was referenced but not defined. Empty array is safe — any
  conditional on `.length` no-ops. Worth revisiting if image-type filtering is ever
  implemented.
- **`Lease` / `UsageRights` exports**: both interfaces were unexported in `@/types/image.ts`.
  Exported both; no callers needed updating.
- **`dal/grid-api/types.ts`**: `Usage.references` changed from required to optional
  (`references?: UsageReference[]`) to match `@/types/image.ts`.

---

## Decisions with residual uncertainty

1. **`gridConfig.imageTypes: []`** — Unknown what this is supposed to contain. May be
   a future feature placeholder. The empty array silently no-ops any UI branch that
   checks its length, which could hide missing functionality.

2. **`(overlay?.usages ?? image.usages) as Image["usages"]`** — Hides a real structural
   type mismatch (`digitalUsageMetadata: unknown` vs typed object). Safe now because the
   field is pass-through only, but will become a real issue if any consumer tries to
   access `digitalUsageMetadata` properties via the enriched type.

3. **`UsageRights` — two incompatible types** — `image.ts` (`category?: string`) and
   `grid-api/types.ts` (`category: string`) remain structurally divergent. The right fix
   is a shared base type or a single source of truth once the Grid API DAL is formalised.
