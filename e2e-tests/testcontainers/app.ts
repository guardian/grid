/**
 * Runs the Grid Play services directly on the host (in the devcontainer) via
 * `sbt <svc>/run`, instead of inside a Docker container. The test infrastructure
 * (Elasticsearch, LocalStack) still runs under Testcontainers; only the application
 * itself moves to the host so source changes recompile live (Play dev mode).
 */
import { spawn } from 'child_process';
import type { ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { REGION, REPO_ROOT, SERVICE_PORTS } from './constants';

const KAHUNA_DIR = path.join(REPO_ROOT, 'kahuna');

/** Services to run, in `sbt` task form, e.g. `auth/run media-api/run ...`. */
const RUN_TASKS = Object.keys(SERVICE_PORTS)
  .map((svc) => `${svc}/run`)
  .join(' ');

/** Environment shared by the frontend build and the sbt run process. */
function appEnv(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    AWS_ACCESS_KEY_ID: 'test',
    AWS_SECRET_ACCESS_KEY: 'test',
    AWS_REGION: REGION,
    AWS_DEFAULT_REGION: REGION,
    // The Java SDK CBOR protocol is disabled for LocalStack/Kinesis compatibility.
    AWS_CBOR_DISABLE: 'true',
  };
}

/** Run a command to completion, rejecting on a non-zero exit. */
function runToCompletion(command: string, args: string[], cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env: appEnv(), stdio: 'inherit' });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} ${args.join(' ')} exited with code ${code}`));
      }
    });
  });
}

/**
 * Build Kahuna's webpack bundle once so the kahuna service can serve its assets.
 * (`sbt kahuna/run` serves the pre-built bundle from `kahuna/public/dist`.)
 */
export async function buildKahunaFrontend(): Promise<void> {
  if (!fs.existsSync(path.join(KAHUNA_DIR, 'node_modules'))) {
    await runToCompletion('npm', ['ci'], KAHUNA_DIR);
  }
  await runToCompletion('npm', ['run', 'build-dev'], KAHUNA_DIR);
}

export interface GridApp {
  process: ChildProcess;
  logFile: string;
}

/**
 * Start every Grid service in a single sbt session (`all auth/run media-api/run ...`).
 *
 * Play's dev-mode `run` blocks reading stdin and stops on EOF, so stdin is fed from a
 * never-ending source (`tail -f /dev/null`) to keep the services up non-interactively.
 * The process is started in its own process group (`detached`) so teardown can signal
 * the whole tree (bash, tail, sbt, the JVMs) at once.
 */
export function startGridApp(): GridApp {
  const logFile = path.join(os.tmpdir(), 'grid-app.log');
  const out = fs.createWriteStream(logFile);

  const sbtCommand = `all ${RUN_TASKS}`;
  const shellCommand = `tail -f /dev/null | sbt ${JSON.stringify(sbtCommand)}`;

  const child = spawn('bash', ['-c', shellCommand], {
    cwd: REPO_ROOT,
    env: appEnv(),
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  // Tee the sbt output to both the log file and this process's stdout/stderr so the
  // service startup (Play dev-mode compilation) can be watched live while diagnosing
  // slow or failed startups.
  child.stdout?.pipe(out);
  child.stderr?.pipe(out);
  child.stdout?.pipe(process.stdout);
  child.stderr?.pipe(process.stderr);

  return { process: child, logFile };
}

/** Poll a single service's management healthcheck, returning true on HTTP 200. */
async function isServiceHealthy(port: number): Promise<boolean> {
  try {
    const response = await fetch(`http://localhost:${port}/management/healthcheck`);
    return response.status === 200;
  } catch {
    return false;
  }
}

/**
 * Wait until every service responds 200 on its healthcheck. In Play dev mode each service
 * compiles lazily on its first request, so this both triggers compilation and confirms
 * readiness. The first compile is slow, hence the generous default timeout.
 */
export async function waitForServices(timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  const pending = new Map(Object.entries(SERVICE_PORTS));

  while (pending.size > 0) {
    // Poll every pending service concurrently.
    await Promise.all(
      [...pending].map(async ([svc, port]) => {
        console.log(`Polling ${svc} at ${port} ...`);
        if (await isServiceHealthy(port)) {
          console.log(`Service ${svc} is healthy`);
          pending.delete(svc);
        }
      }),
    );

    if (pending.size === 0) {
      return;
    }

    if (Date.now() > deadline) {
      const msg = `Timed out waiting for Grid services to become healthy: ${[...pending.keys()].join(', ')}`;
      console.log(msg)
      throw new Error(msg);
    }

    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
}
