import { createHash } from 'node:crypto';
import { TEST_ACCOUNTS } from '../../setup/constants.ts';
import type { EsHit, ImageSource } from '../../setup/image-fixtures.ts';

const CURRENT_USER = TEST_ACCOUNTS.fullAccess;
const BOUNDARY = '2024-06-15T12:00:00.000Z';

const SEARCH_CHIP_COLLECTION = 'search-chips';

const SEARCH_CHIP_ROLES = [
    'harbour-daylight-jpeg',
    'staff-photo-multi-persisted',
];

export const SEARCH_CHIP_IMAGE_IDS: Record<string, string> = Object.fromEntries(
    SEARCH_CHIP_ROLES.map((role) => [role, createHash('sha1').update(`search-chips-${role}`).digest('hex')]),
);

export function searchChipImageFixtures(template: EsHit): EsHit[] {
    function image(role: string, overrides: ImageSource = {}): EsHit {
        const id = SEARCH_CHIP_IMAGE_IDS[role];
        const metadata = {
            title: `Search chips image ${role}`,
            description: `Search chips fixture ${role}`,
            credit: 'Search Chips Agency',
            byline: 'Example External Photographer',
            copyright: 'Search Chips Copyright',
            source: 'Search Chips Wire',
            suppliersReference: `search-chips-${role}`,
            specialInstructions: 'Editorial use only',
            keywords: [`search-chips-${role}`],
            subjects: ['news'],
            peopleInImage: [],
            dateTaken: BOUNDARY,
            ...overrides.metadata,
        };
        const source = {
            ...structuredClone(template._source.source as Record<string, unknown>),
            file: `https://search-chips.invalid/originals/${id}`,
        };
        const thumbnail = {
            ...structuredClone(template._source.thumbnail as Record<string, unknown>),
            file: source.file,
        };
        const imageSource: ImageSource = {
            id,
            uploadTime: BOUNDARY,
            uploadedBy: CURRENT_USER,
            lastModified: BOUNDARY,
            identifiers: {},
            uploadInfo: { filename: `search-chips-${role}.jpg` },
            source,
            thumbnail,
            fileMetadata: { iptc: {}, exif: {}, exifSub: {}, xmp: {} },
            metadata,
            usageRights: {},
            exports: [],
            usages: [],
            leases: { leases: [], lastModified: null },
            collections: [],
            ...overrides,
        };
        imageSource.metadata = metadata;
        imageSource.originalMetadata = structuredClone(metadata);
        imageSource.originalUsageRights = structuredClone(imageSource.usageRights);
        imageSource.suggestMetadataCredit = metadata.credit;
        return { _id: id, _source: imageSource };
    }

    const sharedMetadata = {
        description: 'Harbour festival at the waterfront',
        credit: 'Search Chips Shared Credit',
        city: 'Bristol',
        state: 'Somerset',
        country: 'United Kingdom',
        subLocation: 'Harbourside',
    };

    const fixtures = [
        image('harbour-daylight-jpeg', {
            metadata: {
                ...sharedMetadata,
                keywords: ['harbour', 'daylight'],
                subjects: ['arts'],
                peopleInImage: ['Alex Example'],
            },
            usageRights: { category: 'agency', supplier: 'Reuters' },
            uploadTime: '2024-06-14T12:00:00.000Z',
        }),
        image('staff-photo-multi-persisted', {
            metadata: { byline: 'Example Internal Photographer', subjects: ['sport'] },
            usageRights: {
                category: 'staff-photographer',
                photographer: 'Example Internal Photographer',
                publication: 'Example publication',
            },
            userMetadata: {
                archived: true,
                labels: ['search-chips-featured'],
                photoshoot: { title: 'Search Chips Harbour Shoot', suggest: 'Search Chips Harbour Shoot' },
                metadata: {},
                lastModified: BOUNDARY,
            },
            collections: [{
                path: [SEARCH_CHIP_COLLECTION],
                pathId: SEARCH_CHIP_COLLECTION,
                description: SEARCH_CHIP_COLLECTION,
                actionData: { author: CURRENT_USER, date: BOUNDARY },
            }],
        }),
    ];
    return fixtures;
}