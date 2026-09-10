import * as path from 'path';

export const REPO_ROOT = path.resolve(__dirname, '..', '..');

export const DOMAIN = 'local.dev-gutools.co.uk';
export const EMAIL_DOMAIN = 'guardian.co.uk';
export const REGION = 'eu-west-1';

export const CORE_STACK_NAME = 'grid-dev-core';

/**
 * Bucket holding `permissions.json` for the real authorisation provider. Not part of the
 * core CloudFormation stack, so it is created directly during provisioning. The name
 * matches the code default in `PermissionsAuthorisationProvider`.
 */
export const PERMISSIONS_BUCKET = 'permissions-cache';

/** Pre-built application image (see e2e-tests/images/Dockerfile). Assumed to exist. */
export const GRID_IMAGE = process.env.CI ? 'grid-e2e-ci' : 'grid-e2e-dev';
export const ELASTICSEARCH_IMAGE = 'docker.elastic.co/elasticsearch/elasticsearch:8.18.3';
export const LOCALSTACK_IMAGE = 'localstack/localstack:4.5.0';
/** Reverse proxy used in CI to stand in for the developer's dev-nginx (see global-setup). */
export const PROXY_IMAGE = 'caddy:2.8-alpine';

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
export const LOCALSTACK_ALIAS = 'localstack';
export const LOCALSTACK_PORT = 4566;
/** Network alias the CI reverse proxy uses to reach the grid-e2e-ci app container. */
export const GRID_ALIAS = 'grid-e2e-ci';

/** service -> http port, from e2e-tests/images/entrypoint.ci.sh. */
export const SERVICE_PORTS: Record<string, number> = {
  'media-api': 9001,
  thrall: 9002,
  'image-loader': 9003,
  kahuna: 9005,
  cropper: 9006,
  'metadata-editor': 9007,
  collections: 9010,
  auth: 9011,
  leases: 9012,
};

export const KAHUNA_PORT = SERVICE_PORTS.kahuna;
export const MEDIA_API_PORT = SERVICE_PORTS['media-api'];

/** File (repo-relative to e2e-tests) where global-setup records the resolved service URLs. */
export const URLS_FILE = path.join(__dirname, '..', '.grid-urls.json');

/** The API key value uploaded to the KeyBucket (dev/.env API_KEY). */
export const API_KEY = 'e2e-dev';
