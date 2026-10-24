# Syndication — Workplan & Architecture

> Created: 16 May 2026. Status: workplan (pre-implementation).
> Becomes architecture doc once work is done.

---

## 1. Goal

Kupua must support:
1. **syndicationStatus badges** on grid/table thumbnails (matching Kahuna)
2. **syndicationStatus search filtering** via URL param `?syndicationStatus=review` etc.
3. **Syndication Rights display** in the info panel ("rights acquired" / "not acquired" / "no info")
4. All of the above computed **client-side from ES data** — no media-api dependency.

---

## 2. Current State (broken)

### 2.1 Phantom fields in SOURCE_INCLUDES

`es-config.ts` includes `"syndicationStatus"` in `SOURCE_INCLUDES`. This field **does not
exist in Elasticsearch**. It is a computed property on media-api's `Image.scala` model (a Scala
`def`, not stored). ES silently ignores the request — the field is always absent from `_source`.

Same problem: `"persisted"` — also server-computed, never stored.

### 2.2 Broken ES query filter

`es-adapter.ts` line 258: `{ term: { syndicationStatus: params.syndicationStatus } }` queries
a non-existent field. This filter always returns zero hits.

### 2.3 `deriveImage()` only gets syndicationStatus from API overlay

`derive-enriched-image.ts` line 125: `syndicationStatus: overlay?.syndicationStatus` — only
populated when API enrichment fires (which is abandoned for grid/table views). This field is
always `undefined` in normal operation.

### 2.4 syndicationRights not fetched from ES

`syndicationRights` is **not** in `SOURCE_INCLUDES`. It exists in ES (mapped in
`Mappings.scala:213`) but kupua never fetches it in search responses. Only available via
single-image API enrichment (abandoned path).

---

## 3. What Exists in Elasticsearch

### 3.1 syndicationRights (stored)

ES mapping (`Mappings.scala:213`):
```
syndicationRights: {
  published: date,
  suppliers: [{ supplierId: keyword, supplierName: keyword, prAgreement: boolean }],
  rights: [{ rightCode: keyword, acquired: boolean, properties: [...] }],
  isInferred: boolean
}
```

Example document shape:
```json
{
  "syndicationRights": {
    "published": "2026-05-16T09:00:08.000+00:00",
    "suppliers": [],
    "rights": [{ "rightCode": "LICENSINGNONSUBSALES", "acquired": true, "properties": [...] }],
    "isInferred": false
  }
}
```

**What kupua needs from this (minimal fetch):**
- `syndicationRights.published` — date (for "published before now" check in queued filter)
- `syndicationRights.isInferred` — boolean (for display; inferred rights are weaker signal)
- `syndicationRights.rights.acquired` — boolean (the key "rights acquired" signal)

**What kupua does NOT need:**
- `syndicationRights.rights[].properties[]` — detailed licensing terms (large, irrelevant)
- `syndicationRights.suppliers[]` — supplier info (irrelevant for status computation)

### 3.2 Leases (stored, already fetched)

`"leases"` is already in `SOURCE_INCLUDES`. Shape:
```
leases: {
  lastModified: date,
  leases: [{
    id: keyword, leasedBy: keyword, startDate: date, endDate: date,
    access: keyword, active: keyword, notes: text, mediaId: keyword, createdAt: date
  }]
}
```

Four `access` values: `allow-use`, `deny-use`, `allow-syndication`, `deny-syndication`.

**`leases.leases` is a plain object, NOT a nested field** (verified against PROD
`images_current` mapping, 16 May 2026). This is an asymmetry with `usages` (which IS nested,
hence the `usagesPlatform` `copy_to` workaround in §3.4). For lease queries, plain term
clauses work: `{ term: { "leases.leases.access": "allow-syndication" } }` — no `nested`
wrapping required.

