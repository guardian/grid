# Syndication & Leases — Architecture

> Permanent reference for how syndication status, syndication rights, and
> lease handling work in Kupua. Covers data model, client-side computation,
> search filtering, and UI surfaces.
>
> Companion files:
> - [07-lease-ui-showcase.html](07-lease-ui-showcase.html) — static HTML mockup of all
>   lease panel combinations (single + multi-image)
> - [`../deviations.md`](../deviations.md) — deviation entries §SY (date-based active,
>   display/filter mismatch, Painless alternative, syndicationStartDate, lease panel sort)
> - [`enrichment-strategy.md`](enrichment-strategy.md) — §A proves search endpoint enrichment
>   parity (relevant because syndicationStatus was formerly API-only)

---

## 1. What it is

Syndication status is a five-value classification of whether an image can be
syndicated to partners. Kupua computes it **client-side from raw ES data** — no
media-api dependency. This replaces the server-computed `syndicationStatus` field
on Grid's `Image.scala` model (a Scala `def`, never stored in ES).

The lease system records access permissions per image. Four lease types exist:
`allow-use`, `deny-use`, `allow-syndication`, `deny-syndication`. Kupua determines
lease active/pending/expired state via **date-based computation** rather than
trusting the stale `active` field in ES.

---

## 2. Key architecture decisions

1. **Client-side syndication status.** `syndicationStatus` is not stored in ES — it
   is a computed Scala `def` on the media-api model. Kupua derives it from three
   stored fields: `syndicationRights`, `leases`, and `usages`. No API dependency.

2. **Date-based lease active detection.** The `active` field in ES is set at thrall
   index time and becomes stale when leases expire without re-indexing. Kupua computes
   `isLeaseActive(lease, nowMs)` from `startDate`/`endDate` on every render. Cost:
   sub-millisecond per page (integer comparison × ~2 leases × 200 images). This is
   kupua's **single deliberate departure from Kahuna's display logic** — and it is
   strictly more correct.

3. **Display matches `Image.scala`, search filter matches `SyndicationFilter.scala`.**
   The display computation uses the simpler per-image priority logic (no category gate,
   no published-date gate). The search filter (`?syndicationStatus=review`) applies the
   full composite query including `syndicatableCategory` and `syndicationStartDate`.
   This asymmetry matches Kahuna exactly and is documented in deviations.md.

4. **Dot-path SOURCE_INCLUDES.** Only the needed sub-fields of `syndicationRights` are
   fetched: `rights.acquired`, `published`, `isInferred`. The large `rights[].properties[]`
   and `suppliers[]` arrays are stripped at ES response time. Verified against PROD.

5. **No Painless scripts.** Kupua is a pure frontend — cannot deploy runtime fields.
   Where media-api uses Painless (deny-syndication expiry in the "review" filter), kupua
   uses a date-range clause on `leases.leases.endDate`. Sound because the Lease service
   enforces at most one deny-syndication lease per image.

6. **Phantom field removal.** `syndicationStatus` and `persisted` were in
   `SOURCE_INCLUDES` — both are server-computed fields that ES silently ignores.
   Removed, along with their dead term filters in `es-adapter.ts`.

---

## 3. ES data model

### 3.1 syndicationRights (stored)

```
syndicationRights: {
  published: date,
  isInferred: boolean,
  rights: [{ acquired: boolean, rightCode: keyword, properties: [...] }],
  suppliers: [{ supplierId, supplierName, prAgreement }]
}
```

**Fetched via SOURCE_INCLUDES (dot-paths):**
- `syndicationRights.published`
- `syndicationRights.isInferred`
- `syndicationRights.rights.acquired`

`rightCode`, `properties[]`, and `suppliers[]` are NOT fetched (unused by display or filter).

### 3.2 Leases (stored, already fetched)

`leases` is in SOURCE_INCLUDES. Shape:
```
leases: {
  lastModified: date,
  leases: [{
    id, leasedBy, startDate, endDate, access, active, notes, mediaId, createdAt
  }]
}
```

**`leases.leases` is a plain object field, NOT nested.** Term queries work directly:
`{ term: { "leases.leases.access": "allow-syndication" } }`.

Four `access` values: `allow-use`, `deny-use`, `allow-syndication`, `deny-syndication`.

Typed as `LeaseAccess` union in `src/types/image.ts`.

#### 3.2.1 The `active` field — why kupua ignores it

