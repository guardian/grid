package lib.elasticsearch

import java.util.regex.Pattern

import org.elasticsearch.index.query.FilteredQueryBuilder
import org.elasticsearch.search.aggregations.bucket.terms.StringTerms

import scala.concurrent.{ExecutionContext, Future}
import scala.collection.JavaConversions._

import play.api.libs.json._
import org.elasticsearch.action.get.GetRequestBuilder
import org.elasticsearch.action.search.SearchRequestBuilder
import org.elasticsearch.search.aggregations.AggregationBuilders
import org.elasticsearch.search.suggest.completion.{CompletionSuggestion, CompletionSuggestionBuilder}

import scalaz.syntax.id._
import scalaz.syntax.std.list._
import scalaz.NonEmptyList


import com.gu.mediaservice.syntax._
import com.gu.mediaservice.lib.elasticsearch.ElasticSearchClient
import controllers.{AggregateSearchParams, SearchParams}
import lib.{MediaApiMetrics, Config}


case class SearchResults(hits: Seq[(ElasticSearch.Id, JsValue)], total: Long)

case class AggregateSearchResults(results: Seq[BucketResult], total: Long)

case class CompletionSuggestionResult(key: String, score: Float)
object CompletionSuggestionResult {
  implicit val jsonWrites = Json.writes[CompletionSuggestionResult]
}

case class CompletionSuggestionResults(results: List[CompletionSuggestionResult])
object CompletionSuggestionResults {
  implicit val jsonWrites = Json.writes[CompletionSuggestionResults]
}



object BucketResult {
  implicit val jsonWrites = Json.writes[BucketResult]
}

case class BucketResult(key: String, count: Long)


object ElasticSearch extends ElasticSearchClient with SearchFilters with ImageFields {

  import MediaApiMetrics._

  lazy val host = Config.elasticsearchHost
  lazy val port = Config.int("es.port")
  lazy val cluster = Config("es.cluster")

  type Id = String

  def getImageById(id: Id)(implicit ex: ExecutionContext): Future[Option[JsValue]] =
    prepareGet(id).executeAndLog(s"get image by id $id") map (_.sourceOpt)

  val matchFields: Seq[String] = Seq("id") ++
    Seq("description", "title", "byline", "source", "credit", "keywords",
      "subLocation", "city", "state", "country", "suppliersReference").map(metadataField) ++
    Seq("labels").map(editsField) ++
    Config.queriableIdentifiers.map(identifierField)

  val queryBuilder = new QueryBuilder(matchFields)


  def search(params: SearchParams)(implicit ex: ExecutionContext): Future[SearchResults] = {

    val query = queryBuilder.makeQuery(params.structuredQuery)

    val dateFilter       = filters.date(params.fromDate, params.toDate)
    val idsFilter        = params.ids.map(filters.ids)
    val labelFilter      = params.labels.toNel.map(filters.terms("labels", _))
    val metadataFilter   = params.hasMetadata.map(metadataField).toNel.map(filters.exists)
    val archivedFilter   = params.archived.map(filters.existsOrMissing(editsField("archived"), _))
    val hasExports       = params.hasExports.map(filters.existsOrMissing("exports", _))
    val hasIdentifier    = params.hasIdentifier.map(idName => filters.exists(NonEmptyList(identifierField(idName))))
    val missingIdentifier= params.missingIdentifier.map(idName => filters.missing(NonEmptyList(identifierField(idName))))
    val uploadedByFilter = params.uploadedBy.map(uploadedBy => filters.terms("uploadedBy", NonEmptyList(uploadedBy)))

    val validityFilter   = params.valid.flatMap(valid => if(valid) validFilter else invalidFilter)

    val costFilter       = params.free.flatMap(free => if (free) freeFilter else nonFreeFilter)

    val filter = (metadataFilter.toList ++ labelFilter ++ archivedFilter ++
                  uploadedByFilter ++ idsFilter ++ validityFilter ++ costFilter ++
                  hasExports ++ hasIdentifier ++ missingIdentifier)
                   .foldLeft(dateFilter)(filters.and(_, _))

    val queryFiltered = new FilteredQueryBuilder(query, filter)

    val search = prepareImagesSearch.setQuery(queryFiltered) |>
                 sorts.parseFromRequest(params.orderBy)

    search
      .setFrom(params.offset)
      .setSize(params.length)
      .executeAndLog("image search")
      .toMetric(searchQueries, List(searchTypeDimension("results")))(_.getTookInMillis)
      .map(_.getHits)
      .map { results =>
        val hitsTuples = results.hits.toList flatMap (h => h.sourceOpt map (h.id -> _))
        SearchResults(hitsTuples, results.getTotalHits)
      }
  }

  def metadataSearch(params: AggregateSearchParams)(implicit ex: ExecutionContext): Future[AggregateSearchResults] =
    aggregateSearch("metadata", metadataField(params.field), params.q)

  def editsSearch(params: AggregateSearchParams)(implicit ex: ExecutionContext): Future[AggregateSearchResults] =
    aggregateSearch("edits", editsField(params.field), params.q)

  def aggregateSearch(name: String, field: String, q: Option[String])
                     (implicit ex: ExecutionContext): Future[AggregateSearchResults] = {
    val aggregate = AggregationBuilders
      .terms(name)
      .field(field)
      .include(q.getOrElse("") + ".*", Pattern.CASE_INSENSITIVE)

    val search = prepareImagesSearch.addAggregation(aggregate)

    search
      .setFrom(0)
      .setSize(0)
      .executeAndLog("metadata aggregate search")
      .toMetric(searchQueries, List(searchTypeDimension("aggregate")))(_.getTookInMillis)
      .map{ response =>
        val buckets = response.getAggregations.getAsMap.get(name).asInstanceOf[StringTerms].getBuckets
        val results = buckets.toList map (s => BucketResult(s.getKey, s.getDocCount))

        AggregateSearchResults(results, buckets.size)
      }
  }

  def completionSuggestion(name: String, q: String, size: Int)(implicit ex: ExecutionContext): Future[CompletionSuggestionResults] = {
    val builder = completionSuggestionBuilder(name).field(name).text(q).size(size)
    val search = prepareImagesSearch.addSuggestion(builder).setFrom(0).setSize(0)

    search
      .executeAndLog("completion suggestion query")
      .toMetric(searchQueries, List(searchTypeDimension("suggestion-completion")))(_.getTookInMillis)
      .map { response =>
        val options =
          response.getSuggest
          .getSuggestion(name)
          .asInstanceOf[CompletionSuggestion]
          .getEntries.toList.headOption.map { entry =>
            entry.getOptions.map(
              option => CompletionSuggestionResult(option.getText.toString, option.getScore)
            ).toList
          }.getOrElse(List())

        CompletionSuggestionResults(options)
      }
  }

  def completionSuggestionBuilder(name: String) = new CompletionSuggestionBuilder(name)

  def imageExists(id: String)(implicit ex: ExecutionContext): Future[Boolean] =
    prepareGet(id).setFields().executeAndLog(s"check if image $id exists") map (_.isExists)

  def prepareGet(id: String): GetRequestBuilder =
    client.prepareGet(imagesAlias, imageType, id)

  def prepareImagesSearch: SearchRequestBuilder =
    client.prepareSearch(imagesAlias).setTypes(imageType)

}
