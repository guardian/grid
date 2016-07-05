package lib

import _root_.rx.lang.scala.subjects.ReplaySubject
import com.gu.contentapi.client.model.v1.Content
import org.joda.time.DateTime


trait ContentStream {
  val observable: ReplaySubject[ContentContainer]
}
object LiveCrierContentStream extends ContentStream {

  val observable: ReplaySubject[ContentContainer] = ReplaySubject.withSize(20)
}

object PreviewCrierContentStream extends ContentStream {
  val observable: ReplaySubject[ContentContainer] = ReplaySubject.withSize(20)
}

trait ContentContainer {
  val content: Content
  val lastModified: DateTime
}

case class LiveContentItem(content: Content, lastModified: DateTime) extends ContentContainer
case class PreviewContentItem(content: Content, lastModified: DateTime) extends ContentContainer
