import type { Dialog, Page } from '@playwright/test';
import { Given, When, Then, expect } from '../setup.ts';
import type { SeedImage } from '../setup.ts';
import { TEST_ACCOUNTS } from '../../setup/constants.ts';
import { updateImageCopy } from '../../setup/seed-image.ts';
import { switchAccount } from '../utils/auth.ts';
import { setTestClientConfig } from '../utils/test-config.ts';
import {
  ADDED_BY,
  childUsage,
  daysAgo,
  digitalUsage,
  downloadUsage,
  escapeRegExp,
  frontUsage,
  groupHeading,
  openImageWithUsages,
  photoSalesPanel,
  recordsIn,
  statusHeading,
  storedUsages,
  syndicationUsage,
  usage,
  usageGroup,
  usageGroupToggles,
  usageRecords,
  usagesPanel,
  usagesTab,
  usagesTabInput,
  usageWithStatus,
} from './usages.ts';
import type { SeedUsage, UsagePlatform, UsageReferenceType, UsageStatus } from './usages.ts';

interface SeedFixtures {
  page: Page;
  seedImage: SeedImage;
  testContext: { usages?: SeedUsage[]; usagesImageId?: string; usageGroup?: UsageStatus };
}

/** Choose the usages the image will have; `group` is the one "that usage group" means. */
function setUsages(testContext: SeedFixtures['testContext'], usages: SeedUsage[], group?: UsageStatus): void {
  const statuses = new Set(usages.map((u) => u.status));
  testContext.usages = usages;
  testContext.usageGroup = group ?? (statuses.size === 1 ? usages[0].status : undefined);
}

/** Index a copy of an image with the chosen usages and open its single image view. */
async function openImage({ page, seedImage, testContext }: SeedFixtures): Promise<void> {
  expect(testContext.usages, "an earlier step chose the image's usages").toBeDefined();
  testContext.usagesImageId = await openImageWithUsages(page, seedImage, testContext.usages!);
}

const storyUsages = (count: number): SeedUsage[] =>
  Array.from({ length: count }, (_, i) => digitalUsage(`Story ${i + 1}`));

function theSeededUsage(usages: SeedUsage[] | undefined): SeedUsage {
  expect(usages, 'an earlier step seeded exactly one usage').toHaveLength(1);
  return usages![0];
}

/** The only usage record shown; strict mode fails the step if there are more. */
const theUsage = usageRecords;

// Controls are found by visible text: the delete control's accessible name is "Delete image".
const usagesControl = (page: Page, text: string) =>
  usagesPanel(page).getByRole('button').filter({ hasText: text });

const DATE_ADDED_DAYS_AGO = 3;

// ---------------------------------------------------------------------------
// Choosing the image's usages
// ---------------------------------------------------------------------------

Given('the image has {int} usages', async ({ testContext }, count: number) => {
  setUsages(testContext, storyUsages(count));
});

Given('the image has no usages', async ({ testContext }) => {
  setUsages(testContext, []);
});

Given('the image has at least one usage', async ({ testContext }) => {
  setUsages(testContext, [digitalUsage('A published story')]);
});

Given('the image has usages with more than one status', async ({ testContext }) => {
  const usages = (['published', 'pending', 'published', 'removed'] as const).map(usageWithStatus);
  setUsages(testContext, usages);
});

Given('the image has a usage with the {string} status', async ({ testContext }, status: string) => {
  setUsages(testContext, [usageWithStatus(status as UsageStatus)]);
});

Given(
  'the image has pending, published, unknown, removed, downloaded and replaced usages',
  async ({ testContext }) => {
    // Seeded out of order, so the page has to sort them.
    const statuses = ['replaced', 'downloaded', 'removed', 'unknown', 'published', 'pending'] as const;
    setUsages(testContext, statuses.map(usageWithStatus));
  },
);

Given('a usage group contains usages added on different dates', async ({ testContext }) => {
  const usages = [
    digitalUsage('Middle story', { dateAdded: daysAgo(5) }),
    digitalUsage('Oldest story', { dateAdded: daysAgo(10) }),
    digitalUsage('Newest story', { dateAdded: daysAgo(1) }),
  ];
  setUsages(testContext, usages);
});

Given(
  'the image has a front usage on the {string} front added by {string}',
  async ({ testContext }, front: string, addedBy: string) => {
    setUsages(testContext, [frontUsage(front, addedBy)]);
  },
);

Given(
  'the image has a download usage downloaded by {string}',
  async ({ testContext }, downloadedBy: string) => {
    setUsages(testContext, [downloadUsage(downloadedBy)]);
  },
);

