package lib

import akka.stream.{Materializer, OverflowStrategy, QueueOfferResult}

import java.time.{Instant, OffsetDateTime}
import akka.{Done, NotUsed}
import akka.stream.alpakka.elasticsearch.ReadResult
import akka.stream.alpakka.elasticsearch.scaladsl.ElasticsearchSource
import akka.stream.scaladsl.Source
import com.gu.mediaservice.lib.aws.UpdateMessage
import com.gu.mediaservice.lib.logging.GridLogging
import com.gu.mediaservice.model.{ExternalThrallMessage, Image, InternalThrallMessage, MigrationMessage}
import com.gu.mediaservice.model.Image.ImageReads
import lib.elasticsearch.ElasticSearch
import org.elasticsearch.client.RestClient
import org.scalacheck.Prop.True
import play.api.libs.json.Json
import spray.json.DefaultJsonProtocol.jsonFormat1
import spray.json.{JsObject, JsonFormat}

import scala.concurrent.{ExecutionContext, Future}

case class MigrationRecord(payload: MigrationMessage, approximateArrivalTimestamp: Instant)

case class MigrationSourceWithSender(
  send: MigrationMessage => Future[Boolean],
  source: Source[MigrationRecord, Future[Done]]
)

object MigrationSourceWithSender extends GridLogging {
  def apply(materializer: Materializer)(implicit ec: ExecutionContext /*es: RestClient*/): MigrationSourceWithSender = {
    // Justin's ideas code
//    implicit val format: JsonFormat[Image] = ???
//    val x = ElasticsearchSource
//      .typed[Image](
//        indexName = "source",
//        typeName = "_doc",
//        query = """{"match_all": {}}"""
//      )
//    val y: Source[MigrationRecord, NotUsed] = x.map { imageResult: ReadResult[Image] =>
//      MigrationRecord(UpdateMessage("migrate-image", Some(imageResult.source)), java.time.Instant.now())
//    }
//    y.mapMaterializedValue(_ => Future.successful(Done))

    // return manually-updatable source until we implement the above properly
    val sourceDeclaration = Source.queue[MigrationRecord](bufferSize = 2, OverflowStrategy.backpressure)
    val (sourceMat, source) = sourceDeclaration.preMaterialize()(materializer)
    MigrationSourceWithSender(
      send = (migrationMessage: MigrationMessage) => sourceMat.offer(MigrationRecord(
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
      source = source.mapMaterializedValue(_ => Future.successful(Done))
    )

  }
}
