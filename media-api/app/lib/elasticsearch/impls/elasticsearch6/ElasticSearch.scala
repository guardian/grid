package lib.elasticsearch.impls.elasticsearch6

import com.gu.mediaservice.lib.elasticsearch.ImageFields
import com.gu.mediaservice.lib.elasticsearch6.{ElasticSearch6Executions, ElasticSearchClient, Mappings}
import com.gu.mediaservice.lib.metrics.FutureSyntax
import com.gu.mediaservice.model.{Agencies, Image}
import com.sksamuel.elastic4s.http.ElasticDsl
import com.sksamuel.elastic4s.http.ElasticDsl._
import com.sksamuel.elastic4s.http.search.{Aggregations, SearchHit, SearchResponse}
import com.sksamuel.elastic4s.searches.DateHistogramInterval
import com.sksamuel.elastic4s.searches.aggs.Aggregation
import com.sksamuel.elastic4s.searches.queries.Query
import lib.elasticsearch._
import lib.querysyntax.{HierarchyField, Match, Phrase}
import lib.{MediaApiConfig, MediaApiMetrics, SupplierUsageSummary}
import play.api.Logger
import play.api.libs.json.{JsError, JsSuccess, Json}
import scalaz.NonEmptyList
import scalaz.syntax.std.list._

import scala.concurrent.{ExecutionContext, Future}