Given(
  'a usage on the {string} platform has a {string} reference named {string}',
  async ({ testContext }, platform: string, reference: string, name: string) => {
    setUsages(testContext, [
      usage({
        platform: platform as UsagePlatform,
        status: 'published',
        references: [{ type: reference as UsageReferenceType, name }],
      }),
    ]);
  },
);

Given(
  'a usage on the {string} platform has no named {string} reference',
  async ({ testContext }, platform: string, reference: string) => {
    setUsages(testContext, [
      usage({
        platform: platform as UsagePlatform,
        status: 'published',
        references: [{ type: reference as UsageReferenceType }],
      }),
    ]);
  },
);

Given(
  'a usage has the {string} status with child usage metadata',
  async ({ testContext }, status: string) => {
    setUsages(testContext, [childUsage(status as 'derivative' | 'replaced')]);
  },
);

Given('a usage was made on the {string} platform', async ({ testContext }, platform: string) => {
  setUsages(testContext, [usage({ platform: platform as UsagePlatform, status: 'published' })]);
});

Given('a usage was added within the last seven days', async ({ testContext }) => {
  setUsages(testContext, [digitalUsage('A recent story', { dateAdded: daysAgo(2) })]);
});

Given('a usage was added more than seven days ago', async ({ testContext }) => {
  setUsages(testContext, [digitalUsage('An older story', { dateAdded: daysAgo(30) })]);
});

Given('a usage has a date added', async ({ testContext }) => {
  setUsages(testContext, [digitalUsage('A dated story', { dateAdded: daysAgo(DATE_ADDED_DAYS_AGO) })]);
});

Given(
  'a usage has a {string} reference and a {string} reference',
  async ({ testContext }, first: string, second: string) => {
    const references = [first, second].map((type) => ({
      type: type as UsageReferenceType,
      uri: `https://${type}.example.com/e2e-story`,
    }));
    setUsages(testContext, [
      digitalUsage('A referenced story', { references: [{ ...references[0], name: 'A referenced story' }, references[1]] }),
    ]);
  },
);

Given(
  'a usage has a {string} reference with no URI',
  async ({ testContext }, reference: string) => {
    setUsages(testContext, [
      digitalUsage('An unlinked story', { references: [{ type: reference as UsageReferenceType, name: 'An unlinked story' }] }),
    ]);
  },
);

// Kahuna collapses a group of more than ten usages, unless it's the only group.
Given(
  'the image has more than ten usages in a group alongside other groups',
  async ({ testContext }) => {
    setUsages(testContext, [...storyUsages(11), usageWithStatus('pending')], 'published');
  },
);

Given(
  'the image has ten or fewer usages in a group alongside other groups',
  async ({ testContext }) => {
    setUsages(testContext, [...storyUsages(10), usageWithStatus('pending')], 'published');
  },
);

Given('the image has more than ten usages, all with the same status', async ({ testContext }) => {
  setUsages(testContext, storyUsages(11));
});

Given(
  'the image has more than ten downloaded usages and one published usage',
  async ({ testContext }) => {
    const downloads = Array.from({ length: 11 }, (_, i) => downloadUsage(`downloader-${i + 1}@guardian.co.uk`));
    setUsages(testContext, [...downloads, usageWithStatus('published')], 'downloaded');
  },
);

Given(
  'the image has a syndication usage with the {string} partner',
  async ({ testContext }, partner: string) => {
    setUsages(testContext, [syndicationUsage(partner, { dateAdded: daysAgo(DATE_ADDED_DAYS_AGO) })]);
  },
);

Given('the image has a syndication usage', async ({ testContext }) => {
  setUsages(testContext, [syndicationUsage('e2e-partner')]);
});

Given('the image has no Capture syndication usage', async ({ testContext }) => {
  setUsages(testContext, [syndicationUsage('e2e-partner')]);
});

Given(
  'the image has published, downloaded, replaced and derivative usages',
  async ({ testContext }) => {
    const statuses = ['published', 'downloaded', 'replaced', 'derivative'] as const;
    setUsages(testContext, statuses.map(usageWithStatus));
  },
);

Given('the send to Photo Sales feature is {word}', async ({ page }, state: string) => {
  expect(['enabled', 'disabled']).toContain(state);
  await setTestClientConfig(page, { showSendToPhotoSales: state === 'enabled' });
});

// ---------------------------------------------------------------------------
// Permissions, and opening the image
// ---------------------------------------------------------------------------

// The saved session is the full-access account, which can delete usages.
Given('I have delete usages permission', async () => {});

