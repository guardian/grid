package lib.elasticsearch

import com.gu.mediaservice.lib.argo.ArgoHelpers
import com.gu.mediaservice.lib.auth.Syndication
import com.gu.mediaservice.lib.elasticsearch.{ElasticSearchClient, ImageFields}
import com.gu.mediaservice.model.Agencies
import com.gu.mediaservice.syntax._
import controllers.{AggregateSearchParams, PayType, SearchParams}
import lib.{MediaApiConfig, MediaApiMetrics, SupplierUsageSummary}
import org.elasticsearch.action.get.GetRequestBuilder
import org.elasticsearch.action.search.{SearchRequestBuilder, SearchResponse, SearchType}
import org.elasticsearch.index.query.QueryBuilders._
import org.elasticsearch.index.query._
import org.elasticsearch.search.aggregations.bucket.MultiBucketsAggregation
import org.elasticsearch.search.aggregations.bucket.histogram.DateHistogram
import org.elasticsearch.search.aggregations.{AbstractAggregationBuilder, AggregationBuilders}
import org.elasticsearch.search.suggest.completion.{CompletionSuggestion, CompletionSuggestionBuilder}
import play.api.libs.json._
import scalaz.NonEmptyList
import scalaz.syntax.id._
import scalaz.syntax.std.list._

import scala.collection.JavaConverters._
import scala.concurrent.{ExecutionContext, Future}

case class SearchResults(hits: Seq[(String, JsValue)], total: Long)

case class AggregateSearchResults(results: Seq[BucketResult], total: Long)

case class CompletionSuggestionResult(key: String, score: Float)
object CompletionSuggestionResult {
  implicit val jsonWrites = Json.writes[CompletionSuggestionResult]
}

case class CompletionSuggestionResults(results: List[CompletionSuggestionResult])
object CompletionSuggestionResults {
  implicit val jsonWrites = Json.writes[CompletionSuggestionResults]
}

case class BucketResult(key: String, count: Long)
object BucketResult {
  implicit val jsonWrites = Json.writes[BucketResult]
}

class ElasticSearch(config: MediaApiConfig, searchFilters: SearchFilters, mediaApiMetrics: MediaApiMetrics) extends ElasticSearchClient with ImageFields with ArgoHelpers {

  lazy val imagesAlias = config.imagesAlias
  lazy val host = config.elasticsearchHost
  lazy val port = config.properties("es.port").toInt
  lazy val cluster = config.properties("es.cluster")
  lazy val clientTransportSniff = true

  def getImageById(id: String)(implicit ex: ExecutionContext): Future[Option[JsValue]] =
    prepareGet(id).executeAndLog(s"get image by id $id") map (_.sourceOpt)

  val matchFields: Seq[String] = Seq("id") ++
    Seq("description", "title", "byline", "source", "credit", "keywords",
      "subLocation", "city", "state", "country", "suppliersReference", "englishAnalysedCatchAll").map(metadataField) ++
    Seq("labels").map(editsField) ++
    config.queriableIdentifiers.map(identifierField) ++
    Seq("restrictions").map(usageRightsField)

  val queryBuilder = new QueryBuilder(matchFields)

  def search(params: SearchParams)(implicit ex: ExecutionContext): Future[SearchResults] = {

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

    val validityFilter: Option[FilterBuilder] = params.valid.flatMap(valid => if(valid) searchFilters.validFilter else searchFilters.invalidFilter)

    val persistFilter = params.persisted map {
      case true   => searchFilters.persistedFilter
      case false  => searchFilters.nonPersistedFilter
    }

    val usageFilter =
      params.usageStatus.toNel.map(status => filters.terms(usagesField("status"), status.map(_.toString))) ++
      params.usagePlatform.toNel.map(filters.terms(usagesField("platform"), _))

    val syndicationStatusFilter = params.syndicationStatus.map(status => SyndicationFilter.statusFilter(status, config))

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

    val filter = filterOpt getOrElse filters.matchAll

    val queryFiltered = new FilteredQueryBuilder(query, filter)

    val search = prepareImagesSearch.setQuery(queryFiltered) |>
        sorts.createSort(params.orderBy, params.structuredQuery)

    search
      .setFrom(params.offset)
      .setSize(params.length)
      .executeAndLog("image search")
      .toMetric(mediaApiMetrics.searchQueries, List(mediaApiMetrics.searchTypeDimension("results")))(_.getTookInMillis)
      .map(_.getHits)
      .map { results =>
        val hitsTuples = results.hits.toList flatMap (h => h.sourceOpt map (h.id -> _))
        SearchResults(hitsTuples, results.getTotalHits)
      }
  }

