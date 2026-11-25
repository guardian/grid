import http, { type IncomingMessage } from 'node:http';
import https from 'node:https';
import { json } from 'node:stream/consumers';
import { setTimeout as delay } from 'node:timers/promises';
import {
  DOMAIN, ELASTICSEARCH_PORT, ELASTICSEARCH_URL, IMGOPS_PORT, KAHUNA_URL, LOCALSTACK_PORT,
  LOCALSTACK_URL, MEDIA_API_URL, OIDC_PORT, SERVICE_CONFIGS, getOidcIssuer,
} from './constants.ts';
import { describeCoreStack, provisioningClients } from './provision.ts';
import { seedCollections } from './seed-collections.ts';
import { seedElasticsearch } from './seed-elasticsearch.ts';
import { seedImageFiles } from './seed-image-files.ts';
import { startStack, type StartStackOptions } from './stack-containers.ts';
import type { StackDiagnostics } from './stack-diagnostics.ts';
import type { GridEnvironment } from './state.ts';

const endpoints: [number, string][] = [
  ...Object.values(SERVICE_CONFIGS).map(({ port }): [number, string] => [port, '/management/healthcheck']),
  [OIDC_PORT, '/.well-known/openid-configuration'],
  [ELASTICSEARCH_PORT, '/_cluster/health'],
  [LOCALSTACK_PORT, '/_localstack/health'],
  [IMGOPS_PORT, '/_'],
];

function connectionRefused(error: unknown): boolean {
  if (error instanceof AggregateError) {
    return error.errors.length > 0 && error.errors.every(connectionRefused);
  }

  if (!(error instanceof Error)) return false;

  return ('code' in error && error.code === 'ECONNREFUSED') || connectionRefused(error.cause);
}

type PortStatus = { port: number; state: 'healthy' | 'refused' | 'unavailable'; detail: string };

async function probePort([port, path]: [number, string], signal?: AbortSignal): Promise<PortStatus> {
  const timeout = AbortSignal.timeout(2_000);

  try {
    const response = await fetch(`http://localhost:${port}${path}`, {
      signal: signal ? AbortSignal.any([timeout, signal]) : timeout,
      redirect: 'manual',
    });
    await response.body?.cancel();
    return { port, state: response.ok ? 'healthy' : 'unavailable', detail: `HTTP ${response.status}` };
  } catch (error) {
    signal?.throwIfAborted();
    if (connectionRefused(error)) {
      return { port, state: 'refused', detail: 'connection refused' };
    }
    return { port, state: 'unavailable', detail: error instanceof Error ? error.message : String(error) };
  }
}

// A timeout or an HTTP error can mean a stack is still starting. Try a fresh
// start only if every checked port refuses the connection twice.
export async function probeStack(signal?: AbortSignal) {
  const probe = () => Promise.all(endpoints.map((endpoint) => probePort(endpoint, signal)));
  let ports = await probe();

  if (ports.every((result) => result.state === 'refused')) {
    await delay(150);
    signal?.throwIfAborted();
    ports = await probe();
    if (ports.every((result) => result.state === 'refused')) {
      return { state: 'none' as const, ports };
    }
  }

  if (ports.every((result) => result.state === 'healthy')) {
    return { state: 'healthy' as const, ports };
  }

  return { state: 'unavailable' as const, ports };
}

export function unavailableStackError(ports: PortStatus[]): Error {
  const details = ports.filter((result) => result.state !== 'healthy')
    .map(({ port, detail }) => `${port} (${detail})`).join(', ');

  return new Error(`Grid ports are in use or unavailable: ${details}. Wait for the stack or stop it before retrying.`);
}

// Check the URLs Playwright will use before reusing the stack or loading fixtures into it.
async function checkBorrowedRoute(url: URL, signal?: AbortSignal, issuer?: string): Promise<void> {
  try {
    const timeout = AbortSignal.timeout(2_000);
    const options = { signal: signal ? AbortSignal.any([timeout, signal]) : timeout };
    const response = await new Promise<IncomingMessage>((resolve, reject) => {
      const request = url.protocol === 'https:'
        // Verify HTTPS certificates when Node is configured with the local CA.
        // Otherwise match Playwright's local HTTPS settings.
        ? https.get(url, { ...options, rejectUnauthorized: !!process.env.NODE_EXTRA_CA_CERTS }, resolve)
        // Connect via localhost so Node can reach OIDC even if oidc.localhost
        // isn't in DNS. The Host header keeps the name the provider expects.
        : http.get(url, { ...options, hostname: 'localhost', headers: { Host: url.host } }, resolve);
      request.on('error', reject);
    });

    try {
      if (response.statusCode !== 200) throw new Error(`HTTP ${response.statusCode}`);
      if (issuer) {
        const document = await json(response) as { issuer?: string } | null;
        if (document?.issuer !== issuer) {
          throw new Error(`Discovery document did not identify the expected issuer ${issuer}`);
        }
      }
    } finally {
      response.destroy();
    }
  } catch (error) {
    signal?.throwIfAborted();
    throw new Error(`Cannot reuse Grid: ${url.href} (${error instanceof Error ? error.message : String(error)}). Check the running stack and its proxy mode.`);
  }
}

export async function ensureStack(
  diagnostics: StackDiagnostics,
  options: StartStackOptions = {},
  signal?: AbortSignal,
): Promise<GridEnvironment> {
  const probe = await probeStack(signal);
  if (probe.state === 'unavailable') throw unavailableStackError(probe.ports);
  if (probe.state === 'none') {
    return startStack(options, diagnostics, signal);
  }
  if (process.env.CI) {
    throw new Error('A healthy Grid stack is already running. CI requires a fresh stack on these fixed ports.');
  }
  const issuer = getOidcIssuer(options.proxy ?? process.env.GRID_PROXY !== 'false');
  await Promise.all([
    checkBorrowedRoute(new URL(`https://${SERVICE_CONFIGS.kahuna.primaryHostname}.${DOMAIN}/management/healthcheck`), signal),
    checkBorrowedRoute(new URL('/.well-known/openid-configuration', issuer), signal, issuer),
  ]);
  diagnostics.log(`Reusing the healthy Grid stack at ${KAHUNA_URL}`);
  if (options.seed === true || process.env.GRID_RESEED === 'true') {
    await diagnostics.step('seed:elasticsearch', () => seedElasticsearch(ELASTICSEARCH_URL, 60_000, signal));
    await diagnostics.step('seed:images', async () => {
      const { cfn, s3 } = provisioningClients(LOCALSTACK_URL);
      await seedImageFiles(s3, await describeCoreStack(cfn, signal), signal);
    });
    await diagnostics.step('seed:collections', () => seedCollections(signal));
  }
  return { baseUrl: KAHUNA_URL, mediaApiUrl: MEDIA_API_URL, stop: async () => { } };
}
