package models

import com.gu.contentapi.client.model.v1.Content
import lib.MediaApiConfig

case class ImageUsages(contentId: String, webTitle: String, webUrl: String, composerUrl: Option[String], publishedAt: Option[Long] = None, isLive: Option[Boolean] = None)

object ImageUsages {

  import play.api.libs.json._

  implicit val imageUsagesWrites: Writes[ImageUsages] = Json.writes[ImageUsages]
  implicit val imageUsagesReads: Reads[ImageUsages] = Json.reads[ImageUsages]

  def fromSearchResponse(content: Content, composerDomain: String) = {
      ImageUsages(
        content.id,
        content.webTitle,
        content.webUrl,
        content.fields.flatMap(_.internalComposerCode.map(code => s"${composerDomain}content/${code}")),
        content.fields.flatMap(_.firstPublicationDate.map(_.dateTime)),
        content.fields.flatMap(_.isLive)
      )
  }
}
