# Phase 3-D3 companion: `field.aliases` in the search-after endpoint

**Status: DONE (2026-06-13).** Fix implemented in `ElasticSearch.scala`
(`resolveSearchAfterHit` strip-before-validate + slim+alias-paths projection), ES-layer
regression tests added in `ElasticSearchTest.scala`, deviation recorded as
`deviations.md` §32. Production search paths untouched.

Session: 2026-06-13. Covers the full chain from the local dev config gap through to the
clean fix in media-api.

---

## 1. Why `field.aliases` is absent in local `--use-TEST` Grid

### The problem

On deployed TEST, images have e.g. `Colour Profile` in the Additional Metadata panel.
The same image opened in a locally-running Grid with `--use-TEST` shows nothing there.

### Config loading in dev mode

`GridConfigLoader.scala` (dev path):

```
Priority (highest → lowest)
  1. JVM system properties  (-D flags)
  2. $extraConfigDir/media-api.conf   ← downloaded from S3 by start.sh
  3. ~/.grid/media-api.conf
  4. ~/.grid/common.conf
  5. common-lib/.../application.conf  ← default: field.aliases = []
```

On **deployed TEST** the loader uses a different branch and reads:
```
  1. /etc/grid/media-api.conf
  2. /etc/gu/media-api.properties
  3. /etc/grid/common.conf            ← where field.aliases lives on deployed instances
  4. /etc/gu/grid-prod.properties
```

### What `start.sh --use-TEST` does

```bash
EXTRA_CONFIG_DIR=/tmp/grid-config-TEST
aws s3 cp s3://grid-conf/TEST/media-api/media-api.conf $EXTRA_CONFIG_DIR/ --profile media-service
aws s3 cp s3://grid-conf/TEST/kahuna/kahuna.conf       $EXTRA_CONFIG_DIR/ --profile media-service
sbt -J-DextraConfigDir=$EXTRA_CONFIG_DIR runMinimal
```

It downloads only two per-app files. There is **no `common.conf` equivalent** downloaded.
`GridConfigLoader` in dev mode also has no mechanism to load a `common.conf` via
`extraConfigDir` — the code constructs `extraConfigDir/$appName.conf` only.

**Root cause:** `field.aliases` lives in the deployed `/etc/grid/common.conf` (or the
equivalent S3 source used at deployment time). `start.sh` never fetches a common config,
and the dev-mode loader has no extraConfigDir/common.conf step.

### Manual workaround (current state — already applied)

Create `~/.grid/common.conf` with the desired `field.aliases` block.
The dev loader reads `~/.grid/common.conf` as the lowest-priority user override,
which is sufficient. A copy of the Guardian TEST `field.aliases` config has been
placed there (see the file for the exact aliases).

For any other developer to reproduce the aliases locally they must similarly create
`~/.grid/common.conf`. The S3-download gap in `start.sh` is a known issue to fix
at a later date — the fix would be:
```bash
aws s3 cp s3://grid-conf/TEST/common.conf $EXTRA_CONFIG_DIR/ --profile media-service
# and in GridConfigLoader dev branch, also load extraConfigDir/common.conf
```

---

## 2. How `field.aliases` flows through the system

### Server side (Scala)

`CommonConfig.fieldAliasConfigs: Seq[FieldAlias]` is read from `field.aliases` by
every service at startup.

In **media-api**, `fieldAliasConfigs` is used in two places:

1. `ImageResponse.extractAliasFieldValues(config, imageWrapper)` — traverses the raw
   `SourceWrapper.source` JSON to extract alias leaf values, returning
   `Seq[(alias, JsValue)]`. These are added to the response JSON under `"aliases"`:
   ```json
   { "id": "...", "aliases": { "colourProfile": "sRGB IEC61966-2.1", "colourModel": "RGB" } }
   ```
2. `ElasticSearch.searchAfter` — includes the alias ES leaf paths in the `_source`
   projection so ES returns those values, then strips the dropped heavy fields from a
   copy of the source before `Image` validation (see §3–§4).

In **kahuna**, `fieldAliasConfigs` is serialised into the HTML template as
`fieldAliases` so the Angular UI knows which alias fields to display.

### Client side (Kupua TypeScript)

Kupua has `fieldAliases` hardcoded in `src/lib/grid-config.ts` (mirroring the Guardian
`common.conf` values). `ALIAS_FIELDS` in `src/lib/field-registry.tsx` is generated
from these at build time.

**Changes made in this session (already committed):**

1. `src/types/image.ts` — added `aliases?: Record<string, string>` to the `Image`
   type, reflecting the `aliases.*` object that media-api includes in search-after
   and single-image responses.

