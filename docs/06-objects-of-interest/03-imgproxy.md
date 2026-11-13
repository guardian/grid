# imgproxy

[imgproxy](https://imgproxy.net/) can replace imgops for resizing images for display: the full-screen and
low-res images on the image and crop pages, and the matching download links. Originals, crops and
optimised downloads are unaffected.

Grid builds imgproxy URLs in `ImgProxyUrlBuilder` (common-lib) and serves them from media-api. It supports
two modes:

- **Unsigned**: media-api returns a templated URL in the image's `optimised` link, and clients fill in
  the size themselves, as they do with imgops.
- **Signed**: imgproxy only accepts URLs carrying a valid signature, so clients can't choose their own
  parameters. Media-api signs a small set of sizes and embeds them in each image response.

Neither mode needs an extra request to media-api before an image can be loaded.

### Choosing a mode

The mode is chosen by configuration alone, but media-api and imgproxy must agree, and each organisation
configures its own imgproxy deployment to match:

| Mode | media-api | imgproxy |
|------|-----------|----------|
| Signed | `images.imgproxy.key` and `images.imgproxy.salt` set | `IMGPROXY_KEY` and `IMGPROXY_SALT` set to the same values |
| Unsigned | neither set (blank counts as unset) | neither set (or empty) |

Setting only one of the key and salt stops media-api starting. A mismatch between the two sides fails in one
of two ways:

- media-api unsigned, or signing with a different key, but imgproxy signed: every image returns 403.
- media-api signed but imgproxy unsigned: images display, but imgproxy ignores the signature, so nothing is
  protected. After deploying signed, check that changing the size in a signed URL by hand returns 403.

Locally, signing is on by default. To run unsigned, set `imgproxy.key` and `imgproxy.salt` to `''` in
`dev/script/generate-config/config.json5`, regenerate the config, and start docker compose with
`IMGPROXY_KEY=` and `IMGPROXY_SALT=` (empty) in the environment.

## Configuration

Media-api:

| Setting | Default | Description |
|---------|---------|-------------|
| `images.imgproxy.enabled` | `false` | Use imgproxy instead of imgops for display images |
| `images.imgproxy.baseUri` | `<imgops base URI>/imgproxy` | imgproxy's public URL; override for a dedicated host |
| `images.imgproxy.key`, `images.imgproxy.salt` | unset | Hex-encoded signing key and salt; set both to sign URLs. Must match imgproxy's `IMGPROXY_KEY` and `IMGPROXY_SALT` |
| `images.imgproxy.signedUrlTtl` | unset | Signed only: how long signed URLs are valid for, e.g. `"10 minutes"` (see [Expiry](#expiry)) |
| `images.imgproxy.signedSizes` | `["1920x1080", "2560x1440"]` | Signed only: the `WIDTHxHEIGHT` boxes to sign a URL for |

imgproxy:

When using the default `/imgproxy` path, route `/imgproxy/*` to imgproxy and set
`IMGPROXY_PATH_PREFIX=/imgproxy`. Existing imgops paths are unchanged. Local development
uses its dedicated imgproxy host instead.

| Setting | Value | Why |
|---------|-------|-----|
| `IMGPROXY_USE_S3` | `true` | Sources are `s3://` URLs, fetched with imgproxy's own AWS credentials, which need `s3:GetObject` on the image bucket |
| `IMGPROXY_ALLOWED_SOURCES` | `s3://<image bucket>/` | Stops imgproxy fetching anything else |
| `IMGPROXY_AUTO_ROTATE` | `false` | Grid applies orientation itself (see [Orientation](#orientation)); Grid's URLs also set `ar:false` |
| `IMGPROXY_STRIP_METADATA` | `true` | Display images don't need metadata (`IMGPROXY_KEEP_COPYRIGHT` keeps the copyright tag); Grid's URLs also set `sm:true` |
| `IMGPROXY_STRIP_COLOR_PROFILE` | `true` | Converts to sRGB and drops the embedded profile |
| `IMGPROXY_ALLOW_ORIGIN` | kahuna's origin | Kahuna loads images with `crossorigin="anonymous"` |
| `IMGPROXY_KEY`, `IMGPROXY_SALT` | as media-api | Signed only |

Locally, set `imgproxy.enabled` to `true` in `dev/script/generate-config/config.json5` and regenerate the
config. The `imgproxy` container in `docker-compose.yml` is configured as above, reading from localstack.

## URLs

```
<baseUri>/<signature>/rs:fit:<width>:<height>[/q:<quality>]/ar:false/sm:true[/rot:<degrees>][/exp:<epoch seconds>]/<source>
```

- `<signature>` is `insecure` when unsigned.
- `rs:fit` resizes the image to fit within the box, keeping its aspect ratio. imgproxy never enlarges.
- `q` is left out of signed URLs, so imgproxy uses its default quality for the output format.
- `ar:false` and `sm:true` are always present (see [Orientation](#orientation)).
- `rot` is only present when the image needs rotating.
- `<source>` is the base64url-encoded `s3://<image bucket>/<key>` URL of the optimised PNG, if the image
  has one, or otherwise the original.

Because the source is the same on every request, URLs are stable and cacheable, and carry no AWS
credentials.

## Orientation

The cropper works with images in Grid's own corrected orientation (`orientedDimensions`), which it derives
from the original's EXIF orientation tag. To match it, every imgproxy URL turns off automatic rotation
(`ar:false`) and media-api adds Grid's correction as `rot:<degrees>` (clockwise). Optimised PNGs are written
without metadata, so they need the same correction. URLs also strip metadata (`sm:true`), so browsers can't
apply the EXIF orientation a second time. Because these options travel in the URL, display doesn't depend on
each imgproxy deployment setting `IMGPROXY_AUTO_ROTATE` and `IMGPROXY_STRIP_METADATA`, though it should.

Relying on imgproxy's automatic rotation instead would make what is displayed differ from what the cropper
expects, for example for mirrored EXIF orientations (2, 4, 5 and 7), which Grid doesn't correct.

## Signing

imgproxy signatures are `base64url(HMAC-SHA256(key, salt + path))`, as described in
[imgproxy's documentation](https://docs.imgproxy.net/usage/signing_url). A signature covers the whole path,
so a signed URL can't be modified.

### Why sign?

Without signing, anyone who can reach imgproxy can:

- fetch any image in the bucket whose S3 key they know, indefinitely, bypassing Grid's checks on who may see
  an image;
- ask for any size, quality or processing option, which imgproxy will spend CPU producing;
- remove any processing option Grid adds, such as a future watermark.

Whether that matters depends on the deployment: if every user of imgproxy can already see every image in the
bucket and imgproxy has capacity to spare, unsigned URLs are simpler.

### Sizes

A signed URL can't be templated, so media-api signs one URL per size in `images.imgproxy.signedSizes` and
embeds them in single-image responses (`GET /images/<id>`, for internal API clients) as `signedOptimisedUrls`.
Search results leave them out, since kahuna re-fetches an image before displaying it:

```json
"signedOptimisedUrls": [
  { "w": 1920, "h": 1080, "url": "https://imgproxy.example.com/<signature>/rs:fit:1920:1080/..." },
  { "w": 2560, "h": 1440, "url": "..." }
]
```

They're ordered smallest first, so kahuna uses the first that covers the size it needs, or the largest. Kahuna
sizes full-screen images by CSS pixels, so 2560x1440 covers most screens. Rendering a slightly larger size
than needed costs imgproxy little, because it decodes JPEGs at a reduced scale.

Other API clients can follow the image's `optimised` (or `optimisedPng`) link,
`/images/<id>/optimised/resized{?w,h,q}`, which redirects to a signed URL for the size they ask for.

### Expiry

With `images.imgproxy.signedUrlTtl` set, signed URLs include `exp:`, after which imgproxy returns 404. The
expiry is rounded up to a whole number of TTLs, so URLs stay identical (and cacheable) within each window,
and are valid for between one and two TTLs.
