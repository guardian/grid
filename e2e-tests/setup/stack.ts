/**
 * Boots and tears down the full local Grid stack with Testcontainers:
 *   1. a shared network,
 *   2. Elasticsearch + LocalStack + imgops (infrastructure),
 *   3. the CloudFormation core stack + seeded buckets (provisioning),
 *   4. generated per-service config (reusing dev/script/generate-config),
 *   5. the pre-built `grid-e2e-ci` / `grid-e2e-dev` image running the Grid services.
 *
 * Used by Playwright's global setup/teardown and by `dev.ts`, which runs the same
 * stack interactively outside the test runner.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { LocalstackContainer } from '@testcontainers/localstack';
import { GenericContainer, Network, Wait } from 'testcontainers';
import type { StartedNetwork, StartedTestContainer } from 'testcontainers';
import {
  DOMAIN,
  ELASTICSEARCH_ALIAS,
  ELASTICSEARCH_IMAGE,
  ELASTICSEARCH_PORT,
  GRID_ALIAS,
  GRID_IMAGE,
  IMGOPS_ALIAS,
  IMGOPS_CONTEXT,
  IMGOPS_IMAGE,
  IMGOPS_NGINX_CONF,
  IMGOPS_PORT,
  KAHUNA_PORT,
  LOCALSTACK_ALIAS,
  LOCALSTACK_IMAGE,
  LOCALSTACK_PORT,
  MEDIA_API_PORT,
  PROXY_IMAGE,
  REGION,
  REPO_ROOT,
  SERVICE_PORTS,
  URLS_FILE,
} from './constants.ts';
import { generateServiceConfig } from './config.ts';
import { provisionCoreStack } from './provision.ts';
import { seedElasticsearch } from './seed-elasticsearch.ts';
import type { GridEnvironment } from './state.ts';

const LOCALSTACK_SERVICES = [
  "cloudformation",
  "cloudwatch",
  "dynamodb",
  "kinesis",
  "s3",
  "sns",
  "sqs",
  "iam",
].join(",");

export interface StartStackOptions {
  /**
   * Start the bundled Caddy reverse proxy instead of relying on the developer's
   * dev-nginx. Defaults to true under CI, which has no dev-nginx.
   */
  proxy?: boolean;
  /** Seed Elasticsearch with the image fixtures. Defaults to true. */
  seed?: boolean;
}

/** How much of the stack is already listening on the fixed host ports. */
type StackProbe = 'none' | 'healthy' | 'partial';

const PROBE_TIMEOUT_MS = 2_000;

/** The subset of a started stack that teardown needs; a partially-booted stack also fits. */
interface StoppableStack {
  network?: StartedNetwork;
  containers: StartedTestContainer[];
  configDir?: string;
  urlsFile?: string;
}

/**
 * Build a Caddyfile that reproduces the dev-nginx subdomain routing: each Grid service
 * domain (https://<prefix>.media.<domain>) reverse-proxies to the grid-e2e-ci container on
 * its in-container port, and the S3 vanity domains proxy to localstack (prepending the
 * real bucket to the path). `tls internal` serves a self-signed cert per site; Playwright
 * runs with `ignoreHTTPSErrors`, so the internal CA does not need to be trusted.
 *
 * Example output:
 *
 * {
 *         auto_https disable_redirects
 * }
 *
 * media.local.dev-gutools.co.uk {
 *         tls internal
 *         reverse_proxy localhost:9005
 * }
 *
 * api.media.local.dev-gutools.co.uk {
 *         tls internal
 *         reverse_proxy localhost:9001
 * }
 *
 * # ... etc for other similar services
 *
 * images.media.local.dev-gutools.co.uk {
 *         tls internal
 *         rewrite * /grid-dev-core-imagebucket-2b34bef1{uri}
 *         reverse_proxy localhost:4566
 * }
 *
 * public.media.local.dev-gutools.co.uk {
 *         tls internal
 *         rewrite * /grid-dev-core-imageoriginbucket-e8cd1fec{uri}
 *         reverse_proxy localhost:4566
 * }
 *
 * localstack.media.local.dev-gutools.co.uk {
 *         tls internal
 *         reverse_proxy localhost:4566
 * }
 */
