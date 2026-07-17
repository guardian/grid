import * as path from 'path';

/** Repository root (two levels up from this file: e2e-tests/testcontainers/ -> repo). */
export const REPO_ROOT = path.resolve(__dirname, '..', '..');

/** Values mirror dev/.env — only used to shape generated config, not real infra. */
export const DOMAIN = process.env.GRID_DOMAIN ?? 'local.dev-gutools.co.uk';
export const EMAIL_DOMAIN = 'guardian.co.uk';
export const REGION = 'eu-west-1';

export const CORE_STACK_NAME = 'grid-dev-core';

/** Pre-built application image (see e2e-tests/images/Dockerfile). Assumed to exist. */
export const GRID_IMAGE = process.env.GRID_IMAGE ?? 'grid-all';
export const ELASTICSEARCH_IMAGE = 'docker.elastic.co/elasticsearch/elasticsearch:8.18.3';
export const LOCALSTACK_IMAGE = 'localstack/localstack:4.5.0';

/** Network aliases the app container uses to reach the infrastructure containers. */
export const ELASTICSEARCH_ALIAS = 'elasticsearch';
export const LOCALSTACK_ALIAS = 'localstack';
export const LOCALSTACK_PORT = 4566;

/** service -> http port, from e2e-tests/images/entrypoint.sh. */
export const SERVICE_PORTS: Record<string, number> = {
  'media-api': 9001,
  thrall: 9002,
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
export const API_KEY = 'dev-';
