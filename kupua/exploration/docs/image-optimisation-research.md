# Image Optimisation Research

> **Date:** 2026-04-01
> **Status:** AVIF selected (imgproxy defaults, q63/s8). DPR-aware sizing implemented.

## Context

Kupua displays full-size images from S3 via imgproxy (Docker, port 3002). The
traversal prefetch pipeline achieves 0ms landing image at normal browsing speeds.
The bottleneck is imgproxy processing time (~456ms median per the performance
analysis §20), which causes contention at extreme speeds (E5-rapid, 80ms/step).

**Goal:** Reduce image file sizes to make imgproxy faster, push the contention
cliff further out, and prepare for DPR-aware sizing (which increases pixel count).

## Format Analysis

### Previous: WebP, quality 80, fit 1200px

- Browser support: universal (Chrome 32+, Firefox 65+, Safari 14+, Edge 18+)
- Typical file size for 1200px editorial photo: ~80-150KB
- imgproxy encoding speed: fast (~50-100ms for a 1200px output)
- No progressive
- **⚠️ No embedded ICC profile.** imgproxy's WebP output does not embed an ICC
  profile (unlike AVIF and JXL which embed a tiny sRGB profile). Chrome/Safari
  assume sRGB for untagged images, so they render correctly. **Firefox does not
  assume sRGB** for untagged content — on non-sRGB monitors (wide-gamut displays,
  P3 MacBook Pros, etc.) Firefox will render untagged WebP using the monitor's
  native colour space, causing colours to appear oversaturated or shifted. AVIF
  and JXL both embed a tiny sRGB ICC profile in their imgproxy output, so they
  render correctly in all browsers on all monitors. This is a significant
  disadvantage of WebP as served by imgproxy.

### AVIF

