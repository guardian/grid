package lib.elasticsearch

import com.gu.mediaservice.lib.ImageFields
import com.gu.mediaservice.lib.elasticsearch.filters
import com.gu.mediaservice.lib.formatting.printDateTime
import com.gu.mediaservice.lib.logging.GridLogging
import com.gu.mediaservice.model.Agency
import com.sksamuel.elastic4s.ElasticDsl
import com.sksamuel.elastic4s.ElasticDsl._
import com.sksamuel.elastic4s.requests.common.Operator
import com.sksamuel.elastic4s.requests.searches.queries.Query
import com.sksamuel.elastic4s.requests.searches.queries.matches.{MultiMatchQuery, MultiMatchQueryBuilderType}
import lib.querysyntax._
import lib.MediaApiConfig
import scalaz.NonEmptyList
import scalaz.syntax.std.list._

class QueryBuilder(matchFields: Seq[String], overQuotaAgencies: () => List[Agency], config: MediaApiConfig) extends ImageFields with GridLogging {

  def resolveFieldPath(field: String): String = {
    config.fieldAliasConfigs.find(_.alias == field) match {
      case Some(x) => x.elasticsearchPath
      case None => getFieldPath(field)
    }
  }

  // For some sad reason, there was no helpful alias for this in the ES library
  private def multiMatchPhraseQuery(value: String, fields: Seq[String]): MultiMatchQuery =
    ElasticDsl.multiMatchQuery(value).fields(fields).matchType(MultiMatchQueryBuilderType.PHRASE)

  private def multiMatchWordQuery(value: String, fields: Seq[String]): MultiMatchQuery = {
    val multiMatchQuery = ElasticDsl.multiMatchQuery(value).fields(fields).operator(Operator.AND)

    if (config.fuzzySearchEnabled) {
      multiMatchQuery.matchType(MultiMatchQueryBuilderType.BEST_FIELDS)
        .fuzziness(config.fuzzySearchEditDistance)
        .maxExpansions(config.fuzzyMaxExpansions)
        .prefixLength(config.fuzzySearchPrefixLength)
    } else {
      multiMatchQuery.matchType(MultiMatchQueryBuilderType.CROSS_FIELDS)
    }
  }

  private def makeMultiQuery(value: Value, fields: Seq[String]): MultiMatchQuery = value match {
    case Words(value) => multiMatchWordQuery(value, fields)
    case Phrase(string) => multiMatchPhraseQuery(string, fields)
    // That's OK, we only do date queries on a single field at a time
    case e => throw InvalidQuery(s"Cannot do multiQuery on $e")
  }

  private def makeQueryBit(condition: Match): Query = condition.field match {
    case AnyField => makeMultiQuery(condition.value, matchFields)
    case MultipleField(fields) => makeMultiQuery(condition.value, fields)
    case SingleField(field) => condition.value match {
      // Force AND operator else it will only require *any* of the words, not *all*
      case Words(value) =>
        matchQuery(resolveFieldPath(field), value).operator(Operator.AND)
      case Phrase(value) => value match {
        case "Added to Photo Sales" =>
          matchPhraseQuery(resolveFieldPath(field), "syndication")
        case _ => matchPhraseQuery(resolveFieldPath(field), value)
      }
      case DateRange(start, end) => rangeQuery(resolveFieldPath(field)).gte(printDateTime(start)).lte(printDateTime(end))
      case e => throw InvalidQuery(s"Cannot do single field query on $e")
    }
    case HierarchyField => condition.value match {
      case Phrase(value) => termQuery(resolveFieldPath("pathHierarchy"), value)
      case _ => throw InvalidQuery("Cannot accept non-Phrase value for HierarchyField Match")
    }
    case HasField => condition.value match {
      case HasValue(value) => boolQuery().filter(existsQuery(resolveFieldPath(value)))
      case _ => throw InvalidQuery(s"Cannot perform has field on ${condition.value}")
    }
    case IsField => condition.value match {
      case IsValue(value) => IsQueryFilter.apply(value, overQuotaAgencies, config) match {
        case Some(isQuery) => isQuery.query
        case _ => {
          logger.info(s"Cannot perform IS query on ${condition.value}")
          matchNoneQuery()
        }
      }
      case _ => {
        logger.info(s"Cannot perform IS query on ${condition.value}")
        matchNoneQuery()
      }
    }
    case SimilarField =>
      logger.info(s"Cannot perform SIMILAR query on ${condition.value} outside AI search mode")
      matchNoneQuery()
  }

