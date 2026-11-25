import { spawn } from 'node:child_process';
import type DockerModem from 'docker-modem';
import { GenericContainer, getContainerRuntimeClient } from 'testcontainers';
import type { StackDiagnostics } from './stack-diagnostics.ts';

export async function dockerBuildEnvironment(): Promise<NodeJS.ProcessEnv> {
  const { container, compose } = await getContainerRuntimeClient();
  const { socketPath, host, port, protocol } = container.dockerode.modem as DockerModem.ConstructorOptions;
  // Testcontainers keeps the CLI connection settings it resolved for Compose here.
  const { environment } = compose as typeof compose & { environment?: NodeJS.ProcessEnv };
  let dockerHost = environment?.DOCKER_HOST;

  if (socketPath) {
    const scheme = process.platform === 'win32' ? 'npipe' : 'unix';
    dockerHost = `${scheme}://${socketPath}`;
  } else if (host && protocol !== 'ssh') {
    dockerHost = `tcp://${host}:${port || (protocol === 'https' ? 443 : 80)}`;
  }
  if (!dockerHost) {
    throw new Error('Could not determine the Docker endpoint selected by Testcontainers.');
  }

  return {
    ...process.env,
    DOCKER_HOST: dockerHost,
    DOCKER_CONTEXT: undefined,
    BUILDX_BUILDER: undefined,
    DOCKER_TLS: undefined,
    DOCKER_TLS_VERIFY: protocol === 'https' ? '1' : undefined,
    DOCKER_CERT_PATH: environment?.DOCKER_CERT_PATH ?? process.env.DOCKER_CERT_PATH,
  };
}

export async function buildImage(options: {
  name: string;
  context: string;
  tag: string;
  diagnostics: StackDiagnostics;
  signal?: AbortSignal;
  env: NodeJS.ProcessEnv;
}): Promise<GenericContainer> {
  const { name, context, tag, diagnostics, signal, env } = options;
  signal?.throwIfAborted();
  return diagnostics.step(`build:${name}`, async () => {
    const build = spawn('docker', ['build', '--progress=plain', '--load', '--tag', tag, context], {
      stdio: ['ignore', 'pipe', 'pipe'],
      signal,
      env,
    });

    diagnostics.capture('builds', name, build.stdout);
    diagnostics.capture('builds', name, build.stderr);

    // Aborting emits an error before the process and its output streams close.
    let processError: Error | undefined;
    build.on('error', (error) => { processError ??= error; });
    await new Promise<void>((resolve) => {
      build.once('close', () => resolve());
    });

    signal?.throwIfAborted();
    if (processError) throw processError;
    if (build.exitCode !== 0) {
      const logFile = `${diagnostics.directory}/builds/${name}.log`;
      throw new Error(`Docker build for ${name} exited with ${build.signalCode ?? build.exitCode}. See ${logFile}`);
    }

    return new GenericContainer(tag);
  });
}
