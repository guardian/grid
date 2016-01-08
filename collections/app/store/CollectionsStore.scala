package store

import com.gu.mediaservice.lib.aws.DynamoDB
import com.gu.mediaservice.lib.collections.CollectionsManager
import com.gu.mediaservice.model.Collection
import play.api.libs.json.JsValue

import lib.Config

import scala.concurrent.ExecutionContext.Implicits.global
import scala.concurrent.Future

object CollectionsStore {
  import Config.{awsCredentials, collectionsTable, dynamoRegion}
  val dynamo = new DynamoDB(awsCredentials, dynamoRegion, collectionsTable)

  def getAll: Future[List[Collection]] = dynamo.scan map { jsonList =>
    jsonList.flatMap(json => (json \ "collection").asOpt[Collection])
  } recover {
    case e => throw CollectionsStoreError(e)
  }

  def add(collection: Collection): Future[Collection] = {
    dynamo.objPut(collection.pathId, "collection", collection)
  } recover {
    case e => throw CollectionsStoreError(e)
  }

  def remove(collectionPath: List[String]): Future[Unit] = {
    val path = CollectionsManager.pathToString(collectionPath)
    dynamo.deleteItem(path)
  } recover {
    case e => throw CollectionsStoreError(e)
  }
}

case class InvalidCollectionJson(json: JsValue) extends Throwable {
  val message: String = s"Invalid Collection JSON: ${json.toString}"
}

case class CollectionsStoreError(e: Throwable) extends Throwable {
  val message: String = s"Error accessing collection store: ${e.getMessage}"
}