**Important lease rules (from `MediaLease.scala`):**
- `allow-syndication` leases **cannot have an endDate** (they never expire)
- `deny-syndication` leases **cannot have a startDate** (they're active immediately)
- `lease.active` is stored as a **keyword** (snapshot at index time — stale!)

#### 3.2.1 `lease.active` staleness — full mechanics

`active` is a **Scala `def`** on `MediaLease`, computed from `startDate`/`endDate` vs `now`.
It is NOT a constructor parameter — `Json.reads[MediaLease]` ignores it when deserializing.
`MediaLeaseWrites` explicitly adds it to JSON as a bonus field. Thrall's Painless script
stores whatever JSON it receives — no date logic.

**What triggers a fresh `active` snapshot in ES:**

| Action | Refreshes `active` for ALL leases on the image? |
|---|---|
| Add a lease | **No** — only the new lease gets a fresh `active` |
| Remove a lease | **No** — remaining leases keep their stale snapshots |
| Replace all leases (batch set) | **Yes** — Leases service re-fetches all from DynamoDB, re-serializes |
| Manual `/leases/reindex` endpoint | **Yes** — iterates all leases, sends `ReplaceImageLeases` per image |
| Full image re-ingest/migration | **Yes** |
| Edit metadata, crop, add usage, etc. | **No** — leases untouched |

There is **no cron or scheduled refresh**. The `/leases/reindex` endpoint exists but must be
triggered manually.

**Staleness scenario:** Editor adds a `deny-use` lease on image X with `endDate: 2026-05-20`.
Thrall indexes `active: "true"`. May 21 arrives — nobody touches image X's leases. ES still
has `active: "true"`. Kupua (or any consumer trusting the snapshot) incorrectly treats the
lease as active.

**Practical impact by lease type:**
- `allow-syndication`: no `endDate` ever stored → **no staleness possible** (always active if exists)
- `deny-syndication`: no `startDate`, but CAN have `endDate` → **stale after expiry**
- `allow-use` / `deny-use`: both can have `startDate` and `endDate` → **stale in both directions**

**Media-api's own handling is inconsistent:**
- `Image.scala`'s `syndicationStatus` def: calls `.find(_.access == AllowSyndicationLease)` —
  checks lease **existence only**, never calls `.active` or checks dates. So even media-api's
  display computation doesn't handle expired deny-syndication leases correctly (an expired
  deny-syndication still shows "blocked").
- `SyndicationFilter.scala`: the search filter for `review` uses a **Painless runtime field**
  to check `endDate > now` — correctly excludes expired deny-syndication leases from the review
  queue. But the `blocked` filter is a simple `term` match with no expiry check.
- The Painless runtime field runs **only** during `syndicationStatus=review` filtered searches.
  Normal search results get `syndicationStatus` computed via `Image.scala` (existence-only).

**Implication for kupua:** since we compute client-side from raw ES data, we can be more
correct than media-api's display path by checking dates. See §4.4 for the decision.

### 3.3 Usages (stored, already fetched)

`"usages"` is already in `SOURCE_INCLUDES`. Shape includes `usages[].platform` which can be
`"syndication"` — needed for the "sent" status display computation (walk array in memory).

### 3.4 usagesPlatform (query-only, NOT in _source)

`usagesPlatform` is a **top-level keyword field** populated automatically via ES `copy_to` from
`usages[].platform` at index time (defined in `Mappings.scala:347`). It exists so that simple
`term` queries work without nested query syntax (since `usages` is a `NestedField`).

**Cannot be added to SOURCE_INCLUDES** — `copy_to` targets are indexed for querying but not
stored in `_source`. Requesting it returns nothing.

**Used in ES queries only:**
- `syndicationStatus=sent` filter: `{ term: { usagesPlatform: "syndication" } }`
- Future `usages@platform:digital` filter: `{ terms: { usagesPlatform: ["digital"] } }`
- Media-api exposes this as the `usagePlatform` search param → `terms("usagesPlatform", _)`

