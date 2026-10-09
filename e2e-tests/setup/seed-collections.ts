/**
 * Seeds the collections service with the collections the tests pick from.
 *
 * Collections can only be chosen in the UI, not typed, so any scenario that adds an image
 * to one needs it to exist before Kahuna first loads (and memoises) the collection list.
 */
import { API_KEY, SERVICE_PORTS } from './constants.ts';

export const E2E_COLLECTION = 'e2e-batch';

const COLLECTIONS_URL = `http://localhost:${SERVICE_PORTS.collections}/collections`;

/** Create the fixture collections at the root. Re-adding an existing one is a no-op. */
export async function seedCollections(report: (message: string) => void): Promise<void> {
  const response = await fetch(COLLECTIONS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Gu-Media-Key': API_KEY },
    body: JSON.stringify({ data: E2E_COLLECTION }),
  });

  if (!response.ok) {
    throw new Error(`Collections seed failed: HTTP ${response.status} ${await response.text()}`);
  }

  report(`Seeded collection '${E2E_COLLECTION}'`);
}
