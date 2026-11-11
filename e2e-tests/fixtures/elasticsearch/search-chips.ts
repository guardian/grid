import { createHash } from 'node:crypto';
import { EMAIL_DOMAIN, TEST_ACCOUNTS } from '../../setup/constants.ts';
import type { EsHit, ImageSource } from '../../setup/image-fixtures.ts';

const CURRENT_USER = TEST_ACCOUNTS.fullAccess;
const OTHER_USER = `search-chips-other@${EMAIL_DOMAIN}`;
const BOUNDARY = '2024-06-15T12:00:00.000Z';

export const SEARCH_CHIP_COLLECTION = 'search-chips';

const EXTRA_SUPPLIERS = ['Getty Images', 'PA', 'Rex Features', 'Ronald Grant Archive', 'Action Images'];
const supplierRole = (supplier: string) => `supplier-${supplier.toLowerCase().replaceAll(' ', '-')}`;

export const SEARCH_CHIP_IMAGE_IDS = Object.fromEntries(
    [...'ABCDEFGHIJKLMNOPQRSTUVW', ...EXTRA_SUPPLIERS.map(supplierRole)]
        .map((role) => [role, createHash('sha1').update(`search-chips-${role}`).digest('hex')]),
);

export const SEARCH_CHIP_CORE_IMAGE_IDS = Object.fromEntries(
    [...'ABCDEFGHIJKL'].map((role) => [role, SEARCH_CHIP_IMAGE_IDS[role]]),
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
            metadata: {
                byline: 'Example Contracted Illustrator',
                credit: 'Example Contracted Illustrator',
                subjects: ['arts'],
            },
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
        image('H', { usages: [usage('h-print', 'print', 'published', '2024-06-15T00:00:00.000Z')] }),
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
        image('M', {
            identifiers: { picdarUrn: 'search-chips-persistence-m' },
            uploadInfo: { filename: 'search-chips-m.tiff' },
            source: {
                ...structuredClone(template._source.source as Record<string, unknown>),
                file: `https://search-chips.invalid/originals/${SEARCH_CHIP_IMAGE_IDS.M}`,
                mimeType: 'image/tiff',
            },
            metadata: {
                subjects: [
                    'arts', 'crime', 'disaster', 'finance', 'education', 'environment', 'health',
                    'human', 'labour', 'lifestyle', 'nature', 'news', 'politics', 'religion',
                    'science', 'social', 'sport', 'war', 'weather',
                ],
            },
            usageRights: { category: 'agency', supplier: 'AAP' },
        }),
        image('N', { usageRights: { category: 'commissioned-agency', supplier: 'Alamy' } }),
        image('O', {
            metadata: { title: 'Search chips edited title O' },
            usageRights: { category: 'agency', supplier: 'Allstar Picture Library' },
            userMetadata: {
                archived: false,
                labels: [],
                metadata: { title: 'Search chips edited title O' },
                lastModified: BOUNDARY,
            },
        }),
        image('P', { usageRights: { category: 'pr-and-third-party', source: 'Search Chips PR Office' } }),
        image('Q', { usageRights: { category: 'Bylines' } }),
        image('R', {
            metadata: { byline: 'Example Contracted Photographer' },
            usageRights: {
                category: 'contract-photographer',
                photographer: 'Example Contracted Photographer',
                publication: 'Example publication',
            },
        }),
        image('S', {
            usageRights: {
                category: 'commissioned-photographer',
                photographer: 'Example External Photographer',
                publication: 'Example publication',
            },
        }),
        image('T', {
            metadata: { credit: 'Example Staff Illustrator' },
            usageRights: { category: 'staff-illustrator', creator: 'Example Staff Illustrator' },
        }),
        image('U', {
            metadata: { credit: 'Example Commissioned Illustrator' },
            usageRights: { category: 'commissioned-illustrator', creator: 'Example Commissioned Illustrator' },
        }),
        image('V', {
            usages: [
                {
                    ...usage('v-removed', 'digital', 'removed'),
                    references: [{
                        type: 'frontend',
                        name: 'Search Chips Harbour Story',
                        uri: 'https://search-chips.invalid/stories/harbour',
                    }],
                },
                usage('v-syndicated', 'syndication', 'syndicated'),
                usage('v-downloaded', 'download', 'downloaded'),
                usage('v-derivative', 'digital', 'derivative'),
                usage('v-failed', 'digital', 'failed'),
                usage('v-unknown', 'digital', 'unknown'),
            ],
        }),
        image('W', {
            metadata: { description: 'Search chips topshot agency pick' },
            usageRights: { category: 'agency', supplier: 'EPA' },
            uploadTime: '2000-01-01T12:00:00.000Z',
        }),
        ...EXTRA_SUPPLIERS.map((supplier) => image(supplierRole(supplier), {
            usageRights: { category: 'agency', supplier },
        })),
    ];

    const missingMetadata = fixtures.find((hit) => hit._id === SEARCH_CHIP_IMAGE_IDS.I)!;
    missingMetadata._source.metadata = { title: 'Search chips image I', description: 'Missing optional metadata' };
    missingMetadata._source.originalMetadata = structuredClone(missingMetadata._source.metadata);
    delete missingMetadata._source.suggestMetadataCredit;
    const editedMetadata = fixtures.find((hit) => hit._id === SEARCH_CHIP_IMAGE_IDS.O)!;
    (editedMetadata._source.originalMetadata as Record<string, unknown>).title = 'Search chips image O';
    return fixtures;
}