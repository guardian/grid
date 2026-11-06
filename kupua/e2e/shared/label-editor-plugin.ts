import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { Plugin } from "vite";

export const virtualEntry = "virtual:kupua-commands";
const root = resolve(import.meta.dirname, "../..");

export function labelEditorPlugin(publication = false): Plugin {
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
          response.statusCode = 403;
          response.end("Synthetic fixture: external transport disabled");
          return;
        }
        const publicationPage = publication && ["/__publication", "/search", "/"].includes(pathname ?? "");
        if (pathname !== "/__commands" && !publicationPage) return next();
        response.setHeader("Content-Type", "text/html");
        if (publicationPage) {
          response.setHeader("Content-Security-Policy", `default-src 'self'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' ws://${request.headers.host}`);
        }
        const html = pathname === "/__commands"
          ? `<html><head></head><body><script type="module" src="/@id/${virtualEntry}"></script></body></html>`
          : (await readFile(resolve(root, "index.html"), "utf8")).replace('<script type="module" src="/src/main.tsx"></script>',
            `<script type="module">import "${virtualEntry}"; await window.editorFixture.preparePublication(); await import("/src/main.tsx");</script>`);
        response.end(await server.transformIndexHtml(pathname, html));
      });
    },
  };
}