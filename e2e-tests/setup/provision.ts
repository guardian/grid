import * as fs from 'fs';
import * as path from 'path';
import { generateKeyPairSync } from 'crypto';
import { setTimeout as delay } from 'node:timers/promises';
import {
  CloudFormationClient,
  CreateStackCommand,
  DescribeStackResourcesCommand,
  DescribeStacksCommand,
} from '@aws-sdk/client-cloudformation';
import {
  CreateTableCommand,
  DescribeTableCommand,
  DynamoDBClient,
  PutItemCommand,
  ResourceNotFoundException,
} from '@aws-sdk/client-dynamodb';
import { KinesisClient, ListShardsCommand } from '@aws-sdk/client-kinesis';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import {
  API_KEY as API_KEY_PATH,
  AUTH_STACK_NAME,
  CORE_STACK_NAME,
  DOMAIN,
  OIDC_CLIENT_ID,
  OIDC_CLIENT_SECRET,
  REGION,
  REPO_ROOT,
} from './constants.ts';

const CREDENTIALS = { accessKeyId: 'test', secretAccessKey: 'test' };

export type StackProps = Record<string, string>;

export function provisioningClients(endpoint: string) {
  const cfn = new CloudFormationClient({ endpoint, region: REGION, credentials: CREDENTIALS });
  const s3 = new S3Client({
    endpoint,
    region: REGION,
    credentials: CREDENTIALS,
    forcePathStyle: true,
  });
  const dynamo = new DynamoDBClient({ endpoint, region: REGION, credentials: CREDENTIALS });
  const kinesis = new KinesisClient({ endpoint, region: REGION, credentials: CREDENTIALS });
  return { cfn, s3, dynamo, kinesis };
}

async function waitForProvisioning(
  name: string,
  timeoutMs: number,
  signal: AbortSignal,
  isReady: (signal: AbortSignal) => Promise<boolean>,
): Promise<void> {
  const deadline = AbortSignal.timeout(timeoutMs);
  const pollSignal = AbortSignal.any([signal, deadline]);

  try {
    pollSignal.throwIfAborted();
    while (!(await isReady(pollSignal))) {
      await delay(1_000, undefined, { signal: pollSignal });
    }
    pollSignal.throwIfAborted();
  } catch (error) {
    signal.throwIfAborted();
    if (deadline.aborted) {
      throw new Error(`Timed out waiting for ${name} after ${timeoutMs / 1_000}s`, { cause: error });
    }
    throw error;
  }
}

/**
 * Provisions the Grid core infrastructure inside LocalStack: applies the CloudFormation
 * core stack, waits for completion, reads the created resource names, and seeds the
 * buckets with the config files the services expect (similar to dev/script/setup.sh).
 */
async function createStack(
  cfn: CloudFormationClient,
  stackName: string,
  templatePath: string,
  signal: AbortSignal,
): Promise<StackProps> {
  const templateBody = fs.readFileSync(templatePath, 'utf8');

  await cfn.send(new CreateStackCommand({ StackName: stackName, TemplateBody: templateBody }), { abortSignal: signal });

  await waitForProvisioning(`CloudFormation stack ${stackName}`, 180_000, signal, async (abortSignal) => {
    const { Stacks } = await cfn.send(new DescribeStacksCommand({ StackName: stackName }), { abortSignal });
    const stack = Stacks?.[0];
    const status = stack?.StackStatus;
    if (!status || status === 'CREATE_IN_PROGRESS') return false;
    if (status === 'CREATE_COMPLETE') return true;

    const reason = stack?.StackStatusReason;
    throw new Error(`CloudFormation stack ${stackName} reached ${status}${reason ? ` (${reason})` : ''}`);
  });

  return describeStack(cfn, stackName, signal);
}

/** Logical -> physical resource ids for an already-applied stack. */
async function describeStack(cfn: CloudFormationClient, stackName: string, signal?: AbortSignal): Promise<StackProps> {
  const { StackResources = [] } = await cfn.send(
    new DescribeStackResourcesCommand({ StackName: stackName }),
    { abortSignal: signal },
  );

  return Object.fromEntries(
    StackResources.filter((r) => r.LogicalResourceId && r.PhysicalResourceId).map((r) => [
      r.LogicalResourceId as string,
      r.PhysicalResourceId as string,
    ]),
  );
}

export function createCoreStack(cfn: CloudFormationClient, signal: AbortSignal): Promise<StackProps> {
  return createStack(
    cfn,
    CORE_STACK_NAME,
    path.join(REPO_ROOT, 'dev', 'cloudformation', 'grid-dev-core.yml'),
    signal,
  );
}

export function describeCoreStack(cfn: CloudFormationClient, signal?: AbortSignal): Promise<StackProps> {
  return describeStack(cfn, CORE_STACK_NAME, signal);
}

export function createAuthStack(cfn: CloudFormationClient, signal: AbortSignal): Promise<StackProps> {
  return createStack(
    cfn,
    AUTH_STACK_NAME,
    path.join(REPO_ROOT, 'dev', 'cloudformation', 'grid-dev-auth.yml'),
    signal,
  );
}

async function putObject(
  s3: S3Client,
  bucket: string,
  key: string,
  body: Buffer | string,
  signal: AbortSignal,
): Promise<void> {
  await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body }), { abortSignal: signal });
}

