package store

import com.gu.mediaservice.lib.collections.CollectionsManager
import com.gu.mediaservice.model.{ActionData, Collection}
import lib.CollectionsConfig
import org.joda.time.DateTime
import org.scanamo.generic.auto.genericDerivedFormat
import org.scanamo.{DynamoFormat, ScanamoAsync, Table}
import org.scanamo.syntax._
import software.amazon.awssdk.services.dynamodb.DynamoDbAsyncClient

import scala.concurrent.ExecutionContext.Implicits.global
import scala.concurrent.Future
import cats.implicits._
import org.scanamo.generic.semiauto.FieldName

case class Record(id: String, collection: Collection)

class CollectionsStore(config: CollectionsConfig) extends DynamoHelpers {
  override val tableName: FieldName = config.collectionsTable
  lazy val client: DynamoDbAsyncClient = config.withAWSCredentialsV2(DynamoDbAsyncClient.builder()).build()
  import org.scanamo.generic.semiauto._
  implicit val dateTimeFormat: Typeclass[DateTime] =
    DynamoFormat.coercedXmap[DateTime, String, IllegalArgumentException](DateTime.parse, _.toString)
  implicit val actionData: DynamoFormat[ActionData] = deriveDynamoFormat[ActionData]
  implicit val collection: DynamoFormat[Collection] = deriveDynamoFormat[Collection]
  implicit val Record: DynamoFormat[Record] = deriveDynamoFormat[Record]

  private lazy val collectionsTable = Table[Record](tableName)

  def getAll: Future[List[Collection]] = {
    ScanamoAsync(client).exec(collectionsTable.scan()).map(_.sequence).flatMap(res =>
      handleResponse(res)(records => records.map(_.collection))
    )
  }

  def add(collection: Collection): Future[Collection] = {
    ScanamoAsync(client).exec(
      collectionsTable.update(
        "id" === collection.pathId,
        set("collection", collection)
      )
    ).flatMap(res => handleResponse(res)(record => record.collection))
  }

  def get(collectionPath: List[String]): Future[Option[Collection]] = {
    val path = CollectionsManager.pathToPathId(collectionPath)
    ScanamoAsync(client).exec(collectionsTable.get("id" === path)).flatMap(maybeEither =>
      maybeEither.fold[Future[Option[Collection]]](
        Future.successful(None)
      )(res =>
        handleResponse(res)(record => Some(record.collection))
      )
    )
  }

  def remove(collectionPath: List[String]): Future[Unit] = {
    val path = CollectionsManager.pathToPathId(collectionPath)
    ScanamoAsync(client).exec(collectionsTable.delete("id" === path))
  }
}

case class CollectionsStoreError(e: Throwable) extends Throwable {
  val message: String = s"Error accessing collection store: ${e.getMessage}"
}
