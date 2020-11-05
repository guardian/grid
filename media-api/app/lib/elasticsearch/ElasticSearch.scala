package lib.elasticsearch

import java.util.concurrent.TimeUnit

import com.gu.mediaservice.lib.ImageFields
import com.gu.mediaservice.lib.auth.Authentication.Principal
import com.gu.mediaservice.lib.elasticsearch.{ElasticSearchClient, ElasticSearchConfig, ElasticSearchExecutions, Mappings}
import com.gu.mediaservice.lib.logging.{GridLogging, MarkerMap}
import com.gu.mediaservice.lib.metrics.FutureSyntax
import com.gu.mediaservice.model.{Agencies, Agency, Image}
import com.sksamuel.elastic4s.ElasticDsl
import com.sksamuel.elastic4s.ElasticDsl._
import com.sksamuel.elastic4s.requests.searches.{Aggregations, DateHistogramInterval, SearchHit, SearchRequest, SearchResponse}
import com.sksamuel.elastic4s.requests.searches.queries.Query
import lib.elasticsearch._
import lib.querysyntax.{HierarchyField, Match, Phrase}
import lib.{MediaApiConfig, MediaApiMetrics, SupplierUsageSummary}
import play.api.libs.json.{JsError, JsSuccess, Json}
import play.api.mvc.AnyContent
import play.api.mvc.Security.AuthenticatedRequest
import play.mvc.Http.Status
import scalaz.NonEmptyList
import scalaz.syntax.std.list._

import scala.concurrent.duration.FiniteDuration
import scala.concurrent.{ExecutionContext, Future}
import com.sksamuel.elastic4s.requests.searches.aggs.Aggregation

