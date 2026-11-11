import * as os from 'os';
import * as path from 'path';

export const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');

export const DOMAIN = 'local.dev-gutools.co.uk';
export const EMAIL_DOMAIN = 'guardian.co.uk';
export const REGION = 'eu-west-1';

export const CORE_STACK_NAME = 'grid-dev-core';
export const AUTH_STACK_NAME = 'grid-dev-auth';

export const OIDC_CLIENT_ID = 'grid-local-id';
export const OIDC_CLIENT_SECRET = 'grid-local-secret';
export const OIDC_PORT = 9014;
export const OIDC_HOST = 'oidc.localhost';
export const OIDC_ISSUER = `http://${OIDC_HOST}:${OIDC_PORT}`;
export const OIDC_CONTEXT = path.join(REPO_ROOT, 'dev', 'oidc-provider');
export const OIDC_IMAGE = 'grid-e2e-oidc-provider';
export const TEST_ACCOUNTS = {
  fullAccess: `grid-e2e-account@${EMAIL_DOMAIN}`,
  restricted: `grid-e2e-restricted-account@${EMAIL_DOMAIN}`,
  noUpload: `grid-e2e-no-upload-account@${EMAIL_DOMAIN}`,
  /** Can upload but must never do so, and owns no seeded images, so its upload history stays empty. */
  noHistory: `grid-e2e-no-history-account@${EMAIL_DOMAIN}`,
} as const;
export type TestAccount = (typeof TEST_ACCOUNTS)[keyof typeof TEST_ACCOUNTS];
/** Saved browser session for TEST_ACCOUNTS.fullAccess, written by setup/auth.setup.ts. */
export const AUTH_STATE_PATH = path.join(REPO_ROOT, 'e2e-tests', 'playwright', '.auth', 'full-access.json');

/** Pre-built application image (see e2e-tests/images/Dockerfile). Assumed to exist. */
export const GRID_IMAGE = process.env.CI ? 'grid-e2e-ci' : 'grid-e2e-dev';
export const ELASTICSEARCH_IMAGE = 'docker.elastic.co/elasticsearch/elasticsearch:8.18.3';
export const LOCALSTACK_IMAGE = 'localstack/localstack:4.5.0';
/**
 * imgops: standalone nginx on-the-fly image resizer, built from dev/imgops at setup time.
 * Its nginx.conf proxies to the `localstack` alias on 4566, so it shares the stack network.
 * Published on IMGOPS_PORT, the fixed host port dev-nginx maps `media-imgops` to.
 */
export const IMGOPS_ALIAS = 'imgops';
export const IMGOPS_PORT = 9008;
export const IMGOPS_CONTEXT = path.join(REPO_ROOT, 'dev', 'imgops');
export const IMGOPS_NGINX_CONF = path.join(IMGOPS_CONTEXT, 'nginx.conf');
/** Stable tag for the imgops image so it persists across runs and Docker reuses cached layers. */
export const IMGOPS_IMAGE = 'grid-e2e-imgops';

/** Network aliases the app container uses to reach the infrastructure containers. */
export const ELASTICSEARCH_ALIAS = 'elasticsearch';
/** Fixed host port, so a stack started by `dev.ts` can be reached without a container handle. */
export const ELASTICSEARCH_PORT = 9200;
export const LOCALSTACK_ALIAS = 'localstack';
export const LOCALSTACK_PORT = 4566;
/** Network alias the CI reverse proxy uses to reach the grid-e2e-ci app container. */
export const GRID_ALIAS = 'grid-e2e-ci';

export type ServiceConfig = {
  port: number;
  primaryHostname: string;
  additionalHostnames: string[];
};

/** Service hostnames and HTTP ports, matching e2e-tests/images/entrypoint.ci.sh. */
export const SERVICE_CONFIGS: Record<string, ServiceConfig> = {
  'media-api': { port: 9001, primaryHostname: 'api.media', additionalHostnames: [] },
  thrall: { port: 9002, primaryHostname: 'thrall.media', additionalHostnames: [] },
  'image-loader': { port: 9003, primaryHostname: 'loader.media', additionalHostnames: ['loader-projection.media'] },
  kahuna: { port: 9005, primaryHostname: 'media', additionalHostnames: [] },
  cropper: { port: 9006, primaryHostname: 'cropper.media', additionalHostnames: [] },
  'metadata-editor': { port: 9007, primaryHostname: 'media-metadata', additionalHostnames: [] },
  collections: { port: 9010, primaryHostname: 'media-collections', additionalHostnames: [] },
  auth: { port: 9011, primaryHostname: 'media-auth', additionalHostnames: [] },
  leases: { port: 9012, primaryHostname: 'media-leases', additionalHostnames: [] },
};

export const KAHUNA_PORT = SERVICE_CONFIGS.kahuna.port;
export const MEDIA_API_PORT = SERVICE_CONFIGS['media-api'].port;

/**
 * Generated per-service config, bind-mounted into the app container.
 */
export const CONFIG_DIR = path.join(os.tmpdir(), 'grid-e2e-config');

/** The API key value uploaded to the KeyBucket (dev/.env API_KEY). */
export const API_KEY = 'e2e-dev';
