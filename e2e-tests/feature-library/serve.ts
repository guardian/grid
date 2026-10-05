import { createReadStream } from 'node:fs';
import { realpath, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import type { OutgoingHttpHeaders, Server } from 'node:http';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { buildLibrary } from './build.ts';

const contentTypes: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.webm': 'video/webm', '.mp4': 'video/mp4',
  '.woff2': 'font/woff2',
  '.svg': 'image/svg+xml',
};

export function createStaticServer(directory: string): Server {
  return createServer(async (request, response) => {
    if (!['GET', 'HEAD'].includes(request.method ?? '')) {
      response.writeHead(405, { Allow: 'GET, HEAD' }).end();
      return;
    }
    try {
      const root = await realpath(directory);
      const pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname);
      const file = await realpath(path.join(root, pathname === '/' ? 'index.html' : pathname));
      if (!file.startsWith(`${root}${path.sep}`)) {
        response.writeHead(403).end();
        return;
      }
      const info = await stat(file);
      if (!info.isFile()) {
        response.writeHead(404).end();
        return;
      }
      const headers: OutgoingHttpHeaders = {
        'Content-Type': contentTypes[path.extname(file)] ?? 'application/octet-stream',
        'Accept-Ranges': 'bytes', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff',
      };
      let start = 0;
      let end = info.size - 1;
      const range = request.headers.range;
      if (range) {
        const match = /^bytes=(\d*)-(\d*)$/.exec(range);
        if (match && (match[1] || match[2])) {
          start = match[1] ? Number(match[1]) : Math.max(0, info.size - Number(match[2]));
          end = match[1] && match[2] ? Math.min(Number(match[2]), end) : end;
        }
        if (!match || (!match[1] && !match[2]) || start > end || start >= info.size) {
          response.writeHead(416, { 'Content-Range': `bytes */${info.size}` }).end();
          return;
        }
        headers['Content-Range'] = `bytes ${start}-${end}/${info.size}`;
      }
      headers['Content-Length'] = Math.max(0, end - start + 1);
      response.writeHead(range ? 206 : 200, headers);
      if (request.method === 'HEAD' || info.size === 0) response.end();
      else {
        const stream = createReadStream(file, { start, end });
        stream.on('error', () => response.destroy());
        response.on('close', () => stream.destroy());
        stream.pipe(response);
      }
    } catch (error) {
      const notFound = error instanceof Error && 'code' in error && error.code === 'ENOENT';
      response.writeHead(error instanceof URIError ? 400 : notFound ? 404 : 500).end();
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { values } = parseArgs({ options: { report: { type: 'string' }, port: { type: 'string', default: '4173' } } });
  const requestedPort = Number(values.port);
  if (!Number.isInteger(requestedPort) || requestedPort < 1 || requestedPort > 65535) throw new Error('Port must be between 1 and 65535.');
  const directory = await buildLibrary(values.report ? path.resolve(values.report) : undefined);
  const server = createStaticServer(directory);
  let port = requestedPort;
  server.on('error', (error: NodeJS.ErrnoException) => {
    if (error.code === 'EADDRINUSE' && port < Math.min(requestedPort + 10, 65535)) server.listen(++port, '127.0.0.1');
    else {
      console.error(error.message);
      process.exitCode = 1;
    }
  });
  server.on('listening', () => console.log(`Open http://localhost:${port}`));
  server.listen(port, '127.0.0.1');
}