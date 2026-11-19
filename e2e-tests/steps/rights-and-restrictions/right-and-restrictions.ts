import type {
  APIRequestContext,
  Locator,
  Page,
  Response,
} from "@playwright/test";
import { Given, When, Then, expect } from "../setup.ts";
import { defineParameterType } from "playwright-bdd";
import { oneOf } from "../utils/parameter-types.ts";
import type { SeedImage } from "../setup.ts";
import {
  findSeededImage,
  findSeededImageId,
  hasNoUsageRights,
  loadImageFixtures,
} from "../../setup/image-fixtures.ts";
import type { ImageSource } from "../../setup/image-fixtures.ts";
import type { ImageOverrides } from "../../setup/seed-image.ts";
import {
  imageInformation,
  openOnSurface,
  openedImageIds,
  revealEditButton,
  rightsSurface,
  rightsSurfaceName,
  uniqueUploadFileName,
  useRightsSurface,
} from "./surfaces.ts";
import type { OpenedImage, RightsSurfaceName } from "./surfaces.ts";
import { usageRightsCategories } from "../utils/api/metadata-editor.queries.ts";
import { setTestClientConfig } from "../utils/test-config.ts";
import { TEST_ACCOUNTS } from "../../setup/constants.ts";
import { switchAccount } from "../utils/auth.ts";
import {
  expectEditPermissionForImage,
  expectUsageRightsCategory,
  expectUsageRightsSaveAccepted,
} from "../utils/api/media-api.assertions.ts";
import { E2E_RIGHTS_TEMPLATE } from "../../setup/config.ts";

/** An image seeded into Elasticsearch from fixtures/elasticsearch/images.json. */
const IMAGE_WITHOUT_RIGHTS = findSeededImage(
  "with no usage rights category",
  hasNoUsageRights,
);
const SEEDED_IMAGE_ID = IMAGE_WITHOUT_RIGHTS._id;

/** The rights and restrictions section on the scenario's surface (see surfaces.ts). */
const rightsAndRestrictions = (page: Page) => rightsSurface(page).section(page);
const usageSummary = (page: Page) =>
  rightsAndRestrictions(page).locator("usage-rights-summary");
// Scoped to the section: the upload page opens an editor for every past upload without rights.
const rightsEditor = (page: Page) =>
  rightsAndRestrictions(page).getByRole("form", { name: "Image usage rights" });
// The category <select> is the editor's first control and has no label of its own.
const categorySelect = (page: Page) =>
  rightsEditor(page).getByRole("combobox").first();
const selectedCategory = (page: Page) =>
  categorySelect(page).locator("option:checked");
const saveButton = (page: Page) =>
  rightsEditor(page).getByRole("button", {
    name: "Save usage rights",
    exact: true,
  });

const editRightsButton = (page: Page) => rightsSurface(page).editButton(page);

async function openRightsEditor(page: Page): Promise<void> {
  await revealEditButton(page);
  await editRightsButton(page).click();
}

/** Open a seeded fixture, read-only, on the scenario's surface. */
async function openImage(page: Page, imageId: string): Promise<void> {
  await openOnSurface(page, [{ id: imageId }]);
}

/** Fields a copy needs to be listed as one of the signed-in user's past uploads. */
function asPastUpload(source: ImageSource, fileName: string): Partial<ImageSource> {
  const uploadInfo = (source.uploadInfo ?? {}) as Record<string, unknown>;
  return {
    uploadedBy: TEST_ACCOUNTS.fullAccess,
    uploadTime: new Date().toISOString(),
    uploadInfo: { ...uploadInfo, filename: fileName },
  };
}

/**
 * Seed disposable copies of fixtures and open them together on the scenario's surface. Use
 * this for any image a scenario may save, so it never changes a shared fixture.
 */
async function openCopies(
  page: Page,
  seedImage: SeedImage,
  copies: { source: ImageSource; overrides?: Partial<ImageSource> }[],
): Promise<OpenedImage[]> {
  const forUpload = rightsSurfaceName(page) === "upload editor";
  const images: OpenedImage[] = [];
  for (const { source, overrides = {} } of copies) {
    const fileName = forUpload ? uniqueUploadFileName() : undefined;
    const fields: ImageOverrides = fileName
      ? { ...asPastUpload(source, fileName), ...overrides }
      : overrides;
    images.push({ id: await seedImage(source, fields), fileName });
  }
  await openOnSurface(page, images);
  return images;
}

