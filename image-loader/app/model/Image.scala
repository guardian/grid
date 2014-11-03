package model

import java.net.URI
import play.api.libs.json._
import play.api.libs.functional.syntax._
import org.joda.time.DateTime

import com.gu.mediaservice.lib.formatting._
import lib.imaging.{FileMetadata, ImageMetadata}


case class Image(id: String,
                 uploadTime: DateTime,
                 uploadedBy: String,
                 source: Asset,
                 thumbnail: Option[Asset],
                 fileMetadata: FileMetadata,
                 metadata: Option[ImageMetadata],
                 archived: Boolean
) {

  def asJsValue: JsValue = Json.toJson(this)

  def asJson: String = Json.stringify(asJsValue)
}

object Image {

  def uploadedNow(id: String,
                  uploadedBy: String,
                  source: Asset,
                  thumbnail: Asset,
                  fileMetadata: FileMetadata,
                  metadata: Option[ImageMetadata],
                  archived: Boolean): Image =
    Image(id, DateTime.now, uploadedBy, source, Some(thumbnail), fileMetadata, metadata, archived)

  implicit val IptcMetadataWrites: Writes[ImageMetadata] =
    ((__ \ "description").write[String] ~
      (__ \ "credit").write[String] ~
      (__ \ "byline").writeNullable[String] ~
      (__ \ "title").writeNullable[String] ~
      (__ \ "copyrightNotice").writeNullable[String] ~
      (__ \ "copyright").writeNullable[String] ~
      (__ \ "suppliersReference").writeNullable[String] ~
      (__ \ "source").writeNullable[String] ~
      (__ \ "specialInstructions").writeNullable[String] ~
      (__ \ "keywords").write[List[String]] ~
      (__ \ "city").writeNullable[String] ~
      (__ \ "country").writeNullable[String]
      )(unlift(ImageMetadata.unapply))

  implicit val FileMetadataWrites: Writes[FileMetadata] = Json.writes[FileMetadata]

  implicit val ImageWrites: Writes[Image] = (
    (__ \ "id").write[String] ~
      (__ \ "uploadTime").write[String].contramap(printDateTime) ~
      (__ \ "uploadedBy").write[String] ~
      (__ \ "source").write[Asset] ~
      (__ \ "thumbnail").writeNullable[Asset] ~
      (__ \ "fileMetadata").write[FileMetadata] ~
      (__ \ "metadata").writeNullable[ImageMetadata] ~
      (__ \ "archived").write[Boolean]
    )(unlift(Image.unapply))

}

case class Dimensions(
  width: Int,
  height: Int
)

object Dimensions {
  implicit val DimensionsWrites: Writes[Dimensions] =
    ((__ \ "width").write[Int] ~ (__ \ "height").write[Int])(unlift(Dimensions.unapply))
}

case class Asset(file: URI,
                 size: Long,
                 mimeType: Option[String],
                 dimensions: Option[Dimensions]
)

object Asset {

  implicit val AssetWrites: Writes[Asset] =
    ((__ \ "file").write[String].contramap((_: URI).toString) ~
      (__ \ "size").write[Long] ~
      (__ \ "mimeType").writeNullable[String] ~
      (__ \ "dimensions").writeNullable[Dimensions]
      )(unlift(Asset.unapply))

}
