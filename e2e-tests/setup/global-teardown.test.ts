import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { setImmediate } from 'node:timers/promises';
import globalTeardown from './global-teardown.ts';
import { createStackDiagnostics } from './stack-diagnostics.ts';
import { setEnvironment, trackSetup } from './state.ts';

test('forced exit cleans up only the config it still owns', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'grid-forced-exit-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));

  const moduleUrl = new URL('./config.ts', import.meta.url);
  const child = `
    import { mkdirSync, writeSync } from 'node:fs';
    import { createConfigDirectory } from ${JSON.stringify(moduleUrl.href)};
    const active = createConfigDirectory(console.error);
    const released = createConfigDirectory(console.error);
    await released.remove();
    // Another run can now use this path.
    mkdirSync(released.path);
    writeSync(1, JSON.stringify([active.path, released.path]));
    process.exit(130);
  `;
  const result = spawnSync(process.execPath, ['--experimental-strip-types', '--input-type=module', '--eval', child], {
    env: { ...process.env, TMPDIR: root },
    encoding: 'utf8',
  });

  assert.equal(result.status, 130, result.stderr);

  const [active, released] = JSON.parse(result.stdout);

  assert.equal(existsSync(active), false);
  assert.equal(existsSync(released), true);
});

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
  const disableCoverage = process.env.GRID_DISABLE_COVERAGE;
  const diagnostics = createStackDiagnostics(directory);

  t.after(() => {
    setEnvironment(undefined);
    process.chdir(originalCwd);
    if (disableCoverage === undefined) delete process.env.GRID_DISABLE_COVERAGE;
    else process.env.GRID_DISABLE_COVERAGE = disableCoverage;
    rmSync(directory, { recursive: true, force: true });
  });

  // Run the coverage reporter from an empty directory so it has no data to report.
  process.chdir(directory);
  delete process.env.GRID_DISABLE_COVERAGE;
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