  def makeQuery(conditions: List[Condition]) = conditions match {
    case Nil => matchAllQuery()
    case condList => {

      val (nested: List[Nested], negationNested: List[Nested], normal: List[Condition]) = (
        condList collect { case n: Nested => n },
        condList collect { case NegationNested(n) => n },
        condList collect { case c: Condition => c }
      )

      def listOfNestedToQueries(nested: List[Nested]): List[Query] = nested
        .groupBy(_.parentField)
        .map {
          case (parent: SingleField, n: List[Nested]) => {

            val nested = n.foldLeft(boolQuery()) {
              case (query, Nested(_, f, v)) => query.withMust(makeQueryBit(Match(f, v)))
              case (query, _) => query
            }

            nestedQuery(parent.name, nested)
          }

          case _ => throw InvalidQuery("Can only accept SingleField for Nested Query parent")

        }.toList

      val queryWithNormal = normal.foldLeft(boolQuery()) {
        case (query, Negation(cond)) => query.withNot(makeQueryBit(cond))
        case (query, cond@Match(_, _)) => query.withMust(makeQueryBit(cond))
        case (query, _) => query
      }

      val queryWithNestedAndNormal = listOfNestedToQueries(nested).foldLeft(queryWithNormal) { case (q, nestedQ) => q.withMust(nestedQ) }

      listOfNestedToQueries(negationNested).foldLeft(queryWithNestedAndNormal) { case (q, negNestedQ) => q.withNot(negNestedQ) }
    }
  }

  def buildFilterOpt(params: SearchParams, searchFilters: SearchFilters, syndicationFilter: SyndicationFilter): Option[Query] = {

    val uploadTimeFilter = filters.date("uploadTime", params.since, params.until)
    val lastModTimeFilter = filters.date("lastModified", params.modifiedSince, params.modifiedUntil)
    val takenTimeFilter = filters.date("metadata.dateTaken", params.takenSince, params.takenUntil)
    // we only inject filters if there are actual date parameters
    val dateFilterList = List(uploadTimeFilter, lastModTimeFilter, takenTimeFilter).flatten.toNel
    val dateFilter = dateFilterList.map(dateFilters => filters.and(dateFilters.list.toList: _*))

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

    val printUsageFilter = params.printUsageFilters.map(searchFilters.printUsageFilters)

    val hasRightsCategory = params.hasRightsCategory.filter(_ == true).map(_ => searchFilters.hasRightsCategoryFilter)

    val validityFilter = params.valid.map(valid => if (valid) searchFilters.validFilter else searchFilters.invalidFilter)

    val persistFilter = params.persisted map {
      case true => searchFilters.persistedFilter
      case false => searchFilters.nonPersistedFilter
    }

    val usageFilter: Iterable[Query] =
      params.usageStatus.toNel.map(status => filters.terms("usagesStatus", status.map(_.toString))).toOption ++
        params.usagePlatform.toNel.map(filters.terms("usagesPlatform", _)).toOption

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
      metadataFilter.toOption.toList
        ++ persistFilter
        ++ labelFilter.toOption
        ++ archivedFilter
        ++ uploadedByFilter
        ++ idsFilter
        ++ validityFilter
        ++ simpleCostFilter
        ++ costFilter
        ++ hasExports
        ++ hasIdentifier
        ++ missingIdentifier
        ++ dateFilter.toOption
        ++ usageFilter
        ++ hasRightsCategory
        ++ searchFilters.tierFilter(params.tier)
        ++ syndicationStatusFilter
        ++ dateAddedToCollectionFilter
        ++ printUsageFilter
      ).toNel.map(filter => filter.list.toList.reduceLeft(filters.and(_, _))).toOption
    //    logger.info(s"Built filters: ${filterOpt.map(_.toString).getOrElse("None")}")
//    eg Built filters: BoolQuery(None,None,None,None,List(),ArraySeq(BoolQuery(None,None,None,None,List(),List(),List(),ArraySeq(TermsQuery(usageRights.supplier,List(AAP, Alamy, Allstar Picture Library, AP, EPA, Getty Images, PA, Reuters, Rex Features, Ronald Grant Archive, Action Images),None,None,None,None,None), TermsQuery(usageRights.category,List(handout, PR Image, screengrab, social-media, commissioned-agency, Bylines, staff-photographer, contract-photographer, commissioned-photographer, creative-commons, guardian-witness, pool, crown-copyright, obituary, contract-illustrator, commissioned-illustrator, staff-illustrator, composite, public-domain),None,None,None,None,None))), BoolQuery(None,None,None,None,List(),Vector(RangeQuery(uploadTime,None,None,None,None,Some(2026-06-01T10:54:43.652Z),None,None,None,None)),List(),List())),List(),List())

    filterOpt
  }
}
