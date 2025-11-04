package store

import com.gu.mediaservice.lib.aws.{DynamoDB, DynamoDBV2, NoItemFound}
import com.gu.mediaservice.lib.collections.CollectionsManager
import com.gu.mediaservice.model.{ActionData, Collection}
import lib.CollectionsConfig
import org.joda.time.DateTime
import org.scanamo.generic.auto.genericDerivedFormat
import org.scanamo.{DynamoFormat, DynamoReadError, ScanamoAsync, Table, TypeCoercionError}
import org.scanamo.syntax._
import play.api.libs.json.{JsValue, Json}
import software.amazon.awssdk.services.dynamodb.DynamoDbAsyncClient

import scala.concurrent.ExecutionContext.Implicits.global
import scala.concurrent.Future


case class Record(id: String, collection: Collection)

class CollectionsStore(config: CollectionsConfig) {
  val dynamo = new DynamoDB[Collection](config, config.collectionsTable)
  lazy val client: DynamoDbAsyncClient = config.withAWSCredentialsV2(DynamoDbAsyncClient.builder()).build()
  import org.scanamo.generic.semiauto._
  implicit val dateTimeFormat: Typeclass[DateTime] =
    DynamoFormat.coercedXmap[DateTime, String, IllegalArgumentException](DateTime.parse, _.toString)
  implicit val actionData: DynamoFormat[ActionData] = deriveDynamoFormat[ActionData]
  implicit val collection: DynamoFormat[Collection] = deriveDynamoFormat[Collection]
  implicit val Record: DynamoFormat[Record] = deriveDynamoFormat[Record]

  private lazy val collectionsTable =
    Table[Record](config.collectionsTable)

  def getAll: Future[List[Collection]] = dynamo.scan() map { jsonList =>
    jsonList.flatMap(json => (json \ "collection").asOpt[Collection])
  } recover {
    case e => throw CollectionsStoreError(e)
  }

  def add(collection: Collection): Future[Collection] = {
    ScanamoAsync(client).exec(
      collectionsTable.update(
        "id" === collection.pathId,
        set("collection", collection)
      )
    ).map {
      case Right(value) => value.collection
      case Left(error) => throw CollectionsStoreDynamoError(error)
    } recover {
      case e => throw CollectionsStoreError(e)
    }
  }

  def get(collectionPath: List[String]): Future[Option[Collection]] = {
    val path = CollectionsManager.pathToPathId(collectionPath)
    ScanamoAsync(client).exec(collectionsTable.get("id" === path)).map(result => result.flatMap(eit => eit match{
      case Right(value) => Some(value.collection)
      case Left(error) => throw CollectionsStoreDynamoError(error)
    }))
  } recover {
    case e => throw CollectionsStoreError(e)
  }

  def remove(collectionPath: List[String]): Future[Unit] = {
    val path = CollectionsManager.pathToPathId(collectionPath)
    ScanamoAsync(client).exec(collectionsTable.delete("id" === path))
  } recover {
    case e => throw CollectionsStoreError(e)
  }
}

case class CollectionsStoreError(e: Throwable) extends Throwable {
  val message: String = s"Error accessing collection store: ${e.getMessage}"
}

case class CollectionsStoreDynamoError(err: DynamoReadError) extends Throwable {
  val message: String = s"Error accessing collection store: ${err.toString}"
}

