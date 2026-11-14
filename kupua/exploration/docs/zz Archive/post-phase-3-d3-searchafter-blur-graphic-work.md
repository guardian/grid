# Post-D3: graphic-image blur — implementation guide

**Status:** Scala side clean (no Painless script). Decision baked in: full client-side detection
via `isImagePotentiallyGraphic()`, driven by a silent field alias for `pur:adultContentWarning`.
No cookies required. This doc describes what remains for a complete, user-togglable blur feature.

---

## Decision rationale (settled 2026-06-15)

The original D3 implementation added a per-hit Painless script to compute `isPotentiallyGraphic`
server-side. This was measured at **+30ms ES `took` per page** (also-prod), because
`params['_source']` in Painless forces ES to deserialize the full stored document per hit.

**The script has been removed.** Reasons:

1. It computes exactly one thing: `pur:adultContentWarning != null` — a null-check that TS does
   in < 0.1ms on already-parsed objects.
2. `isImagePotentiallyGraphic()` already exists in Kupua, is fully tested, and also adds the
   keyword scan ("depicts death", "dead body", etc.) that the server script never did.
3. `pur:adultContentWarning` is in `SOURCE_INCLUDES` for direct-ES mode already. For media-api
   mode, adding it as a **silent field alias** (both display flags `false`) gets it into the
   server projection via the existing `config.fieldAliasConfigs` mechanism — no hardcoding, no
   bespoke server logic.
4. Full client-side computation means no user cookie needed to gate server overhead — the cost
   is zero whether blurring is on or off (< 0.1ms regardless of page size).

---

## Architecture: silent alias

`pur:adultContentWarning` is added to `grid-config.ts` as:

```typescript
{
  elasticsearchPath: "fileMetadata.xmp.pur:adultContentWarning",
  alias: "adultContentWarning",
  label: "Adult Content Warning",
  displaySearchHint: false,           // not shown in CQL key suggestions
  displayInAdditionalMetadata: false,  // not shown in metadata/detail panel
}
```

- **Kupua observes both flags** — `typeahead-fields.ts` gates CQL suggestions on
  `displaySearchHint`; `field-registry.tsx` filters `ALIAS_FIELDS` on `displayInAdditionalMetadata`.
  So the alias is entirely invisible in the UI.
- **Server side (media-api):** the corresponding entry must also exist in the actual
  `field.aliases` Play config (not just the Kupua mock) for `config.fieldAliasConfigs` to include
  the path in the search-after projection. This is a one-line Grid config change — a task for
  when blur is being shipped. Once done, media-api mode returns the value at
  `image.data.aliases.adultContentWarning` in the Argo response.

---

## What already exists and works

| Piece | File | Status |
|---|---|---|
| **Blur overlay in grid view** | `src/components/ImageGrid.tsx` L235–310 | ✅ **implemented** — reads `enriched?.isPotentiallyGraphic` from enrichment overlay; shows `backdrop-blur-md` + "Click to reveal" |
| Detection function (XMP + keyword scan) | `src/lib/graphic-image-blur.ts` → `isImagePotentiallyGraphic()` | ✅ built + tested, **never called in the live app** |
| XMP raw field in direct-ES `_source` | `src/dal/es-config.ts` → `SOURCE_INCLUDES` | ✅ always fetched |
| Silent alias for `pur:adultContentWarning` | `src/lib/grid-config.ts` L238–239 | ✅ wired — auto-included in search-after projection; value arrives at `image.aliases?.adultContentWarning` in media-api mode |

## What does NOT work yet

0. **`isPotentiallyGraphic` must be removed from `extractEnrichment` and `EnrichmentFields`.**
   The search-after server endpoint was deliberately changed to never emit `isPotentiallyGraphic`
   — the Painless script was removed (+30ms per page) and the silent `adultContentWarning` alias
   is the replacement signal. `extractEnrichment` in `grid-api-search-adapter.ts` still reads
   `d.isPotentiallyGraphic` (always `undefined`) and `EnrichmentFields` in `enrichment-store.ts`
   still declares the field. Both should be deleted: the enrichment overlay is not the right
   channel for this signal anymore — detection is purely client-side via `isImagePotentiallyGraphic()`.
   `ImageGrid.tsx`'s `enriched?.isPotentiallyGraphic` consumer (step 2 below) must also be
   replaced as part of that wiring.

1. **`isImagePotentiallyGraphic()` is never called in the live app.** `ImageGrid.tsx` reads
   `enriched?.isPotentiallyGraphic` from the enrichment overlay (which is now always `undefined`
   — see item 0). Blur never triggers in either mode.
2. **`isImagePotentiallyGraphic()` does not check `image.aliases?.adultContentWarning`.** In
   media-api mode the XMP value arrives as `aliases.adultContentWarning` (processed by
   `extractAliasFieldValues`), not at `image.fileMetadata?.xmp["pur:adultContentWarning"]`. The
   function needs extending to check both paths.
3. **User preference state** — no store, no toggle.
4. **Table view has no blur.** `ImageTable.tsx` does not check `isPotentiallyGraphic`.

---

## Cookie specification (optional, for cross-app compatibility only)

No cookie is **required** for Kupua's client-side implementation. However, Kahuna uses
`SHOULD_BLUR_GRAPHIC_IMAGES = "true"|"false"` (string value, not just presence/absence) to
persist the preference. If cross-app consistency is wanted, Kupua can read/write the same
cookie. Otherwise a Zustand store or `localStorage` entry is simpler.

---

## Suggested implementation order

1. **Remove `isPotentiallyGraphic` from `extractEnrichment` and `EnrichmentFields`** (item 0
   above). Delete the field from `enrichment-store.ts` and `grid-api-search-adapter.ts`.

2. **Complete the signal port from `graphic-image-blur.js`** — verify `isImagePotentiallyGraphic()`
   covers all Kahuna signals:
   - XMP `pur:adultContentWarning` raw path (direct-ES: already read from `image.fileMetadata?.xmp`;
     media-api: must also check `image.aliases?.adultContentWarning`)
   - Keyword scan on `metadata.description`, `metadata.title`, `metadata.specialInstructions`,
     `metadata.keywords` — function comment says "mirrors kahuna's phrase list exactly"; verify
     the full phrase list and all four text fields are actually scanned
   This step makes both signal sources mode-agnostic.

3. **Wire `isImagePotentiallyGraphic()` into `ImageGrid.tsx`** — replace `enriched?.isPotentiallyGraphic`
   with a call to `isImagePotentiallyGraphic(image, shouldBlur)`. Pass `shouldBlur` from the
   preference store.

4. **Preference store** — a `useBlurPreference()` hook that reads/writes the preference
   (cookie or `localStorage`). No server interaction on toggle. See cookie spec below if
   cross-app Kahuna compatibility is wanted.

5. **Table view** — same blur check in `ImageTable.tsx`.

6. **Acknowledgement prompt** (optional, Kahuna-parity) — one-time modal for new users.

---

## What the D3 Scala searchAfter code contains (for reference)

No Painless script in `searchAfter`. Specifically absent:
- `searchAfterGraphicScriptField` and `.scriptfields()` / `.storedFields()` calls
- Cookie reading or `shouldFlagGraphicImages` threading
- `hit.fields` extraction in `resolveSearchAfterHit` (passes `JsObject.empty`)

The `searchAfterDropFields` comment notes that `pur:adultContentWarning` arrives via
`fieldAliasConfigs` — the real `field.aliases` Play config entry was added 2026-06-15.
