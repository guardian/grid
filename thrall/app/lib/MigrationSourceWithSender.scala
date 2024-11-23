package lib

import org.apache.pekko.stream.scaladsl.Source
import org.apache.pekko.stream.{Materializer, OverflowStrategy, QueueOfferResult}
import org.apache.pekko.{Done, NotUsed}
import com.gu.mediaservice.GridClient
import com.gu.mediaservice.lib.elasticsearch.{InProgress, Paused}
import com.gu.mediaservice.lib.logging.GridLogging
import com.gu.mediaservice.model.{Instance, MigrateImageMessage, MigrationMessage}
import lib.elasticsearch.{ElasticSearch, ScrolledSearchResults}
import play.api.libs.ws.WSRequest

import java.time.Instant
import scala.concurrent.duration.DurationInt
import scala.concurrent.{ExecutionContext, Future}

case class MigrationRequest(imageId: String, version: Long)
case class MigrationRecord(payload: MigrationMessage, approximateArrivalTimestamp: Instant)

case class MigrationSourceWithSender(
  send: MigrationRequest => Future[Boolean],
  source: Source[MigrationRecord, Future[Done]],
)

object MigrationSourceWithSender extends GridLogging {
  def apply(
    materializer: Materializer,
    innerServiceCall: WSRequest => WSRequest,
    es: ElasticSearch,
    gridClient: GridClient,
    projectionParallelism: Int,
    instance: Instance
  )(implicit ec: ExecutionContext): MigrationSourceWithSender = {
    implicit val i: Instance = instance
    // scroll through elasticsearch, finding image ids and versions to migrate
    // emits MigrationRequest
    val scrollingIdsSource =
      Source.repeat(())
        .throttle(1, per = 1.minute)
        .statefulMapConcat(() => {
          // This Pekko-provided stage is explicitly provided as a way to safely wrap around mutable state.
          // Required here to keep a marker of the current search scroll. Scrolling prevents the
          // next search from picking up the same image ids and inserting them into the flow and
          // causing lots of version comparison failures.
          // Alternatives:
          // - Using the elastic4s `ElasticSource`
          //     (This would be ideal but is tricky due to dependency version conflicts, and it's also
          //     difficult (or impossible?) to change the query value once the stream has been materialized.)
          // - Defining our own version of the ElasticSource using our desired library versions and a system to change
          //   the query value as desired.
          // - Define an Pekko actor to handle the querying and wrap around the state.
          var maybeScrollId: Option[String] = None

          def handleScrollResponse(resp: ScrolledSearchResults) = {
            maybeScrollId = if (resp.hits.isEmpty) {
              // close scroll with provided ID if it exists
              resp.scrollId.foreach(es.closeScroll)
              None
            } else {
              resp.scrollId
            }
            resp.hits
          }

          _ => {
            val nextIdsToMigrate = ((es.migrationStatus(instance), maybeScrollId) match {
              case (Paused(_), _) => Future.successful(List.empty)
              case (InProgress(migrationIndexName), None) =>
                es.startScrollingImageIdsToMigrate(migrationIndexName, instance).map(handleScrollResponse)
              case (InProgress(_), Some(scrollId)) =>
                es.continueScrollingImageIdsToMigrate(scrollId).map(handleScrollResponse)
              case _ => Future.successful(List.empty)
            }).recover { case _ =>
              // close existing scroll if it exists
              maybeScrollId.foreach(es.closeScroll)
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
          if (searchHits.nonEmpty) {
            logger.info(s"Flattening ${searchHits.size} image ids to migrate")
          }
          searchHits.map(hit => MigrationRequest(hit.id, hit.version))
        })
        .filter(_ => es.migrationIsInProgress(instance))

    // receive MigrationRequests to migrate from a manual source (failures retry page, single image migration form, etc.)
    val manualIdsSourceDeclaration = Source.queue[MigrationRequest](bufferSize = 2000)
    val (manualIdsSourceMat, manualIdsSource) = manualIdsSourceDeclaration.preMaterialize()(materializer)

    def submitIdForMigration(request: MigrationRequest) =
      Future (manualIdsSourceMat.offer(request)).map {
        case QueueOfferResult.Enqueued => true
        case _ =>
          logger.warn(s"Failed to add migration message to migration queue: $request")
          false
      }.recover {
        case error: Throwable =>
          logger.error(s"Failed to add migration message to migration queue: $request", error)
          false
      }

    // merge both sources of MigrationRequest
    // priority = true prefers manualIdsSource
    val idsSource = manualIdsSource.mergePreferred(scrollingIdsSource, preferred =  true)

    // project image from MigrationRequest, produce the MigrateImageMessage
    def projectedImageSource(instance: Instance): Source[MigrationRecord, NotUsed] = idsSource.mapAsyncUnordered(projectionParallelism) {
      case MigrationRequest(imageId, version) =>
        val migrateImageMessageFuture = (
          for {
            maybeProjection <- gridClient.getImageLoaderProjection(mediaId = imageId, innerServiceCall)
            maybeVersion = Some(version)
          } yield MigrateImageMessage(imageId, maybeProjection, maybeVersion, instance.id)
        ).recover {
          case error => MigrateImageMessage(imageId, Left(error.toString), instance.id)
        }
        migrateImageMessageFuture.map(message => MigrationRecord(
          payload = message,
          approximateArrivalTimestamp = java.time.Instant.now()
        ))
    }

    MigrationSourceWithSender(
      send = submitIdForMigration,
      source = projectedImageSource(instance).mapMaterializedValue(_ => Future.successful(Done)),
    )
  }
}
