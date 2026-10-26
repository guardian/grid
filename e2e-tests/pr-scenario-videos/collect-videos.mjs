#!/usr/bin/env node
// Copy the video of every passing scenario in a Playwright JSON report into one folder,
// named after the feature and scenario, and print a PR description section for them.
// Usage: node collect-videos.mjs <report.json> <out-dir>
import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const [reportPath, outDir] = process.argv.slice(2);
if (!reportPath || !outDir) {
  console.error('Usage: node collect-videos.mjs <report.json> <out-dir>');
  process.exit(1);
}

const slug = (text) => text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const report = JSON.parse(await readFile(reportPath, 'utf8'));
const recordings = [];

function walk(suite, titles) {
  // File-level suites are titled with the generated spec path; skip that from the feature name.
  const own = suite.file && suite.title === suite.file ? [] : [suite.title];
  const chain = [...titles, ...own].filter(Boolean);
  for (const spec of suite.specs ?? []) {
    for (const test of spec.tests ?? []) {
      if (test.projectName === 'auth') continue;
      const passed = (test.results ?? []).find((result) => result.status === 'passed');
      const video = passed?.attachments?.find((a) => a.name === 'video' && a.path);
      if (video) recordings.push({ feature: chain.join(' › '), scenario: spec.title, source: video.path });
    }
  }
  for (const child of suite.suites ?? []) walk(child, chain);
}
for (const suite of report.suites ?? []) walk(suite, []);

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

const lines = [
  '## Scenario recordings',
  '',
  'Playwright videos of each passing scenario in this PR, recorded against the local stack with `GRID_RECORD_VIDEO=true`.',
];
let currentFeature;
for (const [index, recording] of recordings.entries()) {
  const fileName = `${String(index + 1).padStart(2, '0')}-${slug(recording.feature)}--${slug(recording.scenario)}.webm`;
  await copyFile(recording.source, path.join(outDir, fileName));
  if (recording.feature !== currentFeature) {
    currentFeature = recording.feature;
    lines.push('', `### ${recording.feature}`);
  }
  lines.push('', `**${recording.scenario}**`, `<!-- drop ${fileName} on the next line -->`, '');
}

const markdown = `${lines.join('\n').trimEnd()}\n`;
await writeFile(path.join(outDir, 'recordings.md'), markdown);
process.stdout.write(markdown);
console.error(`\n${recordings.length} video(s) copied to ${outDir}`);