**Known platform values** (from Kahuna's `query-suggestions.ts`):
`print`, `digital`, `syndication`, `download`, `front`.

---

## 4. syndicationStatus Derivation Logic

Source: `Image.scala:44-67` + `SyndicationFilter.scala` (for the query-time equivalent).

### 4.1 Display computation (per-image, client-side)

```
function calculateSyndicationStatus(image):
  if !syndicationRights OR !any(rights[].acquired === true):
    return "unsuitable"
  if usages contains platform === "syndication":
    return "sent"
  if hasActiveAllowSyndicationLease AND !hasActiveDenySyndicationLease:
    return "queued"
  if hasActiveDenySyndicationLease:
    return "blocked"
  return "review"
```

**Active lease determination (don't trust `lease.active` snapshot):**
- `allow-syndication`: active if it exists (no endDate possible, no startDate check needed)
- `deny-syndication`: active if `endDate` is null OR `endDate > now` (no startDate possible)
- General formula: `startDate <= now` (or absent) AND `endDate >= now` (or absent)

### 4.2 Search filter (composite ES query, per status)

Media-api's `SyndicationFilter.scala` translates each status into composite ES queries against
stored fields. Kupua must replicate this in `es-adapter.ts`:

| Status | ES query |
|---|---|
| `unsuitable` | `syndicationRights.rights.acquired` missing OR false |
| `sent` | rights acquired AND `leases.leases.access: "allow-syndication"` AND `usagesPlatform: "syndication"` |
| `queued` | rights acquired AND NOT syndication usage AND `leases.leases.access: "allow-syndication"` AND lease started AND `syndicationRights.published <= now` (or absent) |
| `blocked` | rights acquired AND `leases.leases.access: "deny-syndication"` |
| `review` | rights acquired AND NOT allow-syndication AND NOT (active deny-syndication) |

**Complications in "review" filter:**
- Media-api uses a **Painless runtime field** (`syndicationReviewQueueFixMapping`) to check
  deny-syndication lease expiry at query time (because expired leases remain in the array).
- Filters by `syndicatableCategory` = `IsOwnedPhotograph` = `usageRights.category` in
  `["staff-photographer", "contract-photographer", "commissioned-photographer"]`.
  Same set as kupua's blue border logic (`image-borders.ts`). Already in SOURCE_INCLUDES.
  Use config-driven list (from `guardian-config.json` or similar) rather than hardcoding.
- In PROD, filters by `uploadTime >= syndicationStartDate` (config-driven cutoff).

**Complications in "queued" filter:**
- `leaseHasStarted`: `startDate` absent OR `startDate <= now`
- `syndicationRightsPublished`: `published` absent OR `published <= now`

### 4.3 Differences between display and search filter

The display computation (§4.1) walks the already-fetched `leases[]` and `usages[]` arrays in
memory. The search filter (§4.2) constructs an ES bool query. The two will diverge slightly,
intentionally:

- Search filter for "queued" checks `syndicationRights.published <= now` and
  `leaseHasStarted`. Display does NOT. Rationale: an aggregation against PROD (9.8M docs,
  16 May 2026) found **2 docs** with `syndicationRights.published > now` — essentially zero.
  No real-world value in adding a per-render date compare and a fourth code path for a case
  that doesn't occur. Display matches Kahuna's `Image.scala#syndicationStatus` for these
  gates; the search filter matches media-api's `SyndicationFilter.scala`. The `leaseHasStarted`
  gate is also redundant under §4.4 (date-based `isLeaseActive()` already excludes
  future-dated leases from "active").
- Search filter for "review" uses `syndicatableCategory` (staff/contract/commissioned
  photographer check). Display does NOT. Same reason: matches media-api's split. Some images
  may show a "review" badge but be absent from `?syndicationStatus=review` results — this is
  Kahuna's existing behaviour and we preserve it.

The one place we DO depart from Kahuna's display logic is §4.4 (date-based lease active),
which fixes a genuine staleness bug.

### 4.4 Lease active correctness — decision needed

Kupua can either:

**(A) Match Kahuna/media-api** — check lease existence only (`.access === "allow-syndication"`).
Pros: zero perf cost, no `Date` parsing, consistent with what users see in Kahuna.
Cons: an expired deny-syndication lease still shows "blocked" (rare but wrong).

**(B) Be correct** — compute `isLeaseActive()` from `startDate`/`endDate` vs `Date.now()`.
Pros: correct for expired deny-syndication leases.
Cons: requires `Date` parsing per lease per image in the render path.

**Performance analysis for option (B):**
- Hot path: grid render with 200 images × N leases per image.
- Most images have 0-2 leases. A page of 200 images → ~0-400 date parses.
- `new Date(isoString).getTime()` is fast (~microseconds). 400 calls ≈ sub-millisecond.
- `Date.now()` should be called once per derivation batch, not per lease.
- **Verdict: perf impact is negligible.** The concern would be if images had hundreds of
  leases each — they don't. The Lease service enforces at most 1 syndication lease per
  type (allow-syndication replaces itself, `MediaLeaseController.scala:57-67`).

**Performance trap to avoid:** do NOT construct `new Date()` inside a per-lease loop. Hoist
`Date.now()` to the top of the derivation pass (once per `deriveImage()` call, or once per
batch of 200 images). The comparison itself is integer `<=` / `>=` — free.

**Recommendation:** Option (B) — be correct. Perf cost is negligible. Hoist `Date.now()`.
Add a code comment noting the divergence from media-api's `Image.scala` behaviour (and why
we're deliberately more correct). Log in `deviations.md`.

---

## 5. Kahuna UI — What to Reimplement

### 5.1 Grid/table thumbnail badge

**Kahuna component:** `gr-syndication-icon` — a Material icon (`monetization_on`) with
colour-coded CSS class:

| Status | Colour | Shown? |
|---|---|---|
| `sent` | green | Yes |
| `queued` | orange | Yes |
| `blocked` | red | Yes |
| `review` | white | Yes |
| `unsuitable` | — | **Hidden** (no badge) |

Badge is positioned in the thumbnail's bottom bar (right-aligned). Shows tooltip with
`syndicationReason` text:
- sent: "image has been sent for syndication"
- queued: "image will soon be sent for syndication"
- blocked: "image will not be sent for syndication"
- review: "image is awaiting editorial review"

**Table view:** kupua already has a dedicated badges column (renders cost/validity/etc.
badges inline). Add the syndication badge to that column — do NOT introduce a new column.
Keeps column-store untouched and matches the visual model users have for other badges.

### 5.2 Image detail — Syndication Rights section

**Location:** Bottom of metadata panel (row 48 in image-detail-inventory).
**Visibility:** Single image only. Always shown (no permission required).
**Content:** Simple text:
- When `syndicationRights` absent: "No information available."
- When present + `rights[].acquired === true`: "Syndication rights have been acquired for this image."
- When present + no acquired rights: "Syndication rights have **not** been acquired for this image."

`isInferred` is fetched and typed (it's in SOURCE_INCLUDES per SY-1) but **not rendered in
v1**. The data is available on the Image type so a future UI iteration can surface it
(e.g. "Syndication rights have been acquired (inferred)") without a data-layer change.
Kahuna doesn't surface it today; matching Kahuna keeps the v1 surface small.

### 5.3 Deny-syndication warning banner

**Condition:** Active `deny-syndication` lease exists AND `showDenySyndicationWarning` config
flag is true. Shows in the validity/deletion notice banner area (row 21 in detail inventory,
rule #5 in conditional render rules).

### 5.4 Leases panel — syndication lease display

**Kahuna shows all four lease types** in the single-image leases panel: allow-use, deny-use,
allow-syndication, deny-syndication. Each shows: access type label, dates, notes, delete button.
Inactive leases shown dimmed.

**Current kupua state:** `validity-map.ts` only checks `allow-use` and `deny-use`. Syndication
lease types (`allow-syndication`, `deny-syndication`) are typed in `grid-api/types.ts` but not
used in any logic.

### 5.5 Search filtering via URL

**Kahuna:** `?syndicationStatus=review` (URL parameter, no UI filter panel). Passed directly to
media-api as a query parameter. Media-api translates to composite ES query via
`SyndicationFilter.scala`.

**Kupua approach:** Same URL parameter, but kupua constructs the composite ES query directly
(bypassing media-api). Already has `params.syndicationStatus` wired in `es-adapter.ts` — just
needs the query construction fixed.

### 5.6 "Send to Photo Sales" action (future, not v1)

Kahuna has a batch action to syndicate selected images to a partner ("Capture"). This requires:
- Validation (image must be suitable for syndication)
- POST to media-api's syndication endpoint
- Creates a syndication usage record

**Not in scope for this workplan.** Requires media-api write access. Record as future work.

---

## 6. Lease Handling — Full Picture

### 6.1 Current kupua lease understanding

| Access type | Used in validity-map.ts | Used for syndicationStatus | Used in UI |
|---|---|---|---|
| `allow-use` | Yes (`shouldOverride`) | No | Yes (teal cost badge gradient) |
| `deny-use` | Yes (`current_deny_lease`) | No | Yes (invalid reason) |
| `allow-syndication` | **No** | **Needed** | Not yet |
| `deny-syndication` | **No** | **Needed** | Not yet (warning banner) |

### 6.2 Lease active determination

See §3.2.1 for full staleness mechanics and §4.4 for the correctness vs perf decision.

**Summary:** kupua will compute lease active from `startDate`/`endDate` (not trust the snapshot).
Perf cost is negligible (sub-millisecond for 200 images). Hoist `Date.now()` per batch.

```typescript
function isLeaseActive(lease: Lease, nowMs: number): boolean {
  const started = !lease.startDate || new Date(lease.startDate).getTime() <= nowMs;
  const notExpired = !lease.endDate || new Date(lease.endDate).getTime() >= nowMs;
  return started && notExpired;
}
```

**Kupua's validity-map.ts** currently trusts `active === "true"` for use-leases. Whether to
migrate those checks to date-based too is a separate decision (low priority, noted in §8).

### 6.3 Lease type typing

`kupua/src/types/image.ts` currently has `access: string`. Should be tightened:
```typescript
type LeaseAccess = "allow-use" | "deny-use" | "allow-syndication" | "deny-syndication";
```

---

## 7. Implementation Plan

### Phase SY-0: Cleanup (prerequisite)

- [ ] Remove `"syndicationStatus"` from `SOURCE_INCLUDES` (phantom field)
- [ ] Remove `"persisted"` from `SOURCE_INCLUDES` (phantom field; bundled here because it's
  the same class of bug — a server-computed Scala `def` mistakenly listed as an ES field.
  Same one-line fix, same risk profile, no reason to split.)
- [ ] Fix the enrichment-baseline comment block in `es-config.ts`
- [ ] Remove or comment-out `{ term: { syndicationStatus: ... } }` in es-adapter.ts (dead code)
- [ ] Remove `"persisted"` term filter in es-adapter.ts (dead code)
- [ ] Update `derive-enriched-image.ts` comments referencing these as "ES fields"
### Phase SY-1: Data layer — fetch syndicationRights from ES

- [ ] Add to `SOURCE_INCLUDES`:
  - `"syndicationRights.published"`
  - `"syndicationRights.isInferred"`
  - `"syndicationRights.rights.acquired"`
  - (do NOT add `rightCode` — not used by display, filter, or v1 detail panel; add later if needed)
- [ ] Update `Image` type: replace `syndicationRights?: Record<string, unknown>` with a proper
  typed interface (at minimum: `{ published?: string; isInferred?: boolean; rights?: { acquired?: boolean }[] }`)
- [ ] **Before** tightening `Lease.access` from `string` to `LeaseAccess` union: grep
  `kupua/src/**/*.{ts,tsx}` for `"allow-use"`, `"deny-use"`, `Lease`, `access:`. List likely
  break sites. Update them in the same commit. Likely surfaces: `validity-map.ts`, any
  `deriveImage` tests, leases panel components if they exist.
- [ ] Type `Lease.access` as `LeaseAccess` union instead of `string`
- [ ] Run `npm --prefix kupua test` after this phase (no e2e needed — type-only + SOURCE_INCLUDES).

(Dot-path SOURCE_INCLUDES for nested arrays already verified against PROD — see §8 Q1.)

### Phase SY-2: Client-side computation

- [ ] Create `kupua/src/lib/syndication/calculate-syndication-status.ts`:
  - Pure function, follows `calculateCost` pattern
  - Inputs: image's syndicationRights, leases, usages
  - Outputs: `SyndicationStatus` (the 5-value union)
  - Includes `isLeaseActive()` helper (date-based, not trusting snapshot)
- [ ] Create `kupua/src/lib/syndication/syndication-reason.ts`:
  - Maps status → human-readable reason string (for tooltip)
- [ ] Wire into `deriveImage()` as a baseline computed field (like `cost`):
  - `syndicationStatus: calculateSyndicationStatus(image)` — always computed, not API-only
  - When API overlay provides it, overlay wins (consistency with existing pattern)
- [ ] Unit test fixtures — cover every branch:
  1. `syndicationRights: undefined` → `unsuitable`
  2. `rights: []` → `unsuitable`
  3. `rights: [{acquired: false}]` → `unsuitable`
  4. rights acquired + no leases + no usages → `review`
  5. rights acquired + active allow-syndication lease → `queued`
  6. rights acquired + active deny-syndication lease → `blocked`
  7. rights acquired + EXPIRED deny-syndication lease (the §4.4 correctness win) → `review`
  8. rights acquired + syndication usage on `usages[].platform` → `sent`
  Mirror `calculateCost` test patterns.
- [ ] Run `npm --prefix kupua test` AND `npm --prefix kupua run test:e2e` after this phase
  (deriveImage change — e2e is mandatory per AGENTS test directive, even if no UI changed yet,
  because store/derivation paths are touched).

### Phase SY-3: Search filter

- [ ] Replace the broken `{ term: { syndicationStatus } }` in es-adapter.ts with composite
  query builder mirroring `SyndicationFilter.scala`
- [ ] For the "review" filter's expired-deny-syndication handling: use a date-range filter
  on `leases.leases.endDate` (option b). Kupua is FE-only and cannot deploy Painless runtime
  scripts, and we already compute date-based lease active for display — same semantics in
  both places.
- [ ] Wire `syndicationStatus` URL param through search-store → es-adapter
- [ ] Test against real ES data (TEST cluster, read-only) to verify filter accuracy. Per
  AGENTS directive on real systems: requires explicit user permission per session, no writes.
- [ ] Run `npm --prefix kupua test` after this phase (es-adapter unit tests). E2e optional
  unless URL param wiring touches search-store.

(Lease nested-field status already verified against PROD — see §3.2. `leases.leases` is a
plain object; plain term clauses work, no `nested` wrapping needed.)

### Phase SY-4: UI — Grid/table badge

- [ ] Syndication status badge component (icon + colour + tooltip)
- [ ] Render in grid thumbnail overlay (bottom-right, Kahuna-style)
- [ ] Render in table view's **existing badges column** (alongside cost/validity badges).
  Do NOT introduce a new column — keeps column-store untouched.
- [ ] Hidden when status is "unsuitable" (most images — no noise)
- [ ] Run `npm --prefix kupua test` AND `npm --prefix kupua run test:e2e` after this phase.
  Component change + grid render path — e2e mandatory per AGENTS directive.

### Phase SY-5: UI — Info panel

- [ ] Syndication Rights section in metadata panel:
  - "No information available" when syndicationRights absent
  - "Syndication rights have been acquired" / "...have not been acquired"
  - `isInferred` and `published` are available on the type but NOT rendered in v1 (matches
    Kahuna; data layer is ready for a future iteration)
- [ ] Deny-syndication warning in validity banner (when active deny-syndication lease exists)
- [ ] Lease panel: ensure all four access types render with distinct labels
- [ ] Run `npm --prefix kupua test` AND `npm --prefix kupua run test:e2e` after this phase.
  Component + panel changes — e2e mandatory.

---

## 8. Open Questions

1. **~~SOURCE_INCLUDES dot-path for nested arrays~~** — RESOLVED. Tested against PROD ES:
   requesting `"syndicationRights.rights.acquired"` returns `"rights": [{"acquired": true}]`
   with `rightCode` and `properties[]` stripped. Dot-path filtering works for array elements.
   The optimised SOURCE_INCLUDES approach is confirmed:
   `"syndicationRights.rights.acquired"`, `"syndicationRights.published"`,
   `"syndicationRights.isInferred"` — minimal payload, no unwanted sub-fields.

2. **~~`usagesPlatform` flattened field~~** — RESOLVED. It's a `copy_to` target (query-only,
   not in `_source`). Use `{ term: { usagesPlatform: "syndication" } }` in the "sent" search
   filter. For display computation, walk `usages[].platform` from SOURCE_INCLUDES. Kupua will
   also support `usages@platform:[digital|print|syndication]` searches using this field.

3. **~~syndicatableCategory check in "review" filter~~** — RESOLVED. `IsOwnedPhotograph`
   is simply `usageRights.category IN ["staff-photographer", "contract-photographer",
   "commissioned-photographer"]`. Kupua already knows this set — it's the same three
   categories that drive the blue border in `image-borders.ts`. Data is in SOURCE_INCLUDES
   (`usageRights.category`). Use config-driven category list (not hardcoded) for the filter.

4. **~~syndicationStartDate (PROD only)~~** — RESOLVED. Add to `src/lib/grid-config.ts`
   alongside `staffPhotographerOrganisation` (same pattern). Hardcode the PROD cutoff date
   for now. Will move to proper runtime config when that system is built. Without it, the
   "review" filter returns a huge tail of old images that predate the syndication workflow.

5. **~~Performance of date-based lease active check~~** — RESOLVED. See §4.4. Negligible
   (sub-millisecond for 200 images × ~2 leases). Hoist `Date.now()` per batch.

6. **~~`lease.active` snapshot reliability for use-leases~~** — RESOLVED. Yes, migrate
   `validity-map.ts` to date-based too (same `isLeaseActive()` helper). An expired
   `allow-use` lease incorrectly overriding invalidity is worse than the syndication case
   (shows paid image as usable when it shouldn't be). Same negligible perf cost. Separate
   task after syndication work (one-line change in `validity-map.ts`).
   **Related future question:** overlapping leases with conflicting access (e.g. active
   `allow-use` + active `deny-use` on same image) — what trumps what? Not in scope here
   but worth investigating when the use-lease migration happens.

---

## 9. References

- `common-lib/.../model/Image.scala` — `syndicationStatus` computed property (lines 44-67)
- `common-lib/.../model/leases/MediaLease.scala` — lease types, active logic, save rules
- `common-lib/.../elasticsearch/Mappings.scala` — ES field mapping (syndicationRights: L213, leases: L355)
- `media-api/.../elasticsearch/SyndicationFilter.scala` — composite query builder
- `kupua/src/dal/es-config.ts` — SOURCE_INCLUDES (line 127: phantom syndicationStatus)
- `kupua/src/dal/es-adapter.ts` — broken term filter (line 258)
- `kupua/src/lib/derive-enriched-image.ts` — merge point (line 125: API-only syndicationStatus)
- `kupua/src/lib/cost/validity-map.ts` — use-lease checks (lines 66-69)
- `kupua/src/types/image.ts` — Image type (syndicationRights: L143, Lease: L62)
- `kahuna/public/js/components/gr-syndication-icon/` — grid badge (icon + CSS colours)
- `kahuna/public/js/components/gr-syndication-rights/` — detail panel display
- `kahuna/public/js/services/image-logic.js` — `getSyndicationStatus`, `hasSyndicationRights`
- `kupua/exploration/docs/01 Research/grid-api-contract-audit-findings.md` — §6.7.3, §5.14
- `kupua/exploration/docs/01 Research/kahuna-image-detail-inventory.md` — rows 21, 48, 55-56
