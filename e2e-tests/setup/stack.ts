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
  CONFIG_DIR,
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
} from './constants.ts';
import { generateServiceConfig } from './config.ts';
import { reportTo, runTasks } from './progress.ts';
import type { ListrTask } from './progress.ts';
import {
  createCoreStack,
  provisioningClients,
  provisionPermissionsBucket,
  seedBuckets,
  seedKclLeaseTable,
} from './provision.ts';
import type { StackProps } from './provision.ts';
import { seedElasticsearch } from './seed-elasticsearch.ts';
import type { GridEnvironment } from './state.ts';
import { ListrTaskFn } from 'listr2';

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

// Every service is bound to a fixed host port, so its URL is the same whether this process
// started the stack or attached to one already running.
const KAHUNA_URL = `http://localhost:${KAHUNA_PORT}`;
const MEDIA_API_URL = `http://localhost:${MEDIA_API_PORT}`;
const ELASTICSEARCH_URL = `http://localhost:${ELASTICSEARCH_PORT}`;

/** How much of the stack is already listening on the fixed host ports. */
type StackProbe = 'none' | 'healthy' | 'partial';

const PROBE_OUTCOMES: Record<StackProbe, string> = {
  none: 'No running Grid stack found',
  healthy: `Found a Grid stack already running on ${KAHUNA_URL}`,
  partial: 'Found a partially running Grid stack',
};

const PROBE_TIMEOUT_MS = 2_000;

/** Names a container by its role in the stack, since Docker otherwise assigns a random one. */
const ROLE_LABEL = 'uk.co.guardian.grid.role';

/** The subset of a started stack that teardown needs; a partially-booted stack also fits. */
interface StoppableStack {
  network?: StartedNetwork;
  containers: StartedTestContainer[];
  configDir?: string;
}

