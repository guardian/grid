import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { GenericContainer, Network, getContainerRuntimeClient } from 'testcontainers';
import type { StartedNetwork, StartedTestContainer } from 'testcontainers';
import {
  CHEKOV_HOSTS, prepareChekov, registerChekovAliases, registerLocalstackAliases, s3BucketHosts,
} from './chekov.ts';
import { createConfigDirectory, generateServiceConfig, PLAY_HTTP_SECRET } from './config.ts';
import {
  DOMAIN, ELASTICSEARCH_URL, IMGOPS_CONTEXT, IMGOPS_IMAGE, KAHUNA_URL, MEDIA_API_URL, OIDC_CONTEXT,
  OIDC_IMAGE, SERVICE_CONFIGS, getOidcIssuer,
} from './constants.ts';
import {
  createAuthStack, createCoreStack, provisioningClients, seedAuthBuckets, seedBuckets, seedKclLeaseTable,
} from './provision.ts';
import { seedCollections } from './seed-collections.ts';
import { seedElasticsearch } from './seed-elasticsearch.ts';
import { seedImageFiles } from './seed-image-files.ts';
import {
  chekovContainer, elasticsearchContainer, gridContainer, imgopsContainer, localstackContainer, oidcContainer,
} from './stack/containers.ts';
import { formatDuration, type StackDiagnostics } from './stack-diagnostics.ts';
import { createStackResources, settleAll } from './stack-lifecycle.ts';
import type { GridEnvironment } from './state.ts';

const START_ATTEMPT_LABEL = 'uk.co.guardian.grid.e2e.start-attempt';

export interface StartStackOptions {
  /** Start the bundled Chekov proxy. Defaults to true unless GRID_PROXY=false. */
  proxy?: boolean;
  /** Load Elasticsearch, S3 image and collection fixtures. Defaults to true. */
  seed?: boolean;
}

async function removeFailedContainer(attempt: string): Promise<void> {
  const { container } = await getContainerRuntimeClient();
  // Include containers that Docker created but never started.
  const [match] = await container.dockerode.listContainers({
    all: true,
    filters: { label: [`${START_ATTEMPT_LABEL}=${attempt}`] },
  });
  if (!match) return;

  try {
    await container.getById(match.Id).remove({ force: true, v: true });
  } catch (error) {
    const alreadyRemoved = error instanceof Error && 'statusCode' in error && error.statusCode === 404;
    if (!alreadyRemoved) throw error;
  }
}

export async function buildImage(
  name: string,
  context: string,
  tag: string,
  diagnostics: StackDiagnostics,
  signal: AbortSignal,
): Promise<GenericContainer> {
  signal.throwIfAborted();
  return diagnostics.step(`build:${name}`, async () => {
    const build = spawn('docker', ['build', '--progress=plain', '--load', '--tag', tag, context], {
      stdio: ['ignore', 'pipe', 'pipe'],
      signal,
    });

    diagnostics.capture('builds', name, build.stdout);
    diagnostics.capture('builds', name, build.stderr);

    // Aborting emits an error before the process and its output streams close.
    let processError: Error | undefined;
    build.on('error', (error) => { processError ??= error; });
    await new Promise<void>((resolve) => {
      build.once('close', () => resolve());
    });

    signal.throwIfAborted();
    if (processError) throw processError;
    if (build.exitCode !== 0) {
      const logFile = `${diagnostics.directory}/builds/${name}.log`;
      throw new Error(`Docker build for ${name} exited with ${build.signalCode ?? build.exitCode}. See ${logFile}`);
    }

    return new GenericContainer(tag);
  });
}

async function waitForHealthy(
  port: number,
  timeoutMs: number,
  signal: AbortSignal,
): Promise<void> {
  const deadline = performance.now() + timeoutMs;
  const url = `http://localhost:${port}/management/healthcheck`;

  while (true) {
    signal.throwIfAborted();

    try {
      const requestSignal = AbortSignal.any([signal, AbortSignal.timeout(2_000)]);
      const response = await fetch(url, { signal: requestSignal });
      await response.body?.cancel();
      if (response.ok) return;
    } catch {
      // Connection errors are expected while the service boots. A shutdown ends the wait.
      signal.throwIfAborted();
    }
    if (performance.now() >= deadline) {
      throw new Error(`${url} did not pass its healthcheck within ${timeoutMs}ms`);
    }
    await delay(1_000, undefined, { signal });
  }
}

/** Docker wait lets readiness checks report the actual exit instead of a later HTTP timeout. */
async function watchGridExit(container: StartedTestContainer, startup: AbortController): Promise<void> {
  try {
    const client = await getContainerRuntimeClient();
    const { StatusCode } = await client.container.getById(container.getId()).wait();

    startup.abort(new Error(`Grid services container exited with status ${StatusCode} during startup.`));
  } catch (error) {
    startup.abort(error);
  }
}

