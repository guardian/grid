import { createServer } from "node:http";

const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="blue"/></svg>';

export async function heldImageServer({ hold = () => true, limit = 64, releaseDelayMs, imageBody = () => svg,
  imageContentType = "image/svg+xml", holdHeaders = false }:
  { hold?: (path: string) => boolean; limit?: number; releaseDelayMs?: number;
    imageBody?: (path: string) => string | Buffer; imageContentType?: string; holdHeaders?: boolean } = {}) {
  const requests: { path: string; aborted: boolean; finished: boolean; release: () => void }[] = [];
  const server = createServer((request, response) => {
    const path = new URL(request.url!, "http://localhost").pathname;
    if (path === "/") {
      response.writeHead(200, { "Content-Type": "text/html" });
      response.end('<!doctype html><body><main id="images"></main></body>');
    } else if ((path.startsWith("/image/") || path.startsWith("/data/")) && requests.length < limit) {
      const isImage = path.startsWith("/image/");
      const sendHeaders = () => {
        if (!response.headersSent) response.writeHead(200, { "Content-Type": isImage ? imageContentType : "application/json", "Cache-Control": "public, max-age=3600" });
      };
      const record = { path, aborted: false, finished: false,
        release: () => { if (!response.destroyed) { sendHeaders(); response.end(isImage ? imageBody(path) : '{"ready":true}'); } } };
      let timer: ReturnType<typeof setTimeout> | undefined;
      requests.push(record);
      response.on("finish", () => { record.finished = true; });
      response.on("close", () => {
        if (timer) clearTimeout(timer);
        if (!response.writableFinished) record.aborted = true;
      });
      if (!holdHeaders) { sendHeaders(); response.flushHeaders(); }
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