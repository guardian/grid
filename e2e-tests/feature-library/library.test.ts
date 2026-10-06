import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, symlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { strToU8, zipSync } from 'fflate';
import { attachResults, createLibrary, decodeReport, parseFeature } from './library.ts';
import type { ReportTest } from './library.ts';
import { createStaticServer } from './serve.ts';

const source = `Feature: Uploads
  Images for the newsroom.
  Background:
    Given I am signed in
  Scenario: Select a file
    When I select an image
    Then it appears
  @todo
  Scenario: Planned upload
    Then it works
`;
/** Takes no inputs; returns a fresh parsed copy of the shared Gherkin fixture. */
const feature = () => parseFeature(source, 'features/upload.feature');
/**
 * @param overrides - Shallow replacements, including whole result arrays when supplied.
 * @returns A fresh report test that otherwise represents one successful recorded upload.
 */
const reportTest = (overrides: Partial<ReportTest> = {}): ReportTest => ({
  testId: 'upload-1', title: 'Select a file', fileName: 'features/upload.feature.spec.js',
  path: ['Uploads'], projectName: 'chromium', outcome: 'expected', duration: 400,
  results: [{ status: 'passed', retry: 0, attachments: [{ contentType: 'video/webm', path: 'data/video.webm' }] }],
  ...overrides,
});
/**
 * @param tests - Test records to put in the summary and detailed file entries.
 * @returns Minimal HTML containing Playwright-shaped ZIP data; referenced media files
 * are created separately by filesystem tests, not embedded in the archive.
 */
const htmlReport = (tests: ReportTest[]): string => {
  const archive = zipSync({
    'report.json': strToU8(JSON.stringify({ startTime: 123, duration: 400, files: [{ fileId: 'file', fileName: 'features/upload.feature.spec.js', tests }] })),
    'file.json': strToU8(JSON.stringify({ tests })),
  });
  return `<template id="playwrightReportBase64">data:application/zip;base64,${Buffer.from(archive).toString('base64')}</template>`;
};

test('parses feature descriptions, inherited backgrounds and planned scenarios', () => {
  const parsed = feature();
  assert.equal(parsed.description, 'Images for the newsroom.');
  assert.equal(parsed.scenarios[0].background[0].text, 'I am signed in');
  assert.deepEqual(parsed.scenarios[1].tags, ['@todo']);
  assert.equal(attachResults(parsed, []).scenarios[1].status, 'planned');
});

test('parses rules, outlines, tables and doc strings with the Gherkin parser', () => {
  const parsed = parseFeature(`@catalogue
Feature: Search
  Background:
    Given a library
  @rule
  Rule: Image search
    Background:
      Given an index
    Scenario Outline: Find <term>
      When I search for "<term>"
      Then I see results
        | name | value |
        | type | image |
      And the response contains
        """
        hello
        """
      Examples: Terms
        | term |
        | cats |
        | dogs |
`, 'features/search.feature');
  const scenario = parsed.scenarios[0];
  assert.deepEqual(scenario.tags, ['@catalogue', '@rule']);
  assert.equal(scenario.background.length, 2);
  assert.deepEqual(scenario.expandedNames, ['Find cats', 'Find dogs']);
  assert.deepEqual(scenario.examples[0].rows, [['cats'], ['dogs']]);
  assert.ok(scenario.steps[1].table);
  assert.deepEqual(scenario.steps[1].table[1], ['type', 'image']);
  assert.equal(scenario.steps[2].docString, 'hello');
});

test('uses exact feature paths and keeps retries and browser projects', () => {
  const tests = [reportTest(), reportTest({ testId: 'other', fileName: 'features/other.feature.spec.js' }), reportTest({
    testId: 'firefox', projectName: 'firefox', outcome: 'flaky', results: [
      { status: 'failed', retry: 0, attachments: [] },
      { status: 'passed', retry: 1, attachments: [] },
    ],
  })];
  const scenario = attachResults(feature(), tests).scenarios[0];
  assert.equal(scenario.status, 'flaky');
  assert.equal(scenario.runs.length, 3);
  assert.equal(scenario.runs[2].retry, 1);
  assert.equal(scenario.runs[2].project, 'firefox');
});

