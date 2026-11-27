# D3 search-after — payload/perf findings (dev, 2026-06-12)

> Investigation into why `POST /images/search-after` (kupua → media-api → ES, dev,
> `--use-media-api` + `--use-TEST`) felt very slow (~3s) on Home reload, while
> kupua's direct-ES path was ~274ms for the same logical query.
>
> **Headline:** it is **not** the query, **not** route-mixing, **not** lack of
> co-location. It is **response payload size × dev SSH-tunnel bandwidth**. ES
> compute is ~90–160ms throughout. The fat `_source` (esp. `fileMetadata` and
> `embedding`) is the entire problem, and it is a **dev-tunnel artefact** —
> production's fast media-api↔ES link makes the same payload cheap, which is why
> real Kahuna isn't slow.

## How we measured

Temporary diagnostics added to `ElasticSearch.searchAfter` (all marked
`TEMP … REVERT before commit`):

1. `request.show` — the exact ES query JSON.
2. `r.result.took` — ES's **own internal** query time (excludes transport).
3. Per-field `_source` byte breakdown, summed across all 200 hits, sorted desc,
   with `fileMetadata` split into sub-keys — lets us size any candidate
   exclusion **from a single reload**.
4. A `request.sourceExclude(...)` toggle to measure projections live.

`executeAndLog` (already present) wraps **only** the ES call, so
`executeAndLog − took` ≈ transport (media-api ↔ ES over the tunnel).

## Key fact: the query is trivial; ES is fast

The query JSON for a Home reload is ordinary: `must_not` soft-deleted +
replaced-usages, a `uploadTime` range filter, sort `uploadTime desc` + `id asc`,
`track_total_hits`. No aggregations, no scripts. ES `took` was **89–236ms** in
every config. The wall-clock time is dominated by getting the response bytes
back through the tunnel.

Secondary confirmation of head-of-line blocking: with the **full** payload in
flight, a trivial `/management/healthcheck` ES call ballooned to **1234ms**
(normally ~30ms). With the stripped payload, healthchecks stayed at ~30ms — the
fat response was monopolising the tunnel link.

## Measurements (200 hits/page, Home reload, dev TEST tunnel)

| Config | `_source` excludes | `_source` size | ES `took` | transport leg (`executeAndLog`) | total POST |
|---|---|---|---|---|---|
| **fullfat** | none | 2122KB | 157–236ms | ~2900–3067ms | ~3100–3300ms |
| **Option 1** | `embedding`, `originalMetadata` | 1320KB | 92ms | 1859ms | 1970ms |
| **all-stripped** | `embedding`, `fileMetadata`, `originalMetadata` (keep `thumbnail`) | 344KB | 89ms | 648–772ms | 791–980ms |
| *(kupua direct — reference)* | 30-field include whitelist | ~250KB | 86ms | — | ~274ms |

Transport is ~linear with payload (~1.3ms/KB over this tunnel). Stripping 84%
of the payload cut total time ~4×.

> Note: an earlier "all-stripped + `thumbnail`" run (296KB) **crashed** in
> enrichment — see "Enrichment dependencies" below. The 344KB figure keeps
> `thumbnail`.

## Per-field `_source` breakdown (fullfat, summed across 200 hits)

| Field | Size | kupua uses? |
|---|---|---|
| **`fileMetadata`** (total) | **966–970KB (46%)** | only ~6 small leaves + aliases |
| └ `fileMetadata.xmp` | ~398–409KB | a few specific keys |
| └ `fileMetadata.iptc` | ~207–210KB | "Edit Status" (alias) |
| └ `fileMetadata.icc` | ~142–152KB | "Profile Description" (alias) |
| └ `fileMetadata.exifSub` | ~112–120KB | ❌ none |
| └ `fileMetadata.exif` | ~54–55KB | ❌ none |
| └ `fileMetadata.colourModelInformation` | ~13–14KB | ✅ keeps |
| └ `fileMetadata.getty` | ~2–3KB | ❌ |
| **`embedding`** | **630KB (30%)** | ❌ never |
| `metadata` | ~159–163KB | ✅ (display) |
| `originalMetadata` | ~159–163KB | ❌ |
| `source` | 46KB | only `.dimensions` |
| `thumbnail` | 45KB | ❌ (kupua uses its own direct-S3 link) |
| `usageRights` / `originalUsageRights` / `usages` / `leases` / `exports` / `id` / dates | single-digit KB each | mostly ✅ |

