package lib

import _root_.rx.lang.scala.Observable
import _root_.rx.lang.scala.subjects.ReplaySubject
import com.gu.contentapi.client.model.v1.Content
import org.joda.time.DateTime

object MergedContentStream {
  val observable: Observable[ContentContainer] =
    LiveCrierContentStream.observable
    .merge(PreviewCrierContentStream.observable)
    .share
  // Ensures that only one poller is created no matter how many subscribers
}

trait ContentStream {
  val observable: ReplaySubject[ContentContainer]
}
object LiveCrierContentStream extends ContentStream {
  val observable = ReplaySubject[ContentContainer]()
}

object PreviewCrierContentStream extends ContentStream {
  val observable = ReplaySubject[ContentContainer]()
}

trait ContentContainer {
  val content: Content
  val lastModified: DateTime
}

case class LiveContentItem(content: Content, lastModified: DateTime) extends ContentContainer
case class PreviewContentItem(content: Content, lastModified: DateTime) extends ContentContainer
