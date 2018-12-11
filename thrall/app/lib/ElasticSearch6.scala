package lib

import com.gu.mediaservice.lib.elasticsearch.ImageFields
import com.gu.mediaservice.lib.elasticsearch6.{ElasticSearchClient, Mappings}
import com.gu.mediaservice.model.{Image, Photoshoot, SyndicationRights}
import com.sksamuel.elastic4s.http.ElasticDsl._
import com.sksamuel.elastic4s.script.Script
import com.sksamuel.elastic4s.searches.sort.SortOrder
import org.elasticsearch.action.delete.DeleteResponse
import org.elasticsearch.action.update.UpdateResponse
import org.joda.time.DateTime
import play.api.Logger
import play.api.libs.json._

import scala.concurrent.duration.{Duration, SECONDS}
import scala.concurrent.{Await, ExecutionContext, Future}

class ElasticSearch6(config: ThrallConfig, metrics: ThrallMetrics) extends ElasticSearchVersion with ElasticSearchClient with ImageFields with ElasticSearch6Executions {

  lazy val imagesAlias = config.writeAlias
  lazy val host = config.elasticsearchHost
  lazy val port = config.int("es.port")
  lazy val cluster = config("es.cluster")

  private val TenSeconds = Duration(10, SECONDS)

  @Deprecated
  lazy val clientTransportSniff = false

  def indexImage(id: String, image: JsValue)(implicit ex: ExecutionContext): List[Future[UpdateResponse]] = {

    // TODO doesn't match the legacy functionality
    val painlessSource = loadPainless(
      // If there are old identifiers, then merge any new identifiers into old and use the merged results as the new identifiers
      """
        | if (ctx._source.identifiers != null) {
        |   ctx._source.identifiers.putAll(params.update_doc.identifiers);
        |   params.update_doc.identifiers = ctx._source.identifiers
        | }
        | ctx._source = params.update_doc;
        |
        | if (ctx._source.metadata != null && ctx._source.metadata.credit != null) {
        |   ctx._source.suggestMetadataCredit = [ \"input\": [ ctx._source.metadata.credit ] ]
        | }
      """)

    val imageJson = Json.stringify(image)

    /*
    val upsertScript = s"""
        |{
        |  "scripted_upsert": true,
        |  "script": {
        |    "lang": "painless",
        |    "source": "$painlessSource",
        |    "params": {
        |      "update_doc": $original
        |    }
        |  },
        |  "upsert": $original
        |}
        |""".stripMargin
    */

    val params = Map("update_doc" -> imageJson)
    val script = Script(script = painlessSource).lang("painless").params(params)

    val indexRequest = updateById(imagesAlias, Mappings.dummyType, id).
      upsert(imageJson).
      script(script)

    val indexResponse = executeAndLog(indexRequest, s"Indexing image $id").await

    Logger.info("Index image result: " + indexResponse)
    List[Future[UpdateResponse]]() // TODO
  }

  def getImage(id: String)(implicit ex: ExecutionContext): Future[Option[Image]] = {
    executeAndLog(get(imagesAlias, Mappings.dummyType, id), s"get image by $id").map { r =>
      if (r.result.found) {
        Some(Json.parse(r.result.sourceAsString).as[Image])
      } else {
        None
      }
    }
  }

  def updateImageUsages(id: String, usages: JsLookupResult, lastModified: JsLookupResult)(implicit ex: ExecutionContext): List[Future[UpdateResponse]] = {
    ???
  }

  def updateImageSyndicationRights(id: String, rights: Option[SyndicationRights])(implicit ex: ExecutionContext): List[Future[UpdateResponse]] = {
    Logger.info("Updating image syndication rights: " + id + " / " + rights)
    val rightsParameter = rights match {
      case Some(sr) => asNestedMap(sr)
      case None => null
    }

    val params = Map(
      "syndicationRights" -> rightsParameter,
      "lastModified" -> DateTime.now().toString()
    )

    val scriptSource = loadPainless(
      s"""
         | $replaceSyndicationRightsScript
         | $updateLastModifiedScript
    """)

    Logger.debug("Update syndication rights script is: " + scriptSource)
    Logger.debug("Params are: " + params)
    val script = Script(script = scriptSource).lang("painless").params(params)

    val updateRequest = updateById(imagesAlias, "_doc", id).script(script)

    val eventualResult = executeAndLog(updateRequest, s"updating syndicationRights on image $id with rights $params")

    val result = Await.result(eventualResult, TenSeconds)
    Logger.info("Update image syndication response: " + result)

    List() // TODO
  }

  def getInferredSyndicationRightsImages(photoshoot: Photoshoot, excludedImageId: Option[String])(implicit ex: ExecutionContext): Future[List[Image]] = { // TODO could be a Seq
    val inferredSyndicationRights = not(termQuery("syndicationRights.isInferred", false)) // Using 'not' to include nulls

    val filter = excludedImageId match {
      case Some(imageId) => boolQuery must(
        inferredSyndicationRights,
        not(idsQuery(imageId))
      )
      case _ => inferredSyndicationRights
    }

    val filteredMatches = boolQuery must(
      matchQuery(photoshootField("title"), photoshoot.title),
      filter
    )

    val request = search(imagesAlias) bool filteredMatches limit 200 // TODO no order?

    executeAndLog(request, s"get images in photoshoot ${photoshoot.title} with inferred syndication rights (excluding $excludedImageId)").map { r =>
      r.result.hits.hits.toList.map { h =>
        Json.parse(h.sourceAsString).as[Image]
      }
    }
  }