function buildCaddyfile(coreStackProps: Record<string, string>): string {
  const appServices: Record<string, number> = {
    [`media.${DOMAIN}`]: SERVICE_PORTS.kahuna,
    [`api.media.${DOMAIN}`]: SERVICE_PORTS['media-api'],
    [`loader.media.${DOMAIN}`]: SERVICE_PORTS['image-loader'],
    [`loader-projection.media.${DOMAIN}`]: SERVICE_PORTS['image-loader'],
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
    [`public.media.${DOMAIN}`]: coreStackProps.ImageOriginBucket
  };

  const blocks: string[] = [];

  for (const [siteHost, port] of Object.entries(appServices)) {
    blocks.push(`${siteHost} {\n\ttls internal\n\treverse_proxy ${GRID_ALIAS}:${port}\n}`);
  }

  for (const [siteHost, bucket] of Object.entries(imageBuckets)) {
    blocks.push(
      `${siteHost} {\n\ttls internal\n\trewrite * /${bucket}{uri}\n\treverse_proxy ${LOCALSTACK_ALIAS}:${LOCALSTACK_PORT}\n}`,
    );
  }

  // Thumbnails / direct S3 access already include the bucket in the path.
  blocks.push(
    `localstack.media.${DOMAIN} {\n\ttls internal\n\treverse_proxy ${LOCALSTACK_ALIAS}:${LOCALSTACK_PORT}\n}`,
  );

  // On-the-fly image resizing (optimised / full-screen views) -> the imgops container.
  blocks.push(
    `media-imgops.${DOMAIN} {\n\ttls internal\n\treverse_proxy ${IMGOPS_ALIAS}:80\n}`,
  );

  return `${blocks.join('\n\n')}\n`;
}

