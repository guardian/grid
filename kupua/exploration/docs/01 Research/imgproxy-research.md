# imgproxy Research — Eelpie Fork Analysis

## Delivery Comparison (24 October 2026)

| Metric | imgops | imgproxy 3.31.1 | imgproxy 4.0.19 |
| --- | --- | --- | --- |
| Seen during traversal (≤200ms) | 3/45 | 23/45 | 33/45 |
| Prefetch completed before selection | 7/16 | 9/16 | 9/16 |
| Mean final-image load | 4.36s | 42ms | 58ms |
| Image-body total | 5.06MB | 2.40MB | 2.62MB |
| Mean header wait | 1.71s | 659ms | 648ms |
| Mean post-load decode confirmation | 20.1ms | 27.7ms | 29.8ms |

**"Seen" note:** this is a load-based estimate, not a verified display count.
The full image was observed loaded in the current slot within 200ms; completion
of decode/paint before moving on was not verified. An image decoded or painted
only after leaving was not actually seen, so these counts may overstate display.

Three 15-step fast trials per arm supplied the traversal and final-image figures.
A separate completion-paced pass supplied prefetch, body, header-wait and decode
figures; all sixteen full images loaded/decoded in each arm. Decode confirmation
is the post-load `decode()` wait, not isolated decoder CPU time.
Browser HTTP caching was disabled; decoded/upstream caches remained uncontrolled.
These are configured JPEG/q85 versus AVIF/default delivery paths, not a
quality-matched or cold-upstream transformer benchmark.
The [saved data](../../../e2e-perf/research/traversal-delivery-2026-10-24.json)
and detailed methods below retain the per-image observations and sample counts.

---

## 24 October 2026: Canonical Delivery and PR 5075

**Recommendation:** preserve a stable, authorized media-resource identity across
metadata refreshes, and avoid adding a serial URL-resolution request to each
traversal step. HMAC signing is not inherently a cache-busting operation: the
same key, salt and path produce the same signature. Embedding a newly presigned
S3 URL changes that path, however, and consequently changes the HMAC too.

