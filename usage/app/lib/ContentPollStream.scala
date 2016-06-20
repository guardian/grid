package lib

import com.gu.crier.model.event.v1.EventPayload.Content

import org.joda.time.DateTime

trait ContentContainer {
  val content: Content
  val lastModified: DateTime
}

case class LiveContentItem(content: Content, lastModified: DateTime) extends ContentContainer
case class PreviewContentItem(content: Content, lastModified: DateTime) extends ContentContainer
