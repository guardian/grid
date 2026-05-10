/**
 * Grid API (media-api) TypeScript types.
 *
 * Derived from the Grid API surface contract audit:
 *   kupua/exploration/docs/01 Research/grid-api-contract-audit-findings.md §9
 *
 * These types are SEPARATE from the ES-derived `Image` type in `src/types/image.ts`.
 * Translation between the two happens at the adapter boundary, never in UI code.
 *
 * Merge direction: ES baseline → API overwrite, never the inverse.
 * ES-sourced fields are the standalone-mode floor. API values overwrite
 * server-computed fields when the API is reachable.
 */

// ─── Argo primitives ─────────────────────────────────────────────────────────

export interface Link {
  rel: string;
  href: string; // absolute URL or RFC 6570 URI template
}

export interface Action {
  name: string;
  href: string;
  method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
}

/**
 * Argo EmbeddedEntity — wraps sub-resources inlined in API responses.
 * `data` is absent when the resource is link-only (e.g. fileMetadata without ?include).
 */
export interface EmbeddedEntity<T> {
  uri: string;
  data?: T;
  links?: Link[];
  actions?: Action[];
}

/**
 * Argo EntityResponse — wraps top-level API responses.
 * Same shape as EmbeddedEntity; distinction is semantic only.
 */
export interface EntityResponse<T> {
  uri?: string;
  data: T;
  links?: Link[];
  actions?: Action[];
}

export interface ArgoErrorResponse {
  errorKey: string;
  errorMessage: string;
  data: null;
  links?: Link[];
}

// ─── Cost & status ────────────────────────────────────────────────────────────

export type Cost = "free" | "conditional" | "pay" | "overquota";

export type SyndicationStatus = "sent" | "queued" | "blocked" | "review" | "unsuitable";

// ─── Assets ──────────────────────────────────────────────────────────────────

export interface Dimensions {
  width: number;
  height: number;
}

export interface Asset {
  file: string; // S3 URI (unsigned, do not use for display)
  size?: number;
  mimeType?: string;
  dimensions?: Dimensions;
  /**
   * Signed S3 URL (source) or unsigned CloudFront URL (thumbnail, crop assets).
   * Always use `secureUrl` for display. See contract §3.2 and §6.1 for signing notes.
   */
  secureUrl?: string;
  orientationMetadata?: unknown;
  orientedDimensions?: Dimensions;
  orientation?: string; // "portrait" | "landscape"
}

// ─── Metadata ────────────────────────────────────────────────────────────────

export interface ImageMetadata {
  dateTaken?: string; // ISO-8601
  description?: string;
  credit?: string;
  creditUri?: string;
  byline?: string;
  bylineTitle?: string;
  title?: string;
  copyright?: string;
  suppliersReference?: string;
  source?: string;
  specialInstructions?: string;
  keywords?: string[];
  subLocation?: string;
  city?: string;
  state?: string;
  country?: string;
  subjects?: string[];
  peopleInImage?: string[];
  domainMetadata?: Record<string, Record<string, unknown>>;
  imageType?: string;
}

// ─── Usage rights ─────────────────────────────────────────────────────────────

/**
 * UsageRights is a tagged union discriminated by `category`.
 * An image with no rights set has usageRights == {} (empty object, not null).
 * The full category list lives in UsageRights.scala.
 */
export interface UsageRightsBase {
  category: string;
  restrictions?: string;
}
export type UsageRights = UsageRightsBase & Record<string, unknown>;
export type EmptyUsageRights = Record<string, never>;

// ─── Crop / Export ───────────────────────────────────────────────────────────

export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type ExportType = "crop" | "full";

export interface CropSpec {
  uri: string; // media-api URI of the source image
  bounds: Bounds;
  aspectRatio?: string; // matches \d+:\d+
  type: ExportType;
  rotation?: number;
}

/**
 * Export (as it appears in image.exports) and Crop (from cropper endpoints)
 * are structurally identical. Crop is the native cropper type.
 */
export interface Export {
  id?: string;
  author?: string;
  date?: string; // ISO-8601
  specification: CropSpec;
  master?: Asset;
  assets: Asset[];
}

export type Crop = Export;

// ─── Leases ──────────────────────────────────────────────────────────────────

export type MediaLeaseType = "allow-use" | "deny-use" | "allow-syndication" | "deny-syndication";

export interface MediaLease {
  id?: string;
  leasedBy?: string;
  startDate?: string; // ISO-8601; absent for deny-syndication leases
  endDate?: string; // ISO-8601; absent for allow-syndication leases
  access: MediaLeaseType;
  notes?: string;
  mediaId: string;
  createdAt: string; // ISO-8601
  active: boolean; // computed: within startDate/endDate window
}

export interface LeasesByMedia {
  leases: MediaLease[];
  lastModified?: string; // ISO-8601
}

// ─── Collections ─────────────────────────────────────────────────────────────

export interface ActionData {
  author: string;
  date: string; // ISO-8601 with timezone offset
}

