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

const isRequest = (method: string, path: string) => (response: Response) =>
  response.request().method() === method && new URL(response.url()).pathname === path;

/** Whether a response is to the metadata editor saving an image's user metadata. */
export const isMetadataSave = (imageId: string) => isRequest('PUT', `/metadata/${imageId}/metadata`);

/** Whether a response is to the metadata editor saving an image's usage rights. */
export const isUsageRightsSave = (imageId: string) => isRequest('PUT', `/metadata/${imageId}/usage-rights`);

/**
 * Run `save` and check the metadata editor accepted a metadata save for each of `imageIds`.
 * This confirms the requests succeeded, not that thrall has applied them.
 */
export async function expectMetadataSavesAccepted(
  page: Page,
  imageIds: string[],
  save: () => Promise<void>,
): Promise<void> {
  const [responses] = await Promise.all([
    Promise.all(imageIds.map((id) => page.waitForResponse(isMetadataSave(id)))),
    save(),
  ]);
  for (const response of responses) {
    expect(response.ok(), `saving ${response.url()}: ${await response.text()}`).toBeTruthy();
  }
}

/** Run `act` and check the page received no response matching `isUnwanted` meanwhile. */
export async function expectNoResponsesDuring(
  page: Page,
  isUnwanted: (response: Response) => boolean,
  act: () => Promise<void>,
  message: string,
): Promise<void> {
  const unwanted: string[] = [];
  const record = (response: Response) => {
    if (isUnwanted(response)) unwanted.push(response.url());
  };
  page.on('response', record);
  try {
    await act();
  } finally {
    page.off('response', record);
  }
  expect(unwanted, message).toEqual([]);
}

/**
 * Run `save` and check the metadata editor accepted both requests a usage rights save makes:
 * the rights, then the metadata derived from them. This confirms the requests succeeded, not
 * what the server stored as a result.
 */
export async function expectUsageRightsSaveAccepted(
  page: Page,
  imageId: string,
  save: () => Promise<void>,
): Promise<void> {
  const [rights, derivedMetadata] = await Promise.all([
    page.waitForResponse(isUsageRightsSave(imageId)),
    page.waitForResponse(isRequest('POST', `/metadata/${imageId}/metadata/set-from-usage-rights`)),
    save(),
  ]);
  expect(rights.ok(), `saving the rights: ${await rights.text()}`).toBeTruthy();
  expect(derivedMetadata.ok(), `deriving metadata from the rights: ${await derivedMetadata.text()}`)
    .toBeTruthy();
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

/** An image as media-api serves it. Only the fields read here are typed. */
interface MediaApiImage {
  data: { uploadedBy: string; metadata: Record<string, unknown> };
  links: { rel: string }[];
  actions: { name: string }[];
}

async function fetchImage(page: Page, imageId: string): Promise<MediaApiImage> {
  const response = await page.request.get(`${await getMediaApiUrl(page)}/images/${imageId}`);
  expect(response.ok(), `fetching image ${imageId}`).toBeTruthy();
  return (await response.json()) as MediaApiImage;
}

/** The image's metadata as media-api serves it, which reflects an edit once thrall has applied it. */
export async function imageMetadata(page: Page, imageId: string): Promise<Record<string, unknown>> {
  return (await fetchImage(page, imageId)).data.metadata;
}

async function imageLinksForUploader(
  page: Page,
  imageId: string,
  expectedUploader: string,
): Promise<string[]> {
  const { data, links } = await fetchImage(page, imageId);

  expect(data.uploadedBy).toBe(expectedUploader);
  return links.map((link) => link.rel);
}

/** The image's `delete` action is only offered to its uploader or holders of delete_image. */
export async function expectNoDeletePermission(
  page: Page,
  imagePath: string,
  expectedUploader: string,
): Promise<void> {
  const { data, actions } = await fetchImage(page, mediaIdOf(imagePath));

  expect(data.uploadedBy).toBe(expectedUploader);
  expect(actions.map((action) => action.name)).not.toContain('delete');
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
