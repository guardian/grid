package model

import org.joda.time.{DateTime}
import com.gu.mediaservice.model.{Asset, ImageMetadata, UsageRights, Crop, FileMetadata, Edits}

// Todo: This needs to be argofied
case class ImageResponse(
  id: String,
  uploadTime: DateTime,
  uploadedBy: String,
  lastModified: DateTime,
  source: Asset,
  thumbnail: Asset,
  metadata: ImageMetadata,
  originalMetadata: ImageMetadata,
  usageRights: UsageRights,
  originalUsageRights: UsageRights,
  exports: List[Crop],
  fileMetadata: FileMetadata,
  userMetadata: Edits,
  valid: Boolean,
  cost: String
)
