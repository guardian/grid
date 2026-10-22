import type { APIRequestContext } from '@playwright/test';
import { expect } from '../../setup.ts';
import { API_KEY, SERVICE_PORTS } from '../../../setup/constants.ts';

const METADATA_EDITOR_URL = `http://localhost:${SERVICE_PORTS['metadata-editor']}`;

export interface UsageRightsCategory {
  name: string;
  value: string;
}

export async function usageRightsCategories(request: APIRequestContext): Promise<UsageRightsCategory[]> {
  const response = await request.get(`${METADATA_EDITOR_URL}/usage-rights/categories`, {
    headers: { 'X-Gu-Media-Key': API_KEY },
  });
  expect(response.ok(), 'fetching the usage rights categories').toBeTruthy();
  return ((await response.json()) as { data: UsageRightsCategory[] }).data;
}