async function openSummaryImage(
  page: Page,
  imageId: string,
  cost: "pay" | "free",
): Promise<void> {
  const response = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === `/images/${imageId}` &&
      response.request().resourceType() === "xhr",
  );
  await openImage(page, imageId);
  const imageResponse = await response;
  expect(imageResponse.ok(), "fetching the summary image").toBeTruthy();
  const { data } = (await imageResponse.json()) as { data: { cost: string } };
  expect(data.cost, "the summary image has the expected cost").toBe(cost);
}

/**
 * Resolve a usage rights category from its display name ("Agency - subscription") or its
 * code, using the list Kahuna maps category codes to names with. Legacy codes ("chargeable")
 * are replaced in config and so absent from that list; they are used as given.
 */
async function usageRightsCategoryCode(
  request: APIRequestContext,
  category: string,
): Promise<string> {
  const categories = await usageRightsCategories(request);
  return categories.find(({ name }) => name === category)?.value ?? category;
}

Given("the usage rights summary is switched on", async ({ page }) => {
  await expect(usageSummary(page)).toBeVisible();
});

Given("the usage rights summary is switched off", async ({ page }) => {
  await setTestClientConfig(page, { usageRightsSummary: false });
  // The metadata controller reads the switch on creation; same-document navigation recreates it.
  const imageUrl = page.url();
  await page.getByRole("link", { name: "Go to image search" }).click();
  await expect(rightsAndRestrictions(page)).toHaveCount(0);
  await page.goBack();
  await expect(page).toHaveURL(imageUrl);
  await expect(rightsAndRestrictions(page)).toBeVisible();
});

Given("the image is payable", async ({ page }) => {
  await openSummaryImage(
    page,
    findSeededImageId(
      "with payable usage rights",
      (source) =>
        source.usageRights?.category === "pay-to-use" &&
        !source.usageRights.restrictions,
    ),
    "pay",
  );
});

Given(
  "the image is unrestricted, free and credited to the BBC",
  async ({ page }) => {
    await openSummaryImage(
      page,
      findSeededImageId(
        "with unrestricted, free BBC rights",
        (source) =>
          source.usageRights?.category === "public-domain" &&
          source.metadata?.credit === "BBC",
      ),
      "free",
    );
  },
);

Given(
  "the image is free and in the {string} usage rights category",
  async ({ page }, category: string) => {
    await openSummaryImage(
      page,
      findSeededImageId(
        `with free "${category}" rights`,
        (source) =>
          source.usageRights?.category === category &&
          source.usageRights.supplier === "AP",
      ),
      "free",
    );
  },
);

Given(
  "the image is free and has the usage rights supplier {string}",
  async ({ page }, supplier: string) => {
    await openSummaryImage(
      page,
      findSeededImageId(
        `with free rights from "${supplier}"`,
        (source) =>
          source.usageRights?.category === "agency" &&
          source.usageRights.supplier === supplier,
      ),
      "free",
    );
  },
);

Given(
  "the image is free, unrestricted and not credited to the BBC",
  async ({ page }) => {
    await openSummaryImage(
      page,
      findSeededImageId(
        "with unrestricted, free non-BBC rights",
        (source) =>
          source.usageRights?.category === "public-domain" &&
          !source.metadata?.credit?.toLowerCase().includes("bbc"),
      ),
      "free",
    );
  },
);

Given(
  "the image is not in the {string} usage rights category",
  async ({ page }, category: string) => {
    const [imageId] = openedImageIds(page);
    const image = loadImageFixtures().find(({ _id }) => _id === imageId);
    if (!image)
      throw new Error(`The opened image "${imageId}" is not a seeded fixture`);
    expect(image._source.usageRights?.category).not.toBe(category);
  },
);

Given(
  "the image was uploaded by {string}",
  async ({ page }, uploader: string) => {
    await openImage(
      page,
      findSeededImageId(
        `uploaded by "${uploader}"`,
        (source) => source.uploadedBy === uploader,
      ),
    );
  },
);

Given("I am signed in without edit metadata permission", async ({ page }) => {
  await switchAccount(page, TEST_ACCOUNTS.restricted);
});