  def getLatestSyndicationRights(photoshoot: Photoshoot, excludedImageId: Option[String])(implicit ex: ExecutionContext): Future[Option[Image]] = {
    val nonInferredSyndicationRights = termQuery("syndicationRights.isInferred", false)

    val filter = excludedImageId match {
      case Some(imageId) => boolQuery must(
        nonInferredSyndicationRights,
        not(idsQuery(imageId))
      )
      case _ => nonInferredSyndicationRights
    }

    val filteredMatches = boolQuery must(
      matchQuery(photoshootField("title"), photoshoot.title),
      filter
    )

    val syndicationRightsPublishedDescending = fieldSort("syndicationRights.published").order(SortOrder.DESC)

    val request = search(imagesAlias) bool filteredMatches sortBy syndicationRightsPublishedDescending

    executeAndLog(request, s"get image in photoshoot ${photoshoot.title} with latest rcs syndication rights (excluding $excludedImageId)").map { r =>
      r.result.hits.hits.toList.headOption.map { h =>
        Json.parse(h.sourceAsString).as[Image]
      }
    }
  }

  private val replaceSyndicationRightsScript =
    """
      | ctx._source.syndicationRights = params.syndicationRights;
    """.stripMargin

  // Script that updates the "lastModified" property using the "lastModified" parameter
  private val updateLastModifiedScript =
    """|  ctx._source.lastModified = params.lastModified;
    """.stripMargin

  def deleteImage(id: String)(implicit ex: ExecutionContext): List[Future[DeleteResponse]] = {
    /*
    val q = filteredQuery(
      boolQuery.must(matchQuery("_id", id)),
      andFilter(
        missingOrEmptyFilter("exports"),
        missingOrEmptyFilter("usages"))
    )

    prepareForMultipleIndexes { index =>
      // search for the image first, and then only delete and succeed
      // this is because the delete query does not respond with anything useful
      // TODO: is there a more efficient way to do this?
      client
        .prepareCount(index)
        .setQuery(q)
        .executeAndLog(s"Searching for image to delete: $id")
        .flatMap { countQuery =>
          val deleteFuture = countQuery.getCount match {
            case 1 => client.prepareDelete(index, imageType, id).executeAndLog(s"Deleting image $id")
            case _ => Future.failed(ImageNotDeletable)
          }
          deleteFuture
            .incrementOnSuccess(metrics.deletedImages)
            .incrementOnFailure(metrics.failedDeletedImages) { case ImageNotDeletable => true }
        }
    }
     */
    ???
  }

  def deleteAllImageUsages(id: String)(implicit ex: ExecutionContext): List[Future[UpdateResponse]] = {
    ???
  }

  def deleteSyndicationRights(id: String)(implicit ex: ExecutionContext): List[Future[UpdateResponse]] = {
    ???
  }

  def updateImageLeases(id: String, leaseByMedia: JsLookupResult, lastModified: JsLookupResult)(implicit ex: ExecutionContext): List[Future[UpdateResponse]] = {
    ???
  }

  def addImageLease(id: String, lease: JsLookupResult, lastModified: JsLookupResult)(implicit ex: ExecutionContext): List[Future[UpdateResponse]] = {
    ???
  }

  def removeImageLease(id: String, leaseId: JsLookupResult, lastModified: JsLookupResult)(implicit ex: ExecutionContext): List[Future[UpdateResponse]] = {
    ???
  }

  def updateImageExports(id: String, exports: JsLookupResult)(implicit ex: ExecutionContext): List[Future[UpdateResponse]] = {
    ???
  }

  def deleteImageExports(id: String)(implicit ex: ExecutionContext): List[Future[UpdateResponse]] = ???

  def applyImageMetadataOverride(id: String, metadata: JsLookupResult, lastModified: JsLookupResult)(implicit ex: ExecutionContext): List[Future[UpdateResponse]] = ???

  def setImageCollection(id: String, collections: JsLookupResult)(implicit ex: ExecutionContext): List[Future[UpdateResponse]] =
    ???


  private def loadPainless(str: String) = str.stripMargin.split('\n').map(_.trim.filter(_ >= ' ')).mkString // remove ctrl chars and leading, trailing whitespace

  def asNestedMap(sr: SyndicationRights) = { // TODO not great; there must be a better way to flatten a case class into a Map
    import com.fasterxml.jackson.databind.ObjectMapper
    import com.fasterxml.jackson.module.scala.DefaultScalaModule
    import com.fasterxml.jackson.module.scala.experimental.ScalaObjectMapper
    val mapper = new ObjectMapper() with ScalaObjectMapper
    mapper.registerModule(DefaultScalaModule)
    mapper.readValue[Map[String, Object]](Json.stringify(Json.toJson(sr)))
  }

}
