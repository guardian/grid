package store

import com.gu.mediaservice.lib.aws.DynamoDB
import com.gu.mediaservice.lib.collections.CollectionsManager
import com.gu.mediaservice.lib.store.JsonStore
import com.gu.mediaservice.model.Collection
import lib.Config._
import play.api.libs.json.{JsValue, Json}

import lib.Config

import scala.concurrent.ExecutionContext.Implicits.global
import scala.concurrent.Future

object CollectionsStore  {
  import Config.{awsCredentials, collectionsBucket}
  val store = new JsonStore(collectionsBucket, awsCredentials, "collections")
  val dynamo = new DynamoDB(awsCredentials, dynamoRegion, collectionsTable)

  def getAll: Future[List[Collection]] = store.getData flatMap { json =>
    json.asOpt[List[Collection]].map(_.sortBy(_.pathId)).map(Future.successful).
      getOrElse(Future.failed(InvalidCollectionJson(json)))
  }

  def add(collection: Collection): Future[Collection] = {
    dynamo.objAdd(collection.pathId, "collection", collection)
  } recover {
    case e => throw CollectionsStoreError(e)
  }

  def remove(collectionPath: String): Future[Option[Collection]] = {
    store.getData flatMap { json =>
      val path = CollectionsManager.stringToPath(collectionPath)
      val collectionList = json.asOpt[List[Collection]]

      collectionList map { collections =>
        val newCollectionsList = CollectionsManager.remove(path, collections)
        val oldCollection = CollectionsManager.find(path, collections)

        store.putData(Json.toJson(newCollectionsList))
        Future.successful(oldCollection)
      } getOrElse Future.failed(InvalidCollectionJson(json))
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
