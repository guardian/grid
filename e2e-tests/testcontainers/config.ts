/**
 * Reuses the existing dev config generator (`dev/script/generate-config/service-config.js`)
 * to produce per-service Grid config from live CloudFormation stack resources, then
 * rewrites the LocalStack/Elasticsearch endpoints so that they resolve via the
 * Testcontainers network aliases instead of the Guardian dev domains / localhost.
 */
import * as fs from 'fs';
import * as path from 'path';
import JSON5 from 'json5';
import {
  DOMAIN,
  EMAIL_DOMAIN,
  ELASTICSEARCH_ALIAS,
  LOCALSTACK_ALIAS,
  LOCALSTACK_PORT,
  REGION,
  REPO_ROOT,
  SERVICE_PORTS,
} from './constants';

const GENERATE_CONFIG_DIR = path.join(REPO_ROOT, 'dev', 'script', 'generate-config');

// The services packaged into the grid-all image (see e2e-tests/images/entrypoint.sh).
const GRID_SERVICES = Object.keys(SERVICE_PORTS);

type StackProps = Record<string, string>;

/**
 * Rewrite the Guardian dev endpoints baked in by `service-config.js` so that the
 * app container reaches the infrastructure containers over the shared network.
 */
function rewriteEndpoints(conf: string): string {
  const localstackUrl = `http://${LOCALSTACK_ALIAS}:${LOCALSTACK_PORT}`;
  // Endpoints baked in by `service-config.js` that must be redirected to the container.
  const guardianLocalstackUrl = `https://${LOCALSTACK_ALIAS}.media.${DOMAIN}`;
  const legacyLocalstackUrl = 'http://localhost:4576';
  const localLocalstackUrl = `http://localhost:${LOCALSTACK_PORT}`;
  return conf
    .split(guardianLocalstackUrl)
    .join(localstackUrl)
    .split(legacyLocalstackUrl)
    .join(localstackUrl)
    .split(localLocalstackUrl)
    .join(localstackUrl);
}

/**
 * Generate all service config files into `configDir`, reusing `service-config.js`.
 */
export function generateServiceConfig(configDir: string, coreStackProps: StackProps): void {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const ServiceConfig = require(path.join(GENERATE_CONFIG_DIR, 'service-config.js'));
  const defaultConfig = JSON5.parse(
    fs.readFileSync(path.join(GENERATE_CONFIG_DIR, 'config.json5'), 'utf8'),
  );

  const config = {
    ...defaultConfig,
    DOMAIN,
    EMAIL_DOMAIN,
    AWS_DEFAULT_REGION: REGION,
    // NO_AUTHENTICATION makes `getCommonConfig` emit the Local authentication provider, so
    // we don't need pan-domain / OIDC infrastructure. Authorisation is left as the real
    // (S3-backed) provider, which reads `permissions.json` from the provisioned bucket.
    NO_AUTHENTICATION: true,
    coreStackProps,
    es6: {
      ...defaultConfig.es6,
      url: `http://${ELASTICSEARCH_ALIAS}:9200`,
    },
  };

  const serviceConfigs: Record<string, string> = ServiceConfig.getCoreConfigs(config);

  fs.mkdirSync(configDir, { recursive: true });

  // Mark the stage as DEV so services load `~/.grid/<app>.conf` (see GridConfigLoader).
  fs.writeFileSync(path.join(configDir, 'stage'), 'DEV');

  for (const service of GRID_SERVICES) {
    const conf = serviceConfigs[service];
    if (!conf) {
      throw new Error(`service-config.js did not produce config for '${service}'`);
    }
    fs.writeFileSync(path.join(configDir, `${service}.conf`), rewriteEndpoints(conf));
  }
}
