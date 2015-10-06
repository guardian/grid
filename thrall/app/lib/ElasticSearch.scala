package lib

import _root_.play.api.libs.json._
import com.gu.mediaservice.lib.elasticsearch.{ElasticSearchClient, ImageFields}
import com.gu.mediaservice.syntax._
import groovy.json.JsonSlurper
import lib.ThrallMetrics._
import org.elasticsearch.action.deletebyquery.DeleteByQueryResponse
import org.elasticsearch.action.update.{UpdateRequestBuilder, UpdateResponse}
import org.elasticsearch.action.updatebyquery.UpdateByQueryResponse
import org.elasticsearch.client.UpdateByQueryClientWrapper
import org.elasticsearch.index.engine.VersionConflictEngineException
import org.elasticsearch.index.query.FilterBuilders.{andFilter, missingFilter}
import org.elasticsearch.index.query.QueryBuilders.{boolQuery, filteredQuery, matchAllQuery, matchQuery}
import org.elasticsearch.script.ScriptService
import org.joda.time.DateTime

import scala.collection.convert.decorateAll._
import scala.concurrent.{ExecutionContext, Future}


object ImageNotDeletable extends Throwable("Image cannot be deleted")

object ElasticSearch extends ElasticSearchClient with ImageFields {

  import com.gu.mediaservice.lib.formatting._

  val imagesAlias = Config.imagesAlias
  val host = Config.elasticsearchHost
  val port = Config.int("es.port")
  val cluster = Config("es.cluster")

  val scriptType = ScriptService.ScriptType.valueOf("INLINE")

  lazy val updateByQueryClient = new UpdateByQueryClientWrapper(client)

  def currentIsoDateString = printDateTime(new DateTime())

  def indexImage(id: String, image: JsValue)(implicit ex: ExecutionContext): Future[UpdateResponse] = {
    prepareImageUpdate(id)
      // Use upsert: if not present, will index the argument (the image)
      .setUpsert(Json.stringify(image))
      // if already present, will run the script with the provided parameters
      .setScriptParams(Map(
        "doc" -> asGroovy(asImageUpdate(image)),
        "lastModified" -> asGroovy(JsString(currentIsoDateString))
      ).asJava)
      .setScript(
        // Note: we merge old and new identifiers (in that order) to make easier to re-ingest
        // images without forwarding any existing identifiers.
        """| previousIdentifiers = ctx._source.identifiers;
           | ctx._source += doc;
           | if (previousIdentifiers) {
           |   ctx._source.identifiers += previousIdentifiers;
           |   ctx._source.identifiers += doc.identifiers;
           | }
           |""".stripMargin +
          refreshEditsScript +
          updateLastModifiedScript +
          addToSuggestersScript,
        scriptType)
      .executeAndLog(s"Indexing image $id")
      .incrementOnSuccess(indexedImages)}

  def deleteImage(id: String)(implicit ex: ExecutionContext): Future[DeleteByQueryResponse] = {

    val q = filteredQuery(
      boolQuery.must(matchQuery("_id", id)),
      andFilter(missingOrEmptyFilter("exports"))
    )

    val deleteQuery = client
      .prepareDeleteByQuery(imagesAlias)
      .setTypes(imageType)
      .setQuery(q)

    // search for the image first, and then only delete and succeed
    // this is because the delete query does not respond with anything useful
    // TODO: is there a more efficient way to do this?
    client
      .prepareCount(imagesAlias)
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
        "exports" -> asGroovy(exports),
        "lastModified" -> asGroovy(JsString(currentIsoDateString))
      ).asJava)
      .setScript(
          addExportsScript +
          updateLastModifiedScript,
        scriptType)
      .executeAndLog(s"updating exports on image $id")
      .incrementOnFailure(failedExportsUpdates) { case e: VersionConflictEngineException => true }

  def deleteImageExports(id: String)(implicit ex: ExecutionContext): Future[UpdateResponse] =
    prepareImageUpdate(id)
      .setScriptParams(Map(
        "lastModified" -> asGroovy(JsString(currentIsoDateString))
      ).asJava)
      .setScript(
          deleteExportsScript +
          updateLastModifiedScript,
        scriptType)
      .executeAndLog(s"removing exports from image $id")
      .incrementOnFailure(failedExportsUpdates) { case e: VersionConflictEngineException => true }

  def applyImageMetadataOverride(id: String, metadata: JsValue)(implicit ex: ExecutionContext): Future[UpdateResponse] =
    prepareImageUpdate(id)
      .setScriptParams(Map(
        "userMetadata" -> asGroovy(metadata),
        "lastModified" -> asGroovy(JsString(currentIsoDateString))
      ).asJava)
      .setScript(
        "ctx._source.userMetadata = userMetadata;" +
          refreshEditsScript +
          updateLastModifiedScript,
        scriptType)
      .executeAndLog(s"updating user metadata on image $id")
      .incrementOnFailure(failedMetadataUpdates) { case e: VersionConflictEngineException => true }

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
      .incrementOnFailure(failedQueryUpdates) { case e: VersionConflictEngineException => true }

  def asGroovy(collection: JsValue) = new JsonSlurper().parseText(collection.toString)

  def missingOrEmptyFilter(field: String) =
    missingFilter(field).existence(true).nullValue(true)

  def asImageUpdate(image: JsValue): JsValue = {
    def removeUploadInformation: Reads[JsObject] =
      (__ \ "uploadTime").json.prune andThen
      (__ \ "userMetadata").json.prune andThen
      (__ \ "exports").json.prune andThen
      (__ \ "uploadedBy").json.prune

    image.transform(removeUploadInformation).get
  }

  private val addToSuggestersScript =
    """
      | suggestMetadataCredit = [ input: [ ctx._source.metadata.credit] ];
      | ctx._source.suggestMetadataCredit = suggestMetadataCredit;
    """.stripMargin

  // Create the exports key or add to it
  private val addExportsScript =
    """| if (ctx._source.exports == null) {
       |   ctx._source.exports = exports;
       | } else {
       |   ctx._source.exports += exports;
       | }
    """.stripMargin

  private val deleteExportsScript =
    "ctx._source.remove('exports');".stripMargin

  // Script that refreshes the "metadata" object by recomputing it
  // from the original metadata and the overrides
  private val refreshMetadataScript =
    """| ctx._source.metadata = ctx._source.originalMetadata;
       | if (ctx._source.userMetadata && ctx._source.userMetadata.metadata) {
       |   ctx._source.metadata += ctx._source.userMetadata.metadata;
       |   // Get rid of "" values
       |   def nonEmptyKeys = ctx._source.metadata.findAll { it.value != "" }.collect { it.key }
       |   ctx._source.metadata = ctx._source.metadata.subMap(nonEmptyKeys);
       | }
    """.stripMargin

  // Script that overrides the "usageRights" object from the "userMetadata".
  // We revert to the "originalUsageRights" if they are vacant.
  private val refreshUsageRightsScript =
    """| if (ctx._source.userMetadata && ctx._source.userMetadata.containsKey("usageRights")) {
       |   ur = ctx._source.userMetadata.usageRights.clone();
       |   ctx._source.usageRights = ur;
       | } else {
       |   ctx._source.usageRights = ctx._source.originalUsageRights;
       | }
    """.stripMargin

  // updating all user edits
  private val refreshEditsScript = refreshMetadataScript + refreshUsageRightsScript

  // Script that updates the "lastModified" property using the "lastModified" parameter
  private val updateLastModifiedScript =
    """| ctx._source.lastModified = lastModified;
    """.stripMargin

}