**`fileMetadata` (970KB) is the elephant — bigger than `embedding`.** Any
optimisation that leaves `fileMetadata` in (i.e. Option 1) only halves the pain.

## Ingredient-field sizes across 10k mock docs

Measured by running a Python analysis script against
`kupua/exploration/mock/sample-data.ndjson` (the real 10k Guardian sample,
115 MB on disk). Fields are top-level keys on the ES `_source` object.
"Ingredient" means the pre-edit snapshot that was merged to produce the
authoritative field (`metadata` = `originalMetadata` + user edits;
`usageRights` = `originalUsageRights` + user rights edits).

| Field | Present | Size (MB) | % of total | avg bytes/doc |
|---|---|---|---|---|
| `fileMetadata` *(already dropped)* | 10,000 | 56.85 | 52.8% | 5,961 |
| `embedding` *(already dropped)* | 1,717 | 20.93 | 19.4% | 12,780 |
| **`originalMetadata`** | 10,000 | **10.21** | **9.5%** | 1,071 |
| `originalUsageRights` | 10,000 | 0.05 | ~0% | 6 |
| **Total payload (all fields)** | — | 107.7 | 100% | — |

**Safety check (same dataset):**

- `originalMetadata` differs from `metadata`: **45 / 10,000 docs (0.5%)** — images
  edited by users. Safe to drop for Kupua's search grid (never displays the
  pre-edit snapshot).
- `originalUsageRights` differs from `usageRights`: **6 / 10,000 docs (0.1%)** —
  negligible payload (6 bytes/doc average); not worth adding to the drop set.

**Takeaway:** dropping `originalMetadata` is worth it (9.5% per scroll page).
Dropping `originalUsageRights` is not (noise). The asymmetry in the drop set is
economics, not oversight.

## What "enrichment" means

The work `imageResponse.create` does to turn a raw ES `_source` doc into the
Argo API response — not a copy, it **computes/adds**:

- signed S3 URLs (`secureUrl` for `source`, **`thumbnail`**, `optimisedPng`);
- `cost` (`Costing.getCost(usageRights)`);
- `valid` / `invalidReasons` (metadata-completeness + usage restrictions);
- `persisted` (from `leases`/`usages`/`identifiers`/`collections`);
- `syndicationStatus`;
- permission-based `actions` / `links`;
- custom special-instructions / usage-restrictions (config, keyed off
  `usageRights.category`);
- Argo wrapping (`usages`/`leases`/`collections`/`fileMetadata`);
- `aliases` (`extractAliasFieldValues` — see below).

kupua-direct does **none** of this server-side; it re-derives everything in TS
(`deriveImage`, `calculateCost`, `calculateSyndicationStatus`, own S3/imgproxy
URLs). That is why kupua-direct can trim `_source` so hard.

## Enrichment dependencies (what a projection MUST keep)

Stripping `thumbnail` crashed with `JsError.get` at `ImageResponse.scala:119`.
Cause: `addSecureThumbUrl` does `(__ \ "thumbnail").json.update(...)` — it
navigates to the `thumbnail` path, which fails if absent. So any `_source`
projection for this endpoint **must retain the fields enrichment transforms
pick**: at least `thumbnail`, `source`, `optimisedPng` (when present),
`metadata`, `usageRights`, `userMetadata`.

Verified safe to strip (no transform reads them; parse via `readNullable`):
`embedding`, `originalMetadata`. Stripping `fileMetadata` wholesale does **not**
crash (it is written link-only when `expandFileMetaData=false`), **but** it drops
the leaves/aliases kupua reads (below).

