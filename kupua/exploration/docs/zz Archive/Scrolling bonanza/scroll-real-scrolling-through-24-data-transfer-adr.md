# ADR: Data Transfer Optimisation for Search Results

> **Created:** 2026-04-10
> **Status:** Decided — no action needed
> **Context:** Scroll-24 investigation into whether custom encoding or
> compression changes could meaningfully reduce wire size / parse time
> for image search results streamed from ES → media-api → browser.

---

## Question

Can we reduce transfer size or improve parse speed for search result
payloads by switching to Zstandard compression, a shared-key dictionary
scheme, or a binary encoding (MessagePack, CBOR, etc.)?

## Data Shape

Each ES hit is ~24 KB of JSON (NDJSON sample: `exploration/mock/sample-data.ndjson`).
The bulk comes from:

| Field               | Approx. share | Needed by client? |
|---------------------|---------------|-------------------|
| `embedding` (1024 floats) | ~40%    | No (search-time only) |
| `fileMetadata` (EXIF/IPTC/XMP/ICC) | ~30–40% | Rarely |
| `originalMetadata`  | ~10%          | No (duplicate of `metadata`) |
| `metadata` + everything else | ~15% | Yes |

## Options Evaluated

### 1. Shared-key dictionary (application-layer)

Encode keys once, reference by index. Saves ~2% — the keys are a tiny
fraction of payload; values dominate. Brotli's sliding-window dictionary
already collapses repeated keys automatically. Adds schema versioning
complexity for negligible gain. **Rejected.**

### 2. Brotli (`Content-Encoding: br`)

- Better compression ratio than gzip (~15–25% smaller on JSON).
- Universal browser support since 2017.
- **Play Framework does not ship a Brotli filter.** `GzipFilterComponents`
  is the only built-in compression mixin. Switching to Brotli requires
  the same custom-filter work as Zstandard: a new `EssentialFilter` in
  `GridComponents.scala` (base class of all 12 services) plus a native
  JVM dependency ([Jvm-Brotli](https://github.com/nicstach/Jvm-Brotli)
  or similar, with platform-specific binaries).
- Brotli is also **slower to compress** than gzip at equivalent ratios,
  which would increase TTFB on uncached, dynamically-generated API
  responses. (Brotli's strength is pre-compressed static assets, where
  you compress once and serve many times — Play's `sbt-gzip` pipeline
  already handles that for kahuna's static files.)
- Same ~6 KB absolute saving per search request as Zstandard.
  **Rejected — same cost/risk argument as zstd, with worse server-side
  compression speed.**

### 3. Zstandard (`Content-Encoding: zstd`) — same problem, faster decompression

- Browser support: Chrome 123+, Firefox 126+, Safari 18+ — fine for 2026.
- ~15–20% smaller than gzip on JSON; ~3–5× faster decompression.
- Trained dictionary mode could add another 30–50%, but
  Compression Dictionary Transport isn't standardised yet; using it
  requires WASM decompression in JS (losing the native-speed benefit).

Grid architecture for this path:

```
Browser → ALB → Play (media-api, gzipFilter) → elastic4s JavaClient → ES
```

Implementation would require:
- Replacing `gzipFilter` in `GridComponents.scala` — the **base class of
  all 12 Grid services** — with a custom `EssentialFilter` that
  content-negotiates zstd vs gzip.
- Adding `zstd-jni` (native JVM dependency with platform-specific
  binaries for x86/ARM).
- ES only speaks gzip on the ES→Play leg; no change possible there.

Absolute gain on a typical 50-image search (200–400 KB uncompressed):
gzip → ~40 KB, zstd → ~34 KB. **~6 KB saved, <5 ms difference.**
Decompression speedup is submillisecond (gzip already decompresses
40 KB in <1 ms). **Rejected — cost/risk vastly exceeds benefit.**

### 4. `_source` filtering (exclude unused fields)

Exclude `embedding`, `fileMetadata`, `originalMetadata` from the ES
`_source` response. Cuts uncompressed payload by **60–70%** per hit.
This is a one-line change in the ES query (`sourceInclude`/`sourceExclude`).
No new dependencies, no infra changes, no risk to other services.

## Decision

**Do nothing about compression.** Gzip (already active via Play's
`GzipFilterComponents`) is sufficient. The real win is not sending data
the client doesn't need — that's a query-level `_source` filter, not a
transport-level change.

If transfer size becomes a measured bottleneck in future (e.g. streaming
10K+ results for virtual scroll), Zstandard via `Content-Encoding: zstd`
is architecturally viable and can be revisited. The ALB passes arbitrary
`Content-Encoding` headers through untouched.

## Key Facts

- `JSON.parse()` is already the fastest JSON parser available in-browser
  (native C++ in every engine). No JS-land alternative beats it.
- `Content-Encoding: br` (Brotli) or `Content-Encoding: gzip` — both
  decompress natively in C++ before JS ever sees the response. Zero
  JS-side cost.
- Grid's search latency is dominated by ES query time and network
  round-trips, not response encoding.

## References

- `GridComponents.scala` — `rest-lib/.../play/GridComponents.scala` (gzip filter, line 35)
- `ElasticSearchClient.scala` — `common-lib/.../elasticsearch/ElasticSearchClient.scala` (elastic4s JavaClient)
- `riff-raff.yaml` — deployment config (12 autoscaling services)
- Zstandard browser support: Chrome 123 (Mar 2024), Firefox 126 (May 2024), Safari 18 (Sep 2024)
- Compression Dictionary Transport: draft spec, Chrome 124+ behind flags