Given("I am signed in with edit metadata permission", async ({ page }) => {
  await switchAccount(page, TEST_ACCOUNTS.fullAccess);
});

Given("the image was uploaded by me", async ({ page, testContext }) => {
  const imageId = findSeededImageId(
    "owned by the restricted account",
    (source) => source.uploadedBy === TEST_ACCOUNTS.restricted,
  );
  await openImage(page, imageId);
  testContext.permissionImages = [
    { id: imageId, uploadedBy: TEST_ACCOUNTS.restricted },
  ];
});

defineParameterType({
  name: "shownOrNot",
  regexp: /shown|not shown/,
  transformer: (v) => v === "shown",
});

/** Hover the section, which would reveal the edit button, and check it stays hidden. */
async function expectEditButtonHidden(page: Page): Promise<void> {
  await revealEditButton(page);
  await expect(editRightsButton(page)).toBeHidden();
}

Then(
  "the edit rights and restrictions button is {shownOrNot}",
  async ({ page, testContext }, shown: boolean) => {
    // The section has loaded, so a missing button isn't just a page still rendering.
    await expect(
      rightsAndRestrictions(page).getByRole("definition"),
    ).toContainText(/\S/);
    if (!shown) {
      await expectEditButtonHidden(page);
      await expect(rightsEditor(page)).toBeHidden();
      return;
    }
    const images = testContext.permissionImages;
    if (!images?.length)
      throw new Error("No image was selected by an earlier ownership step");
    for (const image of images) {
      await expectEditPermissionForImage(page, image.id, image.uploadedBy);
    }
    await revealEditButton(page);
    const button = editRightsButton(page);
    await expect(button).toBeVisible();
    await expect(button).toBeEnabled();
  },
);

When("I choose to edit the rights and restrictions", async ({ page }) => {
  await openRightsEditor(page);
});

Then("the rights editor is shown", async ({ page }) => {
  await expect(rightsEditor(page)).toBeVisible();
});

Given("I have opened the rights editor", async ({ page }) => {
  await openRightsEditor(page);
  await expect(rightsEditor(page)).toBeVisible();
});

/**
 * Values for the required properties of each category a scenario saves, keyed by category
 * display name then property label. A category's form can't be submitted without them;
 * categories with no required properties are left out.
 */
const REQUIRED_PROPERTY_VALUES: Record<string, Record<string, string>> = {
  "Agency - subscription": { Supplier: "AP" },
};

/** Required and optional property values a scenario fills in before saving a category. */
const CONFIGURED_PROPERTY_VALUES: Record<string, Record<string, string>> = {
  "Agency - subscription": { Supplier: "AP", Collection: "News" },
  // Publications and creators from usageRightsConfigProvider (dev/script/generate-config/service-config.js).
  // Creator suggestions depend on the chosen publication, so it's set first.
  "GNM Photography": {
    Publication: "Example publication",
    Creator: "Example Contracted Photographer",
  },
  "GNM Illustration": {
    Publication: "Example publication",
    Creator: "Example Staff Illustrator",
  },
};

const RESTRICTIONS_PLACEHOLDER = "What restrictions apply to this image?";

const rightsProperty = (page: Page, property: string) =>
  rightsEditor(page).getByLabel(property, { exact: true });
const rightsPropertyGroup = (page: Page, property: string) =>
  rightsEditor(page).locator(".form-property").filter({ hasText: property });
/**
 * A property with three or fewer options is rendered as radios, which its label isn't linked
 * to, so they're picked by option name. Only one category's radios are shown at a time.
 */
const restrictedCheckbox = (page: Page) =>
  rightsEditor(page).getByRole("checkbox", { name: "Restricted", exact: true });
// The restrictions textarea has no label of its own, only a placeholder.
const restrictionsInput = (page: Page) =>
  rightsEditor(page).getByPlaceholder(RESTRICTIONS_PLACEHOLDER);

const isUsageRightsSave =
  (imageIds: string[]) => (response: Response) =>
    response.request().method() === "PUT" &&
    imageIds.some(
      (id) => new URL(response.url()).pathname === `/metadata/${id}/usage-rights`,
    );

async function selectCategory(page: Page, category: string): Promise<void> {
  await categorySelect(page).selectOption({ label: category });
}

