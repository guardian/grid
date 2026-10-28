import { createHash } from 'node:crypto';
import { EMAIL_DOMAIN, TEST_ACCOUNTS } from '../../setup/constants.ts';
import type { EsHit, ImageSource } from '../../setup/image-fixtures.ts';

const CURRENT_USER = TEST_ACCOUNTS.fullAccess;
const OTHER_USER = `search-chips-other@${EMAIL_DOMAIN}`;
const BOUNDARY = '2024-06-15T12:00:00.000Z';

export const SEARCH_CHIP_COLLECTION = 'search-chips';

export const SEARCH_CHIP_IMAGE_IDS = Object.fromEntries(
    'ABCDEFGHIJKL'.split('').map((role) => [role, createHash('sha1').update(`search-chips-${role}`).digest('hex')]),
);

function usage(name: string, platform: string, status: string, dateAdded = BOUNDARY) {
    return {
        id: `search-chips-${name}`,
        references: [],
        platform,
        media: 'image',
        status,
        dateAdded,
        lastModified: dateAdded,
        ...(platform === 'print' ? {
            printUsageMetadata: {
                sectionName: 'Culture',
                sectionCode: 'CUL',
                issueDate: BOUNDARY,
                pageNumber: 12,
                storyName: 'Harbour festival',
                publicationCode: 'G',
                publicationName: 'The Guardian',
                orderedBy: CURRENT_USER,
            },
        } : {}),
    };
}

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
            keywords: [`search-chips-${role.toLowerCase()}`],
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
            uploadInfo: { filename: `search-chips-${role.toLowerCase()}.jpg` },
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
        image('A', {
            metadata: {
                ...sharedMetadata,
                keywords: ['harbour', 'daylight'],
                subjects: ['arts'],
                peopleInImage: ['Alex Example'],
            },
            usageRights: { category: 'agency', supplier: 'Reuters' },
            uploadTime: '2024-06-14T12:00:00.000Z',
        }),
        image('B', {
            metadata: { ...sharedMetadata, keywords: ['harbour', 'night'], subjects: ['arts'] },
            uploadedBy: OTHER_USER,
            uploadInfo: { filename: 'search-chips-b.png' },
            source: {
                ...structuredClone(template._source.source as Record<string, unknown>),
                file: `https://search-chips.invalid/originals/${SEARCH_CHIP_IMAGE_IDS.B}`,
                mimeType: 'image/png',
            },
            usageRights: { category: 'agency', supplier: 'AP' },
            exports: [{
                id: '0_0_1200_800',
                author: CURRENT_USER,
                date: BOUNDARY,
                specification: {
                    uri: `https://search-chips.invalid/originals/${SEARCH_CHIP_IMAGE_IDS.B}`,
                    bounds: { x: 0, y: 0, width: 1200, height: 800 },
                    aspectRatio: '3:2',
                    type: 'crop',
                },
                assets: [],
            }],
        }),
        image('C', {
            metadata: { city: 'London', country: 'United Kingdom', keywords: ['chargeable'] },
            usageRights: { category: 'pay-to-use' },
        }),
        image('D', {
            metadata: { city: 'Cardiff', country: 'United Kingdom', keywords: ['chargeable'] },
            uploadedBy: OTHER_USER,
            usageRights: { category: 'chargeable' },
            uploadTime: '2024-06-16T12:00:00.000Z',
        }),
        image('E', {
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
        image('F', {
            metadata: { byline: 'Example Contracted Illustrator', subjects: ['arts'] },
            usageRights: {
                category: 'contract-illustrator',
                creator: 'Example Contracted Illustrator',
                publication: 'Example publication',
            },
            leases: {
                leases: [{
                    id: 'search-chips-lease-f',
                    mediaId: SEARCH_CHIP_IMAGE_IDS.F,
                    leasedBy: CURRENT_USER,
                    access: 'allow-use',
                    notes: 'Search chips lease',
                    createdAt: BOUNDARY,
                }],
                lastModified: BOUNDARY,
            },
        }),
        image('G', { usages: [usage('g-print', 'print', 'pending'), usage('g-digital', 'digital', 'published')] }),
        image('H', { usages: [usage('h-print', 'print', 'published')] }),
        image('I'),
        image('J', {
            usages: [
                usage('j-published', 'digital', 'published', '2024-06-14T12:00:00.000Z'),
                usage('j-replaced', 'digital', 'replaced', '2024-06-16T12:00:00.000Z'),
            ],
        }),
        image('K', { softDeletedMetadata: { deleteTime: BOUNDARY, deletedBy: CURRENT_USER } }),
        image('L', {
            uploadedBy: OTHER_USER,
            softDeletedMetadata: { deleteTime: BOUNDARY, deletedBy: OTHER_USER },
        }),
    ];

    const missingMetadata = fixtures.find((hit) => hit._id === SEARCH_CHIP_IMAGE_IDS.I)!;
    missingMetadata._source.metadata = { title: 'Search chips image I', description: 'Missing optional metadata' };
    missingMetadata._source.originalMetadata = structuredClone(missingMetadata._source.metadata);
    delete missingMetadata._source.suggestMetadataCredit;
    return fixtures;
}