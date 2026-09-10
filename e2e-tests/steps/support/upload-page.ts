import { statSync } from 'node:fs';
import * as path from 'node:path';
import type { Page } from '@playwright/test';

declare global {
  interface Window {
    _clientConfig: {
      systemName: string;
      maybeUploadLimitInBytes: number;
    };
  }
}

const FIXTURE_IMAGES = path.join(import.meta.dirname, '..', '..', 'fixtures', 'images');

export interface TestImage {
  fileName: string;
  path: string;
  bytes: number;
}

const testImage = (fileName: string): TestImage => {
  const filePath = path.join(FIXTURE_IMAGES, fileName);
  return { fileName, path: filePath, bytes: statSync(filePath).size };
};

/** Sizes are read from disk so the size-limit scenario can pick a threshold between them. */
export const testImages = {
  smaller: testImage('test-card-f.jpg'),
  larger: testImage('test.jpg'),
};

export const uploadPage = (page: Page) => {
  const prompt = page.getByRole('region', { name: 'File upload' });

  return {
    prompt,
    main: page.getByRole('main', { name: 'Image uploads' }),
    currentUploads: page.getByRole('region', { name: 'Your current uploads' }),
    pastUploads: page.getByRole('region', { name: 'Your past 50 uploads' }),
    dragAndDropUploader: page.getByRole('region', { name: 'Drag and drop uploader' }),
    fileInput: prompt.locator('input[name="files"]'),
    /* The upload and back-to-search controls carry aria-labels that override their visible
       text, so filter on the text the feature file names rather than the accessible name. */
    uploadButton: (label: string) => prompt.getByRole('button').filter({ hasText: label }),
    topBarLink: (label: string) => page.getByRole('banner').getByRole('link').filter({ hasText: label }),
    /** A queued or in-flight upload, before it becomes an editable image. */
    job: (fileName: string) => page.getByRole('region', { name: `${fileName} upload` }),
  };
};
