/**
 * Core image types derived from the Grid Elasticsearch mapping.
 * See kupua/exploration/mapping.json for the full schema.
 */

export interface ImageDimensions {
  width: number;
  height: number;
}

export interface ImageAsset {
  file?: string;
  secureUrl?: string;
  mimeType: string;
  size?: number;
  dimensions: ImageDimensions;
  orientation?: string;
  orientedDimensions?: ImageDimensions;
  orientationMetadata?: {
    exifOrientation?: number;
  };
}

export interface ImageMetadata {
  title?: string;
  description?: string;
  byline?: string;
  bylineTitle?: string;
  credit?: string;
  creditUri?: string;
  source?: string;
  copyright?: string;
  keywords?: string[];
  subjects?: string[];
  specialInstructions?: string;
  subLocation?: string;
  city?: string;
  state?: string;
  country?: string;
  peopleInImage?: string[];
  dateTaken?: string;
  suppliersReference?: string;
  imageType?: string;
}

export interface UsageRights {
  category?: string;
  photographer?: string;
  supplier?: string;
  suppliersCollection?: string;
  publication?: string;
  creator?: string;
  licence?: string;
  source?: string;
  contentLink?: string;
  restrictions?: string;
}

export interface Lease {
  id: string;
  access: string;
  leasedBy?: string;
  startDate?: string;
  endDate?: string;
  active?: string;
  notes?: string;
  mediaId?: string;
  createdAt?: string;
}

export interface Collection {
  path?: string;
  pathId?: string;
  description?: string;
  actionData?: {
    author?: string;
    date?: string;
  };
}

export interface UsageReference {
  type: string;
  uri?: string;
  name?: string;
}

export interface Usage {
  id: string;
  platform: string;
  status: string;
  media?: string;
  title?: string;
  dateAdded?: string;
  dateRemoved?: string;
  lastModified?: string;
  references?: UsageReference[];
  digitalUsageMetadata?: {
    webUrl?: string;
    webTitle?: string;
    sectionId?: string;
    composerUrl?: string;
  };
  printUsageMetadata?: {
    sectionName?: string;
    publicationName?: string;
    pageNumber?: number;
    edition?: number;
    issueDate?: string;
    orderedBy?: string;
    storyName?: string;
  };
}

export interface Export {
  id?: string;
  type?: string;
  author?: string;
  date?: string;
  master?: ImageAsset;
  assets?: ImageAsset[];
  specification?: Record<string, unknown>;
}

export interface UploadInfo {
  filename?: string;
}

export interface SoftDeletedMetadata {
  deleteTime?: string;
  deletedBy?: string;
}

/**
 * The main Image document as stored in Elasticsearch.
 */
export interface Image {
  id: string;
  uploadTime: string;
  uploadedBy: string;
  lastModified?: string;

  // Assets
  source: ImageAsset;
  thumbnail?: ImageAsset;
  optimisedPng?: ImageAsset;

  // Metadata
  metadata: ImageMetadata;
  originalMetadata?: ImageMetadata;
  userMetadata?: {
    archived?: boolean;
    labels?: string[];
    lastModified?: string;
    metadata?: ImageMetadata;
    usageRights?: UsageRights;
    photoshoot?: {
      title?: string;
    };
  };

  // Rights
  usageRights?: UsageRights;
  originalUsageRights?: UsageRights;
  syndicationRights?: Record<string, unknown>;

  // File metadata (EXIF, IPTC, XMP, etc.)
  fileMetadata?: Record<string, unknown>;

  // Relationships
  exports?: Export[];
  usages?: Usage[];
  leases?: {
    lastModified?: string;
    leases?: Lease[];
  };
  collections?: Collection[];
  identifiers?: Record<string, unknown>;

  // Upload
  uploadInfo?: UploadInfo;

  // Soft delete
  softDeletedMetadata?: SoftDeletedMetadata;
}