export async function startStack(
  options: StartStackOptions,
  diagnostics: StackDiagnostics,
  shutdownSignal?: AbortSignal,
): Promise<GridEnvironment> {
  const { proxy = process.env.GRID_PROXY !== 'false', seed = true } = options;
  const timeoutMs = Number(process.env.GRID_STARTUP_TIMEOUT_MS ?? 300_000);
  const startup = new AbortController();
  const { signal } = startup;
  const resources = createStackResources(diagnostics);
  const interrupt = () => startup.abort(shutdownSignal?.reason);
  let removeConfigDirectory: (() => Promise<void>) | undefined;
  let cleanup: Promise<void> | undefined;

  shutdownSignal?.throwIfAborted();
  shutdownSignal?.addEventListener('abort', interrupt, { once: true });
  diagnostics.addSecrets([PLAY_HTTP_SECRET]);

  async function cleanupStack(): Promise<void> {
    const label = 'cleanup'.padEnd(24);
    const started = performance.now();
    diagnostics.log(`${label} STARTED`);
    let failures = await resources.stopAll();
    if (removeConfigDirectory) {
      try {
        await diagnostics.step('remove:config', removeConfigDirectory);
      } catch {
        failures++;
      }
    }
    const duration = formatDuration((performance.now() - started) / 1000);
    const status = failures ? 'FAILED' : 'DONE';
    diagnostics.log(`${label} ${status.padEnd(7)} [${duration}] failures=${failures}`);
    diagnostics.log(`diagnostics retained: ${diagnostics.directory}`);

    if (failures) {
      throw new Error(`Grid e2e cleanup failed. See ${diagnostics.directory}/stack.log`);
    }
  }

  function stop(): Promise<void> {
    return cleanup ??= cleanupStack();
  }

  function step<T>(name: string, run: () => Promise<T>): Promise<T> {
    signal.throwIfAborted();

    return diagnostics.step(name, async () => {
      try {
        return await run();
      } catch (error) {
        signal.throwIfAborted();
        throw error;
      }
    });
  }

  function startContainer<T extends StartedTestContainer>(
    name: string,
    definition: Pick<GenericContainer, 'withLabels' | 'withLogConsumer'> & { start(): Promise<T> },
  ): Promise<T> {
    signal.throwIfAborted();
    const attempt = randomUUID();
    definition.withLabels({ [START_ATTEMPT_LABEL]: attempt });
    definition.withLogConsumer((stream) => diagnostics.capture('containers', name, stream));

    return resources.startContainer(name, () => definition.start(), () => removeFailedContainer(attempt));
  }

  async function prepareGrid(network: StartedNetwork) {
    const localstack = await startContainer('localstack', localstackContainer(network));
    const { cfn, s3, dynamo, kinesis } = provisioningClients(localstack.getConnectionUri());
    const core = await step('provision:core', () => createCoreStack(cfn, signal));
    const auth = await step('provision:auth', () => createAuthStack(cfn, signal));

    await step('seed:config', () => seedBuckets(s3, core, signal));
    await step('seed:auth', () => seedAuthBuckets(s3, auth, getOidcIssuer(proxy), diagnostics.addSecrets, signal));

    if (seed) {
      await step('seed:images', () => seedImageFiles(s3, core, signal));
    }

    await step('seed:kcl', () => settleAll([
      () => seedKclLeaseTable(dynamo, kinesis, core.ThrallMessageStream, signal),
      () => seedKclLeaseTable(dynamo, kinesis, core.ThrallLowPriorityMessageStream, signal),
    ], startup));

    const { configDir, caRoot } = await step('generate:config', async () => {
      const directory = createConfigDirectory(diagnostics.log);
      removeConfigDirectory = directory.remove;
      generateServiceConfig(directory.path, core, auth, proxy);
      return { configDir: directory.path, caRoot: proxy ? prepareChekov(directory.path) : undefined };
    });

    if (!caRoot) return { configDir, proxyHosts: [] };

    const chekov = await startContainer('chekov', chekovContainer(network, caRoot));

    await step('check:localstack-routes', () => registerLocalstackAliases(chekov, core, signal));

    return { configDir, chekov, proxyHosts: [...CHEKOV_HOSTS, ...s3BucketHosts(core)] };
  }

  async function checkService(name: string, port: number): Promise<void> {
    await step(`check:${name}`, () => waitForHealthy(port, timeoutMs, signal));
    if (seed && name === 'collections') {
      await step('seed:collections', () => seedCollections(signal));
    }
  }

  async function startGrid(network: StartedNetwork) {
    const [config] = await settleAll([
      () => prepareGrid(network),
      () => startContainer('elasticsearch', elasticsearchContainer(network)),
    ], startup);
    const grid = await startContainer('grid', gridContainer(network, config.configDir, config.proxyHosts));

    void watchGridExit(grid, startup);

    const checks = Object.entries(SERVICE_CONFIGS).map(([name, { port }]) => () => checkService(name, port));

    if (seed) {
      // Media API creates Images_Current as it boots. Other services can still be coming up.
      checks.push(() => step('seed:elasticsearch', () => seedElasticsearch(ELASTICSEARCH_URL, timeoutMs, signal)));
    }

    await settleAll(checks, startup);

    return config;
  }

  try {
    return await diagnostics.step('startup', async () => {
      const network = await resources.startNetwork(() => new Network().start());
      const [gridConfig] = await settleAll([
        () => startGrid(network),
        async () => {
          const image = await buildImage('imgops', IMGOPS_CONTEXT, IMGOPS_IMAGE, diagnostics, signal);
          await startContainer('imgops', imgopsContainer(image, network, proxy));
        },
        async () => {
          const image = await buildImage('oidc', OIDC_CONTEXT, OIDC_IMAGE, diagnostics, signal);
          await startContainer('oidc', oidcContainer(image, network, proxy));
        },
      ], startup);

      const { chekov, configDir } = gridConfig;

      if (chekov) {
        await step('check:routes', () => registerChekovAliases(chekov, signal));
      }

      signal.throwIfAborted();
      diagnostics.log(`stack ready at https://media.${DOMAIN}`);

      return { configDir, baseUrl: KAHUNA_URL, mediaApiUrl: MEDIA_API_URL, stop };
    });
  } catch (error) {
    // An interrupted retry may throw a generic AbortError. Keep the original crash or signal.
    const cause = signal.aborted ? signal.reason : error;
    try {
      await stop();
    } catch (cleanupError) {
      diagnostics.error('cleanup:stack', cleanupError);
    }
    throw cause;
  } finally {
    shutdownSignal?.removeEventListener('abort', interrupt);
  }
}