## Two non-issues (clarified)

- **Arbitrary `has:` searches** (e.g. `has:fileMetadata.xmp.GettyImagesGIFT:AssetID`,
  `has:embedding.cohereEmbedV4`) are **query-time `exists` filters**, evaluated
  against the index mappings — **independent of `_source` projection**. Stripping
  a field from the returned source does **not** affect searchability. Moot.
- **Config-driven field aliases** ("Edit Status", "Profile Description") are
  **NOT** moot. They are content *values* the server surfaces by reading source
  paths (`fileMetadata.iptc."Edit Status"`, `fileMetadata.icc."Profile Description"`)
  and re-exposing them as top-level `aliases`. That read is against the returned
  `_source`, so the underlying paths **must be fetched**. **However**, the
  alias→path mapping lives in **media-api's own config**, so the server can
  self-derive that part of the "must include" floor — kupua need not send it.

## Recommendation

- **Option 1 (`embedding` + `originalMetadata` only)** — provably safe, zero
  enrichment risk, but only ~37% faster in dev because it keeps the 970KB
  `fileMetadata`. **Not worth shipping on its own.**
- **The real win** requires a **leaf-precise `fileMetadata` projection**: keep
  kupua's ~6 leaves + the alias paths (server self-derives those from config),
  drop the heavy `xmp`/`iptc`/`icc`/`exif` subtrees. Because ES `_source`
  exclude semantics make "exclude parent, keep child" unclean (parent-exclude
  beats child-include), the right shape is an **includes list** =
  kupua's display leaves ∪ enrichment-mandatory floor ∪ alias paths, applied
  **only** to the kupua endpoint. This is its own scoped design task (needs a
  contract test that the enriched response matches direct-ES derivation).
- **Prod relevance:** this is largely a **dev-tunnel artefact**. On prod's fast
  media-api↔ES link the full 2.1MB moves in ~ms. The optimisation still has
  real value (not fetching a discarded 1024-dim `embedding`; less bandwidth/GC),
  but the dramatic 4× is a dev-only number. Do not over-invest in it as a prod
  perf fix.

## Cross-reference: kupua's `fileMetadata` includes vs the alias config