Given('I do not have delete usages permission', async ({ page }) => {
  await switchAccount(page, TEST_ACCOUNTS.restricted);
});

When('I open the image', async ({ page, seedImage, testContext }) => {
  await openImage({ page, seedImage, testContext });
});

When("I view the image's usages", async ({ page, seedImage, testContext }) => {
  await openImage({ page, seedImage, testContext });
  // The tab stays disabled until Kahuna has counted the image's usages.
  await expect(usagesTabInput(page)).toBeEnabled();
  await usagesTab(page).click();
  await expect(usagesTabInput(page)).toBeChecked();
});

Then('the Usages tab is labelled {string}', async ({ page }, label: string) => {
  // The label holds a full and a minimal version of its text; CSS shows one per viewport.
  await expect(usagesTab(page).getByText(label, { exact: true }).filter({ visible: true })).toBeVisible();
});

Then('the Usages tab is disabled', async ({ page }) => {
  await expect(usagesTabInput(page)).toBeDisabled();
});

// ---------------------------------------------------------------------------
// Usage groups
// ---------------------------------------------------------------------------

Then('I see one usage group per status', async ({ page, testContext }) => {
  await expectGroupsFor(page, testContext.usages);
});

Then("all of the image's usage groups are shown", async ({ page, testContext }) => {
  await expectGroupsFor(page, testContext.usages);
});

async function expectGroupsFor(page: Page, usages: SeedUsage[] | undefined) {
  const statuses = new Set(usages?.map((u) => u.status));
  await expect(usageGroupToggles(page)).toHaveCount(statuses.size);
  for (const status of statuses) {
    await expect.soft(usageGroup(page, status)).toHaveCount(1);
  }
}

Then(
  'each group is headed with the status name and the number of usages in it',
  async ({ page, testContext }) => {
    const counts = new Map<UsageStatus, number>();
    for (const { status } of testContext.usages ?? []) counts.set(status, (counts.get(status) ?? 0) + 1);
    for (const [status, count] of counts) {
      await expect
        .soft(usageGroupToggles(page).filter({ hasText: groupHeading(statusHeading(status), count) }))
        .toHaveCount(1);
    }
  },
);

Then('the usage group is headed {string}', async ({ page }, heading: string) => {
  await expect(usageGroupToggles(page)).toHaveText([groupHeading(heading)]);
});

Then('the usage groups appear in the order {}', async ({ page }, order: string) => {
  const statuses = order.split(/,\s*/) as UsageStatus[];
  await expect(usageGroupToggles(page)).toHaveText(statuses.map((status) => groupHeading(statusHeading(status))));
});

Then('the usages are listed with the most recently added first', async ({ page, testContext }) => {
  const newestFirst = [...(testContext.usages ?? [])].sort((a, b) => b.dateAdded.localeCompare(a.dateAdded));
  await expect(usageRecords(page)).toHaveText(
    newestFirst.map((u) => new RegExp(escapeRegExp(u.references[0].name!))),
  );
});

Then('I only see the downloads usage group', async ({ page }) => {
  await expect(usageGroupToggles(page)).toHaveText([groupHeading(statusHeading('downloaded'))]);
});

Then('I only see the downloaded, replaced and derivative usage groups', async ({ page }) => {
  const statuses = ['downloaded', 'replaced', 'derivative'] as const;
  await expect(usageGroupToggles(page)).toHaveCount(statuses.length);
  for (const status of statuses) {
    await expect.soft(usageGroup(page, status)).toHaveCount(1);
  }
});

// ---------------------------------------------------------------------------
// Collapsing and expanding a group
// ---------------------------------------------------------------------------

function theGroup(page: Page, usages: SeedUsage[] | undefined, status: UsageStatus | undefined) {
  expect(status, 'an earlier step chose the usage group').toBeDefined();
  const group = usageGroup(page, status!);
  return { group, size: usages!.filter((u) => u.status === status).length };
}

async function expectGroupExpanded(page: Page, testContext: SeedFixtures['testContext'], expanded: boolean) {
  const { group, size } = theGroup(page, testContext.usages, testContext.usageGroup);
  // Collapsing hides a group's records rather than removing them.
  await expect(recordsIn(group)).toHaveCount(size);
  if (expanded) {
    await expect(recordsIn(group).first()).toBeVisible();
  } else {
    await expect(recordsIn(group).first()).toBeHidden();
  }
}

const groupToggle = (page: Page, testContext: SeedFixtures['testContext']) =>
  theGroup(page, testContext.usages, testContext.usageGroup).group.getByRole('button');

Then('that usage group is expanded', async ({ page, testContext }) => {
  await expectGroupExpanded(page, testContext, true);
});