class ElasticSearch(val config: MediaApiConfig, mediaApiMetrics: MediaApiMetrics, elasticConfig: ElasticSearchConfig, overQuotaAgencies: () => List[Agency])
  extends ElasticSearchClient with ImageFields with MatchFields with FutureSyntax with GridLogging {

  lazy val imagesAlias = elasticConfig.alias
  lazy val url = elasticConfig.url
  lazy val cluster = elasticConfig.cluster
  lazy val shards = elasticConfig.shards
  lazy val replicas = elasticConfig.replicas

  private val SearchQueryTimeout = FiniteDuration(10, TimeUnit.SECONDS)
  // there is 15 seconds timeout set on cluster level as well

  /**
   * int terms of search query timeout in GRID,
   * there is a additional config `allow_partial_search_results`
   * which is set to true by default,
   * which means for example if i ask ES to give me photos that have field foo=bar without timeout it can give me 6500 results
   * if i ask the same query with 1ms timeout it may give me for example 4000 results instead
   **/

  val searchFilters = new SearchFilters(config)
  val syndicationFilter = new SyndicationFilter(config)

  val queryBuilder = new QueryBuilder(matchFields, overQuotaAgencies)

  def getImageById(id: String)(implicit ex: ExecutionContext, request: AuthenticatedRequest[AnyContent, Principal]): Future[Option[Image]] = {
    implicit val logMarker = MarkerMap("id" -> id)
    executeAndLog(get(imagesAlias, id), s"get image by id $id").map { r =>
      r.status match {
        case Status.OK => mapImageFrom(r.result.sourceAsString, id)
        case _ => None
      }
    }
  }

  def search(params: SearchParams)(implicit ex: ExecutionContext, request: AuthenticatedRequest[AnyContent, Principal]): Future[SearchResults] = {
    implicit val logMarker = MarkerMap()
    def resolveHit(hit: SearchHit) = mapImageFrom(hit.sourceAsString, hit.id)

    val query: Query = queryBuilder.makeQuery(params.structuredQuery)

    val uploadTimeFilter = filters.date("uploadTime", params.since, params.until)
    val lastModTimeFilter = filters.date("lastModified", params.modifiedSince, params.modifiedUntil)
    val takenTimeFilter = filters.date("metadata.dateTaken", params.takenSince, params.takenUntil)
    // we only inject filters if there are actual date parameters
    val dateFilterList = List(uploadTimeFilter, lastModTimeFilter, takenTimeFilter).flatten.toNel
    val dateFilter = dateFilterList.map(dateFilters => filters.and(dateFilters.list: _*))

    val idsFilter = params.ids.map(filters.ids)
    val labelFilter = params.labels.toNel.map(filters.terms("labels", _))
    val metadataFilter = params.hasMetadata.map(metadataField).toNel.map(filters.exists)
    val archivedFilter = params.archived.map(filters.existsOrMissing(editsField("archived"), _))
    val hasExports = params.hasExports.map(filters.existsOrMissing("exports", _))
    val hasIdentifier = params.hasIdentifier.map(idName => filters.exists(NonEmptyList(identifierField(idName))))
    val missingIdentifier = params.missingIdentifier.map(idName => filters.missing(NonEmptyList(identifierField(idName))))
    val uploadedByFilter = params.uploadedBy.map(uploadedBy => filters.terms("uploadedBy", NonEmptyList(uploadedBy)))
    val simpleCostFilter = params.free.flatMap(free => if (free) searchFilters.freeFilter else searchFilters.nonFreeFilter)
    val costFilter = params.payType match {
      case Some(PayType.Free) => searchFilters.freeFilter
      case Some(PayType.MaybeFree) => searchFilters.maybeFreeFilter
      case Some(PayType.Pay) => searchFilters.nonFreeFilter
      case _ => None
    }

    val hasRightsCategory = params.hasRightsCategory.filter(_ == true).map(_ => searchFilters.hasRightsCategoryFilter)

    val validityFilter = params.valid.flatMap(valid => if (valid) searchFilters.validFilter else searchFilters.invalidFilter)

    val persistFilter = params.persisted map {
      case true => searchFilters.persistedFilter
      case false => searchFilters.nonPersistedFilter
    }

    val usageFilter =
      params.usageStatus.toNel.map(status => filters.terms("usagesStatus", status.map(_.toString))) ++
        params.usagePlatform.toNel.map(filters.terms("usagesPlatform", _))

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
      boolQuery must (query) filter f
    }.getOrElse(query)

    val sort = params.orderBy match {
      case Some("dateAddedToCollection") => sorts.dateAddedToCollectionDescending
      case _ => sorts.createSort(params.orderBy)
    }

    // We need to set trackHits to ensure that the total number of hits we return to users is accurate.
    // See https://www.elastic.co/guide/en/elasticsearch/reference/current/breaking-changes-7.0.html#hits-total-now-object-search-response
    val searchRequest = prepareSearch(withFilter).copy(trackHits = Some(true)) from params.offset size params.length sortBy sort

    executeAndLog(searchRequest, "image search").
      toMetric(Some(mediaApiMetrics.searchQueries), List(mediaApiMetrics.searchTypeDimension("results")))(_.result.took).map { r =>
      logSearchQueryIfTimedOut(searchRequest, r.result)
      val imageHits = r.result.hits.hits.map(resolveHit).toSeq.flatten.map(i => (i.id, i))
      SearchResults(hits = imageHits, total = r.result.totalHits)
    }
  }

  def usageForSupplier(id: String, numDays: Int)(implicit ex: ExecutionContext, request: AuthenticatedRequest[AnyContent, Principal]): Future[SupplierUsageSummary] = {
    implicit val logMarker = MarkerMap()
    val supplier = Agencies.get(id)
    val supplierName = supplier.supplier

    val bePublished = termQuery("usages.status", "published")
    val beInLastPeriod = rangeQuery("usages.dateAdded")
      .gte(s"now-${numDays}d/d")
      .lt("now/d")

    val haveUsageInLastPeriod = boolQuery.must(bePublished, beInLastPeriod)

    val beSupplier = termQuery("usageRights.supplier", supplierName)
    val haveNestedUsage = nestedQuery("usages", haveUsageInLastPeriod)

    val query = boolQuery.must(matchAllQuery()).filter(boolQuery().must(beSupplier, haveNestedUsage))

    val search = prepareSearch(query) size 0

    executeAndLog(search, s"$id usage search").map { r =>
      import r.result
      logSearchQueryIfTimedOut(search, result)
      SupplierUsageSummary(supplier, result.hits.total.value)
    }
  }

  def dateHistogramAggregate(params: AggregateSearchParams)(implicit ex: ExecutionContext, request: AuthenticatedRequest[AnyContent, Principal]): Future[AggregateSearchResults] = {

    def fromDateHistogramAggregation(name: String, aggregations: Aggregations): Seq[BucketResult] = aggregations.dateHistogram(name).
      buckets.map(b => BucketResult(b.date, b.docCount))

    val aggregation = dateHistogramAggregation(params.field).
      field(params.field).
      calendarInterval(DateHistogramInterval.Month).
      minDocCount(0)
    aggregateSearch(params.field, params, aggregation, fromDateHistogramAggregation)

  }

  def metadataSearch(params: AggregateSearchParams)(implicit ex: ExecutionContext, request: AuthenticatedRequest[AnyContent, Principal]): Future[AggregateSearchResults] = {
    aggregateSearch("metadata", params, termsAggregation("metadata").field(metadataField(params.field)), fromTermAggregation)
  }

  def editsSearch(params: AggregateSearchParams)(implicit ex: ExecutionContext, request: AuthenticatedRequest[AnyContent, Principal]): Future[AggregateSearchResults] = {
    logger.info("Edit aggregation requested with params.field: " + params.field)
    val field = "labels" // TODO was - params.field
    aggregateSearch("edits", params, termsAggregation("edits").field(editsField(field)), fromTermAggregation)
  }

  private def fromTermAggregation(name: String, aggregations: Aggregations): Seq[BucketResult] = aggregations.terms(name).
    buckets.map(b => BucketResult(b.key, b.docCount))

  private def aggregateSearch(name: String, params: AggregateSearchParams, aggregation: Aggregation, extract: (String, Aggregations) => Seq[BucketResult])(implicit ex: ExecutionContext): Future[AggregateSearchResults] = {
    implicit val logMarker = MarkerMap()
    logger.info("aggregate search: " + name + " / " + params + " / " + aggregation)
    val query = queryBuilder.makeQuery(params.structuredQuery)
    val search = prepareSearch(query) aggregations aggregation size 0

    executeAndLog(search, s"$name aggregate search")
      .toMetric(Some(mediaApiMetrics.searchQueries), List(mediaApiMetrics.searchTypeDimension("aggregate")))(_.result.took).map { r =>
      logSearchQueryIfTimedOut(search, r.result)
      searchResultToAggregateResponse(r.result, name, extract)
    }
  }

  private def searchResultToAggregateResponse(response: SearchResponse, aggregateName: String, extract: (String, Aggregations) => Seq[BucketResult]): AggregateSearchResults = {
    val results = extract(aggregateName, response.aggregations)
    AggregateSearchResults(results, results.size)
  }

  def completionSuggestion(name: String, q: String, size: Int)(implicit ex: ExecutionContext, request: AuthenticatedRequest[AnyContent, Principal]): Future[CompletionSuggestionResults] = {
    implicit val logMarker = MarkerMap()
    val completionSuggestion =
      ElasticDsl.completionSuggestion(name, name).text(q).skipDuplicates(true)
    val search = ElasticDsl.search(imagesAlias) suggestions completionSuggestion
    executeAndLog(search, "completion suggestion query").
      toMetric(Some(mediaApiMetrics.searchQueries), List(mediaApiMetrics.searchTypeDimension("suggestion-completion")))(_.result.took).map { r =>
      logSearchQueryIfTimedOut(search, r.result)
      val x = r.result.suggestions.get(name).map { suggestions =>
        suggestions.flatMap { s =>
          s.toCompletion.options.map { o =>
            CompletionSuggestionResult(o.text, o.score.toFloat)
          }
        }
      }.getOrElse(Seq.empty)
      CompletionSuggestionResults(x.toList)
    }
  }

  def totalImages()(implicit ex: ExecutionContext): Future[Long] = client.execute(ElasticDsl.search(imagesAlias)).map {
    _.result.totalHits
  }

  def withSearchQueryTimeout(sr: SearchRequest): SearchRequest = sr timeout SearchQueryTimeout

  private def prepareSearch(query: Query): SearchRequest = {
    val sr = ElasticDsl.search(imagesAlias) query query
    withSearchQueryTimeout(sr)
  }

  private def mapImageFrom(sourceAsString: String, id: String) = {
    Json.parse(sourceAsString).validate[Image] match {
      case i: JsSuccess[Image] => Some(i.value)
      case e: JsError =>
        logger.error("Failed to parse image from source string " + id + ": " + e.toString)
        None
    }
  }

  private def logSearchQueryIfTimedOut(req: SearchRequest, res: SearchResponse) =
    if (res.isTimedOut) logger.info(s"SearchQuery was TimedOut after $SearchQueryTimeout \nquery: ${req.show}")

}
