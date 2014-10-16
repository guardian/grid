package lib

import scala.concurrent.{ExecutionContext, Future}
import scala.collection.convert.decorateAll._
import org.elasticsearch.action.index.IndexResponse
import org.elasticsearch.action.update.{UpdateResponse, UpdateRequestBuilder}
import org.elasticsearch.action.delete.DeleteResponse
import org.elasticsearch.index.engine.VersionConflictEngineException
import org.elasticsearch.script.ScriptService
import groovy.json.{JsonSlurper, JsonBuilder}
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

  def prepareImageUpdate(id: String): UpdateRequestBuilder =
    client.prepareUpdate(imagesIndex, imageType, id)
      .setScriptLang("groovy")

  def addExportsToImage(id: String, exports: JsValue)(implicit ex: ExecutionContext): Future[UpdateResponse] = {
    val exportsObj = new JsonSlurper().parseText(exports.toString)

    prepareImageUpdate(id)
      .addScriptParam("export", exportsObj)
      .setScript(s"""if (ctx._source.exports == null) { ctx._source.exports = export } else { ctx._source.exports += export }""", scriptType)
      .executeAndLog(s"adding exports to image $id")
      .incrementOnFailure(conflicts) { case e: VersionConflictEngineException => true }
  }

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
}
