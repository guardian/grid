/**
 * Loads and queries the image fixtures in `fixtures/elasticsearch/images.json`, which
 * seed-elasticsearch.ts seeds into Elasticsearch. Steps look up seeded images by what they are
 * rather than hard-coding ids that break when the fixture changes.
 *
 * The fixture is a raw Elasticsearch search response, so documents live at `hits.hits[]`.
 */
import * as fs from 'fs';
import * as path from 'path';
import { createHash } from 'node:crypto';
import { REPO_ROOT, TEST_ACCOUNTS } from './constants.ts';

const FIXTURE_PATH = path.join(REPO_ROOT, 'e2e-tests', 'fixtures', 'elasticsearch', 'images.json');

/** Only the fields queried here are typed; the rest pass through to Elasticsearch untouched. */
export interface ImageSource {
  usageRights?: { category?: string; supplier?: string; suppliers?: string; restrictions?: string };
  metadata?: { credit?: string };
  uploadedBy?: string;
  [key: string]: unknown;
}

export interface EsHit {
  _id: string;
  _source: ImageSource;
}

interface EsSearchFixture {
  body?: {
    hits?: {
      hits?: EsHit[];
    };
  };
}

let cachedHits: EsHit[] | undefined;

export function loadImageFixtures(): EsHit[] {
  if (!cachedHits) {
    const fixture = JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8')) as EsSearchFixture;
    const hits = fixture.body?.hits?.hits ?? [];
    if (hits.length === 0) {
      throw new Error('No image fixtures found to seed into Elasticsearch. This is unexpected - failing early');
    }
    // These variants exercise usage summaries and ownership without changing the original images.
    const summaryImages = [
      { name: 'Payable image', usageRights: { category: 'pay-to-use' }, credit: 'E2E photographer' },
      { name: 'BBC free image', usageRights: { category: 'public-domain' }, credit: 'BBC' },
      { name: 'Non-BBC free image', usageRights: { category: 'public-domain' }, credit: 'E2E photographer' },
      { name: 'AP free image', usageRights: { category: 'agency', supplier: 'AP' }, credit: 'AP' },
      {
        name: 'PA free image',
        usageRights: { category: 'agency', supplier: 'PA' },
        credit: 'PA',
        uploadedBy: 'PA_AutoIngest',
      },
      {
        name: 'Restricted account owned image',
        usageRights: { category: 'pay-to-use' },
        credit: 'E2E photographer',
        uploadedBy: TEST_ACCOUNTS.restricted,
      },
    ].map(({ name, usageRights, credit, uploadedBy }) => {
      const id = createHash('sha1').update(name).digest('hex');
      return {
        _id: id,
        _source: {
          ...hits[0]._source,
          id,
          usageRights,
          originalUsageRights: usageRights,
          metadata: { ...hits[0]._source.metadata, credit },
          uploadedBy: uploadedBy ?? 'e2e-fixtures',
        },
      };
    });
    cachedHits = [...hits, ...summaryImages];
  }
  return cachedHits;
}

/**
 * The id of the first seeded image, in fixture order, whose source matches `predicate`.
 * @param description completes the error message, e.g. "with no usage rights category".
 */
export function findSeededImageId(description: string, predicate: (source: ImageSource) => boolean): string {
  const hit = loadImageFixtures().find((h) => predicate(h._source));
  if (!hit) {
    throw new Error(`No seeded image in fixtures/elasticsearch/images.json ${description}`);
  }
  return hit._id;
}

/** NoRights is stored as `{}`, so an image without a category has no usage rights. */
export const hasNoUsageRights = (source: ImageSource): boolean => !source.usageRights?.category;
