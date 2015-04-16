package lib.elasticsearch

import java.util.regex.Pattern

import com.gu.mediaservice.model.{Pay, Free, Conditional}
import org.elasticsearch.index.query.MultiMatchQueryBuilder
import org.elasticsearch.search.aggregations.bucket.terms.StringTerms

import scala.concurrent.{ExecutionContext, Future}
import scala.collection.JavaConversions._

import play.api.libs.json.{Json, JsValue}
import org.elasticsearch.action.get.GetRequestBuilder
import org.elasticsearch.action.search.{SearchResponse, SearchRequestBuilder}
import org.elasticsearch.index.query.{FilterBuilders, FilterBuilder}
import org.elasticsearch.index.query.QueryBuilders._
import org.elasticsearch.search.sort.SortOrder
import org.elasticsearch.search.aggregations.AggregationBuilders
import org.joda.time.DateTime

import scalaz.syntax.id._
import scalaz.syntax.foldable1._
import scalaz.syntax.std.list._
import scalaz.NonEmptyList

import com.gu.mediaservice.syntax._
import com.gu.mediaservice.lib.elasticsearch.ElasticSearchClient
import com.gu.mediaservice.lib.formatting.printDateTime
import controllers.{AggregateSearchParams, SearchParams}
import lib.{MediaApiMetrics, Config}
import lib.querysyntax._


case class SearchResults(hits: Seq[(ElasticSearch.Id, JsValue)], total: Long)

case class AggregateSearchResults(results: Seq[BucketResult], total: Long)

object BucketResult {
  implicit val jsonWrites = Json.writes[BucketResult]
}

