# Plan: implementing the rights and restrictions scenarios

Plan for implementing the `@todo` scenarios in
[rights-and-restrictions.feature](../features/rights-and-restrictions.feature). The scenarios
are grouped into six tiers by how much setup they need, cheapest first.

**Done:** The rights and restrictions section is shown on the Metadata tab.

## Findings that shape the plan

- **The legacy `chargeable` scenario expects behaviour that doesn't exist.** It expects
  "Pay to use", but nothing in the code maps `chargeable` to Pay to use. `chargeable` isn't in
  the e2e category list (`usageRights.applicable` in [config.ts](../setup/config.ts)), so
  Kahuna shows the raw text `chargeable`.
- **The Background opens an image before any Given picks one.** Given steps that need a
  specific image (or a different account) will have to reopen the image view.
- **The seeded images are shared by every scenario,** so anything that saves rights needs
  its own image.
- **The usage rights summary is a server-side flag** (`usageRightsSummary` in `kahuna.conf`),
  read into `window._clientConfig` when the page loads. It can't be switched per scenario
  without extra work.
- **The only metadata template (`E2E Agency`) sets no usage rights.**
- `TestContext` in [setup.ts](../steps/setup.ts) has no `region` field, but
  [common.steps.ts](../steps/common.steps.ts) uses `testContext.region`. Add
  `region?: Locator;`.

## Locator approach

Following the [Playwright locator guidance](https://playwright.dev/docs/locators):

- Scope every locator to a named region: `imageInformation(page)` →
  `getByRole('region', { name: 'Rights and restrictions' })` → the editor form
  (`getByRole('form', { name: 'Image usage rights' })`).
- Prefer, in order: `getByRole` with an accessible name, then `getByLabel`, `getByPlaceholder`,
  `getByTitle`. Avoid CSS selectors and `data-cy`.
- Use auto-retrying assertions (`toHaveText`, `toBeVisible`, `toBeChecked`, `toBeDisabled`,
  `toHaveCount(0)`). No manual waits.

### Accessibility gaps

These need small Kahuna fixes so role locators work. Each has a fallback that avoids changing
the app:

| Element | Problem | Fix (preferred) | Fallback |
|---|---|---|---|
| Edit button `✎` ([gr-image-metadata.html](../../kahuna/public/js/components/gr-image-metadata/gr-image-metadata.html)) | Accessible name is just "✎" | `aria-label="Edit rights and restrictions"` | `getByTestId` with `testIdAttribute: 'data-cy'` |
| Category `<select>` ([usage-rights-editor.html](../../kahuna/public/js/usage-rights/usage-rights-editor.html)) | Its `<label>` has no text | `aria-label="Usage rights category"` | `getByRole('combobox').first()` (fragile) |
| Restrictions textarea | No label | `aria-label="Restrictions"` | `getByPlaceholder('What restrictions apply…')` |
| Summary SVG icons ([gr-usagerights-bbc.tsx](../../kahuna/public/js/components/gr-usagerights-summary/gr-usagerights-bbc.tsx)) | No accessible name | `role="img"` plus an `aria-label` | `row.locator('svg')` |
| Template Apply/Close buttons ([metadata-templates.html](../../kahuna/public/js/metadata-templates/metadata-templates.html)) | Name may come from the icon's ligature text, not the `title` | Verify, then add `aria-label` if needed | `getByTitle('Apply template')` |

These already work with no changes:

- Property fields: `getByLabel('Supplier')`
- "Restricted" checkbox: `getByRole('checkbox', { name: 'Restricted' })`
- Editor buttons: `getByRole('button', { name: 'Save usage rights' })` and
  `getByRole('button', { name: 'Close usage rights form' })`
- Category display: `getByRole('definition')`
- Agency marker: `getByTitle('PA_AutoIngest')`
- Template dropdown: `getByRole('combobox', { name: 'Metadata template' })`

## Tier 1: existing seeded images, default account, nothing saved

**Setup:** an `openImageView(page, id)` helper, plus Given steps that map a category to a
seeded image and reopen it:

- Agency → `aa22008a915bf22184136ac94a3553977a8921bc`
- None → `f6bfd2f0e54c232fd642237dfe773bb14275b3b3`
- `chargeable` (also used as the payable image) → `119960415d35d0f29d86b1513266296535b4d636`

"The usage rights summary is switched off" becomes a step that checks
`window._clientConfig.usageRightsSummary === false`.

**Scenarios:**

1. The category name is shown for an image with usage rights
2. An image without a usage rights category is shown as Unknown
3. No usage icons are shown when the usage rights summary is switched off
4. A user with edit permission can edit the image's rights (seeded image uploaded by
   `stingray`)
