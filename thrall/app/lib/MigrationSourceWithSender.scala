package lib

import akka.stream.scaladsl.Source
import akka.stream.{Attributes, Materializer, OverflowStrategy, QueueOfferResult}
import akka.{Done, NotUsed}
import com.gu.mediaservice.GridClient
import com.gu.mediaservice.lib.elasticsearch.InProgress
import com.gu.mediaservice.lib.logging.GridLogging
import com.gu.mediaservice.model.{MigrateImageMessage, MigrationMessage}
import com.sksamuel.elastic4s.requests.searches.SearchHit
import lib.elasticsearch.ElasticSearch
import play.api.libs.ws.WSRequest

import java.time.{Instant, OffsetDateTime}
import scala.concurrent.duration.DurationInt
import scala.concurrent.{ExecutionContext, Future}

case class MigrationRecord(payload: MigrationMessage, approximateArrivalTimestamp: Instant)

case class MigrationSourceWithSender(
  send: MigrationMessage => Future[Boolean],
  manualSource: Source[MigrationRecord, Future[Done]],
  ongoingEsQuerySource: Source[MigrationRecord, Future[Done]]
)

object MigrationSourceWithSender extends GridLogging {
  def apply(
    materializer: Materializer,
    innerServiceCall: WSRequest => WSRequest,
    es: ElasticSearch,
    gridClient: GridClient
  )(implicit ec: ExecutionContext): MigrationSourceWithSender = {

    val esQuerySource =
      Source.repeat(())
        .throttle(1, per = 1.second)
        .statefulMapConcat(() => {
          // This Akka-provided stage is explicitly provided as a way to safely wrap around mutable state.
          // Required here to keep a marker of the current search scroll. Scrolling prevents the
          // next search from picking up the same image ids and inserting them into the flow and
          // causing lots of version comparison failures.
          // Alternatives:
          // - Using the elastic4s `ElasticSource`
          //     (This would be ideal but is tricky due to dependency version conflicts, and it's also
          //     difficult (or impossible?) to change the query value once the stream has been materialized.)
          // - Defining our own version of the ElasticSource using our desired library versions and a system to change
          //   the query value as desired.
          // - Define an Akka actor to handle the querying and wrap around the state.
          var maybeScrollId: Option[String] = None

          _ => {
            val nextIdsToMigrate = ((es.migrationStatus, maybeScrollId) match {
              case (InProgress(migrationIndexName), None) =>
                es.startScrollingImageIdsToMigrate(migrationIndexName).map(resp => {
                  maybeScrollId = if (resp.hits.isEmpty) None else resp.scrollId
                  resp.hits
                })
              case (InProgress(_), Some(scrollId)) =>
                es.continueScrollingImageIdsToMigrate(scrollId).map(resp => {
                  maybeScrollId = if (resp.hits.isEmpty) None else resp.scrollId
                  resp.hits
                })
              case _ => Future.successful(List.empty)
            }).recover { case _ =>
              maybeScrollId = None
              List.empty
            }
            List(nextIdsToMigrate)
          }
        })
        // flatten out the future
        .mapAsync(1)(identity)
        // flatten out the list of image ids
        .mapConcat(searchHits => {
          logger.info(s"Flattening ${searchHits.size} image ids to migrate")
          searchHits
        })
        .filter(_ => {
          es.migrationStatus match {
            case InProgress(_) => true
            case _ => false
          }
        })

    val projectedImageSource: Source[MigrationRecord, NotUsed] = esQuerySource.mapAsync(parallelism = 20) { searchHit: SearchHit => {
      val imageId = searchHit.id
      val migrateImageMessageFuture = (
        for {
          maybeProjection <- gridClient.getImageLoaderProjection(mediaId = imageId, innerServiceCall)
          maybeVersion = Some(searchHit.version)
        } yield MigrateImageMessage(imageId, maybeProjection, maybeVersion)
      ).recover {
        case error => MigrateImageMessage(imageId, Left(s"Failed to project image for id: ${imageId}, message: ${error}"))
      }
      migrateImageMessageFuture.map(message => MigrationRecord(message, java.time.Instant.now()))
    }}

    val manualSourceDeclaration = Source.queue[MigrationRecord](bufferSize = 2, OverflowStrategy.backpressure)
    val (manualSourceMat, manualSource) = manualSourceDeclaration.preMaterialize()(materializer)
    MigrationSourceWithSender(
      send = (migrationMessage: MigrationMessage) => manualSourceMat.offer(MigrationRecord(
        migrationMessage,
        approximateArrivalTimestamp = OffsetDateTime.now().toInstant
      )).map {
        case QueueOfferResult.Enqueued => true
        case _ =>
          logger.warn(s"Failed to add migration message to migration queue: ${migrationMessage}")
          false
      }.recover{
        case error: Throwable =>
          logger.error(s"Failed to add migration message to migration queue: ${migrationMessage}", error)
          false
      },
      manualSource = manualSource.mapMaterializedValue(_ => Future.successful(Done)),
      ongoingEsQuerySource = projectedImageSource.mapMaterializedValue(_ => Future.successful(Done))
    )

  }
}
