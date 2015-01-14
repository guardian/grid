package lib.elasticsearch

import scala.concurrent.{ExecutionContext, Future}

import play.api.libs.json.JsValue
import org.elasticsearch.action.get.GetRequestBuilder
import org.elasticsearch.action.search.SearchRequestBuilder
import org.elasticsearch.index.query.{FilterBuilders, FilterBuilder}
import org.elasticsearch.index.query.QueryBuilders._
import org.elasticsearch.index.query.MatchQueryBuilder.Operator
import org.elasticsearch.search.sort.SortOrder
import org.joda.time.DateTime

import scalaz.syntax.id._
import scalaz.syntax.foldable1._
import scalaz.syntax.std.list._
import scalaz.NonEmptyList

import com.gu.mediaservice.syntax._
import com.gu.mediaservice.lib.elasticsearch.ElasticSearchClient
import com.gu.mediaservice.lib.formatting.printDateTime
import controllers.SearchParams
import lib.{MediaApiMetrics, Config}


case class SearchResults(hits: Seq[(ElasticSearch.Id, JsValue)], total: Long)


object ElasticSearch extends ElasticSearchClient {

  import MediaApiMetrics._

  lazy val host = Config.elasticsearchHost
  lazy val port = Config.int("es.port")
  lazy val cluster = Config("es.cluster")

  type Id = String

  def getImageById(id: Id)(implicit ex: ExecutionContext): Future[Option[JsValue]] =
    prepareGet(id).executeAndLog(s"get image by id $id") map (_.sourceOpt)

  val matchFields: Seq[String] = Seq("id") ++
    Seq("description", "title", "byline", "source", "credit", "keywords",
      "subLocation", "city", "state", "country", "suppliersReference").map("metadata." + _) ++
    Seq("labels").map("userMetadata." + _)

  def search(params: SearchParams)(implicit ex: ExecutionContext): Future[SearchResults] = {

    val query = params.query
      .filter(_.nonEmpty)
      .map(q => multiMatchQuery(q, matchFields: _*).operator(Operator.AND))
      .getOrElse(matchAllQuery)

    val dateFilter       = filters.date(params.fromDate, params.toDate)
    val idsFilter        = params.ids.map(filters.ids)
    val labelFilter      = params.labels.toNel.map(filters.terms("labels", _))
    val metadataFilter   = params.hasMetadata.map(metadataField).toNel.map(filters.exists)
    val archivedFilter   = params.archived.map(filters.existsOrMissing("userMetadata.archived", _))
    val hasExports       = params.hasExports.map(filters.existsOrMissing("exports", _))
    val uploadedByFilter = params.uploadedBy.map(uploadedBy => filters.terms("uploadedBy", NonEmptyList(uploadedBy)))

    val validFilter      = Config.requiredMetadata.map(metadataField).toNel.map(filters.exists)
    val invalidFilter    = Config.requiredMetadata.map(metadataField).toNel.map(filters.missing)
    val validityFilter   = params.valid.flatMap(valid => if(valid) validFilter else invalidFilter)

    // Warning: this requires the capitalisation to be exact; we may want to sanitise the credits
    // to a canonical representation in the future
    val freeFilter       = Config.freeForUseFrom.toNel.map(cs => filters.terms("metadata.credit", cs))
    val nonFreeFilter    = Config.freeForUseFrom.toNel.map(cs => filters.not(filters.terms("metadata.credit", cs)))
    val costFilter       = params.free.flatMap(free => if (free) freeFilter else nonFreeFilter)

    val filter = (metadataFilter.toList ++ labelFilter ++ archivedFilter ++
                  uploadedByFilter ++ idsFilter ++ validityFilter ++ costFilter ++
                  hasExports)
                   .foldLeft(dateFilter)(filters.and)

    val search = prepareImagesSearch.setQuery(query).setPostFilter(filter) |>
                 sorts.parseFromRequest(params.orderBy)

    search
      .setFrom(params.offset)
      .setSize(params.length)
      .executeAndLog("image search")
      .toMetric(searchQueries)(_.getTookInMillis)
      .map(_.getHits)
      .map { resultsHits =>
        val hitsTuples = resultsHits.hits.toList flatMap (h => h.sourceOpt map (h.id -> _))
        SearchResults(hitsTuples, resultsHits.getTotalHits)
      }
  }

  def metadataField(field: String) = s"metadata.$field"

  def imageExists(id: String)(implicit ex: ExecutionContext): Future[Boolean] =
    prepareGet(id).setFields().executeAndLog(s"check if image $id exists") map (_.isExists)

  def prepareGet(id: String): GetRequestBuilder =
    client.prepareGet(imagesAlias, imageType, id)

  def prepareImagesSearch: SearchRequestBuilder =
    client.prepareSearch(imagesAlias).setTypes(imageType)

  object filters {

    import FilterBuilders.{
            rangeFilter,
            termsFilter,
            andFilter,
            notFilter,
            existsFilter,
            missingFilter,
            termFilter}

    def date(from: Option[DateTime], to: Option[DateTime]): FilterBuilder = {
      val builder = rangeFilter("uploadTime")
      for (f <- from) builder.from(printDateTime(f))
      for (t <- to) builder.to(printDateTime(t))
      builder
    }

    def terms(field: String, terms: NonEmptyList[String]): FilterBuilder =
      termsFilter(field, terms.list: _*)

    def and(filter1: FilterBuilder, filter2: FilterBuilder): FilterBuilder =
      andFilter(filter1, filter2)

    def not(filter: FilterBuilder): FilterBuilder =
      notFilter(filter)

    def exists(fields: NonEmptyList[String]): FilterBuilder =
      fields.map(f => existsFilter(f): FilterBuilder).foldRight1(andFilter(_, _))

    def missing(fields: NonEmptyList[String]): FilterBuilder =
      fields.map(f => missingFilter(f): FilterBuilder).foldRight1(andFilter(_, _))

    def bool(field: String, bool: Boolean): FilterBuilder =
      termFilter(field, bool)

    def ids(idList: List[String]): FilterBuilder =
      FilterBuilders.idsFilter().addIds(idList:_*)

    def existsOrMissing(field: String, exists: Boolean): FilterBuilder = exists match {
      case true  => filters.exists(NonEmptyList(field))
      case false => filters.missing(NonEmptyList(field))
    }

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
