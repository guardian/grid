import { test, expect, KAHUNA_APP_URL } from './fixtures';

/**
 * Smoke tests against the Grid stack booted by Testcontainers in global-setup.
 * `baseURL` points at the Kahuna service (see fixtures.ts / playwright.config.ts).
 */

test('kahuna healthcheck responds OK', async ({ request }) => {
  const response = await request.get('/management/healthcheck');
  expect(response.ok()).toBeTruthy();
});

test('kahuna serves the application', async ({ request }) => {
  // The root path may redirect to auth; any non-server-error response proves Kahuna
  // is serving requests against the provisioned infrastructure.
  const response = await request.get('/', { maxRedirects: 0 });
  expect(response.status()).toBeLessThan(500);
});

test('frontend loads media-api from the grid-all container', async ({ page }) => {
  // The SPA reads the media-api URL from <link rel="media-api-uri"> and immediately
  // requests the media-api root to discover its hypermedia links. dev-nginx routes
  // https://api.media.<domain> to the media-api fixed port on the grid-all container,
  // so this request should be served (200) by the container rather than failing.
  const mediaApiResponse = page.waitForResponse(
    (response) =>
      response.url().startsWith('https://api.media.') && response.request().method() === 'GET',
    { timeout: 60_000 },
  );

  await page.goto(KAHUNA_APP_URL);

  const mediaApiLink = await page.getAttribute('link[rel="media-api-uri"]', 'href');
  expect(mediaApiLink).toContain('api.media.');

  const response = await mediaApiResponse;
  expect(response.status()).toBe(200);
});
