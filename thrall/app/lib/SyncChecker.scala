package lib

import akka.Done
import akka.actor.ActorSystem
import akka.stream.Materializer
import akka.stream.scaladsl.Source
import com.amazonaws.services.s3.AmazonS3
import com.amazonaws.services.s3.model.ListObjectsV2Request
import com.gu.mediaservice.lib.elasticsearch.InProgress
import com.gu.mediaservice.lib.logging.{GridLogging, LogMarker, MarkerMap}
import lib.elasticsearch.ElasticSearch

import scala.collection.JavaConverters._
import scala.concurrent.duration.DurationInt
import scala.concurrent.{ExecutionContext, ExecutionContextExecutor, Future}
import scala.util.{Failure, Success}

sealed trait SyncCheckJob {}
case class Prefix(prefix: String) extends SyncCheckJob
case object Other extends SyncCheckJob

class SyncChecker(
  s3: AmazonS3,
  es: ElasticSearch,
  imageBucketName: String,
  actorSystem: ActorSystem
) extends GridLogging {

  private val mat = Materializer.matFromSystem(actorSystem)
  private implicit val dispatcher: ExecutionContext = actorSystem.getDispatcher

  private val expectedAlphabet = "0123456789abcdef".split("")
  private val prefixes: Seq[SyncCheckJob] = (for {
    x <- expectedAlphabet
    y <- expectedAlphabet
    z <- expectedAlphabet
  } yield Prefix(s"$x$y$z")) :+ Other

  private def paginatedListObjects(request: ListObjectsV2Request, maybeContinuationToken: Option[String] = None): Future[Seq[String]] = {
    Future {
      val fullRequest = maybeContinuationToken match {
        case Some(token) => request.withContinuationToken(token)
        case None => request
      }
      val result = s3.listObjectsV2(fullRequest)
      val keys = result.getObjectSummaries.asScala.map(_.getKey.split("/").last)
      val nextContinuationToken = Option(result.getNextContinuationToken)
      keys -> nextContinuationToken
    } flatMap {
      case (keys, None) => Future.successful(keys)
      case (keys, Some(token)) =>
        for { extraKeys <- paginatedListObjects(request, Some(token)) } yield keys ++ extraKeys
    }
  }

  private def listFilesWithPrefix(prefix: String): Future[Seq[String]] = {
    val request = new ListObjectsV2Request()
      .withBucketName(imageBucketName)
      .withPrefix(prefix)
    paginatedListObjects(request)
  }
  private def listFilesAtRoot(): Future[Seq[String]] = {
    val request = new ListObjectsV2Request()
      .withBucketName(imageBucketName)
      .withDelimiter("/")
    paginatedListObjects(request)
  }

  private def checkPrefix(prefix: String)(implicit logMarker: LogMarker): Future[Unit] = {
    val esIdsFetch: Future[Set[String]] = es.listImageIdsWithPrefix(prefix).map(_.toSet)

    val s3Prefix = prefix.split("").mkString("/")
    // TODO String? or more complex?
    val s3IdsFetch: Future[Set[String]] = listFilesWithPrefix(s3Prefix).map(_.toSet)

    for {
      esIds <- esIdsFetch
      s3Ids <- s3IdsFetch
    } yield {
      val extrasInS3 = s3Ids diff esIds
      batchedLogs(s"extra images in S3 under prefix $s3Prefix", extrasInS3)

      val extrasInEs = esIds diff s3Ids
      batchedLogs(s"extra images in Elasticsearch under prefix $prefix", extrasInEs)
    }
  }

  private def checkUnprefixed()(implicit logMarker: LogMarker): Future[Unit] = {
    val s3IdsAtRootFetch = listFilesAtRoot()
    val s3IdsAtSlashFetch = listFilesWithPrefix("/")
    // TODO fetch all objects at unexpected locations ie. not at /^([0-9a-f]/){6}[0-9a-f]{34}$/
    //  but that's a lot of prefixes to trawl. better suited to something making use of the s3 inventory that we have?

    val esIdsBadFormatFetch = es.listImageIdsWithUnexpectedFormat()

    for {
      s3IdsAtRoot <- s3IdsAtRootFetch
      s3IdsAtSlash <- s3IdsAtSlashFetch
      esIdsBadFormat <- esIdsBadFormatFetch
    } yield {
      batchedLogs("in S3 root", s3IdsAtRoot)

      batchedLogs("in S3 under '/'", s3IdsAtSlash)

      batchedLogs("in Elasticsearch with unexpected id formats", esIdsBadFormat)
    }
  }

  private def batchedLogs(problem: String, ids: Iterable[String])(implicit logMarker: LogMarker): Unit = {
    ids.grouped(250).foreach(group =>
      logger.warn(logMarker, s"SyncChecker found ${group.size} images $problem: ${group.mkString(",")}")
    )
  }

  private def createStream() = Source.cycle(() => prefixes.toIterator)
    .throttle(1, per = 5.seconds)
    .filterNot(_ => es.migrationIsInProgress)
    .mapAsync(1) {
      case Prefix(prefix) => checkPrefix(prefix)(MarkerMap())
      case Other => checkUnprefixed()(MarkerMap())
    }

  def run(): Future[Done] = {
    val stream = createStream().run()(mat)

    logger.info("SyncChecker stream started")

    stream.onComplete {
      case Failure(exception) => logger.error("SyncChecker stream completed with failure", exception)
      case Success(_) => logger.info("SyncChecker stream completed with done, probably shutting down")
    }

    stream
  }
}