type PropertyControl =
  | { kind: "radio"; group: Locator }
  | { kind: "select" | "text"; field: Locator; suggestions: boolean };

/** Find the control the editor renders for a category property. */
async function propertyControl(
  page: Page,
  property: string,
): Promise<PropertyControl> {
  const field = rightsProperty(page, property);
  const group = rightsPropertyGroup(page, property);
  const radios = group.getByRole("radio");
  await expect(field.or(radios).first()).toBeVisible();
  if ((await field.count()) === 0) return { kind: "radio", group };

  const tagName = await field.evaluate((element) => element.tagName);
  // Properties with options keyed on another property offer them as gr-datalist suggestions.
  const suggestions =
    (await field.locator("xpath=ancestor::gr-datalist[1]").count()) > 0;
  return { kind: tagName === "SELECT" ? "select" : "text", field, suggestions };
}

/** Fill a category property, whichever control the editor renders for it. */
async function setProperty(
  page: Page,
  property: string,
  value: string,
): Promise<void> {
  const control = await propertyControl(page, property);
  if (control.kind === "radio") {
    await control.group
      .getByRole("radio", { name: value, exact: true })
      .check();
  } else if (control.kind === "select") {
    await control.field.selectOption({ label: value });
  } else if (control.suggestions) {
    // Type (not fill) so gr-datalist searches as the user types, then pick the suggestion.
    await control.field.clear();
    await control.field.pressSequentially(value);
    await rightsEditor(page)
      .getByRole("option", { name: value, exact: true })
      .click();
    await expect(control.field).toHaveValue(value);
  } else {
    await control.field.fill(value);
  }
}

async function expectProperty(
  page: Page,
  property: string,
  value: string,
): Promise<void> {
  const control = await propertyControl(page, property);
  if (control.kind === "radio") {
    await expect(
      control.group.getByRole("radio", { name: value, exact: true }),
    ).toBeChecked();
  } else if (control.kind === "select") {
    // Angular's ng-options values are internal ("string:AP"), so check the chosen option's text.
    await expect(control.field.locator("option:checked")).toHaveText(value);
  } else {
    await expect(control.field).toHaveValue(value);
  }
}

async function saveRights(page: Page): Promise<void> {
  // The editor closes whether or not the save succeeds, so check the requests themselves.
  await expectUsageRightsSaveAccepted(page, openedImageIds(page), () =>
    saveButton(page).click(),
  );
}

When(
  "I save the {string} usage rights category",
  async ({ page }, category: string) => {
    const required = REQUIRED_PROPERTY_VALUES[category] ?? {};
    await selectCategory(page, category);
    for (const [property, value] of Object.entries(required)) {
      await setProperty(page, property, value);
    }
    await saveRights(page);
  },
);

When(
  "I select the {string} usage rights category",
  async ({ page }, category: string) => {
    await selectCategory(page, category);
  },
);

When(
  "I select the {string} usage rights category and set configured fields",
  async ({ page, testContext }, category: string) => {
    const values = CONFIGURED_PROPERTY_VALUES[category];
    if (!values)
      throw new Error(
        `No configured property values are defined for "${category}"`,
      );

    await selectCategory(page, category);
    for (const [property, value] of Object.entries(values)) {
      await setProperty(page, property, value);
    }
    testContext.rightsProperties = values;
  },
);

When(
  "I set the {string} property to {string}",
  async ({ page }, property: string, value: string) => {
    await setProperty(page, property, value);
  },
);

When(
  "I add the restriction {string}",
  async ({ page }, restriction: string) => {
    const checkbox = restrictedCheckbox(page);
    // Categories that require restrictions tick (and lock) the checkbox themselves.
    if (!(await checkbox.isChecked())) await checkbox.check();
    await restrictionsInput(page).fill(restriction);
  },
);

When("I save the rights", async ({ page }) => {
  await saveRights(page);
});

When("I cancel the rights editor", async ({ page }) => {
  const isSave = isUsageRightsSave(openedImageIds(page));
  const saves: string[] = [];
  const recordSave = (response: Response) => {
    if (isSave(response)) saves.push(response.url());
  };
  page.on("response", recordSave);
  try {
    await rightsEditor(page)
      .getByRole("button", { name: "Close usage rights form", exact: true })
      .click();
    await expect(rightsEditor(page)).toBeHidden();
  } finally {
    page.off("response", recordSave);
  }
  expect(saves, "cancelling must not save the rights").toEqual([]);
});

