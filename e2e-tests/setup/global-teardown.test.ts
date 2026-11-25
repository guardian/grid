import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { setImmediate } from 'node:timers/promises';
import globalTeardown from './global-teardown.ts';
import { createStackDiagnostics } from './stack-diagnostics.ts';
import { setEnvironment, trackSetup } from './state.ts';

test('teardown waits for interrupted setup', async () => {
  const setup = Promise.withResolvers<void>();
  const interrupted = new Error('Grid startup interrupted');
  const setupFailed = assert.rejects(trackSetup(setup.promise), (error) => error === interrupted);
  let teardownFinished = false;
  const teardown = globalTeardown().then(() => { teardownFinished = true; });

  await setImmediate();

  try {
    assert.equal(teardownFinished, false);
  } finally {
    setup.reject(interrupted);
    await Promise.all([setupFailed, teardown]);
  }
});

test('keeps the coverage error when cleanup also fails', async (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'grid-coverage-'));
  const originalCwd = process.cwd();
  const enableCoverage = process.env.GRID_ENABLE_COVERAGE;
  const diagnostics = createStackDiagnostics(directory);

  t.after(() => {
    setEnvironment(undefined);
    process.chdir(originalCwd);
    if (enableCoverage === undefined) delete process.env.GRID_ENABLE_COVERAGE;
    else process.env.GRID_ENABLE_COVERAGE = enableCoverage;
    rmSync(directory, { recursive: true, force: true });
  });

  // Run the coverage reporter from an empty directory so it has no data to report.
  process.chdir(directory);
  process.env.GRID_ENABLE_COVERAGE = 'true';
  const stop = t.mock.fn(async () => {
    throw new Error('container stop failed');
  });
  setEnvironment({
    diagnostics,
    baseUrl: 'http://localhost',
    mediaApiUrl: 'http://localhost',
    stop,
  });

  await assert.rejects(globalTeardown(), /Grid e2e coverage failed/);

  const log = readFileSync(join(diagnostics.directory, 'stack.log'), 'utf8');

  assert.match(log, /No browser coverage generated/);
  assert.match(log, /container stop failed/);
  assert.equal(stop.mock.callCount(), 1);
});
