import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { Page, Response } from '@playwright/test';
import { expect } from '../setup.ts';

async function getMediaApiUrl(page: Page): Promise<string> {
  const mediaApiUrl = await page.locator('link[rel="media-api-uri"]').getAttribute('href');
  if (!mediaApiUrl) {
    throw new Error('Media API URL is missing');
  }
  return mediaApiUrl;
}

export function waitForMetadataSave(page: Page): Promise<Response> {
  return page.waitForResponse(
    (response) =>
      response.request().method() === 'PUT' &&
      new URL(response.url()).pathname.includes('/metadata'),
  );
}

export async function expectUploadPermission(page: Page): Promise<void> {
  const mediaApiUrl = await getMediaApiUrl(page);
  const response = await page.request.get(mediaApiUrl);
  const { links } = (await response.json()) as { links: { rel: string }[] };

  expect(links.map((link) => link.rel)).toContain('loader');
}

export async function expectNoEditPermission(
  page: Page,
  imagePath: string,
  expectedUploader: string,
): Promise<void> {
  const mediaApiUrl = await getMediaApiUrl(page);
  const mediaId = createHash('sha1').update(readFileSync(imagePath)).digest('hex');
  const response = await page.request.get(`${mediaApiUrl}/images/${mediaId}`);
  expect(response.ok()).toBeTruthy();
  const { data, links } = (await response.json()) as {
    data: { uploadedBy: string };
    links: { rel: string }[];
  };

  expect(data.uploadedBy).toBe(expectedUploader);
  expect(links.map((link) => link.rel)).not.toContain('edits');
}

/** Search lags the image's own endpoint, so wait until the upload is findable by uploader. */
export async function expectInUploadHistory(
  page: Page,
  imagePath: string,
  uploadedBy: string,
): Promise<void> {
  const mediaApiUrl = await page.locator('link[rel="media-api-uri"]').getAttribute('href');
  const mediaId = createHash('sha1').update(readFileSync(imagePath)).digest('hex');
  await expect
    .poll(async () => {
      const response = await page.request.get(`${mediaApiUrl}/images`, {
        params: { q: '', uploadedBy, length: 50 },
      });
      const { data } = (await response.json()) as { data: { data: { id: string } }[] };
      return data.map((image) => image.data.id);
    })
    .toContain(mediaId);
}

/** Hold the past-uploads search until the returned function is called. */
export const holdPastUploads = async (page: Page) => {
  let release!: () => void;
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(
    (url) => url.pathname === '/images' && url.searchParams.has('uploadedBy'),
    async (route) => {
      await released;
      await route.continue();
    },
  );
  return release;
};