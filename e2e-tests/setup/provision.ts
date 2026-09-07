import * as fs from 'fs';
import * as path from 'path';
import {
  CloudFormationClient,
  CreateStackCommand,
  DescribeStackResourcesCommand,
  waitUntilStackCreateComplete,
} from '@aws-sdk/client-cloudformation';
import {
  CreateTableCommand,
  DynamoDBClient,
  PutItemCommand,
  ScanCommand,
  waitUntilTableExists,
} from '@aws-sdk/client-dynamodb';
import { KinesisClient, ListShardsCommand } from '@aws-sdk/client-kinesis';
import { CreateBucketCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { API_KEY as API_KEY_PATH, CORE_STACK_NAME, PERMISSIONS_BUCKET, REGION, REPO_ROOT } from './constants.ts';

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

/**
 * Provisions the Grid core infrastructure inside LocalStack: applies the CloudFormation
 * core stack, waits for completion, reads the created resource names, and seeds the
 * buckets with the config files the services expect (similar to dev/script/setup.sh).
 */
export async function createCoreStack(cfn: CloudFormationClient): Promise<StackProps> {
  const templateBody = fs.readFileSync(
    path.join(REPO_ROOT, 'dev', 'cloudformation', 'grid-dev-core.yml'),
    'utf8',
  );

  await cfn.send(new CreateStackCommand({ StackName: CORE_STACK_NAME, TemplateBody: templateBody }));
  // LocalStack applies the stack in seconds; the SDK default would sit out its 30s minimum delay.
  await waitUntilStackCreateComplete(
    { client: cfn, maxWaitTime: 180, minDelay: 1, maxDelay: 5 },
    { StackName: CORE_STACK_NAME },
  );

  const { StackResources = [] } = await cfn.send(
    new DescribeStackResourcesCommand({ StackName: CORE_STACK_NAME }),
  );

  return Object.fromEntries(
    StackResources.filter((r) => r.LogicalResourceId && r.PhysicalResourceId).map((r) => [
      r.LogicalResourceId as string,
      r.PhysicalResourceId as string,
    ]),
  );
}

async function putObject(
  s3: S3Client,
  bucket: string,
  key: string,
  body: Buffer | string,
): Promise<void> {
  await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body }));
}

export async function seedBuckets(s3: S3Client, props: StackProps): Promise<void> {
  const devConfig = path.join(REPO_ROOT, 'dev', 'config');

  await Promise.all([
    // API key used by the machine authentication provider.
    putObject(s3, props.KeyBucket, API_KEY_PATH, 'DEV Key'),
    // Static config consumed by the services.
    ...['photographers.json', 'rcs-quota.json', 'usage_rights.json'].map((file) =>
      putObject(s3, props.ConfigBucket, file, fs.readFileSync(path.join(devConfig, file))),
    ),
    putObject(
      s3,
      props.UsageMailBucket,
      'usages.eml',
      fs.readFileSync(path.join(devConfig, 'usages.eml')),
    ),
  ]);
}

/**
 * Create the permissions bucket (not part of the core stack) and seed it with the
 * permissions fixture so the real authorisation provider can read `permissions.json`.
 * Returns the bucket name so it can be added to the stack props map.
 */
export async function provisionPermissionsBucket(s3: S3Client): Promise<string> {
  await s3.send(
    new CreateBucketCommand({
      Bucket: PERMISSIONS_BUCKET,
      CreateBucketConfiguration: { LocationConstraint: REGION },
    }),
  );

  await putObject(
    s3,
    PERMISSIONS_BUCKET,
    'permissions.json',
    fs.readFileSync(path.join(REPO_ROOT, 'e2e-tests', 'fixtures', 'permissions', 'permissions.json')),
  );

  return PERMISSIONS_BUCKET;
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
): Promise<void> {
  await dynamo.send(
    new CreateTableCommand({
      TableName: streamName,
      KeySchema: [{ AttributeName: 'leaseKey', KeyType: 'HASH' }],
      AttributeDefinitions: [{ AttributeName: 'leaseKey', AttributeType: 'S' }],
      BillingMode: 'PAY_PER_REQUEST',
    }),
  );
  await waitUntilTableExists({ client: dynamo, maxWaitTime: 60, minDelay: 1 }, { TableName: streamName });

  const { Shards = [] } = await kinesis.send(new ListShardsCommand({ StreamName: streamName }));

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
      ),
    ),
  );
}

