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
import org.elasticsearch.index.query.FilterBuilders.{missingFilter, andFilter}
import groovy.json.JsonSlurper
import _root_.play.api.libs.json._


import com.gu.mediaservice.lib.elasticsearch.ElasticSearchClient
import com.gu.mediaservice.syntax._

import ThrallMetrics._


object ImageNotDeletable extends Throwable("Image cannot be deleted")

object ElasticSearch extends ElasticSearchClient {

  import Config.persistenceIdentifier

  val host = Config.elasticsearchHost
  val port = Config.int("es.port")
  val cluster = Config("es.cluster")

  val scriptType = ScriptService.ScriptType.valueOf("INLINE")

  lazy val updateByQueryClient = new UpdateByQueryClientWrapper(client)

  def indexImage(id: String, image: JsValue)(implicit ex: ExecutionContext): Future[UpdateResponse] =
    client.prepareUpdate(imagesAlias, imageType, id)
      .setDoc(Json.stringify(asImageUpdate(image)))
      .setUpsert(Json.stringify(image))
      .executeAndLog(s"Indexing image $id")
      .incrementOnSuccess(indexedImages)

  def deleteImage(id: String)(implicit ex: ExecutionContext): Future[DeleteByQueryResponse] = {

    val q = filteredQuery(
      boolQuery.must(matchQuery("_id", id)),
        andFilter(
          missingOrEmptyFilter("exports"),
          missingOrEmptyFilter("userMetadata.archived"),
          missingOrEmptyFilter(s"identifiers.$persistenceIdentifier"))
      )

    val deleteQuery = client
      .prepareDeleteByQuery(imagesAlias)
      .setTypes(imageType)
      .setQuery(q)

    // search for the image first, and then only delete and succeed
    // this is because the delete query does not respond with anything useful
    // TODO: is there a more efficient way to do this?
    client
      .prepareCount()
      .setQuery(q)
      .executeAndLog(s"Searching for image to delete: $id")
      .flatMap { countQuery =>
        val deleteFuture = countQuery.getCount match {
          case 1 => deleteQuery.executeAndLog(s"Deleting image $id")
          case _ => Future.failed(ImageNotDeletable)
        }
        deleteFuture
          .incrementOnSuccess(deletedImages)
          .incrementOnFailure(failedDeletedImages) { case ImageNotDeletable => true }
      }
  }

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

  def updateImageMetadata(id: String, metadata: JsValue)(implicit ex: ExecutionContext): Future[UpdateResponse] =
    prepareImageUpdate(id)
      .setScriptParams(Map(
        "userMetadata" -> asGroovy(metadata)
      ).asJava)
      // replace metadata, then merge in edits
      .setScript(
        """
          ctx._source.metadata = userMetadata;
          ctx._source.originalMetadata = userMetadata;
          if (ctx._source.userMetadata.metadata) {
            ctx._source.metadata += ctx._source.userMetadata.metadata;
          }
        """.stripMargin, scriptType)
      .executeAndLog(s"updating user metadata on image $id")
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
                      ctx._source.metadata += userMetadata.metadata;
                    }
                    ctx._source.userMetadata = userMetadata;
                 """, scriptType)
      .executeAndLog(s"overriding user metadata on image $id")
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

  def missingOrEmptyFilter(field: String) =
    missingFilter(field).existence(true).nullValue(true)

  def asImageUpdate(image: JsValue): JsValue = {
    def removeUploadInformation: Reads[JsObject] =
      (__ \ "uploadTime").json.prune andThen (__ \ "uploadedBy").json.prune

    image.transform(removeUploadInformation).get
  }

}
