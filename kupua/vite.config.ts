import { defineConfig } from "vitest/config";
import { loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import type { Plugin } from "vite";
import { loadTestSiteSettings, siteSettingsPlugin } from "./scripts/test-site-settings.ts";
import { bedrockEmbedProxy } from "./scripts/bedrock-embed-proxy.mjs";
import { isGridApiReadViaPost } from "./src/dal/grid-api/read-via-post.ts";
import { gridServiceProxyRoutes, isLabelAddRequest, isLabelRemovalRequest, isLoaderRequest } from "./src/lib/grid-mutation-policy.ts";
import {
  DEPLOYED_TEST_MEDIA_API_BASE_URL,
  shouldEnableDirectBedrockProxy,
} from "./src/dal/grid-api/proxy-target.ts";

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
const ALLOWED_ES_PATHS = ["_search", "_count", "_cat/aliases", "_pit", "_mget"];

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

/**
 * Proxy-level Grid API write guard.
 *
 * Guards local proxy requests only. Hosted and deployed-origin requests
 * bypass Vite and require command-boundary admission plus server authorization.
 */
function gridApiWriteGuard(routes: ReturnType<typeof gridServiceProxyRoutes>): Plugin {
  return {
    name: "grid-api-write-guard",
    configureServer(server) {
      for (const { prefix, service } of [{ prefix: "/api", service: "api" }, ...routes]) {
        server.middlewares.use(prefix, (req, res, next) => {
          const isReadViaPost = prefix === "/api" && isGridApiReadViaPost(req.method, req.url);
          const isRead = req.method === "GET" && (prefix === "/api"
            || (service === "auth" ? req.url === "/session"
              : service === "collections" ? req.url === "/collections" : service === "metadata" && /^\/metadata\/[a-zA-Z0-9_-]+$/.test(req.url ?? "")));
          const isSelectedWrite = service === "metadata"
            && (isLabelAddRequest(req.method, req.url) || isLabelRemovalRequest(req.method, req.url));
          if (!isRead && !isReadViaPost && !isSelectedWrite && !(service === "loader" && isLoaderRequest(req.method, req.url))) {
            res.writeHead(403, { "Content-Type": "text/plain" });
            res.end(
              "[grid-api-write-guard] Request is not an admitted read or supported operation.",
            );
            return;
          }
          next();
        });
      }
    },
  };
}

function perfEnvironment(): Plugin {
  return {
    name: "perf-environment",
    configureServer(server) {
      server.middlewares.use("/__kupua/perf-environment", (_req, res) => {
        const dataMode = process.env.VITE_USE_MEDIA_API === "true" ? "media-api" : "direct-es";
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          dataMode,
          mediaDelivery: process.env.VITE_MEDIA_DELIVERY === "canonical" ? "canonical" : "proxy",
          apiTopology: dataMode === "direct-es"
            ? "none"
            : process.env.VITE_MEDIA_API_BASE_URL === DEPLOYED_TEST_MEDIA_API_BASE_URL
              ? "deployed-test"
              : "local",
        }));
      });
    },
  };
}

/**
 * `vite build --mode hosted` (npm run build:hosted) builds the page Kahuna serves:
 * assets under /assets/kupua/, written into Kahuna's public folder, with settings
 * only from hosted/.env.hosted — never the laptop's .env/.env.local.
 */
const HOSTED_MODE = "hosted";

export default defineConfig(async ({ mode, command }) => {
const hosted = mode === HOSTED_MODE;

// Load .env.local into process.env so proxy targets can read it.
// Vite does not inject .env files into process.env automatically for vite.config.ts.
// Gated: vitest re-uses this config and the side-effect leaks real env vars into tests.
if (!process.env.VITEST && !hosted) {
  Object.assign(process.env, loadEnv("development", process.cwd(), ""));
}

const siteSettingsPlugins: Plugin[] = [];
if (!hosted && !process.env.VITEST && command === "serve"
  && process.env.KUPUA_LOAD_SITE_SETTINGS === "true" && process.env.VITE_USE_MEDIA_API === "true") {
  console.log("[config] Loading TEST S3 site settings...");
  siteSettingsPlugins.push(siteSettingsPlugin(await loadTestSiteSettings()));
  console.log("[config] TEST S3 site settings loaded");
}

const directBedrockPlugins = shouldEnableDirectBedrockProxy(
  process.env.VITE_USE_MEDIA_API,
  Boolean(process.env.VITEST),
) ? [bedrockEmbedProxy()] : [];

const satelliteRoutes = process.env.VITE_USE_MEDIA_API === "true"
  ? gridServiceProxyRoutes({ metadata: process.env.VITE_GRID_METADATA_ORIGIN, auth: process.env.VITE_GRID_AUTH_ORIGIN,
    loader: process.env.VITE_GRID_LOADER_ORIGIN }) : [];

return {
  ...(hosted && {
    base: "/assets/kupua/",
    envDir: path.resolve(import.meta.dirname, "hosted"),
    define: {
      "import.meta.env.VITE_HOSTED": JSON.stringify("true"),
      "import.meta.env.VITE_USE_MEDIA_API": JSON.stringify("true"),
    },
    build: { outDir: path.resolve(import.meta.dirname, "../kahuna/public/kupua"), emptyOutDir: true },
  }),
  plugins: [...siteSettingsPlugins, react(), ...(mode === "test" && process.env.VITEST ? [] : [tailwindcss()]), esProxyGuard(), gridApiWriteGuard(satelliteRoutes), perfEnvironment(), ...directBedrockPlugins],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  test: {
    // Co-located tests: *.test.ts next to the code they test
    include: ["src/**/*.test.{ts,tsx}"],
    // Real-ES mutation oracle: opt-in only via `npm run test:special-sort-es`.
    exclude: ["integration/special-sort-es.test.ts"],
  },
  server: {
    host: true, // Bind to 0.0.0.0 — allows access from other devices on LAN
    port: 3000,
    allowedHosts: [".local.dev-gutools.co.uk"],
    watch: {
      ignored: ["**/exploration/**", "**/e2e/**", "**/scripts/**", "**/playwright-report/**", "**/test-results/**"],
    },
    proxy: {
      ...Object.fromEntries(satelliteRoutes.map(({ prefix, origin }) => [`^${prefix}/`, {
          target: origin, changeOrigin: true, followRedirects: false,
          rewrite: (requestPath: string) => requestPath.slice(prefix.length),
          headers: { Origin: "https://media.local.dev-gutools.co.uk" },
      }])),
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
      // Proxy Grid media-api requests — avoids CORS (same-origin from browser's view).
      // Deployed TEST mode uses an explicit absolute browser base and does not enter this proxy.
      "/api": {
        target: "https://api.media.local.dev-gutools.co.uk",
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/api/, ""),
        headers: {
          Origin: "https://media.local.dev-gutools.co.uk",
        },
      },
    },
  },
};
});