Then(
  "the rights editor shows the {string} property as {word}",
  async ({ page }, property: string, required: string) => {
    if (required !== "required" && required !== "optional") {
      throw new Error(`Expected "required" or "optional", got "${required}"`);
    }
    const control = await propertyControl(page, property);
    const field =
      control.kind === "radio"
        ? control.group.getByRole("radio").first()
        : control.field;
    await expect(field).toBeVisible();
    if (required === "required") {
      await expect(field).toHaveAttribute("required");
    } else {
      await expect(field).not.toHaveAttribute("required");
    }
  },
);

Then(
  /^the rights editor shows the "Restricted" checkbox (unticked|ticked and locked)$/,
  async ({ page }, state: string) => {
    const checkbox = restrictedCheckbox(page);
    await expect(checkbox).toBeVisible();
    if (state === "unticked") {
      await expect(checkbox).not.toBeChecked();
      await expect(checkbox).toBeEnabled();
    } else {
      await expect(checkbox).toBeChecked();
      await expect(checkbox).toBeDisabled();
    }
  },
);

Then("the rights editor shows no category properties", async ({ page }) => {
  const editor = rightsEditor(page);
  await expect(editor).toBeVisible();
  // Each category property is a labelled field; only the category <select> has no label.
  // The "Restricted" checkbox isn't a category property, so it's asserted separately.
  await expect(editor.getByRole("combobox")).toHaveCount(1);
  await expect(editor.getByRole("textbox")).toHaveCount(0);
  await expect(editor.getByRole("radio")).toHaveCount(0);
});

Then(
  /^the rights editor (shows|does not show) the "Restricted" checkbox$/,
  async ({ page }, shown: string) => {
    if (shown === "shows") {
      await expect(restrictedCheckbox(page)).toBeVisible();
      await expect(restrictedCheckbox(page)).not.toBeChecked();
    } else {
      await expect(rightsEditor(page).getByRole("checkbox")).toHaveCount(0);
    }
  },
);

Then(
  "the rights editor shows the configured fields",
  async ({ page, testContext }) => {
    const values = testContext.rightsProperties;
    if (!values)
      throw new Error("No property values were set by an earlier step");
    for (const [property, value] of Object.entries(values)) {
      await expectProperty(page, property, value);
    }
  },
);

Then(
  "the rights editor shows the {string} property set to {string}",
  async ({ page }, property: string, value: string) => {
    await expectProperty(page, property, value);
  },
);

Then(
  "the rights editor shows the restriction {string}",
  async ({ page }, restriction: string) => {
    await expect(restrictedCheckbox(page)).toBeChecked();
    await expect(restrictionsInput(page)).toHaveValue(restriction);
  },
);

Then("the rights editor is not shown", async ({ page }) => {
  await expect(rightsEditor(page)).toBeHidden();
});

Then("the current usage rights category is shown", async ({ page }) => {
  // The category is the section's description (<dd>), whether or not the usage summary is on.
  await expect(
    rightsAndRestrictions(page).getByRole("definition"),
  ).toContainText(/\S/);
});

Then(
  "the current usage rights category display is hidden",
  async ({ page }) => {
    await expect(
      rightsAndRestrictions(page).getByRole("definition"),
    ).toHaveCount(0);
  },
);

Then("the edit rights and restrictions button is hidden", async ({ page }) => {
  await expectEditButtonHidden(page);
});

Then("the rights editor closes", async ({ page }) => {
  await expect(rightsEditor(page)).toBeHidden();
});

/** A seeded image uploaded by someone other than the test accounts. */
function imageUploadedBySomeoneElse(): { id: string; source: ImageSource; uploadedBy: string } {
  const image = loadImageFixtures().find(
    ({ _source }) =>
      typeof _source.uploadedBy === "string" &&
      !Object.values(TEST_ACCOUNTS).some(
        (account) => account === _source.uploadedBy,
      ),
  );
  if (!image || typeof image._source.uploadedBy !== "string") {
    throw new Error(
      "No seeded image uploaded by someone other than the test accounts",
    );
  }
  return { id: image._id, source: image._source, uploadedBy: image._source.uploadedBy };
}

