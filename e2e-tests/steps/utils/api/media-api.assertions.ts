import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { Page, Response } from '@playwright/test';
import { expect } from '../../setup.ts';

async function getMediaApiUrl(page: Page): Promise<string> {
  const href = await page.locator('link[rel="media-api-uri"]').getAttribute('href');
  if (!href) throw new Error('Kahuna page has no media-api-uri link');
  return href;
}

/** The Grid identifies an image by the SHA-1 of its bytes. */
const mediaIdOf = (imagePath: string) =>
  createHash('sha1').update(readFileSync(imagePath)).digest('hex');

export function waitForMetadataSave(page: Page): Promise<Response> {
  return page.waitForResponse(
    (response) =>
      response.request().method() === 'PUT' &&
      new URL(response.url()).pathname.includes('/metadata'),
  );
}

async function mediaApiRootLinks(page: Page): Promise<string[]> {
  const response = await page.request.get(await getMediaApiUrl(page));
  const { links } = (await response.json()) as { links: { rel: string }[] };
  return links.map((link) => link.rel);
}

export async function expectUploadPermission(page: Page): Promise<void> {
  expect(await mediaApiRootLinks(page)).toContain('loader');
}

export async function expectNoUploadPermission(page: Page): Promise<void> {
  expect(await mediaApiRootLinks(page)).not.toContain('loader');
}

export async function expectNoEditPermission(
  page: Page,
  imagePath: string,
  expectedUploader: string,
): Promise<void> {
  await expectNoEditPermissionForImage(page, mediaIdOf(imagePath), expectedUploader);
}

export async function expectNoEditPermissionForImage(
  page: Page,
  imageId: string,
  expectedUploader: string,
): Promise<void> {
  expect(await imageLinksForUploader(page, imageId, expectedUploader)).not.toContain('edits');
}

export async function expectEditPermissionForImage(
  page: Page,
  imageId: string,
  expectedUploader: string,
): Promise<void> {
  expect(await imageLinksForUploader(page, imageId, expectedUploader)).toContain('edits');
}

async function imageLinksForUploader(
  page: Page,
  imageId: string,
  expectedUploader: string,
): Promise<string[]> {
  const response = await page.request.get(
    `${await getMediaApiUrl(page)}/images/${imageId}`,
  );
  expect(response.ok()).toBeTruthy();
  const { data, links } = (await response.json()) as {
    data: { uploadedBy: string };
    links: { rel: string }[];
  };

  expect(data.uploadedBy).toBe(expectedUploader);
  return links.map((link) => link.rel);
}

/** Kahuna offers undelete from the session's `canDelete` and the image's uploader. */
export async function expectNoDeletePermission(
  page: Page,
  imagePath: string,
  expectedUploader: string,
): Promise<void> {
  const root = await page.request.get(await getMediaApiUrl(page));
  const { links } = (await root.json()) as { links: { rel: string; href: string }[] };
  const sessionLink = links.find((link) => link.rel === 'session');
  if (!sessionLink) throw new Error('Media API root has no session link');
  const session = await page.request.get(sessionLink.href);
  expect(session.ok()).toBeTruthy();
  const {
    data: { user },
  } = (await session.json()) as {
    data: { user: { email: string; permissions: { canDelete: boolean } } };
  };
  expect(user.permissions.canDelete).toBe(false);
  expect(user.email).not.toBe(expectedUploader);

  const image = await page.request.get(
    `${await getMediaApiUrl(page)}/images/${mediaIdOf(imagePath)}`,
  );
  expect(image.ok()).toBeTruthy();
  const { data } = (await image.json()) as {
    data: { uploadedBy: string; softDeletedMetadata?: unknown };
  };
  expect(data.uploadedBy).toBe(expectedUploader);
  expect(data.softDeletedMetadata).toBeDefined();
}

/** Search lags the image's own endpoint, so wait until the upload is findable by uploader. */
export async function expectInUploadHistory(
  page: Page,
  imagePath: string,
  uploadedBy: string,
): Promise<void> {
  const mediaApiUrl = await getMediaApiUrl(page);
  const mediaId = mediaIdOf(imagePath);
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
