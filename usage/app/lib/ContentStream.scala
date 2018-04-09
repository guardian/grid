package lib

import rx.lang.scala.subjects.PublishSubject
import com.gu.contentapi.client.model.v1.Content
import org.joda.time.DateTime

trait ContentStream {
  val observable = PublishSubject[ContentContainer]
}
object LiveCrierContentStream extends ContentStream {
  override val observable = PublishSubject[ContentContainer]()
}

object PreviewCrierContentStream extends ContentStream {
  override val observable = PublishSubject[ContentContainer]()
}

trait ContentContainer {
  val content: Content
  val lastModified: DateTime
  val isReindex: Boolean
}

case class LiveContentItem(content: Content, lastModified: DateTime, isReindex: Boolean = false) extends ContentContainer
case class PreviewContentItem(content: Content, lastModified: DateTime, isReindex: Boolean = false) extends ContentContainer
