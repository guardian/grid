package store

import com.gu.mediaservice.lib.aws.{NoItemFound, DynamoDB}
import com.gu.mediaservice.lib.collections.CollectionsManager
import com.gu.mediaservice.model.Collection
import lib.Config._
import play.api.libs.json.JsValue

import lib.Config

import scala.concurrent.ExecutionContext.Implicits.global
import scala.concurrent.Future

object CollectionsStore  {
  import Config.awsCredentials
  val dynamo = new DynamoDB(awsCredentials, dynamoRegion, collectionsTable)
  val rootId = "root"
  val key = "collections"

  def getAll: Future[List[Collection]] = dynamo.listGet[Collection](rootId, "collections") recover {
    case NoItemFound => Nil
    case e => throw e
  }

  def add(collection: Collection): Future[Collection] = {
    dynamo.listAdd(rootId, key, collection) map (collections => collection)
  } recover {
    case e => throw CollectionsStoreError(e)
  }

  def remove(collectionPath: String): Future[List[Collection]] = {
    dynamo.listGet[Collection](rootId, key) flatMap { collections =>
      val path = CollectionsManager.uriToPath(collectionPath)

      CollectionsManager.findIndex(path, collections) map { index =>
        dynamo.listRemoveIndex[Collection](rootId, key, index)
      } getOrElse Future.failed(CollectionNotFound(path))
    } recover {
      case e => throw CollectionsStoreError(e)
    }
  }
}

case class InvalidCollectionJson(json: JsValue) extends Throwable {
  val message: String = s"Invalid Collection JSON: ${json.toString}"
}

case class CollectionsStoreError(e: Throwable) extends Throwable {
  val message: String = s"Error accessing collection store: ${e.getMessage}"
}

case class CollectionNotFound(path: List[String]) extends Throwable {
  val message: String = s"Error accessing collection store: ${CollectionsManager.pathToString(path)}"
}
