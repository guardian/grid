import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { provisioningClients, seedBuckets } from './provision.ts';

test('aborting startup cancels a stalled S3 upload', { timeout: 5_000 }, async (t) => {
  const startup = new AbortController();
  const server = createServer((request) => {
    // Read the upload without sending a response.
    request.resume();
    request.once('end', () => startup.abort());
  });
  t.after(() => {
    server.close();
    server.closeAllConnections();
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');

  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const { s3 } = provisioningClients(`http://127.0.0.1:${address.port}`);
  t.after(() => s3.destroy());

  const buckets = { KeyBucket: 'test-keys', ConfigBucket: 'test-config', UsageMailBucket: 'test-usage' };
  await assert.rejects(seedBuckets(s3, buckets, startup.signal), { name: 'AbortError' });
});
