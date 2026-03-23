# S3 Thumbnail Proxy (Temporary)

> **Status:** Temporary local-dev solution for Phase 1–2.
> Will be replaced by Grid media-api signed URLs in Phase 3.

## What it does

When running kupua in `--use-TEST` mode, a lightweight Node.js proxy
server (`scripts/s3-proxy.mjs`) runs alongside Vite on port 3001. It
proxies image requests to the Grid S3 buckets using the developer's
local AWS credentials (`media-service` profile).

The browser makes requests like:
```
GET /s3/thumb/be0cbabc59a9c87072c5a17c7f125a5e8e45a92b
```

Vite forwards these to the proxy, which:
1. Converts the image ID to an S3 key (`b/e/0/c/b/a/be0cbabc...`)
2. Uses the AWS SDK with `media-service` profile credentials to fetch
   the object from S3
3. Streams the image bytes back to the browser
4. Caches responses in memory (2000 items, 10min TTL)

## Security properties

- **No credentials in the repo:** The proxy reads from `~/.aws/credentials`
  at runtime via the `media-service` profile (same creds used for the
  SSH tunnel to TEST ES)
- **No credentials in the browser:** The proxy runs server-side; the
  browser only sees `localhost` URLs
- **Read-only:** Only `GetObject` is used. No write operations.
- **Localhost only:** The proxy binds to `127.0.0.1`, not `0.0.0.0`
- **Nothing committed:** All bucket names are discovered at runtime from
  ES data. The `.env` / `.env.local` files are gitignored.

## Architecture

```
Browser                  Vite (port 3000)           S3 Proxy (port 3001)        AWS S3
  │                           │                           │                       │
  │ GET /s3/thumb/abc123      │                           │                       │
  │──────────────────────────>│                           │                       │
  │                           │ Proxy /s3/* → :3001       │                       │
  │                           │──────────────────────────>│                       │
  │                           │                           │ GetObject             │
  │                           │                           │ (media-service creds) │
  │                           │                           │──────────────────────>│
  │                           │                           │<──────────────────────│
  │                           │<──────────────────────────│ image/jpeg            │
  │<──────────────────────────│                           │                       │
  │ image/jpeg                │                           │                       │
```

## How it's wired

| Component | File | Purpose |
|---|---|---|
| S3 proxy server | `scripts/s3-proxy.mjs` | Node.js HTTP server using AWS SDK |
| Vite proxy config | `vite.config.ts` | Forwards `/s3/*` to port 3001 |
| Thumbnail URL builder | `src/lib/image-urls.ts` | Returns `/s3/thumb/<id>` when enabled |
| Thumbnail column | `src/components/ImageTable.tsx` | Renders `<img>` in first column |
| Feature flag | `VITE_S3_PROXY_ENABLED` env var | Controls whether thumbnails are shown |
| Startup | `scripts/start.sh` | Discovers buckets, starts proxy |

## Environment variables

| Variable | Default | Set by | Description |
|---|---|---|---|
| `KUPUA_THUMB_BUCKET` | (none) | `start.sh` | S3 bucket for thumbnails |
| `KUPUA_IMAGE_BUCKET` | (none) | `start.sh` | S3 bucket for full images |
| `S3_PROXY_PORT` | `3001` | `start.sh` | Port for the proxy server |
| `AWS_PROFILE` | `media-service` | `s3-proxy.mjs` | AWS credentials profile |
| `AWS_REGION` | `eu-west-1` | `s3-proxy.mjs` | AWS region |
| `VITE_S3_PROXY_ENABLED` | `false` | `start.sh` | Enables thumbnail UI |

## How to use

### Automatic (recommended)

```bash
./kupua/scripts/start.sh --use-TEST
```

The start script will:
1. Establish the SSH tunnel to TEST ES
2. Discover the index alias
3. Query ES for a sample document to extract bucket names
4. Start the S3 proxy with the discovered bucket names
5. Set `VITE_S3_PROXY_ENABLED=true`
6. Start Vite

### Manual

```bash
# Terminal 1: S3 proxy
export KUPUA_THUMB_BUCKET="<thumb-bucket-name>"
export KUPUA_IMAGE_BUCKET="<image-bucket-name>"
node kupua/scripts/s3-proxy.mjs

# Terminal 2: Vite
export VITE_S3_PROXY_ENABLED=true
cd kupua && npm run dev
```

## How to replace this (Phase 3)

When kupua connects to the Grid media-api (Phase 3), the API responses
will include signed S3 URLs for each image. At that point:

1. **Delete `scripts/s3-proxy.mjs`** — no longer needed
2. **Remove the `/s3` proxy from `vite.config.ts`** — no longer needed
3. **Update `src/lib/image-urls.ts`** — change `getThumbnailUrl()` to
   read the signed URL from the API response instead of building a
   `/s3/thumb/<id>` path. The function signature stays the same, so
   `ImageTable.tsx` doesn't need to change.
4. **Remove bucket discovery from `start.sh`** — the S3 proxy steps
   (3/5 and 4/5 in TEST mode) can be deleted
5. **Remove `VITE_S3_PROXY_ENABLED`** from `vite-env.d.ts` — thumbnails
   will always be available via the API
6. **Uninstall `@aws-sdk/client-s3` and `@aws-sdk/credential-providers`**
   from devDependencies — no longer needed
7. **Update this doc** — or delete it

The key design choice that makes replacement easy:
- `getThumbnailUrl(image)` is the **single point of URL generation**
- `ImageTable.tsx` calls it and renders an `<img>` — it doesn't know
  how URLs are built
- The proxy is entirely server-side; no browser code knows about S3

## Caching

The proxy has a simple in-memory LRU-ish cache:
- Max 2000 entries
- 10-minute TTL per entry
- Stale entries evicted on each new request

Browser-side: responses include `Cache-Control: public, max-age=600`
so the browser caches thumbnails for 10 minutes.

## Troubleshooting

### "AWS credentials expired or missing"

Your `media-service` AWS credentials have expired. Refresh them:
```bash
# Depends on your org's credential tool (e.g. Janus, aws-vault, etc.)
# Then restart the proxy or start.sh
```

### Thumbnails not showing

1. Check `VITE_S3_PROXY_ENABLED` is `true` — the thumbnail column
   is only rendered when this is set
2. Check the proxy is running: `curl http://localhost:3001/health`
3. Check Vite is proxying: `curl http://localhost:3000/s3/thumb/<any-id>`
4. Check browser console for 401/403/404 errors

### Wrong bucket

The bucket names are auto-discovered from ES data. If the first document
doesn't have a thumbnail URL (unlikely), the discovery fails. You can
set the buckets manually:
```bash
export KUPUA_THUMB_BUCKET="media-service-test-thumbbucket-..."
export KUPUA_IMAGE_BUCKET="media-service-test-imagebucket-..."
```