`active` is computed by Scala at serialization time (`MediaLease.scala`), stored as a
keyword snapshot. It is refreshed ONLY when:
- All leases on the image are replaced (batch set)
- Manual `/leases/reindex` endpoint is triggered
- Full image re-ingest

There is **no cron or scheduled refresh**. An expired `allow-use` lease retains
`active: "true"` indefinitely until something triggers re-indexing.

Kupua uses `isLeaseActive()` everywhere: syndication status computation, validity map
(`shouldOverride`), deny-syndication warning, leases panel dimming/sorting.

```typescript
function isLeaseActive(lease: Lease, nowMs: number): boolean {
  const started = !lease.startDate || new Date(lease.startDate).getTime() <= nowMs;
  const notExpired = !lease.endDate || new Date(lease.endDate).getTime() >= nowMs;
  return started && notExpired;
}
```

`Date.now()` is hoisted once per render/batch — never inside a per-lease loop.

### 3.3 Usages (stored, already fetched)

`usages` is in SOURCE_INCLUDES. `usages[].platform` values include `"syndication"` —
walked in memory for the "sent" status computation.

### 3.4 usagesPlatform (query-only, NOT in _source)

A top-level keyword populated via `copy_to` from `usages[].platform`. Indexed for queries
but not stored in `_source` — cannot be fetched via SOURCE_INCLUDES. Used in the "sent"
search filter: `{ term: { usagesPlatform: "syndication" } }`.

---

## 4. Syndication status computation

### 4.1 Display derivation (per-image, client-side)

File: `src/lib/syndication/calculate-syndication-status.ts`

```
calculateSyndicationStatus(image, nowMs) → SyndicationStatus
```

Priority order (mirrors `Image.scala#syndicationStatus`):
1. No `syndicationRights` or no `rights[].acquired === true` → **unsuitable**
2. `usages` contains `platform === "syndication"` → **sent**
3. Active `allow-syndication` lease AND no active `deny-syndication` lease → **queued**
4. Active `deny-syndication` lease → **blocked**
5. Otherwise → **review**

**Departure from Kahuna:** step 3/4 uses `isLeaseActive()` (date-based) instead of
existence-only. Fixes the stale deny-syndication bug. See §3.2.1.

**Omissions vs `SyndicationFilter.scala` (intentional):** no `syndicatableCategory`
gate, no `syndicationRights.published <= now` gate. PROD aggregation found 2 docs
affected. Matches Kahuna's display behaviour exactly.

### 4.2 Search filter (composite ES query)

File: `src/dal/es-adapter.ts` — `buildSyndicationStatusFilter(status, startDate?)`

| Status | ES query logic |
|---|---|
| `unsuitable` | `syndicationRights.rights.acquired` missing OR false |
| `sent` | rights acquired + syndicatable category + `usagesPlatform: "syndication"` |
| `queued` | rights acquired + syndicatable category + `allow-syndication` lease + started + published ≤ now + no syndication usage |
| `blocked` | rights acquired + `deny-syndication` lease |
| `review` | rights acquired + syndicatable category + no allow-syndication + no active deny-syndication (date-range on `endDate`) |

**Config-driven values:**
- `gridConfig.syndicatableCategories` — `["staff-photographer", "contract-photographer", "commissioned-photographer"]` (same set as blue-border logic in `image-borders.ts`)
- `gridConfig.syndicationStartDate` — `null` (no PROD cutoff; set to SSM secret for PROD deployment)

**URL wiring:** `syndicationStatus` threads through `search-params-schema` →
`useUrlSearchSync` → `search-store` → `buildQuery` → `buildSyndicationStatusFilter`.
No special integration needed — same pattern as all other search params.

---

## 5. UI surfaces

### 5.1 Grid/table badge

Component: `src/components/SyndicationBadge.tsx`

`monetization_on` SVG icon with status-driven colour:

| Status | Colour | Shown? |
|---|---|---|
| `sent` | green | Yes |
| `queued` | orange | Yes |
| `blocked` | red | Yes |
| `review` | white | Yes |
| `unsuitable` | — | Hidden (no badge) |

Tooltip text from `src/lib/syndication/syndication-reason.ts`.

Rendered in:
- Grid thumbnail bottom icon bar (`ImageGrid.tsx`)
- Table badges column (`field-registry.tsx`) alongside cost/validity badges

