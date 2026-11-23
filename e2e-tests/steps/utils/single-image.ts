import type { Page } from '@playwright/test';
import { KAHUNA_APP_URL, expect } from '../setup.ts';

export const imageInformation = (page: Page) =>
  page.getByRole('complementary', { name: 'Image information' });

/** Open the single image view of `imageId`, once its metadata panel has rendered. */
export async function openImage(page: Page, imageId: string): Promise<void> {
  await page.goto(`${KAHUNA_APP_URL}/images/${imageId}`);
  await expect(imageInformation(page)).toBeVisible();
}
