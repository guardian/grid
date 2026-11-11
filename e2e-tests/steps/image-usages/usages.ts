/**
 * Usages to seed onto image copies, and locators for the single image view's Usages tab.
 *
 * Usages are stored on the image in Elasticsearch under a strict mapping
 * (common-lib lib/elasticsearch/Mappings.scala `usagesMapping`), and media-api must be able to
 * read them back (common-lib model/usage). A usage it can't read makes the whole image
 * unreadable, which Kahuna shows as a missing image, so build usages here rather than inline.
 */
import { randomBytes, randomUUID } from 'node:crypto';
import type { Locator, Page } from '@playwright/test';
import { KAHUNA_APP_URL, expect } from '../setup.ts';
import type { SeedImage } from '../setup.ts';
import { findSeededImage, hasNoUsageRights } from '../../setup/image-fixtures.ts';

export type UsagePlatform = 'print' | 'digital' | 'syndication' | 'download' | 'derivative' | 'replaced';
export type UsageStatus =
  | 'pending' | 'published' | 'removed' | 'syndicated' | 'downloaded'
  | 'derivative' | 'replaced' | 'failed' | 'unknown';
export type UsageReferenceType = 'indesign' | 'frontend' | 'composer' | 'syndication' | 'front' | 'download' | 'grid';

export interface UsageReference {
  type: UsageReferenceType;
  uri?: string;
  name?: string;
}

/** A usage as stored on an image, less `media`, which is set to the seeded copy's id. */
export interface SeedUsage {
  id: string;
  platform: UsagePlatform;
  status: UsageStatus;
  references: UsageReference[];
  dateAdded: string;
  lastModified: string;
  frontUsageMetadata?: { addedBy: string; front: string };
  downloadUsageMetadata?: { downloadedBy: string };
  childUsageMetadata?: { addedBy: string; childMediaId: string };
}

type UsageFields = Pick<SeedUsage, 'platform' | 'status'> &
  Partial<Omit<SeedUsage, 'id' | 'lastModified' | 'platform' | 'status'>>;

const ADDED_BY = 'e2e-user@guardian.co.uk';

export const daysAgo = (days: number): string => new Date(Date.now() - days * 86_400_000).toISOString();

export function usage(fields: UsageFields): SeedUsage {
  const dateAdded = fields.dateAdded ?? daysAgo(1);
  return { id: randomUUID(), references: [], ...fields, dateAdded, lastModified: dateAdded };
}

/** A digital usage titled by its frontend reference's `name`. */
export const digitalUsage = (name: string, fields: Partial<UsageFields> = {}): SeedUsage =>
  usage({ platform: 'digital', status: 'published', references: [{ type: 'frontend', name }], ...fields });

/** Front usages are digital with an `unknown` status (usage MediaUsageBuilder). */
export const frontUsage = (front: string, addedBy: string): SeedUsage =>
  usage({ platform: 'digital', status: 'unknown', frontUsageMetadata: { front, addedBy } });

export const downloadUsage = (downloadedBy: string): SeedUsage =>
  usage({ platform: 'download', status: 'downloaded', downloadUsageMetadata: { downloadedBy } });

/** Kahuna expects every replaced usage to name the image that replaced it. */
export const childUsage = (status: 'derivative' | 'replaced'): SeedUsage =>
  usage({
    platform: status,
    status,
    childUsageMetadata: { addedBy: ADDED_BY, childMediaId: randomBytes(20).toString('hex') },
  });

/** A usage with `status`, shaped as the usage service records that status. */
export function usageWithStatus(status: UsageStatus): SeedUsage {
  switch (status) {
    case 'unknown':
      return frontUsage('uk', ADDED_BY);
    case 'downloaded':
      return downloadUsage(ADDED_BY);
    case 'derivative':
    case 'replaced':
      return childUsage(status);
    default:
      return digitalUsage(`A ${status} story`, { status });
  }
}

/** The heading Kahuna gives each status's group (gr-image-usage.js `usageTypeToName`). */
const STATUS_HEADINGS: Partial<Record<UsageStatus, string>> = {
  removed: 'Taken down',
  pending: 'Pending publication',
  published: 'Published',
  downloaded: 'Downloads',
  unknown: 'Front',
};
export const statusHeading = (status: UsageStatus): string => STATUS_HEADINGS[status] ?? status;

const SOURCE_IMAGE = findSeededImage('with no usage rights category', hasNoUsageRights)._source;

/** Index a copy of a seeded image with `usages` and open its single image view. */
export async function openImageWithUsages(page: Page, seedImage: SeedImage, usages: SeedUsage[]): Promise<void> {
  const id = await seedImage(SOURCE_IMAGE, (mediaId) => ({ usages: usages.map((u) => ({ ...u, media: mediaId })) }));
  await page.goto(`${KAHUNA_APP_URL}/images/${id}`);
  await expect(page.getByRole('complementary', { name: 'Image information' })).toBeVisible();
}

// The tab's radio input is hidden; its label is what the user sees and clicks.
export const usagesTab = (page: Page): Locator =>
  page.locator('gr-radio-list label').filter({ hasText: 'Usages' });
// getByLabel doesn't reach the display:none input; gr-radio-list ids it `{gr-for}-{key}`.
export const usagesTabInput = (page: Page): Locator => page.locator('#tabs-usages');

export const usagesPanel = (page: Page): Locator => page.locator('gr-image-usage');
export const usageGroupToggles = (page: Page): Locator =>
  usagesPanel(page).locator('gr-image-usage-list').getByRole('button');
export const usageRecords = (page: Page): Locator => usagesPanel(page).locator('.gr-image-usage__record');

export const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Matches a group toggle's text, e.g. "expand_more Published (2)". */
export const groupHeading = (heading: string, count: number | string = '\\d+'): RegExp =>
  new RegExp(`(^|\\s)${escapeRegExp(heading)} \\(${count}\\)`);