### 5.2 Info panel — Syndication Rights section

Location: bottom of `ImageMetadata.tsx`.

Three variants:
- `syndicationRights` absent → "No information available."
- `rights[].acquired === true` → "Syndication rights have been acquired for this image."
- No acquired rights → "Syndication rights have **not** been acquired for this image."

`isInferred` and `published` are available on the type but **not rendered in v1** (matches
Kahuna; data layer ready for future iteration without schema changes).

### 5.3 Deny-syndication warning banner

Condition: active `deny-syndication` lease (via `isLeaseActive()`) AND
`gridConfig.showDenySyndicationWarning === true`.

Rendering:
- If validity banner already showing → appended as `<li>` inside it
- If no validity banner → standalone amber banner

Matches Kahuna's `gr-metadata-validity` two-path pattern.

### 5.4 Leases panel

**Single image:** Cards with coloured top border (teal=allow, red=deny). Three states:
- **Active:** full opacity, shows "Expires in X" or "Never expires"
- **Pending:** full opacity, "(pending)" label, shows "Starts in X"
- **Expired:** dimmed, shows "Expired X ago"

Sort order: use before syndication → deny before allow → active → pending → expired →
creation date within sub-group.

Tooltips include absolute timestamps. Past start dates suppressed for active leases.

**Multi image (selection):** Per-type active and pending counts with ALL/SOME indicators
(●/◐), coloured left borders, "All images" (bold) vs "N of M" display. Expired leases
collapse to a single footnote. Total for ALL/SOME derived from metadata cache size (not
selection count) to prevent twitch during async load.

See [07-lease-ui-showcase.html](07-lease-ui-showcase.html) for all visual combinations.

---

## 6. Deviations from Kahuna (summary)

| Deviation | Rationale |
|---|---|
| Date-based `isLeaseActive()` instead of trusting `active` field | Fixes stale-snapshot bug (§3.2.1); sub-ms cost |
| Display/filter asymmetry preserved (no category/published gate on display) | Matches Kahuna; 2 docs affected in PROD |
| Date-range filter instead of Painless script for "review" | Can't deploy Painless from frontend; sound given 1-lease-per-type constraint |
| `syndicationStartDate = null` | SSM secret not committed to public repo; `null` = TEST/CODE path |
| Lease panel sorted by type/state/date | Kahuna shows insertion order — useless for editorial decisions |
| Pending lease state (third state beyond active/expired) | Kahuna conflates pending with "inactive" |
| Sub-day precision ("Expires in 3 hours") | Kahuna uses `moment.fromNow()` with similar granularity |
| Multi-image per-type breakdown with ALL/SOME | Kahuna shows only total count — functionally useless |

Full details in [`../deviations.md`](../deviations.md).

---

## 7. File map

| File | Role |
|---|---|
| `src/lib/syndication/calculate-syndication-status.ts` | `calculateSyndicationStatus()`, `isLeaseActive()` |
| `src/lib/syndication/syndication-reason.ts` | Status → tooltip text mapping |
| `src/components/SyndicationBadge.tsx` | Reusable badge component (icon + colour + tooltip) |
| `src/dal/es-adapter.ts` | `buildSyndicationStatusFilter()` (composite ES query per status) |
| `src/dal/es-config.ts` | SOURCE_INCLUDES (dot-paths for syndicationRights) |
| `src/lib/grid-config.ts` | `syndicatableCategories`, `syndicationStartDate`, `showDenySyndicationWarning` |
| `src/lib/cost/validity-map.ts` | Uses `isLeaseActive()` for allow-use/deny-use lease checks |
| `src/lib/derive-enriched-image.ts` | Wires `calculateSyndicationStatus` as baseline field |
| `src/types/image.ts` | `SyndicationRights`, `LeaseAccess`, `SyndicationStatus` types |
| `src/components/ImageMetadata.tsx` | Syndication rights section, deny-syndication banner, lease cards |

---

## 8. Future work (not in scope)

- **"Send to Photo Sales" action** — batch syndication to partners. Requires media-api
  write access. Phase 3+.
- **`isInferred` display** — data available on type, not rendered. Surface when UX
  design is ready.
- **`syndicationStartDate` for PROD** — set from SSM secret when runtime config system
  is built.
- **Overlapping conflicting leases** — what trumps what when `allow-use` and `deny-use`
  are both active? Not investigated yet.
