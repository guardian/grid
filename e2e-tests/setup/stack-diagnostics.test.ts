import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import { finished } from 'node:stream/promises';
import { test } from 'node:test';
import { createStackDiagnostics } from './stack-diagnostics.ts';

test('credentials split across chunks or lines stay out of saved and debug output', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'grid-logs-'));

  t.after(() => rmSync(root, { recursive: true, force: true }));

  const diagnostics = createStackDiagnostics(root, { debug: true });
  const output = t.mock.method(process.stdout, 'write', () => true);

  diagnostics.addSecrets(['private-fixture', 'private-fixture-hidden-extension', 'hidden-key-line-1\nhidden-key-line-2']);

  const stream = new PassThrough();

  diagnostics.capture('containers', 'grid', stream);
  stream.write('token=private-');
  stream.write('fixture-hidden-extension\nAuthorization: Bearer hidden-auth\n');
  stream.end('hidden-key-line-1\nhidden-key-line-2');

  await finished(stream);

  const file = readFileSync(join(diagnostics.directory, 'containers/grid.log'), 'utf8');
  const terminal = output.mock.calls.map((call) => call.arguments[0]).join('');

  for (const text of [file, terminal]) {
    assert.match(text, /token=\[REDACTED\]/);
    assert.match(text, /Authorization: \[REDACTED\]/);
    assert.doesNotMatch(text, /private-fixture|hidden-/);
  }
});

test('an unwritable log directory preserves the original failure and redacts its report', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'grid-logs-'));

  t.after(() => rmSync(root, { recursive: true, force: true }));

  const file = join(root, 'ordinary-file');

  writeFileSync(file, '');

  const warnings = t.mock.method(console, 'error', () => { });
  const output = t.mock.method(console, 'log', () => { });
  const diagnostics = createStackDiagnostics(file);

  diagnostics.addSecrets(['private-fixture']);

  const failure = new Error('build failed: private-fixture', { cause: new Error('original cause') });

  await assert.rejects(diagnostics.step('build', async () => { throw failure; }), (error) => error === failure);

  assert.equal(warnings.mock.callCount(), 1);

  const report = output.mock.calls.map((call) => call.arguments[0]).join('\n');

  assert.match(report, /original cause/);
  assert.doesNotMatch(report, /private-fixture/);
});
