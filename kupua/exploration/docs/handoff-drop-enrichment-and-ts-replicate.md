# Handoff — Drop Background Enrichment, TS-Replicate the Gaps

**Produced:** 10 May 2026
**For:** Sonnet High (Claude). Two sessions if needed (split below).
**Mode:** code changes + tests
**Cwd discipline:** kupua-only

---

## Context (read this first)

Cluster 1 + `?ids=` enrichment + connection-starvation fix all landed
uncommitted. After the inventory came back (A/B/C), the architectural
position changed: **background enrichment is doing almost no useful
work**. Once the SOURCE_INCLUDES canary is fixed, `useEnrichment`
fires `?ids=` requests every 1.1s of scroll-settle to overwrite ES
baseline with near-identical data. The genuinely API-only deltas
that matter are: `cost: "overquota"`, `isPotentiallyGraphic`, signed
download URLs, `actions[]`. The first two are TS-replicable. The
third is fired on user click. The fourth is split into ES-state +
session-permission, also TS-replicable.

**Decision:** drop the background loop. Keep the adapter scaffolding.
TS-replicate overquota and isPotentiallyGraphic. Wire actions via
boot-time session + ES state. Ship.

This is irreversible-ish — code lives only in working tree, no
commits since bread-and-butter started. User has accepted the
trade: complexity gone now > theoretical recovery.

## Push-back clauses (please use them)

1. If, after reading the code, you think the polling actually IS
   doing useful work that the user and I have missed, **stop and
   write Section 0 explaining what**. The three things to look hard
   at: lease state changes mid-session, validity flips after edit
   in another tab, ticker counts on the search response.
2. If the TS overquota path turns out to need data we don't have
   (e.g. `/usage/quotas` endpoint shape isn't what Inventory C
   says), **stop and report** rather than improvising.
3. If you find that deleting `useEnrichment` cascades into 30+
   files of touched code, **stop**. The blast radius should be
   small (the hook + its tests + the route mount point).

## Files to read before touching anything

- `kupua/src/hooks/useEnrichment.ts` (268 lines — the loop being
  deleted)
- `kupua/src/stores/enrichment-store.ts` (KEEP — used by single-image
  fetches eventually)
- `kupua/src/dal/grid-api/grid-api-adapter.ts` — `enrichByIds`,
  `getImageDetail` methods. Both KEEP.
- `kupua/src/lib/derive-enriched-image.ts`
- `kupua/src/lib/cost/calculate-cost.ts`
- `kupua/src/lib/cost/validity-map.ts`
- `kupua/src/lib/cost/guardian-config.json`
- `kupua/src/dal/es-config.ts` — `SOURCE_INCLUDES` whitelist
- `kupua/src/dal/es-adapter.ts` — to confirm baseline shape
- `kupua/exploration/docs/00 Architecture and philosophy/enrichment-strategy.md`
- Inventory C `inventory-C-from-backend.md`, especially the row on
  `GET /usage/quotas/:id` and the row on `isPotentiallyGraphic`.
- `kahuna/public/js/services/graphic-image-blur.js` (referenced by
  Inventory B) — keyword-scan port reference.
- `media-api/app/lib/usagerights/CostCalculator.scala` — overquota
  rule reference.
- `media-api/app/lib/UsageQuota.scala` — quota fetch shape.

## Session A — Delete the loop, widen the whitelist

### A.1 Widen `SOURCE_INCLUDES`

In `kupua/src/dal/es-config.ts`, add to `SOURCE_INCLUDES`:

```
"cost",                                     // server-computed; we'll TS-baseline
"valid",                                    // server-computed; we'll TS-baseline
"invalidReasons",
"persisted",
"usageRights",                              // FULL object, not just .category
"leases",
"usages",
"actions",                                  // KEEP — Phase C cell-state derivation
"isPotentiallyGraphic",                     // search-script field, see note
"syndicationStatus",                        // FYI; not rendered yet
"fileMetadata.xmp.pur:adultContentWarning", // for TS isPotentiallyGraphic
```

Note on `isPotentiallyGraphic`: per Inventory C, this is a Painless
script field on search hits, NOT stored. SOURCE_INCLUDES whitelisting
won't bring it in via `_source`. **The path forward is: read the XMP
flag directly via the SOURCE_INCLUDES line above, plus the keyword
scan from kahuna's `graphic-image-blur.js`. Drop reliance on the
script field.** This is consistent with the "TS-replicate" decision.

If after widening, kupua's payload size grows enough to dent perceived
perf (run `npm --prefix kupua run test:perf -- --perceived-only --runs
3 --label "post-source-includes-widen"`), report back before
proceeding. Per-cell payload should still be under ~500B; we lose
~250-400B of pruning.

### A.2 Delete `useEnrichment` background loop

- Remove the mount of `useEnrichment()` from
  `kupua/src/routes/search.tsx` (or wherever it's called — grep for
  `useEnrichment(`).
- Delete `kupua/src/hooks/useEnrichment.ts`.
- Delete its test file(s).

KEEP these — they're load-bearing for the single-image and selection-
action paths that will land later:
- `kupua/src/dal/grid-api/grid-api-adapter.ts` `enrichByIds` method
- `kupua/src/dal/grid-api/grid-api-adapter.ts` `getImageDetail` method
- `kupua/src/stores/enrichment-store.ts` (still receives single-image
  results when those land)
