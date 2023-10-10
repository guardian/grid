import type { S3 } from "aws-sdk"
import { ImportAction } from "./Lambda"

export interface Metadata {
  fileName?: string
  uploadImageId?: string
}

// Metadata keys defined in ImageStorageProps, see:
// - common-lib/src/main/scala/com/gu/mediaservice/lib/ImageStorage.scala
const IMAGE_STORAGE_PROPS = {
  filenameMetadataKey: "file-name",
  uploadImageIdMetadataKey: "upload-image-id",
} as const

export const fetchAndParseMetaData = async (
  s3Client: S3,
  event: ImportAction
): Promise<Metadata> => {
  const params = {
    Bucket: event.bucket,
    Key: event.key,
  }

  const metaData = await s3Client.headObject(params).promise()

  return {
    fileName: metaData.Metadata?.[IMAGE_STORAGE_PROPS.filenameMetadataKey],
    uploadImageId:
      metaData.Metadata?.[IMAGE_STORAGE_PROPS.uploadImageIdMetadataKey],
  }
}
