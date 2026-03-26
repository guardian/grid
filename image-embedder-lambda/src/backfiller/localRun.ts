#!/usr/bin/env ts-node

import {Context, EventBridgeEvent} from 'aws-lambda';

const LOCALSTACK_ENDPOINT =
  process.env.LOCALSTACK_ENDPOINT || 'http://localhost:4566';
const QUEUE_URL =
  process.env.QUEUE_URL ||
  'http://localhost:4566/000000000000/image-embedder-DEV';
const ELASTIC_SEARCH_URL =
  process.env.ELASTIC_SEARCH_URL || 'http://localhost:9200';

async function main() {
  process.env.LOCALSTACK_ENDPOINT = LOCALSTACK_ENDPOINT;
  process.env.BACKFILL_SQS_QUEUE = QUEUE_URL;
  process.env.ELASTIC_SEARCH_URL = ELASTIC_SEARCH_URL;

  // Import handler AFTER setting environment variables
  // Use require() because ts-node hooks into require, not dynamic import()
  const {handler} = require('./backfiller');

  console.log('Image Embedder Backfiller Local Runner');
  console.log('=======================================');
  console.log(`Localstack Endpoint: ${LOCALSTACK_ENDPOINT}`);
  console.log(`Backfill SQS Queue: ${QUEUE_URL}`);
  console.log(`Elasticsearch URL: ${ELASTIC_SEARCH_URL}`);
  console.log('');
  console.log('Invoking handler...');
  console.log('');

  const event: EventBridgeEvent<'Scheduled Event', {}> = {
    id: 'local-run',
    version: '0',
    account: '000000000000',
    time: new Date().toISOString(),
    region: 'eu-west-1',
    resources: [],
    source: 'aws.events',
    'detail-type': 'Scheduled Event',
    detail: {},
  };

  const context: Context = {
    callbackWaitsForEmptyEventLoop: true,
    functionName: 'image-embedder-backfiller-DEV',
    functionVersion: '$LATEST',
    invokedFunctionArn:
      'arn:aws:lambda:eu-west-1:000000000000:function:image-embedder-backfiller-DEV',
    memoryLimitInMB: '512',
    awsRequestId: Math.random().toString(36).substring(7),
    logGroupName: '/aws/lambda/image-embedder-backfiller-DEV',
    logStreamName: new Date().toISOString(),
    getRemainingTimeInMillis: () => 60000,
    done: () => {
    },
    fail: () => {
    },
    succeed: () => {
    },
  };

  await handler(event, context);
  console.log('✓ Handler completed');
}

main().catch((error) => {
  console.error('Failed to run backfiller locally:', error);
  process.exit(1);
});

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down...');
  process.exit(0);
});

