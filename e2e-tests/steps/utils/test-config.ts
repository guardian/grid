import type { Page } from '@playwright/test';

type ClientConfig = {
  systemName: string;
  maybeUploadLimitInBytes: number;
  shouldUploadStraightToBucket: boolean;
  usageRightsSummary: boolean
};

declare global {
  interface Window {
    _clientConfig: ClientConfig;
    _testClientConfig: Partial<ClientConfig>;
  }
}

export async function setTestClientConfig(page: Page, config: Partial<ClientConfig>) {
  await page.addInitScript((config) => {
    window._testClientConfig = config;
  }, config);
  await page.reload();
}