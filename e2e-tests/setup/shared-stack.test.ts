import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import https from 'node:https';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { test } from 'node:test';
import { LOCALSTACK_PORT } from './constants.ts';
import { ensureStack, probeStack } from './shared-stack.ts';
import { createStackDiagnostics } from './stack-diagnostics.ts';

test('a 503 or timeout makes the stack unavailable', async (t) => {
  const refused = new TypeError('fetch failed', { cause: Object.assign(new Error(), { code: 'ECONNREFUSED' }) });
  const timeout = new DOMException('Health check timed out', 'TimeoutError');
  const fetch = t.mock.method(globalThis, 'fetch');

  for (const failure of [503, timeout]) {
    fetch.mock.mockImplementation(async (input) => {
      if (Number(new URL(String(input)).port) !== LOCALSTACK_PORT) throw refused;
      if (typeof failure !== 'number') throw failure;
      return new Response(null, { status: failure });
    });

    const { state } = await probeStack();
    assert.equal(state, 'unavailable', String(failure));
  }
});

test('rejects reuse when the OIDC issuer is wrong', async (t) => {
  const previousCI = process.env.CI;
  const previousCA = process.env.NODE_EXTRA_CA_CERTS;

  delete process.env.CI;
  process.env.NODE_EXTRA_CA_CERTS = '/unrelated-ca.pem';
  t.after(() => {
    if (previousCI !== undefined) process.env.CI = previousCI;
    if (previousCA === undefined) delete process.env.NODE_EXTRA_CA_CERTS;
    else process.env.NODE_EXTRA_CA_CERTS = previousCA;
  });
  const directory = await mkdtemp(join(tmpdir(), 'grid-borrow-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const diagnostics = createStackDiagnostics(directory);
  t.mock.method(globalThis, 'fetch', async () => new Response(null, { status: 200 }));
  t.mock.method(https, 'get', (url: URL, options: https.RequestOptions, respond: (body: Readable) => void) => {
    assert.equal(options.rejectUnauthorized, false);
    const body = url.pathname === '/.well-known/openid-configuration' ? '{"issuer":"https://wrong.example"}' : '';
    const response = Object.assign(Readable.from([body]), { statusCode: 200 });
    respond(response);
    return response;
  });

  await assert.rejects(ensureStack(diagnostics, { proxy: true, seed: true }), /expected issuer/);
});
