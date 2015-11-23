package lib.collections

import com.gu.mediaservice.lib.store.JsonStore
import lib.Config
import model.Collection
import play.api.libs.json.{JsValue, Json}

import scala.concurrent.ExecutionContext.Implicits.global
import scala.concurrent.Future

object CollectionsStore {
  import Config.{awsCredentials, collectionsBucket}
  val collectionsStore = new JsonStore(collectionsBucket, awsCredentials, "collections.json")

  def getAll: Future[List[Collection]] = collectionsStore.getData flatMap { json =>
    json.asOpt[List[Collection]].map(Future.successful) getOrElse Future.failed(InvalidCollectionJson(json))
  }

  def add(collection: Collection): Future[Collection] = {
    collectionsStore.getData flatMap { json =>
      val collectionList = json.asOpt[List[Collection]]
      val newCollectionList = collectionList.map(CollectionsManager.add(collection, _))

      newCollectionList.map { collections =>
        collectionsStore.putData(Json.toJson(collections))
        Future.successful(collection)
      } getOrElse Future.failed(InvalidCollectionJson(json))
    }
  } recover {
    case e => throw CollectionsStoreError(e)
  }

  def remove(collectionPath: String): Future[Option[Collection]] = {
    collectionsStore.getData flatMap { json =>
      val path = CollectionsManager.stringToPath(collectionPath)
      val collectionList = json.asOpt[List[Collection]]

      collectionList map { collections =>
        val newCollectionsList = CollectionsManager.remove(path, collections)
        val oldCollection = CollectionsManager.find(path, collections)

        collectionsStore.putData(Json.toJson(newCollectionsList))
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
