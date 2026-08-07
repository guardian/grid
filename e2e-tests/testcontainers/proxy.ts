/**
 * Browser routing for the host-run Grid stack.
 *
 * Browser steps navigate to `https://<prefix>.media.<domain>` origins (see steps/fixtures.ts),
 * which the public wildcard `*.local.dev-gutools.co.uk` resolves to 127.0.0.1. Locally a
 * developer's dev-nginx terminates TLS and routes those origins; the devcontainer has no
 * dev-nginx, so we run Caddy as a host process on :443 that replays the same subdomain
 * routing and terminates TLS with a self-signed cert (`tls internal`). Playwright runs with
 * `ignoreHTTPSErrors`, so the internal CA does not need to be trusted.
 */
import { spawn } from 'child_process';
import type { ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as net from 'net';
import * as os from 'os';
import * as path from 'path';
import { DOMAIN, LOCALSTACK_PORT, SERVICE_PORTS } from './constants';

/**
 * Build a Caddyfile reproducing the dev-nginx subdomain routing: each Grid service domain
 * reverse-proxies to the host-run service on its port, and the S3 vanity domains proxy to
 * LocalStack (prepending the real bucket to the path).
 */
export function buildCaddyfile(coreStackProps: Record<string, string>): string {
  const appServices: Record<string, number> = {
    [`media.${DOMAIN}`]: SERVICE_PORTS.kahuna,
    [`api.media.${DOMAIN}`]: SERVICE_PORTS['media-api'],
    [`cropper.media.${DOMAIN}`]: SERVICE_PORTS.cropper,
    [`thrall.media.${DOMAIN}`]: SERVICE_PORTS.thrall,
    [`media-metadata.${DOMAIN}`]: SERVICE_PORTS['metadata-editor'],
    [`media-collections.${DOMAIN}`]: SERVICE_PORTS.collections,
    [`media-leases.${DOMAIN}`]: SERVICE_PORTS.leases,
    [`media-auth.${DOMAIN}`]: SERVICE_PORTS.auth,
  };

  // S3 vanity domains that omit the bucket -> localstack, with the bucket prepended.
  const imageBuckets: Record<string, string> = {
    [`images.media.${DOMAIN}`]: coreStackProps.ImageBucket,
    [`public.media.${DOMAIN}`]: coreStackProps.ImageOriginBucket,
  };

  const blocks: string[] = [];

  for (const [siteHost, port] of Object.entries(appServices)) {
    blocks.push(`${siteHost} {\n\ttls internal\n\treverse_proxy localhost:${port}\n}`);
  }

  for (const [siteHost, bucket] of Object.entries(imageBuckets)) {
    blocks.push(
      `${siteHost} {\n\ttls internal\n\trewrite * /${bucket}{uri}\n\treverse_proxy localhost:${LOCALSTACK_PORT}\n}`,
    );
  }

  // Thumbnails / direct S3 access already include the bucket in the path.
  blocks.push(
    `localstack.media.${DOMAIN} {\n\ttls internal\n\treverse_proxy localhost:${LOCALSTACK_PORT}\n}`,
  );

  // Caddy runs non-root and the devcontainer only unprivileges ports >= 443, so the
  // default HTTP->HTTPS redirect listener on :80 fails to bind. Tests reach the origins
  // over HTTPS directly, so disable the redirects to keep Caddy off :80.
  const globalOptions = `{\n\tauto_https disable_redirects\n}`;

  return `${globalOptions}\n\n${blocks.join('\n\n')}\n`;
}

export interface CaddyProxy {
  process: ChildProcess;
  logFile: string;
  configFile: string;
}

/** Resolve once a TCP connection to 127.0.0.1:port succeeds, or reject after timeoutMs. */
function waitForPort(port: number, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const attempt = (): void => {
      const socket = net.connect({ host: '127.0.0.1', port }, () => {
        socket.destroy();
        resolve();
      });
      socket.on('error', () => {
        socket.destroy();
        if (Date.now() > deadline) {
          reject(new Error(`Timed out waiting for Caddy to listen on :${port}`));
        } else {
          setTimeout(attempt, 500);
        }
      });
    };
    attempt();
  });
}

/**
 * Start Caddy as a host process on :443 with the given Caddyfile contents, resolving once
 * it is listening. Started in its own process group so teardown can signal the whole tree.
 */
export async function startCaddy(caddyfile: string): Promise<CaddyProxy> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'grid-caddy-'));
  const configFile = path.join(dir, 'Caddyfile');
  const logFile = path.join(dir, 'caddy.log');
  fs.writeFileSync(configFile, caddyfile);
  const out = fs.openSync(logFile, 'w');

  const child = spawn('caddy', ['run', '--config', configFile, '--adapter', 'caddyfile'], {
    env: process.env,
    detached: true,
    stdio: ['ignore', out, out],
  });

  await waitForPort(443, 60_000);

  return { process: child, logFile, configFile };
}
