import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import type { Server } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { chromium, expect } from '@playwright/test';
import { outputDir } from './build.ts';
import { createStaticServer } from './serve.ts';
import type { LibraryManifest, Run, ScenarioDefinition } from './types.ts';

function fixtureManifest(): LibraryManifest {
  const definition: ScenarioDefinition = {
    id: 'recorded', name: 'An authorised user sees the upload tools',
    description: 'Images & rights <script> stay readable.', line: 10, rule: '', tags: [],
    background: [{ keyword: 'Given', text: 'the application stack is running' }],
    steps: [
      { keyword: 'When', text: 'the upload page loads' },
      { keyword: 'Then', text: 'I should see my past 50 uploads', table: [['type', 'image']], docString: '<script>not executable</script>' },
    ],
    examples: [{ name: 'Images', headers: ['type'], rows: [['image']] }],
  };
  const run: Run = {
    id: 'attempt-0', name: definition.name, project: 'chromium', retry: 0, status: 'failed',
    outcome: 'flaky', duration: 1200, startedAt: '2026-10-05T12:00:00Z',
    recordings: [{ available: true, contentType: 'video/webm', src: 'media/recording.webm' }],
  };
  return {
    generatedAt: '2026-10-05T12:00:00Z', report: { startedAt: 1791201600000, duration: 1200 },
    features: [
      {
        id: 'uploads', name: 'Uploading images', description: 'Images for the newsroom.', file: 'features/upload.feature',
        scenarios: [
          { ...definition, status: 'flaky', runs: [run, { ...run, id: 'attempt-1', project: 'firefox', retry: 1, status: 'passed' }] },
          { ...definition, id: 'failed', name: 'A failed upload', status: 'failed', runs: [{ ...run, id: 'failed-0', outcome: 'unexpected' }] },
          { ...definition, id: 'planned', name: 'A planned upload', tags: ['@todo'], status: 'planned', runs: [] },
        ],
      },
      {
        id: 'availability', name: 'Service availability', description: '', file: 'features/availability.feature',
        scenarios: [{ ...definition, id: 'healthcheck', name: 'Healthcheck responds OK', status: 'not-run', runs: [] }],
      },
    ],
  };
}