This section supersedes older assumptions below about the proposed integration.
It assesses [PR #5075](https://github.com/guardian/grid/pull/5075), inspected at
[7fed49a](https://github.com/guardian/grid/commit/7fed49ad5317c847f5d44ef6afe6660c105a85ef),
not the separate packaging/deployment work in PR #5096. No PR code was executed
or modified, and no comment was posted to GitHub.

### Evidence and Comparison Limits

| Delivery/evidence | Result | Interpretation limit |
| --- | --- | --- |
| Saved TEST API/local-proxy rendering checkpoint | Rendering completed; media used local S3/imgproxy proxies | Not a paired delivery-only experiment with the later canonical probes |
| Failed canonical operator attempt | P14b loaded 3/15 within cadence and its final image missed five seconds; P13c rejected a changed warmed URL | No canonical history published; this was not evidence of a five-second actual load time |
| Bounded canonical rank-3 traversal, 1150x919/DPR2 | Final JPEG loaded after 8.305s; request sent in about 3ms, then waited about 8.267s for headers; 35 browser cancellations | Reused context and smaller screen; no controlled imgproxy comparator |
| Bounded canonical replay at campaign screen/viewport 1720x960/DPR2, 15 forward steps at 200ms | 5/15 loaded within cadence; final JPEG loaded after 3.649s, about 212KB encoded, returned 959x1440 from a 2195x3293 source | Some early media was cached; not a fresh-context campaign or throughput ratio |

At campaign size the requested bounds were 2580x1440, q85, r0: Kupua applies its
intentional desktop DPR multiplier of 1.5, then aspect-fit/native caps. The same
target's prefetch and visible URLs matched exactly both before and after reload.
An earlier mismatch in the resized smaller tab is not representative campaign
evidence. Requested bounds, returned dimensions and native dimensions are distinct.

Browser cancellation worked in the bounded reproductions. Earlier visible-image
requests were cancelled or completed, while the slow final request waited for
response headers. This does **not** prove that abandoned source fetches or
transforms stopped upstream. Nor does header wait identify transform CPU, source
delivery, contention or signing as its cause. These earlier rows are not a paired
comparison. A later matched configured-delivery comparison is recorded below;
it does not isolate transformer CPU or establish cold upstream performance.

### Recorded Delivery Arms

The [sanitized fast and slow dataset](../../../e2e-perf/research/traversal-delivery-2026-10-24.json)
retains three valid fast repetitions and one separate completion-paced pass per
arm, over the same ordered cohort and verified native geometry. Labels are
**imgops** and **imgproxy-docker 3.31.1**, as requested by the operator. The latter
version is operator-reported: Docker showed `darthsim/imgproxy:latest`, and the
binary did not expose a `-version` flag. A later **imgproxy 4.0.19** arm repeats
the same protocol after the operator's upgrade; that version is also operator-
reported, with the running Docker image ID recorded. The original arms and
two-arm summary are preserved; `additionalArms` and `threeArmComparison` hold the
extension. These are bounded browser diagnostics, not canonical campaign history.
Browser HTTP caching was disabled and each
document reloaded; decoded-image and upstream caches remain uncontrolled. App
prefetch was unchanged. Screen/viewport were 1720x960 at browser DPR2; the app's
desktop request multiplier remains 1.5. All fast runs preceded the slow pass in
each arm; capture order was imgops, imgproxy-docker 3.31.1, then imgproxy 4.0.19.

| Fast traversal, 15 steps at 200ms | imgops | imgproxy 3.31.1 | imgproxy 4.0.19 |
| --- | --- | --- | --- |
| Seen during traversal, runs 1/2/3 (load-based estimate) | 0/15, 1/15, 2/15 | 9/15, 7/15, 7/15 | 12/15, 11/15, 10/15 |
| Seen during traversal (≤200ms; load-based estimate) | 3/45 (6.7%) | 23/45 (51.1%) | 33/45 (73.3%) |
| Final navigation-to-load, runs 1/2/3 | 5537.8 / 4378.2 / 3150.7ms | 32.4 / 45.0 / 49.2ms | 75.7 / 57.1 / 41.2ms |
| Mean final navigation-to-load | 4355.6ms | 42.2ms | 58.0ms |
| Mean final request waiting for headers | 4418.9ms | 276.2ms | 291.3ms |
| Mean final request body phase | 75.8ms | 2.7ms | 3.6ms |
| Mean final post-load decode confirmation | 16.0ms | 11.0ms | 14.1ms |
| Mean full-image requests, including setup/lookahead | 47.0 | 40.3 | 37.7 |
| Mean browser-cancelled full-image requests | 36.0 | 21.3 | 18.7 |

The final source was 2195x3293. All imgops final bodies were 210,914-byte JPEGs,
returned at 959x1440; the 3.31.1 final bodies were 74,088-byte AVIFs, while 4.0.19
returned 106,260-byte AVIFs, both at 960x1440. Imgops used q85; quality in both
proxy arms was unspecified in the URL and used the respective configured
default. Request duration and navigation-to-load use different origins: prefetch
can start before navigation, so the clocks must not be added. Actual keypress
times and 250ms request/completion bins are retained in the data. The imgops
downward trend is not treated as independent cold samples or attributed to a
particular upstream warming mechanism.

| Completion-paced profile, one pass per arm | imgops | imgproxy 3.31.1 | imgproxy 4.0.19 |
| --- | --- | --- | --- |
| Prefetch completed before selection | 7/16 | 9/16 | 9/16 |
| Successful encoded body bytes across those images | 5,055,967 | 2,402,006 | 2,623,447 |
| Mean header wait | 1709.2ms | 659.2ms | 647.6ms |
| Mean body phase across the images | 60.5ms | 6.6ms | 7.0ms |
| Mean post-load decode confirmation | 20.1ms | 27.7ms | 29.8ms |
| Selected-source attempts / browser cancellations | 24 / 8 | 27 / 11 | 25 / 9 |

The slow pass advances after each full image loads/decodes, with a fifteen-second
cap, not a fixed slow cadence. Its timestamps therefore expose different achieved
input spacing across delivery arms. Each navigation's UTC mark, all matching
request attempts, request/header/completion offsets, dimensions, MIME and byte
sizes are retained. Every selected image in every arm had a successful HTTP200
response with CDP cache flag false. The matched cohort's proxy bodies total
**52.5% fewer bytes** for 3.31.1 than imgops. The 4.0.19 cohort is **9.2% larger**
than 3.31.1 despite both requesting AVIF/default quality. Encoded output is not
normalized between versions; codec/quality equivalence was not visually assessed.

Negative request/completion offsets make prefetch explicit. In imgops's slow pass,
the final request began 496.9ms before navigation and completed 76.3ms before it;
the DOM load appeared 47.9ms after selection. This is prefetch runway, not a 48ms
network fetch. Conversely, browser-cancelled speculative attempts are not proof
that abandoned upstream source fetches or transforms stopped.

**Practical judgement:** imgops was poor at the requested fast traversal; the
local Docker paths were substantially better and eliminated the multi-second final
landing in these samples. The 4.0.19 arm had the highest fast-arrival score, but
still missed 12/45 windows; 3.31.1 missed 22/45. This is not a uniform upgrade win:
4.0.19 had a higher mean final load (58.0 versus 42.2ms) and larger cohort payload.
Small chronological samples and differing encoded output do not isolate a causal
version speedup. This is a
configured end-to-end delivery comparison, not a claim that imgproxy's transformer
CPU is a particular factor faster: codec/quality, network placement, request caps
and uncontrolled upstream state differ. PR #5075's signed resolver path was not
exercised, so these results do not clear its additional API/ES/signing work.

Each slow profile is one pass, not a repeated per-image latency average. Decode
confirmation is measured after load and is not isolated decoder CPU time; loaded is not
pixel-level paint proof. Fast request totals include setup and out-of-cohort
lookahead; slow per-image request rows cover the selected sixteen identities only.
Keep those scopes distinct. Requested bounds differ on ordinals 5 and 15 because
of native-cap policy; observed width differs by one pixel on ordinals 10, 13, 14
and 15, with equal heights. Native dimensions and ordered identities match. The
two AVIF arms also match observed slow-pass dimensions on all sixteen images.

Four 3.31.1 response-header event timestamps appeared after transfer completion;
none did in the 4.0.19 slow pass.
Schema 2 retains those raw marks as `headerEventRelativeToDemandMs`; the separate
`headersCompleteRelativeToDemandMs` uses completion minus the CDP network-timing
body phase. Phase-duration comparisons use response timing, not event delivery.
Only an aggregate sequence fingerprint is saved, not identities or signed URLs.

### When Current Grid Re-signs

Current media-api constructs fresh signed source links for each newly built image
entity: search, search-after, window, mget and singleton responses. Resident
traversal reuses buffered records and **does not re-sign on every arrow press**.
Refills, metadata refreshes and nonresident lookups can introduce fresh signatures.
The adapter preserves the returned links; Kupua has no automatic renewal timer.

The [response builder](../../../../media-api/app/lib/ImageResponse.scala#L82)
uses [S3 signing](../../../../common-lib/src/main/scala/com/gu/mediaservice/lib/aws/S3.scala#L74).
[Rounded expiration](../../../../common-lib/src/main/scala/com/gu/mediaservice/lib/aws/RoundedExpiration.scala#L9)
selects a nearest-ten-minute boundary plus twenty minutes, approximately 15-25
minutes ahead. Each signing call nevertheless samples the current time and passes
the remaining whole-second duration to the AWS presigner. The presigner instance
is reused, not its signed URL results. Signing inputs can therefore change about
once a second even inside one absolute-expiry bucket; this is not necessarily an
expiry extension. Exact same-second SDK behavior was not tested.

The resident-to-singleton browser probe observed the same source path, rendition,
dimensions and transforms but changed signing fields, followed by a new JPEG
transfer. That establishes resource-identity churn at this refresh boundary, not
per-step traversal signing. Deployed HTTP/CDN cache-key handling remains unverified.

### What PR 5075 Changes

- [Resolver](https://github.com/guardian/grid/blob/7fed49ad5317c847f5d44ef6afe6660c105a85ef/media-api/app/controllers/MediaApi.scala#L588):
  authenticates, reads the image from Elasticsearch, checks visibility, presigns
  its source and returns a fixed imgproxy URL as JSON. This is additional work
  before the eventual image request, not just a local HMAC calculation.
- [URL builder](https://github.com/guardian/grid/blob/7fed49ad5317c847f5d44ef6afe6660c105a85ef/common-lib/src/main/scala/com/gu/mediaservice/lib/imgproxy/ImgProxyUrlBuilder.scala#L25):
  base64url-encodes the entire source URI, including its signing query; fixed URLs
  HMAC-sign the resulting transform/source path. Fresh S3 signing therefore
  changes the encoded browser path and its HMAC, not merely removable query fields.
- [Response links](https://github.com/guardian/grid/blob/7fed49ad5317c847f5d44ef6afe6660c105a85ef/media-api/app/lib/ImageResponse.scala#L271)
  and [Kahuna consumer](https://github.com/guardian/grid/blob/7fed49ad5317c847f5d44ef6afe6660c105a85ef/kahuna/public/js/imgops/service.js#L41):
  signed mode advertises resolver links and `optimisedUrlsRequireResolution`;
  Kahuna calls `link.get()` for JSON before requesting the image. The unsigned
  template path also embeds the presigned source and can retain URL churn without
  HMAC. Client/HAL reuse and deployed cache behavior were not measured.
- Current local Kupua imgproxy instead uses a stable S3 bucket/key URL and supplies
  AWS credentials separately to the container. Credential refresh does not alter
  that browser URL. Its unsigned **local development** setup is not a production
  authorization recommendation.

### Explicit PR Recommendations

1. **Keep source identity stable across signing refresh.** Prefer a stable object
  identity/version with server-side S3 access, or another reviewed design that
  separates delivery identity from rotating upstream credentials. Specify bounded
  authorization leases, revocation and cache scope explicitly; do not turn a
  stable URL into permanent public access. Do not strip signing fields on the
  client or ignore them in a cache before authorization validation.
2. **Keep HMAC policy separate from nested S3 URL churn.** Test deterministic HMAC
  for identical authorized inputs and deliberate invalidation on source version,
  policy/key or transform changes. Removing outer HMAC alone does not stabilize
  a path containing freshly presigned S3 credentials. The PR discussion's proposed
  split of delivery migration and signing policy is a useful review boundary,
  not approval to weaken authorization or required watermark/metadata policy.
3. **Avoid a serial resolver call for every displayed/prefetched rendition.**
  Consider returning common authorized rendition URLs in existing metadata or
  bounded batch resolution with deduplication/reuse and cancellation. Retain
  access checks. At five traversal steps per second, an uncached per-step resolver
  could add five foreground API/ES lookups per second before prefetch; this is
  workload arithmetic, not a measured PR request rate. Measure actual resolver,
  ES, media and cancellation counts separately. Existing zero singleton/mget
  lookup counts do not cover the new resolver's own Elasticsearch read.
4. **Make the link contract explicit for every consumer.** Kupua currently expands
  returned links directly into image sources; it does not implement the new
  JSON-resolver contract. A resolver URL is not an image URL. Cover resident,
  nonresident and prefetch consumers, failed/stale resolution and rapid ownership
  changes. Do not silently fall back to an original file and call that equivalent
  optimized delivery. Fail closed on invalid production signing configuration;
  the builder's insecure fallback needs an explicit deployment-policy decision.
5. **Add refresh-boundary and traversal acceptance evidence.** Fetch the same
  unchanged image through search, singleton, mget/refill and revisit at distinct
  signing times; verify URL reuse within the selected lease policy. Include
  expiry, role/key rotation, visibility changes and unauthorized access. Exercise
  the actual signed deployment configuration, not only insecure local templates.
  Verify upstream abort behavior independently of browser cancellation.
6. **Compare delivery with controlled provenance, not a new format confound.**
  Hold ordered identities, native sizes, campaign screen/viewport/DPR, cadence and
  processing policy; report requested bounds, returned dimensions, MIME, encoded
  bytes, header/body/decode milestones, cache evidence and readiness/censor counts.
  AVIF/quality changes are a separate axis. Use a 15-second observation with
  actual completed times and explicit incompletes, not deadline-valued success.

P13c revision 3 measures returned media and records exact warmed-URL reuse as
evidence, rather than requiring or asserting warm delivery. Its metadata and
decoded-image clocks remain separate. The
[deployment measurement workplan](../zz%20Archive/deployment-probe-audit-workplan.md)
owns current execution status; these recommendations authorize no deployment,
backend change, security-policy change or new campaign.

> **Date:** 2026-03-22
> **Source:** `/Users/mkarpow/code/eelpie/grid` (Tony McCrae's fork)

## Scope

**imgproxy is only for full-size images.** Thumbnails are already
well-optimised in the thumb bucket and are served directly via our existing
S3 proxy — no transformation needed. imgproxy solves the problem of displaying
full-size originals, which can be huge (50MB+ TIFFs, large JPEGs) and need
server-side resize/format-conversion before being sent to the browser.

## Summary

The eelpie fork replaced the old nginx `image_filter` module ("imgops") with
[imgproxy](https://github.com/imgproxy/imgproxy) for production. The local dev
setup (`docker-compose.yml`) still uses nginx imgops (pointing at localstack).
The imgproxy swap was a **server-side-only** change — kahuna's client code
didn't change at all.

## How the swap works

### 1. URL generation (server-side, `ImageResponse.scala`)

The old `makeImgopsUri` generated nginx-style query-param URLs:
```
https://imgops-host/s3/path/to/image?w=800&h=600&q=85&r=0
```

The new `makeImgProxyUri` generates imgproxy-style path-segment URLs:
```
https://imgproxy-host/no-signature/auto_rotate:false/strip_metadata:true/strip_color_profile:true/resize:fit:{w}:{h}/quality:{q}/rotate:0/<base64url-encoded-source-URL>
```

Key details:
- **`no-signature`** — they skip HMAC signing (imgproxy supports it but it's not used)
- **`auto_rotate:false`** — EXIF auto-rotation disabled; rotation is explicit
- **`strip_metadata:true`** — strips EXIF etc. from output
- **`strip_color_profile:true`** — forces sRGB; avoids colour space issues
- **`resize:fit:{w}:{h}`** — fits within box, preserving aspect ratio
- **`quality:{q}`** — JPEG quality
- **`rotate:N`** — explicit rotation for EXIF orientation correction (only positive values)
- **Source URL is base64url-encoded** (RFC 4648 §5, URL-safe alphabet)

The `{w}`, `{h}`, `{q}` are **URI template placeholders** — the media-api returns
them as-is, and kahuna's HAL client fills them in when following the link (via
`image.follow('optimised', { w: 800, h: 600, q: 85 }).getUri()`).

### 2. Service routing (`Services.scala`)

On `main`, imgproxy is wired as a subpath service:
```scala
val imgopsBaseUri: String = subpathedServiceBaseUri("imgproxy")
// produces: https://root-host/imgproxy
```

On the `containerised` branch it's the same but with `SingleHostServices` —
all services live behind a single host (reverse proxy / ingress).

Later commits moved to vhost-based routing:
```scala
override def imgopsBaseUri(instance: Instance): String = vhostServiceName("imgproxy", instance)
```

### 3. Client-side (unchanged)

Kahuna's `imgops/service.js` was **not modified**. It calls:
```js
image.follow('optimised', { w, h, q }).getUri()
```
This follows the HAL `optimised` link from the media-api response, substituting
the template params. The client never knows whether the backend is nginx or
imgproxy — it just follows the link.

### 4. Additional production changes

- **Removed `transcodedMimeTypes`** — imgproxy handles TIFF→JPEG conversion
  natively (via libvips), so the image-loader no longer needs to pre-convert
  uploaded TIFFs to browser-viewable formats
- **Removed `fullOrigin` and `imageOrigin`** from kahuna CSP — imgproxy is on
  the same host as the UI, so no extra CSP origins needed
- **Removed `transformImage`** from `ImageOperations.scala` — the ImageMagick
  transcoding step is no longer needed

### 5. imgproxy fork (`cloudbuild.yml`)

Tony has a fork of the imgproxy repo with a single file — a Google Cloud Build
config that builds the stock imgproxy Docker image and pushes it to GCR. This is
just a CI/CD convenience; there are **no code changes to imgproxy itself**. He
uses the stock `darthsim/imgproxy` with default config.

## What this means for kupua

### Thumbnails — no change

Thumbnails are already well-optimised in the thumb bucket. They continue to
be served via our existing S3 proxy (`s3-proxy.mjs`), which fetches them
directly from S3 with no transformation. This works well and doesn't need
imgproxy.

### Full-size images — imgproxy

imgproxy runs as a Docker service in `kupua/docker-compose.yml` (profile:
`imgproxy`, only started in TEST mode). Configuration:

```yaml
imgproxy:
  image: darthsim/imgproxy:latest
  ports:
    - "3002:8080"
  environment:
    IMGPROXY_USE_S3: "true"
    IMGPROXY_S3_REGION: eu-west-1
    IMGPROXY_ALLOW_ORIGIN: "*"
    IMGPROXY_ALLOW_INSECURE: "true"
  volumes:
    # Mount host AWS credentials so imgproxy can access S3 (read-only, local dev only)
    - ~/.aws:/root/.aws:ro
```

URL generation is in `src/lib/image-urls.ts` (`getFullImageUrl()`). Example:
```
/imgproxy/insecure/auto_rotate:false/strip_metadata:true/strip_color_profile:true/resize:fit:1200:1200/quality:80/plain/s3://image-bucket/b/e/0/c/b/a/<imageId>@webp
```

Default options (can be overridden per-call):
- **Size:** `resize:fit:1200:1200` — fits within box, preserves aspect ratio
- **Quality:** 80
- **Format:** WebP (good compression, wide browser support)
- **Processing:** `auto_rotate:false`, `strip_metadata:true`,
  `strip_color_profile:true` (matches eelpie fork)

AVIF is also supported (`format: "avif"`) — much smaller files but slower to
generate. Since the 2026-10-24 Docker image upgrade, libheif automatically selects
`AOM_TUNE_IQ` for ordinary lossy AVIF still images — see
[AVIF encoding deep-dive](#avif-encoding-deep-dive--library-archaeology) below.
Can be swapped in later once we have a lightbox to optimise.

### Why imgproxy for full images

1. **Resize on the fly** — no more serving 50MB originals to the browser
2. **Format conversion** — TIFF, PNG → JPEG/WebP automatically
3. **Battle-tested** — widely used, handles edge cases (colour profiles,
   EXIF orientation, progressive JPEG, etc.)
4. **Stock Docker image** — nothing custom to maintain

### Differences from the eelpie fork

- **No Kubernetes** — we use `docker compose` locally
- **No vhost routing** — we use Vite's dev proxy (`/imgproxy` → port 3002)
- **No HAL link templates** — kupua generates imgproxy URLs directly in
  `image-urls.ts` (no media-api yet); the fork has the media-api generate
  template URLs with `{w}`, `{h}`, `{q}` placeholders filled by kahuna
- **`insecure` not `no-signature`** — same effect (no HMAC), different syntax
  (imgproxy's `plain` source URL encoding vs base64url in the fork)

---

## AVIF encoding deep-dive — library archaeology

> **Date:** 2026-04-02
> **Investigated from:** live `darthsim/imgproxy:latest` container

### Library versions in the container

| Library | Version | Notes |
|---------|---------|-------|
| imgproxy | 3.31.1 | |
| libvips | 8.16.0 (soname 42.20.0) | |
| libheif | 1.21.2 | |
| libaom | 3.13.1 | |
| libjxl | 0.11.2 | |

### The AVIF encoding call chain

**imgproxy** (`vips/vips.c:1103`) calls libvips with minimal parameters:

```c
// imgproxy → libvips
vips_heifsave_buffer(in, buf, len,
    "Q", quality,
    "compression", VIPS_FOREIGN_HEIF_COMPRESSION_AV1,
    "effort", 9 - speed,
    NULL);
```

No tune, no chroma override, no encoder selection.

**libvips 8.16** (`heifsave.c`) then passes to libheif:

1. `heif_encoder_set_lossy_quality(Q)`
2. `heif_encoder_set_lossless(false)`
3. `heif_encoder_set_parameter_integer("speed", 9 - effort)`
4. `heif_encoder_set_parameter_string("chroma", ...)` — `"444"` if Q ≥ 90, else `"420"`
5. `heif_encoder_set_parameter_integer("threads", ...)` — capped to vips concurrency
6. `heif_encoder_set_parameter_boolean("auto-tiles", TRUE)` — parallelism

**libvips 8.16 does NOT pass a `tune` parameter.** The `tune` param was added
in libvips 8.18.0 (Dec 2025) as an optional string defaulting to `NULL` (let
libheif decide).

**libheif 1.21.2** (`encoder_aom.cc:313`) defaults to:

```c
p->string.default_value = "ssim";  // since libheif v1.9.0, Sep 2020
```

…which results in:

```c
aom_codec_control(&codec, AOME_SET_TUNING, AOM_TUNE_SSIM);
```

**Bottom line:** despite libaom defaulting to `AOM_TUNE_PSNR`, our AVIF images
are encoded with **`AOM_TUNE_SSIM`** because libheif overrides the default and
neither libvips 8.16 nor imgproxy override it further.

### The `--tune=iq` / `AOM_TUNE_IQ` timeline

libaom's `AOME_SET_TUNING` default has **always** been `AOM_TUNE_PSNR`. The
newer tune modes were added as opt-in values, not default changes:

| Date | libaom version | What happened |
|------|---------------|---------------|
| forever | all | `AOM_TUNE_PSNR` = 0 (default), `AOM_TUNE_SSIM` = 1 |
| Nov 2024 | v3.12.0 | `AOM_TUNE_SSIMULACRA2` added (enum 10) — image quality mode guided by SSIMULACRA 2 + subjective checks |
| Jan 2025 | v3.12.0 | **Renamed** to `AOM_TUNE_IQ` (enum 10) — "IQ" = Image Quality / Intra Quality. The old name was misleading because it didn't purely maximise SSIMULACRA 2 |
| Mar 2025 | v3.13.0 | `AOM_TUNE_SSIMULACRA2` **(re-)added** as enum 11 — a separate mode that purely optimises for max SSIMULACRA 2 scores |

There is no `--tune-iq` flag — it's `--tune=iq` (a value to the `--tune` arg).

### Can we use `tune=iq` today?

> **Updated 2026-10-24:** the local imgproxy Docker image was upgraded today.
> The running container was verified as **imgproxy 4.0.19**, with
> **libheif 1.23.6** and **libaom 3.15.2**; its health endpoint returned HTTP 200.
> The versions and call chain above describe the original April investigation.

**Yes, automatically for ordinary lossy AVIF still images — no custom imgproxy
build is needed.** [libheif 1.22.0](https://github.com/strukturag/libheif/releases/tag/v1.22.0)
(released 2026-05-19) changed the AOM encoder's default tuning from `ssim` to
`auto`, selecting `AOM_TUNE_IQ` when supported. Our upgraded libheif includes
this behaviour.

The [libheif 1.23.6 selection logic](https://github.com/strukturag/libheif/blob/v1.23.6/libheif/plugins/encoder_aom.cc#L1091)
uses IQ for supported lossy still-image colour encoding, with exceptions:

- Lossless images and RGB/GBR identity-matrix encoding retain SSIM.
- Still-image alpha planes use PSNR.
- Video content retains SSIM.

**Explicit tune control is still unavailable through stock imgproxy's public
AVIF wrapper.** [imgproxy 4.0.19](https://github.com/imgproxy/imgproxy/blob/v4.0.19/vips/vips.c#L1337)
still passes quality, AV1 compression and effort, but no `tune` parameter.
That no longer blocks IQ: leaving tuning unspecified lets libheif's new default
select it. The April conclusion that both a libvips upgrade and an imgproxy
wrapper change were required is therefore superseded for automatic IQ selection.

The default AVIF quality remains **63**, unchanged from imgproxy 3.31.1
([current defaults](https://github.com/imgproxy/imgproxy/blob/v4.0.19/processing/config.go#L60));
an explicit URL quality overrides it. The same quality number does not guarantee
equivalent output: IQ uses a different quality-to-quantizer mapping. No encoding
quality or performance benchmark was run as part of this update, and the selected
tune was inferred from upstream code and installed versions, not instrumented
in a live encode.





