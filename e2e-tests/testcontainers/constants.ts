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

/** Infrastructure container images. The Grid application itself now runs on the host
 * (via `sbt <svc>/run`) rather than in a container, so there is no app image here. */
export const ELASTICSEARCH_IMAGE = 'docker.elastic.co/elasticsearch/elasticsearch:8.18.3';
export const LOCALSTACK_IMAGE = 'localstack/localstack:4.5.0';

/** Network aliases the infrastructure containers use. */
export const ELASTICSEARCH_ALIAS = 'elasticsearch';
export const LOCALSTACK_ALIAS = 'localstack';
export const LOCALSTACK_PORT = 4566;
/**
 * Fixed host port Elasticsearch is published on. The host-run Grid services and the
 * Elasticsearch seeding step both reach it at `http://localhost:9200`.
 */
export const ELASTICSEARCH_PORT = 9200;

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
export const API_KEY = 'e2e-dev';
