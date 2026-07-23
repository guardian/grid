import { When, Then, expect, KAHUNA_APP_URL } from './fixtures';

When('I open the Grid application', async ({ page, testContext }) => {
  // Register the media-api listener before navigating so the request the SPA fires on
  // load is captured. dev-nginx routes https://api.media.<domain> to the media-api port
  // on the grid-all container, so this request should be served (200) by the container.
  testContext.mediaApiResponse = page.waitForResponse(
    (response) =>
      response.url().startsWith('https://api.media.') && response.request().method() === 'GET',
    { timeout: 60_000 },
  );

  await page.goto(KAHUNA_APP_URL);
});

Then('the page exposes a media-api URI link', async ({ page }) => {
  const mediaApiLink = await page.getAttribute('link[rel="media-api-uri"]', 'href');
  expect(mediaApiLink).toContain('api.media.');
});

Then('the media-api is served successfully', async ({ testContext }) => {
  const response = await testContext.mediaApiResponse!;
  expect(response.status()).toBe(200);
});
