package lib

import scala.concurrent.{ExecutionContext, Future}
import scala.collection.convert.decorateAll._
import org.elasticsearch.client.UpdateByQueryClientWrapper
import org.elasticsearch.action.index.IndexResponse
import org.elasticsearch.action.update.{UpdateResponse, UpdateRequestBuilder}
import org.elasticsearch.action.deletebyquery.DeleteByQueryResponse
import org.elasticsearch.action.updatebyquery.UpdateByQueryResponse
import org.elasticsearch.index.query.QueryBuilders.matchAllQuery
import org.elasticsearch.index.engine.VersionConflictEngineException
import org.elasticsearch.script.ScriptService
import org.elasticsearch.index.query.QueryBuilders.{filteredQuery, matchQuery}
import org.elasticsearch.index.query.FilterBuilders.queryFilter
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

  lazy val updateByQueryClient = new UpdateByQueryClientWrapper(client)

  def indexImage(id: String, image: JsValue)(implicit ex: ExecutionContext): Future[IndexResponse] =
    client.prepareIndex(imagesIndex, imageType, id)
      .setSource(Json.stringify(image))
      .setType(imageType)
      .executeAndLog(s"Indexing image $id")
      .incrementOnSuccess(indexedImages)

  def deleteImage(id: String)(implicit ex: ExecutionContext): Future[DeleteByQueryResponse] =
    client.prepareDeleteByQuery(imagesIndex)
      .setTypes(imageType)
      .setQuery(filteredQuery(matchQuery("_id", id), queryFilter(matchQuery("archived", false))))
      .executeAndLog(s"Deleting image $id")
      .incrementOnSuccess(deletedImages)

  def updateImageExports(id: String, exports: JsValue)(implicit ex: ExecutionContext): Future[UpdateResponse] =
    prepareImageUpdate(id)
      .setScriptParams(Map(
        "exports" -> asGroovy(exports)
      ).asJava)
      .setScript(
        s"""ctx._source.archived = true;
           |if (ctx._source.exports == null) {
           |  ctx._source.exports = exports;
           |} else {
           |  ctx._source.exports += exports;
           |}""".stripMargin, scriptType)
      .executeAndLog(s"updating exports on image $id")
      .incrementOnFailure(conflicts) { case e: VersionConflictEngineException => true }

  def prepareImageUpdate(id: String): UpdateRequestBuilder =
    client.prepareUpdate(imagesIndex, imageType, id)
      .setScriptLang("groovy")

  def updateByQuery(script: String)(implicit ex: ExecutionContext): Future[UpdateByQueryResponse] =
    updateByQueryClient
      .prepareUpdateByQuery()
      .setScriptLang("groovy")
      .setIndices(imagesIndex)
      .setTypes(imageType)
      .setQuery(matchAllQuery)
      .setScript(script)
      .executeAndLog("Running update by query script")
      .incrementOnFailure(conflicts) { case e: VersionConflictEngineException => true }

  def asGroovy(collection: JsValue) = new JsonSlurper().parseText(collection.toString)

}
