import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join } from 'node:path';
import { test } from 'node:test';
import { Network } from 'testcontainers';
import { buildImage, startStack } from './stack-containers.ts';
import { createStackDiagnostics } from './stack-diagnostics.ts';

test('an aborted build waits for Docker to exit and keeps its final output', async (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'grid-build-'));
  const originalPath = process.env.PATH;

  t.after(() => {
    if (originalPath === undefined) delete process.env.PATH;
    else process.env.PATH = originalPath;
    rmSync(directory, { recursive: true, force: true });
  });

  writeFileSync(join(directory, 'docker'), String.raw`#!/usr/bin/env node
    process.once('SIGTERM', () => {
      process.stderr.write('build cancelled', () => process.exit(0));
    });
    setTimeout(() => process.exit(2), 5_000);
    process.stdout.write('build started\n');
  `, { mode: 0o700 });
  process.env.PATH = [directory, dirname(process.execPath)].join(delimiter);

  const diagnostics = createStackDiagnostics(directory);
  const startup = new AbortController();
  const failure = new Error('LocalStack failed to start');
  const capture = diagnostics.capture;

  diagnostics.capture = (category, name, stream) => {
    capture(category, name, stream);
    stream.once('data', () => startup.abort(failure));
  };

  await assert.rejects(
    buildImage('imgops', directory, 'grid-imgops', diagnostics, startup.signal),
    (error) => error === failure,
  );

  assert.match(readFileSync(join(diagnostics.directory, 'builds', 'imgops.log'), 'utf8'), /build cancelled/);
});

test('a cleanup failure keeps the original startup error', async (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'grid-cleanup-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));

  const diagnostics = createStackDiagnostics(directory);
  const startup = new AbortController();
  const failure = new Error('Grid startup interrupted');
  t.mock.method(Network.prototype, 'start', async () => {
    startup.abort(failure);
    return { async stop() { throw new Error('Network removal failed'); } };
  });

  await assert.rejects(startStack({}, diagnostics, startup.signal), (error) => error === failure);

  const log = readFileSync(join(diagnostics.directory, 'stack.log'), 'utf8');
  assert.match(log, /cleanup\s+FAILED.*failures=1/);
  assert.match(log, /cleanup:stack\s+FAILED/);
});
