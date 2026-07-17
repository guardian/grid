import { test, expect } from './fixtures';

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
