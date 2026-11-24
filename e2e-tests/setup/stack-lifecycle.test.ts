import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setImmediate } from 'node:timers/promises';
import { createStackResources, settleAll } from './stack-lifecycle.ts';

const reporter = {
  step<T>(_name: string, run: () => Promise<T>) { return run(); },
};

test('startup failure keeps the first error and cleans up successful and failed starts', async () => {
  const resources = createStackResources(reporter);
  const stops: string[] = [];
  const failure = new Error('failed to build image');
  const startup = settleAll([
    () => resources.startContainer('slow', async () => {
      await setImmediate();
      return { async stop() { stops.push('slow'); } };
    }, async () => { stops.push('unexpected fallback'); }),
    () => resources.startContainer('partial', async () => {
      await setImmediate();
      throw new Error('failed to copy a file');
    }, async () => { stops.push('partial'); }),
    async () => { throw failure; },
  ]).finally(resources.stopAll);

  await assert.rejects(startup, (error) => error === failure);

  assert.deepEqual(stops.sort(), ['partial', 'slow']);
});

test('interruption preserves the reason when an in-flight check throws AbortError', async () => {
  const startup = new AbortController();
  const exited = new Error('Grid services container exited with status 1');
  const poll = Promise.withResolvers<void>();
  const result = settleAll([() => poll.promise], startup);

  startup.abort(exited);
  poll.reject(new DOMException('The operation was aborted', 'AbortError'));

  await assert.rejects(result, (error) => error === exited);
});

test('stopAll waits for containers before removing the network and counts each failure once', async () => {
  const resources = createStackResources(reporter);
  const stops: string[] = [];
  const finishSlow = Promise.withResolvers<void>();
  const removeFailedStart = async () => { assert.fail('the container started successfully'); };

  await resources.startNetwork(async () => ({
    async stop() { stops.push('network'); throw new Error('network is still attached'); },
  }));
  await resources.startContainer('broken', async () => ({
    async stop() { stops.push('broken'); throw new Error('container failed to stop'); },
  }), removeFailedStart);
  await resources.startContainer('slow', async () => ({
    async stop() { stops.push('slow'); await finishSlow.promise; },
  }), removeFailedStart);

  const stopped = Promise.all([resources.stopAll(), resources.stopAll()]);

  await setImmediate();

  const beforeSlowFinished = [...stops];

  finishSlow.resolve();

  assert.deepEqual(await stopped, [2, 2]);
  assert.deepEqual(beforeSlowFinished.sort(), ['broken', 'slow']);
  assert.deepEqual(stops.slice(beforeSlowFinished.length), ['network']);
});
