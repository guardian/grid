import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import type { Plugin } from "vite";

/**
 * Proxy-level ES path guard.
 *
 * The adapter's assertReadOnly check only runs inside ES adapter class
 * methods. This middleware adds a second layer at the proxy boundary,
 * blocking any request to /es/ that doesn't match the path allowlist —
 * including manual fetch() calls from DevTools or accidental calls from
 * non-adapter code.
 *
 * Mirrors ALLOWED_ES_PATHS from es-config.ts. Duplicated here because
 * vite.config.ts runs in Node (not Vite-transformed), so it can't import
 * from src/.
 */
const ALLOWED_ES_PATHS = ["_search", "_count", "_cat/aliases", "_pit"];

function esProxyGuard(): Plugin {
  return {
    name: "es-proxy-guard",
    configureServer(server) {
      server.middlewares.use("/es", (req, res, next) => {
        // The middleware sees paths like:
        //   /{index}/_search   (from esRequest — index-prefixed)
        //   /_search            (from esRequestRaw — no index)
        //   /_pit               (from esRequestRaw — no index)
        // Strip leading / and find the ES API path (first _-prefixed segment).
        const rawPath = (req.url ?? "").replace(/^\//, "");
        const segments = rawPath.split("/");
        const apiIdx = segments.findIndex((s) => s.startsWith("_"));
        const apiPath = apiIdx >= 0 ? segments.slice(apiIdx).join("/") : rawPath;

        const allowed = ALLOWED_ES_PATHS.some(
          (p) => apiPath === p || apiPath.startsWith(p + "?") || apiPath.startsWith(p + "/"),
        );
        if (!allowed) {
          res.writeHead(403, { "Content-Type": "text/plain" });
          res.end(
            `[es-proxy-guard] Blocked: "${apiPath}" is not in the allowed ES paths ` +
              `(${ALLOWED_ES_PATHS.join(", ")}). See infra-safeguards.md.`,
          );
          return;
        }
        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), esProxyGuard()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    // Co-located tests: *.test.ts next to the code they test
    include: ["src/**/*.test.{ts,tsx}"],
  },
  server: {
    host: true, // Bind to 0.0.0.0 — allows access from other devices on LAN
    port: 3000,
    watch: {
      ignored: ["**/exploration/**", "**/e2e/**", "**/scripts/**", "**/playwright-report/**", "**/test-results/**"],
    },
    proxy: {
      // Proxy ES requests to Elasticsearch.
      // Default: kupua's local docker ES on port 9220
      // Override: set KUPUA_ES_URL=http://localhost:9200 for TEST tunnel
      "/es": {
        target: process.env.KUPUA_ES_URL ?? "http://localhost:9220",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/es/, ""),
      },
      // Proxy S3 thumbnail/image requests to the local S3 proxy.
      // Only active when s3-proxy.mjs is running (--use-TEST mode).
      // See kupua/exploration/docs/s3-proxy.md for documentation.
      "/s3": {
        target: `http://127.0.0.1:${process.env.S3_PROXY_PORT ?? "3001"}`,
        changeOrigin: true,
      },
      // Proxy imgproxy requests for full-size image resizing/format-conversion.
      // Only active when imgproxy container is running (--use-TEST mode).
      // See kupua/exploration/docs/imgproxy-research.md for background.
      "/imgproxy": {
        target: "http://127.0.0.1:3002",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/imgproxy/, ""),
      },
    },
  },
});

