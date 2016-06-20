package model

import com.gu.crier.model.event.v1.EventPayload.Content
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
      content.content.webTitle,
      content.content.webUrl,
      content.content.sectionId.getOrElse("none"),
      composerUrl(content)
    )
  }

  def composerUrl(content: Content): Option[URL] = content.content.fields
    .flatMap(_.internalComposerCode)
    .flatMap(composerId => {
      Try(new URL(s"${Config.composerBaseUrl}/${composerId}")).toOption
    })

}