Given(
  "the image was uploaded by someone else",
  async ({ page, testContext }) => {
    const { id, uploadedBy } = imageUploadedBySomeoneElse();
    await openImage(page, id);
    testContext.permissionImages = [{ id, uploadedBy }];
  },
);

Then(
  "the rights and restrictions section shows only the category",
  async ({ page }) => {
    const section = rightsAndRestrictions(page);
    await expect(section.getByRole("definition")).toHaveText("Pay to use");
    await expect(usageSummary(page)).toHaveCount(0);
    await expect(section.locator("svg")).toHaveCount(0);
    await expect(section.getByRole("table")).toHaveCount(0);
  },
);

Then(
  "the usage rights summary lists {string} with its icon",
  async ({ page }, usage: string) => {
    const row = usageSummary(page)
      .getByRole("row")
      .filter({
        has: page.getByText(usage, { exact: true }),
      });
    await expect(row).toBeVisible();
    await expect(row.locator("svg")).toBeVisible();
  },
);

Then(
  /^the usage rights summary contains exactly (\d+) usage entr(?:y|ies)$/,
  async ({ page }, count: string) => {
    await expect(usageSummary(page).getByRole("row")).toHaveCount(
      Number(count),
    );
  },
);

Then("the usage rights summary lists no usage", async ({ page }) => {
  await expect(
    usageSummary(page).getByText("PR & Third Party", { exact: true }),
  ).toBeVisible();
  await expect(usageSummary(page).getByRole("table")).toBeAttached();
  await expect(usageSummary(page).getByRole("row")).toHaveCount(0);
  await expect(usageSummary(page).locator("svg")).toHaveCount(0);
});

// It's ok to target a css class here because non-Guardian orgs supply stylesheets that provide the appropriate imagary
Then(
  "the usage rights summary shows an agency marker titled {string}",
  async ({ page }, uploader: string) => {
    await expect(
      usageSummary(page).getByTitle(uploader, { exact: true }),
    ).toHaveClass(new RegExp(`(?:^|\\s)supplier-${uploader}(?:\\s|$)`));
  },
);

Given("I have opened the single image view of an image", async ({ page }) => {
  await openImage(page, SEEDED_IMAGE_ID);
});

/** The seeded fixture in a usage rights category, given by display name or code. */
async function imageInCategory(
  request: APIRequestContext,
  category: string,
): Promise<{ code: string; source: ImageSource }> {
  const code = await usageRightsCategoryCode(request, category);
  const { _source } = findSeededImage(
    `in the "${category}" usage rights category`,
    (source) => source.usageRights?.category === code,
  );
  return { code, source: _source };
}

Given(
  "the image has the {string} usage rights category",
  async ({ page, request, seedImage, testContext }, category: string) => {
    const { code, source } = await imageInCategory(request, category);
    testContext.usageRightsCategory = code;
    // A copy, as some scenarios save new rights on it.
    await openCopies(page, seedImage, [{ source }]);
  },
);

Given(
  "the usage rights suppliers is {string}",
  async ({ page, testContext }, suppliers: string) => {
    const category = testContext.usageRightsCategory;
    expect(
      category,
      "no usage rights category was chosen by an earlier step",
    ).toBeDefined();
    const imageId = findSeededImageId(
      `in the "${category}" usage rights category with suppliers "${suppliers}"`,
      (source) =>
        source.usageRights?.category === category &&
        source.usageRights?.suppliers === suppliers,
    );
    await openImage(page, imageId);
  },
);

Given("the image has no usage rights category", async ({ page, seedImage }) => {
  // A disposable copy, so scenarios that save rights don't change a shared fixture.
  await openCopies(page, seedImage, [
    { source: IMAGE_WITHOUT_RIGHTS._source, overrides: { usageRights: {} } },
  ]);
});

Given(
  "the configuration contains pay-to-use and not chargeable",
  async ({ request }) => {
    // media-api only remaps legacy categories to the replacements listed in `usageRights.applicable`.
    const codes = (await usageRightsCategories(request)).map(
      ({ value }) => value,
    );
    expect(codes).toContain("pay-to-use");
    expect(codes).not.toContain("chargeable");
  },
);

