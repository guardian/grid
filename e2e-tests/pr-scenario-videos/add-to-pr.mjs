#!/usr/bin/env node
// Put a recordings section (from collect-videos.mjs) into a PR description, replacing any earlier one.
// It goes just before "## How should a reviewer test this change?", or at the end if that heading is missing.
// Usage: node add-to-pr.mjs <pr-number> <recordings.md> [owner/repo]
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const [pr, recordingsPath, repo = 'guardian/grid'] = process.argv.slice(2);
if (!pr || !recordingsPath) {
  console.error('Usage: node add-to-pr.mjs <pr-number> <recordings.md> [owner/repo]');
  process.exit(1);
}

const HEADING = '## Scenario recordings';
const NEXT_HEADING = '## How should a reviewer test this change?';

const gh = (...args) => execFileSync('gh', [...args, '-R', repo], { encoding: 'utf8' });
const body = JSON.parse(gh('pr', 'view', pr, '--json', 'body')).body.replace(/\r\n/g, '\n');
const recordings = readFileSync(recordingsPath, 'utf8').trim();

// Drop an earlier recordings section, up to the next level-2 heading.
const withoutOld = body.replace(new RegExp(`${HEADING}\\n[\\s\\S]*?(?=\\n## |$)`), '').replace(/\n{3,}/g, '\n\n');
const at = withoutOld.indexOf(NEXT_HEADING);
const updated = at === -1
  ? `${withoutOld.trimEnd()}\n\n${recordings}\n`
  : `${withoutOld.slice(0, at).trimEnd()}\n\n${recordings}\n\n${withoutOld.slice(at)}`;

const file = path.join(mkdtempSync(path.join(tmpdir(), 'pr-body-')), 'body.md');
writeFileSync(file, updated);
process.stdout.write(gh('pr', 'edit', pr, '--body-file', file));
