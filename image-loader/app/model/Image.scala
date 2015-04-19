package model

import java.net.URI
import play.api.libs.json._
import play.api.libs.functional.syntax._
import org.joda.time.DateTime

import com.gu.mediaservice.model.FileMetadata
import com.gu.mediaservice.lib.formatting._
import com.gu.mediaservice.model.ImageMetadata
import com.gu.mediaservice.model.Asset

case class Image(id: String,
                 uploadTime: DateTime,
                 uploadedBy: String,
                 lastModified: Option[DateTime],
                 identifiers: Map[String, String],
                 source: Asset,
                 thumbnail: Option[Asset],
                 fileMetadata: FileMetadata,
                 metadata: ImageMetadata,
                 originalMetadata: ImageMetadata
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
      metadata
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
      (__ \ "originalMetadata").write[ImageMetadata]
    )(unlift(Image.unapply))

}