Then('that usage group is collapsed', async ({ page, testContext }) => {
  await expectGroupExpanded(page, testContext, false);
});

Then("the group's usages are shown again", async ({ page, testContext }) => {
  await expectGroupExpanded(page, testContext, true);
});

Then("the group's usages are hidden", async ({ page, testContext }) => {
  await expectGroupExpanded(page, testContext, false);
});

Then("the group's toggle shows the {string} icon", async ({ page, testContext }, icon: string) => {
  await expect(groupToggle(page, testContext).locator('gr-icon')).toHaveText(icon);
});

Then("the group's toggle is named {string}", async ({ page, testContext }, name: string) => {
  await expect(groupToggle(page, testContext)).toHaveAccessibleName(name);
});

When('I activate the {string} toggle', async ({ page }, name: string) => {
  await usagesPanel(page).getByRole('button', { name, exact: true }).click();
});

// ---------------------------------------------------------------------------
// Photo Sales panel
// ---------------------------------------------------------------------------

Then('I see the Photo Sales usage panel', async ({ page }) => {
  await expect(photoSalesPanel(page)).toBeVisible();
});

Then('I do not see the Photo Sales usage panel', async ({ page }) => {
  await expect(usageRecords(page).first()).toBeVisible();
  await expect(photoSalesPanel(page)).toHaveCount(0);
});

Then('the Photo Sales panel shows {string}', async ({ page }, text: string) => {
  await expect(photoSalesPanel(page)).toContainText(text);
});

Then('it shows who syndicated the image and the time since it was added', async ({ page }) => {
  await expect(photoSalesPanel(page)).toContainText(ADDED_BY);
  await expect(photoSalesPanel(page)).toContainText(`${DATE_ADDED_DAYS_AGO} days ago`);
});

Then('the Photo Sales panel shows no entries', async ({ page }) => {
  await expect(photoSalesPanel(page)).toBeAttached();
  await expect(photoSalesPanel(page).getByRole('listitem')).toHaveCount(0);
});

// ---------------------------------------------------------------------------
// Individual usage records
// ---------------------------------------------------------------------------

/** What Kahuna shows in place of a title for a usage that created another image. */
const CHILD_USAGE_LABELS: Partial<Record<UsageStatus, string>> = {
  derivative: 'Used to create',
  replaced: 'Replaced with',
};

Then('that usage is titled {string}', async ({ page }, title: string) => {
  await expect(theUsage(page)).toContainText(title);
});

Then('that usage has no title of its own', async ({ page, testContext }) => {
  const label = CHILD_USAGE_LABELS[theSeededUsage(testContext.usages).status];
  expect(label, 'an earlier step seeded a derivative or replaced usage').toBeDefined();
  // Nothing precedes the label, not even the fallback title. Regexes see the raw whitespace.
  await expect(theUsage(page)).toHaveText(new RegExp(`^\\s*${escapeRegExp(label!)}\\s`));
  await expect(theUsage(page)).not.toContainText('No title found.');
});

Then(
  'the usage shows {string} followed by a link to the child image and who added it',
  async ({ page, testContext }, text: string) => {
    const { childMediaId, addedBy } = theSeededUsage(testContext.usages).childUsageMetadata!;
    await expect(theUsage(page)).toContainText(`${text} ${childMediaId} (added by ${addedBy}).`);
    await expect(theUsage(page).getByRole('link', { name: childMediaId, exact: true }))
      .toHaveAttribute('href', childMediaId);
  },
);

Then('that usage shows the {string} icon', async ({ page }, icon: string) => {
  await expect(theUsage(page).locator('gr-icon')).toHaveText(icon);
});

Then("that usage's icon is highlighted as a warning", async ({ page }) => {
  await expect(theUsage(page).locator('gr-icon')).toHaveClass(/(^|\s)icon-warning(\s|$)/);
});

Then("that usage's icon is not highlighted", async ({ page }) => {
  await expect(theUsage(page).locator('gr-icon')).toBeVisible();
  await expect(theUsage(page).locator('gr-icon')).not.toHaveClass(/(^|\s)icon-warning(\s|$)/);
});

const timeSinceAdded = (page: Page) => theUsage(page).getByText(`${DATE_ADDED_DAYS_AGO} days ago`, { exact: true });

Then('the usage shows the time since it was added', async ({ page }) => {
  await expect(timeSinceAdded(page)).toBeVisible();
});

