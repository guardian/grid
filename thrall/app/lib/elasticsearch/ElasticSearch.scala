package lib.elasticsearch

import com.gu.mediaservice.lib.ImageFields
import com.gu.mediaservice.lib.elasticsearch.{ElasticSearchClient, ElasticSearchConfig, ElasticSearchExecutions, Mappings}
import com.gu.mediaservice.lib.formatting.printDateTime
import com.gu.mediaservice.lib.logging.LogMarker
import com.gu.mediaservice.model._
import com.gu.mediaservice.model.leases.MediaLease
import com.gu.mediaservice.model.usage.Usage
import com.gu.mediaservice.syntax._
import com.sksamuel.elastic4s.ElasticDsl._
import com.sksamuel.elastic4s.requests.indexes.IndexRequest
import com.sksamuel.elastic4s.requests.script.Script
import com.sksamuel.elastic4s.requests.searches.queries.BoolQuery
import com.sksamuel.elastic4s.requests.searches.sort.SortOrder
import com.sksamuel.elastic4s.requests.update.UpdateRequest
import lib.ThrallMetrics
import org.joda.time.DateTime
import play.api.MarkerContext
import play.api.libs.json._

import scala.concurrent.{ExecutionContext, Future}

object ImageNotDeletable extends Throwable("Image cannot be deleted")

