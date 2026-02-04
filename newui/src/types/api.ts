/**
 * Type definitions for Grid API responses
 */

export type Orientation = 'landscape' | 'portrait'

export interface Dimensions {
  width: number
  height: number
}

export interface ImageAsset {
  file: string
  size: number
  mimeType: string
  dimensions: Dimensions
  orientation: Orientation
  secureUrl: string
}

export interface UploadInfo {
  filename: string
}

export interface ImageMetadata {
  dateTaken?: string
  description?: string
  credit?: string
  byline?: string
  title?: string
  suppliersReference?: string
  source?: string
  keywords?: string[]
  city?: string
  country?: string
  subjects?: string[]
  peopleInImage?: string[]
}

export interface UsageRights {
  category: string
  supplier?: string
}

export interface UriReference {
  uri: string
}

export interface UriDataReference<T> extends UriReference {
  data: T
}

export interface MetadataAction {
  name: string
  href: string
  method: string
}

export interface UserMetadataData {
  archived: UriDataReference<boolean>
  labels: UriDataReference<unknown[]>
  metadata: UriReference & {
    data: Record<string, unknown>
    actions: MetadataAction[]
  }
  usageRights: UriReference
  photoshoot: UriReference
}

export interface LeaseData {
  leases: unknown[]
  lastModified: string | null
}

export interface ImageData {
  id: string
  uploadTime: string
  uploadedBy: string
  lastModified: string
  identifiers: Record<string, unknown>
  uploadInfo: UploadInfo
  source: ImageAsset
  thumbnail: ImageAsset
  fileMetadata: UriReference
  metadata: ImageMetadata
  originalMetadata: ImageMetadata
  usageRights: UsageRights
  originalUsageRights: UsageRights
  exports: unknown[]
  usages: UriDataReference<unknown[]>
  leases: UriDataReference<LeaseData>
  collections: unknown[]
  isPotentiallyGraphic: boolean
  userMetadata: UriDataReference<UserMetadataData>
  valid: boolean
  invalidReasons: Record<string, unknown>
  cost: string
  persisted: {
    value: boolean
    reasons: unknown[]
  }
  syndicationStatus: string
  aliases: Record<string, unknown>
  fromIndex: string
}

export interface Link {
  rel: string
  href: string
}

export interface Action {
  name: string
  href: string
  method: string
}

export interface Image {
  uri: string
  data: ImageData
  links: Link[]
  actions: Action[]
}

export interface TickerCount {
  value: number
  searchClause: string
  backgroundColour: string
}

export interface ImageListResponse {
  offset: number
  length: number
  total: number
  data: Image[]
  links: Link[]
  actions: {
    tickerCounts: Record<string, TickerCount>
  }
}