export async function seedBuckets(s3: S3Client, props: StackProps, signal: AbortSignal): Promise<void> {
  const devConfig = path.join(REPO_ROOT, 'dev', 'config');

  await Promise.all([
    // API key used by the machine authentication provider.
    putObject(s3, props.KeyBucket, API_KEY_PATH, 'DEV Key', signal),
    // Static config consumed by the services.
    ...['photographers.json', 'rcs-quota.json', 'usage_rights.json'].map((file) =>
      putObject(s3, props.ConfigBucket, file, fs.readFileSync(path.join(devConfig, file)), signal),
    ),
    putObject(
      s3,
      props.UsageMailBucket,
      'usages.eml',
      fs.readFileSync(path.join(devConfig, 'usages.eml')),
      signal,
    ),
  ]);
}

function keyBody(pem: string): string {
  return pem.replace(/-----[^-]+-----|\s/g, '');
}

export async function seedAuthBuckets(
  s3: S3Client,
  props: StackProps,
  oidcIssuer: string,
  addSecrets: (values: readonly string[]) => void,
  signal: AbortSignal,
): Promise<void> {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 4096,
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });
  const privateKeyBody = keyBody(privateKey);
  addSecrets([privateKey, privateKeyBody]);
  const publicKeyBody = keyBody(publicKey);
  const settings = [
    `privateKey=${privateKeyBody}`,
    `publicKey=${publicKeyBody}`,
    'cookieName=gutoolsAuth-assym',
    `clientId=${OIDC_CLIENT_ID}`,
    `clientSecret=${OIDC_CLIENT_SECRET}`,
    `discoveryDocumentUrl=${oidcIssuer}/.well-known/openid-configuration`,
    '',
  ].join('\n');

  await Promise.all([
    putObject(s3, props.PanDomainBucket, `${DOMAIN}.settings`, settings, signal),
    putObject(s3, props.PanDomainBucket, `${DOMAIN}.settings.public`, `publicKey=${publicKeyBody}\n`, signal),
    putObject(
      s3,
      props.PermissionsBucket,
      'permissions.json',
      fs.readFileSync(path.join(REPO_ROOT, 'e2e-tests', 'fixtures', 'permissions', 'permissions.json')),
      signal,
    ),
  ]);
}

/**
 * Pre-create the KCL lease table for a stream, with an unowned lease per shard.
 *
 * Thrall consumes each stream with the Kinesis Client Library, which names its DynamoDB
 * lease table after the KCL application name — and thrall sets that to the stream name.
 * Left to itself on a cold stack, KCL spends ~70s before it reads a single record:
 *
 *   - `Scheduler.initialize()` calls `shouldInitiateLeaseSync()`, which sleeps a random
 *     1-30s (polling every 3s) for as long as the lease table is empty. It is anti-stampede
 *     jitter for a real fleet, is not configurable, and is pure cost for a single worker.
 *   - It then runs the initial shard sync synchronously, and `ShardSyncTask` finishes with
 *     `Thread.sleep(shardSyncIntervalMillis)` — 60s on KCL's defaults.
 *
 * Seeding the leases here makes `isLeaseTableEmpty()` false on the very first check, so
 * neither the jitter nor the shard sync runs: the lease taker picks up the unowned leases
 * on its first pass instead.
 */
export async function seedKclLeaseTable(
  dynamo: DynamoDBClient,
  kinesis: KinesisClient,
  streamName: string,
  signal: AbortSignal,
): Promise<void> {
  await dynamo.send(
    new CreateTableCommand({
      TableName: streamName,
      KeySchema: [{ AttributeName: 'leaseKey', KeyType: 'HASH' }],
      AttributeDefinitions: [{ AttributeName: 'leaseKey', AttributeType: 'S' }],
      BillingMode: 'PAY_PER_REQUEST',
    }),
    { abortSignal: signal },
  );
  await waitForProvisioning(`DynamoDB table ${streamName}`, 60_000, signal, async (abortSignal) => {
    try {
      const { Table } = await dynamo.send(new DescribeTableCommand({ TableName: streamName }), { abortSignal });
      return Table?.TableStatus === 'ACTIVE';
    } catch (error) {
      if (error instanceof ResourceNotFoundException) return false;
      throw error;
    }
  });

  const { Shards = [] } = await kinesis.send(
    new ListShardsCommand({ StreamName: streamName }),
    { abortSignal: signal },
  );

  await Promise.all(
    Shards.map((shard) =>
      dynamo.send(
        new PutItemCommand({
          TableName: streamName,
          Item: {
            leaseKey: { S: shard.ShardId! },
            leaseCounter: { N: '0' },
            checkpoint: { S: 'TRIM_HORIZON' },
            checkpointSubSequenceNumber: { N: '0' },
            ownerSwitchesSinceCheckpoint: { N: '0' },
            // Without the hash range KCL's lease auditor reports the stream as having holes.
            startingHashKey: { S: shard.HashKeyRange!.StartingHashKey! },
            endingHashKey: { S: shard.HashKeyRange!.EndingHashKey! },
          },
        }),
        { abortSignal: signal },
      ),
    ),
  );
}

