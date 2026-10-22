import { createServer } from "node:http";

const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="blue"/></svg>';

export async function heldImageServer({ hold = () => true, limit = 64, releaseDelayMs }:
  { hold?: (path: string) => boolean; limit?: number; releaseDelayMs?: number } = {}) {
  const requests: { path: string; aborted: boolean; finished: boolean; release: () => void }[] = [];
  const server = createServer((request, response) => {
    const path = new URL(request.url!, "http://localhost").pathname;
    if (path === "/") {
      response.writeHead(200, { "Content-Type": "text/html" });
      response.end('<!doctype html><body><main id="images"></main></body>');
    } else if ((path.startsWith("/image/") || path.startsWith("/data/")) && requests.length < limit) {
      const isImage = path.startsWith("/image/");
      const record = { path, aborted: false, finished: false,
        release: () => { if (!response.destroyed) response.end(isImage ? svg : '{"ready":true}'); } };
      let timer: ReturnType<typeof setTimeout> | undefined;
      requests.push(record);
      response.on("finish", () => { record.finished = true; });
      response.on("close", () => {
        if (timer) clearTimeout(timer);
        if (!response.writableFinished) record.aborted = true;
      });
      response.writeHead(200, { "Content-Type": isImage ? "image/svg+xml" : "application/json", "Cache-Control": "public, max-age=3600" });
      response.flushHeaders();
      if (!hold(path)) record.release();
      else if (releaseDelayMs !== undefined) timer = setTimeout(record.release, releaseDelayMs);
    } else {
      response.writeHead(404);
      response.end();
    }
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Local image server has no TCP address");
  return { requests, origin: `http://127.0.0.1:${address.port}`,
    async close() {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    } };
}