import { createHash } from 'node:crypto';
import { EMAIL_DOMAIN, TEST_ACCOUNTS } from '../../setup/constants.ts';
import type { EsHit, ImageSource } from '../../setup/image-fixtures.ts';

const CURRENT_USER = TEST_ACCOUNTS.fullAccess;
const OTHER_USER = `search-chips-other@${EMAIL_DOMAIN}`;
const BOUNDARY = '2024-06-15T12:00:00.000Z';

export const SEARCH_CHIP_COLLECTION = 'search-chips';

const EXTRA_SUPPLIERS = ['Getty Images', 'PA', 'Rex Features', 'Ronald Grant Archive', 'Action Images'];
const supplierRole = (supplier: string) => `supplier-${supplier.toLowerCase().replaceAll(' ', '-')}`;

export const SEARCH_CHIP_CORE_ROLES = [
    'harbour-daylight-jpeg',
    'harbour-night-cropped-png',
    'pay-to-use-london',
    'legacy-chargeable-cardiff',
    'staff-photo-multi-persisted',
    'contract-illustration-leased',
    'split-print-and-published-usages',
    'print-published-at-midnight',
    'missing-metadata-unpersisted',
    'published-and-replaced-usages',
    'deleted-own-upload',
    'deleted-other-upload',
];

const SUPPLEMENTAL_ROLES = [
    'tiff-identifier-over-quota',
    'derivative-identifier',
    'replaces-and-persistence-identifiers',
    'legacy-commissioned-agency',
    'edited-title',
    'pr-and-third-party',
    'bylines-rights',
    'contract-photographer',
    'commissioned-photographer',
    'staff-illustrator',
    'commissioned-illustrator',
    'assorted-usages-with-reference',
    'old-agency-pick',
    'aap-quota-usage-1',
    'aap-quota-usage-2',
    ...EXTRA_SUPPLIERS.map(supplierRole),
];

export const SEARCH_CHIP_IMAGE_IDS: Record<string, string> = Object.fromEntries(
    [...SEARCH_CHIP_CORE_ROLES, ...SUPPLEMENTAL_ROLES]
        .map((role) => [role, createHash('sha1').update(`search-chips-${role}`).digest('hex')]),
);

