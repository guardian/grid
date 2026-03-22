# imgproxy Research — Eelpie Fork Analysis

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
generate. Can be swapped in later once we have a lightbox to optimise.

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










