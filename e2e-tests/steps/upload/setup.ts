import { statSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';
import * as path from 'node:path';
import type { Page } from '@playwright/test';
import { KAHUNA_PORT } from '../../setup/constants.ts';
import { TestImage } from '../setup.ts';

declare global {
  interface Window {
    _clientConfig: {
      systemName: string;
      maybeUploadLimitInBytes: number;
    };
  }
}

const FIXTURE_IMAGES = path.join(import.meta.dirname, '..', '..', 'fixtures', 'images');

const testImage = (fileName: string): TestImage => {
  const filePath = path.join(FIXTURE_IMAGES, fileName);
  return { fileName, path: filePath, bytes: statSync(filePath).size };
};

/** Sizes are read from disk so the size-limit scenario can pick a threshold between them. */
export const testImages = {
  smaller: testImage('test-card-f.jpg'),
  larger: testImage('test.jpg'),
};

/** The set that both the file picker and drag-and-drop scenarios upload. */
export const filesToUpload = [testImages.smaller, testImages.larger];

/**
 * An image to import by URL. image-loader fetches the URL itself, so it has to be reachable
 * from inside the stack: Kahuna serves this one unauthenticated, and every service shares a
 * container in the e2e image, so localhost reaches it.
 */
export const gridHostedImageUrl = `http://localhost:${KAHUNA_PORT}/assets/images/blocked-cookies.png`;

/**
 * A JPEG unique to this run. The Grid dedupes by content hash, so a scenario that deletes
 * its image would otherwise poison the shared fixtures and its own re-runs; random trailing
 * bytes change the hash without stopping the image decoding.
 */
export const uniqueImage = (): TestImage => {
  const filePath = path.join(tmpdir(), `upload-e2e-${randomBytes(6).toString('hex')}.jpg`);
  writeFileSync(filePath, Buffer.concat([readFileSync(testImages.smaller.path), randomBytes(16)]));
  return { fileName: path.basename(filePath), path: filePath, bytes: statSync(filePath).size };
};

/** Hold the transfer to the ingest bucket open so a job stays in progress while we assert. */
export const holdIngest = (page: Page, ms = 5_000) =>
  page.route(
    (url) => url.hostname.startsWith('localstack.'),
    async (route) => {
      if (route.request().method() !== 'PUT') return route.fallback();
      await new Promise((resolve) => setTimeout(resolve, ms));
      await route.abort();
    },
  );

/** Reject the transfer to the ingest bucket so the job fails. */
export const failIngest = (page: Page) =>
  page.route(
    (url) => url.hostname.startsWith('localstack.'),
    async (route) => {
      if (route.request().method() !== 'PUT') return route.fallback();
      await route.fulfill({ status: 403, body: 'denied' });
    },
  );

export const uploadPage = (page: Page) => {
  const prompt = page.getByRole('region', { name: 'File upload' });

  return {
    prompt,
    main: page.getByRole('main', { name: 'Image uploads' }),
    currentUploads: page.getByRole('region', { name: 'Your current uploads' }),
    pastUploads: page.getByRole('region', { name: 'Your past 50 uploads' }),
    dragAndDropUploader: page.getByRole('region', { name: 'Drag and drop uploader' }),
    /* The overlay is `position: fixed`, so the <dnd-uploader> wrapper has no box of its own
       and always reads as hidden. Assert visibility against the overlay itself. */
    dropzone: page.getByRole('region', { name: 'Drag and drop uploader' }).locator('.dnd-uploader'),
    fileInput: prompt.locator('input[name="files"]'),
    /* The upload and back-to-search controls carry aria-labels that override their visible
       text, so filter on the text the feature file names rather than the accessible name. */
    uploadButton: (label: string) => prompt.getByRole('button').filter({ hasText: label }),
    topBarLink: (label: string) => page.getByRole('banner').getByRole('link').filter({ hasText: label }),
    /** Any control that takes you off the upload page, wherever it sits on it. */
    leaveLink: (label: string) => page.getByRole('link').filter({ hasText: label }),
    /** A queued or in-flight upload, before it becomes an editable image. */
    job: (fileName: string) => page.getByRole('region', { name: `${fileName} upload` }),
    /** The <li> rows in the current uploads list, whether uploading or completed. */
    currentJobs: page.getByRole('region', { name: 'Your current uploads' }).locator('li.upload-result'),
    /** A finished upload that has become an editable image, scoped to current uploads. */
    editableJob: page
      .getByRole('region', { name: 'Your current uploads' })
      .getByRole('region', { name: 'Image metadata' }),
    /** The delete control on a current upload (labelled "Delete image" for both states). */
    deleteJobButton: page
      .getByRole('region', { name: 'Your current uploads' })
      .getByRole('button', { name: 'Delete image' }),
  };
};