class ElasticSearch(config: ElasticSearchConfig, metrics: Option[ThrallMetrics]) extends ElasticSearchClient
  with ImageFields with ElasticSearchExecutions {

  lazy val imagesAlias = config.alias
  lazy val url = config.url
  lazy val cluster = config.cluster
  lazy val shards = config.shards
  lazy val replicas = config.replicas

  def bulkInsert(images: Seq[Image])(implicit ex: ExecutionContext, logMarker: LogMarker): List[Future[ElasticSearchBulkUpdateResponse]] = {
    val (requests, totalSize) =
      images.foldLeft[(Seq[IndexRequest], Int)](List(), 0)
      { (collector: (Seq[IndexRequest], Int), img) =>
      val (requestsSoFar, sizeSoFar) = collector
      val document = Json.stringify(Json.toJson(img))
      (
        requestsSoFar :+
        indexInto(imagesAlias)
          .id(img.id)
          .source(document),
        sizeSoFar + document.length()
      )
    }

    val request = bulk { requests }

    val response = executeAndLog(request, s"Bulk inserting ${images.length} images, total size $totalSize")

    List(response.map(_ => ElasticSearchBulkUpdateResponse()))
  }

  def indexImage(id: String, image: JsValue)(implicit ex: ExecutionContext, logMarker: LogMarker): List[Future[ElasticSearchUpdateResponse]] = {
    val painlessSource = loadPainless(
      // If there are old identifiers, then merge any new identifiers into old and use the merged results as the new identifiers
      """
        | if (ctx._source.identifiers != null) {
        |   ctx._source.identifiers.putAll(params.update_doc.identifiers);
        |   params.update_doc.identifiers = ctx._source.identifiers
        | }
        |
        | ctx._source.putAll(params.update_doc);
        |
        | if (ctx._source.metadata != null && ctx._source.metadata.credit != null) {
        |   ctx._source.suggestMetadataCredit = [ "input": [ ctx._source.metadata.credit ] ]
        | }
      """)

    val scriptSource = loadPainless(s"""
                                       |   $painlessSource
                                       |   $refreshEditsScript
                                       |   $updateLastModifiedScript
                                       | """)


    val params = Map(
      "update_doc" -> asNestedMap(asImageUpdate(image)),
      "lastModified" -> currentIsoDateString
    )

    val script = Script(script = scriptSource).lang("painless").params(params)

    val indexRequest = updateById(imagesAlias, id).
      upsert(Json.stringify(image)).
      script(script)

    val indexResponse = executeAndLog(indexRequest, s"ES6 indexing image $id")

    List(indexResponse.map { _ =>
      ElasticSearchUpdateResponse()
    })
  }

  def getImage(id: String)(implicit ex: ExecutionContext, logMarker: LogMarker): Future[Option[Image]] = {
    executeAndLog(get(imagesAlias, id), s"ES6 get image by $id").map { r =>
      if (r.result.found) {
        Some(Json.parse(r.result.sourceAsString).as[Image])
      } else {
        None
      }
    }
  }

  def updateImageUsages(id: String, usages: Seq[Usage], lastModified: JsLookupResult)(implicit ex: ExecutionContext,logMarker: LogMarker): List[Future[ElasticSearchUpdateResponse]] = {
    val replaceUsagesScript = """
      | def dtf = DateTimeFormatter.ISO_DATE_TIME;
      | def updateDate = Date.from(Instant.from(dtf.parse(params.lastModified)));
      | def lastUpdatedDate = ctx._source.usagesLastModified != null ? Date.from(Instant.from(dtf.parse(ctx._source.usagesLastModified))) : null;
      |
      | if (lastUpdatedDate == null || updateDate.after(lastUpdatedDate)) {
      |   ctx._source.usages = params.usages;
      |   ctx._source.usagesLastModified = params.lastModified;
      | }
    """

    val scriptSource = loadPainless(s"""
       |   $replaceUsagesScript
       |   $updateLastModifiedScript
       | """)

    val lastModifiedParameter = lastModified.toOption.map(_.as[String])

    val params = Map(
      "usages" -> usages.map(i => asNestedMap(Json.toJson(i))),
      "lastModified" -> lastModifiedParameter.getOrElse(null)
    )

    val script = Script(script = scriptSource).lang("painless").params(params)

    val updateRequest = updateById(imagesAlias, id).script(script)

    val eventualUpdateResponse = executeAndLog(updateRequest, s"ES6 updating usages on image $id")
      .incrementOnFailure(metrics.map(_.failedUsagesUpdates)){case _ => true}

    List(eventualUpdateResponse.map(_ => ElasticSearchUpdateResponse()))
  }

  def updateImageSyndicationRights(id: String, rights: Option[SyndicationRights])(implicit ex: ExecutionContext, logMarker: LogMarker): List[Future[ElasticSearchUpdateResponse]] = {

    val replaceSyndicationRightsScript = """
        | ctx._source.syndicationRights = params.syndicationRights;
      """.stripMargin


    val rightsParameter = rights match {
      case Some(sr) => asNestedMap(sr)
      case None => null
    }

    val params = Map(
      "syndicationRights" -> rightsParameter,
      "lastModified" -> DateTime.now().toString()
    )

    val scriptSource = loadPainless(s"""
         | $replaceSyndicationRightsScript
         | $updateLastModifiedScript
        """)

    val script = Script(script = scriptSource).lang("painless").params(params)

    val updateRequest = updateById(imagesAlias, id).script(script)

    List(executeAndLog(updateRequest, s"ES6 updating syndicationRights on image $id with rights $params").map(_ => ElasticSearchUpdateResponse()))
  }

  def applyImageMetadataOverride(
                                  id: String, metadata: JsLookupResult, lastModified: JsLookupResult
                                )(
                                  implicit ex: ExecutionContext, logMarker: LogMarker
                                ): List[Future[ElasticSearchUpdateResponse]] = {
    val photoshootSuggestionScript = """
      | if (ctx._source.userMetadata.photoshoot != null) {
      |   ctx._source.userMetadata.photoshoot.suggest = [ "input": [ ctx._source.userMetadata.photoshoot.title ] ];
      | }
    """.stripMargin

    val metadataParameter = metadata.toOption.map(asNestedMap)
    val lastModifiedParameter = lastModified.toOption.map(_.as[String])

    val params = Map(
      "userMetadata" -> metadataParameter.orNull,
      "lastModified" -> lastModifiedParameter.orNull
    )

    val scriptSource = loadPainless(
      s"""
          | def dtf = DateTimeFormatter.ISO_DATE_TIME;
          | def updateDate = Date.from(Instant.from(dtf.parse(params.lastModified)));
          | def lastUpdatedDate = ctx._source.userMetadataLastModified != null ? Date.from(Instant.from(dtf.parse(ctx._source.userMetadataLastModified))) : null;
          |
          | if (lastUpdatedDate == null || updateDate.after(lastUpdatedDate)) {
          |   ctx._source.userMetadata = params.userMetadata;
          |   ctx._source.userMetadataLastModified = params.lastModified;
          |   $updateLastModifiedScript
          | }
          |
          | $refreshEditsScript
          | $photoshootSuggestionScript
       """
    )

    val script = Script(script = scriptSource).lang("painless").params(params)

    val updateRequest = updateById(imagesAlias, id).script(script)

    List(executeAndLog(updateRequest, s"ES6 updating user metadata on image $id with lastModified $lastModified").map(_ => ElasticSearchUpdateResponse()))
  }

  def getInferredSyndicationRightsImages(
                                          photoshoot: Photoshoot, excludedImageId: Option[String]
                                        )(
                                          implicit ex: ExecutionContext, logMarker: LogMarker
                                        ): Future[List[Image]] = { // TODO could be a Seq
    val inferredSyndicationRights = not(termQuery("syndicationRights.isInferred", false)) // Using 'not' to include nulls

    val filter = excludedImageId match {
      case Some(imageId) => boolQuery must(
        inferredSyndicationRights,
        not(idsQuery(imageId))
      )
      case _ => inferredSyndicationRights
    }

    val filteredMatches: BoolQuery = boolQuery must(
      matchQuery(photoshootField("title"), photoshoot.title),
      filter
    )

    val request = search(imagesAlias) bool filteredMatches limit 200 // TODO no order?

    executeAndLog(request, s"ES6 get images in photoshoot ${photoshoot.title} with inferred syndication rights (excluding $excludedImageId)").map { r =>
      r.result.hits.hits.toList.map { h =>
        Json.parse(h.sourceAsString).as[Image]
      }
    }
  }

  def getLatestSyndicationRights(
                                  photoshoot: Photoshoot, excludedImageId: Option[String] = None
                                )(
                                  implicit ex: ExecutionContext, logMarker: LogMarker
                                ): Future[Option[Image]] = {
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

    executeAndLog(request, s"ES6 get image in photoshoot ${photoshoot.title} with latest rcs syndication rights (excluding $excludedImageId)").map { r =>
      r.result.hits.hits.toList.headOption.map { h =>
        Json.parse(h.sourceAsString).as[Image]
      }
    }
  }

  def deleteImage(id: String)(implicit ex: ExecutionContext, logMarker: LogMarker): List[Future[ElasticSearchDeleteResponse]] = {
    // search for the image first, and then only delete and succeed
    // this is because the delete query does not respond with anything useful
    // TODO: is there a more efficient way to do this?

    val deletableImage = boolQuery.withMust(
      idsQuery(id)).withNot(
      existsQuery("exports"),
      nestedQuery("usages").query(existsQuery("usages"))
    )

    val eventualDeleteResponse = executeAndLog(count(imagesAlias).query(deletableImage), s"ES6 searching for image to delete: $id").flatMap { r =>
      val deleteFuture = r.result.count match {
        case 1 => executeAndLog(deleteById(imagesAlias, id), s"ES6 deleting image $id")
        case _ => Future.failed(ImageNotDeletable)
      }
      deleteFuture
        .incrementOnSuccess(metrics.map(_.deletedImages))
        .incrementOnFailure(metrics.map(_.failedDeletedImages)) { case ImageNotDeletable => true }
    }

    List(eventualDeleteResponse.map { _ =>
      ElasticSearchDeleteResponse()
    })
  }

  def deleteAllImageUsages(id: String)(implicit ex: ExecutionContext, logMarker: LogMarker): List[Future[ElasticSearchUpdateResponse]] = {
    val deleteUsagesScript = loadPainless("""| ctx._source.remove('usages')""")

    val script = Script(script = deleteUsagesScript).lang("painless")

    val updateRequest = updateById(imagesAlias, id).script(script)

    val eventualUpdateResponse = executeAndLog(updateRequest, s"ES6 removing all usages on image $id")
      .incrementOnFailure(metrics.map(_.failedUsagesUpdates)){case _ => true}

    List(eventualUpdateResponse.map(_ => ElasticSearchUpdateResponse()))
  }

  def deleteSyndicationRights(id: String)(implicit ex: ExecutionContext, logMarker: LogMarker): List[Future[ElasticSearchUpdateResponse]] = {
    val deleteSyndicationRightsScript = loadPainless("""
        | ctx._source.remove('syndicationRights');
      """)

    val updateRequest: UpdateRequest = getUpdateRequest(id, deleteSyndicationRightsScript)

    val eventualUpdateResponse = executeAndLog(updateRequest, s"ES6 removing syndication rights on image $id")
      .incrementOnFailure(metrics.map(_.failedSyndicationRightsUpdates)){case _ => true}

    List(eventualUpdateResponse.map(_ => ElasticSearchUpdateResponse()))
  }

  private def getUpdateRequest(id: String, script: String)  = updateById(imagesAlias, id)
      .script(Script(script = script).lang("painless"))

  def replaceImageLeases(id: String, leases: Seq[MediaLease])(implicit ex: ExecutionContext, logMarker: LogMarker): List[Future[ElasticSearchUpdateResponse]] = {
    val replaceLeasesScript = loadPainless(
      """
        | ctx._source.leases = ["leases": params.leases, "lastModified": params.lastModified];
        | """.stripMargin
    )

    val scriptSource = loadPainless(s"""
                                       |   $replaceLeasesScript
                                       |   $updateLastModifiedScript
                                       | """)

    val params = Map(
      "leases" -> leases.map(l => asNestedMap(Json.toJson(l))),
      "lastModified" -> currentIsoDateString
    )

    val script = Script(script = scriptSource).lang("painless").params(params)

    val updateRequest = updateById(imagesAlias, id).script(script)

    val eventualUpdateResponse = executeAndLog(updateRequest, s"ES6 updating all leases on image $id with: ${leases.toString}")
      .incrementOnFailure(metrics.map(_.failedSyndicationRightsUpdates)){case _ => true}

    List(eventualUpdateResponse.map(_ => ElasticSearchUpdateResponse()))
  }

  def addImageLease(id: String, lease: JsLookupResult, lastModified: JsLookupResult)(implicit ex: ExecutionContext, logMarker: LogMarker): List[Future[ElasticSearchUpdateResponse]] = {

    val addLeaseScript = loadPainless(
      """| if (ctx._source.leases == null || ctx._source.leases.leases == null) {
         |   ctx._source.leases = ["leases": [params.lease], "lastModified": params.lastModified];
         | } else {
         |   ctx._source.leases.leases.add(params.lease);
         |   ctx._source.leases.lastModified = params.lastModified;
         | }
    """.stripMargin)

    val scriptSource = loadPainless(s"""
                                       |   $addLeaseScript
                                       |   $updateLastModifiedScript
                                       | """)

    val leaseParameter = lease.toOption.map(_.as[MediaLease])
    val lastModifiedParameter = currentIsoDateString

    val params = Map(
      "lease" -> leaseParameter.map(i => asNestedMap(Json.toJson(i))).getOrElse(null),
      "lastModified" -> lastModifiedParameter
    )

    val script = Script(script = scriptSource).lang("painless").params(params)

    val updateRequest = updateById(imagesAlias, id).script(script)

    val eventualUpdateResponse = executeAndLog(updateRequest, s"ES6 adding lease on image $id with: $leaseParameter")
      .incrementOnFailure(metrics.map(_.failedUsagesUpdates)){case _ => true}

    List(eventualUpdateResponse.map(_ => ElasticSearchUpdateResponse()))
  }

  def removeImageLease(id: String, leaseId: JsLookupResult, lastModified: JsLookupResult)(implicit ex: ExecutionContext, logMarker: LogMarker): List[Future[ElasticSearchUpdateResponse]] = {
    val removeLeaseScript = loadPainless(
      """|
         | for(int i = 0; i < ctx._source.leases.leases.size(); i++) {
         |    if (ctx._source.leases.leases[i].id == params.leaseId) {
         |      ctx._source.leases.leases.remove(i);
         |      ctx._source.leases.lastModified = params.lastModified;
         |    }
         | }
      """)

    val scriptSource = loadPainless(
      s"""
         |   $removeLeaseScript
         |   $updateLastModifiedScript
         | """)

    val leaseIdParameter = leaseId.toOption.map(_.as[String])
    val lastModifiedParameter = currentIsoDateString

    val params = Map(
      "leaseId" -> leaseIdParameter.getOrElse(null),
      "lastModified" -> lastModifiedParameter
    )

    val script = Script(script = scriptSource).lang("painless").params(params)

    val updateRequest = updateById(imagesAlias, id).script(script)

    val eventualUpdateResponse = executeAndLog(updateRequest, s"ES6 removing lease with id $leaseIdParameter from image $id")
      .incrementOnFailure(metrics.map(_.failedUsagesUpdates)) { case _ => true }

    List(eventualUpdateResponse.map(_ => ElasticSearchUpdateResponse()))
  }

  def updateImageExports(id: String, exports: JsLookupResult)(implicit ex: ExecutionContext, logMarker: LogMarker): List[Future[ElasticSearchUpdateResponse]] = {

    val addExportsScript = loadPainless(
    """| if (ctx._source.exports == null) {
       |   ctx._source.exports = params.exports;
       | } else {
       |   ctx._source.exports.addAll(params.exports);
       | }
    """)

    val scriptSource = loadPainless(
      s"""
         |   $addExportsScript
         |   $updateLastModifiedScript
         | """)

    val exportsParameter = exports.toOption.map { cs: JsValue =>  // TODO deduplicate with set collections
      cs.as[JsArray].value.map { c =>
        asNestedMap(c)
      }
    }

    val params = Map(
      "exports" -> exportsParameter.getOrElse(null),
      "lastModified" -> currentIsoDateString
    )

    val script = Script(script = scriptSource).lang("painless").params(params)

    val updateRequest = updateById(imagesAlias, id).script(script)

    val eventualUpdateResponse = executeAndLog(updateRequest, s"ES6 updating exports on image $id")
      .incrementOnFailure(metrics.map(_.failedExportsUpdates)) { case _ => true }

    List(eventualUpdateResponse.map(_ => ElasticSearchUpdateResponse()))
  }

  def deleteImageExports(id: String, logMarker: LogMarker)(implicit ex: ExecutionContext): List[Future[ElasticSearchUpdateResponse]] = {
    implicit val lm = logMarker
    val deleteExportsScript = loadPainless("""
     | ctx._source.remove('exports');
    """)

    val scriptSource = loadPainless(
      s"""
         |   $deleteExportsScript
         |   $updateLastModifiedScript
         | """)

    val params = Map(
      "lastModified" -> currentIsoDateString
    )

    val script = Script(script = scriptSource).lang("painless").params(params)

    val updateRequest = updateById(imagesAlias, id).script(script)

    val eventualUpdateResponse = executeAndLog(updateRequest, s"ES6 removing exports from image $id")
      .incrementOnFailure(metrics.map(_.failedExportsUpdates)) { case _ => true }

    List(eventualUpdateResponse.map(_ => ElasticSearchUpdateResponse()))
  }

  def setImageCollection(
                          id: String, collections: JsLookupResult
                        )(
                          implicit ex: ExecutionContext, logMarker: LogMarker
                        ): List[Future[ElasticSearchUpdateResponse]] = {
    // TODO rename to setImageCollections
    val setCollectionsScript = loadPainless(
      """
        | ctx._source.collections = params.collections;
      """)

    val collectionsParameter = collections.toOption.map { cs: JsValue =>
      cs.as[JsArray].value.map { c =>
        asNestedMap(c)
      }
    }

    val params = Map(
      "collections" -> collectionsParameter.getOrElse(null),
      "lastModified" -> currentIsoDateString
    )

    val script = Script(script = setCollectionsScript).lang("painless").params(params)

    val updateRequest = updateById(imagesAlias, id).script(script)

    val eventualUpdateResponse = executeAndLog(updateRequest, s"ES6 setting collections on image $id")
      .incrementOnFailure(metrics.map(_.failedCollectionsUpdates)) { case _ => true }

    List(eventualUpdateResponse.map(_ => ElasticSearchUpdateResponse()))
  }

  private val refreshMetadataScript = """
      | ctx._source.metadata = ctx._source.originalMetadata.clone();
      | if (ctx._source.userMetadata != null && ctx._source.userMetadata.metadata != null) {
      |   ctx._source.metadata.putAll(ctx._source.userMetadata.metadata);
      |   ctx._source.metadata = ctx._source.metadata.entrySet().stream().filter(x -> x.value != "").collect(Collectors.toMap(Map.Entry::getKey, Map.Entry::getValue));
      | }
    """.stripMargin

  private val refreshUsageRightsScript = """
                                   | if (ctx._source.userMetadata != null && ctx._source.userMetadata.usageRights != null) {
                                   |   ctx._source.usageRights = ctx._source.userMetadata.usageRights.clone();
                                   | } else {
                                   |   ctx._source.usageRights = ctx._source.originalUsageRights.clone();
                                   | }
                                 """.stripMargin

  private val refreshEditsScript = refreshMetadataScript + refreshUsageRightsScript

  private def loadPainless(str: String) = str.stripMargin.split('\n').map(_.trim.filter(_ >= ' ')).mkString // remove ctrl chars and leading, trailing whitespace

  // Script that updates the "lastModified" property using the "lastModified" parameter
  private val updateLastModifiedScript =
    """|  ctx._source.lastModified = params.lastModified;
    """.stripMargin

  private def asNestedMap(sr: SyndicationRights) = { // TODO not great; there must be a better way to flatten a case class into a Map
    import com.fasterxml.jackson.databind.ObjectMapper
    import com.fasterxml.jackson.module.scala.DefaultScalaModule
    import com.fasterxml.jackson.module.scala.experimental.ScalaObjectMapper
    val mapper = new ObjectMapper() with ScalaObjectMapper
    mapper.registerModule(DefaultScalaModule)
    mapper.readValue[Map[String, Object]](Json.stringify(Json.toJson(sr)))
  }

  private def asNestedMap(i: JsValue) = { // TODO not great; there must be a better way to flatten a case class into a Map
    import com.fasterxml.jackson.databind.ObjectMapper
    import com.fasterxml.jackson.module.scala.DefaultScalaModule
    import com.fasterxml.jackson.module.scala.experimental.ScalaObjectMapper
    val mapper = new ObjectMapper() with ScalaObjectMapper
    mapper.registerModule(DefaultScalaModule)
    mapper.readValue[Map[String, Object]](Json.stringify(i))
  }

  private def currentIsoDateString = printDateTime(new DateTime())

  private def asImageUpdate(image: JsValue): JsValue = {
    def removeUploadInformation(): Reads[JsObject] =
      (__ \ "uploadTime").json.prune andThen
        (__ \ "userMetadata").json.prune andThen
        (__ \ "exports").json.prune andThen
        (__ \ "uploadedBy").json.prune andThen
        (__ \ "collections").json.prune andThen
        (__ \ "leases").json.prune andThen
        (__ \ "usages").json.prune

    image.transform(removeUploadInformation).get
  }
}
