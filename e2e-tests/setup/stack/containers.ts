import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { LocalstackContainer } from '@testcontainers/localstack';
import { GenericContainer, Wait } from 'testcontainers';
import type { StartedNetwork } from 'testcontainers';
import { CHEKOV_IMAGE, gridRouteLabels } from '../chekov.ts';
import {
  DOMAIN, EMAIL_DOMAIN, ELASTICSEARCH_ALIAS, ELASTICSEARCH_IMAGE, ELASTICSEARCH_PORT,
  GRID_IMAGE, IMGOPS_ALIAS, IMGOPS_NGINX_CONF, IMGOPS_PORT,
  LOCALSTACK_ALIAS, LOCALSTACK_IMAGE, LOCALSTACK_PORT,
  OIDC_CLIENT_ID, OIDC_CLIENT_SECRET, OIDC_HOST, OIDC_LOCAL_HOST, OIDC_PORT,
  REGION, REPO_ROOT, SERVICE_CONFIGS, getOidcIssuer,
} from '../constants.ts';

const ROLE_LABEL = 'uk.co.guardian.grid.role';
const LOCALSTACK_SERVICES = 'cloudformation,cloudwatch,dynamodb,kinesis,s3,sns,sqs,iam';

export function elasticsearchContainer(network: StartedNetwork): GenericContainer {
  return new GenericContainer(ELASTICSEARCH_IMAGE)
    .withName('grid-elasticsearch')
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

export function localstackContainer(network: StartedNetwork): LocalstackContainer {
  return new LocalstackContainer(LOCALSTACK_IMAGE)
    .withNetwork(network)
    .withNetworkAliases(LOCALSTACK_ALIAS)
    .withLabels({ [ROLE_LABEL]: 'LocalStack', 'devcontainer.hostname': 'grid-localstack', 'devcontainer.application.port': String(LOCALSTACK_PORT) })
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
export function imgopsContainer(image: GenericContainer, network: StartedNetwork, proxy: boolean): GenericContainer {
  const container = image
    .withNetwork(network)
    .withLabels({
      [ROLE_LABEL]: 'imgops',
      ...(proxy ? {
        'devcontainer.metadata': JSON.stringify({
          forwardPorts: [80],
          portsAttributes: { '80': { label: 'media-imgops' } },
        }),
      } : {}),
    })
    .withCopyFilesToContainer([{ source: IMGOPS_NGINX_CONF, target: '/etc/nginx/nginx.conf' }])
    .withExposedPorts({ container: 80, host: IMGOPS_PORT })
    .withWaitStrategy(Wait.forHttp('/_', 80).forStatusCode(200))
    .withStartupTimeout(120_000);

  return proxy ? container : container.withNetworkAliases(IMGOPS_ALIAS);
}

/**
 * Reuse the host's npm and sbt dependency caches so the container does not re-download
 * dependencies on every run. The devenv exposes persistent sbt cache dirs via env vars;
 * we also accept the standard user locations. Mounts are skipped when the host dir is
 * absent, so local runs without an existing cache remain unaffected.
 */
function dependencyCacheBindMounts(): { source: string; target: string; mode: 'rw' }[] {
  const candidates: { host: string | undefined; target: string }[] = [
    {
      host: path.join(os.homedir(), '.npm'),
      target: '/root/.npm',
    },
    {
      host: process.env.DEVENV_COURSIER_CACHE_MOUNT_DIR ?? path.join(os.homedir(), '.cache', 'coursier', 'v1'),
      target: '/root/.cache/coursier/v1',
    },
    {
      host: process.env.DEVENV_IVY_CACHE_MOUNT_DIR ?? path.join(os.homedir(), '.ivy2', 'cache'),
      target: '/root/.ivy2/cache',
    },
  ];

  return candidates.flatMap(({ host, target }) => {
    if (!host || !fs.existsSync(host)) {
      return [];
    }
    const source = fs.realpathSync.native(host);
    return [{ source, target, mode: 'rw' as const }];
  });
}

/**
 * All Grid services under test run inside this single container and talk to each
 * other over its localhost. Chekov uses the service labels and published host
 * ports for routing. The same ports are used with the developer's dev-nginx.
 */
export function gridContainer(
  network: StartedNetwork,
  configDir: string,
  proxyHosts: string[],
): GenericContainer {
  return new GenericContainer(GRID_IMAGE)
    .withNetwork(network)
    .withExtraHosts(proxyHosts.map((host) => ({ host, ipAddress: 'host-gateway' })))
    .withLabels({ [ROLE_LABEL]: 'the Grid services', ...gridRouteLabels() })
    .withExposedPorts(
      ...Object.values(SERVICE_CONFIGS).map(({ port }) => ({ container: port, host: port })),
    )
    .withBindMounts([
      // Services read config from ~/.grid; /etc/grid is honoured too. Mount both.
      { source: configDir, target: '/root/.grid', mode: 'ro' },
      { source: configDir, target: '/etc/grid', mode: 'ro' },
      // Both images run the services from source with sbt, so mount the repo over
      // /build. CI compiles once and runs; dev recompiles live on host edits.
      { source: REPO_ROOT, target: '/build', mode: 'rw' as const },
      // Reuse host dependency caches when present, so runs avoid re-downloading deps.
      ...dependencyCacheBindMounts(),
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
}

export function oidcContainer(image: GenericContainer, network: StartedNetwork, proxy: boolean): GenericContainer {
  const container = image
    .withNetwork(network)
    .withLabels({
      [ROLE_LABEL]: 'the local OIDC provider',
      ...(proxy ? { 'devcontainer.hostname': 'oidc', 'devcontainer.application.port': String(OIDC_PORT) } : {}),
    })
    .withEnvironment({
      DOMAIN,
      EMAIL_DOMAIN,
      OIDC_CLIENT_ID,
      OIDC_CLIENT_SECRET,
      OIDC_ISSUER: getOidcIssuer(proxy),
      OIDC_TRUST_PROXY: String(proxy),
    })
    .withCopyFilesToContainer([
      {
        source: path.join(REPO_ROOT, 'e2e-tests', 'fixtures', 'auth', 'users.json'),
        target: '/etc/grid/users.json',
      },
    ])
    .withExposedPorts({ container: OIDC_PORT, host: OIDC_PORT })
    .withWaitStrategy(
      Wait.forHttp('/.well-known/openid-configuration', OIDC_PORT, { abortOnContainerExit: true })
        .withHeaders(proxy ? { Host: OIDC_HOST, 'X-Forwarded-Proto': 'https' } : {})
        .forStatusCode(200),
    )
    .withStartupTimeout(60_000);

  return proxy ? container : container.withNetworkAliases(OIDC_LOCAL_HOST);
}

export function chekovContainer(
  network: StartedNetwork,
  caRoot: string,
): GenericContainer {
  return new GenericContainer(CHEKOV_IMAGE)
    .withName('grid-chekov-nginx')
    .withNetwork(network)
    .withExtraHosts([{ host: 'host.docker.internal', ipAddress: 'host-gateway' }])
    .withLabels({ [ROLE_LABEL]: 'Chekov reverse proxy' })
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
    .withStartupTimeout(120_000);
}
