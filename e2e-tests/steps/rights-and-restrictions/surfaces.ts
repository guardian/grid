/**
 * The parts of Kahuna that show an image's rights and restrictions section, so the same steps
 * can run on each. The single image view is covered in depth; the search results panel and
 * the upload editor reuse the same section and editor.
 */
import { randomUUID } from 'node:crypto';
import type { Locator, Page } from '@playwright/test';
import { defineParameterType } from 'playwright-bdd';
import { KAHUNA_APP_URL, expect } from '../setup.ts';
import { oneOf } from '../utils/parameter-types.ts';

export const RIGHTS_SURFACES = ['single image view', 'search results panel', 'upload editor'] as const;
export type RightsSurfaceName = (typeof RIGHTS_SURFACES)[number];

defineParameterType({
  name: 'rightsSurface',
  regexp: oneOf(RIGHTS_SURFACES),
  transformer: (name) => name as RightsSurfaceName,
});

/** An image opened on a surface. The upload editor finds it by the file name it was uploaded with. */
export interface OpenedImage {
  id: string;
  fileName?: string;
}

export interface RightsSurface {
  /** Open `images` on this surface, so its rights section shows all of them. */
  open(page: Page, images: OpenedImage[]): Promise<void>;
  /** The rights and restrictions section; every rights locator is scoped to it. */
  section(page: Page): Locator;
  /**
   * The control that opens the rights editor. Every surface only shows it while the section
   * is hovered, so call `revealEditButton` first.
   */
  editButton(page: Page): Locator;
}

const rightsRegion = (scope: Page | Locator) =>
  scope.getByRole('region', { name: 'Rights and restrictions', exact: true });

// includeHidden so that `toBeHidden` checks the button itself, not that the name is wrong.
const metadataEditButton = (section: Locator) =>
  section.getByRole('button', { name: '✎', exact: true, includeHidden: true });

const singleImageView: RightsSurface = {
  async open(page, [image]) {
    await page.goto(`${KAHUNA_APP_URL}/images/${image.id}`);
    await expect(page.getByRole('complementary', { name: 'Image information' })).toBeVisible();
  },
  section: (page) => rightsRegion(page),
  editButton: (page) => metadataEditButton(rightsRegion(page)),
};

const infoPanel = (page: Page) => page.getByRole('region', { name: 'Image information', exact: true });

const searchResultsPanel: RightsSurface = {
  async open(page, images) {
    // The URL Kahuna's own "share selected images" builds; nonFree keeps paid images listed.
    const ids = images.map(({ id }) => id).join(',');
    await page.goto(`${KAHUNA_APP_URL}/search?nonFree=true&ids=${ids}`);
    const results = page.getByRole('region', { name: 'Matched image search results' });
    // Selecting in order: the panel lists the selection in the order it was made.
    for (const [index, { id }] of images.entries()) {
      const label = page.locator(`label[for="id-${id}-result__select__checkbox--deselect"]`);
      const result = results.locator('.result').filter({ has: label });
      if (index === 0) {
        // The select checkbox is only revealed while its result is hovered.
        await result.hover();
        await results.locator(label).click();
      } else {
        // Once something is selected, Kahuna selects by clicking the image instead.
        await result.locator('ui-preview-image').click();
      }
      await expect(results.locator(`label[for="id-${id}-result__select__checkbox--select"]`)).toBeAttached();
    }
    // The panel can start hidden; Kahuna remembers its state between visits.
    const showPanel = page.getByRole('button', { name: 'Show info panel' });
    if (await showPanel.isVisible()) await showPanel.click();
    await expect(rightsRegion(infoPanel(page))).toBeVisible();
  },
  section: (page) => rightsRegion(infoPanel(page)),
  editButton: (page) => metadataEditButton(rightsRegion(infoPanel(page))),
};

/** The opened image's upload editor, found by the file name its past upload is labelled with. */
const pastUpload = (page: Page) => {
  const [image] = stateOf(page).images;
  const fileName = image?.fileName;
  if (!fileName) throw new Error('No image with an upload file name was opened in the upload editor');
  return page
    .getByRole('region', { name: 'Your past 50 uploads' })
    .getByRole('region', { name: fileName, exact: true });
};
// The editor form shares this label, but is a form rather than a region.
const uploadRights = (page: Page) =>
  pastUpload(page).getByRole('region', { name: 'Image usage rights', exact: true });

const uploadEditor: RightsSurface = {
  async open(page) {
    await page.goto(`${KAHUNA_APP_URL}/upload`);
    await expect(uploadRights(page)).toBeVisible();
  },
  section: uploadRights,
  // Named by its "edit" icon ligature.
  editButton: (page) =>
    uploadRights(page).getByRole('button', { name: 'edit', exact: true, includeHidden: true }),
};

const SURFACES: Record<RightsSurfaceName, RightsSurface> = {
  'single image view': singleImageView,
  'search results panel': searchResultsPanel,
  'upload editor': uploadEditor,
};

interface RightsState {
  surface: RightsSurfaceName;
  images: OpenedImage[];
}

/**
 * The surface a scenario works in and the images it opened, keyed by the scenario's page so
 * the many locator helpers needn't take the test context. Defaults to the single image view.
 * `openOnSurface` records the images before opening them, so surfaces can locate them by it.
 */
const states = new WeakMap<Page, RightsState>();

const stateOf = (page: Page): RightsState => {
  let state = states.get(page);
  if (!state) {
    state = { surface: 'single image view', images: [] };
    states.set(page, state);
  }
  return state;
};

export const useRightsSurface = (page: Page, surface: RightsSurfaceName): void => {
  stateOf(page).surface = surface;
};

export const rightsSurfaceName = (page: Page): RightsSurfaceName => stateOf(page).surface;

export const rightsSurface = (page: Page): RightsSurface => SURFACES[stateOf(page).surface];

/** Hover the rights section, which is what shows its edit button on every surface. */
export async function revealEditButton(page: Page): Promise<void> {
  await rightsSurface(page).section(page).hover();
}

/** Open `images` on the scenario's surface and remember them as the ones being worked on. */
export async function openOnSurface(page: Page, images: OpenedImage[]): Promise<void> {
  stateOf(page).images = images;
  await rightsSurface(page).open(page, images);
}

/** Ids of the images the scenario opened, which the rights section applies to. */
export function openedImageIds(page: Page): string[] {
  const { images } = stateOf(page);
  if (images.length === 0) throw new Error('No image was opened by an earlier step');
  return images.map(({ id }) => id);
}

/** A unique file name for a seeded upload, to find it among the account's past uploads. */
export const uniqueUploadFileName = (): string => `e2e-rights-${randomUUID()}.jpg`;
