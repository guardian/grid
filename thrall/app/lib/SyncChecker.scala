package lib

import akka.stream.Materializer
import akka.stream.scaladsl.Source
import com.amazonaws.services.s3.AmazonS3
import com.gu.mediaservice.lib.elasticsearch.InProgress
import lib.elasticsearch.ElasticSearch

import scala.concurrent.{ExecutionContext, Future}
import scala.concurrent.duration.DurationInt

sealed trait SyncCheckPart {}
case class Prefixed(x: String, y: String, z: String) extends SyncCheckPart
case object Other extends SyncCheckPart

class SyncChecker(
  materializer: Materializer,
  s3: AmazonS3,
  es: ElasticSearch
)(implicit ec: ExecutionContext) {
  private val expectedAlphabet = "0123456789abcdef".split("")
  private val prefixes: Seq[SyncCheckPart] = (for {
    x <- expectedAlphabet
    y <- expectedAlphabet
    z <- expectedAlphabet
  } yield Prefixed(x, y, z)) :+ Other

  def checkPrefix(x: String, y: String, z: String): Future[Unit] = {

    val esIds: Seq[String] = es.listImageIdsWithPrefix(s"$x$y$z")
  }

  val s = Source.cycle(() => prefixes.toIterator)
    .throttle(1, per = 5.seconds)
    .filter(_ => {
      es.migrationStatus match {
        case InProgress(_) => true
        case _ => false
      }
    })
    .mapAsync(1) {
      case Prefixed(x, y, z) => checkPrefix(x, y, z)
      case Other => checkUnprefixed()
    }
}