test('React viewer preserves navigation, filters, playback and responsive layout', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'grid-react-viewer-'));
  const browser = await chromium.launch({ headless: true });
  let server: Server | undefined;
  try {
    const directory = path.join(root, 'site');
    await mkdir(path.join(directory, 'media'), { recursive: true });
    await Promise.all(['index.html', 'app.js', 'styles.css', 'grid-logo.svg'].map((file) => cp(path.join(outputDir, file), path.join(directory, file))));
    await cp(path.join(outputDir, 'fonts'), path.join(directory, 'fonts'), { recursive: true });
    const manifest = fixtureManifest();
    await writeFile(path.join(directory, 'library.json'), JSON.stringify(manifest));

    const captureContext = await browser.newContext({ recordVideo: { dir: path.join(root, 'capture'), size: { width: 1280, height: 720 } } });
    const capturePage = await captureContext.newPage();
    await capturePage.setContent('<main style="background:#e8f1ec;padding:40px;font-size:30px"><h1>Feature library</h1><p>Playback fixture</p></main>');
    await capturePage.locator('main').evaluate(async (element) => {
      await element.animate([{ opacity: 0.5 }, { opacity: 1 }], { duration: 600 }).finished;
    });
    const video = capturePage.video();
    assert.ok(video);
    await captureContext.close();
    await cp(await video.path(), path.join(directory, 'media/recording.webm'));

    server = createStaticServer(directory);
    await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const base = `http://127.0.0.1:${address.port}`;
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(base);
    await expect(page.locator('.scenario-item')).toHaveCount(4);
    await expect(page.locator('.brand')).toHaveText('');
    await expect(page.locator('.brand img')).toHaveAttribute('src', 'grid-logo.svg');
    await expect.poll(() => page.locator('.brand img').evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth === 32)).toBe(true);
    await expect(page.locator('.intro .eyebrow')).toHaveCSS('font-size', '10px');
    await expect(page.locator('.intro h1')).toHaveCSS('font-size', '26px');
    await expect(page.locator('.total strong').first()).toHaveCSS('font-size', '27px');
    await expect(page.locator('.total span').first()).toHaveCSS('font-size', '11px');
    assert.deepEqual(await page.locator('main > section').evaluateAll((sections) => sections.map((section) => section.className)), ['specification', 'recording-section']);
    await expect(page.getByText('Run details', { exact: true })).toHaveCount(0);
    await expect(page.locator('html')).toHaveCSS('color-scheme', 'dark');
    await expect(page.locator('main')).toHaveCSS('background-color', 'rgb(51, 51, 51)');
    await expect(page.locator('.search')).toHaveCSS('background-color', 'rgb(68, 68, 68)');
    await expect(page.locator('main')).toHaveCSS('color', 'rgb(204, 204, 204)');
    await expect(page.locator('.step-keyword').first()).toHaveCSS('color', 'rgb(0, 173, 238)');
    await expect(page.locator('h2')).toHaveCSS('font-family', '"Open Sans", sans-serif');
    await expect(page.locator('.badge')).toHaveCSS('font-size', '14px');
    await expect(page.locator('.scenario-name').first()).toHaveCSS('font-size', '16.8px');
    await expect(page.locator('.subtle').first()).toHaveCSS('font-size', '15.4px');
    assert.ok(await page.evaluate(async () => {
      const faces = await document.fonts.load('400 14px "Open Sans"');
      const semibold = await document.fonts.load('600 14px "Open Sans"');
      return faces.length > 0 && semibold.length > 0 && [...faces, ...semibold].every((face) => face.status === 'loaded');
    }));
    await expect(page.locator('.badge')).toHaveText('Flaky');
    await expect(page.locator('.scenario-description')).toHaveText('Images & rights <script> stay readable.');
    const originalUrl = page.url();
    const player = page.locator('video');
    await player.evaluate((element: HTMLVideoElement) => element.play());
    await expect.poll(() => player.evaluate((element: HTMLVideoElement) => element.currentTime)).toBeGreaterThan(0.1);
    await player.evaluate((element: HTMLVideoElement) => { element.pause(); element.currentTime = element.duration / 2; });
    await expect.poll(() => player.evaluate((element: HTMLVideoElement) => element.seeking)).toBe(false);
    await page.getByLabel('Playback speed').selectOption('1.5');
    assert.equal(await player.evaluate((element: HTMLVideoElement) => element.playbackRate), 1.5);
    await page.getByLabel('Recording attempt').selectOption('0');
    await expect(page.getByLabel('Recording attempt')).toHaveValue('0');
    await page.locator('.background summary').click();
    await expect(page.locator('.background .steps')).toBeVisible();

    for (const [filter, count] of [['failed', 1], ['planned', 1], ['recorded', 2], ['unrecorded', 2]] as const) {
      await page.getByLabel('Filter by status').selectOption(filter);
      await expect(page.locator('.scenario-item')).toHaveCount(count);
    }
    await page.getByLabel('Filter by status').selectOption('all');
    await page.getByLabel('Search scenarios').fill('no-matching-scenario');
    await expect(page.locator('.scenario-item')).toHaveCount(0);
    await page.getByRole('button', { name: 'Clear filters' }).click();
    await expect(page.locator('.scenario-item')).toHaveCount(4);
    await page.getByLabel('Search scenarios').fill('past 50 uploads');
    await expect(page.locator('.scenario-item')).toHaveCount(4);
    await page.getByLabel('Search scenarios').fill('');
    await page.getByLabel('Filter by feature').selectOption('availability');
    await expect(page.locator('.scenario-item')).toHaveCount(1);
    await expect(page.getByRole('heading', { name: 'No video captured' })).toBeVisible();
    await page.goto(originalUrl);
    await expect(page.locator('.badge')).toHaveText('Flaky');
    await page.getByRole('button', { name: 'Next scenario' }).click();
    await expect(page.locator('.badge')).toHaveText('Failed');
    await page.goBack();
    await expect(page.locator('.badge')).toHaveText('Flaky');
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.getByRole('button', { name: 'Copy scenario link' }).click();
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), page.url());
    const download = page.waitForEvent('download');
    await page.getByRole('link', { name: 'Download recording' }).click();
    assert.equal((await download).suggestedFilename(), 'recording.webm');

    for (const width of [1440, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `Overflow at ${width}px`);
      if (width < 761) {
        await expect(page.locator('.intro h1')).toHaveCSS('font-size', width < 381 ? '22px' : '24px');
        await expect(page.locator('.total strong').first()).toHaveCSS('font-size', '21px');
        await expect(page.locator('.total span').first()).toHaveCSS('font-size', '10px');
        await expect.poll(() => page.locator('[aria-current="true"]').evaluate((element) => {
          const bounds = element.getBoundingClientRect();
          const parent = element.parentElement!.getBoundingClientRect();
          return bounds.left >= parent.left && bounds.right <= parent.right;
        })).toBe(true);
      }
    }
    await page.getByRole('button', { name: 'Next scenario' }).click();
    await expect(page.locator('.badge')).toHaveText('Failed');
    await page.route('**/library.json', (route) => route.fulfill({ status: 503, body: 'Unavailable' }));
    await page.reload();
    await expect(page.getByRole('heading', { name: 'The library is unavailable' })).toBeVisible();
    await page.unroute('**/library.json');
    await page.getByRole('button', { name: 'Retry' }).click();
    await expect(page.locator('.scenario-item')).toHaveCount(4);
    assert.deepEqual(errors, []);
  } finally {
    if (server) {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server!.close(() => resolve()));
    }
    await browser.close();
    await rm(root, { recursive: true, force: true });
  }
});