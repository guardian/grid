package model

import java.net.URI
import play.api.libs.json._
import play.api.libs.functional.syntax._
import org.joda.time.DateTime

import com.gu.mediaservice.lib.formatting._
import lib.imaging.IptcMetadata


case class Image(id: String,
                 file: URI,
                 uploadTime: DateTime,
                 thumbnail: Option[Thumbnail],
                 metadata: Option[IptcMetadata],
                 dimensions: Option[Dimensions]) {

  def asJsValue: JsValue = Json.toJson(this)

  def asJson: String = Json.stringify(asJsValue)
}

object Image {

  def uploadedNow(id: String, file: URI, thumbnail: Thumbnail, metadata: Option[IptcMetadata], dimensions: Option[Dimensions]): Image =
    Image(id, file, DateTime.now, Some(thumbnail), metadata, dimensions)

  implicit val IptcMetadataWrites: Writes[IptcMetadata] =
    ((__ \ "description").writeNullable[String] ~
      (__ \ "byline").writeNullable[String] ~
      (__ \ "title").writeNullable[String] ~
      (__ \ "credit").writeNullable[String] ~
      (__ \ "copyrightNotice").writeNullable[String] ~
      (__ \ "source").writeNullable[String] ~
      (__ \ "specialInstructions").writeNullable[String] ~
      (__ \ "keywords").write[List[String]] ~
      (__ \ "city").writeNullable[String] ~
      (__ \ "country").writeNullable[String]
      )(unlift(IptcMetadata.unapply))

  implicit val ImageWrites: Writes[Image] = (
    (__ \ "id").write[String] ~
      (__ \ "file").write[URI] ~
      (__ \ "uploadTime").write[String].contramap(printDateTime) ~
      (__ \ "thumbnail").writeNullable[Thumbnail] ~
      (__ \ "metadata").writeNullable[IptcMetadata] ~
      (__ \ "dimensions").writeNullable[Dimensions]
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

case class Thumbnail(file: URI, dimensions: Option[Dimensions])

object Thumbnail {

  implicit val ThumbnailWrites: Writes[Thumbnail] =
    ((__ \ "file").write[String].contramap((_: URI).toString) ~
     (__ \ "dimensions").writeNullable[Dimensions]
    )(unlift(Thumbnail.unapply))

}