2. `src/lib/field-registry.tsx` — the `ALIAS_FIELDS` accessor was:
   ```typescript
   accessor: (img) => resolveEsPath(img, a.elasticsearchPath)
   // e.g. traverses img.fileMetadata?.icc?.["Profile Description"]
   ```
   Changed to:
   ```typescript
   accessor: (img) => img.aliases?.[a.alias] ?? resolveEsPath(img, a.elasticsearchPath)
   ```
   **Why:** In `--use-media-api` mode, `getImageDetail` fetches `GET /images/:id`
   without `?include=fileMetadata`. The raw `fileMetadata` is NOT in the response —
   it is a link-only `EmbeddedEntity`. But `aliases.*` IS in the response (added by
   `extractAliasFieldValues`). The fallback to `resolveEsPath` handles direct-ES mode
   where there is no `aliases` object but the raw ES source has the fileMetadata paths.

   `mapApiImageToImage` in `grid-api-search-adapter.ts` spreads `{ ...d, ... }` so
   `aliases` is present at runtime on the `Image` object for search-hit images too.

---

## 3. The design challenge: partial `fileMetadata` and `Image` parsing

The point of the search-after projection is payload size. `searchAfter` serves Kupua's
infinite scroll: every page fetches `length` hits and Kupua never needs the bulk
`fileMetadata` blob (EXIF/XMP/ICC/IPTC), the 1024-dim `embedding` vector, or the pre-edit
`originalMetadata` copy. So the projection drops them:

```scala
private val searchAfterDropFields = Set("embedding", "originalMetadata", "fileMetadata")
```

But Kupua *does* need the handful of **alias leaf values** that live inside `fileMetadata`
(e.g. `fileMetadata.icc.Profile Description` → `colourProfile`). Those are tiny. So the
projection keeps the slim Image field set and adds back only the specific alias leaf
paths:

```scala
val projectionIncludes: Seq[String] =
  imageSourceFields.filterNot(searchAfterDropFields) ++ config.fieldAliasConfigs.map(_.elasticsearchPath)
```

ES `_source` filtering with `includes: ["metadata", "fileMetadata.icc.Profile Description"]`
returns a **partial** `fileMetadata` object:

```json
{ "metadata": { ... }, "fileMetadata": { "icc": { "Profile Description": "sRGB" } } }
```

— present, but missing `iptc`, `exif`, `exifSub`, `xmp`.

That is the crux. `FileMetadata`'s JSON reader (`ImageMetadataReads`) requires those four
sub-maps as **non-nullable**:

```scala
(__ \ "iptc").read[Map[String,String]] ~   // REQUIRED — not nullable
(__ \ "exif").read[Map[String,String]] ~   // REQUIRED
(__ \ "exifSub").read[Map[String,String]] ~ // REQUIRED
(__ \ "xmp").read[Map[String,JsValue]] ~   // REQUIRED
...
```

`Image`'s reader uses `readNullable[FileMetadata]`. When `fileMetadata` is **absent**,
that yields `None` → `FileMetadata()` default and parsing succeeds. But when
`fileMetadata` is **present but partial**, `readNullable` still attempts to deserialise it
and **fails** on the missing required sub-maps. The failure cascades: every hit returns
`JsError` → the hit resolves to `None` → `data: []`, `sortValues: []`, `endCursor` never
set → the grid renders empty (while `total` stays correct, because the count comes from
`trackTotalHits`, computed before projection).

The key observation that drives the solution: the alias values are **not** read from the
parsed `Image.fileMetadata` case-class field at all. `ImageResponse.extractAliasFieldValues`
traverses the **raw** `SourceWrapper.source` JSON. So the parsed `FileMetadata` does not
need to be *populated* for aliases to work — the source JSON only needs to *parse*.

---

## 4. The solution — strip dropped fields before `Image` validation

Decouple the two concerns that the partial object conflates:

- **What `Image` needs to parse:** a JSON object with no partial `fileMetadata`.
- **What alias extraction needs:** the raw alias leaf values, read from the source JSON.

Satisfy both by keeping the full returned source for the wrapper (so alias extraction
sees the leaves) but validating a *copy* with the dropped fields removed (so `Image`
parses cleanly).

### Mechanism

A search-after-specific resolve step:

```scala
val parsed   = Json.parse(sourceAsString)                                  // full: partial fileMetadata leaves present
val forImage = searchAfterDropFields.foldLeft(parsed.as[JsObject])(_ - _)  // strip every dropped top-level field
forImage.validate[Image] match {
  case JsSuccess(image, _) =>
    Some(SourceWrapper(parsed, image, fromIndex, fields))                  // wrapper keeps the FULL source
  case JsError(_) => None
}
```

Why fold over *all* `searchAfterDropFields` rather than just `fileMetadata`: any dropped
field an alias path reaches will be partially present for the same reason. Stripping a
fully-absent field is a no-op; stripping a partially-present one restores the
"absent → default" path that `Image`'s reader already tolerates (the slim projection
parses fine when `fieldAliasConfigs` is empty, which proves each dropped field is
optional).

`extractAliasFieldValues` is **unchanged** — it reads `JsDefined(source.source)`, and
`source.source` is the full `parsed` JSON that still carries the alias leaves.

### What changes

1. **Projection** (search-after only): the slim Image field set plus the alias leaf
   paths — exactly the line shown in §3. Tiny payload: the only `fileMetadata` bytes on
   the wire are the alias leaves themselves.
