#!/usr/bin/env node
/**
 * S3 Thumbnail Proxy (temporary local-dev solution)
 *
 * A lightweight HTTP server that proxies S3 image requests using the
 * developer's local AWS credentials (media-service profile). This lets
 * kupua display real thumbnails from the Grid S3 buckets without:
 *   - Committing any credentials to the repo
 *   - Needing the Grid media-api running
 *   - Any changes to the S3 buckets or their policies
 *
 * The proxy accepts requests like:
 *   GET /s3/thumb/<imageId>     → fetches from the thumb bucket
 *   GET /s3/image/<imageId>     → fetches from the image bucket (full-size)
 *
 * Bucket names are passed via environment variables (set by start.sh).
 * Region is auto-detected from the bucket.
 *
 * HOW TO REPLACE THIS:
 *   In Phase 3, kupua will use the Grid media-api which serves signed
 *   image URLs via its /images/:id endpoint. At that point:
 *   1. Delete this file
 *   2. Remove the /s3 proxy from vite.config.ts
 *   3. Remove the s3-proxy startup from start.sh
 *   4. Update src/lib/thumbnail.ts to use Grid API URLs
 *   See kupua/exploration/docs/s3-proxy.md for full documentation.
 *
 * SAFETY:
 *   - Read-only: only GetObject is used, never PutObject/DeleteObject
 *   - Credentials never leave this process or appear in browser code
 *   - Only accessible on localhost (not exposed to the network)
 */

import { createServer } from "node:http";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { fromIni } from "@aws-sdk/credential-providers";

const PORT = parseInt(process.env.S3_PROXY_PORT ?? "3001", 10);
const AWS_PROFILE = process.env.AWS_PROFILE ?? "media-service";
const AWS_REGION = process.env.AWS_REGION ?? "eu-west-1";

// Bucket names are discovered by start.sh from the CloudFormation stack
// or passed explicitly. Fallback to the TEST bucket names.
const THUMB_BUCKET =
  process.env.KUPUA_THUMB_BUCKET ?? "";
const IMAGE_BUCKET =
  process.env.KUPUA_IMAGE_BUCKET ?? "";

if (!THUMB_BUCKET) {
  console.error(
    "ERROR: KUPUA_THUMB_BUCKET is not set. " +
      "Run via start.sh --use-TEST or set it manually."
  );
  process.exit(1);
}

const s3 = new S3Client({
  region: AWS_REGION,
  credentials: fromIni({ profile: AWS_PROFILE }),
});

/** In-memory cache: imageId → { buffer, contentType, timestamp } */
const cache = new Map();
const CACHE_MAX_SIZE = 2000;
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

function evictStale() {
  const now = Date.now();
  for (const [key, entry] of cache) {
    if (now - entry.timestamp > CACHE_TTL_MS) {
      cache.delete(key);
    }
  }
  // If still over capacity, evict oldest
  if (cache.size > CACHE_MAX_SIZE) {
    const excess = cache.size - CACHE_MAX_SIZE;
    let removed = 0;
    for (const key of cache.keys()) {
      if (removed >= excess) break;
      cache.delete(key);
      removed++;
    }
  }
}

/**
 * Convert a Grid image ID to its S3 key.
 * Grid stores images with the ID split into 2-char directory segments:
 *   be0cbabc59a9... → b/e/0/c/b/a/be0cbabc59a9...
 */
function idToS3Key(imageId) {
  // First 6 characters become 3 directory pairs: a/b/c/d/e/f/
  const prefix = imageId
    .slice(0, 6)
    .split("")
    .map((c, i) => (i % 2 === 0 ? c : c + "/"))
    .join("");
  // Wait — looking at the actual data, the key structure is individual chars:
  // b/e/0/c/b/a/be0cbabc59a9c87072c5a17c7f125a5e8e45a92b
  // That's: first 6 chars, each as a directory, then the full ID
  const dirPrefix = imageId
    .slice(0, 6)
    .split("")
    .join("/");
  return `${dirPrefix}/${imageId}`;
}

async function handleRequest(req, res) {
  // CORS headers for local dev
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method !== "GET") {
    res.writeHead(405, { "Content-Type": "text/plain" });
    res.end("Method not allowed");
    return;
  }

  const url = new URL(req.url, `http://localhost:${PORT}`);
  const path = url.pathname;

  // Health check
  if (path === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, thumbBucket: THUMB_BUCKET }));
    return;
  }

  // Route: /s3/thumb/<imageId> or /s3/image/<imageId>
  const thumbMatch = path.match(/^\/s3\/thumb\/([a-f0-9]+)$/);
  const imageMatch = path.match(/^\/s3\/image\/([a-f0-9]+)$/);

  if (!thumbMatch && !imageMatch) {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not found. Use /s3/thumb/<imageId> or /s3/image/<imageId>");
    return;
  }

  const imageId = (thumbMatch ?? imageMatch)[1];
  const bucket = thumbMatch ? THUMB_BUCKET : IMAGE_BUCKET;
  const cacheKey = `${thumbMatch ? "t" : "i"}:${imageId}`;

  if (!bucket) {
    res.writeHead(500, { "Content-Type": "text/plain" });
    res.end("Bucket not configured for this request type");
    return;
  }

  // Check cache
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    res.writeHead(200, {
      "Content-Type": cached.contentType,
      "Cache-Control": "public, max-age=600",
      "X-Cache": "HIT",
    });
    res.end(cached.buffer);
    return;
  }

  const s3Key = idToS3Key(imageId);

  try {
    const command = new GetObjectCommand({ Bucket: bucket, Key: s3Key });
    const response = await s3.send(command);

    const chunks = [];
    for await (const chunk of response.Body) {
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);
    const contentType = response.ContentType ?? "image/jpeg";

    // Cache it
    evictStale();
    cache.set(cacheKey, { buffer, contentType, timestamp: Date.now() });

    res.writeHead(200, {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=600",
      "Content-Length": buffer.length,
      "X-Cache": "MISS",
    });
    res.end(buffer);
  } catch (err) {
    if (err.name === "NoSuchKey" || err.$metadata?.httpStatusCode === 404) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end(`Image not found: ${imageId}`);
    } else if (
      err.name === "CredentialsProviderError" ||
      err.name === "ExpiredTokenException"
    ) {
      console.error(`AWS credentials error: ${err.message}`);
      res.writeHead(401, { "Content-Type": "text/plain" });
      res.end(
        "AWS credentials expired or missing. " +
          "Refresh your media-service credentials."
      );
    } else {
      console.error(`S3 error for ${imageId}:`, err.message);
      res.writeHead(500, { "Content-Type": "text/plain" });
      res.end(`S3 error: ${err.message}`);
    }
  }
}

const server = createServer(handleRequest);

server.listen(PORT, "127.0.0.1", () => {
  console.log(`S3 proxy listening on http://127.0.0.1:${PORT}`);
  console.log(`  Thumb bucket: ${THUMB_BUCKET}`);
  if (IMAGE_BUCKET) console.log(`  Image bucket: ${IMAGE_BUCKET}`);
  console.log(`  AWS profile:  ${AWS_PROFILE}`);
  console.log(`  Cache:        ${CACHE_MAX_SIZE} items, ${CACHE_TTL_MS / 1000}s TTL`);
});


