package lib

import _root_.rx.lang.scala.Observable
import _root_.rx.lang.scala.subjects.ReplaySubject
import com.gu.contentapi.client.model.v1.Content
import org.joda.time.DateTime

object MergedContentStream {
  val observable: Observable[ContentContainer] =
    LiveCrierContentStream.observable
  //.merge(PreviewContentPollStream.observable)
  //.share
  // Ensures that only one poller is created no matter how many subscribers
}

object LiveCrierContentStream {
  val observable = ReplaySubject[ContentContainer]()
}

//TODO: Preview Content poll stream


trait ContentContainer {
  val content: Content
  val lastModified: DateTime
}

case class LiveContentItem(content: Content, lastModified: DateTime) extends ContentContainer
case class PreviewContentItem(content: Content, lastModified: DateTime) extends ContentContainer
