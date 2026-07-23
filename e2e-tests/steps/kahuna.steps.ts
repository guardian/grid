import { When, Then, expect } from './fixtures';

When('I request the Kahuna healthcheck endpoint', async ({ request, testContext }) => {
  testContext.response = await request.get('/management/healthcheck');
});

Then('the response is successful', async ({ testContext }) => {
  expect(testContext.response?.ok()).toBeTruthy();
});

When('I request the Kahuna root path without following redirects', async ({ request, testContext }) => {
  // The root path may redirect to auth; any non-server-error response proves Kahuna
  // is serving requests against the provisioned infrastructure.
  testContext.response = await request.get('/', { maxRedirects: 0 });
});

Then('the response status is below {int}', async ({ testContext }, status: number) => {
  expect(testContext.response?.status()).toBeLessThan(status);
});
