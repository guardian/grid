#!/bin/sh

node - "${1:-9099}" <<'NODE'
const http = require('node:http');
const target = 'chekov.local.dev-gutools.co.uk';
const port = Number(process.argv[2]);

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error('Port must be an integer between 1 and 65535');
  process.exit(1);
}

http.createServer((req, res) => {
  const upstream = http.request({
    hostname: target,
    port: 80,
    method: req.method,
    path: req.url,
    headers: { ...req.headers, host: target },
  }, (response) => {
    res.writeHead(response.statusCode, response.headers);
    response.pipe(res);
  });

  upstream.on('error', () => {
    if (!res.headersSent) res.writeHead(502);
    res.end('Upstream connection failed');
  });

  req.pipe(upstream);
}).listen(port, '0.0.0.0');
console.log(`Chekov proxy listening on port ${port}`);
console.log(`Access Chekov admin page via http://localhost:${port}`);
NODE