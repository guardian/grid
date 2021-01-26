package lib.elasticsearch

import com.gu.mediaservice.lib.ImageFields
import com.gu.mediaservice.lib.elasticsearch.IndexSettings
import com.gu.mediaservice.lib.formatting.printDateTime
import com.gu.mediaservice.lib.logging.GridLogging
import com.gu.mediaservice.model.Agency
import com.sksamuel.elastic4s.ElasticDsl
import com.sksamuel.elastic4s.ElasticDsl._
import com.sksamuel.elastic4s.requests.common.Operator
import com.sksamuel.elastic4s.requests.searches.queries.Query
import com.sksamuel.elastic4s.requests.searches.queries.matches.{MultiMatchQuery, MultiMatchQueryBuilderType}
import lib.querysyntax._
class QueryBuilder(matchFields: Seq[String], overQuotaAgencies: () => List[Agency]) extends ImageFields with GridLogging {

  // For some sad reason, there was no helpful alias for this in the ES library
  private def multiMatchPhraseQuery(value: String, fields: Seq[String]): MultiMatchQuery =
    ElasticDsl.multiMatchQuery(value).fields(fields).matchType(MultiMatchQueryBuilderType.PHRASE)

  private def makeMultiQuery(value: Value, fields: Seq[String]): MultiMatchQuery = value match {
    case Words(value) => ElasticDsl.multiMatchQuery(value).fields(fields).
      operator(Operator.AND).
      matchType(MultiMatchQueryBuilderType.CROSS_FIELDS)
    case Phrase(string) => multiMatchPhraseQuery(string, fields)
    // That's OK, we only do date queries on a single field at a time
    case e => throw InvalidQuery(s"Cannot do multiQuery on $e")
  }

  private def makeQueryBit(condition: Match): Query = condition.field match {
    case AnyField => makeMultiQuery(condition.value, matchFields)
    case MultipleField(fields) => makeMultiQuery(condition.value, fields)
    case SingleField(field) => condition.value match {
      // Force AND operator else it will only require *any* of the words, not *all*
      case Words(value) => matchQuery(getFieldPath(field), value).operator(Operator.AND)
      case Phrase(value) => matchPhraseQuery(getFieldPath(field), value)
      case DateRange(start, end) => rangeQuery(getFieldPath(field)).gte(printDateTime(start)).lte(printDateTime(end))
      case e => throw InvalidQuery(s"Cannot do single field query on $e")
    }
    case HierarchyField => condition.value match {
      case Phrase(value) => termQuery(getFieldPath("pathHierarchy"), value)
      case _ => throw InvalidQuery("Cannot accept non-Phrase value for HierarchyField Match")
    }
    case HasField => condition.value match {
      case HasValue(value) => boolQuery().filter(existsQuery(getFieldPath(value)))
      case _ => throw InvalidQuery(s"Cannot perform has field on ${condition.value}")
    }
    case IsField => condition.value match {
      case IsValue(value) => IsQueryFilter.apply(value, overQuotaAgencies) match {
        case Some(isQuery) => isQuery.query
        case _ => {
          logger.info(s"Cannot perform IS query on ${condition.value}")
          matchNoneQuery
        }
      }
      case _ => {
        logger.info(s"Cannot perform IS query on ${condition.value}")
        matchNoneQuery
      }
    }
  }

  def makeQuery(conditions: List[Condition]) = conditions match {
    case Nil => matchAllQuery
    case condList => {

      val (nested: List[Nested], normal: List[Condition]) = (
        condList collect { case n: Nested => n },
        condList collect { case c: Condition => c }
      )

      val query = normal.foldLeft(boolQuery) {
        case (query, Negation(cond)) => query.withNot(makeQueryBit(cond))
        case (query, cond@Match(_, _)) => query.withMust(makeQueryBit(cond))
        case (query, _) => query
      }

      val nestedQueries = nested
        .groupBy(_.parentField)
        .map {
          case (parent: SingleField, n: List[Nested]) => {

            val nested = n.foldLeft(boolQuery) {
              case (query, Nested(_, f, v)) => query.withMust(makeQueryBit(Match(f, v)))
              case (query, _) => query
            }

            nestedQuery(parent.name, nested)
          }

          case _ => throw InvalidQuery("Can only accept SingleField for Nested Query parent")

        }.toList

      nestedQueries.foldLeft(query) { case (q, nestedQ) => q.withMust(nestedQ) }
    }
  }
}