export interface CollectionResponse {
  path: string[];
  pathId: string; // lowercase path.join("~")
  description: string;
  cssColour?: string;
  actionData: ActionData; // who added this image to the collection and when
}

// ─── Usages ──────────────────────────────────────────────────────────────────

export type UsageType = "print" | "digital" | "syndication" | "front" | "download" | "child";

export type UsageStatus = "pending" | "published" | "removed" | "cancelled";

export interface UsageReference {
  type: string;
  uri?: string;
  name?: string;
}

export interface Usage {
  id: string;
  references: UsageReference[];
  platform: UsageType;
  media: string;
  status: UsageStatus;
  dateAdded?: string;
  dateRemoved?: string;
  lastModified: string;
  printUsageMetadata?: unknown;
  digitalUsageMetadata?: unknown;
  syndicationUsageMetadata?: unknown;
  frontUsageMetadata?: unknown;
  downloadUsageMetadata?: unknown;
  childUsageMetadata?: unknown;
}

// ─── Edits (userMetadata) ────────────────────────────────────────────────────

/** As returned by GET /metadata/{id} — flat Edits shape. */
export interface Edits {
  archived: boolean;
  labels: string[];
  metadata: ImageMetadata;
  usageRights?: UsageRights;
  photoshoot?: { title: string };
  lastModified?: string;
}

/**
 * As inlined in image.userMetadata — each field is its own EmbeddedEntity.
 * Access via: image.userMetadata.data?.archived.data, etc.
 */
export interface EditsEntity {
  archived: EmbeddedEntity<boolean>;
  labels: EmbeddedEntity<EmbeddedEntity<string>[]>;
  metadata: EmbeddedEntity<ImageMetadata>; // has action "set-from-usage-rights"
  usageRights: EmbeddedEntity<UsageRights>; // data absent if no user override set
  photoshoot: EmbeddedEntity<{ title: string } | undefined>;
  lastModified?: string;
}

// ─── Supporting types ─────────────────────────────────────────────────────────

export interface UploadInfo {
  filename?: string;
}

export interface SoftDeletedMetadata {
  deleteTime: string;
  deletedBy: string;
}

export interface SyndicationRights {
  published: string; // ISO-8601 with timezone offset
  suppliers: Array<{
    supplierName: string;
    supplierId: string;
    prAgreement: boolean;
  }>;
  rights: Array<{
    rightCode: string;
    acquired: boolean;
    properties: Array<{
      propertyCode: string;
      expiresOn: string; // ISO-8601 with offset
      value: string;
    }>;
  }>;
  isInferred: boolean;
}

export interface CohereV3Embedding {
  image: number[];
}

export interface CohereV4Embedding {
  image: number[];
}

/**
 * Image embedding vectors. Only `cohereEmbedV4` is currently written to ES.
 * Note: kupua excludes embedding from ES `_source` (SOURCE_EXCLUDES in es-config.ts).
 * The exact wire shape of this field should be verified before use.
 */
export interface Embedding {
  cohereEmbedEnglishV3?: CohereV3Embedding; // not currently written to ES
  cohereEmbedV4?: CohereV4Embedding; // currently the only type written
}

export interface FileMetadata {
  iptc?: Record<string, string>;
  exif?: Record<string, string>;
  exifSub?: Record<string, string>;
  xmp?: Record<string, unknown>; // values are heterogeneous: string, string[], or array-of-arrays
  icc?: Record<string, string>; // long TRC values truncated server-side with REDACTED placeholder
  getty?: Record<string, string>; // only present for Getty images
  colourModel?: string | null;
  colourModelInformation?: Record<string, string>;
}

// ─── Main image types ─────────────────────────────────────────────────────────

/**
 * ImageData — the image payload as returned by `GET /images/{id}` or a search hit.
 *
 * Server-computed fields (`cost`, `valid`, `invalidReasons`, `persisted`,
 * `syndicationStatus`) are always present in any enriched response.
 *
 * Key relationships:
 * - `metadata` is the pre-merged result (original + user edits) — never reconstruct
 *   it client-side; use the server value. See contract §3.2.1.
 * - `valid` and `invalidReasons` can both be non-empty simultaneously —
 *   do NOT use `invalidReasons` as a proxy for `!valid`. See §6.7.1.
 * - `persisted.value` and `canBeDeleted` are fully independent — use the
 *   presence of the `delete` action to determine deletability. See §6.7.2.
 */