/** Start the whole stack, tearing down anything already started if a later step fails. */
export async function startStack(options: StartStackOptions = {}): Promise<GridEnvironment> {
  const { proxy = !!process.env.CI, seed = true } = options;

  const started: StartedTestContainer[] = [];
  const startupTimeoutMs = Number(process.env.GRID_STARTUP_TIMEOUT_MS ?? 300_000);

  let network: StartedNetwork | undefined;
  let configDir: string | undefined;

  try {
    network = await new Network().start();

    // Infrastructure: Elasticsearch + LocalStack
    const elasticsearch = await new GenericContainer(ELASTICSEARCH_IMAGE)
      .withNetwork(network)
      .withNetworkAliases(ELASTICSEARCH_ALIAS)
      .withEnvironment({
        'discovery.type': 'single-node',
        'xpack.security.enabled': 'false',
        ES_JAVA_OPTS: '-Xms1024m -Xmx1024m',
      })
      .withExposedPorts({ container: ELASTICSEARCH_PORT, host: ELASTICSEARCH_PORT })
      .withWaitStrategy(
        Wait.forHttp('/_cluster/health', ELASTICSEARCH_PORT).forStatusCodeMatching((code) => code < 300),
      )
      .withStartupTimeout(180_000)
      .start();
    started.push(elasticsearch);

    const localstack = await new LocalstackContainer(LOCALSTACK_IMAGE)
      .withNetwork(network)
      .withNetworkAliases(LOCALSTACK_ALIAS)
      // Pin to the fixed host port dev-nginx expects for the S3 vanity domains
      // (images.media / public.media / localstack.media -> 4566).
      .withExposedPorts({ container: LOCALSTACK_PORT, host: LOCALSTACK_PORT })
      .withEnvironment({
        SERVICES: LOCALSTACK_SERVICES,
        DEFAULT_REGION: REGION,
        KINESIS_ERROR_PROBABILITY: '0.0',
        // Make resource URLs resolve via the network alias so the
        // app container can reach them, and keep queue URLs path-style.
        LOCALSTACK_HOST: `${LOCALSTACK_ALIAS}:${LOCALSTACK_PORT}`,
        SQS_ENDPOINT_STRATEGY: 'path',
      })
      .withStartupTimeout(120_000)
      .start();
    started.push(localstack);

    // imgops: standalone nginx image resizer, built from dev/imgops. Its nginx.conf proxies to
    // the `localstack` alias on 4566, so it shares this network.
    const imgopsImage = await GenericContainer.fromDockerfile(IMGOPS_CONTEXT).build(IMGOPS_IMAGE, {
      deleteOnExit: false,
    });
    const imgops = await imgopsImage
      .withNetwork(network)
      .withNetworkAliases(IMGOPS_ALIAS)
      .withCopyFilesToContainer([{ source: IMGOPS_NGINX_CONF, target: '/etc/nginx/nginx.conf' }])
      .withExposedPorts({ container: 80, host: IMGOPS_PORT })
      .withWaitStrategy(Wait.forHttp('/_', 80).forStatusCode(200))
      .withStartupTimeout(120_000)
      .start();
    started.push(imgops);

    // Provisioning + config generation
    const coreStackProps = await provisionCoreStack(localstack.getConnectionUri());

    configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'grid-config-'));
    generateServiceConfig(configDir, coreStackProps);

    // All Grid services under test run inside this single container and talk to each
    // other over its localhost. Each is published on the fixed host port its
    // dev-nginx mapping expects (dev/nginx-mappings.yml), so the developer's
    // dev-nginx routes the https://*.media.<domain> domains straight into this
    // container.
    let gridBuilder = new GenericContainer(GRID_IMAGE)
      .withNetwork(network)
      .withNetworkAliases(GRID_ALIAS)
      .withExposedPorts(
        ...Object.values(SERVICE_PORTS).map((port) => ({ container: port, host: port })),
      )
      .withBindMounts([
        // DEV stage reads ~/.grid; /etc/grid is honoured for non-DEV stages. Mount both.
        { source: configDir, target: '/root/.grid', mode: 'ro' },
        { source: configDir, target: '/etc/grid', mode: 'ro' },
        // Outside CI the grid-e2e-dev image runs services under sbt; mount the repo
        // over /build so host edits recompile live.
        ...(process.env.CI ? [] : [{ source: REPO_ROOT, target: '/build', mode: 'rw' as const }]),
      ])
      .withEnvironment({
        AWS_ACCESS_KEY_ID: 'test',
        AWS_SECRET_ACCESS_KEY: 'test',
        AWS_REGION: REGION,
        AWS_DEFAULT_REGION: REGION,
        AWS_CBOR_DISABLE: 'true',
      })
      .withWaitStrategy(
        Wait.forAll(Object.values(SERVICE_PORTS).map(port =>
          Wait.forHttp('/management/healthcheck', port).forStatusCode(200),
        ))
      )
      .withStartupTimeout(startupTimeoutMs);

    if (process.env.GRID_DEBUG) {
      const logStream = fs.createWriteStream(path.join(os.tmpdir(), 'grid-boot.log'));
      gridBuilder = gridBuilder.withLogConsumer((stream) => {
        stream.on('data', (line) => logStream.write(line));
        stream.on('err', (line) => logStream.write(line));
      });
    }

    const grid = await gridBuilder.start();
    started.push(grid);

    // Seed Elasticsearch with image fixtures
    //
    // The app creates the `images` index + `Images_Current` alias on startup; seed once the
    // stack is healthy so searches during the tests return the fixture documents.
    if (seed) {
      const esBaseUrl = `http://${elasticsearch.getHost()}:${elasticsearch.getMappedPort(ELASTICSEARCH_PORT)}`;
      await seedElasticsearch(esBaseUrl);
    }

    // CI routing: bundled reverse proxy
    //
    // Locally, the browser reaches the https://*.media.<domain> domains via the developer's
    // dev-nginx. CI has no dev-nginx, so when running under CI (GitHub Actions sets CI=true)
    // start a Caddy proxy that replays the same subdomain routing and terminates TLS with a
    // self-signed cert, published on the standard https port the domains resolve to.
    if (proxy) {
      const caddy = await new GenericContainer(PROXY_IMAGE)
        .withNetwork(network)
        .withExposedPorts({ container: 443, host: 443 })
        .withCopyContentToContainer([
          { content: buildCaddyfile(coreStackProps), target: '/etc/caddy/Caddyfile' },
        ])
        .withWaitStrategy(Wait.forListeningPorts())
        .withStartupTimeout(60_000)
        .start();
      started.push(caddy);
    }

    const host = grid.getHost();
    const baseUrl = `http://${host}:${grid.getMappedPort(KAHUNA_PORT)}`;
    const mediaApiUrl = `http://${host}:${grid.getMappedPort(MEDIA_API_PORT)}`;

    fs.writeFileSync(URLS_FILE, JSON.stringify({ kahuna: baseUrl, mediaApi: mediaApiUrl }));

    return {
      network,
      containers: started,
      configDir,
      urlsFile: URLS_FILE,
      baseUrl,
      mediaApiUrl,
    };
  } catch (error) {
    // Leave nothing running if we failed part-way through the boot.
    await stopStack({ network, containers: started, configDir });
    throw error;
  }
}

/** Run a best-effort teardown step, warning (not throwing) so the rest still runs. */
async function warnOnException(label: string, fn: () => unknown): Promise<void> {
  try {
    await fn();
  } catch (error) {
    console.warn(`${label}: ${(error as Error).message}`);
  }
}

