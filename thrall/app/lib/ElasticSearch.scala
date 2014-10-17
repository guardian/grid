package lib

import scala.concurrent.{ExecutionContext, Future}
import scala.collection.convert.decorateAll._
import org.elasticsearch.action.index.IndexResponse
import org.elasticsearch.action.update.{UpdateResponse, UpdateRequestBuilder}
import org.elasticsearch.action.delete.DeleteResponse
import org.elasticsearch.index.engine.VersionConflictEngineException
import org.elasticsearch.script.ScriptService
import groovy.json.JsonSlurper
import _root_.play.api.libs.json.{Json, JsValue}

import com.gu.mediaservice.lib.elasticsearch.ElasticSearchClient
import com.gu.mediaservice.syntax._

import ThrallMetrics._


object ElasticSearch extends ElasticSearchClient {

  val host = Config.elasticsearchHost
  val port = Config.int("es.port")
  val cluster = Config("es.cluster")

  val scriptType = ScriptService.ScriptType.valueOf("INLINE")

  def indexImage(id: String, image: JsValue)(implicit ex: ExecutionContext): Future[IndexResponse] =
    client.prepareIndex(imagesIndex, imageType, id)
      .setSource(Json.stringify(image))
      .setType(imageType)
      .executeAndLog(s"Indexing image $id")
      .incrementOnSuccess(indexedImages)

  def deleteImage(id: String)(implicit ex: ExecutionContext): Future[DeleteResponse] =
    client.prepareDelete(imagesIndex, imageType, id)
      .executeAndLog(s"Deleting image $id")
      .incrementOnSuccess(deletedImages)

  def updateImage(id: String, image: JsValue)(implicit ex: ExecutionContext): Future[UpdateResponse] =
    prepareImageUpdate(id)
      .setDoc(image.toString)
      .executeAndLog(s"updating image $id")
      .incrementOnFailure(conflicts) { case e: VersionConflictEngineException => true }

  def updateImageCollection(id: String, collectionName: String, collection: JsValue)(implicit ex: ExecutionContext): Future[UpdateResponse] =
    prepareImageUpdate(id)
      .setScriptParams(Map(
        "collectionName" -> collectionName,
        "collection" -> asGroovy(collection)
      ).asJava)
      .setScript(s"if (ctx._source[collectionName] == null) { ctx._source[collectionName] = collection } else { ctx._source[collectionName] += collection }", scriptType)
      .executeAndLog(s"updating collection on image $id")
      .incrementOnFailure(conflicts) { case e: VersionConflictEngineException => true }

  def prepareImageUpdate(id: String): UpdateRequestBuilder =
    client.prepareUpdate(imagesIndex, imageType, id)
      .setScriptLang("groovy")

  def addImageToBucket(id: String, bucket: String)(implicit ex: ExecutionContext): Future[UpdateResponse] =
    prepareImageUpdate(id)
      .addScriptParam("bucket", bucket)
      .setScript("if (ctx._source.containsKey(\"buckets\") && ! ctx._source.buckets.contains( bucket ) ) { ctx._source.buckets += bucket } else { ctx._source.buckets = { bucket } }", scriptType)
      .executeAndLog(s"add image $id to bucket $bucket")
      .incrementOnFailure(conflicts) { case e: VersionConflictEngineException => true }

  def removeImageFromBucket(id: String, bucket: String)(implicit ex: ExecutionContext): Future[UpdateResponse] =
    prepareImageUpdate(id)
      .addScriptParam("bucket", bucket)
      .setScript("if (ctx._source.containsKey(\"buckets\")) { ctx._source.buckets.remove( bucket ) }", scriptType)
      .executeAndLog(s"remove image $id from bucket $bucket")
      .incrementOnFailure(conflicts) { case e: VersionConflictEngineException => true }

  def asGroovy(collection: JsValue) = new JsonSlurper().parseText(collection.toString)
}
