package model

import java.net.URL

import com.gu.contentapi.client.model.v1.Content
import lib.UsageConfig

import scala.util.Try

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

class ContentDetailsOps(config: UsageConfig) {
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
      Try(new URL(s"${config.composerContentBaseUrl}/$composerId")).toOption
    })

}
