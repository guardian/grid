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
    (__ \ "description").write[Option[String]] ~
      (__ \ "byline").write[Option[String]] ~
      (__ \ "title").write[Option[String]] ~
      (__ \ "credit").write[Option[String]] ~
      (__ \ "copyright-notice").write[Option[String]] ~
      (__ \ "source").write[Option[String]] ~
      (__ \ "special-instructions").write[Option[String]] ~
      (__ \ "keywords").write[List[String]] ~
      (__ \ "city").write[Option[String]] ~
      (__ \ "country").write[Option[String]]
    )(unlift(IptcMetadata.unapply))

  implicit val ImageWrites: Writes[Image] = (
    (__ \ "id").write[String] ~
      (__ \ "file").write[URI] ~
      (__ \ "metadata").write[Option[IptcMetadata]]
    )(unlift(Image.unapply))

}