export const SEARCH_CHIP_CORE_IMAGE_IDS = Object.fromEntries(
    SEARCH_CHIP_CORE_ROLES.map((role) => [role, SEARCH_CHIP_IMAGE_IDS[role]]),
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
        image('harbour-night-cropped-png', {
            metadata: { ...sharedMetadata, keywords: ['harbour', 'night'], subjects: ['arts'] },
            uploadedBy: OTHER_USER,
            uploadInfo: { filename: 'search-chips-harbour-night-cropped-png.png' },
            source: {
                ...structuredClone(template._source.source as Record<string, unknown>),
                file: `https://search-chips.invalid/originals/${SEARCH_CHIP_IMAGE_IDS['harbour-night-cropped-png']}`,
                mimeType: 'image/png',
            },
            usageRights: { category: 'agency', supplier: 'AP' },
            exports: [{
                id: '0_0_1200_800',
                author: CURRENT_USER,
                date: BOUNDARY,
                specification: {
                    uri: `https://search-chips.invalid/originals/${SEARCH_CHIP_IMAGE_IDS['harbour-night-cropped-png']}`,
                    bounds: { x: 0, y: 0, width: 1200, height: 800 },
                    aspectRatio: '3:2',
                    type: 'crop',
                },
                assets: [],
            }],
        }),
        image('pay-to-use-london', {
            metadata: { city: 'London', country: 'United Kingdom', keywords: ['chargeable'] },
            usageRights: { category: 'pay-to-use' },
        }),
        image('legacy-chargeable-cardiff', {
            metadata: { city: 'Cardiff', country: 'United Kingdom', keywords: ['chargeable'] },
            uploadedBy: OTHER_USER,
            usageRights: { category: 'chargeable' },
            uploadTime: '2024-06-16T12:00:00.000Z',
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
        image('contract-illustration-leased', {
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
                    id: 'search-chips-lease-contract-illustration',
                    mediaId: SEARCH_CHIP_IMAGE_IDS['contract-illustration-leased'],
                    leasedBy: CURRENT_USER,
                    access: 'allow-use',
                    notes: 'Search chips lease',
                    createdAt: BOUNDARY,
                }],
                lastModified: BOUNDARY,
            },
        }),
        image('split-print-and-published-usages', {
            usages: [usage('split-print', 'print', 'pending'), usage('split-digital', 'digital', 'published')],
        }),
        image('print-published-at-midnight', {
            usages: [usage('midnight-print', 'print', 'published', '2024-06-15T00:00:00.000Z')],
        }),
        image('missing-metadata-unpersisted'),
        image('published-and-replaced-usages', {
            usages: [
                usage('published', 'digital', 'published', '2024-06-14T12:00:00.000Z'),
                usage('replaced', 'digital', 'replaced', '2024-06-16T12:00:00.000Z'),
            ],
        }),
        image('deleted-own-upload', { softDeletedMetadata: { deleteTime: BOUNDARY, deletedBy: CURRENT_USER } }),
        image('deleted-other-upload', {
            uploadedBy: OTHER_USER,
            softDeletedMetadata: { deleteTime: BOUNDARY, deletedBy: OTHER_USER },
        }),
        image('tiff-identifier-over-quota', {
            identifiers: { picdarUrn: 'search-chips-persistence-identifier' },
            uploadInfo: { filename: 'search-chips-tiff-identifier-over-quota.tiff' },
            source: {
                ...structuredClone(template._source.source as Record<string, unknown>),
                file: `https://search-chips.invalid/originals/${SEARCH_CHIP_IMAGE_IDS['tiff-identifier-over-quota']}`,
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
        image('derivative-identifier', {
            identifiers: { 'derivative-of-media-ids': SEARCH_CHIP_IMAGE_IDS['harbour-daylight-jpeg'] },
            usageRights: { category: 'agency', supplier: 'Reuters' },
        }),
        image('replaces-and-persistence-identifiers', {
            identifiers: {
                picdarUrn: 'search-chips-replaces-and-persistence-identifiers',
                'replaces-media-id': SEARCH_CHIP_IMAGE_IDS['harbour-night-cropped-png'],
            },
            usageRights: { category: 'agency', supplier: 'Reuters' },
        }),
        image('legacy-commissioned-agency', { usageRights: { category: 'commissioned-agency', supplier: 'Alamy' } }),
        image('edited-title', {
            metadata: { title: 'Search chips edited title' },
            usageRights: { category: 'agency', supplier: 'Allstar Picture Library' },
            userMetadata: {
                archived: false,
                labels: [],
                metadata: { title: 'Search chips edited title' },
                lastModified: BOUNDARY,
            },
        }),
        image('pr-and-third-party', { usageRights: { category: 'pr-and-third-party', source: 'Search Chips PR Office' } }),
        image('bylines-rights', { usageRights: { category: 'Bylines' } }),
        image('contract-photographer', {
            metadata: { byline: 'Example Contracted Photographer' },
            usageRights: {
                category: 'contract-photographer',
                photographer: 'Example Contracted Photographer',
                publication: 'Example publication',
            },
        }),
        image('commissioned-photographer', {
            usageRights: {
                category: 'commissioned-photographer',
                photographer: 'Example External Photographer',
                publication: 'Example publication',
            },
        }),
        image('staff-illustrator', {
            metadata: { credit: 'Example Staff Illustrator' },
            usageRights: { category: 'staff-illustrator', creator: 'Example Staff Illustrator' },
        }),
        image('commissioned-illustrator', {
            metadata: { credit: 'Example Commissioned Illustrator' },
            usageRights: { category: 'commissioned-illustrator', creator: 'Example Commissioned Illustrator' },
        }),
        image('assorted-usages-with-reference', {
            usages: [
                {
                    ...usage('removed', 'digital', 'removed'),
                    references: [{
                        type: 'frontend',
                        name: 'Search Chips Harbour Story',
                        uri: 'https://search-chips.invalid/stories/harbour',
                    }],
                },
                usage('syndicated', 'syndication', 'syndicated'),
                usage('downloaded', 'download', 'downloaded'),
                usage('derivative', 'digital', 'derivative'),
                usage('failed', 'digital', 'failed'),
                usage('unknown', 'digital', 'unknown'),
            ],
        }),
        image('old-agency-pick', {
            metadata: { description: 'Search chips topshot agency pick' },
            usageRights: { category: 'agency', supplier: 'EPA' },
            uploadTime: '2000-01-01T12:00:00.000Z',
        }),
        ...EXTRA_SUPPLIERS.map((supplier) => image(supplierRole(supplier), {
            usageRights: { category: 'agency', supplier },
        })),
        // Quota counts only include usages added in the last 30 days, so these must be dated at seed time.
        ...['aap-quota-usage-1', 'aap-quota-usage-2'].map((role) => image(role, {
            usageRights: { category: 'agency', supplier: 'AAP' },
            usages: [usage(role, 'print', 'published', new Date().toISOString())],
        })),
    ];

    const missingMetadata = fixtures.find((hit) => hit._id === SEARCH_CHIP_IMAGE_IDS['missing-metadata-unpersisted'])!;
    missingMetadata._source.metadata = {
        title: 'Search chips image missing-metadata-unpersisted',
        description: 'Missing optional metadata',
    };
    missingMetadata._source.originalMetadata = structuredClone(missingMetadata._source.metadata);
    delete missingMetadata._source.suggestMetadataCredit;
    const editedMetadata = fixtures.find((hit) => hit._id === SEARCH_CHIP_IMAGE_IDS['edited-title'])!;
    (editedMetadata._source.originalMetadata as Record<string, unknown>).title = 'Search chips image edited-title';
    return fixtures;
}