import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { GenericContainer, Wait } from 'testcontainers';
import type { StartedNetwork, StartedTestContainer } from 'testcontainers';
import { DOMAIN, IMGOPS_PORT, SERVICE_CONFIGS } from './constants.ts';

export const CHEKOV_IMAGE = 'ghcr.io/guardian/chekov/nginx:sha-4841ed355fb10451dc697ef164a59fba01f7dfbc';

export const CHEKOV_ALIASES = [
  ...Object.values(SERVICE_CONFIGS).flatMap(({ primaryHostname, additionalHostnames }) =>
    additionalHostnames.map((host) => ({
      sourceHostname: `${primaryHostname}.${DOMAIN}`,
      alias: `${host}.${DOMAIN}`,
      healthPath: '/management/healthcheck',
    })),
  ),
  { sourceHostname: `grid-localstack.${DOMAIN}`, alias: `localstack.media.${DOMAIN}`, healthPath: '/_localstack/health' },
  { sourceHostname: `${IMGOPS_PORT}.grid-imgops.${DOMAIN}`, alias: `media-imgops.${DOMAIN}`, healthPath: '/_' },
];

export const CHEKOV_HOSTS = [
  ...Object.values(SERVICE_CONFIGS).map(({ primaryHostname }) => `${primaryHostname}.${DOMAIN}`),
  ...CHEKOV_ALIASES.map(({ alias }) => alias),
  `chekov.${DOMAIN}`,
];

export function gridRouteLabels(): Record<string, string> {
  return {
    'devcontainer.metadata': JSON.stringify({
      forwardPorts: Object.values(SERVICE_CONFIGS).map(({ port }) => port),
      portsAttributes: Object.fromEntries(
        Object.values(SERVICE_CONFIGS).map(({ port, primaryHostname }) => [port, { label: primaryHostname }]),
      ),
    }),
  };
}

export function s3BucketHosts(coreStackProps: Record<string, string>): string[] {
  return Object.entries(coreStackProps)
    .filter(([resource]) => resource.endsWith('Bucket'))
    .map(([resource, bucket]) => {
      if (!bucket || !/^[a-z0-9][a-z0-9.-]+$/.test(bucket)) {
        throw new Error(`Invalid S3 bucket for ${resource}: ${bucket}`);
      }
      return `${bucket}.s3.${DOMAIN}`;
    });
}

export function prepareChekov(configDir: string): string {
  const caRoot = process.env.CAROOT ?? execFileSync('mkcert', ['-CAROOT'], { encoding: 'utf8' }).trim();
  for (const file of ['rootCA.pem', 'rootCA-key.pem']) {
    if (!fs.existsSync(path.join(caRoot, file))) {
      throw new Error(`Missing ${file} in ${caRoot}. Run mkcert -install before starting the stack.`);
    }
  }
  fs.copyFileSync(path.join(caRoot, 'rootCA.pem'), path.join(configDir, 'ca.crt'));
  return path.resolve(caRoot);
}

export async function startChekov(
  network: StartedNetwork,
  caRoot: string,
): Promise<StartedTestContainer> {
  return new GenericContainer(CHEKOV_IMAGE)
    .withName('grid-chekov-nginx')
    .withNetwork(network)
    .withExtraHosts([{ host: 'host.docker.internal', ipAddress: 'host-gateway' }])
    .withLabels({ 'uk.co.guardian.grid.role': 'Chekov reverse proxy' })
    .withBindMounts([
      { source: process.env.TESTCONTAINERS_DOCKER_SOCKET_OVERRIDE ?? '/var/run/docker.sock', target: '/var/run/docker.sock', mode: 'ro' },
      { source: caRoot, target: '/etc/nginx/mkcert', mode: 'ro' },
    ])
    .withEnvironment({
      BASE_DOMAIN: DOMAIN,
      DOCKER_SOCKET: '/var/run/docker.sock',
      NGINX_CONFIG_PATH: '/etc/nginx/conf.d/generated.conf',
      TLS_CERT: '/etc/nginx/certs/wildcard.crt',
      TLS_KEY: '/etc/nginx/certs/wildcard.key',
      LOCAL_CA_CERT: '/etc/nginx/mkcert/rootCA.pem',
      LOCAL_CA_KEY: '/etc/nginx/mkcert/rootCA-key.pem',
      DEBOUNCE_MS: '500',
    })
    .withExposedPorts({ container: 80, host: 80 }, { container: 443, host: 443 })
    .withWaitStrategy(Wait.forHealthCheck())
    .withStartupTimeout(120_000)
    .start();
}

export async function registerChekovAliases(
  container: StartedTestContainer,
  coreStackProps: Record<string, string>,
): Promise<void> {
  const aliases = [
    ...CHEKOV_ALIASES,
    ...s3BucketHosts(coreStackProps).map((alias) => ({
      sourceHostname: `grid-localstack.${DOMAIN}`,
      alias,
      healthPath: '/_localstack/health',
    })),
  ];
  for (const { healthPath, ...alias } of aliases) {
    const deadline = Date.now() + 30_000;
    for (;;) {
      let result = await container.exec([
        'curl', '--fail-with-body', '--silent', '--show-error', '--max-time', '10',
        '--data', new URLSearchParams(alias).toString(),
        'http://127.0.0.1:18080/api/aliases',
      ]);
      if (result.exitCode === 0) {
        result = await container.exec([
          'curl', '--fail-with-body', '--silent', '--show-error', '--max-time', '10',
          '--cacert', '/etc/nginx/mkcert/rootCA.pem',
          '--resolve', `${alias.alias}:443:127.0.0.1`,
          `https://${alias.alias}${healthPath}`,
        ]);
        if (result.exitCode === 0) break;
      }
      if (Date.now() >= deadline) {
        const nginx = await container.exec(['nginx', '-t']);
        const diagnostics = await container.exec(['sh', '-c', 'tail -n 100 /var/log/chekov/*.log /var/log/devcontainer-nginx/*.log 2>/dev/null']);
        throw new Error(`Could not register Chekov alias ${alias.alias}: ${result.output}\n${nginx.output}\n${diagnostics.output}`);
      }
      await delay(500);
    }
  }
}