export interface ImageData {
  // Always present
  id: string;
  uploadTime: string; // ISO-8601
  uploadedBy: string; // email for human uploads; configured string (e.g. "getty") for SFTP
  identifiers: Record<string, string>;
  uploadInfo: UploadInfo;
  source: Asset;
  /** Pre-computed merged result (originalMetadata baseline + userMetadata.metadata overlay). */
  metadata: ImageMetadata;
  originalMetadata: ImageMetadata;
  usageRights: UsageRights | EmptyUsageRights; // {} (empty object) when no rights set
  originalUsageRights: UsageRights | EmptyUsageRights;
  exports: Export[];
  /** usages.data[n] is EmbeddedEntity<Usage>; access individual usages via usages.data[n].data */
  usages: EmbeddedEntity<EmbeddedEntity<Usage>[]>;
  leases: EmbeddedEntity<LeasesByMedia>;
  collections: EmbeddedEntity<CollectionResponse>[];
  userMetadata: EmbeddedEntity<EditsEntity>;
  cost: Cost;
  valid: boolean;
  /** Failing check IDs → human description. Empty {} when valid. See §6.7.1. */
  invalidReasons: Record<string, string>;
  persisted: { value: boolean; reasons: string[] };
  syndicationStatus: SyndicationStatus;
  fromIndex: string;
  embedding: Embedding | null; // always present in response; null when no embedding

  // Conditionally present
  thumbnail?: Asset;
  optimisedPng?: Asset;
  softDeletedMetadata?: SoftDeletedMetadata;
  lastModified?: string;
  syndicationRights?: SyndicationRights;
  userMetadataLastModified?: string;
  /** data absent unless ?include=fileMetadata is appended to the request */
  fileMetadata?: EmbeddedEntity<FileMetadata>;
  aliases?: Record<string, string>; // config-driven fileMetadata projections; keyset varies per image
}

/**
 * SearchHitImageData — extends ImageData with `isPotentiallyGraphic`.
 *
 * `isPotentiallyGraphic` is a painless-script-computed boolean present on search
 * hits but NOT on `GET /images/{id}` responses (contract §6.6, enrichment-strategy §A).
 * Treat its absence as "unknown", not "false".
 */
export type SearchHitImageData = ImageData & {
  isPotentiallyGraphic?: boolean;
  /** HATEOAS actions from the EmbeddedEntity wrapper (e.g. `delete`). Merged in by unwrapSearchHits. */
  actions?: Action[];
};

/** Full single-image response from `GET /images/{id}`. */
export type ImageResponse = EntityResponse<ImageData>;

// ─── Search response types ────────────────────────────────────────────────────

/**
 * Ticker badges in the search UI — part of the search-level `actions` map.
 * Not to be confused with the per-image `actions[]` HATEOAS array.
 */
export interface TickerCount {
  name: string;
  value: number;
  backgroundColour: string;
  searchClause: string;
  subCounts?: TickerCount[];
}

/**
 * The top-level `actions` field in a search response.
 *
 * IMPORTANT: This is a JSON OBJECT (dict), not an array.
 * The per-image `actions[]` is an array of HATEOAS action descriptors.
 * Same field name, entirely different shape — do not confuse.
 */
export interface SearchResponseActions {
  tickerCounts?: TickerCount[];
}

/**
 * Raw wire format of a search response from `GET /images?q=…`.
 * Each hit is wrapped in EmbeddedEntity<SearchHitImageData>.
 *
 * Use `unwrapSearchHits()` in argo.ts to produce a plain array of image data.
 */
export interface SearchResponseRaw {
  data: EmbeddedEntity<SearchHitImageData>[];
  links?: Link[];
  /** JSON object, NOT an array — see SearchResponseActions */
  actions?: SearchResponseActions;
  offset: number;
  length: number;
  total: number;
}

// ─── HATEOAS root ─────────────────────────────────────────────────────────────

export interface RootResponse {
  data: { description: string };
  links: Link[];
  // No `actions` array at root level (contract §8 correction 4)
}

// ─── clientConfig ─────────────────────────────────────────────────────────────

/**
 * Feature flags and UI copy strings from the Grid deployment.
 *
 * Every field is optional — absence means "flag off" / "feature not configured"
 * (kupua "graceful API absence" directive). Never validate at runtime; degrade.
 *
 * Known fields typed explicitly for Cluster 1 consumers. The index signature
 * lets BBC-only or future deployment-specific fields pass through without type errors.
 *
 * PROD values (7 May 2026 snapshot, redacted):
 *   enableWarningFlags: false, showSendToPhotoSales: false, usePermissionsFilter: false
 *   costFilterLabel: "Free to use only", restrictDownload: true
 *   (all flags relevant to Cluster 1 are identical between PROD and TEST)
 */
export interface ClientConfig {
  // Cluster 1 consumers
  enableWarningFlags?: boolean;
  imagePreviewFlagAlertCopy?: string;
  imagePreviewFlagWarningCopy?: string;
  imagePreviewFlagLeaseAttachedCopy?: string;
  costFilterLabel?: string;
  costFilterChargeable?: boolean;
  usePermissionsFilter?: boolean;
  showSendToPhotoSales?: boolean;
  staffPhotographerOrganisation?: string;
  maybeOrgOwnedValue?: string;
  restrictDownload?: boolean;
  recordDownloadAsUsage?: boolean;
  defaultShouldBlurGraphicImages?: boolean;
  showDenySyndicationWarning?: boolean;
  canDownloadCrop?: boolean;
  usageRightsSummary?: boolean;
  systemName?: string;
  // Pass through unknown deployment-specific or future fields without type errors
  [key: string]: unknown;
}
