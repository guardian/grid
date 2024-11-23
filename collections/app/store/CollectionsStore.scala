package store

import com.gu.mediaservice.lib.aws.{InstanceAwareDynamoDB, NoItemFound}
import com.gu.mediaservice.lib.collections.CollectionsManager
import com.gu.mediaservice.model.{Collection, Instance}
import lib.CollectionsConfig
import play.api.libs.json.JsValue

import scala.concurrent.ExecutionContext.Implicits.global
import scala.concurrent.Future

class CollectionsStore(config: CollectionsConfig) {
  val dynamo = new InstanceAwareDynamoDB[Collection](config, config.collectionsTable)

  def getAll()(implicit instance: Instance): Future[List[Collection]] = dynamo.scan() map { jsonList =>
    jsonList.flatMap(json => (json \ "collection").asOpt[Collection])
  } recover {
    case e => throw CollectionsStoreError(e)
  }

  def add(collection: Collection)(implicit instance: Instance): Future[Collection] = {
    dynamo.objPut(collection.pathId, "collection", collection)
  } recover {
    case e => throw CollectionsStoreError(e)
  }

  def get(collectionPath: List[String])(implicit instance: Instance): Future[Option[Collection]] = {
    val path = CollectionsManager.pathToPathId(collectionPath)
    dynamo.get(path).map(json => (json \ "collection").asOpt[Collection])
  } recover {
    case NoItemFound => None
    case e => throw CollectionsStoreError(e)
  }

  def remove(collectionPath: List[String])(implicit instance: Instance): Future[Unit] = {
    val path = CollectionsManager.pathToPathId(collectionPath)
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
