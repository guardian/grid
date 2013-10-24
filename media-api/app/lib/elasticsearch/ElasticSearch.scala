package lib.elasticsearch

import scala.collection.JavaConverters._
import scala.concurrent.{ExecutionContext, Future}

import play.api.libs.json.JsValue
import org.elasticsearch.action.search.SearchRequestBuilder
import org.elasticsearch.index.query.{FilterBuilders, FilterBuilder}
import org.elasticsearch.index.query.QueryBuilders._
import org.elasticsearch.search.sort.SortOrder
import org.joda.time.DateTime
import scalaz.syntax.std.function1._, scalaz.syntax.id._

import com.gu.mediaservice.syntax._
import com.gu.mediaservice.lib.elasticsearch.ElasticSearchClient
import com.gu.mediaservice.lib.formatting.printDateTime
import controllers.SearchParams
import lib.Config
import org.elasticsearch.search.facet.terms.{TermsFacet, TermsFacetBuilder}


object ElasticSearch extends ElasticSearchClient {

  lazy val host = Config.elasticsearchHost
  lazy val port = Config.int("es.port")
  lazy val cluster = Config("es.cluster")

  type Id = String

  def getImageById(id: Id)(implicit ex: ExecutionContext): Future[Option[JsValue]] =
    client.prepareGet(imagesIndex, imageType, id).execute.asScala map (_.sourceOpt)

  def search(params: SearchParams)(implicit ex: ExecutionContext): Future[Seq[(Id, JsValue)]] = {
    val query = params.query filter (_.nonEmpty) map (matchQuery("metadata.description", _)) getOrElse matchAllQuery
    val search = prepareImagesSearch.setQuery(query)
      .setFilter(filters.date(params.fromDate, params.toDate)) |> sorts.parseFromRequest(params.orderBy)
    for (s <- params.size) search.setSize(s)
    for (res <- search.executeAndLog("image search"))
    yield res.getHits.hits.toList flatMap (h => h.sourceOpt map (h.id -> _))
  }

  def getAllBuckets(implicit ex: ExecutionContext): Future[List[String]] =
    prepareImagesSearch
      .addFacet(new TermsFacetBuilder("buckets").field("buckets").allTerms(true))
      .executeAndLog("all buckets terms facet")
      .map(_.getFacets.facets.asScala.toList.flatMap {
        case f: TermsFacet => f.getEntries.asScala.map(_.getTerm.string)
      })

  def prepareImagesSearch: SearchRequestBuilder =
    client.prepareSearch(imagesIndex).setTypes(imageType)

  object filters {

    def date(from: Option[DateTime], to: Option[DateTime]): FilterBuilder = {
      val builder = FilterBuilders.rangeFilter("upload-time")
      for (f <- from) builder.from(printDateTime(f))
      for (t <- to) builder.to(printDateTime(t))
      builder
    }

  }

  object sorts {

    def parseFromRequest(sortBy: Option[String])(builder: SearchRequestBuilder): SearchRequestBuilder = {
      val sorts = sortBy.fold(Seq("upload-time" -> SortOrder.DESC))(parseSorts)
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
