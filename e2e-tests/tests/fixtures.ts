import { test as base, expect } from '@playwright/test';
import * as fs from 'fs';
import { URLS_FILE } from '../testcontainers/constants';

interface GridUrls {
  kahuna: string;
  mediaApi: string;
}

function readGridUrls(): GridUrls {
  return JSON.parse(fs.readFileSync(URLS_FILE, 'utf8')) as GridUrls;
}

/**
 * Test fixture that exposes the Grid service URLs resolved by `global-setup.ts`
 * (dynamic host ports) and points `baseURL` at Kahuna.
 */
export const test = base.extend<{ gridUrls: GridUrls }>({
  gridUrls: async ({}, use) => {
    await use(readGridUrls());
  },
  baseURL: async ({}, use) => {
    await use(readGridUrls().kahuna);
  },
});

export { expect };
