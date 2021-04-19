package lib

import java.time.Instant

import akka.Done
import akka.stream.scaladsl.Source

import scala.concurrent.Future

case class ReingestionRecord(payload: Array[Byte], approximateArrivalTimestamp: Instant)

//class ReingestionSource extends Source[ReingestionRecord, Future[Done]] {
//
//}


object ReingestionSource {
  def apply(): Source[ReingestionRecord, Future[Done]] = ???
}
