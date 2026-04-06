#!/usr/bin/env ts-node

import {SQSClient} from "@aws-sdk/client-sqs";
import {backfillOneBatch} from "./backfiller.ts";
import {Context} from "aws-lambda";

const QUEUE_URL = process.env.QUEUE_URL || 'http://localhost:4566/000000000000/image-embedder-DEV';
const ELASTIC_SEARCH_URL = process.env.ELASTIC_SEARCH_URL || 'http://localhost:9200';

const localStackConfig = {
  endpoint: 'http://localhost:4566',
  forcePathStyle: true,
  credentials: {
    accessKeyId: 'test',
    secretAccessKey: 'test',
  },
};

const sqsClient = new SQSClient({
  region: 'eu-west-1',
  ...localStackConfig,
});

const context = {awsRequestId: 'test'} as Context;

async function main() {
  await backfillOneBatch(QUEUE_URL, ELASTIC_SEARCH_URL, 'Images_Current', sqsClient, context);
  console.log('✓ Handler completed');
}

main().catch((error) => {
  console.error('Failed to run backfiller locally:', error);
  process.exit(1);
});