case class BucketResult(key: String, count: Long)

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
    Seq("labels").map("userMetadata." + _) ++
    Config.queriableIdentifiers.map("identifiers." + _)

  // For some sad reason, there was no helpful alias for this in the ES library
  def multiMatchPhraseQuery(value: String, fields: Seq[String]) =
    new MultiMatchQueryBuilder(value, fields: _*).`type`(MultiMatchQueryBuilder.Type.PHRASE)

  def makeMultiQuery(value: Value, fields: Seq[String]) = value match {
    case Words(string) => multiMatchQuery(string, fields: _*)
    case Phrase(string) => multiMatchPhraseQuery(string, fields)
  }

  def makeQueryBit(condition: Match) = condition.field match {
    case AnyField              => makeMultiQuery(condition.value, matchFields)
    case MultipleField(fields) => makeMultiQuery(condition.value, fields)
    case SingleField(field)    => condition.value match {
      case Words(value)  => matchQuery(field, value)
      case Phrase(value) => matchPhraseQuery(field, value)
    }
  }

  def makeQuery(conditions: List[Condition]) = conditions match {
    case Nil      => matchAllQuery
    case condList =>
      condList.foldLeft(boolQuery) {
        case (query, Negation(cond)    ) => query.mustNot(makeQueryBit(cond))
        case (query, cond @ Match(_, _)) => query.must(makeQueryBit(cond))
      }
  }


  def search(params: SearchParams)(implicit ex: ExecutionContext): Future[SearchResults] = {

    val query = makeQuery(params.structuredQuery)

    val dateFilter       = filters.date(params.fromDate, params.toDate)
    val idsFilter        = params.ids.map(filters.ids)
    val labelFilter      = params.labels.toNel.map(filters.terms("labels", _))
    val metadataFilter   = params.hasMetadata.map(metadataField).toNel.map(filters.exists)
    val archivedFilter   = params.archived.map(filters.existsOrMissing(editsField("archived"), _))
    val hasExports       = params.hasExports.map(filters.existsOrMissing("exports", _))
    val hasIdentifier    = params.hasIdentifier.map(idName => filters.exists(NonEmptyList(s"identifiers.$idName")))
    val missingIdentifier= params.missingIdentifier.map(idName => filters.missing(NonEmptyList(s"identifiers.$idName")))
    val uploadedByFilter = params.uploadedBy.map(uploadedBy => filters.terms("uploadedBy", NonEmptyList(uploadedBy)))

    val validFilter      = Config.requiredMetadata.map(metadataField).toNel.map(filters.exists)
    val invalidFilter    = Config.requiredMetadata.map(metadataField).toNel.map(filters.anyMissing)
    val validityFilter   = params.valid.flatMap(valid => if(valid) validFilter else invalidFilter)

    // Warning: this requires the capitalisation to be exact; we may want to sanitise the credits
    // to a canonical representation in the future
    val creditFilter        = Config.freeCreditList.toNel.map(cs => filters.terms("metadata.credit", cs))
    val sourceFilter        = Config.freeSourceList.toNel.map(cs => filters.terms("metadata.source", cs))
    val freeWhitelist       = (creditFilter, sourceFilter) match {
      case (Some(credit), Some(source)) => Some(filters.or(credit, source))
      case (creditOpt,    sourceOpt)    => creditOpt orElse sourceOpt
    }
    val sourceExclFilter    = Config.payGettySourceList.toNel.map(cs => filters.not(filters.terms("metadata.source", cs)))
    val freeCopyrightFilter = (freeWhitelist, sourceExclFilter) match {
      case (Some(whitelist), Some(sourceExcl)) => Some(filters.and(whitelist, sourceExcl))
      case (whitelistOpt,    sourceExclOpt)    => whitelistOpt orElse sourceExclOpt
    }

    // We're showing `Conditional` here too as we're considering them potentially
    // free. We could look into sending over the search query as a cost filter
    // that could take a comma seperated list e.g. `cost=free,conditional`.
    val freeUsageRightsFilter = List(Free, Conditional).map(_.toString).toNel.map(filters.terms(editsField("usageRights.cost"), _))
    val freeFilter = (freeCopyrightFilter, freeUsageRightsFilter) match {
      case (Some(freeCopyright), Some(freeUsageRights)) => Some(filters.or(freeCopyright, freeUsageRights))
      case (freeCopyrightOpt,    freeUsageRightsOpt)    => freeCopyrightOpt orElse freeUsageRightsOpt
    }

    // lastly we make sure there isn't an override on the cost
    val freeOverrideFilter  =
      List(Pay)
        .map(_.toString).toNel
        .map(filters.terms(editsField("usageRights.cost"), _))
        .map(filters.not)

    val freeFilterWithOverride = (freeFilter, freeOverrideFilter) match {
      case (Some(free), Some(freeOverride)) => Some(filters.and(free, freeOverride))
      case (freeOpt,    freeOverrideOpt)    => freeOpt orElse freeOverrideOpt
    }

    val nonFreeFilter       = freeFilterWithOverride.map(filters.not)
    val costFilter          = params.free.flatMap(free => if (free) freeFilterWithOverride else nonFreeFilter)

    val filter = (metadataFilter.toList ++ labelFilter ++ archivedFilter ++
                  uploadedByFilter ++ idsFilter ++ validityFilter ++ costFilter ++
                  hasExports ++ hasIdentifier ++ missingIdentifier)
                   .foldLeft(dateFilter)(filters.and)

    val search = prepareImagesSearch.setQuery(query).setPostFilter(filter) |>
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

  def metadataField(field: String) = s"metadata.$field"
  def editsField(field: String) = s"userMetadata.$field"

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
            orFilter,
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

    def or(filter1: FilterBuilder, filter2: FilterBuilder): FilterBuilder =
      orFilter(filter1, filter2)

    def not(filter: FilterBuilder): FilterBuilder =
      notFilter(filter)

    def exists(fields: NonEmptyList[String]): FilterBuilder =
      fields.map(f => existsFilter(f): FilterBuilder).foldRight1(andFilter(_, _))

    def missing(fields: NonEmptyList[String]): FilterBuilder =
      fields.map(f => missingFilter(f): FilterBuilder).foldRight1(andFilter(_, _))

    def anyMissing(fields: NonEmptyList[String]): FilterBuilder =
      fields.map(f => missingFilter(f): FilterBuilder).foldRight1(orFilter(_, _))

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