/** What the boot tasks build up. Each task mutates it in place for the ones that follow. */
interface BootContext extends StoppableStack {
  coreStackProps?: StackProps;
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

/**
 * Set while this process owns the config directory, so the exit hook below never deletes
 * the config of a stack started elsewhere and still running (see `attachToStack`).
 */
let ownedConfigDir: string | undefined;

// Catches the exits that bypass `stopStack`, such as a Ctrl-C mid-boot in dev.ts.
// Must stay synchronous: async work in an `exit` handler never runs.
process.on('exit', () => {
  if (ownedConfigDir) {
    fs.rmSync(ownedConfigDir, { recursive: true, force: true });
  }
});

function elasticsearchContainer(network: StartedNetwork): GenericContainer {
  return new GenericContainer(ELASTICSEARCH_IMAGE)
    .withNetwork(network)
    .withNetworkAliases(ELASTICSEARCH_ALIAS)
    .withLabels({ [ROLE_LABEL]: 'Elasticsearch' })
    .withEnvironment({
      'discovery.type': 'single-node',
      'xpack.security.enabled': 'false',
      ES_JAVA_OPTS: '-Xms1024m -Xmx1024m',
    })
    .withExposedPorts({ container: ELASTICSEARCH_PORT, host: ELASTICSEARCH_PORT })
    .withWaitStrategy(
      Wait.forHttp('/_cluster/health', ELASTICSEARCH_PORT).forStatusCodeMatching((code) => code < 300),
    )
    .withStartupTimeout(180_000);
}

function localstackContainer(network: StartedNetwork): LocalstackContainer {
  return new LocalstackContainer(LOCALSTACK_IMAGE)
    .withNetwork(network)
    .withNetworkAliases(LOCALSTACK_ALIAS)
    .withLabels({ [ROLE_LABEL]: 'LocalStack' })
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
    .withStartupTimeout(120_000);
}

/**
 * imgops: standalone nginx image resizer, built from dev/imgops. Its nginx.conf proxies to
 * the `localstack` alias on 4566, so it shares the stack network.
 */
function imgopsContainer(image: GenericContainer, network: StartedNetwork): GenericContainer {
  return image
    .withNetwork(network)
    .withNetworkAliases(IMGOPS_ALIAS)
    .withLabels({ [ROLE_LABEL]: 'imgops' })
    .withCopyFilesToContainer([{ source: IMGOPS_NGINX_CONF, target: '/etc/nginx/nginx.conf' }])
    .withExposedPorts({ container: 80, host: IMGOPS_PORT })
    .withWaitStrategy(Wait.forHttp('/_', 80).forStatusCode(200))
    .withStartupTimeout(120_000);
}

/**
 * All Grid services under test run inside this single container and talk to each
 * other over its localhost. Each is published on the fixed host port its
 * dev-nginx mapping expects (dev/nginx-mappings.yml), so the developer's
 * dev-nginx routes the https://*.media.<domain> domains straight into this
 * container.
 */
function gridContainer(
  network: StartedNetwork,
  configDir: string,
  startupTimeoutMs: number,
): GenericContainer {
  const container = new GenericContainer(GRID_IMAGE)
    .withNetwork(network)
    .withNetworkAliases(GRID_ALIAS)
    .withLabels({ [ROLE_LABEL]: 'the Grid services' })
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
    // Waiting on the healthchecks here would collapse every service into one opaque wait;
    // the first line of output is enough to hand over to the per-service checks below.
    .withWaitStrategy(Wait.forLogMessage(/./))
    .withStartupTimeout(10_000);

  if (!process.env.GRID_DEBUG) {
    return container;
  }

  const logStream = fs.createWriteStream(path.join(os.tmpdir(), 'grid-boot.log'));
  return container.withLogConsumer((stream) => {
    stream.on('data', (line) => logStream.write(line));
    stream.on('err', (line) => logStream.write(line));
  });
}

/**
 * Locally, the browser reaches the https://*.media.<domain> domains via the developer's
 * dev-nginx. CI has no dev-nginx, so a Caddy proxy replays the same subdomain routing and
 * terminates TLS with a self-signed cert, published on the https port the domains resolve to.
 */
function proxyContainer(network: StartedNetwork, caddyfile: string): GenericContainer {
  return new GenericContainer(PROXY_IMAGE)
    .withNetwork(network)
    .withLabels({ [ROLE_LABEL]: 'the reverse proxy' })
    .withExposedPorts({ container: 443, host: 443 })
    .withCopyContentToContainer([{ content: caddyfile, target: '/etc/caddy/Caddyfile' }])
    .withWaitStrategy(Wait.forListeningPorts())
    .withStartupTimeout(60_000);
}

/** Poll a fixed host port until its healthcheck passes, reporting how long it has waited. */
async function waitForHealthy(
  port: number,
  healthPath: string,
  timeoutMs: number,
  report: (message: string) => void,
): Promise<void> {
  const startedAt = Date.now();
  const deadline = startedAt + timeoutMs;

  for (; ;) {
    const { healthy } = await isServiceHealthy(healthPath)(port);
    if (healthy) {
      return;
    }
    if (Date.now() > deadline) {
      throw new Error(`localhost:${port}/${healthPath} did not pass its healthcheck within ${timeoutMs}ms`);
    }

    report(`waiting on localhost:${port} (${Math.round((Date.now() - startedAt) / 1000)}s)`);
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
}

/**
 * Start LocalStack and provision everything held in it. Sequential: each step needs the
 * resources the one before it created.
 */
function localstackTasks(): ListrTask<BootContext>[] {
  let clients: ReturnType<typeof provisioningClients>;

  return [
    {
      title: 'Start container',
      task: async (ctx) => {
        const localstack = await localstackContainer(ctx.network!).start();
        ctx.containers.push(localstack);
        clients = provisioningClients(localstack.getConnectionUri());
      },
    },
    {
      title: 'Apply CloudFormation template',
      task: async (ctx) => {
        ctx.coreStackProps = await createCoreStack(clients.cfn);
      },
    },
    {
      title: 'Seed config buckets',
      task: (ctx) => seedBuckets(clients.s3, ctx.coreStackProps!),
    },
    {
      title: 'Create permissions bucket',
      task: async (ctx) => {
        ctx.coreStackProps!.PermissionsBucket = await provisionPermissionsBucket(clients.s3);
      },
    },
    {
      title: 'Seed KCL lease tables',
      task: async (ctx) => {
        await Promise.all(
          [
            ctx.coreStackProps!.ThrallMessageStream,
            ctx.coreStackProps!.ThrallLowPriorityMessageStream,
          ].map((stream) => seedKclLeaseTable(clients.dynamo, clients.kinesis, stream)),
        );
      },
    },
  ];
}

/** Start the whole stack, tearing down anything already started if a later step fails. */
export async function startStack(options: StartStackOptions = {}): Promise<GridEnvironment> {
  const { proxy = !!process.env.CI, seed = true } = options;

  const startupTimeoutMs = Number(process.env.GRID_STARTUP_TIMEOUT_MS ?? 300_000);
  const context: BootContext = { containers: [] };

  const tasks: ListrTask<BootContext>[] = [
    {
      title: 'Create network',
      task: async (ctx) => {
        ctx.network = await new Network().start();
      },
    },
    {
      // These three share only the network, and Elasticsearch is by far the slowest to come
      // up, so provisioning LocalStack costs nothing beyond it.
      title: 'Start infrastructure',
      task: (_, task) =>
        task.newListr(
          [
            {
              title: 'Elasticsearch',
              task: async (ctx) => {
                ctx.containers.push(await elasticsearchContainer(ctx.network!).start());
              },
            },
            {
              // nginx resolves the `localstack` alias per request, so this need not wait for it.
              title: 'imgops',
              task: (_, imgopsTask) => {
                let image: GenericContainer;

                return imgopsTask.newListr(
                  [
                    {
                      title: 'Build image',
                      task: async () => {
                        image = await GenericContainer.fromDockerfile(IMGOPS_CONTEXT).build(
                          IMGOPS_IMAGE,
                          { deleteOnExit: false },
                        );
                      },
                    },
                    {
                      title: 'Start container',
                      task: async (ctx) => {
                        ctx.containers.push(await imgopsContainer(image, ctx.network!).start());
                      },
                    },
                  ],
                  // Subtasks inherit the concurrency of the group above, which these cannot use.
                  { concurrent: false },
                );
              },
            },
            {
              title: 'LocalStack',
              task: (_, task) => task.newListr(localstackTasks(), { concurrent: false }),
            },
          ],
          { concurrent: true },
        ),
    },
    {
      title: 'Generate service config',
      task: (ctx) => {
        // Reaching here means the probe found no live stack, so recreating the shared path is
        // safe and clears anything a killed run left behind.
        fs.rmSync(CONFIG_DIR, { recursive: true, force: true });
        fs.mkdirSync(CONFIG_DIR, { recursive: true });
        ctx.configDir = CONFIG_DIR;
        ownedConfigDir = CONFIG_DIR;
        generateServiceConfig(CONFIG_DIR, ctx.coreStackProps!);
      },
    },
    {
      title: 'Start Grid services',
      task: (_, task) =>
        task.newListr([
          {
            title: 'Start container',
            task: async (ctx) => {
              ctx.containers.push(
                await gridContainer(ctx.network!, ctx.configDir!, startupTimeoutMs).start(),
              );
            },
          },
          {
            title: 'Wait for services',
            task: (_, services) => {
              const readiness: ListrTask<BootContext>[] = [
                ...Object.entries(SERVICE_PORTS).map(([service, port]): { title: string, task: ListrTaskFn<BootContext, any, any> } => ({
                  title: service,
                  task: (_, serviceTask) =>
                    waitForHealthy(port, 'management/healthcheck', startupTimeoutMs, reportTo(serviceTask)),
                })),
                {
                  // Waits for the `Images_Current` alias the app assigns on startup, so this
                  // only needs the container running, not every service healthy.
                  title: 'Seed Elasticsearch',
                  skip: () => !seed && 'seeding not requested',
                  task: async (_, seedTask) => {
                    await seedElasticsearch(ELASTICSEARCH_URL, reportTo(seedTask));
                  },
                },
              ];

              return services.newListr(readiness, { concurrent: true });
            },
          },
        ]),
    },
    {
      title: 'Start reverse proxy',
      skip: () => !proxy && 'using dev-nginx',
      task: async (ctx) => {
        const caddy = await proxyContainer(ctx.network!, buildCaddyfile(ctx.coreStackProps!)).start();
        ctx.containers.push(caddy);
      },
    },
  ];

  try {
    await runTasks(tasks, context);

    return {
      network: context.network,
      containers: context.containers,
      configDir: context.configDir,
      baseUrl: KAHUNA_URL,
      mediaApiUrl: MEDIA_API_URL,
    };
  } catch (error) {
    // Leave nothing running if we failed part-way through the boot.
    await stopStack(context);
    throw error;
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
    isServiceHealthy('_')(IMGOPS_PORT)
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
  console.log(PROBE_OUTCOMES[state]);

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
        'A Grid stack is already running and reuse is disabled, as we are running in CI. ' +
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
  // Re-seeding is opt-in: whoever started the stack already seeded it, and the fixtures
  // are only reloaded on request because tests may have since changed the data.
  const reseed = options.seed === true || process.env.GRID_RESEED === 'true';

  await runTasks(
    [
      {
        title: 'Seed Elasticsearch',
        skip: () => !reseed && 'reseeding not requested',
        task: async (_, task) => {
          await seedElasticsearch(ELASTICSEARCH_URL, reportTo(task));
        },
      },
    ],
    {},
  );

  return { containers: [], baseUrl: KAHUNA_URL, mediaApiUrl: MEDIA_API_URL };
}

/** Stop what this process started and delete what it wrote; anything else is left alone. */
export async function stopStack(environment: StoppableStack | undefined): Promise<void> {
  if (!environment) {
    return;
  }

  const { containers, network, configDir } = environment;

  const tasks: ListrTask<object>[] = [
    // Reverse start order, so nothing is stopped before whatever depends on it.
    ...[...containers].reverse().map((container) => ({
      title: `Stop ${container.getLabels()[ROLE_LABEL] ?? container.getName()}`,
      task: async () => {
        await container.stop();
      },
    })),
    ...(network ? [{ title: 'Remove network', task: () => { network.stop() } }] : []),
    ...(configDir
      ? [
        {
          title: 'Remove generated config',
          task: () => {
            fs.rmSync(configDir, { recursive: true, force: true });
            ownedConfigDir = undefined;
          },
        },
      ]
      : []),
  ];

  if (tasks.length === 0) {
    return;
  }

  // Every step is best-effort: a failure is reported against its task and the rest still run.
  await runTasks(tasks, {}, { exitOnError: false });
}
