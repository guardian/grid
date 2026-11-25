import type { Locator, Page } from '@playwright/test';
import { KAHUNA_APP_URL, expect } from '../setup.ts';

/** The single image view's side panel. */
export const imageInformation = (page: Page): Locator =>
  page.getByRole('complementary', { name: 'Image information' });

export async function openSingleImageView(page: Page, imageId: string): Promise<void> {
  await page.goto(`${KAHUNA_APP_URL}/images/${imageId}`);
  await expect(imageInformation(page)).toBeVisible();
}
