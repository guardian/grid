import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer, type RequestListener } from 'node:http';
import { test, type TestContext } from 'node:test';
import { setImmediate, setTimeout as delay } from 'node:timers/promises';
import { DescribeTableCommand } from '@aws-sdk/client-dynamodb';
import { createCoreStack, provisioningClients, seedBuckets, seedKclLeaseTable } from './provision.ts';

async function listen(t: TestContext, handleRequest: RequestListener): Promise<string> {
  const server = createServer(handleRequest);
  t.after(() => {
    server.close();
    server.closeAllConnections();
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');

  const address = server.address();
  assert.ok(address && typeof address === 'object');
  return `http://127.0.0.1:${address.port}`;
}

test('aborting startup cancels a stalled S3 upload', { timeout: 5_000 }, async (t) => {
  const startup = new AbortController();
  const endpoint = await listen(t, (request) => {
    // Read the upload without sending a response.
    request.resume();
    request.once('end', () => startup.abort());
  });
  const { s3 } = provisioningClients(endpoint);
  t.after(() => s3.destroy());

  const buckets = { KeyBucket: 'test-keys', ConfigBucket: 'test-config', UsageMailBucket: 'test-usage' };
  await assert.rejects(seedBuckets(s3, buckets, startup.signal), { name: 'AbortError' });
});

test('aborting startup closes a stalled CloudFormation poll', { timeout: 5_000 }, async (t) => {
  const startup = new AbortController();
  const disconnected = Promise.withResolvers<void>();
  const endpoint = await listen(t, async (request, response) => {
    let body = '';
    for await (const chunk of request) body += chunk;

    if (new URLSearchParams(body).get('Action') === 'CreateStack') {
      response.setHeader('Content-Type', 'text/xml');
      response.end(`
        <CreateStackResponse xmlns="http://cloudformation.amazonaws.com/doc/2010-05-15/">
          <CreateStackResult><StackId>test-stack</StackId></CreateStackResult>
        </CreateStackResponse>
      `);
      return;
    }

    response.once('close', disconnected.resolve);
    startup.abort();
  });
  const { cfn } = provisioningClients(endpoint);
  t.after(() => cfn.destroy());

  await Promise.all([
    assert.rejects(createCoreStack(cfn, startup.signal), { name: 'AbortError' }),
    disconnected.promise,
  ]);
});

test('aborting startup stops DynamoDB from polling again', async (t) => {
  const startup = new AbortController();
  const firstPoll = Promise.withResolvers<void>();
  const { dynamo, kinesis } = provisioningClients('http://127.0.0.1:1');
  let polls = 0;
  t.mock.method(dynamo, 'send', async (command: unknown) => {
    if (command instanceof DescribeTableCommand) {
      polls++;
      firstPoll.resolve();
      return { Table: { TableStatus: 'CREATING' } };
    }
    return {};
  });

  const cancelled = assert.rejects(
    seedKclLeaseTable({ dynamo, kinesis, streamName: 'test-table', signal: startup.signal }),
    { name: 'AbortError' },
  );
  await firstPoll.promise;
  await setImmediate();
  startup.abort();
  await cancelled;
  await delay(1_100);

  assert.equal(polls, 1);
});
