import { createHash } from 'node:crypto';
import { EMAIL_DOMAIN, TEST_ACCOUNTS } from '../../setup/constants.ts';
import type { EsHit, ImageSource } from '../../setup/image-fixtures.ts';

const CURRENT_USER = TEST_ACCOUNTS.fullAccess;
const OTHER_USER = `search-chips-other@${EMAIL_DOMAIN}`;
const BOUNDARY = '2024-06-15T12:00:00.000Z';

export const SEARCH_CHIP_COLLECTION = 'search-chips';

const SEARCH_CHIP_ROLES = [
    'harbour-daylight-jpeg',
    'staff-photo-multi-persisted',
    'contract-illustration-leased',
    'missing-metadata-unpersisted',
    'deleted-own-upload',
    'deleted-other-upload',
    'staff-illustrator',
    'commissioned-illustrator',
    'assorted-usages-with-reference',
];

export const SEARCH_CHIP_IMAGE_IDS: Record<string, string> = Object.fromEntries(
    SEARCH_CHIP_ROLES.map((role) => [role, createHash('sha1').update(`search-chips-${role}`).digest('hex')]),
);

function usage(name: string, platform: string, status: string) {
    return {
        id: `search-chips-${name}`,
        references: [],
        platform,
        media: 'image',
        status,
        dateAdded: BOUNDARY,
        lastModified: BOUNDARY,
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

    const fixtures = [
        image('harbour-daylight-jpeg', {
            metadata: {
                description: 'Harbour festival at the waterfront',
                credit: 'Search Chips Shared Credit',
                city: 'Bristol',
                state: 'Somerset',
                country: 'United Kingdom',
                subLocation: 'Harbourside',
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
        image('missing-metadata-unpersisted'),
        image('deleted-own-upload', { softDeletedMetadata: { deleteTime: BOUNDARY, deletedBy: CURRENT_USER } }),
        image('deleted-other-upload', {
            uploadedBy: OTHER_USER,
            softDeletedMetadata: { deleteTime: BOUNDARY, deletedBy: OTHER_USER },
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
    ];

    const missingMetadata = fixtures.find((hit) => hit._id === SEARCH_CHIP_IMAGE_IDS['missing-metadata-unpersisted'])!;
    missingMetadata._source.metadata = {
        title: 'Search chips image missing-metadata-unpersisted',
        description: 'Missing optional metadata',
    };
    missingMetadata._source.originalMetadata = structuredClone(missingMetadata._source.metadata);
    delete missingMetadata._source.suggestMetadataCredit;
    return fixtures;
}