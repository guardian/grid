package model

import org.joda.time.{DateTime}
import com.gu.mediaservice.model.{Asset, ImageMetadata, UsageRights, Crop, FileMetadata, Edits}
import com.gu.mediaservice.lib.argo.model.EmbeddedEntity

import java.net.{URLEncoder, URI}

import play.api.libs.json._
import play.api.libs.functional.syntax._


case class ImageResponseData(
  id: String,
  uploadTime: DateTime,
  uploadedBy: String,
  lastModified: DateTime,
  source: Asset,
  thumbnail: Asset,
  metadata: ImageMetadata,
  originalMetadata: ImageMetadata,
  usageRights: Option[UsageRights],
  originalUsageRights: Option[UsageRights],
  exports: Option[List[Crop]],
  fileMetadata: FileMetadata,
  userMetadata: Edits,
  valid: Boolean,
  cost: String
)

object ImageResponseData {
  type SourceEntity = EmbeddedEntity[Asset]
  type ThumbnailEntity = EmbeddedEntity[Asset]
  type FileMetadataEntity = EmbeddedEntity[FileMetadata]
  type UserMetadataEntity = EmbeddedEntity[Edits]

  val fakeUri = URI.create("http://example.com/foo")

  def imageResponseWrites(id: String): Writes[ImageResponseData] = (
    (__ \ "id").write[String] ~
    (__ \ "uploadTime").write[DateTime] ~
    (__ \ "uploadedBy").write[String] ~
    (__ \ "lastModified").write[DateTime] ~
    (__ \ "source").write[SourceEntity].contramap(sourceEntity(_: Asset)) ~
    (__ \ "thumbnail").write[ThumbnailEntity].contramap(thumbnailEntity(_:Asset)) ~
    (__ \ "metadata").write[ImageMetadata] ~
    (__ \ "usageRights").writeNullable[UsageRights] ~
    (__ \ "originalUsageRights").writeNullable[UsageRights] ~
    (__ \ "exports").writeNullable[List[Crop]] ~
    (__ \ "fileMetadata").write[FileMetadataEntity].contramap(fileMetadataEntity(_: FileMetadata)) ~
    (__ \ "userMetadata").write[UserMetadataEntity].contramap(userMetadataEntity(_: Edits)) ~
    (__ \ "valid").write[Boolean] ~
    (__ \ "cost").write[String]
  )(unlift(ImageResponseData.unapply))

  def userMetadataEntity(userMetadata: Edits) = EmbeddedEntity[Edits](fakeUri, Some(userMetadata))
  def fileMetadataEntity(fileMetadata: FileMetadata) = EmbeddedEntity[FileMetadata](fakeUri, Some(fileMetadata))
  def thumbnailEntity(thumbnail: Asset): ThumbnailEntity = EmbeddedEntity[Asset](fakeUri, Some(thumbnail))
  def sourceEntity(source: Asset): SourceEntity = EmbeddedEntity[Asset](fakeUri, Some(source))
}
