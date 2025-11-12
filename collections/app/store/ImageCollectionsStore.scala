package store

import com.gu.mediaservice.model.{ActionData, Collection}
import lib.CollectionsConfig
import org.joda.time.DateTime
import org.scanamo.generic.auto.genericDerivedFormat
import org.scanamo.{DynamoFormat, ScanamoAsync, Table}
import software.amazon.awssdk.services.dynamodb.DynamoDbAsyncClient

import scala.concurrent.Future
import cats.implicits._
import com.gu.mediaservice.lib.aws.NoItemFound
import org.scanamo.syntax._

import scala.concurrent.ExecutionContext.Implicits.global

case class ImageRecord(id: String, collections: List[Collection])

class ImageCollectionsStore(config: CollectionsConfig) extends DynamoHelpers {

  override val tableName = config.imageCollectionsTable
  lazy val client: DynamoDbAsyncClient = config.withAWSCredentialsV2(DynamoDbAsyncClient.builder()).build()

  import org.scanamo.generic.semiauto._
  implicit val dateTimeFormat: Typeclass[DateTime] =
    DynamoFormat.coercedXmap[DateTime, String, IllegalArgumentException](DateTime.parse, _.toString)
  implicit val actionData: DynamoFormat[ActionData] = deriveDynamoFormat[ActionData]
  implicit val collection: DynamoFormat[Collection] = deriveDynamoFormat[Collection]
  implicit val imageRecord: DynamoFormat[ImageRecord] = deriveDynamoFormat[ImageRecord]

  private lazy val imageCollectionsTable = Table[ImageRecord](tableName)

  def get(id: String): Future[List[Collection]] = {
    ScanamoAsync(client).exec(imageCollectionsTable.get("id" === id)).flatMap(maybeEither =>
      maybeEither.fold[Future[List[Collection]]](
        Future.failed(NoItemFound)
      )(res =>
        handleResponse(res)(record => record.collections)
      )
    )
  }

  def add(id: String, collection: Collection): Future[List[Collection]] = {
    ScanamoAsync(client).exec(imageCollectionsTable.update("id" === id, append("collections", collection))).flatMap(res => {
      handleResponse(res)(res => res.collections)
    })
  }

  def update(id: String, collections: List[Collection]): Future[List[Collection]] = {
    ScanamoAsync(client).exec(imageCollectionsTable.update("id" === id, set("collections", collections))).flatMap(res => {
      handleResponse(res)(res => res.collections)
    })
  }
}