  def usageForSupplier(id: String, numDays: Int)(implicit ex: ExecutionContext): Future[SupplierUsageSummary] = {
    val supplier = Agencies.get(id)
    val supplierName = supplier.supplier
    val bePublished = termQuery("usages.status","published")
    val beInLastPeriod = rangeQuery("usages.dateAdded")
      .gte(s"now-${numDays}d/d")
      .lt("now/d")

    val haveUsageInLastPeriod = boolQuery
      .must(bePublished)
      .must(beInLastPeriod)

    val beSupplier = termQuery("usageRights.supplier", supplierName)
    val haveNestedUsage = nestedQuery("usages", haveUsageInLastPeriod)

    val query = boolQuery
      .must(beSupplier)
      .must(haveNestedUsage)

    val search = prepareImagesSearch
      .setQuery(query)

    search
      .setSearchType(SearchType.COUNT)
      .executeAndLog(s"$id usage search")
      .map(_.getHits)
      .map(_.getTotalHits)
      .map(count => SupplierUsageSummary(supplier,  count.toInt))
  }

  def dateHistogramAggregate(params: AggregateSearchParams)(implicit ex: ExecutionContext): Future[AggregateSearchResults] = {
    val aggregate = AggregationBuilders
      .dateHistogram(params.field)
      .field(params.field)
      .interval(DateHistogram.Interval.MONTH)
      .minDocCount(0)
    aggregateSearch(params.field, params, aggregate)
  }

  def metadataSearch(params: AggregateSearchParams)(implicit ex: ExecutionContext): Future[AggregateSearchResults] = {
    val aggregate = AggregationBuilders
      .terms("metadata")
      .field(metadataField(params.field))
    aggregateSearch("metadata", params, aggregate)
  }

  def editsSearch(params: AggregateSearchParams)(implicit ex: ExecutionContext): Future[AggregateSearchResults] = {
    val aggregate = AggregationBuilders
      .terms("edits")
      .field(editsField(params.field))
    aggregateSearch("edits", params, aggregate)
  }

  def aggregateSearch(name: String, params: AggregateSearchParams, aggregateBuilder: AbstractAggregationBuilder)
                     (implicit ex: ExecutionContext): Future[AggregateSearchResults] = {
    val query = queryBuilder.makeQuery(params.structuredQuery)
    val search = prepareImagesSearch
      .setQuery(query)
      .addAggregation(aggregateBuilder)

    search
      .setSearchType(SearchType.COUNT)
      .executeAndLog(s"$name aggregate search")
      .toMetric(mediaApiMetrics.searchQueries, List(mediaApiMetrics.searchTypeDimension("aggregate")))(_.getTookInMillis)
      .map(searchResultToAggregateResponse(_, name))
  }

  def aggregateResponse(agg: AggregateSearchResults) =
    respondCollection(agg.results, Some(0), Some(agg.total))


  def completionSuggestion(name: String, q: String, size: Int)(implicit ex: ExecutionContext): Future[CompletionSuggestionResults] = {
    val builder = completionSuggestionBuilder(name).field(name).text(q).size(size)
    val search = prepareImagesSearch.addSuggestion(builder).setFrom(0).setSize(0)

    search
      .executeAndLog("completion suggestion query")
      .toMetric(mediaApiMetrics.searchQueries, List(mediaApiMetrics.searchTypeDimension("suggestion-completion")))(_.getTookInMillis)
      .map { response =>
        val options =
          response.getSuggest
          .getSuggestion(name)
          .asInstanceOf[CompletionSuggestion]
          .getEntries.asScala.toList.headOption.map { entry =>
            entry.getOptions.asScala.map(
              option => CompletionSuggestionResult(option.getText.toString, option.getScore)
            ).toList
          }.getOrElse(List())

        CompletionSuggestionResults(options)
      }
  }

  def matchAllQueryWithFilter(filter: FilterBuilder) =
    new FilteredQueryBuilder(new MatchAllQueryBuilder(), filter)

  def completionSuggestionBuilder(name: String) = new CompletionSuggestionBuilder(name)

  def searchResultToAggregateResponse(response: SearchResponse, aggregateName: String) = {
    val buckets = response.getAggregations
      .getAsMap
      .get(aggregateName)
      .asInstanceOf[MultiBucketsAggregation]
      .getBuckets

    val results = buckets.asScala.toList map (s => BucketResult(s.getKey, s.getDocCount))

    AggregateSearchResults(results, buckets.size)
  }

  def imageExists(id: String)(implicit ex: ExecutionContext): Future[Boolean] =
    prepareGet(id).setFields().executeAndLog(s"check if image $id exists") map (_.isExists)

  def prepareGet(id: String): GetRequestBuilder =
    client.prepareGet(imagesAlias, imageType, id)

  def prepareImagesSearch: SearchRequestBuilder =
    client.prepareSearch(imagesAlias).setTypes(imageType)

}
