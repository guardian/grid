package store

import com.gu.mediaservice.lib.aws.{DynamoDBV2, NoItemFound}
import com.gu.mediaservice.lib.collections.CollectionsManager
import com.gu.mediaservice.model.Collection
import lib.CollectionsConfig

import scala.concurrent.ExecutionContext.Implicits.global
import scala.concurrent.Future

class CollectionsStoreV2(config: CollectionsConfig) {

  val dynamoV2 = new DynamoDBV2(config, config.collectionsTable)
  def get(collectionPath: List[String]): Future[Option[Collection]] = {
    val path = CollectionsManager.pathToPathId(collectionPath)
    dynamoV2.get(path, "collection").foreach(r => println(r))
    dynamoV2.get(path, "collection").map(_.asOpt[Collection])
  } recover {
    case NoItemFound => None
    case e => throw CollectionsStoreError(e)
  }
}
