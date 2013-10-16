package model

import java.net.URI
import play.api.libs.json._
import play.api.libs.functional.syntax._
import org.joda.time.DateTime

import com.gu.mediaservice.lib.formatting._
import lib.imaging.IptcMetadata


case class Image(id: String, file: URI,
                 uploadTime: DateTime,
                 thumbnail: Option[Thumbnail],
                 metadata: Option[IptcMetadata]) {

  def asJsValue: JsValue = Json.toJson(this)

  def asJson: String = Json.stringify(asJsValue)
}

object Image {

  def uploadedNow(id: String, file: URI, metadata: Option[IptcMetadata]): Image =
    Image(id, file, DateTime.now, None, metadata)

  implicit val IptcMetadataWrites: Writes[IptcMetadata] =
    ((__ \ "description").writeNullable[String] ~
      (__ \ "byline").writeNullable[String] ~
      (__ \ "title").writeNullable[String] ~
      (__ \ "credit").writeNullable[String] ~
      (__ \ "copyright-notice").writeNullable[String] ~
      (__ \ "source").writeNullable[String] ~
      (__ \ "special-instructions").writeNullable[String] ~
      (__ \ "keywords").write[List[String]] ~
      (__ \ "city").writeNullable[String] ~
      (__ \ "country").writeNullable[String]
    )(unlift(IptcMetadata.unapply))

  implicit val ImageWrites: Writes[Image] = (
    (__ \ "id").write[String] ~
      (__ \ "file").write[URI] ~
      (__ \ "upload-time").write[String].contramap(printDateTime) ~
      (__ \ "thumbnail").writeNullable[Thumbnail] ~
      (__ \ "metadata").writeNullable[IptcMetadata]
    )(unlift(Image.unapply))

}

case class Thumbnail(file: URI, width: Int, height: Int)

object Thumbnail {

  implicit val ThumbnailWrites: Writes[Thumbnail] =
    ((__ \ "file").write[URI] ~
      (__ \ "width").write[Int] ~
      (__ \ "height").write[Int]
    )(unlift(Thumbnail.unapply))

}
