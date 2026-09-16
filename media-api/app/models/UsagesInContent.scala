package models

import com.gu.contentapi.client.model.v1.Content
import lib.MediaApiConfig

case class UsagesInContent(contentId: String, webTitle: String, webUrl: String, composerUrl: Option[String], publishedAt: Option[Long] = None, isLive: Option[Boolean] = None)

object UsagesInContent {

  import play.api.libs.json._

  implicit val imageUsagesWrites: Writes[UsagesInContent] = Json.writes[UsagesInContent]
  implicit val imageUsagesReads: Reads[UsagesInContent] = Json.reads[UsagesInContent]

  def fromSearchResponse(content: Content, composerDomain: String) = {
    UsagesInContent(
        content.id,
        content.webTitle,
        content.webUrl,
        content.fields.flatMap(_.internalComposerCode.map(code => s"${composerDomain}content/${code}")),
        content.fields.flatMap(_.firstPublicationDate.map(_.dateTime)),
        content.fields.flatMap(_.isLive)
      )
  }
}
