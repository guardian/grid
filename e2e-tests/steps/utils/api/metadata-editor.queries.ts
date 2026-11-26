import type { APIRequestContext } from '@playwright/test';
import { expect } from '../../setup.ts';
import { mediaKeyHeaders, SERVICE_CONFIGS } from '../../../setup/constants.ts';

const METADATA_EDITOR_URL = `http://localhost:${SERVICE_CONFIGS['metadata-editor'].port}`;

export interface UsageRightsCategory {
  name: string;
  value: string;
}

export async function usageRightsCategories(request: APIRequestContext): Promise<UsageRightsCategory[]> {
  const response = await request.get(`${METADATA_EDITOR_URL}/usage-rights/categories`, {
    headers: mediaKeyHeaders(),
  });
  expect(response.ok(), 'fetching the usage rights categories').toBeTruthy();
  return ((await response.json()) as { data: UsageRightsCategory[] }).data;
}