2. **A new search-after-only resolve variant** (e.g. `resolveSearchAfterHit`) doing the
   strip-before-validate above, called from the `searchAfter` hit loop.
3. Nothing else. `extractAliasFieldValues`, `SourceWrapper`, the `FileMetadata`/`Image`
   readers, and the shared `mapImageFrom`/`resolveHit` are untouched.

### Scope and production impact

This is confined to `searchAfter` in `ElasticSearch.scala`. The shared `resolveHit`
(used by `imageSearch` and three other production paths) and `mapImageFrom` (also used by
`getImageWithSourceById`) are **not** modified — the strip-before-validate lives in a
deliberately separate variant so it cannot leak into any production path. The normal Grid
`search()`, `imageSearch`, `getImage`, `hitToImageEntity`, and the shared
`ImageResponse.create` builder are byte-for-byte unchanged. There is **no `common-lib`
change**, so no other service (thrall, image-loader, kahuna, …) is affected.

It is **possible** to apply the same payload-slimming pattern to the production search
path — it currently fetches the full `_source` including `fileMetadata` — and shrink its
per-hit payload the same way. That is **deliberately out of scope and will not be
attempted here:** the production search path has many more downstream consumers (kahuna,
the public API, `?include=fileMetadata` caller CropperController.scala:194), so the risk/benefit does not justify
touching it for this change. This optimisation is Kupua-specific by design.

### `instance.fileMetadata` is empty for search-after results

Under this fix the parsed `Image.fileMetadata` is the empty `FileMetadata()` default for
search-after hits. The only place reachable from the search-after response builder that
reads the parsed field is `fileMetadataEntity` (`ImageResponse`), and it only serialises
the data when the request carries `?include=fileMetadata`. Kupua never sends that on this
endpoint, so the response is unaffected. (If a future caller did send it, they would get
empty maps — acceptable for this endpoint, but noted.) Everything else — aliases,
validity, cost, persistence, syndication, and `isPotentiallyGraphic` (computed
server-side via the ES script field, independent of the projection) — reads either the
raw source JSON or unrelated `Image` fields.

### Edge cases

- **Empty `fieldAliasConfigs`** (no `common.conf`): the projection adds no alias paths,
  `fileMetadata` is fully absent, the strip is a no-op, parse succeeds — identical to the
  pre-alias behaviour.
- **Alias paths outside `fileMetadata`:** handled for free — the projection includes the
  exact leaf path, the strip only removes `searchAfterDropFields`, and alias extraction
  reads the leaf from the full source.
- **Type fidelity:** alias leaves come back as proper JSON from `_source` (e.g.
  `fileMetadata.xmp.*` values retain their `JsValue` shape), so no stringification or
  array-unwrapping handling is required.

---

## 5. State of play (what's been done / what's pending)

| Item | Status |
|---|---|
| `~/.grid/common.conf` with Guardian `field.aliases` | Created manually |
| `kupua/src/types/image.ts` — `aliases?` field added | Done |
| `kupua/src/lib/field-registry.tsx` — accessor reads `img.aliases?.[alias]` first | Done |
| `media-api/.../ElasticSearch.scala` — slim projection + alias leaf paths | Done |
| `media-api/.../ElasticSearch.scala` — `resolveSearchAfterHit` (strip-before-validate) | Done |
| `start.sh` gap: not downloading `common.conf` | Known issue, not fixed |
| Tests: search-after alias round-trip + partial-`fileMetadata` regression guard | Done (`ElasticSearchTest`) |
| `deviations.md` §32 recorded | Done |

### Test plan

1. **Failing-first:** a resolve/`searchAfter` unit test with a hit whose source has a
   partial `fileMetadata` (only `icc.Profile Description`). Assert it currently fails to
   resolve, then passes after the fix and that the alias surfaces in the response.
2. **Alias round-trip:** assert `extractAliasFieldValues` returns the colour-profile
   value from a search-after hit with the slim projection.
3. **Empty-config regression:** with no `fieldAliasConfigs`, assert search-after results
   resolve and contain no `aliases` object.
4. **Production untouched:** confirm the shared `resolveHit` / `imageSearch` tests are
   unchanged and still green.

---

## 6. Deviation to record when this ships

Recorded as `deviations.md` §32 (`searchAfter` strips dropped fields before `Image`
validation):

> **`searchAfter` strips dropped fields before `Image` validation**  
> The search-after endpoint omits the heavy `fileMetadata` / `embedding` /  
> `originalMetadata` fields from the `_source` projection but adds back the specific  
> alias leaf paths. The returned source therefore contains a *partial* `fileMetadata`,  
> which `Image`'s reader cannot parse. A search-after-only resolve variant strips the  
> dropped top-level fields from a copy of the source before `validate[Image]`, while the  
> wrapper keeps the full source so `extractAliasFieldValues` can read the alias leaves.  
> The shared `resolveHit` used by production search is intentionally left alone.  
> Trade-off: a tiny per-hit JSON transform vs. carrying the full `fileMetadata` blob on  
> every scroll page.