test('does not guess recordings for duplicate scenario names', () => {
  const parsed = parseFeature(`${source}\n  Scenario: Select a file\n    Then another thing happens\n`, 'features/upload.feature');
  assert.equal(attachResults(parsed, [reportTest()]).scenarios[0].status, 'unmatched');
  assert.deepEqual(attachResults(parsed, [reportTest()]).scenarios[0].runs, []);
});

test('decodes the Playwright archive and rejects corrupt or unsupported reports', () => {
  assert.equal(decodeReport(htmlReport([reportTest()])).tests[0].results[0].status, 'passed');
  assert.throws(() => decodeReport('<html></html>'), /archive not found/);
  assert.throws(() => decodeReport('<template id="playwrightReportBase64">data:application/zip;base64,bad</template>'));
  assert.throws(() => parseFeature('not gherkin', 'broken.feature'), /broken.feature/);
});

test('builds without a report and only includes existing videos inside the report', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'grid-feature-library-'));
  try {
    const featuresDir = path.join(root, 'features');
    const reportDir = path.join(root, 'report');
    await mkdir(featuresDir);
    await writeFile(path.join(featuresDir, 'upload.feature'), source);
    const unrecorded = await createLibrary({ featuresDir, reportDir });
    assert.equal(unrecorded.manifest.report, null);
    assert.equal(unrecorded.manifest.features[0].scenarios[0].status, 'not-run');
    await mkdir(path.join(reportDir, 'data'), { recursive: true });
    await writeFile(path.join(reportDir, 'data/video.webm'), 'video');
    await writeFile(path.join(root, 'outside.webm'), 'private');
    await writeFile(path.join(reportDir, 'index.html'), htmlReport([reportTest({ results: [{ status: 'passed', attachments: [
      { contentType: 'video/webm', path: 'data/video.webm' },
      { contentType: 'video/webm', path: 'data/missing.webm' },
      { contentType: 'video/webm', path: '../outside.webm' },
    ] }] })]));
    const recorded = await createLibrary({ featuresDir, reportDir });
    assert.equal(recorded.media.size, 1);
    assert.equal(recorded.warnings.length, 2);
    assert.deepEqual(recorded.manifest.features[0].scenarios[0].runs[0].recordings.map((recording) => recording.available), [true, false, false]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('serves videos with seekable byte ranges and rejects paths outside the site', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'grid-feature-server-'));
  const directory = path.join(root, 'site');
  await mkdir(directory);
  await writeFile(path.join(directory, 'index.html'), '<h1>Library</h1>');
  await writeFile(path.join(directory, 'video.webm'), '0123456789');
  await writeFile(path.join(root, 'private.txt'), 'private');
  await symlink(path.join(root, 'private.txt'), path.join(directory, 'outside.txt'));
  const server = createStaticServer(directory);
  try {
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const base = `http://127.0.0.1:${address.port}`;
    assert.equal(await (await fetch(base)).text(), '<h1>Library</h1>');
    const range = await fetch(`${base}/video.webm`, { headers: { Range: 'bytes=2-5' } });
    assert.equal(range.status, 206);
    assert.equal(range.headers.get('content-range'), 'bytes 2-5/10');
    assert.equal(range.headers.get('content-type'), 'video/webm');
    assert.equal(await range.text(), '2345');
    assert.equal(await (await fetch(`${base}/video.webm`, { headers: { Range: 'bytes=-3' } })).text(), '789');
    assert.equal((await fetch(`${base}/video.webm`, { headers: { Range: 'bytes=100-' } })).status, 416);
    const head = await fetch(`${base}/video.webm`, { method: 'HEAD' });
    assert.equal(head.headers.get('content-length'), '10');
    assert.equal(await head.text(), '');
    assert.equal((await fetch(`${base}/missing`)).status, 404);
    assert.equal((await fetch(`${base}/outside.txt`)).status, 403);
    assert.equal((await fetch(`${base}/%2e%2e%2fprivate.txt`)).status, 403);
    assert.equal((await fetch(base, { method: 'POST' })).status, 405);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(root, { recursive: true, force: true });
  }
});