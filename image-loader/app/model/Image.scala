package model

import play.api.libs.json._
import play.api.libs.functional.syntax._
import org.joda.time.DateTime

import com.gu.mediaservice.model.{FileMetadata, ImageMetadata, Asset}
import com.gu.mediaservice.lib.formatting._

case class Image(id: String,
                 uploadTime: DateTime,
                 uploadedBy: String,
                 lastModified: Option[DateTime],
                 identifiers: Map[String, String],
                 source: Asset,
                 thumbnail: Option[Asset],
                 fileMetadata: FileMetadata,
                 metadata: ImageMetadata,
                 originalMetadata: ImageMetadata,
                 usageRights: ImageUsageRights,
                 originalUsageRights: ImageUsageRights
) {

  def asJsValue: JsValue = Json.toJson(this)

  def asJson: String = Json.stringify(asJsValue)
}

object Image {
  def fromUploadRequest(
    uploadRequest: UploadRequest,
    source: Asset,
    thumbnail: Asset,
    fileMetadata: FileMetadata,
    metadata: ImageMetadata
  ): Image = {
    val usageRights = ImageUsageRights()
    Image(
      uploadRequest.id,
      uploadRequest.uploadTime,
      uploadRequest.uploadedBy,
      Some(uploadRequest.uploadTime),
      uploadRequest.identifiers,
      source,
      Some(thumbnail),
      fileMetadata,
      metadata,
      metadata,
      usageRights,
      usageRights
    )
  }

  implicit val FileMetadataWrites: Writes[FileMetadata] = Json.writes[FileMetadata]

  implicit val ImageWrites: Writes[Image] = (
    (__ \ "id").write[String] ~
      (__ \ "uploadTime").write[String].contramap(printDateTime) ~
      (__ \ "uploadedBy").write[String] ~
      (__ \ "lastModified").writeNullable[String].contramap(printOptDateTime) ~
      (__ \ "identifiers").write[Map[String, String]] ~
      (__ \ "source").write[Asset] ~
      (__ \ "thumbnail").writeNullable[Asset] ~
      (__ \ "fileMetadata").write[FileMetadata] ~
      (__ \ "metadata").write[ImageMetadata] ~
      (__ \ "originalMetadata").write[ImageMetadata] ~
      (__ \ "usageRights").write[ImageUsageRights] ~
      (__ \ "originalUsageRights").write[ImageUsageRights]
    )(unlift(Image.unapply))

}

