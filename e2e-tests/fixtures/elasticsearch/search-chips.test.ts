import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { E2E_SEARCH_FIELD_ALIASES, generateServiceConfig } from '../../setup/config.ts';
import { loadImageFixtures } from '../../setup/image-fixtures.ts';
import { SEARCH_CHIP_IMAGE_IDS } from './search-chips.ts';

const fixtures = loadImageFixtures().filter((hit) => Object.values(SEARCH_CHIP_IMAGE_IDS).includes(hit._id));
const sourceFor = (role: string) => fixtures.find((hit) => hit._id === SEARCH_CHIP_IMAGE_IDS[role])!._source;

test('search fixtures supply the credit and photoshoot completions the interaction tests select', () => {
    assert.equal(fixtures.length, Object.keys(SEARCH_CHIP_IMAGE_IDS).length);
    assert.equal(sourceFor('harbour-daylight-jpeg').suggestMetadataCredit, 'Search Chips Shared Credit');
    const userMetadata = sourceFor('staff-photo-multi-persisted').userMetadata as { photoshoot: { suggest: string } };
    assert.equal(userMetadata.photoshoot.suggest, 'Search Chips Harbour Shoot');
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
        assert.match(kahuna, /useReaper = true/);
        assert.doesNotMatch(kahuna, /showSendToPhotoSales/);
        assert.match(kahuna, /agencyPicks\.ingredients=/);
        assert.match(mediaApi, /agencyPicks\.ingredients=/);
        assert(common.includes(`field.aliases = ${JSON.stringify(E2E_SEARCH_FIELD_ALIASES)}`));
        for (const spec of ['StaffPhotographer', 'ContractPhotographer']) {
            assert(common.includes(`"com.gu.mediaservice.model.${spec}"`), `Missing ${spec} for photographer suggestions`);
        }
    } finally {
        rmSync(configDir, { recursive: true, force: true });
    }
});