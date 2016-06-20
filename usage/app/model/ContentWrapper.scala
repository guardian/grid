package model

import com.gu.crier.model.event.v1.EventPayload.Content
import com.gu.mediaservice.model.UsageStatus

import org.joda.time.DateTime


case class ContentWrapper(
  id: String,
  status: UsageStatus,
  lastModified: DateTime,
  content: Content
)
object ContentWrapper {
  def build(content: Content, status: UsageStatus, lastModified: DateTime): Option[ContentWrapper] = {
    extractId(content).map(ContentWrapper(_, status, lastModified, content))
  }

  def extractId(content: Content): Option[String] = {
    content.content.fields.flatMap(_.internalComposerCode).map(composerId => s"composer/${composerId}")
  }
}
