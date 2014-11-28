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
import org.elasticsearch.index.query.QueryBuilders.{filteredQuery, boolQuery, matchQuery}
import org.elasticsearch.index.query.FilterBuilders.missingFilter
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
    client.prepareIndex(imagesAlias, imageType, id)
      .setSource(Json.stringify(image))
      .setType(imageType)
      .executeAndLog(s"Indexing image $id")
      .incrementOnSuccess(indexedImages)

  def deleteImage(id: String)(implicit ex: ExecutionContext): Future[DeleteByQueryResponse] =
    client.prepareDeleteByQuery(imagesAlias)
      .setTypes(imageType)
      .setQuery(filteredQuery(
        boolQuery
          .must(matchQuery("_id", id))
          .must(matchQuery("archived", false)),
        missingFilter("exports")
          .existence(true)
          .nullValue(true)
      ))
      .executeAndLog(s"Deleting image $id")
      .incrementOnSuccess(deletedImages)

  def updateImageExports(id: String, exports: JsValue)(implicit ex: ExecutionContext): Future[UpdateResponse] =
    prepareImageUpdate(id)
      .setScriptParams(Map(
        "exports" -> asGroovy(exports)
      ).asJava)
      .setScript("""
                    if (ctx._source.exports == null) {
                      ctx._source.exports = exports;
                    } else {
                      ctx._source.exports += exports;
                    }
                 """, scriptType)
      .executeAndLog(s"updating exports on image $id")
      .incrementOnFailure(conflicts) { case e: VersionConflictEngineException => true }

  def applyImageMetadataOverride(id: String, metadata: JsValue)(implicit ex: ExecutionContext): Future[UpdateResponse] =
    prepareImageUpdate(id)
      .setScriptParams(Map(
        "userMetadata" -> asGroovy(metadata)
      ).asJava)
      // TODO: if metadata not set, should undo overrides?
      // TODO: apply overrides from the original metadata each time?
      .setScript("""
                    if (userMetadata.metadata) {
                      if (!ctx._source.originalMetadata) {
                        ctx._source.originalMetadata = ctx._source.metadata;
                      }
                      ctx._source.metadata += userMetadata.metadata;
                    }
                    ctx._source.userMetadata = userMetadata;
                 """, scriptType)
      .executeAndLog(s"updating user metadata on image $id")
      .incrementOnFailure(conflicts) { case e: VersionConflictEngineException => true }

  def prepareImageUpdate(id: String): UpdateRequestBuilder =
    client.prepareUpdate(imagesAlias, imageType, id)
      .setScriptLang("groovy")

  def updateByQuery(script: String)(implicit ex: ExecutionContext): Future[UpdateByQueryResponse] =
    updateByQueryClient
      .prepareUpdateByQuery()
      .setScriptLang("groovy")
      .setIndices(imagesAlias)
      .setTypes(imageType)
      .setQuery(matchAllQuery)
      .setScript(script)
      .executeAndLog("Running update by query script")
      .incrementOnFailure(conflicts) { case e: VersionConflictEngineException => true }

  def asGroovy(collection: JsValue) = new JsonSlurper().parseText(collection.toString)

}