Then(
  "the rights and restrictions section shows {string}",
  async ({ page }, category: string) => {
    // The category is its own element both in the plain <dd> (usage rights summary off) and
    // inside the usage rights summary (on), so match it exactly rather than the whole line.
    await expect(
      rightsAndRestrictions(page).getByText(category, { exact: true }),
    ).toBeVisible();
  },
);

Then("Source field is {string}", async ({ page }, source: string) => {
  // The view mode shows only the category; the remapped `source` is a field of the rights editor.
  await openRightsEditor(page);
  await expect(rightsEditor(page).getByLabel("Source", { exact: true })).toHaveValue(
    source,
  );
});

Then("the Metadata tab is selected", async ({ page }) => {
  // gr-radio-list hides its radio inputs and styles their labels as the tabs. Each label holds
  // a "minimal" and a "full" copy of the text, so the hidden radio's name is "Metadata Metadata".
  const metadataTab = imageInformation(page).getByRole("radio", {
    name: "Metadata",
    includeHidden: true,
  });
  await expect(metadataTab).toBeChecked();
});

Then("I see a {string} region", async ({ page, testContext }, name: string) => {
  testContext.region = page.getByRole("region", { name, exact: true });
  await expect(testContext.region).toBeVisible();
});

Then("it is headed {string}", async ({ testContext }, heading: string) => {
  expect(
    testContext.region,
    "no region was found by an earlier step",
  ).toBeDefined();
  // Kahuna heads metadata regions with the key (<dt>) of their description list.
  await expect(testContext.region!.getByRole("term").first()).toHaveText(
    heading,
  );
});
// ---------------------------------------------------------------------------
// Metadata templates driving the rights editor
// ---------------------------------------------------------------------------

const metadataTemplates = (page: Page) =>
  page.getByRole("region", { name: "Metadata templates", exact: true });
const metadataTemplateSelect = (page: Page) =>
  metadataTemplates(page).getByRole("combobox", { name: "Metadata template" });

/** The display name of the category `E2E_RIGHTS_TEMPLATE` sets, e.g. "Agency - subscription". */
async function rightsTemplateCategoryName(
  request: APIRequestContext,
): Promise<string> {
  const { category } = E2E_RIGHTS_TEMPLATE.usageRights;
  const name = (await usageRightsCategories(request)).find(
    ({ value }) => value === category,
  )?.name;
  if (!name)
    throw new Error(
      `The "${category}" usage rights category is not configured`,
    );
  return name;
}

/**
 * Kahuna applies a template's selection once it has fetched the collections tree, which it
 * only requests on the first selection after the page loads. Waiting for that response
 * means an editor that should stay closed is checked after the selection has been handled.
 */
async function chooseRightsTemplate(page: Page): Promise<void> {
  const [collections] = await Promise.all([
    page.waitForResponse((response) => {
      const url = new URL(response.url());
      return (
        url.hostname.startsWith("media-collections.") &&
        url.pathname === "/collections"
      );
    }),
    metadataTemplateSelect(page).selectOption({
      label: E2E_RIGHTS_TEMPLATE.templateName,
    }),
  ]);
  expect(
    collections.ok(),
    "fetching collections for the metadata template",
  ).toBeTruthy();
}

Given("metadata templates are configured", async ({ page }) => {
  // Templates are baked into Kahuna's config at boot, so a stale stack won't list this one.
  await expect(
    metadataTemplateSelect(page).getByRole("option", {
      name: E2E_RIGHTS_TEMPLATE.templateName,
      exact: true,
    }),
    "restart the stack if the rights template is missing",
  ).toHaveCount(1);
});

When(
  "I choose a metadata template that sets a usage rights category",
  async ({ page }) => {
    await chooseRightsTemplate(page);
  },
);

When(
  "I choose a metadata template that sets the {string} usage rights category",
  async ({ page, request }, category: string) => {
    expect(await usageRightsCategoryCode(request, category)).toBe(
      E2E_RIGHTS_TEMPLATE.usageRights.category,
    );
    await chooseRightsTemplate(page);
  },
);

Given(
  "a metadata template's usage rights are being previewed on the image",
  async ({ page }) => {
    await chooseRightsTemplate(page);
    await expect(rightsEditor(page)).toBeVisible();
  },
);

