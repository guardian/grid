import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { E2E_SEARCH_FIELD_ALIASES, generateServiceConfig } from '../../setup/config.ts';
import { loadImageFixtures } from '../../setup/image-fixtures.ts';
import { SEARCH_CHIP_CORE_IMAGE_IDS, SEARCH_CHIP_IMAGE_IDS } from './search-chips.ts';

const fixtures = loadImageFixtures().filter((hit) => Object.values(SEARCH_CHIP_IMAGE_IDS).includes(hit._id));
const sourceFor = (role: string) => fixtures.find((hit) => hit._id === SEARCH_CHIP_IMAGE_IDS[role])!._source;
const suggestions = readFileSync(new URL('../../../kahuna/public/js/search/structured-query/query-suggestions.ts', import.meta.url), 'utf8');

test('search fixtures preserve stable roles, optional-field absence and usage contrasts', () => {
    assert.equal(fixtures.length, 28);
    assert.equal(new Set(fixtures.map((hit) => hit._id)).size, fixtures.length);
    assert.deepEqual(Object.keys(SEARCH_CHIP_CORE_IMAGE_IDS), [...'ABCDEFGHIJKL']);
    for (const [role, id] of Object.entries(SEARCH_CHIP_CORE_IMAGE_IDS)) assert.equal(id, SEARCH_CHIP_IMAGE_IDS[role]);
    assert.deepEqual(sourceFor('I').metadata, { title: 'Search chips image I', description: 'Missing optional metadata' });
    assert.deepEqual(sourceFor('I').identifiers, {});
    assert.equal(sourceFor('I').userMetadata, undefined);
    assert.deepEqual(sourceFor('I').exports, []);
    assert.deepEqual(sourceFor('I').usages, []);
    assert.deepEqual(sourceFor('I').collections, []);
    const usagesFor = (role: string) => sourceFor(role).usages as { platform: string; status: string }[];
    assert(!usagesFor('G').some((usage) => usage.platform === 'print' && usage.status === 'published'));
    assert(usagesFor('H').some((usage) => usage.platform === 'print' && usage.status === 'published'));
    assert.deepEqual(usagesFor('J').map((usage) => usage.status), ['published', 'replaced']);
});

test('every listed subject, file format, category, supplier and photographer has fixture data', () => {
    const subjects = JSON.parse(suggestions.match(/const subjects = (\[[\s\S]*?\]);/)![1]) as string[];
    const actualSubjects = new Set(fixtures.flatMap((hit) => hit._source.metadata?.subjects as string[] ?? []));
    for (const subject of subjects) assert(actualSubjects.has(subject), `Missing subject ${subject}`);
    const formats = new Set(fixtures.map((hit) => (hit._source.source as { mimeType: string }).mimeType));
    for (const format of ['image/jpeg', 'image/png', 'image/tiff']) assert(formats.has(format), `Missing format ${format}`);
    const categories = new Set(fixtures.map((hit) => hit._source.usageRights?.category));
    for (const category of [
        'pay-to-use', 'chargeable', 'pr-and-third-party', 'agency', 'Bylines', 'staff-photographer',
        'contract-photographer', 'commissioned-photographer', 'contract-illustrator',
        'commissioned-illustrator', 'staff-illustrator', 'commissioned-agency',
    ]) assert(categories.has(category), `Missing category ${category}`);
    const suppliers = new Set(fixtures.map((hit) => hit._source.usageRights?.supplier));
    for (const supplier of [
        'AAP', 'Alamy', 'Allstar Picture Library', 'AP', 'EPA', 'Getty Images', 'PA', 'Reuters',
        'Rex Features', 'Ronald Grant Archive', 'Action Images',
    ]) assert(suppliers.has(supplier), `Missing supplier ${supplier}`);
    const bylines = new Set(fixtures.map((hit) => hit._source.metadata?.byline));
    for (const byline of ['Example External Photographer', 'Example Internal Photographer', 'Example Contracted Photographer']) {
        assert(bylines.has(byline), `Missing photographer ${byline}`);
    }
    for (const role of ['F', 'T', 'U']) {
        assert.equal(sourceFor(role).metadata?.credit, sourceFor(role).usageRights?.creator);
        assert.equal(sourceFor(role).suggestMetadataCredit, sourceFor(role).metadata?.credit);
    }
});