- write-guard, service-discovery, Argo unwrap, error classes — all
  scaffolding stays.

### A.3 Update `derive-enriched-image.ts`

The merge function currently overlays API enrichment on ES baseline.
With no enrichment running, the function still works (overlay is
absent → returns baseline). Verify it does. Update the JSDoc /
comments to reflect the new model: ES baseline is authoritative for
99% of fields; enrichment is a possible per-image override with
intent-driven fire.

### A.4 Tests

- Delete `useEnrichment` tests.
- Update any test that asserts "enrichment fires after scroll"
  patterns to assert the opposite — no fetch on `/api/images?ids=`
  during scroll.
- Run `npm --prefix kupua test`. Expect green.
- Run `npm --prefix kupua run test:e2e`. **Warn user about port :3000
  first.** Expect green.

### A.5 Doc update

- Append entry to `kupua/exploration/docs/changelog.md` under current
  phase heading, top, summarising the deletion + rationale (1-2
  paragraphs). Inline the deleted hook content in a code block (no
  truncation) so a future agent has the historical reference without
  needing git archaeology — this is intentional given working-tree-
  only state.
- Update `kupua/AGENTS.md`: remove `useEnrichment` from Component
  Summary if present; update Known Issues to remove
  connection-starvation entries if present.
- Update `kupua/exploration/docs/00 Architecture and philosophy/enrichment-strategy.md`:
  add a short "§F Background enrichment dropped (10 May 2026)"
  section. Reference §E if it exists by then (see condensation
  handoff).

## Session B — TS overquota + TS isPotentiallyGraphic

Run after Session A is committable. Should be one session.

### B.1 TS overquota

Goal: TS cost output gains `"overquota"` for images whose supplier
has exceeded quota.

Steps:
1. Add `kupua/src/lib/cost/quota-store.ts`:
   - Module-level state: `Map<supplier, { exceeded, fractionOfQuota }>`.
   - `fetchQuotas()` — calls `/api/usage/quotas` (need to verify exact
     route — check `media-api/conf/routes` or Inventory C). Returns
     `Map`. On failure: empty map (kupua "graceful API absence"
     directive — TS still computes pay/free/conditional).
   - `getQuotaState(supplier): { exceeded } | null` — sync read.
   - Auto-refresh every hour via `setInterval` mounted at app root,
     not in a hot path. Initial fetch on app mount.
2. Update `kupua/src/lib/cost/calculate-cost.ts`:
   - After existing chain, if result is `"pay"` AND
     `usageRights.supplier` is set AND `getQuotaState(supplier).exceeded`
     is true → return `"overquota"`.
   - Add Vitest covering: pay→overquota upgrade, no-supplier no-upgrade,
     missing-quota-data fallback to pay.
3. Mount `fetchQuotas()` initial call in app bootstrap (route loader
   or top-level effect — consistent with existing patterns).

Note: if `/api/usage/quotas` requires auth that the dev proxy doesn't
plumb, this will return null in dev. Document the dev-mode behaviour
in the JSDoc; production will work.

### B.2 TS isPotentiallyGraphic

Goal: a TS function `isImagePotentiallyGraphic(image): boolean` that
matches kahuna's two-input model.

Steps:
1. Add `kupua/src/lib/graphic-image-blur.ts`:
   - Port the keyword scan from
     `kahuna/public/js/services/graphic-image-blur.js` (lines 21-48
     per Inventory B). Targets: `metadata.description`,
     `metadata.title`, `metadata.specialInstructions`,
     `metadata.keywords`. Phrases: "graphic content", "depicts
     death", "dead child", "SMOUT", and whatever else kahuna has.
     Read the kahuna file; don't paraphrase from inventory.
   - OR with: `image.fileMetadata?.xmp?.["pur:adultContentWarning"]
     != null`.
   - Honour a hardcoded `defaultShouldBlurGraphicImages = true` per
     Cluster 1's "hardcode-defaults rule".
2. Add Vitest covering each keyword path + XMP flag path + neither.
3. Don't wire the render yet — Cluster 1 row 5 work covers that.
   The function should be ready for that wiring.

### B.3 Tests

- `npm --prefix kupua test`. Green.
- `npm --prefix kupua run test:e2e`. **Warn user about port :3000.**
  Green.

### B.4 Doc update

- changelog entry for B.
- `kupua/exploration/docs/deviations.md` — note the TS overquota
  approach (intentional departure from "let API overwrite" rule
  established in earlier docs).

## What done looks like

After both sessions:
- `useEnrichment` deleted, working tree green.
- SOURCE_INCLUDES widened.
- Cost output includes `"overquota"` when quota table says so.
- `isImagePotentiallyGraphic()` available for cell render path.
- ~200 lines of connection-starvation gymnastics gone.
- Three engineering asks (HTTP/2, Pekko, nginx) noted as moot in
  `cluster1-ids-enrichment-research.md` (one-line update; don't
  rewrite the doc).
- All tests green. No commits.

## Anti-goals

- Do NOT delete `enrichByIds` from the adapter. Future selection-mode
  action gating uses it.
- Do NOT delete `enrichment-store.ts`. Single-image fetches will
  populate it later.
- Do NOT touch Phase A scaffolding (service-discovery, write-guard,
  types, Argo helpers).
- Do NOT commit anything.
- Do NOT widen scope to "while I'm here let me also fix X".
- Do NOT add a "if this fails fall back to background polling" path.
  The decision is no polling.