Then(
  "the rights editor shows the template's usage rights as a locked preview",
  async ({ page, request }) => {
    const editor = rightsEditor(page);
    await expect(editor).toBeVisible();
    await expect(selectedCategory(page)).toHaveText(
      await rightsTemplateCategoryName(request),
    );
    await expect(categorySelect(page)).toBeDisabled();
    await expect(restrictedCheckbox(page)).toBeChecked();
    await expect(restrictionsInput(page)).toHaveValue(
      E2E_RIGHTS_TEMPLATE.usageRights.restrictions,
    );
    await expect(restrictionsInput(page)).toHaveJSProperty("readOnly", true);
  },
);

Then("the rights editor offers no save or cancel buttons", async ({ page }) => {
  const editor = rightsEditor(page);
  await expect(saveButton(page)).toHaveCount(0);
  await expect(
    editor.getByRole("button", {
      name: "Close usage rights form",
      exact: true,
    }),
  ).toHaveCount(0);
});

When("I apply the metadata template", async ({ page }) => {
  // Kahuna closes the template whether or not applying succeeds, so check the save itself.
  const [rights] = await Promise.all([
    page.waitForResponse(isUsageRightsSave(openedImageIds(page))),
    metadataTemplates(page)
      .getByTitle("Apply template", { exact: true })
      .click(),
  ]);
  expect(
    rights.ok(),
    `applying the template's rights: ${await rights.text()}`,
  ).toBeTruthy();
});

When("I cancel the metadata template", async ({ page }) => {
  await metadataTemplates(page).getByTitle("Close", { exact: true }).click();
});

Then(
  "the rights and restrictions section shows the template's usage rights category",
  async ({ page, request }) => {
    const category = await rightsTemplateCategoryName(request);
    await expect(
      rightsAndRestrictions(page).getByText(category, { exact: true }),
    ).toBeVisible();
  },
);

// ---------------------------------------------------------------------------
// Surfaces other than the single image view, and selecting several images
// ---------------------------------------------------------------------------

Given(
  "I am working in the {rightsSurface}",
  async ({ page }, surface: RightsSurfaceName) => {
    useRightsSurface(page, surface);
  },
);

/** The uploaders of the images each selection step selects, in the order they're selected. */
const SELECTION_UPLOADERS: Record<string, () => string[]> = {
  "two images uploaded by me": () => [
    TEST_ACCOUNTS.restricted,
    TEST_ACCOUNTS.restricted,
  ],
  "an image uploaded by me, then an image uploaded by someone else": () => [
    TEST_ACCOUNTS.restricted,
    imageUploadedBySomeoneElse().uploadedBy,
  ],
};

defineParameterType({
  name: "uploaderSelection",
  regexp: oneOf(Object.keys(SELECTION_UPLOADERS)),
  transformer: (selection) => SELECTION_UPLOADERS[selection](),
});

Given(
  "I have selected {uploaderSelection}",
  async ({ page, seedImage, testContext }, uploaders: string[]) => {
    const images = await openCopies(
      page,
      seedImage,
      uploaders.map((uploadedBy) => ({
        source: IMAGE_WITHOUT_RIGHTS._source,
        overrides: { uploadedBy },
      })),
    );
    testContext.permissionImages = images.map(({ id }, index) => ({
      id,
      uploadedBy: uploaders[index],
    }));
  },
);

Given(
  "I have selected images with the {string} and {string} usage rights categories",
  async ({ page, request, seedImage }, first: string, second: string) => {
    const sources = await Promise.all(
      [first, second].map((category) => imageInCategory(request, category)),
    );
    await openCopies(
      page,
      seedImage,
      sources.map(({ source }) => ({ source })),
    );
  },
);

Then(
  "the rights editor shows the {string} category",
  async ({ page }, category: string) => {
    await expect(selectedCategory(page)).toHaveText(category);
  },
);

Then("the rights can't be saved", async ({ page }) => {
  await expect(saveButton(page)).toBeDisabled();
});

Then("the rights can be saved", async ({ page }) => {
  await expect(saveButton(page)).toBeEnabled();
});

Then(
  "every selected image has the {string} usage rights category",
  async ({ page, request }, category: string) => {
    const code = await usageRightsCategoryCode(request, category);
    for (const imageId of openedImageIds(page)) {
      await expectUsageRightsCategory(page, imageId, code);
    }
  },
);
