package lib

import akka.stream.{Materializer, OverflowStrategy, QueueOfferResult}

import java.time.{Instant, OffsetDateTime}
import akka.{Done, NotUsed}
import akka.stream.alpakka.elasticsearch.{ElasticsearchSourceSettings, ReadResult}
import akka.stream.alpakka.elasticsearch.scaladsl.ElasticsearchSource
import akka.stream.scaladsl.Source
import com.gu.mediaservice.GridClient
import com.gu.mediaservice.lib.aws.UpdateMessage
import com.gu.mediaservice.lib.logging.GridLogging
import com.gu.mediaservice.model.{ExternalThrallMessage, Image, InternalThrallMessage, MigrateImageMessage, MigrationMessage}
import com.gu.mediaservice.model.Image.ImageReads
import lib.elasticsearch.ElasticSearch
import org.elasticsearch.client.RestClient
import org.scalacheck.Prop.True
import play.api.libs.json.Json
import play.api.libs.ws.WSRequest
import spray.json.DefaultJsonProtocol.jsonFormat1
import spray.json.{JsObject, JsonFormat}

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

    val esQuerySource = ElasticsearchSource
      .create(
        indexName = es.imagesCurrentAlias,
        typeName = "_doc",
        settings = ElasticsearchSourceSettings().withIncludeDocumentVersion(true),
        query = s"""{
                  |  "query": {
                  |    "bool": {
                  |      "must_not": [
                  |        {
                  |          "match": {
                  |            "esInfo.migration.migratedTo": "images_2021-08-26_10-29-39_4c142c5"
                  |          }
                  |        },
                  |        {
                  |          "exists": {
                  |            "field": "esInfo.migration.failures.images_2021-08-26_10-29-39_4c142c5"
                  |          }
                  |        }
                  |      ]
                  |    }
                  |  }
                  |}""".stripMargin
      )(es.restClient).throttle(1, per = 1.minute)
    val projectedImageSource: Source[MigrationRecord, NotUsed] = esQuerySource.mapAsync(parallelism = 1) { rawImageResult: ReadResult[JsObject] => {
      val imageId = rawImageResult.id
      val migrateImageMessageFuture = (
        for {
          maybeProjection <- gridClient.getImageLoaderProjection(mediaId = imageId, innerServiceCall)
          maybeVersion = rawImageResult.version
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
