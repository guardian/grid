import type { Page } from '@playwright/test';
import { TEST_ACCOUNTS } from '../../setup/constants.ts';
import { findSeededImage, hasNoUsageRights } from '../../setup/image-fixtures.ts';
import { KAHUNA_APP_URL, expect } from '../setup.ts';
import type { TestContext } from '../setup.ts';
import { answerDialogs } from './dialogs.ts';

/**
 * The fixture scenarios seed disposable copies of to open in the single image view. It has no
 * usage rights, and no test account uploaded it, so only edit_metadata grants editing it.
 */
export const PLAIN_IMAGE = findSeededImage(
  'with no usage rights, not uploaded by a test account',
  (source) =>
    hasNoUsageRights(source) &&
    !(Object.values(TEST_ACCOUNTS) as unknown[]).includes(source.uploadedBy),
);

export const imageInformation = (page: Page) =>
  page.getByRole('complementary', { name: 'Image information' });

/** Open the single image view of `imageId`, once its metadata panel has rendered. */
export async function openImage(page: Page, imageId: string): Promise<void> {
  await page.goto(`${KAHUNA_APP_URL}/images/${imageId}`);
  await expect(imageInformation(page)).toBeVisible();
}

/** Open the single image view of the image an earlier step seeded, answering its dialogs. */
export async function openSeededImage(page: Page, testContext: TestContext): Promise<void> {
  expect(testContext.imageId, 'no image was seeded by an earlier step').toBeDefined();
  answerDialogs(page, testContext);
  await openImage(page, testContext.imageId!);
}
