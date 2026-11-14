/**
 * Bedrock Embedding Proxy — Vite plugin
 *
 * Exposes two endpoints in the Vite dev server:
 *   GET /bedrock/health         → { available: boolean }
 *   GET /bedrock/embed?q=<text> → { embedding: number[], dimension: number, cached: boolean }
 *
 * Uses AWS Bedrock Runtime (Cohere Embed V4) to compute text embeddings.
 * Credentials come from ~/.aws/credentials via the configured AWS profile.
 * In-memory LRU cache prevents redundant Bedrock calls within a dev session.
 *
 * Graceful absence: if Bedrock is unreachable (no --use-TEST, expired creds,
 * transient error), /health returns { available: false } and /embed returns 503.
 * No crash, no error spam.
 *
 * SAFETY: credentials never leave this process. Only InvokeModel is called —
 * no S3/ES/SQS access. Read-only. See infra-safeguards.md.
 *
 * Pattern: same structure as esProxyGuard() in vite.config.ts but factored
 * into its own file due to length.
 */

import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";
import { fromIni } from "@aws-sdk/credential-providers";

const AWS_PROFILE = process.env.AWS_PROFILE ?? "media-service";
const AWS_REGION = process.env.AWS_REGION ?? "eu-west-1";
const MODEL_ID = process.env.KUPUA_BEDROCK_MODEL_ID ?? "global.cohere.embed-v4:0";

/** Max entries in the in-memory embedding cache. */
const CACHE_MAX = 200;

/** In-memory LRU cache: normalised query text → float32 embedding (number[256]). */
const _cache = new Map();

/**
 * Bedrock availability flag.
 *   null  = not yet probed
 *   true  = available (first probe succeeded)
 *   false = unavailable (first probe failed, or a subsequent embed call failed)
 */
let _available = null;

/**
 * Singleton Bedrock client. Created once; credentials resolved lazily via
 * fromIni on the first actual API call. Constructing the client never throws.
 */
const _client = new BedrockRuntimeClient({
  region: AWS_REGION,
  credentials: fromIni({ profile: AWS_PROFILE }),
});

/** Add an entry to the LRU cache, evicting the oldest if at capacity. */
function _cacheSet(key, value) {
  if (_cache.size >= CACHE_MAX) {
    // Map preserves insertion order — first key() is the oldest entry.
    _cache.delete(_cache.keys().next().value);
  }
  _cache.set(key, value);
}

/**
 * Call Bedrock InvokeModel to get a 256-float embedding for `text`.
 * Returns the raw number[] embedding. Throws on any AWS error.
 */
async function _fetchEmbedding(text) {
  const command = new InvokeModelCommand({
    modelId: MODEL_ID,
    contentType: "application/json",
    accept: "application/json",
    body: JSON.stringify({
      texts: [text],
      input_type: "search_query",
      embedding_types: ["float"],
      output_dimension: 256,
    }),
  });
  const response = await _client.send(command);
  const parsed = JSON.parse(new TextDecoder().decode(response.body));
  // Response shape: { embeddings: { float: [number[]] }, response_type: "..." }
  return parsed.embeddings.float[0]; // number[256]
}

/**
 * Get the embedding for `text`, serving from cache when available.
 * Returns { embedding: number[], cached: boolean }.
 * Throws on Bedrock error (caller should catch and return 503).
 */
async function getEmbedding(text) {
  const key = text.trim().toLowerCase();
  if (_cache.has(key)) {
    return { embedding: _cache.get(key), cached: true };
  }
  const embedding = await _fetchEmbedding(text);
  _cacheSet(key, embedding);
  return { embedding, cached: false };
}

/**
 * Probe Bedrock availability. Runs once; result cached in _available.
 * Subsequent calls return the cached flag immediately.
 *
 * Called eagerly at Vite server startup (fire-and-forget) and lazily on
 * the first /bedrock/health request.
 */
async function probeHealth() {
  if (_available !== null) return _available;
  try {
    await _fetchEmbedding("health check");
    _available = true;
    console.info("[bedrock-embed-proxy] Bedrock available — AI search enabled");
  } catch (e) {
    _available = false;
    console.info(
      "[bedrock-embed-proxy] Bedrock unavailable — AI search disabled:",
      e?.message ?? String(e),
    );
  }
  return _available;
}

/**
 * Vite plugin factory.
 * Registers /bedrock/health and /bedrock/embed middleware in the dev server.
 * Safe to include always — does nothing when Bedrock is unavailable.
 *
 * @returns {import('vite').Plugin}
 */
export function bedrockEmbedProxy() {
  return {
    name: "bedrock-embed-proxy",
    configureServer(server) {
      // Eager health probe at server startup so the flag is ready before
      // the first browser request. Fire-and-forget — errors are logged
      // inside probeHealth().
      probeHealth().catch(() => {});

      server.middlewares.use("/bedrock", async (req, res, next) => {
        // When mounted at "/bedrock", req.url is the path AFTER the prefix:
        //   GET /bedrock/health → req.url = "/health"
        //   GET /bedrock/embed?q=... → req.url = "/embed?q=..."
        const url = new URL(req.url ?? "/", "http://localhost");
        const pathname = url.pathname;

        res.setHeader("Content-Type", "application/json");

        // ------------------------------------------------------------------
        // GET /bedrock/health
        // ------------------------------------------------------------------
        if (pathname === "/health") {
          const available = await probeHealth().catch(() => false);
          res.writeHead(200);
          res.end(JSON.stringify({ available }));
          return;
        }

        // ------------------------------------------------------------------
        // GET /bedrock/embed?q=<text>
        // ------------------------------------------------------------------
        if (pathname === "/embed") {
          const q = url.searchParams.get("q") ?? "";

          if (!q.trim()) {
            res.writeHead(400);
            res.end(JSON.stringify({ error: "Missing or empty q parameter" }));
            return;
          }
          if (q.length > 2048) {
            res.writeHead(400);
            res.end(JSON.stringify({ error: "Query too long (max 2048 chars)" }));
            return;
          }

          try {
            const { embedding, cached } = await getEmbedding(q);
            res.writeHead(200);
            res.end(JSON.stringify({ embedding, dimension: embedding.length, cached }));
          } catch (e) {
            console.warn("[bedrock-embed-proxy] Embed error:", e?.message ?? String(e));
            // Mark unavailable so future health checks return false
            _available = false;
            res.writeHead(503);
            res.end(JSON.stringify({ error: "Bedrock unavailable" }));
          }
          return;
        }

        next();
      });
    },
  };
}
