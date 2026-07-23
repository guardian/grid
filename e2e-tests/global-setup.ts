/**
 * Playwright global setup.
 *
 * Boots the full local Grid stack with Testcontainers:
 *   1. a shared network,
 *   2. Elasticsearch + LocalStack (infrastructure),
 *   3. the CloudFormation core stack + seeded buckets (provisioning),
 *   4. generated per-service config (reusing dev/script/generate-config),
 *   5. the pre-built `grid-all` image running all eight services.
 *
 * The Kahuna base URL is exposed to tests via `GRID_BASE_URL`, and the started
 * containers are stashed for `global-teardown.ts`.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { LocalstackContainer } from '@testcontainers/localstack';
import { GenericContainer, Network, Wait } from 'testcontainers';
import type { StartedTestContainer } from 'testcontainers';
import {
  DOMAIN,
  ELASTICSEARCH_ALIAS,
  ELASTICSEARCH_IMAGE,
  GRID_ALIAS,
  GRID_IMAGE,
  KAHUNA_PORT,
  LOCALSTACK_ALIAS,
  LOCALSTACK_IMAGE,
  LOCALSTACK_PORT,
  MEDIA_API_PORT,
  PROXY_IMAGE,
  REGION,
  SERVICE_PORTS,
  URLS_FILE,
} from './testcontainers/constants';
import { generateServiceConfig } from './testcontainers/config';
import { provisionCoreStack } from './testcontainers/provision';
import { seedElasticsearch } from './testcontainers/seed-elasticsearch';
import { setEnvironment } from './testcontainers/state';

const LOCALSTACK_SERVICES = 'cloudformation,cloudwatch,dynamodb,kinesis,s3,sns,sqs,iam';

/**
 * Build a Caddyfile that reproduces the dev-nginx subdomain routing: each Grid service
 * domain (https://<prefix>.media.<domain>) reverse-proxies to the grid-all container on
 * its in-container port, and the S3 vanity domains proxy to localstack (prepending the
 * real bucket to the path). `tls internal` serves a self-signed cert per site; Playwright
 * runs with `ignoreHTTPSErrors`, so the internal CA does not need to be trusted.
 */
function buildCaddyfile(coreStackProps: Record<string, string>): string {
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

  return `${blocks.join('\n\n')}\n`;
}

async function globalSetup(): Promise<void> {
  const started: StartedTestContainer[] = [];
  const startupTimeoutMs = Number(process.env.GRID_STARTUP_TIMEOUT_MS ?? 300_000);

  const network = await new Network().start();

  // --- Infrastructure: Elasticsearch + LocalStack --------------------------
  const elasticsearch = await new GenericContainer(ELASTICSEARCH_IMAGE)
    .withNetwork(network)
    .withNetworkAliases(ELASTICSEARCH_ALIAS)
    .withEnvironment({
      'discovery.type': 'single-node',
      'xpack.security.enabled': 'false',
      ES_JAVA_OPTS: '-Xms1024m -Xmx1024m',
    })
    .withExposedPorts(9200)
    .withWaitStrategy(
      Wait.forHttp('/_cluster/health', 9200).forStatusCodeMatching((code) => code < 300),
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
      // Make resource URLs (SQS queues, etc.) resolve via the network alias so the
      // app container can reach them, and keep queue URLs path-style.
      LOCALSTACK_HOST: `${LOCALSTACK_ALIAS}:${LOCALSTACK_PORT}`,
      SQS_ENDPOINT_STRATEGY: 'path',
    })
    .withStartupTimeout(120_000)
    .start();
  started.push(localstack);

  // --- Provisioning + config generation ------------------------------------
  const coreStackProps = await provisionCoreStack(localstack.getConnectionUri());

  const configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'grid-config-'));
  generateServiceConfig(configDir, coreStackProps);

  // --- Application: the pre-built grid-all image ---------------------------
  // All eight services run inside this single container and talk to each other over
  // its localhost. Each is published on the *fixed* host port its dev-nginx mapping
  // expects (dev/nginx-mappings.yml), so the developer's dev-nginx routes the
  // https://*.media.<domain> domains straight into this container. This trades the
  // previous dynamic-port isolation for compatibility with the existing nginx setup:
  // it cannot run alongside a locally-running Grid that already owns these ports.
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
    ])
    .withEnvironment({
      AWS_ACCESS_KEY_ID: 'test',
      AWS_SECRET_ACCESS_KEY: 'test',
      AWS_REGION: REGION,
      AWS_DEFAULT_REGION: REGION,
      AWS_CBOR_DISABLE: 'true',
      // Staged Play apps run in prod mode, so an application secret must be provided.
      // entrypoint.sh appends GRID_JAVA_OPTS to every service. Must be >= 256 bits.
      GRID_JAVA_OPTS:
        '-Dplay.http.secret.key=testcontainers-e2e-application-secret-0123456789',
    })
    .withWaitStrategy(Wait.forHttp('/management/healthcheck', KAHUNA_PORT).forStatusCode(200))
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

  // --- Seed Elasticsearch with image fixtures ------------------------------
  // The app creates the `images` index + `Images_Current` alias on startup; seed once the
  // stack is healthy so searches during the tests return the fixture documents.
  const esBaseUrl = `http://${elasticsearch.getHost()}:${elasticsearch.getMappedPort(9200)}`;
  await seedElasticsearch(esBaseUrl);

  // --- CI routing: bundled reverse proxy -----------------------------------
  // Locally, the browser reaches the https://*.media.<domain> domains via the developer's
  // dev-nginx. CI has no dev-nginx, so when running under CI (GitHub Actions sets CI=true)
  // start a Caddy proxy that replays the same subdomain routing and terminates TLS with a
  // self-signed cert, published on the standard https port the domains resolve to.
  if (process.env.CI) {
    const proxy = await new GenericContainer(PROXY_IMAGE)
      .withNetwork(network)
      .withExposedPorts({ container: 443, host: 443 })
      .withCopyContentToContainer([
        { content: buildCaddyfile(coreStackProps), target: '/etc/caddy/Caddyfile' },
      ])
      .withWaitStrategy(Wait.forListeningPorts())
      .withStartupTimeout(60_000)
      .start();
    started.push(proxy);
  }

  const host = grid.getHost();
  const baseUrl = `http://${host}:${grid.getMappedPort(KAHUNA_PORT)}`;
  const mediaApiUrl = `http://${host}:${grid.getMappedPort(MEDIA_API_PORT)}`;

  process.env.GRID_BASE_URL = baseUrl;
  fs.writeFileSync(URLS_FILE, JSON.stringify({ kahuna: baseUrl, mediaApi: mediaApiUrl }));

  setEnvironment({ network, containers: started, configDir, baseUrl });
}

export default globalSetup;
