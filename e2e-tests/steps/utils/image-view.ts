import type { Locator, Page } from '@playwright/test';
import { KAHUNA_APP_URL, expect } from '../setup.ts';

/** The single image view's side panel. */
export const imageInformation = (page: Page): Locator =>
  page.getByRole('complementary', { name: 'Image information' });

export async function openSingleImageView(page: Page, imageId: string): Promise<void> {
  await page.goto(`${KAHUNA_APP_URL}/images/${imageId}`);
  await expect(imageInformation(page)).toBeVisible();
}

/** A metadata section's ✎ button, which is display:none until the section is hovered. */
const editButtonIn = (section: Locator): Locator =>
  section.getByRole('button', { name: '✎', includeHidden: true });

/** Hover `section`, as a user must for Kahuna to reveal its ✎ button, and return that button. */
export async function revealEditButton(section: Locator): Promise<Locator> {
  await section.hover();
  return editButtonIn(section);
}
