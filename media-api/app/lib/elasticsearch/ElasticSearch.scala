package lib.elasticsearch

import scala.collection.JavaConverters._
import scala.concurrent.{ExecutionContext, Future}

import play.api.libs.json.JsValue
import org.elasticsearch.action.get.GetRequestBuilder
import org.elasticsearch.action.search.SearchRequestBuilder
import org.elasticsearch.index.query.{FilterBuilders, FilterBuilder}
import org.elasticsearch.index.query.QueryBuilders._
import org.elasticsearch.search.facet.terms.{TermsFacet, TermsFacetBuilder}
import org.elasticsearch.search.sort.SortOrder
import org.joda.time.DateTime
import scalaz.syntax.id._
import scalaz.NonEmptyList

import com.gu.mediaservice.syntax._
import com.gu.mediaservice.lib.elasticsearch.ElasticSearchClient
import com.gu.mediaservice.lib.formatting.printDateTime
import controllers.SearchParams
import lib.{MediaApiMetrics, Config}
import org.elasticsearch.index.query.MatchQueryBuilder.Operator


object ElasticSearch extends ElasticSearchClient {

  import MediaApiMetrics._

  lazy val host = Config.elasticsearchHost
  lazy val port = Config.int("es.port")
  lazy val cluster = Config("es.cluster")

  type Id = String

  def getImageById(id: Id)(implicit ex: ExecutionContext): Future[Option[JsValue]] =
    prepareGet(id).executeAndLog(s"get image by id $id") map (_.sourceOpt)

  def search(params: SearchParams)(implicit ex: ExecutionContext): Future[Seq[(Id, JsValue)]] = {

    val query = params.query
      .filter(_.nonEmpty)
      .map(matchQuery("metadata.description", _).operator(Operator.AND))
      .getOrElse(matchAllQuery)

    val dateFilter = filters.date(params.fromDate, params.toDate)
    val bucketFilter = params.buckets.map(filters.terms("buckets", _))

    val filter = bucketFilter.foldLeft(dateFilter)(filters.and)

    val search = prepareImagesSearch.setQuery(query).setFilter(filter) |>
                 sorts.parseFromRequest(params.orderBy)

    search
      .setFrom((params.page - 1) * params.size)
      .setSize(params.size)
      .executeAndLog("image search")
      .toMetric(searchQueries)(_.getTookInMillis)
      .map(_.getHits.hits.toList flatMap (h => h.sourceOpt map (h.id -> _)))
  }

  def getAllBuckets(implicit ex: ExecutionContext): Future[List[String]] =
    prepareImagesSearch
      .addFacet(new TermsFacetBuilder("buckets").field("buckets").allTerms(true))
      .executeAndLog("all buckets terms facet")
      .map(_.getFacets.facets.asScala.toList.flatMap {
        case f: TermsFacet => f.getEntries.asScala.map(_.getTerm.string)
      })

  def imageExists(id: String)(implicit ex: ExecutionContext): Future[Boolean] =
    prepareGet(id).setFields().executeAndLog(s"check if image $id exists") map (_.isExists)

  def prepareGet(id: String): GetRequestBuilder =
    client.prepareGet(imagesIndex, imageType, id)

  def prepareImagesSearch: SearchRequestBuilder =
    client.prepareSearch(imagesIndex).setTypes(imageType)

  object filters {

    def date(from: Option[DateTime], to: Option[DateTime]): FilterBuilder = {
      val builder = FilterBuilders.rangeFilter("uploadTime")
      for (f <- from) builder.from(printDateTime(f))
      for (t <- to) builder.to(printDateTime(t))
      builder
    }

    def terms(field: String, terms: NonEmptyList[String]): FilterBuilder =
      FilterBuilders.termsFilter(field, terms.list: _*)

    def and(filter1: FilterBuilder, filter2: FilterBuilder): FilterBuilder =
      FilterBuilders.andFilter(filter1, filter2)

  }

  object sorts {

    def parseFromRequest(sortBy: Option[String])(builder: SearchRequestBuilder): SearchRequestBuilder = {
      val sorts = sortBy.fold(Seq("uploadTime" -> SortOrder.DESC))(parseSorts)
      for ((field, order) <- sorts) builder.addSort(field, order)
      builder
    }

    type Field = String

    val DescField = "-(.+)".r

    def parseSorts(sortBy: String): Seq[(Field, SortOrder)] =
      sortBy.split(',').toList.map {
        case DescField(field) => (field, SortOrder.DESC)
        case field            => (field, SortOrder.ASC)
      }

  }

}
