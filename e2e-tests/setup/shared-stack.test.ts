import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LOCALSTACK_PORT } from './constants.ts';
import { probeStack } from './shared-stack.ts';

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
