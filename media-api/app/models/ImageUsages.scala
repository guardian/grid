package models

import com.gu.contentapi.client.model.v1.Content

case class ImageUsages(contentId: String, webTitle: String, webUrl: String, composerId: Option[String], publishedAt: Option[Long] = None, isLive: Option[Boolean] = None)

object ImageUsages {

  import play.api.libs.json._

  implicit val imageUsagesWrites: Writes[ImageUsages] = Json.writes[ImageUsages]
  implicit val imageUsagesReads: Reads[ImageUsages] = Json.reads[ImageUsages]

  def fromSearchResponse(content: Content) = {
      ImageUsages(
        content.id,
        content.webTitle,
        content.webUrl,
        content.fields.flatMap(_.internalComposerCode),
        content.fields.flatMap(_.firstPublicationDate.map(_.dateTime)),
        content.fields.flatMap(_.isLive)
      )
  }
}
