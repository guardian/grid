/**
 * Seeds Elasticsearch with image fixtures once the Grid stack is up.
 *
 * The Grid app (media-api/thrall) creates the `images` index with the correct mappings
 * and assigns the `Images_Current` alias on startup. This module waits for that alias to
 * exist, then bulk-inserts the documents from `fixtures/elasticsearch/images.json` into it
 * so searches performed during the tests return them.
 *
 * The fixture is a raw Elasticsearch search response, so documents live at
 * `hits.hits[]` as `{ _id, _source }`. Each document is (re)indexed under its `_id` — the
 * stale `_index` recorded in the fixture is ignored in favour of the live alias.
 */
import * as fs from 'fs';
import * as path from 'path';
import { REPO_ROOT } from './constants';

/** Alias the Grid app assigns to the live images index (dev service-config `es.index.aliases.current`). */
const IMAGES_ALIAS = 'Images_Current';

const FIXTURE_PATH = path.join(
  REPO_ROOT,
  'e2e-tests',
  'fixtures',
  'elasticsearch',
  'images.json',
);

interface EsHit {
  _id: string;
  _source: Record<string, unknown>;
}

interface EsSearchFixture {
  body?: {
    hits?: {
      hits?: EsHit[];
    };
  };
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Poll the alias until the Grid app has created the index and assigned it, so the bulk
 * insert below has a valid write target. Throws if it never appears within the timeout.
 */
async function waitForAlias(esBaseUrl: string, timeoutMs = 60_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastStatus = 'no response';
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${esBaseUrl}/${IMAGES_ALIAS}`);
      if (response.ok) {
        return;
      }
      lastStatus = `HTTP ${response.status}`;
    } catch (error) {
      lastStatus = error instanceof Error ? error.message : String(error);
    }
    await sleep(1000);
  }
  throw new Error(
    `Elasticsearch alias '${IMAGES_ALIAS}' was not assigned within ${timeoutMs}ms (last: ${lastStatus})`,
  );
}

/**
 * Load the image fixtures into Elasticsearch. No-op if the fixture has no documents.
 */
export async function seedElasticsearch(esBaseUrl: string): Promise<void> {
  const fixture = JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8')) as EsSearchFixture;
  const hits = fixture.body?.hits?.hits ?? [];

  if (hits.length === 0) {
    console.warn('No image fixtures found to seed into Elasticsearch');
    return;
  }

  await waitForAlias(esBaseUrl);

  // NDJSON bulk body: an index action line (targeting the document's `_id`) followed by
  // the source document, repeated for every hit.
  const body = hits
    .flatMap((hit) => [JSON.stringify({ index: { _id: hit._id } }), JSON.stringify(hit._source)])
    .join('\n')
    // The bulk API requires a trailing newline.
    .concat('\n');

  // `refresh=wait_for` makes the documents searchable before this call resolves.
  const response = await fetch(`${esBaseUrl}/${IMAGES_ALIAS}/_bulk?refresh=wait_for`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-ndjson' },
    body,
  });

  if (!response.ok) {
    throw new Error(`Elasticsearch bulk seed failed: HTTP ${response.status} ${await response.text()}`);
  }

  const result = (await response.json()) as {
    errors: boolean;
    items: Array<{ index?: { error?: unknown } }>;
  };

  if (result.errors) {
    const firstError = result.items.find((item) => item.index?.error)?.index?.error;
    throw new Error(`Elasticsearch bulk seed reported errors: ${JSON.stringify(firstError)}`);
  }

  console.log(`Seeded ${hits.length} image fixture(s) into Elasticsearch alias '${IMAGES_ALIAS}'`);
}