test('usage fixtures cover every model status, offered platform and reference field', () => {
    const usages = fixtures.flatMap((hit) => hit._source.usages as { status: string; platform: string; references: { name?: string; uri?: string }[] }[]);
    const statuses = new Set(usages.map((usage) => usage.status));
    for (const status of ['published', 'pending', 'removed', 'replaced', 'syndicated', 'downloaded', 'derivative', 'failed', 'unknown']) {
        assert(statuses.has(status), `Missing usage status ${status}`);
    }
    const platforms = new Set(usages.map((usage) => usage.platform));
    for (const platform of ['print', 'digital', 'download', 'syndication']) assert(platforms.has(platform), `Missing platform ${platform}`);
    assert(usages.some((usage) => usage.references.some((reference) => reference.name && reference.uri)));
});

test('missing persistence reasons and agency-pick/reapable data have positive records', () => {
    assert.equal((sourceFor('M').identifiers as Record<string, string>).picdarUrn, 'search-chips-persistence-m');
    assert.equal(sourceFor('N').usageRights?.category, 'commissioned-agency');
    const edits = sourceFor('O').userMetadata as { metadata: { title: string } };
    assert.equal(edits.metadata.title, sourceFor('O').metadata?.title);
    assert.notEqual(edits.metadata.title, (sourceFor('O').originalMetadata as { title: string }).title);
    assert.equal(sourceFor('W').uploadTime, '2000-01-01T12:00:00.000Z');
    assert.match(sourceFor('W').metadata?.description as string, /\btopshot\b/);
    assert.deepEqual(sourceFor('W').identifiers, {});
    assert.deepEqual(sourceFor('W').usages, []);
    assert.deepEqual(sourceFor('W').exports, []);
});

test('conditional chips and aliases are enabled consistently in generated e2e config', () => {
    const configDir = mkdtempSync(join(tmpdir(), 'grid-search-chips-'));
    try {
        generateServiceConfig(configDir, {
            IngestSqsQueue: 'http://localhost:4576/search-chips-ingest',
            IndexedImageMetadataQueue: 'http://localhost:4576/search-chips-indexed-metadata',
        }, {});
        const common = readFileSync(join(configDir, 'common.conf'), 'utf8');
        const kahuna = readFileSync(join(configDir, 'kahuna.conf'), 'utf8');
        const mediaApi = readFileSync(join(configDir, 'media-api.conf'), 'utf8');
        assert.match(common, /image\.record\.download = true/);
        assert.match(common, /persistence\.identifier = "picdarUrn"/);
        assert.match(common, /persistence\.onlyTheseCollections = null/);
        assert.match(kahuna, /useReaper = true/);
        assert.match(kahuna, /showSendToPhotoSales = true/);
        assert.match(kahuna, /agencyPicks\.ingredients=/);
        assert.match(mediaApi, /agencyPicks\.ingredients=/);
        assert(common.includes(`field.aliases = ${JSON.stringify(E2E_SEARCH_FIELD_ALIASES)}`));
        for (const alias of E2E_SEARCH_FIELD_ALIASES) {
            const fieldName = alias.elasticsearchPath.split('.')[1];
            const values = fixtures.flatMap((hit) => {
                const value = hit._source.metadata?.[fieldName];
                return Array.isArray(value) ? value : value ? [value] : [];
            });
            assert(values.length > 0, `No positive data for ${alias.alias}`);
            if (alias.matchViaExistence) {
                assert(fixtures.some((hit) => !hit._source.metadata?.[fieldName]));
            } else {
                for (const option of alias.searchHintOptions) assert(values.includes(option), `Missing alias option ${option}`);
            }
        }
    } finally {
        rmSync(configDir, { recursive: true, force: true });
    }
});