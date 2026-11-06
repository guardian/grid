import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { Plugin } from "vite";

export const virtualEntry = "virtual:kupua-commands";
const root = resolve(import.meta.dirname, "../..");

export function labelEditorPlugin(publication: boolean | "readback" = false): Plugin {
  const readback = publication === "readback";
  const projections = new Map<string, string>();
  const held = new Set<() => void>();
  let holdNext = false;
  const counts = { searchReads: 0, mgetReads: 0, fullReads: 0, fakeDispatches: 0, staleDelivered: 0, unexpected: [] as string[] };
  const ids = Array.from({ length: 120 }, (_, index) => `local-${index}`);
  const known = (id: string) => ids.includes(id) || id === "local-offscreen";
  const entity = (id: string, full = false) => {
    const index = id === "local-offscreen" ? 120 : Number(id.slice(6));
    const label = projections.get(id);
    const asset = ["test", "test-card-f", "embedded-metadata"][index % 3];
    const dimensions = index % 3 === 0 ? { width: 700, height: 576 } : { width: 767, height: 561 };
    return {
      uri: `/api/images/${id}`, actions: [], links: [
        { rel: "optimised", href: `/__publication-media/${asset}.jpg` },
        ...(!label ? [{ rel: "edits", href: `https://metadata.example.test/metadata/${id}` }] : []),
      ],
      data: {
        id, uploadTime: new Date(Date.UTC(2026, 0, 1) - index * 1_000).toISOString(), uploadedBy: "synthetic-fixture",
        metadata: { description: label ? `Readback ${id}` : `Original ${id}`, credit: "Fixture" },
        ...(full && { originalMetadata: { title: `Original camera ${id}` }, fileMetadata: { data: { fixture: "EXIF retained" } } }),
        cost: "free", valid: true, invalidReasons: {}, usageRights: { category: "staff-photographer" },
        userMetadata: { data: { lastModified: label ? "2026-11-06T00:00:00Z" : "2026-11-01T00:00:00Z",
          labels: { data: [{ data: label ?? "original label" }] }, archived: { data: false }, metadata: {}, usageRights: {}, photoshoot: {} } },
        source: { dimensions, mimeType: "image/jpeg" },
        thumbnail: { secureUrl: `/__publication-media/${asset}.jpg`, dimensions, mimeType: "image/jpeg" },
        usages: { data: [] }, leases: { data: { leases: [] } }, collections: [],
      },
    };
  };
  return {
    name: "isolated-command-fixture",
    resolveId(id) { if (id === virtualEntry) return id; },
    load(id) {
      if (id === virtualEntry) return `import * as commands from ${JSON.stringify(resolve(root, "src/lib/grid-commands.ts"))}; window.commandFixture = commands;
        import {labelEditorFixture} from ${JSON.stringify(resolve(root, "e2e/shared/label-editor-fixture.tsx"))}; window.editorFixture = labelEditorFixture;`;
    },
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const pathname = request.url?.split("?")[0];
        if (!pathname) return next();
        if (readback && (pathname === "/__readback-control" || pathname.startsWith("/api/images"))) {
          const chunks: Buffer[] = [];
          for await (const chunk of request) chunks.push(Buffer.from(chunk));
          const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) as Record<string, unknown> : {};
          const send = (data: unknown, status = 200) => {
            response.statusCode = status;
            response.setHeader("Content-Type", "application/json");
            response.end(JSON.stringify(data));
          };
          if (pathname === "/__readback-control") {
            if (request.method === "POST") {
              if (body.action === "hold") holdNext = true;
              else if (body.action === "release") { for (const release of [...held]) release(); }
              else if (body.action === "project" && typeof body.imageId === "string" && known(body.imageId) && typeof body.label === "string") {
                projections.set(body.imageId, body.label);
                counts.fakeDispatches++;
              } else return send({ error: "invalid-fixture-control" }, 400);
            }
            return send({ ...counts, held: held.size });
          }
          if (request.method === "POST" && pathname === "/api/images/search-after") {
            counts.searchReads++;
            const payload = JSON.stringify({ data: ids.map(id => entity(id)), total: 120,
              sortValues: ids.map((id, index) => [Date.UTC(2026, 0, 1) - index * 1_000, id]) });
            if (holdNext) {
              holdNext = false;
              await new Promise<void>(resolve => {
                const release = () => { held.delete(release); response.off("close", release); resolve(); };
                held.add(release);
                response.once("close", release);
              });
              if (response.destroyed) return;
              counts.staleDelivered++;
            }
            response.setHeader("Content-Type", "application/json");
            response.end(payload);
            return;
          }
          if (request.method === "POST" && pathname === "/api/images/mget" && Array.isArray(body.ids) && body.ids.length <= 200) {
            counts.mgetReads++;
            return send({ data: body.ids.filter((id): id is string => typeof id === "string" && known(id)).map(id => entity(id)) });
          }
          if (request.method === "POST" && pathname === "/api/images/count") return send({ total: 120 });
          if (request.method === "POST" && pathname === "/api/images/aggregations") return send({ fields: {}, isFilterCounts: {} });
          const singleton = pathname.match(/^\/api\/images\/(local-(?:\d+|offscreen))$/)?.[1];
          if (request.method === "GET" && singleton && known(singleton)) { counts.fullReads++; return send(entity(singleton, true)); }
          counts.unexpected.push(`${request.method} ${pathname}`);
          return send({ error: "unexpected-fixture-read" }, 403);
        }
        if (publication && request.method === "GET" && /^\/__publication-media\/(test|test-card-f|embedded-metadata)\.jpg$/.test(pathname ?? "")) {
          response.setHeader("Content-Type", "image/jpeg");
          response.end(await readFile(resolve(root, "../e2e-tests/fixtures/images", pathname!.split("/").at(-1)!)));
          return;
        }
        if (publication && request.method === "GET" && ["/api", "/api/", "/api/usage/quotas", "/fixture-collections/collections"].includes(pathname ?? "")) {
          response.setHeader("Content-Type", "application/json");
          response.end(JSON.stringify(pathname === "/fixture-collections/collections"
            ? { data: { basename: "root", children: [] } } : { data: {}, links: [] }));
          return;
        }
        if (publication && /^\/(es|api|bedrock|grid-metadata|grid-auth)(\/|$)/.test(pathname ?? "")) {
          if (readback) counts.unexpected.push(`${request.method} ${pathname}`);
          response.statusCode = 403;
          response.end("Synthetic fixture: external transport disabled");
          return;
        }
        const publicationPage = publication && ["/__publication", "/__readback", "/search", "/"].includes(pathname ?? "");
        if (pathname !== "/__commands" && !publicationPage) return next();
        response.setHeader("Content-Type", "text/html");
        if (publicationPage) {
          response.setHeader("Content-Security-Policy", `default-src 'self'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' ws://${request.headers.host}`);
        }
        const html = pathname === "/__commands"
          ? `<html><head></head><body><script type="module" src="/@id/${virtualEntry}"></script></body></html>`
          : (await readFile(resolve(root, "index.html"), "utf8")).replace('<script type="module" src="/src/main.tsx"></script>',
            `<script type="module">import "${virtualEntry}"; await window.editorFixture.${readback ? "prepareReadback" : "preparePublication"}(); await import("/src/main.tsx");</script>`);
        response.end(await server.transformIndexHtml(pathname, html));
      });
    },
  };
}

if (process.argv.includes("--serve-readback")) {
  Object.assign(process.env, { VITEST: "true", VITE_USE_MEDIA_API: "true", VITE_HOSTED: "false",
    VITE_MEDIA_API_BASE_URL: "/api", VITE_MEDIA_DELIVERY: "canonical", VITE_COLLECTIONS_URL: "/fixture-collections",
    VITE_GRID_API_WRITES_ENABLED: "false", VITE_GRID_METADATA_ORIGIN: "https://metadata.example.test" });
  const { createServer } = await import("vite");
  const server = await createServer({ root, configFile: resolve(root, "vite.config.ts"),
    cacheDir: resolve(root, "node_modules/.cache/a3-readback-vite"), plugins: [labelEditorPlugin("readback")],
    server: { host: "127.0.0.1", port: 3067, strictPort: true } });
  await server.listen();
  console.log("Synthetic A3 fixture: http://127.0.0.1:3067/__readback");
}