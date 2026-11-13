import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { Plugin } from "vite";

export const virtualEntry = "virtual:kupua-commands";
const root = resolve(import.meta.dirname, "../..");

export function labelEditorPlugin(publication: boolean | "readback" | "continuation" = false): Plugin {
  const continuation = publication === "continuation";
  const readback = publication === "readback" || continuation;
  const projections = new Map<string, string>();
  const held = new Set<() => void>();
  let holdNext = false;
  const counts = { searchReads: 0, pageReads: 0, mgetReads: 0, fullReads: 0, rankReads: 0, mapReads: 0, countReads: 0, profileFailures: 0,
    generated: 0, aborted: 0, fakeDispatches: 0, staleDelivered: 0, unexpected: [] as string[] };
  let logicalTotal = continuation ? 9_000_000 : 120;
  let matchingPrefix: number | null = null;
  const epoch = continuation ? Date.UTC(2026, 10, 1) : Date.UTC(2026, 0, 1);
  const ids = Array.from({ length: 120 }, (_, index) => `local-${index}`);
  const known = (id: string) => continuation ? /^local-\d+$/.test(id) && Number(id.slice(6)) < logicalTotal
    : ids.includes(id) || id === "local-offscreen";
  const tuple = (ordinal: number) => [epoch - ordinal * 1000, `local-${ordinal}`];
  const excludesLabel = (body: Record<string, unknown>) => String(body.q ?? "").includes("-label:reviewed");
  const requiresLabel = (body: Record<string, unknown>) => body.q === "label:reviewed";
  const matches = (ordinal: number, body: Record<string, unknown>) => ordinal >= 0 && ordinal < logicalTotal
    && (!requiresLabel(body) || ordinal < (matchingPrefix ?? 0) || projections.has(`local-${ordinal}`))
    && (!excludesLabel(body) || !projections.has(`local-${ordinal}`));
  const currentTotal = (body: Record<string, unknown>) => body.since ? 0 : requiresLabel(body)
    ? (matchingPrefix ?? 0) + [...projections.keys()].filter(id => Number(id.slice(6)) >= (matchingPrefix ?? 0)).length
    : logicalTotal - (excludesLabel(body) ? projections.size : 0);
  const pageOrdinals = (body: Record<string, unknown>) => {
    if (Array.isArray(body.ids)) return (body.ids as string[]).filter(known).map(id => Number(id.slice(6)))
      .filter(ordinal => matches(ordinal, body)).sort((first, second) => first - second);
    const cursor = body.sortValues as (number | string | null)[] | undefined;
    const reverse = Boolean(body.reverse);
    const ordinal = cursor ? Math.round((epoch - Number(cursor[0])) / 1000) : reverse ? logicalTotal : -1;
    let candidate = ordinal + (reverse ? String(cursor?.at(-1)).endsWith("\u0000") ? 0 : -1 : 1);
    let skip = Number(body.offset ?? 0);
    const page: number[] = [];
    while (candidate >= 0 && candidate < logicalTotal && page.length < Number(body.length ?? body.size ?? 200)) {
      if (matches(candidate, body)) {
        if (skip > 0) skip--;
        else page.push(candidate);
      }
      candidate += reverse ? -1 : 1;
    }
    return reverse ? page.reverse() : page;
  };
  const entity = (id: string, full = false) => {
    counts.generated++;
    const index = id === "local-offscreen" ? 120 : Number(id.slice(6));
    const label = projections.get(id) ?? (matchingPrefix !== null && index < matchingPrefix ? "reviewed" : undefined);
    const asset = ["test", "test-card-f", "embedded-metadata"][index % 3];
    const dimensions = index % 3 === 0 ? { width: 700, height: 576 } : { width: 767, height: 561 };
    return {
      uri: `/api/images/${id}`, actions: [], links: [
        { rel: "optimised", href: `/__publication-media/${asset}.jpg` },
        ...(!label ? [{ rel: "edits", href: `https://metadata.example.test/metadata/${id}` }] : []),
      ],
      data: {
        id, uploadTime: new Date(epoch - index * 1_000).toISOString(), uploadedBy: "synthetic-fixture",
        lastModified: label ? "2026-11-07T00:00:00Z" : "2026-11-01T00:00:00Z",
        metadata: { description: label ? `Readback ${id}` : `Original ${id}`, credit: "Fixture" },
        ...(full && { originalMetadata: { title: `Original camera ${id}` }, fileMetadata: { data: { fixture: "EXIF retained" } } }),
        cost: "free", valid: true, invalidReasons: {}, usageRights: { category: "staff-photographer" },
        userMetadata: { data: { lastModified: label ? "2026-11-07T00:00:00Z" : "2026-11-01T00:00:00Z",
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
              else if (continuation && body.action === "reset" && typeof body.total === "number" && body.total > 0 && body.total <= 9_000_000) {
                for (const release of [...held]) release();
                projections.clear();
                holdNext = false;
                logicalTotal = body.total;
                matchingPrefix = typeof body.matching === "number" && Number.isInteger(body.matching) && body.matching >= 0 && body.matching <= logicalTotal
                  ? body.matching : null;
                for (const key of Object.keys(counts) as (keyof typeof counts)[]) {
                  if (key === "unexpected") counts.unexpected.length = 0;
                  else counts[key] = 0;
                }
              } else if (continuation && body.action === "exclude-prefix" && typeof body.count === "number" && body.count <= 1000) {
                for (let index = 0; index < body.count; index++) projections.set(`local-${index}`, "reviewed");
              }
              else if (body.action === "project" && typeof body.imageId === "string" && known(body.imageId) && typeof body.label === "string") {
                projections.set(body.imageId, body.label);
                counts.fakeDispatches++;
              } else return send({ error: "invalid-fixture-control" }, 400);
            }
            return send({ ...counts, held: held.size });
          }
          if (request.method === "POST" && pathname === "/api/images/sort-profile" && body.operation === "date-stats") {
            counts.profileFailures++;
            return send({ error: "synthetic-optional-profile-unavailable" }, 503);
          }
          if (continuation && request.method === "POST" && pathname === "/api/images/rank") {
            counts.rankReads++;
            const cursor = body.sortValues as (number | string)[];
            const ordinal = Math.round((epoch - Number(cursor[0])) / 1000);
            if (requiresLabel(body)) return send({ rank: Math.min(ordinal, matchingPrefix ?? 0) + [...projections.keys()]
              .filter(id => Number(id.slice(6)) >= (matchingPrefix ?? 0) && Number(id.slice(6)) < ordinal).length });
            const removed = excludesLabel(body) ? [...projections.keys()].filter(id => Number(id.slice(6)) < ordinal).length : 0;
            return send({ rank: Math.max(0, ordinal - removed) });
          }
          if (continuation && request.method === "POST" && pathname === "/api/images/keys" && currentTotal(body) <= 65_000) {
            counts.mapReads++;
            const page = pageOrdinals(body);
            return send({ keys: page.map(ordinal => ({ id: `local-${ordinal}`, sortValues: tuple(ordinal) })),
              after: page.length === Number(body.size) ? tuple(page.at(-1)!) : null });
          }
          if (request.method === "POST" && (pathname === "/api/images/search-after" || (continuation && pathname === "/api/images/window"))) {
            counts.searchReads++;
            if (!body.ids) counts.pageReads++;
            const page = continuation ? pageOrdinals(body) : ids.map((_, index) => index);
            const payload = JSON.stringify({ data: page.map(ordinal => entity(`local-${ordinal}`)),
              total: continuation ? currentTotal(body) : 120, sortValues: page.map(tuple),
              ...(pathname.endsWith("/window") && { offset: body.offset, rawHitCount: page.length }) });
            if (holdNext && !body.ids) {
              holdNext = false;
              await new Promise<void>(resolve => {
                const release = () => { held.delete(release); response.off("close", release); resolve(); };
                held.add(release);
                response.once("close", release);
              });
              if (response.destroyed) { counts.aborted++; return; }
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
          if (request.method === "POST" && pathname === "/api/images/count") {
            counts.countReads++;
            return send({ total: continuation ? currentTotal(body) : 120 });
          }
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
        if (publication && request.method === "GET" && ["/api", "/api/", "/api/usage/quotas"].includes(pathname ?? "")) {
          response.setHeader("Content-Type", "application/json");
          response.end(JSON.stringify({ data: {}, links: [] }));
          return;
        }
        if (publication && /^\/(es|api|bedrock|grid-metadata|grid-auth)(\/|$)/.test(pathname ?? "")) {
          if (readback) counts.unexpected.push(`${request.method} ${pathname}`);
          response.statusCode = 403;
          response.end("Synthetic fixture: external transport disabled");
          return;
        }
        const publicationPage = publication && ["/__publication", "/__readback", "/__continuation", "/search", "/"].includes(pathname ?? "");
        const connectedPage = pathname === "/__connected" || (!publication && pathname === "/search");
        if (pathname !== "/__commands" && !publicationPage && !connectedPage) return next();
        response.setHeader("Content-Type", "text/html");
        if (publicationPage) {
          response.setHeader("Content-Security-Policy", `default-src 'self'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' ws://${request.headers.host}`);
        }
        const html = pathname === "/__commands"
          ? `<html><head></head><body><script type="module" src="/@id/${virtualEntry}"></script></body></html>`
          : (await readFile(resolve(root, "index.html"), "utf8")).replace('<script type="module" src="/src/main.tsx"></script>',
            `<script type="module">import "${virtualEntry}"; ${connectedPage ? 'history.replaceState(null, "", "/search");' : `await window.editorFixture.${readback ? "prepareReadback" : "preparePublication"}();`} await import("/src/main.tsx");</script>`);
        response.end(await server.transformIndexHtml(pathname, html));
      });
    },
  };
}

if (process.argv.includes("--serve-readback")) {
  Object.assign(process.env, { VITEST: "true", VITE_USE_MEDIA_API: "true", VITE_HOSTED: "false",
    VITE_MEDIA_API_BASE_URL: "/api", VITE_MEDIA_DELIVERY: "canonical",
    VITE_GRID_METADATA_ORIGIN: "https://metadata.example.test" });
  const { createServer } = await import("vite");
  const continuation = process.argv.includes("--continuation");
  const server = await createServer({ root, configFile: resolve(root, "vite.config.ts"),
    cacheDir: resolve(root, "node_modules/.cache/a3-readback-vite"), plugins: [labelEditorPlugin(continuation ? "continuation" : "readback")],
    server: { host: "127.0.0.1", port: 3067, strictPort: true } });
  await server.listen();
  console.log(`Synthetic fixture: http://127.0.0.1:3067/${continuation ? "__continuation" : "__readback"}`);
}