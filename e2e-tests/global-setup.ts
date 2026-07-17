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
  ELASTICSEARCH_ALIAS,
  ELASTICSEARCH_IMAGE,
  GRID_IMAGE,
  KAHUNA_PORT,
  LOCALSTACK_ALIAS,
  LOCALSTACK_IMAGE,
  LOCALSTACK_PORT,
  MEDIA_API_PORT,
  REGION,
  URLS_FILE,
} from './testcontainers/constants';
import { generateServiceConfig } from './testcontainers/config';
import { provisionCoreStack } from './testcontainers/provision';
import { setEnvironment } from './testcontainers/state';

const LOCALSTACK_SERVICES = 'cloudformation,cloudwatch,dynamodb,kinesis,s3,sns,sqs,iam';

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
  // its localhost, so only the ports the tests target are exposed (dynamically, to
  // avoid clashing with any locally-running Grid).
  let gridBuilder = new GenericContainer(GRID_IMAGE)
    .withNetwork(network)
    .withExposedPorts(KAHUNA_PORT, MEDIA_API_PORT)
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

  const host = grid.getHost();
  const baseUrl = `http://${host}:${grid.getMappedPort(KAHUNA_PORT)}`;
  const mediaApiUrl = `http://${host}:${grid.getMappedPort(MEDIA_API_PORT)}`;

  process.env.GRID_BASE_URL = baseUrl;
  fs.writeFileSync(URLS_FILE, JSON.stringify({ kahuna: baseUrl, mediaApi: mediaApiUrl }));

  setEnvironment({ network, containers: started, configDir, baseUrl });
}

export default globalSetup;
