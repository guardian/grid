/**
 * Playwright global setup.
 *
 * Boots the local Grid stack for the e2e tests:
 *   1. a shared network,
 *   2. Elasticsearch + LocalStack (infrastructure, under Testcontainers),
 *   3. the CloudFormation core stack + seeded buckets (provisioning),
 *   4. generated per-service config written to `~/.grid`,
 *   5. all eight Grid services run on the host via `sbt <svc>/run` (Play dev mode),
 *   6. a host Caddy reverse proxy for the https://*.media.<domain> browser origins.
 *
 * The Kahuna base URL is exposed to tests via `GRID_BASE_URL`, and the started
 * containers / processes are stashed for `global-teardown.ts`.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { ChildProcess } from 'child_process';
import { LocalstackContainer } from '@testcontainers/localstack';
import { GenericContainer, Network, Wait } from 'testcontainers';
import type { StartedTestContainer } from 'testcontainers';
import {
  ELASTICSEARCH_ALIAS,
  ELASTICSEARCH_IMAGE,
  ELASTICSEARCH_PORT,
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
import { seedElasticsearch } from './testcontainers/seed-elasticsearch';
import { setEnvironment } from './testcontainers/state';
import { buildKahunaFrontend, startGridApp, waitForServices } from './testcontainers/app';
import { buildCaddyfile, startCaddy } from './testcontainers/proxy';

const LOCALSTACK_SERVICES = 'cloudformation,cloudwatch,dynamodb,kinesis,s3,sns,sqs,iam';

async function globalSetup(): Promise<void> {
  const started: StartedTestContainer[] = [];
  // The services compile lazily on their first request (Play dev mode), so the initial
  // readiness wait can be slow; allow a generous, overridable timeout.
  const startupTimeoutMs = Number(process.env.GRID_STARTUP_TIMEOUT_MS ?? 600_000);

  const network = await new Network().start();

  // Infrastructure: Elasticsearch + LocalStack
  const elasticsearch = await new GenericContainer(ELASTICSEARCH_IMAGE)
    .withNetwork(network)
    .withNetworkAliases(ELASTICSEARCH_ALIAS)
    .withEnvironment({
      'discovery.type': 'single-node',
      'xpack.security.enabled': 'false',
      ES_JAVA_OPTS: '-Xms1024m -Xmx1024m',
    })
    // Pin to a fixed host port so the host-run services and the seeding step both reach
    // Elasticsearch at http://localhost:9200.
    .withExposedPorts({ container: 9200, host: ELASTICSEARCH_PORT })
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
      // Resource URLs (e.g. SQS queue URLs) must resolve on the host where the Grid
      // services now run, so advertise localhost; keep queue URLs path-style.
      LOCALSTACK_HOST: `localhost:${LOCALSTACK_PORT}`,
      SQS_ENDPOINT_STRATEGY: 'path',
    })
    .withStartupTimeout(120_000)
    .start();
  started.push(localstack);

  // Provisioning + config generation
  const coreStackProps = await provisionCoreStack(localstack.getConnectionUri());

  // Write per-service config to ~/.grid. Stage defaults to DEV, so GridConfigLoader loads
  // ~/.grid/common.conf and ~/.grid/<app>.conf for each service.
  const gridConfigDir = path.join(os.homedir(), '.grid');
  const configFiles = generateServiceConfig(gridConfigDir, coreStackProps);

  // Build Kahuna's frontend bundle, then run all eight services on the host under
  // `sbt <svc>/run` (Play dev mode). Each binds its fixed port (dev/nginx-mappings.yml).
  await buildKahunaFrontend();
  const app = startGridApp();

  // The host processes have no Testcontainers-style reaper, so if bringing the stack up
  // fails, tear down anything already started (which frees the fixed service ports for a
  // rerun) before propagating the error.
  const hostProcesses: ChildProcess[] = [app.process];
  try {
    // Play dev mode compiles each service on its first request, so waiting on the
    // healthchecks both triggers compilation and confirms readiness.
    await waitForServices(startupTimeoutMs);

    // Seed Elasticsearch with image fixtures
    //
    // The app creates the `images` index + `Images_Current` alias on startup; seed once the
    // services are healthy so searches during the tests return the fixture documents.
    await seedElasticsearch(`http://localhost:${ELASTICSEARCH_PORT}`);

    // Browser routing
    //
    // Browser steps reach the https://*.media.<domain> origins on :443. There is no
    // dev-nginx in the devcontainer, so run Caddy as a host process that replays the
    // subdomain routing and terminates TLS with a self-signed cert.
    const caddy = await startCaddy(buildCaddyfile(coreStackProps));
    hostProcesses.push(caddy.process);

    const baseUrl = `http://localhost:${KAHUNA_PORT}`;
    const mediaApiUrl = `http://localhost:${MEDIA_API_PORT}`;

    process.env.GRID_BASE_URL = baseUrl;
    fs.writeFileSync(URLS_FILE, JSON.stringify({ kahuna: baseUrl, mediaApi: mediaApiUrl }));

    setEnvironment({
      network,
      containers: started,
      appProcess: app.process,
      caddyProcess: caddy.process,
      configFiles,
      baseUrl,
    });
  } catch (error) {
    console.log(`Caught error: ${error}. Killing spawned processes.`);
    for (const child of hostProcesses) {
      if (child.pid !== undefined) {
        try {
          console.log(`Killing ${child.pid}`);
          process.kill(-child.pid, 'SIGTERM');
        } catch {
          // Process group already gone.
        }
      }
    }
    for (const container of [...started].reverse()) {
      console.log(`Stopping container ${container.getName()}`)
      await container.stop().catch(() => undefined);
    }
    console.log(`Stopping network ${network.getName()}`)
    await network.stop().catch(() => undefined);
    throw error;
  }
}

export default globalSetup;