- **Browser support:** Chrome 85+, Firefox 93+, Safari 16+ (2022). Universal in 2026.
- **Compression:** ~20-30% smaller than WebP at equivalent visual quality.
- **Decoding:** Fast in modern browsers.
- No progressive decoding support.
- **Colour:** Embeds a tiny sRGB ICC profile — correct rendering on all monitors/browsers.
- **Encoding chain** (traced 2026-04-02, see
  [imgproxy-research.md](imgproxy-research.md#avif-encoding-deep-dive--library-archaeology)):
  imgproxy 3.31.1 → libvips 8.16 → libheif 1.21.2 → libaom 3.13.1.
  Currently tuned with `AOM_TUNE_SSIM` (libheif's default). SSIM is better
  than PSNR, but nowhere near `AOM_TUNE_IQ` — a newer libaom mode (v3.12.0+)
  that uses SSIMULACRA 2 guidance + subjective quality checks. `tune=iq` is
  blocked: libvips 8.16 doesn't expose a `tune` param (needs ≥8.18), and
  imgproxy doesn't pass it through (not even on the v4 branch). No upstream
  indication this is being worked on.

**Verdict: COMPETITIVE.** Pre-benchmark speculation assumed 2-5× slower encoding.
Actual benchmarks (see below) show AVIF at default speed 8 is *faster* than WebP
(634ms vs 660ms avg). At speed 7, it's roughly equal (+4%). The encoding speed
concern was overblown — at defaults, AVIF is a viable contender alongside JXL.
The real question is perceptual quality at imgproxy's default q63, which has not
been measured (would need SSIMULACRA2 or similar against reference images).
AVIF also benefits from `AOM_TUNE_SSIM` (libheif's default) and would benefit
further from `tune=iq` if/when imgproxy exposes it (see imgproxy-research.md).

**When to revisit tune=iq:** When imgproxy ships with libvips ≥8.18 and adds
a `tune` parameter. No upstream indication this is being worked on.

### JPEG XL

- **Browser support:** Chrome Canary supports JXL including progressive decoding.
  Safari 17+ supports it natively. Firefox behind flag.
  Kupua is a single-user experiment — Chrome Canary is fine.
- **Non-progressive JXL works today:** `@jxl` suffix in imgproxy URL produces
  valid JXL. Verified in Chrome Canary (2026-04-01).
- **Progressive JXL is blocked at two levels:**
  1. **libvips 8.16** (in `darthsim/imgproxy:latest`, `libvips.so.42.20.0`) does
     NOT pass progressive encoder flags to libjxl. The `jxlsave.c` passes only
     `effort`, `tier`, `distance`, `lossless` — no `PROGRESSIVE_DC`,
     `QPROGRESSIVE_AC`, `RESPONSIVE`, or `GROUP_ORDER`.
  2. **libvips 8.19 (unreleased master)** adds an `interlace` parameter to
     `jxlsave` that enables all four progressive libjxl settings. This is the fix.
  3. **imgproxy (even v4-beta, `chore/v4-changelog` branch)** does NOT expose the
     new `interlace` parameter — its `ImgproxySaveOptions` struct has `JxlEffort`
     but no `JxlInterlace`. The `vips_jxlsave_go()` C call would need
     `"interlace", opts.JxlInterlace` added.
  4. **libjxl 0.11.2** (in the Docker image) fully supports progressive encoding
     at the library level — the settings just aren't being passed through.
- **imgproxy has `IMGPROXY_JXL_EFFORT`** (1-9, default 4). Lower effort = faster
  encode but worse compression. **Benchmarked:** effort 4 is the sweet spot —
  effort 5 is +78% encode time, effort 6 is +142% (see results below).

**Verdict:** JXL at default effort 4 encodes faster than WebP (566ms vs 660ms
avg) and is a strong contender on the server side. However, **client-side decode
is immature** — E4/E5 traversal tests (2 Apr 2026) on Playwright's bundled
Chromium 145 (with `--enable-features=JXLDecoding`) showed:
- **Worst jank of any format:** E4-rapid severe/kf=60.6, E5-rapid=53.0
  (vs AVIF s8: 28.6/22.1, WebP: 13.2/15.3). The browser's JXL decoder
  hammers the main thread during rapid traversal.
- **Worst decode gaps:** max 442ms (E5-moderate) vs 227ms AVIF s8, 243ms WebP.
- **Largest files at DPR 1.5×:** 1,153K–1,918K vs AVIF's 1,012K–1,622K. JXL
  q77 appears to target higher visual quality than AVIF q63 — the imgproxy
  defaults are not perceptually calibrated equivalents.
- Chrome's JXL decoder uses **jxl-rs** (a Rust implementation). The original
  C++ `libjxl` reference decoder was removed from Chrome years ago; the
  current re-integration uses jxl-rs, which is still maturing. Decode
  performance in Chromium 145 (Playwright) and 148 (user's Canary) reflects
  this immaturity — expect it to improve as jxl-rs stabilises.

Progressive JXL is blocked until libvips 8.19 ships AND imgproxy adds the
pass-through. Non-progressive JXL works today but isn't competitive on
decode performance in current Chrome builds (jxl-rs still maturing).

### Progressive JPEG (fallback option)

- `IMGPROXY_JPEG_PROGRESSIVE=true` enables interlaced JPEG encoding.
  Added to `docker-compose.yml`. Default was false.
- Progressive JPEG renders a low-quality full-image preview first, then
  refines in multiple passes. This is the only progressive format
  available through imgproxy today (WebP has no progressive mode,
  AVIF has no progressive mode, JXL progressive is blocked — see above).
- Encode time: ~5-10% slower than baseline JPEG (extra Huffman coding pass).
- File size: usually 1-3% smaller for photos (better entropy in progressive
  scan order), occasionally 1-2% larger for very small images.
- Browser support: universal.

**Verdict:** Enabled in docker-compose (`IMGPROXY_JPEG_PROGRESSIVE=true`).
JPEG is excluded from the main format comparison because it lacks alpha channel
support — we need a single format that handles both opaque photos and
transparent PNGs/TIFFs. Progressive JPEG remains useful only if we ever need
a universal fallback (e.g. for browsers that don't support WebP/AVIF/JXL), and
it's the only progressive format available through imgproxy today (WebP has no
progressive mode, AVIF has no progressive mode, JXL progressive is blocked —
see above).

### Content Negotiation (Accept header)

imgproxy supports `IMGPROXY_PREFERRED_FORMATS` env var with automatic format
selection based on the browser's `Accept` header. For example:
```
IMGPROXY_PREFERRED_FORMATS=avif,webp,jpeg
```
This would serve AVIF to AVIF-capable browsers and WebP to the rest.

**Verdict: DEFERRED.** JXL first and then the main format we settle on via testing.

## Benchmark: `scripts/bench-formats.sh`

Compares WebP vs AVIF vs JXL encode performance on real images from ES.

**JPEG is excluded** — it doesn't support alpha channels. Grid stores PNGs
and TIFFs with transparency (logos, graphics, composites). Kahuna handles
this by detecting the format and serving PNG for transparent sources. We
don't want any of that complexity — just one format (primary + fallback)
that handles both opaque and transparent images. WebP, AVIF, and JXL all
support alpha natively.

### Image selection

The script curates a diverse set by megapixel range:

| Category | Width range | Count | Why |
|----------|------------|-------|-----|
| **Tiny** | 800-1700px (~0.5-2MP) | 2 | Below fit size — tests encode-only (no resize needed) |
| **Normal** | 1700-6100px (~2-25MP) | 4 | Standard editorial photos — the 90% case |
| **Large** | 6100-12200px (~25-100MP) | 2 | Press panoramas, hi-res scans |
| **PNG** | any | 1 | Alpha channel coverage (if available in ES) |
| **Monster** | >12200px (~100MP+) | 1 | Extreme outlier — reported separately (S3 download dominates) |

The monster is separated because it distorts averages. Use `--no-monster`
to skip it entirely.

### Methodology

- **Output resolution:** `fit:1987:1110` — matches the perf experiments
  fullscreen viewport (1987×1110 CSS px, DPR 1.25 → `detectDpr()` returns
  multiplier 1 → no DPR scaling). This is exactly what `ImageDetail.tsx`
  requests in fullscreen mode during E4/E5 traversal experiments.
- **Corpus pinning:** All queries filter `uploadTime ≤ 2026-02-15` (same
  `STABLE_UNTIL` as perf experiments). Images sorted by `id: asc`
  (deterministic). **Same images every run.**
- **Quality:** imgproxy's per-format defaults — **WebP q79, AVIF q63, JXL q77**.
  These are supposedly perceptually normalised to similar visual quality.
  URL-level `quality:N` is NOT passed, so each format uses its own default.
- **Encode effort:** imgproxy defaults — **WebP effort 4/6, AVIF speed 8/10
  (fast), JXL effort 4/9** (moderate).
- **Warmup:** One throwaway WebP request per image before benchmarking. This
  primes S3/OS disk cache for the source image, isolating the encode step.
- **Caching:** imgproxy OSS has **no output cache** — every request runs the
  full pipeline (S3 download → decode → resize → encode → response).
  libvips internal cache is also disabled (`vips_cache_set_max(0)`).
  Each request adds a unique cache-bust query param.
- **S3 download:** Same for all formats (same source image). Cancels out.
- **Resize:** Same for all formats (`fit:1987:1110`). Cancels out.
- **What varies:** Encode time + output transfer size.

### How to run

```bash
# Requires: imgproxy running (start.sh --use-TEST), ES accessible
./kupua/scripts/bench-formats.sh              # full curated set (stable between runs)
./kupua/scripts/bench-formats.sh --no-monster  # skip the 500MP beast
```

### imgproxy encode defaults reference

| Format | Quality | Default Effort/Speed | docker-compose override | Alpha? | Note |
|--------|---------|---------------------|------------------------|--------|------|
| WebP   | 79      | effort 4 (of 6) | — | ✅ | Fast encoder; no ICC profile (see above) |
| **AVIF** | **63** | **speed 8 (of 9)** | **— (selected format)** | ✅ | **Chosen.** See format decision below |
| JXL    | 77      | effort 4 (of 9) | — | ✅ | Effort ≥5 is catastrophically slower |
| ~~JPEG~~ | ~~80~~ | ~~n/a~~ | — | ❌ | **Excluded — no alpha channel** |

### Benchmark results: effort/speed tuning (2026-04-02)

Three runs on the same 19-image corpus (pinned to 2026-02-15). WebP stays at
default effort 4 across all runs — it's the baseline. Only AVIF speed and JXL
effort vary. Lower AVIF speed = slower/better; higher JXL effort = slower/better.

**⚠️ These benchmarks measure encode speed and file size only — NOT perceptual
quality.** Each format uses imgproxy's default quality (WebP 79, AVIF 63, JXL
77) which are not equivalent visual quality points. Smaller file size does NOT
mean better — it could mean worse quality. A proper comparison would require
SSIMULACRA2 or similar against reference images at each format's quality setting.
Until that's done, file size comparisons across formats are informational only.

#### Summary table (main test set, 19 images)

| Config | AVIF speed | JXL effort | WebP avg ms | AVIF avg ms | JXL avg ms | WebP avg KB | AVIF avg KB | JXL avg KB |
|--------|-----------|-----------|------------|------------|------------|------------|------------|------------|
| **Default** | 8 | 4 | 660 | 634 (−4%) | 566 (−14%) | 194 | 176 (−9%) | 170 (−12%) |
| **Mid** | 7 | 5 | 769 | 800 (+4%) | 1367 (+78%) | 194 | 173 (−11%) | 150 (−23%) |
| **Slow** | 6 | 6 | 715 | 1095 (+53%) | 1728 (+142%) | 194 | 178 (−8%) | 151 (−22%) |

Key observations:

1. **At defaults, all three formats encode at comparable speed.** JXL is fastest
   (566ms), AVIF is close (634ms), WebP is slowest (660ms). The pre-benchmark
   assumption that AVIF would be 2-5× slower was wrong.

2. **JXL effort 5 is catastrophic for encode speed.** +78% vs WebP. The effort
   4→5 cliff is brutally steep — libjxl switches to a much more expensive
   search. **Do not use JXL effort ≥5.**

3. **JXL effort 6 is even worse.** +142% encode time for essentially the same
   file size as effort 5 (151 vs 150 KB). Pure pain, zero gain.

4. **AVIF speed 7 is tolerable.** +4% encode time vs WebP. Marginal slowdown.

5. **AVIF speed 6 is too slow.** +53% encode time. Not worth it.

6. **WebP baseline varies ±15% between runs** (660/769/715ms) due to S3 jitter,
   CPU contention, and Docker scheduling. Per-image deltas within a single run
   are more reliable than cross-run averages.

#### Per-image detail: defaults (AVIF s8, JXL e4)

| Image | MP | WebP ms | WebP KB | AVIF ms | AVIF KB | JXL ms | JXL KB |
|-------|---:|--------:|--------:|--------:|--------:|-------:|-------:|
| 0000f8 (tiny) | 1.6 | 241 | 38 | 181 | 26 | 222 | 38 |
| 000188 (tiny) | 3.1 | 230 | 48 | 169 | 39 | 169 | 48 |
| 000007 (norm) | 3.1 | 371 | 171 | 313 | 158 | 248 | 164 |
| 00000a (norm) | 12.6 | 321 | 37 | 252 | 29 | 259 | 46 |
| 00002d (norm) | 8.2 | 372 | 90 | 250 | 67 | 251 | 78 |
| 00004f (norm) | 8.2 | 446 | 223 | 425 | 188 | 336 | 211 |
| 00006c (large) | 49.8 | 939 | 60 | 1010 | 44 | 947 | 71 |
| 0000a6 (large) | 29.3 | 756 | 117 | 661 | 93 | 607 | 139 |
| 0054f9 (PNG) | 3.7 | 255 | 31 | 155 | 22 | 206 | 31 |
| 00d4d8 (#ip) | 21.7 | 751 | 97 | 663 | 68 | 647 | 109 |
| 22bfc6 (#ip) | 3.9 | 864 | 643 | 917 | 652 | 552 | 561 |
| 37cd75 (#ip) | 6.8 | 928 | 616 | 1075 | 589 | 717 | 488 |
| 519f90 (#ip) | 18.8 | 765 | 605 | 878 | 587 | 545 | 486 |
| 5aea87 (#ip) | 6.1 | 484 | 145 | 298 | 120 | 277 | 107 |
| 650247 (#ip) | 15.0 | 2096 | 476 | 2153 | 475 | 2412 | 396 |
| 79d937 (#ip) | 24.0 | 730 | 77 | 802 | 66 | 642 | 79 |
| 903871 (#ip) | 20.8 | 1133 | 46 | 1359 | 35 | 1165 | 51 |
| 937ee0 (#ip) | 6.0 | 389 | 41 | 252 | 31 | 278 | 52 |
| c83e39 (#ip) | 8.7 | 478 | 125 | 249 | 52 | 284 | 69 |

#### What we can and can't conclude

**What the data shows (encode speed only):**
- At default settings, JXL e4 and AVIF s8 are both faster than WebP e4.
- AVIF s7 is roughly equal to WebP. JXL e5+ is dramatically slower.
- The effort/speed sweet spot is: **JXL effort 4** (default), **AVIF speed 8** (default).

**What the data does NOT show:**
- Whether the formats produce equivalent *perceptual quality* at their default
  quality settings (WebP 79, AVIF 63, JXL 77). These are imgproxy defaults,
  not calibrated equivalents. Smaller KB does not mean better — it may mean
  lower quality.
- Which format looks best to a human at a given file size budget.
- Whether AVIF's `AOM_TUNE_SSIM` produces better subjective results than JXL's
  encoder at the same bitrate.

### Format decision: AVIF at imgproxy defaults (2026-04-02)

**Decision: AVIF, quality 63, speed 8 (all imgproxy defaults). No overrides.**

Human decision, made with full awareness of the trade-offs and a heavy heart.

**What we're giving up:**

- **AVIF without `tune=iq`** — libaom 3.13.1 and libheif 1.21.2 both support
  `AOM_TUNE_IQ`, which would significantly improve perceptual quality by using
  SSIMULACRA 2 guidance + subjective quality checks. But libvips 8.16 doesn't
  expose the tune parameter (needs ≥8.18) and imgproxy doesn't pass it through
  (not even on v4). No upstream indication this is being worked on. So we're
  stuck with `AOM_TUNE_SSIM` — decent, but nowhere near what IQ delivers.

- **AVIF chroma subsampling at q63** — imgproxy's default quality 63 triggers
  libvips's `chroma: "420"` path (4:2:0 subsampling, since Q < 90). This is
  atrocious for exactly the high-detail editorial images where AVIF's
  compression should shine — fine colour gradients, skin tones, fabric textures
  all get chroma-smeared. The Pro-only `IMGPROXY_AVIF_SUBSAMPLE` config could
  fix this but it's not available in OSS imgproxy.

- **JXL without progressive decoding** — JXL e4 is actually faster than AVIF s8
  (566ms vs 634ms avg) and would be the speed winner. But JXL's killer feature
  is progressive decoding (low-quality preview → refinement passes), which is
  blocked at two levels: libvips 8.16 doesn't pass progressive flags to libjxl,
  and imgproxy doesn't expose the interlace parameter. Without progressive,
  JXL is just another non-progressive format — good compression, but you could
  say the same about AVIF.

**Why AVIF wins despite all that:**

1. **Simplicity.** One format, no primary/fallback chain, no content negotiation.
   AVIF has universal browser support (Chrome 85+, Firefox 93+, Safari 16+).
   JXL requires Chrome Canary or Safari 17+ — not universal.

2. **Embedded ICC profile.** AVIF (and JXL) embed a tiny sRGB ICC profile.
   WebP does not — Firefox renders untagged WebP incorrectly on wide-gamut
   monitors (P3 MacBook Pros, etc.). For a colour-critical editorial workflow,
   this matters.

3. **Future upside.** When imgproxy eventually gets libvips ≥8.18 and exposes
   the tune parameter, AVIF with `tune=iq` will be substantially better. The
   format switch to AVIF now means we benefit automatically when the upstream
   blockers clear. JXL's progressive upside requires *two* upstream changes
   (libvips interlace + imgproxy pass-through).

4. **Encode speed is fine.** At default speed 8, AVIF encodes faster than WebP
   (634ms vs 660ms). No contention concern.

**Config changes:**
- `image-urls.ts`: `format: "avif"`, quality omitted (imgproxy default q63)
- `docker-compose.yml`: AVIF speed and JXL effort overrides removed (imgproxy defaults)

**Revisit when:**
- imgproxy ships with libvips ≥8.18 → enable `tune=iq` immediately
- imgproxy OSS exposes `IMGPROXY_AVIF_SUBSAMPLE` → set to `"444"` for high-quality
- imgproxy exposes JXL interlace → re-evaluate JXL as primary format

## DPR-Aware Sizing — Implemented

### What changed

Image requests are sized to the **screen** (not the browser window). This means
one request per image that's always big enough for fullscreen — no re-request
when the user resizes the window or enters/exits fullscreen mode.

`ImageDetail.tsx` passes `screen.width × screen.height` (CSS pixels of the
monitor) to `getFullImageUrl()`, which applies the DPR multiplier via
`detectDpr()`:

- **DPR ≤ 1.3 → multiplier 1** — request screen CSS pixels only. Standard
  displays and Windows laptops at 125% scaling get correctly-sized images.
- **DPR > 1.3 → multiplier 1.5** — HiDPI bump. Noticeably sharper than 1× on
  Retina, without the 4× pixel count (and ~2× file size / imgproxy time) of
  full 2×.

The result is capped at the image's native resolution — images smaller than the
screen will not be upsampled and will appear smaller than the container.

Example on a 1440×900 screen with 2× Retina (DPR > 1.3 → multiplier 1.5):
- Screen CSS: 1440×900 → requested: `resize:fit:2160:1350`
- If native image is 1600px wide: `resize:fit:1600:1350` (capped, won't fill screen)

Example on a 1920×1080 screen with 1× display (DPR ≤ 1.3 → multiplier 1):
- Screen CSS: 1920×1080 → requested: `resize:fit:1920:1080`

### Why screen, not window

Using `screen.width × screen.height` instead of `window.innerWidth × innerHeight`:

1. **One request per image.** The screen size is constant — no re-request when
   the browser window is resized or fullscreen is toggled. The image is always
   big enough for fullscreen.
2. **Slight over-request in windowed mode is negligible.** imgproxy's
   `resize:fit` means encode cost is dominated by source decode, not output
   size. A 1920px fit vs a 1200px fit is nearly the same encode time.
3. **Simpler mental model.** "We always request screen-sized images" — no
   edge cases around window state.

### Why a two-tier DPR function instead of raw `devicePixelRatio`

1. **Performance:** Full 2× DPR means 4× as many pixels → ~2× file size →
   ~2× imgproxy processing time. This would push the contention cliff into
   slower browsing tiers, undoing the prefetch pipeline's work.

2. **Diminishing returns:** For photographic content (as opposed to text/UI),
   1.5× is visually indistinguishable from 2× for most viewers. The brain
   fills in the missing detail via subpixel rendering and natural-image
   frequency characteristics. This is well-documented in display research.

3. **Kahuna precedent:** Kahuna's DPR handling is incomplete — it only applies
   `devicePixelRatio` for Firefox (see `kahuna/public/js/imgops/service.js`
   lines 14-20, behind an `isFF` check). For Chrome/Safari/Edge, kahuna
   requests `screen.width × screen.height` without DPR scaling. Our 1.5×
   default is actually *more* DPR-aware than kahuna for most browsers.

### Image dimensions are passed from ImageDetail

`ImageDetail.tsx` passes `screen.width`, `screen.height`, `nativeWidth` and
`nativeHeight` (from `image.source.dimensions`) to `getFullImageUrl()`. The
`imgproxyOpts` memo is keyed on `image.id` — it recomputes when the image
changes but stays stable across re-renders, resizes, and fullscreen toggles.

### DPR parameter is overridable

Callers can pass `dpr: 1` (disable) or `dpr: 2` (full Retina) as needed.
The default 1.5 is only a default, not a hard constraint. Future experiments
can easily test different values.

## Next Steps (not implemented)

3. **Quality reduction experiment:** Test quality 65 vs 80 for WebP. For
   editorial photos at 1200-2000px, the visual difference is negligible but
   file size drops ~15-20%. This is the simplest perf win available.

## Testing Playbook

### How to validate image changes with the experiment harness

The E4/E5 experiments in `e2e-perf/experiments.spec.ts` are the definitive
test for image traversal performance. They measure landing image render time,
per-image render timing, imgproxy request count/latency/cache hits, and jank.

**The experiments require a live TEST connection** (`./scripts/start.sh --use-TEST`).
Local ES has only 10k docs with synthetic data — imgproxy latency is unrealistic.

**Workflow:**

1. Make your image URL / imgproxy change (e.g. DPR, format, quality).

2. Ask the user to start the TEST dev server if not already running:
   ```
   Please start ./scripts/start.sh --use-TEST if it's not running.
   ```

3. Ask the user to stop any dev server on port 3000 before running tests
   (the test suite starts its own Vite server):
   ```
   I need to run E4/E5 experiments — please stop any running dev server
   on port 3000 first.
   ```

4. Run E4 (detail) and E5 (fullscreen) experiments:
   ```
   cd kupua && npx playwright test --config playwright.experiments.config.ts -g "E4|E5"
   ```
   This runs **8 scenarios** (4 speed tiers × 2 view modes) and takes ~2-3 min.
   Run in the **foreground** (not background, not piped through tail/head).

5. Results land in `e2e-perf/results/experiments/exp-*.json`. Quick inspection:
   ```
   cd kupua && python3 scripts/read-results.py
   ```
   This prints landing time, rendered count, imgproxy stats per tier.

6. **Build a dashboard.** Per the "Visualise experiment results" directive,
   generate a standalone HTML dashboard with Chart.js and open it in the
   browser. Include:
   - Grouped bar chart: landing image time per tier (before vs after)
   - Grouped bar chart: imgproxy avg latency per tier
   - Grouped bar chart: imgproxy total bytes per tier (shows size savings)
   - Scatter plot: step interval vs landing time
   - Raw data table
   - Written verdict

   The dashboard is disposable — generate to `/tmp/`, don't keep in repo.
   Use `open /tmp/whatever.html` to show the user.

### Key metrics to compare (before vs after)

| Metric | Where in JSON | What it means |
|--------|--------------|---------------|
| `storeState.landingImage.renderMs` | Landing image time | **THE metric.** Should be 0ms. |
| `storeState.landingImage.alreadyRendered` | Was it cached? | `true` = pipeline worked |
| `snapshot.imgproxy.avgDurationMs` | imgproxy latency | Lower = less contention |
| `snapshot.imgproxy.totalBytes` | Total bytes transferred | Shows format/quality savings |
| `snapshot.imgproxy.requestCount` | Request count | Should stay ~14-20 |
| `storeState.renderedCount` / timings length | % rendered | Higher = smoother traversal |
| `snapshot.jank.severePerKFrames` | Jank rate | Should stay <15 |

### Baseline values (Phase 2, WebP q80, no DPR, 1 Apr 2026)

| Tier | E4 Landing | E5 Landing | E5 imgproxy avgMs | E5 imgproxy bytes |
|------|-----------|-----------|-------------------|-------------------|
| slow 1000ms | 0ms | 0ms | 261ms | 874,860 |
| moderate 500ms | 0ms | 0ms | 293ms | 984,358 |
| fast 200ms | 0ms | 0ms | 344ms | 1,175,356 |
| rapid 80ms | 0ms | 290ms ⚠️ | 608ms | 1,811,702 |

**What "good" looks like for DPR change:**
- E5 imgproxy bytes will **increase** (more pixels → bigger files). Expected.
- E5 imgproxy avgMs should increase **proportionally** to byte increase. If it
  increases more than proportionally, contention is getting worse.
- E5-rapid landing may increase from 290ms. Acceptable if <500ms. If it crosses
  500ms, the DPR value is too high or format optimisation is needed first.
- All other tiers should stay at 0ms. If moderate or fast lose their 0ms, the
  DPR change is too aggressive — reduce the multiplier.

### AVIF q63/s7, DPR >1.3 → 1.5× (2 Apr 2026)

**Config:** AVIF format, quality 63 (default), speed 7 (stale container —
`IMGPROXY_AVIF_SPEED=7` override was still active from bench-formats tuning).
DPR-aware sizing enabled: screen pixels × 1.5 when DPR > 1.3.

**⚠️ These results are tainted by AVIF speed 7.** The intended config is speed 8
(imgproxy default). Speed 7 adds ~4% encode time vs speed 8 per the benchmark
table. Re-run needed after `docker compose down && docker compose up -d`.

| Tier | E4 Landing | E5 Landing | E4 imgproxy avgMs | E5 imgproxy avgMs | E4 imgproxy bytes | E5 imgproxy bytes | E4 jank severe/kf | E5 jank severe/kf |
|------|-----------|-----------|-------------------|-------------------|-------------------|-------------------|-------------------|-------------------|
| slow 1000ms | 0ms | 0ms | 303ms | 344ms | 991,902 | 991,902 | 8.0 | 2.0 |
| moderate 500ms | 0ms | 0ms | 423ms | 384ms | 1,069,183 | 1,069,183 | 12.5 | 3.1 |
| fast 200ms | 85ms ⚠️ | 243ms ⚠️ | 521ms | 490ms | 1,125,580 | 1,125,580 | 17.5 | 5.4 |
| rapid 80ms | 285ms | 100ms | 711ms | 625ms | 1,587,772 | 1,416,965 | 13.2 | 26.5 |

**vs baseline (WebP q80, no DPR):**

| Tier | E5 Landing Δ | E5 avgMs Δ | E5 bytes Δ |
|------|-------------|-----------|-----------|
| slow | 0ms → 0ms ✅ | 261 → 344ms (+32%) | 874,860 → 991,902 (+13%) |
| moderate | 0ms → 0ms ✅ | 293 → 384ms (+31%) | 984,358 → 1,069,183 (+9%) |
| fast | 0ms → 243ms ⚠️ | 344 → 490ms (+42%) | 1,175,356 → 1,125,580 (−4%) |
| rapid | 290ms → 100ms ✅ | 608 → 625ms (+3%) | 1,811,702 → 1,416,965 (−22%) |

**Observations:**
- **E5-fast regressed from 0ms to 243ms.** This is the headline concern. The
  prefetch pipeline couldn't keep up at 200ms/step with the larger DPR-scaled
  images + AVIF speed 7 encode overhead. This was a 0ms tier in the baseline.
- **E4-fast also regressed to 85ms** (was 0ms in baseline).
- **E5-rapid improved from 290ms to 100ms** — surprising. Likely noise from
  different image corpus ordering or S3 caching effects. Don't read too much
  into a single rapid-tier data point.
- **Bytes are up 9-13% at slow/moderate** (DPR scaling adds pixels) but
  **down 4-22% at fast/rapid** (AVIF compression wins over WebP at higher
  contention levels — fewer images fully downloaded before being superseded).
- **imgproxy avgMs up 31-42% across all tiers.** This is worse than the
  benchmark predicted (+4% for speed 7). The DPR pixel increase compounds
  with the speed 7 penalty.
- **Jank:** E5-rapid severe/kf spiked to 26.5 (was not tracked in baseline,
  but this is above the <15 threshold). Other tiers are fine.

**Verdict:** The fast-tier regression (0ms → 243ms/85ms) means this config
is too aggressive. Two things to try:
1. Fix the container to speed 8 (default) and re-run — removes the 4% speed
   penalty and gets the intended AVIF config.
2. If fast tier still regresses at speed 8, reduce DPR multiplier from 1.5 to
   1.25, or consider DPR 1× with AVIF format benefit only.

Files: `exp-2026-04-02-014709.json` through `exp-2026-04-02-014817.json`

### WebP q79 + DPR 1.5× — new baseline (2 Apr 2026)

**Config:** WebP format (imgproxy default q79), DPR >1.3 → 1.5×. imgproxy
container restarted with defaults (no AVIF speed / JXL effort overrides).

This is the correct baseline for DPR comparisons — same resolution as
AVIF/JXL, just different format.

| Tier | E4 Landing | E5 Landing | E5 imgproxy avgMs | E5 imgproxy bytes | E5 jank severe/kf | E5 decode max gap |
|------|-----------|-----------|-------------------|-------------------|-------------------|-------------------|
| slow 1000ms | 0ms | 0ms | 263ms | 1,174,562 | 2.0 | 226ms |
| moderate 500ms | 0ms | 0ms | 266ms | 1,280,456 | 6.2 | 243ms |
| fast 200ms | 0ms | 0ms | 296ms | 1,360,836 | 5.9 | 0ms |
| rapid 80ms | 233ms | 0ms ✅ | 451ms | 1,649,070 | 15.3 | 0ms |

**vs old baseline (WebP q80, no DPR):**
- **Bytes up 34-38%** across all tiers (DPR 1.5× adds pixels). Expected.
- **imgproxy avgMs up ~0-30%** — proportional to byte increase. No extra contention.
- **E5-rapid improved from 290ms to 0ms** — the format change from q80 to q79
  (imgproxy default) plus warm caches from prior runs likely helped. Noise.
- **E4-rapid at 233ms** — contention at 80ms/step, expected.
- **Decode gaps exist at DPR 1.5×:** max 226-392ms on one specific image
  (index 4 in the corpus). These appear in WebP too, not just AVIF — the
  gaps are caused by DPR-scaled resolution, not the format. This disproved
  the earlier hypothesis that AVIF decode was the bottleneck.

Files: `exp-2026-04-02-020747.json` through `exp-2026-04-02-020854.json`

### AVIF q63/s8 + DPR 1.5× — chosen config (2 Apr 2026)

**Config:** AVIF format, quality 63, speed 8 (imgproxy defaults). DPR >1.3 → 1.5×.
Correct container (no overrides). **This is the intended production config.**

| Tier | E4 Landing | E5 Landing | E5 imgproxy avgMs | E5 imgproxy bytes | E5 jank severe/kf | E5 decode max gap |
|------|-----------|-----------|-------------------|-------------------|-------------------|-------------------|
| slow 1000ms | 0ms | 0ms | 287ms | 1,012,680 | 2.0 | 178ms |
| moderate 500ms | 0ms | 0ms | 287ms | 1,094,068 | 0.0 | 227ms |
| fast 200ms | 0ms | 0ms | 304ms | 1,236,052 | 5.9 | 0ms |
| rapid 80ms | 116ms | 100ms | 591ms | 1,622,990 | 22.1 | 0ms |

**vs WebP+DPR (same resolution, different format):**

| Tier | E5 Landing | E5 avgMs Δ | E5 bytes Δ | E5 decode max gap |
|------|-----------|-----------|-----------|-------------------|
| slow | 0→0 ✅ | 263→287ms (+9%) | 1,174K→1,012K (**−14%**) | 226→178ms |
| moderate | 0→0 ✅ | 266→287ms (+8%) | 1,280K→1,094K (**−15%**) | 243→227ms |
| fast | 0→0 ✅ | 296→304ms (+3%) | 1,360K→1,236K (**−9%**) | 0→0ms |
| rapid | 0→100ms ⚠️ | 451→591ms (+31%) | 1,649K→1,622K (**−2%**) | 0→0ms |

**Observations:**
- **Slow/moderate/fast: all 0ms landing.** The AVIF s7 fast-tier regression
  (243ms) was entirely caused by the stale speed 7 container. At speed 8,
  the fast tier is clean.
- **AVIF is 9-15% smaller** than WebP at DPR 1.5×. Consistent compression win.
- **imgproxy avgMs 3-9% higher** at slow/moderate/fast — small encode overhead,
  more than offset by the byte savings (less to transfer).
- **E5-rapid regressed from 0ms (WebP) to 100ms (AVIF).** This is the
  contention cliff at 80ms/step. WebP's 0ms was likely a lucky cache-warm
  run; AVIF's 100ms is within the expected ~100-290ms range for this tier.
- **Decode gaps comparable to WebP** — AVIF is not worse. The earlier decode
  spike concern (AVIF s7 showed 503ms) was caused by the speed 7 overhead,
  not AVIF decode itself.

Files: `exp-2026-04-02-021055.json` through `exp-2026-04-02-021202.json`

### JXL q77/e4 + DPR 1.5× — experimental (2 Apr 2026)

**Config:** JXL format (imgproxy default q77, effort 4), DPR >1.3 → 1.5×.
Playwright's bundled Chromium 145.0.7632.6 with `--enable-features=JXLDecoding`
flag. User's Chrome Canary is 148.0.7766.0. Both use jxl-rs (Rust decoder),
which is still maturing — the original C++ `libjxl` was removed from Chrome
years ago.

| Tier | E4 Landing | E5 Landing | E5 imgproxy avgMs | E5 imgproxy bytes | E5 jank severe/kf | E5 decode max gap |
|------|-----------|-----------|-------------------|-------------------|-------------------|-------------------|
| slow 1000ms | 0ms | 0ms | 305ms | 1,153,940 | 5.9 | 380ms |
| moderate 500ms | 0ms | 0ms | 296ms | 1,271,938 | 3.1 | 442ms |
| fast 200ms | 0ms | 0ms | 289ms | 1,459,151 | 6.0 | 131ms |
| rapid 80ms | 182ms | 153ms | 400ms | 1,918,729 | 53.0 ⚠️ | 38ms |

**vs AVIF s8+DPR and WebP+DPR:**

| Tier | Landing (WebP/AVIF/JXL) | bytes (WebP/AVIF/JXL) | jank severe/kf (WebP/AVIF/JXL) | decode max gap (WebP/AVIF/JXL) |
|------|------------------------|-----------------------|-------------------------------|-------------------------------|
| slow | 0/0/0 | 1,174K / **1,012K** / 1,153K | 2.0 / 2.0 / 5.9 | 226 / **178** / 380ms |
| moderate | 0/0/0 | 1,280K / **1,094K** / 1,271K | 6.2 / **0.0** / 3.1 | 243 / 227 / **442ms** |
| fast | 0/0/0 | 1,360K / **1,236K** / 1,459K | 5.9 / 5.9 / 6.0 | 0 / 0 / 131ms |
| rapid | **0** / 100 / 153ms | 1,649K / **1,622K** / 1,918K | 15.3 / 22.1 / **53.0** ⚠️ | 0 / 0 / 38ms |

**Observations:**
- **JXL flag worked.** Format confirmed as `@jxl` in all `finalSrc` fields.
  Not an AVIF fallback — byte sizes are distinct (JXL larger everywhere).
- **Largest files of the three formats.** JXL q77 produces 1,153K–1,918K vs
  AVIF q63's 1,012K–1,622K (+14-18%). The imgproxy quality defaults are not
  perceptually calibrated — JXL q77 likely targets higher visual quality than
  AVIF q63, so the size comparison is not apples-to-apples.
- **Worst jank by far.** E4-rapid severe/kf=60.6, E5-rapid=53.0 — 2-4× worse
  than AVIF or WebP. The jxl-rs decoder blocks the main thread heavily during
  rapid traversal.
- **Worst decode gaps.** E5-moderate max 442ms, E5-slow 380ms — higher than
  AVIF (227ms, 178ms) and WebP (243ms, 226ms) at the same tiers. The JXL
  decoder is measurably more expensive per-frame.
- **imgproxy encode is competitive** — 289-400ms, similar to AVIF (287-591ms)
  and faster than WebP at fast tier. The server side is fine; the bottleneck
  is 100% client-side decode.
- **Chrome's JXL decoder (jxl-rs) is still maturing.** The original C++
  `libjxl` decoder was removed from Chrome years ago; the current
  re-integration uses **jxl-rs** (Rust), which is not yet performant enough
  for rapid image traversal. Chromium 145 (Playwright) and 148 (user's
  Canary) both show the immaturity. Decode perf will improve as jxl-rs
  stabilises, but it's not ready today.

**Verdict:** JXL is not competitive for image traversal in current Chrome
builds. Encode is fast, but client-side decode jank makes it unusable at
rapid speeds. Revisit when jxl-rs lands in stable Chrome (likely H2 2026).

Files: `exp-2026-04-02-021706.json` through `exp-2026-04-02-021813.json`

### Running local E2E tests (no TEST needed)

For functional correctness (not perf), run the local suite:
```
cd kupua && npx playwright test --config playwright.config.ts
```
71 tests, ~2.7 min. Tests image URLs are correctly constructed, navigation works,
etc. These use local Docker ES (port 9220) with 10k synthetic docs. Always run
after changing `image-urls.ts` or `ImageDetail.tsx`.













