package lib.elasticsearch.impls.elasticsearch6

import com.gu.mediaservice.lib.elasticsearch.{ImageFields, IndexSettings}
import com.gu.mediaservice.lib.formatting.printDateTime
import com.sksamuel.elastic4s.Operator
import com.sksamuel.elastic4s.http.ElasticDsl
import com.sksamuel.elastic4s.http.ElasticDsl._
import com.sksamuel.elastic4s.searches.queries.Query
import com.sksamuel.elastic4s.searches.queries.matches.{MultiMatchQuery, MultiMatchQueryBuilderType}
import lib.querysyntax._

class QueryBuilder(matchFields: Seq[String]) extends ImageFields {

  // For some sad reason, there was no helpful alias for this in the ES library
  private def multiMatchPhraseQuery(value: String, fields: Seq[String]): MultiMatchQuery = ElasticDsl.multiMatchQuery(value).fields(fields).
    copy(`type` = Some(MultiMatchQueryBuilderType.PHRASE)) // TODO push type set to elastic4s PR

  private def makeMultiQuery(value: Value, fields: Seq[String]): MultiMatchQuery = value match {
    case Words(value) => ElasticDsl.multiMatchQuery(value).
      fields(fields).
      operator(Operator.AND).
      analyzer(IndexSettings.enslishSStemmerAnalyzerName).
      copy(`type` = Some(MultiMatchQueryBuilderType.CROSS_FIELDS)) // TODO push type set to elastic4s PR
    case Phrase(string) => multiMatchPhraseQuery(string, fields)
    // That's OK, we only do date queries on a single field at a time
    case e => throw InvalidQuery(s"Cannot do multiQuery on $e")
  }

  private def makeQueryBit(condition: Match): Query = {
    condition.field match {
      case AnyField => makeMultiQuery(condition.value, matchFields)
      case MultipleField(fields) => makeMultiQuery(condition.value, fields)
      case SingleField(field) => condition.value match {
        // Force AND operator else it will only require *any* of the words, not *all*
        case Words(value) => matchQuery(field, value).operator(Operator.AND)
        case Phrase(value) => matchPhraseQuery(field, value)
        case DateRange(start, end) => rangeQuery(field).gte(printDateTime(start)).lte(printDateTime(end))
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
      case _ => throw new RuntimeException("Not implemented")
    }
  }

  def makeQuery(conditions: List[Condition]) = conditions match {
    case Nil => matchAllQuery
    case condList => {
      val (_, normal: List[Condition]) = (
        condList collect { case n: Nested => n },
        condList collect { case c: Condition => c }
      )

      val query = normal.foldLeft(boolQuery) {
        case (query, Negation(cond)) => query.withNot(makeQueryBit(cond))
        case (query, cond@Match(_, _)) => query.withMust(makeQueryBit(cond))
        case (query, _) => query
      }

      query
    }
  }

}