Then('hovering the time reveals the exact date and time', async ({ page, testContext }) => {
  // Kahuna formats with Angular's `date:'d MMM yyyy, HH:mm'`, in the browser's time zone.
  const exact = await page.evaluate((iso) => {
    const date = new Date(iso);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}, ` +
      `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }, theSeededUsage(testContext.usages).dateAdded);
  await timeSinceAdded(page).hover();
  await expect(timeSinceAdded(page)).toHaveAttribute('title', exact);
});

async function expectReferenceLink(page: Page, usages: SeedUsage[] | undefined, icon: string, type: string) {
  const { uri } = theSeededUsage(usages).references.find((r) => r.type === type)!;
  const link = theUsage(page).getByTitle(`Open in ${type}`, { exact: true });
  await expect(link).toHaveAttribute('href', uri!);
  await expect(link.locator(`gr-${icon}-icon`)).toBeVisible();
}

Then(
  'the usage shows a {word} icon linking to the {word} reference',
  async ({ page, testContext }, icon: string, type: string) => {
    await expectReferenceLink(page, testContext.usages, icon, type);
  },
);

Then('a {word} icon linking to the {word} reference', async ({ page, testContext }, icon: string, type: string) => {
  await expectReferenceLink(page, testContext.usages, icon, type);
});

Then('each reference link opens in a new tab', async ({ page, testContext }) => {
  const links = theUsage(page).getByTitle(/^Open in /);
  await expect(links).toHaveCount(theSeededUsage(testContext.usages).references.filter((r) => r.uri).length);
  for (const link of await links.all()) {
    await expect.soft(link).toHaveAttribute('target', '_blank');
    await expect.soft(link).toHaveAttribute('rel', 'noopener');
  }
});

Then('that usage shows no {word} reference link', async ({ page }, type: string) => {
  await expect(theUsage(page)).toBeVisible();
  await expect(theUsage(page).getByTitle(`Open in ${type}`, { exact: true })).toHaveCount(0);
});

// ---------------------------------------------------------------------------
// Deleting all usages
// ---------------------------------------------------------------------------

Then('I see the {string} control', async ({ page }, text: string) => {
  await expect(usagesControl(page, text)).toBeVisible();
});

Then('I do not see the {string} control', async ({ page }, text: string) => {
  // Nothing else in the panel need be visible, e.g. when Photo Sales hides every group.
  await expect(usagesPanel(page)).toBeAttached();
  await expect(usagesControl(page, text)).toBeHidden();
});

When('I cancel deleting all usages', async ({ page, testContext }) => {
  const requests: string[] = [];
  testContext.deleteUsagesRequests = requests;
  page.on('request', (request) => {
    if (request.method() === 'DELETE' && new URL(request.url()).pathname.startsWith('/usages/media/')) {
      requests.push(request.url());
    }
  });
  let prompt: Dialog | undefined;
  page.once('dialog', (dialog) => {
    prompt = dialog;
    return dialog.dismiss();
  });

  await usagesControl(page, 'Delete ALL usages').click();
  // The click only finishes once the prompt it opens has been dismissed.
  await usagesControl(page, 'Confirm delete').click();

  expect(prompt?.type()).toBe('prompt');
  expect(prompt?.message()).toContain('Enter DELETE below to confirm');
});

Then('no usage information is deleted', async ({ page, testContext }) => {
  await expect(usageRecords(page)).toHaveCount(testContext.usages!.length);
  expect(testContext.deleteUsagesRequests).toEqual([]);
});

// ---------------------------------------------------------------------------
// Live updates
// ---------------------------------------------------------------------------

/**
 * Download the open image, then record its download usage as the usage service and thrall
 * would. Neither is in the stack; Kahuna polls the image until the usage appears.
 */
When('I download the image', async ({ page, testContext }) => {
  const id = testContext.usagesImageId;
  expect(id, 'an earlier step opened the image').toBeDefined();
  const download = page.getByRole('link', { name: 'Download image' });
  // Kahuna only polls for the usage once it knows where to download from.
  await expect(download).toHaveAttribute('href', /\S/);
  await download.click();

  // Kahuna waits for a download by the signed-in user, added after the click.
  const downloaded = downloadUsage(TEST_ACCOUNTS.fullAccess, { dateAdded: new Date().toISOString() });
  testContext.usages = [...(testContext.usages ?? []), downloaded];
  await updateImageCopy(id!, { usages: storedUsages(testContext.usages, id!) });
});

Then('the usages list includes my download', async ({ page, testContext }) => {
  await expect(usageRecords(page)).toHaveCount(testContext.usages!.length);
  await expect(usageGroup(page, 'downloaded')).toContainText(TEST_ACCOUNTS.fullAccess);
});
