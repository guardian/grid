package model

import java.net.URI
import play.api.libs.json._
import play.api.libs.functional.syntax._
import lib.imaging.IptcMetadata


case class Image(id: String, file: URI, metadata: Option[IptcMetadata]) {

  def asJsValue: JsValue = Json.toJson(this)

  def asJson: String = Json.stringify(asJsValue)
}

object Image {

  private implicit val URIWrites: Writes[URI] = new Writes[URI] {
    def writes(o: URI) = JsString(o.toString)
  }

  implicit val IptcMetadataWrites: Writes[IptcMetadata] = (
    (__ \ "description").writeNullable[String] ~
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
      (__ \ "metadata").write[Option[IptcMetadata]]
    )(unlift(Image.unapply))

}