kupua's `SOURCE_INCLUDES` (`src/dal/es-config.ts`) cross-referenced against the
vendored field-alias config (`src/lib/grid-config.ts` → `gridConfig.fieldAliases`,
which mirrors media-api's `field.aliases` config read by `config.fieldAliasConfigs`):

| kupua `fileMetadata.*` include | In `field.aliases`? | alias |
|---|---|---|
| `fileMetadata.colourModel` | ✅ | `colourModel` |
| `fileMetadata.colourModelInformation` | ✅ partial — config has `.hasAlpha` + `.bitsPerSample` | `cutout`, `bitsPerSample` |
| `fileMetadata.iptc.Edit Status` | ✅ | `editStatus` |
| `fileMetadata.icc.Profile Description` | ✅ | `colourProfile` |
| `fileMetadata.xmp.Iptc4xmpExt:DigitalSourceType` | ✅ | `digitalSourceType` |
| `fileMetadata.xmp.Iptc4xmpCore:Scene` | ✅ | `sceneCode` |
| `fileMetadata.xmp.pur:adultContentWarning` | ❌ | — (client-side `isPotentiallyGraphic`) |

**6 of 7 are config-derived aliases** — the server already knows their
`elasticsearchPath` from `field.aliases` (no enumeration needed). The 7th
(`pur:adultContentWarning`) is a **past kupua workaround**: kupua fetches it raw
to compute `isPotentiallyGraphic` client-side because it had no server.
media-api **already computes `isPotentiallyGraphic`** (Painless script,
`ElasticSearch.scala:318`), so in media-api mode the server can supply it
directly. Net: **zero of kupua's `fileMetadata` needs are unknowable to the
server** — 6 via config, 1 via a feature it already computes.

The non-`fileMetadata` includes (`metadata.*`, `source.*`, `usageRights`,
`leases`, `usages`, `collections`, `syndicationRights`, `softDeletedMetadata`,
`cost`, `valid`, `invalidReasons`, `actions`, core fields) are trivially
server-known: enrichment **always writes or computes** them.

**Consequence:** the server can build the whole `_source` projection floor from
its own knowledge — `field.aliases` paths ∪ enrichment-mandatory fields ∪
`pur:adultContentWarning` (or `isPotentiallyGraphic` as a returned field). No
kupua-sent list, no Scala enumeration, self-maintaining as aliases are added.
(One thing to verify: kupua includes whole `colourModelInformation` while config
references `.hasAlpha`/`.bitsPerSample` — 13KB, include the whole object to be safe.)

## Implementation sketch

**Design priority (user, 2026-06-12):** the Scala endpoint must be **generic,
mergeable to main, and rarely touched**. TS/adapter code can change freely.

**Chosen shape: the server owns semantics** (the Option-A philosophy). The client
consumes *meaning*; the server owns *representation*. Crucially — unlike sorts —
this costs nothing extra here, so we do NOT settle for a client-driven stopgap.

### Why this differs from the sort Option-B decision (don't re-litigate)

Sorts chose Option B (client sends the resolved ES sort clause; server applies it
verbatim) **only** to avoid replicating kupua's complex `buildSortClause` logic in
Scala (alias map, `uploadTime` fallback with direction inheritance, `id`
tiebreaker, nested specials) — a second copy that must stay byte-identical forever,
guarded by parity tests, with silent pagination corruption on drift. Option B
dodged **duplication of complex logic**, and is regarded as a stopgap pending a
proper Option A.

**`_source` projection has no such logic to duplicate.** The server derives the
projection from things it *already owns*:

- alias paths — from `config.fieldAliasConfigs` (already read for
  `extractAliasFieldValues`);
- the enrichment-mandatory floor — from its *own* response builder's needs.

Nothing of kupua's is replicated; the policy ("return the system's configured
alias fields ∪ what enrichment needs") is **Grid-wide and client-agnostic**, not
kupua-specific. So the server owning it is both **clean and generic** — there is no
kupua coupling to avoid. We get the Option-A-equivalent for free, now. A
client-driven include list would be the inferior stopgap shape (leaks the ES
`_source` DSL through the API, ships a redundant field list every request, pushes
policy to the caller) with no compensating benefit.

### Server (Scala) — self-deriving from the schema, no hand-maintained field list

The `_source` document **is** the JSON serialization of media-api's `Image` case
class, so the field names are already declared — as the schema itself. We read
them off the class rather than hand-writing a list:

```scala
// The Image schema IS the field list (computed once into a val).
private val imageSourceFields: Seq[String] =
  classOf[Image].getDeclaredFields.toIndexedSeq.map(_.getName)

// Deliberately dropped: the 1024-dim vector, the pre-edit metadata copy, and the
// fileMetadata bulk (EXIF/XMP/ICC/IPTC). NOT a field list — a "too heavy" decision.
private val searchAfterDropFields = Set("embedding", "originalMetadata", "fileMetadata")

// At call time: schema − giants + the configured alias leaves (kept inside the
// otherwise-dropped fileMetadata).
val projectionIncludes =
    imageSourceFields.filterNot(searchAfterDropFields)
  ++ config.fieldAliasConfigs.map(_.elasticsearchPath)
val projected = request.sourceInclude(projectionIncludes)
```

**Why this is not "a hardcoded list in a search endpoint" (for the sceptics):**

- The **structural fields come from the `Image` schema** via reflection — add a
  field to the model and it's included automatically. No display list to maintain,
  no duplication of kupua's choices.
- The **alias leaves come from `config.fieldAliasConfigs`** (the same config that
  drives `extractAliasFieldValues`) — a new alias is picked up for free.
- The **only literals** are the 3-name `searchAfterDropFields` set — and that's a
  deliberate, self-documenting *exclusion* decision (the three giants), not an
  enumeration of what to keep.
- **Safe by construction:** ES silently ignores `_source` include paths it doesn't
  recognise, so reflection over-inclusion (e.g. coverage-instrumentation synthetic
  fields) can't break anything; under-inclusion can't happen (the case class has
  every field). Computed once into a `val` → zero per-request cost.
- **Honest trade:** an explicit ~20-field list would be more obvious-at-a-glance
  and reflection-free; some engineers prefer that. We chose schema-derivation
  because it removes the hand-maintained list and auto-tracks the model — matching
  the "server-owns-semantics, no hardcoded field policy" goal. The
  over-inclusion-is-harmless property neutralises reflection's usual fragility.

Why an *include* list at all (not just excludes): ES `_source` filtering is
all-or-nothing on includes, and the alias leaves live *inside* the heavy
`fileMetadata.xmp`/`iptc`/`icc` subtrees. Excluding those subtrees would drop the
leaves too (parent-exclude beats child-include). Keeping the leaves while dropping
the bulk therefore *requires* an include list — hence deriving it from the schema.

- **`isPotentiallyGraphic`:** add the existing Painless script field (as
  `imageSearch` already does, `ElasticSearch.scala:318`) and return it — server
  owns the computed *meaning*; the raw `pur:adultContentWarning` need disappears.
  **Verified (2026-06-12):** the script's `params['_source']` reads the FULL stored
  source, unaffected by `_source` fetch filtering — `has:"…pur:adultContentWarning"`
  returned `isPotentiallyGraphic true=33/33` with `fileMetadata` excluded from the
  fetched `_source`. (Note: `extractAliasFieldValues` reads the *fetched* source, so
  the alias leaves must stay in the projection — they do, via the config paths.)
- **Default-lean** for this browse endpoint. If a future fat-needing consumer
  ever appears, add a trivial `?projection=full` opt-out *then* (YAGNI now).

### TS (kupua) — adapts to the cleaner contract

- Sends **nothing extra** for projection — the server decides.
- Reads the server-computed `isPotentiallyGraphic` field in media-api mode; keeps
  the client-side `graphic-image-blur.ts` computation for direct-ES mode (dual
  path lives in TS, where churn is cheap — the deliberate "more TS, cleaner Scala"
  choice).
- `mapApiImageToImage` already normalises Argo entities (`usages`/`leases`/
  `collections`) to the canonical `Image` shape — unchanged.
- Verify kupua needs nothing outside (standard fields ∪ config aliases). With the
  graphic flag handled, its current includes are exactly that, so no gap expected.
  (Minor: kupua includes whole `colourModelInformation`; config references
  `.hasAlpha`/`.bitsPerSample` — include the whole object server-side to be safe,
  it's ~13KB.)

### What MUST stay server-side

Only `enrichmentMandatoryFloor` — because only the server knows what
`imageResponse.create` reads. That's intrinsic to the endpoint, generic, stable.

### Residual coupling (out of scope, flagged)

`orderBy` is still read server-side *only* for the `dateAddedToCollection`
`pathHierarchy` companion filter (from the sort companion design). The last small
kupua coupling; revisit only if maximal purity is wanted later.

### Guardrail

A **contract test** — media-api `searchAfter` response for a fixture image,
mapped through `mapApiImageToImage`, equals the direct-ES enriched derivation —
catches any field kupua reads that its sent `sourceIncludes` (∪ floor) forgot.
Replaces a hand-maintained parity list.

## Status / cleanup

- All changes in `ElasticSearch.searchAfter` are **TEMP diagnostics + a
  `sourceExclude` toggle**, clearly marked `REVERT before commit`. They must be
  removed before any commit.
- `thumbnail`: kupua ignores it (own direct-S3 link) but enrichment requires it;
  end-state for thumbnails is undecided.
