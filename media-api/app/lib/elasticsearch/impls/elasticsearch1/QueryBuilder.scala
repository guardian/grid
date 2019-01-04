package lib.elasticsearch.impls.elasticsearch1

import com.gu.mediaservice.lib.elasticsearch.{ImageFields, IndexSettings}
import lib.querysyntax._
import org.elasticsearch.index.query.FilterBuilders._
import org.elasticsearch.index.query.QueryBuilders._
import org.elasticsearch.index.query.{MatchQueryBuilder, MultiMatchQueryBuilder, NestedQueryBuilder}

class QueryBuilder(matchFields: Seq[String]) extends ImageFields {
  case class InvalidQuery(message: String) extends Exception(message)

  // For some sad reason, there was no helpful alias for this in the ES library
  private def multiMatchPhraseQuery(value: String, fields: Seq[String]) =
    new MultiMatchQueryBuilder(value, fields: _*).`type`(MultiMatchQueryBuilder.Type.PHRASE)

  private def makeMultiQuery(value: Value, fields: Seq[String]) = value match {
    // Force AND operator else it will only require *any* of the words, not *all*
    case Words(string) => multiMatchQuery(string, fields: _*)
                          .operator(MatchQueryBuilder.Operator.AND)
                          .`type`(MultiMatchQueryBuilder.Type.CROSS_FIELDS)
                          .analyzer(IndexSettings.enslishSStemmerAnalyzerName)
    case Phrase(string) => multiMatchPhraseQuery(string, fields)
    // That's OK, we only do date queries on a single field at a time
    case e => throw InvalidQuery(s"Cannot do multiQuery on $e")
  }

  private def makeQueryBit(condition: Match) = condition.field match {
    case AnyField              => makeMultiQuery(condition.value, matchFields)
    case MultipleField(fields) => makeMultiQuery(condition.value, fields)
    case SingleField(field)    => condition.value match {
      // Force AND operator else it will only require *any* of the words, not *all*
      case Words(value)  => matchQuery(field, value).operator(MatchQueryBuilder.Operator.AND)
      case Phrase(value) => matchPhraseQuery(field, value)
      case DateRange(start, end) => rangeQuery(field).from(start.toString).to(end.toString)
      case e => throw InvalidQuery(s"Cannot do multiQuery on $e")
    }
    case HierarchyField => condition.value match {
      case Phrase(value) => termQuery(getFieldPath("pathHierarchy"), value)
      case _ => throw InvalidQuery("Cannot accept non-Phrase value for HierarchyField Match")
    }
    case HasField => condition.value match {
      case HasValue(value) => boolQuery().must(filteredQuery(null, existsFilter(getFieldPath(value))))
      case _ => throw InvalidQuery(s"Cannot perform booleanQuery on ${condition.value}")
    }
  }

  def makeQuery(conditions: List[Condition]) = conditions match {
    case Nil      => matchAllQuery
    case condList => {

      val (nested: List[Nested], normal: List[Condition]) = (
        condList collect { case n: Nested => n },
        condList collect { case c: Condition => c }
      )

      val query = normal.foldLeft(boolQuery) {
        case (query, Negation(cond)    ) => query.mustNot(makeQueryBit(cond))
        case (query, cond @ Match(_, _)) => query.must(makeQueryBit(cond))
        case (query, _) => query
      }

      val nestedQueries: List[NestedQueryBuilder] = nested
        .groupBy(_.parentField)
        .map {
          case (parent: SingleField, n: List[Nested]) => {

            val nested = n.foldLeft(boolQuery) {
              case (query, Nested(_,f,v)) => query.must(makeQueryBit(Match(f,v)))
              case (query, _) => query
            }

            nestedQuery(parent.name, nested)
          }

          case _ => throw InvalidQuery("Can only accept SingleField for Nested Query parent")

        }.toList

      nestedQueries.foldLeft(query) { case (q, nestedQ) => q.must(nestedQ) }
    }
  }
}
