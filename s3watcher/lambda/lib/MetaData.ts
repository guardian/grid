import type { S3 } from "aws-sdk"
import { ImportAction } from "./Lambda"

// TO DO - can we make some/all these fields required? IE will the metadata always be set on
// objects in the ingest bucket? Think yes for 'upload' route, not sure for 'import'

// TO DO - will we need to parse the "identifier" meta data properties?
// Think these are only relevant for elastic search, but not sure
// there will be a set of (arbitrary?) keys prefixed with with the
// ImageStorageProps.identifierMetadataKeyPrefix ("identifier!")
// see :
// - image-loader/app/model/upload/UploadRequest.scala
// - image-loader/app/model/Uploader.scala : toMetaMap method
export interface Metadata {
  fileName?: string
  uploadImageId?: string
  uploadTime?: string
  uploadedBy?: string
}

// Metadata keys defined in ImageStorageProps, see:
// - common-lib/src/main/scala/com/gu/mediaservice/lib/ImageStorage.scala
const IMAGE_STORAGE_PROPS = {
  filenameMetadataKey: "file-name",
  uploadImageIdMetadataKey: "upload-image-id",
  uploadTimeMetadataKey: "upload-time",
  uploadedByMetadataKey: "uploaded-by",
} as const

/** Fetch metadata from the s3 object to be imported from the ingest bucket
 * and select the relevant values. Throws error if object has no metadata
*/
export const fetchAndParseMetaData = async (
  s3Client: S3,
  event: ImportAction
): Promise<Metadata> => {
  const params = {
    Bucket: event.bucket,
    Key: event.key,
  }

  const { Metadata: metadata } = await s3Client.headObject(params).promise()

  if (!metadata) {
    throw new Error(`No Metadata found on file: ${params.Key}`)
  }

  return {
    fileName: metadata[IMAGE_STORAGE_PROPS.filenameMetadataKey],
    uploadImageId: metadata[IMAGE_STORAGE_PROPS.uploadImageIdMetadataKey],
    uploadTime: metadata[IMAGE_STORAGE_PROPS.uploadTimeMetadataKey],
    uploadedBy: metadata[IMAGE_STORAGE_PROPS.uploadedByMetadataKey],
  }
}