class ElasticSearch(val config: MediaApiConfig, mediaApiMetrics: MediaApiMetrics) extends ElasticSearchVersion
  with ElasticSearchClient with ElasticSearch6Executions with ImageFields with MatchFields with FutureSyntax {

  lazy val imagesAlias = config.imagesAlias
  lazy val host = "localhost"
  lazy val port = 9206
  lazy val cluster = "media-service"

  // TODO These should not be required for a read only client
  lazy val shards = 1
  lazy val replicas = 0

  val searchFilters = new SearchFilters(config)
  val syndicationFilter = new SyndicationFilter(config)

  val queryBuilder = new QueryBuilder(matchFields)

  override def getImageById(id: String)(implicit ex: ExecutionContext): Future[Option[Image]] = {
    executeAndLog(get(imagesAlias, Mappings.dummyType, id), s"get image by id $id").map { r =>
      mapImageFrom(r.result.sourceAsString, id)
    }
  }

  override def search(params: SearchParams)(implicit ex: ExecutionContext): Future[SearchResults] = {

    def resolveHit(hit: SearchHit) = mapImageFrom(hit.sourceAsString, hit.id)

    val query: Query = queryBuilder.makeQuery(params.structuredQuery)

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

    // Port of special case code in elastic1 sorts. Using the dateAddedToCollection sort implies an additional filter for reasons unknown
    val dateAddedToCollectionFilter = {
      params.orderBy match {
        case Some("dateAddedToCollection") => {
          val pathHierarchyOpt = params.structuredQuery.flatMap {
            case Match(HierarchyField, Phrase(value)) => Some(value)
            case _ => None
          }.headOption

          pathHierarchyOpt.map { pathHierarchy =>
            termQuery("collections.pathHierarchy", pathHierarchy)
          }
        }
        case _ => None
      }
    }

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
        ++ dateAddedToCollectionFilter
      ).toNel.map(filter => filter.list.reduceLeft(filters.and(_, _)))

    val withFilter = filterOpt.map { f =>
      boolQuery must(query) filter f
    }.getOrElse(query)

    val sort = params.orderBy match {
      case Some("dateAddedToCollection") => sorts.dateAddedToCollectionDescending
      case _  => sorts.createSort(params.orderBy)
    }

    val searchRequest = prepareSearch(withFilter) from params.offset size params.length sortBy sort

    executeAndLog(searchRequest, "image search").
      toMetric(mediaApiMetrics.searchQueries, List(mediaApiMetrics.searchTypeDimension("results")))(_.result.took).map { r =>
      val imageHits = r.result.hits.hits.map(resolveHit).toSeq.flatten.map(i => (i.id, i))
      SearchResults(hits = imageHits, total = r.result.totalHits)
    }
  }

  override def usageForSupplier(id: String, numDays: Int)(implicit ex: ExecutionContext): Future[SupplierUsageSummary] = {
    val supplier = Agencies.get(id)
    val supplierName = supplier.supplier

    val bePublished = termQuery("usages.status","published")
    val beInLastPeriod = rangeQuery("usages.dateAdded")
      .gte(s"now-${numDays}d/d")
      .lt("now/d")

    val haveUsageInLastPeriod = boolQuery.must(bePublished, beInLastPeriod)

    val beSupplier = termQuery("usageRights.supplier", supplierName)
    val haveNestedUsage = nestedQuery("usages", haveUsageInLastPeriod)

    val query = boolQuery.must(matchAllQuery()).filter(boolQuery().must(beSupplier, haveNestedUsage))

    val search = prepareSearch(query) size 0

    executeAndLog(search, s"$id usage search").map { r =>
      SupplierUsageSummary(supplier, r.result.hits.total)
    }
  }

  override def dateHistogramAggregate(params: AggregateSearchParams)(implicit ex: ExecutionContext): Future[AggregateSearchResults] = {

    def fromDateHistrogramAggregation(name: String, aggregations: Aggregations): Seq[BucketResult] = aggregations.dateHistogram(name).
      buckets.map(b => BucketResult(b.date, b.docCount))

    aggregateSearch(params.field, params,
      dateHistogramAggregation(params.field).
        field(params.field).
        interval(DateHistogramInterval.Month).
        minDocCount(0), fromDateHistrogramAggregation)
  }

  override def metadataSearch(params: AggregateSearchParams)(implicit ex: ExecutionContext): Future[AggregateSearchResults] = {
    aggregateSearch("metadata", params, termsAggregation("metadata").field(metadataField(params.field)).minDocCount(0), fromTermAggregation)
  }

  override def editsSearch(params: AggregateSearchParams)(implicit ex: ExecutionContext): Future[AggregateSearchResults] = {
    aggregateSearch("edits", params, termsAggregation("edits").field(editsField(params.field)).minDocCount(0), fromTermAggregation)
  }

  private def fromTermAggregation(name: String, aggregations: Aggregations): Seq[BucketResult] = aggregations.terms(name).
    buckets.map(b => BucketResult(b.key, b.docCount))

  private def aggregateSearch(name: String, params: AggregateSearchParams, aggregation: Aggregation, extract: (String, Aggregations) => Seq[BucketResult])(implicit ex: ExecutionContext): Future[AggregateSearchResults] = {
    val query = queryBuilder.makeQuery(params.structuredQuery)

    val search = prepareSearch(query) aggregations aggregation size 0

    executeAndLog(search, s"$name aggregate search")
      .toMetric(mediaApiMetrics.searchQueries, List(mediaApiMetrics.searchTypeDimension("aggregate")))(_.result.took).map { r =>
      searchResultToAggregateResponse(r.result, name, extract)
    }
  }

  private def searchResultToAggregateResponse(response: SearchResponse, aggregateName: String, extract: (String, Aggregations) => Seq[BucketResult]): AggregateSearchResults = {
    val results = extract(aggregateName, response.aggregations)
    AggregateSearchResults(results, results.size)
  }

  override def completionSuggestion(name: String, q: String, size: Int)(implicit ex: ExecutionContext): Future[CompletionSuggestionResults] = ???

  def totalImages()(implicit ex: ExecutionContext): Future[Long] = client.execute(ElasticDsl.search(imagesAlias)).map { _.result.totalHits}

  private def prepareSearch(query: Query) = ElasticDsl.search(imagesAlias) query query

  private def mapImageFrom(sourceAsString: String, id: String) = {
    Json.parse(sourceAsString).validate[Image] match {
      case i: JsSuccess[Image] => Some(i.value)
      case e: JsError =>
        Logger.error("Failed to parse image from source string " + id + ": " + e.toString)
        None
    }
  }

}
