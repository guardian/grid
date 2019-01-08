package lib.elasticsearch.impls.elasticsearch6

import com.gu.mediaservice.lib.elasticsearch.ImageFields
import com.gu.mediaservice.lib.elasticsearch6.ElasticSearchClient
import com.gu.mediaservice.model.Image
import com.sksamuel.elastic4s.http.ElasticDsl
import com.sksamuel.elastic4s.http.ElasticDsl._
import com.sksamuel.elastic4s.http.search.SearchHit
import lib.elasticsearch._
import lib.{MediaApiConfig, MediaApiMetrics, SupplierUsageSummary}
import play.api.Logger
import play.api.libs.json.{JsError, JsSuccess, Json}
import scalaz.NonEmptyList
import scalaz.syntax.std.list._

import scala.concurrent.{ExecutionContext, Future}

class ElasticSearch(config: MediaApiConfig, mediaApiMetrics: MediaApiMetrics) extends ElasticSearchVersion with ElasticSearchClient with ImageFields {

  lazy val imagesAlias = config.imagesAlias
  lazy val host = "localhost"
  lazy val port = 9206
  lazy val cluster = "media-service"

  // TODO These should not be required for a read only client
  lazy val shards = 1
  lazy val replicas = 0

  val searchFilters = new SearchFilters(config)
  val syndicationFilter = new SyndicationFilter(config)
  val queryBuilder = new QueryBuilder(imagesAlias)

  override def getImageById(id: String)(implicit ex: ExecutionContext): Future[Option[Image]] = ???

  override def search(params: SearchParams)(implicit ex: ExecutionContext): Future[SearchResults] = {

    def queryFor(params: SearchParams) = {

      val query = queryBuilder.makeQuery(params.structuredQuery)

      val uploadTimeFilter  = filters.date("uploadTime", params.since, params.until)
      val lastModTimeFilter = filters.date("lastModified", params.modifiedSince, params.modifiedUntil)
      val takenTimeFilter   = filters.date("metadata.dateTaken", params.takenSince, params.takenUntil)
      // we only inject filters if there are actual date parameters
      val dateFilterList    = List(uploadTimeFilter, lastModTimeFilter, takenTimeFilter).flatten.toNel
      val dateFilter        = dateFilterList.map(dateFilters => filters.and(dateFilters.list: _*))

      val idsFilter         = params.ids.map(filters.ids)
      val labelFilter       = params.labels.toNel.map(filters.terms("labels", _))
      val metadataFilter    = params.hasMetadata.map(metadataField).toNel.map(filters.exists)
      val archivedFilter    = params.archived.map(filters.existsOrMissing(editsField("archived"), _))
      val hasExports        = params.hasExports.map(filters.existsOrMissing("exports", _))
      val hasIdentifier     = params.hasIdentifier.map(idName => filters.exists(NonEmptyList(identifierField(idName))))
      val missingIdentifier = params.missingIdentifier.map(idName => filters.missing(NonEmptyList(identifierField(idName))))
      val uploadedByFilter  = params.uploadedBy.map(uploadedBy => filters.terms("uploadedBy", NonEmptyList(uploadedBy)))
      val simpleCostFilter  = params.free.flatMap(free => if (free) searchFilters.freeFilter else searchFilters.nonFreeFilter)
      val costFilter        = params.payType match {
        case Some(PayType.Free) => searchFilters.freeFilter
        case Some(PayType.MaybeFree) => searchFilters.maybeFreeFilter
        case Some(PayType.Pay) => searchFilters.nonFreeFilter
        case _ => None
      }

      val hasRightsCategory = params.hasRightsCategory.filter(_ == true).map(_ => searchFilters.hasRightsCategoryFilter)

      val validityFilter = params.valid.flatMap(valid => if(valid) searchFilters.validFilter else searchFilters.invalidFilter)

      val persistFilter = params.persisted map {
        case true   => searchFilters.persistedFilter
        case false  => searchFilters.nonPersistedFilter
      }

      val usageFilter =
       params.usageStatus.toNel.map(status => filters.terms(usagesField("status"), status.map(_.toString))) ++
         params.usagePlatform.toNel.map(filters.terms(usagesField("platform"), _))

      val syndicationStatusFilter = params.syndicationStatus.map(status => syndicationFilter.statusFilter(status))

      val filterOpt = (
        metadataFilter.toList
          ++ persistFilter
          ++ labelFilter
          ++ archivedFilter
          ++ uploadedByFilter
          ++ idsFilter
          ++ validityFilter
          ++ simpleCostFilter
          ++ costFilter
          ++ hasExports
          ++ hasIdentifier
          ++ missingIdentifier
          ++ dateFilter
          ++ usageFilter
          ++ hasRightsCategory
          ++ searchFilters.tierFilter(params.tier)
          ++ syndicationStatusFilter
        ).toNel.map(filter => filter.list.reduceLeft(filters.and(_, _)))

      filterOpt.map { f =>
        query bool must(f)
      }.getOrElse(query)
    }

    val query = queryFor(params)

    def resolveHit(h: SearchHit) = {
      Json.parse(h.sourceAsString).validate[Image] match {
        case i: JsSuccess[Image] => Some(i.value.id, i.value)
        case e: JsError =>
          Logger.error("Failed to parse image from elastic search hit " + h.id + ": " + e.toString)
          None
      }
    }

    client.execute(query).map { r =>
      val imageHits = r.result.hits.hits.map(resolveHit).toSeq.flatten
      SearchResults(hits = imageHits, total = r.result.totalHits)
    }
  }

  override def usageForSupplier(id: String, numDays: Int)(implicit ex: ExecutionContext): Future[SupplierUsageSummary] = ???

  override def dateHistogramAggregate(params: AggregateSearchParams)(implicit ex: ExecutionContext): Future[AggregateSearchResults] = ???

  override def metadataSearch(params: AggregateSearchParams)(implicit ex: ExecutionContext): Future[AggregateSearchResults] = ???

  override def editsSearch(params: AggregateSearchParams)(implicit ex: ExecutionContext): Future[AggregateSearchResults] = ???

  override def completionSuggestion(name: String, q: String, size: Int)(implicit ex: ExecutionContext): Future[CompletionSuggestionResults] = ???

  def totalImages()(implicit ex: ExecutionContext): Future[Long] = client.execute(ElasticDsl.search(imagesAlias)).map { _.result.totalHits}

}