5. The rights editor is closed by default
6. Opening the rights editor replaces the category display
7. Editing a rights category shows its configured properties (outline): check required fields
   via the `required` attribute, and the Restricted checkbox with `toBeChecked` /
   `toBeDisabled`
8. Editing a rights category without properties shows no category fields (outline)
9. Cancelling the rights editor leaves the rights unchanged
10. The mapped category name is shown for an image with a legacy usage right: **blocked**
    until the expected text is decided (see [Decisions needed](#decisions-needed))

## Tier 2: switching account

**Setup:** reuse `switchAccount(page, TEST_ACCOUNTS.restricted)` from
[auth.ts](../steps/utils/auth.ts). That account can upload but has no `edit_metadata`
permission.

**Scenarios:**

- A user without edit permission cannot edit another user's image rights: assert the edit
  button has `toHaveCount(0)` or `toBeHidden`.

## Tier 3: new seeded images in `images.json` (one-off, nothing saved)

**Setup:** add four images to
[images.json](../fixtures/elasticsearch/images.json):

- uploaded by `grid-e2e-restricted-account@guardian.co.uk`
- credited to BBC, free, no restrictions
- agency category with supplier `PA`
- uploaded by `PA_AutoIngest`

First check that search and recent-uploads tests don't depend on the current image count. A
rerun needs a reseed.

**Scenarios:**

- The uploader can edit their own image's rights without edit permission
- The new images are also used by the Tier 4 rows "Usable for all" and "Usable for Sport",
  and by the agency marker scenario

## Tier 4: usage rights summary switched on (needs a toggle)

**Setup:** the flag is read from the server config into `window._clientConfig` when the page
loads. Recommended toggle: a `page.route` that rewrites `usageRightsSummary: false` to `true`
in Kahuna's HTML for that scenario only. [upload/setup.ts](../steps/upload/setup.ts) already
stubs requests with `page.route`. The alternative is a second Kahuna instance with different
config, which is much more expensive.

**Locators:** summary rows via `getByRole('row', { name: 'Payable images' })`. "Lists no
usage" means `getByRole('row')` has count 0.

**Scenarios:**

- The usage rights summary shows the category name
- The usage rights summary shows Unknown for an image without a category
- The usage rights summary lists the usage that applies to the image (outline):
  - Payable images
  - Usable for News
  - Usable for all
  - Usable for Sport
- The usage rights summary lists nothing when no usage applies
- The usage rights summary shows the supplier's agency marker

## Tier 5: scenarios that save (need a fresh image each)

**Setup:** a `seedImage(overrides)` fixture that copies a seeded image, gives it a unique id,
and indexes it into Elasticsearch (`localhost:9200`, `refresh=wait_for`). An `After` hook
deletes it. This keeps scenarios isolated under parallel runs and retries.

**Spike first:** confirm that saving rights on an image that exists only in Elasticsearch
still goes through the metadata editor and back into Elasticsearch. If it doesn't, upload a
fresh image with the existing upload helpers instead.

**Scenarios:**

- Saving new rights closes the editor and shows the new category
- Saving a rights category with its properties filled in (outline, still has the GNM TODO)
- Saving a rights category that requires restrictions

## Tier 6: config change and stack restart (templates with usage rights)

**Setup:** add a second template, for example `E2E Agency rights`, with
`usageRights { category = "agency", suppliers = "Getty Images" }`, in
[config.ts](../setup/config.ts). Leave `E2E Agency` alone so the upload scenarios aren't
affected. Check that the `suppliers` key fills the Supplier field. The running stack must be
restarted to pick this up.

**Assertions for the locked preview:** the category select is `toBeDisabled()`, the textarea
is `not.toBeEditable()`, and the Save/Close buttons have `toHaveCount(0)`.

**Scenarios:**

- Choosing a template with a different category previews its rights
- Choosing a template with the same category keeps the rights editor closed
- Cancelling a template restores the original rights
- Applying a template closes the rights preview (this one saves, so it also needs a Tier 5
  fresh image)

## Suggested order

1. Fix the `TestContext.region` type and add the image-view helpers.
2. Add the Kahuna accessibility fixes.
3. Build tiers 1 → 6 in order, removing `@todo` from each scenario as it passes.

## Decisions needed

1. For the legacy `chargeable` scenario: should it expect `chargeable` (current behaviour), or
   is a mapping to "Pay to use" missing from the app?
2. Can the small Kahuna accessibility changes be made, or should the tests use only the
   fallback locators?
3. Is a per-scenario `page.route` acceptable for switching the summary on? The comments in
   [config.ts](../setup/config.ts) prefer real server config over client-side stubs.
