package lib

import org.joda.time.DateTime
import rx.lang.scala.subjects.PublishSubject

object FastlyUsageStream {
  val observable = PublishSubject[FastlyUsageItem]()
}

case class FastlyUsageItem(
  mediaID: String,
  webUrl: Option[String],
  timestamp: DateTime
)

