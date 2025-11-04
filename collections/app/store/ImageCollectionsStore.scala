package store

import com.gu.mediaservice.model.{ActionData, Collection}
import lib.CollectionsConfig
import org.joda.time.DateTime
import org.scanamo.{DynamoFormat, DynamoReadError, ScanamoAsync, Table}
import software.amazon.awssdk.services.dynamodb.DynamoDbAsyncClient

import scala.concurrent.Future
import cats.implicits._
import com.gu.mediaservice.lib.aws.NoItemFound
import org.scanamo.syntax._

import scala.concurrent.ExecutionContext.Implicits.global

case class Record(id: String, collection: List[Collection])

class ImageCollectionsStore(config: CollectionsConfig) {

  lazy val client: DynamoDbAsyncClient = config.withAWSCredentialsV2(DynamoDbAsyncClient.builder()).build()

  import org.scanamo.generic.semiauto._
  implicit val dateTimeFormat: Typeclass[DateTime] =
    DynamoFormat.coercedXmap[DateTime, String, IllegalArgumentException](DateTime.parse, _.toString)
  implicit val actionData: DynamoFormat[ActionData] = deriveDynamoFormat[ActionData]
  implicit val collection: DynamoFormat[Collection] = deriveDynamoFormat[Collection]
  implicit val Record: DynamoFormat[Record] = deriveDynamoFormat[Record]

  private lazy val imageCollectionsTable = Table[Record](config.collectionsTable)

  private def handleError[T, U](result: Either[DynamoReadError, T])(f: T => U) = {
    result.fold(
      error => Future.failed(CollectionsStoreDynamoError(error)),
      success => Future.successful(f(success))
    )
  }

  def get(id: String): Future[List[Collection]] = {
    ScanamoAsync(client).exec(imageCollectionsTable.get("id" === id)).flatMap(maybeEither =>
      maybeEither.fold[Future[List[Collection]]](
        Future.failed(NoItemFound)
      )(res =>
        handleError(res)(record => record.collection)
      )
    )
  }

}
