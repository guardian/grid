package model

import com.gu.contentapi.client.model.v1.Content
import scala.util.Try
import java.net.URL
import lib.Config


case class ContentDetails(
  webTitle: String,
  webUrl: String,
  sectionId: String,
  composerUrl: Option[URL] = None
) {
  def toMap = Map[String, String](
    "webTitle" -> webTitle,
    "webUrl" -> webUrl,
    "sectionId" -> sectionId
  ) ++ composerUrl.map("composerUrl" -> _.toString)
}

object ContentDetails {
  def build(content: Content): ContentDetails = {
    ContentDetails(
      content.webTitle,
      content.webUrl,
      content.sectionId.getOrElse("none"),
      composerUrl(content)
    )
  }

  def composerUrl(content: Content): Option[URL] = content.fields
    .flatMap(_.internalComposerCode)
    .flatMap(composerId => {
      Try(new URL(s"${Config.composerBaseUrl}/${composerId}")).toOption
    })

}