/** Is a service answering its healthcheck on this fixed host port? */
const isServiceHealthy = (path: string) => async (port: number): Promise<{ port: number, healthy: boolean }> => {
  try {
    const response = await fetch(`http://localhost:${port}/${path}`, {
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    return { port, healthy: response.ok };
  } catch {
    return { port, healthy: false };
  }
}

/**
 * Probe the fixed host ports for an already-running stack.
 *
 * The ports are pinned, so a live stack is always reachable at localhost:<service port>.
 * That makes the probe, rather than the presence of the URLs file, the source of truth:
 * the file outlives a `SIGKILL`ed run and would otherwise point tests at nothing.
 */
export async function probeStack(): Promise<{ state: StackProbe; healthy: number[]; ports: number[] }> {
  const healthchecks = [
    ...Object.values(SERVICE_PORTS).map(isServiceHealthy('management/healthcheck')),
    isServiceHealthy('_cluster/health')(ELASTICSEARCH_PORT),
    isServiceHealthy('_localstack/health')(LOCALSTACK_PORT),
    isServiceHealthy('')(IMGOPS_PORT)
  ];

  const results = await Promise.all(healthchecks);
  const healthy = results.filter(({ healthy }) => healthy).map(({ port }) => port);
  const ports = results.map(({ port }) => port);

  if (healthy.length === 0) return { state: 'none', healthy, ports };
  if (healthy.length === ports.length) return { state: 'healthy', healthy, ports };
  return { state: 'partial', healthy, ports };
}

/**
 * Attach to a running stack if there is a healthy one, otherwise boot a fresh one.
 *
 * The returned environment holds handles only for what this call created, so teardown
 * never stops a stack started by `npm run dev:e2e`.
 */
export async function ensureStack(options: StartStackOptions = {}): Promise<GridEnvironment> {
  // Nothing pre-exists in CI, and silently attaching there would undermine the run.
  const reuseAllowed = !process.env.CI;

  const { state, healthy, ports } = await probeStack();

  if (state === 'partial') {
    const missing = ports.filter((port) => !healthy.includes(port));
    throw new Error(
      `A partial Grid stack is running: ports ${healthy.join(', ')} are healthy but ` +
      `${missing.join(', ')} are not. Stop it (or wait for it to finish booting) and retry.`,
    );
  }

  if (state === 'healthy') {
    if (!reuseAllowed) {
      throw new Error(
        'A Grid stack is already running and reuse is disabled, as we are running in CI.' +
        'Stop it before starting a fresh one; the fixed host ports cannot be shared.',
      );
    }
    return attachToStack(options);
  }

  return startStack(options);
}

/**
 * Build an environment for a stack this process did not start. It owns no containers,
 * so `stopStack` leaves everything running.
 */
async function attachToStack(options: StartStackOptions): Promise<GridEnvironment> {
  const baseUrl = `http://localhost:${KAHUNA_PORT}`;
  const mediaApiUrl = `http://localhost:${MEDIA_API_PORT}`;

  console.log(`Reusing the Grid stack already running on ${baseUrl}`);

  // Re-seeding is opt-in: whoever started the stack already seeded it, and the fixtures
  // are only reloaded on request because tests may have since changed the data.
  if (options.seed === true || process.env.GRID_RESEED === 'true') {
    await seedElasticsearch(`http://localhost:${ELASTICSEARCH_PORT}`);
  }

  // Only claim the URLs file if it is missing, so teardown never deletes another stack's.
  let urlsFile: string | undefined;
  if (!fs.existsSync(URLS_FILE)) {
    fs.writeFileSync(URLS_FILE, JSON.stringify({ kahuna: baseUrl, mediaApi: mediaApiUrl }));
    urlsFile = URLS_FILE;
  }

  return { containers: [], urlsFile, baseUrl, mediaApiUrl };
}

/** Stop what this process started and delete what it wrote; anything else is left alone. */
export async function stopStack(environment: StoppableStack | undefined): Promise<void> {
  if (!environment) {
    return;
  }

  const { containers, network, configDir, urlsFile } = environment;

  for (const container of [...containers].reverse()) {
    await warnOnException('Failed to stop container', () => container.stop());
  }

  if (network) {
    await warnOnException('Failed to stop network', () => network.stop());
  }
  if (configDir) {
    await warnOnException('Failed to remove config dir', () =>
      fs.rmSync(configDir, { recursive: true, force: true }),
    );
  }
  if (urlsFile) {
    await warnOnException('Failed to remove urls file', () => fs.rmSync(urlsFile, { force: true }));
  }
}
